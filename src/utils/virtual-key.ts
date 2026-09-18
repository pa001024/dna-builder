/**
 * 浏览器键盘事件 → Windows 虚拟键码(VK)映射。
 *
 * 浮窗后端用 `GetAsyncKeyState(VK)` 轮询按键,因此设置页需要把用户在页面里按下的键
 * 转成同一个虚拟键码体系。优先使用 `event.code`(物理键位,与输入法/键盘布局无关),
 * 无法识别时再回退到 `event.keyCode`(仍是 VK 值,只是已废弃)。
 */

/**
 * `KeyboardEvent.code` → 虚拟键码表。
 * 字母/数字/功能键/Numpad 这类有规律的批量生成,其余手工列出。
 * @returns 键位表
 */
function buildCodeToVkMap(): Record<string, number> {
    const map: Record<string, number> = {}
    for (let i = 0; i < 26; i += 1) {
        map[`Key${String.fromCharCode(65 + i)}`] = 0x41 + i
    }
    for (let i = 0; i <= 9; i += 1) {
        map[`Digit${i}`] = 0x30 + i
        map[`Numpad${i}`] = 0x60 + i
    }
    for (let i = 1; i <= 24; i += 1) {
        map[`F${i}`] = 0x6f + i
    }
    Object.assign(map, {
        Backspace: 0x08,
        Tab: 0x09,
        Enter: 0x0d,
        NumpadEnter: 0x0d,
        ShiftLeft: 0x10,
        ShiftRight: 0x10,
        ControlLeft: 0x11,
        ControlRight: 0x11,
        AltLeft: 0x12,
        AltRight: 0x12,
        Pause: 0x13,
        CapsLock: 0x14,
        Escape: 0x1b,
        Space: 0x20,
        PageUp: 0x21,
        PageDown: 0x22,
        End: 0x23,
        Home: 0x24,
        ArrowLeft: 0x25,
        ArrowUp: 0x26,
        ArrowRight: 0x27,
        ArrowDown: 0x28,
        PrintScreen: 0x2c,
        Insert: 0x2d,
        Delete: 0x2e,
        ContextMenu: 0x5d,
        NumpadMultiply: 0x6a,
        NumpadAdd: 0x6b,
        NumpadSubtract: 0x6d,
        NumpadDecimal: 0x6e,
        NumpadDivide: 0x6f,
        NumLock: 0x90,
        ScrollLock: 0x91,
        Semicolon: 0xba,
        Equal: 0xbb,
        Comma: 0xbc,
        Minus: 0xbd,
        Period: 0xbe,
        Slash: 0xbf,
        Backquote: 0xc0,
        BracketLeft: 0xdb,
        Backslash: 0xdc,
        BracketRight: 0xdd,
        Quote: 0xde,
    })
    return map
}

/** `KeyboardEvent.code` → 虚拟键码。 */
export const CODE_TO_VK: Readonly<Record<string, number>> = buildCodeToVkMap()

/** 虚拟键码有效区间(1 ~ 254;0 表示未绑定)。 */
export const VK_MIN = 1
export const VK_MAX = 254

/**
 * 把任意输入钳制为合法的虚拟键码。
 * @param value 候选值
 * @returns 合法 VK;非法时返回 0(表示未绑定)
 */
export function clampVk(value: number): number {
    if (!Number.isFinite(value)) return 0
    const vk = Math.trunc(value)
    return vk >= VK_MIN && vk <= VK_MAX ? vk : 0
}

/**
 * 从键盘事件解析虚拟键码。
 * @param event 键盘事件
 * @returns 虚拟键码;无法识别时返回 0
 */
export function vkFromKeyboardEvent(event: Pick<KeyboardEvent, "code" | "keyCode">): number {
    const byCode = CODE_TO_VK[event.code]
    if (byCode !== undefined) return byCode
    return clampVk(event.keyCode)
}

/**
 * 虚拟键码 → 可读标签(与后端 `label_from_vk` 保持一致,用于未自定义标签时的显示)。
 * @param vk 虚拟键码
 * @returns 标签文本;无法识别时返回空字符串
 */
export function vkLabel(vk: number): string {
    if (!Number.isFinite(vk)) return ""
    const code = Math.trunc(vk)
    if (code >= 0x30 && code <= 0x39) return String.fromCharCode(code)
    if (code >= 0x41 && code <= 0x5a) return String.fromCharCode(code)
    if (code >= 0x60 && code <= 0x69) return `Num${code - 0x60}`
    if (code >= 0x70 && code <= 0x87) return `F${code - 0x6f}`
    const named: Record<number, string> = {
        8: "Backspace",
        9: "Tab",
        13: "Enter",
        16: "Shift",
        17: "Ctrl",
        18: "Alt",
        19: "Pause",
        20: "CapsLock",
        27: "Esc",
        32: "Space",
        33: "PgUp",
        34: "PgDn",
        35: "End",
        36: "Home",
        37: "←",
        38: "↑",
        39: "→",
        40: "↓",
        44: "PrtSc",
        45: "Ins",
        46: "Del",
        93: "Menu",
        106: "Num*",
        107: "Num+",
        109: "Num-",
        110: "Num.",
        111: "Num/",
        144: "NumLock",
        145: "ScrollLock",
        186: ";",
        187: "=",
        188: ",",
        189: "-",
        190: ".",
        191: "/",
        192: "`",
        219: "[",
        220: "\\",
        221: "]",
        222: "'",
    }
    return named[code] ?? ""
}
