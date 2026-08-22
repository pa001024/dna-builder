<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import {
    extractionTreasureBagData,
    extractionTreasureData,
    soloTreasureRarityData,
    treasureHuntRepeatDungeonData,
    treasureHuntStoryDungeonData,
} from "@/data/d/solotreasure.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"

type SoloTreasureType = "story" | "repeat" | "treasure" | "bag"
type SoloTreasureListItem =
    | { kind: "story"; id: number; title: string; desc: string; meta: string }
    | { kind: "repeat"; id: number; title: string; desc: string; meta: string }
    | { kind: "treasure"; id: number; title: string; desc: string; treasure: (typeof extractionTreasureData)[number] }
    | { kind: "bag"; id: number; title: string; desc: string; meta: string }

const searchKeyword = useSearchParam<string>("kw", "")
const selectedDungeonId = useSearchParam<number>("id", 0)
const selectedTreasureId = useSearchParam<number>("tid", 0)
const selectedBagId = useSearchParam<number>("bid", 0)
const selectedType = useSearchParam<SoloTreasureType>("tp", "story")

const typeTabs = [
    { key: "story" as const, label: "剧情副本" },
    { key: "repeat" as const, label: "常驻副本" },
    { key: "treasure" as const, label: "宝物" },
    { key: "bag" as const, label: "百宝囊" },
]

const filteredSoloTreasure = computed<SoloTreasureListItem[]>(() => {
    const keyword = searchKeyword.value.trim()
    const items = getListItems(selectedType.value)
    if (keyword === "") {
        return items
    }

    return items.filter(item => matchesKeyword([item.id, item.title, item.desc, "meta" in item ? item.meta : undefined], keyword))
})

const filteredTreasureItems = computed(() =>
    filteredSoloTreasure.value.filter((item): item is Extract<SoloTreasureListItem, { kind: "treasure" }> => item.kind === "treasure")
)

function getListItems(type: SoloTreasureType): SoloTreasureListItem[] {
    if (type === "story") {
        return treasureHuntStoryDungeonData.map(item => ({
            kind: "story",
            id: item.id,
            title: item.name,
            desc: item.desc,
            meta: `副本 ${item.did} · 解锁 ${item.unlockCondition}`,
        }))
    }

    if (type === "repeat") {
        return treasureHuntRepeatDungeonData.map(item => ({
            kind: "repeat",
            id: item.id,
            title: item.name,
            desc: item.desc,
            meta: `副本 ${item.hardDungeonId}/${item.easyDungeonId ?? "-"} · 解锁 ${item.unlockCondition}`,
        }))
    }

    if (type === "treasure") {
        return extractionTreasureData.map(item => ({
            kind: "treasure",
            id: item.id,
            title: item.name,
            desc: item.name,
            treasure: item,
        }))
    }

    return extractionTreasureBagData.map(item => ({
        kind: "bag",
        id: item.id,
        title: item.name,
        desc: item.name,
        meta: `类型 ${item.shapeType} · 价格 ${item.price} · 形状 ${item.shape.map(shape => shape.join("x")).join(" / ")}`,
    }))
}

function matchesKeyword(values: Array<string | number | undefined>, keyword: string): boolean {
    return values.some(value => {
        if (value === undefined) {
            return false
        }

        if (`${value}`.includes(keyword)) {
            return true
        }

        return typeof value === "string" && matchPinyin(value, keyword).match
    })
}

/**
 * 选择当前类型的副本。
 * @param id 副本 ID。
 */
function selectDungeon(id: number): void {
    selectedDungeonId.value = id
}

/**
 * 选择宝藏。
 * @param id 宝藏 ID。
 */
function selectTreasure(id: number): void {
    selectedTreasureId.value = id
}

/**
 * 选择背包。
 * @param id 背包 ID。
 */
function selectBag(id: number): void {
    selectedBagId.value = id
}

/**
 * 清空当前类型的选中项。
 */
function clearSelectedDetail(): void {
    if (selectedType.value === "story" || selectedType.value === "repeat") {
        selectedDungeonId.value = 0
        return
    }

    if (selectedType.value === "treasure") {
        selectedTreasureId.value = 0
        return
    }

    selectedBagId.value = 0
}

/**
 * 获取当前选中的剧情副本。
 */
const selectedStoryDungeon = computed(() => {
    if (selectedType.value !== "story") {
        return null
    }

    return treasureHuntStoryDungeonData.find(item => item.id === selectedDungeonId.value) || null
})

/**
 * 获取当前选中的常驻副本。
 */
const selectedRepeatDungeon = computed(() => {
    if (selectedType.value !== "repeat") {
        return null
    }

    return treasureHuntRepeatDungeonData.find(item => item.id === selectedDungeonId.value) || null
})

/**
 * 获取当前选中的宝藏。
 */
