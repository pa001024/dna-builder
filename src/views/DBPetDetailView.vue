<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import petData, { type PetEntry, petEntrys } from "../data/d/pet.data"

const route = useRoute()

const pet = computed<PetEntry | (typeof petData)[number]>(() => {
    const id = Number(route.params.id)
    const foundPet = petData.find(p => p.id === id)
    if (foundPet) {
        return foundPet
    }

    const foundEntry = petEntrys.find(entry => entry.id === id)
    if (foundEntry) {
        return foundEntry
    }

    throw new Error(`Pet with id ${id} not found`)
})
</script>

<template>
    <ScrollArea class="h-full">
        <DBPetDetailItem v-if="'名称' in pet" :pet="pet" />
        <DBPetEntryDetailItem v-else :entry="pet as PetEntry" />
    </ScrollArea>
</template>
