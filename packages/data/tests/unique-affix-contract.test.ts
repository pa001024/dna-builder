import { describe, expect, it } from "vitest"
import { affixes } from "../d/dnaseasonequip.data"
import { TRANSCEND_BUFFS, UNIQUE_AFFIX_MAP } from "../transcendBuffs"

/** 手写 BUFF 名 → 可承载的属性键集合 */
const BUFF_ATTR_KEYS = new Map(TRANSCEND_BUFFS.map(buff => [buff.名称, new Set(Object.keys(buff.attr ?? {}))]))
/** 词条 id → `addAttrs` 属性键集合（生命回复宝石等属性映射词条的合法展示来源） */
const AFFIX_ADD_ATTR_KEYS = new Map(affixes.map(affix => [affix.id, new Set((affix.addAttrs ?? []).map(item => item.attr))]))

/**
 * 批次 E（U129）范围的存量缺口：note 已自认未建模 / 上界但尚未登记 excluded。
 * 只允许这里列出的条目，新增缺口必须同时补 `excluded` 或在评审时显式加入本集合。
 */
const PENDING_BATCH_E = new Set<number>()

describe("U127 UNIQUE_AFFIX_MAP 机械不变量", () => {
    it("values 展示行必须可归属：labelKey / 被引用 BUFF 的同名 attr / 词条 addAttrs", () => {
        for (const [rawId, mapping] of Object.entries(UNIQUE_AFFIX_MAP)) {
            const affixId = Number(rawId)
            for (const value of mapping.values ?? []) {
                const attributable =
                    !!value.labelKey ||
                    mapping.buffs.some(name => BUFF_ATTR_KEYS.get(name)?.has(value.name)) ||
                    !!AFFIX_ADD_ATTR_KEYS.get(affixId)?.has(value.name)
                expect(attributable, `${affixId}:${value.name} 既无 labelKey，也不在被引用 BUFF 的 attr / 词条 addAttrs 中`).toBe(true)
            }
        }
    })

    it("320301 三模式倍率是展示-only：每行必须带 labelKey", () => {
        const values = UNIQUE_AFFIX_MAP[320301].values ?? []
        expect(values).toHaveLength(3)
        for (const value of values) expect(value.labelKey, value.name).toBeTruthy()
    })

    /**
     * 有意比「partial 且未登记 excluded」更严格：只要 note 自认未建模 / 上界 / 放大 / 高估，
     * 不论 partial 是否已标，都必须登记 excluded（150401 正是 note 自认未建模但曾无 partial / excluded 的漏检样本）。
     * 不要按字面改回「未判 partial 就跳过」，否则同类缺口会重新漏出。
     */
    it("note 自认未建模 / 上界 / 放大 / 高估的词条必须登记 excluded（批次 E 存量除外）", () => {
        const keyword = /未建模|上界|放大|高估/
        const pending: number[] = []
        for (const [rawId, mapping] of Object.entries(UNIQUE_AFFIX_MAP)) {
            const affixId = Number(rawId)
            if (!keyword.test(mapping.note ?? "")) continue
            if ((mapping.excluded ?? []).length > 0) continue
            pending.push(affixId)
        }
        // 允许集合按现状精确登记：任何新增缺口都会让本断言失败
        expect(pending.sort((left, right) => left - right)).toEqual([...PENDING_BATCH_E])
    })
})
