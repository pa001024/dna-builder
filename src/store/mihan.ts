import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import { useLocalStorage } from "@vueuse/core"
import { useSound } from "@vueuse/sound"
import { t } from "i18next"
import { ref, watch } from "vue"
import { getInstanceInfo } from "@/api/external"
import { missionsIngameQuery } from "@/api/graphql"
import { env } from "../env"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "./ui"

export const MIHAN_TYPES = ["角色", "武器", "魔之楔"] as const
export const MIHAN_MISSIONS = [
    "探险/无尽",
    "驱离",
    "拆解",
    "驱逐",
    "避险",
    "扼守/无尽",
    "护送",
    "勘察/无尽",
    "追缉",
    "调停",
    "迁移",
] as const
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
    const mihanData = useLocalStorage<string[][] | undefined>("mihanData", [])
    const mihanUpdateTime = useLocalStorage<number>("mihanUpdateTime", 0)
    const mihanEnableNotify = useLocalStorage("mihanNotify", false)
    const mihanNotifyOnce = useLocalStorage("mihanNotifyOnce", true)
    const mihanNotifyTypes = useLocalStorage("mihanNotifyTypes", [] as number[])
    const mihanNotifyMissions = useLocalStorage("mihanNotifyMissions", [] as string[])
    const sfx = useSound("/sfx/notice.mp3")
    const watching = ref(false)
    let watchTimer: ReturnType<typeof setTimeout> | null = null
    const ui = useUIStore()

    watch(
        () => ui.mihanVisible,
        async val => {
            if (val) {
                await updateMihanData(true)
            }
        }
    )

    watch(mihanEnableNotify, val => {
        if (val) {
            startWatch()
            return
        }
        stopWatch()
    })

    /**
     * 更新密函数据。
     * @param force 是否强制刷新
     * @returns 是否成功更新到新数据
     */
    async function updateMihanData(force = false) {
        if (mihanData.value && !isOutdated() && !force) return true
        const setting = useSettingStore()
        const api = await setting.getDNAAPI()
        if (api) {
            // 用户登录尝试使用DNAAPI获取密函
            await setting.startHeartbeat()
            const data = await api.defaultRoleForTool()
            await setting.stopHeartbeat()
            if (data?.data?.instanceInfo) {
                const missions = data.data.instanceInfo.map(v => v.instances.map(v => v.name.replace("勘探/无尽", "勘察/无尽")))
                if (!missions) return false
                if (JSON.stringify(missions) === JSON.stringify(mihanData.value)) {
                    mihanUpdateTime.value = Date.now()
                    return false
                }
                mihanData.value = missions
                mihanUpdateTime.value = Date.now()
                return true
            }
        }
        try {
            // 自己服务器
            const data = await missionsIngameQuery({ server: "cn" }, { requestPolicy: "network-only" })
            const missions = data?.missions?.map(v => v.map(v => v.replace("勘探/无尽", "勘察/无尽")))
            if (!missions) return false
            if (JSON.stringify(missions) === JSON.stringify(mihanData.value)) {
                mihanUpdateTime.value = Date.now()
                return false
            }
            mihanData.value = missions
            mihanUpdateTime.value = new Date(data!.createdAt || "").getTime()
        } catch {}
        if (isOutdated()) {
            // gamekee
            const instanceInfo = await getInstanceInfo()
            if (instanceInfo) {
                mihanData.value = instanceInfo.map(v => v.map(v => v.replace("勘探/无尽", "勘察/无尽")))
                mihanUpdateTime.value = Date.now()
            }
        }
        return true
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
            if (mihanEnableNotify.value) {
                startWatch()
            }
        }, duration + MIHAN_UPDATE_DELAY_MS) // 整点后延迟85秒（原25秒+新增1分钟），避免拿到上一小时旧数据
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
    }
}
