<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { baseNames } from "@/data/d/dnaseasonequip.data"

const route = useRoute()

const baseName = computed(() => {
    const id = Number(route.params.id)

    return Number.isSafeInteger(id) ? (baseNames.find(item => item.id === id) ?? null) : null
})
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollSpyLayout v-if="baseName" auto nav-kicker="DATABASE" class="flex-1">
            <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
                <DBTranscendenceGearBaseDetailItem :base-name="baseName" />
            </div>
        </ScrollSpyLayout>

        <div v-else class="flex flex-1 items-center justify-center p-6">
            <div class="text-sm text-base-content/70">{{ $t("db-transcendence.detail.not_found") }}</div>
        </div>
    </div>
</template>
