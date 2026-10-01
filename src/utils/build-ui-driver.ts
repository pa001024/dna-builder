/**
 * 配装页 UI 驱动。
 *
 * 让配装助手能像用户一样操作界面：读页面结构 → 点控件 → 往输入框里打字。
 * 所有的写操作都走**真实 DOM 事件**，因此 Vue 的 v-model / @click 与第三方组件
 * （reka-ui 的 Select、CodeMirror 编辑器）拿到的是和真人操作完全一样的信号，
 * 不会出现「数据改了界面没动」或「界面动了状态没变」这两种分裂。
 *
 * 定位方式按优先级给三种，够用来覆盖配装页的各种控件：
 * - `ref`：`read_page` 快照时打在元素上的临时引用，最稳，跨轮次不要复用旧的；
 * - `selector`：CSS 选择器，用于 `[data-agent=*]` 这类固定锚点；
 * - `label`：按无障碍名（标题 / aria-label / 可见文本 / placeholder）模糊匹配。
 *
 * 只面向配装页（`[data-agent-page="char-build"]`）：页面没挂载时所有操作都会直接报错，
 * 免得模型在别的路由上瞎点一通。
 */

import { EditorView } from "@codemirror/view"
import { nextTick } from "vue"

/** 页面根容器必须是配装页（由 CharBuildView 挂载时标记）。 */
const PAGE_SELECTOR = "[data-agent-page='char-build']"

/** 可读取的作用域。 */
export type BuildUiScope = "auto" | "page" | "sidebar" | "main" | "dialog"

/** 一次快照里的节点描述。 */
export interface BuildUiNode {
    /** 引用标识（如 e12），供后续 click / type_text 使用 */
    ref: string
    /** 控件类型 */
    kind: "button" | "link" | "input" | "textarea" | "select" | "checkbox" | "radio" | "combobox" | "editor" | "slider" | "tab"
    /** 无障碍名：标题 / aria-label / 可见文本 / placeholder */
    label: string
    /** 当前值（输入框与部分控件有） */
    value?: string
    /** 是否禁用 */
    disabled?: boolean
}

/** 目标定位参数。 */
export interface BuildUiTarget {
    /** 快照给出的引用 */
    ref?: string
    /** CSS 选择器 */
    selector?: string
    /** 无障碍名匹配（先精确后包含） */
    label?: string
    /** 多个命中时取第几个（从 1 开始） */
    nth?: number
    /** 在哪个作用域里找，默认 auto */
    scope?: BuildUiScope
}

/** 页面读取参数。 */
export interface ReadBuildPageInput {
    /** 读取范围，默认 auto（有打开的弹窗就读弹窗，否则整个配装页） */
    scope?: BuildUiScope
    /** 节点数量上限，默认 80 */
    maxNodes?: number
    /** 只保留无障碍名命中该关键词的节点（用于在长页面里快速定位） */
    contains?: string
    /** 是否同时给出关键数值（伤害结果等），默认 true */
    withSummary?: boolean
}

/** 点击参数。 */
export interface ClickBuildInput extends BuildUiTarget {
    /** 点击后等待界面落定的毫秒数，默认 160 */
    settle?: number
}

/** 文本输入参数。 */
export interface TypeBuildInput extends BuildUiTarget {
    /** 要输入的文本 */
    text: string
    /** 是否先清空原内容，默认 true */
    clear?: boolean
    /** 输入完是否按回车提交，默认 false */
    submit?: boolean
}

/** 选择项参数。 */
export interface SelectBuildOptionInput extends BuildUiTarget {
    /** 目标选项文案 */
    option: string
    /** 下拉/弹层里的搜索框存在时，先把 option 打进搜索框过滤，默认 true */
    search?: boolean
}

/** 按键参数。 */
export interface PressKeyInput extends BuildUiTarget {
    /** 键名，例如 Enter / Escape / Backspace */
    key: string
}

/** 快照分配过的最近一批引用。 */
let refIndex = 0
/** 引用 → 元素（每次快照重建，元素重新渲染后会失效，因此只做加速查找用） */
const refRegistry = new Map<string, HTMLElement>()

