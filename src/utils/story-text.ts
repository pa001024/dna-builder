export type StoryGender = "male" | "female"

export interface StoryTextConfig {
    nickname: string
    nickname2: string
    gender: StoryGender
    gender2: StoryGender
}

export interface StoryTextSegment {
    text: string
    tone: "normal" | "highlight" | "warning" | "title" | "blue"
}

export interface SearchTextSegment {
    text: string
    highlighted: boolean
}

export const DEFAULT_STORY_TEXT_CONFIG: StoryTextConfig = {
    nickname: "维塔",
    nickname2: "墨斯",
    gender: "female",
    gender2: "female",
}

/**
 * 将剧情占位符替换为配置后的文本。
 * @param input 原始文本
 * @param config 文本替换配置
 * @returns 占位符替换后的文本
 */
export function replaceStoryPlaceholders(input: string, config: StoryTextConfig): string {
    if (!input) {
        return ""
    }

    // 性别占位符的分隔符同时兼容 ASCII 竖线 `|` 与 CJK 竖线 `丨`（数据中混用两者）
    return input
        .replace(/\{nickname2\}/g, config.nickname2)
        .replace(/\{nickname\}/g, config.nickname)
        .replace(/\{(性别2?)[:：]([^|丨{}]*)[|丨]([^|丨{}]*)\}/g, (_, key: string, maleText: string, femaleText: string) => {
            const selectedGender = key === "性别2" ? config.gender2 : config.gender
            return selectedGender === "male" ? maleText : femaleText
        })
}

/**
 * 移除剧情文本中的样式标签，保留标签内部的纯文本。
 * @param input 原始文本
 * @returns 移除样式标签后的文本
 */
export function stripStoryTextTags(input: string): string {
    if (!input) {
        return ""
    }

    return input.replace(/<(?:H|W|Highlight|highlight|Title|blue|Blue)>|<\/>/g, "")
}

/**
 * 将文本拆分为普通/高亮/警示片段，供渲染层控制样式。
 * @param input 原始文本
 * @param config 文本替换配置
 * @returns 可渲染的片段数组
 */
export function parseStoryTextSegments(input: string, config: StoryTextConfig): StoryTextSegment[] {
    const replacedText = replaceStoryPlaceholders(input, config)
    if (!replacedText) {
        return []
    }

    const segmentRegex = /<(H|W|Highlight|highlight|Title|blue|Blue)>([\s\S]*?)<\/>/g
    const segments: StoryTextSegment[] = []
    let lastIndex = 0

    for (const matched of replacedText.matchAll(segmentRegex)) {
        const matchedText = matched[0]
        const tagName = matched[1]
        const content = matched[2] ?? ""
        const startIndex = matched.index ?? 0
        const endIndex = startIndex + matchedText.length

        if (startIndex > lastIndex) {
            segments.push({
                text: replacedText.slice(lastIndex, startIndex),
                tone: "normal",
            })
        }

        segments.push({
            text: content,
            tone:
                tagName === "Title"
                    ? "title"
                    : tagName === "H" || tagName === "Highlight" || tagName === "highlight"
                      ? "highlight"
                      : tagName === "blue" || tagName === "Blue"
                        ? "blue"
                        : "warning",
        })
        lastIndex = endIndex
    }

    if (lastIndex < replacedText.length) {
        segments.push({
            text: replacedText.slice(lastIndex),
            tone: "normal",
        })
    }

    return segments
}

/**
 * 生成指定可见字符数的片段，用于打字机逐字显示。
 * @param segments 完整片段
 * @param visibleChars 当前可见字符数
 * @returns 截断后的可见片段
 */
export function buildVisibleStorySegments(segments: StoryTextSegment[], visibleChars: number): StoryTextSegment[] {
    if (visibleChars <= 0) {
        return []
    }

    const visibleSegments: StoryTextSegment[] = []
    let remainingChars = visibleChars

    for (const segment of segments) {
        if (remainingChars <= 0) {
            break
        }

        if (segment.text.length <= remainingChars) {
            visibleSegments.push(segment)
            remainingChars -= segment.text.length
            continue
        }

        visibleSegments.push({
            text: segment.text.slice(0, remainingChars),
            tone: segment.tone,
        })
        remainingChars = 0
    }

    return visibleSegments
}

/**
 * 将文本按关键词拆分为普通/高亮片段。
 * @param input 原始文本
 * @param keyword 搜索关键词
 * @returns 可渲染的片段
 */
export function buildSearchTextSegments(input: string, keyword: string): SearchTextSegment[] {
    if (!input) {
        return []
    }

    const normalizedKeyword = keyword.trim()
    if (!normalizedKeyword) {
        return [
            {
                text: input,
                highlighted: false,
            },
        ]
    }

    const segments: SearchTextSegment[] = []
    let cursor = 0

    while (cursor < input.length) {
        const matchIndex = input.indexOf(normalizedKeyword, cursor)
        if (matchIndex === -1) {
            break
        }

        if (matchIndex > cursor) {
            segments.push({
                text: input.slice(cursor, matchIndex),
                highlighted: false,
            })
        }

        segments.push({
            text: input.slice(matchIndex, matchIndex + normalizedKeyword.length),
            highlighted: true,
        })
        cursor = matchIndex + normalizedKeyword.length
    }

    if (cursor < input.length) {
        segments.push({
            text: input.slice(cursor),
            highlighted: false,
        })
    }

    return segments.length
        ? segments
        : [
              {
                  text: input,
                  highlighted: false,
              },
          ]
}
