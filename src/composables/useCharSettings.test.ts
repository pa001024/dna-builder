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
})
