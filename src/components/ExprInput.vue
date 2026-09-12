<script setup lang="ts">
import { history, redo, undo } from "@codemirror/commands"
import { syntaxHighlighting } from "@codemirror/language"
import { Compartment, EditorState } from "@codemirror/state"
import { placeholder as cmPlaceholder, EditorView, keymap } from "@codemirror/view"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { findFieldDeleteRange } from "@/utils/expr-field"
import { astHighlightStyle, createAstLanguage } from "./ast-language"

/**
 * 表达式输入框：用 CodeMirror 承载表达式文本，外观贴合原来的原生 <input>。
 * 相比原生输入框的关键好处：整字段删除通过编辑器 dispatch 完成，会进入 CodeMirror 历史记录，
 * 因此 Ctrl+Z / Ctrl+Y（mac 上 Cmd+Z / Cmd+Shift+Z）撤销重做始终可用。
 * Ctrl/Alt + 退格按 AST 字段粒度整段删除（如「近战::攻击!」一次删掉）；无法构成完整字段时不拦截，
 * 交给编辑器默认的按词删除。
 * 高亮使用 AST 专用词法（与 ASTHelp 编辑器同源），颜色经 --ast-* 变量注入。
 */
const props = defineProps<{
    /** 占位文本 */
    placeholder?: string
    /** 编辑器字号，需与原来的原生输入框一致 */
    fontSize?: string
    /** 编辑器行高，需与原来的原生输入框一致 */
    lineHeight?: string
    /** 外观变体：plain（外层容器提供边框，如 daisyUI input）或 underline（自带下划线，如自定义变量行） */
    variant?: "plain" | "underline"
    /** 内置宏名集合（词法阶段会被替换，编辑器中按宏高亮） */
    macros?: Set<string>
}>()

const model = defineModel<string>({ default: "" })

const emit = defineEmits<{
    (e: "cursor", position: number): void
}>()

const hostRef = ref<HTMLElement | null>(null)
const viewRef = ref<EditorView>()
const isApplyingExternal = ref(false)
/** 换行开关：失焦时关闭自动换行，保证编辑框始终只有一行、不破坏布局 */
const wrapCompartment = new Compartment()

/**
 * 判断光标左侧是否为完整的 AST 字段，是则整段删除。
 * 删除通过编辑器 dispatch 完成，因此会写入 CodeMirror 历史记录，可正常撤销。
 * @param view 编辑器视图
 * @returns 是否已处理本次快捷键
 */
function deleteExpressionField(view: EditorView): boolean {
    const range = view.state.selection.main
    if (!range.empty) return false
    const found = findFieldDeleteRange(view.state.doc.toString(), range.head)
    if (!found) return false
    view.dispatch({
        changes: { from: found.start, to: found.end, insert: "" },
        selection: { anchor: found.start },
        scrollIntoView: true,
        userEvent: "delete.field",
    })
    return true
}

/**
 * 根据聚焦状态切换自动换行：聚焦时可换行以便看清长表达式，失焦后单行显示。
 * @param view 编辑器视图
 * @returns void
 */
function syncWrap(view: EditorView) {
    view.dispatch({
        effects: wrapCompartment.reconfigure(view.hasFocus ? EditorView.lineWrapping : []),
    })
}

/**
 * 创建单行表达式编辑器的主题：背景与边框由外层容器（daisyUI input / 下划线样式）提供，
 * 主题只负责把内外边距、字号行高、选中高亮对齐原来的原生输入框。
 * @returns 编辑器主题扩展
 */
function createTheme(): ReturnType<typeof EditorView.theme> {
    const fontSize = props.fontSize ?? "13px"
    const lineHeight = props.lineHeight ?? "19.5px"
    // underline 变体由外层负责 0.25rem 的下内边距，内容区不再重复加，避免撑高输入框
    const padding = props.variant === "underline" ? "0px" : "6px 0"
    return EditorView.theme({
        // 单行输入框：不渲染行号与折叠槽，内容区与外层容器对齐
        "&": {
            backgroundColor: "transparent",
            backgroundImage: "none",
            color: "inherit",
            fontSize,
            lineHeight,
        },
        ".cm-scroller": {
            overflowX: "auto",
            overflowY: "hidden",
            fontFamily: "inherit",
            lineHeight,
        },
        ".cm-content": {
            padding,
            fontFamily: "inherit",
            fontSize,
            lineHeight,
            caretColor: "currentColor",
        },
        ".cm-line": {
            padding: "0",
            lineHeight,
        },
        ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "currentColor",
            borderLeftWidth: "1px",
        },
        "&.cm-focused": { outline: "none" },
        ".cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--cm-selection)" },
        "&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--cm-selection)" },
        ".cm-placeholder": { color: "var(--color-base-content)", opacity: "0.3" },
    })
}

