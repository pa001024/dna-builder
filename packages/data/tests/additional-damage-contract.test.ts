import { describe, expect, it } from "vitest"
import buffData from "../d/buff.data"
import charData from "../d/char.data"
import * as seasonData from "../d/dnaseasonequip.data"
import modData from "../d/mod.data"
import weaponData from "../d/weapon.data"
import {
    ADDITIONAL_DAMAGE_KEYS,
    additionalDamageDotElementCount,
    additionalDamageElementOf,
    LEGACY_ADDITIONAL_DAMAGE_KEY,
    normalizeAdditionalDamageKey,
    SELF_ADDITIONAL_DAMAGE_KEY,
} from "../leveled/additionalDamage"

const CHASE_KEYS = new Set<string>(ADDITIONAL_DAMAGE_KEYS)

/** 递归收集对象键为指定名称的路径（只认键，不认描述文案） */
function collectKeyPaths(value: unknown, key: string, path = "$", found: string[] = [], seen = new Set<object>()): string[] {
    if (!value || typeof value !== "object") return found
    if (seen.has(value)) return found
    seen.add(value)
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectKeyPaths(item, key, `${path}[${index}]`, found, seen))
        return found
    }
    for (const [childKey, child] of Object.entries(value)) {
        if (childKey === key) found.push(`${path}.${childKey}`)
        collectKeyPaths(child, key, `${path}.${childKey}`, found, seen)
    }
    return found
}

/** 递归收集对象键为旧聚合 `追加伤害` 的路径（只认键，不认描述文案） */
function collectLegacyPaths(value: unknown, path = "$", found: string[] = [], seen = new Set<object>()): string[] {
    if (!value || typeof value !== "object") return found
    if (seen.has(value)) return found
    seen.add(value)
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectLegacyPaths(item, `${path}[${index}]`, found, seen))
        return found
    }
    for (const [key, child] of Object.entries(value)) {
        if (key === LEGACY_ADDITIONAL_DAMAGE_KEY) found.push(`${path}.${key}`)
        collectLegacyPaths(child, `${path}.${key}`, found, seen)
    }
    return found
}

/** 属性记录中出现的追伤分量键 */
const chaseKeysOf = (attrs: object | undefined): string[] => (attrs ? Object.keys(attrs).filter(key => CHASE_KEYS.has(key)) : [])

