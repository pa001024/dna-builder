/**
 * @author        木炭 <woodcoal@qq.com>
 * @date          2025-09-01 08:55:16
 * Copyright © 木炭 (WOODCOAL) All rights reserved
 *
 * 此项目为基于 CodeJar 项目的扩展项目，
 * 新增了插件系统并公开了部分内部属性
 * 原项目地址：https://github.com/antonmedv/codejar
 * 原项目作者：Anton Medvedev
 */

import { debounce, isFn, isObj, visit } from "./libs"
import type { ActionName, CodeJarProInstance, HistoryRecord, IPlugin, Options, Plugin, Position } from "./types"

export * from "./libs"
export * from "./types"

/** 声明一个全局 window 变量的引用，方便在不同环境（如服务器端渲染）下进行替换 */
const globalWindow = window

// 全局唯一标识符
let globalId = 0

/**
 * CodeJarPro 的主函数，初始化一个代码编辑器实例
 * @param editor 作为编辑器的 HTMLElement 元素
 * @param highlight 一个用于语法高亮的函数，它接收编辑器元素和可选的光标位置作为参数
 * @param opt 一个可选的配置对象，用于覆盖默认设置
 */
export function CodeJarPro(
    editor: HTMLElement,
    highlight?: (e: HTMLElement, pos?: Position) => void | Promise<void>,
    opt: Partial<Options> = {}
): CodeJarProInstance {
    const DEBOUNCE_HIGHLIGHT = 300
    const DEBOUNCE_UPDATE = 300

    // 合并用户配置和默认配置
    const options: Options = {
        tab: "\t",
        indentOn: /[({[]$/,
        moveToNewLine: /^[)}\]]/,
        spellcheck: false,
        catchTab: true,
        preserveIdent: true,
        addClosing: true,
        history: true,
        window: globalWindow,
        autoclose: {
            open: `([{'"`,
            close: `)]}'"`,
        },
        debounce: {
            highlight: DEBOUNCE_HIGHLIGHT,
            update: DEBOUNCE_UPDATE,
        },
        disableDebug: true,
        wrap: true,
        readonly: false,
        ...opt,
    }

    // 创建随机唯一标识符
    const id = `codejarpro-${globalId++}`

    // 从配置中获取 window 和 document 对象
    const window = options.window
    const document = window.document

    // 防抖默认参数
    const delayHighlight = options.debounce.highlight ?? DEBOUNCE_HIGHLIGHT
    const delayUpdate = options.debounce.update ?? DEBOUNCE_UPDATE

    // 用于存放所有事件监听器的数组，方便后续销毁
    const listeners: [string, any][] = []

    // 存放历史记录的数组
    const history: HistoryRecord[] = []

    // `at` 是一个指针，指向当前在 history 数组中的位置，用于实现撤销和重做
    let at = -1

    // 标记编辑器当前是否处于聚焦状态
    let focus = false

    // 定义一个 onUpdate 回调函数，当代码更新时会被调用
    let onUpdate = (code: string) => {
        debug("No onUpdate function.", code)
    }

    const doUpdate = (code: string) => {
        debug("onUpdate", code)

        // 如果返回 true 将中止后续代码更新
        if (hookPlugin("beforeUpdate") === true) return

        onUpdate(code)

        hookPlugin("afterUpdate")
    }
    // 定义一个防抖更新
    const debounceUpdate = delayUpdate ? debounce(doUpdate, delayUpdate) : doUpdate

    // 定义一个 onAction 回调函数，以便操作变化时调用，返回 true 表示将中止系统内部其他操作。此操作早于插件操作
    let onAction: (name: ActionName, code: string, event?: Event) => void | boolean = () => void 0

    // `prev` 用于在按键事件发生前，保存编辑器的文本内容，方便判断内容是否有变化
    let prev: string

    // 移除编辑器的默认轮廓线，避免在聚焦时显示难看的轮廓线
    editor.style.outline = "none"

    // 当内容超出时，显示垂直滚动条
    editor.style.overflowY = "auto"

    /** 警告信息 */
    function warn(...data: any[]) {
        if (!options.disableDebug) {
            console.warn(`[CodeJarPro:${id}]`, ...data)
        }
        return undefined
    }

    /** 调试信息 */
    function debug(...data: any[]) {
        if (!options.disableDebug) {
            console.log(`[CodeJarPro:${id}]`, ...data)
        }
        return undefined
    }

    /* ******** 插件相关操作: START ******** */

    // 插件列表
    const plugins = new Map<string, IPlugin>()

    /**
     * 添加插件
     * @param name 插件唯一名称
     * @param plugin 插件对象
     * @param config 插件配置
     */
    function addPlugin<T extends object, P extends IPlugin<T>>(cjp: CodeJarProInstance, plugin: Plugin<T, P>, config?: T) {
        if (!plugin) return warn("plugin is required")

        let data: P | undefined

        // 是否函数型插件
        if (isFn(plugin)) {
            data = plugin(cjp, config)
        } else if (isObj(plugin)) {
            isFn(plugin.init) && plugin.init(cjp, config)
            data = plugin
        }

        if (!data) return warn("plugin is not a function or object")

        if (plugins.has(data.name)) return warn(`"${data.name}" plugin already added`)

        plugins.set(data.name, data)
        debug(`"${data.name}" plugin added`, data)

        return data
    }

    /**
     * 移除插件
     * @param name 插件或者插件名称
     */
    function removePlugin(name: IPlugin | string) {
        if (isObj(name)) name = name.name
        if (!name) return warn("plugin name is required")

        const plugin = plugins.get(name)
        if (!plugin) return warn(`"${name}" plugin not found`)

        // 销毁组件
        isFn(plugin.destroy) && plugin.destroy()
        debug(`"${name}" plugin destroyed`)

        plugins.delete(name)
        debug(`"${name}" plugin removed`)
    }

    /** 销毁所有组件 */
    function destroyPlugins() {
        plugins.forEach((plugin, name) => {
            isFn(plugin.destroy) && plugin.destroy()
            debug(`"${name}" plugin destroyed`)
        })

        plugins.clear()
        debug("all plugins destroyed")
    }

    /**
     * 更新插件配置
     * @param name 插件或者插件名称
     * @param config 插件配置
     */
    function updatePluginConfig<T extends object>(name: IPlugin | string, config: T) {
        if (isObj(name)) name = name.name
        if (!name) return warn("plugin name is required")

        const plugin = plugins.get(name)
        if (!plugin) return warn(`"${name}" plugin not found`)

        isFn(plugin.updateConfig) && plugin.updateConfig(config)
    }

    /**
     * 钩子调度中心
     * @param hookName 钩子名称 (必须是 Plugin 接口中的一个键)
     * @param args 传递给钩子函数的参数
     * @returns 如果任何一个钩子返回 true，则返回 true
     */
    function hookPlugin(hookName: ActionName, event?: Event): boolean {
        // 检查只读状态，仅滚动，高亮和调整大小事件才允许继续后续操作
        if (checkReadonly() === true && !["highlight", "scroll", "resize", "refresh"].includes(hookName)) {
            return true
        }

        // 系统操作先执行
        let result = !!onAction(hookName, getContent(), event)
        if (result === true) return true

        // 如果返回非 true 操作，则继续后续插件操作
        if (plugins.size < 1) return false

        plugins.forEach((plugin, name) => {
            debug(`"${name}" plugin execute "${hookName}" action`)

            const enabled = isFn(plugin.enabled) ? plugin.enabled() : plugin.enabled
            if (enabled) {
                if (
                    plugin.onAction({
                        name: hookName,
                        code: getContent(),
                        event,
                    }) === true
                ) {
                    result = true
                }
            } else {
                debug(`"${name}" plugin disabled`)
            }
        })

        return result
    }

    /* ******** 插件相关操作: END ******** */

    // `isLegacy` 标志位，用于处理不支持 'plaintext-only' 的老旧浏览器或特定版本的火狐
    let isLegacy = false

    // 缓存只读状态，方式多次操作属性
    let readonly = !options.readonly

    // 编辑模式检查
    const checkReadonly = () => {
        if (readonly === options.readonly) return options.readonly
        readonly = options.readonly

        if (options.readonly) {
            // 只读模式，取消编辑功能
            editor.removeAttribute("contenteditable")
            editor.removeAttribute("spellcheck")
            return
        }
        // 设置 contenteditable 属性，允许用户编辑内容。'plaintext-only' 可以防止粘贴富文本格式。
        editor.setAttribute("contenteditable", "plaintext-only")

        // 根据配置设置是否开启拼写检查
        editor.setAttribute("spellcheck", options.spellcheck ? "true" : "false")

        // --- 处理浏览器兼容性问题 ---
        // 检测 Firefox 浏览器版本
        const matchFirefoxVersion = window.navigator.userAgent.match(/Firefox\/([0-9]+)\./)
        const firefoxVersion = matchFirefoxVersion ? parseInt(matchFirefoxVersion[1], 10) : 0

        if (editor.contentEditable !== "plaintext-only" || firefoxVersion >= 136) isLegacy = true

        // 如果是老旧模式，就回退到 contenteditable="true"
        if (isLegacy) editor.setAttribute("contenteditable", "true")

        return options.readonly
    }

    checkReadonly()

    /** 更新自动换行 */
    const updateWrap = (el: Element) => {
        if (!el || !(el instanceof HTMLElement)) return

        el.style.overflowWrap = options.wrap ? "break-word" : "normal"
        el.style.whiteSpace = options.wrap ? "pre-wrap" : "pre"
        el.style.wordBreak = options.wrap ? "break-all" : "keep-all"
    }

    /**
     * 检查返回值是否为 PromiseLike
     * @param value 任意返回值
     * @returns 是否可 await
     */
    const isPromiseLike = (value: unknown): value is PromiseLike<void> => {
        return (
            (typeof value === "object" || typeof value === "function") &&
            value !== null &&
            "then" in value &&
            typeof value.then === "function"
        )
    }

    /**
     * 应用高亮后的公共收尾逻辑
     * @param pos 光标位置
     */
    const applyHighlightEffects = (pos: Position) => {
        /** 更新自动换行 */
        if (editor.children.length > 0) {
            for (let i = 0; i < editor.children.length; i++) {
                updateWrap(editor.children[i])
            }
        }

        updateWrap(editor)
        hookPlugin("highlight")
        restore(pos)
    }

    // 封装一下高亮函数，方便调用（兼容同步/异步高亮）
    let highlightVersion = 0
    const doHighlight = (editor: HTMLElement) => {
        if (typeof highlight !== "function") return
        const pos = save() // 保存当前光标位置
        const currentVersion = ++highlightVersion
        const finalize = () => {
            if (currentVersion !== highlightVersion) return
            applyHighlightEffects(pos)
        }

        try {
            const highlightResult = highlight(editor, pos)
            if (isPromiseLike(highlightResult)) {
                void highlightResult
                    .then(() => {
                        finalize()
                    })
                    .catch(error => {
                        if (currentVersion !== highlightVersion) return
                        warn("highlight async failed", error)
                        restore(pos)
                    })
                return
            }
            finalize()
        } catch (error) {
            warn("highlight failed", error)
            restore(pos)
        }
    }

    // --- 防抖（Debounce）函数，避免高频触发 ---
    // 创建一个防抖版的高亮函数，在用户输入停止 30 毫秒后才执行高亮，提升性能
    const debounceHighlight = delayHighlight ? debounce(doHighlight, delayHighlight) : doHighlight

    // `recording` 标志位，防止在一次输入中重复记录历史
    let recording = false

    // 判断当前按键事件是否应该被记录到历史中
    const shouldRecord = (event: KeyboardEvent): boolean => {
        return (
            !isUndo(event) &&
            !isRedo(event) && // 排除撤销和重做操作
            event.key !== "Meta" && // 排除 Command 键 (Mac)
            event.key !== "Control" && // 排除 Ctrl 键
            event.key !== "Alt" && // 排除 Alt 键
            !event.key.startsWith("Arrow")
        ) // 排除方向键
    }

    // 创建一个防抖版的历史记录函数，在用户输入停止 300 毫秒后才记录历史
    const debounceRecordHistory = debounce((event: KeyboardEvent) => {
        if (shouldRecord(event)) {
            recordHistory()
            recording = false
        }
    }, 300)

    /**
     * 封装的事件监听函数，会将监听器存入 `listeners` 数组
     * @param type 事件类型，如 'keydown'
     * @param fn 事件处理函数
     */
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (event: HTMLElementEventMap[K]) => void) => {
        listeners.push([type, fn])
        editor.addEventListener(type, fn)
    }

    /**
     * 核心事件监听函数，处理键盘事件
     * @param event 键盘事件对象
     */
    on("keydown", event => {
        if (hookPlugin("keydown", event) === true) {
            event.preventDefault() // 如果插件返回 true，就阻止默认行为
            return
        }

        if (event.defaultPrevented) return // 如果事件已经被其他地方阻止，则不再处理

        prev = getContent() // 记录按键前的文本内容
        if (options.preserveIdent)
            handleNewLine(event) // 处理换行逻辑
        else legacyNewLineFix(event) // 为老旧浏览器处理换行
        if (options.catchTab) handleTabCharacters(event) // 处理 Tab 键逻辑
        if (options.addClosing) handleSelfClosingCharacters(event) // 处理自动闭合字符逻辑
        if (options.history) {
            handleUndoRedo(event) // 处理撤销/重做
            // 如果需要记录历史，并且当前没有在记录中，则先记录一次，并设置记录标志
            if (shouldRecord(event) && !recording) {
                recordHistory()
                recording = true
            }
        }
        // 在老旧模式下，非复制操作后，需要手动恢复一下光标，以解决一些 bug
        if (isLegacy && !isCopy(event)) restore(save())
    })

    on("keyup", event => {
        if (hookPlugin("keyup", event) === true) {
            event.preventDefault() // 如果插件返回 true，就阻止默认行为
            return
        }

        if (event.defaultPrevented) return
        if (event.isComposing) return // 输入法正在输入时，不处理

        if (prev !== getContent()) debounceHighlight(editor) // 如果内容改变了，触发防抖高亮
        debounceRecordHistory(event) // 触发防抖历史记录
        debounceUpdate(getContent()) // 调用更新回调
    })

    on("click", event => {
        hookPlugin("click", event)
    })

    on("focus", _event => {
        hookPlugin("focus", _event)
        focus = true // 编辑器获得焦点
    })

    on("blur", _event => {
        hookPlugin("blur", _event)
        focus = false // 编辑器失去焦点
    })

    on("paste", event => {
        recordHistory() // 粘贴前记录历史
        handlePaste(event) // 处理粘贴逻辑
        hookPlugin("paste", event)
        recordHistory() // 粘贴后再次记录历史
        debounceUpdate(getContent()) // 调用更新回调
    })

    on("cut", event => {
        recordHistory() // 剪切前记录历史
        handleCut(event) // 处理剪切逻辑
        hookPlugin("cut", event)
        recordHistory() // 剪切后再次记录历史
        debounceUpdate(getContent()) // 调用更新回调
    })

    // 新增滚动事件监听，实现行号和编辑器的同步滚动
    on("scroll", event => {
        hookPlugin("scroll", event)
    })

    // 新增尺寸变化监听，实现自动更新行号
    const resizeObserver = new ResizeObserver(() => {
        hookPlugin("resize")
    })
    resizeObserver.observe(editor)

    /**
     * 保存当前光标的选区位置
     * @returns 返回一个 Position 对象，包含 start, end 和 dir
     */
    function save(): Position {
        const s = getSelection() // 获取当前 selection 对象
        const pos: Position = { start: 0, end: 0, dir: undefined }

        let { anchorNode, anchorOffset, focusNode, focusOffset } = s
        if (!anchorNode || !focusNode) throw "error1" // 如果没有选区，理论上不应该发生

        // 特殊情况：如果选区直接在编辑器 div 上，而不是在文本节点里
        if (anchorNode === editor && focusNode === editor) {
            pos.start = anchorOffset > 0 && editor.textContent ? editor.textContent.length : 0
            pos.end = focusOffset > 0 && editor.textContent ? editor.textContent.length : 0
            pos.dir = focusOffset >= anchorOffset ? "->" : "<-"
            return pos
        }

        // 规范化选区节点：确保我们处理的是文本节点
        // 如果选区落在一个元素节点上，就在那个位置创建一个空的文本节点，并将选区转移到这个新节点上
        if (anchorNode.nodeType === Node.ELEMENT_NODE) {
            const node = document.createTextNode("")
            anchorNode.insertBefore(node, anchorNode.childNodes[anchorOffset])
            anchorNode = node
            anchorOffset = 0
        }
        if (focusNode.nodeType === Node.ELEMENT_NODE) {
            const node = document.createTextNode("")
            focusNode.insertBefore(node, focusNode.childNodes[focusOffset])
            focusNode = node
            focusOffset = 0
        }

        // 遍历编辑器内的所有节点，计算出光标的字符索引位置
        visit(editor, el => {
            // 如果同时找到了起始节点和结束节点
            if (el === anchorNode && el === focusNode) {
                pos.start += anchorOffset
                pos.end += focusOffset
                pos.dir = anchorOffset <= focusOffset ? "->" : "<-"
                return "stop" // 停止遍历
            }

            // 如果找到了起始节点
            if (el === anchorNode) {
                pos.start += anchorOffset
                if (!pos.dir) {
                    pos.dir = "->" // 标记方向为正向
                } else {
                    return "stop" // 如果之前已找到结束节点，说明遍历完成
                }
            } else if (el === focusNode) {
                // 如果找到了结束节点
                pos.end += focusOffset
                if (!pos.dir) {
                    pos.dir = "<-" // 标记方向为反向
                } else {
                    return "stop" // 如果之前已找到起始节点，说明遍历完成
                }
            }

            // 如果是文本节点，累加其长度
            if (el.nodeType === Node.TEXT_NODE) {
                if (pos.dir !== "->") pos.start += el.nodeValue!.length // 如果是反向选择，start 在后面，需要累加
                if (pos.dir !== "<-") pos.end += el.nodeValue!.length // 如果是正向选择，end 在后面，需要累加
            }
        })

        editor.normalize() // DOM 操作后，合并相邻的文本节点，保持 DOM 结构干净
        return pos
    }

    /**
     * 根据 Position 对象恢复光标的选区
     * @param pos `save()` 函数返回的 Position 对象
     */
    function restore(pos: Position) {
        const s = getSelection()
        let startNode: Node | undefined,
            startOffset = 0
        let endNode: Node | undefined,
            endOffset = 0

        if (!pos.dir) pos.dir = "->" // 默认方向
        if (pos.start < 0) pos.start = 0 // 防止负数索引
        if (pos.end < 0) pos.end = 0

        // 如果是反向选择，交换 start 和 end，方便计算
        if (pos.dir === "<-") {
            const { start, end } = pos
            pos.start = end
            pos.end = start
        }

        let current = 0 // 当前遍历到的字符数

        // 遍历所有节点，找到索引对应的 DOM 节点和偏移量
        visit(editor, el => {
            if (el.nodeType !== Node.TEXT_NODE) return // 只关心文本节点

            const len = (el.nodeValue || "").length
            if (current + len >= pos.start) {
                // 注意这里是 >=
                if (!startNode) {
                    startNode = el
                    startOffset = pos.start - current
                }
                if (current + len >= pos.end) {
                    endNode = el
                    endOffset = pos.end - current
                    return "stop" // 找到了所有需要的节点，停止遍历
                }
            }
            current += len
        })

        // 如果没找到任何文本节点（编辑器为空），则将光标定位到编辑器本身
        if (!startNode) (startNode = editor), (startOffset = editor.childNodes.length)
        if (!endNode) (endNode = editor), (endOffset = editor.childNodes.length)

        // 如果之前是反向选择，现在把节点和偏移量换回来
        if (pos.dir === "<-") {
            ;[startNode, startOffset, endNode, endOffset] = [endNode, endOffset, startNode, startOffset]
        }

        // 处理光标落在不可编辑元素上的情况
        {
            const startEl = uneditable(startNode)
            if (startEl) {
                const node = document.createTextNode("")
                startEl.parentNode?.insertBefore(node, startEl)
                startNode = node
                startOffset = 0
            }
            const endEl = uneditable(endNode)
            if (endEl) {
                const node = document.createTextNode("")
                endEl.parentNode?.insertBefore(node, endEl)
                endNode = node
                endOffset = 0
            }
        }

        // 使用 setBaseAndExtent 设置选区，可以同时处理正向和反向选择
        s.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
        editor.normalize() // 合并空的文本节点
    }

    /**
     * 检查一个节点是否或其父节点是否是不可编辑的
     * @param node 要检查的节点
     */
    function uneditable(node: Node): Element | undefined {
        while (node && node !== editor) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as Element
                if (el.getAttribute("contenteditable") === "false") {
                    return el
                }
            }
            node = node.parentNode!
        }
    }

    /** 获取光标之前的所有文本内容 */
    function beforeCursor() {
        const s = getSelection()
        const r0 = s.getRangeAt(0)
        const r = document.createRange()
        r.selectNodeContents(editor)
        r.setEnd(r0.startContainer, r0.startOffset)
        return r.toString()
    }

    /** 获取光标之后的所有文本内容 */
    function afterCursor() {
        const s = getSelection()
        const r0 = s.getRangeAt(0)
        const r = document.createRange()
        r.selectNodeContents(editor)
        r.setStart(r0.endContainer, r0.endOffset)
        return r.toString()
    }

    /** 处理回车换行逻辑 */
    function handleNewLine(event: KeyboardEvent) {
        if (event.key === "Enter") {
            const before = beforeCursor()
            const after = afterCursor()

            // 获取当前行的缩进
            const [padding] = findPadding(before)
            let newLinePadding = padding

            // 如果上一行是以 `([{` 结尾的，新行需要增加一级缩进
            if (options.indentOn.test(before)) {
                newLinePadding += options.tab
            }

            // 插入带缩进的换行符
            if (newLinePadding.length > 0) {
                preventDefault(event)
                event.stopPropagation()
                insert(`\n${newLinePadding}`)
            } else {
                legacyNewLineFix(event) // 如果没有缩进，则使用老旧模式处理
            }

            // 如果光标后面紧跟着 `)]}`，则将它们也移动到新的一行，并保持原有的缩进
            if (newLinePadding !== padding && options.moveToNewLine.test(after)) {
                const pos = save() // 保存当前光标位置
                insert(`\n${padding}`) // 在光标后插入一个带缩进的换行
                restore(pos) // 恢复光标位置到原来的地方
            }
        }
    }

    /**
     * 为老旧浏览器（特别是 Firefox）修复换行问题
     * 这些浏览器在 contenteditable 中按回车会插入 `<div><br></div>`
     */
    function legacyNewLineFix(event: KeyboardEvent) {
        if (isLegacy && event.key === "Enter") {
            preventDefault(event)
            event.stopPropagation()
            // 如果光标后没有内容，插入 '\n ' 再把光标移回来，避免奇怪的 bug
            if (afterCursor() === "") {
                insert("\n ")
                const pos = save()
                pos.start = --pos.end
                restore(pos)
            } else {
                insert("\n")
            }
        }
    }

    /** 处理自动闭合字符，如输入 `(` 自动补全 `)` */
    function handleSelfClosingCharacters(event: KeyboardEvent) {
        const open = options.autoclose.open
        const close = options.autoclose.close
        if (open.includes(event.key)) {
            preventDefault(event)
            const pos = save()
            const wrapText = pos.start === pos.end ? "" : getSelection().toString() // 获取当前选中的文本
            const text = event.key + wrapText + (close[open.indexOf(event.key)] ?? "") // 构造要插入的文本
            insert(text)
            // 将光标移动到闭合字符的中间
            pos.start++
            pos.end++
            restore(pos)
        }
    }

    /** 处理 Tab 键的逻辑，包括缩进和反缩进 */
    function handleTabCharacters(event: KeyboardEvent) {
        if (event.key === "Tab") {
            preventDefault(event)
            if (event.shiftKey) {
                // Shift + Tab 反缩进
                const before = beforeCursor()
                const [padding, start] = findPadding(before) // 获取当前行的缩进
                if (padding.length > 0) {
                    const pos = save()
                    // 计算要删除的长度，要么是一个 tab 的长度，要么是剩余的缩进长度
                    const len = Math.min(options.tab.length, padding.length)
                    restore({ start, end: start + len }) // 选中要删除的缩进
                    document.execCommand("delete") // 删除
                    pos.start -= len // 更新光标位置
                    pos.end -= len
                    restore(pos) // 恢复光标
                }
            } else {
                // Tab 键缩进
                insert(options.tab)
            }
        }
    }

    /** 处理撤销 (Ctrl+Z) 和重做 (Ctrl+Shift+Z/Ctrl+Y) */
    function handleUndoRedo(event: KeyboardEvent) {
        if (isUndo(event)) {
            preventDefault(event)
            at-- // 历史指针前移
            const record = history[at]
            if (record) {
                editor.innerHTML = record.html // 恢复 HTML 内容
                restore(record.pos) // 恢复光标位置
            }
            if (at < 0) at = 0 // 防止指针越界
        }
        if (isRedo(event)) {
            preventDefault(event)
            at++ // 历史指针后移
            const record = history[at]
            if (record) {
                editor.innerHTML = record.html
                restore(record.pos)
            }
            if (at >= history.length) at-- // 防止指针越界
        }
    }

    /** 将当前编辑器的状态（HTML 和光标位置）保存到历史记录中 */
    function recordHistory() {
        if (!focus) return // 编辑器未聚焦时不记录

        const html = editor.innerHTML
        const pos = save()

        const lastRecord = history[at]
        // 如果当前状态和上一条历史记录完全相同，则不记录，避免冗余
        if (lastRecord) {
            if (lastRecord.html === html && lastRecord.pos.start === pos.start && lastRecord.pos.end === pos.end) return
        }

        at++
        history[at] = { html, pos }
        // 如果在历史记录中间进行了新的编辑，那么丢弃当前指针之后的所有历史记录
        history.splice(at + 1)

        // 限制历史记录的最大数量，防止内存占用过大
        const maxHistory = 300
        if (at > maxHistory) {
            at = maxHistory
            history.splice(0, 1) // 移除最旧的一条记录
        }
    }

    /** 处理粘贴事件 */
    function handlePaste(event: ClipboardEvent) {
        if (event.defaultPrevented) return
        preventDefault(event)
        const originalEvent = (event as any).originalEvent ?? event
        // 从剪贴板获取纯文本内容，并统一换行符为 `\n`
        const text = originalEvent.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n")
        const pos = save()
        insert(text) // 插入文本
        doHighlight(editor) // 重新高亮
        // 将光标移动到粘贴内容之后
        restore({
            start: Math.min(pos.start, pos.end) + text.length,
            end: Math.min(pos.start, pos.end) + text.length,
            dir: "<-",
        })
    }

    /** 处理剪切事件 */
    function handleCut(event: ClipboardEvent) {
        const pos = save()
        const selection = getSelection()
        const originalEvent = (event as any).originalEvent ?? event
        // 将选中的文本放入剪贴板
        originalEvent.clipboardData.setData("text/plain", selection.toString())
        document.execCommand("delete") // 删除选中的文本
        doHighlight(editor) // 重新高亮
        // 将光标移动到剪切位置
        restore({
            start: Math.min(pos.start, pos.end),
            end: Math.min(pos.start, pos.end),
            dir: "<-",
        })
        preventDefault(event)
    }

    /** 检查是否是 Ctrl 键 */
    function isCtrl(event: KeyboardEvent) {
        return event.metaKey || event.ctrlKey // metaKey 是 Mac 的 Command 键
    }

    /** 检查是否是撤销操作 ctrl+z */
    function isUndo(event: KeyboardEvent) {
        return isCtrl(event) && !event.shiftKey && getKeyCode(event) === "Z"
    }

    /** 检查是否是重做操作 ctrl+shift+z / ctrl+y */
    function isRedo(event: KeyboardEvent) {
        return isCtrl(event) && ((event.shiftKey && getKeyCode(event) === "Z") || (!event.shiftKey && getKeyCode(event) === "Y"))
    }

    /** 检查是否是复制操作 */
    function isCopy(event: KeyboardEvent) {
        return isCtrl(event) && getKeyCode(event) === "C"
    }

    /** 获取按键的字符表示 */
    function getKeyCode(event: KeyboardEvent): string | undefined {
        const key = event.key || event.keyCode || event.which
        if (!key) return undefined
        return (typeof key === "string" ? key : String.fromCharCode(key)).toUpperCase()
    }

    /** 插入文本，并对特殊 HTML 字符进行转义 */
    function insert(text: string) {
        text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
        document.execCommand("insertHTML", false, text)
    }

    /**
     * 查找给定文本中最后一行的缩进
     * @param text 要查找的文本
     * @returns 返回一个元组 `[padding, start, end]`
     * padding: 缩进字符串
     * start: 最后一行的起始索引
     * end: 缩进结束的位置索引
     */
    function findPadding(text: string): [string, number, number] {
        // 找到最后一行的开头
        let i = text.length - 1
        while (i >= 0 && text[i] !== "\n") i--
        i++
        // 从行首开始，计算空格和制表符的数量
        let j = i
        while (j < text.length && /[ \t]/.test(text[j])) j++
        return [text.substring(i, j) || "", i, j]
    }

    /**  获取编辑器的纯文本内容 */
    function getContent() {
        return editor.textContent || ""
    }

    /** 阻止事件的默认行为 */
    function preventDefault(event: Event) {
        event.preventDefault()
    }

    // 缓存主对象
    let ownerDocument: Node

    /** 获取 Selection 对象，兼容 Shadow DOM */
    function getSelection() {
        // 强制获取焦点，防止后续选取获取存在问题
        editor.focus()

        if (!ownerDocument) {
            try {
                ownerDocument = editor.getRootNode()
            } catch {
                ownerDocument = editor.ownerDocument
            }
        }

        // @ts-expect-error
        return ownerDocument.getSelection() as Selection
    }

    /** 暴露给外部的 API */
    return {
        /** 更新编辑器的配置选项 */
        updateOptions(newOptions) {
            debug("updateOptions", newOptions)

            Object.assign(options, newOptions)
        },

        /**
         * 以编程方式更新编辑器的代码
         * @param code 新的代码字符串
         * @param callOnUpdate 是否触发 onUpdate 回调，默认为 false
         */
        setContent(code, callOnUpdate = false) {
            debug("setContent", code)
            editor.textContent = code // 设置文本内容
            doHighlight(editor) // 执行高亮
            hookPlugin("setContent")
            callOnUpdate && debounceUpdate(code) // 触发回调
        },

        /** 刷新，不更新编辑器代码强制重新高亮，不会触发 onUpdate 回调 */
        refresh: debounce(() => {
            debug("refresh")
            hookPlugin("refresh")
            doHighlight(editor) // 执行高亮
        }, delayUpdate),

        /** 注册一个代码更新时的回调函数 */
        onUpdate(callback) {
            isFn(callback) && (onUpdate = callback)
        },

        /** 注册一个操作时的回调函数 */
        onAction(callback) {
            isFn(callback) && (onAction = callback)
        },

        /** 编辑器实例 */
        editor,

        /** 唯一标识 */
        id,

        /** 编辑器配置 */
        options,

        /** 插件列表 */
        plugins,

        /** 获取编辑器的纯文本内容 */
        toString: getContent,

        /** 保存光标位置*/
        save,

        /** 恢复光标位置 */
        restore,

        /** 手动记录一次历史 */
        recordHistory,

        /** 添加插件 */
        addPlugin(plugin, config) {
            if (!plugin) return
            return addPlugin(this, plugin, config)
        },

        /** 移除插件 */
        removePlugin,

        /** 更新插件配置 */
        updatePluginConfig,

        /** 强制调用插件 */
        hookPlugin,

        /** 销毁所有插件 */
        destroyPlugins,

        /** 销毁编辑器实例，移除所有事件监听器 */
        destroy() {
            for (const [type, fn] of listeners) {
                editor.removeEventListener(type, fn)
            }

            // 销毁并移除所有插件
            destroyPlugins()

            // 断开尺寸变化监听
            resizeObserver.disconnect()
        },

        warn,
        debug,
    }
}
