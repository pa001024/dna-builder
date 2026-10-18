const DEFAULT_DSL_WORD_KEYS = Object.freeze([
    "lctrl",
    "rctrl",
    "ctrl",
    "lshift",
    "rshift",
    "shift",
    "escape",
    "esc",
    "backspace",
    "space",
    "enter",
    "left",
    "right",
    "up",
    "down",
    "tab",
    "capslock",
    "numlock",
    "num0",
    "num1",
    "num2",
    "num3",
    "num4",
    "num5",
    "num6",
    "num7",
    "num8",
    "num9",
    "scrolllock",
    "printscreen",
    "insert",
    "delete",
    "del",
    "home",
    "end",
    "pageup",
    "pagedown",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7",
    "f8",
    "f9",
    "f10",
    "f11",
    "f12",
    "browser_back",
    "browser_forward",
    "browser_refresh",
    "browser_stop",
    "browser_search",
    "browser_favorites",
    "browser_home",
    "launch_mail",
    "launch_media_select",
    "launch_app1",
    "launch_app2",
    "media_next_track",
    "media_prev_track",
    "media_play_pause",
    "media_stop",
    "volume_mute",
    "volume_down",
    "volume_up",
])

export class DslParser {
    /**
     * 创建 DSL 解析器。
     * @param {string} dsl DSL 源码
     * @param {readonly string[]} [wordKeys] 大括号语法 `{name}` 中可识别的多字符按键名
     */
    constructor(dsl, wordKeys = DEFAULT_DSL_WORD_KEYS) {
        if (typeof dsl !== "string") throw new TypeError("dsl must be a string")
        if (!Array.isArray(wordKeys)) throw new TypeError("wordKeys must be an array")
        this.src = dsl
        this.wordKeys = wordKeys
        this.i = 0
    }

    /** @returns {boolean} 是否已读取到源码末尾 */
    eof() {
        return this.i >= this.src.length
    }

    /** @returns {string | undefined} 当前字符 */
    peek() {
        return this.src[this.i]
    }

    /** 跳过当前位置后的空白字符。 */
    skipWs() {
        while (!this.eof()) {
            const ch = this.peek()
            if (ch == null || !/\s/.test(ch)) break
            this.i++
        }
    }

    /**
     * 抛出包含当前位置的解析错误。
     * @param {string} message 错误内容
     * @returns {never}
     */
    error(message) {
        throw new Error(`${message} @${this.i}`)
    }

    /**
     * 读取当前位置的非负数字。
     * @param {{ integer?: boolean }} [options] 数字读取选项
     * @returns {number | null} 读取结果
     */
    readNumber(options) {
        const integer = options?.integer ?? false
        this.skipWs()
        const start = this.i
        while (!this.eof()) {
            const ch = this.peek()
            if (ch == null || !/[0-9]/.test(ch)) break
            this.i++
        }
        if (!integer && !this.eof() && this.peek() === ".") {
            this.i++
            while (!this.eof()) {
                const ch = this.peek()
                if (ch == null || !/[0-9]/.test(ch)) break
                this.i++
            }
        }
        if (this.i === start) return null
        const value = Number(this.src.slice(start, this.i))
        if (!Number.isFinite(value)) this.error("invalid number")
        return value
    }

    /** @returns {Array<object>} 解析后的 DSL 节点 */
    parse() {
        const nodes = this.parseSequence()
        this.skipWs()
        if (!this.eof()) this.error(`unexpected token: ${this.peek()}`)
        return nodes
    }

    /**
     * 解析连续节点。
     * @param {string | undefined} [stopChar] 序列结束字符
     * @returns {Array<object>} 节点列表
     */
    parseSequence(stopChar = undefined) {
        const nodes = []
        while (!this.eof()) {
            this.skipWs()
            if (stopChar && this.peek() === stopChar) {
                this.i++
                break
            }
            if (this.eof()) break
            const node = this.parseNode()
            if (node) nodes.push(node)
        }
        return nodes
    }

