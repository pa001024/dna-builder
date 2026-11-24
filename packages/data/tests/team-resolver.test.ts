import { describe, expect, it, vi } from "vitest"
import { CharBuild } from "../CharBuild"
import { createAssistBuildFromSettings, createCharBuildFromSettings } from "../CharBuildHelper"
import { createDefaultCharSettings, normalizeCharSettings } from "../charSettings"
import { buffMap, charMap } from "../d"
import { LeveledBuff } from "../leveled"
import { createTeamResolver } from "../teamResolver"
import { resolveTraceOffRoots } from "../traceEffects"
import { liseFireBuildCharId, liseFireBuildSettings } from "./fixtures/liseFireBuild"
import { shardBuild1CharId, shardBuild1Settings } from "./fixtures/shardBuild1"

const MAIN_CHAR = "黎瑟"
const ASSIST_CHAR = "扶疏"
const MAIN_ID = charMap.get(MAIN_CHAR)!.id
const ASSIST_ID = charMap.get(ASSIST_CHAR)!.id

/**
 * 读取角色技能名（数据表的 `Skill.名称` 为可选字段）。
 * @param charId 角色 id
 * @param index 技能索引
 * @returns 技能名称
 */
function charSkillName(charId: number, index = 0) {
    const name = charMap.get(charId)?.技能?.[index]?.名称
    if (!name) throw new Error(`角色 ${charId} 缺少第 ${index} 个技能`)
    return name
}

/**
 * 构造一份带 1 号协战的主控配置：主控两把武器 + team1 指向扶疏 + assist1 完整 loadout。
 * @returns 已归一化的配置
 */
function createTeamSettings() {
    const settings = createDefaultCharSettings()
    settings.baseName = charSkillName(MAIN_ID, 1)
    settings.charSkillLevel = [10, 10, 10]
    settings.meleeWeapon = 10302
    settings.rangedWeapon = 20601
    settings.team1 = ASSIST_ID
    settings.team1Weapon = 10302
    settings.assist1 = {
        ...settings.assist1,
        charLevel: 80,
        charSkillLevel: [10, 10, 10],
        baseName: charSkillName(ASSIST_ID),
        charMods: [[41001, 10], null, null, null, null, null, null, null],
        buffs: [["菲娜4溯", 10]],
        customBuff: [["技能威力", 0.6]],
    }
    return normalizeCharSettings(settings)
}

/** 构造带两名同名协战（均扶疏，数值不同）的配置，用于重名与别名消歧 */
function createSameNameTeamSettings() {
    const settings = createTeamSettings()
    settings.team2 = ASSIST_ID
    settings.team2Weapon = 10302
    settings.assist2 = { ...settings.assist2, charLevel: 80, charSkillLevel: [10, 10, 10], baseName: settings.assist1.baseName }
    settings.assist1 = { ...settings.assist1, customBuff: [["技能威力", 0.6]] }
    settings.assist2 = { ...settings.assist2, customBuff: [["技能威力", 1.1]] }
    return normalizeCharSettings(settings)
}

/** 让 evaluateAST 的命名空间报错不污染测试输出 */
function silenceConsoleError<T>(run: () => T): T {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
        return run()
    } finally {
        spy.mockRestore()
    }
}

