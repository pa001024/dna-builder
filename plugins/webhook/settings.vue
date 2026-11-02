<script setup lang="ts">
import { Select, SelectItem } from "@dob/host"

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"]

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
            <span class="text-[11px] text-base-content/55">请求地址</span>
            <input
                :value="str('url')"
                type="text"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                placeholder="https://"
                autocomplete="off"
                @input="set('url', ($event.target as HTMLInputElement).value)"
            />
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">请求方法</span>
            <Select
                :model-value="str('method') || 'POST'"
                class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                @update:model-value="set('method', $event)"
            >
                <SelectItem v-for="method in METHODS" :key="method" :value="method">
                    {{ method }}
                </SelectItem>
            </Select>
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">请求头</span>
            <textarea
                :value="str('headers')"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                rows="2"
                placeholder="{}"
                @input="set('headers', ($event.target as HTMLTextAreaElement).value)"
            />
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">内容模板</span>
            <textarea
                :value="str('bodyTemplate')"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                rows="3"
                :placeholder="'{{label}}'"
                @input="set('bodyTemplate', ($event.target as HTMLTextAreaElement).value)"
            />
        </label>
    </div>
</template>
