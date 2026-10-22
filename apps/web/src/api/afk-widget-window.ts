import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { currentMonitor, LogicalPosition, LogicalSize, primaryMonitor } from "@tauri-apps/api/window"
import { env } from "@/env"

/**
 * 狩月动画独立小窗（与官方「小小狩月人」同位置：屏幕右下、任务栏之上）。
 *
 * 与信息条不同，这个窗口只是把页头动画单独搬出来：透明、无边框、置顶、不占任务栏，
 * 内容全部直接读游戏目录里的官方资源，不加载数据包。鼠标悬停时显示 4 个操作按钮。
 */

/** 窗口 label（capabilities 按此授权）。 */
export const AFK_WIDGET_WINDOW_LABEL = "afk-widget"

/** 初始尺寸：官方浮窗 366×118。 */
export const AFK_WIDGET_SIZE = { width: 366, height: 118 }

/** 内容与屏幕边缘的间隙（逻辑像素）。 */
const SCREEN_EDGE_GAP = 8

/** 创建窗口的等待上限（毫秒）。 */
const CREATE_TIMEOUT_MS = 5000

/**
 * 查询动画小窗是否已创建。
 * @returns 窗口实例或 null
 */
export async function getAfkWidgetWindow(): Promise<WebviewWindow | null> {
    if (!env.isApp) return null
    try {
        return await WebviewWindow.getByLabel(AFK_WIDGET_WINDOW_LABEL)
    } catch (cause) {
        console.error("查询狩月动画窗口失败", cause)
        return null
    }
}

/**
 * 打开（或显示）动画小窗。
 * @returns 窗口实例；非桌面环境或创建失败时为 null
 */
export async function openAfkWidgetWindow(): Promise<WebviewWindow | null> {
    if (!env.isApp) return null
    const existing = await getAfkWidgetWindow()
    if (existing) {
        await existing.show()
        return existing
    }
    const widget = new WebviewWindow(AFK_WIDGET_WINDOW_LABEL, {
        url: `${location.origin}/#/afk-widget`,
        title: "狩月动画",
        width: AFK_WIDGET_SIZE.width,
        height: AFK_WIDGET_SIZE.height,
        decorations: false,
        transparent: true,
        shadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        maximizable: false,
        minimizable: false,
        focus: false,
        visible: false,
        center: false,
    })
    try {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("创建狩月动画窗口超时")), CREATE_TIMEOUT_MS)
            widget.once("tauri://created", () => {
                clearTimeout(timer)
                resolve()
            })
            widget.once("tauri://error", event => {
                clearTimeout(timer)
                reject(new Error(`创建狩月动画窗口失败: ${JSON.stringify(event.payload)}`))
            })
        })
    } catch (cause) {
        console.error(cause)
        return null
    }
    await placeAfkWidget(widget)
    await widget.show()
    return widget
}

/**
 * 关闭动画小窗。
 */
export async function closeAfkWidgetWindow(): Promise<void> {
    const widget = await getAfkWidgetWindow()
    if (!widget) return
    await widget.close()
}

/**
 * 把窗口摆到主显示器右下角、任务栏上方的非任务栏区域。
 * @param target 窗口；缺省取已存在的动画小窗
 * @param size 逻辑尺寸，缺省为官方 366×118
 */
export async function placeAfkWidget(
    target?: WebviewWindow | null,
    size: { width: number; height: number } = AFK_WIDGET_SIZE
): Promise<void> {
    if (!env.isApp) return
    const widget = target ?? (await getAfkWidgetWindow())
    if (!widget) return
    let screen = { width: window.screen.availWidth, height: window.screen.availHeight, x: 0, y: 0 }
    try {
        const monitor = (await primaryMonitor()) ?? (await currentMonitor())
        if (monitor) {
            const scale = monitor.scaleFactor || 1
            screen = {
                width: monitor.size.width / scale,
                height: monitor.size.height / scale,
                x: monitor.position.x / scale,
                y: monitor.position.y / scale,
            }
        }
    } catch (cause) {
        console.error("获取显示器信息失败，回退窗口屏幕尺寸", cause)
    }
    // 任务栏高度拿不到可靠值：用可用区域（去掉任务栏）的底部作为基线
    const availableBottom = screen.y + (window.screen.availHeight || screen.height)
    const x = Math.round(screen.x + screen.width - size.width - SCREEN_EDGE_GAP)
    const y = Math.round(availableBottom - size.height - SCREEN_EDGE_GAP)
    await widget.setSize(new LogicalSize(size.width, size.height)).catch(() => {})
    await widget.setPosition(new LogicalPosition(x, y)).catch(() => {})
}

/**
 * 切换始终置顶。
 * @param target 窗口
 * @param alwaysOnTop 目标状态
 */
export async function setAfkWidgetAlwaysOnTop(target: WebviewWindow, alwaysOnTop: boolean): Promise<void> {
    await target.setAlwaysOnTop(alwaysOnTop).catch(cause => console.error("设置狩月动画置顶失败", cause))
}

/**
 * 切换鼠标穿透（穿透后按钮点不到，需要从主窗口或设置里恢复）。
 * @param target 窗口
 * @param ignore 是否穿透
 */
export async function setAfkWidgetIgnoreCursorEvents(target: WebviewWindow, ignore: boolean): Promise<void> {
    await target.setIgnoreCursorEvents(ignore).catch(cause => console.error("设置狩月动画鼠标穿透失败", cause))
}
