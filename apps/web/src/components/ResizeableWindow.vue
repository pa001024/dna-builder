<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { exit } from "@tauri-apps/plugin-process"
import { onMounted, onUnmounted, ref, watch, watchEffect } from "vue"
import { useRoute } from "vue-router"
import { applyMaterial, getOSVersion } from "@/api/app"
import { env } from "@/env"
import { i18nLanguages } from "@/i18n"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"

const props = defineProps({
    title: { type: String },
    icon: { type: String, default: "/app-icon.png" },
    resizable: { type: Boolean, default: true },
    darkable: { type: Boolean, default: false },
    pinable: { type: Boolean, default: false },
    minimizable: { type: Boolean, default: true },
    maximizable: { type: Boolean, default: true },
    closable: { type: Boolean, default: true },
    draggable: { type: Boolean, default: true },
})

let appWindow: ReturnType<typeof getCurrentWindow>

const route = useRoute()
const ui = useUIStore()
const setting = useSettingStore()
const alwaysOnTop = ref(false)
const maximized = ref(false)
const sidebarRef = ref<typeof import("@/components/Sidebar.vue").default>()
// 自定义主题按 colorScheme 决定初始明暗图标状态
const isDark = ref(setting.theme === "dark" || (setting.theme === "custom" && setting.customTheme.colorScheme === "dark"))
const langDialogOpen = ref(false)
const langDialogRef = ref<HTMLDialogElement | null>(null)
// 主窗口关闭方式二次确认弹窗：closeRemember 勾选后把本次选择写入 setting.closeAction
const closeDialogOpen = ref(false)
const closeDialogRef = ref<HTMLDialogElement | null>(null)
const closeRemember = ref(false)

if (env.isApp) {
    appWindow = getCurrentWindow()
    appWindow.setDecorations(false)
    if (setting.winMaterial !== "Unset") {
        applyMaterial(setting.winMaterial as any)
    } else {
        getOSVersion().then(ver => {
            if (ver.startsWith("11")) {
                setting.setWinMaterial("Acrylic")
            } else {
                setting.setWinMaterial("Blur")
            }
        })
    }

    watchEffect(() => {
        appWindow.setResizable(props.resizable)
    })
    watch(alwaysOnTop, newValue => {
        appWindow.setAlwaysOnTop(newValue)
    })
}

watch(isDark, async newValue => {
    setting.theme = newValue ? "dark" : "light"
    setting.windowTrasnparent = !newValue
})

function handleMinimize() {
    appWindow.minimize()
}

async function handleMaximize() {
    const state = await appWindow.isMaximized()
    if (state) {
        appWindow.unmaximize()
    } else {
        appWindow.maximize()
    }
}

async function doMinimizeToTray() {
    await getCurrentWindow().hide()
}

async function doExitApp() {
    await invoke("app_close").catch(() => exit())
}

async function handleClose() {
    const win = getCurrentWindow()

    if (win.label !== "main") {
        win.close()
        return
    }
    if (setting.closeAction === "minimize") {
        await doMinimizeToTray()
        return
    }
    if (setting.closeAction === "exit") {
        await doExitApp()
        return
    }
    closeRemember.value = false
    closeDialogOpen.value = true
    closeDialogRef.value?.showModal()
}

function cancelCloseDialog() {
    if (!closeDialogOpen.value) {
        return
    }
    closeDialogOpen.value = false
    closeDialogRef.value?.close()
}

async function chooseCloseAction(choice: "minimize" | "exit") {
    if (closeRemember.value) {
        setting.closeAction = choice
    }
    closeDialogOpen.value = false
    closeDialogRef.value?.close()
    if (choice === "minimize") {
        await doMinimizeToTray()
    } else {
        await doExitApp()
    }
}

watch(alwaysOnTop, async newValue => {
    await appWindow.setAlwaysOnTop(newValue)
})

function openLangDialog() {
    if (langDialogOpen.value) {
        return
    }
    langDialogOpen.value = true
    langDialogRef.value?.showModal()
}

function closeLangDialog() {
    if (!langDialogOpen.value) {
        return
    }
    langDialogOpen.value = false
    langDialogRef.value?.close()
}

function changeLanguage(lang: string) {
    setting.setLang(lang)
    closeLangDialog()
}

let unlisten: () => void
let unlistenCloseRequested: (() => void) | undefined

