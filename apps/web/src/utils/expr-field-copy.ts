import { t } from "i18next"
import { clearExprDrag } from "@/composables/useExprDrag"
import { useUIStore } from "@/store/ui"
import { copyText } from "@/util"

/**
 * 复制字段表达式到剪贴板，并给出成功 / 失败提示。
 * 角色属性行、武器属性行与技能字段行的「双击复制」共用此入口，保证复制内容与拖拽放置写入的片段完全一致。
 * @param text 待复制的表达式文本（如 角色::攻击!）
 * @returns void
 */
export async function copyExprField(text: string) {
    // 双击前的第一次单击会先进入「已抓起」状态，复制前统一清掉，避免复制后仍挂着浮动标签
    clearExprDrag()
    if (!text) return
    const ui = useUIStore()
    try {
        await copyText(text)
        ui.showSuccessMessage(t("char-build.copied_to_clipboard"))
    } catch (error) {
        ui.showErrorMessage(t("char-build.copy_failed"), error instanceof Error ? error.message : "")
    }
}
