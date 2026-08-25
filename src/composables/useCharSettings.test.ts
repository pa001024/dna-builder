import { describe, expect, it } from "vitest"
import { createDefaultCharSettings, normalizeCharSettings } from "./useCharSettings"

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
