import { describe, expect, it } from "vitest"
import { deleteExpressionField, type FieldDeleteView } from "./expr-field-delete"

/**
 * 构造一个只包含命令所需状态的最小编辑器视图替身。
 * @param doc 编辑器文档文本
 * @param head 光标位置
 * @param options.empty 光标是否为空选区（false 表示存在选区）
 * @returns 视图替身与 dispatch 收到的变更
 */
function createView(doc: string, head: number, options: { empty?: boolean } = {}) {
    const dispatched: unknown[] = []
    const view: FieldDeleteView = {
        state: {
            selection: { main: { empty: options.empty ?? true, head } },
            doc: { toString: () => doc },
        },
        dispatch: ((tr: unknown) => {
            dispatched.push(tr)
        }) as FieldDeleteView["dispatch"],
    }
    return { view, dispatched }
}

describe("deleteExpressionField", () => {
    it("光标停在字段末尾时整段删除该字段", () => {
        const { view, dispatched } = createView("近战::攻击!", 7)
        expect(deleteExpressionField(view)).toBe(true)
        expect(dispatched).toEqual([
            {
                changes: { from: 0, to: 7, insert: "" },
                selection: { anchor: 0 },
                userEvent: "delete.field",
            },
        ])
    })

    it("光标停在字段中间时也整段删除", () => {
        const { view, dispatched } = createView("攻击 + 近战::攻击!", 12)
        expect(deleteExpressionField(view)).toBe(true)
        expect(dispatched).toEqual([
            {
                changes: { from: 5, to: 12, insert: "" },
                selection: { anchor: 5 },
                userEvent: "delete.field",
            },
        ])
    })

    it("无法构成完整字段时返回 false，交由默认按词删除", () => {
        const { view, dispatched } = createView("攻击 +", 4)
        expect(deleteExpressionField(view)).toBe(false)
        expect(dispatched).toHaveLength(0)
    })

    it("存在选区时不接管退格", () => {
        const { view, dispatched } = createView("近战::攻击!", 7, { empty: false })
        expect(deleteExpressionField(view)).toBe(false)
        expect(dispatched).toHaveLength(0)
    })
})