/**
 * @description 等界面重绘完一轮。
 *
 * 点完立刻读 DOM 会拿到 Vue 更新前的旧结构：这里把控制权交回浏览器两帧，
 * 让组件把 v-if / teleport 的内容渲染出来。
 * @returns 渲染结束后的 Promise
 */
function settleFrame(): Promise<void> {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
}

/**
 * @description 等待指定毫秒数。
 * @param ms 毫秒
 * @returns 等待完成的 Promise
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}

/**
 * @description 取配装页根容器。
 * @returns 根元素；页面未挂载时返回 null
 */
function findPage(): HTMLElement | null {
    return document.querySelector<HTMLElement>(PAGE_SELECTOR)
}

/**
 * @description 找当前打开的弹层（含 teleport 到 body 的 Select 内容）。
 * @returns 可见的弹层元素；无则 null
 */
function findOpenOverlay(): HTMLElement | null {
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>("dialog.modal-open, [role='dialog'][data-state='open']"))

    for (const candidate of dialogs) {
        if (candidate.getClientRects().length) {
            return candidate
        }
    }

    const popups = Array.from(
        document.querySelectorAll<HTMLElement>("[role='listbox'][data-state='open'], .select-content[data-state='open']")
    )

    for (const candidate of popups) {
        if (candidate.getClientRects().length) {
            return candidate
        }
    }

    return null
}

/**
 * @description 解析读取 / 操作的作用域根元素。
 * @param scope 作用域名
 * @returns 根元素；找不到时返回 null
 */
function resolveRoot(scope: BuildUiScope = "auto"): HTMLElement | null {
    const page = findPage()

    if (!page) {
        return null
    }

    if (scope === "page") {
        return page
    }

    if (scope === "sidebar" || scope === "main") {
        return page.querySelector<HTMLElement>(`[data-agent-scope='${scope}']`)
    }

    if (scope === "dialog") {
        return findOpenOverlay()
    }

    // auto：弹层优先——弹层里的内容是用户此刻唯一能操作的东西
    const overlay = findOpenOverlay()

    return overlay ?? page
}

/**
 * @description 判断元素是否真的可见（有布局盒子且未被隐藏）。
 * @param element 待判定元素
 * @returns 是否可见
 */
function isVisible(element: Element): boolean {
    if (element.getClientRects().length) {
        return true
    }

    const style = getComputedStyle(element as HTMLElement)

    return style.display !== "none" && style.visibility !== "hidden" && !!(element as HTMLElement).offsetParent
}

/**
 * @description 取元素的无障碍名。
 *
 * 取值优先级按「用户实际看到的顺序」排：标题与 aria-label 是控件自己声明的名字，
 * 其次是被翻译后的可见文本，最后是 placeholder（空输入框唯一的名字来源）。
 * @param element 目标元素
 * @returns 无障碍名；取不到时返回空串
 */
function labelOf(element: HTMLElement): string {
    const attrName = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? ""

    if (attrName.trim()) {
        return attrName.trim().replace(/\s+/g, " ")
    }

    const own = (element.textContent ?? "").replace(/\s+/g, " ").trim()

    if (own) {
        return own.slice(0, 60)
    }

    if ("value" in element && typeof (element as HTMLInputElement).value === "string") {
        const value = (element as HTMLInputElement).value.trim()

        if (value) {
            return value
        }
    }

    return element.getAttribute("placeholder")?.trim() ?? ""
}

/**
 * @description 读控件的当前值。
 * @param element 目标元素
 * @returns 当前值；无值时返回空串
 */
function readValue(element: HTMLElement): string {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return element.value ?? ""
    }

    const editor = element.querySelector(".cm-content")

    if (editor) {
        return (editor.textContent ?? "").trim()
    }

    return ""
}

/**
 * @description 判定元素在快照里的控件类型。
 * @param element 目标元素
 * @returns 控件类型
 */
function kindOf(element: HTMLElement): BuildUiNode["kind"] {
    const role = element.getAttribute("role")

    if (element.tagName === "TEXTAREA") {
        return "textarea"
    }

    if (element.tagName === "SELECT") {
        return "select"
    }

    if (element.tagName === "INPUT") {
        const input = element as HTMLInputElement
        const type = input.type

        if (type === "checkbox") {
            return "checkbox"
        }

        if (type === "radio") {
            return "radio"
        }

        if (type === "range") {
            return "slider"
        }

        return "input"
    }

    if (role === "combobox" || element.classList.contains("select-trigger") || element.hasAttribute("data-agent-combobox")) {
        return "combobox"
    }

    if (role === "tab") {
        return "tab"
    }

    if (role === "slider") {
        return "slider"
    }

    if (element.classList.contains("cm-content") || element.querySelector(".cm-content")) {
        return "editor"
    }

    if (element.tagName === "A") {
        return "link"
    }

    return "button"
}

