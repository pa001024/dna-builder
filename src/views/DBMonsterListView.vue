<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { parseNumberOrEmptySearchParam, useSearchParam } from "@/composables/useSearchParam"
import { Faction, LeveledMonster, monsterMap } from "@/data"
import monsterData from "@/data/d/monster.data"
import { monsterTagData } from "@/data/d/monstertag.data"
import { getMonsterTagGroupByMonster, monsterTagGroups } from "@/utils/monster-tag-utils"
import { getMonsterListRarity } from "@/utils/monster-utils"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"

type MonsterListType = "allMonster" | "normalMonster" | "commanderMonster" | "monsterTag" | "monster"
type NormalizedMonsterListType = Exclude<MonsterListType, "monster">

const searchKeyword = useSearchParam<string>("kw", "")
const selectedMonsterId = useSearchParam<number>("id", 0)
const selectedMonsterTagId = useSearchParam<string>("mtag", "")
const selectedType = useSearchParam<MonsterListType>("tp", "allMonster")
const selectedFaction = useSearchParam<number | "">("fac", "", { parse: parseNumberOrEmptySearchParam })

/**
 * 归一化资料类型（兼容旧值 monster）。
 */
const normalizedSelectedType = computed<NormalizedMonsterListType>(() => {
    if (selectedType.value === "monster") {
        return "allMonster"
    }
    return selectedType.value
})

// 根据 ID 获取选中的怪物
const selectedMonster = computed(() => {
    return selectedMonsterId.value ? monsterMap.get(selectedMonsterId.value) || null : null
})

// 根据 ID 获取选中的号令者
const selectedMonsterTag = computed(() => {
    return selectedMonsterTagId.value ? monsterTagData.find(tag => tag.id === selectedMonsterTagId.value) || null : null
})

// 获取所有可用阵营
const factions = computed(() => {
    const factionSet = new Set<number>()
    monsterData.forEach(m => {
        if (m.f !== undefined) {
            factionSet.add(m.f)
        }
    })
    return Array.from(factionSet).sort((a, b) => a - b)
})

/**
 * 有号令者词条关联的怪物ID集合。
 */
const commanderMonsterIdSet = computed(() => {
    const idSet = new Set<number>()
    monsterData.forEach(monster => {
        if (monster.id < 2000000) {
            return
        }
        if (getMonsterTagGroupByMonster(monster)) {
            idSet.add(monster.id)
        }
    })
    return idSet
})

// 过滤怪物列表
const filteredMonsters = computed(() => {
    if (normalizedSelectedType.value === "monsterTag") {
        return []
    }

    return monsterData.filter(m => {
        if (m.id < 2000000) return false

        // 搜索筛选
        let matchKeyword = false
        if (searchKeyword.value === "") {
            matchKeyword = true
        } else {
            const q = searchKeyword.value
            // 直接中文匹配
            if (m.n.includes(q)) {
                matchKeyword = true
            } else {
                // 拼音匹配（全拼/首字母）
                matchKeyword = matchPinyin(m.n, q).match
            }
        }

        const matchFaction = selectedFaction.value === "" || m.f === selectedFaction.value
        if (!matchKeyword || !matchFaction) {
            return false
        }

        if (normalizedSelectedType.value === "normalMonster") {
            return !commanderMonsterIdSet.value.has(m.id)
        }

        if (normalizedSelectedType.value === "commanderMonster") {
            return commanderMonsterIdSet.value.has(m.id)
        }

        return true
    })
})

// 过滤号令者列表
const filteredMonsterTags = computed(() => {
    return monsterTagGroups.filter(group => {
        if (searchKeyword.value === "") {
            return true
        }

        const query = searchKeyword.value
        if (group.name.includes(query) || group.primaryTag.id.includes(query)) {
            return true
        }

        return matchPinyin(group.name, query).match
    })
})

/**
 * 选择怪物并清空号令者选中状态。
 * @param monsterId 怪物ID
 */
function selectMonster(monsterId: number): void {
    selectedMonsterId.value = monsterId
    selectedMonsterTagId.value = ""
}

/**
 * 选择号令者并清空怪物选中状态。
 * @param monsterTagId 号令者ID
 */
function selectMonsterTag(monsterTagId: string): void {
    selectedMonsterTagId.value = monsterTagId
    selectedMonsterId.value = 0
}

/**
 * 关闭右侧详情面板并重置当前选中。
 */
function clearSelection(): void {
    selectedMonsterId.value = 0
    selectedMonsterTagId.value = ""
}

