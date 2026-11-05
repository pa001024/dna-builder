<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { toCloneErrorMessage } from "@/api/desktop-clone"
import { env } from "@/env"
import { prepareCloneOverlay, useDesktopCloneStore } from "@/store/desktop-clone"
import CloneViewMenu from "./CloneViewMenu.vue"

/**
 * 克隆窗口标题栏：状态、会话号、连接后的快捷按钮与窗口控制。
 *
 * 高度固定 44 逻辑像素（`h-11`），父视图用 ResizeObserver 上报真实高度，
 * 后端据此把原生 RDP 子窗口排在标题栏下方。
 */
const emit = defineEmits<{
    close: []
    "open-control-center": []
}>()

const { t } = useTranslation()
const store = useDesktopCloneStore()
const viewMenuOpen = ref(false)
const maximized = ref(false)
const notice = ref("")
let noticeTimer: number | null = null
let unlistenResized: (() => void) | null = null

const statusTone = computed(() => {
    switch (store.state) {
        case "connected":
            return "bg-success"
        case "error":
        case "unsupported":
            return "bg-error"
        case "preparing":
        case "connecting":
        case "closing":
            return "bg-warning animate-pulse"
        case "awaiting-credentials":
            return "bg-info"
        default:
            return "bg-base-content/30"
    }
})

const statusLabel = computed(() => t(`desktop_clone.status.${store.state.replace("-", "_")}`))

const mouseModeKey = computed(() =>
    store.options.mouseMode === "game" ? "desktop_clone.action.mouse_game" : "desktop_clone.action.mouse_normal"
)

const mouseTitle = computed(() =>
    store.options.mouseMode === "game" ? t("desktop_clone.action.mouse_game_hint") : t("desktop_clone.action.mouse_mode")
)

const showCancel = computed(() => store.state === "preparing" || store.state === "connecting")

function showNotice(text: string) {
    notice.value = text
    if (noticeTimer !== null) window.clearTimeout(noticeTimer)
    noticeTimer = window.setTimeout(() => {
        notice.value = ""
        noticeTimer = null
    }, 3200)
}

// 后端在控件拒绝相对鼠标时会把选项回写为普通模式并带来降级原因
watch(
    () => store.mouseDegraded,
    degraded => {
        if (!degraded) return
        showNotice(t("desktop_clone.action.mouse_degraded"))
        store.clearMouseDegraded()
    }
)

// 命令级错误（忙状态、取消失败等）只在 store 里留一份，这里统一提示后清空
watch(
    () => store.lastError,
    message => {
        if (!message) return
        showNotice(message)
        store.lastError = ""
    }
)

async function togglePin() {
    try {
        await store.setOptions({ alwaysOnTop: !store.options.alwaysOnTop })
    } catch (cause) {
        showNotice(toCloneErrorMessage(cause))
    }
}

async function toggleViewMenu() {
    if (viewMenuOpen.value) {
        viewMenuOpen.value = false
        return
    }
    // 菜单同样渲染在网页层：先展开 WebView2 再打开
    await prepareCloneOverlay()
    viewMenuOpen.value = true
}

async function toggleMouseMode() {
    try {
        await store.setOptions({ mouseMode: store.options.mouseMode === "game" ? "normal" : "game" })
    } catch (cause) {
        showNotice(toCloneErrorMessage(cause))
    }
}

async function switchWindow() {
    try {
        const channel = await store.sendKeys("switch-window")
        if (channel.includes("send-input")) showNotice(t("desktop_clone.control.degraded"))
    } catch (cause) {
        showNotice(toCloneErrorMessage(cause))
    }
}

async function cancelConnect() {
    try {
        await store.closeSession(false)
    } catch (cause) {
        showNotice(toCloneErrorMessage(cause))
    }
}

function minimize() {
    if (!env.isApp) return
    void getCurrentWindow().minimize()
}

async function toggleMaximize() {
    if (!env.isApp) return
    const win = getCurrentWindow()
    try {
        if (await win.isMaximized()) await win.unmaximize()
        else await win.maximize()
        maximized.value = await win.isMaximized()
    } catch (cause) {
        showNotice(toCloneErrorMessage(cause))
    }
}

onMounted(async () => {
    if (!env.isApp) return
    const win = getCurrentWindow()
    maximized.value = await win.isMaximized().catch(() => false)
    unlistenResized = await win
        .onResized(() => {
            void win.isMaximized().then(value => {
                maximized.value = value
            })
        })
        .catch(() => null)
})

onBeforeUnmount(() => {
    if (noticeTimer !== null) window.clearTimeout(noticeTimer)
    unlistenResized?.()
    unlistenResized = null
})
</script>

