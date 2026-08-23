<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab, moveLineDown, moveLineUp, toggleComment } from "@codemirror/commands"
import { javascript } from "@codemirror/lang-javascript"
import {
    bracketMatching,
    foldGutter,
    foldKeymap,
    HighlightStyle,
    indentOnInput,
    indentUnit,
    syntaxHighlighting,
} from "@codemirror/language"
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view"
import { tags as t } from "@lezer/highlight"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { astLanguageExtension } from "./ast-language"

type Command = (view: EditorView) => boolean

interface FileViewState {
    selectionAnchor: number
    selectionHead: number
    scrollTop: number
    scrollLeft: number
}

const props = defineProps<{
    /** 文件标识：用于在多文件间保存/恢复光标与滚动位置（ScriptListView 场景），可选 */
    file?: string
    readonly?: boolean
    /** 语言模式：javascript（默认）或 ast（DNA Builder 表达式） */
    language?: "js" | "ast"
    /** language="ast" 时的内置宏名集合（词法阶段会被替换，编辑器中按宏高亮） */
    astMacros?: Set<string>
}>()

const model = defineModel<string>()

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void
    (e: "change", value: string): void
    (e: "cursor", position: number): void
}>()

const editorContainer = ref<HTMLElement | null>(null)
const editorView = ref<EditorView>()
const lastFile = ref(props.file)
const isApplyingExternal = ref(false)
const fileStates = new Map<string | undefined, FileViewState>()
const editableCompartment = new Compartment()
const languageCompartment = new Compartment()

/**
 * 构建 JS 语言高亮样式，颜色通过 CSS 变量驱动，支持亮暗主题实时切换。
 * @returns 语法高亮样式
 */
function createJavascriptHighlightStyle(): Extension {
    return syntaxHighlighting(
        HighlightStyle.define([
            { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--cm-comment)" },
            { tag: [t.keyword, t.modifier, t.operatorKeyword], color: "var(--cm-keyword)" },
            { tag: [t.string, t.special(t.string)], color: "var(--cm-string)" },
            { tag: [t.number, t.integer, t.float, t.bool, t.null], color: "var(--cm-number)" },
            { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--cm-function)" },
            { tag: [t.className, t.typeName], color: "var(--cm-class)" },
            { tag: [t.propertyName, t.attributeName], color: "var(--cm-property)" },
            { tag: [t.operator, t.punctuation], color: "var(--cm-operator)" },
        ])
    )
}

/**
 * 根据当前语言模式构建语言扩展（js 或 AST 专用上色器）。
 * @returns 语言扩展数组
 */
function createLanguageExtension(): Extension {
    if (props.language === "ast") {
        return astLanguageExtension({ macros: props.astMacros })
    }
    return [javascript(), createJavascriptHighlightStyle()]
}

/**
 * 创建编辑器主题扩展，使用 CSS 变量与页面主题统一。
 * @returns 编辑器主题扩展
 */
function createEditorThemeExtension(): Extension {
    return [
        EditorView.theme(
            {
                "&": {
                    backgroundColor: "transparent",
                    color: "var(--cm-foreground)",
                },
                ".cm-gutters": {
                    backgroundColor: "transparent",
                    color: "var(--cm-gutter-foreground)",
                    borderRight: "1px solid var(--cm-gutter-border)",
                },
                ".cm-activeLineGutter": { backgroundColor: "var(--cm-active-line)" },
                ".cm-activeLine": { backgroundColor: "var(--cm-active-line)" },
                ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--cm-caret)" },
                "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
                    {
                        backgroundColor: "var(--cm-selection)",
                    },
            },
            { dark: true }
        ),
    ]
}

/**
 * 在无选区时按整行剪切文本，选区存在时交给浏览器默认剪切行为。
 * @param view 编辑器视图
 * @returns 是否已处理本次快捷键
 */
const cutLineWhenNoSelection: Command = view => {
    const ranges = view.state.selection.ranges
    if (ranges.some(range => !range.empty)) return false

    const targetLineNumbers = Array.from(new Set(ranges.map(range => view.state.doc.lineAt(range.head).number))).sort((a, b) => a - b)
    const copiedParts: string[] = []
    const deletions: Array<{ from: number; to: number; insert: string }> = []

    for (const lineNumber of targetLineNumbers) {
        const line = view.state.doc.line(lineNumber)
        const hasNextLine = line.to < view.state.doc.length
        const copyEnd = hasNextLine ? line.to + 1 : line.to
        copiedParts.push(view.state.doc.sliceString(line.from, copyEnd))

        if (hasNextLine) {
            deletions.push({ from: line.from, to: line.to + 1, insert: "" })
            continue
        }

        if (line.from > 0) {
            deletions.push({ from: line.from - 1, to: line.to, insert: "" })
            continue
        }

        deletions.push({ from: line.from, to: line.to, insert: "" })
    }

    if (deletions.length < 1) return true

    const copiedText = copiedParts.join("")
    if (copiedText.length > 0 && navigator?.clipboard?.writeText) {
        void navigator.clipboard.writeText(copiedText).catch(() => undefined)
    }

    deletions.sort((a, b) => b.from - a.from)
    const anchor = Math.max(0, Math.min(...deletions.map(item => item.from)))
    view.dispatch({
        changes: deletions,
        selection: { anchor },
        scrollIntoView: true,
        userEvent: "delete.cut",
    })
    return true
}

