import { describe, expect, it } from "vitest"
import { containsDsmlMarker, DsmlStreamFilter, parseDsmlToolCalls } from "@/api/dsml-tool-call"

/**
 * DSML 工具调用容错解析的单元测试。
 *
 * 样本取自上游真实泄露形态（智谱 GLM / DeepSeek 兼容层把工具调用写成正文文本），
 * 覆盖带与不带 `|DSML|` 标记、XML 参数与 JSON 参数、无参数工具、多 invoke、
 * 流式分片与残缺块等场景。
 */
describe("containsDsmlMarker", () => {
    it("识别带 |DSML| 的完整标记", () => {
        expect(containsDsmlMarker("<||DSML|||tool_calls>")).toBe(true)
        expect(containsDsmlMarker('<||DSML|||invoke name="x">')).toBe(true)
    })

    it("识别不带 |DSML| 的裸标记", () => {
        expect(containsDsmlMarker("<||tool_calls>")).toBe(true)
        expect(containsDsmlMarker('<||invoke name="x">')).toBe(true)
    })

    it("普通 HTML 不会误判", () => {
        expect(containsDsmlMarker("<div>hello</div>")).toBe(false)
        expect(containsDsmlMarker("普通正文，含尖括号 < 但不闭合")).toBe(false)
    })
})

describe("parseDsmlToolCalls", () => {
    it("解析带 |DSML| 且参数为 XML 标签的调用", () => {
        const raw = [
            "<||DSML|||tool_calls>",
            '<||DSML|||invoke name="query_module_entries">',
            '<||DSML|||parameter name="module">achievement</||DSML|||parameter>',
            '<||DSML|||parameter name="version">1.6</||DSML|||parameter>',
            "</||DSML|||invoke>",
            "</||DSML|||tool_calls>",
        ].join("\n")

        const result = parseDsmlToolCalls(raw)

        expect(result.text).toBe("")
        expect(result.calls).toEqual([{ name: "query_module_entries", args: { module: "achievement", version: 1.6 } }])
    })

    it("解析不带 |DSML| 的裸标记（上游另一种拼写）", () => {
        const raw = ["<||tool_calls>", '<||invoke name="list_data_modules">', "</||invoke>", "</||tool_calls>"].join("\n")

        const result = parseDsmlToolCalls(raw)

        expect(result.text).toBe("")
        expect(result.calls).toEqual([{ name: "list_data_modules", args: {} }])
    })

    it("支持参数直接写成 JSON", () => {
        const raw = [
            "<||DSML|||tool_calls>",
            '<||DSML|||invoke name="search_data">',
            '{"query":"黎瑟","limit":5}',
            "</||DSML|||invoke>",
            "</||DSML|||tool_calls>",
        ].join("\n")

        const result = parseDsmlToolCalls(raw)

        expect(result.calls).toEqual([{ name: "search_data", args: { query: "黎瑟", limit: 5 } }])
    })

    it("解析块内的多个 invoke", () => {
        const raw = [
            "<||DSML|||tool_calls>",
            '<||DSML|||invoke name="search_data">',
            '{"query":"魔之楔"}',
            "</||DSML|||invoke>",
            '<||DSML|||invoke name="list_version_additions">',
            '<||DSML|||parameter name="version">1.6</||DSML|||parameter>',
            "</||DSML|||invoke>",
            "</||DSML|||tool_calls>",
        ].join("\n")

        const result = parseDsmlToolCalls(raw)

        expect(result.calls).toEqual([
            { name: "search_data", args: { query: "魔之楔" } },
            { name: "list_version_additions", args: { version: 1.6 } },
        ])
    })

    it("保留标记前后的正常正文", () => {
        const raw = [
            "我先查一下模块清单。",
            "<||DSML|||tool_calls>",
            '<||DSML|||invoke name="list_data_modules">',
            "</||DSML|||invoke>",
            "</||DSML|||tool_calls>",
            "以上。",
        ].join("\n")

        const result = parseDsmlToolCalls(raw)

        expect(result.calls).toHaveLength(1)
        expect(result.text).toContain("我先查一下模块清单。")
        expect(result.text).toContain("以上。")
        expect(result.text).not.toContain("DSML")
    })

    it("裸 invoke（没有外层 tool_calls 包裹）也能解析", () => {
        const raw =
            '<||DSML|||invoke name="read_story">\n<||DSML|||parameter name="chain_id">110201</||DSML|||parameter>\n</||DSML|||invoke>'

        const result = parseDsmlToolCalls(raw)

        expect(result.calls).toEqual([{ name: "read_story", args: { chain_id: 110201 } }])
        expect(result.text).toBe("")
    })

    it("无 DSML 标记时原样返回（快速路径不改写文本）", () => {
        const raw = "## 标题\n\n这是一段普通正文，包含 `代码` 与 **加粗**。"

        const result = parseDsmlToolCalls(raw)

        expect(result.text).toBe(raw)
        expect(result.calls).toEqual([])
    })

    it("残缺标记会被剔除而不是泄露给用户", () => {
        const raw = "答案如下：</||DSML|||invoke>\n</||DSML|||tool_calls>"

        const result = parseDsmlToolCalls(raw)

        expect(result.calls).toEqual([])
        expect(result.text).toBe("答案如下：")
    })

    it("参数值中的布尔/数字会还原类型", () => {
        const raw = [
            "<||DSML|||tool_calls>",
            '<||DSML|||invoke name="search_data">',
            '<||DSML|||parameter name="query">黎瑟</||DSML|||parameter>',
            '<||DSML|||parameter name="limit">20</||DSML|||parameter>',
            '<||DSML|||parameter name="strict">true</||DSML|||parameter>',
            "</||DSML|||invoke>",
            "</||DSML|||tool_calls>",
        ].join("\n")

        const result = parseDsmlToolCalls(raw)

        expect(result.calls[0].args).toEqual({ query: "黎瑟", limit: 20, strict: true })
    })
})

