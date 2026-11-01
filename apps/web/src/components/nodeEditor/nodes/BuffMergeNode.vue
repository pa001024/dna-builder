<script setup lang="ts">
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { readBuffMergeMode } from "@/utils/nodeEditorBuild"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

const MERGE_MODES = [
    { mode: "union", label: "并集", description: "保留两边全部 BUFF，同名取最高等级" },
    { mode: "intersect", label: "交集", description: "只保留两边都有的 BUFF，等级取较低值" },
] as const

const mode = computed(() => readBuffMergeMode(props.data))

const buffs = computed(() => {
    const raw = props.data.result?.buffs
    if (!Array.isArray(raw)) return []
    return (raw as [string, number, number?][]).map(([name, level, coverage = 1]) => ({
        name,
        level,
        // 覆盖率按百分比展示，满覆盖时不显示
        coverageLabel: coverage < 1 ? `${Math.round(coverage * 100)}%` : "",
    }))
})

function setMode(next: "union" | "intersect") {
    if (next === mode.value) return
    store.updateNodeData(props.id, { mergeMode: next })
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-60 max-w-full space-y-1.5">
            <div class="flex items-center gap-1.5">
                <span class="shrink-0 text-[10px] text-base-content/45">合并模式</span>
                <div class="flex shrink-0 items-center gap-0.5">
                    <button
                        v-for="item in MERGE_MODES"
                        :key="item.mode"
                        type="button"
                        class="h-5 cursor-pointer border px-1.5 text-[10px] transition-colors duration-150"
                        :class="
                            mode === item.mode
                                ? 'border-primary/50 bg-primary/10 text-primary'
                                : 'border-base-content/10 text-base-content/45 hover:border-base-content/25 hover:text-base-content/70'
                        "
                        :title="item.description"
                        @click="setMode(item.mode)"
                    >
                        {{ item.label }}
                    </button>
                </div>
            </div>
            <div v-if="buffs.length === 0" class="text-[10px] leading-snug text-base-content/40">
                连接两路 BUFF 输入后按所选模式合并
            </div>
            <template v-else>
                <div class="text-[10px] font-semibold tracking-[0.2em] text-base-content/45 uppercase">
                    合并结果 · {{ buffs.length }} 项
                </div>
                <div class="nowheel max-h-40 space-y-0.5 overflow-y-auto pr-0.5" @wheel.stop>
                    <div v-for="item in buffs" :key="item.name" class="flex items-center gap-1.5">
                        <span class="min-w-0 flex-1 truncate text-[10px] text-base-content/60" :title="item.name">{{ item.name }}</span>
                        <span class="shrink-0 font-mono text-[10px] tabular-nums text-base-content/45">Lv.{{ item.level }}</span>
                        <span v-if="item.coverageLabel" class="shrink-0 font-mono text-[10px] tabular-nums text-base-content/35">
                            {{ item.coverageLabel }}
                        </span>
                    </div>
                </div>
            </template>
        </div>
    </BaseNode>
</template>
