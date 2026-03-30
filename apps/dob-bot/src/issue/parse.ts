/**
 * 提取 `@dob-bot` 后面的自然语言指令。
 * 兼容旧的 `dob-bot` JSON 代码块作为回退。
 */

export type ReplaceCommand = {
    action: "replace"
    path: string
    find: string
    replace: string
}

/**
 * 提取自然语言任务。
 * @param {string} text
 * @returns {string | null}
 */
export function extractDobBotInstruction(text: string): string | null {
    const mention = extractMentionInstruction(text)
    if (mention) return mention

    const legacy = parseDobBotCommand(text)
    if (!legacy) return null
    return JSON.stringify(legacy)
}

/**
 * 解析旧的最小修复指令。
 * @param {string} text
 * @returns {ReplaceCommand | null}
 */
export function parseDobBotCommand(text: string): ReplaceCommand | null {
    const blocks = extractCodeBlocks(text, "dob-bot")
    for (const block of blocks) {
        const cmd = tryParseJson(block) as Partial<ReplaceCommand> | null
        if (!cmd) continue
        if (cmd.action !== "replace") continue
        if (typeof cmd.path !== "string" || cmd.path.trim() === "") continue
        if (typeof cmd.find !== "string") continue
        if (typeof cmd.replace !== "string") continue
        return {
            action: "replace",
            path: cmd.path,
            find: cmd.find,
            replace: cmd.replace,
        }
    }
    return null
}

/**
 * 提取 `@dob-bot` 之后的内容。
 * @param {string} text
 * @returns {string | null}
 */
function extractMentionInstruction(text: string): string | null {
    const marker = "@dob-bot"
    const idx = text.toLowerCase().indexOf(marker)
    if (idx < 0) return null
    const after = text.slice(idx + marker.length).trim()
    return after.length > 0 ? after : null
}

/**
 * 提取指定语言的代码块。
 * @param {string} text
 * @param {string} lang
 * @returns {string[]}
 */
function extractCodeBlocks(text: string, lang: string): string[] {
    const re = new RegExp(String.raw`(?:^|\n)\`\`\`${escapeRegExp(lang)}\s*\n([\s\S]*?)\n\`\`\``, "g")
    const out: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
        out.push(m[1].trim())
    }
    return out
}

/**
 * 转义正则特殊字符。
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 失败时返回 null。
 * @param {string} s
 * @returns {any | null}
 */
function tryParseJson(s: string): any | null {
    try {
        return JSON.parse(s)
    } catch {
        return null
    }
}