describe("DsmlStreamFilter", () => {
    it("逐字符喂入也能正确解析（标签被切碎）", () => {
        const raw = [
            "<||DSML|||tool_calls>",
            '<||DSML|||invoke name="list_data_modules">',
            "</||DSML|||invoke>",
            "</||DSML|||tool_calls>",
        ].join("\n")

        const filter = new DsmlStreamFilter()
        let text = ""
        const calls = []

        for (const char of raw) {
            const result = filter.push(char)
            text += result.text
            calls.push(...result.calls)
        }

        const tail = filter.flush()
        text += tail.text
        calls.push(...tail.calls)

        expect(text).toBe("")
        expect(calls).toEqual([{ name: "list_data_modules", args: {} }])
    })

    it("流式过程中不会把半个标签当成正文吐出", () => {
        const filter = new DsmlStreamFilter()

        // 第一个片段以半个标签结尾：此时不能有任何文本流出
        const first = filter.push("正在整理结果<||DSM")

        expect(first.text).toBe("正在整理结果")
        expect(first.calls).toEqual([])

        // 补齐剩余部分后，整块被识别成工具调用
        const second = filter.push(
            'L|||tool_calls>\n<||DSML|||invoke name="search_data">\n{"query":"x"}\n</||DSML|||invoke>\n</||DSML|||tool_calls>'
        )

        expect(second.text).toBe("")
        expect(second.calls).toEqual([{ name: "search_data", args: { query: "x" } }])
    })

    it("块中间断开时，块内容不会提前泄露", () => {
        const filter = new DsmlStreamFilter()

        const first = filter.push('<||DSML|||tool_calls>\n<||DSML|||invoke name="search_data">\n{"que')

        expect(first.text).toBe("")
        expect(first.calls).toEqual([])

        const second = filter.push('ry":"黎瑟"}\n</||DSML|||invoke>\n</||DSML|||tool_calls>')

        expect(second.text).toBe("")
        expect(second.calls).toEqual([{ name: "search_data", args: { query: "黎瑟" } }])
    })

    it("正常文本分成多片时原样放行", () => {
        const filter = new DsmlStreamFilter()

        expect(filter.push("第一段，").text).toBe("第一段，")
        expect(filter.push("第二段。").text).toBe("第二段。")
        expect(filter.flush().text).toBe("")
    })

    it("flush 能取出缓冲区里未闭合的残缺内容并清洗", () => {
        const filter = new DsmlStreamFilter()

        // 开标签之前的正文应当立即放行（它已经确定是正文，不该被块拖住）
        const first = filter.push("结论如下<||DSML|||tool_calls>")

        expect(first.text).toBe("结论如下")

        // 收尾时缓冲区里只剩不完整块，无法解析成调用，但至少要保证标记不泄露
        const tail = filter.flush()

        expect(tail.calls).toEqual([])
        expect(tail.text).not.toContain("DSML")
    })
})
