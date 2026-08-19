<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { computed, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { checkUpdate, downloadAndInstallUpdate } from "@/api/update"
import { dataPackBootstrapLoading } from "@/data/data-pack-bridge"
import { env } from "@/env"
import { useDataPackStore } from "@/store/dataPack"
import { useUIStore } from "@/store/ui"
import pg from "../../package.json"

const router = useRouter()
const ui = useUIStore()
const dataPack = useDataPackStore()

const searchParams = new URLSearchParams(window.location.search)
const hideUpdateInfo = searchParams.get("hideUpdateInfo") === "1"

// ---------- 应用更新 ----------
const updateProgress = ref(0)
const appUpdateChecked = ref(false)

const versions = ref<{ version: string; msg: string }[]>([])
let versionsPromise: Promise<void> | null = null
const lastPopupVersion = useLocalStorage("lastPopupVersion", "v0.0.0")
const currentVersion = `v${pg.version}`

// ---------- 数据包 ----------
const dataPackChecked = ref(false)
const lastApply = useLocalStorage("datapack.lastApply", 0)

const latestVersionInfo = computed(() => dataPack.status?.remote || dataPack.status?.versions[0] || null)
const latestVersion = computed(() => latestVersionInfo.value?.version || "")
const latestNotes = computed(() => latestVersionInfo.value?.notes?.trim() || "")
const currentPackVersion = computed(() => dataPack.status?.version || "")
const isReady = computed(() => Boolean(dataPack.status?.ready))
const hasNewPack = computed(() => {
    const latest = latestVersionInfo.value
    const current = dataPack.status?.version
    if (!latest || !current || latest.version === current) {
        return false
    }

    const latestUpdatedAt = Date.parse(latest.builtAt)
    return Number.isFinite(latestUpdatedAt) && latestUpdatedAt > lastApply.value
})

// ---------- 流程编排：应用更新 -> 数据包 -> 更新日志 ----------
type Step =
    | { kind: "app-new-version"; version: string; body: string }
    | { kind: "app-update" }
    | { kind: "pack-install"; version: string; notes: string }
    | { kind: "pack-update"; from: string; to: string; notes: string }
    | { kind: "pack-progress" }
    | { kind: "changelog" }
    | { kind: "idle" }

const step = ref<Step>({ kind: "idle" })
const dialogOpen = ref(false)

const isBusy = computed(() => step.value.kind === "app-update" || step.value.kind === "pack-progress")

const appNewVersion = computed(() => (step.value.kind === "app-new-version" ? step.value.version : ""))
const appNewBody = computed(() => (step.value.kind === "app-new-version" ? step.value.body : ""))
const packStepVersion = computed(() =>
    step.value.kind === "pack-install" ? step.value.version : step.value.kind === "pack-update" ? step.value.to : ""
)
const packStepFrom = computed(() => (step.value.kind === "pack-update" ? step.value.from : ""))
const packStepNotes = computed(() => (step.value.kind === "pack-install" || step.value.kind === "pack-update" ? step.value.notes : ""))

const dialogTitle = computed(() => {
    switch (step.value.kind) {
        case "app-new-version":
            return t("updater.newVersionTitle")
        case "app-update":
            return t("updater.updating")
        case "pack-install":
            return "安装数据包"
        case "pack-update":
            return "数据包可更新"
        case "pack-progress":
            return "下载数据包"
        case "changelog":
            return t("home.update_log")
        default:
            return ""
    }
})

function openStep(next: Step): void {
    step.value = next
    dialogOpen.value = true
}

function closeDialog(): void {
    dialogOpen.value = false
    step.value = { kind: "idle" }
}

function handleDismiss(): void {
    if (isBusy.value) {
        return
    }
    switch (step.value.kind) {
        case "app-new-version":
            skipAppUpdate()
            break
        case "pack-install":
        case "pack-update":
            dismissPack()
            break
        case "changelog":
            finishChangelog()
            break
        default:
            closeDialog()
    }
}

// 版本比较
function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.replace("v", "").split(".").map(Number)
    const parts2 = v2.replace("v", "").split(".").map(Number)

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0
        const p2 = parts2[i] || 0
        if (p1 > p2) return 1
        if (p1 < p2) return -1
    }
    return 0
}