    /** @returns {object | null} 下一个 DSL 节点 */
    parseNode() {
        this.skipWs()
        if (this.eof()) return null

        const ch = this.peek()
        if (ch == null) return null
        if (ch === "#") return this.parseWait()
        if (ch === "+") return this.parseLoop()
        if (ch === "(") return this.parseGroup()
        if (ch === "L" || ch === "R" || ch === "M" || ch === "X") return this.parseMouse()
        if (ch === "{") return this.parseBraceKey()
        return this.parseKey()
    }

    /** @returns {{ type: "wait", ms: number }} 等待节点 */
    parseWait() {
        this.i++
        const seconds = this.readNumber()
        if (seconds == null) this.error("missing wait duration")
        return { type: "wait", ms: Math.round(seconds * 1000) }
    }

    /** @returns {{ type: "loop", count: number, body: Array<object> }} 循环节点 */
    parseLoop() {
        this.i++
        const count = this.readNumber({ integer: true })
        if (count == null) this.error("missing loop count")
        this.skipWs()
        if (this.eof()) this.error("missing loop body")
        const body = this.peek() === "(" ? this.parseGroup().body : [this.parseNode()].filter(Boolean)
        if (!body.length) this.error("missing loop body")
        return { type: "loop", count, body }
    }

    /** @returns {{ type: "group", body: Array<object> }} 分组节点 */
    parseGroup() {
        if (this.peek() !== "(") this.error("missing group open")
        this.i++
        return { type: "group", body: this.parseSequence(")") }
    }

    /**
     * 读取可选的坐标对 `(x, y)`。
     * @returns {{ x: number | undefined, y: number | undefined }} 坐标；无坐标时均为 undefined
     */
    readCoordPair() {
        this.skipWs()
        if (this.peek() !== "(") return { x: undefined, y: undefined }
        this.i++
        const parsedX = this.readNumber({ integer: true })
        if (parsedX == null) this.error("missing mouse x")
        this.skipWs()
        if (this.peek() !== ",") this.error("missing mouse separator")
        this.i++
        const parsedY = this.readNumber({ integer: true })
        if (parsedY == null) this.error("missing mouse y")
        this.skipWs()
        if (this.peek() !== ")") this.error("missing mouse close")
        this.i++
        return { x: parsedX, y: parsedY }
    }

    /** @returns {{ type: "mouse", button: string, x: number | undefined, y: number | undefined, waitMs: number }} 鼠标节点 */
    parseMouse() {
        const buttonChar = this.peek()
        if (buttonChar !== "L" && buttonChar !== "R" && buttonChar !== "M" && buttonChar !== "X") this.error("invalid mouse token")
        this.i++
        let button
        if (buttonChar === "X") {
            const sideIndex = this.readNumber({ integer: true })
            if (sideIndex !== 1 && sideIndex !== 2) this.error("invalid x-button index, expect X1 or X2")
            button = sideIndex === 1 ? "x1" : "x2"
        } else {
            button = buttonChar === "R" ? "right" : buttonChar === "M" ? "middle" : "left"
        }
        const { x, y } = this.readCoordPair()
        const waitMs = this.readNumber()
        return {
            type: "mouse",
            button,
            x,
            y,
            waitMs: waitMs == null ? 0 : Math.round(waitMs * 1000),
        }
    }

    /**
     * 解析按键节点。简单键直接写单字符（如 `a`、`1`），后接数字为按住时长（秒），
     * 后接 `0` 表示按下（如 `a0`），后接 `^` 表示弹起（如 `a^`）。
     * @returns {{ type: "key", key: string, duration?: number, action?: "down" | "up" }} 按键节点
     */
    parseKey() {
        const key = this.readKeyToken()
        if (!key) this.error(`unexpected token: ${this.peek() ?? "EOF"}`)
        const duration = this.readNumber()
        let action
        if (duration == null && this.peek() === "^") {
            this.i++
            action = "up"
        }
        return {
            type: "key",
            key,
            duration: duration == null ? undefined : Math.round(duration * 1000),
            action,
        }
    }

