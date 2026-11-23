import { beforeAll, describe, expect, it, vi } from "vitest"
import { ref } from "vue"
import { createDefaultCharSettings, normalizeCharSettings, serializeCharSettings } from "@/composables/useCharSettings"
import { CharBuild, charMap, createMaxedReachableTalentLevels, LeveledChar, LeveledWeapon } from "@/data"
import { createAssistBuildFromSettings, createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { isPetRelatedBuffName } from "@/data/petTrait"
import { BUILD_API_DTS } from "@/shared/buildApiContract"
import { type BuildApiHost, createBuildApi } from "@/utils/build-api"

function contractFields(): string[] {
    const start = BUILD_API_DTS.indexOf("export interface CharSettings {")
    const block = BUILD_API_DTS.slice(start, BUILD_API_DTS.indexOf("\n}", start))
    return [...block.matchAll(/^\s{4}(\w+)\??:/gm)].map(match => match[1])
}

/**
 * 测试用真构筑（黎瑟/雷 + 铸铁者/重剑切割 + 烈焰孤沙）：生产环境宿主恒提供有效构筑，
 * 可装备校验依赖它做类型 / 属性 / 限定判定，脚手架必须同样给（不能传 null 绕过）。
 */
function makeTestBuild() {
    return new CharBuild({
        char: new LeveledChar("黎瑟"),
        skillLevel: 10,
        hpPercent: 0.5,
        resonanceGain: 2,
        charMods: [],
        buffs: [],
        melee: new LeveledWeapon(10302),
        ranged: new LeveledWeapon(20601),
        baseName: "快速出击",
        enemyId: 130,
        enemyLevel: 80,
        enemyResistance: 0.5,
        targetFunction: "伤害",
    })
}

function makeApi() {
    const host = {
        charSettings: ref(normalizeCharSettings(createDefaultCharSettings())),
        selectedChar: ref("法露茜"),
        charBuild: ref(null),
        inv: undefined,
        setChar: () => {},
    } as unknown as BuildApiHost
    return createBuildApi(host)
}

/**
 * 带库存桩的宿主：getModCount 返回拥有数量，用于验证数量上限拦截。
 * @param owned 桩库存中每种 MOD 的拥有数
 */
function makeModApi(owned = 8) {
    const host = {
        charSettings: ref(normalizeCharSettings(createDefaultCharSettings())),
        selectedChar: ref("黎瑟"),
        charBuild: ref(makeTestBuild()),
        inv: { getModCount: () => owned },
        setChar: () => {},
    } as unknown as BuildApiHost
    return createBuildApi(host)
}

describe("契约里的 CharSettings", () => {
    it("字段与配装页存的那份逐一对得上（防止改了设置类型忘了同步契约）", () => {
        expect(contractFields()).toEqual(Object.keys(createDefaultCharSettings()))
    })
})

describe("createBuildApi", () => {
    let api: ReturnType<typeof createBuildApi>
    let charId = 0

    beforeAll(async () => {
        api = makeApi()
        charId = (await api.data.chars({ keyword: "法露茜" }))[0]?.id ?? 0
    })

    it("raw 给出可自由改写的完整设置", async () => {
        const raw = await api.raw()
        // 未配置的 actions 会在序列化时直接省略（简化配置文件大小），其余字段与默认值逐一对得上
        const { actions: _defaultActions, ...defaultRest } = createDefaultCharSettings()
        expect(Object.keys(raw)).toEqual(Object.keys(defaultRest))
        expect("actions" in raw).toBe(false)

        raw.enemyResistance = -4
        expect((await api.raw()).enemyResistance).not.toBe(-4)

        raw.customVariables = [["测试", "1 + 1"]]
        expect(await api.import(raw)).toMatchObject({ ok: true })
        expect((await api.raw()).customVariables).toEqual([["测试", "1 + 1"]])
    })

    it("raw 对非归一化宿主也返回完整内存结构且无压缩载荷（U96-fix）", async () => {
        const settings = createDefaultCharSettings()
        settings.transcend = {
            ...settings.transcend,
            enabled: true,
            talentLevels: createMaxedReachableTalentLevels(),
            mainGear: [{ slotId: 1, affixId: 102, rollLevel: 10, masterworkLevel: 0, ancient: false, finalMasterwork: false }],
        }
        const compressed = JSON.parse(serializeCharSettings(settings))
        // 宿主直接塞入压缩载荷 + 大量缺失字段的原始对象
        const host = {
            charSettings: ref({ baseName: "普通攻击", transcend: compressed.transcend }),
            selectedChar: ref("法露茜"),
            charBuild: ref(null),
            inv: undefined,
            setChar: () => {},
        } as unknown as BuildApiHost
        const raw = await createBuildApi(host).raw()

        expect(raw.transcend.talentLevels).toHaveLength(createMaxedReachableTalentLevels().length)
        expect(Array.isArray(raw.transcend.gearVariants[0])).toBe(false)
        expect(Array.isArray(raw.transcend.gearVariants[0].mainGear)).toBe(true)
        expect(Array.isArray(raw.transcend.mainGear)).toBe(true)
        expect((raw.transcend.mainGear[0] as { slotId: number }).slotId).toBe(1)
        expect("actions" in raw).toBe(false)
    })

    it("util 能归一化与序列化残缺设置", async () => {
        const full = await api.util.normalize({ enemyResistance: -4 })
        expect(Object.keys(full)).toEqual(Object.keys(createDefaultCharSettings()))
        expect(full.enemyResistance).toBe(-4)
        expect(JSON.parse(await api.util.serialize({}))).toMatchObject({ charLevel: 80 })
    })

    it("compute.build 能按角色 id 复现一份独立构筑", async () => {
        expect(charId).toBeGreaterThan(0)
        const base = await api.util.defaults()
        // 空 baseName + 空目标函数时目标函数结果为 0，先取一个真实技能名当计算技能
        const baseName = (await (await api.compute.build(charId, base)).skills())[0]
        const 属克 = await api.compute.build(charId, { ...base, baseName, enemyResistance: -4 })
        const 无属 = await api.compute.build(charId, { ...base, baseName, enemyResistance: 0 })

        expect(await 属克.damage()).toBeGreaterThan(0)
        expect(Object.keys(await 属克.attributes()).length).toBeGreaterThan(0)
        expect(await 属克.damage()).not.toBe(await 无属.damage())
        expect((await 属克.weapons()).近战).toBeTruthy()
        expect(await 属克.cost()).toHaveProperty("角色")
        expect(Array.isArray(await 属克.fullness())).toBe(true)
        expect(await 属克.skills()).toContain(baseName)
    })

    it("设置对象改写后能通过 simulate 只算不改", async () => {
        const raw = await api.raw()
        const 改 = { ...raw, baseName: "潜入夜色", enemyLevel: 100 }
        expect(await (await api.simulate(改)).damage()).toBeGreaterThan(0)
        expect((await api.raw()).enemyLevel).not.toBe(100)
    })

    it("compute 里的等级化对象返回的是纯数据（跨线程要能克隆）", async () => {
        const plain = await api.compute.char("法露茜", 80)
        expect(typeof plain).toBe("object")
        expect(JSON.stringify(plain)).toContain("法露茜")
    })

    it("data.effects 能枚举特效表并按来源 / 关键词过滤", async () => {
        const all = await api.data.effects()
        expect(all.length).toBeGreaterThan(0)
        expect(all.every(item => (item.source === "mod" || item.source === "weapon") && item.maxLevel >= 1)).toBe(true)
        expect(all.every(item => item.owner.length > 0)).toBe(true)

        const mods = await api.data.effects({ source: "mod" })
        expect(mods.length).toBeGreaterThan(0)
        expect(mods.every(item => item.source === "mod")).toBe(true)

        const hit = all[0]
        const byKeyword = await api.data.effects({ keyword: hit.owner })
        expect(byKeyword.some(item => item.source === hit.source && item.id === hit.id)).toBe(true)
    })

    it("data.buffs 的 available 口径与配装页 BUFF 面板一致", async () => {
        const all = await api.data.buffs({ limit: 100000 })
        const available = await api.data.buffs({ limit: 100000, scope: "available" })
        const availableNames = new Set(available.map(item => item.名称))
        expect(available.length).toBeLessThan(all.length)
        expect(available.every(item => item.maxLevel >= 1)).toBe(true)
        // 魔灵相关 BUFF 由魔灵面板接管，可用口径里不出现
        const petRelated = all.find(item => isPetRelatedBuffName(item.名称))
        expect(petRelated).toBeTruthy()
        expect(availableNames.has(petRelated!.名称)).toBe(false)
        // 限定为其他角色的 BUFF 不在可用口径里
        const other = all.find(item => typeof item.限定 === "number" && item.限定 !== charId)
        if (other) {
            expect(availableNames.has(other.名称)).toBe(false)
        }
    })

    it("state().effects 报告已装件的特效等级（未配置时按最大档生效）", async () => {
        // 写槽需构筑上下文做可装备校验：用带真构筑的宿主；首个特效来源是远程 MOD，装入类型匹配的槽
        const modApi = makeModApi()
        const target = (await modApi.data.effects({ source: "mod" }))[0]
        await modApi.mods({ type: "远程", list: [{ id: target.id, level: 10 }] })
        const hit = (await modApi.state()).effects.find(item => item.id === target.id)
        expect(hit).toMatchObject({ source: "mod", name: target.owner, level: target.maxLevel, maxLevel: target.maxLevel })
    })
})

describe("build.mod / mods / aura 可装备校验", () => {
    it("单槽：属性 / 类型 / 光环不符直接拒绝并说明原因", async () => {
        const api = makeModApi()
        // 11401 全盛·暗：黎瑟是雷属性
        const attr = await api.mod({ type: "角色", slot: 0, id: 11401 })
        expect(attr).toMatchObject({ ok: false })
        expect(String(attr.error)).toContain("属性")
        // 103001 无锋剑意是近战：装不上角色槽
        const type = await api.mod({ type: "角色", slot: 0, id: 103001 })
        expect(type).toMatchObject({ ok: false })
        expect(String(type.error)).toContain("近战")
        // 31502 旋刃是光环：指引去 aura
        const aura = await api.mod({ type: "角色", slot: 0, id: 31502 })
        expect(aura).toMatchObject({ ok: false })
        expect(String(aura.error)).toContain("aura")
    })

    it("单槽：合法写入成功并落到设置槽位", async () => {
        const api = makeModApi()
        expect(await api.mod({ type: "角色", slot: 0, id: 41001 })).toMatchObject({ ok: true })
        expect((await api.state()).mods.角色[0]).toMatchObject({ id: 41001 })
    })

    it("单槽：系列互斥拦截，同名非契约者拦截、契约者放行", async () => {
        const api = makeModApi()
        expect(await api.mod({ type: "角色", slot: 0, id: 31301 })).toMatchObject({ ok: true })
        const rival = await api.mod({ type: "角色", slot: 1, id: 51301 })
        expect(rival).toMatchObject({ ok: false })
        expect(String(rival.error)).toContain("互斥")
        // 31008 炽灼·涅槃（不死鸟）与海妖不冲突
        expect(await api.mod({ type: "角色", slot: 1, id: 31008 })).toMatchObject({ ok: true })
        // 同名第二张被拦
        const dupe = await api.mod({ type: "角色", slot: 2, id: 31008 })
        expect(dupe).toMatchObject({ ok: false })
        expect(String(dupe.error)).toContain("同名")
        // 41741 炽灼·涅槃（契约者/雷）：同名豁免且属性匹配，放行
        expect(await api.mod({ type: "角色", slot: 2, id: 41741 })).toMatchObject({ ok: true })
    })

    it("单槽：库存不足拒绝，同槽覆盖同张放行", async () => {
        const api = makeModApi(1)
        expect(await api.mod({ type: "角色", slot: 0, id: 41741 })).toMatchObject({ ok: true })
        const over = await api.mod({ type: "角色", slot: 1, id: 41741 })
        expect(over).toMatchObject({ ok: false })
        expect(String(over.error)).toContain("库存")
        // 同一槽位换等级属于覆盖自己，不受数量限制
        expect(await api.mod({ type: "角色", slot: 0, id: 41741, level: 5 })).toMatchObject({ ok: true })
    })

    it("批量：同批内的互斥与错槽一并拦截，合法整批写入", async () => {
        const api = makeModApi()
        await expect(api.mods({ type: "角色", list: [{ id: 31301 }, { id: 51301 }] })).resolves.toMatchObject({ ok: false })
        await expect(api.mods({ type: "角色", list: [{ id: 12101 }] })).resolves.toMatchObject({ ok: false })
        expect(await api.mods({ type: "角色", list: [{ id: 41001 }, { id: 41002 }, null] })).toMatchObject({ ok: true })
        const mods = (await api.state()).mods.角色
        expect(mods[0]).toMatchObject({ id: 41001 })
        expect(mods[1]).toMatchObject({ id: 41002 })
        expect(mods[2].id).toBeNull()
    })

    it("aura：非羽蛇拒绝，羽蛇放行", async () => {
        const api = makeModApi()
        await expect(api.aura(41001)).resolves.toMatchObject({ ok: false })
        expect(await api.aura(31502)).toMatchObject({ ok: true })
        // 41745 权能（雷）：黎瑟是雷属性，放行；41735 背水（火）：属性不符拒绝
        expect(await api.aura(41745)).toMatchObject({ ok: true })
        const mismatch = await api.aura(41735)
        expect(mismatch).toMatchObject({ ok: false })
        expect(String(mismatch.error)).toContain("属性")
    })
})

describe("build.weapon 灾厄唯一限制", () => {
    it("另一槽已装备灾厄武器时再装灾厄武器直接拒绝并说明原因", async () => {
        const api = makeModApi()
        // 10299 无止无休（近战灾厄），20298 血染织羽（远程灾厄）
        expect(await api.weapon({ slot: "melee", name: "无止无休" })).toMatchObject({ ok: true })
        const dupe = await api.weapon({ slot: "ranged", name: "血染织羽" })
        expect(dupe).toMatchObject({ ok: false })
        expect(String(dupe.error)).toContain("灾厄")
        expect(String(dupe.error)).toContain("无止无休")
        // 拒绝后槽位保持原值，不能留下第二把灾厄武器
        expect((await api.state()).melee).toMatchObject({ name: "无止无休" })
    })

    it("非灾厄武器不受影响，卸下旧灾厄后可正常换新", async () => {
        const api = makeModApi()
        expect(await api.weapon({ slot: "melee", name: "无止无休" })).toMatchObject({ ok: true })
        // 远程装普通武器放行
        expect(await api.weapon({ slot: "ranged", id: 20601 })).toMatchObject({ ok: true })
        // 近战换回普通武器放行（等价于先换下灾厄）
        expect(await api.weapon({ slot: "melee", id: 10302 })).toMatchObject({ ok: true })
        // 此时再装远程灾厄放行
        expect(await api.weapon({ slot: "ranged", name: "血染织羽" })).toMatchObject({ ok: true })
        expect((await api.state()).ranged).toMatchObject({ name: "血染织羽" })
    })
})

const CROSS_CHAR_MAIN = "黎瑟"
const CROSS_CHAR_ASSIST = "扶疏"

/**
 * 跨角色目标函数配置：主控 + 1 号协战完整 loadout，目标值直接读协战面板。
 * @returns 已归一化的角色配置
 */
function createCrossCharSettings() {
    const main = charMap.get(CROSS_CHAR_MAIN)
    const assist = charMap.get(CROSS_CHAR_ASSIST)
    if (!main || !assist) throw new Error("测试角色缺失")
    const settings = createDefaultCharSettings()
    settings.baseName = main.技能?.[0]?.名称 ?? ""
    settings.team1 = assist.id
    settings.team1Weapon = 10302
    settings.assist1 = {
        ...settings.assist1,
        charLevel: 70,
        charSkillLevel: [10, 10, 10],
        baseName: assist.技能?.[0]?.名称 ?? "",
        charMods: [[41001, 10], null, null, null, null, null, null, null],
        buffs: [["菲娜4溯", 10]],
        customBuff: [["技能威力", 0.6]],
    }
    settings.targetFunction = `${assist.名称}::技能威力*0.7`
    return normalizeCharSettings(settings)
}

describe("compute.build 跨角色目标函数（settings 驱动）", () => {
    it("协战 loadout 生效：目标值等于协战面板技能威力 × 0.7", async () => {
        const api = makeApi()
        const settings = createCrossCharSettings()
        const assist = createAssistBuildFromSettings(settings, "assist1")
        expect(assist).toBeDefined()
        expect(assist!.char.等级).toBe(70)
        const expected = assist!.calculateAttributes().技能威力 * 0.7
        expect(expected).toBeGreaterThan(0)

        const value = await (await api.compute.build(CROSS_CHAR_MAIN, settings)).damage()
        expect(value).toBeCloseTo(expected, 6)
    })

    it("协战已配置但缺武器：查询为 0 且不打印命名空间错误", async () => {
        const api = makeApi()
        const settings = createCrossCharSettings()
        settings.team1Weapon = "-"
        const normalized = normalizeCharSettings(settings)
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            expect(await (await api.compute.build(CROSS_CHAR_MAIN, normalized)).damage()).toBe(0)
            // 命名空间已注册（角色存在），只是没有可查询的面板：干净 0，不走报错路径
            expect(error).not.toHaveBeenCalled()
        } finally {
            error.mockRestore()
        }
    })

    it("完全未配置协战时表达式为 0（走无效命名空间路径，与 U89a 口径一致）", async () => {
        const api = makeApi()
        const settings = normalizeCharSettings(createDefaultCharSettings())
        settings.targetFunction = `${CROSS_CHAR_ASSIST}::技能威力`
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            expect(await (await api.compute.build(CROSS_CHAR_MAIN, settings)).damage()).toBe(0)
        } finally {
            expect(error).toHaveBeenCalled()
            error.mockRestore()
        }
    })

    it("2 号协战（assist2）同样按协战面板求值", async () => {
        const api = makeApi()
        const settings = createCrossCharSettings()
        // 把协战从 1 号挪到 2 号，loadout 与表达式保持一致
        settings.team1 = "-"
        settings.team1Weapon = "-"
        settings.team2 = charMap.get(CROSS_CHAR_ASSIST)!.id
        settings.team2Weapon = 10302
        settings.assist2 = { ...settings.assist1, charLevel: 65 }
        settings.assist1 = createDefaultCharSettings().assist1
        settings.targetFunction = `协战2::技能威力*0.7`

        const normalized = normalizeCharSettings(settings)
        const assist = createAssistBuildFromSettings(normalized, "assist2")
        expect(assist).toBeDefined()
        expect(assist!.char.等级).toBe(65)
        const expected = assist!.calculateAttributes().技能威力 * 0.7
        expect(expected).toBeGreaterThan(0)

        expect(await (await api.compute.build(CROSS_CHAR_MAIN, normalized)).damage()).toBeCloseTo(expected, 6)
    })
})

