<script setup lang="ts">
import WeaponInputNode from "./WeaponInputNode.vue"

defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()
</script>

<template>
    <WeaponInputNode v-bind="{ id, data, type, selected }" kind="melee" />
</template>
