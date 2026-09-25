<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref } from "vue"
import { useGameText } from "@/composables/useGameText"
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

const { gt } = useGameText()
const { t } = useTranslation()

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
    if ("name" in item.value && item.value.name) {
        return gt(item.value.name)
    }
    return `ID ${item.value.id}`
})

const desc = computed(() => ("desc" in item.value ? item.value.desc : undefined))

const simpleDesc = computed(() => ("simpleDesc" in item.value ? item.value.simpleDesc : undefined))

/**
 * 解析富文本描述（<Highlight>...</> 等标签）。
 *
 * 先在切分前翻译整段：富文本标记在对照表里与文本一起作为整键收录，
 * 先切分会把标记拆散，反而查不到译文。
 * @param text 原始文本
 * @returns 文本片段
 */
function parseRichText(text?: string): StoryTextSegment[] {
    return parseStoryTextSegments(gt(text), DEFAULT_STORY_TEXT_CONFIG)
}

/**
 * 解析提灯类型展示名（1 攻击 / 2 防御 / 3 通用）。
 * @param type 类型 ID
 * @returns 当前语言下的类型名
 */
function getTalentTypeName(type: number): string {
    if (type === 1) {
        return gt("攻击")
    }
    if (type === 2) {
        return gt("防御")
    }
    if (type === 3) {
        return t("db-rouge-detail.talent_type_general")
    }
    return t("db-rouge-detail.type_fallback", { id: type })
}

/**
 * 解析房间类型展示名。
 * @param roomType 房间类型 ID
 * @returns 当前语言下的类型名
 */