/**
 * @description 收集作用域内所有可操作控件。
 *
 * 隐藏的原生控件（daisyUI 的 radio tab 把 input 藏起来用 label 显示）会被代理到它可见的
 * `<label>`：点 label 同样会触发关联控件的激活行为，这样模型看到的可点元素就是眼睛看到的那批。
 * @param root 作用域根元素
 * @returns 控件元素列表
 */
function collectControls(root: HTMLElement): HTMLElement[] {
    const selector = [
        "a[href]",
        "button",
        "[role='button']",
        "[role='tab']",
        "[role='option']",
        "[role='menuitem']",
        "[role='checkbox']",
        "[role='radio']",
        "[role='combobox']",
        "[role='slider']",
        "summary",
        "label.tab",
        "label.cursor-pointer",
        "input:not([type='hidden'])",
        "textarea",
        "select",
        "[contenteditable='true']",
        ".cm-content",
    ].join(",")

    const seen = new Set<Element>()
    const result: HTMLElement[] = []

    for (const element of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
        if (seen.has(element)) {
            continue
        }

        if (!isVisible(element)) {
            // 藏起来的 input 交给可见的 label 代理
            const proxy = element.closest<HTMLElement>("label.tab, label.cursor-pointer")

            if (proxy && root.contains(proxy) && isVisible(proxy) && !seen.has(proxy)) {
                seen.add(proxy)
                result.push(proxy)
            }

            continue
        }

        // 可见 label 里若已有 input 被单独收集，重复的那份丢掉，避免同一样东西占两个引用
        const inner = element.querySelector<HTMLElement>(selector)

        if (inner && element.tagName === "LABEL" && isVisible(inner) && seen.has(inner)) {
            continue
        }

        seen.add(element)
        result.push(element)
    }

    return result
}

/**
 * @description 给元素分配本次快照的引用。
 * @param element 目标元素
 * @returns 引用标识
 */
function assignRef(element: HTMLElement): string {
    refIndex += 1
    const ref = `e${refIndex}`

    element.setAttribute("data-agent-ref", ref)
    refRegistry.set(ref, element)

    return ref
}

/**
 * @description 清空上一次快照分布在全文档里的引用标记。
 *
 * 不清的话旧引用的属性会残留在 DOM 上，`ref` 查询可能命中已经被 Vue 复用的旧节点。
 */
function clearStaleRefs(): void {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-agent-ref]"))) {
        element.removeAttribute("data-agent-ref")
    }

    refRegistry.clear()
    refIndex = 0
}

/**
 * @description 读取配装页关键数值摘要（伤害结果、当前 SKILL 等）。
 * @returns 摘要文本行数组
 */
function readSummary(): string[] {
    const lines: string[] = []
    const damageRow = document.querySelector<HTMLElement>("[data-agent='damage-result']")

    if (damageRow) {
        lines.push(`伤害结果: ${(damageRow.textContent ?? "").replace(/\s+/g, " ").trim()}`)
    }

    const target = document.querySelector<HTMLElement>("[data-agent='target-function'] .cm-content")

    if (target) {
        lines.push(`目标函数: ${(target.textContent ?? "").trim()}`)
    }

    return lines
}

/**
 * @description 读取配装页的可操作结构。
 *
 * 输出是一份紧凑文本：先给关键数值摘要，再按作用域列出可点/可填的节点。
 * 每次调用都会重发引用：跨轮次请重新读一次再操作，不要复用旧 ref。
 * @param input 读取参数
 * @returns 给模型看的页面快照文本
 */
