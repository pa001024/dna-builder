<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import {
    type RougeLikeBlessing,
    type RougeLikeContract,
    type RougeLikeRoom,
    type RougeLikeStoryEvent,
    type RougeLikeTalent,
    type RougeLikeTreasure,
    type RougeLikeTreasureGroup,
    type RougeProClass,
    type RougeProContract,
    type RougeProDifficulty,
    type RougeProEvent,
    type RougeProRoom,
    type RougeProSeason,
    type RougeProTalent,
    type RougeProTreasure,
    type RougeProTreasureGroup,
    rougeLikeBlessingGroups,
    rougeLikeBlessings,
    rougeLikeContracts,
    rougeLikeRooms,
    rougeLikeStoryEvents,
    rougeLikeTalentBranches,
    rougeLikeTalents,
    rougeLikeTreasureGroups,
    rougeLikeTreasures,
    rougeProClasses,
    rougeProContracts,
    rougeProDifficulties,
    rougeProEvents,
    rougeProRooms,
    rougeProSeasons,
    rougeProTalents,
    rougeProTreasureGroups,
    rougeProTreasures,
} from "@/data/d/rouge.data"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass, getRarityName } from "@/utils/rarity-utils"
import { getRougeRoomTypeInfo } from "@/utils/rouge-room-type"
import { stripStoryTextTags } from "@/utils/story-text"

type RougeMode = "like" | "pro"
type RougeLikeKind = "blessing" | "talent" | "treasure" | "treasureGroup" | "contract" | "room" | "story"
type RougeProKind = "treasure" | "talent" | "contract" | "class" | "treasureGroup" | "room" | "event" | "season" | "difficulty"

const mode = useSearchParam<RougeMode>("mode", "like")
const kind = useSearchParam<string>("kind", "blessing")
const searchKeyword = useSearchParam<string>("kw", "")
const selectedId = useSearchParam<number>("id", 0)
const filterGroup = useSearchParam<number>("grp", 0)
const filterBranch = useSearchParam<number>("br", 0)
const filterRarity = useSearchParam<number>("rar", 0)
const filterUpgradable = useSearchParam<number>("up", 0)
const filterRoomType = useSearchParam<string>("rt", "")

const modeTabs: { key: RougeMode; label: string }[] = [
    { key: "like", label: "其一" },
    { key: "pro", label: "合作" },
]

const likeTabs: { key: RougeLikeKind; label: string }[] = [
    { key: "blessing", label: "烛芯" },
    { key: "talent", label: "提灯" },
    { key: "treasure", label: "遗物" },
    { key: "treasureGroup", label: "遗物套装" },
    { key: "contract", label: "深潜" },
    { key: "room", label: "房间" },
    { key: "story", label: "故事事件" },
]

const proTabs: { key: RougeProKind; label: string }[] = [
    { key: "treasure", label: "遗物" },
    { key: "treasureGroup", label: "遗物套装" },
    { key: "talent", label: "提灯" },
    { key: "contract", label: "深潜" },
    { key: "class", label: "职业" },
    { key: "room", label: "房间" },
    { key: "event", label: "事件" },
    { key: "season", label: "赛季" },
    { key: "difficulty", label: "难度" },
]

const activeTabs = computed(() => (mode.value === "like" ? likeTabs : proTabs))

/**
 * 切换模式时重置到第一个子分类。
 * @param nextMode 目标模式
 */
function switchMode(nextMode: RougeMode): void {
    mode.value = nextMode
    kind.value = nextMode === "like" ? likeTabs[0].key : proTabs[0].key
    selectedId.value = 0
    searchKeyword.value = ""
    filterRoomType.value = ""
}

/**
 * 切换子分类。
 * @param key 子分类
 */
function switchKind(key: string): void {
    kind.value = key
    selectedId.value = 0
    resetFilters()
}