describe("settings 驱动的 TeamResolver", () => {
    it("主控解析器注册角色名与槽位别名，未配置协战时不存在", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const assistPower = createAssistBuildFromSettings(settings, "assist1")!.calculateAttributes().技能威力
        expect(main.teamRole).toBe("main")
        expect(main.teamResolver).toBeDefined()
        expect(main.teamResolver!.namespaces()).toEqual(expect.arrayContaining([ASSIST_CHAR, "协战1", "assist1"]))
        expect(main.teamResolver!.isTeamNamespace(ASSIST_CHAR)).toBe(true)
        expect(main.teamResolver!.isTeamNamespace("协战1")).toBe(true)
        expect(main.teamResolver!.attrOf(ASSIST_CHAR, "技能威力")).toBeCloseTo(assistPower, 6)
        expect(main.teamResolver!.attrOf(ASSIST_CHAR, "不存在的属性")).toBeUndefined()

        const solo = createCharBuildFromSettings(MAIN_ID, normalizeCharSettings(createDefaultCharSettings()))
        expect(solo.teamResolver).toBeUndefined()
    })

    it("同名协战按 assist1 → assist2 取名，槽位别名可消歧", () => {
        const settings = createSameNameTeamSettings()
        const resolver = createTeamResolver(settings, "main", side => createAssistBuildFromSettings(settings, side))!
        const firstPower = createAssistBuildFromSettings(settings, "assist1")!.calculateAttributes().技能威力
        const secondPower = createAssistBuildFromSettings(settings, "assist2")!.calculateAttributes().技能威力
        expect(firstPower).not.toBeCloseTo(secondPower, 6)
        expect(resolver.namespaces()).toEqual(expect.arrayContaining([ASSIST_CHAR, "协战1", "assist1", "协战2", "assist2"]))
        expect(resolver.attrOf(ASSIST_CHAR, "技能威力")).toBeCloseTo(firstPower, 6)
        expect(resolver.attrOf("协战1", "技能威力")).toBeCloseTo(firstPower, 6)
        expect(resolver.attrOf("协战2", "技能威力")).toBeCloseTo(secondPower, 6)
    })

    it("协战 build 使用 restricted 解析器：别名可识别但属性恒不可用", () => {
        const settings = createSameNameTeamSettings()
        const assist = createAssistBuildFromSettings(settings, "assist1")!
        expect(assist.teamRole).toBe("assist1")
        expect(assist.teamResolver).toBeDefined()
        expect(assist.teamResolver!.isTeamNamespace("协战2")).toBe(true)
        expect(assist.teamResolver!.attrOf("协战2", "技能威力")).toBeUndefined()
    })
})

describe("createAssistBuildFromSettings 字段映射", () => {
    it("按 assistN 覆盖 loadout，清空队伍 / 魔灵 / 时间线并保留 assist 对象", () => {
        const settings = createTeamSettings()
        const peer = createAssistBuildFromSettings(settings, "assist1")!
        expect(peer.char.名称).toBe(ASSIST_CHAR)
        expect(peer.char.等级).toBe(80)
        expect(peer.baseName).toBe(settings.assist1.baseName)
        expect(peer.settings?.team1).toBe("-")
        expect(peer.settings?.team2).toBe("-")
        expect(peer.settings?.team1Weapon).toBe("-")
        expect(peer.settings?.team2Weapon).toBe("-")
        expect(peer.settings?.petId).toBe(0)
        expect(peer.settings?.traits).toEqual([])
        expect(peer.settings?.actions?.i).toEqual([])
        expect(peer.settings?.assist1).toEqual(settings.assist1)
        // 10302 为近战武器：放入近战槽，远程槽置空；等级 / 精炼取 assistN
        expect(peer.settings?.meleeWeapon).toBe(10302)
        expect(peer.settings?.meleeWeaponLevel).toBe(80)
        expect(peer.settings?.meleeWeaponRefine).toBe(5)
        expect(peer.settings?.rangedWeapon).toBe(0)
        // 敌人环境继承主控
        expect(peer.settings?.enemyId).toBe(settings.enemyId)
        expect(peer.settings?.enemyLevel).toBe(settings.enemyLevel)
        expect(createAssistBuildFromSettings(settings, "assist2")).toBeUndefined()
        expect(createAssistBuildFromSettings(normalizeCharSettings({ ...settings, team1Weapon: "-" }), "assist1")).toBeUndefined()
    })
})