const selectedTreasure = computed(() => {
    if (selectedType.value !== "treasure") {
        return null
    }

    return extractionTreasureData.find(item => item.id === selectedTreasureId.value) || null
})

/**
 * 获取当前选中的背包。
 */
const selectedBag = computed(() => {
    if (selectedType.value !== "bag") {
        return null
    }

    return extractionTreasureBagData.find(item => item.id === selectedBagId.value) || null
})

/**
 * 获取当前选中的详情项。
 */
const selectedDetailKind = computed(() => {
    if (selectedStoryDungeon.value || selectedRepeatDungeon.value) {
        return "dungeon"
    }

    if (selectedTreasure.value) {
        return "treasure"
    }

    if (selectedBag.value) {
        return "bag"
    }

    return ""
})

/**
 * 判断条目是否处于选中状态。
 * @param item 条目。
 */
function isItemSelected(item: SoloTreasureListItem): boolean {
    if (item.kind === "story" || item.kind === "repeat") {
        return selectedType.value === item.kind && selectedDungeonId.value === item.id
    }

    if (item.kind === "treasure") {
        return selectedType.value === item.kind && selectedTreasureId.value === item.id
    }

    return selectedType.value === item.kind && selectedBagId.value === item.id
}

// 首次渲染时滚动到当前选中条目（使用显式选择器定位选中态卡片）
useInitialScrollToSelectedItem({ selectedSelector: ".dbst-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedDetailKind }"
            >
                <!-- 检索带：下划线搜索 + 计数 + 类型方章 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索ID/名称/描述..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredSoloTreasure.length }}
                        </span>
                    </div>

                    <!-- 类型筛选方章 -->
                    <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">TYPE</span>
                        <button
                            v-for="tab in typeTabs"
                            :key="tab.key"
                            type="button"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === tab.key
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = tab.key"
                        >
                            {{ tab.label }}
                        </button>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <!-- 宝物网格列表 -->
                    <template v-if="selectedType === 'treasure'">
                        <div class="p-3 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                            <article
                                v-for="(item, index) in filteredTreasureItems"
                                :key="`${item.kind}-${item.id}`"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    isItemSelected(item)
                                        ? 'dbst-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectTreasure(item.id)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="isItemSelected(item) ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex flex-col items-center gap-2 p-3 text-center">
                                    <ImageFallback
                                        v-if="item.kind === 'treasure'"
                                        :src="`/imgs/res/${item.treasure.icon}.webp`"
                                        :alt="item.title"
                                        class="w-14 h-14 rounded-xs shrink-0 bg-linear-15"
                                        :class="getRarityGradientClass(soloTreasureRarityData[item.treasure.rarity].show)"
                                    >
                                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="item.title" class="w-14 h-14 rounded-xs shrink-0" />
                                    </ImageFallback>
                                    <div class="w-full min-w-0">
                                        <div
                                            class="truncate text-sm font-medium transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': isItemSelected(item) }"
                                        >
                                            {{ item.title }}
                                        </div>
                                        <CopyID :id="item.id" />
                                    </div>
                                </div>
                            </article>
                        </div>
                    </template>
                    <!-- 副本 / 百宝囊列表 -->
                    <template v-else>
                        <div class="space-y-2 p-3">
                            <div
                                v-for="(item, index) in filteredSoloTreasure"
                                :key="`${item.kind}-${item.id}`"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    isItemSelected(item)
                                        ? 'dbst-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="item.kind === 'story' || item.kind === 'repeat' ? selectDungeon(item.id) : selectBag(item.id)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="isItemSelected(item) ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-center gap-3 p-3">
                                    <div class="min-w-0 flex-1">
                                        <div
                                            class="truncate text-sm font-medium transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': isItemSelected(item) }"
                                        >
                                            {{ item.title }}
                                        </div>
                                        <div
                                            v-if="'meta' in item"
                                            class="mt-0.5 truncate text-[10px] tracking-wide text-base-content/40"
                                        >
                                            {{ item.meta }}
                                        </div>
                                    </div>
                                    <div class="shrink-0 text-[11px] text-base-content/45">
                                        <CopyID :id="item.id" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredSoloTreasure.length }}</b> 个条目
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedDetailKind"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center overflow-hidden border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="clearSelectedDetail"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <ScrollArea v-if="selectedDetailKind" class="min-w-0 flex-1">
                <div class="space-y-3 p-3 sm:p-4">
                    <DBSoloTreasureDungeonItem v-if="selectedStoryDungeon" :dungeon="selectedStoryDungeon" />
                    <DBSoloTreasureDungeonItem v-else-if="selectedRepeatDungeon" :dungeon="selectedRepeatDungeon" />
                    <DBSoloTreasureEntryItem v-else-if="selectedTreasure" :treasure="selectedTreasure" />
                    <DBSoloTreasureBagItem v-else-if="selectedBag" :bag="selectedBag" />
                </div>
            </ScrollArea>
        </div>
    </div>
</template>