/**
 * 创建基础键位映射，包括注释切换、整行剪切与行移动。
 * @returns 键位扩展
 */
function createKeymapExtension(): Extension {
    return keymap.of([
        { key: "Ctrl-/", mac: "Cmd-/", run: toggleComment },
        { key: "Ctrl-x", mac: "Cmd-x", run: cutLineWhenNoSelection },
        { key: "Alt-ArrowUp", run: moveLineUp },
        { key: "Alt-ArrowDown", run: moveLineDown },
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
    ])
}

/**
 * 保存当前文件的光标与滚动位置。
 * @param file 文件名（可选，未提供时按空键保存）
 */
function saveFileState(file?: string) {
    const view = editorView.value
    if (!view) return
    fileStates.set(file, {
        selectionAnchor: view.state.selection.main.anchor,
        selectionHead: view.state.selection.main.head,
        scrollTop: view.scrollDOM.scrollTop,
        scrollLeft: view.scrollDOM.scrollLeft,
    })
}

/**
 * 恢复目标文件的光标与滚动位置。
 * @param file 文件名（可选）
 */
function restoreFileState(file?: string) {
    const view = editorView.value
    if (!view) return
    const state = fileStates.get(file)
    if (!state) return
    view.dispatch({
        selection: {
            anchor: Math.max(0, Math.min(state.selectionAnchor, view.state.doc.length)),
            head: Math.max(0, Math.min(state.selectionHead, view.state.doc.length)),
        },
    })
    view.scrollDOM.scrollTop = state.scrollTop
    view.scrollDOM.scrollLeft = state.scrollLeft
}

/**
 * 用外部值替换编辑器全文，避免触发重复回写。
 * @param value 新文本
 */
function replaceDocument(value: string) {
    const view = editorView.value
    if (!view) return
    const next = value || ""
    const current = view.state.doc.toString()
    if (current === next) return
    isApplyingExternal.value = true
    view.dispatch({
        changes: {
            from: 0,
            to: view.state.doc.length,
            insert: next,
        },
    })
    isApplyingExternal.value = false
}

/**
 * 刷新编辑器可编辑状态。
 * @param readonly 是否只读
 */
function reconfigureReadonly(readonly?: boolean) {
    const view = editorView.value
    if (!view) return
    view.dispatch({
        effects: editableCompartment.reconfigure(EditorView.editable.of(!readonly)),
    })
}

function initEditor() {
    if (!editorContainer.value) return

    const view = new EditorView({
        parent: editorContainer.value,
        state: EditorState.create({
            doc: model.value || "",
            extensions: [
                EditorState.tabSize.of(4),
                indentUnit.of(" ".repeat(4)),
                lineNumbers(),
                highlightActiveLineGutter(),
                history(),
                foldGutter(),
                indentOnInput(),
                bracketMatching(),
                EditorView.lineWrapping,
                editableCompartment.of(EditorView.editable.of(!props.readonly)),
                languageCompartment.of(createLanguageExtension()),
                createEditorThemeExtension(),
                EditorView.theme({
                    "&": {
                        height: "100%",
                        fontSize: "14px",
                        outline: "none",
                    },
                    ".cm-scroller": {
                        fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                        lineHeight: "1.5",
                    },
                    ".cm-content": {
                        minHeight: "100%",
                        padding: "8px 0",
                    },
                    ".cm-lineNumbers .cm-gutterElement": {
                        padding: "0 8px 0 12px",
                    },
                }),
                createKeymapExtension(),
                EditorView.updateListener.of(update => {
                    // 光标/选区变化与文档变化都会广播当前位置，供外部做插入上下文判断。
                    if (update.selectionSet || update.docChanged) {
                        emit("cursor", update.state.selection.main.head)
                    }
                    if (!update.docChanged || isApplyingExternal.value) return
                    const code = update.state.doc.toString()
                    if (model.value === code) return
                    emit("update:modelValue", code)
                    emit("change", code)
                }),
            ],
        }),
    })

    editorView.value = view
}

/**
 * 按语言模式重新配置编辑器的语法解析与高亮。
 * @returns void
 */
function reconfigureLanguage() {
    const view = editorView.value
    if (!view) return
    view.dispatch({
        effects: languageCompartment.reconfigure(createLanguageExtension()),
    })
}

/**
 * 安全更新文本：先保存旧文件位置，再恢复新文件位置。
 * @param value 新文本
 */
