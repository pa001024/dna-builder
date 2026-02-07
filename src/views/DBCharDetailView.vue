<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import charData from "../data/d/char.data"

const route = useRoute()

const char = computed(() => {
    const id = Number(route.params.id)
    const foundChar = charData.find(c => c.id === id)
    if (!foundChar) {
        throw new Error(`角色 ID ${id} 未找到`)
    }
    return foundChar
})
</script>

<template>
    <ScrollArea class="h-full">
        <DBCharDetailItem :char="char" />
    </ScrollArea>
</template>