async function fetchVersions() {
    try {
        const response = await fetch("/versions.json")
        versions.value = await response.json()
    } catch (error) {
        console.error("Failed to fetch versions:", error)
    }
}

function newVersions() {
    return versions.value.filter(version => compareVersions(version.version, lastPopupVersion.value) > 0)
}

// ---------- 应用更新 ----------
async function siteCheck(): Promise<boolean> {
    if (location.hostname !== "xn--chq26veyq.icu") {
        return false
    }
    return ui.showDialog(t("updater.siteRedirectTitle"), t("updater.siteRedirectMessage"))
}

async function checkAppUpdateOnly(): Promise<boolean> {
    if (env.isApp) {
        const updateInfo = await checkUpdate()
        if (updateInfo?.available) {
            openStep({ kind: "app-new-version", version: updateInfo.latestVersion, body: updateInfo.body || "" })
            return true
        }
    } else if (await siteCheck()) {
        window.location.href = "https://dna-builder.cn/"
        return true
    }
    return false
}

async function runAppUpdateFlow(): Promise<void> {
    if (await checkAppUpdateOnly()) {
        return
    }

    appUpdateChecked.value = true
    await runPackFlow()
}

async function applyUpdate(): Promise<void> {
    openStep({ kind: "app-update" })
    try {
        await downloadAndInstallUpdate(progress => {
            updateProgress.value = progress
        })
    } catch (error: any) {
        console.error("更新失败:", error)
        await ui.showDialog(t("updater.updateFailed"), error || t("updater.updateErrorMessage"))
    } finally {
        updateProgress.value = 0
        appUpdateChecked.value = true
        await runPackFlow()
    }
}

function skipAppUpdate(): void {
    appUpdateChecked.value = true
    closeDialog()
    void runPackFlow()
}

// ---------- 数据包 ----------
async function checkDataPack(): Promise<void> {
    if (dataPack.isBootstrapping) {
        return
    }

    if (!dataPack.status) {
        await dataPack.refreshStatus()
    }

    dataPackChecked.value = true

    if (hasNewPack.value && latestVersionInfo.value) {
        openStep({
            kind: "pack-update",
            from: currentPackVersion.value,
            to: latestVersionInfo.value.version,
            notes: latestNotes.value,
        })
        return
    }

    if (!isReady.value) {
        openStep({ kind: "pack-install", version: latestVersion.value, notes: latestNotes.value })
        return
    }

    await runChangelogFlow()
}

async function runPackFlow(): Promise<void> {
    if (dataPackChecked.value) {
        await runChangelogFlow()
        return
    }

    if (dataPackBootstrapLoading.value) {
        return
    }

    await checkDataPack()
}

async function downloadPack(): Promise<void> {
    const version = latestVersion.value
    if (!version) {
        ui.showErrorMessage("未找到可用的数据包版本")
        return
    }

    openStep({ kind: "pack-progress" })
    try {
        await dataPack.downloadVersion(version)
        lastApply.value = Date.now()
    } catch (error) {
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    }
    closeDialog()
    await runChangelogFlow()
}

async function goSetting(): Promise<void> {
    closeDialog()
    await router.push({ name: "setting" })
}

function dismissPack(): void {
    closeDialog()
    void runChangelogFlow()
}

// ---------- 更新日志 ----------
async function runChangelogFlow(): Promise<void> {
    if (versionsPromise) {
        await versionsPromise
    }

    if (newVersions().length > 0) {
        openStep({ kind: "changelog" })
        return
    }
    closeDialog()
}

function finishChangelog(): void {
    lastPopupVersion.value = currentVersion
    closeDialog()
}

// 数据包版本在设置页切换后，更新“最近一次应用”时间，避免重复提示。
watch(
    () => dataPack.status?.version,
    (version, previousVersion) => {
        if (version && previousVersion && version !== previousVersion) {
            lastApply.value = Date.now()
        }
    }
)

onMounted(async () => {
    if (hideUpdateInfo) {
        return
    }

    versionsPromise = fetchVersions()
    await runAppUpdateFlow()
})

