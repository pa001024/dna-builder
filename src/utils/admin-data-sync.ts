import { useLocalStorage } from "@vueuse/core"
import type { DNAActivity, DNAAPI, DNACommentListResponse, DNARoleEntity } from "dna-api"
import type { ActivityInput } from "@/api/gen/api-types"
import { addMissionsIngameMutation, missionsIngamesQuery, submitAbyssUsageMutation, upsertActivitiesIngameMutation } from "@/api/graphql"
import { useSettingStore } from "@/store/setting"
import { buildAbyssUploadPayload } from "@/utils/abyss-upload"

const ADMIN_SYNC_INTERVAL_MS = 60 * 60 * 1000
const PROCESSED_COMMENTS_STORAGE_KEY = "admin_abyss_processed_comments"

let adminSyncTimer: ReturnType<typeof setTimeout> | null = null
let adminSyncGeneration = 0
let dnaTaskQueue: Promise<void> = Promise.resolve()
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
 * @description 将 DNA API 任务串行执行，避免多个同步流程争用全局心跳连接。
 * @param task 需要串行执行的异步任务。
 * @returns 任务结果。
 */
function enqueueDNATask<T>(task: () => Promise<T>): Promise<T> {
    const result = dnaTaskQueue.then(task, task)
    dnaTaskQueue = result.then(
        () => undefined,
        () => undefined
    )
    return result
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

/**
 * @description 立即同步当前 DNA 账号的密函与活动数据。
 */
export function syncAdminGameData(): Promise<void> {
    return enqueueDNATask(async () => {
        const setting = useSettingStore()
        const account = await setting.getCurrentUser()
        const api = await setting.getDNAAPI()
        if (!account || !api) throw new Error("请先登录皎皎角账号")

        const heartbeatStarted = await setting.startHeartbeat()
        if (!heartbeatStarted) throw new Error("启动心跳失败")

        try {
            const [roleResult, activityResult] = await Promise.all([api.defaultRoleForTool(), api.getActivityList()])
            if (!roleResult.is_success || !roleResult.data?.instanceInfo) {
                throw new Error(roleResult.msg || "获取密函失败")
            }
            if (!activityResult.is_success || !activityResult.data?.activities) {
                throw new Error(activityResult.msg || "获取活动失败")
            }

            const server = account.server || "cn"
            const missions = roleResult.data.instanceInfo.map(item => item.instances.map(instance => instance.name))
            const currentMissions = await missionsIngamesQuery({ server, limit: 1, offset: 0 }, { requestPolicy: "network-only" })
            if (JSON.stringify(currentMissions?.[0]?.missions) !== JSON.stringify(missions)) {
                const result = await addMissionsIngameMutation({ server, missions }, { requestPolicy: "network-only" })
                if (!result) throw new Error("密函上传失败")
            }

            const activities = activityResult.data.activities.filter(activity => activity.cycleDay === -1).map(normalizeActivity)
            const activityResultValue = await upsertActivitiesIngameMutation({ server, activities }, { requestPolicy: "network-only" })
            if (!activityResultValue) throw new Error("活动上传失败")
        } finally {
            await setting.stopHeartbeat()
        }
    })
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
            await syncAdminGameData()
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
    void syncAdminGameData().catch(error => {
        console.error("管理员数据同步失败:", error)
    })
    scheduleNextAdminSync(generation)
}

/**
 * @description 停止管理员数据同步任务。
 */
export function stopAdminDataSyncCron(): void {
    adminSyncGeneration++
    if (adminSyncTimer) clearTimeout(adminSyncTimer)
    adminSyncTimer = null
}
