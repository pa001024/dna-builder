export type HotkeyPreviewTokenType = "key" | "separator"

export interface HotkeyPreviewToken {
    text: string
    type: HotkeyPreviewTokenType
}

export interface HotkeyRecordingModifiers {
    ctrl: boolean
    alt: boolean
    shift: boolean
    meta: boolean
}

/**
 * 将热键字符串拆成可渲染的预览片段。
 * @param value 原始热键字符串。
 * @returns 预览片段列表。
 */
export function tokenizeHotkeyPreview(value: string): HotkeyPreviewToken[] {
    const text = String(value ?? "").trim()
    if (!text) {
        return []
    }

    const tokens: HotkeyPreviewToken[] = []
    let index = 0

    while (index < text.length) {
        const current = text[index]
        if (/\s/u.test(current)) {
            index += 1
            continue
        }

        if (current === "+" || current === "&") {
            const previous = index > 0 ? text[index - 1] : ""
            const next = index + 1 < text.length ? text[index + 1] : ""
            const isLeadingPrefix = current === "+" && (index === 0 || /\s/u.test(previous)) && next !== " "

            if (!isLeadingPrefix) {
                tokens.push({ text: current, type: "separator" })
                index += 1
                continue
            }
        }

        let end = index
        while (end < text.length && !/\s/u.test(text[end]) && text[end] !== "+" && text[end] !== "&") {
            end += 1
        }

        const rawToken = text.slice(index, end)
        const prefixMatch = rawToken.match(/^([\^!+#*]+)(.+)$/u)
        if (prefixMatch?.[1] && prefixMatch[2]) {
            for (const symbol of prefixMatch[1]) {
                tokens.push({ text: symbol, type: "key" })
            }
            tokens.push({ text: prefixMatch[2], type: "key" })
        } else {
            tokens.push({ text: rawToken, type: "key" })
        }

        index = end
    }

    return tokens
}

/**
 * 将热键字符串拆成适合人类阅读的预览片段。
 * @param value 原始热键字符串。
 * @returns 人类可读的预览片段列表。
 */
export function tokenizeHotkeyDisplay(value: string): HotkeyPreviewToken[] {
    const text = String(value ?? "").trim()
    if (!text) {
        return []
    }

    const comboParts = text.split(/\s*&\s*/u).filter(Boolean)
    if (comboParts.length > 1) {
        return comboParts.flatMap((part, index) => {
            const tokens = tokenizeHotkeyDisplayGroup(part)
            if (index === 0) {
                return tokens
            }
            return [{ text: "+", type: "separator" } as HotkeyPreviewToken, ...tokens]
        })
    }

    return tokenizeHotkeyDisplayGroup(text)
}

/**
 * 将单段热键文本转换为人类可读片段。
 * @param value 单段热键文本。
 * @returns 人类可读的预览片段列表。
 */
function tokenizeHotkeyDisplayGroup(value: string): HotkeyPreviewToken[] {
    const text = String(value ?? "").trim()
    if (!text) {
        return []
    }

    const prefixMatch = text.match(/^([\^!+#*~$<>]+)(.+)$/u)
    if (prefixMatch?.[1] && prefixMatch[2]) {
        const tokens: HotkeyPreviewToken[] = []
        const prefixTokens = Array.from(prefixMatch[1])
            .map(formatHotkeyPrefixToken)
            .filter((token): token is string => Boolean(token))
        prefixTokens.forEach((token, index) => {
            if (index > 0) {
                tokens.push({ text: "+", type: "separator" })
            }
            tokens.push({ text: token, type: "key" })
        })
        if (prefixTokens.length > 0) {
            tokens.push({ text: "+", type: "separator" })
        }
        tokens.push(...tokenizeHotkeyDisplayGroup(prefixMatch[2]))
        return tokens
    }

    const plusParts = text.split(/\s*\+\s*/u).filter(Boolean)
    if (plusParts.length > 1) {
        return plusParts.flatMap((part, index) => {
            const tokens = tokenizeHotkeyDisplayGroup(part)
            if (index === 0) {
                return tokens
            }
            return [{ text: "+", type: "separator" } as HotkeyPreviewToken, ...tokens]
        })
    }

    const words = text.split(/\s+/u).filter(Boolean)
    if (words.length > 1) {
        return words.flatMap((part, index) => {
            const tokens = tokenizeHotkeyDisplayGroup(part)
            if (index === 0) {
                return tokens
            }
            return [{ text: " ", type: "separator" } as HotkeyPreviewToken, ...tokens]
        })
    }

    return [{ text: formatHotkeyDisplayKey(text), type: "key" }]
}

/**
 * 将 AHK 前缀符号转换成人类可读的修饰键名称。
 * @param token AHK 前缀符号。
 * @returns 修饰键名称，无需展示时返回空字符串。
 */
function formatHotkeyPrefixToken(token: string): string {
    switch (token) {
        case "^":
            return "Ctrl"
        case "!":
            return "Alt"
        case "+":
            return "Shift"
        case "#":
            return "Win"
        default:
            return ""
    }
}

/**
 * 将单个按键文本转换成人类可读名称。
 * @param token 原始按键文本。
 * @returns 人类可读名称。
 */
function formatHotkeyDisplayKey(token: string): string {
    const text = String(token ?? "").trim()
    if (!text) {
        return ""
    }

    if (text.length === 1) {
        return text.toUpperCase()
    }

    switch (text) {
        case "Esc":
        case "Escape":
            return "Esc"
        case "BS":
        case "Backspace":
            return "Backspace"
        case "Del":
        case "Delete":
            return "Delete"
        case "Ins":
        case "Insert":
            return "Insert"
        case "PgUp":
        case "PageUp":
            return "Page Up"
        case "PgDn":
        case "PageDown":
            return "Page Down"
        case "Space":
            return "Space"
        case "AppsKey":
            return "Menu"
        case "LButton":
            return "Left Button"
        case "RButton":
            return "Right Button"
        case "MButton":
            return "Middle Button"
        case "XButton1":
            return "Mouse 4"
        case "XButton2":
            return "Mouse 5"
        case "Up":
        case "Down":
        case "Left":
        case "Right":
        case "Enter":
        case "Tab":
        case "Home":
        case "End":
        case "Ctrl":
        case "Alt":
        case "Shift":
        case "Win":
            return text
        default:
            break
    }

    if (/^F\d{1,2}$/iu.test(text)) {
        return text.toUpperCase()
    }
    if (/^Numpad/iu.test(text)) {
        return text.replace(/^Numpad/u, "Numpad ")
    }

    return text
}

/**
 * 将录制得到的修饰键与主键拼成 AHK 热键文本。
 * @param modifiers 当前按下的修饰键状态。
 * @param key 主键文本。
 * @returns AHK 热键文本。
 */
export function buildRecordedHotkey(modifiers: HotkeyRecordingModifiers, key: string): string {
    const prefix = `${modifiers.ctrl ? "^" : ""}${modifiers.alt ? "!" : ""}${modifiers.shift ? "+" : ""}${modifiers.meta ? "#" : ""}`
    return `${prefix}${key}`.trim()
}

/**
 * 将键盘事件归一化为可录制的主键文本。
 * @param event 键盘事件。
 * @returns 主键文本，无法录制时返回 null。
 */
export function normalizeRecordedKeyboardKey(event: Pick<KeyboardEvent, "key" | "code">): string | null {
    const rawKey = String(event.key ?? "")
    const rawCode = String(event.code ?? "")
    const key = rawKey === " " ? "Space" : rawKey.trim()
    if (!key && !rawCode) {
        return null
    }
    if (["Control", "Shift", "Alt", "Meta"].includes(key)) {
        return null
    }
    if (key.length === 1) {
        return key.toLowerCase()
    }

    switch (key) {
        case "Spacebar":
        case "Space":
            return "Space"
        case "ArrowUp":
            return "Up"
        case "ArrowDown":
            return "Down"
        case "ArrowLeft":
            return "Left"
        case "ArrowRight":
            return "Right"
        case "Enter":
            return "Enter"
        case "Escape":
            return "Esc"
        case "Delete":
            return "Del"
        case "Backspace":
            return "BS"
        case "PageUp":
            return "PgUp"
        case "PageDown":
            return "PgDn"
        case "Insert":
            return "Ins"
        case " ":
            return "Space"
        case "Tab":
            return "Tab"
        case "CapsLock":
            return "CapsLock"
        case "NumLock":
            return "NumLock"
        case "ScrollLock":
            return "ScrollLock"
        case "PrintScreen":
            return "PrintScreen"
        case "ContextMenu":
            return "AppsKey"
        default:
            break
    }

    if (/^F\d{1,2}$/iu.test(key)) {
        return key.toUpperCase()
    }
    const codeKey = rawCode.replace(/^Numpad/u, "Numpad")
    if (/^Numpad/iu.test(codeKey)) {
        const normalized = codeKey
        switch (normalized) {
            case "NumpadDecimal":
                return "NumpadDel"
            case "NumpadMultiply":
                return "NumpadMult"
            case "NumpadAdd":
                return "NumpadAdd"
            case "NumpadSubtract":
                return "NumpadSub"
            case "NumpadDivide":
                return "NumpadDiv"
            default:
                return normalized
        }
    }

    return key || codeKey || null
}

/**
 * 将鼠标按键归一化为可录制的热键文本。
 * @param button 鼠标按钮编号。
 * @returns 热键按钮文本，无法录制时返回 null。
 */
export function normalizeRecordedMouseButton(button: number): string | null {
    switch (button) {
        case 0:
            return "LButton"
        case 1:
            return "MButton"
        case 2:
            return "RButton"
        case 3:
            return "XButton1"
        case 4:
            return "XButton2"
        default:
            return null
    }
}
