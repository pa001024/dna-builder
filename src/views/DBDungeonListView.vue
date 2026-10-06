<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import type { FilterSelectOption } from "@/components/FilterSelect.vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledChar } from "@/data"
import dungeonData from "@/data/d/dungeon.data"
import { getDungeonName, getDungeonRewardNames, getDungeonType } from "@/utils/dungeon-utils"
import { matchPinyin } from "@/utils/pinyin-utils"

const { t } = useTranslation()

const searchKeyword = useSearchParam<string>("kw", "")
const selectedDungeonId = useSearchParam<number>("id", 0)
const selectedType = useSearchParam<string>("tp", "")
const selectedLevel = useSearchParam<string>("lv", "")
const onlyNightHandbook = useLocalStorage("dungeon.showNightHandbook", false)

// 根据 ID 获取选中的副本
const selectedDungeon = computed(() => {
    return selectedDungeonId.value ? dungeonData.find(dungeon => dungeon.id === selectedDungeonId.value) || null : null
})

// 所有副本类型
const allTypes = computed(() => {
    const types = new Set(dungeonData.map(d => d.t))
    return Array.from(types).sort()
})

// 所有副本等级
const allLevels = computed(() => {
    const levels = new Set(dungeonData.map(d => d.lv))
    return Array.from(levels).sort((a, b) => a - b)
})

const typeOptions = computed<FilterSelectOption[]>(() => [
    { value: "", label: t("common.all") },
    ...allTypes.value.map(type => {
        const info = getDungeonType(type)
        return { value: info.t, label: info.label, dotClass: info.color }
    }),
])

const levelOptions = computed<FilterSelectOption[]>(() => [
    { value: "", label: t("common.all") },
    ...allLevels.value.map(level => ({ value: `${level}`, label: `Lv.${level}` })),
])

/**
 * 按类型、等级和关键词筛选副本。
 */
const filteredDungeons = computed(() => {
    return dungeonData.filter(d => {
        const matchesNightHandbook = !onlyNightHandbook.value || d.mod != null
        if (!matchesNightHandbook) {
            return false
        }

        const matchesType = selectedType.value === "" || d.t === selectedType.value
        if (!matchesType) {
            return false
        }

        const matchesLevel = selectedLevel.value === "" || `${d.lv}` === selectedLevel.value
        if (!matchesLevel) {
            return false
        }

        if (searchKeyword.value === "") {
            return true
        } else {
            const q = searchKeyword.value
            const iname = getDungeonName(d)
            // 直接匹配（ID、名称、描述、等级）
            if (`${d.id}`.includes(q) || d.n.includes(q) || d.desc?.includes(q) || `${d.lv}`.includes(q) || iname.includes(q)) {
                return true
            } else {
                // 拼音匹配（名称、描述）
                const nameMatch = matchPinyin(d.n, q).match
                if (nameMatch) {
                    return true
                }
                if (d.desc && matchPinyin(d.desc, q).match) {
                    return true
                }
                if (iname !== d.n && matchPinyin(iname, q).match) {
                    return true
                }
                if (matchPinyin(getDungeonRewardNames(d), q).match) {
                    return true
                }
            }
        }
    })
})

function selectDungeon(dungeon: (typeof dungeonData)[0] | null) {
    selectedDungeonId.value = dungeon?.id || 0
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbdu-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView
            :desktop-ratio="1 / 2"
            :detail-open="Boolean(selectedDungeon)"
            @collapse="selectDungeon(null)"
        >
            <template #master>

            <!-- 左侧列表面板 -->
            <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedDungeon }">
                <!-- 检索带：下划线搜索 + 计数 + 过滤器开关方章 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            :placeholder="$t('db-dungeon-list.search_placeholder')"
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredDungeons.length }}
                        </span>
                    </div>

                    <!-- 过滤器开关方章 + 筛选器：常驻可清除选择框 -->
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                onlyNightHandbook
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="onlyNightHandbook = !onlyNightHandbook"
                        >
                            {{ $t('夜航手册') }}
                        </button>
                        <FilterSelect v-model="selectedType" :options="typeOptions" :label="$t('common.type')" :clear-title="$t('common.clear')" />
                        <FilterSelect v-model="selectedLevel" :options="levelOptions" :label="$t('common.level')" :clear-title="$t('common.clear')" />
                    </div>
                </div>

                <!-- 副本列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <!-- 空状态 -->
                        <div
                            v-if="filteredDungeons.length === 0"
                            class="flex flex-col items-center justify-center py-20 text-base-content/45"
                        >
                            <p class="text-sm">{{ $t('db-dungeon-list.no_match') }}</p>
                        </div>

                        <div v-else class="space-y-2">
                            <article
                                v-for="(dungeon, index) in filteredDungeons"
                                :key="dungeon.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedDungeonId === dungeon.id
                                        ? 'dbdu-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectDungeon(dungeon)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedDungeonId === dungeon.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <img
                                        v-if="dungeon.e"
                                        :src="LeveledChar.elementUrl(dungeon.e)"
                                        alt=""
                                        class="h-9 w-4 shrink-0 self-start object-cover rounded-xs"
                                    />
                                    <div class="min-w-0 flex-1">
                                        <!-- 名称行：元素 + 名称 + 类型徽记 -->
                                        <div class="flex items-baseline gap-2">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedDungeonId === dungeon.id }"
                                            >
                                                {{ getDungeonName(dungeon) }}
                                            </h3>
                                            <CopyID :id="dungeon.id" class="ml-auto shrink-0" />
                                        </div>
                                        <div v-if="dungeon.desc" class="mt-0.5 truncate text-[11px] text-base-content/45">
                                            {{ dungeon.desc }}
                                        </div>
                                        <!-- 元信息行：类型 / 等级 / 怪物统计 -->
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                            <span
                                                class="rounded-xs px-1.5 py-0.5 text-[10px] leading-4 tracking-wide"
                                                :class="getDungeonType(dungeon.t).color + ' text-white'"
                                            >
                                                {{ getDungeonType(dungeon.t).label }}
                                            </span>
                                            <span class="font-mono tabular-nums">Lv.{{ dungeon.lv }}</span>
                                            <span>怪物 {{ (dungeon.m || []).length }} 种</span>
                                            <span v-if="(dungeon.sm || []).length">特殊 {{ (dungeon.sm || []).length }} 个</span>
                                            <span v-if="dungeon.r?.length" class="truncate"
                                                >奖励: {{ getDungeonRewardNames(dungeon) }}</span
                                            >
                                        </div>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        {{ $t('common.total_count') }} <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredDungeons.length }}</b> {{ $t('db-dungeon-list.dungeon_count') }}
                    </p>
                </div>
            </div>

                        </template>
            <template #detail>


            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedDungeon" class="min-h-0 min-w-0 flex-1">
                <DBDungeonDetailItem :key="selectedDungeonId" :dungeon="selectedDungeon" />
            </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
