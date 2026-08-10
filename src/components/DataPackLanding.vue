<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { computed, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { dataPackBootstrapLoading } from "@/data/data-pack-bridge"
import { useDataPackStore } from "@/store/dataPack"
import { useUIStore } from "@/store/ui"

const router = useRouter()
const ui = useUIStore()
const dataPack = useDataPackStore()

const showModal = ref(false)
const hasChecked = ref(false)
const isDownloading = ref(false)
const lastApply = useLocalStorage("datapack.lastApply", 0)

const latestVersionInfo = computed(() => dataPack.status?.remote || dataPack.status?.versions[0] || null)
const latestVersion = computed(() => latestVersionInfo.value?.version || "")
const latestNotes = computed(() => latestVersionInfo.value?.notes?.trim() || "暂无")
const currentVersion = computed(() => dataPack.status?.version || "未激活")
const isReady = computed(() => Boolean(dataPack.status?.ready))
const hasNewVersion = computed(() => {
    const latest = latestVersionInfo.value
    const current = dataPack.status?.version
    if (!latest || !current || latest.version === current) {
        return false
    }

    const latestUpdatedAt = Date.parse(latest.builtAt)
    return Number.isFinite(latestUpdatedAt) && latestUpdatedAt > lastApply.value
})

const statusText = computed(() => {
    if (hasNewVersion.value) {
        return "发现新数据包版本"
    }

    if (isReady.value) {
        return "数据包已激活"
    }

    if (dataPack.status?.version) {
        return "当前数据包未激活"
    }

    return "尚未安装数据包"
})

const statusHint = computed(() => {
    if (hasNewVersion.value) {
        return `当前版本 ${currentVersion.value}，可更新至 ${latestVersion.value}。`
    }

    if (isReady.value) {
        return "当前可直接进入内容页。"
    }

    if (latestVersion.value) {
        return `建议下载最新版本 ${latestVersion.value}。`
    }

    return "正在等待远端版本列表。"
})

const actionLabel = computed(() => {
    if (isDownloading.value) {
        return "下载中"
    }

    return latestVersion.value ? `下载 ${latestVersion.value}` : "下载最新数据包"
})

/**
 * 检查当前是否需要提示用户安装或激活数据包。
 */
async function checkDataPack() {
    if (dataPack.isBootstrapping) {
        return
    }

    if (!dataPack.status) {
        await dataPack.refreshStatus()
    }

    hasChecked.value = true
    showModal.value = !dataPack.status?.ready || hasNewVersion.value
}

/**
 * 关闭提示弹窗。
 */
function closeModal() {
    showModal.value = false
}

/**
 * 跳转到数据包设置页。
 */
async function goSetting() {
    showModal.value = false
    await router.push({ name: "setting" })
}

/**
 * 下载并激活最新数据包。
 */
async function downloadLatest() {
    const version = latestVersion.value
    if (!version) {
        ui.showErrorMessage("未找到可用的数据包版本")
        return
    }

    isDownloading.value = true
    try {
        await router.push({ name: "setting" })
        await dataPack.downloadVersion(version)
        lastApply.value = Date.now()
        showModal.value = false
    } catch (error) {
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        isDownloading.value = false
    }
}

watch(
    () => dataPack.status?.version,
    (version, previousVersion) => {
        if (version && previousVersion && version !== previousVersion) {
            lastApply.value = Date.now()
        }
    }
)

watch(
    dataPackBootstrapLoading,
    loading => {
        if (loading || hasChecked.value) {
            return
        }

        void checkDataPack()
    },
    { immediate: true }
)
</script>

<template>
    <Teleport to="body">
        <dialog class="modal" :class="{ 'modal-open': showModal }">
            <div
                class="modal-box w-[calc(100vw-2rem)] max-w-[40rem] max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto border border-base-content/10 bg-base-100/95 p-0 shadow-2xl backdrop-blur-xl sm:w-[calc(100vw-3rem)] sm:max-h-[calc(100vh-3rem)]"
            >
                <div class="relative overflow-hidden">
                    <div class="absolute inset-0 bg-linear-to-br from-primary/20 via-base-100 to-secondary/15" />
                    <div class="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
                    <div class="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-secondary/15 blur-3xl" />

                    <div class="relative grid gap-0">
                        <div class="p-4 sm:p-8 lg:p-10">
                            <div
                                class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                            >
                                <span class="h-2 w-2 rounded-full bg-primary" />
                                DOB
                            </div>

                            <div class="mt-5 max-w-xl">
                                <h3 class="text-2xl font-semibold tracking-tight text-base-content sm:text-3xl">
                                    {{ statusText }}
                                </h3>
                                <p class="mt-3 text-sm leading-6 text-base-content/70 sm:text-base">
                                    {{ statusHint }}
                                </p>
                            </div>

                            <div class="mt-7 grid gap-3 sm:grid-cols-2">
                                <div class="rounded-2xl border border-base-content/10 bg-base-100/60 p-4 shadow-sm">
                                    <div class="text-xs text-base-content/50">当前版本</div>
                                    <div class="mt-2 break-all text-sm font-semibold text-base-content">{{ currentVersion }}</div>
                                </div>
                                <div class="rounded-2xl border border-base-content/10 bg-base-100/60 p-4 shadow-sm">
                                    <div class="text-xs text-base-content/50">最新版本</div>
                                    <div class="mt-2 break-all text-sm font-semibold text-base-content">{{ latestVersion || "暂无" }}</div>
                                </div>
                                <div class="rounded-2xl border border-base-content/10 bg-base-100/60 p-4 shadow-sm sm:col-span-2">
                                    <div class="text-xs text-base-content/50">描述</div>
                                    <div class="mt-2 whitespace-pre-wrap break-words text-sm font-semibold text-base-content">{{ latestNotes }}</div>
                                </div>
                            </div>

                            <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                                <button
                                    class="btn btn-primary w-full min-w-40 sm:w-auto"
                                    :disabled="!latestVersion || isDownloading"
                                    @click="downloadLatest"
                                >
                                    {{ actionLabel }}
                                    <span class="loading loading-dots" v-if="isDownloading"></span>
                                </button>
                                <button class="btn btn-ghost w-full min-w-28 sm:w-auto" :disabled="isDownloading" @click="goSetting">
                                    打开设置
                                </button>
                                <button class="btn btn-ghost w-full min-w-24 sm:w-auto" :disabled="isDownloading" @click="closeModal">
                                    关闭
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop" @click="closeModal" />
        </dialog>
    </Teleport>
</template>
