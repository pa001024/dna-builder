<script setup lang="ts">
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

const latestVersion = computed(() => dataPack.status?.remote?.version || dataPack.status?.versions[0]?.version || "")
const currentVersion = computed(() => dataPack.status?.version || "未激活")
const versionCount = computed(() => dataPack.status?.versions.length || 0)
const isReady = computed(() => Boolean(dataPack.status?.ready))

const statusText = computed(() => {
    if (isReady.value) {
        return "数据包已激活"
    }

    if (dataPack.status?.version) {
        return "当前数据包未激活"
    }

    return "尚未安装数据包"
})

const statusHint = computed(() => {
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
    showModal.value = !dataPack.status?.ready
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
        await dataPack.refreshStatus(true)
        showModal.value = false
    } catch (error) {
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        isDownloading.value = false
    }
}

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
                class="modal-box w-160 max-w-4xl overflow-hidden border border-base-content/10 bg-base-100/95 p-0 shadow-2xl backdrop-blur-xl"
            >
                <div class="relative overflow-hidden">
                    <div class="absolute inset-0 bg-linear-to-br from-primary/20 via-base-100 to-secondary/15" />
                    <div class="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
                    <div class="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-secondary/15 blur-3xl" />

                    <div class="relative grid gap-0">
                        <div class="p-6 sm:p-8 lg:p-10">
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

                            <div class="mt-7 grid gap-3 sm:grid-cols-3">
                                <div class="rounded-2xl border border-base-content/10 bg-base-100/60 p-4 shadow-sm">
                                    <div class="text-xs text-base-content/50">当前版本</div>
                                    <div class="mt-2 break-all text-sm font-semibold text-base-content">{{ currentVersion }}</div>
                                </div>
                                <div class="rounded-2xl border border-base-content/10 bg-base-100/60 p-4 shadow-sm">
                                    <div class="text-xs text-base-content/50">最新版本</div>
                                    <div class="mt-2 break-all text-sm font-semibold text-base-content">{{ latestVersion || "暂无" }}</div>
                                </div>
                                <div class="rounded-2xl border border-base-content/10 bg-base-100/60 p-4 shadow-sm">
                                    <div class="text-xs text-base-content/50">可用版本</div>
                                    <div class="mt-2 text-sm font-semibold text-base-content">{{ versionCount }}</div>
                                </div>
                            </div>

                            <div class="mt-8 flex flex-wrap gap-3">
                                <button
                                    class="btn btn-primary min-w-40"
                                    :disabled="!latestVersion || isDownloading"
                                    @click="downloadLatest"
                                >
                                    {{ actionLabel }}
                                    <span class="loading loading-dots" v-if="isDownloading"></span>
                                </button>
                                <button class="btn btn-ghost min-w-28" :disabled="isDownloading" @click="goSetting">打开设置</button>
                                <button class="btn btn-ghost min-w-24" :disabled="isDownloading" @click="closeModal">关闭</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop" @click="closeModal" />
        </dialog>
    </Teleport>
</template>