type ListItem =
    | ({ kind: RougeLikeKind } & RougeLikeBlessing)
    | ({ kind: RougeLikeKind } & RougeLikeTalent)
    | ({ kind: RougeLikeKind } & RougeLikeTreasure)
    | ({ kind: RougeLikeKind } & RougeLikeTreasureGroup)
    | ({ kind: RougeLikeKind } & RougeLikeContract)
    | ({ kind: RougeLikeKind } & RougeLikeRoom)
    | ({ kind: RougeLikeKind } & RougeLikeStoryEvent)
    | ({ kind: RougeProKind } & RougeProTreasure)
    | ({ kind: RougeProKind } & RougeProTalent)
    | ({ kind: RougeProKind } & RougeProContract)
    | ({ kind: RougeProKind } & RougeProClass)
    | ({ kind: RougeProKind } & RougeProTreasureGroup)
    | ({ kind: RougeProKind } & RougeProRoom)
    | ({ kind: RougeProKind } & RougeProEvent)
    | ({ kind: RougeProKind } & RougeProSeason)
    | ({ kind: RougeProKind } & RougeProDifficulty)

type LikeItemEntity =
    | RougeLikeBlessing
    | RougeLikeTalent
    | RougeLikeTreasure
    | RougeLikeTreasureGroup
    | RougeLikeContract
    | RougeLikeRoom
    | RougeLikeStoryEvent

type ProItemEntity =
    | RougeProTreasure
    | RougeProTalent
    | RougeProContract
    | RougeProClass
    | RougeProTreasureGroup
    | RougeProRoom
    | RougeProEvent
    | RougeProSeason
    | RougeProDifficulty

/**
 * 提取列表项标题。
 */
function getItemTitle(item: ListItem): string {
    if (item.kind === "story" && "storyEventName" in item && item.name) {
        return item.name
    }
    return "name" in item && item.name ? item.name : `ID ${item.id}`
}

/**
 * 提取列表项描述。
 */
function getItemDesc(item: ListItem): string {
    if ("simpleDesc" in item && item.simpleDesc) {
        return stripStoryTextTags(item.simpleDesc)
    }
    if ("desc" in item && item.desc) {
        return stripStoryTextTags(item.desc)
    }
    return ""
}

/**
 * 提取列表项图标资源名。
 */
function getItemIcon(item: ListItem): string {
    let raw = ""
    if ("icon" in item && item.icon) {
        raw = item.icon
    } else if ("bigIcon" in item && item.bigIcon) {
        raw = item.bigIcon
    }
    if (!raw && "roomType" in item) {
        const roomTypeInfo = getRougeRoomTypeInfo(item.roomType)
        raw = roomTypeInfo?.icon ?? ""
    }
    return raw
}

function getItemRarity(item: ListItem): number {
    if ("rarity" in item) {
        return item.rarity
    }
    return 0
}

/**
 * 解析列表项所属的烛芯分类/遗物套装/遗物组名称。
 * @param item 列表项
 * @returns 组名称，无法解析时返回空字符串
 */
function getItemGroupName(item: ListItem): string {
    if ("blessingGroup" in item) {
        return rougeLikeBlessingGroups.find(group => group.id === item.blessingGroup)?.name ?? ""
    }
    if ("treasureGroup" in item && mode.value === "like") {
        return rougeLikeTreasureGroups.find(group => group.id === item.treasureGroup)?.name ?? ""
    }
    if ("treasureGroup" in item && mode.value === "pro") {
        return rougeProTreasureGroups.find(group => group.id === item.treasureGroup)?.name ?? ""
    }
    return ""
}

/**
 * 解析提灯所属分支名称。
 * @param item 列表项
 * @returns 分支名称，无法解析时返回空字符串
 */
function getItemBranchName(item: ListItem): string {
    if (!("branch" in item)) {
        return ""
    }
    return rougeLikeTalentBranches.find(branch => branch.id === item.branch)?.name ?? ""
}

/**
 * 提取列表项元信息（分类/组名/稀有度等）。
 */
function getItemMeta(item: ListItem): string {
    const groupName = getItemGroupName(item)
    if (groupName) {
        return groupName
    }
    if (item.kind === "story" && "cutOffEvent" in item) {
        return item.type
    }
    if ("heatValue" in item) {
        return `深浅深度 ${item.heatValue}`
    }
    if ("roomType" in item) {
        const roomTypeInfo = getRougeRoomTypeInfo(item.roomType)
        return roomTypeInfo ? roomTypeInfo.name : `房间类型 ${item.roomType}`
    }
    const branchName = getItemBranchName(item)
    if (branchName) {
        return branchName
    }
    return ""
}

