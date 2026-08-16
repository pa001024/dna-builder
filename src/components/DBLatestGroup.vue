<script lang="ts" setup>
import { type ComponentPublicInstance, computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { type DBLatestItem } from "./DBLatestItemCard.vue"

const props = defineProps<{
    label: string
    version: string
    entries: DBLatestItem[]
}>()

/** 视口宽度断点 → 每行列数（卡片等比例缩小，列数较常规翻倍） */
const COLS_BREAKPOINTS: { minWidth: number; cols: number }[] = [
    { minWidth: 1280, cols: 12 },
    { minWidth: 1024, cols: 8 },
    { minWidth: 640, cols: 6 },
    { minWidth: 0, cols: 4 },
]

/** 堆叠错位：每层位移 3px，最多 2 层（共 6px），之后各层重叠在同一位置 */
const STACK_STEP = 3
const STACK_MAX_OFFSET = 6

const groupEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const stackEl = ref<HTMLElement | null>(null)
const layerEls = ref<(HTMLElement | null)[]>([])

const cols = ref(2)
const isExpanded = ref(false)
const canHover = ref(false)
const prefersReduced = ref(false)
const animating = ref(false)
const parallax = ref({ x: 0, y: 0 })

let animationTimer: number | undefined
let rafId: number | undefined
/** 动画序号：每次发起新动作自增，使过期的 async 动画流程失效 */
let motionSeq = 0

/** 收起态网格展示的卡片数（第一行） */
const visibleCount = computed(() => Math.min(props.entries.length, cols.value))

/** 收起态网格渲染的第一行卡片 */
const firstRowEntries = computed(() => props.entries.slice(0, visibleCount.value))

/** 超出第一行、被收纳为堆叠的卡片 */
const stackedEntries = computed(() => props.entries.slice(visibleCount.value))

/** 是否存在堆叠（条目数超过一行） */
const hasStack = computed(() => stackedEntries.value.length > 0)

/** 网格渲染的条目：展开态渲染全部，收起态只渲染第一行 */
const gridEntries = computed(() => (isExpanded.value ? props.entries : firstRowEntries.value))

/** 网格条目 key */
function entryKey(entry: DBLatestItem) {
    return `${entry.kind}-${entry.item.id}`
}

/**
 * 计算视口宽度对应的每行列数。
 */
function updateCols() {
    const width = window.innerWidth
    cols.value = COLS_BREAKPOINTS.find(bp => width >= bp.minWidth)?.cols || 2
}

/**
 * 将堆叠容器锚定到第一行最后一张卡片的位置，并同步其尺寸。
 */
function positionStack() {
    if (!stackEl.value || !gridEl.value || !groupEl.value || !visibleCount.value) {
        return
    }

    const anchor = gridEl.value.querySelectorAll("li")[visibleCount.value - 1] as HTMLElement | undefined
    if (!anchor) {
        return
    }

    const anchorRect = anchor.getBoundingClientRect()
    const groupRect = groupEl.value.getBoundingClientRect()
    stackEl.value.style.left = `${anchorRect.left - groupRect.left}px`
    stackEl.value.style.top = `${anchorRect.top - groupRect.top}px`
    stackEl.value.style.width = `${anchorRect.width}px`
    stackEl.value.style.height = `${anchorRect.height}px`
}

/**
 * 生成堆叠层的基础变换：错位封顶 2 层（每层 3px，最多 6px，之后重叠），
 * 并叠加鼠标视差偏移。卡片本身已紧凑化，堆叠层不再额外缩放。
 * @param index 堆叠层序号（0 为最底层）
 * @returns transform 值
 */
function stackLayerTransform(index: number) {
    const offset = Math.min(index * STACK_STEP, STACK_MAX_OFFSET)
    const px = parallax.value.x * (index + 1) * 2
    const py = parallax.value.y * (index + 1) * 1.2
    return `translate(${offset + px}px, ${offset + py}px)`
}

/**
 * 记录堆叠层元素引用，供 FLIP 动画测量。
 * @param el 层元素（模板 ref 回调可能传入组件实例，统一按元素处理）
 * @param index 层序号
 */
function setLayer(el: Element | ComponentPublicInstance | null, index: number) {
    layerEls.value[index] = el as HTMLElement | null
}

/**
 * 取消进行中的展开/收起动画（含 Web Animations API 动画）。
 */
function cancelAnimation() {
    if (animationTimer !== undefined) {
        window.clearTimeout(animationTimer)
        animationTimer = undefined
    }
    if (gridEl.value) {
        gridEl.value.querySelectorAll("li, .db-stack-layer").forEach(el => {
            el.getAnimations().forEach(animation => animation.cancel())
        })
    }
    animating.value = false
}

/**
 * 等待两帧渲染，确保切换后的布局与样式已稳定（避免 FLIP 起点测量失真）。
 */
function waitTwoFrames(): Promise<void> {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
}

/**
 * 播放单个元素的组动画：WAAPI 优先，动画结束即取消（清除 fill 残留），
 * 不支持 WAAPI 时回退为 CSS 过渡。
 * @param el 目标元素
 * @param frames 关键帧
 * @param duration 时长（ms）
 * @param delay 延迟（ms）
 * @param easing 缓动函数
 * @param cleanup 动画结束后的清理回调
 */
function playMotion(el: HTMLElement, frames: Keyframe[], duration: number, delay: number, easing: string, cleanup?: () => void) {
    if (typeof el.animate === "function") {
        const animation = el.animate(frames, { duration, delay, easing, fill: "both" })
        animation.onfinish = () => {
            animation.cancel()
            cleanup?.()
        }
        return
    }

    // 回退：CSS 过渡（仅 transform 简单过渡）
    const from = (frames[0]?.transform as string | undefined) || "none"
    const to = (frames.at(-1)?.transform as string | undefined) || "none"
    el.style.transition = "none"
    el.style.transform = from
    void el.offsetWidth
    el.style.transition = `transform ${duration}ms ${easing} ${delay}ms`
    el.style.transform = to
    window.setTimeout(() => {
        el.style.transition = ""
        el.style.transform = ""
        cleanup?.()
    }, duration + delay)
}

/**
 * 展开组动画：第一行卡片依次弹开归位，堆叠卡片从堆位置错峰飞入网格位。
 * 系统开启“减少动态效果”时退化为纯淡入，但保留过渡感。
 */
async function expand() {
    if (isExpanded.value || !hasStack.value) {
        return
    }
    cancelAnimation()
    const seq = ++motionSeq

    const fromRects = layerEls.value.filter(Boolean).map(el => el!.getBoundingClientRect())

    isExpanded.value = true
    await nextTick()
    await waitTwoFrames()

    // 期间若已发起收起等新动作，放弃本次动画
    if (seq !== motionSeq) {
        return
    }

    const cards = gridEl.value ? Array.from(gridEl.value.querySelectorAll<HTMLElement>("li")) : []
    if (!cards.length) {
        return
    }

    animating.value = true
    const duration = prefersReduced.value ? 240 : 460
    const spring = prefersReduced.value ? "linear" : "cubic-bezier(0.34, 1.35, 0.64, 1)"
    const delayStep = prefersReduced.value ? 0 : 20

    // 减少动态效果：整组仅淡入
    if (prefersReduced.value) {
        cards.forEach(card => {
            playMotion(card, [{ opacity: 0 }, { opacity: 1 }], duration, 0, "linear")
        })
        animationTimer = window.setTimeout(() => {
            animating.value = false
        }, duration + 50)
        return
    }

    // 组动画第一部：第一行卡片依次“弹开”归位
    cards.slice(0, visibleCount.value).forEach((card, i) => {
        playMotion(
            card,
            [
                { transform: "scale(0.94)", opacity: 0.6 },
                { transform: "scale(1)", opacity: 1 },
            ],
            duration * 0.72,
            i * delayStep * 0.8,
            spring
        )
    })

    // 组动画第二部：堆叠卡片从各自的堆位置依次飞回网格位
    cards.slice(visibleCount.value).forEach((card, i) => {
        const from = fromRects[i]
        const to = card.getBoundingClientRect()
        if (!from) {
            return
        }
        const dx = from.left - to.left
        const dy = from.top - to.top
        card.style.zIndex = "20"
        playMotion(
            card,
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
            duration,
            i * delayStep,
            spring,
            () => {
                card.style.zIndex = ""
            }
        )
    })

    animationTimer = window.setTimeout(
        () => {
            animating.value = false
        },
        duration + cards.length * delayStep
    )
}

/**
 * 收起组动画：第一行卡片依次轻微收拢，堆叠卡片逐张飞回堆位置。
 * 系统开启“减少动态效果”时退化为纯淡入。
 */
async function collapse() {
    if (!isExpanded.value) {
        return
    }
    cancelAnimation()
    const seq = ++motionSeq

    const gridRects = Array.from(gridEl.value?.querySelectorAll<HTMLElement>("[data-stack-index]") || []).map(el =>
        el.getBoundingClientRect()
    )

    isExpanded.value = false
    await nextTick()
    await waitTwoFrames()

    // 期间若已发起展开等新动作，放弃本次动画
    if (seq !== motionSeq) {
        return
    }

    const layers = layerEls.value.filter(Boolean) as HTMLElement[]
    if (!layers.length) {
        return
    }

    animating.value = true
    positionStack()
    const duration = prefersReduced.value ? 240 : 420
    const ease = prefersReduced.value ? "linear" : "cubic-bezier(0.3, 0.85, 0.35, 1)"
    const delayStep = prefersReduced.value ? 0 : 18

    // 减少动态效果：堆叠层仅淡入
    if (prefersReduced.value) {
        layers.forEach(layer => {
            playMotion(layer, [{ opacity: 0 }, { opacity: 1 }], duration, 0, "linear")
        })
        animationTimer = window.setTimeout(() => {
            animating.value = false
        }, duration + 50)
        return
    }

    // 组动画第一部：第一行卡片依次轻微收拢
    const firstRow = gridEl.value ? Array.from(gridEl.value.querySelectorAll<HTMLElement>("li")) : []
    firstRow.forEach((card, i) => {
        playMotion(
            card,
            [
                { transform: "scale(1)", opacity: 1 },
                { transform: "scale(0.965)", opacity: 0.75 },
            ],
            duration * 0.6,
            i * 10,
            ease
        )
    })

    // 组动画第二部：堆叠卡片从各自网格位依次飞回堆位置（上层先叠）
    layers.forEach((layer, i) => {
        const gridRect = gridRects[i]
        const stackRect = layer.getBoundingClientRect()
        if (!gridRect) {
            return
        }
        playMotion(
            layer,
            [
                { transform: `translate(${gridRect.left - stackRect.left}px, ${gridRect.top - stackRect.top}px)` },
                { transform: stackLayerTransform(i) },
            ],
            duration,
            (layers.length - 1 - i) * delayStep,
            ease
        )
    })

    animationTimer = window.setTimeout(
        () => {
            animating.value = false
        },
        duration + layers.length * delayStep
    )
}

/**
 * 移动端展开/收起按钮。
 */
function toggle() {
    if (isExpanded.value) {
        void collapse()
    } else {
        void expand()
    }
}

/**
 * web 端：鼠标进入分组时展开。
 */
function onGroupMouseEnter() {
    if (canHover.value && hasStack.value) {
        void expand()
    }
}

/**
 * web 端：鼠标离开分组时收起。
 */
function onGroupMouseLeave() {
    parallax.value = { x: 0, y: 0 }
    if (canHover.value && isExpanded.value) {
        void collapse()
    }
}

/**
 * web 端：堆叠态下鼠标移动产生视差（rAF 节流，不同层深度不同）。
 * @param event 鼠标事件
 */
function onGroupMouseMove(event: MouseEvent) {
    if (!canHover.value || isExpanded.value || animating.value || !groupEl.value || rafId !== undefined) {
        return
    }

    const rect = groupEl.value.getBoundingClientRect()
    const target = {
        x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
        y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    }

    rafId = requestAnimationFrame(() => {
        rafId = undefined
        parallax.value = {
            x: Math.max(-1, Math.min(1, target.x)),
            y: Math.max(-1, Math.min(1, target.y)),
        }
    })
}

/**
 * 窗口尺寸变化：重算列数并重新锚定堆叠容器。
 */
function handleResize() {
    updateCols()
    parallax.value = { x: 0, y: 0 }
    nextTick(() => {
        if (!isExpanded.value && hasStack.value) {
            positionStack()
        }
    })
}

watch([cols, () => hasStack.value], () => {
    nextTick(() => {
        if (!isExpanded.value && hasStack.value) {
            positionStack()
        }
    })
})

/**
 * 订阅媒体查询变化（兼容新旧 MediaQueryList API）。
 * @param mql 媒体查询对象
 * @param handler 变化回调
 */
function listenMediaQuery(mql: MediaQueryList, handler: (event: MediaQueryListEvent) => void) {
    if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", handler)
    } else {
        mql.addListener(handler)
    }
}

