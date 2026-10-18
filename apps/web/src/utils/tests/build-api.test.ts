import { beforeAll, describe, expect, it } from "vitest"
import { ref } from "vue"
import { createDefaultCharSettings, normalizeCharSettings } from "@/composables/useCharSettings"
import { CharBuild, LeveledChar, LeveledWeapon } from "@/data"
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
