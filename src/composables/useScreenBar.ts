import type { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { ref } from "vue"
import { closeScreenBarWindow, getScreenBarWindow, openScreenBarWindow, readScreenBarTaskbarMode } from "@/api/screen-bar-window"
import { env } from "@/env"
import { useSettingStore } from "@/store/setting"

/**
 * 屏幕信息条的启停控制。
 *
 * 窗口由前端按需创建,不随应用自启:开启开关时拉起窗口,关闭时销毁窗口。
 * 窗口内部尺寸/位置由浮窗页自己维护,这里只管生命周期。
 * @returns 状态与操作函数
 */
export function useScreenBar() {
    const setting = useSettingStore()
    /** 正在启停窗口(窗口要等 webview 就绪,期间保持忙碌态)。 */
    const busy = ref(false)
    /** 最近一次错误信息。 */
    const error = ref("")

    /**
     * 记录错误。
     * @param cause 抛出的异常
     */
    function handleError(cause: unknown) {
        error.value = cause instanceof Error ? cause.message : String(cause)
        console.error("屏幕信息条操作失败", cause)
    }

    /**
     * 切换总开关并立即启停窗口。
     * @param enabled 新的开关值
     */
    async function setEnabled(enabled: boolean) {
        setting.screenBar.enabled = enabled
        if (!env.isApp) return
        busy.value = true
        error.value = ""
        try {
            if (enabled) {
                await openScreenBarWindow()
            } else {
                await closeScreenBarWindow()
            }
        } catch (cause) {
            setting.screenBar.enabled = false
            handleError(cause)
        } finally {
            busy.value = false
        }
    }

    /**
     * 对齐窗口与开关状态:窗口不可持久化(应用重启即消失),但开关可能被改过,
     * 这里把窗口状态拉回与开关一致。
     * @param knownWindow 已查到的窗口实例;看门狗刚查过就能省掉 open/close 里的重复全量查询
     */
    async function syncWindowWithSetting(knownWindow?: WebviewWindow | null) {
        if (!env.isApp) return
        const exists = (knownWindow === undefined ? await getScreenBarWindow() : knownWindow) !== null
        if (setting.screenBar.enabled === exists) return
        try {
            if (setting.screenBar.enabled) {
                // 窗口已存在时 openScreenBarWindow 只做 show,直接复用查到的实例,避免再查一次全量窗口
                if (knownWindow) await knownWindow.show()
                else await openScreenBarWindow()
            } else {
                await closeScreenBarWindow()
            }
        } catch (cause) {
            handleError(cause)
        }
    }

    return { busy, error, setEnabled, syncWindowWithSetting }
}

/**
 * 应用启动时恢复屏幕信息条。
 *
 * 窗口不会随应用自启,若上次是开启状态就按持久化设置重新拉起,避免"必须先去设置页点一下才生效"。
 * 未开启时不产生任何调用。
 */
export async function restoreScreenBar(): Promise<void> {
    if (!env.isApp) return
    const setting = useSettingStore()
    if (!setting.screenBar.enabled) return
    const window = await openScreenBarWindow()
    if (!window) {
        setting.screenBar.enabled = false
    }
}

/** 任务栏模式的窗口看门狗轮询间隔(毫秒)。 */
const TASKBAR_WATCHDOG_MS = 4000

/**
 * 启动任务栏模式的窗口看门狗(主窗口启动时调用一次)。
 *
 * 信息条嵌入任务栏后是 Shell_TrayWnd 的子窗口,explorer 重启会连带销毁它。
 * 这里只在"已启用、任务栏模式、且落位方式确实是嵌入"期间低频核对"设置开 = 窗口在",
 * 丢失即按设置重建;重建出的窗口由浮窗页自己完成嵌入。
 *
 * 必须按**实际落位方式**而不是配置里的 inTaskbar 开关来决定是否轮询:Win11 走的是覆盖模式,
 * 信息条始终是顶层窗口,explorer 重启并不会销毁它,看门狗无意义却每 4 秒打一次
 * get_all_windows IPC。顶部悬浮模式同理不需要看守。
 */
export function startScreenBarWatchdog(): void {
    if (!env.isApp) return
    const { syncWindowWithSetting } = useScreenBar()
    window.setInterval(() => {
        const setting = useSettingStore()
        if (!setting.screenBar.enabled || !setting.screenBar.inTaskbar) return
        // 只有 Win10 式真实嵌入才会被 explorer 拖走;覆盖模式与未落位都跳过本轮,零 IPC
        if (readScreenBarTaskbarMode() !== "embedded") return
        void syncWindowWithSetting()
    }, TASKBAR_WATCHDOG_MS)
}
