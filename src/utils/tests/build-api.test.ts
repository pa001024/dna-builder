import { beforeAll, describe, expect, it } from "vitest"
import { ref } from "vue"
import { createDefaultCharSettings, normalizeCharSettings } from "@/composables/useCharSettings"
import { isPetRelatedBuffName } from "@/data/petTrait"
import { BUILD_API_DTS } from "@/shared/buildApiContract"
import { type BuildApiHost, createBuildApi } from "@/utils/build-api"

function contractFields(): string[] {
    const start = BUILD_API_DTS.indexOf("export interface CharSettings {")
    const block = BUILD_API_DTS.slice(start, BUILD_API_DTS.indexOf("\n}", start))
    return [...block.matchAll(/^\s{4}(\w+)\??:/gm)].map(match => match[1])
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
        expect(Object.keys(raw)).toEqual(Object.keys(createDefaultCharSettings()))

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
        const target = (await api.data.effects({ source: "mod" }))[0]
        await api.mods({ type: "角色", list: [{ id: target.id, level: 10 }] })
        const hit = (await api.state()).effects.find(item => item.id === target.id)
        expect(hit).toMatchObject({ source: "mod", name: target.owner, level: target.maxLevel, maxLevel: target.maxLevel })
    })
})
