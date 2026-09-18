/**
 * 资料检索 Agent「向用户提问」的数据模型与纯函数。
 *
 * 单独成文件的理由与 ai-pricing / ai-billing 的拆法一致：这里的解析 / 归一化 / 校验
 * 全是纯逻辑，可以在不 import Dexie、不依赖浏览器环境的前提下单测；
 * Agent 循环（dbAgent.ts）只负责把归一化后的结果挂起与回填。
 *
 * 设计要点：
 * - 一次提问可以包含多道题（对应界面上一张卡片里的多行），题与题之间相互独立；
 * - 每道题固定「选项 + 自由输入」两种作答方式，`allowCustom` 只控制自由输入是否展示，
 *   不会取消除选项——模型无法用这个字段把用户逼进单选题；
 * - 题目与选项都由模型生成，因此取值一律做长度与数量裁剪，防止超长文本撑爆界面。
 */

/** 单道题的单个可选项 */
export interface AskUserOption {
    /** 选项 id（回填给模型时用它，语义比下标稳定） */
    id: string
    /** 选项展示文案 */
    label: string
    /** 选项补充说明（可选） */
    description?: string
}

/** 单道题 */
export interface AskUserQuestion {
    /** 题号 id */
    id: string
    /** 题干，例如「要查哪一类剧情？」 */
    header: string
    /** 补充说明（可选） */
    question?: string
    /** 可选选项（可以为空，此时只剩自由输入） */
    options: AskUserOption[]
    /** 是否展示自由输入（默认 true） */
    allowCustom: boolean
    /** 是否允许多选（默认 false） */
    multiple: boolean
}

/** 一次提问请求 */
export interface AskUserRequest {
    /** 提问 id，用于把用户的回答与这次提问对应起来 */
    id: string
    /** 提问的引导语 / 总标题（可选） */
    title?: string
    /** 题目列表（至少一道） */
    questions: AskUserQuestion[]
}

/** 用户对单道题的回答 */
export interface AskUserAnswer {
    /** 题号 id */
    questionId: string
    /** 选中的选项 id 列表（单选时长度为 0 或 1） */
    optionIds: string[]
    /** 用户自己输入的文本（可为空） */
    custom?: string
}

/** 用户对整次提问的回答 */
export interface AskUserResponse {
    /** 提问 id */
    requestId: string
    /** 逐题回答 */
    answers: AskUserAnswer[]
    /** 用户是否跳过了整张提问卡片 */
    skipped?: boolean
}

/** 题干 / 选项文案的长度上限，防止模型生成超长文本撑坏布局 */
const MAX_HEADER_LENGTH = 120
const MAX_TEXT_LENGTH = 400
const MAX_DESCRIPTION_LENGTH = 300
/** 单道题的选项数量上限 */
const MAX_OPTIONS_PER_QUESTION = 8
/** 单次提问的题目数量上限 */
const MAX_QUESTIONS = 5

/**
 * 裁剪文本到指定长度，并统一去掉首尾空白。
 * @param value 原始文本
 * @param maxLength 长度上限
 * @returns 裁剪后的文本
 */
