import { useLocalStorage } from "@vueuse/core"
import type { DNAActivity, DNAAPI, DNACommentListResponse, DNARoleEntity } from "dna-api"
import type { ActivityInput } from "@/api/gen/api-types"
import { addMissionsIngameMutation, missionsIngamesQuery, submitAbyssUsageMutation, upsertActivitiesIngameMutation } from "@/api/graphql"
import { useSettingStore } from "@/store/setting"
import { buildAbyssUploadPayload, detectMissingAbyssWeaponSlots } from "@/utils/abyss-upload"
import { enqueueDNATask, serializeTaskData, wait } from "@/utils/dna-channel"
import {
    getHourStart,
    isAbortError,
    markHourAdminPush,
    runHourlyDoubleWriteSession,
    setHourAdminPushHandler,
    trackHourSession,
} from "@/utils/hour-verify"

const ADMIN_SYNC_INTERVAL_MS = 60 * 60 * 1000
const ADMIN_SYNC_RETRY_DELAY_MS = 30 * 1000
const ADMIN_SYNC_MAX_ATTEMPTS = 2
const PROCESSED_COMMENTS_STORAGE_KEY = "admin_abyss_processed_comments"

let adminSyncTimer: ReturnType<typeof setTimeout> | null = null
let adminSyncGeneration = 0
const processedComments = useLocalStorage<Record<string, number[]>>(PROCESSED_COMMENTS_STORAGE_KEY, {})

export interface AbyssPostUploadSummary {
    total: number
    uploaded: number
    skipped: number
    failed: number
}