describe("跨角色属性求值（目标函数 / 自定义变量 / BUFF attr）", () => {
    it("目标函数按协战角色名取值", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const assistPower = createAssistBuildFromSettings(settings, "assist1")!.calculateAttributes().技能威力
        const value = main.calculateTargetFunction(undefined, `${ASSIST_CHAR}::技能威力*0.7`)
        expect(value).toBeCloseTo(assistPower * 0.7, 6)
        expect(value).toBeGreaterThan(0)
    })

    it("槽位别名与角色名等价，攻击等属性不回落主控面板", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const assist = createAssistBuildFromSettings(settings, "assist1")!
        const assistPower = assist.calculateAttributes().技能威力
        expect(main.evaluateAST("协战1::技能威力")).toBeCloseTo(assistPower, 6)
        expect(main.evaluateAST("assist1::技能威力")).toBeCloseTo(assistPower, 6)
        expect(main.evaluateAST(`${ASSIST_CHAR}::技能威力!`)).toBeCloseTo(assistPower, 6)
        // 协战面板技能字段之外的角色属性同样只读协战
        const assistAttrs = assist.calculateAttributes()
        expect(main.evaluateAST(`${ASSIST_CHAR}::技能范围`)).toBeCloseTo(assistAttrs.技能范围, 6)
        expect(main.evaluateAST(`${ASSIST_CHAR}::技能范围`)).not.toBeCloseTo(main.calculateAttributes().技能范围, 6)
    })

    it("主控自身角色名读取当前面板", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const ownPower = main.calculateAttributes().技能威力
        expect(main.evaluateAST(`${MAIN_CHAR}::技能威力`)).toBeCloseTo(ownPower, 6)
        expect(main.validateAST(`${MAIN_CHAR}::技能威力`)).toBeUndefined()
    })

    it("自定义变量可引用协战属性并参与目标函数", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const assistPower = createAssistBuildFromSettings(settings, "assist1")!.calculateAttributes().技能威力
        main.customVariables = [["队友威力", `${ASSIST_CHAR}::技能威力`]]
        expect(main.evaluateAST("队友威力")).toBeCloseTo(assistPower, 6)
        expect(main.calculateTargetFunction(undefined, "队友威力*0.7")).toBeCloseTo(assistPower * 0.7, 6)
    })

    it("BUFF attr 表达式按协战属性生效", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const assistPower = createAssistBuildFromSettings(settings, "assist1")!.calculateAttributes().技能威力
        const baseline = main.calculateAttributes().技能威力
        main.buffs.push(new LeveledBuff({ 名称: "队友威力测试", 描述: "测试用", attr: { 技能威力: `${ASSIST_CHAR}::技能威力*0.7` } }))
        expect(main.calculateAttributes().技能威力 - baseline).toBeCloseTo(assistPower * 0.7, 6)
    })

    it("未配置协战 / 未知属性返回 0，不抛异常", () => {
        const solo = createCharBuildFromSettings(MAIN_ID, normalizeCharSettings(createDefaultCharSettings()))
        silenceConsoleError(() => {
            expect(solo.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBe(0)
            expect(solo.evaluateAST(`${ASSIST_CHAR}::技能威力!`)).toBe(0)
            expect(solo.calculateTargetFunction(undefined, `${ASSIST_CHAR}::技能威力*0.7`)).toBe(0)
            expect(solo.validateAST(`${ASSIST_CHAR}::技能威力`)).toContain(`无效命名空间: "${ASSIST_CHAR}"`)
        })
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        expect(main.evaluateAST(`${ASSIST_CHAR}::不存在的属性`)).toBe(0)
        // 未配置 2 号协战：别名可识别，取值为 0
        expect(main.evaluateAST("协战2::技能威力")).toBe(0)
    })

    it("协战自身名读自身当前属性；引用其他队友为 0，不递归", () => {
        const settings = createSameNameTeamSettings()
        const assist = createAssistBuildFromSettings(settings, "assist1")!
        const ownPower = assist.calculateAttributes().技能威力
        expect(ownPower).toBeGreaterThan(0)
        expect(assist.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBeCloseTo(ownPower, 6)
        expect(assist.evaluateAST(`${ASSIST_CHAR}::技能威力!`)).toBeCloseTo(ownPower, 6)
        // 主控姓名与另一队友别名都被 restricted 解析器识别为团队命名空间 → 干净 0（无 console.error）
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            expect(assist.evaluateAST(`${MAIN_CHAR}::技能威力`)).toBe(0)
            expect(assist.evaluateAST("协战2::技能威力")).toBe(0)
            expect(errorSpy).not.toHaveBeenCalled()
        } finally {
            errorSpy.mockRestore()
        }
    })

    it("clone() 重建解析器且表达式仍可求值", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const assistPower = createAssistBuildFromSettings(settings, "assist1")!.calculateAttributes().技能威力
        const cloned = main.clone()
        expect(cloned.teamRole).toBe("main")
        expect(cloned.teamResolver).toBeDefined()
        expect(cloned.teamResolver).not.toBe(main.teamResolver)
        expect(cloned.calculateTargetFunction(undefined, `${ASSIST_CHAR}::技能威力*0.7`)).toBeCloseTo(assistPower * 0.7, 6)
    })
})

