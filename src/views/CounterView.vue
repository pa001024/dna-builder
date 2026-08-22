<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, onUnmounted, ref } from "vue"
import { type CounterTrigger, useCounterStore } from "@/store/counter"

const { t } = useTranslation()
const counterStore = useCounterStore()
const expandedCounterIds = ref(new Set<string>())
const draggedTrigger = ref<{ counterId: string; triggerId: string } | null>(null)
const dragOverCounterId = ref<string | null>(null)
const dragPreview = ref({ x: 0, y: 0 })
let refreshTimer: number | null = null
let pointerMoveHandler: ((event: PointerEvent) => void) | null = null
let pointerUpHandler: ((event: PointerEvent) => void) | null = null
let pointerCancelHandler: ((event: PointerEvent) => void) | null = null

const counters = computed(() => counterStore.counters)

/**
 * 添加新计数器。
 */
function createCounter() {
    counterStore.addCounter(t("counter.defaultName", { index: counterStore.counters.length + 1 }))
}

/**
 * 切换计数器展开状态。
 * @param counterId 计数器 ID
 */
function toggleCounterPanel(counterId: string) {
    const next = new Set(expandedCounterIds.value)
    if (next.has(counterId)) next.delete(counterId)
    else next.add(counterId)
    expandedCounterIds.value = next
}

/**
 * 判断计数器是否展开。
 * @param counterId 计数器 ID
 * @returns 是否展开
 */
function isCounterPanelOpen(counterId: string) {
    return expandedCounterIds.value.has(counterId)
}

/**
 * 清理拖拽状态。
 */
function resetDragState() {
    if (pointerMoveHandler) {
        document.removeEventListener("pointermove", pointerMoveHandler)
        pointerMoveHandler = null
    }
    if (pointerUpHandler) {
        document.removeEventListener("pointerup", pointerUpHandler)
        pointerUpHandler = null
    }
    if (pointerCancelHandler) {
        document.removeEventListener("pointercancel", pointerCancelHandler)
        pointerCancelHandler = null
    }
    draggedTrigger.value = null
    dragOverCounterId.value = null
}

/**
 * 更新当前指针下的目标计数器。
 * @param x 指针 X 坐标
 * @param y 指针 Y 坐标
 */
function updateDragOverCounter(x: number, y: number) {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-counter-id]")
    dragOverCounterId.value = element?.dataset.counterId || null
}

/**
 * 结束手动拖动并按当前位置决定落点。
 * @param event 指针事件
 */
function handlePointerUp(event: PointerEvent) {
    if (!draggedTrigger.value) {
        resetDragState()
        return
    }

    updateDragOverCounter(event.clientX, event.clientY)
    const targetCounterId = dragOverCounterId.value
    if (targetCounterId) {
        counterStore.moveTrigger(draggedTrigger.value.counterId, targetCounterId, draggedTrigger.value.triggerId)
    }
    resetDragState()
}

/**
 * 开始手动拖动触发器。
 * @param counterId 计数器 ID
 * @param trigger 触发器
 * @param event 指针事件
 */
function startTriggerMove(counterId: string, trigger: CounterTrigger, event: PointerEvent) {
    if (event.button !== 0) {
        return
    }
    event.preventDefault()
    event.stopPropagation()
    draggedTrigger.value = { counterId, triggerId: trigger.id }
    dragPreview.value = { x: event.clientX, y: event.clientY }
    updateDragOverCounter(event.clientX, event.clientY)

    pointerMoveHandler = nextEvent => {
        dragPreview.value = { x: nextEvent.clientX, y: nextEvent.clientY }
        updateDragOverCounter(nextEvent.clientX, nextEvent.clientY)
    }
    pointerUpHandler = handlePointerUp
    pointerCancelHandler = () => resetDragState()
    document.addEventListener("pointermove", pointerMoveHandler)
    document.addEventListener("pointerup", pointerUpHandler)
    document.addEventListener("pointercancel", pointerCancelHandler)
}

onMounted(() => {
    counterStore.refreshExpiredCounters()
    void counterStore.syncTriggerHotkeys()
    refreshTimer = window.setInterval(() => {
        counterStore.refreshExpiredCounters()
    }, 1000)
})

onUnmounted(() => {
    if (refreshTimer !== null) {
        window.clearInterval(refreshTimer)
        refreshTimer = null
    }
    resetDragState()
})
</script>

