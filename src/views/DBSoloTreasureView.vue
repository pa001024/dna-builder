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

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedDetailKind }">
                <div class="p-3 border-b border-base-200 space-y-2">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索ID/名称/描述..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                    />
                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="tab in typeTabs"
                            :key="tab.key"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all duration-200"
                            :class="selectedType === tab.key ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedType = tab.key"
                        >
                            {{ tab.label }}
                        </button>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <template v-if="selectedType === 'treasure'">
                        <div class="p-2 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                            <div
                                v-for="item in filteredTreasureItems"
                                :key="`${item.kind}-${item.id}`"
                                class="p-3 rounded cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300"
                                :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': isItemSelected(item) }"
                                @click="selectTreasure(item.id)"
                            >
                                <div class="flex flex-col items-center gap-2 text-center">
                                    <ImageFallback
                                        v-if="item.kind === 'treasure'"
                                        :src="`/imgs/res/${item.treasure.icon}.webp`"
                                        :alt="item.title"
                                        class="w-14 h-14 rounded shrink-0 bg-linear-15"
                                        :class="getRarityGradientClass(soloTreasureRarityData[item.treasure.rarity].show)"
                                    >
                                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="item.title" class="w-14 h-14 rounded shrink-0" />
                                    </ImageFallback>
                                    <div class="w-full">
                                        <div class="font-medium truncate">{{ item.title }}</div>
                                        <CopyID :id="item.id" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                    <template v-else>
                        <div class="p-2 grid gap-2">
                            <div
                                v-for="item in filteredSoloTreasure"
                                :key="`${item.kind}-${item.id}`"
                                class="p-3 rounded cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300"
                                :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': isItemSelected(item) }"
                                @click="item.kind === 'story' || item.kind === 'repeat' ? selectDungeon(item.id) : selectBag(item.id)"
                            >
                                <div class="flex flex-col gap-2">
                                    <div class="w-full">
                                        <div class="font-medium truncate">{{ item.title }}</div>
                                        <div class="text-xs opacity-70 mt-1">
                                            <CopyID :id="item.id" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredSoloTreasure.length }} 个条目
                </div>
            </div>

            <div
                v-if="selectedDetailKind"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="clearSelectedDetail"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedDetailKind" class="flex-1">
                <div class="p-4 space-y-4">
                    <DBSoloTreasureDungeonItem v-if="selectedStoryDungeon" :dungeon="selectedStoryDungeon" />
                    <DBSoloTreasureDungeonItem v-else-if="selectedRepeatDungeon" :dungeon="selectedRepeatDungeon" />
                    <DBSoloTreasureEntryItem v-else-if="selectedTreasure" :treasure="selectedTreasure" />
                    <DBSoloTreasureBagItem v-else-if="selectedBag" :bag="selectedBag" />
                </div>
            </ScrollArea>
        </div>
    </div>
</template>
