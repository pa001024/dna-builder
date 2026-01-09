<script lang="tsx" setup>
import { onMounted, ref } from "vue"
import { env } from "../env"
import pg from "../../package.json"
import type { IconTypes } from "../components/Icon.vue"
import { useGameStore } from "../store/game"
const downloadlink = ref("https://github.com/pa001024/dna-builder/releases/latest")

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

onMounted(() => {
    if (env.isApp) {
        return
    }
    fetch("https://rm-build.oss-cn-hongkong.aliyuncs.com/latest.json")
        .then((res) => res.json())
        .then((data) => {
            downloadlink.value = data.platforms["windows-x86_64"].url
        })
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
                <div class="hero-content text-center container pb-8">
                    <div>
                        <h1 class="text-4xl sm:text-5xl font-bold">DNA Builder</h1>
                        <div class="py-3 sm:py-4">
                            {{ $t("home.cureent_version") }}
                            <a class="link" :href="`https://github.com/pa001024/dna-builder/releases/tag/v${pg.version}`" target="_blank">
                                {{ pg.version }}
                            </a>
                        </div>

                        <div class="inline-flex flex-wrap gap-3 sm:gap-4 justify-center">
                            <a v-if="!env.isApp" :href="downloadlink" target="_blank" class="btn btn-primary btn-sm sm:btn-md">
                                <Icon icon="ri:windows-fill" class="w-5 h-5 sm:w-6 sm:h-6" />
                                <span class="hidden sm:inline">{{ $t("home.download") }}</span>
                            </a>
                            <a href="https://github.com/pa001024/dna-builder" target="_blank" class="btn btn-primary btn-sm sm:btn-md">
                                <Icon icon="ri:github-fill" class="w-5 h-5 sm:w-6 sm:h-6" />
                                <span class="hidden sm:inline">{{ $t("home.starme") }}</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            <div class="p-2 sm:p-4 grid grid-cols-2 lg:grid-cols-4 w-full justify-items-center gap-3 sm:gap-4 max-w-6xl mx-auto">
                <RouterLink
                    v-for="item in items"
                    :to="item.path"
                    class="w-full shadow-xl/5 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 gap-2 bg-base-100/50 hover:bg-base-100 hover:animate-pulse transition-all duration-500 rounded-lg mobile-card"
                >
                    <div class="text-primary">
                        <Icon :icon="item.icon" class="w-10 h-10 sm:w-12 sm:h-12" />
                    </div>
                    <div class="text-lg sm:text-xl font-bold text-primary text-center">
                        {{ $t(`${item.name}.title`) }}
                    </div>
                    <div class="text-xs sm:text-sm text-gray-500 text-center">{{ $t(`${item.name}.desc`) }}</div>
                </RouterLink>
            </div>
            <RouterLink
                v-if="env.isApp"
                to="/game-launcher"
                class="w-auto px-6 btn btn-primary btn-md sm:btn-lg fixed right-4 bottom-4 sm:right-8 sm:bottom-8 left-auto z-40"
                :class="{ 'btn-disabled': game.running }"
            >
                <Icon icon="ri:rocket-2-line" class="w-5 h-5 sm:w-6 sm:h-6" />
                <span class="hidden sm:inline">{{ game.running ? $t("game-launcher.launched") : $t("game-launcher.launch") }}</span>
            </RouterLink>
        </ScrollArea>
    </div>
</template>
