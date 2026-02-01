<script lang="ts" setup>
import { onMounted, ref, watch } from "vue"

const props = defineProps<{
    mode: "text" | "html"
    placeholder?: string
    innerClass?: string
}>()

const input = ref<HTMLDivElement>(null as any)
const model = defineModel<string>({ default: "" })
const emit = defineEmits(["loadref", "enter"])
const imgLoading = ref(false)

/**
 * 历史记录栈
 */
const history = ref<string[]>([])
/**
 * 当前历史记录指针
 */
const historyIndex = ref(-1)
/**
 * 最大历史记录数量
 */
const MAX_HISTORY = 50
/**
 * 防抖定时器
 */
let debounceTimer: number | null = null
/**
 * 防抖延迟时间（毫秒）
 */
const DEBOUNCE_DELAY = 500

/**
 * 保存当前状态到历史记录
 */
function saveToHistory() {
    if (debounceTimer) {
        clearTimeout(debounceTimer)
    }
    debounceTimer = window.setTimeout(() => {
        const content = model.value
        if (historyIndex.value < history.value.length - 1) {
            history.value = history.value.slice(0, historyIndex.value + 1)
        }
        history.value.push(content)
        if (history.value.length > MAX_HISTORY) {
            history.value.shift()
        } else {
            historyIndex.value++
        }
        debounceTimer = null
    }, DEBOUNCE_DELAY)
}

/**
 * 撤销操作
 */
function undo() {
    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
    if (historyIndex.value > 0) {
        historyIndex.value--
        const content = history.value[historyIndex.value]
        model.value = content
        updateEditorContent(content)
    }
}

/**
 * 重做操作
 */
function redo() {
    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
    if (historyIndex.value < history.value.length - 1) {
        historyIndex.value++
        const content = history.value[historyIndex.value]
        model.value = content
        updateEditorContent(content)
    }
}

/**
 * 检查是否可以撤销
 */
function canUndo() {
    return historyIndex.value > 0
}

/**
 * 检查是否可以重做
 */
function canRedo() {
    return historyIndex.value < history.value.length - 1
}

/**
 * 更新编辑器内容
 */
function updateEditorContent(content: string) {
    if (input.value) {
        if (props.mode === "text") {
            input.value.innerText = content
        } else {
            input.value.innerHTML = content
        }
    }
}

/**
 * 暴露方法给父组件
 */
defineExpose({
    undo,
    redo,
    canUndo,
    canRedo,
})

/**
 * 监听model变化，保存历史记录
 */
watch(model, (newVal, oldVal) => {
    if (newVal !== oldVal && history.value.length > 0) {
        const lastContent = history.value[historyIndex.value]
        if (newVal !== lastContent) {
            saveToHistory()
        }
    }
})

function onPaste(e: ClipboardEvent) {
    e.preventDefault()
    if (e.clipboardData?.types.includes("Files")) {
        if (props.mode === "text") return
        imgLoading.value = true
        const files = e.clipboardData.files
        const file = files[0]
        if (["image/png", "image/jpeg", "image/gif"].includes(file.type)) {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            const clt = setTimeout(() => {
                imgLoading.value = false
            }, 3e3)
            reader.onload = e => {
                const url = e.target?.result
                const img = new Image()
                img.src = url as string
                const sel = window.getSelection()!
                const range = sel.getRangeAt(0)
                range.deleteContents()
                range.insertNode(img)
                range.collapse(false)
                imgLoading.value = false
                clearTimeout(clt)
            }
        }
        return
    }
    const text = e.clipboardData?.getData("text/plain")
    if (!text) return
    const sel = window.getSelection()!
    const range = sel.getRangeAt(0)
    const node = document.createElement("div")
    node.innerText = text
    node.innerHTML = node.innerHTML.replace(/ (?: +|$)/g, s => "&nbsp;".repeat(s.length))
    range.deleteContents()
    range.insertNode(nodeChildFrag(node))
    range.collapse(false)
    model.value = props.mode === "text" ? (e.target as HTMLDivElement).innerText : (e.target as HTMLDivElement).innerHTML
}

function nodeChildFrag(html: HTMLDivElement) {
    let frag = document.createDocumentFragment()
    while (html.firstChild) {
        const p = html.firstChild
        frag.appendChild(p)
    }
    return frag
}

function onInput(e: Event) {
    model.value = props.mode === "text" ? (e.target as HTMLDivElement).innerText : (e.target as HTMLDivElement).innerHTML
}

/**
 * 处理键盘事件，支持快捷键
 */
function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" || e.key === "Z") {
            e.preventDefault()
            if (e.shiftKey) {
                redo()
            } else {
                undo()
            }
        } else if (e.key === "y" || e.key === "Y") {
            e.preventDefault()
            redo()
        }
    }
}

onMounted(() => {
    const el = input.value
    emit("loadref", el)
    if (props.mode === "text") {
        el.innerText = model.value
    } else {
        el.innerHTML = model.value
    }
    history.value.push(model.value)
    historyIndex.value = 0
})
</script>

<template>
    <div class="flex-1 overflow-hidden pointer-events-auto">
        <div v-if="imgLoading" class="absolute top-0 left-0 bottom-0 right-0 cursor-progress z-100 flex justify-center items-center">
            <span class="loading loading-spinner loading-md" />
        </div>
        <ScrollArea class="w-full h-full">
            <component
                :is="props.mode === 'text' ? 'pre' : 'div'"
                ref="input"
                contenteditable
                class="rich-input p-2 px-4 text-sm focus:outline-none text-wrap break-all overflow-x-hidden"
                :class="innerClass"
                dropzone="copy"
                :placeholder="placeholder"
                @paste="onPaste"
                @input="onInput"
                @keydown="onKeyDown"
                @keydown.enter="emit('enter', $event)"
            />
        </ScrollArea>
    </div>
</template>

<style>
.rich-input img {
    max-width: 200px;
    max-height: 200px;
}
.rich-input:empty:before {
    content: attr(placeholder);
    color: #9ca3af;
}
.rich-input * {
    display: inline;
    vertical-align: baseline;
}
</style>
