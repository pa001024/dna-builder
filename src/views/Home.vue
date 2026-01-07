<script lang="tsx" setup>
import { env } from "../env"
import pg from "../../package.json"
import type { IconTypes } from "../components/Icon.vue"
import { useGameStore } from "../store/game"
import { ref, onMounted } from "vue"
import { useLocalStorage } from "@vueuse/core"

const items = [
    {
        name: "char-build",
        path: "/char",
        icon: "ri:hammer-line",
    },
    {
        name: "inventory",
        path: "/inventory",
        icon: "ri:box-1-line",
    },
    {
        name: "achievement",
        path: "/achievement",
        icon: "ri:trophy-line",
    },
    {
        name: "more",
        path: "/more",
        icon: "ri:more-line",
    },
] satisfies { name: string; path: string; icon: IconTypes }[]

const game = useGameStore()

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
    const newVersions = versions.value.filter((version) => {
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
    await fetchVersions()
    checkNewVersions()
})
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea class="h-full">
            <div class="hero bg-base-200 min-h-72 relative bg-linear-to-br from-purple-500/30 via-gray-500/30 to-blue-500/30">
                <!-- 网格线 -->
                <div class="absolute inset-0 opacity-20">
                    <div
                        class="absolute inset-0"
                        style="
                            background-image:
                                linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px);
                            background-size: 50px 50px;
                        "
                    ></div>
                </div>
                <!-- 闪烁星星 -->
                <div class="absolute inset-0 overflow-hidden">
                    <div
                        class="absolute aspect-square bg-cyan-400/50 rounded-full animate-ping"
                        v-for="_ in 20"
                        :style="{
                            width: `${0.1 + Math.random() * 0.2}em`,
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 3}s`,
                            animationDuration: `${1 + Math.random() * 2}s`,
                        }"
                    ></div>
                </div>
                <div class="hero-content text-center container">
                    <div>
                        <h1 class="text-5xl font-bold">DNA Builder</h1>
                        <div class="py-4">
                            {{ $t("home.cureent_version") }}
                            <a class="link" :href="`https://github.com/pa001024/dna-builder/releases/tag/v${pg.version}`" target="_blank">
                                {{ pg.version }}
                            </a>
                        </div>

                        <div class="inline-flex gap-4">
                            <a
                                v-if="!env.isApp"
                                href="https://github.com/pa001024/dna-builder/releases/latest"
                                target="_blank"
                                class="btn btn-primary"
                            >
                                <Icon icon="ri:windows-fill" class="w-6 h-6" />
                                {{ $t("home.download") }}
                            </a>
                            <a href="https://github.com/pa001024/dna-builder" target="_blank" class="btn btn-primary">
                                <Icon icon="ri:github-fill" class="w-6 h-6" />
                                {{ $t("home.starme") }}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            <div class="p-4 grid grid-cols-2 lg:grid-cols-4 w-full justify-items-center gap-4 max-w-6xl mx-auto">
                <RouterLink
                    v-for="item in items"
                    :to="item.path"
                    class="w-full shadow-xl/5 flex flex-col justify-center items-center p-8 gap-2 bg-base-100/50 hover:bg-base-100 hover:animate-pulse transition-all duration-500 rounded-lg"
                >
                    <div class="text-primary">
                        <Icon :icon="item.icon" class="w-12 h-12" />
                    </div>
                    <div class="text-xl font-bold text-primary">
                        {{ $t(`${item.name}.title`) }}
                    </div>
                    <div class="text-sm text-gray-500">{{ $t(`${item.name}.desc`) }}</div>
                </RouterLink>
            </div>
            <RouterLink
                v-if="env.isApp"
                to="/game-launcher"
                class="w-80 btn btn-primary btn-lg fixed right-8 bottom-8"
                :class="{ 'btn-disabled': game.running }"
            >
                <Icon icon="ri:rocket-2-line" class="w-6 h-6" />
                {{ game.running ? $t("game-launcher.launched") : $t("game-launcher.launch") }}
            </RouterLink>
        </ScrollArea>

        <!-- Welcome Popup Modal using daisyUI dialog -->
        <dialog class="modal" :class="{ 'modal-open': showModal }" @click="closeModal" ref="dialogRef">
            <div class="modal-box bg-base-100 w-[80%] min-w-72 max-w-160" @click.stop>
                <div class="text-center">
                    <h3 class="text-xl font-bold">{{ $t("home.welcome") }} {{ currentVersion }}</h3>
                    <p class="text-sm text-gray-500">{{ $t("home.update_log") }}</p>
                </div>
                <div class="max-h-96 overflow-y-auto py-4">
                    <div v-if="versions.length > 0" class="space-y-4">
                        <div
                            v-for="version in versions.filter((v) => v.version > lastPopupVersion)"
                            :key="version.version"
                            class="bg-base-200 p-4 rounded-lg"
                        >
                            <div class="font-bold text-primary">{{ version.version }}</div>
                            <div class="text-sm text-base-content/80 mt-1">
                                <ul class="list-disc list-inside">
                                    <template v-for="item in version.msg.split(', ')" :key="item">
                                        <li>{{ item }}</li>
                                    </template>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div v-else class="text-center text-gray-500">{{ $t("home.noupdate") }}</div>
                </div>
                <div class="modal-action justify-center">
                    <button class="btn btn-primary" @click="closeModal">{{ $t("home.understand") }}</button>
                </div>
            </div>
            <div class="modal-backdrop" @click="closeModal"></div>
        </dialog>
    </div>
</template>
