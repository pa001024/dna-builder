import { describe, expect, it } from "vitest"
import { findFieldDeleteRange, joinExprText, resolveCharFieldExpression, resolveSkillFieldNamespace } from "./expr-field"

/**
 * 按 findFieldDeleteRange 的返回区间执行一次删除，便于用「删除后的表达式」断言行为。
 * @param expression 表达式文本
 * @param caret 光标位置
 * @returns 删除后的表达式；未命中整字段删除时返回 null
 */
function deleteAt(expression: string, caret: number): string | null {
    const range = findFieldDeleteRange(expression, caret)
    if (!range) return null
    return expression.slice(0, range.start) + expression.slice(range.end)
}

describe("joinExprText", () => {
    it("空表达式直接写入字段", () => {
        expect(joinExprText("", "角色::攻击!")).toBe("角色::攻击!")
    })

    it("已有完整操作数时自动补加号", () => {
        expect(joinExprText("攻击", "角色::防御!")).toBe("攻击 + 角色::防御!")
        expect(joinExprText("攻击 + 防御", "角色::攻击!")).toBe("攻击 + 防御 + 角色::攻击!")
    })

    it("紧跟运算符/左括号/逗号之后不补加号", () => {
        expect(joinExprText("攻击 *", "角色::防御!")).toBe("攻击 * 角色::防御!")
        expect(joinExprText("max(", "角色::攻击!")).toBe("max(角色::攻击!")
        expect(joinExprText("max(攻击, ", "角色::防御!")).toBe("max(攻击, 角色::防御!")
        expect(joinExprText("{增伤:", "1")).toBe("{增伤:1")
    })

    it("强制属性后缀 ! 之后仍需补加号", () => {
        expect(joinExprText("角色::攻击!", "角色::防御!")).toBe("角色::攻击! + 角色::防御!")
    })

    it("按光标位置插入并在两侧补齐连接符", () => {
        expect(joinExprText("攻击 + 防御", "角色::攻击!", 2)).toBe("攻击 + 角色::攻击! + 防御")
    })

    it("插入点右侧紧邻右括号时不补加号", () => {
        expect(joinExprText("(攻击 + 防御)", "角色::攻击!", 8)).toBe("(攻击 + 防御 + 角色::攻击!)")
        expect(joinExprText("(攻击)", "角色::攻击!", 3)).toBe("(攻击 + 角色::攻击!)")
    })
})

describe("resolveCharFieldExpression", () => {
    it("角色属性补 角色:: 并强制按属性解析", () => {
        expect(resolveCharFieldExpression(null, "攻击")).toBe("角色::攻击!")
    })

    it("字段名中的斜杠替换为下划线", () => {
        expect(resolveCharFieldExpression(null, "技能/伤害")).toBe("角色::技能_伤害!")
    })

    it("已带命名空间的字段原样返回", () => {
        expect(resolveCharFieldExpression(null, "近战::攻击!")).toBe("近战::攻击!")
    })

    it("当前选中技能的字段补技能命名空间", () => {
        const charBuild = {
            selectedSkill: { 名称: "技能一", safeName: "skill1", 字段: [{ 名称: "伤害", safeName: "dmg" }] },
            skills: [{ 名称: "技能一", safeName: "skill1" }],
        } as never
        expect(resolveSkillFieldNamespace(charBuild, "伤害")).toBe("e")
        expect(resolveCharFieldExpression(charBuild, "伤害")).toBe("e::伤害")
    })

    it("非当前选中技能的字段回退为角色属性", () => {
        const charBuild = {
            selectedSkill: { 名称: "技能一", safeName: "skill1", 字段: [{ 名称: "伤害", safeName: "dmg" }] },
            skills: [{ 名称: "技能一", safeName: "skill1" }],
        } as never
        expect(resolveCharFieldExpression(charBuild, "防御")).toBe("角色::防御!")
    })
})

describe("findFieldDeleteRange", () => {
    it("一次删除命名空间 + 字段 + ! 后缀", () => {
        expect(deleteAt("近战::攻击!", 7)).toBe("")
        expect(deleteAt("角色::攻击!", 7)).toBe("")
    })

    it("只删除光标左侧的字段，右侧内容保持原样", () => {
        expect(deleteAt("近战::攻击! + 防御", 7)).toBe(" + 防御")
        expect(deleteAt("攻击 + 远程::暴击!", 12)).toBe("攻击 + ")
    })

    it("字段中间的光标按整段删除（不拆开 :: 与 !）", () => {
        expect(deleteAt("近战::攻击!", 4)).toBe("")
        expect(deleteAt("近战::攻击!", 6)).toBe("")
    })

    it("成员访问与临时属性链并入同一个字段", () => {
        expect(deleteAt("[攻击]{增伤:0.1}.暴击", 16)).toBe("")
        expect(deleteAt("近战::攻击!.暴击", 9)).toBe("")
        expect(deleteAt("攻击{增伤:0.1}", 10)).toBe("")
        expect(deleteAt("攻击.暴击", 5)).toBe("")
    })

    it("删除后保留运算符等其它片段之间的原有文本", () => {
        expect(deleteAt("攻击 + 近战::攻击! * 2", 12)).toBe("攻击 +  * 2")
    })

    it("光标前的空白不计入删除区间", () => {
        expect(deleteAt("近战::攻击!  ", 9)).toBe("  ")
    })

    it("光标左侧不是完整字段时回退到默认删除", () => {
        expect(findFieldDeleteRange("", 0)).toBeUndefined()
        expect(findFieldDeleteRange("攻击 + 防御", 0)).toBeUndefined()
        expect(findFieldDeleteRange("攻击 + ", 5)).toBeUndefined()
        expect(findFieldDeleteRange("攻击 +", 4)).toBeUndefined()
        expect(findFieldDeleteRange("近战::攻击! +", 9)).toBeUndefined()
        expect(findFieldDeleteRange("攻击.", 3)).toBeUndefined()
        expect(findFieldDeleteRange("近战::攻击! @", 9)).toBeUndefined()
    })

    it("括号分组结尾时不整段删除", () => {
        expect(findFieldDeleteRange("(攻击+防御)", 7)).toBeUndefined()
        expect(findFieldDeleteRange("max(攻击, 防御)", 11)).toBeUndefined()
    })

    it("独立的临时属性块整体删除", () => {
        expect(deleteAt("{增伤:1}", 7)).toBe("")
    })

    it("整段删除括号分组及其成员访问后缀", () => {
        expect(deleteAt("(攻击+防御).暴击", 11)).toBe("")
    })

    it("光标位于字段起始处时回退到默认删除", () => {
        expect(deleteAt("近战::攻击!", 0)).toBeNull()
        expect(deleteAt("攻击+防御", 3)).toBeNull()
    })
})
