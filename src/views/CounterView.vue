<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { type CounterTrigger, useCounterStore } from "@/store/counter"

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
    counterStore.addCounter(`Counter ${counterStore.counters.length + 1}`)
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
            <div class="flex items-center gap-3">
                <button class="btn btn-primary btn-sm" @click="createCounter">新增计数器</button>
                <button class="btn btn-ghost btn-sm" @click="counterStore.resetAllCounters">重置全部</button>
            </div>

            <div class="grid gap-4 xl:grid-cols-2">
                <section
                    v-for="counter in counters"
                    :key="counter.id"
                    class="overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-sm"
                    :data-counter-id="counter.id"
                    :class="dragOverCounterId === counter.id ? 'border-primary' : ''"
                >
                    <div class="border-b border-base-300 px-4 py-3">
                        <div class="flex items-center justify-between gap-3">
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
                                    class="inline-flex size-8 items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
                                    :aria-expanded="isCounterPanelOpen(counter.id)"
                                    aria-label="展开计数器设置"
                                    @click="toggleCounterPanel(counter.id)"
                                >
                                    <Icon
                                        :icon="isCounterPanelOpen(counter.id) ? 'ri:arrow-up-s-line' : 'ri:arrow-down-s-line'"
                                        class="h-5 w-5"
                                    />
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex size-8 items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
                                    aria-label="重置计数器"
                                    @click="counterStore.resetCounter(counter.id)"
                                >
                                    <Icon icon="ri:refresh-line" class="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex size-8 items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-200 hover:text-error"
                                    aria-label="删除计数器"
                                    @click="counterStore.removeCounter(counter.id)"
                                >
                                    <Icon icon="ri:delete-bin-line" class="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="px-4 py-4">
                        <div class="flex min-h-44 flex-col justify-between">
                            <div class="flex flex-1 items-center justify-center">
                                <input
                                    :value="counter.value"
                                    type="number"
                                    min="0"
                                    class="w-full border-0 bg-transparent text-center text-7xl font-semibold outline-none"
                                    @change="counterStore.setCounterValue(counter.id, Number(($event.target as HTMLInputElement).value))"
                                />
                            </div>

                            <div class="mt-4 flex items-center justify-between gap-4">
                                <button class="btn flex-1" @click="counterStore.incrementBy(counter.id, -1)">-</button>
                                <button class="btn flex-1" @click="counterStore.incrementCounter(counter.id)">+</button>
                            </div>
                        </div>

                        <div v-if="isCounterPanelOpen(counter.id)" class="mt-4">
                            <div class="grid gap-4">
                                <label class="grid gap-2 text-sm">
                                    <span class="font-medium">设置上限</span>
                                    <input
                                        :value="counter.maxValue ?? ''"
                                        type="number"
                                        min="1"
                                        class="input input-bordered input-sm w-full"
                                        placeholder="不限制"
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
                                    <span class="font-medium">重置周期</span>
                                    <CronInput v-model="counter.resetCron" />
                                </label>
                            </div>
                        </div>

                        <div class="mt-4 flex items-center justify-between gap-2">
                            <div class="text-sm font-medium">触发器</div>
                            <button class="btn btn-ghost btn-xs" @click="counterStore.addTrigger(counter.id)">新增触发器</button>
                        </div>

                        <div class="mt-3 space-y-2">
                            <div
                                v-for="trigger in counter.triggers"
                                :key="trigger.id"
                                class="rounded-xl border border-base-300 bg-base-200/50 p-3"
                            >
                                <div class="flex">
                                    <div class="mr-2">
                                        <button
                                            type="button"
                                            class="inline-flex size-7 items-center justify-center rounded-full text-base-content/50 transition-colors hover:bg-base-300 hover:text-base-content"
                                            aria-label="拖动触发器"
                                            @pointerdown="startTriggerMove(counter.id, trigger, $event)"
                                        >
                                            <Icon icon="ri:drag-move-line" class="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            class="inline-flex size-8 items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-200 hover:text-error"
                                            aria-label="删除计数器"
                                            @click="counterStore.removeTrigger(counter.id, trigger.id)"
                                        >
                                            <Icon icon="ri:delete-bin-line" class="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div class="grid gap-2 md:grid-cols-2 flex-1">
                                        <HotkeyInput
                                            v-model="trigger.hotkey"
                                            size="sm"
                                            placeholder="设置热键"
                                            @update:modelValue="
                                                counterStore.updateTrigger(counter.id, trigger.id, { hotkey: trigger.hotkey })
                                            "
                                        />
                                        <select
                                            v-model="trigger.action"
                                            class="select select-bordered select-sm"
                                            @change="counterStore.updateTrigger(counter.id, trigger.id, { action: trigger.action })"
                                        >
                                            <option value="-1">计数 -1</option>
                                            <option value="+1">计数 +1</option>
                                            <option value="+2">计数 +2</option>
                                            <option value="+3">计数 +3</option>
                                            <option value="+4">计数 +4</option>
                                            <option value="+5">计数 +5</option>
                                            <option value="+10">计数 +10</option>
                                            <option value="reset">重置</option>
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
            class="pointer-events-none fixed z-50 rounded-full border border-primary/40 bg-base-100 px-3 py-1 text-xs shadow-lg"
            :style="{ left: `${dragPreview.x + 12}px`, top: `${dragPreview.y + 12}px` }"
        >
            正在移动
        </div>
    </ScrollArea>
</template>
