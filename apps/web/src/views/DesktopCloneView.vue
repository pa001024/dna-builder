<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { cloneErrorI18nKey, desktopCloneSetChromeHeight, toCloneErrorMessage } from "@/api/desktop-clone"
import CloneConfirmDialog from "@/components/desktop-clone/CloneConfirmDialog.vue"
import CloneControlCenter from "@/components/desktop-clone/CloneControlCenter.vue"
import CloneCredentialsDialog from "@/components/desktop-clone/CloneCredentialsDialog.vue"
import CloneStatusOverlay from "@/components/desktop-clone/CloneStatusOverlay.vue"
import CloneTitleBar from "@/components/desktop-clone/CloneTitleBar.vue"
import { env } from "@/env"
import { prepareCloneOverlay, resetCloneOverlay, useDesktopCloneStore, watchCloneOverlay } from "@/store/desktop-clone"

/**
 * 克隆窗口根视图（路由 `/desktop-clone`，窗口无边框）。
 *
 * 原生 RDP 子窗口由后端排在标题栏下方，网页在它的区域里不画任何内容；
 * 任何弹层打开期间通过引用计数调用 `desktop_clone_set_overlay_visible(false)` 隐藏它。
 */
const store = useDesktopCloneStore()
const { t } = useTranslation()

const chromeRef = ref<HTMLElement | null>(null)
const credentialsOpen = ref(false)
const credentialsHint = ref("")
const credentialsError = ref("")
const closeConfirmOpen = ref(false)
const reconnectConfirmOpen = ref(false)
const controlCenterOpen = ref(false)
const confirmError = ref("")

const showStatusOverlay = computed(() => store.state !== "connected")
const credentialsBusy = computed(() => store.busy === "connect")
const closeMessage = computed(() =>
    confirmError.value ? `${t("desktop_clone.close.message")}\n${confirmError.value}` : t("desktop_clone.close.message")
)
const reconnectMessage = computed(() => {
    const reason = store.reconnectPrompt?.reason
    const reasonText = reason ? t(`desktop_clone.reconnect.reason.${reason.replace("-", "_")}`) : ""
    return `${t("desktop_clone.reconnect.message")}${reasonText ? `\n${reasonText}` : ""}`
})

const RESIZE_HANDLES: { direction: "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest"; class: string }[] = [
    { direction: "North", class: "left-2 right-2 top-0 h-1 cursor-ns-resize" },
    { direction: "South", class: "bottom-0 left-2 right-2 h-1 cursor-ns-resize" },
    { direction: "East", class: "bottom-2 right-0 top-2 w-1 cursor-ew-resize" },
    { direction: "West", class: "bottom-2 left-0 top-2 w-1 cursor-ew-resize" },
    { direction: "NorthEast", class: "right-0 top-0 size-2 cursor-nesw-resize" },
    { direction: "NorthWest", class: "left-0 top-0 size-2 cursor-nwse-resize" },
    { direction: "SouthEast", class: "bottom-0 right-0 size-2 cursor-nwse-resize" },
    { direction: "SouthWest", class: "bottom-0 left-0 size-2 cursor-nesw-resize" },
]

watchCloneOverlay(() => showStatusOverlay.value)

let chromeObserver: ResizeObserver | null = null
let lastChromeHeight = 0

watch(
    () => store.credentialsPrompt,
    async prompt => {
        if (!prompt) return
        credentialsHint.value = prompt.usernameHint
        credentialsError.value = ""
        // 先让后端展开 WebView2，弹层才不会被 44px 条状视口裁切
        await prepareCloneOverlay()
        credentialsOpen.value = true
    }
)

watch(
    () => store.closeRequested,
    async requested => {
        if (!requested) return
        confirmError.value = ""
        await prepareCloneOverlay()
        closeConfirmOpen.value = true
    }
)

watch(
    () => store.reconnectPrompt,
    async prompt => {
        if (!prompt) return
        await prepareCloneOverlay()
        reconnectConfirmOpen.value = true
    }
)

async function startConnection() {
    // 2055/断开后后端会给出账号提示；从 idle 首次启动时为空（占位文案说明留空即当前用户）
    credentialsHint.value = store.credentialsPrompt?.usernameHint ?? ""
    credentialsError.value = ""
    await prepareCloneOverlay()
    credentialsOpen.value = true
}

async function openControlCenter() {
    await prepareCloneOverlay()
    controlCenterOpen.value = true
}

async function submitCredentials(username: string, password: string) {
    credentialsError.value = ""
    try {
        await store.connect(username, password)
        credentialsOpen.value = false
    } catch (cause) {
        const message = toCloneErrorMessage(cause)
        const key = cloneErrorI18nKey(null, message)
        credentialsError.value = key ? t(key) : message
    }
}

