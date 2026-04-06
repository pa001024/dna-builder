<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

const model = defineModel<string | number>()
const props = defineProps<{
    tabs: { label: string; value: string | number }[]
}>()

const rootRef = ref<HTMLElement | null>(null)
const tabRefs = new Map<string | number, HTMLButtonElement>()
const indicatorLeft = ref(0)
const indicatorWidth = ref(0)
const indicatorReady = ref(false)

/** 记录每个标签按钮的 DOM，供下划线测量定位。 */
function setTabRef(value: string | number, el: HTMLButtonElement | null) {
    if (el) {
        tabRefs.set(value, el)
        return
    }

    tabRefs.delete(value)
}

/** 根据当前激活项计算下划线的位置和宽度。 */
function updateIndicator() {
    const root = rootRef.value
    if (!root || props.tabs.length === 0) return

    const activeValue = model.value ?? props.tabs[0].value
    const activeTab = tabRefs.get(activeValue) ?? tabRefs.get(props.tabs[0].value)
    if (!activeTab) return

    const rootRect = root.getBoundingClientRect()
    const tabRect = activeTab.getBoundingClientRect()

    indicatorLeft.value = tabRect.left - rootRect.left
    indicatorWidth.value = tabRect.width
    indicatorReady.value = true
}

let resizeObserver: ResizeObserver | null = null

watch(
    () => [model.value, props.tabs],
    async () => {
        await nextTick()
        updateIndicator()
    },
    { immediate: true }
)

onMounted(() => {
    updateIndicator()

    if (typeof ResizeObserver === "undefined") return

    resizeObserver = new ResizeObserver(() => {
        updateIndicator()
    })

    if (rootRef.value) {
        resizeObserver.observe(rootRef.value)
    }
})

onBeforeUnmount(() => {
    resizeObserver?.disconnect()
})
</script>

<template>
    <ScrollArea :horizontal="true" :vertical="false">
        <div ref="rootRef" class="relative inline-flex min-w-max items-end gap-1 text-sm">
            <button
                v-for="tab in tabs"
                :key="tab.value"
                :ref="el => setTabRef(tab.value, el as HTMLButtonElement | null)"
                type="button"
                class="min-w-20 px-3 py-2 text-base-content/70 transition-colors duration-300 rounded-t cursor-pointer hover:bg-base-300/50 backdrop-blur-md"
                :class="{ 'text-base-content! font-medium': model === tab.value }"
                @click="model = tab.value"
            >
                {{ tab.label }}
            </button>
            <span class="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-base-content/50" />
            <span
                class="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-primary transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                :class="indicatorReady ? 'opacity-100' : 'opacity-0'"
                :style="{
                    width: `${indicatorWidth}px`,
                    transform: `translateX(${indicatorLeft}px)`,
                }"
            />
        </div>
    </ScrollArea>
</template>
