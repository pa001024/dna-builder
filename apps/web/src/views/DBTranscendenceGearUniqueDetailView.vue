<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { affixes, uniqueEquips } from "@/data/d/dnaseasonequip.data"

const route = useRoute()

const unique = computed(() => {
    const id = Number(route.params.id)

    return Number.isSafeInteger(id) ? (uniqueEquips.find(item => item.id === id) ?? null) : null
})

const affix = computed(() => (unique.value ? (affixes.find(item => item.id === unique.value?.affixId) ?? null) : null))
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollSpyLayout v-if="unique && affix" auto nav-kicker="DATABASE" class="flex-1">
            <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
                <DBTranscendenceGearDetailItem :affix="affix" :unique="unique" />
            </div>
        </ScrollSpyLayout>

        <div v-else class="flex flex-1 items-center justify-center p-6">
            <div class="text-sm text-base-content/70">{{ $t("db-transcendence.detail.not_found") }}</div>
        </div>
    </div>
</template>