export function readBuildPage(input: ReadBuildPageInput = {}): string {
    const root = resolveRoot(input.scope ?? "auto")

    if (!root) {
        throw new Error("当前不在配装页，无法读取界面")
    }

    clearStaleRefs()

    const maxNodes = Math.max(1, Math.min(input.maxNodes ?? 80, 240))
    const withSummary = input.withSummary !== false
    const contains = input.contains?.trim()
    const nodes: BuildUiNode[] = []

    for (const element of collectControls(root)) {
        const node: BuildUiNode = { ref: assignRef(element), kind: kindOf(element), label: labelOf(element) }
        const value = readValue(element)

        if (value) {
            node.value = value
        }

        if ((element as HTMLInputElement).disabled || element.getAttribute("aria-disabled") === "true") {
            node.disabled = true
        }

        if (contains && !node.label.includes(contains) && !(node.value ?? "").includes(contains)) {
            continue
        }

        nodes.push(node)

        if (nodes.length >= maxNodes) {
            break
        }
    }

    const lines: string[] = []
    const scopeName = input.scope ?? "auto"
    const overlay = root.getAttribute("role") === "dialog" || root.tagName === "DIALOG"

    if (withSummary) {
        const summary = readSummary()

        if (summary.length) {
            lines.push(...summary)
        }
    }

    lines.push(`[作用域] ${scopeName}${overlay ? "（已打开弹层，优先操作弹层内容）" : ""}，可操作元素 ${nodes.length} 个`)

    for (const node of nodes) {
        const pieces = [node.ref, node.kind, node.label ? `"${node.label}"` : ""]
        const value = node.value ? ` = ${node.value}` : ""

        lines.push(`${pieces.filter(Boolean).join(" ")}${value}${node.disabled ? " [disabled]" : ""}`)
    }

    if (!nodes.length) {
        lines.push("（没有命中可操作元素：可放宽 contains，或换 scope 读取）")
    } else {
        lines.push("用法：click{ref} / type_text{ref,text} / select_option{ref,option}；ref 仅本次快照有效。")
    }

    return lines.join("\n")
}

/**
 * @description 按 ref / selector / label 定位单个元素。
 * @param target 定位参数
 * @returns 命中的元素；找不到时返回 null
 */
function resolveTarget(target: BuildUiTarget): HTMLElement | null {
    if (target.ref) {
        const cached = refRegistry.get(target.ref)

        if (cached?.isConnected) {
            return cached
        }

        const byAttr = document.querySelector<HTMLElement>(`[data-agent-ref='${target.ref}']`)

        if (byAttr) {
            return byAttr
        }
    }

    if (target.selector) {
        const root = resolveRoot(target.scope ?? "auto") ?? document.body
        const found = root.querySelector<HTMLElement>(target.selector)

        if (found) {
            return found
        }
    }

    if (target.label) {
        const root = resolveRoot(target.scope ?? "auto") ?? findPage()

        if (!root) {
            return null
        }

        const wanted = target.label.trim()
        const candidates = collectControls(root).filter(element => labelOf(element) === wanted)

        const pool = candidates.length ? candidates : collectControls(root).filter(element => labelOf(element).includes(wanted))
        const index = Math.max(1, target.nth ?? 1)

        // 取用 nth 之前先把引用补上，否则返回的节点无法被下一次 click 直接引用
        const picked = pool[index - 1]

        if (picked) {
            assignRef(picked)
            return picked
        }
    }

    return null
}

/**
 * @description 把目标滚进可视区域，避免合成事件落在被滚动容器裁掉的位置上。
 * @param element 目标元素
 */
function scrollIntoView(element: HTMLElement): void {
    element.scrollIntoView({ block: "center", inline: "nearest" })
}

/**
 * @description 派发一串真实事件，模拟一次点击。
 *
 * 顺序必须与浏览器原生点击一致（pointer → mouse → click）：部分组件库只在 pointerdown 上
 * 处理激活逻辑，少了前面几步点击会「看起来发生了但没效果」。
 * @param element 目标元素
 */
function dispatchClick(element: HTMLElement): void {
    const init: MouseEventInit = { bubbles: true, cancelable: true, view: window, button: 0, composed: true }
    const pointerInit: PointerEventInit = { ...init, pointerId: 1, pointerType: "mouse", isPrimary: true }

    element.dispatchEvent(new PointerEvent("pointerdown", pointerInit))
    element.dispatchEvent(new MouseEvent("mousedown", init))

    element.focus?.()

    element.dispatchEvent(new PointerEvent("pointerup", pointerInit))
    element.dispatchEvent(new MouseEvent("mouseup", init))
    element.dispatchEvent(new MouseEvent("click", init))
}

