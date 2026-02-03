<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { monsterMap } from "../data"

const route = useRoute()

const monster = computed(() => monsterMap.get(Number(route.params.monsterId)))
if (!monster.value) {
    throw new Error("Monster not found")
}
</script>

<template>
    <ScrollArea class="h-full">
        <DBMonsterDetailItem :monster="monster!" />
    </ScrollArea>
</template>
