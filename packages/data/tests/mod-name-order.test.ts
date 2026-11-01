import { beforeAll, describe, expect, it } from "vitest"
import type { Mod } from "../data-types"
import { formatModName, isSeriesPostposed, LeveledMod, setModI18n } from "../leveled/LeveledMod"

/** 测试用 MOD：不死鸟系列（法语译作后置介词短语 "du Phénix"） */
const 测试MOD: Mod = { id: 11001, 名称: "炽灼", 系列: "不死鸟", 品质: "白", 耐受: 5, 类型: "角色" }

/** 可变语言与词典：模拟宿主注入（与真实宿主相同的 getLanguage/t 口径，不依赖 i18next） */
let 当前语言 = "fr"
const 词典: Record<string, Record<string, string>> = {
    fr: { 不死鸟: "du Phénix", 炽灼: "Ardeur" },
    "zh-CN": { 不死鸟: "不死鸟之" },
}

// MOD 名称拼接顺序测试：法语系列名必须排在名称之后
describe("MOD名称语序", () => {
    beforeAll(() => {
        setModI18n({ getLanguage: () => 当前语言, t: key => 词典[当前语言]?.[key] ?? key })
    })

    it("法语被识别为系列名后置语言", () => {
        expect(isSeriesPostposed("fr")).toBe(true)
        expect(isSeriesPostposed("fr-FR")).toBe(true)
        expect(isSeriesPostposed("zh-CN")).toBe(false)
        expect(isSeriesPostposed("en")).toBe(false)
        expect(isSeriesPostposed("ja")).toBe(false)
    })

    it("法语下系列名排在名称之后", () => {
        当前语言 = "fr"
        expect(formatModName("不死鸟", "炽灼")).toBe("Ardeur du Phénix")
        expect(LeveledMod.fullName(测试MOD)).toBe("Ardeur du Phénix(白)")
    })

    it("中文下系列名仍在前且保留「之」", () => {
        当前语言 = "zh-CN"
        // 名称无对应译文时回退为原文键
        expect(formatModName("不死鸟", "炽灼")).toBe("不死鸟之炽灼")
        expect(LeveledMod.fullName(测试MOD)).toBe("不死鸟之炽灼(白)")
    })

    it("后置语言下名称无译文时回退原文键", () => {
        当前语言 = "fr"
        expect(formatModName("不死鸟", "未收录之名")).toBe("未收录之名 du Phénix")
    })
})