async function cancelCredentials() {
    credentialsOpen.value = false
    credentialsError.value = ""
    store.credentialsPrompt = null
    if (store.state !== "awaiting-credentials") return
    try {
        await store.closeSession(false)
    } catch (cause) {
        store.lastError = toCloneErrorMessage(cause)
    }
}

function requestClose() {
    if (!env.isApp) return
    // 后端只在需要确认时拦截关闭，因此统一走系统关闭路径
    void getCurrentWindow().close()
}

async function hideWindow() {
    confirmError.value = ""
    try {
        await store.hide()
        closeConfirmOpen.value = false
        store.closeRequested = false
    } catch (cause) {
        confirmError.value = toCloneErrorMessage(cause)
    }
}

async function closeAndLogoff() {
    confirmError.value = ""
    try {
        await store.closeSession(true)
    } catch (cause) {
        confirmError.value = toCloneErrorMessage(cause)
        return
    }
    closeConfirmOpen.value = false
    store.closeRequested = false
    if (!env.isApp) return
    await getCurrentWindow()
        .close()
        .catch(cause => {
            confirmError.value = toCloneErrorMessage(cause)
        })
}

function cancelClose() {
    closeConfirmOpen.value = false
    store.closeRequested = false
    confirmError.value = ""
}

async function acceptReconnect() {
    reconnectConfirmOpen.value = false
    store.reconnectPrompt = null
    try {
        await store.reconnect()
    } catch {
        // 错误由 store.lastError 与状态事件呈现
    }
}

async function revertReconnect() {
    reconnectConfirmOpen.value = false
    await store.revertReconnectOption()
}

async function cancelConnecting() {
    try {
        await store.closeSession(false)
    } catch (cause) {
        store.lastError = toCloneErrorMessage(cause)
    }
}

async function reconnectNow() {
    try {
        await store.reconnect()
    } catch {
        // 错误由状态事件呈现
    }
}

function startResize(direction: (typeof RESIZE_HANDLES)[number]["direction"]) {
    if (!env.isApp) return
    void getCurrentWindow()
        .startResizeDragging(direction)
        .catch(cause => {
            console.error("调整桌面分身窗口大小失败", cause)
        })
}

onMounted(() => {
    if (!env.isApp) return
    void store.init()
    if (!chromeRef.value) return
    chromeObserver = new ResizeObserver(entries => {
        const entry = entries[0]
        if (!entry) return
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
        if (Math.abs(height - lastChromeHeight) < 0.5) return
        lastChromeHeight = height
        void desktopCloneSetChromeHeight(height).catch(cause => {
            console.error("上报桌面分身标题栏高度失败", cause)
        })
    })
    chromeObserver.observe(chromeRef.value)
})

onBeforeUnmount(() => {
    chromeObserver?.disconnect()
    chromeObserver = null
    store.dispose()
    resetCloneOverlay()
})
</script>

<template>
    <div class="relative flex h-screen w-screen flex-col overflow-hidden bg-base-300 text-base-content">
        <header ref="chromeRef" class="shrink-0 select-none">
            <CloneTitleBar @close="requestClose" @open-control-center="openControlCenter" />
        </header>

        <!-- RDP 区域：原生子窗口由后端覆盖，这里只放状态层/覆盖层，不画其它内容 -->
        <main class="relative min-h-0 flex-1">
            <CloneStatusOverlay
                v-if="showStatusOverlay"
                @start="startConnection"
                @retry="startConnection"
                @reconnect="reconnectNow"
                @cancel="cancelConnecting"
            />
        </main>

        <!-- 边缘缩放：无边框窗口需要前端提供命中区域 -->
        <div
            v-for="handle in RESIZE_HANDLES"
            :key="handle.direction"
            class="absolute z-50"
            :class="handle.class"
            @mousedown.prevent="startResize(handle.direction)"
        />

        <CloneControlCenter :open="controlCenterOpen" @close="controlCenterOpen = false" />

        <CloneCredentialsDialog
            :open="credentialsOpen"
            :username-hint="credentialsHint"
            :busy="credentialsBusy"
            :error="credentialsError"
            @submit="submitCredentials"
            @cancel="cancelCredentials"
        />

        <CloneConfirmDialog
            :open="closeConfirmOpen"
            :title="t('desktop_clone.close.title')"
            :message="closeMessage"
            :confirm-text="t('desktop_clone.action.close_and_logoff')"
            :alt-text="t('desktop_clone.action.hide')"
            :busy="store.busy === 'close'"
            danger
            @confirm="closeAndLogoff"
            @alt="hideWindow"
            @cancel="cancelClose"
        />

        <CloneConfirmDialog
            :open="reconnectConfirmOpen"
            :title="t('desktop_clone.reconnect.title')"
            :message="reconnectMessage"
            :confirm-text="t('desktop_clone.reconnect.now')"
            :cancel-text="t('desktop_clone.reconnect.later')"
            :busy="store.busy === 'reconnect'"
            @confirm="acceptReconnect"
            @cancel="revertReconnect"
        />
    </div>
</template>
