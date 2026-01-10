<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import modData from "../data/d/mod.data"

const route = useRoute()

const mod = computed(() => {
    const id = Number(route.params.id)
    const foundMod = modData.find(m => m.id === id)
    if (!foundMod) {
        throw new Error(`Mod with id ${id} not found`)
    }
    return foundMod
})
</script>

<template>
    <div class="h-full flex flex-col">
        <DBModDetailItem :mod="mod" class="flex-1" />
    </div>
</template>
