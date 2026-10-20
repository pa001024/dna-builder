import { useLocalStorage } from "@vueuse/core"
import type { DNAAPI, DNACommentListResponse, DNARoleEntity } from "dna-api"
import type { ActivityInput } from "@/api/gen/api-types"
import { addMissionsIngameMutation, missionsIngamesQuery, submitAbyssUsageMutation, upsertActivitiesIngameMutation } from "@/api/graphql"
import { useMihanNotify } from "@/store/mihan"
import { useSettingStore } from "@/store/setting"
import { buildAbyssUploadPayload, detectMissingAbyssWeaponSlots } from "@/utils/abyss-upload"
import { enqueueDNATask } from "@/utils/dna-channel"
import { sampleActivitiesDNA } from "@/utils/dna-hour-sample"
import {
    formatHourOffset,
    getHourAdminPushHandler,
    type HourAdminPushSample,
    logHourVerify,
    markHourAdminPush,
    setHourAdminPushHandler,
} from "@/utils/hour-verify"

const PROCESSED_COMMENTS_STORAGE_KEY = "admin_abyss_processed_comments"

const processedComments = useLocalStorage<Record<string, number[]>>(PROCESSED_COMMENTS_STORAGE_KEY, {})

export interface AbyssPostUploadSummary {
    total: number
    uploaded: number
    skipped: number
    failed: number
}

export interface AbyssCommentScanDependencies {
    fetchComments(pageIndex: number): Promise<DNACommentListResponse>
    fetchRoleInfo(userId: string): Promise<DNARoleEntity | null>
    submitRoleInfo(roleInfo: DNARoleEntity): Promise<"uploaded" | "skipped">
    isProcessed(commentId: number): boolean
    markProcessed(commentId: number): void
}

/**
 * @description 读取指定帖子已处理的评论 ID。
 * @param postId 帖子 ID。
 * @returns 已处理评论 ID 集合。
 */
function loadProcessedCommentIds(postId: string): Set<number> {
    return new Set((processedComments.value[postId] || []).filter(Number.isInteger))
}

/**
 * @description 持久化指定帖子的已处理评论 ID。
 * @param postId 帖子 ID。
 * @param commentIds 已处理评论 ID 集合。
 */
function saveProcessedCommentIds(postId: string, commentIds: Set<number>): void {
    processedComments.value = {
        ...processedComments.value,
        [postId]: [...commentIds],
    }
}

/**
 * @description 扫描指定帖子的全部评论并上传可用的深渊数据。
 * @param dependencies 评论、角色和上传操作依赖。
 * @returns 本次扫描统计。
 */
export async function scanAbyssPostComments(dependencies: AbyssCommentScanDependencies): Promise<AbyssPostUploadSummary> {
    const summary: AbyssPostUploadSummary = { total: 0, uploaded: 0, skipped: 0, failed: 0 }
    const uploadedUserIds = new Set<string>()
    const roleInfoCache = new Map<string, DNARoleEntity | null>()
    let pageIndex = 1

    while (true) {
        const page = await dependencies.fetchComments(pageIndex)
        const comments = page.postCommentList || []
        if (comments.length === 0) break

        for (const comment of comments) {
            summary.total++
            if (dependencies.isProcessed(comment.commentId)) {
                summary.skipped++
                continue
            }

            const userId = comment.userId?.trim()
            if (!userId || uploadedUserIds.has(userId)) {
                dependencies.markProcessed(comment.commentId)
                summary.skipped++
                continue
            }

            try {
                let roleInfo = roleInfoCache.get(userId)
                if (roleInfo === undefined) {
                    roleInfo = await dependencies.fetchRoleInfo(userId)
                    roleInfoCache.set(userId, roleInfo)
                }
                if (!roleInfo) {
                    summary.failed++
                    continue
                }

                const outcome = await dependencies.submitRoleInfo(roleInfo)
                dependencies.markProcessed(comment.commentId)
                if (outcome === "uploaded") {
                    uploadedUserIds.add(userId)
                    summary.uploaded++
                } else {
                    summary.skipped++
                }
            } catch (error) {
                summary.failed++
                console.error(`评论 ${comment.commentId} 深渊数据处理失败:`, error)
            }
        }

        if (!page.hasNext) break
        pageIndex++
    }

    return summary
}

/**
 * @description 查询指定社区用户的角色信息，空返回时重试一次。
 * @param api DNA API 实例。
 * @param userId 社区用户 ID。
 * @returns 角色信息或 null。
 */
async function fetchRoleInfoWithRetry(api: DNAAPI, userId: string): Promise<DNARoleEntity | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const result = await api.defaultRoleForTool(2, userId)
            if (result.is_success) return result.data || null
            if (attempt === 0 && result.msg.includes("空返回值")) {
                await new Promise(resolve => setTimeout(resolve, 1000))
                continue
            }
            throw new Error(result.msg || "角色信息查询失败")
        } catch (error) {
            if (attempt === 0 && String(error).includes("空返回值")) {
                await new Promise(resolve => setTimeout(resolve, 1000))
                continue
            }
            throw error
        }
    }
    return null
}

