import { describe, expect, it } from "vitest"
import { cleanGameMarkup } from "../transcendence-display"

describe("cleanGameMarkup 纯文本出口", () => {
    it("剥离白名单标签并保留文本", () => {
        expect(cleanGameMarkup("<H>第一根源</>与<Highlight>高亮</>")).toBe("第一根源与高亮")
        expect(cleanGameMarkup("<Content>正文</><D>强调</><Effect>效果</><G>绿色</>")).toBe("正文强调效果绿色")
        expect(cleanGameMarkup("<Qua1>红</><Qua6>灰</>")).toBe("红灰")
    })

    it("显式闭合标签不泄漏（</H> / </Title> / </Highlight>）", () => {
        expect(cleanGameMarkup("<H>高亮</H>普通")).toBe("高亮普通")
        expect(cleanGameMarkup("<Title>标题</Title>尾")).toBe("标题尾")
        expect(cleanGameMarkup("<Highlight>亮</Highlight>尾")).toBe("亮尾")
        expect(cleanGameMarkup("<W>警告</W><Blue>蓝</Blue>")).toBe("警告蓝")
    })

    it("未知标签只丢标签、保留内容；XSS 不产生可见标签", () => {
        expect(cleanGameMarkup("<Foo>文本</Foo>")).toBe("文本")
        expect(cleanGameMarkup("<script>alert(1)</script>安全")).toBe("alert(1)安全")
        expect(cleanGameMarkup('<img src=x onerror="x">文本')).toBe("文本")
    })

    it("嵌套 / 错配闭合不泄漏", () => {
        expect(cleanGameMarkup("<H><Title>混合</H>尾</Title>")).toBe("混合尾")
        expect(cleanGameMarkup("<D>未闭合")).toBe("未闭合")
        expect(cleanGameMarkup("</>孤立闭合")).toBe("孤立闭合")
    })

    it("空文本 / 纯文本", () => {
        expect(cleanGameMarkup(undefined)).toBe("")
        expect(cleanGameMarkup("")).toBe("")
        expect(cleanGameMarkup("普通文本 123")).toBe("普通文本 123")
    })
})
