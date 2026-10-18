/**
 * Agent 输入框的 Lexical 富文本核心（对齐 ZCode 的 prompt-mention 架构）。
 *
 * 编辑器由 `lexical` 核心 + `@lexical/plain-text`（原生输入事件层）+ `@lexical/history`
 * （撤销栈）装配，Vue 侧只做宿主接线（见 DBAskBox.vue）。技能 chip 是 token 模式的
 * TextNode 子类：原子节点、不可从中间编辑，展示「icon + 技能名」，业务输出显式读
 * canonical markdown `[$名称](/名称/SKILL.md)`——编辑器输出即发往模型的形态。
 *
 * 图标不能作为真实 DOM 塞进 TextNode（TextNode 的 firstChild 链必须通向展示文字，
 * 否则 Lexical 的选区映射会被截断，见 ZCode 同款注释），所以 icon 走 CSS mask 装饰。
 */

import {
    $applyNodeReplacement,
    $createLineBreakNode,
    $createParagraphNode,
    $createTextNode,
    $getCharacterOffsets,
    $getRoot,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
    $isTextNode,
    COMMAND_PRIORITY_HIGH,
    COPY_COMMAND,
    CUT_COMMAND,
    type EditorConfig,
    type LexicalEditor,
    type LexicalNode,
    type NodeKey,
    type RangeSelection,
    type SerializedTextNode,
    TextNode,
} from "lexical"
import { buildSkillMentionMarkdown, parseSkillMentions, SKILL_MENTION_TRIGGER } from "@/utils/skill-mention"

/**
 * 技能 chip 的类名配方：dbstyle 方章（直角细边框 + 半透明主色底 + primary 文字），
 * `align-top` 让 chip 与正文共用行盒顶部基准（对齐 ZCode 的 token 修正，避免行内低 1px）。
 * `db-skill-chip` 本体是样式与识别共用的标记类（icon 的 ::before 装饰在宿主 scoped CSS 里）。
 */
const SKILL_MENTION_NODE_CLASS =
    "db-skill-chip mx-0.5 inline-flex h-5 items-center gap-1 rounded-xs border border-primary/50 bg-primary/10 px-1.5 align-top text-[11px] leading-none font-semibold text-primary cursor-default"

/** chip 图标（ri:bard-line，与 Icon.vue 注册表同一份路径）生成的 CSS mask 数据源 */
const SKILL_MENTION_ICON_PATH =
    "M10.6144 17.7956C10.277 18.5682 9.20776 18.5682 8.8704 17.7956L7.99275 15.7854C7.21171 13.9966 5.80589 12.5726 4.0523 11.7942L1.63658 10.7219C.868536 10.381.868537 9.26368 1.63658 8.92276L3.97685 7.88394C5.77553 7.08552 7.20657 5.60881 7.97427 3.75892L8.8633 1.61673C9.19319.821767 10.2916.821765 10.6215 1.61673L11.5105 3.75894C12.2782 5.60881 13.7092 7.08552 15.5079 7.88394L17.8482 8.92276C18.6162 9.26368 18.6162 10.381 17.8482 10.7219L15.4325 11.7942C13.6789 12.5726 12.2731 13.9966 11.492 15.7854L10.6144 17.7956ZM4.53956 9.82234C6.8254 10.837 8.68402 12.5048 9.74238 14.7996 10.8008 12.5048 12.6594 10.837 14.9452 9.82234 12.6321 8.79557 10.7676 7.04647 9.74239 4.71088 8.71719 7.04648 6.85267 8.79557 4.53956 9.82234ZM19.4014 22.6899 19.6482 22.1242C20.0882 21.1156 20.8807 20.3125 21.8695 19.8732L22.6299 19.5353C23.0412 19.3526 23.0412 18.7549 22.6299 18.5722L21.9121 18.2532C20.8978 17.8026 20.0911 16.9698 19.6586 15.9269L19.4052 15.3156C19.2285 14.8896 18.6395 14.8896 18.4628 15.3156L18.2094 15.9269C17.777 16.9698 16.9703 17.8026 15.956 18.2532L15.2381 18.5722C14.8269 18.7549 14.8269 19.3526 15.2381 19.5353L15.9985 19.8732C16.9874 20.3125 17.7798 21.1156 18.2198 22.1242L18.4667 22.6899C18.6473 23.104 19.2207 23.104 19.4014 22.6899ZM18.3745 19.0469 18.937 18.4883 19.4878 19.0469 18.937 19.5898 18.3745 19.0469Z"

