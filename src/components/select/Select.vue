<script lang="ts" setup>
import type { SelectRootProps } from "reka-ui"
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
import { type ComponentPublicInstance, computed, defineComponent, Fragment, nextTick, onBeforeUnmount, onMounted, type PropType, ref, useSlots, type VNode, watch } from "vue"
import VirtualRowItem from "./SelectItem.vue"

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

/** 数据驱动模式的行类型，配合 valueKey/labelKey/disabledKey 也支持任意字段名与原始值数组。 */
export interface VirtualSelectItem {
    value?: unknown
    label?: string
    disabled?: boolean
    [key: string]: unknown
}

const props = defineProps<
    Omit<SelectRootProps, "modelValue"> & {
        contentClass?: string
        contentProps?: Record<string, unknown>
        placeholder?: string
        modelValue?: any
        hidebtn?: boolean
        /**
         * 样式变体，用于适配不同页面的设计语言：
         * - default：无内置外观，配合 $attrs 传入的下划线输入框配方（border-b + focus:border-primary）
         * - ghost：透明无边框紧凑触发器（如 GameUpdate 的胶囊筛选栏，外层自行包胶囊容器）
         * - chip：自带胶囊底色的触发器（bg-base-content/5 圆角胶囊，适合工具栏/筛选栏）
         */
        variant?: "default" | "ghost" | "chip"
        /**
         * 数据驱动模式：传入后下拉内容按行高窗口化虚拟渲染，不再渲染默认 slot。
         * 行数未超 virtualThreshold 时退化为全量渲染（键盘导航/typeahead 完整可用）。
         */
        items?: VirtualSelectItem[] | unknown[]
        /** items 行中取值的字段名，原始值数组会被直接当作 value。 */
        valueKey?: string
        /** items 行中取展示文本的字段名，缺失时回退 name/title/值本身。 */
        labelKey?: string
        /** items 行中取禁用态的字段名。 */
        disabledKey?: string
        /** 虚拟行高（px），须 ≥ 行内容实际高度，默认 36 与 SelectItem 自然高度一致。 */
        itemHeight?: number
        /** 可视窗口上下各多渲染的行数。 */
        overscan?: number
        /** 行数超过该阈值才启用窗口化（含 slot 自动虚拟化路径）。 */
        virtualThreshold?: number
        /** items 为空时的提示文案，不传则只渲染空白。 */
        emptyText?: string
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

/** 按 NodeList 原样回放 VNode 数组，用于渲染窗口化切片（保留原 key，开销远小于挂载全部行组件）。 */
const VNodeList = defineComponent({
    name: "SelectVNodeList",
    props: { nodes: { type: Array as PropType<VNode[]>, default: () => [] } },
    setup(nodeProps) {
        return () => nodeProps.nodes
    },
})

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

/** items 数据驱动模式下 modelValue 对应的展示文本。 */
const itemsSelectedText = computed(() => {
    if (!props.items) {
        return null
    }
    const value = props.modelValue
    if (value === undefined || value === null) {
        return ""
    }
    const found = props.items.find(item => sameValue(resolveItemValue(item), value))
    return found === undefined ? "" : resolveItemLabel(found)
})
const selectedItemText = computed(() => {
    const fromItems = itemsSelectedText.value
    if (fromItems !== null) {
        return fromItems
    }
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

/** items 行取值，原始值直接返回，对象按 valueKey 取值。 */
function resolveItemValue(item: unknown): unknown {
    if (item === null || typeof item !== "object") {
        return item
    }
    const rec = item as Record<string, unknown>
    const key = props.valueKey ?? "value"
    return key in rec ? rec[key] : item
}

/** items 行展示文本，依次回退 labelKey/name/title/值本身。 */
function resolveItemLabel(item: unknown): string {
    if (item === null || typeof item !== "object") {
        return String(item ?? "")
    }
    const rec = item as Record<string, unknown>
    const label = rec[props.labelKey ?? "label"] ?? rec.name ?? rec.title
    if (label !== undefined && label !== null && String(label).trim() !== "") {
        return String(label)
    }
    return String(resolveItemValue(item) ?? "")
}

/** items 行禁用态。 */
function resolveItemDisabled(item: unknown): boolean {
    if (item === null || typeof item !== "object") {
        return false
    }
    return Boolean((item as Record<string, unknown>)[props.disabledKey ?? "disabled"])
}

/** 值相等判定，兼容 number/string 混用。 */
function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true
    }
    if (a === undefined || b === undefined || a === null || b === null) {
        return false
    }
    return String(a) === String(b)
}

/** 行 key 优先用值本身，原始值重复或缺失时回退绝对下标（窗口内稳定）。 */
function itemKey(item: unknown, index: number): string | number {
    const value = resolveItemValue(item)
    if ((typeof value === "string" || typeof value === "number") && value !== "") {
        return value
    }
    return index
}

/**
 * 拍平默认 slot 的顶层节点（Fragment/注释/空白文本不计入）。
 * @param nodes 插槽返回的 VNode 列表
 * @returns 拍平后的顶层节点
 */
function flattenSlotNodes(nodes: VNode[]): VNode[] {
    const flat: VNode[] = []
    for (const node of nodes) {
        if (!node || typeof node !== "object" || !("type" in node)) {
            continue
        }
        if ((node.type as unknown) === (Fragment as unknown)) {
            if (Array.isArray(node.children)) {
                flat.push(...flattenSlotNodes(node.children as VNode[]))
            }
            continue
        }
        if (typeof node.type === "symbol") {
            continue
        }
        flat.push(node)
    }
    return flat
}

/** 仅扁平 SelectItem 列表（每个节点都带 value）才做窗口化，分组/混排结构保持原样渲染。 */
function isItemVNode(node: VNode): boolean {
    if (typeof node.type === "string" || typeof node.type === "symbol") {
        return false
    }
    return !!node.props && "value" in (node.props as Record<string, unknown>)
}

/**
 * slot 自动虚拟化：扁平 SelectItem 超长时只挂载可视窗口。
 * 取舍：窗口外的行不进 reka collection，键盘方向键/typeahead 仅在已挂载窗口内有效，滚轮/触摸/滚动按钮正常。
 */
const flatSlotNodes = computed<VNode[] | null>(() => {
    if (props.items) {
        return null
    }
    void slotSignature.value
    const nodes = flattenSlotNodes(slots.default?.() ?? [])
    if (nodes.length <= (props.virtualThreshold ?? 50)) {
        return null
    }
    return nodes.every(isItemVNode) ? nodes : null
})

const itemHeight = computed(() => props.itemHeight ?? 36)
const overscan = computed(() => props.overscan ?? 5)
/**
 * 视口实测高度：不由我们限高（reka 按可用空间定位、随滚动自动展开，限高会顶死该逻辑），
 * 只读出来算窗口大小，读不到时沿用上次值。
 */
const viewportHeight = ref(300)
const rowCount = computed(() => (props.items ? props.items.length : (flatSlotNodes.value?.length ?? 0)))
const virtualActive = computed(() => rowCount.value > (props.virtualThreshold ?? 50))

const viewportRef = ref<ComponentPublicInstance | null>(null)
const scrollTop = ref(0)
let scrollRaf = 0

const totalHeight = computed(() => rowCount.value * itemHeight.value)
const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / itemHeight.value) - overscan.value))
const windowSize = computed(() => Math.ceil(viewportHeight.value / itemHeight.value) + overscan.value * 2)
const endIndex = computed(() => Math.min(rowCount.value, startIndex.value + windowSize.value))
const offsetY = computed(() => startIndex.value * itemHeight.value)

