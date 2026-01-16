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

const emit = defineEmits<{
    open: []
}>()

const filteredOptions = computed(() => {
    return props.options.filter(option => option.label.includes(model.value) || matchPinyin(option.label, model.value))
})
</script>

<template>
    <ComboboxRoot v-model="model" class="relative" ignore-filter @update:open="open => open && emit('open')">
        <ComboboxAnchor v-bind="$attrs" class="input input-bordered input-sm">
            <ComboboxInput as-child class="bg-transparent! outline-none h-full" :placeholder="placeholder">
                <input v-model="model" type="text" />
            </ComboboxInput>
            <ComboboxTrigger>
                <Icon icon="radix-icons:chevron-down" class="h-4 w-4 text-secondary" />
            </ComboboxTrigger>
        </ComboboxAnchor>

        <ComboboxContent
            class="absolute z-100 w-full mt-2 min-w-40 bg-white overflow-hidden rounded shadow-xl will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade"
        >
            <ComboboxViewport class="p-1.25">
                <ComboboxEmpty class="text-neutral-500 text-xs font-medium text-center py-2">
                    {{ emptyMessage }}
                </ComboboxEmpty>
                <ComboboxItem
                    v-for="(option, index) in filteredOptions"
                    :key="index"
                    class="p-2 pl-7.5 text-sm leading-none text-secondary rounded-sm flex items-center relative select-none data-disabled:text-neutral-400 data-disabled:pointer-events-none data-highlighted:outline-none data-highlighted:bg-secondary data-highlighted:text-base-100"
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