function getRoomTypeName(roomType: number): string {
    const info = getRougeRoomTypeInfo(roomType)
    return info ? gt(info.name) : t("db-rouge.room_type_fallback", { id: roomType })
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
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 条目档案头：纸面名片 + primary 标题 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative flex items-center gap-3">
                <div class="h-14 min-w-14 w-fit shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                    <ImageFallback :src="iconUrl" :alt="displayName" class="h-14 w-auto object-contain">
                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="displayName" class="h-14 w-auto object-contain" />
                    </ImageFallback>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Rouge File
                    </p>
                    <div class="flex items-center gap-2">
                        <SRouterLink
                            :to="`/db/rouge/like/${kind}/${item.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ displayName }}
                        </SRouterLink>
                        <CopyID :id="item.id" />
                    </div>
                    <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-base-content/55">
                        <span
                            v-if="'rarity' in item"
                            class="rounded-xs px-1.5 py-0.5 font-semibold"
                            :class="getRarityBadgeClass(item.rarity + 2)"
                        >
                            {{ gt(getRarityName(item.rarity + 2)) }}
                        </span>
                        <span v-if="groupName" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">{{ gt(groupName) }}</span>
                        <span v-if="treasureGroupName" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">{{
                            gt(treasureGroupName)
                        }}</span>
                        <span v-if="talentBranch" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">{{
                            gt(talentBranch.name)
                        }}</span>
                        <span
                            v-if="'type' in item && typeof item.type === 'number'"
                            class="rounded-xs border border-base-content/15 px-1.5 py-0.5"
                        >
                            {{ getTalentTypeName(item.type) }}
                        </span>
                        <span v-if="'roomType' in item" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">
                            {{ getRoomTypeName(item.roomType) }}
                        </span>
                        <span v-if="'heatValue' in item" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">
                            {{ $t("db-rouge.heat_value", { value: item.heatValue }) }}
                        </span>
                        <span v-if="'moment' in item" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">{{
                            gt(item.type)
                        }}</span>
                    </div>
                </div>
            </div>
        </header>

        <!-- 深潜等级选择方章 -->
        <section v-if="showContractLevelSelector" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVEL" :title="$t('common.level')">
                <template #trailing>
                    <div class="flex flex-wrap gap-1.5">
                        <button
                            v-for="level in (item as RougeLikeContract).maxLevel"
                            :key="level"
                            type="button"
                            class="cursor-pointer rounded-xs border px-2 py-0.5 font-orbitron text-[11px] font-semibold transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                currentContractLevel === level
                                    ? 'border-primary bg-primary text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="contractLevel = level"
                        >
                            {{ level }}
                        </button>
                    </div>
                </template>
            </SectionHeader>
        </section>

        <section v-if="contractDescAtLevel" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('common.description')" />
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-6 whitespace-pre-wrap break-all">
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
        </section>

        <section
            v-if="simpleDesc && simpleDesc !== desc"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="SUMMARY" :title="$t('db-rouge-detail.section_summary')" />
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-6 whitespace-pre-wrap break-all">
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
        </section>

        <section
            v-if="'ipDesc' in item && item.ipDesc"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="LORE" :title="$t('db-rouge-detail.section_lore')" />
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-6 whitespace-pre-wrap break-all">
                {{ gt(item.ipDesc) }}
            </div>
        </section>

        <section
            v-if="'groupEffectDesc' in item && item.groupEffectDesc"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="SET BONUS" :title="$t('db-rouge-detail.section_set_bonus')" />
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-6 whitespace-pre-wrap break-all">
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
        </section>

        <section
            v-if="'activateNeed' in item && item.activateNeed.length"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="ACTIVATION" :title="$t('db-rouge-detail.section_activation')" :count="item.activateNeed.length" />
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DBRougeTreasureItem v-for="treasureId in item.activateNeed" :key="treasureId" :id="treasureId" />
            </div>
        </section>

        <section
            v-if="treasureGroup && (treasureGroup.groupEffectDesc || treasureGroup.activateNeed?.length)"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="SET" :title="gt(treasureGroup.name)">
                <template #trailing>
                    <span v-if="treasureGroup.activateNeed?.length" class="text-[11px] tracking-wide text-base-content/50">
                        {{ $t("db-rouge-detail.collect_count", { num: treasureGroup.activateNeed.length }) }}
                    </span>
                </template>
            </SectionHeader>
            <div
                v-if="treasureGroup.groupEffectDesc"
                class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-6 whitespace-pre-wrap break-all"
            >
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
        </section>

        <section
            v-if="'eventStoryline' in item && (item.eventStoryline as RougeStoryNode[]).length"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="STORY" :title="$t('db-rouge-detail.section_story')" />
            <DBRougeStorylineItem :nodes="item.eventStoryline as RougeStoryNode[]" :event-name="String(item.id)" />
        </section>

        <section v-if="roomConditions.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="CONDITIONS" :title="$t('db-rouge-detail.section_conditions')" :count="roomConditions.length" />
            <div class="space-y-2">
                <ConditionItem v-for="condition in roomConditions" :key="condition.id" :condition="condition" />
            </div>
        </section>

        <section v-if="kind !== 'treasureGroup'" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BASIC INFO" :title="$t('common.basic_info')" />
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <div
                    v-if="'maxLevel' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.max_level") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.maxLevel }}</span>
                </div>
                <div
                    v-if="kind === 'room' && 'weight' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.room_weight") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.weight }}</span>
                </div>
                <div
                    v-if="kind !== 'room' && 'weight' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("common.weight") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.weight }}</span>
                </div>
                <div
                    v-if="'shopPrices' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.shop_price") }}</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold text-primary">{{
                        item.shopPrices
                    }}</span>
                </div>
                <div
                    v-if="'endPoints' in item && (item.endPoints as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.points") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        (item.endPoints as number[]).join(" / ")
                    }}</span>
                </div>
                <div
                    v-if="'point' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.upgrade_cost") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.point }}</span>
                </div>
                <div
                    v-if="'modEquip' in item && item.modEquip"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.equip_slot") }}</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold text-primary">{{
                        item.modEquip
                    }}</span>
                </div>
                <div
                    v-if="'mod' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ gt("提灯") }}/{{ gt("遗物") }} Mod</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold text-primary">{{ item.mod }}</span>
                </div>
                <div
                    v-if="'globalPassiveId' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.global_passive") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        item.globalPassiveId
                    }}</span>
                </div>
                <div
                    v-if="'rlArchiveId' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.archive_id") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.rlArchiveId }}</span>
                </div>
                <div
                    v-if="'canSell' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.sellable") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        item.canSell ? $t("db-rouge-detail.yes") : $t("db-rouge-detail.no")
                    }}</span>
                </div>
                <div
                    v-if="'blessingAward' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.blessing_award") }}</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold text-primary">{{
                        item.blessingAward
                    }}</span>
                </div>
                <div
                    v-if="'tokenAward' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.token_award") }}</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold text-primary">{{
                        item.tokenAward
                    }}</span>
                </div>
                <div
                    v-if="'endPointsBase' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.base_points") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.endPointsBase }}</span>
                </div>
                <div
                    v-if="'endPointsExtras' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.extra_points") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        item.endPointsExtras
                    }}</span>
                </div>
                <div
                    v-if="'unlock' in item && (item.unlock as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.unlock_dep") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        (item.unlock as number[]).join(", ")
                    }}</span>
                </div>
                <div
                    v-if="'moment' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.event_phase") }}</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold text-primary">{{
                        item.moment
                    }}</span>
                </div>
                <div
                    v-if="'minRoom' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.min_room") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.minRoom }}</span>
                </div>
                <div
                    v-if="'probability' in item && item.probability.length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.event_chance") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        item.probability.join(" / ")
                    }}</span>
                </div>
                <div
                    v-if="'cutOffEvent' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.cut_off_event") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        item.cutOffEvent ? $t("db-rouge-detail.yes") : $t("db-rouge-detail.no")
                    }}</span>
                </div>
            </div>
        </section>
    </div>
</template>