/**
 * 初始化 CodeMirror 编辑器。
 * 键位顺序：先注册整字段删除与撤销重做，再使用编辑器默认键位。
 * @returns void
 */
function initEditor() {
    if (!hostRef.value) return
    viewRef.value = new EditorView({
        parent: hostRef.value,
        state: EditorState.create({
            doc: model.value || "",
            extensions: [
                EditorState.tabSize.of(4),
                history(),
                createAstLanguage({ macros: props.macros }),
                syntaxHighlighting(astHighlightStyle),
                // 失焦时保持单行显示，避免长表达式换行撑高输入框
                wrapCompartment.of([]),
                keymap.of([
                    { key: "Mod-Backspace", mac: "Alt-Backspace", run: deleteExpressionField },
                    { mac: "Mod-Backspace", run: deleteExpressionField },
                    { key: "Mod-z", run: undo },
                    // mac 上用 Mod-Shift-z 重做，Mod-y 只在非 mac 生效（与 CodeMirror 默认键位一致）
                    { key: "Mod-y", run: redo, mac: "Mod-Shift-y" },
                    { key: "Mod-Shift-z", mac: "Mod-y", run: redo },
                ]),
                props.placeholder ? cmPlaceholder(props.placeholder) : [],
                createTheme(),
                EditorView.updateListener.of(update => {
                    if (update.focusChanged) syncWrap(update.view)
                    if (update.selectionSet || update.docChanged) emit("cursor", update.state.selection.main.head)
                    if (!update.docChanged || isApplyingExternal.value) return
                    const text = update.state.doc.toString()
                    if (model.value === text) return
                    model.value = text
                }),
            ],
        }),
    })
    syncWrap(viewRef.value)
}

/**
 * 用外部值替换编辑器全文（不写回 v-model，避免循环更新）。
 * @param value 新文本
 * @returns void
 */
function replaceDocument(value: string) {
    const view = viewRef.value
    if (!view) return
    const next = value ?? ""
    if (view.state.doc.toString() === next) return
    isApplyingExternal.value = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
    isApplyingExternal.value = false
}

onMounted(() => {
    initEditor()
})

onBeforeUnmount(() => {
    viewRef.value?.destroy()
    viewRef.value = undefined
})

watch(model, value => {
    replaceDocument(value ?? "")
})

defineExpose({
    /**
     * 读取光标在表达式中的位置（拖拽放置时用于判断是否插入到光标处）。
     * @returns 光标下标；编辑器尚未初始化时返回文本末尾
     */
    getCursor(): number {
        return viewRef.value ? viewRef.value.state.selection.main.head : model.value.length
    },
    /**
     * 在光标处插入文本，并把光标移到插入内容之后（拖拽放置共用，与原生输入框行为一致）。
     * @param text 要插入的文本
     * @returns 插入后的光标位置
     */
    insertAtCursor(text: string): number {
        const view = viewRef.value
        if (!view) return 0
        const position = view.state.selection.main.head
        const next = position + text.length
        view.dispatch({
            changes: { from: position, to: position, insert: text },
            selection: { anchor: next },
            scrollIntoView: true,
            userEvent: "input.insert",
        })
        return next
    },
    /**
     * 聚焦编辑器。
     * @returns void
     */
    focus(): void {
        viewRef.value?.focus()
    },
})
</script>

<template>
    <div ref="hostRef" class="expr-input" :class="{ 'expr-input--underline': variant === 'underline' }" />
</template>

<style lang="less" scoped>
.expr-input {
    flex: 1 1 0%;
    min-width: 0;
    background: transparent;

    /* 单行输入不需要滚动条占位 */
    :deep(.cm-scroller) {
        scrollbar-width: none;
    }

    :deep(.cm-scroller::-webkit-scrollbar) {
        display: none;
    }

    /* 下划线样式：复刻原来的自定义变量表达式输入框（border-b + px-0.5 pb-1 + focus:border-primary） */
    &--underline {
        padding: 0 0.125rem 0.25rem;
        border-bottom: 1px solid color-mix(in oklab, var(--color-base-content) 20%, #0000);
        outline: none;
        transition-property: border-color;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 150ms;

        &:focus-within {
            border-bottom-color: var(--color-primary);
        }
    }
}
</style>