describe("追伤生产数据契约（U70-fix）", () => {
    it("d/{buff,mod,weapon,dnaseasonequip}.data.ts 不含结构化「追加伤害」键（排除翻译表）", () => {
        expect(collectLegacyPaths(buffData), "buff.data").toEqual([])
        expect(collectLegacyPaths(modData), "mod.data").toEqual([])
        expect(collectLegacyPaths(weaponData), "weapon.data").toEqual([])
        expect(collectLegacyPaths(seasonData), "dnaseasonequip.data").toEqual([])
    })

    it("生产数据不含已删除的「异常数量」键（buff / mod / char）", () => {
        expect(collectKeyPaths(buffData, "异常数量"), "buff.data").toEqual([])
        expect(collectKeyPaths(modData, "异常数量"), "mod.data").toEqual([])
        expect(collectKeyPaths(charData, "异常数量"), "char.data").toEqual([])
    })

    it("DOT 元素种数按追伤分量集合推导（自属性不新增元素）", () => {
        expect(additionalDamageElementOf("火属性追伤")).toBe("火")
        expect(additionalDamageElementOf("暗属性追伤")).toBe("暗")
        // 仅自属性追伤：不新增元素
        expect(additionalDamageDotElementCount({ 自属性追伤: 0.35 }, "雷")).toBe(0)
        // 水/火/雷/风四元素 + 雷角色：去重后 4 种 → 其余 3
        expect(additionalDamageDotElementCount({ 水属性追伤: 0.688, 火属性追伤: 0.688, 雷属性追伤: 0.688, 风属性追伤: 0.688 }, "雷")).toBe(
            3
        )
        // 光角色与四元素不重叠 → 其余 4
        expect(additionalDamageDotElementCount({ 水属性追伤: 0.1, 火属性追伤: 0.1, 雷属性追伤: 0.1, 风属性追伤: 0.1 }, "光")).toBe(4)
        // 负值也算存在；非零判定不过滤符号
        expect(additionalDamageDotElementCount({ 火属性追伤: -0.1 }, "雷")).toBe(1)
        // 缺失 / 非有限值不计数
        expect(additionalDamageDotElementCount({ 火属性追伤: Number.NaN }, "雷")).toBe(0)
        expect(additionalDamageDotElementCount(undefined, "雷")).toBe(0)
    })

    it("normalizeAdditionalDamageKey 只迁移「追加伤害」；BonusDamage* 原样保留（升华解码专有）", () => {
        expect(normalizeAdditionalDamageKey(LEGACY_ADDITIONAL_DAMAGE_KEY)).toBe(SELF_ADDITIONAL_DAMAGE_KEY)
        for (const key of ["BonusDamage", "BonusDamage_Fire", "BonusDamage_Foo"]) {
            expect(normalizeAdditionalDamageKey(key)).toBe(key)
        }
    })

    it("百首 / 换生灵追伤 MOD 逐键锁定（14 键）", () => {
        const expected: Record<number, [string, number, "加成" | "生效"]> = {
            41413: ["暗属性追伤", 0.18, "加成"],
            41423: ["水属性追伤", 0.18, "加成"],
            41433: ["火属性追伤", 0.18, "加成"],
            41443: ["雷属性追伤", 0.18, "加成"],
            41453: ["风属性追伤", 0.18, "加成"],
            41463: ["光属性追伤", 0.18, "加成"],
            51413: ["暗属性追伤", 0.33, "加成"],
            51423: ["水属性追伤", 0.33, "加成"],
            51433: ["火属性追伤", 0.33, "加成"],
            51443: ["雷属性追伤", 0.33, "加成"],
            51453: ["风属性追伤", 0.33, "加成"],
            51463: ["光属性追伤", 0.33, "加成"],
            56111: ["暗属性追伤", 0.66, "生效"],
            56112: ["暗属性追伤", 0.66, "生效"],
        }
        const chaseMods = modData.filter(mod => chaseKeysOf(mod.加成).length + chaseKeysOf(mod.生效).length > 0)
        expect(chaseMods.map(mod => mod.id).sort((a, b) => a - b)).toEqual(
            Object.keys(expected)
                .map(Number)
                .sort((a, b) => a - b)
        )
        for (const mod of chaseMods) {
            const [key, value, field] = expected[mod.id]
            const source = field === "加成" ? mod.加成 : mod.生效
            expect(source?.[key], `${mod.id}`).toBe(value)
            expect(chaseKeysOf(mod.加成).length + chaseKeysOf(mod.生效).length, `${mod.id}`).toBe(1)
        }
    })

    it("武器 3 把本体 + 3 个锻造技能为自属性追伤 0.35", () => {
        const body = weaponData
            .filter(weapon => chaseKeysOf(weapon.加成).length > 0)
            .map(weapon => [weapon.id, weapon.加成?.[SELF_ADDITIONAL_DAMAGE_KEY]])
        expect(body).toEqual([
            [10399, 0.35],
            [10699, 0.35],
            [20599, 0.35],
        ])
        const forge = weaponData.flatMap(weapon =>
            (weapon.熔炉 ?? []).flatMap(forgeData =>
                (forgeData.技能 ?? [])
                    .filter(skill => chaseKeysOf(skill.加成).length > 0)
                    .map(skill => [skill.id, skill.加成?.[SELF_ADDITIONAL_DAMAGE_KEY]])
            )
        )
        expect(forge).toEqual([
            [10399008, 0.35],
            [10699008, 0.35],
            [20599008, 0.35],
        ])
    })

    it("8 条追伤 BUFF 的元素归属逐项锁定", () => {
        const expected: Record<string, string[]> = {
            "菲娜被动(自身)": ["光属性追伤"],
            菲娜Q: ["火属性追伤", "水属性追伤", "雷属性追伤", "风属性追伤"],
            "主角-暗Q": ["暗属性追伤"],
            煜明4溯: ["雷属性追伤"],
            奥特赛德6溯: ["风属性追伤"],
            达芙涅Q: ["风属性追伤"],
            莉兹贝尔6溯: ["光属性追伤"],
            "欧泊艾尔芙(主动)": ["光属性追伤"],
        }
        const chaseBuffs = buffData.filter(buff => chaseKeysOf(buff.attr).length > 0)
        expect(chaseBuffs.map(buff => buff.名称).sort()).toEqual(Object.keys(expected).sort())
        for (const buff of chaseBuffs) {
            expect(chaseKeysOf(buff.attr).sort(), buff.名称).toEqual([...expected[buff.名称]].sort())
        }
        const readValue = (name: string, key: string) => buffData.find(buff => buff.名称 === name)?.attr?.[key]
        expect(readValue("达芙涅Q", "风属性追伤")).toBe(0.21)
        expect(readValue("奥特赛德6溯", "风属性追伤")).toBe(0.2)
        expect(readValue("莉兹贝尔6溯", "光属性追伤")).toBe(0.3)
        // 技能等级追伤改为技能字段表达式（U99c），不再手写等级数组
        expect(readValue("菲娜Q", "雷属性追伤")).toBe("下午茶开始了::追加伤害倍率")
        expect(readValue("主角-暗Q", "暗属性追伤")).toBe("雾海祷音::[[呼唤]]追加伤害倍率")
        expect(readValue("菲娜被动(自身)", "光属性追伤")).toBe(
            "(坏巫师最怕阳光了::永续追加伤害倍率 + 30*坏巫师最怕阳光了::[梦笔生花]每层追加伤害倍率)"
        )
        expect(readValue("欧泊艾尔芙(主动)", "光属性追伤")).toHaveLength(5)
    })

    it("赛季 6 个元素追伤词缀仍按元素键导出", () => {
        const expected: Record<number, string> = {
            1024: "水属性追伤",
            1025: "火属性追伤",
            1026: "风属性追伤",
            1027: "雷属性追伤",
            1028: "光属性追伤",
            1029: "暗属性追伤",
        }
        const chaseAffixes = seasonData.affixes.filter(affix => affix.addAttrs?.some(attr => CHASE_KEYS.has(attr.attr)))
        expect(chaseAffixes.map(affix => affix.id).sort((a, b) => a - b)).toEqual(
            Object.keys(expected)
                .map(Number)
                .sort((a, b) => a - b)
        )
        for (const affix of chaseAffixes) {
            expect(affix.addAttrs?.map(attr => attr.attr)).toEqual([expected[affix.id]])
        }
    })

    it("追加伤害BUG 直接按七分量缩放（不只靠引擎迁移兜底）", () => {
        const bug = buffData.find(buff => buff.名称 === "追加伤害BUG")
        expect(bug?.code).toBeDefined()
        for (const key of ADDITIONAL_DAMAGE_KEYS) {
            expect(bug?.code, key).toContain(`weaponAttr.${key}*=k`)
        }
        expect(bug?.code).not.toContain(LEGACY_ADDITIONAL_DAMAGE_KEY)
    })
})
