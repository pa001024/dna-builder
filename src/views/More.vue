<script setup lang="ts">
import type { IconTypes } from "../components/Icon.vue"
import { env } from "../env"

const items = [
    {
        name: "char-build",
        path: "/char",
        icon: "ri:hammer-line",
    },
    {
        name: "guides",
        path: "/guides",
        icon: "ri:book-line",
    },
    {
        name: "build-compare",
        path: "/char-build-compare",
        icon: "ri:table-view",
    },
    {
        name: "dna-home",
        path: "/dna",
        icon: "ri:chat-thread-line",
    },
    {
        name: "database",
        path: "/db",
        icon: "ri:book-line",
    },
    {
        name: "levelup",
        path: "/levelup",
        icon: "ri:calculator-line",
    },
    {
        name: "achievement",
        path: "/achievement",
        icon: "ri:trophy-line",
    },
    {
        name: "setting",
        path: "/setting",
        icon: "ri:settings-3-line",
    },
    {
        name: "game-launcher",
        path: "/game-launcher",
        icon: "ri:rocket-2-line",
    },
    {
        name: "chat",
        path: "/chat",
        icon: "ri:chat-3-line",
    },
    {
        name: "flow",
        path: "/flow",
        icon: "ri:node-tree",
    },
    {
        name: "inventory",
        path: "/inventory",
        icon: "ri:box-1-line",
    },
    {
        name: "timeline",
        path: "/timeline",
        icon: "ri:timeline-view",
    },
    {
        name: "ai",
        path: "/ai",
        icon: "ri:robot-2-line",
        show: env.isApp,
    },
    {
        name: "help",
        path: "/help",
        icon: "ri:question-line",
    },
    {
        name: "game-accounts",
        path: "/game-accounts",
        icon: "ri:user-line",
    },
] satisfies { name: string; path: string; icon: IconTypes; show?: boolean }[]
// 卡片进入动画延迟
const getAnimationDelay = (index: number) => {
    return Math.min(index * 50, 500) // 最多延迟500ms
}
</script>
<template>
    <ScrollArea class="h-full">
        <div class="flex justify-center items-center">
            <div class="p-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] w-full justify-items-center gap-4 max-w-7xl">
                <div
                    class="hover-3d w-full rounded-lg group"
                    v-for="(item, index) in items.filter(item => item.show !== false)"
                    :key="item.name"
                    :style="{ animation: `fade-in-up 0.5s ease-out ${getAnimationDelay(index)}ms both` }"
                >
                    <RouterLink
                        :to="item.path"
                        class="flex flex-col justify-center items-center p-8 gap-2 bg-base-100/50 hover:bg-base-100 rounded-lg"
                    >
                        <div class="group-hover:text-primary transition-colors duration-300">
                            <Icon :icon="item.icon" class="w-12 h-12" />
                        </div>
                        <div class="text-xl font-bold group-hover:text-primary transition-colors duration-300">
                            {{ $t(`${item.name}.title`) }}
                        </div>
                        <div class="text-sm text-gray-500">
                            {{ $t(`${item.name}.desc`) }}
                        </div>
                    </RouterLink>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
