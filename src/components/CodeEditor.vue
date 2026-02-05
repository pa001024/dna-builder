<script setup lang="ts">
// @ts-expect-error
import Prism from "prismjs"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import { CodeJarPro, CodeJarProInstance, Position } from "@/components/codejar"
import { LineNumbers } from "@/components/codejar/plugins/lineNumbers"

const props = defineProps<{
    file: string
    readonly?: boolean
}>()

const options = {
    tab: " ".repeat(4), // default is '\t'
    debounce: {
        update: 0,
        highlight: 150,
    },
    readonly: props.readonly || false,
}
const model = defineModel<string>()

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void
    (e: "change", value: string): void
}>()

const editorContainer = ref<HTMLElement | null>(null)
let jar = ref<CodeJarProInstance>()
/**
 * 初始化编辑器
 */
async function initEditor() {
    if (!editorContainer.value) return
    const highlight = (editor: HTMLElement) => {
        editor.innerHTML = Prism.highlight(editor.textContent, Prism.languages.javascript, "javascript")
    }

    jar.value = CodeJarPro(editorContainer.value, highlight, options)
    jar.value.addPlugin(LineNumbers, { show: true })
    jar.value.setContent(model.value || "")
    jar.value.onUpdate(code => {
        if (model.value === code) return
        emit("update:modelValue", code)
        emit("change", code)
    })
}
onMounted(() => {
    initEditor()
})

onBeforeUnmount(() => {
    if (jar.value) {
        jar.value.destroy()
    }
})
watch(
    () => props.readonly,
    readonly => {
        options.readonly = readonly || false
        if (jar.value) {
            jar.value.updateOptions(options)
        }
    }
)

const lastFile = ref(props.file)
const filePos = new Map<string, Position>()
function safeUpdate(value: string) {
    if (!jar.value) return
    filePos.set(lastFile.value, jar.value.save())
    jar.value.setContent(value || "")
    if (lastFile.value !== props.file) {
        lastFile.value = props.file
    }
    const pos = filePos.get(props.file)
    if (pos) jar.value.restore(pos)
}

defineExpose({
    safeUpdate,
    forceUpdate(value: string) {
        if (!jar.value) return
        jar.value.setContent(value || "")
    },
})
</script>

<template>
    <code ref="editorContainer" class="w-full h-full inline-block language-javascript" data-manual data-gramm="false" />
</template>

<style lang="less">
/* PrismJS 1.30.0
https://prismjs.com/download#themes=prism-tomorrow&languages=markup+css+clike+javascript */

/* Dark theme (默认) */
:root {
    --prism-color: #ccc;
    --prism-comment: #999;
    --prism-punctuation: #ccc;
    --prism-tag: #e2777a;
    --prism-function-name: #6196cc;
    --prism-function: #f08d49;
    --prism-class-name: #f8c555;
    --prism-keyword: #cc99cd;
    --prism-string: #7ec699;
    --prism-operator: #67cdcc;
    --prism-inserted: green;
}

/* Light theme */
[data-theme="light"] {
    --prism-color: #000;
    --prism-comment: #708090;
    --prism-punctuation: #999;
    --prism-tag: #905;
    --prism-function-name: #dd4a68;
    --prism-function: #905;
    --prism-class-name: #905;
    --prism-keyword: #07a;
    --prism-string: #690;
    --prism-operator: #9a6e3a;
    --prism-inserted: #690;
}

.codejarpro-line-numbers {
    color: var(--prism-comment) !important;
    border-right: 1px solid var(--prism-comment) !important;
}

code[class*="language-"],
pre[class*="language-"] {
    color: var(--prism-color);
    background: 0 0;
    font-family: Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace;
    text-align: left;
    white-space: pre;
    word-spacing: normal;
    word-break: normal;
    word-wrap: normal;
    line-height: 1.5;
    -moz-tab-size: 4;
    -o-tab-size: 4;
    tab-size: 4;
    -webkit-hyphens: none;
    -moz-hyphens: none;
    -ms-hyphens: none;
    hyphens: none;
}
.token.block-comment,
.token.cdata,
.token.comment,
.token.doctype,
.token.prolog {
    color: var(--prism-comment);
}
.token.punctuation {
    color: var(--prism-punctuation);
}
.token.attr-name,
.token.deleted,
.token.namespace,
.token.tag {
    color: var(--prism-tag);
}
.token.function-name {
    color: var(--prism-function-name);
}
.token.boolean,
.token.function,
.token.number {
    color: var(--prism-function);
}
.token.class-name,
.token.constant,
.token.property,
.token.symbol {
    color: var(--prism-class-name);
}
.token.atrule,
.token.builtin,
.token.important,
.token.keyword,
.token.selector {
    color: var(--prism-keyword);
}
.token.attr-value,
.token.char,
.token.regex,
.token.string,
.token.variable {
    color: var(--prism-string);
}
.token.entity,
.token.operator,
.token.url {
    color: var(--prism-operator);
}
.token.bold,
.token.important {
    font-weight: 700;
}
.token.italic {
    font-style: italic;
}
.token.entity {
    cursor: help;
}
.token.inserted {
    color: var(--prism-inserted);
}
</style>
