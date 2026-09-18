import { describe, expect, it } from "vitest"
import { parseRichComponents } from "@/utils/rich-component"

describe("parseRichComponents", () => {
    it("应把白名单组件剥离成占位符并解析出属性", () => {
        const source = "材料需要 <ResourceCostItem :value=\"[100, 151001, 'Resource']\" /> 才能合成"
        const { markdown, components } = parseRichComponents(source)

        expect(components).toHaveLength(1)
        expect(components[0].name).toBe("ResourceCostItem")
        expect(components[0].props).toEqual({ value: [100, 151001, "Resource"] })
        // 正文里不应再出现组件标签，而是留下可定位的占位符
        expect(markdown).toContain("<!--rich:0-->")
        expect(markdown).not.toContain("<ResourceCostItem")
        expect(markdown).toContain("才能合成")
    })

    it("白名单外的组件标签应原样保留为文本", () => {
        const source = '<EvilComponent :value="1" />'
        const { markdown, components } = parseRichComponents(source)

        expect(components).toHaveLength(0)
        expect(markdown).toBe(source)
    })

    it("非白名单属性应被丢弃", () => {
        const source = '<ResourceCostItem :value="1" onclick="steal()" ref="r" v-if="x" />'
        const { components } = parseRichComponents(source)

        expect(components).toHaveLength(1)
        expect(Object.keys(components[0].props)).toEqual(["value"])
    })

    it("RewardItem 应支持只给 id 并补齐成完整奖励树", () => {
        // 1 是奖励数据里真实存在、且含子项的奖励组
        const source = '<RewardItem :reward="1" />'
        const { components } = parseRichComponents(source)

        expect(components).toHaveLength(1)
        const reward = components[0].props.reward as { id: number; t: string; child: unknown[] }
        expect(reward.id).toBe(1)
        expect(reward.t).toBe("Reward")
        expect(reward.child.length).toBeGreaterThan(0)
    })

    it("RewardItem 遇到不存在的 id 时应整条失效", () => {
        const source = '<RewardItem :reward="999999999" />'
        const { markdown, components } = parseRichComponents(source)

        expect(components).toHaveLength(0)
        expect(markdown).toBe(source)
    })

    it("无法解析的绑定表达式应使整条标签失效而不是传错参数", () => {
        const source = '<ResourceCostItem :value="someFunction()" />'
        const { components } = parseRichComponents(source)

        expect(components).toHaveLength(0)
    })

    it("代码块内的组件标签不应被渲染", () => {
        const source = "```html\n<ResourceCostItem :value=\"[1, 2, 'Resource']\" />\n```"
        const { markdown, components } = parseRichComponents(source)

        expect(components).toHaveLength(0)
        expect(markdown).toBe(source)
    })

    it("行内代码内的组件标签不应被渲染", () => {
        const source = '写作 `<ResourceCostItem :value="1" />` 这样'
        const { markdown, components } = parseRichComponents(source)

        expect(components).toHaveLength(0)
        expect(markdown).toBe(source)
    })
    it("应支持闭合标签写法", () => {
        const source = '<ResourceCostItem :value="1"></ResourceCostItem>'
        const { components } = parseRichComponents(source)

        expect(components).toHaveLength(1)
        expect(components[0].props.value).toBe(1)
    })

    it("应支持无绑定字面量属性", () => {
        const source = '<ResourceCostItem name="星尘" value="10" />'
        const { components } = parseRichComponents(source)

        expect(components).toHaveLength(1)
        expect(components[0].props).toEqual({ name: "星尘", value: "10" })
    })

    it("单引号 JSON 参数应能兼容解析", () => {
        const source = "<ResourceCostItem :value=\"[100, 151001, 'Resource']\" />"
        const { components } = parseRichComponents(source)

        expect(components[0].props.value).toEqual([100, 151001, "Resource"])
    })

    it("同一条回复里的多个组件应按顺序编号", () => {
        const source = '<ResourceCostItem :value="1" /> 与 <ResourceCostItem :value="2" />'
        const { markdown, components } = parseRichComponents(source)

        expect(components).toHaveLength(2)
        expect(markdown).toContain("<!--rich:0-->")
        expect(markdown).toContain("<!--rich:1-->")
    })

    it("普通 markdown 文本不应被改动", () => {
        const source = "## 标题\n\n- 列表项\n\n| A | B |\n| - | - |\n| 1 | 2 |"
        const { markdown, components } = parseRichComponents(source)

        expect(components).toHaveLength(0)
        expect(markdown).toBe(source)
    })

    it("不含尖括号的文本应快速返回原文", () => {
        const source = "普通文本，没有标签"
        const { markdown, components } = parseRichComponents(source)

        expect(components).toHaveLength(0)
        expect(markdown).toBe(source)
    })
})
