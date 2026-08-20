<script lang="ts" setup>
import { computed, ref } from "vue"
import type { Dungeon } from "@/data"
import { dungeonMap, LeveledChar } from "@/data"
import { getDungeonName, getDungeonType } from "@/utils/dungeon-utils"
import { type ResourceDungeonSourceInfo } from "@/utils/resource-source"

type DungeonSourceItem = ResourceDungeonSourceInfo & {
    dungeon?: Dungeon
}

const props = defineProps<{
    dungeonSources: DungeonSourceItem[]
}>()

/** 元素对应的缩略图淡渐变背景（与 DBLatestItemCard 保持一致）。 */
const elementBgClasses: Record<string, string> = {
    光: "bg-linear-to-b from-yellow-500/25 to-yellow-100/10",
    暗: "bg-linear-to-b from-gray-600/25 to-gray-200/10",
    水: "bg-linear-to-b from-blue-500/25 to-blue-100/10",
    火: "bg-linear-to-b from-red-500/25 to-red-100/10",
    雷: "bg-linear-to-b from-violet-500/25 to-violet-100/10",
    风: "bg-linear-to-b from-emerald-500/25 to-emerald-100/10",
}

const expandedDungeonId = ref<number | null>(null)

/**
 * 切换副本详情展开状态。
 * @param dungeonId 副本 ID
 */
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

/** 当前展开的副本来源（卡片点击后展示其完整详情）。 */
const expandedDungeonSource = computed(() => {
    if (expandedDungeonId.value === null) {
        return null
    }
    return displayDungeonSources.value.find(source => source.dungeonId === expandedDungeonId.value) || null
})
</script>

<template>
    <div v-if="displayDungeonSources.length > 0" class="space-y-2">
        <div class="text-xs text-base-content/60">{{ $t("database.dungeon") }}</div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2 text-sm">
            <div
                v-for="source in displayDungeonSources"
                :key="source.key"
                class="group flex w-full cursor-pointer items-center gap-2.5 border border-base-content/15 bg-base-100 p-2 text-left transition-colors duration-200 hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                @click="toggleDungeonExpand(source.dungeonId)"
            >
                <div
                    class="relative size-11 shrink-0 overflow-hidden rounded"
                    :class="source.dungeon.e ? elementBgClasses[source.dungeon.e] || 'bg-base-200/40' : 'bg-base-200/40'"
                >
                    <img
                        v-if="source.dungeon.e"
                        :src="LeveledChar.elementUrl(source.dungeon.e)"
                        :alt="source.dungeon.e"
                        class="absolute inset-0 m-auto h-7 w-3.5 object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                        <h4
                            class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                        >
                            <SRouterLink :to="`/db/dungeon/${source.dungeonId}`" stop class="hover:underline">
                                {{ getDungeonName(source.dungeon) }}
                            </SRouterLink>
                        </h4>
                        <span
                            v-if="source.dungeonLv"
                            class="ml-auto shrink-0 border border-base-content/25 px-1 py-px font-mono text-[9px] tracking-[0.12em] text-base-content/70"
                        >
                            Lv.{{ source.dungeonLv }}
                        </span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-base-content/45">
                        <span
                            class="shrink-0 rounded-sm px-1 py-px font-mono text-[8px] font-semibold uppercase tracking-[0.15em] text-white"
                            :class="getDungeonType(source.dungeon.t).color"
                        >
                            {{ getDungeonType(source.dungeon.t).label }}
                        </span>
                        <span v-if="source.pp" class="truncate">概率 {{ +(source.pp * 100).toFixed(2) }}%</span>
                        <span v-if="typeof source.times === 'number' && Number.isFinite(source.times)" class="truncate"
                            >期望 {{ +source.times.toFixed(2) }}次</span
                        >
                        <Icon
                            :icon="expandedDungeonId === source.dungeonId ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
                            class="ml-auto shrink-0 text-xs"
                        />
                    </div>
                </div>
            </div>
            <div v-if="expandedDungeonSource" class="col-span-full p-2.5 bg-base-200 rounded overflow-hidden">
                <DBDungeonDetailItem :dungeon="expandedDungeonSource.dungeon" />
            </div>
        </div>
    </div>
</template>
