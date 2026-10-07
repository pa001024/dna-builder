<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"

interface ReaderItem {
    label: string
    value: string | number
}

const props = withDefaults(
    defineProps<{
        title: string
        subtitle?: string
        items?: ReaderItem[]
    }>(),
    {
        subtitle: "",
        items: () => [],
    }
)

const open = defineModel<boolean>({ default: false })
const activeItem = defineModel<string | number>("active")

const { t } = useTranslation()

const MIN_FONT_SCALE = 0.85
const MAX_FONT_SCALE = 1.6
const FONT_SCALE_STEP = 0.1
const BASE_FONT_SIZE = 18
const FONT_SCALE_KEY = "reader_font_scale"

const fontScale = useLocalStorage(FONT_SCALE_KEY, 1)

const hasItems = computed(() => props.items.length > 1)
const activeIndex = computed(() => props.items.findIndex(item => item.value === activeItem.value))
const canGoPrev = computed(() => activeIndex.value > 0)
const canGoNext = computed(() => activeIndex.value >= 0 && activeIndex.value < props.items.length - 1)
const canShrink = computed(() => fontScale.value > MIN_FONT_SCALE + 1e-6)
const canGrow = computed(() => fontScale.value < MAX_FONT_SCALE - 1e-6)
const fontPercent = computed(() => `${Math.round(fontScale.value * 100)}%`)

const bodyStyle = computed(() => ({
    fontSize: `${(BASE_FONT_SIZE * fontScale.value).toFixed(2)}px`,
    lineHeight: "1.95",
}))

function shrinkFont(): void {
    if (!canShrink.value) return
    fontScale.value = Math.round((fontScale.value - FONT_SCALE_STEP) * 100) / 100
}

function growFont(): void {
    if (!canGrow.value) return
    fontScale.value = Math.round((fontScale.value + FONT_SCALE_STEP) * 100) / 100
}

/** 滚动容器（阅读正文本体），翻页后需回到顶部 */
const scroller = ref<HTMLElement | null>(null)

/**
 * 翻页（activeItem 变化）后把滚动容器重置到顶部，
 * 否则新一页会沿用上一页的滚动位置导致空白/错位。
 */
watch(activeItem, async () => {
    await nextTick()
    if (scroller.value) {
        scroller.value.scrollTop = 0
    }
})

function goItem(step: number): void {
    const next = props.items[activeIndex.value + step]
    if (next) {
        activeItem.value = next.value
    }
}

function close(): void {
    open.value = false
}

let lockedOverflow: string | null = null

function lockScroll(): void {
    if (lockedOverflow !== null) return
    lockedOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
}

function unlockScroll(): void {
    if (lockedOverflow === null) return
    document.body.style.overflow = lockedOverflow
    lockedOverflow = null
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
        event.preventDefault()
        close()
        return
    }
    if (event.key === "ArrowLeft") {
        goItem(-1)
        return
    }
    if (event.key === "ArrowRight") {
        goItem(1)
        return
    }
    if (event.key === "+" || event.key === "=") {
        growFont()
        return
    }
    if (event.key === "-" || event.key === "_") {
        shrinkFont()
    }
}

watch(open, value => {
    if (value) {
        lockScroll()
        window.addEventListener("keydown", onKeydown)
        return
    }

    unlockScroll()
    window.removeEventListener("keydown", onKeydown)
})

onBeforeUnmount(() => {
    unlockScroll()
    window.removeEventListener("keydown", onKeydown)
})
</script>

<template>
    <Teleport to="body">
        <Transition name="reader">
            <div
                v-if="open"
                ref="scroller"
                data-reader-overlay
                class="fixed inset-0 z-9999 overflow-y-auto overscroll-contain bg-base-100 text-base-content"
            >
                <header class="sticky top-0 z-10 border-b border-base-content/10 bg-base-100/85 backdrop-blur-md">
                    <div class="mx-auto flex h-12 max-w-2xl items-center gap-3 px-4 sm:px-6">
                        <button
                            type="button"
                            class="inline-flex h-7 shrink-0 items-center gap-1 rounded-xs border border-base-content/15 px-2 text-[11px] font-medium text-base-content/60 transition-colors duration-150 hover:border-base-content/30 hover:text-base-content"
                            @click="close"
                        >
                            <span aria-hidden="true">✕</span>
                            {{ t("reader.exit") }}
                        </button>
                        <div class="min-w-0 flex-1 truncate text-[11px] tracking-wide text-base-content/45">{{ title }}</div>
                        <div class="flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                class="inline-flex h-7 w-7 items-center justify-center rounded-xs border border-base-content/15 text-[11px] font-semibold text-base-content/60 transition-colors duration-150 hover:border-base-content/30 hover:text-base-content disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-base-content/15 disabled:hover:text-base-content/60"
                                :disabled="!canShrink"
                                :aria-label="t('reader.fontSmaller')"
                                @click="shrinkFont"
                            >
                                A−
                            </button>
                            <span class="w-10 text-center font-orbitron text-[11px] tabular-nums text-base-content/55">{{ fontPercent }}</span>
                            <button
                                type="button"
                                class="inline-flex h-7 w-7 items-center justify-center rounded-xs border border-base-content/15 text-[11px] font-semibold text-base-content/60 transition-colors duration-150 hover:border-base-content/30 hover:text-base-content disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-base-content/15 disabled:hover:text-base-content/60"
                                :disabled="!canGrow"
                                :aria-label="t('reader.fontLarger')"
                                @click="growFont"
                            >
                                A+
                            </button>
                        </div>
                    </div>
                </header>

                <article class="mx-auto max-w-2xl px-4 pt-10 pb-32 sm:px-6">
                    <h1 class="font-orbitron text-xl leading-tight font-bold tracking-tight sm:text-2xl">{{ title }}</h1>
                    <p v-if="subtitle" class="mt-2 text-xs text-base-content/50">{{ subtitle }}</p>
                    <div class="mt-8 text-base-content/85" :style="bodyStyle">
                        <slot />
                    </div>
                </article>

                <footer
                    v-if="hasItems"
                    class="fixed inset-x-0 bottom-0 z-10 border-t border-base-content/10 bg-base-100/85 backdrop-blur-md"
                >
                    <div class="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4 sm:px-6">
                        <button
                            type="button"
                            class="inline-flex h-8 items-center rounded-xs border border-base-content/15 px-3 text-[11px] font-medium text-base-content/60 transition-colors duration-150 hover:border-base-content/30 hover:text-base-content disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-base-content/15 disabled:hover:text-base-content/60"
                            :disabled="!canGoPrev"
                            @click="goItem(-1)"
                        >
                            {{ t("reader.prev") }}
                        </button>
                        <span class="font-orbitron text-[11px] tabular-nums text-base-content/45">
                            {{ activeIndex + 1 }} / {{ items.length }}
                        </span>
                        <button
                            type="button"
                            class="inline-flex h-8 items-center rounded-xs border border-base-content/15 px-3 text-[11px] font-medium text-base-content/60 transition-colors duration-150 hover:border-base-content/30 hover:text-base-content disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-base-content/15 disabled:hover:text-base-content/60"
                            :disabled="!canGoNext"
                            @click="goItem(1)"
                        >
                            {{ t("reader.next") }}
                        </button>
                    </div>
                </footer>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.reader-enter-active,
.reader-leave-active {
    transition: opacity 0.22s ease;
}

.reader-enter-from,
.reader-leave-to {
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .reader-enter-active,
    .reader-leave-active {
        transition: none;
    }
}
</style>
