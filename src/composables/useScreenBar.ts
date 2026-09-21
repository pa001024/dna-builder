import { ref } from "vue"
import { closeScreenBarWindow, getScreenBarWindow, openScreenBarWindow } from "@/api/screen-bar-window"
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
     */
    async function syncWindowWithSetting() {
        if (!env.isApp) return
        const exists = (await getScreenBarWindow()) !== null
        if (setting.screenBar.enabled === exists) return
        try {
            if (setting.screenBar.enabled) {
                await openScreenBarWindow()
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
