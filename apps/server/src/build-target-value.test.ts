import { describe, expect, test } from "bun:test"
import {
    clearBuildTargetValueCache,
    computeBuildTargetValue,
    getBuildTargetValue,
    getBuildTargetValueCacheSize,
    getBuildTargetValues,
    invalidateBuildTargetValue,
} from "./build-target-value"
import { SAMPLE_BUILD_CHAR_ID, SAMPLE_BUILD_SETTINGS } from "./build-target-value.fixture"

const sampleCharId = SAMPLE_BUILD_CHAR_ID
const validSettings = SAMPLE_BUILD_SETTINGS

describe("computeBuildTargetValue", () => {
    test("真实构筑配置返回有限且为正的数值", () => {
        const value = computeBuildTargetValue(sampleCharId, validSettings)
        expect(value).not.toBeNull()
        expect(Number.isFinite(value as number)).toBe(true)
        expect(value as number).toBeGreaterThan(0)
    })

    test("配置不是合法 JSON 时返回 null", () => {
        expect(computeBuildTargetValue(sampleCharId, "{ not json")).toBeNull()
    })

    test("角色 id 不存在时返回 null", () => {
        expect(computeBuildTargetValue(-1, validSettings)).toBeNull()
    })
})

describe("getBuildTargetValue 缓存", () => {
    test("同一 id 重复读取只计算一次并命中缓存", async () => {
        clearBuildTargetValueCache()
        const first = await getBuildTargetValue("t1", sampleCharId, validSettings)
        expect(getBuildTargetValueCacheSize()).toBe(1)

        const second = await getBuildTargetValue("t1", sampleCharId, validSettings)
        expect(second).toBe(first)
        expect(getBuildTargetValueCacheSize()).toBe(1)
    })

    test("并发读取同一 id 共享同一次计算", async () => {
        clearBuildTargetValueCache()
        const results = await Promise.all(Array.from({ length: 8 }, () => getBuildTargetValue("t2", sampleCharId, validSettings)))
        for (const value of results) expect(value).toBe(results[0])
        expect(getBuildTargetValueCacheSize()).toBe(1)
    })

    test("计算失败不写入缓存，便于数据更新后重试", async () => {
        clearBuildTargetValueCache()
        expect(await getBuildTargetValue("t3", sampleCharId, "{ bad")).toBeNull()
        expect(getBuildTargetValueCacheSize()).toBe(0)
    })
})

describe("invalidateBuildTargetValue", () => {
    test("只清除指定构筑的缓存", async () => {
        clearBuildTargetValueCache()
        await getBuildTargetValue("a", sampleCharId, validSettings)
        await getBuildTargetValue("b", sampleCharId, validSettings)
        expect(getBuildTargetValueCacheSize()).toBe(2)

        expect(invalidateBuildTargetValue("a")).toBe(true)
        expect(getBuildTargetValueCacheSize()).toBe(1)
        expect(invalidateBuildTargetValue("a")).toBe(false)
    })
})

describe("getBuildTargetValues", () => {
    test("批量返回可得条目，失败条目被跳过", async () => {
        clearBuildTargetValueCache()
        const map = await getBuildTargetValues([
            { id: "ok1", charId: sampleCharId, charSettings: validSettings },
            { id: "bad", charId: sampleCharId, charSettings: "{ bad" },
            { id: "ok2", charId: sampleCharId, charSettings: validSettings },
        ])
        expect([...map.keys()].sort()).toEqual(["ok1", "ok2"])
    })
})

describe("clearBuildTargetValueCache", () => {
    test("返回清掉的条目数并清空缓存", async () => {
        clearBuildTargetValueCache()
        await getBuildTargetValue("c1", sampleCharId, validSettings)
        await getBuildTargetValue("c2", sampleCharId, validSettings)
        expect(clearBuildTargetValueCache()).toBe(2)
        expect(getBuildTargetValueCacheSize()).toBe(0)
    })
})
