import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { currentMonitor, LogicalPosition, LogicalSize, primaryMonitor } from "@tauri-apps/api/window"
import { env } from "@/env"
import { clampBarOffsetY, SCREEN_BAR_INITIAL_SIZE, SCREEN_BAR_WINDOW_LABEL, type ScreenBarConfig } from "@/utils/screen-bar"

/**
 * 屏幕信息条(顶部通用浮窗)的独立窗口管理。
 *
 * 窗口由前端用 `WebviewWindow` 创建(label 见 `SCREEN_BAR_WINDOW_LABEL`),承载路由 `/screen-bar`。
 * 尺寸与位置不在这里固定:浮窗页测量出内容尺寸后调 `fitScreenBarWindow` 落位,这样条目增减时
 * 窗口能跟着变宽变高,不需要主窗口知道渲染细节。
 *
 * 创建参数里的 `alwaysOnTop` / `skipTaskbar` / `focus: false` 决定"置顶、不占任务栏、不抢焦点",
 * `visible: false` 让浮窗页测量完成后再上屏,避免先在左上角闪一帧。
 */

/** 窗口创建后等待 `tauri://created` 的超时时间(毫秒)。 */
const CREATE_TIMEOUT_MS = 5000

/** 内容与屏幕边缘之间保留的最小间隙(逻辑像素)。 */
const SCREEN_EDGE_GAP = 8

/**
 * 查询信息条窗口是否已创建。
 * @returns 已存在返回窗口实例,否则返回 null
 */
export async function getScreenBarWindow(): Promise<WebviewWindow | null> {
    if (!env.isApp) return null
    try {
        return await WebviewWindow.getByLabel(SCREEN_BAR_WINDOW_LABEL)
    } catch (cause) {
        console.error("查询屏幕信息条窗口失败", cause)
        return null
    }
}

/**
 * 创建并显示屏幕信息条窗口(已存在时只显示)。
 *
 * 窗口以隐藏状态创建,由浮窗页测量尺寸后自行上屏。
 * @returns 窗口实例;非桌面环境或创建失败时返回 null
 */
export async function openScreenBarWindow(): Promise<WebviewWindow | null> {
    if (!env.isApp) return null

    const existing = await getScreenBarWindow()
    if (existing) {
        await existing.show()
        return existing
    }

    const barWindow = new WebviewWindow(SCREEN_BAR_WINDOW_LABEL, {
        url: `${location.origin}/#/screen-bar`,
        title: "屏幕信息条",
        width: SCREEN_BAR_INITIAL_SIZE.width,
        height: SCREEN_BAR_INITIAL_SIZE.height,
        x: 0,
        y: 0,
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
            const timer = setTimeout(() => reject(new Error("创建屏幕信息条窗口超时")), CREATE_TIMEOUT_MS)
            barWindow.once("tauri://created", () => {
                clearTimeout(timer)
                resolve()
            })
            barWindow.once("tauri://error", event => {
                clearTimeout(timer)
                reject(new Error(`创建屏幕信息条窗口失败: ${JSON.stringify(event.payload)}`))
            })
        })
    } catch (cause) {
        console.error(cause)
        return null
    }
    return barWindow
}

/**
 * 关闭屏幕信息条窗口。
 */
export async function closeScreenBarWindow(): Promise<void> {
    const barWindow = await getScreenBarWindow()
    if (!barWindow) return
    try {
        await barWindow.close()
    } catch (cause) {
        console.error("关闭屏幕信息条窗口失败", cause)
    }
}

/**
 * 按内容尺寸调整窗口大小,并把窗口水平居中到主显示器顶部。
 *
 * 窗口尺寸与 `getBoundingClientRect()` 同为逻辑像素,可直接透传;显示器尺寸是物理像素,
 * 需要除以缩放系数。取不到主显示器时回退调用方窗口所在显示器,再取不到就用 webview 自带的
 * 屏幕尺寸。内容比屏幕还宽时按屏幕截断:窗口超宽会让贴边一侧的内容永远看不到。
 * @param target 信息条窗口
 * @param config 信息条配置(读取顶部偏移)
 * @param size 内容实测尺寸(逻辑像素)
 */
export async function fitScreenBarWindow(
    target: WebviewWindow,
    config: ScreenBarConfig,
    size: { width: number; height: number }
): Promise<void> {
    let screenWidth = window.screen.availWidth
    try {
        const monitor = (await primaryMonitor()) ?? (await currentMonitor())
        if (monitor) screenWidth = monitor.size.width / (monitor.scaleFactor || 1)
    } catch (cause) {
        console.error("获取显示器信息失败,回退窗口所在屏幕尺寸", cause)
    }

    const maxWidth = Math.max(1, Math.floor(screenWidth - SCREEN_EDGE_GAP * 2))
    const width = Math.min(maxWidth, Math.max(1, Math.ceil(size.width)))
    const height = Math.max(1, Math.ceil(size.height))
    await target.setSize(new LogicalSize(width, height))

    const maxX = Math.max(0, screenWidth - width - SCREEN_EDGE_GAP)
    const x = Math.round(Math.min(maxX, Math.max(0, (screenWidth - width) / 2)))
    await target.setPosition(new LogicalPosition(x, clampBarOffsetY(config.offsetY)))
}

/**
 * 保证窗口处于置顶状态。
 *
 * 创建时已声明 `alwaysOnTop`,这里作为兜底:窗口被其他程序抢到下层后重新拉起。
 * @param target 信息条窗口
 * @param alwaysOnTop 目标状态
 */
export async function setScreenBarAlwaysOnTop(target: WebviewWindow, alwaysOnTop: boolean): Promise<void> {
    try {
        await target.setAlwaysOnTop(alwaysOnTop)
    } catch (cause) {
        console.error("设置屏幕信息条置顶失败", cause)
    }
}

/**
 * 切换鼠标穿透。开启后整条不接收指针事件,游戏可以正常点到被遮挡的区域。
 * @param target 信息条窗口
 * @param ignore 是否穿透
 */
export async function setScreenBarIgnoreCursorEvents(target: WebviewWindow, ignore: boolean): Promise<void> {
    try {
        await target.setIgnoreCursorEvents(ignore)
    } catch (cause) {
        console.error("设置屏幕信息条鼠标穿透失败", cause)
    }
}