if (env.isApp) {
    onMounted(async () => {
        unlisten = await appWindow.listen("tauri://resize", async () => {
            maximized.value = await appWindow.isMaximized()
        })
        // 拦截系统级关闭（Alt+F4 / 任务栏右键关闭），走与标题栏关闭按钮同一套二次确认逻辑；
        // 真正退出走 Rust 侧 app_close 直接结束进程，不会再触发本回调
        try {
            if (appWindow.label === "main") {
                unlistenCloseRequested = await appWindow.onCloseRequested(event => {
                    event.preventDefault()
                    void handleClose()
                })
            }
        } catch {
            // 非桌面窗口忽略
        }
    })

    onUnmounted(() => {
        unlisten?.()
        unlistenCloseRequested?.()
    })
}

onMounted(() => {
    ui.previewImageElm = document.getElementById("preview-image") as HTMLElement
})

watchEffect(() => {
    document.title = props.title ? props.title + " - DOB" : "Duet Night Abyss Builder"
})
</script>
<template>
    <!-- Root -->
    <div class="relative w-full h-full flex overflow-hidden bg-base-100/30 rounded-lg">
        <!-- SideBar -->
        <Sidebar v-if="route && !route.meta.noSidebar" ref="sidebarRef" />
        <!-- Header -->
        <div className="relative flex flex-col overflow-hidden w-full h-full">
            <!-- ActionBar -->
            <div class="relative w-full h-10 pb-1 mt-1 flex items-center space-x-1 sm:space-x-2 pl-2 pr-1">
                <div :data-tauri-drag-region="draggable" className="w-full h-full font-semibold text-2xl flex items-center space-x-2">
                    <button class="btn btn-sm btn-square btn-ghost hover:bg-base-100/30" @click="$router.back()">
                        <Icon icon="ri:arrow-left-line" />
                    </button>
                    <button class="sm:hidden btn btn-sm btn-square btn-ghost hover:bg-base-100/30" @click="sidebarRef?.openMobileDrawer()">
                        <Icon icon="ri:menu-line" />
                    </button>
                    <span className="max-[370px]:hidden text-sm min-w-20">{{ title }}</span>
                    <ResizeableWindowTimers />
                </div>
                <!-- fix resize shadow -->
                <div class="pointer-events-none flex-none opacity-0 self-start transition-none">
                    <div class="flex items-center space-x-2">
                        <button class="btn btn-ghost btn-sm btn-square" type="button" :title="$t('setting.lang')">
                            <Icon bold icon="ri:translate-2" />
                        </button>
                        <label v-if="darkable" class="btn btn-ghost btn-sm btn-square swap swap-rotate">
                            <!-- this hidden checkbox controls the state -->
                            <input v-model="isDark" type="checkbox" class="theme-controller" value="dark" />

                            <!-- sun icon -->
                            <svg class="swap-off fill-current w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path
                                    d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
                                />
                            </svg>

                            <!-- moon icon -->
                            <svg class="swap-on fill-current w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path
                                    d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
                                />
                            </svg>
                        </label>
                        <template v-if="env.isApp">
                            <button class="btn btn-ghost btn-sm btn-square" />
                            <button class="btn btn-ghost btn-sm btn-square disabled:bg-transparent" :disabled="!minimizable" />
                            <button class="btn btn-ghost btn-sm btn-square disabled:bg-transparent" :disabled="!maximizable" />
                            <button class="btn btn-ghost btn-sm btn-square" />
                        </template>
                    </div>
                </div>
                <!-- fix resize: 语言/主题切换 App 与 Web 均显示，窗口控制仅 App 显示 -->
                <div class="pointer-events-none fixed right-1 top-1">
                    <div class="flex pointer-events-auto items-center space-x-2">
                        <button class="btn btn-ghost btn-sm btn-square" type="button" :title="$t('setting.lang')" @click="openLangDialog">
                            <Icon bold icon="ri:translate-2" />
                        </button>
                        <label v-if="darkable" class="btn btn-ghost btn-sm btn-square swap swap-rotate">
                            <!-- this hidden checkbox controls the state -->
                            <input v-model="isDark" type="checkbox" class="theme-controller" value="dark" />

                            <!-- sun icon -->
                            <svg class="swap-off fill-current w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path
                                    d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"
                                />
                            </svg>

                            <!-- moon icon -->
                            <svg class="swap-on fill-current w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                                <path
                                    d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"
                                />
                            </svg>
                        </label>
                        <template v-if="env.isApp">
                            <Tooltip side="bottom" :tooltip="alwaysOnTop ? $t('main.btn_unpin_window') : $t('main.btn_pin_window')">
                                <button class="btn btn-ghost btn-sm btn-square" @click="alwaysOnTop = !alwaysOnTop">
                                    <Icon v-if="alwaysOnTop" bold icon="ri:pushpin-2-fill" />
                                    <Icon v-else bold icon="ri:pushpin-fill" />
                                </button>
                            </Tooltip>
                            <button
                                class="btn btn-ghost btn-sm btn-square disabled:bg-transparent"
                                :disabled="!minimizable"
                                @click="handleMinimize"
                            >
                                <Icon bold icon="codicon:chrome-minimize" />
                            </button>
                            <button
                                class="btn btn-ghost btn-sm btn-square disabled:bg-transparent"
                                :disabled="!maximizable"
                                @click="handleMaximize"
                            >
                                <Icon v-if="!maximized" bold icon="codicon:chrome-maximize" />
                                <Icon v-else bold icon="codicon:chrome-restore" />
                            </button>
                            <button class="btn btn-ghost btn-sm btn-square hover:btn-error" @click="handleClose">
                                <Icon bold icon="codicon:chrome-close" />
                            </button>
                        </template>
                    </div>
                </div>
            </div>
            <dialog
                ref="langDialogRef"
                class="modal"
                :class="{ 'modal-open': langDialogOpen }"
                @close="langDialogOpen = false"
                @click="closeLangDialog"
            >
                <div class="modal-box bg-base-300" @click.stop>
                    <div class="flex items-center justify-between pb-4">
                        <div class="text-lg font-bold">
                            {{ $t("setting.lang") }}
                        </div>
                        <button class="btn btn-ghost btn-sm btn-square" type="button" @click="closeLangDialog">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </div>
                    <div class="grid gap-2">
                        <button
                            v-for="lang in i18nLanguages"
                            :key="lang.code"
                            class="btn btn-ghost justify-between"
                            :class="{ 'btn-primary': setting.lang === lang.code }"
                            type="button"
                            @click="changeLanguage(lang.code)"
                        >
                            <span>{{ lang.name }}</span>
                            <Icon v-if="setting.lang === lang.code" icon="ri:checkbox-circle-fill" />
                        </button>
                    </div>
                </div>
            </dialog>
            <!-- 主窗口关闭方式二次确认：最小化到托盘 / 退出程序 + 记住设置 -->
            <dialog
                ref="closeDialogRef"
                class="modal"
                :class="{ 'modal-open': closeDialogOpen }"
                @close="closeDialogOpen = false"
                @click="cancelCloseDialog"
            >
                <div class="modal-box bg-base-300" @click.stop>
                    <div class="flex items-center justify-between pb-2">
                        <div class="text-lg font-bold">
                            {{ $t("setting.closeDialogTitle") }}
                        </div>
                        <button class="btn btn-ghost btn-sm btn-square" type="button" @click="cancelCloseDialog">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </div>
                    <p class="pb-3 text-sm text-base-content/60">{{ $t("setting.closeDialogTip") }}</p>
                    <div class="grid gap-2">
                        <button
                            type="button"
                            class="btn btn-ghost justify-start gap-2 hover:btn-primary"
                            @click="chooseCloseAction('minimize')"
                        >
                            <Icon bold icon="codicon:chrome-minimize" />
                            <span>{{ $t("setting.closeMinimize") }}</span>
                        </button>
                        <button
                            type="button"
                            class="btn btn-ghost justify-start gap-2 hover:btn-error"
                            @click="chooseCloseAction('exit')"
                        >
                            <Icon icon="ri:logout-circle-r-line" />
                            <span>{{ $t("setting.closeExit") }}</span>
                        </button>
                    </div>
                    <label class="mt-3 flex cursor-pointer items-center gap-2 text-sm text-base-content/70">
                        <input v-model="closeRemember" type="checkbox" class="checkbox checkbox-sm checkbox-secondary" />
                        {{ $t("setting.closeRemember") }}
                    </label>
                </div>
            </dialog>
            <!-- Body -->
            <div :class="{ 'rounded-tl-box': !!$slots.sidebar }" class="w-full relative bg-base-200/50 flex-1 overflow-hidden shadow-inner">
                <slot />
            </div>

            <!-- 全局悬浮放大层 -->
            <div
                v-show="ui.previewVisible || ui.isHoveringPreview"
                id="preview-image"
                class="z-50"
                @mouseenter="ui.isHoveringPreview = true"
                @mouseleave="ui.isHoveringPreview = false"
            >
                <div class="bg-base-100 p-2 rounded-lg shadow-2xl border border-base-200">
                    <img :src="ui.previewImageUrl" alt="图片预览" class="max-w-full max-h-96 object-contain rounded" />
                </div>
            </div>
            <!-- 全局通用浮层 -->
            <dialog class="modal z-3000" :class="{ 'modal-open': ui.dialogVisible }">
                <div class="modal-box bg-base-300">
                    <p class="text-lg font-bold">
                        {{ ui.dialogTitle }}
                    </p>
                    <p class="py-4 text-base-content/60">
                        {{ ui.dialogContent }}
                    </p>
                    <div class="modal-action">
                        <button class="min-w-24 btn" @click="ui.cancelDialog">
                            {{ $t("取消") }}
                        </button>
                        <button class="min-w-24 btn btn-primary" @click="ui.confirmDialog">
                            {{ $t("setting.confirm") }}
                        </button>
                    </div>
                </div>
                <!-- 模态框背景 -->
                <div class="modal-backdrop" @click="ui.cancelDialog" />
            </dialog>
            <!-- 全局提示队列（ui store 的 toasts 驱动）：右下角堆叠，多条共存；TransitionGroup 接管退场动画 -->
            <div class="pointer-events-none absolute right-8 bottom-8 z-10000 flex flex-col items-end gap-2">
                <TransitionGroup name="toast-slide">
                    <div
                        v-for="toast in ui.toasts"
                        :key="toast.id"
                        role="alert"
                        title="点击关闭"
                        class="pointer-events-auto flex max-w-md cursor-pointer items-start gap-2 rounded-xs border bg-base-100/60 px-4 py-2.5 shadow-lg backdrop-blur-lg"
                        :class="toast.kind === 'error' ? 'border-error/40 hover:border-error/70' : 'border-success/40 hover:border-success/70'"
                        @click="ui.dismissToast(toast.id)"
                    >
                        <Icon
                            :icon="toast.kind === 'error' ? 'ri:error-warning-line' : 'ri:checkbox-circle-line'"
                            class="mt-0.5 size-5 shrink-0"
                            :class="toast.kind === 'error' ? 'text-error' : 'text-success'"
                        />
                        <span class="text-left text-sm leading-snug text-base-content/85">{{ toast.message }}</span>
                        <button
                            v-if="toast.sticky"
                            class="ml-1 shrink-0 cursor-pointer rounded-xs p-0.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
                            aria-label="关闭提示"
                            @click.stop="ui.dismissToast(toast.id)"
                        >
                            <Icon icon="ri:close-line" class="block size-4" />
                        </button>
                    </div>
                </TransitionGroup>
            </div>
        </div>
    </div>
</template>

<style scoped>
/*
 * 提示条专用转场：不能复用全局 .slide-right。
 * App.vue 里的 .slide-right-enter-active 带 position:absolute / inset:0（页面进出场叠放用），
 * 套到提示条上会让它在整段入场动画里被压成「只剩图标」的小盒，文字被挤出可视区。
 * 这里只过渡 opacity 与 transform（不用 all，避免宽高参与过渡），盒子尺寸全程稳定，堆叠不跳动。
 * 队列增删时剩余提示用 move 过渡平滑归位；退场动画由 TransitionGroup 保留节点完成。
 */
.toast-slide-move {
    transition: transform 0.25s ease;
}
.toast-slide-enter-active {
    transition:
        opacity 0.24s ease-out,
        transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-slide-leave-active {
    transition:
        opacity 0.2s ease-in,
        transform 0.2s cubic-bezier(0.6, -0.28, 0.73, 0.04);
}

.toast-slide-enter-from,
.toast-slide-leave-to {
    opacity: 0;
    transform: translateX(2rem);
}

@media (prefers-reduced-motion: reduce) {
    .toast-slide-enter-active,
    .toast-slide-leave-active {
        transition: none;
    }
}
</style>
