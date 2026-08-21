<script lang="ts" setup>
import { computed, ref } from "vue"
import { conditionsMap } from "@/data/d/condition.data"
import {
    type RougeLikeBlessing,
    type RougeLikeContract,
    type RougeLikeRoom,
    type RougeLikeStoryEvent,
    type RougeLikeTalent,
    type RougeLikeTreasure,
    type RougeLikeTreasureGroup,
    type RougeStoryNode,
    rougeLikeBlessingGroups,
    rougeLikeTalentBranches,
    rougeLikeTreasureGroups,
} from "@/data/d/rouge.data"
import { getRarityBadgeClass, getRarityName } from "@/utils/rarity-utils"
import { getRougeRoomTypeInfo } from "@/utils/rouge-room-type"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments, type StoryTextSegment } from "@/utils/story-text"

type RougeLikeItem =
    | RougeLikeBlessing
    | RougeLikeTalent
    | RougeLikeTreasure
    | RougeLikeTreasureGroup
    | RougeLikeContract
    | RougeLikeRoom
    | RougeLikeStoryEvent

const props = defineProps<{
    item: RougeLikeItem
    kind: string
}>()

const item = computed(() => props.item)

/**
 * 深潜等级选择器状态。
 */
const contractLevel = ref(1)

/**
 * 提取图标资源名（兼容短名与完整 Unreal 路径）。
 * @param icon 原始图标字段
 * @returns 资源名
 */
