<script setup lang="ts">
import { Select, SelectItem } from "@dob/host"

const MODES = ["normal", "exe"] as const

const props = defineProps<{
    modelValue: Record<string, unknown>
    accountOnly?: boolean
}>()
const emit = defineEmits<{
    (e: "update:modelValue", value: Record<string, unknown>): void
}>()

function str(key: string) {
    const value = props.modelValue[key]
    return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

function set(key: string, value: unknown) {
    emit("update:modelValue", { ...props.modelValue, [key]: value })
}
</script>

<template>
    <div class="flex flex-col gap-2">
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">模式</span>
            <Select
                :model-value="str('mode') || 'normal'"
                class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                @update:model-value="set('mode', $event)"
            >
                <SelectItem v-for="item in MODES" :key="item" :value="item">
                    {{ item === "normal" ? "普通打开" : "直接执行" }}
                </SelectItem>
            </Select>
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">路径</span>
            <input
                :value="str('path')"
                type="text"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                autocomplete="off"
                @input="set('path', ($event.target as HTMLInputElement).value)"
            />
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">参数</span>
            <input
                :value="str('params')"
                type="text"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                :placeholder="'{{label}}'"
                autocomplete="off"
                @input="set('params', ($event.target as HTMLInputElement).value)"
            />
        </label>
    </div>
</template>