/**
 * 获取当前子分类对应的列表数据。
 */
function getListItems(): ListItem[] {
    if (mode.value === "like") {
        switch (kind.value) {
            case "blessing":
                return rougeLikeBlessings.map(item => ({ kind: "blessing", ...item }))
            case "talent":
                return rougeLikeTalents.map(item => ({ kind: "talent", ...item }))
            case "treasure":
                return rougeLikeTreasures.map(item => ({ kind: "treasure", ...item }))
            case "treasureGroup":
                return rougeLikeTreasureGroups.map(item => ({ kind: "treasureGroup", ...item }))
            case "contract":
                return rougeLikeContracts.map(item => ({ kind: "contract", ...item }))
            case "room":
                return rougeLikeRooms.map(item => ({ kind: "room", ...item }))
            case "story":
                return rougeLikeStoryEvents.map(item => ({ kind: "story", ...item }))
        }
    }

    switch (kind.value) {
        case "treasure":
            return rougeProTreasures.map(item => ({ kind: "treasure", ...item }))
        case "talent":
            return rougeProTalents.map(item => ({ kind: "talent", ...item }))
        case "contract":
            return rougeProContracts.map(item => ({ kind: "contract", ...item }))
        case "class":
            return rougeProClasses.map(item => ({ kind: "class", ...item }))
        case "treasureGroup":
            return rougeProTreasureGroups.map(item => ({ kind: "treasureGroup", ...item }))
        case "room":
            return rougeProRooms.map(item => ({ kind: "room", ...item }))
        case "event":
            return rougeProEvents.map(item => ({ kind: "event", ...item }))
        case "season":
            return rougeProSeasons.map(item => ({ kind: "season", ...item }))
        case "difficulty":
            return rougeProDifficulties.map(item => ({ kind: "difficulty", ...item }))
    }

    return []
}

const allItems = computed<ListItem[]>(() => getListItems())

/**
 * 应用关键词与分类筛选。
 */
const filteredItems = computed<ListItem[]>(() => {
    const keyword = searchKeyword.value.trim()

    return allItems.value.filter(item => {
        // 关键词筛选
        if (keyword) {
            const title = getItemTitle(item)
            const desc = getItemDesc(item)
            const matched =
                `${item.id}`.includes(keyword) ||
                title.includes(keyword) ||
                desc.includes(keyword) ||
                matchPinyin(title, keyword).match ||
                matchPinyin(desc, keyword).match
            if (!matched) {
                return false
            }
        }

        // 组/套装筛选（烛芯组、遗物套装、遗物组）
        if (filterGroup.value) {
            const groupMatch =
                ("blessingGroup" in item && item.blessingGroup === filterGroup.value) ||
                ("treasureGroup" in item && item.treasureGroup === filterGroup.value)
            if (!groupMatch) {
                return false
            }
        }

        // 分支筛选（提灯）
        if (filterBranch.value) {
            if (!("branch" in item) || item.branch !== filterBranch.value) {
                return false
            }
        }

        // 稀有度筛选
        if (filterRarity.value) {
            const rarity = getItemRarity(item)
            if (rarity !== filterRarity.value) {
                return false
            }
        }

        // 深潜可升级筛选
        if (filterUpgradable.value) {
            if (!("maxLevel" in item) || (item.maxLevel as number) <= 1) {
                return false
            }
        }

        // 房间类型筛选按展示名称匹配，合并同一语义下的多个房间类型 ID。
        if (filterRoomType.value) {
            if (!("roomType" in item)) {
                return false
            }
            const roomTypeName = getRougeRoomTypeInfo(item.roomType)?.name ?? `房间类型 ${item.roomType}`
            if (roomTypeName !== filterRoomType.value) {
                return false
            }
        }

        return true
    })
})

/**
 * 当前分类可选的组/套装筛选项。
 */