<template>
    <ScrollArea class="h-full">
        <div class="flex flex-col gap-4 p-4">
            <!-- 工具条：外层区块卡；新建为主操作（主色实底），全部重置为次操作（描边） -->
            <div
                class="flex flex-wrap items-center gap-3 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm animate-ef-rise motion-reduce:animate-none"
            >
                <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">COUNTERS</span>
                <div class="ml-auto flex items-center gap-2">
                    <button
                        class="cursor-pointer rounded-xs border border-primary bg-primary px-3 py-1.5 text-sm font-semibold text-primary-content transition-all duration-150 hover:bg-primary/90 active:scale-[0.97]"
                        @click="createCounter"
                    >
                        {{ $t("counter.create") }}
                    </button>
                    <button
                        class="cursor-pointer rounded-xs border border-base-content/20 px-3 py-1.5 text-sm text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                        @click="counterStore.resetAllCounters"
                    >
                        {{ $t("counter.resetAll") }}
                    </button>
                </div>
            </div>

            <div class="stagger-rise grid gap-4 lg:grid-cols-2">
                <section
                    v-for="counter in counters"
                    :key="counter.id"
                    class="rounded-xs border p-3 backdrop-blur-sm transition-colors duration-200"
                    :data-counter-id="counter.id"
                    :class="
                        dragOverCounterId === counter.id
                            ? 'border-primary bg-primary/10'
                            : 'border-base-content/10 bg-base-100/60'
                    "
                >
                    <div class="flex items-center justify-between gap-3 border-b border-base-content/10 pb-2.5">
                        <div class="min-w-0 flex-1">
                            <input
                                v-model="counter.name"
                                class="w-full border-0 bg-transparent p-0 text-base font-medium outline-none"
                                @change="counterStore.updateCounter(counter.id, { name: counter.name })"
                            />
                        </div>
                        <div class="flex items-center gap-1">
                            <button
                                type="button"
                                class="inline-flex size-8 cursor-pointer items-center justify-center rounded-xs text-base-content/60 transition-colors duration-150 hover:bg-base-content/10 hover:text-primary"
                                :aria-expanded="isCounterPanelOpen(counter.id)"
                                :aria-label="$t('counter.expandSettings')"
                                @click="toggleCounterPanel(counter.id)"
                            >
                                <Icon
                                    :icon="isCounterPanelOpen(counter.id) ? 'ri:arrow-up-s-line' : 'ri:arrow-down-s-line'"
                                    class="h-5 w-5"
                                />
                            </button>
                            <button
                                type="button"
                                class="inline-flex size-8 cursor-pointer items-center justify-center rounded-xs text-base-content/60 transition-colors duration-150 hover:bg-base-content/10 hover:text-primary"
                                :aria-label="$t('counter.resetCounter')"
                                @click="counterStore.resetCounter(counter.id)"
                            >
                                <Icon icon="ri:refresh-line" class="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                class="inline-flex size-8 cursor-pointer items-center justify-center rounded-xs text-base-content/60 transition-colors duration-150 hover:bg-error/10 hover:text-error"
                                :aria-label="$t('counter.deleteCounter')"
                                @click="counterStore.removeCounter(counter.id)"
                            >
                                <Icon icon="ri:delete-bin-line" class="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div class="pt-3">
                        <div class="flex min-h-44 flex-col justify-between">
                            <div class="flex flex-1 items-center justify-center">
                                <input
                                    :value="counter.value"
                                    type="number"
                                    min="0"
                                    class="w-full border-0 bg-transparent text-center font-orbitron text-7xl font-semibold tabular-nums text-primary outline-none"
                                    @change="counterStore.setCounterValue(counter.id, Number(($event.target as HTMLInputElement).value))"
                                />
                            </div>

                            <!-- 加减控件：功能与布局不变，仅归一视觉（- 描边次操作 / + 主色实底主操作） -->
                            <div class="mt-4 flex items-center justify-between gap-4">
                                <button
                                    class="flex-1 cursor-pointer rounded-xs border border-base-content/20 py-2.5 text-lg font-semibold leading-none text-base-content/70 transition-all duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.98]"
                                    @click="counterStore.incrementBy(counter.id, -1)"
                                >
                                    -
                                </button>
                                <button
                                    class="flex-1 cursor-pointer rounded-xs border border-primary bg-primary py-2.5 text-lg font-semibold leading-none text-primary-content transition-all duration-150 hover:bg-primary/90 active:scale-[0.98]"
                                    @click="counterStore.incrementCounter(counter.id)"
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        <div v-if="isCounterPanelOpen(counter.id)" class="mt-4">
                            <!-- 设置面板：内层小卡（父级已 blur，不叠加 backdrop） -->
                            <div class="grid gap-4 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                                <label class="grid gap-2 text-sm">
                                    <span class="font-medium">{{ $t("counter.maxValue") }}</span>
                                    <input
                                        :value="counter.maxValue ?? ''"
                                        type="number"
                                        min="1"
                                        class="input input-bordered input-sm w-full"
                                        :placeholder="$t('counter.unlimited')"
                                        @change="
                                            counterStore.updateCounter(counter.id, {
                                                maxValue: ($event.target as HTMLInputElement).value
                                                    ? Number(($event.target as HTMLInputElement).value)
                                                    : null,
                                            })
                                        "
                                    />
                                </label>
                                <label class="grid gap-2 text-sm">
                                    <span class="font-medium">{{ $t("counter.resetCron") }}</span>
                                    <CronInput v-model="counter.resetCron" />
                                </label>
                            </div>
                        </div>

                        <div class="mt-4 flex items-center justify-between gap-2">
                            <div class="text-sm font-medium tracking-wide">{{ $t("counter.triggers") }}</div>
                            <button
                                class="shrink-0 cursor-pointer rounded-xs border border-base-content/20 px-2 py-0.5 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                @click="counterStore.addTrigger(counter.id)"
                            >
                                {{ $t("counter.addTrigger") }}
                            </button>
                        </div>

                        <div class="mt-3 space-y-2">
                            <div
                                v-for="trigger in counter.triggers"
                                :key="trigger.id"
                                class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                            >
                                <div class="flex">
                                    <div class="mr-2">
                                        <button
                                            type="button"
                                            class="inline-flex size-7 cursor-grab items-center justify-center rounded-xs text-base-content/50 transition-colors duration-150 hover:bg-base-content/10 hover:text-primary active:cursor-grabbing"
                                            :aria-label="$t('counter.dragTrigger')"
                                            @pointerdown="startTriggerMove(counter.id, trigger, $event)"
                                        >
                                            <Icon icon="ri:drag-move-line" class="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            class="inline-flex size-8 cursor-pointer items-center justify-center rounded-xs text-base-content/60 transition-colors duration-150 hover:bg-error/10 hover:text-error"
                                            :aria-label="$t('counter.deleteCounter')"
                                            @click="counterStore.removeTrigger(counter.id, trigger.id)"
                                        >
                                            <Icon icon="ri:delete-bin-line" class="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div class="grid gap-2 md:grid-cols-2 flex-1">
                                        <HotkeyInput
                                            v-model="trigger.hotkey"
                                            size="sm"
                                            :placeholder="$t('counter.hotkeyPlaceholder')"
                                            @update:modelValue="
                                                counterStore.updateTrigger(counter.id, trigger.id, { hotkey: trigger.hotkey })
                                            "
                                        />
                                        <select
                                            v-model="trigger.action"
                                            class="select select-bordered select-sm"
                                            @change="counterStore.updateTrigger(counter.id, trigger.id, { action: trigger.action })"
                                        >
                                            <option value="-1">{{ $t("counter.action.count", { amount: "-1" }) }}</option>
                                            <option value="+1">{{ $t("counter.action.count", { amount: "+1" }) }}</option>
                                            <option value="+2">{{ $t("counter.action.count", { amount: "+2" }) }}</option>
                                            <option value="+3">{{ $t("counter.action.count", { amount: "+3" }) }}</option>
                                            <option value="+4">{{ $t("counter.action.count", { amount: "+4" }) }}</option>
                                            <option value="+5">{{ $t("counter.action.count", { amount: "+5" }) }}</option>
                                            <option value="+10">{{ $t("counter.action.count", { amount: "+10" }) }}</option>
                                            <option value="reset">{{ $t("counter.action.reset") }}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
        <div
            v-if="draggedTrigger"
            class="pointer-events-none fixed z-50 rounded-xs border border-primary/50 bg-base-100/85 px-2.5 py-1 text-xs shadow-lg backdrop-blur-md"
            :style="{ left: `${dragPreview.x + 12}px`, top: `${dragPreview.y + 12}px` }"
        >
            {{ $t("counter.moving") }}
        </div>
    </ScrollArea>
</template>
