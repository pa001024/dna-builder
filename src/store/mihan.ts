import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import { useLocalStorage } from "@vueuse/core"
import { useSound } from "@vueuse/sound"
import { t } from "i18next"
import { ref, watch } from "vue"
import { getInstanceInfo } from "@/api/external"
import { missionsIngameQuery } from "@/api/graphql"
import { useSettingStore } from "@/store/setting"
import { env } from "../env"
import { useUIStore } from "./ui"

export const MIHAN_TYPES = ["角色", "武器", "魔之楔"] as const
/** 委托任务名定义在无依赖模块里,便于屏幕信息条等纯逻辑模块直接引用。 */
export { MIHAN_MISSIONS } from "@/utils/mihan-meta"
/** 密函数据在 localStorage 中的键。悬浮条窗口按原始字符串比对做跨窗口同步。 */
export const MIHAN_DATA_KEY = "mihanData"
/** 关注任务列表在 localStorage 中的键。 */
export const MIHAN_NOTIFY_MISSIONS_KEY = "mihanNotifyMissions"
const MIHAN_UPDATE_DELAY_MS = 85 * 1000

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
     * 两类来源都需要定时刷新委托数据:
     * 1. 订阅开关 `mihanNotify`(来自委托面板)打开;
     * 2. 屏幕信息条已开启,且配置里含有至少一个委托(mihan)条目——这是此前缺失的触发路径。
     * @returns 是否应持续轮询
     */
    function shouldKeepWatch() {
        const hasScreenBarMihan = setting.screenBar.enabled && setting.screenBar.items.some(item => item.type === "mihan")
        return mihanEnableNotify.value || hasScreenBarMihan
    }

    /**
     * 按当前条件拉起或停止轮询(已运行则幂等)。
     */
    function syncWatch() {
        if (shouldKeepWatch()) startWatch()
        else stopWatch()
    }

    watch(mihanEnableNotify, () => syncWatch())

    // 屏幕信息条配置(总开关 + 条目列表)变化即重算,保证加了委托条目后自动开始每小时更新
    watch(
        () => setting.screenBar.enabled && setting.screenBar.items.some(item => item.type === "mihan"),
        () => syncWatch(),
        { deep: true }
    )

    /**
     * 更新密函数据。
     * @param force 是否强制刷新
     * @returns 是否成功更新到新数据
     */
    async function updateMihanData(force = false) {
        if (mihanData.value && !isOutdated() && !force) return true

        /**
         * 标准化任务名称，统一勘探/勘察文案避免误判变更。
         * @param missions 原始任务数组。
         * @returns 标准化后的任务数组。
         */
        const normalizeMissions = (missions: string[][]) => missions.map(v => v.map(v => v.replace("勘探/无尽", "勘察/无尽")))

        /**
         * 应用新任务数据到本地存储。
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

        const setting = useSettingStore()
        const api = await setting.getDNAAPI()
        if (api) {
            try {
                // 用户登录尝试使用DNAAPI获取密函
                await setting.startHeartbeat()
                const data = await api.defaultRoleForTool()
                if (data?.data?.instanceInfo) {
                    const missions = data.data.instanceInfo.map(v => v.instances.map(v => v.name))
                    return applyMissions(missions, Date.now())
                }
            } catch (error) {
                console.error("DNAAPI获取密函失败:", error)
            } finally {
                await setting.stopHeartbeat()
            }
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
        return Date.now() > getNextUpdateTime(mihanUpdateTime.value)
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
     */
    async function checkNotify() {
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
    }

    /**
     * 启动密函通知轮询。
     */
    function startWatch() {
        if (watching.value) return
        watching.value = true
        const next = getNextUpdateTime()
        const duration = next - Date.now()
        watchTimer = setTimeout(async () => {
            watching.value = false
            watchTimer = null
            let ok = await updateMihanData()
            let c = 0
            while (!ok && c < 3) {
                c++
                console.log("update mihan data failed, retry in 3s")
                ok = await updateMihanData()
                await sleep(3e3)
            }
            await checkNotify()
            if (shouldKeepWatch()) {
                startWatch()
            }
        }, duration + MIHAN_UPDATE_DELAY_MS) // 整点后延迟85秒（原25秒+新增1分钟），避免拿到上一小时旧数据
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
    }
}
