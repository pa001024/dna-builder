import type { TransactionSpec } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import { findFieldDeleteRange } from "@/utils/expr-field"

/**
 * CodeMirror 命令所需的最小视图接口。
 * 只依赖选区、文档与 dispatch，便于在不引入 DOM 的情况下单元测试。
 */
export interface FieldDeleteView {
    state: {
        selection: { main: { empty: boolean; head: number } }
        doc: { toString(): string }
    }
    dispatch: (spec: TransactionSpec) => void
}

/**
 * 整字段删除命令：Ctrl/Alt + 退格一次删掉光标所在（或左侧紧邻）的整个 AST 字段（如 近战::攻击!）。
 * 存在选区、或光标左侧无法构成完整字段时返回 false，交由编辑器默认的按词删除处理。
 * @param view 编辑器视图
 * @returns 是否已处理本次快捷键
 */
export function deleteExpressionField(view: FieldDeleteView): boolean {
    const range = view.state.selection.main
    if (!range.empty) return false
    const found = findFieldDeleteRange(view.state.doc.toString(), range.head)
    if (!found) return false
    view.dispatch({
        changes: { from: found.start, to: found.end, insert: "" },
        selection: { anchor: found.start },
        userEvent: "delete.field",
    })
    return true
}

/** 真实 EditorView 满足本命令的最小接口 */
export type FieldDeleteCommand = (view: EditorView) => boolean
const fieldDeleteCommand: FieldDeleteCommand = deleteExpressionField
export default fieldDeleteCommand
