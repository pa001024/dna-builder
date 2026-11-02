<script setup lang="ts">
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
            <span class="text-[11px] text-base-content/55">地址</span>
            <input
                :value="str('url')"
                type="text"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                placeholder="ws://"
                autocomplete="off"
                @input="set('url', ($event.target as HTMLInputElement).value)"
            />
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">消息</span>
            <textarea
                :value="str('payload')"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                rows="3"
                :placeholder="'{{label}}'"
                @input="set('payload', ($event.target as HTMLTextAreaElement).value)"
            />
        </label>
    </div>
</template>