/**
 * @description 点击配装页上的元素。
 *
 * 若点开的是下拉选择器，结果里会带上提示并列出选项数量，省得模型再猜要不要读一次页面。
 * @param input 点击参数
 * @returns 执行结果文本
 */
export async function clickBuildTarget(input: ClickBuildInput): Promise<string> {
    const element = resolveTarget(input)

    if (!element) {
        throw new Error(`找不到要点击的目标：${describeTarget(input)}`)
    }

    if ((element as HTMLInputElement).disabled) {
        throw new Error(`目标已禁用：${labelOf(element)}`)
    }

    scrollIntoView(element)
    dispatchClick(element)

    await nextTick()
    await settleFrame()
    await delay(input.settle ?? 160)

    const name = labelOf(element) || element.tagName.toLowerCase()
    const popup = findOptionPopup()

    if (popup) {
        const options = Array.from(popup.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem'], .select-item"))

        return `已点击 ${name}，展开 ${options.length} 个选项：${options
            .map(item => labelOf(item))
            .filter(Boolean)
            .slice(0, 40)
            .join(" / ")}`
    }

    return `已点击 ${name}`
}

/**
 * @description 找出当前展开的下拉 / 菜单弹层。
 * @returns 弹层元素；无则返回 null
 */
function findOptionPopup(): HTMLElement | null {
    const candidates = Array.from(
        document.querySelectorAll<HTMLElement>("[role='listbox'], [role='menu'], .select-content, [data-reka-popper-content-wrapper]")
    )

    return candidates.find(item => item.getClientRects().length) ?? null
}

/**
 * @description 取 CodeMirror 编辑器实例。
 * @param element 编辑器内的任意元素
 * @returns 编辑器视图；不是 CodeMirror 时返回 null
 */
function findEditorView(element: HTMLElement): EditorView | null {
    const host =
        element.closest<HTMLElement>(".cm-editor") ??
        element.querySelector<HTMLElement>(".cm-editor") ??
        (element.classList.contains("cm-content") ? element.parentElement : null)

    if (!host) {
        return null
    }

    try {
        return EditorView.findFromDOM(host)
    } catch {
        return null
    }
}

/**
 * @description 往原生输入框写值并触发 Vue 的更新。
 *
 * 必须走原型上的 setter：直接赋值 `element.value` 不会触发 Vue 响应式，
 * 而 v-model 是靠 patch `value` 的描述符 + input 事件联动的。
 * @param element 输入框
 * @param text 目标文本
 */
function writeNativeInput(element: HTMLElement, text: string): void {
    const input = element as HTMLInputElement
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set

    setter?.call(input, text)

    // v-model 只认 input 事件；change 事件留给 @change / 原生校验那一路，两者语义不同不能省
    input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
}

/**
 * @description 往配装页的输入框里打字。
 *
 * 三类输入源分别处理：CodeMirror（目标函数 / 自定义变量表达式）走编辑器 API，
 * 原生 input / textarea 走 setter + input 事件，contenteditable 走文本 + input 事件。
 * @param input 输入参数
 * @returns 执行结果文本
 */
export async function typeBuildText(input: TypeBuildInput): Promise<string> {
    const element = resolveTarget(input)

    if (!element) {
        throw new Error(`找不到输入目标：${describeTarget(input)}`)
    }

    const name = labelOf(element) || element.getAttribute("placeholder") || element.tagName.toLowerCase()
    const editor = findEditorView(element)

    if (editor) {
        // 替换写入从 0 到文末；追加写入只在文末插入
        const from = input.clear === false ? editor.state.doc.length : 0

        editor.focus()
        editor.dispatch({ changes: { from, to: input.clear === false ? from : editor.state.doc.length, insert: input.text } })
        // 光标单独移一次：改完再取文末长度，避免自己算错偏移量
        editor.dispatch({ selection: { anchor: editor.state.doc.length } })
    } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.focus()
        writeNativeInput(element, input.clear === false ? `${element.value}${input.text}` : input.text)
    } else if (element.isContentEditable) {
        element.focus()

        if (input.clear !== false) {
            element.textContent = input.text
        } else {
            element.textContent = `${element.textContent ?? ""}${input.text}`
        }

        element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }))
    } else {
        throw new Error(`${name} 不是可输入的控件，请先用 read_page 确认目标类型`)
    }

    await nextTick()
    await settleFrame()

    if (input.submit) {
        await pressBuildKey({ key: "Enter", ref: input.ref, selector: input.selector, label: input.label })
    }

    return `已向 ${name} 输入：${input.text}${input.submit ? "（已回车提交）" : ""}`
}

