<script setup lang="ts">
import { computed, ref } from "vue"
import { useGameText } from "@/composables/useGameText"
import { LeveledMonster, monsterData } from "@/data"
import type { Monster } from "@/data/d/monster.data"
import { formatBigNumber } from "@/util"
import { getMonsterType } from "@/utils/monster-utils"
import { matchPinyin } from "@/utils/pinyin-utils"

const props = defineProps<{
    selectedId?: number
    level?: number
}>()

const emits = defineEmits<{
    select: [id: number]
}>()

const STUB_IDS = new Set([0, 130, 200, 300])

type MonsterTab = "all" | "normal" | "elite" | "boss" | "stub"

const activeTab = ref<MonsterTab>("all")
const searchQuery = ref("")

const tabs: { key: MonsterTab; label: string }[] = [
    { key: "all", label: "common.all" },
    { key: "normal", label: "db-monster-list.normal" },
    { key: "elite", label: "精英" },
    { key: "boss", label: "首领" },
    { key: "stub", label: "char-build.monster_type_stub" },
]

function getMonsterTab(monster: Monster): MonsterTab {
    if (STUB_IDS.has(monster.id)) {
        return "stub"
    }
    if (monster.t === "Boss") {
        return "boss"
    }
    if (monster.t === "Elite_Monster" || monster.t === "Rescue_Elite_Monster") {
        return "elite"
    }
    return "normal"
}

function getTypeStyle(tab: MonsterTab): { key: string; color: string } {
    switch (tab) {
        case "stub":
            return { key: "char-build.monster_type_stub", color: "bg-base-content/40" }
        case "normal":
            return { key: "db-monster-list.normal", color: getMonsterType(undefined).color }
        case "elite":
            return { key: "精英", color: getMonsterType("Elite_Monster").color }
        case "boss":
            return { key: "首领", color: getMonsterType("Boss").color }
        default:
            return { key: "common.all", color: "bg-base-content/40" }
    }
}

function matchMonster(monster: Monster, query: string): boolean {
    if (monster.n.includes(query)) {
        return true
    }
    return matchPinyin(monster.n, query).match
}

const filteredMonsters = computed(() => {
    const query = searchQuery.value.trim()
    return monsterData
        .filter(monster => activeTab.value === "all" || getMonsterTab(monster) === activeTab.value)
        .filter(monster => !query || matchMonster(monster, query))
})

const leveledStatsCache = new Map<string, { hp: number; es: number; def: number }>()

function getDisplayStats(monster: Monster): { hp: number; es: number; def: number } {
    if (props.level === undefined) {
        return { hp: monster.hp, es: monster.es || 0, def: monster.def }
    }

    const cacheKey = `${monster.id}:${props.level}`
    let stats = leveledStatsCache.get(cacheKey)
    if (!stats) {
        const leveled = new LeveledMonster(monster, props.level)
        stats = { hp: leveled.hp, es: leveled.es || 0, def: leveled.def }
        leveledStatsCache.set(cacheKey, stats)
    }
    return stats
}

const { gt } = useGameText()

function selectMonster(monster: Monster) {
    emits("select", monster.id)
}
</script>

