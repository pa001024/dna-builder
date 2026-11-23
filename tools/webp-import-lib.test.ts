import { describe, expect, it } from "vitest"
import { collectDnaSeasonImageUrls, compileFilter, matchesFilter, resolveFilterRaw, type SeasonImageSource } from "./webp-import-lib"

describe("collectDnaSeasonImageUrls", () => {
    it("按页面口径枚举四张表的全部图标字段", () => {
        const source: SeasonImageSource = {
            seasons: [{ image: "T_Season_01_ImageQuest", commissions: [{ image: "T_Season_Depute_01" }, {}] }],
            buffTypes: [{ icon: "T_Season_DropBuff_01", smallIcon: "T_Season_MiniDropBuff_01" }, {}],
            baseNames: [{ icon: "T_Season_010101" }, {}],
            uniqueEquips: [{ icon: "T_Season_DG_0901" }],
            generateGroups: [{ icon: "T_Coin_Main_Lv3" }],
            stages: [{ icon: "T_Rouge_Talent_ATK" }],
            talents: [{ icon: "T_Rouge_Talent_CriUP" }, {}],
            challenges: [{ icon: "T_Season_IconTrial01" }],
        }

        expect(collectDnaSeasonImageUrls(source)).toEqual([
            "/imgs/webp/T_Season_01_ImageQuest.webp",
            "/imgs/webp/T_Season_Depute_01.webp",
            "/imgs/webp/T_Season_DropBuff_01.webp",
            "/imgs/webp/T_Season_MiniDropBuff_01.webp",
            "/imgs/res/T_Season_010101.webp",
            "/imgs/res/T_Season_DG_0901.webp",
            "/imgs/res/T_Coin_Main_Lv3.webp",
            "/imgs/webp/T_Rouge_Talent_ATK.webp",
            "/imgs/webp/T_Rouge_Talent_CriUP.webp",
            "/imgs/webp/T_Season_IconTrial01.webp",
        ])
    })

    it("忽略缺省字段，不对空数据产生 URL", () => {
        const empty: SeasonImageSource = {
            seasons: [],
            buffTypes: [],
            baseNames: [],
            uniqueEquips: [],
            generateGroups: [],
            stages: [],
            talents: [],
            challenges: [],
        }

        expect(collectDnaSeasonImageUrls(empty)).toEqual([])
    })
})

describe("resolveFilterRaw", () => {
    it("命令行优先于环境变量", () => {
        expect(resolveFilterRaw("^res/", "^webp/")).toBe("^res/")
    })

    it("未传命令行时回退环境变量", () => {
        expect(resolveFilterRaw(undefined, "^webp/")).toBe("^webp/")
    })

    it("两者都没有时返回 undefined", () => {
        expect(resolveFilterRaw(undefined, undefined)).toBeUndefined()
    })
})

describe("compileFilter", () => {
    it("合法正则忽略大小写", () => {
        const { regex, error } = compileFilter("^res/t_season_")
        expect(error).toBeNull()
        expect(matchesFilter(regex, "res/T_Season_DG_0901.webp")).toBe(true)
    })

    it("非法正则返回错误而不是抛异常", () => {
        const { regex, error } = compileFilter("[")
        expect(regex).toBeNull()
        expect(error).toBeTruthy()
    })

    it("未设置过滤器时全部命中", () => {
        const { regex } = compileFilter(undefined)
        expect(matchesFilter(regex, "res/T_Season_010101.webp")).toBe(true)
        expect(matchesFilter(regex, "webp/T_Head_Empty.webp")).toBe(true)
    })
})

describe("matchesFilter", () => {
    it("按相对 public/imgs 的目标路径匹配", () => {
        const { regex } = compileFilter("^(res|webp)/(T_Season_|T_Rouge_Talent_)")
        expect(matchesFilter(regex, "res/T_Season_010101.webp")).toBe(true)
        expect(matchesFilter(regex, "webp/T_Rouge_Talent_ATK.webp")).toBe(true)
        expect(matchesFilter(regex, "webp/T_Head_Empty.webp")).toBe(false)
        expect(matchesFilter(regex, "fashion/T_Fashion_Back01_01.webp")).toBe(false)
    })
})