<template>
    <!-- 双击最大化由 Tauri 的 drag-region 内建处理，这里不要再挂 dblclick，否则会切换两次 -->
    <div class="relative flex h-11 w-full items-center gap-1 bg-base-200/80 px-1.5" data-tauri-drag-region>
        <div class="flex min-w-0 items-center gap-1.5 pl-1" data-tauri-drag-region>
            <span class="size-2 shrink-0 rounded-full" :class="statusTone" :title="statusLabel" />
            <span class="truncate text-sm font-semibold" data-tauri-drag-region>{{ t("desktop_clone.title") }}</span>
            <span v-if="store.sessionId !== null" class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] text-base-content/55">
                {{ t("desktop_clone.session_id", { id: store.sessionId }) }}
            </span>
        </div>

        <div v-if="store.connected" class="flex min-w-0 items-center gap-1">
            <button type="button" class="btn btn-ghost btn-xs gap-1" :title="mouseTitle" :aria-label="mouseTitle" @click="toggleMouseMode">
                <Icon :icon="store.options.mouseMode === 'game' ? 'ri:crosshair-line' : 'ri:mouse-line'" class="size-3.5" />
                <span class="max-w-24 truncate">{{ t(mouseModeKey) }}</span>
                <span v-if="store.options.mouseMode === 'game'" class="text-[9px] text-base-content/45">Alt</span>
            </button>
            <button
                type="button"
                class="btn btn-ghost btn-xs gap-1"
                :title="t('desktop_clone.action.switch_window')"
                :aria-label="t('desktop_clone.action.switch_window')"
                @click="switchWindow"
            >
                <Icon icon="ri:apps-2-line" class="size-3.5" />
                <span class="hidden sm:inline">{{ t("desktop_clone.action.switch_window") }}</span>
            </button>
            <button
                type="button"
                class="btn btn-ghost btn-xs gap-1"
                :title="t('desktop_clone.action.control_center')"
                :aria-label="t('desktop_clone.action.control_center')"
                @click="emit('open-control-center')"
            >
                <Icon icon="ri:settings-3-line" class="size-3.5" />
                <span class="hidden sm:inline">{{ t("desktop_clone.action.control_center") }}</span>
            </button>
        </div>

        <div v-else-if="showCancel" class="flex items-center gap-1.5">
            <span class="loading loading-spinner loading-xs" />
            <span class="max-w-40 truncate text-xs text-base-content/60">{{ statusLabel }}</span>
            <button type="button" class="btn btn-ghost btn-xs" @click="cancelConnect">{{ t("desktop_clone.action.cancel") }}</button>
        </div>

        <span v-if="notice" class="min-w-0 flex-1 truncate text-center text-[11px] text-warning">{{ notice }}</span>
        <div v-else class="min-w-0 flex-1" data-tauri-drag-region />

        <div class="flex shrink-0 items-center gap-0.5">
            <button
                type="button"
                class="btn btn-ghost btn-xs btn-square"
                :title="store.options.alwaysOnTop ? t('desktop_clone.action.unpin') : t('desktop_clone.action.pin')"
                :aria-label="store.options.alwaysOnTop ? t('desktop_clone.action.unpin') : t('desktop_clone.action.pin')"
                @click="togglePin"
            >
                <Icon :icon="store.options.alwaysOnTop ? 'ri:pushpin-2-fill' : 'ri:pushpin-fill'" class="size-3.5" bold />
            </button>
            <button
                type="button"
                class="btn btn-ghost btn-xs btn-square"
                :class="{ 'btn-active': viewMenuOpen }"
                :title="t('desktop_clone.action.view_menu')"
                :aria-label="t('desktop_clone.action.view_menu')"
                :aria-expanded="viewMenuOpen"
                @click="toggleViewMenu"
            >
                <Icon icon="ri:menu-line" class="size-3.5" />
            </button>
            <button
                type="button"
                class="btn btn-ghost btn-xs btn-square"
                :title="t('desktop_clone.action.minimize')"
                :aria-label="t('desktop_clone.action.minimize')"
                @click="minimize"
            >
                <Icon icon="codicon:chrome-minimize" class="size-3.5" />
            </button>
            <button
                type="button"
                class="btn btn-ghost btn-xs btn-square"
                :title="maximized ? t('desktop_clone.action.restore') : t('desktop_clone.action.maximize')"
                :aria-label="maximized ? t('desktop_clone.action.restore') : t('desktop_clone.action.maximize')"
                @click="toggleMaximize"
            >
                <Icon :icon="maximized ? 'codicon:chrome-restore' : 'codicon:chrome-maximize'" class="size-3.5" />
            </button>
            <button
                type="button"
                class="btn btn-ghost btn-xs btn-square hover:btn-error"
                :title="t('desktop_clone.action.close')"
                :aria-label="t('desktop_clone.action.close')"
                @click="emit('close')"
            >
                <Icon icon="codicon:chrome-close" class="size-3.5" />
            </button>
        </div>

        <CloneViewMenu :open="viewMenuOpen" @close="viewMenuOpen = false" />
    </div>
</template>
