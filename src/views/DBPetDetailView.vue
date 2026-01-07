<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import petData from "../data/d/pet.data"

const route = useRoute()

const pet = computed(() => {
    const id = Number(route.params.id)
    const foundPet = petData.find((p) => p.id === id)
    if (!foundPet) {
        throw new Error(`Pet with id ${id} not found`)
    }
    return foundPet
})
</script>

<template>
    <div class="h-full flex flex-col">
        <DBPetDetailItem :pet="pet" class="flex-1" />
    </div>
</template>
