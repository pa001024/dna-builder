<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { dungeonMap } from "@/data/d"
import { buildJourneyCommissionRows } from "@/utils/transcendence-journey"

const route = useRoute()

const commission = computed(() => {
    const id = Number(route.params.dungeonId)

    return Number.isSafeInteger(id) ? (buildJourneyCommissionRows().find(row => row.dungeonId === id) ?? null) : null
})

const dungeon = computed(() => (commission.value ? (dungeonMap.get(commission.value.dungeonId) ?? null) : null))
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollSpyLayout v-if="commission && dungeon" auto nav-kicker="DATABASE" class="flex-1">
            <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
                <DBDungeonDetailItem :dungeon="dungeon" :commission="commission" />
            </div>
        </ScrollSpyLayout>

        <div v-else class="flex flex-1 items-center justify-center p-6">
            <div class="text-sm text-base-content/70">{{ $t("db-transcendence.detail.not_found") }}</div>
        </div>
    </div>
</template>