/**
 * @description 在按键目标上派发一次键盘事件。
 * @param input 按键参数
 * @returns 执行结果文本
 */
export async function pressBuildKey(input: PressKeyInput): Promise<string> {
    const element =
        (input.ref || input.selector || input.label ? resolveTarget(input) : null) ?? (document.activeElement as HTMLElement | null)

    if (!element) {
        throw new Error("没有按键目标，也没有聚焦中的元素")
    }

    const init: KeyboardEventInit = { key: input.key, bubbles: true, cancelable: true, composed: true }

    element.dispatchEvent(new KeyboardEvent("keydown", init))
    element.dispatchEvent(new KeyboardEvent("keyup", init))

    await nextTick()
    await settleFrame()

    return `已按下 ${input.key}`
}

/**
 * @description 展开 Select / Combobox 并选中指定选项。
 *
 * 两件事合在一个工具里是因为「先点开再找选项」这两步之间没有别的可做之事，
 * 拆开只会让模型多一轮往返，并可能在用了旧 ref 时点错。
 * @param input 选择参数
 * @returns 执行结果文本
 */
export async function selectBuildOption(input: SelectBuildOptionInput): Promise<string> {
    const element = resolveTarget(input)

    if (!element) {
        throw new Error(`找不到选择目标：${describeTarget(input)}`)
    }

    const name = labelOf(element) || element.getAttribute("placeholder") || element.tagName.toLowerCase()
    const role = element.getAttribute("role")
    /** 触发器（SelectTrigger）要点开；输入框式的 Combobox 要先打字才会出候选项 */
    const isTrigger = role === "combobox" && !(element instanceof HTMLInputElement)
    const isComboboxInput = role === "combobox" && element instanceof HTMLInputElement

    // 触发器点开后才有候选项；Combobox 输入框则是打字→过滤→选择
    if (isTrigger) {
        scrollIntoView(element)
        dispatchClick(element)
        await settleFrame()
        await delay(160)
    }

    if (isComboboxInput || input.search === true) {
        await typeBuildText({
            ref: input.ref,
            selector: input.selector,
            label: input.label,
            text: input.option,
            clear: true,
        })
        await delay(200)
    }

    const popup = findOptionPopup()

    if (!popup) {
        return `已把「${input.option}」交给 ${name}，但没有展开候选项：它可能不是下拉选择器，请用 read_page 确认目标类型`
    }

    const options = Array.from(popup.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem'], .select-item"))
    const wanted = input.option.trim()
    const exact = options.find(item => labelOf(item) === wanted)
    const picked = exact ?? options.find(item => labelOf(item).includes(wanted))

    if (!picked) {
        return `已展开 ${name}，但没有匹配「${wanted}」的选项。可选：${options
            .map(item => labelOf(item))
            .slice(0, 40)
            .join(" / ")}`
    }

    scrollIntoView(picked)
    dispatchClick(picked)

    await nextTick()
    await delay(160)

    return `已在 ${name} 中选择：${labelOf(picked)}`
}

/**
 * @description 把元素滚动到可视区域。
 * @param input 定位参数
 * @returns 执行结果文本
 */
export function scrollBuildTarget(input: BuildUiTarget): string {
    const element = resolveTarget(input)

    if (!element) {
        throw new Error(`找不到滚动目标：${describeTarget(input)}`)
    }

    scrollIntoView(element)

    return `已滚动到 ${labelOf(element) || element.tagName.toLowerCase()}`
}

/**
 * @description 把定位参数还原成人话，用于报错信息。
 * @param target 定位参数
 * @returns 描述文本
 */
function describeTarget(target: BuildUiTarget): string {
    return target.ref ? `ref=${target.ref}` : target.selector ? `selector=${target.selector}` : `label=${target.label ?? ""}`
}
