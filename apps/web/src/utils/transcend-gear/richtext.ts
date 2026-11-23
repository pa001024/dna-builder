/**
 * 升华词缀富文本解析：只认白名单标签（`H` / `Highlight` / `W` / `Title` / `D` / `QuaN` / `Effect` / `Blue` / `G`），
 * 未知标签直接丢弃、内容按纯文本保留；渲染层用 span 输出，禁止 `v-html`。
 * 颜色取官方 RichText 样式表 `Season_Tips_RichText_T15`（见 `.docs/transcendence-db/RESEARCH-PREVIEW-ALIGN.md` §1.3）。
 */

/** 词缀富文本片段语调 */
export type AffixTextTone =
    | "default"
    | "highlight"
    | "warning"
    | "title"
    | "content"
    | "emphasis"
    | "effect"
    | "blue"
    | "green"
    | "qua1"
    | "qua2"
    | "qua3"
    | "qua4"
    | "qua5"
    | "qua6"

/** 富文本片段 */
export interface AffixTextSegment {
    text: string
    tone: AffixTextTone
}

/** 白名单标签 → 语调（大小写不敏感；`QuaN` 单独处理） */
const AFFIX_TAG_TONES: Record<string, AffixTextTone> = {
    h: "highlight",
    highlight: "highlight",
    w: "warning",
    warning: "warning",
    title: "title",
    d: "emphasis",
    effect: "effect",
    blue: "blue",
    g: "green",
    content: "content",
}

/**
 * 语调 → 渲染类名。固定色取自官方样式表；`content` / `emphasis` / `effect` 跟随主题文本色。
 * 类名必须保持字面量，Tailwind 才能扫到（不要改成运行时拼接）。
 */
export const AFFIX_TONE_CLASSES: Record<Exclude<AffixTextTone, "default">, string> = {
    highlight: "text-affix-highlight",
    warning: "text-affix-warning",
    title: "text-affix-title",
    content: "text-base-content/60",
    emphasis: "text-base-content/80",
    effect: "text-base-content",
    blue: "text-affix-blue",
    green: "text-affix-green",
    qua1: "text-[#fa556d]",
    qua2: "text-[#eec995]",
    qua3: "text-[#8672ef]",
    qua4: "text-[#2a3f8f]",
    qua5: "text-[#1c724e]",
    qua6: "text-[#656565]",
}

/**
 * 标签名 → 语调；未命中白名单返回 null（该标签按未知标签丢弃）。
 * @param name 标签名（不含尖括号）
 * @returns 语调；未知标签为 null
 */
function resolveAffixTagTone(name: string): AffixTextTone | null {
    const qua = /^qua([1-6])$/i.exec(name)
    if (qua) {
        return `qua${qua[1]}` as AffixTextTone
    }

    return AFFIX_TAG_TONES[name.toLowerCase()] ?? null
}

/**
 * 把上游富文本拆成带语调的片段。
 * 关闭标签用 `</>`（游戏内格式），也兼容 `</Tag>`；未知标签只丢弃标签本身，内部文本保留。
 * @param input 原始文本（可含标签）
 * @returns 片段数组；空文本返回空数组
 */
export function parseAffixMarkup(input: string | undefined): AffixTextSegment[] {
    if (!input) {
        return []
    }

    const segments: AffixTextSegment[] = []
    const stack: { name: string | null; tone: AffixTextTone }[] = []
    const tagPattern = /<[^>]*>/g
    let cursor = 0

    const pushText = (text: string): void => {
        if (!text) {
            return
        }
        const tone = stack.length ? stack[stack.length - 1].tone : "default"
        const last = segments[segments.length - 1]
        if (last && last.tone === tone) {
            last.text += text
        } else {
            segments.push({ text, tone })
        }
    }

    for (let match = tagPattern.exec(input); match !== null; match = tagPattern.exec(input)) {
        pushText(input.slice(cursor, match.index))
        const raw = match[0]
        const name = /^<\s*\/?\s*([A-Za-z][\w-]*)\s*>$/.exec(raw)?.[1] ?? null
        if (raw.startsWith("</")) {
            // `</>` 关闭最近一层；`</Tag>` 只在该标签确为栈顶时关闭，避免未知标签错配
            const top = stack[stack.length - 1]
            if (top && (name === null || top.name?.toLowerCase() === name.toLowerCase())) {
                stack.pop()
            }
        } else if (name) {
            const tone = resolveAffixTagTone(name)
            if (tone) {
                stack.push({ name, tone })
            }
        }
        cursor = match.index + raw.length
    }
    pushText(input.slice(cursor))
    return segments
}
