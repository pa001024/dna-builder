<script lang="ts" setup>
import { onMounted, ref } from "vue"

const props = defineProps<{
    mode: "text" | "html"
    placeholder?: string
}>()

const input = ref<HTMLDivElement>(null as any)
const model = defineModel<string>({ default: "" })
const emit = defineEmits(["loadref", "enter"])
const imgLoading = ref(false)

function onPaste(e: ClipboardEvent) {
    e.preventDefault()
    if (e.clipboardData?.types.includes("Files")) {
        if (props.mode === "text") return
        imgLoading.value = true
        const files = e.clipboardData.files
        const file = files[0]
        if (["image/png", "image/jpeg", "image/gif"].includes(file.type)) {
            // TODO: 处理文件上传逻辑
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
    // const html = e.clipboardData?.getData("text/html")
    const text = e.clipboardData?.getData("text/plain")
    if (!text) return
    console.log(text)
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
onMounted(() => {
    const el = input.value
    emit("loadref", el)
    if (props.mode === "text") {
        el.innerText = model.value
    } else {
        el.innerHTML = model.value
    }
})
</script>

<template>
    <div class="flex-1 overflow-hidden pointer-events-auto">
        <!-- loading遮罩 -->
        <div v-if="imgLoading" class="absolute top-0 left-0 bottom-0 right-0 cursor-progress z-100 flex justify-center items-center">
            <span class="loading loading-spinner loading-md" />
        </div>
        <ScrollArea class="w-full h-full">
            <div
                ref="input"
                contenteditable
                class="rich-input p-2 px-4 text-sm focus:outline-none text-wrap break-all overflow-x-hidden"
                dropzone="copy"
                :placeholder="placeholder"
                @paste="onPaste"
                @input="onInput"
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
