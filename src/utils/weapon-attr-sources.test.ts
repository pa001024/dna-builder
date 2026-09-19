import { describe, expect, it } from "vitest"
import { CharBuild, type LeveledBuff, LeveledChar, LeveledMod, LeveledModHelper, LeveledWeapon } from "@/data"
import { createCustomBuff } from "@/data/CharBuildHelper"
import { collectWeaponAttrSources, getWeaponAttrFieldCandidates } from "./weapon-attr-sources"

describe("武器属性来源", () => {
    /**
     * 创建测试用构筑：真实近战/远程武器，MOD 与 BUFF 按用例注入。
     */
    function createBuild(
        options: {
            buffs?: LeveledBuff[]
            charMods?: LeveledMod[]
            meleeMods?: LeveledMod[]
            rangedMods?: LeveledMod[]
            skillMods?: LeveledMod[]
        } = {}
    ) {
        return new CharBuild({
            char: new LeveledChar("黎瑟"),
            hpPercent: 0.5,
            resonanceGain: 2,
            buffs: options.buffs ?? [],
            charMods: options.charMods ?? [],
            meleeMods: options.meleeMods ?? [],
            rangedMods: options.rangedMods ?? [],
            skillMods: options.skillMods ?? [],
            melee: new LeveledWeapon(10302),
            ranged: new LeveledWeapon(20601),
            baseName: "快速出击",
            targetFunction: "伤害",
        })
    }

    it("字段候选包含作用域前缀字段与同律降级字段", () => {
        expect(getWeaponAttrFieldCandidates("触发", "近战")).toEqual([
            { field: "近战触发", scope: "近战", includeMods: true },
            { field: "触发", scope: "近战", includeMods: true },
        ])

        expect(getWeaponAttrFieldCandidates("触发", "同律近战")).toEqual([
            { field: "同律近战触发", scope: "同律近战", includeMods: true },
            { field: "触发", scope: "同律近战", includeMods: true },
            // 前缀降级：同律近战读取近战作用域字段，但不纳入 MOD
            { field: "近战触发", scope: "近战", includeMods: false },
        ])
    })

    it("BUFF 的带前缀字段按作用域生效，同律面板含降级来源", () => {
        const build = createBuild({
            buffs: [createCustomBuff([["近战触发", 0.2]]), createCustomBuff([["触发", 0.1]]), createCustomBuff([["远程触发", 0.3]])],
        })

        const meleeSources = collectWeaponAttrSources(build, "近战", "触发")
        expect(meleeSources).toContainEqual({ name: "自定义BUFF", value: 0.2 })
        expect(meleeSources).toContainEqual({ name: "自定义BUFF", value: 0.1 })
        expect(meleeSources.some(source => source.value === 0.3)).toBe(false)

        // 同律面板：同律近战字段直接命中，近战字段经前缀降级命中，远程字段不参与
        const skillSources = collectWeaponAttrSources(build, "同律近战", "触发")
        expect(skillSources).toContainEqual({ name: "自定义BUFF", value: 0.2 })
        expect(skillSources).toContainEqual({ name: "自定义BUFF", value: 0.1 })
        expect(skillSources.some(source => source.value === 0.3)).toBe(false)
    })

    it("裸「攻击」字段不进武器面板，带前缀的攻击字段正常计入", () => {
        const build = createBuild({
            buffs: [
                createCustomBuff([
                    ["攻击", 0.4],
                    ["近战攻击", 0.05],
                ]),
            ],
        })

        expect(collectWeaponAttrSources(build, "近战", "攻击")).toEqual([{ name: "自定义BUFF", value: 0.05 }])
    })

    it("角色自带加成同时覆盖裸字段与带前缀字段", () => {
        const build = createBuild()
        build.char.加成 = { 暴击: 0.1, 近战暴击: 0.05 }

        expect(collectWeaponAttrSources(build, "近战", "暴击")).toContainEqual({ name: build.char.名称, value: 0.05 })
        expect(collectWeaponAttrSources(build, "远程", "暴击")).not.toContainEqual({ name: build.char.名称, value: 0.05 })
    })

    it("武器自身词条只读取同作用域槽位", () => {
        const build = createBuild()
        const weaponName = build.meleeWeapon.名称
        build.meleeWeapon.触发 = 0.03
        build.meleeWeapon.近战触发 = 0.07

        expect(collectWeaponAttrSources(build, "近战", "触发")).toEqual(
            expect.arrayContaining([
                { name: weaponName, value: 0.07 },
                { name: weaponName, value: 0.03 },
            ])
        )

        // 远程面板不读取近战武器；同律面板只经降级读到带前缀字段，裸字段不参与
        expect(collectWeaponAttrSources(build, "远程", "触发").some(source => source.name === weaponName)).toBe(false)
        const skillSources = collectWeaponAttrSources(build, "同律近战", "触发")
        expect(skillSources).toContainEqual({ name: weaponName, value: 0.07 })
        expect(skillSources).not.toContainEqual({ name: weaponName, value: 0.03 })
    })

    it("MOD 按槽位作用域统计，且不随前缀降级穿透", () => {
        const meleeMod = new LeveledMod(12006) // 近战 · 触发
        const skillMod = new LeveledMod(14001) // 同律近战 · 攻击
        const charMod = new LeveledMod(41001) // 角色 · 攻击
        const build = createBuild({ charMods: [charMod], meleeMods: [meleeMod], skillMods: [skillMod] })

        // 近战槽位 MOD 在近战面板生效，跨作用域与同律降级都不生效
        expect(collectWeaponAttrSources(build, "近战", "触发")).toContainEqual({ name: meleeMod.名称, value: meleeMod.触发 })
        expect(collectWeaponAttrSources(build, "远程", "触发").some(source => source.name === meleeMod.名称)).toBe(false)
        expect(collectWeaponAttrSources(build, "同律近战", "触发").some(source => source.name === meleeMod.名称)).toBe(false)

        // 同律槽位 MOD 作用于同律面板自身的裸属性
        expect(collectWeaponAttrSources(build, "同律近战", "攻击")).toContainEqual({ name: skillMod.名称, value: skillMod.攻击 })
        // MOD 不含跨作用域穿透的「攻击」，角色槽 MOD 的攻击不进入武器面板
        expect(collectWeaponAttrSources(build, "近战", "攻击").some(source => source.name === charMod.名称)).toBe(false)
    })

    it("MOD 效果层（@ 属性）按 BUFF 口径计入来源合计", () => {
        // 反转（43342，远程槽）：效果以 @近战增伤 声明，跨槽位作用于近战武器面板
        const 反转 = LeveledModHelper.fromId(43342, 5, 5)
        const build = createBuild({ rangedMods: [反转] })

        expect(collectWeaponAttrSources(build, "近战", "增伤")).toContainEqual({ name: 反转.名称, value: 0.6 })
        // 远程面板不读取近战作用域属性；同律面板经降级候选读到
        expect(collectWeaponAttrSources(build, "远程", "增伤").some(source => source.name === 反转.名称)).toBe(false)
        expect(collectWeaponAttrSources(build, "同律近战", "增伤")).toContainEqual({ name: 反转.名称, value: 0.6 })

        // 与 CharBuild 前缀查询口径一致
        for (const scope of ["近战", "远程", "同律近战", "同律远程"]) {
            const listed = collectWeaponAttrSources(build, scope, "增伤").reduce((sum, source) => sum + source.value, 0)
            const expected =
                build.getTotalBonus(`${scope}增伤`, scope) +
                build.getTotalBonus("增伤", scope) +
                (scope.startsWith("同律")
                    ? build.getTotalBonus(`${scope.slice("同律".length)}增伤`, scope.slice("同律".length), { includeMods: false })
                    : 0)

            expect(listed).toBeCloseTo(expected, 10)
        }
    })

    it("来源合计与 CharBuild 的前缀查询口径一致", () => {
        const build = createBuild({
            buffs: [
                createCustomBuff([
                    ["触发", 0.1],
                    ["近战触发", 0.2],
                ]),
                createCustomBuff([["同律近战触发", 0.05]]),
            ],
            meleeMods: [new LeveledMod(12006)],
        })

        for (const scope of ["近战", "远程", "同律近战", "同律远程"]) {
            const listed = collectWeaponAttrSources(build, scope, "触发").reduce((sum, source) => sum + source.value, 0)
            const expected =
                build.getTotalBonus(`${scope}触发`, scope) +
                build.getTotalBonus("触发", scope) +
                (scope.startsWith("同律")
                    ? build.getTotalBonus(`${scope.slice("同律".length)}触发`, scope.slice("同律".length), { includeMods: false })
                    : 0)

            expect(listed).toBeCloseTo(expected, 10)
        }
    })
})
