<script setup lang="ts">
import type { IconTypes } from "../components/Icon.vue"

const items = [
    {
        name: "game-launcher",
        path: "/game-launcher",
        icon: "ri:rocket-2-line",
    },
    {
        name: "char-build",
        path: "/char-build",
        icon: "ri:hammer-line",
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
        name: "achievement",
        path: "/achievement",
        icon: "ri:trophy-line",
    },
    {
        name: "game",
        path: "/game",
        icon: "la:gamepad-solid",
    },
    {
        name: "help",
        path: "/help",
        icon: "ri:question-line",
    },
] satisfies { name: string; path: string; icon: IconTypes }[]
</script>
<template>
    <div class="h-full">
        <div class="p-4 grid grid-cols-2 lg:grid-cols-4 w-full justify-items-center gap-4">
            <RouterLink
                v-for="item in items"
                :key="item.name"
                :to="item.path"
                class="container flex flex-col justify-center items-center p-8 gap-2 bg-base-100/50 hover:bg-base-100 hover:animate-pulse transition-all duration-500 rounded-lg"
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
    </div>
</template>