/** chip 图标的 mask 图（CSS ::before 引用，icon 只作装饰、不参与选区） */
const SKILL_MENTION_ICON_MASK = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${SKILL_MENTION_ICON_PATH}" fill="black"/></svg>`
)}")`

/** 序列化产物（exportJSON / importJSON 用） */
type SerializedSkillMentionNode = SerializedTextNode & {
    skillName: string
    type: "skill-mention"
    version: 1
}

/**
 * 技能 chip 节点：token 模式的 TextNode 子类。
 *
 * token 模式让 chip 成为原子节点——光标不可落入其中、删除按整体、前后无法插入文字
 * （canInsertTextBefore/After 为 false，输入会落到相邻文本节点），与 ZCode 的
 * PromptMentionNode 同一套行为契约。
 */
export class SkillMentionNode extends TextNode {
    __skillName: string

    static getType(): string {
        return "skill-mention"
    }

    static clone(node: SkillMentionNode): SkillMentionNode {
        return new SkillMentionNode(node.__skillName, node.__key)
    }

    static importJSON(serializedNode: SerializedSkillMentionNode): SkillMentionNode {
        return $createSkillMentionNode(serializedNode.skillName)
    }

    constructor(skillName: string, key?: NodeKey) {
        super(skillName, key)
        this.__skillName = skillName
    }

    createDOM(config: EditorConfig): HTMLElement {
        const dom = super.createDOM(config)
        dom.className = SKILL_MENTION_NODE_CLASS
        dom.setAttribute("data-skill-name", this.__skillName)
        dom.setAttribute("spellcheck", "false")
        dom.style.setProperty("--mention-mask", SKILL_MENTION_ICON_MASK)
        return dom
    }

    updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
        const updated = super.updateDOM(prevNode, dom, config)

        if (prevNode.__skillName !== this.__skillName) {
            dom.setAttribute("data-skill-name", this.__skillName)
        }

        return updated
    }

    exportJSON(): SerializedSkillMentionNode {
        return {
            ...super.exportJSON(),
            type: "skill-mention",
            version: 1,
            skillName: this.__skillName,
        }
    }

    /** 技能名（创建后不可变，名称变化走「删旧建新」） */
    getSkillName(): string {
        return this.getLatest().__skillName
    }

    /** 编辑器内展示文本是技能名（icon 由 CSS 装饰）；canonical 仅供发送与剪贴板序列化 */
    getMarkdown(): string {
        return buildSkillMentionMarkdown(this.getLatest().__skillName)
    }

    isTextEntity(): true {
        return true
    }

    canInsertTextBefore(): false {
        return false
    }

    canInsertTextAfter(): false {
        return false
    }
}

/**
 * 创建技能 chip 节点（token 模式在工厂函数里统一设置，漏设会退化成可编辑文本）。
 * @param skillName 技能名
 * @returns chip 节点
 */
export function $createSkillMentionNode(skillName: string): SkillMentionNode {
    const node = new SkillMentionNode(skillName)
    node.setMode("token")
    return $applyNodeReplacement(node)
}

/**
 * @description 判断节点是否为技能 chip。
 * @param node 待判断的节点
 * @returns 是否为 chip 节点（类型收窄）
 */
export function $isSkillMentionNode(node: LexicalNode | null | undefined): node is SkillMentionNode {
    return node instanceof SkillMentionNode
}

