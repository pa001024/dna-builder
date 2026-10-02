import { invoke } from "@tauri-apps/api/core"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { currentMonitor, LogicalPosition, LogicalSize, primaryMonitor } from "@tauri-apps/api/window"
import { env } from "@/env"
import { clampBarOffsetY, SCREEN_BAR_INITIAL_SIZE, SCREEN_BAR_WINDOW_LABEL, type ScreenBarConfig } from "@/utils/screen-bar"

/**
 * 屏幕信息条(顶部通用浮窗)的独立窗口管理。
 *
 * 窗口由前端用 `WebviewWindow` 创建(label 见 `SCREEN_BAR_WINDOW_LABEL`),承载路由 `/screen-bar`。
 * 支持两种显示模式,由配置里的 `inTaskbar` 切换:
 * - 顶部悬浮(默认):浮窗页测量出内容尺寸后调 `fitScreenBarWindow` 居中到屏幕顶部;
 * - 任务栏嵌入:走 Win32 原生 `SetParent` 把窗口挂进任务栏(`embedScreenBarInTaskbar`),
 *   视觉上渲染在任务栏内部,explorer 重启丢失后由主窗口看门狗重建。
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

/** 任务栏嵌入落位结果(逻辑像素,由 Rust 侧按宿主 DPI 换算后返回)。 */
export type ScreenBarTaskbarFit = {
    /** 实际生效的显示方式:"embedded" = 任务栏子窗口(Win10),"overlay" = 覆盖在任务栏上的顶层窗口(Win11) */
    mode: "embedded" | "overlay"
    /** 窗口最终逻辑宽度(超出任务栏可用区域时被截断) */
    width: number
    /** 窗口最终逻辑高度(超出任务栏高度时被截断) */
    height: number
    /** 宿主客户区逻辑宽度 */
    hostWidth: number
    /** 宿主客户区逻辑高度 */
    hostHeight: number
    /** 宿主 DPI 缩放系数 */
    scale: number
}

/**
 * 把信息条窗口按任务栏模式落位(幂等,重复调用等于重新摆放,可当"重新置顶"用)。
 *
 * 原生逻辑在 Rust 侧完成,按任务栏类型二选一:Win10 风格任务栏 `SetParent` 进
 * ReBarWindow32 成为其子窗口;Win11 XAML 任务栏(微软已砍掉嵌入 API,子窗口不被合成)
 * 则保持顶层窗口、置顶并覆盖到任务栏区域内托盘时钟左侧。任务栏模式下 Tauri 的
 * setSize/setPosition 坐标语义会变,落位必须全部走本函数。
 * @param target 信息条窗口
 * @param size 内容实测尺寸(逻辑像素)
 * @returns 落位结果;非桌面环境或失败(如找不到任务栏)时返回 null,调用方应回退顶部悬浮
 */
export async function embedScreenBarInTaskbar(
    target: WebviewWindow,
    size: { width: number; height: number }
): Promise<ScreenBarTaskbarFit | null> {
    if (!env.isApp) return null
    try {
        return await invoke<ScreenBarTaskbarFit>("screen_bar_taskbar_embed", {
            label: target.label,
            width: size.width,
            height: size.height,
        })
    } catch (cause) {
        console.error("嵌入 Windows 任务栏失败", cause)
        return null
    }
}

/**
 * 把信息条窗口从任务栏分离回顶层悬浮(幂等;未嵌入时是空操作)。
 *
 * 切回顶部悬浮前必须先分离:SetParent 之后再调 Tauri 的 setPosition,坐标会被解释成
 * 任务栏客户区坐标,窗口会跑到错误的位置。
 * @param target 信息条窗口
 */
export async function detachScreenBarFromTaskbar(target: WebviewWindow): Promise<void> {
    if (!env.isApp) return
    try {
        await invoke("screen_bar_taskbar_detach", { label: target.label })
    } catch (cause) {
        console.error("从 Windows 任务栏分离失败", cause)
    }
}
