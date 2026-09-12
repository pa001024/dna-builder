import { describe, expect, it } from "vitest"
import { joinExprText, resolveCharFieldExpression, resolveSkillFieldNamespace } from "./expr-field"

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