function shortenIcon(icon: string): string {
    const cleaned = icon
        .trim()
        .replace(/^Texture2D'/, "")
        .replace(/'$/, "")
        .replaceAll("\\", "/")
    const name = cleaned.split("/").pop() ?? ""
    return name.split(".")[0].trim()
}

const iconUrl = computed(() => {
    let raw = ""
    if ("icon" in item.value && item.value.icon) {
        raw = item.value.icon
    } else if ("icon" in item.value && item.value.icon) {
        raw = item.value.icon
    }
    if (!raw && "roomType" in item.value) {
        raw = getRougeRoomTypeInfo(item.value.roomType)?.icon ?? ""
    }
    const name = shortenIcon(raw)
    return name ? `/imgs/webp/${name}.webp` : "/imgs/webp/T_Head_Empty.webp"
})

const displayName = computed(() => {
    if ("storyEventName" in item.value && item.value.name) {
        return item.value.name
    }
    if ("name" in item.value && item.value.name) {
        return item.value.name
    }
    return `ID ${item.value.id}`
})

const desc = computed(() => ("desc" in item.value ? item.value.desc : undefined))

const simpleDesc = computed(() => ("simpleDesc" in item.value ? item.value.simpleDesc : undefined))

/**
 * 解析富文本描述（<Highlight>...</> 等标签）。
 * @param text 原始文本
 * @returns 文本片段
 */
function parseRichText(text?: string): StoryTextSegment[] {
    return parseStoryTextSegments(text || "", DEFAULT_STORY_TEXT_CONFIG)
}

const talentTypeNames: Record<number, string> = {
    1: "攻击",
    2: "防御",
    3: "通用",
}

/**
 * 解析其一条目所属烛芯分类名称。
 */
const groupName = computed(() => {
    const id = "blessingGroup" in item.value ? item.value.blessingGroup : undefined
    return id !== undefined ? (rougeLikeBlessingGroups.find(group => group.id === id)?.name ?? "") : ""
})

/**
 * 解析遗物所属套装名称。
 */
const treasureGroupName = computed(() => {
    if (!("treasureGroup" in item.value)) {
        return ""
    }
    const groupId = (item.value as RougeLikeTreasure).treasureGroup
    return rougeLikeTreasureGroups.find(group => group.id === groupId)?.name ?? ""
})

/**
 * 遗物套装数据（含套装效果）。
 */
const treasureGroup = computed(() => {
    if (!("treasureGroup" in item.value)) {
        return undefined
    }
    const groupId = (item.value as RougeLikeTreasure).treasureGroup
    return rougeLikeTreasureGroups.find(group => group.id === groupId)
})

/**
 * 提灯所属分支信息。
 */
const talentBranch = computed(() => {
    if (!("branch" in item.value)) {
        return undefined
    }
    return rougeLikeTalentBranches.find(branch => branch.id === (item.value as RougeLikeTalent).branch)
})

/**
 * 当前深潜契约显示等级（1 起）。
 */
const currentContractLevel = computed(() => {
    if (!("maxLevel" in item.value) || !("descLevels" in item.value)) {
        return 1
    }
    return Math.min(Math.max(1, contractLevel.value), item.value.maxLevel || 1)
})

/**
 * 深潜契约当前等级对应的描述文本。
 */
const contractDescAtLevel = computed(() => {
    if (!("descLevels" in item.value) || !("desc" in item.value)) {
        return desc.value
    }
    const levels = item.value.descLevels as string[]
    if (!levels.length) {
        return desc.value
    }
    const levelIndex = currentContractLevel.value - 1
    const value = levels[Math.min(levelIndex, levels.length - 1)]
    if (!desc.value || !value) {
        return desc.value
    }
    return desc.value.replace(/<Highlight>.*?<\/>/, `<Highlight>${value}</>`)
})

/**
 * 是否展示深潜等级选择器（仅可升级契约）。
 */
const showContractLevelSelector = computed(() => {
    return "descLevels" in item.value && (item.value as RougeLikeContract).descLevels.length > 1
})

/**
 * 当前条目的房间条件（展开为完整条件表）。
 */
const roomConditions = computed(() => {
    if (!("roomCondition" in item.value)) {
        return []
    }
    const ids = item.value.roomCondition as number[]
    return ids.map(id => conditionsMap[id]).filter(Boolean)
})
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-3">
            <div class="h-14 min-w-14 w-fit shrink-0 overflow-hidden rounded bg-base-200">
                <ImageFallback :src="iconUrl" :alt="displayName" class="h-14 w-auto object-contain">
                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="displayName" class="h-14 w-auto object-contain" />
                </ImageFallback>
            </div>
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                    <SRouterLink :to="`/db/rouge/like/${kind}/${item.id}`" class="text-lg font-bold link link-primary line-clamp-1">
                        {{ displayName }}
                    </SRouterLink>
                    <CopyID :id="item.id" />
                </div>
                <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-base-content/70">
                    <span v-if="'rarity' in item" class="rounded px-1.5 py-0.5" :class="getRarityBadgeClass(item.rarity + 2)">
                        {{ getRarityName(item.rarity + 2) }}
                    </span>
                    <span v-if="groupName" class="rounded px-1.5 py-0.5 bg-base-300/70">{{ $t(groupName) }}</span>
                    <span v-if="treasureGroupName" class="rounded px-1.5 py-0.5 bg-base-300/70">{{ $t(treasureGroupName) }}</span>
                    <span v-if="talentBranch" class="rounded px-1.5 py-0.5 bg-base-300/70">{{ $t(talentBranch.name) }}</span>
                    <span v-if="'type' in item && typeof item.type === 'number'">{{
                        $t(talentTypeNames[item.type] || `类型 ${item.type}`)
                    }}</span>
                    <span v-if="'roomType' in item">{{ getRougeRoomTypeInfo(item.roomType)?.name || `房间类型 ${item.roomType}` }}</span>
                    <span v-if="'heatValue' in item">{{ $t("深潜深度") }} {{ item.heatValue }}</span>
                    <span v-if="'moment' in item">{{ item.type }}</span>
                </div>
            </div>
        </div>

        <div v-if="showContractLevelSelector" class="flex items-center gap-3 rounded-md bg-base-200 p-3">
            <span class="text-xs text-base-content/70 shrink-0">等级</span>
            <div class="flex flex-wrap gap-1.5">
                <button
                    v-for="level in (item as RougeLikeContract).maxLevel"
                    :key="level"
                    type="button"
                    class="px-2 py-0.5 text-xs rounded-full transition-all duration-200"
                    :class="currentContractLevel === level ? 'bg-primary text-white' : 'bg-base-100 text-base-content hover:bg-base-300'"
                    @click="contractLevel = level"
                >
                    {{ level }}
                </button>
            </div>
        </div>

        <div v-if="contractDescAtLevel" class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">描述</div>
            <div class="text-sm leading-6 whitespace-pre-wrap break-all">
                <template v-for="(segment, index) in parseRichText(contractDescAtLevel)" :key="`desc-${index}-${segment.tone}`">
                    <span
                        :class="{
                            'text-primary font-semibold': segment.tone === 'highlight',
                            'text-error font-semibold': segment.tone === 'warning',
                            'text-base-content font-semibold': segment.tone === 'title',
                        }"
                    >
                        {{ segment.text }}
                    </span>
                </template>
            </div>
        </div>

        <div v-if="simpleDesc && simpleDesc !== desc" class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">简述</div>
            <div class="text-sm leading-6 whitespace-pre-wrap break-all">
                <template v-for="(segment, index) in parseRichText(simpleDesc)" :key="`simple-${index}-${segment.tone}`">
                    <span
                        :class="{
                            'text-primary font-semibold': segment.tone === 'highlight',
                            'text-error font-semibold': segment.tone === 'warning',
                            'text-base-content font-semibold': segment.tone === 'title',
                        }"
                    >
                        {{ segment.text }}
                    </span>
                </template>
            </div>
        </div>

        <div v-if="'ipDesc' in item && item.ipDesc" class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">背景</div>
            <div class="text-sm leading-6 whitespace-pre-wrap break-all">{{ item.ipDesc }}</div>
        </div>

        <div v-if="'groupEffectDesc' in item && item.groupEffectDesc" class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">套装效果</div>
            <div class="text-sm leading-6 whitespace-pre-wrap break-all">
                <template v-for="(segment, index) in parseRichText(item.groupEffectDesc)" :key="`group-${index}-${segment.tone}`">
                    <span
                        :class="{
                            'text-primary font-semibold': segment.tone === 'highlight',
                            'text-error font-semibold': segment.tone === 'warning',
                            'text-base-content font-semibold': segment.tone === 'title',
                        }"
                    >
                        {{ segment.text }}
                    </span>
                </template>
            </div>
        </div>

        <div v-if="'activateNeed' in item && item.activateNeed.length" class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">激活需求</div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DBRougeTreasureItem v-for="treasureId in item.activateNeed" :key="treasureId" :id="treasureId" />
            </div>
        </div>

        <div
            v-if="treasureGroup && (treasureGroup.groupEffectDesc || treasureGroup.activateNeed?.length)"
            class="rounded-md bg-base-200 p-3"
        >
            <div class="text-xs text-base-content/70 mb-2">套装：{{ $t(treasureGroup.name) }}</div>
            <div v-if="treasureGroup.activateNeed?.length" class="text-sm text-base-content/80 mb-1">
                套装效果：收集 {{ treasureGroup.activateNeed.length }} 件
            </div>
            <div v-if="treasureGroup.groupEffectDesc" class="text-sm leading-6 whitespace-pre-wrap break-all">
                <template v-for="(segment, index) in parseRichText(treasureGroup.groupEffectDesc)" :key="`group-${index}-${segment.tone}`">
                    <span
                        :class="{
                            'text-primary font-semibold': segment.tone === 'highlight',
                            'text-error font-semibold': segment.tone === 'warning',
                            'text-base-content font-semibold': segment.tone === 'title',
                        }"
                    >
                        {{ segment.text }}
                    </span>
                </template>
            </div>
        </div>

        <div v-if="'eventStoryline' in item && (item.eventStoryline as RougeStoryNode[]).length" class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">剧情</div>
            <DBRougeStorylineItem :nodes="item.eventStoryline as RougeStoryNode[]" :event-name="String(item.id)" />
        </div>

        <div v-if="roomConditions.length" class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">房间条件</div>
            <div class="space-y-2">
                <ConditionItem v-for="condition in roomConditions" :key="condition.id" :condition="condition" />
            </div>
        </div>

        <div v-if="kind !== 'treasureGroup'" class="rounded-md bg-base-200 p-3">
            <div class="text-xs text-base-content/70 mb-2">基础信息</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div v-if="'maxLevel' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">最大等级</span>
                    <span>{{ item.maxLevel }}</span>
                </div>
                <div v-if="kind === 'room' && 'weight' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">房间权重</span>
                    <span>{{ item.weight }}</span>
                </div>
                <div v-if="kind !== 'room' && 'weight' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">权重</span>
                    <span>{{ item.weight }}</span>
                </div>
                <div v-if="'shopPrices' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">商店价格</span>
                    <span>{{ item.shopPrices }}</span>
                </div>
                <div v-if="'endPoints' in item && (item.endPoints as number[]).length" class="flex justify-between gap-2">
                    <span class="text-base-content/70">积分</span>
                    <span>{{ (item.endPoints as number[]).join(" / ") }}</span>
                </div>
                <div v-if="'point' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">升级花费</span>
                    <span>{{ item.point }}</span>
                </div>
                <div v-if="'modEquip' in item && item.modEquip" class="flex justify-between gap-2">
                    <span class="text-base-content/70">适用部位</span>
                    <span>{{ item.modEquip }}</span>
                </div>
                <div v-if="'mod' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">{{ $t("提灯") }}/{{ $t("遗物") }} Mod</span>
                    <span>{{ item.mod }}</span>
                </div>
                <div v-if="'globalPassiveId' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">全局被动</span>
                    <span>{{ item.globalPassiveId }}</span>
                </div>
                <div v-if="'rlArchiveId' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">图鉴 ID</span>
                    <span>{{ item.rlArchiveId }}</span>
                </div>
                <div v-if="'canSell' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">可出售</span>
                    <span>{{ item.canSell ? "是" : "否" }}</span>
                </div>
                <div v-if="'blessingAward' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">祝福奖励</span>
                    <span>{{ item.blessingAward }}</span>
                </div>
                <div v-if="'tokenAward' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">代币奖励</span>
                    <span>{{ item.tokenAward }}</span>
                </div>
                <div v-if="'endPointsBase' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">基础积分</span>
                    <span>{{ item.endPointsBase }}</span>
                </div>
                <div v-if="'endPointsExtras' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">额外积分</span>
                    <span>{{ item.endPointsExtras }}</span>
                </div>
                <div v-if="'unlock' in item && (item.unlock as number[]).length" class="flex justify-between gap-2">
                    <span class="text-base-content/70">解锁依赖</span>
                    <span>{{ (item.unlock as number[]).join(", ") }}</span>
                </div>
                <div v-if="'moment' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">事件阶段</span>
                    <span>{{ item.moment }}</span>
                </div>
                <div v-if="'minRoom' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">最小房间</span>
                    <span>{{ item.minRoom }}</span>
                </div>
                <div v-if="'probability' in item && item.probability.length" class="flex justify-between gap-2">
                    <span class="text-base-content/70">事件概率</span>
                    <span>{{ item.probability.join(" / ") }}</span>
                </div>
                <div v-if="'cutOffEvent' in item" class="flex justify-between gap-2">
                    <span class="text-base-content/70">截断事件</span>
                    <span>{{ item.cutOffEvent ? "是" : "否" }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
