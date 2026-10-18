import i18next from "i18next"
import { beforeAll, describe, expect, it } from "vitest"
import type { Mod } from "../data-types"
import { formatModName, isSeriesPostposed, LeveledMod } from "../leveled/LeveledMod"

/** 测试用 MOD：不死鸟系列（法语译作后置介词短语 "du Phénix"） */
const 测试MOD: Mod = { id: 11001, 名称: "炽灼", 系列: "不死鸟", 品质: "白", 耐受: 5, 类型: "角色" }

// MOD 名称拼接顺序测试：法语系列名必须排在名称之后
describe("MOD名称语序", () => {
    beforeAll(async () => {
        await i18next.init({
            lng: "fr",
            fallbackLng: "zh-CN",
            resources: {
                fr: { translation: { 不死鸟: "du Phénix", 炽灼: "Ardeur" } },
                "zh-CN": { translation: { 不死鸟: "不死鸟之" } },
            },
            interpolation: { escapeValue: false },
            showSupportNotice: false,
        })
    })

    it("法语被识别为系列名后置语言", () => {
        expect(isSeriesPostposed("fr")).toBe(true)
        expect(isSeriesPostposed("fr-FR")).toBe(true)
        expect(isSeriesPostposed("zh-CN")).toBe(false)
        expect(isSeriesPostposed("en")).toBe(false)
        expect(isSeriesPostposed("ja")).toBe(false)
    })

    it("法语下系列名排在名称之后", async () => {
        await i18next.changeLanguage("fr")
        expect(formatModName("不死鸟", "炽灼")).toBe("Ardeur du Phénix")
        expect(LeveledMod.fullName(测试MOD)).toBe("Ardeur du Phénix(白)")
    })

    it("中文下系列名仍在前且保留「之」", async () => {
        await i18next.changeLanguage("zh-CN")
        // 名称无对应译文时回退为原文键
        expect(formatModName("不死鸟", "炽灼")).toBe("不死鸟之炽灼")
        expect(LeveledMod.fullName(测试MOD)).toBe("不死鸟之炽灼(白)")
    })

    it("后置语言下名称无译文时回退原文键", async () => {
        await i18next.changeLanguage("fr")
        expect(formatModName("不死鸟", "未收录之名")).toBe("未收录之名 du Phénix")
    })
})