    /**
     * 解析大括号按键节点，用于非简单键：`{esc}`、`{esc down}`、`{esc up}`、
     * `{1}`、`{num1}`、`{esc 1.5}`（数字为按住秒数）。括号内容大小写不敏感，
     * 如 `{ESC}`、`{W Down}`、`{Num1 Up}` 均合法。
     * @returns {{ type: "key", key: string, duration?: number, action?: "down" | "up" }} 按键节点
     */
    parseBraceKey() {
        this.i++
        const end = this.src.indexOf("}", this.i)
        if (end < 0) this.error("missing closing brace")
        const raw = this.src.slice(this.i, end)
        this.i = end + 1
        const parts = raw.trim().split(/\s+/).filter(Boolean)
        if (parts.length === 0) this.error("empty key braces")
        const name = parts[0].toLowerCase()
        const isSimple = name.length === 1 && /[a-z0-9]/.test(name)
        if (!isSimple && !this.wordKeys.includes(name)) this.error(`unsupported key: ${name}`)
        const key = name
        let duration
        let action
        if (parts.length > 2) this.error(`invalid key modifiers: ${parts.slice(1).join(" ")}`)
        if (parts.length === 2) {
            const modifier = parts[1].toLowerCase()
            if (modifier === "down") {
                action = "down"
            } else if (modifier === "up") {
                action = "up"
            } else {
                const seconds = Number(modifier)
                if (!Number.isFinite(seconds)) this.error(`invalid key modifier: ${modifier}`)
                duration = Math.round(seconds * 1000)
            }
        }
        return { type: "key", key, duration, action }
    }

    /**
     * 读取按键名称。仅支持简单键（单个字母/数字）与 `_`（空格）、`>`（左 Shift）、
     * `C`（左 Ctrl）；多字符按键必须使用大括号语法 `{name}`。
     * @returns {string | null} 按键名称
     */
    readKeyToken() {
        this.skipWs()
        if (this.eof()) return null

        const ch = this.peek()
        if (ch == null) return null
        if (ch === '"' || ch === "'") {
            const quote = ch
            this.i++
            const end = this.src.indexOf(quote, this.i)
            if (end < 0) this.error("missing closing quote")
            const raw = this.src.slice(this.i, end)
            this.i = end + 1
            if (raw.length === 1 && /[a-z0-9]/i.test(raw)) return raw.toLowerCase()
            this.error(`unsupported quoted key: ${raw} (use {${raw}})`)
        }

        if (ch === "_") {
            this.i++
            return "space"
        }
        if (ch === ">") {
            this.i++
            return "lshift"
        }
        if (ch === "C") {
            this.i++
            return "lctrl"
        }

        if (/[a-z0-9]/i.test(ch)) {
            this.i++
            return ch.toLowerCase()
        }

        return null
    }
}

class PlayInterruptedError extends Error {
    /** 创建 DSL 播放中断错误。 */
    constructor() {
        super("play interrupted")
        this.name = "PlayInterruptedError"
    }
}

export class Cap {
    #playToken = 0

