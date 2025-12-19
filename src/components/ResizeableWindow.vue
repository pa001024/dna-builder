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
import { getInstanceInfo } from "../api/external"
import { timeStr, useGameTimer } from "../util"
import { useLocalStorage } from "@vueuse/core"
import { useSound } from "@vueuse/sound"
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import { missionsIngameQuery } from "../api/query"

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

const { mihan, moling, zhouben } = useGameTimer()

//#region 密函通知模块

const mihanEnableNotify = useLocalStorage("mihanNotify", false)
const mihanNotifyOnce = useLocalStorage("mihanNotifyOnce", true)
const mihanNotifyTypes = useLocalStorage("mihanNotifyTypes", [] as number[])
const mihanNotifyMissions = useLocalStorage("mihanNotifyMissions", [] as string[])
const mihanData = useLocalStorage<string[][] | undefined>("mihanData", [])
class MihanNotify {
    mihanData = mihanData
    mihanDataLastUpdate = useLocalStorage("mihanDataLastUpdate", 0)
    mihanEnableNotify = mihanEnableNotify
    mihanNotifyOnce = mihanNotifyOnce
    mihanNotifyTypes = mihanNotifyTypes
    mihanNotifyMissions = mihanNotifyMissions
    sfx = useSound("/sfx/notice.mp3")
    watch = false
    constructor() {
        this.updateMihanData()

        watchEffect(() => {
            if (this.mihanEnableNotify.value) {
                this.startWatch()
            }
        })
    }
    async updateMihanData() {
        if (this.mihanData.value && !this.shouldUpdate()) return true
        console.log("update mihan data")
        const data = await missionsIngameQuery()
        if (!data?.missions || JSON.stringify(data.missions) === JSON.stringify(this.mihanData.value)) return false
        this.mihanData.value = data.missions
        this.mihanDataLastUpdate.value = new Date().getTime()
        return true
    }
    show() {
        const dialog = document.getElementById("mihan-dialog") as HTMLDialogElement
        dialog.show()
    }
    async showMihanNotification() {
        if (this.mihanNotifyOnce.value) {
            this.mihanEnableNotify.value = false
        }
        if (env.isApp) {
            const matchedTypes = this.mihanData
                .value!.filter(
                    (list, type) =>
                        this.mihanNotifyTypes.value.includes(type) && list.some((v) => this.mihanNotifyMissions.value.includes(v)),
                )
                .map(
                    (list, type) =>
                        `${MihanNotify.TYPES[type]}-${list.filter((v) => this.mihanNotifyMissions.value.includes(v)).join("、")}`,
                )
            let permissionGranted = await isPermissionGranted()
            if (!permissionGranted) {
                const permission = await requestPermission()
                permissionGranted = permission === "granted"
            }
            if (permissionGranted) {
                sendNotification({
                    title: "委托密函提醒",
                    body: `你关注的${matchedTypes.join("和")}刷新了`,
                })
            }
        }
        this.sfx.play()
        this.show()
    }
    getNextUpdateTime(t?: number) {
        const now = t ?? new Date().getTime()
        const oneHour = 60 * 60 * 1000
        return Math.ceil(now / oneHour) * oneHour
    }
    shouldUpdate() {
        return this.getNextUpdateTime(this.mihanDataLastUpdate.value) <= new Date().getTime()
    }
    shouldNotify() {
        if (
            this.mihanData.value?.some(
                (list, type) => this.mihanNotifyTypes.value.includes(type) && list.some((v) => this.mihanNotifyMissions.value.includes(v)),
            )
        ) {
            return true
        }
        return false
    }
    async checkNotify() {
        if (this.shouldNotify()) {
            await this.showMihanNotification()
        }
    }
    sleep(duration: number) {
        return new Promise((resolve) => setTimeout(resolve, duration))
    }
    startWatch() {
        if (this.watch) return
        console.log("start watch")
        this.watch = true
        const next = this.getNextUpdateTime()
        const duration = next - new Date().getTime()
        setTimeout(async () => {
            this.watch = false
            let ok = await this.updateMihanData()
            let c = 0
            while (!ok && c < 3) {
                c++
                console.log("update mihan data failed, retry in 3s")
                ok = await this.updateMihanData()
                await this.sleep(3e3)
            }
            await this.checkNotify()
            if (this.mihanEnableNotify.value) this.startWatch()
        }, duration + 3e3)
    }
    static TYPES = ["角色", "武器", "魔之楔"]
    static MISSIONS = ["探险/无尽", "驱离", "拆解", "驱逐", "避险", "扼守/无尽", "护送", "勘探/无尽", "追缉", "调停", "迁移"]
}
const mihanNotify = new MihanNotify()

