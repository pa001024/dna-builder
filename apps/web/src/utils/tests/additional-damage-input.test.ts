import { describe, expect, it } from "vitest"
import { ADDITIONAL_DAMAGE_KEYS, LEGACY_ADDITIONAL_DAMAGE_KEY, SELF_ADDITIONAL_DAMAGE_KEY } from "@/data/leveled/additionalDamage"
import { NodeType } from "@/store/nodeEditorTypes"
import { additionalDamageZone, createAdditionalDamageComponents, resolveAdditionalDamageComponents } from "@/utils/additionalDamageZone"
import { AST_ATTRIBUTE_GROUP_ITEMS, AST_READONLY_ATTRIBUTES } from "@/utils/astAttributeItems"
import { CUSTOM_BUFF_PROPERTIES } from "@/utils/customBuffProperties"
import { getNodePorts, PortType, resolvePort, WEAPON_ATTR_OUTPUT_KEYS } from "@/utils/nodeEditorPorts"

/**
 * U72 / U101c / U112：追伤聚合「追加伤害」只读，输入面为七分量；
 * 武器池按 Σ 七分量整体乘算，技能池只吃 `技能追伤`。
 */
describe("追伤七分量输入面（U72 / U101c）", () => {
    it("七分量键由 ADDITIONAL_DAMAGE_KEYS 统一提供", () => {
        expect(ADDITIONAL_DAMAGE_KEYS).toEqual([
            "火属性追伤",
            "水属性追伤",
            "雷属性追伤",
            "风属性追伤",
            "光属性追伤",
            "暗属性追伤",
            "自属性追伤",
        ])
        expect(Object.keys(createAdditionalDamageComponents())).toEqual([...ADDITIONAL_DAMAGE_KEYS])
    })

    it("自定义 BUFF 可写属性不含聚合「追加伤害」，七分量齐全", () => {
        expect(CUSTOM_BUFF_PROPERTIES).not.toContain(LEGACY_ADDITIONAL_DAMAGE_KEY)
        // U101c：异常数量已从引擎与可写清单删除
        expect(CUSTOM_BUFF_PROPERTIES).not.toContain("异常数量")
        for (const key of ADDITIONAL_DAMAGE_KEYS) expect(CUSTOM_BUFF_PROPERTIES).toContain(key)
    })

    it("AST 属性帮助：七分量与聚合均不在可写分组，只读区可供表达式引用", () => {
        const writable = AST_ATTRIBUTE_GROUP_ITEMS.flatMap(group => [...group.items])

        expect(writable).not.toContain(LEGACY_ADDITIONAL_DAMAGE_KEY)
        for (const key of ADDITIONAL_DAMAGE_KEYS) expect(writable).not.toContain(key)
        for (const key of ADDITIONAL_DAMAGE_KEYS) expect(AST_READONLY_ATTRIBUTES.map(item => item.name)).toContain(key)
        expect(AST_READONLY_ATTRIBUTES.map(item => item.name)).toContain(LEGACY_ADDITIONAL_DAMAGE_KEY)
        expect(AST_READONLY_ATTRIBUTES[0].note).toContain("Σ")
    })

    it("武器属性节点逐项输出七分量，并保留只读聚合端口供旧图解析", () => {
        for (const key of ADDITIONAL_DAMAGE_KEYS) expect(WEAPON_ATTR_OUTPUT_KEYS).toContain(key)
        expect(WEAPON_ATTR_OUTPUT_KEYS).toContain(LEGACY_ADDITIONAL_DAMAGE_KEY)

        const port = resolvePort(NodeType.WEAPON_ATTR_CALC, LEGACY_ADDITIONAL_DAMAGE_KEY, "output")

        expect(port).toMatchObject({ id: LEGACY_ADDITIONAL_DAMAGE_KEY, type: PortType.NUMBER })
        expect(port?.label).toContain("Σ")
        expect(getNodePorts(NodeType.WEAPON_ATTR_CALC).outputs.map(item => item.id)).toContain(LEGACY_ADDITIONAL_DAMAGE_KEY)
        // 只读端口不等于可写输入：调色板仍不得出现聚合
        expect(CUSTOM_BUFF_PROPERTIES).not.toContain(LEGACY_ADDITIONAL_DAMAGE_KEY)
    })

    it("解析七分量：非匹配元素不再被丢弃，乘区 = 1 + Σ 七分量", () => {
        const panel = { 火属性追伤: 0.2, 光属性追伤: 0.5, [SELF_ADDITIONAL_DAMAGE_KEY]: 0.35, [LEGACY_ADDITIONAL_DAMAGE_KEY]: 1.05 }
        const components = resolveAdditionalDamageComponents(panel)

        expect(components).toEqual({
            火属性追伤: 0.2,
            水属性追伤: 0,
            雷属性追伤: 0,
            风属性追伤: 0,
            光属性追伤: 0.5,
            暗属性追伤: 0,
            自属性追伤: 0.35,
        })
        // 1 + 0.2 + 0.5 + 0.35；聚合「追加伤害」(1.05) 不进乘区
        expect(additionalDamageZone(components)).toBeCloseTo(2.05, 10)
    })

    it("负值分量参与求和（引擎按 Σ 七分量整体乘算）", () => {
        expect(additionalDamageZone({ 火属性追伤: -0.5, 光属性追伤: 0.2 })).toBeCloseTo(0.7, 10)
        expect(additionalDamageZone({ 自属性追伤: -0.25 })).toBeCloseTo(0.75, 10)
    })

    it("缺失面板与非有限值按 0 处理", () => {
        const zeros = createAdditionalDamageComponents()

        expect(resolveAdditionalDamageComponents(undefined)).toEqual(zeros)
        expect(
            resolveAdditionalDamageComponents({ 火属性追伤: Number.NaN, [SELF_ADDITIONAL_DAMAGE_KEY]: Number.POSITIVE_INFINITY })
        ).toEqual(zeros)
        expect(additionalDamageZone({})).toBe(1)
        expect(additionalDamageZone({ 火属性追伤: Number.NaN, 自属性追伤: 0.35 })).toBeCloseTo(1.35, 10)
        expect(additionalDamageZone({ 火属性追伤: 0.5, 自属性追伤: Number.POSITIVE_INFINITY })).toBeCloseTo(1.5, 10)
        expect(additionalDamageZone({ 火属性追伤: Number.NaN, 自属性追伤: Number.NEGATIVE_INFINITY })).toBe(1)
    })
})