/**
 * @description 编辑器树转 prompt markdown：chip 输出 canonical，段落之间以空行分隔
 * （与 Lexical 段落语义一致，对齐 ZCode 的 $getPromptMarkdown）。
 * @param node 起始节点（默认根节点）
 * @returns prompt markdown 文本
 */
export function $getPromptMarkdown(node: LexicalNode = $getRoot()): string {
    if ($isSkillMentionNode(node)) {
        return node.getMarkdown()
    }

    if (!$isElementNode(node)) {
        return node.getTextContent()
    }

    const children = node.getChildren()
    return children
        .map(
            (child, index) =>
                $getPromptMarkdown(child) + ($isElementNode(child) && !child.isInline() && index < children.length - 1 ? "\n\n" : "")
        )
        .join("")
}

/**
 * @description 与 Lexical RangeSelection 的段落/端点规则一致，仅将实际选中的 chip 换为
 * canonical markdown（复制 / 剪切时写到剪贴板的形态）。
 * @param selection 当前选区
 * @returns 选区对应的 prompt markdown
 */
export function $getPromptSelectionMarkdown(selection: RangeSelection): string {
    if (selection.isCollapsed()) {
        return ""
    }

    const nodes = selection.getNodes()
    const [anchorOffset, focusOffset] = $getCharacterOffsets(selection)
    const forward = selection.anchor.isBefore(selection.focus)
    const start = forward ? anchorOffset : focusOffset
    const end = forward ? focusOffset : anchorOffset
    let result = ""
    let previousWasElement = true

    for (const [index, node] of nodes.entries()) {
        if ($isElementNode(node) && !node.isInline()) {
            if (!previousWasElement) {
                result += "\n"
            }

            previousWasElement = !node.isEmpty()
            continue
        }

        previousWasElement = false
        let text = node.getTextContent()

        if ($isTextNode(node)) {
            let from = index === 0 ? start : 0
            let to = index === nodes.length - 1 ? end : text.length
            // 两个 element point 包住同一个文本节点时，offset 是子节点索引而不是字符
            if (
                nodes.length === 1 &&
                selection.anchor.type === "element" &&
                selection.focus.type === "element" &&
                selection.anchor.offset !== selection.focus.offset
            ) {
                from = 0
                to = text.length
            }

            text = text.slice(from, to)
            if (text && $isSkillMentionNode(node)) {
                text = node.getMarkdown()
            }
        }

        result += text
    }

    return result
}

/**
 * @description 剪切与复制都把相交 chip 视为整体，但不扩张仅触碰边界的选区
 * （对齐 ZCode 的 $getAtomicPromptSelection）。
 * @param selection 当前选区
 * @returns 原子化后的选区
 */
export function $getAtomicPromptSelection(selection: RangeSelection): RangeSelection {
    const normalized = selection.clone()

    if (normalized.isCollapsed()) {
        return normalized
    }

    const [start, end] = normalized.isBackward() ? [normalized.focus, normalized.anchor] : [normalized.anchor, normalized.focus]
    const startNode = start.getNode()
    const endNode = end.getNode()

    if (start.type === "text" && $isSkillMentionNode(startNode) && start.offset < startNode.getTextContentSize()) {
        start.set(start.key, 0, "text")
    }

    if (end.type === "text" && $isSkillMentionNode(endNode) && end.offset > 0) {
        end.set(end.key, endNode.getTextContentSize(), "text")
    }

    return normalized
}

/** 光标所在文本节点的选区快照（面板触发判定与提及替换的输入） */
export interface CurrentTextNodeSelection {
    selection: RangeSelection
    node: TextNode
    cursorOffset: number
    textBeforeCursor: string
}

/**
 * @description 取光标所在文本节点的选区快照：仅折叠选区且锚点落在文本节点时有效。
 * chip 是独立节点，触发判定天然以「同一文本节点内的 `$`」为界，不依赖正则收边。
 * @returns 选区快照；不满足条件时 null
 */
