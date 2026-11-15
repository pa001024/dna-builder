import { describe, expect, it } from "vitest"
import { pickTintRow, suitCode } from "./tint-row"

/** 模拟 DT_ShopskinTint：行名是网格名，值用行名本身代替内容便于断言。 */
const table: Record<string, string> = {
    Zhiliu_SP01_Body_SM: "Zhiliu_SP01_Body_SM",
    QNF01_SP01_Body_SM: "QNF01_SP01_Body_SM",
    QNF_SP10_Body_SM: "QNF_SP10_Body_SM",
    QNF01_SP11_Body_SM: "QNF01_SP11_Body_SM",
    QNF_SP14_Body_SM: "QNF_SP14_Body_SM",
    QNF00_TP01_SM: "QNF00_TP01_SM",
    ZNF00_TP01_SM: "ZNF00_TP01_SM",
}

describe("default dye row matching", () => {
    it("extracts the suit code from either naming style", () => {
        expect(suitCode("QNF01_SP14_BodyUP")).toBe("SP14")
        expect(suitCode("QNF_SP10_Body_SM")).toBe("SP10")
        expect(suitCode("QNF00_TP01_SM")).toBe("TP01")
        expect(suitCode("Heitao_Hair_SM")).toBeUndefined()
    })

    it("matches an exact row name first", () => {
        expect(pickTintRow(table, "QNF00_TP01_SM")).toBe("QNF00_TP01_SM")
    })

    it("matches by suit code instead of the first name segment", () => {
        // 关键回归：QNF01_SP14 不能命中 QNF01_SP01（早先只比首段，整只皮肤配色错乱）
        expect(pickTintRow(table, "MI_QNF01_SP14_BodyUP")).toBe("QNF_SP14_Body_SM")
        expect(pickTintRow(table, "QNF01_SP10_BodyUP")).toBe("QNF_SP10_Body_SM")
        expect(pickTintRow(table, "QNF01_SP11_BodyDN")).toBe("QNF01_SP11_Body_SM")
    })

    it("prefers the same body type when a suit code has several rows", () => {
        expect(pickTintRow(table, "QNF01_SP01_BodyDN")).toBe("QNF01_SP01_Body_SM")
    })

    it("disambiguates transfer suits by body type", () => {
        expect(pickTintRow(table, "QNF00_TP01_BodyUP")).toBe("QNF00_TP01_SM")
        expect(pickTintRow(table, "ZNF00_TP01_BodyUP")).toBe("ZNF00_TP01_SM")
    })

    it("returns undefined rather than an arbitrary row", () => {
        // 匹配不到时必须留空，不能拿表里第一行顶替（那会套用别人配色）
        expect(pickTintRow(table, "Lilikou_SP01_Hair")).toBeUndefined()
        expect(pickTintRow(table, "Heitao_Hair_SM")).toBeUndefined()
        expect(pickTintRow(table, "MI_SomethingElse")).toBeUndefined()
    })
})