describe("worker realm 注册 CharBuild.createTeamResolver（U89b1-fix P1）", () => {
    /**
     * 在全新模块图里只加载 CharBuild 系列与目标 worker 模块，验证 hook 是否被注册、快照重建能否解析跨角色属性。
     * 隔离前提：仅加载 `CharBuildSnapshot` 时 `CharBuild.createTeamResolver` 必须仍是 undefined
     * （否则回归测试无法暴露「worker realm 漏 import helper」）。
     * @param modulePath 目标 worker 模块路径（其 import 图应包含 CharBuildHelper）
     */
    async function expectRealmRegistered(modulePath: string) {
        vi.resetModules()
        const [{ CharBuild }, snapshotModule] = await Promise.all([import("@/data/CharBuild"), import("@/data/CharBuildSnapshot")])
        expect(CharBuild.createTeamResolver).toBeUndefined()

        await import(modulePath)
        expect(typeof CharBuild.createTeamResolver).toBe("function")

        // hook 注册后用快照重建：协战属性可解析，且不打印命名空间错误
        const settings = createCrossCharSettings()
        const assistPower = createAssistBuildFromSettings(settings, "assist1")!.calculateAttributes().技能威力
        const snapshot = snapshotModule.createWorkerSnapshot(createCharBuildFromSettings(charMap.get(CROSS_CHAR_MAIN)!.id, settings))
        const restored = snapshotModule.createBuildFromSnapshot(snapshot)
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        try {
            expect(restored.evaluateAST(`${CROSS_CHAR_ASSIST}::技能威力`)).toBeCloseTo(assistPower, 6)
            expect(error).not.toHaveBeenCalled()
        } finally {
            error.mockRestore()
        }
    }

    it("build-sandbox-runtime 的 import 图注册 hook", async () => {
        await expectRealmRegistered("@/utils/build-sandbox-runtime")
    })

    it("transcend-gear/income-core 的 import 图注册 hook", async () => {
        await expectRealmRegistered("@/utils/transcend-gear/income-core")
    })
})
