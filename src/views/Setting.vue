<script lang="ts" setup>
import { t } from "i18next"
import { computed, onMounted, ref, watch } from "vue"
import { MATERIALS } from "@/api/app"
import { DNA_SAFE_VERSION_LIMIT } from "@/data/versionGate"
import { env } from "@/env"
import { i18nLanguages } from "@/i18n"
import { useDataPackStore } from "@/store/dataPack"
import { db } from "@/store/db"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"

const setting = useSettingStore()
const ui = useUIStore()
const dataPack = useDataPackStore()
const isUpdatingLaunchAtStartup = ref(false)
const safeModeGuardDialogRef = ref<HTMLDialogElement | null>(null)
const safeModeAnswer = ref("")
const dataPackFileInput = ref<HTMLInputElement | null>(null)
const dataPackSourceBaseUrl = ref("")
const dataPackSourceKind = ref<"official" | "custom">("custom")
const questions = [
    { question: "What is the ultimate answer to the universe?", answer: "42" },
    { question: "What is the current game version?", answer: String(DNA_SAFE_VERSION_LIMIT) },
    { question: "What is the game server opening date? (8-digit number)", answer: "20251028" },
    { question: "What time do daily tasks refresh every day? (1-digit number)", answer: "5" },
    { question: "What color is the sky on a clear day?", answer: "blue" },
    { question: "Type the word 'unlock' backwards.", answer: "kcolnu" },
    { question: "What is the second day of the week in English?", answer: "Tuesday" },
    { question: "What is the first month of the year?", answer: "January" },
    { question: "What is the color of a banana?", answer: "yellow" },
    { question: "What is the opposite of cold?", answer: "hot" },
    { question: "How many days are in a week?", answer: "7" },
]
const currentSafeModeQuestion = ref<(typeof questions)[number] | null>(null)
const CDN_DATA_PACK_BASE_URL = "https://cdn.dna-builder.cn/data-pack"
const versionDragUrls = ref<Record<string, string>>({})
const sourceSaveTimer = ref<number | null>(null)
const isApplyingSourceUpdate = ref(false)

const dataPackVersions = computed(() => {
    const versions = dataPack.status?.versions || []
    return [...versions].sort((a, b) => b.version.localeCompare(a.version, "zh-CN", { numeric: true }))
})

const installedDataPackVersions = computed(() => {
    return new Set(dataPack.installedVersions)
})

const lightThemes = [
    "light",
    "lofi",
    "cupcake",
    "retro",
    "valentine",
    "garden",
    "aqua",
    "pastel",
    "wireframe",
    "winter",
    "cyberpunk",
    "corporate",
    "bumblebee",
    "emerald",
    "fantasy",
    "cmyk",
    "autumn",
    "acid",
    "lemonade",
]
const darkThemes = ["dark", "black", "synthwave", "halloween", "forest", "dracula", "business", "night", "coffee"]

watch(
    () => setting.winMaterial,
    v => setting.setWinMaterial(v)
)

watch(
    () => dataPack.sourceInfo?.baseUrl,
    v => {
        dataPackSourceBaseUrl.value = v || ""
    },
    { immediate: true }
)

watch(
    () => dataPack.sourceInfo?.sourceKind,
    v => {
        dataPackSourceKind.value = v || "custom"
    },
    { immediate: true }
)

watch(
    () => dataPackSourceKind.value,
    kind => {
        if (kind === "official") {
            dataPackSourceBaseUrl.value = CDN_DATA_PACK_BASE_URL
        } else if (!dataPackSourceBaseUrl.value || dataPackSourceBaseUrl.value === CDN_DATA_PACK_BASE_URL) {
            dataPackSourceBaseUrl.value = "/mock/data-pack"
        }
    },
    { immediate: true }
)

watch(
    () => dataPackSourceBaseUrl.value,
    () => {
        if (isApplyingSourceUpdate.value) {
            return
        }

        if (sourceSaveTimer.value) {
            window.clearTimeout(sourceSaveTimer.value)
        }

        if (dataPackSourceKind.value === "official") {
            return
        }

        sourceSaveTimer.value = window.setTimeout(() => {
            void saveSourceBaseUrl()
        }, 600)
    }
)

function capitalize(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1)
}

function applySafeMode(enabled: boolean) {
    setting.safeMode = enabled
    location.reload()
}