const groupFilterOptions = computed<Array<{ id: number; name: string }>>(() => {
    if (mode.value === "like") {
        if (kind.value === "blessing") {
            return rougeLikeBlessingGroups.map(group => ({ id: group.id, name: group.name }))
        }
        if (kind.value === "treasure") {
            return rougeLikeTreasureGroups.map(group => ({ id: group.id, name: group.name }))
        }
        return []
    }
    if (mode.value === "pro" && kind.value === "treasure") {
        return rougeProTreasureGroups.map(group => ({ id: group.id, name: group.name }))
    }
    return []
})

/**
 * 当前分类可选的分支筛选项（提灯）。
 */
const branchFilterOptions = computed(() => {
    if (mode.value === "like" && kind.value === "talent") {
        return rougeLikeTalentBranches
    }
    if (mode.value === "pro" && kind.value === "talent") {
        return rougeLikeTalentBranches
    }
    return []
})

/**
 * 当前分类可选的房间类型筛选项。
 */
const roomTypeFilterOptions = computed<Array<{ name: string }>>(() => {
    if (mode.value !== "like" || kind.value !== "room") {
        return []
    }

    return Array.from(new Set(rougeLikeRooms.map(room => getRougeRoomTypeInfo(room.roomType)?.name ?? `房间类型 ${room.roomType}`))).map(
        name => ({ name })
    )
})

/**
 * 当前分类是否支持稀有度筛选。
 */
const showRarityFilter = computed(() => {
    return (
        (kind.value === "blessing" && mode.value === "like") ||
        (kind.value === "treasure" && (mode.value === "like" || mode.value === "pro"))
    )
})

/**
 * 当前分类是否支持深潜可升级筛选。
 */
const showUpgradableFilter = computed(() => {
    return kind.value === "contract"
})

/**
 * 重置所有分类筛选。
 */
function resetFilters(): void {
    filterGroup.value = 0
    filterBranch.value = 0
    filterRarity.value = 0
    filterUpgradable.value = 0
    filterRoomType.value = ""
}

const selectedItem = computed<ListItem | null>(() => {
    if (!selectedId.value) {
        return null
    }
    return allItems.value.find(item => item.id === selectedId.value) || null
})

const selectedLikeItem = computed<LikeItemEntity | null>(() => {
    if (mode.value !== "like" || !selectedId.value) {
        return null
    }
    const found = allItems.value.find(item => item.id === selectedId.value)
    return found ? (found as LikeItemEntity) : null
})
const selectedProItem = computed<ProItemEntity | null>(() => {
    if (mode.value !== "pro" || !selectedId.value) {
        return null
    }
    const found = allItems.value.find(item => item.id === selectedId.value)
    return found ? (found as ProItemEntity) : null
})

/**
 * 选择列表项。
 * @param item 列表项
 */
function selectItem(item: ListItem): void {
    selectedId.value = item.id
}

/**
 * 关闭详情面板。
 */
function closeSelected(): void {
    selectedId.value = 0
}