onMounted(() => {
    updateCols()

    const hoverMq = window.matchMedia("(hover: hover) and (pointer: fine)")
    canHover.value = hoverMq.matches
    listenMediaQuery(hoverMq, event => {
        canHover.value = event.matches
    })

    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)")
    prefersReduced.value = reducedMq.matches
    listenMediaQuery(reducedMq, event => {
        prefersReduced.value = event.matches
    })

    window.addEventListener("resize", handleResize)
    nextTick(() => {
        if (hasStack.value) {
            positionStack()
        }
    })
})

onBeforeUnmount(() => {
    cancelAnimation()
    if (rafId !== undefined) {
        cancelAnimationFrame(rafId)
    }
    window.removeEventListener("resize", handleResize)
})
</script>

<template>
    <div ref="groupEl" class="relative" @mouseenter="onGroupMouseEnter" @mouseleave="onGroupMouseLeave" @mousemove="onGroupMouseMove">
        <!-- 分组标题行 -->
        <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <div class="flex items-baseline gap-3">
                <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-base-content/60">{{ label }}</span>
                <span class="font-mono text-xs tabular-nums text-base-content/40">v{{ version }} · {{ entries.length }}</span>
            </div>

            <button
                v-if="!canHover && hasStack"
                type="button"
                class="cursor-pointer border border-base-content/25 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/60 transition-colors duration-200 hover:border-primary/60 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
                @click="toggle"
            >
                {{ isExpanded ? $t("view.collapse") : `${$t("view.expand")} +${stackedEntries.length}` }}
            </button>
        </div>

        <!-- 卡片网格（收起态仅第一行；列数翻倍，卡片等比例缩小） -->
        <ul ref="gridEl" class="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12">
            <li
                v-for="(entry, index) in gridEntries"
                :key="entryKey(entry)"
                class="relative"
                :data-stack-index="index >= visibleCount ? index - visibleCount : undefined"
            >
                <DBLatestItemCard :entry="entry" />
            </li>
        </ul>

        <!-- 层叠收纳：超出第一行的卡片错位堆叠（事件穿透，不参与交互） -->
        <div v-if="hasStack && !isExpanded" ref="stackEl" class="pointer-events-none absolute z-10">
            <div
                v-for="(entry, index) in stackedEntries"
                :key="entryKey(entry)"
                :ref="el => setLayer(el, index)"
                class="absolute left-0 top-0 h-full w-full will-change-transform"
                :style="{ transform: stackLayerTransform(index), zIndex: 10 + index }"
            >
                <DBLatestItemCard :entry="entry" />
            </div>

            <span
                class="absolute -bottom-3 right-0 z-30 bg-base-content px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums text-base-100"
                >+{{ stackedEntries.length }}</span
            >
        </div>
    </div>
</template>
