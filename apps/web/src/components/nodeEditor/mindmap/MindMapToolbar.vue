<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import type { MindMapLayoutMeta } from "@/utils/mindMap"
import { MIND_MAP_COLORS } from "@/utils/mindMap"

const props = defineProps<{
    layout?: string
    nodeCount: number
    layouts: MindMapLayoutMeta[]
}>()

const emit = defineEmits<{
    (e: "change-layout", kind: string): void
    (e: "add-child"): void
    (e: "add-sibling"): void
    (e: "font-size", delta: number): void
    (e: "color", color: string | undefined): void
    (e: "toggle-focus"): void
}>()

/** 浮层锚点：布局菜单与色板都渲染到 body，避免被节点裁剪或压在别的节点下面 */
const layoutAnchor = ref<HTMLElement | null>(null)
const paletteAnchor = ref<HTMLElement | null>(null)
/** 浮层本体：Teleport 到 body 后不在锚点的父元素内，判定外部点击时必须单独算进来 */
const layoutPanel = ref<HTMLElement | null>(null)
const palettePanel = ref<HTMLElement | null>(null)
const layoutOpen = ref(false)
const paletteOpen = ref(false)

const currentLabel = computed(() => props.layouts.find(item => item.kind === props.layout)?.label ?? "思维导图")

/** 以锚点按钮的屏幕位置定位浮层 */
const layoutPosition = computed(() => {
    const rect = layoutAnchor.value?.getBoundingClientRect()
    return rect ? { left: `${rect.left}px`, top: `${rect.bottom + 2}px` } : { left: "0px", top: "0px" }
})

const palettePosition = computed(() => {
    const rect = paletteAnchor.value?.getBoundingClientRect()
    return rect ? { left: `${rect.right - 120}px`, top: `${rect.bottom + 2}px` } : { left: "0px", top: "0px" }
})

function toggleLayout() {
    paletteOpen.value = false
    layoutOpen.value = !layoutOpen.value
}

function togglePalette() {
    layoutOpen.value = false
    paletteOpen.value = !paletteOpen.value
}

/** 点击浮层外关闭（捕获阶段；浮层与锚点都算内部，否则 pointerdown 会抢在 click 前把菜单卸掉） */
function handleOutside(event: PointerEvent) {
    const target = event.target as Node | null
    if (!target) return
    const insideLayout = Boolean(layoutAnchor.value?.contains(target) || layoutPanel.value?.contains(target))
    const insidePalette = Boolean(paletteAnchor.value?.contains(target) || palettePanel.value?.contains(target))
    if (layoutOpen.value && !insideLayout) layoutOpen.value = false
    if (paletteOpen.value && !insidePalette) paletteOpen.value = false
}

watch([layoutOpen, paletteOpen], ([layout, palette]) => {
    if (layout || palette) window.addEventListener("pointerdown", handleOutside, true)
    else window.removeEventListener("pointerdown", handleOutside, true)
})

onBeforeUnmount(() => window.removeEventListener("pointerdown", handleOutside, true))
</script>

<template>
    <!-- 标题栏即拖动把手：拖它移动整个导图节点；按钮各自标 nodrag 以免误触 -->
    <div class="flex h-8 cursor-grab items-center gap-1 overflow-hidden border-b border-base-content/10 px-2 active:cursor-grabbing">
        <Icon icon="ri:node-tree" class="size-3.5 shrink-0 text-base-content/55" title="思维导图" />
        <span class="shrink-0 font-mono text-[10px] text-base-content/35">{{ props.nodeCount }}</span>

        <button
            ref="layoutAnchor"
            type="button"
            class="nodrag ml-0.5 flex h-5 max-w-24 shrink-0 cursor-pointer items-center gap-0.5 border border-base-content/15 px-1 text-[10px] text-base-content/65 transition-colors duration-150 hover:border-primary/40 hover:text-primary"
            title="切换布局"
            @click.stop="toggleLayout"
        >
            <span class="min-w-0 truncate">{{ currentLabel }}</span>
            <Icon icon="radix-icons:chevron-down" class="size-3 shrink-0" />
        </button>

        <div class="ml-auto flex shrink-0 items-center gap-0.5">
            <button type="button" class="tool-btn nodrag" title="添加子主题 (Tab)" @click="emit('add-child')">
                <Icon icon="ri:add-line" class="size-3" />
            </button>
            <button type="button" class="tool-btn nodrag" title="添加同级主题 (Enter)" @click="emit('add-sibling')">
                <Icon icon="ri:file-add-line" class="size-3" />
            </button>
            <button type="button" class="tool-btn nodrag" title="减小字号" @click="emit('font-size', -2)">
                <span class="flex items-baseline leading-none"><span class="text-[9px] font-semibold">A</span><span class="ml-px text-[10px]">−</span></span>
            </button>
            <button type="button" class="tool-btn nodrag" title="增大字号" @click="emit('font-size', 2)">
                <span class="flex items-baseline leading-none"><span class="text-[13px] font-semibold">A</span><span class="ml-px text-[10px]">+</span></span>
            </button>
            <button ref="paletteAnchor" type="button" class="tool-btn nodrag" title="分支色" @click.stop="togglePalette">
                <Icon icon="ri:palette-line" class="size-3" />
            </button>
            <button type="button" class="tool-btn nodrag" title="沉浸查看（隐藏其它控件）" @click="emit('toggle-focus')">
                <Icon icon="ri:fullscreen-line" class="size-3" />
            </button>
        </div>

        <Teleport to="body">
            <div
                v-if="layoutOpen"
                ref="layoutPanel"
                data-mind-map-popover
                class="fixed z-100 w-44 border border-base-content/10 bg-base-100 py-1 shadow-lg"
                :style="layoutPosition"
                @pointerdown.stop
                @click.stop
            >
                <button
                    v-for="item in layouts"
                    :key="item.kind"
                    type="button"
                    class="flex w-full cursor-pointer items-center gap-1.5 px-2 py-1 text-left text-[11px] transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
                    :class="item.kind === props.layout ? 'text-primary' : 'text-base-content/75'"
                    :title="item.description"
                    @click="emit('change-layout', item.kind); layoutOpen = false"
                >
                    <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                    <Icon v-if="item.kind === props.layout" icon="radix-icons:check" class="size-3 shrink-0" />
                </button>
            </div>

            <div
                v-if="paletteOpen"
                ref="palettePanel"
                data-mind-map-popover
                class="fixed z-100 flex w-30 flex-wrap gap-1 border border-base-content/10 bg-base-100 p-1.5 shadow-lg"
                :style="palettePosition"
                @pointerdown.stop
                @click.stop
            >
                <button
                    v-for="color in MIND_MAP_COLORS"
                    :key="color"
                    type="button"
                    class="size-4 cursor-pointer rounded-full border border-base-content/20 transition-transform duration-150 hover:scale-110"
                    :style="{ background: color }"
                    :title="color"
                    @click="emit('color', color); paletteOpen = false"
                />
                <button
                    type="button"
                    class="size-4 cursor-pointer rounded-full border border-base-content/20 bg-base-100 text-[9px]"
                    title="恢复继承"
                    @click="emit('color', undefined); paletteOpen = false"
                >
                    ×
                </button>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.tool-btn {
    display: grid;
    place-items: center;
    width: 1.25rem;
    height: 1.25rem;
    cursor: pointer;
    color: color-mix(in srgb, var(--color-base-content) 55%, transparent);
    transition: color 150ms;
}
.tool-btn:hover {
    color: var(--color-primary);
}
</style>
