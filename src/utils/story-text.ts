export type StoryGender = "male" | "female"

export interface StoryTextConfig {
    nickname: string
    nickname2: string
    gender: StoryGender
    gender2: StoryGender
}

export interface StoryTextSegment {
    text: string
    tone: "normal" | "highlight" | "warning"
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

    return input
        .replace(/\{nickname2\}/g, config.nickname2)
        .replace(/\{nickname\}/g, config.nickname)
        .replace(/\{(性别2?)：([^|{}]*)\|([^{}]*)\}/g, (_, key: string, maleText: string, femaleText: string) => {
            const selectedGender = key === "性别2" ? config.gender2 : config.gender
            return selectedGender === "male" ? maleText : femaleText
        })
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

    const segmentRegex = /<(H|W)>([\s\S]*?)<\/>/g
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
            tone: tagName === "H" ? "highlight" : "warning",
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
