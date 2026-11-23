import { describe, expect, it, vi } from "vitest"
import { ref } from "vue"
import { createDefaultTranscendBuildSettings } from "@/data"
import { createTranscendJointFacade } from "@/utils/transcend-joint"

/**
 * joint facade：升华页内部 TeamEditor ↔ 协战一/二的双向映射。
 * 读写共用同一份 `TranscendBuildSettings`，不依赖挂载即可验证。
 */

describe("升华 joint facade", () => {
    it("TeamEditor 写入角色：保留等级 / 技能，重置 baseName 与启用状态，清掉非法额外精通", () => {
        const settings = ref(createDefaultTranscendBuildSettings(1101))
        settings.value.assist1 = {
            ...settings.value.assist1,
            charId: 1101,
            charLevel: 42,
            charSkillLevel: [7, 8, 9],
            extraMastery: "长柄",
            baseName: "旧技能",
        }
        const onChange = vi.fn()
        const facade = createTranscendJointFacade(settings, { onChange })

        facade.team1 = 1102
        expect(settings.value.assist1).toMatchObject({
            charId: 1102,
            charLevel: 42,
            charSkillLevel: [7, 8, 9],
            baseName: "",
            enabled: true,
            extraMastery: "",
        })
        expect(onChange).toHaveBeenCalledTimes(1)

        facade.team1 = "-"
        expect(settings.value.assist1).toMatchObject({ charId: 0, enabled: false })
        expect(onChange).toHaveBeenCalledTimes(2)

        // 写同值不触发变更（防回环）
        facade.team1 = "-"
        expect(onChange).toHaveBeenCalledTimes(2)
    })

    it("协战武器按类型写入近战 / 远程槽并清空另一槽；外部改动实时回填", () => {
        const settings = ref(createDefaultTranscendBuildSettings(1101))
        const facade = createTranscendJointFacade(settings)

        facade.team2Weapon = 10206
        expect(settings.value.assist2.meleeWeapon).toBe(10206)
        expect(settings.value.assist2.rangedWeapon).toBe(0)

        facade.team2Weapon = 20298
        expect(settings.value.assist2.meleeWeapon).toBe(0)
        expect(settings.value.assist2.rangedWeapon).toBe(20298)

        // 基础设置 / 角色弹窗写入后，TeamEditor 读到同一份数据
        settings.value.assist2.charId = 1103
        settings.value.assist2.rangedWeapon = 0
        expect(facade.team2).toBe(1103)
        expect(facade.team2Weapon).toBe("-")

        facade.team2Weapon = "-"
        expect(settings.value.assist2).toMatchObject({ meleeWeapon: 0, rangedWeapon: 0 })
    })

    it("魔灵 / 潜质 / 自定义 BUFF 直接映射 joint 字段并标记编辑", () => {
        const settings = ref(createDefaultTranscendBuildSettings(1101))
        const onChange = vi.fn()
        const facade = createTranscendJointFacade(settings, { onChange })

        facade.petId = 4023
        facade.petLevel = 2
        facade.petCoverage = 0.35
        facade.petAutoCoverage = false
        facade.traits = [[1010, 2], [1011, 1], null, null]
        facade.customBuff = [["攻击", 0.15]]

        expect(settings.value).toMatchObject({
            petId: 4023,
            petLevel: 2,
            petCoverage: 0.35,
            petAutoCoverage: false,
            traits: [[1010, 2], [1011, 1], null, null],
            customBuff: [["攻击", 0.15]],
        })
        expect(onChange).toHaveBeenCalledTimes(6)

        // 反向：设置被整体替换 / 外部修改后，面板读取同一来源
        settings.value.petId = 4013
        expect(facade.petId).toBe(4013)
    })

    it("协战关联构筑只在 facade 内保留，不写入设置也不标记编辑", () => {
        const settings = ref(createDefaultTranscendBuildSettings(1101))
        const onChange = vi.fn()
        const facade = createTranscendJointFacade(settings, { onChange })

        facade.team1Build = "build-abc"
        facade.team1BuildVariant = "B"
        expect(facade.team1Build).toBe("build-abc")
        expect(facade.team1BuildVariant).toBe("B")
        expect(onChange).not.toHaveBeenCalled()
        expect(JSON.stringify(settings.value)).not.toContain("build-abc")

        // 换角色会清掉旧关联，避免指向不属于新队友的构筑
        facade.team1 = 1102
        expect(facade.team1Build).toBe("-")
        expect(facade.team1BuildVariant).toBe("A")
    })

    it("潜质槽位写入时复制为固定长度，非法 / 超长槽位被截断", () => {
        const settings = ref(createDefaultTranscendBuildSettings(1101))
        const facade = createTranscendJointFacade(settings)
        facade.traits = [
            [1010, 2],
            [1011, 1],
            [1012, 3],
            [1013, 1],
            [1001, 1],
        ] as [number, number][]
        expect(settings.value.traits).toHaveLength(4)
        expect(settings.value.traits[0]).toEqual([1010, 2])
        // 写入的是副本：外部修改入参数组不会影响设置
        const source: [number, number] = [1010, 2]
        facade.traits = [source, null, null, null]
        source[1] = 3
        expect(settings.value.traits[0]).toEqual([1010, 2])
    })
})
