import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { applyTranslationAliases, collectTitlePairs, collectTranslationPairs, TRANSLATION_ALIASES } from "./import-i18n-data"

const TEXT_MAP = JSON.parse(readFileSync("E:/dev/DuetNightAbyssData2/out/TextMap_I18n.json", "utf8")) as Record<
    string,
    Record<string, string>
>

describe("translations 对照表：全新生成 + 静态声明", () => {
    it("数组一律按下标配对（上游各语言同顺序渲染）", () => {
        const table = new Map<string, string>()
        collectTranslationPairs(
            [
                { id: 2052, 名称: "密函：雀舞云屏" },
                { id: 2053, 名称: "密函：风云决" },
            ],
            [
                { id: 2052, 名称: "密函：雀舞雲屏" },
                { id: 2053, 名称: "密函：風雲決" },
            ],
            table
        )
        expect(table.get("密函：雀舞云屏")).toBe("密函：雀舞雲屏")
        expect(table.get("密函：风云决")).toBe("密函：風雲決")
    })

    it("同 id 多行按下标配对（华彩殿堂·闪烁不取·9）", () => {
        const table = new Map<string, string>()
        collectTranslationPairs(
            [
                { id: 10041, t: "HeadFrame", n: "华彩殿堂·闪烁" },
                { id: 10041, t: "TitleFrame", n: "华彩殿堂·9" },
            ],
            [
                { id: 10041, t: "HeadFrame", n: "華彩殿堂·閃爍" },
                { id: 10041, t: "TitleFrame", n: "華彩殿堂·9" },
            ],
            table
        )
        expect(table.get("华彩殿堂·闪烁")).toBe("華彩殿堂·閃爍")
        expect(table.get("华彩殿堂·9")).toBe("華彩殿堂·9")
    })

    it("无 id 的数组按下标配对", () => {
        const table = new Map<string, string>()
        collectTranslationPairs([{ n: "铜币" }], [{ n: "銅幣" }], table)
        expect(table.get("铜币")).toBe("銅幣")
    })

    it("称号后缀只补缺不覆盖（丽蓓卡取角色名 Rebecca）", () => {
        const table = new Map<string, string>([["丽蓓卡", "Rebecca"]])
        collectTitlePairs(
            [
                { id: 20076, name: "丽蓓卡", suf: true, src: "成就「休憩一刻·丽蓓卡」" },
                { id: 10001, name: "富裕的", suf: false, src: "成就「喜悦的鸣响Ⅲ」" },
            ],
            [
                { id: 20076, name: " Rebecca", suf: true, src: "Achievements: A Little Get-Together: Rebecca" },
                { id: 10001, name: "Affluent", suf: false, src: "Achievements: Joyful Chime Ⅲ" },
            ],
            table
        )
        expect(table.get("丽蓓卡")).toBe("Rebecca")
        expect(table.get("富裕的")).toBe("Affluent")
        expect(table.get("成就「休憩一刻·丽蓓卡」")).toBe("Achievements: A Little Get-Together: Rebecca")
    })

    it("称号后缀缺键时补入（去前导空格）", () => {
        const table = new Map<string, string>()
        collectTitlePairs([{ id: 1, name: "队长", suf: true }], [{ id: 1, name: " Captain", suf: true }], table)
        expect(table.get("队长")).toBe("Captain")
    })

    it("位置配对只产出当期中文，旧名自然消失", () => {
        const table = new Map<string, string>()
        collectTranslationPairs(
            [{ name: "雀舞云屏的枪管" }, { name: "雀舞云屏" }],
            [{ name: "雀舞雲屏的槍管" }, { name: "雀舞雲屏" }],
            table
        )
        expect(table.get("雀舞云屏的枪管")).toBe("雀舞雲屏的槍管")
        expect(table.has("雀舞银屏的枪管")).toBe(false)
    })

    it("术语字典按索引配对键与值（交响→交響，解释同步跟上）", () => {
        const table = new Map<string, string>()
        collectTranslationPairs({ 术语解释: { 交响: "消耗1层[交响]造成伤害" } }, { 术语解释: { 交響: "消耗1層[交響]造成傷害" } }, table)
        expect(table.get("交响")).toBe("交響")
        expect(table.get("消耗1层[交响]造成伤害")).toBe("消耗1層[交響]造成傷害")
    })

    it("别名按中文正典查 TextMap（暴击→暴击率→CRIT Chance）", () => {
        const table = new Map<string, string>()
        applyTranslationAliases(table, "en", TEXT_MAP)
        expect(table.get("暴击")).toBe("CRIT Chance")
        expect(table.get("不死鸟")).toBeDefined()
    })

    it("正典查不到则跳过，不写悬空条目", () => {
        const table = new Map<string, string>()
        applyTranslationAliases(table, "tc", {})
        expect(table.size).toBe(0)
    })

    it("别名覆盖位置配对的错位结果（不死鸟不取模块语境译法，取正典官方译法）", () => {
        const table = new Map<string, string>([["不死鸟", "不死鳥"]])
        applyTranslationAliases(table, "tc", TEXT_MAP)
        expect(table.get("不死鸟")).toBe("不死鳥之")
    })

    it("别名正典全部至少一门语言可解析（B类 only，自创公式键不许进）", () => {
        const locales = ["ContentTC", "ContentEN", "ContentJP", "ContentKR", "ContentFR"]
        const index = new Map<string, Record<string, string>>()
        for (const row of Object.values(TEXT_MAP)) {
            const c = (row as Record<string, string>)?.TextMapContent
            if (typeof c === "string" && c && !index.has(c)) index.set(c, row as Record<string, string>)
        }
        const dead: string[] = []
        for (const [key, canonical] of Object.entries(TRANSLATION_ALIASES)) {
            const ok = locales.some(f => {
                const t = index.get(canonical)?.[f]?.replace("{空格}", " ").trim()
                return !!t && t !== key
            })
            if (!ok) dead.push(`${key}=>${canonical}`)
        }
        expect(dead).toEqual([])
    })
})