export interface AdminGameDataSyncResult {
    missionsChanged: boolean
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
 * @description 将 DNA 活动数据转换为服务端输入结构。
 * @param activity DNA 活动。
 * @returns 活动上传结构。
 */
function normalizeActivity(activity: DNAActivity): ActivityInput {
    return {
        id: activity.id,
        postId: activity.postId,
        startTime: activity.startTime,
        endTime: activity.endTime,
        name: activity.name,
        icon: activity.icon,
        desc: activity.description,
    }
}

/** 管理员整点取样：验真后的密函与同一轮取到的活动。 */
interface AdminHourSample {
    missions: string[][]
    activities: ActivityInput[]
}

/**
 * @description DNA 单次取样：一次心跳内取回密函与活动。
 * @returns 本轮样本
 */
async function sampleAdminDNA(): Promise<AdminHourSample> {
    const setting = useSettingStore()
    const api = await setting.getDNAAPI()
    if (!api) throw new Error("请先登录皎皎角账号")
    return enqueueDNATask(async () => {
        const heartbeatStarted = await setting.startHeartbeat()
        if (!heartbeatStarted) throw new Error("启动心跳失败")
        try {
            // 心跳 500ms 快速返回后若请求失败，等完全就绪后重试一次
            return await setting.runWithHeartbeatRetry(async () => {
                const [roleResult, activityResult] = await Promise.all([api.defaultRoleForTool(), api.getActivityList()])
                if (!roleResult.is_success || !roleResult.data?.instanceInfo) {
                    throw new Error(roleResult.msg || "获取密函失败")
                }
                if (!activityResult.is_success || !activityResult.data?.activities) {
                    throw new Error(activityResult.msg || "获取活动失败")
                }
                const missions = roleResult.data.instanceInfo.map(item => item.instances.map(instance => instance.name))
                const activities = activityResult.data.activities.filter(activity => activity.cycleDay === -1).map(normalizeActivity)
                return { missions, activities }
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
    if (missionsChanged) {
        const result = await addMissionsIngameMutation({ server, missions }, { requestPolicy: "network-only" })
        if (!result) throw new Error("密函上传失败")
    }
    const activityResultValue = await upsertActivitiesIngameMutation({ server, activities }, { requestPolicy: "network-only" })
    if (!activityResultValue) throw new Error("活动上传失败")
    markHourAdminPush(hourStart)
    return missionsChanged
}

/**
 * @description 手动重验后的管理员推送：用验真后的密函拉取最新活动并上传。
 * 弹窗立刻取数取消在途队列后，正确数据的提交就靠这条路径。
 * @param hourStart 数据所属的整点
 * @param missions 验真后的密函任务
 */
async function pushHourVerifiedMissions(hourStart: number, missions: string[][]): Promise<void> {
    const setting = useSettingStore()
    const api = await setting.getDNAAPI()
    if (!api) throw new Error("请先登录皎皎角账号")
    const activities = await enqueueDNATask(async () => {
        const heartbeatStarted = await setting.startHeartbeat()
        if (!heartbeatStarted) throw new Error("启动心跳失败")
        try {
            // 心跳 500ms 快速返回后若请求失败，等完全就绪后重试一次
            return await setting.runWithHeartbeatRetry(async () => {
                const activityResult = await api.getActivityList()
                if (!activityResult.is_success || !activityResult.data?.activities) {
                    throw new Error(activityResult.msg || "获取活动失败")
                }
                return activityResult.data.activities.filter(activity => activity.cycleDay === -1).map(normalizeActivity)
            })
        } finally {
            await setting.stopHeartbeat()
        }
    })
    await uploadAdminGameData(missions, activities, hourStart)
}

/**
 * @description 立即同步当前 DNA 账号的密函与活动数据。
 * 二次写入：首轮（整点+80 秒）取数，第二轮（整点+80+30 秒）验真，
 * 不一致判首轮为假并用新数据上传，一致则上传后再取第三轮确认。
 * @returns 密函是否发生变化并完成上传。
 */
export function syncAdminGameData(): Promise<AdminGameDataSyncResult> {
    return (async () => {
        const hourStart = getHourStart(Date.now())
        const tracked = trackHourSession("管理员整点验真")
        try {
            let missionsChanged = false
            await runHourlyDoubleWriteSession({
                hourStart,
                sample: sampleAdminDNA,
                isSame: (a, b) => serializeTaskData(a.missions) === serializeTaskData(b.missions),
                onSample: () => {
                    // 管理员流不写本地展示（由密函整点会话负责），这里只负责上传
                },
                onVerifiedPush: async value => {
                    missionsChanged = (await uploadAdminGameData(value.missions, value.activities, hourStart)) || missionsChanged
                },
                signal: tracked.signal,
            })
            return { missionsChanged }
        } finally {
            tracked.done()
        }
    })()
}

/**
 * @description 执行整点同步：数据未变化或请求失败时延迟重试一次。
 * 首轮取样延迟由共享 DNA 通道负责，此处不再重复等待。
 * @param sync 执行一次同步的函数。
 * @param delay 等待函数。
 * @param shouldContinue 当前任务是否仍有效。
 */
export async function runScheduledAdminSync(
    sync: () => Promise<AdminGameDataSyncResult> = syncAdminGameData,
    delay: (milliseconds: number) => Promise<void> = wait,
    shouldContinue: () => boolean = () => true
): Promise<void> {
    if (!shouldContinue()) return

    let lastError: unknown
    for (let attempt = 0; attempt < ADMIN_SYNC_MAX_ATTEMPTS; attempt++) {
        try {
            const result = await sync()
            if (result.missionsChanged) return
            lastError = undefined
        } catch (error) {
            // 被手动刷新取消：不重试，由手动重验接管推送
            if (isAbortError(error)) throw error
            lastError = error
        }

        if (attempt < ADMIN_SYNC_MAX_ATTEMPTS - 1) {
            const reason = lastError ? "同步失败" : "数据未变化"
            console.info(`管理员整点${reason}，${ADMIN_SYNC_RETRY_DELAY_MS / 1000} 秒后重试`)
            await delay(ADMIN_SYNC_RETRY_DELAY_MS)
            if (!shouldContinue()) return
        }
    }

    if (lastError) throw lastError
    console.info("管理员整点数据重试后仍未变化")
}

/**
 * @description 安排下一次整点管理员数据同步。
 * @param generation 当前定时任务代次。
 */
function scheduleNextAdminSync(generation: number): void {
    if (generation !== adminSyncGeneration) return
    const delay = ADMIN_SYNC_INTERVAL_MS - (Date.now() % ADMIN_SYNC_INTERVAL_MS)
    adminSyncTimer = setTimeout(async () => {
        try {
            await runScheduledAdminSync(syncAdminGameData, wait, () => generation === adminSyncGeneration)
        } catch (error) {
            console.error("管理员定时数据同步失败:", error)
        } finally {
            scheduleNextAdminSync(generation)
        }
    }, delay)
}

/**
 * @description 启动管理员数据同步任务，并立即执行一次。
 */
export function startAdminDataSyncCron(): void {
    if (adminSyncTimer) return
    const generation = ++adminSyncGeneration
    // 注册手动重验用的推送：弹窗立刻取数取消队列后，仍由验真流程提交正确数据
    setHourAdminPushHandler(pushHourVerifiedMissions)
    void syncAdminGameData().catch(error => {
        if (!isAbortError(error)) console.error("管理员数据同步失败:", error)
    })
    scheduleNextAdminSync(generation)
}

/**
 * @description 停止管理员数据同步任务。
 */
export function stopAdminDataSyncCron(): void {
    adminSyncGeneration++
    setHourAdminPushHandler(null)
    if (adminSyncTimer) clearTimeout(adminSyncTimer)
    adminSyncTimer = null
}