//#endregion
</script>
<template>
    <!-- Root -->
    <div class="relative w-full h-full flex overflow-hidden bg-base-100/30 rounded-lg">
        <!-- SideBar -->
        <slot v-if="route.name !== 'sroom'" name="sidebar"></slot>
        <!-- Header -->
        <div className="relative flex flex-col overflow-hidden w-full h-full">
            <!-- ActionBar -->
            <div class="relative w-full h-10 pb-1 mt-1 flex items-center space-x-1 sm:space-x-2 pl-2 pr-1">
                <div :data-tauri-drag-region="draggable" className="w-full h-full font-semibold text-2xl flex items-center space-x-2">
                    <img :src="icon" class="w-6 h-6" />
                    <span className="max-[370px]:hidden text-sm min-w-20">{{ route.name !== "sroom" ? title : ui.schatTitle }}</span>
                    <!-- 计时器 -->
                    <div class="flex ml-4 gap-8 items-center text-xs text-base-content/80">
                        <div class="inline-block text-center w-16 cursor-pointer" @click="mihanNotify.show()">
                            <div>密函</div>
                            <div class="font-orbitron">{{ timeStr(mihan) }}</div>
                        </div>
                        <div class="inline-block text-center w-16">
                            <div>魔灵</div>
                            <div class="font-orbitron">{{ timeStr(moling) }}</div>
                        </div>
                        <div class="inline-block text-center w-16">
                            <div>周本</div>
                            <div class="font-orbitron">{{ timeStr(zhouben) }}</div>
                        </div>
                    </div>
                    <dialog id="mihan-dialog" class="modal">
                        <div class="modal-box bg-base-300 text-md">
                            <div class="text-lg font-bold flex justify-between items-center pb-2">
                                委托密函

                                <form class="flex justify-end gap-2" method="dialog">
                                    <button class="btn btn-ghost btn-sm btn-square">
                                        <Icon bold icon="codicon:chrome-close" />
                                    </button>
                                </form>
                            </div>
                            <div class="p-4 grid grid-cols-3">
                                <div
                                    v-for="(item, missionId) in mihanData"
                                    :key="missionId"
                                    class="flex flex-col justify-start items-center"
                                >
                                    <div class="flex flex-col justify-center items-center gap-2">
                                        <img
                                            class="w-12 h-12"
                                            :src="`/imgs/${MihanNotify.TYPES[missionId]}密函.png`"
                                            :alt="`${MihanNotify.TYPES[missionId]}密函`"
                                        />
                                        <div
                                            class="font-bold"
                                            :style="{
                                                color: ['#ba9011', '#1171ba', '#ba1111'][missionId],
                                            }"
                                        >
                                            {{ MihanNotify.TYPES[missionId] }}
                                        </div>
                                    </div>
                                    <div class="divider mx-4 my-2"></div>
                                    <div
                                        v-for="(mission, index) in item"
                                        :key="index"
                                        class="text-sm p-1"
                                        :class="{ 'text-secondary': mihanNotifyMissions.includes(mission) }"
                                    >
                                        {{ mission }}
                                    </div>
                                </div>
                            </div>
                            <div class="flex justify-center bg-base-100 p-3 rounded-md text-sm text-base-content/80">
                                下次刷新: {{ timeStr(mihan) }}
                            </div>
                            <div class="p-4 flex flex-col gap-2">
                                <div class="text-lg font-bold pb-2">监控设置</div>
                                <div class="flex gap-2">
                                    <label class="text-sm p-1 label">
                                        <input v-model="mihanEnableNotify" type="checkbox" class="toggle toggle-secondary" />
                                        启用提醒
                                    </label>
                                    <label v-if="mihanEnableNotify" class="text-sm p-1 label">
                                        <input v-model="mihanNotifyOnce" type="checkbox" class="toggle toggle-secondary" />
                                        仅一次
                                    </label>
                                </div>
                                <div v-if="mihanEnableNotify" class="flex gap-2">
                                    <label v-for="(type, val) in MihanNotify.TYPES" :key="type" class="text-sm p-1 label">
                                        <input
                                            v-model="mihanNotifyTypes"
                                            :value="val"
                                            name="mihanTypes"
                                            type="checkbox"
                                            class="toggle toggle-secondary"
                                        />
                                        {{ type }}
                                    </label>
                                </div>
                                <div v-if="mihanEnableNotify" class="flex gap-2 flex-wrap">
                                    <label v-for="mission in MihanNotify.MISSIONS" :key="mission" class="text-sm p-1 label">
                                        <input
                                            v-model="mihanNotifyMissions"
                                            :value="mission"
                                            name="mihanMissions"
                                            type="checkbox"
                                            class="toggle toggle-secondary"
                                        />
                                        {{ mission }}
                                    </label>
                                </div>
                            </div>
                        </div>
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
        </div>
    </div>
</template>
