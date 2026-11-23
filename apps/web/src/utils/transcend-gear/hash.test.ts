import { describe, expect, it } from "vitest"
import type { TranscendGearAffixRoll, TranscendGearItemConfig } from "@/data"
import { canonicalGearString, hashGearItem, isSameGearItem, TRANSCEND_GEAR_HASH_PREFIX } from "./hash"

const roll = (affixId: number, patch: Partial<TranscendGearAffixRoll> = {}): TranscendGearAffixRoll => ({
    affixId,
    rollLevel: 1,
    masterworkLevel: 0,
    ancient: false,
    finalMasterwork: false,
    ...patch,
})

const item = (patch: Partial<TranscendGearItemConfig> = {}): TranscendGearItemConfig => ({
    kind: "normal",
    slotType: 7,
    affixes: [roll(101, { rollLevel: 3 }), roll(102)],
    ...patch,
})

describe("装备 hash", () => {
    it("稳定输出 16 位 hex，前缀为 tg3", () => {
        const value = hashGearItem(item())
        expect(value).toMatch(/^[0-9a-f]{16}$/)
        expect(hashGearItem(item())).toBe(value)
        expect(canonicalGearString(item()).startsWith(`${TRANSCEND_GEAR_HASH_PREFIX}#`)).toBe(true)
    })

    it("词条顺序无关", () => {
        const reordered = item({ affixes: [roll(102), roll(101, { rollLevel: 3 })] })
        expect(hashGearItem(reordered)).toBe(hashGearItem(item()))
    })

    it("戒指位 7 / 8 同一物品 hash 相同（装备位不参与 hash）", () => {
        const ring7 = { slotId: 7, item: item() }
        const ring8 = { slotId: 8, item: item() }
        expect(hashGearItem(ring7.item)).toBe(hashGearItem(ring8.item))
    })

    it("同 affixId 不同 uniqueId 的暗金 hash 不同", () => {
        const unique = (uniqueId: number) => item({ slotType: 1, kind: "unique", uniqueId, uniqueAffix: roll(2001), affixes: [] })
        expect(hashGearItem(unique(1001))).not.toBe(hashGearItem(unique(1002)))
    })

    it("展示快照变化不影响 hash", () => {
        expect(hashGearItem(item({ nameSnapshot: "甲", iconSnapshot: "a" }))).toBe(hashGearItem(item()))
    })

    it("带宝石与不带宝石不同；同一宝石不同孔位不同（双孔用头盔槽）", () => {
        const helmet = { slotType: 1, affixes: [roll(101)] }
        const plain = hashGearItem(item(helmet))
        const gemmed = hashGearItem(item({ ...helmet, sockets: [{ socketIndex: 0, gemId: 7001101 }] }))
        const otherSocket = hashGearItem(item({ ...helmet, sockets: [{ socketIndex: 1, gemId: 7001101 }] }))
        expect(gemmed).not.toBe(plain)
        expect(otherSocket).not.toBe(gemmed)
    })

    it("词条 roll / 精锻 / 太古 / 最终精锻参与 hash", () => {
        const base = hashGearItem(item())
        expect(hashGearItem(item({ affixes: [roll(101, { rollLevel: 4 }), roll(102)] }))).not.toBe(base)
        expect(hashGearItem(item({ affixes: [roll(101, { rollLevel: 3, masterworkLevel: 1 }), roll(102)] }))).not.toBe(base)
        expect(hashGearItem(item({ affixes: [roll(101, { rollLevel: 3, ancient: true }), roll(102)] }))).not.toBe(base)
        expect(hashGearItem(item({ affixes: [roll(101, { rollLevel: 3, finalMasterwork: true }), roll(102)] }))).not.toBe(base)
    })

    it("库存身份：hash 相同但品质 / 强度 / 基础名 / 赛季不同视为不同物品", () => {
        const base = item({ rarityId: 5, equipBaseScore: 50, iconId: 1001, seasonId: 1 })
        expect(isSameGearItem(base, { ...base })).toBe(true)
        expect(hashGearItem(base)).toBe(hashGearItem({ ...base, iconId: 1002 }))
        expect(isSameGearItem(base, { ...base, iconId: 1002 })).toBe(false)
        expect(isSameGearItem(base, { ...base, rarityId: 4 })).toBe(false)
        expect(isSameGearItem(base, { ...base, equipBaseScore: 49 })).toBe(false)
        expect(isSameGearItem(base, { ...base, seasonId: 2 })).toBe(false)
    })

    it("库存身份：已开孔数双方都有值时比较，缺省视为通配，且不参与 hash", () => {
        const base = item({ slotType: 1, affixes: [roll(101)], socketCount: 1 })
        expect(hashGearItem(base)).toBe(hashGearItem(item({ slotType: 1, affixes: [roll(101)] })))
        expect(isSameGearItem(base, { ...base })).toBe(true)
        expect(isSameGearItem(base, { ...base, socketCount: 2 })).toBe(false)
        expect(isSameGearItem(base, item({ slotType: 1, affixes: [roll(101)] }))).toBe(true)
    })

    it("库存身份：旧物品缺失元数据时视为通配，不误伤已有库存", () => {
        const base = item({ rarityId: 5, equipBaseScore: 50, iconId: 1001, seasonId: 1 })
        const legacy = item()
        expect(hashGearItem(base)).toBe(hashGearItem(legacy))
        expect(isSameGearItem(base, legacy)).toBe(true)
        expect(isSameGearItem(legacy, base)).toBe(true)
    })

    it("装备级 craft 状态参与 hash：精锻 / 最终目标 / 淬炼 / 附魔 / 次数", () => {
        const plain = item()
        const craft = (patch: Partial<NonNullable<TranscendGearItemConfig["craft"]>>) =>
            ({
                item: item({ craft: { masterworkLevel: 0, temperingCount: 0, enchantCount: 0, ...patch } }),
            }).item
        const base = hashGearItem(plain)
        expect(hashGearItem(craft({ masterworkLevel: 1 }))).not.toBe(base)
        expect(hashGearItem(craft({ finalMasterworkAffixIndex: 0 }))).not.toBe(base)
        expect(hashGearItem(craft({ temperingAffixIndex: 0 }))).not.toBe(base)
        expect(hashGearItem(craft({ enchantAffixIndex: 0 }))).not.toBe(base)
        expect(hashGearItem(craft({ temperingCount: 2 }))).not.toBe(base)
        expect(hashGearItem(craft({ enchantCount: 2 }))).not.toBe(base)
    })

    it("craft 下标按词条 id 计入：词条顺序变化但目标相同则 hash 相同", () => {
        const affixes = [roll(101), roll(102), roll(103)]
        const left = item({
            affixes,
            craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 1, temperingAffixIndex: 2, temperingCount: 1, enchantCount: 0 },
        })
        const right = item({
            affixes: [...affixes].reverse(),
            craft: { masterworkLevel: 10, finalMasterworkAffixIndex: 1, temperingAffixIndex: 0, temperingCount: 1, enchantCount: 0 },
        })
        expect(hashGearItem(left)).toBe(hashGearItem(right))
    })
})
