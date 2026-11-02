<script setup lang="ts">
import { Select, SelectItem } from "@dob/host"

const TARGET_TYPES = ["group", "private"]

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
            <span class="text-[11px] text-base-content/55">服务地址</span>
            <input
                :value="str('baseUrl')"
                type="text"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                placeholder="http://127.0.0.1:5700"
                autocomplete="off"
                @input="set('baseUrl', ($event.target as HTMLInputElement).value)"
            />
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">Token</span>
            <input
                :value="str('token')"
                type="password"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                autocomplete="off"
                @input="set('token', ($event.target as HTMLInputElement).value)"
            />
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">目标类型</span>
            <Select
                :model-value="str('targetType') || 'group'"
                class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                @update:model-value="set('targetType', $event)"
            >
                <SelectItem v-for="item in TARGET_TYPES" :key="item" :value="item">
                    {{ item === "group" ? "群聊" : "私聊" }}
                </SelectItem>
            </Select>
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">目标</span>
            <input
                :value="str('targetId')"
                type="text"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                autocomplete="off"
                @input="set('targetId', ($event.target as HTMLInputElement).value)"
            />
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">消息</span>
            <textarea
                :value="str('message')"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                rows="2"
                :placeholder="'{{label}}'"
                @input="set('message', ($event.target as HTMLTextAreaElement).value)"
            />
        </label>
    </div>
</template>
