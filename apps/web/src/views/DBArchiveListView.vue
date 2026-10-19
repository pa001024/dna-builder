<script lang="ts" setup>
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { useSearchParam } from "@/composables/useSearchParam"
import { bookMap, charMap, monsterMap, resourceMap, weaponMap } from "@/data/d"
import type { ArchiveGroup } from "@/data/d/archive.data"
import { archiveData } from "@/data/d/archive.data"
import { LeveledChar } from "@/data/leveled/LeveledChar"
import { LeveledMonster } from "@/data/leveled/LeveledMonster"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"
import { matchPinyin } from "@/utils/pinyin-utils"

/** 条目展示行：名/icon 按组类型从对应实体表解析 */
interface ArchiveEntryRow {
    id: number
    name: string
    icon: string
}

const { gt } = useGameText()
const searchKeyword = useSearchParam<string>("kw", "")
/** 第一层：档案分组 id（默认 1001 角色）；第二层：页签 para；选中条目 id */
const selectedGroupId = useSearchParam<number>("g", 1001)
const selectedPara = useSearchParam<string>("tab", "")
const selectedEntryId = useSearchParam<number>("id", 0)

const selectedGroup = computed<ArchiveGroup>(() => {
    return archiveData.find(group => group.id === selectedGroupId.value) ?? archiveData[0]
})

/** 当前分组的默认页签（AllResource / AllMonster） */
const defaultPara = computed(() => {
    if (!selectedGroup.value.tabs?.length) return ""
    return selectedGroup.value.id === 1006 ? "AllMonster" : "AllResource"
})

const effectivePara = computed(() => selectedPara.value || defaultPara.value)

function selectGroup(id: number): void {
    selectedGroupId.value = id
    selectedPara.value = ""
    selectedEntryId.value = 0
}

function selectPara(para: string): void {
    selectedPara.value = para
    selectedEntryId.value = 0
}

/** 当前页签下的实体 id 列表 */
const entryIds = computed<number[]>(() => {
    const group = selectedGroup.value
    if (group.id === 1004) {
        if (effectivePara.value === "NormalResource") return group.normal ?? []
        if (effectivePara.value === "TaskResource") return group.task ?? []
        return [...(group.normal ?? []), ...(group.task ?? [])]
    }
    if (group.id === 1006) {
        if (!group.groups) return []
        if (effectivePara.value && effectivePara.value !== "AllMonster") return group.groups[effectivePara.value] ?? []
        return group.groups.AllMonster ?? []
    }
    return group.entries ?? group.series ?? []
})

function resolveEntry(id: number): ArchiveEntryRow {
    switch (selectedGroup.value.id) {
        case 1001: {
            const char = charMap.get(id)
            return { id, name: char?.名称 ?? `#${id}`, icon: LeveledChar.url(char?.icon) }
        }
        case 1002:
        case 1003: {
            const weapon = weaponMap.get(id)
            return { id, name: weapon?.名称 ?? `#${id}`, icon: LeveledWeapon.url(weapon?.icon) }
        }
        case 1004: {
            const resource = resourceMap.get(id)
            return {
                id,
                name: resource?.name ?? `#${id}`,
                icon: resource ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp",
            }
        }
        case 1005: {
            const book = bookMap.get(id)
            return {
                id,
                name: book?.name ?? `#${id}`,
                icon: book ? `/imgs/res/${book.icon}.webp` : "/imgs/webp/T_Head_Empty.webp",
            }
        }
        default: {
            const monster = monsterMap.get(id)
            return { id, name: monster?.n ?? `#${id}`, icon: LeveledMonster.url(monster?.icon) }
        }
    }
}

const filteredEntries = computed<ArchiveEntryRow[]>(() => {
    const rows = entryIds.value.map(resolveEntry)
    if (!searchKeyword.value) return rows
    const query = searchKeyword.value
    return rows.filter(row => {
        if (`${row.id}`.includes(query) || row.name.includes(query)) return true
        return matchPinyin(row.name, query).match
    })
})

const hasSelection = computed(() => selectedEntryId.value !== 0)