describe("跨角色技能字段（技能名命名空间）", () => {
    const FEINA = charMap.get("菲娜")!
    // 真实数据里菲娜 E 技能带弯引号，表达式标识符需要移除词法器不接受的标点
    const FEINA_SKILL = "“在一个暖和的午后”"

    /** 构造主控 + 菲娜协战（E 技能名含弯引号）的配置 */
    function createFeinaAssistSettings() {
        const settings = createTeamSettings()
        settings.team1 = FEINA.id
        settings.assist1 = { ...settings.assist1, charLevel: 80, charSkillLevel: [10, 10, 10], baseName: FEINA_SKILL }
        return normalizeCharSettings(settings)
    }

    it("主控按协战技能名读取字段，与协战自身 e:: 结果一致", () => {
        const settings = createFeinaAssistSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const assist = createAssistBuildFromSettings(settings, "assist1")!
        const skill = assist.skills.find(s => s.名称 === FEINA_SKILL)!
        const field = skill.字段.find(f => f.名称 === "神智消耗")!
        expect(skill.exprName).toBe("在一个暖和的午后")
        expect(field.exprName).toBe("神智消耗")
        const expression = `${skill.exprName}::${field.exprName}`
        expect(assist.evaluateAST(expression)).toBeGreaterThan(0)
        expect(main.evaluateAST(expression)).toBeCloseTo(assist.evaluateAST(expression), 6)
        expect(main.validateAST(expression)).toBeUndefined()
        expect(main.evaluateAST(`${skill.exprName}::不存在的字段`)).toBe(0)
        expect(main.validateAST(`${skill.exprName}::不存在的字段`)).toContain(`找不到标识符: "${skill.exprName}::不存在的字段"`)
        expect(main.validateAST(`${skill.exprName}::min(1)`)).toContain(`技能命名空间不支持函数: "${skill.exprName}::min"`)
    })

    it("协战技能命名空间只认已配置协战：未配置时为无效命名空间", () => {
        const solo = createCharBuildFromSettings(MAIN_ID, normalizeCharSettings(createDefaultCharSettings()))
        silenceConsoleError(() => {
            expect(solo.validateAST("在一个暖和的午后::神智消耗")).toContain('无效命名空间: "在一个暖和的午后"')
        })
    })

    it("协战缺武器时技能命名空间仍注册，求值为 0", () => {
        const settings = createFeinaAssistSettings()
        settings.team1Weapon = "-"
        const normalized = normalizeCharSettings(settings)
        expect(createAssistBuildFromSettings(normalized, "assist1")).toBeUndefined()
        const main = createCharBuildFromSettings(MAIN_ID, normalized)
        const expression = "在一个暖和的午后::神智消耗"
        expect(main.validateAST(expression)).toBeUndefined()
        silenceConsoleError(() => {
            expect(main.evaluateAST(expression)).toBe(0)
        })
    })
})

describe("validateAST 团队命名空间", () => {
    it("接受协战属性，拒绝团队函数与未知属性", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        expect(main.validateAST(`${ASSIST_CHAR}::技能威力`)).toBeUndefined()
        expect(main.validateAST(`${ASSIST_CHAR}::技能威力!`)).toBeUndefined()
        expect(main.validateAST("协战1::技能威力")).toBeUndefined()
        expect(main.validateAST(`${ASSIST_CHAR}::min(1)`)).toContain(`团队命名空间不支持函数: "${ASSIST_CHAR}::min"`)
        expect(main.validateAST("不存在的角色::技能威力")).toContain('无效命名空间: "不存在的角色"')
        expect(main.validateAST(`${ASSIST_CHAR}::技能威利`)).toContain(`找不到标识符: "${ASSIST_CHAR}::技能威利"`)
    })

    it("团队命名空间函数在求值路径返回 0，不抛异常", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        silenceConsoleError(() => {
            expect(() => main.evaluateAST(`${ASSIST_CHAR}::min(1)`)).not.toThrow()
            expect(main.evaluateAST(`${ASSIST_CHAR}::min(1)`)).toBe(0)
        })
    })
})