export function $getCurrentTextNodeSelection(): CurrentTextNodeSelection | null {
    const selection = $getSelection()

    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
        return null
    }

    const anchor = selection.anchor

    if (anchor.type !== "text") {
        return null
    }

    const node = anchor.getNode()

    if (!$isTextNode(node)) {
        return null
    }

    const text = node.getTextContent()
    return {
        selection,
        node,
        cursorOffset: anchor.offset,
        textBeforeCursor: text.slice(0, anchor.offset),
    }
}

/**
 * @description 把光标处活动的 `$查询串` 区间整体替换成技能 chip + 尾随空格，光标落到
 * 空格之后（对齐 ZCode 的 insertMentionItem）。必须在 editor.update() 回调内调用。
 * @param selection 当前折叠选区
 * @param node 光标所在文本节点
 * @param cursorOffset 光标在该节点内的偏移
 * @param queryLength 活动查询串长度
 * @param skillName 采用的技能名
 * @returns 是否替换成功（光标不在 `$查询串` 末尾时失败）
 */
export function $replaceActiveTriggerWithSkillMention(
    selection: RangeSelection,
    node: TextNode,
    cursorOffset: number,
    queryLength: number,
    skillName: string
): boolean {
    const tokenStart = cursorOffset - queryLength - SKILL_MENTION_TRIGGER.length

    if (tokenStart < 0) {
        return false
    }

    selection.setTextNodeRange(node, tokenStart, node, cursorOffset)
    const trailingWhitespace = $createTextNode(" ")
    selection.insertNodes([$createSkillMentionNode(skillName), trailingWhitespace])
    trailingWhitespace.selectEnd()
    return true
}

/**
 * @description 用外部写入的 prompt markdown 重建编辑器内容（清空 / 预填 / 回显）：
 * 按段落拆分，段内 canonical 提及还原成 chip，换行还原成 LineBreak。
 * 必须在 editor.update() 回调内调用（对齐 ZCode 的 replaceEditorText）。
 * @param text 外部写入的 prompt markdown
 */
export function $replaceEditorContent(text: string): void {
    const root = $getRoot()
    root.clear()

    for (const block of text.split("\n\n")) {
        const paragraph = $createParagraphNode()

        for (const part of parseSkillMentions(block)) {
            if (part.type === "skill") {
                paragraph.append($createSkillMentionNode(part.name))
                continue
            }

            const lines = part.text.split("\n")

            lines.forEach((line, index) => {
                if (index > 0) {
                    paragraph.append($createLineBreakNode())
                }

                if (line) {
                    paragraph.append($createTextNode(line))
                }
            })
        }

        root.append(paragraph)
    }

    root.selectEnd()
}

/**
 * @description 复制 / 剪切命令接线：把选区内容以 prompt markdown 写入剪贴板，
 * 相交 chip 按整体取用（对齐 ZCode 的 PromptClipboardPlugin）。
 * @param editor Lexical 编辑器实例
 * @returns 注销函数
 */
export function registerPromptClipboard(editor: LexicalEditor): () => void {
    const handle = (event: KeyboardEvent | ClipboardEvent | null, cut: boolean): boolean => {
        const selection = $getSelection()

        if (!$isRangeSelection(selection) || selection.isCollapsed() || !event || !("clipboardData" in event) || !event.clipboardData) {
            return false
        }

        const atomic = $getAtomicPromptSelection(selection)

        try {
            event.clipboardData.setData("text/plain", $getPromptSelectionMarkdown(atomic))
        } catch {
            // 消费失败事件，保留草稿，让用户可以再次复制 / 剪切（对齐 ZCode 注释）
            event.preventDefault()
            return true
        }

        event.preventDefault()

        if (cut && editor.isEditable()) {
            atomic.removeText()
        }

        return true
    }

    const unregisterCopy = editor.registerCommand(COPY_COMMAND, event => handle(event, false), COMMAND_PRIORITY_HIGH)
    const unregisterCut = editor.registerCommand(CUT_COMMAND, event => handle(event, true), COMMAND_PRIORITY_HIGH)

    return () => {
        unregisterCopy()
        unregisterCut()
    }
}
