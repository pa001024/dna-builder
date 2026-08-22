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
    <ScrollArea class="h-full">
        <!-- 居中容器：与首页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <div>
                <DBAchievementDetailItem :achievement="achievement" />
            </div>
        </div>
    </ScrollArea>
</template>