function handleSafeModeToggle(enabled: boolean) {
    if (enabled) {
        applySafeMode(true)
        return
    }

    safeModeAnswer.value = ""
    currentSafeModeQuestion.value = questions[Math.floor(Math.random() * questions.length)]
    safeModeGuardDialogRef.value?.showModal()
}

function cancelDisableSafeMode() {
    safeModeGuardDialogRef.value?.close()
    safeModeAnswer.value = ""
    setting.safeMode = true
}

function confirmDisableSafeMode() {
    if (!currentSafeModeQuestion.value) {
        ui.showErrorMessage(t("setting.noSafeModeQuestion"))
        return
    }

    if (safeModeAnswer.value.trim() !== currentSafeModeQuestion.value.answer) {
        ui.showErrorMessage(t("setting.safeModeAnswerWrong"))
        return
    }

    safeModeGuardDialogRef.value?.close()
    currentSafeModeQuestion.value = null
    applySafeMode(false)
}

async function resetStorage() {
    localStorage.clear()
    db.delete()
    await clearServiceWorkers()
    location.reload()
}

async function openResetConfirmDialog() {
    if (await ui.showDialog(t("setting.reset"), t("setting.resetTip"))) {
        resetStorage()
    }
}

async function updateLaunchAtStartup(enabled: boolean) {
    isUpdatingLaunchAtStartup.value = true
    try {
        await setting.setLaunchAtStartup(enabled)
    } catch (error) {
        console.error("更新开机启动设置失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        isUpdatingLaunchAtStartup.value = false
    }
}

async function clearServiceWorkers(): Promise<void> {
    if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
            await registration.unregister()
        }
        if ("caches" in window) {
            for (const cacheName of await caches.keys()) {
                await caches.delete(cacheName)
            }
        }
    }
}

async function refreshDataPackStatus(forceRefresh = false) {
    await dataPack.refreshStatus(forceRefresh)
    dataPackSourceBaseUrl.value = dataPack.sourceInfo?.baseUrl || ""
}

async function downloadDataPack(version: string) {
    await dataPack.downloadVersion(version)
    await refreshDataPackStatus()
}

async function importDataPack() {
    dataPackFileInput.value?.click()
}

async function onImportFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) {
        return
    }
    await dataPack.importFromFile(file)
    await refreshDataPackStatus()
}

async function saveSourceBaseUrl() {
    isApplyingSourceUpdate.value = true
    try {
        await dataPack.setSourceBaseUrl(dataPackSourceBaseUrl.value.trim())
        await refreshDataPackStatus()
    } finally {
        isApplyingSourceUpdate.value = false
    }
}

async function saveSourceKind(kind: "official" | "custom") {
    isApplyingSourceUpdate.value = true
    dataPackSourceKind.value = kind
    try {
        await dataPack.setSourceKind(kind)
        if (kind === "official") {
            dataPackSourceBaseUrl.value = CDN_DATA_PACK_BASE_URL
        }
        await refreshDataPackStatus(true)
    } finally {
        isApplyingSourceUpdate.value = false
    }
}

async function refreshDataPackVersions() {
    await refreshDataPackStatus(true)
}

function formatVersionDate(date: string | undefined) {
    if (!date) {
        return t("setting.unknown")
    }

    return new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(date))
}

function getVersionLabel(version: string) {
    return version
}

function isDownloadedVersion(version: string) {
    return version === dataPack.status?.version || installedDataPackVersions.value.has(version)
}

function isCurrentDataPackVersion(version: string) {
    return dataPack.status?.version === version
}

