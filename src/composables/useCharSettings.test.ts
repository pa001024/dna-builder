import { describe, expect, it } from "vitest"
import { createDefaultCharSettings, normalizeCharSettings, serializeCharSettings } from "./useCharSettings"

describe("useCharSettings helpers", () => {
    it("默认角色配置应包含自定义BUFF列表", () => {
        const settings = createDefaultCharSettings()

        expect(settings.customBuff).toEqual([])
    })

    it("标准化旧版角色配置时应补齐自定义BUFF字段", () => {
        const settings = normalizeCharSettings({
            baseName: "普通攻击",
            buffs: [["助战50攻", 1]],
        })

        expect(settings.baseName).toBe("普通攻击")
        expect(settings.buffs).toEqual([["助战50攻", 1]])
        expect(settings.customBuff).toEqual([])
        expect(settings.customVariables).toEqual([])
    })

    it("标准化时应保留设置了覆盖率的BUFF（第三元素）并舍入精度", () => {
        const settings = normalizeCharSettings({
            buffs: [
                ["助战50攻", 1, 0.5],
                ["助战100攻", 2, 0.333333333333],
            ],
        })

        expect(settings.buffs).toEqual([
            ["助战50攻", 1, 0.5],
            ["助战100攻", 2, 0.333333],
        ])
    })

    it("标准化时覆盖率100%的BUFF应回退为旧的两元素格式", () => {
        const settings = normalizeCharSettings({
            buffs: [["助战50攻", 1, 1]],
        })

        expect(settings.buffs).toEqual([["助战50攻", 1]])
    })

    it("标准化时应舍入自定义BUFF数值，清理旧存档浮点尾差", () => {
        const settings = normalizeCharSettings({
            customBuff: [
                ["攻击", 0.23499999999999999],
                ["技能威力", 1.1000000000000001],
            ],
        })

        expect(settings.customBuff).toEqual([
            ["攻击", 0.235],
            ["技能威力", 1.1],
        ])
    })

    it("序列化时应舍入自定义BUFF数值并仅追加显式覆盖率", () => {
        const serialized = serializeCharSettings({
            buffs: [
                ["助战50攻", 1],
                ["助战100攻", 2, 0.50000000001],
                ["助战150攻", 3, 1],
            ],
            customBuff: [["攻击", 0.23499999999999999]],
        })

        expect(JSON.parse(serialized).buffs).toEqual([
            ["助战50攻", 1],
            ["助战100攻", 2, 0.5],
            ["助战150攻", 3],
        ])
        expect(JSON.parse(serialized).customBuff).toEqual([["攻击", 0.235]])
    })

    it("传入近战专武时默认装备该武器", () => {
        const settings = createDefaultCharSettings({ id: 10104, type: "近战" })

        expect(settings.meleeWeapon).toBe(10104)
        expect(settings.rangedWeapon).toBe(20102)
    })

    it("传入远程专武时默认装备该武器", () => {
        const settings = createDefaultCharSettings({ id: 20405, type: "远程" })

        expect(settings.rangedWeapon).toBe(20405)
        expect(settings.meleeWeapon).toBe(10206)
    })

    it("未传入专武时保留通用默认武器", () => {
        const noSignature = createDefaultCharSettings()
        const nullSignature = createDefaultCharSettings(null)

        expect(noSignature.meleeWeapon).toBe(10206)
        expect(noSignature.rangedWeapon).toBe(20102)
        expect(nullSignature.meleeWeapon).toBe(10206)
        expect(nullSignature.rangedWeapon).toBe(20102)
    })

    it("默认角色配置的协战构筑id为未关联占位值", () => {
        const settings = createDefaultCharSettings()

        expect(settings.team1Build).toBe("-")
        expect(settings.team2Build).toBe("-")
    })

    it("标准化时应保留协战构筑id并清理非法值", () => {
        const settings = normalizeCharSettings({
            team1Build: " abc123 ",
            // 旧存档或脏数据里的非法值一律视为未关联
            team2Build: 0 as unknown as string,
        })

        expect(settings.team1Build).toBe("abc123")
        expect(settings.team2Build).toBe("-")
    })

    it("标准化旧存档时应补齐魔灵与潜质字段", () => {
        const settings = normalizeCharSettings({ baseName: "普通攻击" })

        expect(settings.petId).toBe(0)
        expect(settings.petLevel).toBe(3)
        expect(settings.petCoverage).toBe(1)
        expect(settings.traits).toEqual([null, null, null, null])
    })

    it("标准化时应丢弃历史版本写入的非法潜质槽位（早期存的是潜质条目 id 数字）", () => {
        // 早期版本把潜质条目 id 直接存成数字；解构这类值会抛错，必须只丢该槽位而不是让页面崩掉
        const settings = normalizeCharSettings({
            traits: [10103, null, ["1010", 3], [1010, 3], [1010, 9], [1010, 3]] as unknown as never,
        })

        expect(settings.traits).toEqual([[1010, 3], null, null, null])
    })

    it("标准化时应钳制魔灵字段的非法数值", () => {
        const dirty = normalizeCharSettings({
            petId: Number.NaN,
            petLevel: 99,
            petCoverage: -3,
        })
        expect(dirty.petId).toBe(0)
        expect(dirty.petLevel).toBe(3)
        expect(dirty.petCoverage).toBe(0)

        const garbage = normalizeCharSettings({
            petId: "abc" as unknown as number,
            petLevel: "abc" as unknown as number,
            petCoverage: null as unknown as number,
        })
        expect(garbage.petId).toBe(0)
        expect(garbage.petLevel).toBe(3)
        expect(garbage.petCoverage).toBe(1)
    })

    it("旧存档迁移：BUFF 里的潜质搬进潜质槽，魔灵被动/主动搬进魔灵字段", () => {
        const settings = normalizeCharSettings({
            buffs: [
                ["魔灵潜质:凶猛", 3],
                ["魔灵潜质:敏锐", 2],
                ["黑曜艾尔芙", 3],
                ["黑曜艾尔芙(主动)", 3, 0.6],
                ["菲娜Q", 12],
            ] as never,
        })

        // 非魔灵 BUFF 原样保留，魔灵相关 BUFF 全部搬走
        expect(settings.buffs).toEqual([["菲娜Q", 12]])
        expect(settings.traits).toEqual([[1010, 3], [1014, 2], null, null])
        expect(settings.petId).toBe(4211)
        expect(settings.petLevel).toBe(3)
        // 主动技覆盖率沿用勾选值
        expect(settings.petCoverage).toBe(0.6)
    })

    it("旧存档迁移：已有选择不被覆盖，同一潜质只占一槽", () => {
        const settings = normalizeCharSettings({
            petId: 4211,
            petLevel: 3,
            petCoverage: 1,
            traits: [[1010, 3], null, null, null] as never,
            buffs: [
                ["魔灵潜质:凶猛", 2],
                ["魔灵潜质:甲胄", 3],
                ["碧玺艾尔芙(主动)", 4, 0.25],
            ] as never,
        })

        // 凶猛已在槽位中 → 丢弃该 BUFF；甲胄补入下一个空槽
        expect(settings.traits).toEqual([[1010, 3], [1011, 3], null, null])
        expect(settings.petId).toBe(4211)
        expect(settings.petLevel).toBe(3)
        expect(settings.petCoverage).toBe(1)
        expect(settings.buffs).toEqual([])
    })

    it("序列化魔灵与潜质时只保留 id / 等级 / 覆盖率", () => {
        const settings = normalizeCharSettings({
            petId: 4211,
            petLevel: 3,
            petCoverage: 0.5,
            traits: [[1010, 3], null, null, null],
        })
        const serialized = JSON.parse(serializeCharSettings(settings))

        expect(serialized.petId).toBe(4211)
        expect(serialized.petLevel).toBe(3)
        expect(serialized.petCoverage).toBe(0.5)
        expect(serialized.traits).toEqual([[1010, 3], null, null, null])
    })
})