function safeUpdate(value: string) {
    if (!editorView.value) return
    saveFileState(lastFile.value)
    replaceDocument(value || "")
    if (lastFile.value !== props.file) {
        lastFile.value = props.file
    }
    restoreFileState(props.file)
}

onMounted(() => {
    initEditor()
})

onBeforeUnmount(() => {
    if (editorView.value) {
        editorView.value.destroy()
        editorView.value = undefined
    }
})

watch(
    () => props.readonly,
    readonly => {
        reconfigureReadonly(readonly)
    }
)

watch(
    () => [props.language, props.astMacros],
    () => {
        reconfigureLanguage()
    }
)

watch(model, value => {
    replaceDocument(value || "")
})

defineExpose({
    safeUpdate,
    /**
     * 强制更新文本，不保存/恢复文件位置。
     * @param value 新文本
     */
    forceUpdate(value: string) {
        replaceDocument(value || "")
    },
    /**
     * 获取当前光标（选区主端点）在文档中的位置。
     * @returns 光标位置
     */
    getCursor(): number {
        const view = editorView.value
        return view ? view.state.selection.main.head : 0
    },
    /**
     * 在光标处插入文本，并将光标移到插入文本之后（不丢失位置）。
     * 通过内部 dispatch 完成，v-model 会自动同步，历史记录可撤销。
     * @param text 要插入的文本
     * @returns 插入后的光标位置
     */
    insertAtCursor(text: string): number {
        const view = editorView.value
        if (!view) return 0
        const pos = view.state.selection.main.head
        const newPos = pos + text.length
        view.dispatch({
            changes: { from: pos, to: pos, insert: text },
            selection: { anchor: newPos },
            scrollIntoView: true,
            userEvent: "input.insert",
        })
        return newPos
    },
    /**
     * 替换文档 [from, to) 区间，并把光标放到替换文本之后（用于合并 { } 等场景）。
     * @param from 起始位置（含）
     * @param to 结束位置（不含）
     * @param text 替换文本
     * @returns 替换后的光标位置
     */
    replaceRange(from: number, to: number, text: string): number {
        const view = editorView.value
        if (!view) return 0
        const newPos = from + text.length
        view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: newPos },
            scrollIntoView: true,
            userEvent: "input.replace",
        })
        return newPos
    },
    /**
     * 聚焦编辑器。
     * @returns void
     */
    focus() {
        editorView.value?.focus()
    },
})
</script>

<template>
    <div ref="editorContainer" class="w-full h-full code-editor-wrap" data-gramm="false" />
</template>

<style lang="less">
:root {
    --cm-foreground: #ccc;
    --cm-comment: #999;
    --cm-keyword: #b38cff;
    --cm-string: #82d99f;
    --cm-number: #f48cad;
    --cm-function: #f28c4d;
    --cm-class: #81cfd4;
    --cm-property: #f8c555;
    --cm-operator: #67cdcc;
    --cm-gutter-foreground: #999;
    --cm-gutter-border: #999;
    --cm-active-line: rgba(255, 255, 255, 0.05);
    --cm-selection: rgba(128, 203, 196, 0.24);
    --cm-caret: #ffffff;

    /* AST 表达式语言配色（与 ASTHelp 面板的 AST 树一致） */
    --ast-number: #22d3ee;
    --ast-keyword: #2dd4bf;
    --ast-property: #34d399;
    --ast-member: #38bdf8;
    --ast-attr: #f472b6;
    --ast-function: #a78bfa;
    --ast-namespace: #a78bfa;
    --ast-type: #818cf8;
    --ast-macro: #f0abfc;
    --ast-operator: #fcd34d;
    --ast-punctuation: #9ca3af;
}

[data-theme="light"] {
    --cm-foreground: #000;
    --cm-comment: #708090;
    --cm-keyword: #5f36b2;
    --cm-string: #6aa621;
    --cm-number: #e54595;
    --cm-function: #4078f2;
    --cm-class: #b15ef2;
    --cm-property: #17181a;
    --cm-operator: #9a6e3a;
    --cm-gutter-foreground: #708090;
    --cm-gutter-border: #708090;
    --cm-active-line: rgba(0, 0, 0, 0.04);
    --cm-selection: rgba(66, 133, 244, 0.22);
    --cm-caret: #111111;

    /* AST 表达式语言配色（亮色主题） */
    --ast-number: #0ea5e9;
    --ast-keyword: #0d9488;
    --ast-property: #059669;
    --ast-member: #0284c7;
    --ast-attr: #db2777;
    --ast-function: #7c3aed;
    --ast-namespace: #7c3aed;
    --ast-type: #6366f1;
    --ast-macro: #c026d3;
    --ast-operator: #d97706;
    --ast-punctuation: #6b7280;
}

.code-editor-wrap {
    width: 100%;
    height: 100%;
}

.code-editor-wrap .cm-editor {
    height: 100%;
}

.code-editor-wrap .cm-scroller {
    overflow: auto;
}
</style>
