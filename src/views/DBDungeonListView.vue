<script lang="ts" setup>
import { useLocalStorage } from "@vueuse/core"
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { LeveledChar } from "@/data"
import dungeonData from "@/data/d/dungeon.data"
import { getDungeonName, getDungeonRewardNames, getDungeonType } from "@/utils/dungeon-utils"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedDungeonId = useSearchParam<number>("id", 0)
const selectedType = useSearchParam<string>("tp", "")
const selectedLevel = useSearchParam<string>("lv", "")
const onlyNightHandbook = useLocalStorage("dungeon.showNightHandbook", false)
const showTypeFilter = useLocalStorage("dungeon.showTypeFilter", false)
const showLevelFilter = useLocalStorage("dungeon.showLevelFilter", false)

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

/**
 * 切换筛选项显示状态，关闭时清空对应筛选值。
 * @param filterName 筛选项名称
 * @param show 是否显示
 */
function toggleFilter(filterName: "type" | "level", show: boolean) {
    if (show) {
        return
    }

    if (filterName === "type") {
        selectedType.value = ""
        return
    }

    selectedLevel.value = ""
}

/**
 * 切换类型筛选行的显示状态，收起时清空对应筛选值。
 */
function toggleTypeFilterRow() {
    showTypeFilter.value = !showTypeFilter.value
    toggleFilter("type", showTypeFilter.value)
}

/**
 * 切换等级筛选行的显示状态，收起时清空对应筛选值。
 */
function toggleLevelFilterRow() {
    showLevelFilter.value = !showLevelFilter.value
    toggleFilter("level", showLevelFilter.value)
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbdu-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedDungeon }">
                <!-- 检索带：下划线搜索 + 计数 + 过滤器开关方章 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索副本ID/名称/描述/等级/奖励（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredDungeons.length }}
                        </span>
                    </div>

                    <!-- 过滤器开关方章 -->
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
                            夜航手册
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showTypeFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleTypeFilterRow()"
                        >
                            类型
                        </button>
                        <button
                            type="button"
                            class="inline-flex h-6 cursor-pointer items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                            :class="
                                showLevelFilter
                                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                                    : 'border-base-content/20 text-base-content/55 hover:border-primary/50 hover:text-primary'
                            "
                            @click="toggleLevelFilterRow()"
                        >
                            等级
                        </button>
                    </div>
                </div>

                <!-- 筛选条件 -->
                <div
                    v-show="showTypeFilter || showLevelFilter"
                    class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise"
                    style="animation-delay: 0.05s"
                >
                    <!-- 类型筛选 -->
                    <div v-show="showTypeFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40"> 类型 </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="type in allTypes.map(t => getDungeonType(t))"
                            :key="type.t"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs px-2 py-0.5 text-[11px] transition-all duration-200 active:scale-[0.97]"
                            :class="
                                selectedType === type.t
                                    ? type.color + ' font-semibold text-white'
                                    : 'border border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = type.t"
                        >
                            {{ type.label }}
                        </button>
                    </div>

                    <!-- 等级筛选 -->
                    <div v-show="showLevelFilter" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40"> 等级 </span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedLevel === ''
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedLevel = ''"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="level in allLevels"
                            :key="level"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedLevel === `${level}`
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedLevel = `${level}`"
                        >
                            Lv.{{ level }}
                        </button>
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
                            <p class="text-sm">未找到匹配的副本</p>
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
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredDungeons.length }}</b> 个副本
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedDungeon"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectDungeon(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedDungeon" class="min-w-0 flex-1">
                <DBDungeonDetailItem :key="selectedDungeonId" :dungeon="selectedDungeon" />
            </ScrollArea>
        </div>
    </div>
</template>
