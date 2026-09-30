import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import { StorageSerializers, useLocalStorage } from "@vueuse/core"
import { useSound } from "@vueuse/sound"
import { t } from "i18next"
import { watch } from "vue"
import { env } from "@/env"
import { useUIStore } from "./ui"

/** 铸造完成提醒在 localStorage 中的键。 */
export const FORGE_ALARM_KEY = "dna.forgeAlarm"
/** 系统通知标题的 i18n 键。 */
const FORGE_ALARM_NOTIFY_TITLE_KEY = "dna-game-info.forge_alarm_notify_title"
/** 触发点之后超过这个时长就不再补发通知（应用关闭期间错过的提醒）。 */
const FORGE_ALARM_GRACE_MS = 5 * 60 * 1000
/** setTimeout 的延时上限（约 24.8 天），超过时分段重排。 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

export interface ForgeAlarm {
    /** 触发时间戳（毫秒） */
    time: number
    /** 提醒标题，作为系统通知正文展示 */
    title: string
}

let forgeAlarmSingleton: ReturnType<typeof createForgeAlarm> | null = null

/**
 * 获取铸造完成提醒的全局单例。
 *
 * 提醒是「一次性 + 单条」的：设置时只记下触发时间与标题，之后不再读取游戏信息，
 * 应用重启后按持久化数据重新排期。
 * @returns 提醒状态与方法
 */
export function useForgeAlarm() {
    if (!forgeAlarmSingleton) {
        forgeAlarmSingleton = createForgeAlarm()
    }
    return forgeAlarmSingleton
}

export type ForgeAlarmContext = ReturnType<typeof createForgeAlarm>

/**
 * 创建铸造完成提醒实例。
 * @returns 提醒状态与方法
 */
function createForgeAlarm() {
    const alarm = useLocalStorage<ForgeAlarm | null>(FORGE_ALARM_KEY, null, { serializer: StorageSerializers.object })
    const sfx = useSound("/sfx/notice.mp3")
    const ui = useUIStore()
    let timer: ReturnType<typeof setTimeout> | null = null

    /**
     * 清掉当前的排期定时器。
     */
    function clearTimer() {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    }

    /**
     * 触发提醒：发系统通知、播放提示音，然后清掉这条一次性提醒。
     */
    async function fire() {
        const current = alarm.value
        if (!current) return
        clearTimer()
        alarm.value = null
        if (env.isApp) {
            let granted = await isPermissionGranted()
            if (!granted) {
                granted = (await requestPermission()) === "granted"
            }
            if (granted) {
                sendNotification({ title: t(FORGE_ALARM_NOTIFY_TITLE_KEY), body: current.title })
            }
        }
        sfx.play()
        ui.showSuccessMessage(t("dna-game-info.forge_alarm_done", { name: current.title }))
    }

    /**
     * 按当前提醒重新排期（幂等）。
     */
    function schedule() {
        clearTimer()
        const target = alarm.value?.time
        if (!target) return
        const delay = target - Date.now()
        if (delay <= 0) {
            void fire()
            return
        }
        timer = setTimeout(
            () => {
                timer = null
                // 延时超过 setTimeout 上限时先分段重排，真正到点才触发
                if (Date.now() < target) schedule()
                else void fire()
            },
            Math.min(delay, MAX_TIMEOUT_MS)
        )
    }

    // 提醒被写入/清空都重新排期，跨组件修改也能生效
    watch(alarm, () => schedule(), { deep: true })

    /**
     * 判断某个触发时间点是否已经设过提醒。
     * @param time 触发时间戳（毫秒）
     * @returns 是否已设
     */
    function isArmed(time: number) {
        return alarm.value?.time === time
    }

    /**
     * 设置提醒。同时只允许存在一条，新设置会覆盖旧的。
     * @param time 触发时间戳（毫秒）
     * @param title 提醒标题
     */
    function setAlarm(time: number, title: string) {
        alarm.value = { time, title }
        schedule()
    }

    /**
     * 取消并清空提醒。
     */
    function cancel() {
        clearTimer()
        alarm.value = null
    }

    /**
     * 恢复持久化的提醒：已到点或刚过点的立即补发，错过太久的直接丢弃。
     * 由 App 启动流程调用。
     */
    function restore() {
        const target = alarm.value?.time
        if (!target) return
        if (Date.now() - target > FORGE_ALARM_GRACE_MS) {
            alarm.value = null
            return
        }
        schedule()
    }

    return {
        alarm,
        isArmed,
        setAlarm,
        cancel,
        restore,
    }
}
