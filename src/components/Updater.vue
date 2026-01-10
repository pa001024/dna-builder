<script setup lang="ts">
import { ref, onMounted } from "vue"
import { env } from "../env"
import pg from "../../package.json"
import { checkUpdate, downloadAndInstallUpdate } from "../api/update"
import { useUIStore } from "../store/ui"
import { t } from "i18next"
import { useLocalStorage } from "@vueuse/core"
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

// Check if there are new versions to show
function checkNewVersions() {
    if (!versions.value.length) return

    // Get versions newer than lastPopupVersion
    const newVersions = versions.value.filter(version => {
        return version.version > lastPopupVersion.value
    })

    if (newVersions.length > 0) {
        showModal.value = true
    }
}

// Close modal and update last popup version
function closeModal() {
    showModal.value = false
    lastPopupVersion.value = currentVersion
}

// Initialize on mount
onMounted(async () => {
    if (env.isApp) {
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
    await fetchVersions()
    checkNewVersions()
})
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
                        v-for="version in versions.filter(v => v.version > lastPopupVersion)"
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
            <div class="modal-action justify-center">
                <button class="btn btn-primary" @click="closeModal">
                    {{ $t("home.understand") }}
                </button>
            </div>
        </div>
        <div class="modal-backdrop" @click="closeModal" />
    </dialog>
</template>