const visibleItems = computed(() => (props.items ? props.items.slice(startIndex.value, endIndex.value) : []))
const visibleSlotNodes = computed(() => flatSlotNodes.value?.slice(startIndex.value, endIndex.value) ?? [])

/** 取 SelectViewport 真实滚动元素（reka 用 forwardRef 暴露，取 $el 即可）。 */
function viewportEl(): HTMLElement | null {
    const el = (viewportRef.value as unknown as { $el?: unknown } | null)?.$el
    return el instanceof HTMLElement ? el : null
}

/** 读取视口实际高度供窗口计算（含 reka 随滚动展开后的新高度），读不到时沿用上次值。 */
function measureViewport() {
    const el = viewportEl()
    if (el && el.clientHeight > 0) {
        viewportHeight.value = el.clientHeight
    }
}

/** rAF 节流的滚动同步，避免滚动每帧触发多次切片计算。 */
function onViewportScroll(event: Event) {
    if (!virtualActive.value) {
        return
    }
    const el = event.target as HTMLElement | null
    if (!el) {
        return
    }
    if (scrollRaf) {
        cancelAnimationFrame(scrollRaf)
    }
    scrollRaf = requestAnimationFrame(() => {
        measureViewport()
        scrollTop.value = el.scrollTop
    })
}
onBeforeUnmount(() => {
    if (scrollRaf) {
        cancelAnimationFrame(scrollRaf)
    }
})

