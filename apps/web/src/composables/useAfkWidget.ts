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
     *
     * 双向对齐：开关开但窗不在就拉起，开关关但有孤儿窗就关闭。应用启动时调一次，
     * 保证各窗口状态从一开始就与开关一致，不必等进一次 /afk 页才收敛。
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