<template>
    <div class="flex h-full flex-col overflow-hidden">
        <ScrollArea class="flex-1">
            <div class="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 md:px-6 lg:px-8">
                <section class="border-b border-base-content/15 py-6">
                    <div class="flex flex-col gap-4">
                        <div class="relative min-w-0">
                            <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                            <input
                                v-model="searchQuery"
                                type="text"
                                :placeholder="$t('db-monster-list.search_placeholder')"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                            />
                            <span
                                class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                            >
                                {{ filteredMonsters.length }}
                            </span>
                        </div>

                        <ScrollArea :vertical="false" horizontal>
                            <div class="flex gap-2 pb-1">
                                <button
                                    v-for="tab in tabs"
                                    :key="tab.key"
                                    type="button"
                                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-3.5 py-1.5 text-xs transition-colors duration-200 active:scale-[0.97]"
                                    :class="
                                        activeTab === tab.key
                                            ? 'border-primary bg-primary font-semibold text-primary-content'
                                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                    "
                                    @click="activeTab = tab.key"
                                >
                                    {{ $t(tab.label) }}
                                </button>
                            </div>
                        </ScrollArea>
                    </div>
                </section>

                <main class="flex-1 py-6 md:py-8">
                    <div
                        v-if="filteredMonsters.length === 0"
                        class="flex flex-col items-center justify-center py-24 text-base-content/50"
                    >
                        <Icon icon="ri:emotion-sad-line" class="mb-5 h-14 w-14 opacity-40" />
                        <p class="text-base">{{ $t("common.no_data") }}</p>
                    </div>

                    <div
                        v-else
                        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-3 md:grid-cols-[repeat(auto-fill,minmax(min(100%,170px),1fr))]"
                    >
                        <button
                            v-for="monster in filteredMonsters"
                            :key="monster.id"
                            type="button"
                            class="group relative flex cursor-pointer flex-col overflow-hidden rounded-xs border text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.985]"
                            :class="
                                monster.id === selectedId
                                    ? 'border-primary/70 bg-primary/10'
                                    : 'border-base-content/15 bg-base-100/50 hover:border-primary/50'
                            "
                            @click="selectMonster(monster)"
                        >
                            <div class="relative aspect-square overflow-hidden bg-base-200">
                                <ImageFallback
                                    :src="LeveledMonster.url(monster.icon)"
                                    :alt="monster.n"
                                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    loading="lazy"
                                >
                                    <Icon icon="ri:skull-line" class="h-full w-full opacity-40" />
                                </ImageFallback>
                                <span
                                    class="absolute left-1.5 top-1.5 rounded-xs px-1.5 py-0.5 text-[10px] font-medium text-primary-content"
                                    :class="getTypeStyle(getMonsterTab(monster)).color"
                                >
                                    {{ $t(getTypeStyle(getMonsterTab(monster)).key) }}
                                </span>
                                <span
                                    v-if="level"
                                    class="absolute right-1.5 top-1.5 rounded-xs bg-base-100/70 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-base-content/70 backdrop-blur-xs"
                                >
                                    Lv.{{ level }}
                                </span>
                            </div>

                            <div class="flex flex-1 flex-col gap-1.5 p-2">
                                <h3 class="truncate text-xs font-semibold text-base-content transition-colors duration-200 group-hover:text-primary">
                                    {{ gt(monster.n) }}
                                </h3>
                                <div class="mt-auto grid grid-cols-3 gap-1 border-t border-base-content/10 pt-1.5">
                                    <div class="flex min-w-0 flex-col gap-0.5" :title="$t('生命')">
                                        <span class="truncate text-[10px] text-base-content/50">{{ $t("生命") }}</span>
                                        <span class="truncate font-orbitron text-[11px] font-semibold tabular-nums text-error">
                                            {{ formatBigNumber(getDisplayStats(monster).hp, 0) }}
                                        </span>
                                    </div>
                                    <div class="flex min-w-0 flex-col gap-0.5" :title="$t('护盾')">
                                        <span class="truncate text-[10px] text-base-content/50">{{ $t("护盾") }}</span>
                                        <span class="truncate font-orbitron text-[11px] font-semibold tabular-nums text-info">
                                            {{ formatBigNumber(getDisplayStats(monster).es, 0) }}
                                        </span>
                                    </div>
                                    <div class="flex min-w-0 flex-col gap-0.5" :title="$t('防御')">
                                        <span class="truncate text-[10px] text-base-content/50">{{ $t("防御") }}</span>
                                        <span class="truncate font-orbitron text-[11px] font-semibold tabular-nums text-success">
                                            {{ formatBigNumber(getDisplayStats(monster).def) }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="monster.id === selectedId ? 'opacity-100' : 'opacity-0'"
                            />
                        </button>
                    </div>
                </main>

                <footer class="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-t border-base-content/15 py-5">
                    <div class="flex items-baseline gap-3">
                        <span
                            class="text-[clamp(2rem,4vw,2.75rem)] font-black leading-[0.95] tracking-[-0.03em] tabular-nums text-base-content/18"
                        >
                            {{ filteredMonsters.length }}
                        </span>
                        <span class="text-xs text-base-content/45">{{ $t("monster-list.title") }}</span>
                    </div>
                    <span
                        v-if="activeTab !== 'all'"
                        class="border border-primary/60 px-2 py-[0.15rem] text-[10px] tracking-[0.2em] text-primary"
                    >
                        {{ $t(getTypeStyle(activeTab).key) }}
                    </span>
                </footer>
            </div>
        </ScrollArea>
    </div>
</template>
