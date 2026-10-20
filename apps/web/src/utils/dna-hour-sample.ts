import type { DNAActivity, DNAShortNoteEntity } from "dna-api"
import type { ActivityInput } from "@/api/gen/api-types"
import { useSettingStore } from "@/store/setting"
import { enqueueDNATask } from "@/utils/dna-channel"

/**
 * 整点 DNA 单次取样结果。
 *
 * 密函轮询与管理员整点上传共用一次取样：活动列表顺带取回，避免同一次刷新为「密函」和「活动」
 * 各开一次心跳；游戏信息（shortNote）与密函/活动无关，是屏幕信息窗铸造摘要的数据源，默认不取。
 */
export interface DNAHourSample {
    missions: string[][]
    /** 不限时活动（cycleDay === -1）；取数失败时为空数组。 */
    activities: ActivityInput[]
    /** 游戏信息（只在 `withShortNote` 为 true 时带上）。 */
    shortNote?: DNAShortNoteEntity
}

export interface DNAHourSampleOptions {
    /** 顺带取游戏信息（屏幕信息窗的铸造摘要用），默认不取。 */
    withShortNote?: boolean
}

/**
 * 将 DNA 活动数据转换为服务端输入结构。
 * @param activity DNA 活动
 * @returns 活动上传结构
 */
export function normalizeActivity(activity: DNAActivity): ActivityInput {
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
 * DNA 单次取样：一次心跳内取回密函（委托）与活动，按需顺带取游戏信息。
 * @param options 取样选项
 * @returns 本轮样本
 */
export async function sampleDNAHour(options: DNAHourSampleOptions = {}): Promise<DNAHourSample> {
    const setting = useSettingStore()
    const api = await setting.getDNAAPI()
    if (!api) throw new Error("未登录皎皎角账号")
    return enqueueDNATask(async () => {
        const heartbeatStarted = await setting.startHeartbeat()
        if (!heartbeatStarted) throw new Error("启动心跳失败")
        try {
            // 心跳 500ms 快速返回后若请求失败，等完全就绪后重试一次
            return await setting.runWithHeartbeatRetry(async () => {
                const [roleResult, activityResult, shortNote] = await Promise.all([
                    api.defaultRoleForTool(),
                    api.getActivityList().catch(() => undefined),
                    options.withShortNote ? api.getShortNoteInfo().catch(() => undefined) : undefined,
                ])
                if (!roleResult?.is_success || !roleResult.data?.instanceInfo) {
                    throw new Error(roleResult?.msg || "DNAAPI 未返回密函数据")
                }
                const missions = roleResult.data.instanceInfo.map(item => item.instances.map(instance => instance.name))
                return {
                    missions,
                    activities: activityResult?.is_success ? toActivityInputs(activityResult.data?.activities) : [],
                    shortNote: shortNote?.is_success ? shortNote.data : undefined,
                }
            })
        } finally {
            await setting.stopHeartbeat()
        }
    })
}

/**
 * 单独取一次活动（取样里活动为空时补一次，避免偶发失败丢掉整点的活动同步）。
 * @returns 不限时活动列表
 */
export async function sampleActivitiesDNA(): Promise<ActivityInput[]> {
    const setting = useSettingStore()
    const api = await setting.getDNAAPI()
    if (!api) throw new Error("未登录皎皎角账号")
    return enqueueDNATask(async () => {
        const heartbeatStarted = await setting.startHeartbeat()
        if (!heartbeatStarted) throw new Error("启动心跳失败")
        try {
            return await setting.runWithHeartbeatRetry(async () => {
                const activityResult = await api.getActivityList()
                if (!activityResult.is_success || !activityResult.data?.activities) {
                    throw new Error(activityResult.msg || "获取活动失败")
                }
                return toActivityInputs(activityResult.data.activities)
            })
        } finally {
            await setting.stopHeartbeat()
        }
    })
}

/**
 * 过滤不限时活动并转为上传结构。
 * @param activities DNA 活动列表
 * @returns 活动上传列表
 */
function toActivityInputs(activities: DNAActivity[] | undefined): ActivityInput[] {
    if (!activities) return []
    return activities.filter(activity => activity.cycleDay === -1).map(normalizeActivity)
}