useInitialScrollToSelectedItem()
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedItem }">
                <div class="p-3 border-b border-base-200 space-y-2">
                    <div class="flex gap-2">
                        <button
                            v-for="tab in modeTabs"
                            :key="tab.key"
                            type="button"
                            class="flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200"
                            :class="
                                mode === tab.key ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="switchMode(tab.key)"
                        >
                            {{ $t(tab.label) }}
                        </button>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="tab in activeTabs"
                            :key="tab.key"
                            type="button"
                            class="px-3 py-1 text-xs rounded-full whitespace-nowrap transition-all duration-200"
                            :class="kind === tab.key ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="switchKind(tab.key)"
                        >
                            {{ $t(tab.label) }}
                        </button>
                    </div>
                    <div
                        v-if="
                            groupFilterOptions.length ||
                            branchFilterOptions.length ||
                            roomTypeFilterOptions.length ||
                            showRarityFilter ||
                            showUpgradableFilter
                        "
                        class="space-y-1.5"
                    >
                        <div v-if="groupFilterOptions.length" class="flex flex-wrap gap-1">
                            <button
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="filterGroup === 0 ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'"
                                @click="filterGroup = 0"
                            >
                                全部
                            </button>
                            <button
                                v-for="option in groupFilterOptions"
                                :key="option.id"
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="
                                    filterGroup === option.id ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'
                                "
                                @click="filterGroup = option.id"
                            >
                                {{ $t(option.name) }}
                            </button>
                        </div>
                        <div v-if="branchFilterOptions.length" class="flex flex-wrap gap-1">
                            <button
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="filterBranch === 0 ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'"
                                @click="filterBranch = 0"
                            >
                                全部
                            </button>
                            <button
                                v-for="branch in branchFilterOptions"
                                :key="branch.id"
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="
                                    filterBranch === branch.id ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'
                                "
                                @click="filterBranch = branch.id"
                            >
                                {{ $t(branch.name) }}
                            </button>
                        </div>
                        <div v-if="roomTypeFilterOptions.length" class="flex flex-wrap gap-1">
                            <button
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="filterRoomType === '' ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'"
                                @click="filterRoomType = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="option in roomTypeFilterOptions"
                                :key="option.name"
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="
                                    filterRoomType === option.name
                                        ? 'bg-primary text-white'
                                        : 'bg-base-100 text-base-content hover:bg-base-300'
                                "
                                @click="filterRoomType = option.name"
                            >
                                {{ $t(option.name) }}
                            </button>
                        </div>
                        <div v-if="showRarityFilter" class="flex flex-wrap gap-1">
                            <button
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="filterRarity === 0 ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'"
                                @click="filterRarity = 0"
                            >
                                全部
                            </button>
                            <button
                                v-for="rarity in [1, 2, 3]"
                                :key="rarity"
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="
                                    filterRarity === rarity ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'
                                "
                                @click="filterRarity = rarity"
                            >
                                {{ getRarityName(rarity + 2) }}
                            </button>
                        </div>
                        <div v-if="showUpgradableFilter" class="flex flex-wrap gap-1">
                            <button
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="
                                    filterUpgradable === 0 ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'
                                "
                                @click="filterUpgradable = 0"
                            >
                                全部
                            </button>
                            <button
                                type="button"
                                class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                                :class="
                                    filterUpgradable === 1 ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'
                                "
                                @click="filterUpgradable = 1"
                            >
                                可升级
                            </button>
                        </div>
                    </div>
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索 ID/名称/描述..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all duration-200"
                    />
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 grid gap-2">
                        <div
                            v-for="item in filteredItems"
                            :key="`${mode}-${item.kind}-${item.id}`"
                            class="flex items-start gap-2 p-2.5 rounded cursor-pointer transition-colors duration-200 bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedId === item.id }"
                            @click="selectItem(item)"
                        >
                            <div
                                v-if="getItemIcon(item)"
                                class="h-11 min-w-11 w-fit shrink-0 overflow-hidden rounded bg-linear-15"
                                :class="[getItemRarity(item) ? getRarityGradientClass(getItemRarity(item) + 2) : '']"
                            >
                                <ImageFallback
                                    :src="`/imgs/webp/${getItemIcon(item)}.webp`"
                                    :alt="getItemTitle(item)"
                                    class="h-11 w-auto object-contain"
                                >
                                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="getItemTitle(item)" class="h-11 w-auto object-contain" />
                                </ImageFallback>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-2">
                                    <div class="font-medium truncate">{{ getItemTitle(item) }}</div>
                                    <span v-if="getItemMeta(item)" class="shrink-0 text-xs opacity-70">{{ getItemMeta(item) }}</span>
                                    <div class="flex-1"></div>
                                    <CopyID :id="item.id" />
                                </div>
                                <div v-if="getItemDesc(item)" class="mt-1 line-clamp-2 text-xs opacity-70">
                                    {{ getItemDesc(item) }}
                                </div>
                            </div>
                        </div>
                        <div v-if="!filteredItems.length" class="p-6 text-center text-sm text-base-content/50">无匹配条目</div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredItems.length }} 个条目
                </div>
            </div>

            <div
                v-if="selectedItem"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="closeSelected"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <ScrollArea v-if="selectedItem" class="flex-1">
                <DBRougeLikeDetailItem v-if="selectedLikeItem" :item="selectedLikeItem" :kind="kind" class="flex-1" />
                <DBRougeProDetailItem v-else-if="selectedProItem" :item="selectedProItem" :kind="kind" class="flex-1" />
            </ScrollArea>
        </div>
    </div>
</template>
