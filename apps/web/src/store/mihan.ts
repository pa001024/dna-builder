import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import { useLocalStorage } from "@vueuse/core"
import { useSound } from "@vueuse/sound"
import type { DNAShortNoteEntity } from "dna-api"
import { t } from "i18next"
import { ref, watch } from "vue"
import { getInstanceInfo } from "@/api/external"
import { missionsIngameQuery } from "@/api/graphql"
import { useSettingStore } from "@/store/setting"
import { serializeTaskData } from "@/utils/dna-channel"
import { type DNAHourSample, sampleDNAHour } from "@/utils/dna-hour-sample"
import {
    cancelAllHourSessions,
    formatHourOffset,
    getHourAdminPushHandler,
    getHourStart,
    getLastAdminPushHourStart,
    getVerifyAt,
    invokeHourAdminPush,
    isAbortError,
    isInVerifyWindow,
    logHourVerify,
    runDoubleWriteVerify,
    runHourlyDoubleWriteSession,
    trackHourSession,
} from "@/utils/hour-verify"
import { SHORT_NOTE_STORAGE_KEY } from "@/utils/screen-bar"
import { env } from "../env"
import { useUIStore } from "./ui"

export const MIHAN_TYPES = ["角色", "武器", "魔之楔"] as const
/** 委托任务名定义在无依赖模块里,便于屏幕信息条等纯逻辑模块直接引用。 */
export { MIHAN_MISSIONS } from "@/utils/mihan-meta"
/** 密函数据在 localStorage 中的键。悬浮条窗口按原始字符串比对做跨窗口同步。 */
export const MIHAN_DATA_KEY = "mihanData"
/** 关注任务列表在 localStorage 中的键。 */
export const MIHAN_NOTIFY_MISSIONS_KEY = "mihanNotifyMissions"
const MIHAN_UPDATE_DELAY_MS = 80 * 1000

let mihanNotifySingleton: ReturnType<typeof createMihanNotify> | null = null

/**
 * 获取密函通知组合式全局单例。
 * @returns 密函通知状态与方法
 */
export function useMihanNotify() {
    if (!mihanNotifySingleton) {
        mihanNotifySingleton = createMihanNotify()
    }
    return mihanNotifySingleton
}

export type MihanNotifyContext = ReturnType<typeof createMihanNotify>

/**
 * 创建密函通知实例。
 * @returns 密函通知状态与方法
 */
