<script lang="ts" setup>
import {
    SelectContent,
    SelectPortal,
    SelectRoot,
    SelectScrollDownButton,
    SelectScrollUpButton,
    SelectTrigger,
    SelectValue,
    SelectViewport,
    useForwardPropsEmits,
} from "radix-vue"
import type { SelectRootProps } from "radix-vue"
import Icon from "../Icon.vue"
import { watch } from "vue"

export interface SelectOption {
    type?: "label" | "group" | "separator" | "option"
    label?: string
    tlabel?: string
    value?: any
    options?: (SelectOption & { value: string })[]
    disabled?: boolean
    selected?: boolean
    hidden?: boolean
    divider?: boolean
    icon?: string
    class?: string
    style?: string
    onClick?: () => void
    onMouseEnter?: () => void
    onMouseLeave?: () => void
    onFocus?: () => void
    onBlur?: () => void
    onKeyDown?: () => void
    onKeyUp?: () => void
    onKeyPress?: () => void
}

const props = defineProps<
    Omit<SelectRootProps, "modelValue"> & {
        placeholder?: string
        modelValue?: any
    }
>()
const emits = defineEmits<{
    /** Event handler called when the value changes. */
    "update:modelValue": [value: any]
    /** Event handler called when the open state of the context menu changes. */
    "update:open": [value: boolean]
    change: [value: any, oldValue: any]
}>()
watch(
    () => props.modelValue,
    (newValue, oldValue) => {
        if (newValue !== oldValue) {
            emits("change", newValue, oldValue)
        }
    },
)

const forward = useForwardPropsEmits(props, emits)
</script>

<template>
    <SelectRoot v-bind="forward as any">
        <SelectTrigger v-bind="$attrs">
            <SelectValue :placeholder="placeholder" />
            <Icon icon="radix-icons:chevron-down" class="text-primary ml-2" />
        </SelectTrigger>

        <SelectPortal>
            <SelectContent
                class="z-100 overflow-hidden bg-base-100 border-base-content/20 border rounded-btn shadow-xl animate-slideDownAndFade"
            >
                <SelectScrollUpButton class="flex items-center justify-center cursor-default h-4">
                    <Icon icon="radix-icons:chevron-up" />
                </SelectScrollUpButton>

                <SelectViewport class="p-2 bg-base-100 space-y-1">
                    <slot />
                </SelectViewport>

                <SelectScrollDownButton class="flex items-center justify-center cursor-default h-4">
                    <Icon icon="radix-icons:chevron-down" />
                </SelectScrollDownButton>
            </SelectContent>
        </SelectPortal>
    </SelectRoot>
</template>