function clampText(value: unknown, maxLength: number): string {
    if (value === undefined || value === null) {
        return ""
    }

    const text = `${value}`.trim()

    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/**
 * 归一化模型给出的 ask_user 参数。
 *
 * 容错面较宽，因为上游模型对嵌套结构的遵守程度不一：
 * - `questions` 允许是 JSON 字符串；
 * - `options` 允许是字符串数组（只有文案、没有 id）；
 * - 题干缺失时用 `header` / `question` / `label` 兜底。
 *
 * @param raw 原始参数
 * @returns 归一化后的提问请求；结构无法修复时返回 null
 */
export function normalizeAskUserRequest(raw: unknown): AskUserRequest | null {
    let source = raw

    if (typeof raw === "string" && raw.trim()) {
        try {
            source = JSON.parse(raw)
        } catch {
            return null
        }
    }

    if (!source || typeof source !== "object" || Array.isArray(source)) {
        return null
    }

    const record = source as Record<string, unknown>
    let rawQuestions = record.questions

    if (typeof rawQuestions === "string" && rawQuestions.trim()) {
        try {
            rawQuestions = JSON.parse(rawQuestions)
        } catch {
            return null
        }
    }

    // 模型偶尔会只给单道题（把题面写在顶层），这里统一包成数组
    if (!Array.isArray(rawQuestions)) {
        rawQuestions = [record]
    }

    const questions: AskUserQuestion[] = []

    for (const rawQuestion of rawQuestions as unknown[]) {
        if (questions.length >= MAX_QUESTIONS) {
            break
        }

        if (!rawQuestion || typeof rawQuestion !== "object" || Array.isArray(rawQuestion)) {
            continue
        }

        const question = rawQuestion as Record<string, unknown>
        const header = clampText(question.header ?? question.title ?? question.question ?? question.label, MAX_HEADER_LENGTH)

        // 没有题干、也没有任何选项的题对用户毫无意义，直接丢弃
        const rawOptions = Array.isArray(question.options) ? question.options : []
        const options: AskUserOption[] = []

        for (const rawOption of rawOptions) {
            if (options.length >= MAX_OPTIONS_PER_QUESTION) {
                break
            }

            // 选项允许写成纯字符串（最常见）或 { id, label, description }
            if (typeof rawOption === "string" || typeof rawOption === "number") {
                const label = clampText(rawOption, MAX_TEXT_LENGTH)

                if (label) {
                    options.push({ id: `opt_${options.length + 1}`, label })
                }

                continue
            }

            if (!rawOption || typeof rawOption !== "object" || Array.isArray(rawOption)) {
                continue
            }

            const option = rawOption as Record<string, unknown>
            const label = clampText(option.label ?? option.text ?? option.value ?? option.name, MAX_TEXT_LENGTH)

            if (!label) {
                continue
            }

            const description = clampText(option.description ?? option.desc, MAX_DESCRIPTION_LENGTH)

            options.push({
                id: clampText(option.id, 64) || `opt_${options.length + 1}`,
                label,
                description: description || undefined,
            })
        }

        if (!header && !options.length) {
            continue
        }

        const index = questions.length + 1

        questions.push({
            id: clampText(question.id, 64) || `q_${index}`,
            header: header || `问题 ${index}`,
            question: clampText(question.question, MAX_TEXT_LENGTH) || undefined,
            options,
            // 默认允许自由输入：模型无法把用户锁死在给定选项里
            allowCustom: question.allowCustom !== false,
            multiple: question.multiple === true,
        })
    }

    if (!questions.length) {
        return null
    }

    return {
        id: clampText(record.id, 64) || `ask_${Date.now()}`,
        title: clampText(record.title, MAX_HEADER_LENGTH) || undefined,
        questions,
    }
}

/**
 * 把用户的回答整理成回填给模型的文本。
 *
 * 用自然语言而不是 JSON：这一条会作为 `tool` 消息进入上下文，
 * 可读性更好，模型也更不容易漏读字段。
 * @param request 提问请求（用于把选项 id 还原成文案）
 * @param response 用户回答
 * @returns 回填文本
 */
export function formatAskUserResponse(request: AskUserRequest, response: AskUserResponse): string {
    if (response.skipped) {
        return "用户跳过了这次提问，没有提供任何补充信息。请基于已有信息继续，或直接说明还需要什么信息。"
    }

    const lines: string[] = []

    for (const question of request.questions) {
        const answer = response.answers.find(item => item.questionId === question.id)
        const parts: string[] = []

        for (const optionId of answer?.optionIds ?? []) {
            const option = question.options.find(item => item.id === optionId)
            // 选项找不到时保留原始 id，便于排查而不是静默丢弃
            parts.push(option?.label ?? optionId)
        }

        if (answer?.custom?.trim()) {
            parts.push(`用户补充：${answer.custom.trim()}`)
        }

        if (!parts.length) {
            continue
        }

        lines.push(`${question.header}：${parts.join("；")}`)
    }

    if (!lines.length) {
        return "用户没有作答任何一项。请基于已有信息继续检索，不要重复提问同一件事。"
    }

    return `用户的回答如下：\n${lines.join("\n")}`
}

/**
 * 校验用户回答是否至少覆盖了一道题。
 * @param request 提问请求
 * @param response 用户回答
 * @returns 是否有内容可回填
 */
export function hasAskAnswer(request: AskUserRequest, response: AskUserResponse): boolean {
    if (response.skipped) {
        return true
    }

    return response.answers.some(answer => {
        const question = request.questions.find(item => item.id === answer.questionId)

        if (!question) {
            return false
        }

        return answer.optionIds.some(optionId => question.options.some(option => option.id === optionId)) || !!answer.custom?.trim()
    })
}

/**
 * 为提问请求生成一句话摘要，供界面上的工具条展示。
 * @param request 提问请求
 * @returns 摘要文本
 */
export function summarizeAskUserRequest(request: AskUserRequest): string {
    const first = request.questions[0]

    if (!first) {
        return "等待用户选择"
    }

    return request.questions.length > 1 ? `${request.questions.length} 个问题待选择` : `等待选择：${first.header}`
}
