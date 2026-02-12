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
        <DBMonsterTagDetailItem :monster-tag="monsterTag" />
    </ScrollArea>
</template>

