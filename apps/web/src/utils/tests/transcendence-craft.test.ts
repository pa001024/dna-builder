import { describe, expect, it } from "vitest"
import { resolveCraftGrowth, resolveCraftHeadings, resolveCraftSummaryText } from "@/utils/transcendence-craft"

describe("概览 craft 标题回退", () => {
    it("官方标题与界面标签不同字时两者并列", () => {
        expect(resolveCraftHeadings("精锻", "最终精锻")).toEqual({ title: "精锻", label: "最终精锻" })
        expect(resolveCraftHeadings("镶嵌", "添加")).toEqual({ title: "镶嵌", label: "添加" })
        expect(resolveCraftHeadings("Masterworking", "Masterwork")).toEqual({ title: "Masterworking", label: "Masterwork" })
    })

    it("同字时只保留官方标题", () => {
        expect(resolveCraftHeadings("淬炼", "淬炼")).toEqual({ title: "淬炼", label: "" })
        expect(resolveCraftHeadings("Remove", "Remove")).toEqual({ title: "Remove", label: "" })
    })

    it("官方标题缺失时回退界面标签", () => {
        expect(resolveCraftHeadings("", "附魔")).toEqual({ title: "附魔", label: "" })
    })

    it("两者都缺失时返回空标题，不编造", () => {
        expect(resolveCraftHeadings("", "")).toEqual({ title: "", label: "" })
    })

    it("首尾空白按缺失处理并参与同字比较", () => {
        expect(resolveCraftHeadings("  ", "精锻")).toEqual({ title: "精锻", label: "" })
        expect(resolveCraftHeadings(" 精锻 ", "精锻")).toEqual({ title: "精锻", label: "" })
    })
})

describe("概览 craft 摘要文案回退", () => {
    it("缺 title / desc：标题回退标签，说明为空串", () => {
        expect(resolveCraftSummaryText({}, "淬炼")).toEqual({ title: "淬炼", label: "", desc: "" })
        expect(resolveCraftSummaryText({ title: "" }, "淬炼")).toEqual({ title: "淬炼", label: "", desc: "" })
        expect(resolveCraftSummaryText({ desc: "" }, "淬炼")).toEqual({ title: "淬炼", label: "", desc: "" })
    })

    it("纯空白 title / desc 视为缺失", () => {
        expect(resolveCraftSummaryText({ title: "   ", desc: "\n\t " }, "附魔")).toEqual({ title: "附魔", label: "", desc: "" })
    })

    it("空白 title + 异字 label 时只显示标签", () => {
        expect(resolveCraftSummaryText({ title: " ", desc: "x" }, "最终精锻")).toEqual({ title: "最终精锻", label: "", desc: "x" })
    })

    it("title 与 label 双缺失时标题与说明均为空", () => {
        expect(resolveCraftSummaryText({}, "")).toEqual({ title: "", label: "", desc: "" })
        expect(resolveCraftSummaryText({ title: " ", desc: " " }, "  ")).toEqual({ title: "", label: "", desc: "" })
    })

    it("说明去首尾空白，正文内的空白保留", () => {
        expect(resolveCraftSummaryText({ title: "精锻", desc: "  精锻会提升物品的词缀数值 \n" }, "精锻")).toEqual({
            title: "精锻",
            label: "",
            desc: "精锻会提升物品的词缀数值",
        })
    })
})

describe("附魔费用成长（数据推导）", () => {
    it("默认数据：递增倍率 1、封顶步数 5 → 封顶 ×6、第 6 次起", () => {
        expect(resolveCraftGrowth(1, 5)).toEqual({
            factor: 1,
            maxSteps: 5,
            firstMultiplier: 1,
            capMultiplier: 6,
            capAt: 6,
        })
    })

    it("倍率与封顶步数跟随数据，不写死 5 / 6", () => {
        expect(resolveCraftGrowth(2, 3)).toEqual({
            factor: 2,
            maxSteps: 3,
            firstMultiplier: 1,
            capMultiplier: 7,
            capAt: 4,
        })
        expect(resolveCraftGrowth(0.5, 8)?.capMultiplier).toBe(5)
        expect(resolveCraftGrowth(0.5, 8)?.capAt).toBe(9)
    })

    it("缺少封顶步数时按上游默认 1 计算", () => {
        expect(resolveCraftGrowth(1)).toEqual({
            factor: 1,
            maxSteps: 1,
            firstMultiplier: 1,
            capMultiplier: 2,
            capAt: 2,
        })
    })

    it("无成长或非有限数值返回 null", () => {
        expect(resolveCraftGrowth(undefined, 5)).toBeNull()
        expect(resolveCraftGrowth(0, 5)).toBeNull()
        expect(resolveCraftGrowth(-1, 5)).toBeNull()
        expect(resolveCraftGrowth(1, 0)).toBeNull()
        expect(resolveCraftGrowth(1, -2)).toBeNull()
        expect(resolveCraftGrowth(Number.NaN, 5)).toBeNull()
        expect(resolveCraftGrowth(Number.POSITIVE_INFINITY, 5)).toBeNull()
        expect(resolveCraftGrowth(1, Number.NaN)).toBeNull()
    })

    it("封顶步数取整，倍率去除浮点尾差", () => {
        expect(resolveCraftGrowth(0.1, 3)?.capMultiplier).toBe(1.3)
        expect(resolveCraftGrowth(1, 5.9)).toEqual({
            factor: 1,
            maxSteps: 5,
            firstMultiplier: 1,
            capMultiplier: 6,
            capAt: 6,
        })
    })
})