describe("P1/P2 隔离：协战命名空间 / 函数体 / 校验", () => {
    it("协战命名空间拒绝括号伪字段与 DOT伤害，不回落主控面板", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const assistPower = createAssistBuildFromSettings(settings, "assist1")!.calculateAttributes().技能威力
        expect(main.calculateAttributes().攻击).toBeGreaterThan(0)
        expect(main.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBeCloseTo(assistPower, 6)
        expect(main.evaluateAST(`${ASSIST_CHAR}::[攻击]`)).toBe(0)
        expect(main.evaluateAST(`${ASSIST_CHAR}::[近战]`)).toBe(0)
        expect(main.evaluateAST(`${ASSIST_CHAR}::[攻击]!`)).toBe(0)
        expect(main.evaluateAST(`${ASSIST_CHAR}::DOT伤害`)).toBe(0)
        expect(main.validateAST(`${ASSIST_CHAR}::[攻击]`)).toContain(`找不到标识符: "${ASSIST_CHAR}::[攻击]"`)
        expect(main.validateAST(`${ASSIST_CHAR}::[近战]`)).toContain(`找不到标识符: "${ASSIST_CHAR}::[近战]"`)
        expect(main.validateAST(`${ASSIST_CHAR}::[攻击]!`)).toContain(`找不到标识符: "${ASSIST_CHAR}::[攻击]"`)
        expect(main.validateAST(`${ASSIST_CHAR}::DOT伤害`)).toContain(`找不到标识符: "${ASSIST_CHAR}::DOT伤害"`)
    })

    it("自定义函数体内的团队引用：已配置按协战取值，未配置 / 未知姓名不回退主控", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        const assistPower = createAssistBuildFromSettings(settings, "assist1")!.calculateAttributes().技能威力
        main.customVariables = [
            ["f()", `${ASSIST_CHAR}::技能威力`],
            ["g()", "协战1::技能威力"],
        ]
        expect(main.evaluateAST("f()")).toBeCloseTo(assistPower, 6)
        expect(main.evaluateAST("g()")).toBeCloseTo(assistPower, 6)
        // 未知姓名（拼错）：函数体未 bind，也不得回落主控属性
        main.customVariables = [["h()", "扶疏疏::技能威力"]]
        expect(main.evaluateAST("h()")).toBe(0)

        const solo = createCharBuildFromSettings(MAIN_ID, normalizeCharSettings(createDefaultCharSettings()))
        expect(solo.calculateAttributes().技能威力).toBeGreaterThan(0)
        solo.customVariables = [["f()", `${ASSIST_CHAR}::技能威力`]]
        expect(solo.evaluateAST("f()")).toBe(0)
    })

    it("validateAST 的团队分支不触发 attrOf", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        // 无团队 BUFF：面板计算不会顺带求值跨角色表达式（含 BUFF attr 的场景见报告 U89a-fix2）
        let calls = 0
        main.teamResolver = {
            namespaces: () => [ASSIST_CHAR, "协战1", "assist1"],
            isTeamNamespace: ns => ns === ASSIST_CHAR || ns === "协战1" || ns === "assist1",
            attrOf: ns => {
                calls += 1
                throw new Error(`validateAST 不应调用 attrOf: ${ns}`)
            },
        }
        expect(main.validateAST(`${ASSIST_CHAR}::技能威力`)).toBeUndefined()
        expect(main.validateAST("协战1::技能威力")).toBeUndefined()
        expect(main.validateAST(`${ASSIST_CHAR}::技能威利`)).toContain(`找不到标识符: "${ASSIST_CHAR}::技能威利"`)
        expect(calls).toBe(0)
    })

    it("扶疏::DOT伤害 在非零主控 DOT 下仍为 0", () => {
        const lise = createCharBuildFromSettings(liseFireBuildCharId, liseFireBuildSettings)
        expect(lise.evaluateAST("DOT伤害")).toBeGreaterThan(0)
        // 求值 0 只是锁定：收口前 `getDotNamespaceSources("扶疏")` 同样返回空来源 → 0，
        // 真正的区分度来自下方 validateAST 报错（收口前因 `DOT伤害` 白名单假通过）
        expect(lise.evaluateAST(`${ASSIST_CHAR}::DOT伤害`)).toBe(0)
        expect(lise.validateAST(`${ASSIST_CHAR}::DOT伤害`)).toContain(`找不到标识符: "${ASSIST_CHAR}::DOT伤害"`)
    })

    it("自身名伪字段锁定 U89a 后行为（U89b 定稿前）", () => {
        const settings = createTeamSettings()
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        // 行为变更：收口前 `黎瑟::[攻击]` 走伪字段分支读主控面板（实测 866.99），现只读自身普通属性 → 0
        expect(main.evaluateAST(`${MAIN_CHAR}::[攻击]`)).toBe(0)
        expect(main.evaluateAST(`${MAIN_CHAR}::[近战]`)).toBe(0)
        // validate 仍按伪字段白名单通过（假通过口径待 U89b 定稿）
        expect(main.validateAST(`${MAIN_CHAR}::[攻击]`)).toBeUndefined()
        expect(main.validateAST(`${MAIN_CHAR}::[近战]`)).toBeUndefined()
        // 自身名 DOT伤害 维持自身面板口径（无 DOT 来源 → 0，validate 通过）
        expect(main.evaluateAST(`${MAIN_CHAR}::DOT伤害`)).toBe(0)
        expect(main.validateAST(`${MAIN_CHAR}::DOT伤害`)).toBeUndefined()
    })

    it("角色名每次从 charMap 现算：新建 resolver 识别临时角色名，既有 resolver 保持旧快照", () => {
        const settings = createTeamSettings()
        const before = createTeamResolver(settings, "assist1", () => undefined)!
        const tempId = 999999
        const tempName = "临时测试角色"
        charMap.set(tempId, { ...charMap.get(ASSIST_ID)!, id: tempId, 名称: tempName })
        try {
            // 新建 resolver 现算 charMap：新角色名立即可识别（模块级缓存会让此处失败）
            const after = createTeamResolver(settings, "assist1", () => undefined)!
            expect(after.isTeamNamespace(tempName)).toBe(true)
            expect(after.namespaces()).toContain(tempName)
            // 已存在的 resolver 是旧快照，属可接受语义（构建后数据包水合不回溯既有 build）
            expect(before.isTeamNamespace(tempName)).toBe(false)
        } finally {
            charMap.delete(tempId)
        }
        expect(createTeamResolver(settings, "assist1", () => undefined)!.isTeamNamespace(tempName)).toBe(false)
    })

    it("单条 BUFF 内多个团队引用只构造一次 peer", () => {
        const settings = createTeamSettings()
        let peerBuilds = 0
        const hook = CharBuild.createTeamResolver
        try {
            CharBuild.createTeamResolver = (s, role) =>
                createTeamResolver(s, role, side => {
                    peerBuilds += 1
                    return createAssistBuildFromSettings(s, side)
                })
            const main = createCharBuildFromSettings(MAIN_ID, settings)
            expect(peerBuilds).toBe(0)
            main.buffs.push(
                new LeveledBuff({
                    名称: "双团队引用",
                    描述: "测试用",
                    attr: { 技能威力: `${ASSIST_CHAR}::技能威力*0.7+协战1::技能威力*0.1` },
                })
            )
            const baseline = main.calculateAttributes().技能威力
            expect(baseline).toBeGreaterThan(1)
            expect(peerBuilds).toBe(1)
        } finally {
            CharBuild.createTeamResolver = hook
        }
    })

    it("协战 clone() 保持 restricted 解析器与自身名行为", () => {
        const settings = createSameNameTeamSettings()
        const peer = createAssistBuildFromSettings(settings, "assist1")!
        const cloned = peer.clone()
        expect(cloned.teamRole).toBe("assist1")
        expect(cloned.teamResolver).toBeDefined()
        expect(cloned.teamResolver).not.toBe(peer.teamResolver)
        expect(cloned.teamResolver!.isTeamNamespace(MAIN_CHAR)).toBe(true)
        expect(cloned.teamResolver!.attrOf(MAIN_CHAR, "技能威力")).toBeUndefined()
        const ownPower = cloned.calculateAttributes().技能威力
        expect(cloned.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBeCloseTo(ownPower, 6)
        expect(cloned.evaluateAST("协战1::技能威力")).toBe(0)
    })

    it("hook 未注册时团队表达式为 0，自身角色名仍读当前面板", () => {
        const settings = createTeamSettings()
        const hook = CharBuild.createTeamResolver
        try {
            CharBuild.createTeamResolver = undefined
            const build = createCharBuildFromSettings(MAIN_ID, settings)
            expect(build.teamResolver).toBeUndefined()
            const ownPower = build.calculateAttributes().技能威力
            expect(build.evaluateAST(`${MAIN_CHAR}::技能威力`)).toBeCloseTo(ownPower, 6)
            silenceConsoleError(() => {
                expect(build.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBe(0)
            })
        } finally {
            CharBuild.createTeamResolver = hook
        }
    })

    it("协战 build 的 validateAST 覆盖自身名 / 别名 / 未知属性 / 团队函数", () => {
        const settings = createSameNameTeamSettings()
        const peer = createAssistBuildFromSettings(settings, "assist1")!
        expect(peer.validateAST(`${ASSIST_CHAR}::技能威力`)).toBeUndefined()
        expect(peer.validateAST("协战1::技能威力")).toBeUndefined()
        expect(peer.validateAST(`${MAIN_CHAR}::技能威力`)).toBeUndefined()
        expect(peer.validateAST("协战1::技能威利")).toContain(`找不到标识符: "协战1::技能威利"`)
        expect(peer.validateAST("协战1::min(1)")).toContain("团队命名空间不支持函数")
        expect(peer.validateAST("不存在的角色::技能威力")).toContain('无效命名空间: "不存在的角色"')
    })
})

