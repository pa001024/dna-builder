<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { guildWarBossMap } from "@/data/d"

const route = useRoute()

const bossId = computed(() => Number(route.params.bossId))
const boss = computed(() => guildWarBossMap.get(bossId.value))
</script>

<template>
    <ScrollSpyLayout auto nav-kicker="DATABASE" class="h-full">
        <div v-if="boss" class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBGuildWarDetailItem :boss="boss" />
        </div>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">{{ $t("db-guildwar-detail.not_found") }}</div>
        </div>
    </ScrollSpyLayout>
</template>