// 数据包启动加载完成后，若应用更新流程已结束，则继续数据包流程。
watch(dataPackBootstrapLoading, loading => {
    if (loading || !appUpdateChecked.value || dataPackChecked.value) {
        return
    }
    void checkDataPack()
})

// 供设置页 / 主页手动触发检查
window.updateApp = async () => {
    if (dialogOpen.value) {
        return
    }
    await checkAppUpdateOnly()
}

declare global {
    interface Window {
        updateApp: () => Promise<void>
    }
}
</script>

<template>
    <Teleport to="body">
        <dialog v-if="dialogOpen && step.kind !== 'idle'" class="modal modal-open" @click="handleDismiss">
            <div class="modal-box w-[calc(100vw-2rem)] max-w-160 overflow-hidden p-0 shadow-2xl" @click.stop>
                <!-- 顶部渐变横幅 -->
                <div class="relative h-28 overflow-hidden">
                    <div class="absolute inset-0 bg-linear-to-br from-primary/30 via-base-100 to-secondary/25" />
                    <div class="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/30 blur-3xl" />
                    <div class="absolute -left-20 -bottom-20 h-48 w-48 rounded-full bg-secondary/25 blur-3xl" />
                    <div class="relative flex h-full items-center gap-4 px-6 sm:px-8">
                        <div
                            class="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-primary/20 bg-base-100/70 text-2xl text-primary shadow-lg backdrop-blur"
                        >
                            <Icon
                                :icon="
                                    step.kind === 'app-update'
                                        ? 'ri:rocket-2-line'
                                        : step.kind === 'pack-progress'
                                          ? 'ri:download-2-line'
                                          : step.kind === 'pack-install'
                                            ? 'ri:box-3-line'
                                            : step.kind === 'pack-update'
                                              ? 'ri:refresh-line'
                                              : 'ri:magic-line'
                                "
                            />
                        </div>
                        <div>
                            <div class="flex items-center gap-2 text-xs font-medium text-primary">
                                <span class="h-1.5 w-1.5 rounded-full bg-primary" />
                                DNA Builder
                            </div>
                            <h3 class="mt-1 text-xl font-semibold tracking-tight text-base-content sm:text-2xl">
                                {{ dialogTitle }}
                            </h3>
                        </div>
                    </div>
                </div>

                <!-- 主体内容 -->
                <div class="px-6 py-5 sm:px-8 sm:py-6">
                    <!-- 应用更新 -->
                    <template v-if="step.kind === 'app-new-version'">
                        <p class="whitespace-pre-line text-sm leading-6 text-base-content/70">
                            {{ $t("updater.newVersionMessage", { version: appNewVersion, body: appNewBody }) }}
                        </p>
                        <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button class="btn btn-ghost w-full min-w-28 sm:w-auto" @click="skipAppUpdate">稍后</button>
                            <button class="btn btn-primary w-full min-w-36 sm:w-auto" @click="applyUpdate">
                                <Icon icon="ri:download-2-line" />
                                {{ $t("updater.downloadUpdate") }}
                            </button>
                        </div>
                    </template>

                    <!-- 应用更新进度 -->
                    <div v-else-if="step.kind === 'app-update'" class="py-2">
                        <p class="text-sm leading-6 text-base-content/70">{{ $t("updater.updating") }}</p>
                        <div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-base-200">
                            <div
                                class="h-full rounded-full bg-primary transition-all duration-200"
                                :style="{ width: `${updateProgress}%` }"
                            />
                        </div>
                        <p class="mt-2 text-xs tabular-nums text-base-content/50">{{ updateProgress.toFixed(0) }}%</p>
                    </div>

                    <!-- 数据包安装 / 更新 -->
                    <template v-else-if="step.kind === 'pack-install' || step.kind === 'pack-update'">
                        <p class="text-sm leading-6 text-base-content/70">
                            <template v-if="step.kind === 'pack-update'">
                                当前版本 {{ packStepFrom }}，可更新至最新版。数据包决定内容数据的显示与最新效果。
                            </template>
                            <template v-else>尚未安装数据包，安装后才能正常加载全部内容数据。</template>
                        </p>

                        <div class="mt-6 grid gap-3 sm:grid-cols-2">
                            <div class="rounded-2xl border border-base-content/10 bg-base-100/70 p-4">
                                <div class="text-xs text-base-content/50">当前版本</div>
                                <div class="mt-2 break-all text-sm font-semibold text-base-content">
                                    {{ currentPackVersion || "未激活" }}
                                </div>
                            </div>
                            <div class="rounded-2xl border border-base-content/10 bg-base-100/70 p-4">
                                <div class="text-xs text-base-content/50">最新版本</div>
                                <div class="mt-2 break-all text-sm font-semibold text-base-content">
                                    {{ packStepVersion || "暂无" }}
                                </div>
                            </div>
                            <div v-if="packStepNotes" class="rounded-2xl border border-base-content/10 bg-base-100/70 p-4 sm:col-span-2">
                                <div class="text-xs text-base-content/50">更新说明</div>
                                <div class="mt-2 whitespace-pre-wrap wrap-break-word text-sm text-base-content/80">{{ packStepNotes }}</div>
                            </div>
                        </div>

                        <div class="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <button
                                class="btn btn-primary w-full min-w-36 sm:w-auto"
                                :disabled="!latestVersion || dataPack.isDownloading"
                                @click="downloadPack"
                            >
                                <span class="loading loading-dots" v-if="dataPack.isDownloading" />
                                <Icon v-else icon="ri:download-2-line" />
                                {{ dataPack.isDownloading ? "下载中" : latestVersion ? `下载 ${latestVersion}` : "下载最新数据包" }}
                            </button>
                            <button class="btn btn-ghost w-full min-w-28 sm:w-auto" @click="goSetting">打开设置</button>
                            <button class="btn btn-ghost w-full min-w-24 sm:w-auto" @click="dismissPack">关闭</button>
                        </div>
                    </template>

                    <!-- 数据包下载进度 -->
                    <div v-else-if="step.kind === 'pack-progress'" class="py-2">
                        <p class="text-sm leading-6 text-base-content/70">正在下载数据包，请稍候…</p>
                        <div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-base-200">
                            <div
                                class="h-full rounded-full bg-primary transition-all duration-200"
                                :style="{ width: `${Math.round(dataPack.downloadProgress * 100)}%` }"
                            />
                        </div>
                        <p class="mt-2 text-xs tabular-nums text-base-content/50">{{ Math.round(dataPack.downloadProgress * 100) }}%</p>
                    </div>

                    <!-- 更新日志 -->
                    <div v-else-if="step.kind === 'changelog'" class="flex flex-col">
                        <p class="text-sm leading-6 text-base-content/70">{{ $t("home.welcome") }} {{ currentVersion }}</p>
                        <div class="mt-4 max-h-72 space-y-2 overflow-y-auto">
                            <template v-if="versions.length > 0">
                                <div
                                    v-for="version in newVersions()"
                                    :key="version.version"
                                    class="rounded-lg bg-base-200 p-4 hover:bg-base-300 transition-colors duration-300"
                                >
                                    <div class="font-semibold text-primary">{{ version.version }}</div>
                                    <ul class="mt-1 list-inside list-disc text-sm leading-relaxed text-base-content/80">
                                        <li v-for="item in version.msg.split(', ')" :key="item">{{ item }}</li>
                                    </ul>
                                </div>
                            </template>
                            <div v-else class="text-center text-sm text-base-content/50">{{ $t("home.noupdate") }}</div>
                        </div>
                        <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div class="flex flex-col gap-1 text-xs text-base-content/60">
                                <span>{{ $t("updater.supportIntro") }}</span>
                                <span>
                                    {{ $t("updater.supportDonate") }}：
                                    <a class="link link-primary" href="https://ifdian.net/a/pa001024" target="_blank"
                                        >https://ifdian.net/a/pa001024</a
                                    >
                                </span>
                                <span>
                                    {{ $t("updater.supportBuyApp") }}：
                                    <a class="link link-primary" href="https://apps.microsoft.com/detail/9nk8zw43shb1" target="_blank"
                                        >https://apps.microsoft.com/detail/9nk8zw43shb1</a
                                    >
                                </span>
                            </div>
                            <button class="btn btn-primary w-full min-w-28 sm:w-auto" @click="finishChangelog">
                                {{ $t("home.understand") }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop" @click="handleDismiss" />
        </dialog>
    </Teleport>
</template>
