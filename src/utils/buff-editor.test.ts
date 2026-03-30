import { describe, expect, it } from "vitest"
import { buffData, LeveledBuff } from "../data"
import {
    formatBuffClipboardText,
    formatBuffDisplayName,
    matchBuffOptionQuery,
    parseBuffClipboardText,
    parseCustomBuffSummary,
} from "./buff-editor"

describe("buff-editor", () => {
    it("应该把默认等级省略，非默认等级保留为 *level", () => {
        const options = buffData
            .filter(buff => buff.名称 === "全盛·振奋" || buff.名称 === "色散成霓")
            .map(buff => ({
                label: buff.名称,
                value: new LeveledBuff(buff),
            }))
        const text = formatBuffClipboardText([new LeveledBuff("全盛·振奋"), new LeveledBuff("色散成霓", 4)], options)
        expect(text).toBe("全盛·振奋, 色散成霓*4")
    })

    it("应该为自定义BUFF输出摘要名称", () => {
        const buff = new LeveledBuff({
            名称: "自定义BUFF",
            描述: "自行填写",
            攻击: 1,
        } as never)
        expect(formatBuffDisplayName(buff)).toBe("自定义BUFF(攻击+100%)")
        expect(formatBuffClipboardText([buff], [{ label: "自定义BUFF", value: buff }])).toBe("自定义BUFF(攻击+100%)")
    })

    it("应该解析逗号分隔的 BUFF 文本", () => {
        expect(parseBuffClipboardText("A, B*4")).toEqual([
            { name: "A", level: undefined },
            { name: "B", level: 4 },
        ])
    })

    it("应该解析带摘要的自定义BUFF文本", () => {
        expect(parseBuffClipboardText("自定义BUFF(攻击+100%, 技能威力+100%), 色散成霓*4")).toEqual([
            { name: "自定义BUFF", level: undefined },
            { name: "色散成霓", level: 4 },
        ])
    })

    it("应该还原自定义BUFF摘要内容", () => {
        expect(parseCustomBuffSummary("自定义BUFF(攻击+100%, 技能威力+100%)")).toEqual([
            ["攻击", 1],
            ["技能威力", 1],
        ])
    })

    it("应该支持 BUFF 名称拼音搜索", () => {
        const option = {
            label: "色散成霓",
            value: new LeveledBuff("色散成霓"),
        }
        expect(matchBuffOptionQuery(option, "sscn")).toBe(true)
    })
})
