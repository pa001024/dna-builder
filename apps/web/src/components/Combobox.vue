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
    <!-- root 是 flex 项或普通块：统一 flex items-center，避免放进 tabs-box 这类 flex 行时
         根节点被拉高、而 anchor 顶对齐（高度看起来"塌掉"、下划线贴顶） -->
    <ComboboxRoot v-model="model" class="relative flex items-center" ignore-filter @update:open="open => open && emit('open')">
        <ComboboxAnchor
            v-bind="$attrs"
            class="input input-sm"
        >
            <ComboboxInput as-child class="h-full min-w-0 grow bg-transparent! outline-none" :placeholder="placeholder">
                <input v-model="model" type="text" />
            </ComboboxInput>
            <ComboboxTrigger>
                <Icon icon="radix-icons:chevron-down" class="h-4 w-4" />
            </ComboboxTrigger>
        </ComboboxAnchor>

        <ComboboxContent
            class="absolute z-100 mt-1 w-full min-w-40 overflow-hidden rounded-xs border border-base-content/15 bg-base-100/95 p-1 shadow-lg backdrop-blur-md will-change-[opacity,transform] data-[side=top]:animate-slideDownAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade"
        >
            <ComboboxViewport>
                <ComboboxEmpty class="py-2 text-center text-xs text-base-content/45">
                    {{ emptyMessage }}
                </ComboboxEmpty>
                <ComboboxItem
                    v-for="(option, index) in filteredOptions"
                    :key="index"
                    class="relative flex select-none items-center rounded-xs py-1.5 pl-7 pr-2 text-[13px] leading-none data-disabled:pointer-events-none data-disabled:text-base-content/35 data-highlighted:bg-base-content/5 data-highlighted:outline-none"
                    :value="option.value"
                >
                    <ComboboxItemIndicator class="absolute left-1.5 inline-flex items-center justify-center text-primary">
                        <Icon icon="radix-icons:check" class="size-3.5" />
                    </ComboboxItemIndicator>
                    <span>
                        {{ option.label }}
                    </span>
                </ComboboxItem>
            </ComboboxViewport>
        </ComboboxContent>
    </ComboboxRoot>
</template>
