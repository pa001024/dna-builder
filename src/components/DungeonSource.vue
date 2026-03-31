<script lang="ts" setup>
import { computed, ref } from "vue"
import type { Dungeon } from "@/data"
import { dungeonMap } from "@/data"
import { getDungeonName } from "@/utils/dungeon-utils"
import { type ResourceDungeonSourceInfo } from "@/utils/resource-source"

type DungeonSourceItem = ResourceDungeonSourceInfo & {
    dungeon?: Dungeon
}

const props = defineProps<{
    dungeonSources: DungeonSourceItem[]
}>()

const expandedDungeonId = ref<number | null>(null)

function toggleDungeonExpand(dungeonId: number) {
    expandedDungeonId.value = expandedDungeonId.value === dungeonId ? null : dungeonId
}

const displayDungeonSources = computed(() => {
    return props.dungeonSources
        .map(source => ({
            ...source,
            dungeon: source.dungeon ?? dungeonMap.get(source.dungeonId),
        }))
        .filter((source): source is ResourceDungeonSourceInfo & { dungeon: Dungeon } => Boolean(source.dungeon))
})
</script>

<template>
    <div v-if="displayDungeonSources.length > 0" class="space-y-2">
        <div class="text-xs text-base-content/60">{{ $t("database.dungeon") }}</div>
        <div class="space-y-2 text-sm">
            <div v-for="source in displayDungeonSources" :key="source.key" class="space-y-2">
                <div
                    @click="toggleDungeonExpand(source.dungeonId)"
                    class="flex flex-col gap-1 p-2 bg-base-300 rounded hover:bg-base-content/10 transition-colors cursor-pointer"
                >
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2 min-w-0">
                            <SRouterLink :to="`/db/dungeon/${source.dungeonId}`" class="hover:underline min-w-0 truncate">
                                {{ getDungeonName(source.dungeon) }}
                            </SRouterLink>
                            <span v-if="source.dungeonLv" class="text-xs text-base-content/70">Lv.{{ source.dungeonLv }}</span>
                            <span class="text-xs text-base-content/70">ID: {{ source.dungeonId }}</span>
                        </div>
                        <Icon
                            :icon="expandedDungeonId === source.dungeonId ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
                            class="text-xs"
                        />
                    </div>
                    <div class="text-xs text-base-content/50">
                        <span v-if="source.pp" class="mr-2">概率: {{ +(source.pp * 100).toFixed(2) }}%</span>
                        <span v-if="typeof source.times === 'number' && Number.isFinite(source.times)">期望: {{ +source.times.toFixed(2) }}次</span>
                    </div>
                </div>
                <div v-if="expandedDungeonId === source.dungeonId" class="p-3 bg-base-100 rounded border border-base-200">
                    <DBDungeonDetailItem :dungeon="source.dungeon" />
                </div>
            </div>
        </div>
    </div>
</template>
