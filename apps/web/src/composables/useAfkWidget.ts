import { ref } from "vue"
import { closeAfkWidgetWindow, getAfkWidgetWindow, openAfkWidgetWindow } from "@/api/afk-widget-window"
import { env } from "@/env"
import { useSettingStore } from "@/store/setting"

/**
 * 狩月动画独立小窗的启停控制。
 *
 * 与屏幕信息条同一套范式：开关存在设置里（`setting.afkWidgetEnabled`），
 * 窗口只是开关的投影——开启即拉起、关闭即销毁，应用启动时按开关恢复。
 * 窗口自己关掉（Alt+F4 等）时由小窗页把开关写回 false，主窗口经 storage 事件同步。
 * @returns 状态与操作函数
 */
export function useAfkWidget() {
    const setting = useSettingStore()
    /** 正在启停窗口（窗口要等 webview 就绪，期间保持忙碌态）。 */
    const busy = ref(false)
    /** 最近一次错误信息。 */
    const error = ref("")

    /**
     * 记录错误。
     * @param cause 抛出的异常
     */
    function handleError(cause: unknown) {
        error.value = cause instanceof Error ? cause.message : String(cause)
        console.error("狩月动画小窗操作失败", cause)
    }

    /**
     * 切换开关并立即启停窗口。
     * @param enabled 新的开关值
     */
    async function setEnabled(enabled: boolean) {
        setting.afkWidgetEnabled = enabled
        if (!env.isApp) return
        busy.value = true
        error.value = ""
        try {
            if (enabled) await openAfkWidgetWindow()
            else await closeAfkWidgetWindow()
        } catch (cause) {
            setting.afkWidgetEnabled = false
            handleError(cause)
        } finally {
            busy.value = false
        }
    }

    /**
     * 对齐窗口与开关：窗口不可持久化，开关可能被上次会话改过，这里把窗口拉回一致。
     */
    async function syncWindowWithSetting() {
        if (!env.isApp) return
        const exists = (await getAfkWidgetWindow()) !== null
        if (setting.afkWidgetEnabled === exists) return
        try {
            if (setting.afkWidgetEnabled) await openAfkWidgetWindow()
            else await closeAfkWidgetWindow()
        } catch (cause) {
            handleError(cause)
        }
    }

    return { busy, error, setEnabled, syncWindowWithSetting }
}

/**
 * 应用启动时按持久化开关恢复小窗。
 *
 * 窗口不会随应用自启，上次开着就重新拉起，避免「必须先去账本页点一下」。
 */
export async function restoreAfkWidget(): Promise<void> {
    if (!env.isApp) return
    const setting = useSettingStore()
    if (!setting.afkWidgetEnabled) return
    const widget = await openAfkWidgetWindow()
    if (!widget) setting.afkWidgetEnabled = false
}
