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

export interface SearchableStoryTextSegment {
    text: string
    tone: StoryTextSegment["tone"]
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

/** 剧情文本中的字符区间（半开区间，start 含、end 不含） */
export interface StoryTextRange {
    start: number
    end: number
}

/** 与 replaceStoryPlaceholders 完全一致的占位符匹配模式（含 CJK 竖线兼容） */
const STORY_PLACEHOLDER_PATTERN = /\{nickname2\}|\{nickname\}|\{(性别2?)[:：]([^|丨{}]*)[|丨]([^|丨{}]*)\}/g

/**
 * 计算占位符替换前后的区间映射：把「去标签、未替换占位符」文本上的区间
 * 映射到「占位符已按配置替换」后的展示文本区间。
 * 命中区间落入占位符内部时自动扩到整个占位符，避免半截高亮。
 * @param input 含占位符的原始文本（应已去除样式标签，与搜索索引文本同源）
 * @param config 文本替换配置
 * @param range 原始文本上的区间
 * @returns 替换后文本上的区间
 */
export function mapStoryRangeAcrossPlaceholders(input: string, config: StoryTextConfig, range: StoryTextRange): StoryTextRange {
    const matches: Array<{ start: number; rawLength: number; delta: number }> = []
    STORY_PLACEHOLDER_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = STORY_PLACEHOLDER_PATTERN.exec(input)) !== null) {
        const rawText = match[0]
        let replacement = ""
        if (rawText === "{nickname2}") {
            replacement = config.nickname2
        } else if (rawText === "{nickname}") {
            replacement = config.nickname
        } else {
            const key = match[1]
            const maleText = match[2] ?? ""
            const femaleText = match[3] ?? ""
            const selectedGender = key === "性别2" ? config.gender2 : config.gender
            replacement = selectedGender === "male" ? maleText : femaleText
        }

        matches.push({
            start: match.index,
            rawLength: rawText.length,
            delta: replacement.length - rawText.length,
        })
    }

    const inputLength = input.length
    let start = Math.min(Math.max(range.start, 0), inputLength)
    let end = Math.min(Math.max(range.end, 0), inputLength)

    // 边界落在占位符内部时，扩到占位符的完整边界
    for (const placeholder of matches) {
        const placeholderEnd = placeholder.start + placeholder.rawLength
        if (start > placeholder.start && start < placeholderEnd) {
            start = placeholder.start
        }
        if (end > placeholder.start && end < placeholderEnd) {
            end = placeholderEnd
        }
    }

    // 输出偏移 = 输入偏移 + 起始位置之前所有占位符的长度变化
    const toOutputOffset = (offset: number): number => {
        let output = offset
        for (const placeholder of matches) {
            if (placeholder.start + placeholder.rawLength <= offset) {
                output += placeholder.delta
            }
        }
        return output
    }

    return {
        start: toOutputOffset(start),
        end: toOutputOffset(end),
    }
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

/**
 * 在保留剧情样式标签解析（H/W/Title/blue 等语调）的同时，按关键词切分可渲染片段，
 * 供全文搜索命中场景替代纯文本高亮使用，避免高亮模式下标签丢失。
 * @param input 原始剧情文本（含占位符与样式标签）
 * @param keyword 搜索关键词，为空时仅做标签解析
 * @param config 文本替换配置
 * @returns 带语调与命中标记的渲染片段
 */
export function buildSearchStorySegments(input: string, keyword: string, config: StoryTextConfig): SearchableStoryTextSegment[] {
    const storySegments = parseStoryTextSegments(input, config)
    if (!storySegments.length) {
        return []
    }

    const normalizedKeyword = keyword.trim()
    if (!normalizedKeyword) {
        return storySegments.map(segment => ({
            text: segment.text,
            tone: segment.tone,
            highlighted: false,
        }))
    }

    const segments: SearchableStoryTextSegment[] = []
    for (const segment of storySegments) {
        if (!segment.text.includes(normalizedKeyword)) {
            segments.push({
                text: segment.text,
                tone: segment.tone,
                highlighted: false,
            })
            continue
        }

        let cursor = 0
        while (cursor < segment.text.length) {
            const matchIndex = segment.text.indexOf(normalizedKeyword, cursor)
            if (matchIndex === -1) {
                break
            }

            if (matchIndex > cursor) {
                segments.push({
                    text: segment.text.slice(cursor, matchIndex),
                    tone: segment.tone,
                    highlighted: false,
                })
            }

            segments.push({
                text: segment.text.slice(matchIndex, matchIndex + normalizedKeyword.length),
                tone: segment.tone,
                highlighted: true,
            })
            cursor = matchIndex + normalizedKeyword.length
        }

        if (cursor < segment.text.length) {
            segments.push({
                text: segment.text.slice(cursor),
                tone: segment.tone,
                highlighted: false,
            })
        }
    }

    return segments.filter(segment => segment.text !== "")
}
