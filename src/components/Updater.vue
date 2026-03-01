<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { onMounted, ref } from "vue"
import pg from "../../package.json"
import { checkUpdate, downloadAndInstallUpdate } from "../api/update"
import { env } from "../env"
import { useUIStore } from "../store/ui"

const ui = useUIStore()

const isUpdating = ref(false)
const updateProgress = ref(0)

// Welcome popup functionality
const showModal = ref(false)
const versions = ref<{ version: string; msg: string }[]>([])
const lastPopupVersion = useLocalStorage("lastPopupVersion", "v0.0.0")
const currentVersion = `v${pg.version}`

// Fetch versions from versions.json
async function fetchVersions() {
    try {
        const response = await fetch("/versions.json")
        const data = await response.json()
        versions.value = data
    } catch (error) {
        console.error("Failed to fetch versions:", error)
    }
}

// 版本比较函数，正确比较语义化版本号
function compareVersions(v1: string, v2: string): number {
    // 移除版本号前缀"v"并分割成数字数组
    const parts1 = v1.replace("v", "").split(".").map(Number)
    const parts2 = v2.replace("v", "").split(".").map(Number)

    // 比较每个部分
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0
        const p2 = parts2[i] || 0

        if (p1 > p2) return 1
        if (p1 < p2) return -1
    }

    return 0
}

// Check if there are new versions to show
function checkNewVersions() {
    if (!versions.value.length) return

    // Get versions newer than lastPopupVersion
    const newVersions = versions.value.filter(version => {
        return compareVersions(version.version, lastPopupVersion.value) > 0
    })

    if (newVersions.length > 0) {
        showModal.value = true
    }
}

// Close modal and update last popup version
function closeModal() {
    showModal.value = false
    setTimeout(() => {
        lastPopupVersion.value = currentVersion
    }, 1000)
}

async function updateApp() {
    const updateInfo = await checkUpdate()
    if (updateInfo) {
        const message = t("updater.newVersionMessage", { version: updateInfo.latestVersion, body: updateInfo.body || "" })
        if (await ui.showDialog(t("updater.newVersionTitle"), message)) {
            try {
                isUpdating.value = true
                await downloadAndInstallUpdate(progress => {
                    updateProgress.value = progress
                    // console.log(`下载进度: ${progress}%`)
                })
            } catch (error: any) {
                console.error("更新失败:", error)
                await ui.showDialog(t("updater.updateFailed"), error || t("updater.updateErrorMessage"))
            } finally {
                updateProgress.value = 0
                isUpdating.value = false
            }
        }
    }
}

async function siteCheck() {
    if (location.hostname === "xn--chq26veyq.icu") {
        if (await ui.showDialog("是否跳转到新站点?", "新站点地址: https://dna-builder.cn/")) {
            window.location.href = "https://dna-builder.cn/"
        }
    }
}

// Initialize on mount
onMounted(async () => {
    if (env.isApp) {
        await updateApp()
    } else {
        await siteCheck()
    }
    await fetchVersions()
    checkNewVersions()
})

window.updateApp = updateApp

declare global {
    interface Window {
        updateApp: () => Promise<void>
    }
}
</script>
<template>
    <div
        v-if="isUpdating"
        class="fixed h-screen w-screen bg-base-100/50 backdrop-blur-lg flex flex-col gap-4 p-8 justify-center items-center rounded-md shadow-md z-100"
    >
        {{ $t("updater.updating") }}
        <progress class="progress progress-primary w-1/2" :value="updateProgress" max="100" />
    </div>
    <!-- Welcome Popup Modal using daisyUI dialog -->
    <dialog ref="dialogRef" class="modal" :class="{ 'modal-open': showModal }" @click="closeModal">
        <div class="modal-box bg-base-100 w-[80%] min-w-72 max-w-160" @click.stop>
            <div class="text-center">
                <h3 class="text-xl font-bold">{{ $t("home.welcome") }} {{ currentVersion }}</h3>
                <p class="text-sm text-gray-500">
                    {{ $t("home.update_log") }}
                </p>
            </div>
            <div class="max-h-96 overflow-y-auto py-4">
                <div v-if="versions.length > 0" class="space-y-4">
                    <div
                        v-for="version in versions.filter(v => compareVersions(v.version, lastPopupVersion) > 0)"
                        :key="version.version"
                        class="bg-base-200 p-4 rounded-lg"
                    >
                        <div class="font-bold text-primary">
                            {{ version.version }}
                        </div>
                        <div class="text-sm text-base-content/80 mt-1">
                            <ul class="list-disc list-inside">
                                <template v-for="item in version.msg.split(', ')" :key="item">
                                    <li>{{ item }}</li>
                                </template>
                            </ul>
                        </div>
                    </div>
                </div>
                <div v-else class="text-center text-gray-500">
                    {{ $t("home.noupdate") }}
                </div>
            </div>
            <div class="text-xs">
                <div class="flex flex-col gap-2">
                    <p>本软件是免费软件, 如果您喜欢这个项目，并且想支持作者的工作，请考虑以下方式：</p>
                    <div>
                        直接捐赠：<a target="_black" class="link link-primary" href="https://afdian.com/a/pa001024"
                            >https://afdian.com/a/pa001024</a
                        >
                    </div>
                    <div>
                        购买应用：<a target="_black" class="link link-primary" href="https://apps.microsoft.com/detail/9nk8zw43shb1"
                            >https://apps.microsoft.com/detail/9nk8zw43shb1</a
                        >
                    </div>
                </div>
            </div>
            <div class="modal-action justify-center">
                <button class="btn btn-primary" @click="closeModal">
                    {{ $t("home.understand") }}
                </button>
            </div>
        </div>
        <div class="modal-backdrop" @click="closeModal" />
    </dialog>
</template>