/** 右侧详情：按分组取实体（id 跨表重号，必须按组选表） */
const selectedChar = computed(() => (selectedGroup.value.id === 1001 ? charMap.get(selectedEntryId.value) : undefined))
const selectedWeapon = computed(() =>
    selectedGroup.value.id === 1002 || selectedGroup.value.id === 1003 ? weaponMap.get(selectedEntryId.value) : undefined
)
const selectedResource = computed(() => (selectedGroup.value.id === 1004 ? resourceMap.get(selectedEntryId.value) : undefined))
const selectedBook = computed(() => (selectedGroup.value.id === 1005 ? bookMap.get(selectedEntryId.value) : undefined))
const selectedMonster = computed(() => (selectedGroup.value.id === 1006 ? monsterMap.get(selectedEntryId.value) : undefined))

function closeDetail(): void {
    selectedEntryId.value = 0
}
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 2" :detail-open="hasSelection" @collapse="closeDetail">
            <template #master>
                <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': hasSelection }">
                    <!-- 检索带：下划线搜索 + 计数 -->
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="searchKeyword"
                            :placeholder="$t('db-archive-list.search_placeholder')"
                            :count="filteredEntries.length"
                        />
                    </div>

                    <!-- 第一层：分组单选 -->
                    <div class="flex-none border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <button
                                v-for="group in archiveData"
                                :key="group.id"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    selectedGroupId === group.id
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectGroup(group.id)"
                            >
                                {{ gt(group.title) }}
                            </button>
                        </div>
                    </div>
                    <!-- 第二层：页签单选（无页签分组不渲染） -->
                    <div
                        v-if="selectedGroup.tabs?.length"
                        class="flex-none border-b border-base-content/15 px-4 py-3 stagger-rise"
                        style="animation-delay: 0.1s"
                    >
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <button
                                v-for="tab in selectedGroup.tabs"
                                :key="tab.tab"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    effectivePara === tab.para
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectPara(tab.para)"
                            >
                                {{ gt(tab.name) }}
                            </button>
                        </div>
                    </div>

                    <!-- 条目网格 -->
                    <ScrollArea class="flex-1">
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-3">
                            <article
                                v-for="(entry, index) in filteredEntries"
                                :key="`${selectedGroupId}-${entry.id}`"
                                class="group relative flex min-w-0 cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-xs border p-3 text-center backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedEntryId === entry.id
                                        ? 'dba-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectedEntryId = entry.id"
                            >
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedEntryId === entry.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <ImageFallback :src="entry.icon" :alt="entry.name" class="size-14 shrink-0 rounded-xs object-cover">
                                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="entry.name" class="size-14 shrink-0 rounded-xs" />
                                </ImageFallback>
                                <div class="min-w-0 w-full">
                                    <div
                                        class="truncate text-sm font-medium transition-colors duration-200 group-hover:text-primary"
                                        :class="{ 'text-primary': selectedEntryId === entry.id }"
                                    >
                                        {{ entry.name.startsWith("#") ? entry.name : gt(entry.name) }}
                                    </div>
                                    <div class="mt-1 text-[11px] tabular-nums text-base-content/45">ID: {{ entry.id }}</div>
                                </div>
                            </article>
                        </div>
                    </ScrollArea>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredEntries.length }}</b>
                            {{ $t("db-archive-list.entry_unit") }}
                        </p>
                    </div>
                </div>
            </template>
            <template #detail>
                <!-- 右侧：对应实体的详情页 -->
                <ScrollArea v-if="selectedChar" :key="`char-${selectedEntryId}`" class="min-h-0 min-w-0 flex-1">
                    <DBCharDetailItem :char="selectedChar" />
                </ScrollArea>
                <ScrollArea v-else-if="selectedWeapon" :key="`weapon-${selectedEntryId}`" class="min-h-0 min-w-0 flex-1">
                    <DBWeaponDetailItem :weapon="selectedWeapon" />
                </ScrollArea>
                <ScrollArea v-else-if="selectedResource" :key="`resource-${selectedEntryId}`" class="min-h-0 min-w-0 flex-1">
                    <DBResourceDetailItem :resource="selectedResource" />
                </ScrollArea>
                <ScrollArea v-else-if="selectedBook" :key="`book-${selectedEntryId}`" class="min-h-0 min-w-0 flex-1">
                    <DBBookDetailItem :book="selectedBook" />
                </ScrollArea>
                <ScrollArea v-else-if="selectedMonster" :key="`monster-${selectedEntryId}`" class="min-h-0 min-w-0 flex-1">
                    <DBMonsterDetailItem :monster="selectedMonster" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
