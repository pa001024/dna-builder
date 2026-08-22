<script lang="ts" setup>
import { computed } from "vue"
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

const eventTypeNames: Record<string, string> = {
    RougePro_Defence: "据点防守",
    RougePro_Exterminate: "歼灭",
    RougePro_KillEliteMob: "击杀精英",
    RougePro_Occupation: "占领",
    RougePro_SabotagePro: "破坏",
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
        <header class="flex items-center gap-3">
            <div class="size-14 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                <ImageFallback :src="iconUrl" :alt="displayName" class="w-full h-full">
                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="displayName" class="w-full h-full object-cover" />
                </ImageFallback>
            </div>
            <div class="min-w-0">
                <div class="flex items-center gap-2">
                    <SRouterLink
                        :to="`/db/rouge/pro/${kind}/${item.id}`"
                        class="line-clamp-1 font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary"
                    >
                        {{ displayName }}
                    </SRouterLink>
                    <CopyID :id="item.id" />
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-base-content/55">
                    <span v-if="'rarity' in item" :class="getRarityBadgeClass(item.rarity + 2)">
                        {{ getRarityName(item.rarity + 2) }}
                    </span>
                    <span v-if="groupName" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">{{ $t(groupName) }}</span>
                    <span v-if="talentBranch" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">{{
                        $t(talentBranch.name)
                    }}</span>
                    <span v-if="'type' in item" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">
                        {{ $t(talentTypeNames[item.type] || `类型 ${item.type}`) }}
                    </span>
                    <span v-if="'heatValue' in item" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">
                        {{ $t("深潜深度") }} {{ item.heatValue }}
                    </span>
                    <span
                        v-if="'unique' in item && item.unique"
                        class="rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-semibold text-primary"
                    >
                        唯一
                    </span>
                    <span v-if="'eventType' in item" class="rounded-xs border border-base-content/15 px-1.5 py-0.5">
                        {{ eventTypeNames[item.eventType] || item.eventType }}
                    </span>
                    <span
                        v-if="'seasonStartTime' in item"
                        class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-base-content/60"
                        >赛季</span
                    >
                </div>
            </div>
        </header>

        <section v-if="desc" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" title="描述" />
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
            <SectionHeader no-animate compact kicker="SET BONUS" title="套装效果" />
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
            <SectionHeader no-animate compact kicker="ACTIVATION" title="激活需求" :count="item.activateNeed.length" />
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DBRougeTreasureItem v-for="treasureId in item.activateNeed" :key="treasureId" :id="treasureId" />
            </div>
        </section>

        <section
            v-if="simpleDesc && simpleDesc !== desc"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="SUMMARY" title="简述" />
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
            <SectionHeader no-animate compact kicker="LORE" title="背景" />
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-6 whitespace-pre-wrap break-all">
                {{ item.ipDesc }}
            </div>
        </section>

        <template v-if="effects.length || bondEffects.length">
            <section v-if="effects.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader
                    no-animate
                    compact
                    kicker="EFFECTS"
                    :title="kind === 'class' ? '职业效果' : '效果'"
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
                <SectionHeader no-animate compact kicker="CONTRACT" title="契约效果（同职业 4 人触发）" :count="bondEffects.length" />
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
            <SectionHeader no-animate compact kicker="BASIC INFO" title="基础信息" />
            <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <div
                    v-if="'maxLevel' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">最大等级</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.maxLevel }}</span>
                </div>
                <div
                    v-if="'weight' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ kind === "room" ? "房间权重" : "权重" }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.weight }}</span>
                </div>
                <div
                    v-if="'endPoints' in item && (item.endPoints as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">积分</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        (item.endPoints as number[]).join(" / ")
                    }}</span>
                </div>
                <div
                    v-if="'point' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">升级花费</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.point }}</span>
                </div>
                <div
                    v-if="'modEquip' in item && item.modEquip"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">适用部位</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        item.modEquip
                    }}</span>
                </div>
                <div
                    v-if="'mod' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("提灯") }} Mod</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.mod }}</span>
                </div>
                <div
                    v-if="'globalPassiveId' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">全局被动</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        item.globalPassiveId
                    }}</span>
                </div>
                <div
                    v-if="'startHeat' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">初始{{ $t("深潜深度") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.startHeat }}</span>
                </div>
                <div
                    v-if="'collectionList' in item && (item.collectionList as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">采集物</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        (item.collectionList as number[]).join(", ")
                    }}</span>
                </div>
                <div
                    v-if="'shopNpcList' in item && (item.shopNpcList as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">商店 NPC</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        (item.shopNpcList as number[]).join(", ")
                    }}</span>
                </div>
                <div
                    v-if="'eventAreaList' in item && (item.eventAreaList as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">事件区域</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        (item.eventAreaList as number[]).join(", ")
                    }}</span>
                </div>
                <div
                    v-if="'area' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">区域</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.area }}</span>
                </div>
                <div
                    v-if="'eventSubId' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">事件子 ID</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.eventSubId }}</span>
                </div>
                <div
                    v-if="'difficultyId' in item && (item.difficultyId as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">难度 ID</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        (item.difficultyId as number[]).join(", ")
                    }}</span>
                </div>
                <div
                    v-if="'recommendLevel' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">推荐等级</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        item.recommendLevel
                    }}</span>
                </div>
                <div
                    v-if="'level' in item && (item.level as number[]).length"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">房间等级</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        (item.level as number[]).join(" / ")
                    }}</span>
                </div>
                <div
                    v-if="'completeScore' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">通关分数</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.completeScore }}</span>
                </div>
                <div
                    v-if="'endPointsRate' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">积分倍率</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.endPointsRate }}</span>
                </div>
                <div
                    v-if="'tokenId' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">代币 ID</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.tokenId }}</span>
                </div>
                <div
                    v-if="'tokenTransform' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">代币转化</span>
                    <span class="shrink-0 truncate font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        item.tokenTransform
                    }}</span>
                </div>
                <div
                    v-if="'outerShopTokenId' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">外部商店代币</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        item.outerShopTokenId
                    }}</span>
                </div>
                <div
                    v-if="'seasonStartTime' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">赛季开始</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        item.seasonStartTime
                    }}</span>
                </div>
                <div
                    v-if="'seasonEndTime' in item"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">赛季结束</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ item.seasonEndTime }}</span>
                </div>
            </div>
        </section>
    </div>
</template>
