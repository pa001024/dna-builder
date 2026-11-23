import { describe, expect, test } from "bun:test"
import { createAssistBuildFromSettings } from "dna-builder-data/CharBuildHelper"
import { normalizeCharSettings } from "dna-builder-data/charSettings"
import { charMap } from "dna-builder-data/d"
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

const ASSIST_CHAR = "扶疏"
const ASSIST_WEAPON_ID = 10302

/**
 * 在样例构筑上配置 1 号协战完整 loadout，目标函数改为跨角色表达式。
 * @param expression 目标函数表达式
 * @param configured 是否配置协战；false 时清空两名协战及其 loadout
 * @returns 可直接序列化给 targetValue 的配置对象
 */
function createAssistSettings(expression: string, configured = true) {
    const raw = JSON.parse(SAMPLE_BUILD_SETTINGS)
    const assist = charMap.get(ASSIST_CHAR)
    if (!assist) throw new Error("测试角色缺失")
    raw.targetFunction = expression
    if (!configured) {
        raw.team1 = "-"
        raw.team2 = "-"
        raw.team1Weapon = "-"
        raw.team2Weapon = "-"
        raw.assist1 = null
        raw.assist2 = null
        return raw
    }
    raw.team1 = assist.id
    raw.team1Weapon = ASSIST_WEAPON_ID
    raw.assist1 = {
        charLevel: 70,
        charSkillLevel: [10, 10, 10],
        baseName: assist.技能?.[0]?.名称 ?? "",
        charMods: [[41001, 10], null, null, null, null, null, null, null],
        buffs: [["菲娜4溯", 10]],
        customBuff: [["技能威力", 0.6]],
    }
    return raw
}

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

describe("computeBuildTargetValue 跨角色表达式", () => {
    test("协战 loadout 生效：目标值等于协战面板技能威力 × 0.7", () => {
        const raw = createAssistSettings(`${ASSIST_CHAR}::技能威力*0.7`)
        const settings = normalizeCharSettings(raw)
        const assist = createAssistBuildFromSettings(settings, "assist1")
        expect(assist).toBeDefined()
        expect(assist!.char.等级).toBe(70)
        const expected = assist!.calculateAttributes().技能威力 * 0.7
        expect(expected).toBeGreaterThan(0)

        const value = computeBuildTargetValue(sampleCharId, JSON.stringify(raw))
        expect(value).not.toBeNull()
        expect(value as number).toBeCloseTo(expected, 6)
    })

    test("未配置协战时同一表达式为 0（走无效命名空间路径，与 U89a 口径一致）", () => {
        const raw = createAssistSettings(`${ASSIST_CHAR}::技能威力`, false)
        const originalError = console.error
        const errors: unknown[] = []
        console.error = (...args: unknown[]) => {
            errors.push(args)
        }
        try {
            expect(computeBuildTargetValue(sampleCharId, JSON.stringify(raw))).toBe(0)
            // 完全未配置：命名空间不存在，按既有口径打印一次错误后返回 0
            expect(errors.length).toBeGreaterThan(0)
        } finally {
            console.error = originalError
        }
    })

    test("协战缺武器：查询为 0，且不产生协战命名空间错误（仅菲娜Q 的队友技能告警）", () => {
        const raw = createAssistSettings(`${ASSIST_CHAR}::技能威力`)
        raw.team1Weapon = "-"
        const originalError = console.error
        const errors: unknown[] = []
        console.error = (...args: unknown[]) => {
            errors.push(args)
        }
        try {
            expect(computeBuildTargetValue(sampleCharId, JSON.stringify(raw))).toBe(0)
            // 样例构筑自带菲娜Q：team1 换成扶疏后，「下午茶开始了」（菲娜 Q 技能）不在队内，数据侧按既有口径告警；
            // 缺武器本身不得再产生引用查询命名空间（扶疏）的错误。
            const messages = errors.map(args => String((args as unknown[])[1]))
            expect(messages.length).toBeGreaterThan(0)
            expect(messages.every(message => message.includes('无效命名空间: "下午茶开始了"'))).toBe(true)
            expect(messages.some(message => message.includes(ASSIST_CHAR))).toBe(false)
        } finally {
            console.error = originalError
        }
    })

    test("2 号协战（assist2）同样按协战面板求值", () => {
        const raw = createAssistSettings("协战2::技能威力*0.7")
        const assist = charMap.get(ASSIST_CHAR)!
        // 协战挪到 2 号位，loadout 保持
        raw.team1 = "-"
        raw.team1Weapon = "-"
        raw.team2 = assist.id
        raw.team2Weapon = ASSIST_WEAPON_ID
        raw.assist2 = raw.assist1
        raw.assist1 = null

        const settings = normalizeCharSettings(raw)
        const peer = createAssistBuildFromSettings(settings, "assist2")
        expect(peer).toBeDefined()
        const expected = peer!.calculateAttributes().技能威力 * 0.7
        expect(expected).toBeGreaterThan(0)
        expect(computeBuildTargetValue(sampleCharId, JSON.stringify(raw)) as number).toBeCloseTo(expected, 6)
    })
})
