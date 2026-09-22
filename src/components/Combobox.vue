<script setup lang="ts">
import {
    ComboboxAnchor,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxRoot,
    ComboboxTrigger,
    ComboboxViewport,
} from "reka-ui"
import { computed } from "vue"
import { matchPinyin } from "@/utils/pinyin-utils"

const props = withDefaults(
    defineProps<{
        placeholder?: string
        emptyMessage?: string
        options: {
            label: string
            value: any
        }[]
    }>(),
    {
        placeholder: "...",
    }
)

const model = defineModel<any>()
defineOptions({ inheritAttrs: false })
const emit = defineEmits<{
    open: []
}>()

const filteredOptions = computed(() => {
    return props.options.filter(option => option.label.includes(model.value) || matchPinyin(option.label, model.value))
})
</script>

<template>
    <ComboboxRoot v-model="model" class="relative" ignore-filter @update:open="open => open && emit('open')">
        <ComboboxAnchor v-bind="$attrs" class="flex items-center gap-1.5 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 focus-within:border-primary">
            <ComboboxInput as-child class="h-full min-w-0 grow bg-transparent! outline-none" :placeholder="placeholder">
                <input v-model="model" type="text" />
            </ComboboxInput>
            <ComboboxTrigger>
                <Icon icon="radix-icons:chevron-down" class="h-4 w-4" />
            </ComboboxTrigger>
        </ComboboxAnchor>

        <ComboboxContent
            class="absolute z-100 w-full mt-2 min-w-40 bg-base-100 overflow-hidden rounded shadow-xl will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade"
        >
            <ComboboxViewport class="p-1.25">
                <ComboboxEmpty class="text-neutral-500 text-xs font-medium text-center py-2">
                    {{ emptyMessage }}
                </ComboboxEmpty>
                <ComboboxItem
                    v-for="(option, index) in filteredOptions"
                    :key="index"
                    class="p-2 pl-7.5 text-sm leading-none rounded-sm flex items-center relative select-none data-disabled:text-neutral-400 data-disabled:pointer-events-none data-highlighted:outline-none data-highlighted:bg-base-300"
                    :value="option.value"
                >
                    <ComboboxItemIndicator class="absolute left-0 w-6.25 inline-flex items-center justify-center">
                        <Icon icon="radix-icons:check" />
                    </ComboboxItemIndicator>
                    <span>
                        {{ option.label }}
                    </span>
                </ComboboxItem>
            </ComboboxViewport>
        </ComboboxContent>
    </ComboboxRoot>
</template>