    /**
     * 将按键缩写/全称规整为引擎支持的按键名。
     * @param {string | undefined} button 鼠标按键
     * @returns {"left" | "right" | "middle" | "x1" | "x2" | undefined}
     */
    static #normalizeButton(button) {
        if (button == null) return undefined
        const text = button.toLowerCase()
        const t = { l: "left", r: "right", m: "middle" }
        if (text in t) button = t[text]
        return button
    }

    /**
     * 创建游戏窗口操作实例。
     * @param {number} hwnd 游戏窗口句柄
     * @param {{ resize?: false | [number, number], yOffset?: number }} [options] 初始化参数
     */
    constructor(hwnd, options = {}) {
        if (typeof hwnd !== "number" || !Number.isFinite(hwnd) || hwnd === 0) throw new TypeError("Cap hwnd must be a non-zero number")
        if (options == null || typeof options !== "object") throw new TypeError("Cap options must be an object")
        if (options.yOffset != null && (typeof options.yOffset !== "number" || !Number.isFinite(options.yOffset))) {
            throw new TypeError("Cap options.yOffset must be a number")
        }
        if (options.resize != null && options.resize !== false && !(Array.isArray(options.resize) && options.resize.length === 2)) {
            throw new TypeError("Cap options.resize must be false or [w, h]")
        }
        this.hwnd = hwnd
        this.yof = options.yOffset ?? 30
        this.resize = options.resize ?? [1600, 900]
        if (!isElevated()) throw new Error("非管理员权限")
        if (options.resize === false) {
            // 不检查/调整窗口大小
        } else if (Array.isArray(options.resize)) {
            // 按指定宽高检查并调整窗口大小
            checkSize(this.hwnd, options.resize[0], options.resize[1])
        } else {
            // 默认按 1600 x (900 + yOffset) 检查并调整窗口大小
            checkSize(this.hwnd, 1600, 900 + this.yof)
        }
        this.frame = this.cap()
    }

    /** @returns {object | undefined} 最新窗口截图 */
    cap() {
        this.frame =
            this.resize === false ? captureWindowWGC(this.hwnd) : captureWindowWGC(this.hwnd, 0, this.yof, this.resize[0], this.resize[1])
        return this.frame
    }

    /**
     * 点击客户区坐标，或按按键名点击（c.mc("right")）。
     * @param {number | string | undefined} [x] X 坐标，或按键名（left/right/middle/x1/x2/l/r/m）
     * @param {number | undefined} [y] Y 坐标
     * @param {"left" | "right" | "middle" | "x1" | "x2" | "l" | "r" | "m"} [button] 鼠标按键（支持全称与缩写）
     */
    mc(x, y, button) {
        if (typeof x === "string") {
            button = x
            x = undefined
        }
        return mc(this.hwnd, x, y == null ? undefined : y + this.yof, Cap.#normalizeButton(button))
    }

    /**
     * 按下客户区坐标处的鼠标按键。
     * @param {number | undefined} [x] X 坐标
     * @param {number | undefined} [y] Y 坐标
     * @param {"left" | "right" | "middle" | "x1" | "x2" | "l" | "r" | "m"} [button] 鼠标按键（支持全称与缩写）
     */
    md(x, y, button) {
        md(this.hwnd, x, y == null ? undefined : y + this.yof, Cap.#normalizeButton(button))
    }

    /**
     * 松开客户区坐标处的鼠标按键。
     * @param {number | undefined} [x] X 坐标
     * @param {number | undefined} [y] Y 坐标
     * @param {"left" | "right" | "middle" | "x1" | "x2" | "l" | "r" | "m"} [button] 鼠标按键（支持全称与缩写）
     */
    mu(x, y, button) {
        mu(this.hwnd, x, y == null ? undefined : y + this.yof, Cap.#normalizeButton(button))
    }

    /**
     * 在客户区坐标点击鼠标中键。
     * @param {number | undefined} [x] X 坐标
     * @param {number | undefined} [y] Y 坐标
     */
    mt(x, y) {
        mt(this.hwnd, x, y == null ? undefined : y + this.yof)
    }

    /**
     * 发送按键。
     * @param {string} key 按键名称
     * @param {number | undefined} [duration] 按键持续时间
     * @returns {Promise<void>}
     */
    async kb(key, duration) {
        await kb(this.hwnd, key, duration)
    }

    kd(key) {
        kd(this.hwnd, key)
    }

    ku(key) {
        ku(this.hwnd, key)
    }
    /**
     * 检查颜色
     * @param x X坐标
     * @param y Y坐标
     * @param color 颜色值
     * @param tolerance 容差
     * @returns 检查结果
     */
    cc(x, y, color, tolerance) {
        return cc(this.frame, x, y + this.yof, color, tolerance)
    }

    /**
     * 检查区域汉明特征
     * @param {Mat} roi
     * @param {string} hash
     * @param {number} [tolerance]
     * @param {number|boolean} [useFilter]
     * @param {number} [filterColor]
     * @param {number} [filterTolerance]
     */
    croi(roi, hash, tolerance, useFilter, filterColor, filterTolerance) {
        if (useFilter) roi = colorFilter(roi, [filterColor], filterTolerance)
        return !matchHammingHash(perceptualHash(roi), [hash], tolerance)
    }

    /**
     * 等待客户区指定坐标达到颜色条件。
     * @param {number} x X 坐标
     * @param {number} y Y 坐标
     * @param {number} color 目标颜色
     * @param {number} tolerance 颜色容差
     * @param {number | undefined} [timeout] 超时时间
     * @returns {Promise<boolean>}
     */
    async waitColor(x, y, color, tolerance, timeout) {
        return await waitColor(this.hwnd, x, y + this.yof, color, tolerance, timeout)
    }

    /**
     * 播放 DSL 宏。
     * @param {string} dsl DSL 源码
     * @returns {Promise<void> & { stop: () => void }} 可中断 Promise
     */
    play(dsl) {
        const token = this.#beginPlay()
        const promise = this.#play(dsl, token)
        Object.defineProperty(promise, "stop", {
            value: () => this.#stopPlayToken(token),
            writable: false,
            enumerable: false,
            configurable: false,
        })
        return promise
    }

    /**
     * 执行一次 DSL 播放任务。
     * @param {string} dsl DSL 源码
     * @param {number} token 播放令牌
     * @returns {Promise<void>}
     */
    async #play(dsl, token) {
        try {
            // 每次播放使用独立的 Timer：其 sleep 按绝对时间链推进，避免多次等待的累积漂移
            await this.#runDslNodes(new DslParser(dsl).parse(), token, new Timer())
        } catch (error) {
            if (error instanceof PlayInterruptedError) return
            throw error
        } finally {
            if (this.#playToken === token) this.#playToken = 0
        }
    }

    /** 停止当前 DSL 播放。 */
    stopPlay() {
        this.#playToken++
    }

    /**
     * 仅停止指定令牌对应的播放任务。
     * @param {number} token 播放令牌
     */
    #stopPlayToken(token) {
        if (this.#playToken === token) this.#playToken++
    }

    /** @returns {number} 本次播放令牌 */
    #beginPlay() {
        this.#playToken++
        return this.#playToken
    }

    /**
     * 检查播放任务是否仍然有效。
     * @param {number} token 播放令牌
     */
    #assertPlayActive(token) {
        if (token !== this.#playToken) throw new PlayInterruptedError()
    }

    /**
     * 顺序执行 DSL 节点。时间推进统一使用 Timer（链式绝对时间目标），保证播放节奏精确。
     * @param {Array<object>} nodes DSL 节点
     * @param {number} token 播放令牌
     * @param {Timer} timer 播放计时器
     * @returns {Promise<void>}
     */
    async #runDslNodes(nodes, token, timer) {
        for (const node of nodes) {
            this.#assertPlayActive(token)
            switch (node.type) {
                case "wait":
                    await timer.sleep(node.ms)
                    break
                case "key":
                    if (node.action === "up") this.ku(node.key)
                    else if (node.action === "down" || node.duration === 0) this.kd(node.key)
                    else if (node.duration == null) await this.kb(node.key)
                    else {
                        this.kd(node.key)
                        try {
                            await timer.sleep(node.duration)
                        } finally {
                            this.ku(node.key)
                        }
                    }
                    break
                case "mouse":
                    if (node.button === "middle") {
                        this.mt(node.x, node.y)
                        if (node.waitMs > 0) await timer.sleep(node.waitMs)
                        break
                    }
                    this.md(node.x, node.y, node.button)
                    try {
                        if (node.waitMs > 0) await timer.sleep(node.waitMs)
                    } finally {
                        this.mu(node.x, node.y, node.button)
                    }
                    break
                case "group":
                    await this.#runDslNodes(node.body, token, timer)
                    break
                case "loop":
                    if (node.count === 0) {
                        while (true) {
                            this.#assertPlayActive(token)
                            await this.#runDslNodes(node.body, token, timer)
                        }
                    } else {
                        for (let i = 0; i < node.count; i++) {
                            this.#assertPlayActive(token)
                            await this.#runDslNodes(node.body, token, timer)
                        }
                    }
                    break
                default:
                    throw new Error("unknown dsl node")
            }
        }
    }
}
