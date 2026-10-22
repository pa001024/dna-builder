<script setup lang="ts">
/**
 * 狩月动画独立小窗的承载页。
 *
 * 窗口由主窗口创建（label `afk-widget`），透明、无边框、置顶、不占任务栏，
 * 默认摆在屏幕右下角的任务栏上方（与官方「小小狩月人」同位置）。
 * 页面只做三件事：画动画、悬停时浮出操作按钮、把按钮状态写回窗口。
 */
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { closeAfkWidgetWindow, placeAfkWidget, setAfkWidgetAlwaysOnTop, setAfkWidgetIgnoreCursorEvents } from "@/api/afk-widget-window"
import { useAfkAnimation } from "@/composables/useAfkAnimation"
import { useSettingStore } from "@/store/setting"
import { AFK_WIDGET_CLICK_THROUGH_KEY, readAfkWidgetClickThrough, writeAfkWidgetClickThrough } from "@/utils/afk-widget"

/** 小窗逻辑画布：与官方窗口一致。 */
const CANVAS_WIDTH = 366
const CANVAS_HEIGHT = 118

const canvas = ref<HTMLCanvasElement | null>(null)
const { manifest, error, animState } = useAfkAnimation(canvas, {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    entitySize: CANVAS_HEIGHT,
})

/** 窗口打开时刻：此后的提示才弹，打开时不回放历史。 */
const openedAt = Date.now()

/** 副本完成等提示：走顶部横幅。 */
const notices = ref<{ text: string; at: number }[]>([])
let lastNoticeAt = 0
watch(
    () => animState.value.notices,
    list => {
        for (const notice of list) {
            if (notice.at < openedAt) continue
            if (notice.at <= lastNoticeAt) continue
            lastNoticeAt = notice.at
            notices.value = [...notices.value, notice]
            window.setTimeout(() => {
                notices.value = notices.value.filter(item => item.at !== notice.at)
            }, 4000)
        }
    },
    { deep: true, immediate: true }
)

/** 鼠标是否悬停：悬停才显示操作按钮。 */
const hovering = ref(false)
/** 是否置顶。 */
const pinned = ref(true)
/** 是否鼠标穿透（穿透后按钮点不到，需要回主界面的「解锁」恢复）。 */
const clickThrough = ref(readAfkWidgetClickThrough())
/** 操作进行中，避免重复点击。 */
const busy = ref(false)

const windowRef = computed(() => getCurrentWebviewWindow())
const setting = useSettingStore()

/**
 * 拖动窗口：交给系统原生拖拽，松手后记住位置（不写配置，重启回到默认位置）。
 * @param event 鼠标事件
 */
async function startDrag(event: MouseEvent) {
    if (event.button !== 0) return
    await windowRef.value.startDragging().catch(cause => console.error("拖动狩月动画窗口失败", cause))
}

/**
 * 切换置顶。
 */
async function togglePin() {
    if (busy.value) return
    busy.value = true
    pinned.value = !pinned.value
    await setAfkWidgetAlwaysOnTop(windowRef.value, pinned.value)
    busy.value = false
}

/**
 * 切换鼠标穿透。开启后整窗不再接收鼠标事件，按钮需从主界面恢复。
 */
async function toggleClickThrough() {
    if (busy.value) return
    busy.value = true
    clickThrough.value = !clickThrough.value
    writeAfkWidgetClickThrough(clickThrough.value)
    await setAfkWidgetIgnoreCursorEvents(windowRef.value, clickThrough.value)
    busy.value = false
}

/**
 * 关闭小窗。
 */
async function close() {
    await closeAfkWidgetWindow()
}

/**
 * 复位到右下角默认位置。
 */
async function resetPosition() {
    await placeAfkWidget(windowRef.value)
}

onMounted(async () => {
    // 窗口关闭（含 Alt+F4 / 主窗口销毁）时把开关写回关闭，主窗口经 storage 事件同步
    window.addEventListener("beforeunload", () => {
        setting.afkWidgetEnabled = false
    })
    // 打开时先解除穿透：否则窗口一出现就点不到，也没法关掉
    if (clickThrough.value) {
        clickThrough.value = false
        writeAfkWidgetClickThrough(false)
        await setAfkWidgetIgnoreCursorEvents(windowRef.value, false)
    }
    // 悬停显示按钮：鼠标离开窗口时收起，避免一直挡着动画
    window.addEventListener("mouseenter", () => (hovering.value = true))
    window.addEventListener("mouseleave", () => (hovering.value = false))
    // 主窗口点了「解锁」会清掉这个键，这里跟着恢复
    window.addEventListener("storage", event => {
        if (event.key !== AFK_WIDGET_CLICK_THROUGH_KEY) return
        const enabled = event.newValue === "1"
        if (enabled === clickThrough.value) return
        clickThrough.value = enabled
        void setAfkWidgetIgnoreCursorEvents(windowRef.value, enabled)
    })
})

