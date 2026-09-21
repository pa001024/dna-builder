<script setup lang="ts">
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { fitScreenBarWindow, setScreenBarAlwaysOnTop, setScreenBarIgnoreCursorEvents } from "@/api/screen-bar-window"
import ScreenBarContent from "@/components/ScreenBarContent.vue"
import { useScreenBarContent } from "@/composables/useScreenBarContent"
import { env } from "@/env"
import { MIHAN_DATA_KEY, useMihanNotify } from "@/store/mihan"
import { useSettingStore } from "@/store/setting"
import { parseScreenBarConfig, SCREEN_BAR_STORAGE_KEY } from "@/utils/screen-bar"

/**
 * 屏幕信息条页面(独立 WebviewWindow,路由 `/screen-bar`)。
 *
 * 窗口由主窗口用 `openScreenBarWindow()` 创建,本页只负责三件事:按配置渲染条目、
 * 把窗口尺寸收紧到内容尺寸并水平居中到屏幕顶部、把置顶与鼠标穿透同步给窗口。
 * 数据全部来自 localStorage(配置 + 密函数据),因此本页不依赖游戏数据包。
 */
defineOptions({ name: "ScreenBarView" })

/** 跨窗口同步间隔(毫秒)。 */
const SYNC_POLL_MS = 1000

const setting = useSettingStore()
const mihanNotify = useMihanNotify()
const config = computed(() => setting.screenBar)
const { items } = useScreenBarContent(config)

const rootRef = ref<HTMLElement | null>(null)
let appWindow: ReturnType<typeof getCurrentWebviewWindow> | null = null
let observer: ResizeObserver | null = null
let syncTimer: number | null = null
/** 最近一次落位的尺寸,用于跳过重复测量,避免 setSize 引发的回流再次触发测量。 */
let lastSizeKey = ""
/** 已同步过的 localStorage 快照。 */
let syncedSnapshot = ""

/** 读取并解析 localStorage 中的 JSON;缺失或损坏时返回 undefined。 */
function readJson(key: string): unknown {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    try {
        return JSON.parse(raw)
    } catch {
        return undefined
    }
}

/**
 * 从 localStorage 同步配置与密函数据。
 *
 * 主窗口与信息条是两个独立 webview,不保证派发 storage 事件,因此按原始字符串比对低频轮询:
 * 主窗口改设置或整点刷新密函后,这里把手动 hydrate 回响应式引用。
 */
function syncFromStorage() {
    const snapshot = [localStorage.getItem(SCREEN_BAR_STORAGE_KEY) ?? "", localStorage.getItem(MIHAN_DATA_KEY) ?? ""].join("|")
    if (snapshot === syncedSnapshot) return
    syncedSnapshot = snapshot

    const rawConfig = localStorage.getItem(SCREEN_BAR_STORAGE_KEY)
    if (rawConfig !== null) {
        setting.screenBar = parseScreenBarConfig(rawConfig)
    }
    const storedMihan = readJson(MIHAN_DATA_KEY)
    if (Array.isArray(storedMihan)) {
        mihanNotify.mihanData.value = storedMihan as string[][]
    }
}

/** 测量内容尺寸并让窗口贴合内容、居中到屏幕顶部。 */
async function fitContent() {
    const element = rootRef.value
    const window = appWindow
    if (!element || !window) return
    const rect = element.getBoundingClientRect()
    const width = Math.max(1, Math.ceil(rect.width))
    const height = Math.max(1, Math.ceil(rect.height))
    const key = `${width}x${height}`
    if (key === lastSizeKey) return
    lastSizeKey = key
    await fitScreenBarWindow(window, setting.screenBar, { width, height })
}

/** 内容尺寸重算:先让 Vue 把新配置渲染到 DOM,再测量。 */
async function refit() {
    await nextTick()
    lastSizeKey = ""
    await fitContent()
}

watch(
    () => [setting.screenBar.items, setting.screenBar.scale, setting.screenBar.offsetY],
    () => void refit(),
    { deep: true }
)

watch(
    () => setting.screenBar.ignoreCursorEvents,
    value => {
        if (appWindow) void setScreenBarIgnoreCursorEvents(appWindow, value)
    }
)

onMounted(async () => {
    // 先建立同步,保证首次渲染用的是存储里的最新配置
    syncFromStorage()
    if (!env.isApp) return
    appWindow = getCurrentWebviewWindow()
    await setScreenBarAlwaysOnTop(appWindow, true)
    await setScreenBarIgnoreCursorEvents(appWindow, setting.screenBar.ignoreCursorEvents)
    observer = new ResizeObserver(() => void fitContent())
    if (rootRef.value) observer.observe(rootRef.value)
    await refit()
    await appWindow.show()
    syncTimer = window.setInterval(syncFromStorage, SYNC_POLL_MS)
})

onUnmounted(() => {
    observer?.disconnect()
    observer = null
    if (syncTimer !== null) {
        window.clearInterval(syncTimer)
        syncTimer = null
    }
})
</script>

<template>
    <!-- 根节点必须是 max-content:fit-content 会被视口宽度钳住,量出来的宽度永远超不过当前窗口宽度,窗口就再也撑不开 -->
    <div ref="rootRef" class="w-max overflow-hidden">
        <ScreenBarContent :items="items" :opacity="setting.screenBar.opacity" :scale="setting.screenBar.scale" />
    </div>
</template>
