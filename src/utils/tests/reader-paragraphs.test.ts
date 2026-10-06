import { describe, expect, it } from "vitest"
import { joinWrappedLines, splitReaderParagraphs } from "../reader-paragraphs"

describe("splitReaderParagraphs", () => {
    it("按空行分段并保留段内换行", () => {
        expect(splitReaderParagraphs("甲\n乙\n\n丙")).toEqual(["甲\n乙", "丙"])
    })

    it("合并连续空行并去除段首尾空白", () => {
        expect(splitReaderParagraphs("  甲  \n\n\n  乙  ")).toEqual(["甲", "乙"])
    })

    it("空值返回空数组", () => {
        expect(splitReaderParagraphs("")).toEqual([])
        expect(splitReaderParagraphs(null)).toEqual([])
        expect(splitReaderParagraphs(undefined)).toEqual([])
    })

    it("仅空白字符返回空数组", () => {
        expect(splitReaderParagraphs("\n\n   \n")).toEqual([])
    })
})

describe("splitReaderParagraphs unwrapLines", () => {
    it("短行小标题独立成段，其余行按中文规则拼接", () => {
        expect(splitReaderParagraphs("1月1日\n今天拿到了月碎片。\n明天再说。", { unwrapLines: true })).toEqual([
            "1月1日",
            "今天拿到了月碎片。明天再说。",
        ])
    })

    it("空行分段的优先级高于换行归一", () => {
        expect(
            splitReaderParagraphs("欢迎来到平原。\n本店提供酒水。\n\n海伯利亚帝国:\n军团狼血\n配给饮品。", { unwrapLines: true })
        ).toEqual(["欢迎来到平原。本店提供酒水。", "海伯利亚帝国:", "军团狼血", "配给饮品。"])
    })

    it("英文行不会被误判为小标题", () => {
        expect(splitReaderParagraphs("the quick brown\nfox jumps", { unwrapLines: true })).toEqual(["the quick brown fox jumps"])
    })

    it("以句末标点结尾的短行不当作小标题", () => {
        expect(splitReaderParagraphs("好吧。\n我们走。", { unwrapLines: true })).toEqual(["好吧。我们走。"])
    })

    it("单字行不当作小标题", () => {
        expect(splitReaderParagraphs("甲\n乙", { unwrapLines: true })).toEqual(["甲乙"])
    })
})

describe("joinWrappedLines", () => {
    it("中文硬换行直接拼接，不插入空格", () => {
        expect(joinWrappedLines("酒水。\n我们会在您醉倒之前收取酒钱。")).toBe("酒水。我们会在您醉倒之前收取酒钱。")
    })

    it("英文硬换行保留一个空格", () => {
        expect(joinWrappedLines("the quick brown\nfox jumps")).toBe("the quick brown fox jumps")
    })

    it("清掉行首缩进与 CRLF 残留", () => {
        expect(joinWrappedLines("甲\r\n    乙")).toBe("甲乙")
    })

    it("连续多行全部归一", () => {
        expect(joinWrappedLines("一\n二\n三")).toBe("一二三")
    })
})
