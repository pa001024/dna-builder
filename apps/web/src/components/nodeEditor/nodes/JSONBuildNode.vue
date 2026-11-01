<script setup lang="ts">
import { debounce } from "lodash-es"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()
const text = ref(typeof props.data.text === "string" ? props.data.text : "")

if (props.data.text === undefined) props.data.text = ""

watch(
    () => props.data.text,
    value => {
        if (typeof value === "string" && value !== text.value) text.value = value
    }
)

const commitText = debounce(() => {
    store.updateNodeData(props.id, { text: text.value })
}, 300)

function onInput() {
    commitText()
}

const charName = computed(() => props.data.build?.charBuild?.char?.名称 ?? "")
const variableCount = computed(() => props.data.build?.settings?.customVariables?.length ?? 0)

onBeforeUnmount(() => {
    commitText.flush()
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-85 max-w-full space-y-1.5">
            <textarea
                v-model="text"
                class="nodrag nowheel min-h-24 w-full resize-y rounded-none border border-base-content/15 bg-base-100/60 p-1.5 font-mono text-[11px] leading-relaxed outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary/60"
                placeholder='粘贴构筑 JSON，例如 {"charId": 3104, "charSettings": "{...}"}'
                @input="onInput"
                @pointerdown.stop
                @mousedown.stop
            />
            <div class="text-[10px] text-base-content/40">已连接文本输入时优先使用连接的文本</div>
            <div v-if="data.build" class="flex items-center gap-2 border border-base-content/10 bg-base-content/4 px-1.5 py-1 text-[10px] text-base-content/60">
                <span class="truncate">角色：{{ charName || data.build.charId }}</span>
                <span class="ml-auto shrink-0 tabular-nums">变量 {{ variableCount }}</span>
            </div>
            <div v-else-if="data.error" class="break-all text-[10px] text-red-500">{{ data.error }}</div>
            <div v-else class="text-[10px] text-base-content/40">等待构筑 JSON</div>
        </div>
    </BaseNode>
</template>
