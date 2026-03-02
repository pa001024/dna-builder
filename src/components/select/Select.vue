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

/**
 * 递归提取VNode中的纯文本内容。
 * @param input VNode或子节点
 * @returns 归一化后的文本
 */
function extractVNodeText(input: unknown): string {
    if (input === null || input === undefined || typeof input === "boolean") {
        return ""
    }
    if (typeof input === "object" && "default" in (input as Record<string, unknown>)) {
        const defaultSlot = (input as { default?: () => unknown }).default
        return defaultSlot ? extractVNodeText(defaultSlot()) : ""
    }
    if (typeof input === "string" || typeof input === "number") {
        return String(input)
    }
    if (Array.isArray(input)) {
        return input
            .map(item => extractVNodeText(item))
            .join("")
            .trim()
    }
    if (typeof input === "object" && "children" in (input as Record<string, unknown>)) {
        const node = input as VNode
        const children = node.children
        if (typeof children === "function") {
            const slotFn = children as () => unknown
            return extractVNodeText(slotFn())
        }
        if (children && typeof children === "object" && "default" in (children as Record<string, unknown>)) {
            const defaultSlot = (children as { default?: () => unknown }).default
            return defaultSlot ? extractVNodeText(defaultSlot()) : ""
        }
        return extractVNodeText(children)
    }
    return ""
}

/**
 * 递归收集SelectItem对应的显示文本。
 * @param nodes 节点列表
 * @param map 值到显示文本的映射
 */
function collectSelectItemText(nodes: unknown[], map: Map<unknown, string>) {
    for (const node of nodes) {
        if (!node || typeof node !== "object" || !("type" in (node as Record<string, unknown>))) {
            continue
        }
        const vnode = node as VNode
        const nodeType = vnode.type as { __name?: string; name?: string } | symbol | string
        const typeName = typeof nodeType === "object" ? nodeType.__name || nodeType.name : undefined
        const propsObj = (vnode.props || {}) as Record<string, unknown>

        const isSelectStructureNode = typeName === "SelectLabel" || typeName === "SelectGroup"
        if (!isSelectStructureNode && "value" in propsObj) {
            const text = extractVNodeText(vnode.children).trim()
            if (text) {
                map.set(propsObj.value, text)
            }
        }

        const children = vnode.children
        if (Array.isArray(children)) {
            collectSelectItemText(children as unknown[], map)
        } else if (children && typeof children === "object" && "default" in (children as Record<string, unknown>)) {
            const defaultSlot = (children as { default?: () => unknown }).default
            const slotNodes = defaultSlot?.()
            if (Array.isArray(slotNodes)) {
                collectSelectItemText(slotNodes as unknown[], map)
            } else if (slotNodes !== undefined && slotNodes !== null) {
                collectSelectItemText([slotNodes], map)
            }
        }
    }
}

const slotSignature = computed(() => buildSlotSignature(slots.default?.() ?? []))
const selectedItemTextMap = computed(() => {
    const map = new Map<unknown, string>()
    const nodes = slots.default?.() ?? []
    collectSelectItemText(nodes, map)
    return map
})
const selectedItemText = computed(() => {
    const value = props.modelValue
    if (value === null || value === undefined) {
        return ""
    }
    let text = selectedItemTextMap.value.get(value)
    /**
     * 兼容 number/string 等值场景（例如 31524 与 "31524"），避免回退显示原始ID。
     */
    if (!text || !text.trim()) {
        const valueAsString = String(value)
        for (const [key, label] of selectedItemTextMap.value.entries()) {
            if (String(key) === valueAsString) {
                text = label
                break
            }
        }
    }
    if (text && text.trim()) {
        return text
    }
    return ""
})
watch(
    () => props.modelValue,
    async (newValue, oldValue) => {
        if (newValue === oldValue) {
            return
        }
        emits("change", newValue, oldValue)
        /**
         * modelValue 在异步加载或外部同步后可能与内部选项状态短暂失配。
         * 这里在值变化后强制重建 SelectRoot，确保触发器文案与当前值保持一致。
         */
        await nextTick()
        selectRootKey.value += 1
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
                <SelectValue :placeholder="placeholder">{{ selectedItemText }}</SelectValue>
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
