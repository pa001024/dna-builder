<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useRoute } from "vue-router"
import { useGameText } from "@/composables/useGameText"
import { dungeonMap } from "@/data/d"
import { buildNestRows } from "@/utils/transcendence-nest"

const route = useRoute()
const { gt } = useGameText()
const { t } = useTranslation()

const nest = computed(() => {
    const id = Number(route.params.dungeonId)

    return Number.isSafeInteger(id) ? (buildNestRows(gt, t).find(row => row.dungeonId === id) ?? null) : null
})

const dungeon = computed(() => (nest.value ? (dungeonMap.get(nest.value.dungeonId) ?? null) : null))
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollSpyLayout v-if="nest && dungeon" auto nav-kicker="DATABASE" class="flex-1">
            <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
                <DBDungeonDetailItem :dungeon="dungeon" :nest="nest" />
            </div>
        </ScrollSpyLayout>

        <div v-else class="flex flex-1 items-center justify-center p-6">
            <div class="text-sm text-base-content/70">{{ $t("db-transcendence.detail.not_found") }}</div>
        </div>
    </div>
</template>