// 根据阵营ID获取阵营名称
function getFactionName(faction: number | undefined): string {
    if (faction === undefined) return "其他"
    return Faction[faction] || `阵营${faction}`
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbmo-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedMonster || selectedMonsterTag }"
            >
                <!-- 检索带：下划线搜索 + 计数 + 资料类型方章 -->
                <div
                    class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise"
                >
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索怪物名称（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ normalizedSelectedType === "monsterTag" ? filteredMonsterTags.length : filteredMonsters.length }}
                        </span>
                    </div>

                    <!-- 资料类型筛选方章 -->
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                normalizedSelectedType === 'allMonster'
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 'allMonster'"
                        >
                            全部
                        </button>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                normalizedSelectedType === 'normalMonster'
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 'normalMonster'"
                        >
                            普通
                        </button>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                normalizedSelectedType === 'commanderMonster'
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 'commanderMonster'"
                        >
                            号令者
                        </button>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                normalizedSelectedType === 'monsterTag'
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 'monsterTag'"
                        >
                            号令者词条
                        </button>
                    </div>

                    <!-- 阵营筛选方章 -->
                    <div v-if="normalizedSelectedType !== 'monsterTag'" class="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedFaction === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedFaction = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="faction in factions"
                            :key="faction"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedFaction === faction
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedFaction = faction"
                        >
                            {{ $t(getFactionName(faction)) }}
                        </button>
                    </div>
                </div>

                <!-- 列表 -->
                <ScrollArea class="flex-1">
                    <div
                        class="p-3 grid gap-2"
                        :class="{ 'grid-cols-[repeat(auto-fill,minmax(120px,1fr))]': normalizedSelectedType !== 'monsterTag' }"
                    >
                        <template v-if="normalizedSelectedType !== 'monsterTag'">
                            <article
                                v-for="(monster, index) in filteredMonsters"
                                :key="monster.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedMonsterId === monster.id
                                        ? 'dbmo-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectMonster(monster.id)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedMonsterId === monster.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex flex-col items-center gap-2 p-3 text-center">
                                    <ImageFallback
                                        :src="LeveledMonster.url(monster.icon)"
                                        :alt="monster.n"
                                        class="size-14 shrink-0 overflow-hidden rounded-xs bg-linear-15"
                                        :class="getRarityGradientClass(getMonsterListRarity(monster.t))"
                                    >
                                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="monster.n" class="size-14 shrink-0" />
                                    </ImageFallback>
                                    <div class="min-w-0 w-full">
                                        <div
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedMonsterId === monster.id }"
                                        >
                                            {{ $t(monster.n) }}
                                        </div>
                                        <div class="mt-1 truncate text-[11px] text-base-content/55">
                                            {{ $t(getFactionName(monster.f)) }}
                                        </div>
                                    </div>
                                    <div class="font-mono text-[10px] tabular-nums text-base-content/35">ID {{ monster.id }}</div>
                                </div>
                            </article>
                        </template>

                        <template v-else>
                            <article
                                v-for="(monsterTag, index) in filteredMonsterTags"
                                :key="monsterTag.primaryTag.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedMonsterTagId === monsterTag.primaryTag.id
                                        ? 'dbmo-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectMonsterTag(monsterTag.primaryTag.id)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedMonsterTagId === monsterTag.primaryTag.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="p-3">
                                    <div class="flex items-start justify-between gap-2">
                                        <div class="min-w-0">
                                            <div
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedMonsterTagId === monsterTag.primaryTag.id }"
                                            >
                                                {{ monsterTag.name }}
                                            </div>
                                            <div class="mt-1 font-mono text-[10px] tabular-nums text-base-content/35">
                                                {{ monsterTag.primaryTag.id }}
                                            </div>
                                        </div>
                                        <span
                                            class="shrink-0 rounded-xs border border-base-content/15 px-1 py-0.5 text-[10px] leading-4 tracking-wide text-base-content/55"
                                        >
                                            {{ monsterTag.tags.length }} 词条
                                        </span>
                                    </div>
                                    <div class="mt-2 line-clamp-2 text-xs leading-relaxed text-base-content/60">
                                        {{ monsterTag.primaryTag.desc }}
                                    </div>
                                </div>
                            </article>
                        </template>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-center text-[11px] tracking-wide text-base-content/50">
                        <template v-if="normalizedSelectedType === 'allMonster'">
                            共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredMonsters.length }}</b> 个怪物
                        </template>
                        <template v-else-if="normalizedSelectedType === 'normalMonster'">
                            共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredMonsters.length }}</b> 个普通怪物
                        </template>
                        <template v-else-if="normalizedSelectedType === 'commanderMonster'">
                            共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredMonsters.length }}</b> 个号令者怪物
                        </template>
                        <template v-else>
                            共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredMonsterTags.length }}</b> 个号令者词条
                        </template>
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedMonster || selectedMonsterTag"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="clearSelection"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedMonster" class="min-w-0 flex-1">
                <DBMonsterDetailItem :key="selectedMonsterId" :monster="selectedMonster" />
            </ScrollArea>

            <ScrollArea v-if="selectedMonsterTag" class="min-w-0 flex-1">
                <DBMonsterTagDetailItem :key="selectedMonsterTagId" :monster-tag="selectedMonsterTag" />
            </ScrollArea>
        </div>
    </div>
</template>