onBeforeUnmount(() => {
    // 关窗前解除穿透并清掉记录，避免下次打开时点不到
    if (clickThrough.value) {
        writeAfkWidgetClickThrough(false)
        void setAfkWidgetIgnoreCursorEvents(windowRef.value, false)
    }
})
</script>

<style scoped>
</style>

<template>
    <div
        class="relative size-full overflow-hidden rounded-md"
        @mouseenter="hovering = true"
        @mouseleave="hovering = false"
    >
        <canvas ref="canvas" class="block w-full" />

        <!-- 没有游戏目录时的兜底底纹 -->
        <div v-if="!manifest" class="absolute inset-0 bg-linear-to-r from-base-content/10 via-base-content/5 to-base-content/10" />

        <!-- 悬停操作条：4 个方形纯图标按钮（拖动 / 关闭 / 置顶 / 穿透），悬停才出现 -->
        <div
            class="absolute inset-x-0 top-0 flex items-center justify-end gap-1 p-1 transition-opacity duration-150"
            :class="hovering ? 'opacity-100' : 'pointer-events-none opacity-0'"
        >
            <button
                type="button"
                class="flex size-6 cursor-grab items-center justify-center rounded-xs bg-base-100/85 text-base-content/70 backdrop-blur-sm transition-colors hover:bg-base-100 hover:text-base-content active:cursor-grabbing"
                :title="$t('afk-widget.drag')"
                :aria-label="$t('afk-widget.drag')"
                @mousedown="startDrag"
            >
                <Icon icon="ri:drag-move-line" class="size-3.5" />
            </button>
            <button
                type="button"
                class="flex size-6 items-center justify-center rounded-xs bg-base-100/85 text-base-content/70 backdrop-blur-sm transition-colors hover:bg-error/15 hover:text-error"
                :title="$t('afk-widget.close')"
                :aria-label="$t('afk-widget.close')"
                @click="close"
            >
                <Icon icon="ri:close-line" class="size-3.5" />
            </button>
            <button
                type="button"
                class="flex size-6 items-center justify-center rounded-xs backdrop-blur-sm transition-colors"
                :class="
                    pinned
                        ? 'bg-primary/85 text-primary-content hover:bg-primary'
                        : 'bg-base-100/85 text-base-content/70 hover:bg-base-100 hover:text-base-content'
                "
                :title="$t('afk-widget.pin')"
                :aria-label="$t('afk-widget.pin')"
                :aria-pressed="pinned"
                @click="togglePin"
            >
                <Icon icon="ri:pushpin-2-line" class="size-3.5" />
            </button>
            <button
                type="button"
                class="flex size-6 items-center justify-center rounded-xs backdrop-blur-sm transition-colors"
                :class="
                    clickThrough
                        ? 'bg-warning/85 text-warning-content hover:bg-warning'
                        : 'bg-base-100/85 text-base-content/70 hover:bg-base-100 hover:text-base-content'
                "
                :title="$t('afk-widget.lock')"
                :aria-label="$t('afk-widget.lock')"
                :aria-pressed="clickThrough"
                @click="toggleClickThrough"
            >
                <Icon icon="ri:lock-line" class="size-3.5" />
            </button>
        </div>

        <button
            v-if="hovering"
            type="button"
            class="absolute right-1 bottom-1 rounded-xs bg-base-100/70 px-1.5 py-0.5 text-[9px] text-base-content/60 backdrop-blur-sm hover:text-base-content"
            :title="$t('afk-widget.reset')"
            @click="resetPosition"
        >
            {{ $t("afk-widget.reset") }}
        </button>

        <!-- 副本完成提示：顶部横幅，4 秒后消失 -->
        <div class="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 pt-1">
            <span
                v-for="notice in notices"
                :key="notice.at"
                class="max-w-[95%] truncate rounded-xs bg-base-100/90 px-2 py-0.5 text-[10px] text-base-content shadow-sm backdrop-blur-sm"
            >
                {{ notice.text }}
            </span>
        </div>

        <span v-if="error" class="absolute left-1 bottom-1 max-w-2/3 truncate text-[9px] text-warning">
            {{ $t("afk-ledger.hero_missing") }}
        </span>
    </div>
</template>
