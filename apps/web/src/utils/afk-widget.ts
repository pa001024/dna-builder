/**
 * 狩月动画小窗的跨窗口状态。
 *
 * 小窗与主窗口是两个 webview，JS 内存不互通，只能靠同源 localStorage 共享。
 * 目前只有一个状态：鼠标穿透。开启后小窗自己点不到，必须由主窗口提供恢复入口。
 */

/** 小窗鼠标穿透状态在 localStorage 中的键。 */
export const AFK_WIDGET_CLICK_THROUGH_KEY = "afk_widget_click_through"

/**
 * 读取小窗是否处于鼠标穿透状态。
 * @returns 穿透中返回 true
 */
export function readAfkWidgetClickThrough(): boolean {
    try {
        return localStorage.getItem(AFK_WIDGET_CLICK_THROUGH_KEY) === "1"
    } catch {
        return false
    }
}

/**
 * 记录小窗鼠标穿透状态（值未变化时不写）。
 * @param enabled 是否穿透
 */
export function writeAfkWidgetClickThrough(enabled: boolean): void {
    try {
        if (readAfkWidgetClickThrough() === enabled) return
        if (enabled) localStorage.setItem(AFK_WIDGET_CLICK_THROUGH_KEY, "1")
        else localStorage.removeItem(AFK_WIDGET_CLICK_THROUGH_KEY)
    } catch (cause) {
        console.error("记录狩月动画窗口穿透状态失败", cause)
    }
}
