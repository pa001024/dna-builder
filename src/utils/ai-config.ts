/**
 * AI 客户端的通用默认参数。
 *
 * 单独成文件的原因：设置页（`store/setting.ts`）、底层 OpenAI 客户端（`api/openai.ts`）
 * 与资料检索 Agent（`api/dbAgent.ts`）必须使用同一个输出上限，分散在各文件里极易改漏一处，
 * 漏掉的那个入口就会继续按旧上限截断回答。
 */

/**
 * 单次回复的输出 tokens 上限。
 *
 * 中文约 1.5~2 字符 / token，32768 tokens 约合 5 万~6.5 万字符，单轮装得下整份清单式
 * 检索结果或整段配装分析。取值按 DeepSeek 系列的输出能力对齐，不按「够不够客套回答」来定：
 * 上限只是天花板，模型不会因为放宽就必然写满，但设小了会在列举结果时被硬截断。
 */
export const DEFAULT_AI_MAX_TOKENS = 32768

/** 自定义模型为空时的默认上下文窗口（256K tokens）。 */
export const DEFAULT_AI_CONTEXT_WINDOW = 262144

/**
 * 历史版本的输出上限默认值。
 *
 * 这两档都偏小：1024 只够闲聊，8192 列举检索结果仍会在半途被截断，表现为「回答一半就没了」。
 * 需要识别这些值做一次性迁移，原因见 {@link migrateLegacyAiMaxTokens}。
 */
export const LEGACY_AI_MAX_TOKENS: readonly number[] = [1024, 8192]

/** 输出上限在 localStorage 中的键，与设置页读写的是同一个。 */
export const AI_MAX_TOKENS_STORAGE_KEY = "ai_max_tokens"

/** 上下文窗口在 localStorage 中的键，与设置页读写的是同一个。 */
export const AI_CONTEXT_WINDOW_STORAGE_KEY = "ai_context_window"

/** 单位后缀倍率（厂商口径：400K = 400_000，1M = 1_000_000）。 */
const TOKEN_UNIT_MULTIPLIERS: Readonly<Record<string, number>> = { k: 1_000, m: 1_000_000 }

/**
 * @description 解析用户填写的 token 数，支持 400K / 1M 这类单位后缀。
 *
 * 数字原样取整；字符串去空白与千分位逗号后按「数值 + 可选 K/M 后缀」解析
 * （大小写不敏感，支持小数如 1.5M）。空串 / null / 非法文本 / 非正数一律返回 null，
 * 由调用方决定回落默认值还是保持启发式。
 * @param value 设置页的原始值（数字输入框或文本输入框的填写值）
 * @returns 有效的 token 数；无法解析时 null
 */
export function parseTokenCount(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : null
    }
    if (typeof value !== "string") {
        return null
    }
    const text = value.trim().replace(/[,_\s]+/g, "")
    if (!text) {
        return null
    }
    const match = /^(?:(\d+(?:\.\d+)?)|(\.\d+))([kKmM])?$/.exec(text)
    if (!match) {
        return null
    }
    const amount = Number(match[1] ?? match[2])
    if (!Number.isFinite(amount) || amount <= 0) {
        return null
    }
    const total = Math.floor(amount * (match[3] ? TOKEN_UNIT_MULTIPLIERS[match[3].toLowerCase()]! : 1))
    return total > 0 ? total : null
}

/**
 * @description 把用户填写的输出上限归一化为空缺时回落默认值。
 * @param value 设置页的原始值（空字符串 / null / 非法数字一律视为未填）
 * @returns 有效的输出上限
 */
export function resolveAiMaxTokens(value: unknown): number {
    return parseTokenCount(value) ?? DEFAULT_AI_MAX_TOKENS
}

/**
 * @description 把用户填写的上下文窗口归一化为空缺时回落默认值。
 * @param value 设置页的原始值（空字符串 / null / 非法数字一律视为未填）
 * @returns 有效的上下文窗口
 */
export function resolveAiContextWindow(value: unknown): number {
    return parseTokenCount(value) ?? DEFAULT_AI_CONTEXT_WINDOW
}

/**
 * @description 把 localStorage 里遗留的旧默认输出上限迁移为当前默认值。
 *
 * `useLocalStorage` 会在键缺失时把默认值写进 localStorage，因此老账号里存的是当年的默认值，
 * 只改代码里的默认值不会对它生效，必须在建立 store 之前改写存储中的值。
 * 只迁移命中 {@link LEGACY_AI_MAX_TOKENS} 的账号，其它取值一律视为用户自行调整过、保持原样。
 * @returns 是否发生了迁移
 */
export function migrateLegacyAiMaxTokens(): boolean {
    if (typeof localStorage === "undefined") {
        return false
    }

    const raw = localStorage.getItem(AI_MAX_TOKENS_STORAGE_KEY)

    if (raw === null) {
        return false
    }

    let stored: unknown

    try {
        // vueuse 用 JSON 序列化写入，兼容历史版本可能留下的原始数字字符串
        stored = JSON.parse(raw)
    } catch {
        return false
    }

    if (!LEGACY_AI_MAX_TOKENS.includes(Number(stored))) {
        return false
    }

    localStorage.setItem(AI_MAX_TOKENS_STORAGE_KEY, JSON.stringify(DEFAULT_AI_MAX_TOKENS))
    return true
}
