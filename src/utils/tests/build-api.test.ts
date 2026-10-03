import { beforeAll, describe, expect, it } from "vitest"
import { ref } from "vue"
import { createDefaultCharSettings, normalizeCharSettings } from "@/composables/useCharSettings"
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
})
