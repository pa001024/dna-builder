<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import petData, { type PetEntry, petEntrys } from "@/data/d/pet.data"

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
        <!-- 居中容器：与百科详情页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBPetDetailItem v-if="'名称' in pet" :pet="pet" />
            <DBPetEntryDetailItem v-else :entry="pet as PetEntry" />
        </div>
    </ScrollArea>
</template>
