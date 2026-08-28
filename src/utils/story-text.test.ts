import { describe, expect, it } from "vitest"
import {
    DEFAULT_STORY_TEXT_CONFIG,
    parseStoryTextSegments,
    replaceStoryPlaceholders,
    type StoryTextConfig,
    stripStoryTextTags,
} from "./story-text"

const config: StoryTextConfig = DEFAULT_STORY_TEXT_CONFIG

describe("parseStoryTextSegments 标签解析", () => {
    it("应该把 <blue> 标签解析为 blue 语调", () => {
        const segments = parseStoryTextSegments("这是<blue>蓝色文字</>结尾", config)

        expect(segments).toEqual([
            { text: "这是", tone: "normal" },
            { text: "蓝色文字", tone: "blue" },
            { text: "结尾", tone: "normal" },
        ])
    })

    it("应该支持大写 <Blue> 标签", () => {
        const segments = parseStoryTextSegments("<Blue>大写蓝色</>", config)

        expect(segments).toEqual([{ text: "大写蓝色", tone: "blue" }])
    })

    it("blue 标签应与其余标签共存且互不干扰", () => {
        const segments = parseStoryTextSegments("<H>高亮</><blue>蓝</><W>警示</>", config)

        expect(segments).toEqual([
            { text: "高亮", tone: "highlight" },
            { text: "蓝", tone: "blue" },
            { text: "警示", tone: "warning" },
        ])
    })

    it("无标签的纯文本应全部为 normal", () => {
        const segments = parseStoryTextSegments("普通文本", config)

        expect(segments).toEqual([{ text: "普通文本", tone: "normal" }])
    })
})

describe("stripStoryTextTags 标签移除", () => {
    it("应该移除 <blue> 开标签与 </> 闭标签", () => {
        expect(stripStoryTextTags("前缀<blue>蓝色</>后缀")).toBe("前缀蓝色后缀")
    })

    it("应该兼容已支持的全部标签", () => {
        expect(stripStoryTextTags("<H>高</><W>警</><Title>题</><blue>蓝</>")).toBe("高警题蓝")
    })
})

describe("replaceStoryPlaceholders 性别占位符", () => {
    const baseConfig: StoryTextConfig = { ...DEFAULT_STORY_TEXT_CONFIG, nickname: "维塔", nickname2: "墨斯" }

    it("ASCII 竖线分隔的 {性别} 按主角性别选择", () => {
        expect(replaceStoryPlaceholders("{性别:他|她}", { ...baseConfig, gender: "female" })).toBe("她")
        expect(replaceStoryPlaceholders("{性别:他|她}", { ...baseConfig, gender: "male" })).toBe("他")
    })

    it("CJK 竖线 丨 分隔的 {性别2} 按第二主角性别选择", () => {
        expect(replaceStoryPlaceholders("短暂休整过后，{性别2：他丨她}带领", { ...baseConfig, gender2: "female" })).toBe(
            "短暂休整过后，她带领"
        )
        expect(replaceStoryPlaceholders("短暂休整过后，{性别2：他丨她}带领", { ...baseConfig, gender2: "male" })).toBe(
            "短暂休整过后，他带领"
        )
    })

    it("性别占位符应与昵称占位符共存", () => {
        const result = replaceStoryPlaceholders("{nickname2}说：{性别2：他丨她}笑了", {
            ...baseConfig,
            gender2: "female",
        })
        expect(result).toBe("墨斯说：她笑了")
    })
})