function onVersionDragStart(event: DragEvent, version: string) {
    if (!event.dataTransfer || !isDownloadedVersion(version)) {
        event.preventDefault()
        return
    }

    try {
        const file = dataPack.versionFiles[version]
        if (!file) {
            throw new Error(`${t("setting.missingDragDataPack")} ${version}`)
        }
        event.dataTransfer.effectAllowed = "copy"
        event.dataTransfer.items.clear()
        event.dataTransfer.items.add(file)
        const fileUrl = versionDragUrls.value[version] || URL.createObjectURL(file)
        versionDragUrls.value[version] = fileUrl
        event.dataTransfer.setData("DownloadURL", `application/zip:${version}.zip:${fileUrl}`)
    } catch (error) {
        console.error("准备拖拽数据包失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
        event.preventDefault()
    }
}

function onVersionDragEnd(version: string) {
    const fileUrl = versionDragUrls.value[version]
    if (fileUrl) {
        window.setTimeout(() => {
            URL.revokeObjectURL(fileUrl)
            delete versionDragUrls.value[version]
        }, 5000)
    }
}

async function useDataPackVersion(version: string) {
    if (isCurrentDataPackVersion(version)) {
        return
    }

    await dataPack.useVersion(version)
    await refreshDataPackStatus(true)
}

async function uninstallDataPackVersion(version: string) {
    if (!isDownloadedVersion(version)) {
        return
    }

    if (!(await ui.showDialog(t("setting.uninstallDataPack"), t("setting.uninstallDataPackConfirm", { version })))) {
        return
    }

    await dataPack.uninstallVersion(version)
    await refreshDataPackStatus(true)
}
onMounted(() => {
    dataPack.bootstrap()
})
</script>

<template>
    <div class="w-full h-full overflow-y-auto">
        <div class="p-4 flex flex-col gap-4 max-w-xl m-auto">
            <article>
                <h2 class="text-sm font-bold m-2">{{ $t("setting.appearance") }}</h2>
                <div class="bg-base-100 p-2 rounded-lg">
                    <div v-if="env.isApp" class="flex justify-between items-center p-2">
                        <span class="label-text">{{ $t("setting.theme") }}</span>
                        <Select
                            v-model="setting.theme"
                            class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-40"
                        >
                            <SelectLabel class="p-2 text-sm font-semibold text-primary">{{ $t("setting.lightTheme") }}</SelectLabel>
                            <SelectGroup>
                                <SelectItem v-for="th in lightThemes" :key="th" :value="th">{{ capitalize(th) }}</SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectLabel class="p-2 text-sm font-semibold text-primary">{{ $t("setting.darkTheme") }}</SelectLabel>
                            <SelectGroup>
                                <SelectItem v-for="th in darkThemes" :key="th" :value="th">{{ capitalize(th) }}</SelectItem>
                            </SelectGroup>
                        </Select>
                    </div>
                    <div v-if="env.isApp" class="flex justify-between items-center p-2">
                        <span class="label-text">
                            {{ $t("setting.windowTrasnparent") }}
                            <div class="text-xs text-base-content/50">{{ $t("setting.windowTrasnparentTip") }}</div>
                        </span>
                        <input v-model="setting.windowTrasnparent" type="checkbox" class="toggle toggle-secondary" />
                    </div>
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">
                            {{ $t("setting.launchAtStartup") }}
                            <div class="text-xs text-base-content/50">{{ $t("setting.launchAtStartupTip") }}</div>
                        </span>
                        <input
                            :checked="setting.launchAtStartup"
                            :disabled="isUpdatingLaunchAtStartup"
                            type="checkbox"
                            class="toggle toggle-secondary"
                            @change="updateLaunchAtStartup(($event.target as HTMLInputElement).checked)"
                        />
                    </div>
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">{{ $t("setting.winMaterial") }}</span>
                        <Select
                            v-model="setting.winMaterial"
                            class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-40"
                            :placeholder="$t('setting.winMaterial')"
                        >
                            <SelectItem v-for="th in MATERIALS" :key="th" :value="th">{{ th }}</SelectItem>
                        </Select>
                    </div>
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">{{ $t("setting.lang") }}</span>
                        <Select
                            v-model="setting.lang"
                            class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-40"
                            :placeholder="$t('setting.lang')"
                            @update:model-value="setting.setLang($event)"
                        >
                            <SelectItem v-for="lang in i18nLanguages" :key="lang.code" :value="lang.code">{{ lang.name }}</SelectItem>
                        </Select>
                    </div>
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">{{ $t("setting.uiScale") }}</span>
                        <div class="min-w-56">
                            <input
                                :value="setting.uiScale"
                                type="range"
                                class="range range-secondary"
                                min="0.8"
                                max="1.5"
                                step="0.1"
                                @input="setting.uiScale = +($event.target as HTMLInputElement)!.value"
                            />
                            <div class="w-full flex justify-between text-xs px-1">
                                <span
                                    v-for="i in 8"
                                    :key="i"
                                    :class="{ 'text-secondary': setting.uiScale.toFixed(1) === (0.7 + i / 10).toFixed(1) }"
                                    >{{ (0.7 + i / 10).toFixed(1) }}</span
                                >
                            </div>
                        </div>
                    </div>
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">
                            {{ $t("setting.safeMode") }}
                            <div class="text-xs text-base-content/50">{{ $t("setting.safeModeHint") }}</div>
                        </span>
                        <input
                            :checked="setting.safeMode"
                            type="checkbox"
                            class="toggle toggle-secondary"
                            @click.prevent="handleSafeModeToggle(!setting.safeMode)"
                        />
                    </div>
                    <div v-if="!setting.safeMode" class="flex justify-between items-center p-2">
                        <span class="label-text"> {{ $t("setting.initScriptHotkeysAtStartup") }} </span>
                        <input v-model="setting.initScriptHotkeysAtStartup" type="checkbox" class="toggle toggle-secondary" />
                    </div>
                </div>
            </article>

            <article>
                <h2 class="text-sm font-bold m-2">{{ $t("setting.dataPackManagement") }}</h2>
                <div class="bg-base-100 p-2 rounded-lg">
                    <div class="p-2 flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <Select
                                v-model="dataPackSourceKind"
                                class="inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap w-40"
                                @update:model-value="saveSourceKind($event as 'official' | 'custom')"
                            >
                                <SelectItem value="official">{{ $t("setting.officialSource") }}</SelectItem>
                                <SelectItem value="custom">{{ $t("setting.customSource") }}</SelectItem>
                            </Select>
                            <input
                                v-model="dataPackSourceBaseUrl"
                                :disabled="dataPackSourceKind === 'official'"
                                type="text"
                                class="input input-bordered input-sm flex-1"
                                :placeholder="
                                    dataPackSourceKind === 'official' ? CDN_DATA_PACK_BASE_URL : $t('setting.dataPackSourceAddress')
                                "
                                @input="dataPackSourceKind === 'custom' && saveSourceBaseUrl()"
                            />
                            <button class="btn btn-sm" @click="importDataPack">{{ $t("achievement.import") }}</button>
                        </div>
                    </div>

                    <div class="px-2 pb-2 flex items-center justify-between gap-2">
                        <div class="text-xs text-base-content/60">{{ $t("setting.versionList") }}</div>
                        <button class="btn btn-ghost btn-xs" :disabled="dataPack.isBootstrapping" @click="refreshDataPackVersions">
                            {{ $t("setting.refresh") }}
                        </button>
                    </div>

                    <div class="px-2 pb-2">
                        <div
                            v-if="dataPackVersions.length === 0"
                            class="rounded-md border border-base-300 px-3 py-6 text-sm text-base-content/60 text-center"
                        >
                            {{ $t("setting.noAvailableVersions") }}
                        </div>
                        <div v-else class="flex flex-col gap-2">
                            <div
                                v-for="version in dataPackVersions"
                                :key="version.version"
                                class="rounded-md border border-base-300 bg-base-100/60 px-3 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                                :class="{
                                    'border-primary': isCurrentDataPackVersion(version.version),
                                    'opacity-80': isDownloadedVersion(version.version),
                                }"
                                :draggable="isDownloadedVersion(version.version)"
                                @dragstart="onVersionDragStart($event, version.version)"
                                @dragend="onVersionDragEnd(version.version)"
                            >
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <div class="font-medium break-all">{{ getVersionLabel(version.version) }}</div>
                                        <span
                                            v-if="isCurrentDataPackVersion(version.version)"
                                            class="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                                            >{{ $t("setting.current") }}</span
                                        >
                                        <span
                                            v-else-if="isDownloadedVersion(version.version)"
                                            class="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success"
                                            >{{ $t("setting.downloaded") }}</span
                                        >
                                    </div>
                                    <div class="text-xs text-base-content/60">
                                        <span>{{ formatVersionDate(version.builtAt) }}</span>
                                        <span class="mx-2">·</span>
                                        <span>{{ version.notes || $t("setting.noDescription") }}</span>
                                    </div>
                                </div>
                                <div class="sm:w-48">
                                    <div
                                        v-if="dataPack.isDownloading && dataPack.downloadingVersion === version.version"
                                        class="w-full flex flex-col gap-1"
                                    >
                                        <progress
                                            class="progress progress-primary w-full"
                                            :value="Math.round(dataPack.downloadProgress * 100)"
                                            max="100"
                                        />
                                        <div class="text-[11px] text-base-content/60 text-right">
                                            {{ Math.round(dataPack.downloadProgress * 100) }}%
                                        </div>
                                    </div>
                                    <div v-else-if="isDownloadedVersion(version.version)" class="flex gap-2">
                                        <button class="btn btn-error btn-sm flex-1" @click="uninstallDataPackVersion(version.version)">
                                            {{ $t("setting.uninstall") }}
                                        </button>
                                        <button
                                            class="btn btn-primary btn-sm flex-1"
                                            :disabled="isCurrentDataPackVersion(version.version)"
                                            @click="useDataPackVersion(version.version)"
                                        >
                                            {{ $t("setting.use") }}
                                        </button>
                                    </div>
                                    <button
                                        v-else
                                        class="btn btn-primary btn-sm w-full"
                                        :disabled="dataPack.isDownloading"
                                        @click="downloadDataPack(version.version)"
                                    >
                                        {{ $t("setting.download") }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <input ref="dataPackFileInput" type="file" accept=".zip" class="hidden" @change="onImportFileChange" />
                </div>
            </article>

            <article>
                <h2 class="text-sm font-bold m-2">{{ $t("setting.account") }}</h2>
                <div class="bg-base-100 p-2 rounded-lg">
                    <DOBAccountSetting />
                </div>
            </article>

            <article>
                <h2 class="text-sm font-bold m-2">{{ $t("setting.storyText") }}</h2>
                <div class="bg-base-100 p-2 rounded-lg">
                    <div class="flex justify-between items-center p-2 gap-4">
                        <span class="label-text">{{ $t("setting.protagonistName1") }}</span>
                        <input v-model="setting.protagonistName1" type="text" class="input input-bordered input-sm w-64" />
                    </div>
                    <div class="flex justify-between items-center p-2 gap-4">
                        <span class="label-text">{{ $t("setting.protagonistGender1") }}</span>
                        <Select
                            v-model="setting.protagonistGender"
                            class="inline-flex items-center justify-between input input-bordered input-sm w-64"
                        >
                            <SelectItem value="female">{{ $t("setting.female") }}</SelectItem>
                            <SelectItem value="male">{{ $t("setting.male") }}</SelectItem>
                        </Select>
                    </div>
                    <div class="flex justify-between items-center p-2 gap-4">
                        <span class="label-text">{{ $t("setting.protagonistName2") }}</span>
                        <input v-model="setting.protagonistName2" type="text" class="input input-bordered input-sm w-64" />
                    </div>
                    <div class="flex justify-between items-center p-2 gap-4">
                        <span class="label-text">{{ $t("setting.protagonistGender2") }}</span>
                        <Select
                            v-model="setting.protagonistGender2"
                            class="inline-flex items-center justify-between input input-bordered input-sm w-64"
                        >
                            <SelectItem value="female">{{ $t("setting.female") }}</SelectItem>
                            <SelectItem value="male">{{ $t("setting.male") }}</SelectItem>
                        </Select>
                    </div>
                </div>
            </article>

            <article>
                <h2 class="text-sm font-bold m-2">{{ $t("setting.other") }}</h2>
                <div class="bg-base-100 p-2 rounded-lg">
                    <div class="flex justify-between items-center p-2">
                        <span class="label-text">
                            {{ $t("setting.reset") }}
                            <div class="text-xs text-base-content/50">{{ $t("setting.resetTip") }}</div>
                        </span>
                        <div class="btn btn-secondary w-40" @click="openResetConfirmDialog">{{ $t("setting.confirm") }}</div>
                    </div>
                </div>
            </article>
        </div>
    </div>

    <dialog ref="safeModeGuardDialogRef" class="modal">
        <div class="modal-box font-wt">
            <h3 class="font-bold text-lg">Turn off Safe Mode</h3>
            <p class="py-2 text-sm text-base-content/70">Please answer the question correctly.</p>
            <div class="flex flex-col gap-3">
                <label class="w-full flex flex-col gap-2">
                    <span class="text-sm">{{ currentSafeModeQuestion?.question || "no question" }}</span>
                    <input v-model="safeModeAnswer" type="password" class="input input-bordered" placeholder="enter your answer" />
                </label>
            </div>
            <div class="modal-action">
                <button class="btn" type="button" @click="cancelDisableSafeMode">Forget it</button>
                <button class="btn btn-error" type="button" @click="confirmDisableSafeMode">Confirm</button>
            </div>
        </div>
        <div class="modal-backdrop" @click="cancelDisableSafeMode"></div>
    </dialog>
</template>
