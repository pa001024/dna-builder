import { describe, expect, it } from "vitest"
import { parseAffixMarkup } from "./richtext"

describe("词缀富文本解析", () => {
    it("白名单标签映射官方语调，未知标签只剥标签保留文本", () => {
        const segments = parseAffixMarkup(
            "<H>芙萝拉</>的<Qua1>[重奏]</>效果<D>微量</><Effect>出血</><Blue>水</><G>风</><W>警告</><Title>标题</>"
        )
        expect(segments.map(segment => [segment.text, segment.tone])).toEqual([
            ["芙萝拉", "highlight"],
            ["的", "default"],
            ["[重奏]", "qua1"],
            ["效果", "default"],
            ["微量", "emphasis"],
            ["出血", "effect"],
            ["水", "blue"],
            ["风", "green"],
            ["警告", "warning"],
            ["标题", "title"],
        ])
    })

    it("Qua1..6 全部映射，Qua7 视为未知标签", () => {
        const tones = [1, 2, 3, 4, 5, 6].map(index => parseAffixMarkup(`<Qua${index}>x</>`)[0].tone)
        expect(tones).toEqual(["qua1", "qua2", "qua3", "qua4", "qua5", "qua6"])
        expect(parseAffixMarkup("<Qua7>x</>")).toEqual([{ text: "x", tone: "default" }])
    })

    it("未闭合标签延续到文本末尾，相邻同语调片段合并", () => {
        expect(parseAffixMarkup("<H>第一根源效果变化")).toEqual([{ text: "第一根源效果变化", tone: "highlight" }])
        expect(parseAffixMarkup("a<H>b</>c<Title>d</>")).toEqual([
            { text: "a", tone: "default" },
            { text: "b", tone: "highlight" },
            { text: "c", tone: "default" },
            { text: "d", tone: "title" },
        ])
    })

    it("嵌套与错配闭合：只关闭栈顶，未知闭合不误关上层", () => {
        expect(parseAffixMarkup("<H><Title>混</>合</>")).toEqual([
            { text: "混", tone: "title" },
            { text: "合", tone: "highlight" },
        ])
        expect(parseAffixMarkup("<H>亮</Title>尾</>")).toEqual([{ text: "亮尾", tone: "highlight" }])
        expect(parseAffixMarkup("<D><Effect>效果</D>尾</Effect>")).toEqual([{ text: "效果尾", tone: "effect" }])
    })

    it("XSS：script / img 标签不产生节点，内部文本按纯文本保留", () => {
        expect(parseAffixMarkup("<H><script>alert(1)</script></>")).toEqual([{ text: "alert(1)", tone: "highlight" }])
        expect(parseAffixMarkup('<img src=x onerror="alert(1)">安全文本')).toEqual([{ text: "安全文本", tone: "default" }])
        expect(parseAffixMarkup("<H>a</H>b")).toEqual([
            { text: "a", tone: "highlight" },
            { text: "b", tone: "default" },
        ])
    })

    it("空文本与纯文本", () => {
        expect(parseAffixMarkup(undefined)).toEqual([])
        expect(parseAffixMarkup("")).toEqual([])
        expect(parseAffixMarkup("造成的伤害 +121%")).toEqual([{ text: "造成的伤害 +121%", tone: "default" }])
    })
})
