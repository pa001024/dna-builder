<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue"
import { copyText } from "@/util"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const exportText = computed(() => (typeof props.data.exportText === "string" ? props.data.exportText : ""))
const error = computed(() => (typeof props.data.error === "string" ? props.data.error : ""))
const charName = computed(() => props.data.build?.charBuild?.char?.名称 ?? "")
const copied = ref(false)
const copyError = ref("")
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyJson() {
    if (!exportText.value || copied.value) return
    copyError.value = ""
    try {
        await copyText(exportText.value)
        copied.value = true
        clearTimeout(copiedTimer)
        copiedTimer = setTimeout(() => {
            copied.value = false
        }, 1500)
    } catch (err) {
        copyError.value = err instanceof Error ? err.message : "复制失败"
    }
}

onBeforeUnmount(() => {
    clearTimeout(copiedTimer)
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-85 max-w-full space-y-1.5">
            <textarea
                :value="exportText"
                readonly
                class="nodrag nowheel min-h-24 w-full resize-y rounded-none border border-base-content/15 bg-base-100/60 p-1.5 font-mono text-[11px] leading-relaxed outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary/60"
                placeholder="连接构筑后显示 JSON"
                @pointerdown.stop
                @mousedown.stop
            />
            <div class="flex items-center gap-1.5">
                <span v-if="charName" class="min-w-0 flex-1 truncate text-[10px] text-base-content/60">角色：{{ charName }}</span>
                <span v-else class="min-w-0 flex-1 truncate text-[10px] text-base-content/40">等待构筑输入</span>
                <button
                    type="button"
                    :disabled="!exportText"
                    class="flex shrink-0 cursor-pointer items-center gap-1 border px-2 py-1 text-[11px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
                    :class="
                        copied
                            ? 'border-success/50 bg-success/10 text-success'
                            : 'border-base-content/15 text-base-content/70 hover:border-primary/50 hover:text-primary'
                    "
                    @click="copyJson"
                >
                    <Icon :icon="copied ? 'ri:check-line' : 'ri:file-copy-line'" class="size-3.5" />
                    {{ copied ? "已复制" : "复制" }}
                </button>
            </div>
            <div v-if="copyError" class="break-all text-[10px] text-red-500">{{ copyError }}</div>
            <div v-else-if="error" class="break-all text-[10px] text-red-500">{{ error }}</div>
            <div v-else-if="exportText" class="text-[10px] tabular-nums text-base-content/40">
                {{ exportText.length }} 字符 · 标准 charSettings，连到 JSON 构筑时需另接角色
            </div>
        </div>
    </BaseNode>
</template>
