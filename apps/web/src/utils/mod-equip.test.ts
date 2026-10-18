import { describe, expect, it } from "vitest"
import type { Mod } from "@/data/data-types"
import { isModAllowedInSlot, type ModLimitContext } from "@/utils/mod-equip"

/** 构造一份近战切割 / 远程贯穿的校验上下文，便于复现换武器前后的差异 */
function createCtx(overrides: Partial<ModLimitContext> = {}): ModLimitContext {
    return {
        charId: 1504,
        charName: "莉兹贝尔",
        charElement: "暗",
        melee: { 类别: "太刀", 伤害类型: "切割" },
        ranged: { 类别: "手枪", 伤害类型: "贯穿" },
        skill: null,
        ...overrides,
    }
}

/** 构造一条只关心限定字段的 MOD */
function createMod(limit: string | number | undefined): Mod {
    return { id: 999999, 名称: "测试楔", 系列: "测试", 品质: "绿", 耐受: 1, 类型: "近战", 限定: limit }
}

describe("isModAllowedInSlot", () => {
    it("未设置限定的 MOD 在任何槽位都可用", () => {
        const ctx = createCtx()
        for (const slot of ["角色", "近战", "远程", "同律"] as const) {
            if (slot === "同律" && !ctx.skill) continue
            expect(isModAllowedInSlot(createMod(undefined), slot, ctx)).toBe(true)
        }
    })

    it("武器限定命中伤害类型时可用，未命中时不可用", () => {
        const ctx = createCtx()
        expect(isModAllowedInSlot(createMod("切割"), "近战", ctx)).toBe(true)
        expect(isModAllowedInSlot(createMod("贯穿"), "近战", ctx)).toBe(false)
        expect(isModAllowedInSlot(createMod("震荡"), "近战", ctx)).toBe(false)
    })

    it("武器限定命中武器类别时同样可用", () => {
        const ctx = createCtx()
        expect(isModAllowedInSlot(createMod("太刀"), "近战", ctx)).toBe(true)
        expect(isModAllowedInSlot(createMod("长柄"), "近战", ctx)).toBe(false)
    })

    it("武器限定按各自槽位判定，不会跨槽位误判", () => {
        const ctx = createCtx()
        // 贯穿限定在远程（手枪/贯穿）可用，在近战（太刀/切割）不可用
        expect(isModAllowedInSlot(createMod("贯穿"), "远程", ctx)).toBe(true)
        expect(isModAllowedInSlot(createMod("贯穿"), "近战", ctx)).toBe(false)
    })

    it("角色限定按 id / 角色名 / 角色属性匹配", () => {
        const ctx = createCtx()
        expect(isModAllowedInSlot(createMod(1504), "角色", ctx)).toBe(true)
        expect(isModAllowedInSlot(createMod(9999), "角色", ctx)).toBe(false)
        expect(isModAllowedInSlot(createMod("莉兹贝尔"), "角色", ctx)).toBe(true)
        expect(isModAllowedInSlot(createMod("暗"), "角色", ctx)).toBe(true)
        // 角色限定放到武器槽不成立
        expect(isModAllowedInSlot(createMod("暗"), "近战", ctx)).toBe(false)
        expect(isModAllowedInSlot(createMod(1504), "近战", ctx)).toBe(false)
    })

    it("武器槽未装备武器时不承载任何 MOD（含无限定 MOD）", () => {
        const ctx = createCtx({ melee: null })
        expect(isModAllowedInSlot(createMod(undefined), "近战", ctx)).toBe(false)
        expect(isModAllowedInSlot(createMod("切割"), "近战", ctx)).toBe(false)
    })

    it("同律槽按同律武器判定，未装备同律武器时不可用", () => {
        expect(isModAllowedInSlot(createMod("切割"), "同律", createCtx({ skill: { 类别: "同律太刀", 伤害类型: "切割" } }))).toBe(true)
        expect(isModAllowedInSlot(createMod("切割"), "同律", createCtx({ skill: null }))).toBe(false)
    })

    it("换武器后同一 MOD 的判定结果随之翻转（锋锐·缠缚场景）", () => {
        const mod = createMod("切割")
        // 近战切割武器：可用
        expect(isModAllowedInSlot(mod, "近战", createCtx({ melee: { 类别: "太刀", 伤害类型: "切割" } }))).toBe(true)
        // 换成贯穿武器后：不可用，应被剔除
        expect(isModAllowedInSlot(mod, "近战", createCtx({ melee: { 类别: "重剑", 伤害类型: "贯穿" } }))).toBe(false)
    })
})
