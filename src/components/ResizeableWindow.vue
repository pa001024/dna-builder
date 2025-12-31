<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core"
import { exit } from "@tauri-apps/plugin-process"
import { onMounted, onUnmounted, ref, watch, watchEffect } from "vue"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"
import Tooltip from "./Tooltip.vue"
import Icon from "./Icon.vue"
import { env } from "../env"
import { useRoute } from "vue-router"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { applyMaterial, getOSVersion } from "../api/app"
import { timeStr, useGameTimer } from "../util"

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
const isDark = ref(setting.theme === "dark")

if (env.isApp) {
    appWindow = getCurrentWindow()
    appWindow.setDecorations(false)
    if (setting.winMaterial !== "Unset") {
        applyMaterial(setting.winMaterial as any)
    } else {
        getOSVersion().then((ver) => {
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
    watch(alwaysOnTop, (newValue) => {
        appWindow.setAlwaysOnTop(newValue)
    })
}

watch(isDark, async (newValue) => {
    setting.theme = newValue ? "dark" : "light"
    setting.windowTrasnparent = !newValue
})

function handleMinimize() {
    appWindow.minimize()
}

async function handleMaximize() {
    const state = await appWindow.isMaximized()
    state ? appWindow.unmaximize() : appWindow.maximize()
}

async function handleClose() {
    const win = getCurrentWindow()

    if (win.label === "main") {
        invoke("app_close").catch(() => exit())
    } else {
        win.close()
    }
}

watch(alwaysOnTop, async (newValue) => {
    await appWindow.setAlwaysOnTop(newValue)
})

let unlisten: Function

if (env.isApp) {
    onMounted(async () => {
        unlisten = await appWindow.listen("tauri://resize", async () => {
            maximized.value = await appWindow.isMaximized()
        })
    })

    onUnmounted(() => {
        unlisten?.()
    })
}

onMounted(() => {
    ui.previewImageElm = document.getElementById("preview-image") as HTMLElement
})

const { mihan, moling, zhouben } = useGameTimer()

watchEffect(() => {
    document.title = props.title || "Duet Night Abyss Builder"
})
</script>
<template>
    <!-- Root -->
    <div class="relative w-full h-full flex overflow-hidden bg-base-100/30 rounded-lg">
        <!-- SideBar -->
        <slot v-if="route" name="sidebar"></slot>
        <!-- Header -->
        <div className="relative flex flex-col overflow-hidden w-full h-full">
            <!-- ActionBar -->
            <div class="relative w-full h-10 pb-1 mt-1 flex items-center space-x-1 sm:space-x-2 pl-2 pr-1">
                <div :data-tauri-drag-region="draggable" className="w-full h-full font-semibold text-2xl flex items-center space-x-2">
                    <img :src="icon" class="w-6 h-6" />
                    <span className="max-[370px]:hidden text-sm min-w-20">{{ title }}</span>
                    <!-- 计时器 -->
                    <div class="flex ml-4 gap-8 items-center text-xs text-base-content/80">
                        <div class="inline-block text-center min-w-16 cursor-pointer" @click="ui.mihanVisible = true">
                            <div class="whitespace-nowrap">{{ $t("resizeableWindow.mihan") }}</div>
                            <div class="font-orbitron">{{ timeStr(mihan) }}</div>
                        </div>
                        <div class="hidden sm:inline-block text-center min-w-16">
                            <div class="whitespace-nowrap">{{ $t("resizeableWindow.moling") }}</div>
                            <div class="font-orbitron">{{ timeStr(moling) }}</div>
                        </div>
                        <div class="hidden sm:inline-block text-center min-w-16">
                            <div class="whitespace-nowrap">{{ $t("resizeableWindow.zhouben") }}</div>
                            <div class="font-orbitron">{{ timeStr(zhouben) }}</div>
                        </div>
                    </div>
                    <dialog class="modal" :class="{ 'modal-open': ui.mihanVisible }">
                        <div class="modal-box bg-base-300 text-md">
                            <div class="text-lg font-bold flex justify-between items-center pb-2">
                                {{ $t("resizeableWindow.mihanTitle") }}

                                <form class="flex justify-end gap-2" method="dialog">
                                    <button class="btn btn-ghost btn-sm btn-square" @click="ui.mihanVisible = false">
                                        <Icon bold icon="codicon:chrome-close" />
                                    </button>
                                </form>
                            </div>
                            <DNAMihan />
                        </div>

                        <div class="modal-backdrop" @click="ui.mihanVisible = false"></div>
                    </dialog>
                </div>
                <!-- fix resize shadow -->
                <div class="pointer-events-none flex-none opacity-0 self-start transition-none" v-if="env.isApp">
                    <div class="flex items-center space-x-2">
                        <label class="btn btn-ghost btn-sm btn-square swap swap-rotate" v-if="darkable">
                            <!-- this hidden checkbox controls the state -->
                            <input type="checkbox" class="theme-controller" value="dark" v-model="isDark" />

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
                        <button class="btn btn-ghost btn-sm btn-square"></button>
                        <button class="btn btn-ghost btn-sm btn-square disabled:bg-transparent" :disabled="!minimizable"></button>
                        <button class="btn btn-ghost btn-sm btn-square disabled:bg-transparent" :disabled="!maximizable"></button>
                        <button class="btn btn-ghost btn-sm btn-square"></button>
                    </div>
                </div>
                <!-- fix resize -->
                <div class="pointer-events-none fixed right-1 top-1" v-if="env.isApp">
                    <div class="flex pointer-events-auto items-center space-x-2">
                        <label class="btn btn-ghost btn-sm btn-square swap swap-rotate" v-if="darkable">
                            <!-- this hidden checkbox controls the state -->
                            <input type="checkbox" class="theme-controller" value="dark" v-model="isDark" />

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
                        <Tooltip side="bottom" :tooltip="alwaysOnTop ? $t('main.btn_unpin_window') : $t('main.btn_pin_window')">
                            <button class="btn btn-ghost btn-sm btn-square" @click="alwaysOnTop = !alwaysOnTop">
                                <Icon bold icon="ri:pushpin-2-fill" v-if="alwaysOnTop" />
                                <Icon bold icon="ri:pushpin-fill" v-else />
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
                            <Icon bold icon="codicon:chrome-maximize" v-if="!maximized" />
                            <Icon bold icon="codicon:chrome-restore" v-else />
                        </button>
                        <button class="btn btn-ghost btn-sm btn-square" @click="handleClose">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </div>
                </div>
            </div>
            <!-- Body -->
            <div :class="{ 'rounded-tl-box': !!$slots.sidebar }" class="w-full relative bg-base-200/50 flex-1 overflow-hidden shadow-inner">
                <slot></slot>
            </div>

            <!-- 全局悬浮放大层 -->
            <div
                v-if="ui.previewVisible || ui.isHoveringPreview"
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
            <dialog class="modal" :class="{ 'modal-open': ui.dialogVisible }">
                <div class="modal-box bg-base-300">
                    <p class="text-lg font-bold">{{ ui.dialogTitle }}</p>
                    <p class="py-4 text-base-content/60">{{ ui.dialogContent }}</p>
                    <div class="modal-action">
                        <div class="flex justify-end gap-2">
                            <button class="min-w-20 btn btn-secondary" @click="ui.confirmDialog">{{ $t("setting.confirm") }}</button>
                            <button class="min-w-20 btn btn-ghost" @click="ui.cancelDialog">{{ $t("setting.cancel") }}</button>
                        </div>
                    </div>
                </div>
                <!-- 模态框背景 -->
                <div class="modal-backdrop" @click="ui.cancelDialog"></div>
            </dialog>
            <transition name="slide-right">
                <div
                    v-if="ui.errorMessage"
                    @click="ui.errorMessage = ''"
                    role="alert"
                    class="alert alert-error absolute bottom-8 right-8 cursor-pointer"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <span>{{ ui.errorMessage }}</span>
                </div>
            </transition>
            <transition name="slide-right">
                <div
                    v-if="ui.successMessage"
                    @click="ui.successMessage = ''"
                    role="alert"
                    class="alert alert-success absolute bottom-8 right-8 cursor-pointer"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <span>{{ ui.successMessage }}</span>
                </div>
            </transition>
        </div>
    </div>
</template>
