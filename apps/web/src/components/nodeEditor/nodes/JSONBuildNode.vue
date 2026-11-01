<script setup lang="ts">
import { debounce } from "lodash-es"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { charMap, LeveledCharHelper } from "@/data"
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

/** 读取连接到「角色」端口的角色 */
const portChar = computed(() => {
    const edge = store.edges.find(item => item.target === props.id && item.targetHandle === "char")
    if (!edge) return null
    const node = store.nodes.find(item => item.id === edge.source)
    const name = typeof node?.data.charName === "string" ? node.data.charName : ""
    const explicitId = Number(node?.data.charId)
    const char = charMap.get(name) ?? (Number.isFinite(explicitId) && explicitId > 0 ? charMap.get(explicitId) : undefined)
    if (char) return { id: char.id, name: char.名称 }
    return name ? { id: 0, name } : null
})

const portIcon = computed(() => (portChar.value?.id ? LeveledCharHelper.idToUrl(portChar.value.id) : ""))

onBeforeUnmount(() => {
    commitText.flush()
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-85 max-w-full space-y-1.5">
            <!-- 角色：由角色输入节点的 CHAR 端口提供 -->
            <div class="flex items-center gap-1.5 border border-base-content/10 bg-base-content/3 px-1.5 py-1">
                <Icon icon="ri:user-line" class="size-3.5 shrink-0 text-base-content/40" />
                <template v-if="portChar">
                    <img v-if="portIcon" :src="portIcon" :alt="portChar.name" class="size-4 shrink-0 object-cover object-top" />
                    <span class="min-w-0 flex-1 truncate text-[11px] text-base-content/75">{{ portChar.name }}</span>
                    <span class="shrink-0 text-[10px] text-primary">角色输入</span>
                </template>
                <span v-else class="min-w-0 flex-1 truncate text-[11px] text-base-content/40">未连接角色输入</span>
            </div>
            <textarea
                v-model="text"
                class="nodrag nowheel min-h-24 w-full resize-y rounded-none border border-base-content/15 bg-base-100/60 p-1.5 font-mono text-[11px] leading-relaxed outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary/60"
                placeholder="粘贴标准 charSettings JSON（角色由角色端口输入）"
                @input="onInput"
                @pointerdown.stop
                @mousedown.stop
            />
            <div class="text-[10px] text-base-content/40">已连接文本输入时优先使用连接的文本；角色由角色端口输入</div>
            <div v-if="data.build" class="flex items-center gap-2 border border-base-content/10 bg-base-content/4 px-1.5 py-1 text-[10px] text-base-content/60">
                <span class="truncate">角色：{{ charName }}</span>
                <span class="ml-auto shrink-0 tabular-nums">变量 {{ variableCount }}</span>
            </div>
            <div v-else-if="data.error" class="break-all text-[10px] text-red-500">{{ data.error }}</div>
            <div v-else class="text-[10px] text-base-content/40">连接角色并粘贴构筑 JSON</div>
        </div>
    </BaseNode>
</template>
