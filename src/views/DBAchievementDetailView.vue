<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import achievementData from "@/data/d/achievement.data"

const route = useRoute()

const achievement = computed(() => {
    const id = Number(route.params.id)
    const foundAchievement = achievementData.find(v => v.id === id)
    if (!foundAchievement) {
        throw new Error(`Achievement with id ${id} not found`)
    }
    return foundAchievement
})
</script>

<template>
    <ScrollArea class="h-full flex flex-col">
        <DBAchievementDetailItem :achievement="achievement" class="flex-1" />
    </ScrollArea>
</template>
