<script setup lang="ts">
import { formatExpressionValue } from "@/util"

defineProps<{
    vector: {
        labels: string[]
        values: number[]
        valueLabel?: string
    }
}>()
</script>

<template>
    <div class="mt-2 space-y-1">
        <div class="text-[11px] font-semibold tracking-[0.2em] text-base-content/45 uppercase">向量结果 · {{ vector.labels.length }} 组</div>
        <div class="nowheel max-h-48 overflow-y-auto rounded border border-base-300/60" @wheel.stop>
            <table class="table table-xs">
                <thead>
                    <tr>
                        <th>组合</th>
                        <th class="text-right">{{ vector.valueLabel || "值" }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(label, index) in vector.labels" :key="index">
                        <td class="max-w-50 truncate" :title="label">{{ label }}</td>
                        <td class="text-right tabular-nums">{{ formatExpressionValue(vector.values[index] ?? 0) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
