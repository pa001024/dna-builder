import { describe, expect, it } from "vitest"
import { filterByPinyin, getPinyin, getPinyinFirst, isPinyinInput, matchPinyin, searchByPinyin } from "./pinyin-utils"

describe("Pinyin Utils", () => {
    describe("getPinyin", () => {
        it("应该返回中文文本的拼音（不带声调）", () => {
            expect(getPinyin("北京")).toBe("beijing")
            expect(getPinyin("上海")).toBe("shanghai")
            expect(getPinyin("广州")).toBe("guangzhou")
        })

        it("应该处理多个中文字符", () => {
            expect(getPinyin("我爱你")).toBe("woaini")
        })
    })

    describe("getPinyinFirst", () => {
        it("应该返回中文文本的首字母", () => {
            expect(getPinyinFirst("北京")).toBe("bj")
            expect(getPinyinFirst("上海")).toBe("sh")
            expect(getPinyinFirst("广州")).toBe("gz")
        })

        it("应该处理多个中文字符", () => {
            expect(getPinyinFirst("我爱你")).toBe("wan")
        })
    })

    describe("matchPinyin", () => {
        it("应该直接匹配包含的文本", () => {
            const result = matchPinyin("北京", "北")
            expect(result.match).toBe(true)
            expect(result.type).toBe("direct")
        })

        it("应该支持全拼匹配", () => {
            const result = matchPinyin("北京", "beijing")
            expect(result.match).toBe(true)
            expect(result.type).toBe("full")
        })

        it("应该支持部分全拼匹配", () => {
            const result = matchPinyin("北京", "bei")
            expect(result.match).toBe(true)
            expect(result.type).toBe("full")
        })

        it("应该支持首字母匹配", () => {
            const result = matchPinyin("北京", "bj")
            expect(result.match).toBe(true)
            expect(result.type).toBe("first")
        })

        it("应该支持部分首字母匹配", () => {
            const result = matchPinyin("北京", "b")
            expect(result.match).toBe(true)
            expect(result.type).toBe("first")
        })

        it("应该不匹配不相关的查询", () => {
            const result = matchPinyin("北京", "shanghai")
            expect(result.match).toBe(false)
        })

        it("应该处理空输入", () => {
            expect(matchPinyin("", "bj").match).toBe(false)
            expect(matchPinyin("北京", "").match).toBe(false)
        })

        it("应该大小写不敏感", () => {
            expect(matchPinyin("北京", "BEIJING").match).toBe(true)
            expect(matchPinyin("北京", "Beijing").match).toBe(true)
            expect(matchPinyin("北京", "BJ").match).toBe(true)
        })
    })

    describe("filterByPinyin", () => {
        const cities = ["北京", "上海", "广州", "深圳", "成都"]

        it("应该使用全拼过滤", () => {
            const result = filterByPinyin(cities, "bei", (item: string) => item)
            expect(result).toEqual(["北京"])
        })

        it("应该使用首字母过滤", () => {
            const result = filterByPinyin(cities, "sh", (item: string) => item)
            expect(result).toContain("上海")
            expect(result).toContain("深圳")
        })

        it("应该支持多匹配结果", () => {
            const result = filterByPinyin(cities, "s", (item: string) => item)
            expect(result).toContain("上海")
            expect(result).toContain("深圳")
        })

        it("应该返回所有项当查询为空时", () => {
            const result = filterByPinyin(cities, "", (item: string) => item)
            expect(result).toEqual(cities)
        })

        it("应该返回空数组当没有匹配时", () => {
            const result = filterByPinyin(cities, "xyz", (item: string) => item)
            expect(result).toEqual([])
        })
    })

    describe("searchByPinyin", () => {
        const cities = ["北京", "上海", "广州", "深圳", "成都"]

        it("应该返回匹配的项和匹配信息", () => {
            const results = searchByPinyin(cities, "bj", (item: string) => item)
            expect(results).toHaveLength(1)
            expect(results[0].item).toBe("北京")
            expect(results[0].match.match).toBe(true)
            expect(results[0].match.type).toBe("first")
        })

        it("应该返回所有项当查询为空时", () => {
            const results = searchByPinyin(cities, "", (item: string) => item)
            expect(results).toHaveLength(cities.length)
            results.forEach(result => {
                expect(result.match.match).toBe(true)
            })
        })

        it("应该返回空数组当没有匹配时", () => {
            const results = searchByPinyin(cities, "xyz", (item: string) => item)
            expect(results).toEqual([])
        })
    })

    describe("isPinyinInput", () => {
        it("应该识别纯字母输入", () => {
            expect(isPinyinInput("beijing")).toBe(true)
            expect(isPinyinInput("BJ")).toBe(true)
            expect(isPinyinInput("a")).toBe(true)
        })

        it("应该拒绝包含中文字符的输入", () => {
            expect(isPinyinInput("北京")).toBe(false)
            expect(isPinyinInput("beijing京")).toBe(false)
        })

        it("应该拒绝包含数字或特殊字符的输入", () => {
            expect(isPinyinInput("beijing1")).toBe(false)
            expect(isPinyinInput("beijing-")).toBe(false)
            expect(isPinyinInput("beijing ")).toBe(false)
        })
    })
})
