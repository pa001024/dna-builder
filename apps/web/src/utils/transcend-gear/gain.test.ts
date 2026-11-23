import { describe, expect, it } from "vitest"
import { createDefaultTranscendBuildSettings, type TranscendGearItemConfig } from "@/data"
import { createRelativeGainCache, formatRelativeGain, GAIN_PLACEHOLDER, gearItemKey, relativeGain, withoutItem } from "./gain"

const gear = (slotId: number, affixId = 1001) => ({
    slotId,
    item: {
        kind: "normal" as const,
        slotType: 1,
        affixes: [{ affixId, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
    },
})

describe("相对收益口径", () => {
    it("正收益 / 负收益 / 零变化", () => {
        expect(relativeGain(1032, 1000)).toBeCloseTo(0.032, 10)
        expect(relativeGain(985, 1000)).toBeCloseTo(-0.015, 10)
        expect(relativeGain(1000, 1000)).toBe(0)
    })

    it("缺数据 / 非有限值 / 基准为 0 时返回 null，不当作 0%", () => {
        expect(relativeGain(undefined, 1000)).toBeNull()
        expect(relativeGain(1000, undefined)).toBeNull()
        expect(relativeGain(null, 1000)).toBeNull()
        expect(relativeGain(Number.NaN, 1000)).toBeNull()
        expect(relativeGain(Number.POSITIVE_INFINITY, 1000)).toBeNull()
        expect(relativeGain(1000, 0)).toBeNull()
    })

    it("独立于绝对值大小：同一比例在不同 DPS 量级下一致", () => {
        expect(relativeGain(10.32, 10)).toBeCloseTo(0.032, 10)
        expect(relativeGain(10_320_000, 10_000_000)).toBeCloseTo(0.032, 10)
    })
})

describe("收益文本", () => {
    it("带符号百分比，零变化不加符号", () => {
        expect(formatRelativeGain(0.032)).toBe("+3.2%")
        expect(formatRelativeGain(-0.015)).toBe("-1.5%")
        expect(formatRelativeGain(0)).toBe("0.0%")
        expect(formatRelativeGain(0.0004)).toBe("0.0%")
        expect(formatRelativeGain(-0.0004)).toBe("0.0%")
    })

    it("不可计算显示占位而不是 0%", () => {
        expect(formatRelativeGain(null)).toBe(GAIN_PLACEHOLDER)
        expect(formatRelativeGain(undefined)).toBe(GAIN_PLACEHOLDER)
        expect(formatRelativeGain(Number.NaN)).toBe(GAIN_PLACEHOLDER)
    })
})

describe("空槽基准设置", () => {
    const settings = createDefaultTranscendBuildSettings(1101)
    settings.transcend.mainGear = [gear(1), gear(2)]
    settings.transcend.assist1Gear = [gear(9, 1002)]
    settings.transcend.assist2Gear = [gear(9, 1003)]

    it("移除同组同槽条目，其余槽位与设置原样保留", () => {
        const next = withoutItem(settings, "main", 1)
        expect(next.transcend.mainGear.map(entry => entry.slotId)).toEqual([2])
        expect(next.transcend.assist1Gear).toBe(settings.transcend.assist1Gear)
        expect(next.transcend).not.toBe(settings.transcend)
    })

    it("不改入参", () => {
        const before = JSON.parse(JSON.stringify(settings))
        withoutItem(settings, "main", 1)
        expect(JSON.parse(JSON.stringify(settings))).toEqual(before)
    })

    it("协战一人一套：各构筑位只移除自己那份装备", () => {
        expect(withoutItem(settings, "assist1", 9).transcend.assist1Gear).toEqual([])
        expect(withoutItem(settings, "assist1", 9).transcend.assist2Gear).toBe(settings.transcend.assist2Gear)
        expect(withoutItem(settings, "assist2", 9).transcend.assist2Gear).toEqual([])
        expect(withoutItem(settings, "assist2", 9).transcend.assist1Gear).toBe(settings.transcend.assist1Gear)
    })
})

describe("收益缓存", () => {
    it("命中 / 未命中 / 容量上限淘汰最旧条目", () => {
        const cache = createRelativeGainCache(2)
        expect(cache.get("a")).toBeUndefined()
        cache.set("a", 0.1)
        cache.set("b", null)
        expect(cache.get("a")).toBe(0.1)
        expect(cache.get("b")).toBeNull()
        cache.set("c", -0.2)
        expect(cache.size).toBe(2)
        expect(cache.get("a")).toBeUndefined()
        expect(cache.get("c")).toBe(-0.2)
    })
})

describe("物品缓存键", () => {
    const base: TranscendGearItemConfig = {
        kind: "normal",
        slotType: 1,
        affixes: [{ affixId: 1001, rollLevel: 1, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
        rarityId: 5,
        equipBaseScore: 50,
        socketCount: 1,
    }

    it("强度变化会改变缓存键（伤害口径不同）", () => {
        expect(gearItemKey({ ...base, equipBaseScore: 40 })).not.toBe(gearItemKey(base))
    })

    it("同一物品稳定", () => {
        expect(gearItemKey({ ...base })).toBe(gearItemKey(base))
    })
})
