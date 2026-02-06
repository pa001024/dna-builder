<script lang="tsx" setup>
import { onMounted } from "vue"
import { useUIStore } from "@/store/ui"
import pg from "../../package.json"
import type { IconTypes } from "../components/Icon.vue"
import { env } from "../env"

const items = [
    {
        name: "char-build",
        path: "/char",
        icon: "ri:hammer-line",
    },
    {
        name: "database",
        path: "/db",
        icon: "ri:book-line",
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

onMounted(() => {
    if (env.isApp) {
        return
    }
})

async function checkUpdate() {
    await window.updateApp()
    useUIStore().showSuccessMessage("已是最新版本")
}
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea class="h-full">
            <div class="hero bg-base-200 py-8 relative bg-linear-to-br from-purple-500/30 via-gray-500/30 to-blue-500/30">
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
                    />
                </div>
                <!-- 闪烁星星 -->
                <div class="absolute inset-0 overflow-hidden">
                    <div
                        v-for="index in 20"
                        :key="index"
                        class="absolute aspect-square bg-cyan-400/50 rounded-full animate-ping"
                        :style="{
                            width: `${0.1 + Math.random() * 0.2}em`,
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 3}s`,
                            animationDuration: `${1 + Math.random() * 2}s`,
                        }"
                    />
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
                            <a v-if="!env.isApp" href="/api/download" target="_blank" class="btn btn-primary btn-sm sm:btn-md">
                                <Icon icon="ri:windows-fill" class="w-5 h-5 sm:w-6 sm:h-6" />
                                <span class="hidden sm:inline">{{ $t("home.download") }}</span>
                            </a>
                            <button v-else @click="checkUpdate" class="btn btn-primary btn-sm sm:btn-md">
                                <Icon icon="ri:refresh-line" class="w-5 h-5 sm:w-6 sm:h-6" />
                                <span class="hidden sm:inline">{{ $t("home.checkUpdate") }}</span>
                            </button>
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
                    v-for="(item, index) in items"
                    :key="index"
                    :to="item.path"
                    class="w-full shadow-xl/5 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 gap-2 bg-base-100/50 hover:bg-base-100 hover:animate-pulse transition-all duration-500 rounded-lg mobile-card"
                >
                    <div class="text-primary">
                        <Icon :icon="item.icon" class="w-10 h-10 sm:w-12 sm:h-12" />
                    </div>
                    <div class="text-lg sm:text-xl font-bold text-primary text-center">
                        {{ $t(`${item.name}.title`) }}
                    </div>
                    <div class="text-xs sm:text-sm text-gray-500 text-center">
                        {{ $t(`${item.name}.desc`) }}
                    </div>
                </RouterLink>
            </div>

            <div class="w-full max-w-6xl mx-auto p-2 sm:p-4">
                <div class="card bg-base-100 shadow-md">
                    <div class="card-body p-3 sm:p-4">
                        <TodoList />
                    </div>
                </div>
            </div>

            <!-- 活动日历组件 -->
            <ActivityCalendar />

            <div v-if="!env.isApp" class="flex items-center justify-center p-4">
                <a class="link center" href="https://beian.miit.gov.cn" target="_blank" one-link-mark="yes">浙ICP备2024097919号</a>
            </div>
        </ScrollArea>
    </div>
</template>
