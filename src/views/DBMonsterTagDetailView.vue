<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { monsterTagData } from "@/data/d/monstertag.data"

const route = useRoute()

const monsterTag = computed(() => {
    const foundTag = monsterTagData.find(tag => tag.id === route.params.monsterTagId)
    if (!foundTag) {
        throw new Error("MonsterTag not found")
    }

    return foundTag
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBMonsterTagDetailItem :monster-tag="monsterTag" />
        </div>
    </ScrollArea>
</template>