/** 当前选中值在虚拟列表中的下标，未找到返回 -1。 */
function selectedIndex(): number {
    const value = props.modelValue
    if (value === undefined || value === null) {
        return -1
    }
    if (props.items) {
        return props.items.findIndex(item => sameValue(resolveItemValue(item), value))
    }
    const nodes = flatSlotNodes.value
    if (!nodes) {
        return -1
    }
    return nodes.findIndex(node => sameValue((node.props as Record<string, unknown> | null)?.value, value))
}

/** 选中行居中所需的 scrollTop。 */
function centerTarget(index: number): number {
    return Math.max(0, index * itemHeight.value - viewportHeight.value / 2 + itemHeight.value / 2)
}

/** 打开时把选中行滚到视口中央，窗口计算先行、DOM 滚动随后补齐。 */
function scrollToIndex(index: number) {
    if (index < 0 || !virtualActive.value) {
        return
    }
    const target = centerTarget(index)
    scrollTop.value = target
    nextTick(() => {
        const el = viewportEl()
        if (el) {
            el.scrollTop = target
        } else {
            requestAnimationFrame(() => {
                const retryEl = viewportEl()
                if (retryEl) {
                    retryEl.scrollTop = target
                }
            })
        }
    })
}

/** items 整体替换（如异步加载完成）时回到顶部，避免停留在越界滚动位置。 */
watch(
    () => props.items,
    () => {
        scrollTop.value = 0
        nextTick(() => {
            measureViewport()
            const el = viewportEl()
            if (el) {
                el.scrollTop = 0
            }
        })
    }
)

/** 拦截 open 事件做选中行定位后手动透出，保持父级 @update:open 可用。 */
function handleOpenChange(open: boolean) {
    emits("update:open", open)
    if (!open || !virtualActive.value) {
        return
    }
    scrollToIndex(selectedIndex())
    nextTick(() => {
        requestAnimationFrame(() => {
            if (!virtualActive.value) {
                return
            }
            measureViewport()
            scrollToIndex(selectedIndex())
        })
    })
}

defineExpose({
    /** 把指定下标滚动到视口中央（仅虚拟激活时有效）。 */
    scrollToIndex,
    /** 按值定位并滚动到视口中央（找不到时无动作）。 */
    scrollToValue: (value: unknown) => {
        if (!props.items) {
            return
        }
        scrollToIndex(props.items.findIndex(item => sameValue(resolveItemValue(item), value)))
    },
})

const forward = useForwardPropsEmits(props, emits)

/**
 * 按变体计算触发器样式。
 * ghost：透明无边框紧凑触发器；chip：自带胶囊底色；default：无内置外观（依赖 $attrs 传入的下划线输入框配方）。
 */
