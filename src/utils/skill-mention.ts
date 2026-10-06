/**
 * 技能提及（canonical markdown `[$名称](/名称/SKILL.md)`）的纯逻辑层。
 *
 * 对齐 ZCode 的 `$` 提及格式：输入框（Lexical 富文本）里键入 `$` 唤起技能面板，选中后插入
 * chip（token 原子节点），chip 直接序列化成 canonical markdown——编辑器输出即发往模型的形态。
 * 模型看到 `$名称` 就知道要先用 `skill` 工具加载该技能，不必在提示词里另立一套语法。
 */

/** 技能提及的触发符 */
export const SKILL_MENTION_TRIGGER = "$"

/** 触发符别名：部分键盘 / 输入法把 `$` 打成分全角货币符，语义归一到 `$`（不改写用户输入） */
export const SKILL_MENTION_TRIGGER_ALIASES = ["$", "¥", "￥"] as const

/** 链接形态的提及：`[$名称](目标)`，label 支持反斜杠转义，目标支持 `<...>` 或裸形式 */
const LINK_MENTION_PATTERN = /\[((?:\\.|[^\\\]])*)\]\((?:<((?:\\.|[^>])*?)>|((?:\\.|[^)])*))\)/g

/** 光标前的活动触发：`(行首或空白) 触发符 查询串` */
const ACTIVE_TRIGGER_PATTERN = /(^|\s)([$¥￥])([^\s/@$#¥￥]*)$/u

/** 技能名的合法形态（与服务端 `NAME_PATTERN` 同口径：小写 kebab-case） */
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** 光标前正在输入的一次技能提及 */
export interface ActiveSkillTrigger {
    /** 实际键入的触发字符（可能是 `¥` / `￥`） */
    trigger: string
    /** `$` 之后到光标之间的查询串 */
    query: string
    /** 触发符在文本中的下标（用于替换区间计算） */
    start: number
}

/** 解析后的提及片段 */
export type SkillMentionPart = { type: "text"; text: string } | { type: "skill"; name: string }

/**
 * 把触发符别名归一到 `$`。**不改写用户实际输入**，只用于判定语义。
 * @param trigger 键入的触发字符
 * @returns 归一后的触发符
 */
export function normalizeSkillTrigger(trigger: string): string {
    return trigger === "¥" || trigger === "￥" ? SKILL_MENTION_TRIGGER : trigger
}

/** 该触发字符是否唤起技能面板 */
export function isSkillMentionTrigger(trigger: string): boolean {
    return normalizeSkillTrigger(trigger) === SKILL_MENTION_TRIGGER
}

/**
 * @description 取光标前正在输入的活动技能提及。
 * @param textBeforeCursor 光标前的整段文本
 * @returns 活动提及（触发符 + 查询串 + 下标）；不在提及语境时 null
 */
export function extractActiveSkillTrigger(textBeforeCursor: string): ActiveSkillTrigger | null {
    const match = ACTIVE_TRIGGER_PATTERN.exec(textBeforeCursor)

    if (!match) {
        return null
    }

    const [, , trigger, query] = match
    const trimmedQuery = query ?? ""

    return { trigger, query: trimmedQuery, start: textBeforeCursor.length - trimmedQuery.length - trigger.length }
}

/** 技能提及在正文里的 canonical 落盘形态（与 ZCode 一致：label 是 `$名称`，目标指到 SKILL.md） */
export function buildSkillMentionMarkdown(name: string): string {
    return `[$${name}](${skillMentionPath(name)})`
}

/** 技能入口文件路径（`read_file` 与链接目标的同一份口径） */
export function skillMentionPath(name: string): string {
    return `/${name}/SKILL.md`
}

/** 反转义 markdown label（`\[` → `[`、`\\` → `\`） */
function unescapeMarkdownText(text: string): string {
    let result = ""

    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === "\\" && index + 1 < text.length) {
            result += text[index + 1]
            index += 1
            continue
        }

        result += text[index]
    }

    return result
}

/**
 * @description 解析正文里的技能提及（只认 canonical 链接形态）。
 *
 * label 必须以 `$` 开头且名称合法才算技能提及；其余链接原样当文本回吐，
 * 避免把普通 markdown 链接误读成技能。裸文本短写 `$名称` 不再视为提及
 * ——提及一律来自编辑器的 chip（见文件头注释）。
 * @param text 待解析的正文
 * @returns 文本 / 技能片段序列
 */