/**
 * @description 上传指定帖子的评论区深渊数据。
 * @param postId 帖子 ID。
 * @returns 本次扫描统计。
 */
export function uploadAbyssUsageFromPost(postId: string): Promise<AbyssPostUploadSummary> {
    return enqueueDNATask(async () => {
        const setting = useSettingStore()
        const api = await setting.getDNAAPI()
        if (!api) throw new Error("请先登录皎皎角账号")

        const processedCommentIds = loadProcessedCommentIds(postId)
        const heartbeatStarted = await setting.startHeartbeat()
        if (!heartbeatStarted) throw new Error("启动心跳失败")

        try {
            return await scanAbyssPostComments({
                fetchComments: async pageIndex => {
                    const result = await api.getPostCommentList(postId, pageIndex, 20, 0)
                    if (!result.is_success || !result.data) throw new Error(result.msg || "获取评论失败")
                    return result.data
                },
                fetchRoleInfo: userId => fetchRoleInfoWithRetry(api, userId),
                submitRoleInfo: async roleInfo => {
                    // 主控武器图标缺失（灾厄武器后端不下发）时无法离线判定，批量场景直接跳过
                    if (detectMissingAbyssWeaponSlots(roleInfo).length > 0) return "skipped"
                    let payload: Awaited<ReturnType<typeof buildAbyssUploadPayload>>
                    try {
                        payload = await buildAbyssUploadPayload(roleInfo)
                    } catch (error) {
                        console.warn("评论用户无法生成深渊上传数据:", error)
                        return "skipped"
                    }
                    if (!payload) return "skipped"
                    const result = await submitAbyssUsageMutation({ input: payload }, { requestPolicy: "network-only" })
                    if (!result) throw new Error("上传结果为空")
                    return "uploaded"
                },
                isProcessed: commentId => processedCommentIds.has(commentId),
                markProcessed: commentId => {
                    processedCommentIds.add(commentId)
                    saveProcessedCommentIds(postId, processedCommentIds)
                },
            })
        } finally {
            await setting.stopHeartbeat()
        }
    })
}

/**
 * @description 上传验真后的密函与活动，成功后记录所属整点。
 * @param missions 验真后的密函任务
 * @param activities 同轮取到的活动
 * @param hourStart 数据所属的整点
 * @returns 密函是否发生变化并完成上传
 */
async function uploadAdminGameData(missions: string[][], activities: ActivityInput[], hourStart: number): Promise<boolean> {
    const setting = useSettingStore()
    const account = await setting.getCurrentUser()
    const server = account?.server || "cn"
    const currentMissions = await missionsIngamesQuery({ server, limit: 1, offset: 0 }, { requestPolicy: "network-only" })
    const missionsChanged = JSON.stringify(currentMissions?.[0]?.missions) !== JSON.stringify(missions)
    logHourVerify(`[管理员] [${formatHourOffset(hourStart, Date.now())}] 上传前比对服务端密函`, {
        server,
        missionsChanged,
        serverMissions: currentMissions?.[0]?.missions,
        verifiedMissions: missions,
    })
    if (missionsChanged) {
        const result = await addMissionsIngameMutation({ server, missions }, { requestPolicy: "network-only" })
        if (!result) throw new Error("密函上传失败")
        logHourVerify("[管理员] 密函已上传", { server })
    }
    const activityResultValue = await upsertActivitiesIngameMutation({ server, activities }, { requestPolicy: "network-only" })
    if (!activityResultValue) throw new Error("活动上传失败")
    markHourAdminPush(hourStart)
    return missionsChanged
}

/**
 * @description 验真后的管理员上传（主轮询的推送钩子）：密函与活动来自同一次取样，
 * 活动为空时（当次取样活动接口失败）单独补一次，避免丢掉整点的活动同步。
 * @param hourStart 数据所属的整点
 * @param sample 验真后的密函与同轮活动
 */
async function pushHourVerifiedMissions(hourStart: number, sample: HourAdminPushSample): Promise<void> {
    const activities = sample.activities.length > 0 ? (sample.activities as ActivityInput[]) : await sampleActivitiesDNA()
    await uploadAdminGameData(sample.missions, activities, hourStart)
}

/**
 * @description 安装管理员上传钩子：主轮询（密函整点二次写入）验真通过后调用它上传密函与活动，
 * 不再单开一条定时循环；主轮询是否需要运行由密函 store 的 `shouldKeepWatch` 用逻辑或一并判断。
 */
export function installAdminUploadHook(): void {
    if (getHourAdminPushHandler()) return
    setHourAdminPushHandler(pushHourVerifiedMissions)
    logHourVerify("[管理员] 上传钩子已安装")
    useMihanNotify().syncWatch()
}

/**
 * @description 卸载管理员上传钩子，并让主轮询重算是否还需要运行。
 */
export function uninstallAdminUploadHook(): void {
    if (!getHourAdminPushHandler()) return
    setHourAdminPushHandler(null)
    logHourVerify("[管理员] 上传钩子已卸载")
    useMihanNotify().syncWatch()
}
