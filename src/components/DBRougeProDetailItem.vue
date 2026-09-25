<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import {
    type RougeProClass,
    type RougeProContract,
    type RougeProDifficulty,
    type RougeProEffect,
    type RougeProEvent,
    type RougeProRoom,
    type RougeProSeason,
    type RougeProTalent,
    type RougeProTreasure,
    type RougeProTreasureGroup,
    rougeLikeTalentBranches,
    rougeProEffects,
    rougeProTreasureGroups,
} from "@/data/d/rouge.data"
import { getRarityBadgeClass, getRarityName } from "@/utils/rarity-utils"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments, type StoryTextSegment } from "@/utils/story-text"

type RougeProItem =
    | RougeProTreasure
    | RougeProTalent
    | RougeProContract
    | RougeProClass
    | RougeProTreasureGroup
    | RougeProRoom
    | RougeProEvent
    | RougeProSeason
    | RougeProDifficulty

const props = defineProps<{
    item: RougeProItem
    kind: string
}>()

const { gt } = useGameText()
const { t } = useTranslation()

const item = computed(() => props.item)

/**
 * 提取图标资源名（兼容短名与完整 Unreal 路径）。
 * @param icon 原始图标字段
 * @returns 资源名
 */
function shortenIcon(icon: string | undefined): string {
    if (!icon) {
        return ""
    }
    const cleaned = icon
        .trim()
        .replace(/^Texture2D'/, "")
        .replace(/'$/, "")
        .replaceAll("\\", "/")
    const name = cleaned.split("/").pop() ?? ""
    return name.split(".")[0].trim()
}

const iconUrl = computed(() => {
    let raw: string | undefined
    if ("icon" in item.value) {
        raw = String(item.value.icon)
    } else if ("bigIcon" in item.value) {
        raw = String(item.value.bigIcon)
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

/** 事件类型枚举名 → 界面文案键 */
const EVENT_TYPE_KEYS: Record<string, string> = {
    RougePro_Defence: "event_defence",
    RougePro_Exterminate: "event_exterminate",
    RougePro_KillEliteMob: "event_kill_elite",
    RougePro_Occupation: "event_occupation",
    RougePro_SabotagePro: "event_sabotage",
}

/**
 * 解析事件类型展示名。
 * @param eventType 事件类型枚举名
 * @returns 当前语言下的类型名，未收录时原样返回枚举名
 */
function getEventTypeName(eventType: string): string {
    const key = EVENT_TYPE_KEYS[eventType]
    return key ? t(`db-rouge-pro-detail.${key}`) : eventType
}

/** 装备部位枚举名 → 展示名（前两项是游戏术语，取数据包原文） */
const MOD_EQUIP_KEYS: Record<string, string> = {
    MeleeWeapon: "近战武器",
    RangedWeapon: "远程武器",
}

/**
 * 解析装备部位展示名。
 * @param modEquip 部位枚举名
 * @returns 当前语言下的部位名，未收录时原样返回枚举名
 */
function getModEquipName(modEquip: string): string {
    if (modEquip === "Role") {
        return t("db-rouge-detail.equip_role")
    }
    const key = MOD_EQUIP_KEYS[modEquip]
    return key ? gt(key) : modEquip
}

/**
 * 解析合作宝藏所属遗物组名称。
 */
const groupName = computed(() => {
    if (!("treasureGroup" in item.value)) {
        return ""
    }
    const groupId = (item.value as RougeProTreasure).treasureGroup
    return rougeProTreasureGroups.find(group => group.id === groupId)?.name ?? ""
})

/**
 * 职业效果名翻译（按效果英文名映射）。
 */
const effectNameTranslations: Record<string, string> = {
    RandomChoice: "随机抉择",
    RecoverTimeAdd: "回复提前",
    ShopDiscount: "商店折扣",
    GetToken: "获得余烬",
    GetTreasure: "获得遗物",
    ChoiceNumber: "抉择数量",
    BlockEffect: "禁用效果",
    ActiveStaticPoint: "激活据点",
    ActiveMonsterSP: "激活精英",
    GetTokenByTime: "定时余烬",
    CreateCowEvent: "生成牛事件",
    GetModEveryOne: "全体获得 Mod",
    AddBuff: "获得 Buff",
}

/**
 * 解析职业基础效果列表。
 */
const effects = computed<RougeProEffect[]>(() => {
    if (!("effect" in item.value)) {
        return []
    }
    const ids = (item.value as RougeProClass).effect ?? []
    return ids.map(id => rougeProEffects.find(effect => effect.id === id)).filter(Boolean) as RougeProEffect[]
})

/**
 * 解析职业羁绊效果列表（同职业达 4 人触发）。
 */
const bondEffects = computed<RougeProEffect[]>(() => {
    if (!("bondEffect" in item.value)) {
        return []
    }
    const ids = (item.value as RougeProClass).bondEffect ?? []
    return ids.map(id => rougeProEffects.find(effect => effect.id === id)).filter(Boolean) as RougeProEffect[]
})

/**
 * 合作提灯所属分支信息。
 */
const talentBranch = computed(() => {
    if (!("branch" in item.value)) {
        return undefined
    }
    return rougeLikeTalentBranches.find(branch => branch.id === (item.value as RougeProTalent).branch)
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
                <div class="size-14 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                    <ImageFallback :src="iconUrl" :alt="displayName" class="w-full h-full">
                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="displayName" class="w-full h-full object-cover" />
                    </ImageFallback>
                </div>
                <div class="min-w-0">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Rouge Pro File
                    </p>
                    <div class="flex items-center gap-2">
                        <SRouterLink
                            :to="`/db/rouge/pro/${kind}/${item.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ displayName }}
                        </SRouterLink>
                        <CopyID :id="item.id" />
                    </div>
                    <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-base-content/55">
                        <span v-if="'rarity' in item" :class="getRarityBadgeClass(item.rarity + 2)">
                            {{ gt(getRarityName(item.rarity + 2)) }}
                        </span>
                        <span v-if="groupName" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">{{ gt(groupName) }}</span>
                        <span v-if="talentBranch" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">{{
                            gt(talentBranch.name)
                        }}</span>
                        <span v-if="'type' in item" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">
                            {{ getTalentTypeName(item.type) }}
                        </span>
                        <span v-if="'heatValue' in item" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">
                            {{ $t("db-rouge.heat_value", { value: item.heatValue }) }}
                        </span>
                        <span
                            v-if="'unique' in item && item.unique"
                            class="rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-semibold text-primary"
                        >
                            {{ $t('db-rouge-pro-detail.unique') }}
                        </span>
                        <span v-if="'eventType' in item" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">
                            {{ getEventTypeName(item.eventType) }}
                        </span>
                        <span
                            v-if="'seasonStartTime' in item"
                            class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-base-content/60"
                            >{{ $t('common.season') }}</span
                        >
                    </div>
                </div>
            </div>
        </header>

        <section v-if="desc" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('common.description')" />
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-6 whitespace-pre-wrap break-all">
                <template v-for="(segment, index) in parseRichText(desc)" :key="`desc-${index}-${segment.tone}`">
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

        <template v-if="effects.length || bondEffects.length">
            <section v-if="effects.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader
                    no-animate
                    compact
                    kicker="EFFECTS"
                    :title="$t(kind === 'class' ? 'db-rouge-detail.section_class_effects' : 'db-rouge-detail.section_effects')"
                    :count="effects.length"
                />
                <div class="space-y-2">
                    <RougeProEffectItem
                        v-for="effect in effects"
                        :key="effect.id"
                        :effect="effect"
                        :name="effectNameTranslations[effect.name ?? '']"
                    />
                </div>
            </section>
            <section
                v-if="kind === 'class' && bondEffects.length"
                class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
            >
                <SectionHeader no-animate compact kicker="CONTRACT" :title="$t('db-rouge-detail.section_contract')" :count="bondEffects.length" />
                <div class="space-y-2">
                    <RougeProEffectItem
                        v-for="effect in bondEffects"
                        :key="effect.id"
                        :effect="effect"
                        :name="effectNameTranslations[effect.name ?? '']"
                    />
                </div>
            </section>
        </template>

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
                    v-if="'weight' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t(kind === "room" ? "db-rouge-detail.room_weight" : "common.weight") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.weight }}</span>
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
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold text-primary">{{ getModEquipName(item.modEquip) }}</span>
                </div>
                <div
                    v-if="'mod' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ gt("提灯") }} Mod</span>
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
                    v-if="'startHeat' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.initial_dive_depth") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.startHeat }}</span>
                </div>
                <div
                    v-if="'collectionList' in item && (item.collectionList as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.collect_items") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        (item.collectionList as number[]).join(", ")
                    }}</span>
                </div>
                <div
                    v-if="'shopNpcList' in item && (item.shopNpcList as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.shop_npc") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        (item.shopNpcList as number[]).join(", ")
                    }}</span>
                </div>
                <div
                    v-if="'eventAreaList' in item && (item.eventAreaList as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.event_area") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        (item.eventAreaList as number[]).join(", ")
                    }}</span>
                </div>
                <div
                    v-if="'area' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.area") }}</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold text-primary">{{ item.area }}</span>
                </div>
                <div
                    v-if="'eventSubId' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.event_sub_id") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.eventSubId }}</span>
                </div>
                <div
                    v-if="'difficultyId' in item && (item.difficultyId as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.difficulty_id") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        (item.difficultyId as number[]).join(", ")
                    }}</span>
                </div>
                <div
                    v-if="'recommendLevel' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.recommend_level") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        item.recommendLevel
                    }}</span>
                </div>
                <div
                    v-if="'level' in item && (item.level as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.room_level") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        (item.level as number[]).join(" / ")
                    }}</span>
                </div>
                <div
                    v-if="'completeScore' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.clear_score") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.completeScore }}</span>
                </div>
                <div
                    v-if="'endPointsRate' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.points_rate") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.endPointsRate }}</span>
                </div>
                <div
                    v-if="'tokenId' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.token_id") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.tokenId }}</span>
                </div>
                <div
                    v-if="'tokenTransform' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.token_transform") }}</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold text-primary">{{
                        item.tokenTransform
                    }}</span>
                </div>
                <div
                    v-if="'outerShopTokenId' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.outer_shop_token") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        item.outerShopTokenId
                    }}</span>
                </div>
                <div
                    v-if="'seasonStartTime' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.season_start") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        item.seasonStartTime
                    }}</span>
                </div>
                <div
                    v-if="'seasonEndTime' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("db-rouge-detail.season_end") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ item.seasonEndTime }}</span>
                </div>
            </div>
        </section>
    </div>
</template>
