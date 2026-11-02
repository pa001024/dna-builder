import { beforeEach, describe, expect, it } from "vitest"
import {
    AUTOMATION_MIGRATED_KEY,
    AUTOMATION_RULES_KEY,
    type LegacyMiHomeRule,
    migrateLegacyAutomation,
    migrateMiHomeRule,
    parseLegacyMiHomeRules,
} from "@/store/automation-migrate"

/**
 * 给 node 测试环境装一个 Map 版 localStorage（真实浏览器 API 的最小子集）。
 * @returns 底层 Map（断言旧键未被改动时用）
 */
function installFakeStorage() {
    const map = new Map<string, string>()
    Object.defineProperty(globalThis, "localStorage", {
        value: {
            getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
            setItem: (key: string, value: string) => {
                map.set(key, String(value))
            },
            removeItem: (key: string) => {
                map.delete(key)
            },
            clear: () => map.clear(),
        },
        configurable: true,
        writable: true,
    })
    return map
}

const DUNGEON_RULE: LegacyMiHomeRule = {
    id: "r1",
    enabled: true,
    kind: "dungeon_complete",
    dungeonId: "64102",
    itemName: "",
    minRarity: 1,
    sceneId: "s1",
    homeId: "h1",
    sceneName: "客厅灯",
}

describe("automation migrate", () => {
    let map: Map<string, string>

    beforeEach(() => {
        map = installFakeStorage()
    })

    it("副本完成展开为 kind + status/id 条件", () => {
        const rule = migrateMiHomeRule(DUNGEON_RULE, true, true)
        expect(rule.match.kind).toBe("dungeon")
        expect(rule.match.when).toEqual([
            { field: "status", op: "eq", value: "complete" },
            { field: "id", op: "eq", value: "64102" },
        ])
        expect(rule.actionId).toBe("mihome.run-scene")
        expect(rule.actionConfig).toMatchObject({ scene_id: "s1", home_id: "h1", sceneName: "客厅灯" })
        expect(rule.fireOnce).toBe(true)
        expect(rule.enabled).toBe(true)
        expect(rule.name).toBe("客厅灯")
    })

    it("任意副本不带 id 条件，物品掉落按 名称包含 + 品质下限 展开", () => {
        const anyDungeon = migrateMiHomeRule({ ...DUNGEON_RULE, dungeonId: "" }, false, true)
        expect(anyDungeon.match.when).toEqual([{ field: "status", op: "eq", value: "complete" }])
        const drop = migrateMiHomeRule({ ...DUNGEON_RULE, id: "r2", kind: "item_drop", itemName: "萃取物", minRarity: 5 }, false, true)
        expect(drop.match.kind).toBe("reward")
        expect(drop.match.when).toEqual([
            { field: "name", op: "contains", value: "萃取物" },
            { field: "rarity", op: "gte", value: 5 },
        ])
    })

    it("空物品名 + 最低品质不产生多余条件，铸造完成只留名称条件", () => {
        const drop = migrateMiHomeRule({ ...DUNGEON_RULE, id: "r3", kind: "item_drop", itemName: "  ", minRarity: 1 }, true, true)
        expect(drop.match.when).toEqual([])
        const craft = migrateMiHomeRule({ ...DUNGEON_RULE, id: "r4", kind: "craft_complete", itemName: "长剑" }, true, true)
        expect(craft.match).toEqual({ kind: "craft", when: [{ field: "name", op: "contains", value: "长剑" }] })
    })

    it("全局开关关闭时迁入规则保持关闭", () => {
        const rule = migrateMiHomeRule(DUNGEON_RULE, true, false)
        expect(rule.enabled).toBe(false)
    })

    it("脏 payload 不抛错只保留合法条目", () => {
        expect(parseLegacyMiHomeRules(null)).toEqual([])
        expect(parseLegacyMiHomeRules("not-json")).toEqual([])
        expect(parseLegacyMiHomeRules('{"a":1}')).toEqual([])
        const mixed = parseLegacyMiHomeRules(JSON.stringify([DUNGEON_RULE, { id: "x", kind: "nope" }, null, 42]))
        expect(mixed.map(item => item.id)).toEqual(["r1"])
    })

    it("一次性迁移：三种形状落库 + 旧键保留 + 标记后不再跑", () => {
        map.set(
            "setting_mihome_rules",
            JSON.stringify([
                DUNGEON_RULE,
                { ...DUNGEON_RULE, id: "r2", kind: "item_drop", itemName: "萃取物", minRarity: 4 },
                { ...DUNGEON_RULE, id: "r3", kind: "craft_complete", itemName: "长剑" },
            ])
        )
        map.set("setting_mihome_enabled", "true")
        const first = migrateLegacyAutomation()
        expect(first).toEqual({ migrated: true, count: 3 })
        const stored = JSON.parse(map.get(AUTOMATION_RULES_KEY) as string)
        expect(stored).toHaveLength(3)
        expect(stored[1].match).toEqual({
            kind: "reward",
            when: [
                { field: "name", op: "contains", value: "萃取物" },
                { field: "rarity", op: "gte", value: 4 },
            ],
        })
        expect(map.get("setting_mihome_rules")).toContain("r1")
        expect(map.get(AUTOMATION_MIGRATED_KEY)).toBe("1")
        map.set(AUTOMATION_RULES_KEY, JSON.stringify([{ id: "keep", actionId: "x", match: {} }]))
        const second = migrateLegacyAutomation()
        expect(second.migrated).toBe(false)
        expect(JSON.parse(map.get(AUTOMATION_RULES_KEY) as string)).toHaveLength(1)
    })

    it("历史键兜底 + 缺省开关口径（enabled=false / fireOnce=true）", () => {
        map.set("setting_mijia_rules", JSON.stringify([{ ...DUNGEON_RULE, id: "old" }]))
        const result = migrateLegacyAutomation()
        expect(result).toEqual({ migrated: true, count: 1 })
        const stored = JSON.parse(map.get(AUTOMATION_RULES_KEY) as string)
        expect(stored[0].enabled).toBe(false)
        expect(stored[0].fireOnce).toBe(true)
    })
})
