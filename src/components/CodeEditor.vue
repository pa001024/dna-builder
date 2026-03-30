<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab, moveLineDown, moveLineUp, toggleComment } from "@codemirror/commands"
import { javascript } from "@codemirror/lang-javascript"
import { bracketMatching, foldGutter, foldKeymap, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language"
import { Compartment, EditorState, type Extension } from "@codemirror/state"
import { EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view"
import { tags as t } from "@lezer/highlight"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"

type Command = (view: EditorView) => boolean


interface FileViewState {
    selectionAnchor: number
    selectionHead: number
    scrollTop: number
    scrollLeft: number
}

const props = defineProps<{
    file: string
    readonly?: boolean
}>()

const model = defineModel<string>()

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void
    (e: "change", value: string): void
}>()

const editorContainer = ref<HTMLElement | null>(null)
const editorView = ref<EditorView>()
const lastFile = ref(props.file)
const isApplyingExternal = ref(false)
const fileStates = new Map<string, FileViewState>()
const editableCompartment = new Compartment()

/**
 * 构建代码高亮样式，颜色通过 CSS 变量驱动，支持亮暗主题实时切换。
 * @returns 语法高亮样式
 */
function createHighlightStyle(): Extension {
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
 * 创建编辑器主题扩展，使用 CSS 变量与页面主题统一。
 * @returns 编辑器主题扩展
 */
function createEditorThemeExtension(): Extension {
    return [
        createHighlightStyle(),
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
 * @param file 文件名
 */
function saveFileState(file: string) {
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
 * @param file 文件名
 */
function restoreFileState(file: string) {
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
                javascript(),
                editableCompartment.of(EditorView.editable.of(!props.readonly)),
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
    model,
    value => {
        replaceDocument(value || "")
    }
)

defineExpose({
    safeUpdate,
    /**
     * 强制更新文本，不保存/恢复文件位置。
     * @param value 新文本
     */
    forceUpdate(value: string) {
        replaceDocument(value || "")
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
    --cm-keyword: #B38CFF;
    --cm-string: #82D99F;
    --cm-number: #F48CAD;
    --cm-function: #F28C4D;
    --cm-class: #81CFD4;
    --cm-property: #f8c555;
    --cm-operator: #67cdcc;
    --cm-gutter-foreground: #999;
    --cm-gutter-border: #999;
    --cm-active-line: rgba(255, 255, 255, 0.05);
    --cm-selection: rgba(128, 203, 196, 0.24);
    --cm-caret: #ffffff;
}

[data-theme="light"] {
    --cm-foreground: #000;
    --cm-comment: #708090;
    --cm-keyword: #5F36B2;
    --cm-string: #6AA621;
    --cm-number: #E54595;
    --cm-function: #4078F2;
    --cm-class: #B15EF2;
    --cm-property: #17181A;
    --cm-operator: #9a6e3a;
    --cm-gutter-foreground: #708090;
    --cm-gutter-border: #708090;
    --cm-active-line: rgba(0, 0, 0, 0.04);
    --cm-selection: rgba(66, 133, 244, 0.22);
    --cm-caret: #111111;
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
