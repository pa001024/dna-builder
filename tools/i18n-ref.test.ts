import { describe, expect, it } from "vitest"
import { buildTextMapIndex, searchTextMap } from "./i18n"

/** 模拟 TextMap_I18n：一条记录同时带六语言字段 */
const i18nRows = {
    Attr_ATK_Name: {
        TextMapContent: "攻击",
        ContentEN: "ATK",
        ContentJP: "攻撃力",
        ContentKR: "공격",
        ContentFR: "ATQ",
        ContentTC: "攻擊",
    },
    Attr_HP_Name: { TextMapContent: "生命", ContentEN: "HP", ContentJP: "HP", ContentKR: "HP", ContentFR: "PV", ContentTC: "生命" },
    SKILL_DESC_ATK: { TextMapContent: "攻击", ContentEN: "ATK" },
    Attr_WeaponATKRate: { TextMapContent: "普通近战武器攻击力", ContentEN: "Standard Melee Weapon ATK" },
}

/** 模拟分片：覆盖主索引旧文案，并带一条主索引没有的 ID */
const shards = {
    cn: {
        Attr_WeaponATKRate: { TextMapContent: "普通近战武器基础攻击力" },
        Mon_Name_8528001: { TextMapContent: "恒常者" },
    },
}

describe("buildTextMapIndex", () => {
    it("分片值覆盖 TextMap_I18n，分片独有 ID 一并并入", () => {
        const index = buildTextMapIndex(i18nRows, shards)
        expect(index.get("Attr_WeaponATKRate")?.cn).toBe("普通近战武器基础攻击力")
        expect(index.get("Mon_Name_8528001")?.cn).toBe("恒常者")
        expect(index.size).toBe(5)
    })

    it("缺失语言字段落为空串", () => {
        const index = buildTextMapIndex(i18nRows, shards)
        expect(index.get("Attr_WeaponATKRate")).toEqual({
            cn: "普通近战武器基础攻击力",
            en: "Standard Melee Weapon ATK",
            jp: "",
            kr: "",
            fr: "",
            tc: "",
        })
    })
})

describe("searchTextMap", () => {
    it("中文全字命中排在子串命中之前", () => {
        const matches = searchTextMap(buildTextMapIndex(i18nRows, shards), "攻击")
        expect(matches.map(match => match.id)).toEqual(["Attr_ATK_Name", "SKILL_DESC_ATK", "Attr_WeaponATKRate"])
        expect(matches[0].hits).toEqual(["cn"])
    })

    it("能搜到只在分片里出现的新译名", () => {
        const matches = searchTextMap(buildTextMapIndex(i18nRows, shards), "基础攻击力")
        expect(matches.map(match => match.id)).toEqual(["Attr_WeaponATKRate"])
    })

    it("TextMapId 全字命中排最前", () => {
        const matches = searchTextMap(buildTextMapIndex(i18nRows, shards), "Attr_HP_Name")
        expect(matches[0]).toMatchObject({ id: "Attr_HP_Name", rank: 0, hits: [] })
    })

    it("--exact 只认全字相等", () => {
        const index = buildTextMapIndex(i18nRows, shards)
        expect(searchTextMap(index, "攻击", { exact: true }).map(match => match.id)).toEqual(["Attr_ATK_Name", "SKILL_DESC_ATK"])
        expect(searchTextMap(index, "攻", { exact: true })).toEqual([])
    })

    it("--lang 限定参与匹配的语言", () => {
        const index = buildTextMapIndex(i18nRows, shards)
        expect(searchTextMap(index, "PV", { langs: ["en"] })).toEqual([])
        expect(searchTextMap(index, "PV", { langs: ["fr"] })[0]).toMatchObject({ id: "Attr_HP_Name", hits: ["fr"] })
    })

    it("英文匹配大小写不敏感", () => {
        const matches = searchTextMap(buildTextMapIndex(i18nRows, shards), "atk", { langs: ["en"] })
        expect(matches.map(match => match.id)).toContain("Attr_ATK_Name")
        expect(matches.find(match => match.id === "Attr_ATK_Name")?.hits).toEqual(["en"])
    })
})