describe("resolver 查询契约（U89b1-fix）", () => {
    it("assistN.enabled 只控制合计参与，不拦截角色名::属性 查询", () => {
        const settings = createTeamSettings()
        const enabledValue = createCharBuildFromSettings(MAIN_ID, settings).evaluateAST(`${ASSIST_CHAR}::技能威力`)
        expect(enabledValue).toBeGreaterThan(0)

        const disabled = normalizeCharSettings({ ...settings, assist1: { ...settings.assist1, enabled: false } })
        expect(disabled.assist1.enabled).toBe(false)
        const disabledBuild = createCharBuildFromSettings(MAIN_ID, disabled)
        expect(disabledBuild.teamResolver).toBeDefined()
        expect(disabledBuild.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBeCloseTo(enabledValue as number, 6)
        expect(disabledBuild.evaluateAST("协战1::技能威力")).toBeCloseTo(enabledValue as number, 6)
    })

    it("协战缺武器时不可查询：值为 0 且不打印命名空间错误", () => {
        const settings = createTeamSettings()
        settings.team1Weapon = "-"
        const normalized = normalizeCharSettings(settings)
        // 命名空间仍注册（角色存在），但无可查询面板
        expect(createAssistBuildFromSettings(normalized, "assist1")).toBeUndefined()
        const main = createCharBuildFromSettings(MAIN_ID, normalized)
        expect(main.teamResolver).toBeDefined()
        expect(main.teamResolver!.isTeamNamespace(ASSIST_CHAR)).toBe(true)
        expect(main.teamResolver!.attrOf(ASSIST_CHAR, "技能威力")).toBeUndefined()
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            expect(main.evaluateAST(`${ASSIST_CHAR}::技能威力`)).toBe(0)
            expect(main.evaluateAST("协战1::技能威力")).toBe(0)
            expect(error).not.toHaveBeenCalled()
        } finally {
            error.mockRestore()
        }
    })

    it("assist2 可按角色名与槽位别名查询，且与 assist1 互不串值", () => {
        const settings = createTeamSettings()
        settings.team2 = ASSIST_ID
        settings.team2Weapon = 10302
        settings.assist2 = {
            ...settings.assist2,
            charLevel: 80,
            charSkillLevel: [10, 10, 10],
            baseName: settings.assist1.baseName,
            customBuff: [["技能威力", 1.1]],
        }
        const normalized = normalizeCharSettings(settings)
        const main = createCharBuildFromSettings(MAIN_ID, normalized)
        const firstPower = createAssistBuildFromSettings(normalized, "assist1")!.calculateAttributes().技能威力
        const secondPower = createAssistBuildFromSettings(normalized, "assist2")!.calculateAttributes().技能威力
        expect(secondPower).not.toBeCloseTo(firstPower, 6)
        expect(main.evaluateAST("协战2::技能威力")).toBeCloseTo(secondPower, 6)
        expect(main.evaluateAST("assist2::技能威力")).toBeCloseTo(secondPower, 6)
        expect(main.evaluateAST("协战1::技能威力")).toBeCloseTo(firstPower, 6)
    })
})