function createMihanNotify() {
    const mihanData = useLocalStorage<string[][] | undefined>(MIHAN_DATA_KEY, [])
    const mihanUpdateTime = useLocalStorage<number>("mihanUpdateTime", 0)
    const mihanEnableNotify = useLocalStorage("mihanNotify", false)
    const mihanNotifyOnce = useLocalStorage("mihanNotifyOnce", true)
    const mihanNotifyTypes = useLocalStorage("mihanNotifyTypes", [] as number[])
    const mihanNotifyMissions = useLocalStorage(MIHAN_NOTIFY_MISSIONS_KEY, [] as string[])
    /** 游戏信息:每小时与密函同一批请求刷新,屏幕信息条的铸造摘要靠它取数。 */
    const shortNoteInfo = useLocalStorage<DNAShortNoteEntity>(SHORT_NOTE_STORAGE_KEY, {} as any)
    const sfx = useSound("/sfx/notice.mp3")
    const watching = ref(false)
    let watchTimer: ReturnType<typeof setTimeout> | null = null
    const ui = useUIStore()
    const setting = useSettingStore()

    watch(
        () => ui.mihanVisible,
        async val => {
            if (val) {
                await updateMihanData(true)
            }
        }
    )

    /**
     * 是否应当维持每小时轮询。
     *
     * 四类来源都需要定时刷新委托数据:
     * 1. 订阅开关 `mihanNotify`(来自委托面板)打开;
     * 2. 屏幕信息条已开启,且配置里含有至少一个委托(mihan)条目——这是此前缺失的触发路径。
     * 3. 屏幕信息条里有"摘要"/"最近完成"铸造条目:同一批请求顺带刷新的游戏信息就是它的数据源。
     * 4. 管理员上传钩子已安装:整点验真通过后由本轮询推送服务端,不再单开一条循环。
     * 以上任一成立即需要轮询(逻辑或)。
     * @returns 是否应持续轮询
     */
    function shouldKeepWatch() {
        if (getHourAdminPushHandler()) return true
        const hasScreenBarMihan = setting.screenBar.enabled && setting.screenBar.items.some(item => item.type === "mihan")
        const hasScreenBarForgeQueue =
            setting.screenBar.enabled && setting.screenBar.items.some(item => item.type === "forge" && item.mode !== "alarm")
        return mihanEnableNotify.value || hasScreenBarMihan || hasScreenBarForgeQueue
    }

    /**
     * 按当前条件拉起或停止轮询(已运行则幂等)。
     */
    function syncWatch() {
        if (shouldKeepWatch()) startWatch()
        else stopWatch()
    }

    watch(mihanEnableNotify, () => syncWatch())

    // 屏幕信息条配置(总开关 + 条目列表)变化即重算,保证加了委托条目或把铸造改成摘要/最近完成后自动开始每小时更新
    watch(
        () =>
            setting.screenBar.enabled &&
            setting.screenBar.items.some(item => item.type === "mihan" || (item.type === "forge" && item.mode !== "alarm")),
        () => syncWatch(),
        { deep: true }
    )

    /**
     * 标准化任务名称，统一勘探/勘察文案避免误判变更。
     * @param missions 原始任务数组。
     * @returns 标准化后的任务数组。
     */
    const normalizeMissions = (missions: string[][]) => missions.map(v => v.map(v => v.replace("勘探/无尽", "勘察/无尽")))

    /**
     * 应用任务数据到本地存储。
     * @param missions 任务数组。
     * @param updateTime 更新时间戳。
     * @returns 数据拉取成功（无论内容是否发生变更均视为成功）。
     */
    const applyMissions = (missions: string[][], updateTime: number) => {
        const normalized = normalizeMissions(missions)
        if (JSON.stringify(normalized) !== JSON.stringify(mihanData.value)) {
            mihanData.value = normalized
        }
        mihanUpdateTime.value = updateTime
        return true
    }

    /**
     * 更新密函数据。
     * 整点轮询走“二次写入”：首轮立刻取数写入本地，第二轮验真，不一致覆盖修正。
     * 手动刷新走立刻取数：先取消在途验真会话，取数写入后若落在整点 110 秒窗口内则在 80+30 秒处重排验真。
     * @param force 是否强制刷新
     * @param initialDelayMs 整点轮询标记；>0 走整点验真，<=0 走手动立刻取数
     * @returns 是否成功更新到新数据
     */
    async function updateMihanData(force = false, initialDelayMs = 0) {
        if (mihanData.value && !isOutdated() && !force) {
            logHourVerify("[密函] 数据未过期，跳过更新", {
                updateTime: new Date(mihanUpdateTime.value).toLocaleString(),
                nextUpdateTime: new Date(getNextUpdateTime(mihanUpdateTime.value)).toLocaleString(),
            })
            return true
        }

        // DNA 单次取样（共享队列 + 心跳）：密函与活动同一次心跳取回，活动供管理员推送直接复用；
        // 顺带取游戏信息，只为给屏幕信息窗的铸造摘要保鲜（失败不影响密函取数）。
        const sampleMissionsDNA = async () => {
            const sample = await sampleDNAHour({ withShortNote: true })
            if (sample.shortNote) shortNoteInfo.value = sample.shortNote
            return sample
        }
        const isSameMissions = (a: DNAHourSample, b: DNAHourSample) => serializeTaskData(a.missions) === serializeTaskData(b.missions)
        const writeMissionsLocal = (sample: DNAHourSample) => {
            applyMissions(sample.missions, Date.now())
        }
        if (initialDelayMs <= 0) {
            // 手动立刻取数：取消在途验真会话并重新规划，弹窗不等待验真
            const cancelled = cancelAllHourSessions("手动刷新密函")
            try {
                const sample = await sampleMissionsDNA()
                writeMissionsLocal(sample)
                const manualAt = Date.now()
                const hourStart = getHourStart(manualAt)
                const inWindow = isInVerifyWindow(manualAt, hourStart)
                logHourVerify(`[${formatHourOffset(hourStart, manualAt)}] 密函手动取数完成`, {
                    cancelledSessions: cancelled,
                    hourStart: new Date(hourStart).toLocaleString(),
                    inWindow,
                    missions: sample.missions,
                    activities: sample.activities.length,
                })
                if (inWindow) {
                    // 落在整点 110 秒窗口内：在 80+30 秒处重排验真（后台进行，不阻塞弹窗）
                    const tracked = trackHourSession("手动重验")
                    void runDoubleWriteVerify({
                        hourStart,
                        first: { value: sample, at: manualAt },
                        verifyAt: getVerifyAt(hourStart),
                        extraGapMs: 0,
                        sample: sampleMissionsDNA,
                        isSame: isSameMissions,
                        onSample: writeMissionsLocal,
                        onVerifiedPush: async value => {
                            await invokeHourAdminPush(hourStart, value)
                        },
                        describeSample: value => serializeTaskData(value.missions),
                        signal: tracked.signal,
                    })
                        .catch(error => {
                            if (!isAbortError(error)) console.error("手动重验失败:", error)
                        })
                        .finally(() => tracked.done())
                } else if (getLastAdminPushHourStart() !== hourStart) {
                    // 落在窗口外：本小时尚未推送过且管理员推送启用时，用这次新鲜取数补推一次
                    logHourVerify(`[${formatHourOffset(hourStart, manualAt)}] 窗口外取数，尝试补推管理员数据`)
                    try {
                        const pushed = await invokeHourAdminPush(hourStart, sample)
                        logHourVerify(`[${formatHourOffset(hourStart, Date.now())}] 窗口外补推结果`, { pushed })
                    } catch (error) {
                        console.error("管理员推送失败:", error)
                    }
                } else {
                    logHourVerify(`[${formatHourOffset(hourStart, manualAt)}] 窗口外且本小时已推送，不再补推`)
                }
                return true
            } catch (error) {
                console.error("DNAAPI获取密函失败:", error)
                logHourVerify("[密函] 手动取数失败，落到服务端兜底", { error: String(error) })
                // DNA 取数失败：落到下面的服务端兜底
            }
        }
        // 整点二次写入：首轮立刻取数写入，第二轮验真修正
        const hourStart = getHourStart(Date.now())
        logHourVerify(`[${formatHourOffset(hourStart, Date.now())}] 密函整点会话启动`, {
            initialDelayMs,
        })
        const tracked = trackHourSession("整点验真")
        try {
            await runHourlyDoubleWriteSession({
                hourStart,
                sample: sampleMissionsDNA,
                isSame: isSameMissions,
                onSample: writeMissionsLocal,
                // 验真后推动服务端：管理员上传钩子已安装时才推，本地流不推
                onVerifiedPush: getHourAdminPushHandler()
                    ? async value => {
                          await invokeHourAdminPush(hourStart, value)
                      }
                    : null,
                describeSample: value => serializeTaskData(value.missions),
                signal: tracked.signal,
            })
            return true
        } catch (error) {
            // 被手动刷新取消：不走兜底，由手动流程接管后续取数与推送
            if (isAbortError(error)) {
                logHourVerify(`[${formatHourOffset(hourStart, Date.now())}] 密函整点会话被取消`)
                throw error
            }
            console.error("DNAAPI获取密函失败:", error)
            logHourVerify(`[${formatHourOffset(hourStart, Date.now())}] 密函整点会话失败，落到服务端兜底`, {
                error: String(error),
            })
        } finally {
            tracked.done()
        }

        try {
            // 自己服务器
            const data = await missionsIngameQuery({ server: "cn" }, { requestPolicy: "network-only" })
            const missions = data?.missions
            if (missions) {
                const updateTime = data?.createdAt ? new Date(data.createdAt).getTime() : Date.now()
                return applyMissions(missions, Number.isFinite(updateTime) ? updateTime : Date.now())
            }
        } catch (error) {
            console.error("服务器获取密函失败:", error)
        }

        if (isOutdated()) {
            try {
                // gamekee
                const instanceInfo = await getInstanceInfo()
                if (instanceInfo) {
                    return applyMissions(instanceInfo, Date.now())
                }
            } catch (error) {
                console.error("Gamekee获取密函失败:", error)
            }
        }
        return false
    }

    /**
     * 打开密函面板。
     */
    function show() {
        ui.mihanVisible = true
    }

    /**
     * 判断密函数据是否过期。
     * @returns 是否过期
     */
    function isOutdated() {
        // 用 >= 而非 >：整点那一瞬间定时器刚好命中时也要算过期，否则整小时轮询会被跳过
        return Date.now() >= getNextUpdateTime(mihanUpdateTime.value)
    }

    /**
     * 发送密函通知并打开面板。
     */
    async function showMihanNotification() {
        if (mihanNotifyOnce.value) {
            mihanEnableNotify.value = false
        }
        if (env.isApp) {
            const matchedTypes = (mihanData.value ?? [])
                .map((list, type) => ({ list, type }))
                .filter(({ list, type }) => mihanNotifyTypes.value.includes(type) && list.some(v => mihanNotifyMissions.value.includes(v)))
                .map(
                    ({ list, type }) =>
                        `${t(MIHAN_TYPES[type])}-${list
                            .filter(v => mihanNotifyMissions.value.includes(v))
                            .map(v => t(v))
                            .join("、")}`
                )
            let permissionGranted = await isPermissionGranted()
            if (!permissionGranted) {
                const permission = await requestPermission()
                permissionGranted = permission === "granted"
            }
            if (permissionGranted) {
                sendNotification({
                    title: t("resizeableWindow.mihanNotificationTitle"),
                    body: t("resizeableWindow.mihanNotificationBody", { types: matchedTypes.join(t("resizeableWindow.and")) }),
                })
            }
        }
        sfx.play()
        show()
    }

    /**
     * 获取下一次整点时间。
     * @param timestamp 可选的参考时间
     * @returns 下一次整点的时间戳
     */
    function getNextUpdateTime(timestamp?: number) {
        const now = timestamp ?? Date.now()
        const oneHour = 60 * 60 * 1000
        return Math.ceil(now / oneHour) * oneHour
    }

    /**
     * 判断当前数据是否命中通知规则。
     * @returns 是否应通知
     */
    function shouldNotify() {
        return !!mihanData.value?.some(
            (list, type) => mihanNotifyTypes.value.includes(type) && list.some(v => mihanNotifyMissions.value.includes(v))
        )
    }

    /**
     * 检查并触发通知。
     *
     * 轮询现在还服务于屏幕信息条,即便订阅开关关闭也会刷新数据,
     * 因此这里必须再次确认订阅开关,否则未启用推送时也会误弹面板并播放提示音。
     */
    async function checkNotify() {
        if (!mihanEnableNotify.value) return
        if (shouldNotify()) {
            await showMihanNotification()
        }
    }

    /**
     * 异步休眠。
     * @param duration 休眠时长（毫秒）
     * @returns Promise
     */
    function sleep(duration: number) {
        return new Promise(resolve => setTimeout(resolve, duration))
    }

    /**
     * 停止当前监控计时器。
     */
    function stopWatch() {
        if (watchTimer) {
            clearTimeout(watchTimer)
            watchTimer = null
        }
        watching.value = false
        logHourVerify("[密函] 停止整点轮询")
    }

    /**
     * 启动密函通知轮询。
     */
    function startWatch() {
        if (watching.value) return
        watching.value = true
        const next = getNextUpdateTime()
        const duration = next - Date.now()
        logHourVerify("[密函] 安排下一次整点轮询", {
            next: new Date(next).toLocaleString(),
            durationMs: duration,
        })
        watchTimer = setTimeout(async () => {
            watching.value = false
            watchTimer = null
            let ok = false
            let aborted = false
            try {
                ok = await updateMihanData(false, MIHAN_UPDATE_DELAY_MS)
            } catch (error) {
                // 被手动刷新取消：跳过重试，由手动重验接管后续取数与推送
                aborted = isAbortError(error)
                if (!aborted) console.error("整点密函更新失败:", error)
            }
            let c = 0
            while (!ok && !aborted && c < 3) {
                c++
                console.log("update mihan data failed, retry in 3s")
                logHourVerify("[密函] 整点更新未成功，3s 后重试", { attempt: c })
                ok = await updateMihanData(false, 0)
                await sleep(3e3)
            }
            await checkNotify()
            if (shouldKeepWatch()) {
                startWatch()
            }
        }, duration) // 整点触发；首轮 80 秒取数写入与 80+30 秒验真由二次写入会话负责
    }

    /**
     * 启动时按组合条件拉起轮询:强制刷一次当前委托,再开始每小时固定流程。
     * 由 App 启动逻辑调用,保证"屏幕条已开启且含委托条目"这种上次会话遗留状态也能自动开始更新。
     */
    async function ensureWatch() {
        if (!shouldKeepWatch()) return
        await updateMihanData(true)
        startWatch()
    }

    return {
        mihanData,
        mihanUpdateTime,
        /** 游戏信息(含铸造队列):与密函同批刷新,屏幕信息条的摘要与设置页预览共用。 */
        shortNoteInfo,
        mihanEnableNotify,
        mihanNotifyOnce,
        mihanNotifyTypes,
        mihanNotifyMissions,
        show,
        isOutdated,
        updateMihanData,
        showMihanNotification,
        getNextUpdateTime,
        shouldNotify,
        checkNotify,
        startWatch,
        stopWatch,
        shouldKeepWatch,
        ensureWatch,
        syncWatch,
    }
}
