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
            <span class="text-[11px] text-base-content/55">服务地址</span>
            <input
                :value="str('baseUrl')"
                type="text"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                autocomplete="off"
                @input="set('baseUrl', ($event.target as HTMLInputElement).value)"
            />
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">接口路径</span>
            <input
                :value="str('path') || '/sendMessage'"
                type="text"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                autocomplete="off"
                @input="set('path', ($event.target as HTMLInputElement).value)"
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
            <span class="text-[11px] text-base-content/55">会话</span>
            <input
                :value="str('chatId')"
                type="text"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                autocomplete="off"
                @input="set('chatId', ($event.target as HTMLInputElement).value)"
            />
        </label>
        <label class="flex flex-col gap-1">
            <span class="text-[11px] text-base-content/55">消息</span>
            <textarea
                :value="str('text')"
                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                rows="2"
                :placeholder="'{{label}}'"
                @input="set('text', ($event.target as HTMLTextAreaElement).value)"
            />
        </label>
    </div>
</template>