describe("U99b E/Q/P 技能等级加成属性", () => {
    /** 主控家族被动技能等级词条 1040 满值：roll 1 + 太古 +2 + 最终精锻 +1 = 8（项链 = 装备位 6） */
    const mainPassiveLevelGear = (slotId: number) => ({
        slotId,
        affixId: 1040,
        rollLevel: 1,
        masterworkLevel: 0,
        ancient: true,
        finalMasterwork: true,
    })

    /** 被动技能等级词条 1512 满值（按部位映射：协战典籍 = 装备位 11/15） */
    const assistPassiveLevelGear = (slotId: number) => ({ ...mainPassiveLevelGear(slotId), affixId: 1512 })

    /** 关闭两侧溯源：本组用例只验证技能等级词条口径（U114 起非菲娜 3/5 根源也会提供等级增量） */
    const withoutTrace = (settings: ReturnType<typeof createTeamSettings>) => {
        settings.traceOffRoots = resolveTraceOffRoots(undefined, 0, MAIN_ID)
        settings.assist1 = { ...settings.assist1, traceOffRoots: resolveTraceOffRoots(undefined, 0, ASSIST_ID) }
        return settings
    }

    it("主控表达式读取的是等级加成（属性值），不是最终等级", () => {
        const settings = withoutTrace(createTeamSettings())
        settings.charSkillLevel = [10, 9, 7]
        settings.targetFunction = "E技能等级+Q技能等级+P技能等级"
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        // 无升华来源：加成池为 0，最终等级仍按基础三元组装配
        expect(main.calculate()).toBe(0)
        expect(main.evaluateAST("角色::E技能等级!")).toBe(0)
        expect(main.getSkillLevel(0)).toBe(10)
    })

    it("升华装备加成进入属性池，表达式读取 +8", () => {
        const settings = withoutTrace(createTeamSettings())
        settings.charSkillLevel = [10, 10, 10]
        settings.transcend = { ...settings.transcend, enabled: true, mainGear: [mainPassiveLevelGear(6)] }
        settings.targetFunction = "P技能等级"
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        expect(main.calculate()).toBe(8)
        expect(main.getSkillLevel(2)).toBe(18)
        expect(main.calculateAttributes().P技能等级).toBe(8)
    })

    it("角色名::P技能等级 读取协战侧的等级加成", () => {
        const settings = withoutTrace(createTeamSettings())
        settings.assist1 = { ...settings.assist1, charSkillLevel: [10, 10, 10] }
        settings.transcend = { ...settings.transcend, enabled: true, assist1Gear: [assistPassiveLevelGear(11)] }
        settings.targetFunction = `${ASSIST_CHAR}::P技能等级`
        const main = createCharBuildFromSettings(MAIN_ID, settings)
        expect(main.calculate()).toBe(8)
        expect(main.evaluateAST(`${ASSIST_CHAR}::P技能等级!`)).toBe(8)
        // 主控自身不被协战装备影响
        expect(main.calculateAttributes().P技能等级).toBe(0)
        const assist = createAssistBuildFromSettings(settings, "assist1")!
        expect(assist.calculateAttributes().P技能等级).toBe(8)
        expect(assist.getSkillLevel(2)).toBe(18)
    })
})