const triggerVariantClass = computed(() => {
    switch (props.variant) {
        case "ghost":
            return "bg-transparent border-none outline-hidden text-sm appearance-none cursor-pointer min-w-20"
        case "chip":
            return "bg-base-content/5 hover:bg-base-content/10 backdrop-blur-xs px-2 py-1.5 rounded-xs border border-base-content/5 text-xs appearance-none cursor-pointer min-w-20"
        default:
            return "transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    }
})

/** 按变体调整箭头大小与透明度（ghost/chip 更紧凑低调）。 */
const chevronClass = computed(() => (props.variant === "default" ? "size-4 opacity-60" : "size-3.5 opacity-40"))
</script>

<template>
    <SelectRoot :key="selectRootKey" v-bind="forward" @update:open="handleOpenChange">
        <slot name="trigger">
            <SelectTrigger
                :class="['select-trigger inline-flex items-center justify-between gap-1.5', triggerVariantClass]"
                v-bind="$attrs"
            >
                <SelectValue :placeholder="placeholder" class="min-w-0 truncate data-placeholder:text-base-content/40">
                    {{ selectedItemText }}
                </SelectValue>
                <Icon v-if="!hidebtn" icon="radix-icons:chevron-down" :class="['select-chevron ml-auto shrink-0', chevronClass]" />
            </SelectTrigger>
        </slot>

        <SelectPortal>
            <SelectContent
                v-bind="contentProps"
                class="select-content z-10000 overflow-hidden bg-base-100 border border-base-content/20 border-t-2 border-t-primary rounded-btn shadow-xl shadow-base-content/15 animate-slideDownAndFade"
                :class="contentClass"
            >
                <SelectScrollUpButton
                    class="select-scroll flex items-center justify-center h-4 cursor-default text-base-content/50 hover:text-base-content transition-colors"
                >
                    <Icon icon="radix-icons:chevron-up" />
                </SelectScrollUpButton>

                <SelectViewport
                    ref="viewportRef"
                    :class="['relative p-2', virtualActive ? 'select-virtual-viewport' : 'space-y-1']"
                    @scroll="onViewportScroll"
                >
                    <template v-if="props.items">
                        <div
                            v-if="props.items.length === 0"
                            class="flex items-center justify-center px-3 py-8 text-sm text-base-content/40"
                        >
                            <slot name="empty">{{ emptyText }}</slot>
                        </div>
                        <div v-else-if="virtualActive" :style="{ height: `${totalHeight}px`, position: 'relative' }">
                            <div
                                :style="{
                                    position: 'absolute',
                                    top: '0',
                                    left: '0',
                                    right: '0',
                                    transform: `translateY(${offsetY}px)`,
                                }"
                            >
                                <div
                                    v-for="(item, i) in visibleItems"
                                    :key="itemKey(item, startIndex + i)"
                                    :style="{ height: `${itemHeight}px` }"
                                    class="flex flex-col justify-center overflow-hidden"
                                >
                                    <VirtualRowItem
                                        :value="resolveItemValue(item)"
                                        :disabled="resolveItemDisabled(item)"
                                        class="h-full w-full shrink-0"
                                    >
                                        <slot name="item" :item="item" :index="startIndex + i">
                                            {{ resolveItemLabel(item) }}
                                        </slot>
                                    </VirtualRowItem>
                                </div>
                            </div>
                        </div>
                        <template v-else>
                            <VirtualRowItem
                                v-for="(item, index) in props.items"
                                :key="itemKey(item, index)"
                                :value="resolveItemValue(item)"
                                :disabled="resolveItemDisabled(item)"
                            >
                                <slot name="item" :item="item" :index="index">{{ resolveItemLabel(item) }}</slot>
                            </VirtualRowItem>
                        </template>
                    </template>
                    <template v-else-if="virtualActive && flatSlotNodes">
                        <div :style="{ height: `${totalHeight}px`, position: 'relative' }">
                            <div
                                :style="{
                                    position: 'absolute',
                                    top: '0',
                                    left: '0',
                                    right: '0',
                                    transform: `translateY(${offsetY}px)`,
                                }"
                            >
                                <div
                                    v-for="(node, i) in visibleSlotNodes"
                                    :key="node.key ?? startIndex + i"
                                    :style="{ height: `${itemHeight}px` }"
                                    class="flex flex-col justify-center overflow-hidden"
                                >
                                    <VNodeList :nodes="[node]" />
                                </div>
                            </div>
                        </div>
                    </template>
                    <slot v-else />
                </SelectViewport>

                <SelectScrollDownButton
                    class="select-scroll flex items-center justify-center h-4 cursor-default text-base-content/50 hover:text-base-content transition-colors"
                >
                    <Icon icon="radix-icons:chevron-down" />
                </SelectScrollDownButton>
            </SelectContent>
        </SelectPortal>
    </SelectRoot>
</template>

<style scoped>
.select-trigger[data-state="open"] .select-chevron {
    transform: rotate(180deg);
}

.select-chevron {
    transition: transform 0.2s ease;
}

.select-content {
    position: relative;
}

.select-content::before {
    content: "";
    pointer-events: none;
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 5%, transparent) 1px, transparent 1px),
        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 5%, transparent) 1px, transparent 1px);
    background-size: 24px 24px;
    mask-image: linear-gradient(to bottom, black, transparent 92%);
}

/* 虚拟模式下恢复可见滚动条（reka 默认隐藏，长列表需可拖拽定位）。 */
.select-virtual-viewport {
    scrollbar-width: thin !important;
    scrollbar-color: color-mix(in oklab, var(--color-base-content) 25%, transparent) transparent !important;
}

.select-virtual-viewport::-webkit-scrollbar {
    display: block !important;
    width: 8px !important;
}

.select-virtual-viewport::-webkit-scrollbar-thumb {
    background: color-mix(in oklab, var(--color-base-content) 25%, transparent);
    border-radius: 9999px;
}

.select-virtual-viewport::-webkit-scrollbar-track {
    background: transparent;
}
</style>