export function parseSkillMentions(text: string): SkillMentionPart[] {
    const parts: SkillMentionPart[] = []
    LINK_MENTION_PATTERN.lastIndex = 0
    let cursor = 0

    for (const match of text.matchAll(LINK_MENTION_PATTERN)) {
        const full = match[0] ?? ""
        const label = match[1] ? unescapeMarkdownText(match[1]) : ""
        const matchStart = match.index ?? 0

        if (matchStart > cursor) {
            parts.push({ type: "text", text: text.slice(cursor, matchStart) })
        }

        if (label.startsWith("$") && SKILL_NAME_PATTERN.test(label.slice(1))) {
            parts.push({ type: "skill", name: label.slice(1) })
        } else {
            parts.push({ type: "text", text: full })
        }

        cursor = matchStart + full.length
    }

    if (cursor < text.length) {
        parts.push({ type: "text", text: text.slice(cursor) })
    }

    return parts
}

/**
 * @description 收集正文里被显式提及的技能名（去重）。
 *
 * 这是「用户点名要用某个技能」的唯一判据：装配层据此把对应技能正文作为前缀注入，
 * 模型侧也据此知道该先调 `skill` 工具。
 * @param text 用户输入原文
 * @returns 技能名列表（按首次出现顺序）
 */
export function collectSkillMentionNames(text: string): string[] {
    const names = new Set<string>()

    for (const part of parseSkillMentions(text)) {
        if (part.type === "skill") {
            names.add(part.name)
        }
    }

    return [...names]
}

/**
 * @description 去掉提及语法，得到人类可读的纯文本（气泡展示 / 会话命名用）。
 * @param text 带提及的正文
 * @returns 技能名以裸名保留、其余文本原样的纯文本
 */
export function stripSkillMentions(text: string): string {
    return parseSkillMentions(text)
        .map(part => (part.type === "skill" ? part.name : part.text))
        .join("")
}

/** 模糊匹配得分：命中前缀最优、其次子串、最后按字符顺序子序列；不匹配返回 null（口径对齐 ZCode） */
function scoreFuzzyMatch(text: string, query: string): number | null {
    const target = text.trim().toLowerCase()
    const keyword = query.trim().toLowerCase()

    if (!target) {
        return null
    }

    if (!keyword) {
        return 0
    }

    if (target.startsWith(keyword)) {
        return target.length - keyword.length
    }

    const substringIndex = target.indexOf(keyword)
    if (substringIndex !== -1) {
        return 100 + substringIndex
    }

    let score = 200
    let searchStart = 0

    for (const char of keyword) {
        const foundIndex = target.indexOf(char, searchStart)

        if (foundIndex === -1) {
            return null
        }

        score += foundIndex - searchStart
        searchStart = foundIndex + 1
    }

    return score + (target.length - keyword.length)
}

/** 待过滤的技能条目（注册表清单的子集） */
export interface SkillMentionCandidate {
    name: string
    description?: string | null
    whenToUse?: string | null
}

/**
 * @description 按查询串过滤技能并排序。
 *
 * 名称命中优先于描述命中；空查询返回全部（保持注册表原有顺序）。
 * @param skills 技能候选
 * @param query 查询串
 * @returns 过滤排序后的候选
 */
export function filterSkillMentions<T extends SkillMentionCandidate>(skills: readonly T[], query: string): T[] {
    if (!query.trim()) {
        return [...skills]
    }

    const scored: Array<{ skill: T; score: number }> = []

    for (const skill of skills) {
        const nameScore = scoreFuzzyMatch(skill.name, query)
        const descriptionScore = scoreFuzzyMatch(`${skill.description ?? ""} ${skill.whenToUse ?? ""}`, query)
        const score = Math.min(
            nameScore ?? Number.POSITIVE_INFINITY,
            descriptionScore !== null ? descriptionScore + 250 : Number.POSITIVE_INFINITY
        )

        if (Number.isFinite(score)) {
            scored.push({ skill, score })
        }
    }

    return scored.sort((a, b) => a.score - b.score).map(item => item.skill)
}