describe("旧 fixture 回归", () => {
    /** 去掉等级来源 BUFF（其表达式按技能字段求值，必须依赖协战解析器），只比较静态 BUFF 路径 */
    const withoutSkillLevelBuffs = (settings: typeof liseFireBuildSettings) =>
        normalizeCharSettings({ ...settings, buffs: settings.buffs.filter(([name]) => !buffMap.get(name)?.等级来源) })

    it("已配置协战但手动 BUFF 不含技能字段表达式时，数值与未启用解析器完全一致", () => {
        const shardSettings = withoutSkillLevelBuffs(shardBuild1Settings)
        const liseSettings = withoutSkillLevelBuffs(liseFireBuildSettings)
        const shard = createCharBuildFromSettings(shardBuild1CharId, shardSettings)
        const lise = createCharBuildFromSettings(liseFireBuildCharId, liseSettings)
        // 两侧都已配置协战 id，解析器随 settings 派生
        expect(shard.teamResolver).toBeDefined()
        expect(lise.teamResolver).toBeDefined()

        const hook = CharBuild.createTeamResolver
        try {
            CharBuild.createTeamResolver = undefined
            const shardReference = createCharBuildFromSettings(shardBuild1CharId, shardSettings)
            const liseReference = createCharBuildFromSettings(liseFireBuildCharId, liseSettings)
            expect(shardReference.teamResolver).toBeUndefined()
            expect(liseReference.teamResolver).toBeUndefined()
            expect(shard.calculate()).toBeCloseTo(shardReference.calculate(), 6)
            expect(lise.calculate()).toBeCloseTo(liseReference.calculate(), 6)
        } finally {
            CharBuild.createTeamResolver = hook
        }
    })

    it("liseFireBuild golden：技能威力与目标值锁定（P1/P2 前后一致）", () => {
        const lise = createCharBuildFromSettings(liseFireBuildCharId, liseFireBuildSettings)
        expect(lise.calculateAttributes().技能威力).toBeCloseTo(8.77376, 6)
        // U99c：扶疏被动 / 煜明被动 改为技能字段表达式，按来源侧有效等级取值
        // U114：3/5 根源原文解析出 E/Q/P +2；基础等级上限修正为 10（旧 fixture 的 12 = 10 基础 + 2 溯源）
        expect(lise.calculate()).toBeCloseTo(6674376021.747875, 3)
    })
})
