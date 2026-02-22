<script lang="ts" setup>
import type { SelectRootProps } from "reka-ui"
import type { VNode } from "vue"
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
} from "reka-ui"
import { computed, nextTick, onMounted, ref, useSlots, watch } from "vue"
import Icon from "../Icon.vue"

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
        hidebtn?: boolean
    }
>()
const emits = defineEmits<{
    /** Event handler called when the value changes. */
    "update:modelValue": [value: any]
    /** Event handler called when the open state of the context menu changes. */
    "update:open": [value: boolean]
    change: [value: any, oldValue: any]
}>()
const slots = useSlots()
const selectRootKey = ref(0)

/**
 * 递归提取插槽VNode签名，用于感知SelectItem结构变化。
 * @param nodes 需要提取签名的VNode列表
 * @returns 稳定的结构签名字符串
 */
function buildSlotSignature(nodes: VNode[]): string {
    return nodes
        .map(node => {
            const nodeType = typeof node.type === "symbol" ? node.type.toString() : String(node.type)
            const nodeValue = (node.props as Record<string, unknown> | null)?.value
            const childNodes = Array.isArray(node.children)
                ? node.children.filter((child): child is VNode => typeof child === "object" && child !== null && "type" in child)
                : []
            return `${nodeType}:${String(node.key ?? "")}:${String(nodeValue ?? "")}[${buildSlotSignature(childNodes)}]`
        })
        .join("|")
}

const slotSignature = computed(() => buildSlotSignature(slots.default?.() ?? []))
watch(
    () => props.modelValue,
    (newValue, oldValue) => {
        if (newValue !== oldValue) {
            emits("change", newValue, oldValue)
        }
    }
)
watch(
    slotSignature,
    async (newSignature, oldSignature) => {
        if (newSignature === oldSignature) {
            return
        }
        if (props.modelValue === undefined || props.modelValue === null) {
            return
        }
        await nextTick()
        selectRootKey.value += 1
    },
    { flush: "post" }
)
onMounted(async () => {
    if (props.modelValue === undefined || props.modelValue === null) {
        return
    }
    await nextTick()
    selectRootKey.value += 1
})

const forward = useForwardPropsEmits(props, emits)
</script>

<template>
    <SelectRoot :key="selectRootKey" v-bind="forward">
        <slot name="trigger">
            <SelectTrigger class="inline-flex items-center justify-between" v-bind="$attrs">
                <SelectValue :placeholder="placeholder" />
                <Icon v-if="!hidebtn" icon="radix-icons:chevron-down" class="ml-auto" />
            </SelectTrigger>
        </slot>

        <SelectPortal>
            <SelectContent
                class="z-10000 overflow-hidden bg-base-100 border-base-content/20 border rounded-btn shadow-xl animate-slideDownAndFade"
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
