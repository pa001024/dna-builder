<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { eventData, resourceMap } from "@/data/d"
import { conditionsMap } from "@/data/d/condition.data"
import { bagTabs, buffLevels, buffTypes, resources, resourceTabs, seasons, stashTabs, tiers } from "@/data/d/dnaseason.data"
import { breakdowns, crafts, inlays, rarities } from "@/data/d/dnaseasonequip.data"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { formatTimeRange } from "@/utils/time"
import { resolveCraftGrowth, resolveCraftSummaryText } from "@/utils/transcendence-craft"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import { getCraftLabelKey } from "@/utils/transcendence-gear"
import { SEASON_TIER_NAME_KEYS } from "@/utils/transcendence-journey"

/** 稀有度 10（暗金）超出 rarity-utils 的 1–6 色带，按红色高稀有度展示 */
function rarityGradient(rarity: number): string {
    return getRarityGradientClass(rarity > 6 ? 6 : rarity)
}

/**
 * 官方 craft 页签图标（游戏 `CraftTabIcons`）：纯白 alpha，用 mask + currentColor 着色，深浅主题都跟随正文色。
 * 贴图字形只占画布的一部分（实测 alpha 包围盒：Sell 48%×59%、Punch 73%×57%、FinalForge 73%×56%、
 * Enchant 71%×60%、Temper 72%×59%），按 contain 直接铺到 16px 盒子里只剩约 11×9px 细笔画，
 * 肉眼几乎不可辨。这里按各自包围盒放大 mask（单值百分比保持等比、取 94% 填充以免贴边裁切）。
 */
const CRAFT_TAB_ICONS = {
    Sell: { url: "/imgs/webp/T_Tab_Season_Craft_Sell.webp", maskSize: "158%" },
    Punch: { url: "/imgs/webp/T_Tab_Season_Craft_Punch.webp", maskSize: "128%" },
    FinalForge: { url: "/imgs/webp/T_Tab_Season_Craft_FinalForge.webp", maskSize: "128%" },
    Enchant: { url: "/imgs/webp/T_Tab_Season_Craft_Enchant.webp", maskSize: "132%" },
    Temper: { url: "/imgs/webp/T_Tab_Season_Craft_Temper.webp", maskSize: "131%" },
} as const

type CraftTabIconName = keyof typeof CRAFT_TAB_ICONS

/** CraftId → 官方页签图标：1/2 精锻/最终精锻 → FinalForge，3 淬炼 → Temper，4 附魔 → Enchant，5/6/7 → Punch */
const CRAFT_ID_ICON_NAME: Record<number, CraftTabIconName> = {
    1: "FinalForge",
    2: "FinalForge",
    3: "Temper",
    4: "Enchant",
    5: "Punch",
    6: "Punch",
    7: "Punch",
}

/**
 * 官方页签图标的 mask 样式。
 * @param name 图标名（对应游戏 `CraftTabIcons` 的键）
 */
function craftIconMaskStyle(name: CraftTabIconName) {
    const { url, maskSize } = CRAFT_TAB_ICONS[name]

    return {
        maskImage: `url("${url}")`,
        maskSize,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: `url("${url}")`,
        WebkitMaskSize: maskSize,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
    }
}

const { gt } = useGameText()
const { t, i18next } = useTranslation()

const season = computed(() => seasons[0] ?? null)

const event = computed(() => eventData.find(item => item.id === season.value?.eventId))

const eventName = computed(() => {
    if (event.value) {
        return gt(event.value.name)
    }

    return season.value ? t("db-transcendence.common.id_value", { id: season.value.eventId }) : ""
})

const eventDesc = computed(() => cleanGameMarkup(gt(event.value?.desc)))
const eventRule = computed(() => cleanGameMarkup(gt(event.value?.rule)))
const eventTime = computed(() => formatTimeRange(season.value?.startTime, season.value?.endTime, t("database.until_now"), i18next.language))

/**
 * 解锁条件：从条件表达式取螺旋层数，按当前语言渲染；无法解析时返回空串（界面省略该行）。
 * 上游 `remark` 只有简体中文，不能直接展示。
 * @param conditionId 条件 id
 * @returns 本地化解锁文案
 */
function formatUnlockCondition(conditionId: number | undefined): string {
    if (!conditionId) {
        return ""
    }

    const layers = conditionsMap[conditionId]?.map?.RiftNormalLayers ?? conditionsMap[conditionId]?.map?.RiftRankLayers

    if (!Array.isArray(layers) || typeof layers[0] !== "number") {
        return ""
    }

    return t("db-transcendence.overview.condition_layers", { layers: layers[0] })
}

/** 掉率加成 id → 赛季增益类型：同一类型的 4 个等级共享一个加成 id */
const dropBonusTypeById = new Map<number, string>()
for (const level of buffLevels) {
    dropBonusTypeById.set(level.dropBonusId, level.type)
}

const buffTypeMap = new Map(buffTypes.map(type => [type.id, type]))

/**
 * 难度阶提示拆行：「·」开头为数值条目，其余为推荐语；与掉率加成列重复的百分比条目略去。
 * @param tips 已清洗的提示文本
 * @param percents 本阶掉率加成百分比
 */
function splitTierTips(tips: string, percents: number[]) {
    return tips
        .split("\n")
        .map(line => line.trim())
        .filter(line => line && !percents.some(percent => line.includes(`+${percent}%`)))
        .map(line => ({ text: line, fact: line.startsWith("·") }))
}

/** 难度阶：解锁条件由条件表达式渲染成本地化文案，名称取官方难度阶文案键 */
const tierRows = computed(() =>
    tiers.map(tier => {
        const bonuses = (tier.dropBonus ?? []).map(bonus => {
            const typeId = dropBonusTypeById.get(bonus.id) ?? ""
            const type = buffTypeMap.get(typeId)

            return {
                key: `${tier.id}-${bonus.id}`,
                typeId: typeId || String(bonus.id),
                name: type ? cleanGameMarkup(gt(type.desc)) : t("db-transcendence.common.id_value", { id: bonus.id }),
                icon: type?.smallIcon ?? type?.icon ?? "",
                percent: bonus.rate / 100,
            }
        })

        return {
            ...tier,
            nameKey: SEASON_TIER_NAME_KEYS[tier.tierLevel] ?? "",
            unlockText: formatUnlockCondition(tier.unlockCondition),
            bonuses,
            tipLines: splitTierTips(
                cleanGameMarkup(gt(tier.tips)),
                bonuses.map(bonus => bonus.percent)
            ),
        }
    })
)

/** 掉率加成图例：按首次出现顺序收集各难度阶用到的加成类型，作为表格列 */
const tierBonusLegend = computed(() => {
    const legend = new Map<string, { typeId: string; name: string; icon: string }>()
    for (const tier of tierRows.value) {
        for (const bonus of tier.bonuses) {
            if (!legend.has(bonus.typeId)) {
                legend.set(bonus.typeId, { typeId: bonus.typeId, name: bonus.name, icon: bonus.icon })
            }
        }
    }

    return [...legend.values()]
})

/** 难度阶按难度档（简单/普通/困难/挑战）分组，组头附怪物等级区间；加成按图例列对齐 */
const tierGroups = computed(() => {
    const groups = new Map<number, TierGroup>()

    for (const tier of tierRows.value) {
        let group = groups.get(tier.tierLevel)
        if (!group) {
            group = {
                level: tier.tierLevel,
                name: tier.nameKey ? t(tier.nameKey) : gt(tier.name),
                minLevel: tier.monsterLevel,
                maxLevel: tier.monsterLevel,
                rows: [],
            }
            groups.set(tier.tierLevel, group)
        }
        group.minLevel = Math.min(group.minLevel, tier.monsterLevel)
        group.maxLevel = Math.max(group.maxLevel, tier.monsterLevel)
        group.rows.push({
            ...tier,
            bonusCells: tierBonusLegend.value.map(item => ({
                typeId: item.typeId,
                bonus: tier.bonuses.find(bonus => bonus.typeId === item.typeId),
            })),
        })
    }

    return [...groups.values()]
})

type TierRow = (typeof tierRows.value)[number]

interface TierGroup {
    level: number
    name: string
    minLevel: number
    maxLevel: number
    rows: (TierRow & { bonusCells: { typeId: string; bonus?: TierRow["bonuses"][number] }[] })[]
}

/** 资源行：名称/图标/描述/背包归属全部来自 resourceMap */
interface ResourceRow {
    id: number
    name: string
    desc: string
    icon: string
    rarity: number
    bagTabId?: number
}

const resourceRows = computed<ResourceRow[]>(() =>
    resources.map(id => {
        const resource = resourceMap.get(id)

        return {
            id,
            name: resource ? gt(resource.name) : t("db-transcendence.common.id_value", { id }),
            desc: cleanGameMarkup(resource?.desc ? gt(resource.desc) : ""),
            icon: resource ? `/imgs/res/${resource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp",
            rarity: resource?.rarity ?? 1,
            bagTabId: resource?.dnaSeason?.bagTabId,
        }
    })
)

const resourceRowMap = computed(() => new Map(resourceRows.value.map(row => [row.id, row])))

const resourceTabGroups = computed(() =>
    resourceTabs.map(tab => ({
        id: tab.id,
        name: gt(tab.name),
        rows: tab.resources.map(id => resourceRowMap.value.get(id)).filter((row): row is ResourceRow => !!row),
    }))
)

const bagGroups = computed(() =>
    bagTabs.map(tab => ({
        ...tab,
        name: gt(tab.name),
        fullToast: cleanGameMarkup(tab.fullToast ? gt(tab.fullToast) : ""),
        rows: resourceRows.value.filter(row => row.bagTabId === tab.id),
    }))
)

/** 12 个资源没有 bagTabId，不占背包格，单独归组 */
const looseResources = computed(() => resourceRows.value.filter(row => row.bagTabId === undefined))

const buffGroups = computed(() =>
    buffTypes.map(type => ({
        id: type.id,
        desc: cleanGameMarkup(gt(type.desc)),
        icon: type.icon,
        levels: buffLevels
            .filter(level => level.type === type.id)
            .sort((left, right) => left.level - right.level)
            .map(level => ({ id: level.id, level: level.level, percent: level.dropBonusRate / 100, cost: level.cost })),
    }))
)

const stashRows = computed(() => stashTabs)

const craftRows = computed(() =>
    crafts.map(craft => {
        const labelKey = getCraftLabelKey(craft.id)
        const text = resolveCraftSummaryText(
            { title: cleanGameMarkup(gt(craft.title)), desc: cleanGameMarkup(gt(craft.desc)) },
            labelKey ? t(labelKey) : ""
        )

        return {
            id: craft.id,
            iconName: CRAFT_ID_ICON_NAME[craft.id] ?? "FinalForge",
            title: text.title,
            label: text.label,
            /** 游戏 TextMap 原文，概览只做两行截断，完整文本在 craft 详情页 */
            desc: text.desc,
            condition: formatUnlockCondition(craft.condition),
            costItems: craft.costItems ?? {},
            priceId: craft.costPriceId,
            priceCount: craft.costPriceCount,
            maxCount: craft.maxCount,
            growth: resolveCraftGrowth(craft.enchantGrowthFactor, craft.enchantGrowthMaxCount),
        }
    })
)

const breakdownRows = computed(() =>
    breakdowns.map(row => ({
        rarity: row.rarity,
        rarityName: gt(rarities.find(rarity => rarity.id === row.rarity)?.name ?? ""),
        cost: Object.fromEntries(row.itemIds.map((id, index) => [id, row.itemCounts[index] ?? 1])) as Record<string, number>,
        priceId: row.priceId,
        price: row.price,
    }))
)

const inlayPrices = computed(() => inlays.map(inlay => inlay.breakdown.price))

/** 镶嵌分解价使用的通货（30 个镶嵌物共用同一个 priceId） */
const inlayPriceCurrency = computed(() => {
    const priceId = inlays[0]?.breakdown.priceId
    const resource = priceId ? resourceMap.get(priceId) : undefined

    return resource ? gt(resource.name) : ""
})
</script>


<template>
    <ScrollSpyLayout auto nav-kicker="DATABASE" class="h-full min-h-0 flex-1">
        <div class="stagger-rise space-y-3 p-3 sm:p-4">
            <!-- 赛季：活动名 / 时间 / 描述 / 规则 + 赛季主图 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader
                    no-animate
                    compact
                    kicker="TRANSCENDENCE SEASON"
                    :title="$t('db-transcendence.overview.season_info')"
                />
                <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
                    <div class="min-w-0">
                        <p class="mb-1 text-[11px] tracking-wide text-base-content/45">{{ $t("db-transcendence.overview.event") }}</p>
                        <SRouterLink
                            v-if="season"
                            :to="`/db/event/${season.eventId}`"
                            class="text-xl leading-tight font-bold tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ eventName }}
                        </SRouterLink>
                        <h2 v-else class="text-xl leading-tight font-bold tracking-tight text-base-content sm:text-2xl">{{ eventName }}</h2>
                        <div class="mt-2 flex flex-wrap items-center gap-1.5">
                            <span class="badge badge-sm border-primary/40 bg-primary/10 font-orbitron font-semibold text-primary">
                                {{ $t("db-transcendence.overview.phase", { count: season?.phaseCount ?? 0 }) }}
                            </span>
                            <span class="badge badge-sm gap-1 text-base-content/60">
                                <Icon icon="ri:calendar-event-line" class="size-3.5" />
                                {{ $t("db-transcendence.overview.time") }}
                                <span class="font-orbitron tabular-nums">{{ eventTime }}</span>
                            </span>
                            <CopyID v-if="season" :id="season.id" />
                        </div>
                        <p v-if="eventDesc" class="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-base-content/75">{{ eventDesc }}</p>
                    </div>
                    <ImageFallback
                        :src="season ? `/imgs/webp/${season.image}.webp` : ''"
                        :alt="eventName"
                        class="aspect-2/1 w-full self-start overflow-hidden rounded-xs border border-base-content/10 object-cover"
                    >
                        <div class="flex aspect-2/1 w-full items-center justify-center rounded-xs border border-dashed border-base-content/20 bg-base-content/3">
                            <Icon icon="ri:magic-line" class="size-8 text-primary/50" />
                        </div>
                    </ImageFallback>
                </div>
                <div v-if="eventRule" class="mt-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <p class="mb-1 text-[11px] font-semibold tracking-wide text-base-content/55">{{ $t("db-transcendence.overview.rule") }}</p>
                    <p class="whitespace-pre-line text-[12px] leading-relaxed text-base-content/65">{{ eventRule }}</p>
                </div>
            </section>

            <!-- 难度阶：按难度档分组的表格，掉率加成按图例列对齐 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="DIFFICULTY" :title="$t('db-transcendence.overview.tiers')" :count="tierRows.length" />
                <p v-if="!tierRows.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                <template v-else>
                    <div v-if="tierBonusLegend.length" class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-base-content/55">
                        <span class="text-base-content/40">{{ $t("db-transcendence.overview.drop_bonus") }}</span>
                        <span v-for="item in tierBonusLegend" :key="item.typeId" class="inline-flex items-center gap-1">
                            <ImageFallback v-if="item.icon" :src="`/imgs/webp/${item.icon}.webp`" :alt="item.name" class="size-4 shrink-0" />
                            {{ item.name }}
                        </span>
                    </div>
                    <div class="overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                        <div
                            class="hidden border-b border-base-content/10 px-2.5 py-1.5 text-[10px] tracking-wide text-base-content/40 lg:grid lg:grid-cols-[3rem_4.5rem_10rem_13rem_minmax(0,1fr)] lg:gap-x-4"
                        >
                            <span />
                            <span>{{ $t("db-transcendence.overview.tier_level") }}</span>
                            <span>{{ $t("db-transcendence.overview.unlock") }}</span>
                            <span class="grid grid-cols-3 gap-1.5">
                                <ImageFallback
                                    v-for="item in tierBonusLegend"
                                    :key="item.typeId"
                                    :src="`/imgs/webp/${item.icon}.webp`"
                                    :alt="item.name"
                                    :title="item.name"
                                    class="size-4 shrink-0"
                                />
                            </span>
                            <span />
                        </div>
                        <div v-for="group in tierGroups" :key="group.level" class="border-b border-base-content/10 last:border-b-0">
                            <div class="flex items-center gap-2 bg-base-content/4 px-2.5 py-1.5">
                                <span class="text-[12px] font-semibold text-base-content/85">{{ group.name }}</span>
                                <span class="font-orbitron text-[11px] text-base-content/40">×{{ group.rows.length }}</span>
                                <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                                <span class="font-orbitron text-[11px] text-base-content/45">
                                    Lv {{ group.minLevel }}<template v-if="group.maxLevel !== group.minLevel"> – {{ group.maxLevel }}</template>
                                </span>
                            </div>
                            <div class="divide-y divide-base-content/8">
                                <article
                                    v-for="tier in group.rows"
                                    :key="tier.id"
                                    class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-2 transition-colors duration-150 hover:bg-base-content/3 lg:grid lg:grid-cols-[3rem_4.5rem_10rem_13rem_minmax(0,1fr)] lg:items-start lg:gap-x-4"
                                >
                                    <span
                                        class="inline-flex h-5 min-w-7 items-center justify-center justify-self-start rounded-xs bg-primary px-1.5 font-orbitron text-[11px] font-semibold text-primary-content"
                                    >
                                        {{ tier.nameTier }}
                                    </span>
                                    <span class="inline-flex items-baseline gap-1">
                                        <span class="text-[10px] text-base-content/40 lg:hidden">{{ $t("db-transcendence.overview.tier_level") }}</span>
                                        <b class="font-orbitron text-[13px] font-semibold text-primary">{{ tier.monsterLevel }}</b>
                                    </span>
                                    <span class="inline-flex min-w-0 items-center gap-1 text-[11px]" :class="tier.unlockText ? 'text-base-content/60' : 'text-base-content/25'">
                                        <Icon v-if="tier.unlockText" icon="ri:lock-line" class="size-3.5 shrink-0" />
                                        {{ tier.unlockText || "—" }}
                                    </span>
                                    <span
                                        v-if="tier.bonusCells.length"
                                        class="w-full grid-cols-3 gap-1.5 sm:w-52 lg:grid lg:w-auto"
                                        :class="tier.bonuses.length ? 'grid' : 'hidden'"
                                    >
                                        <span v-for="cell in tier.bonusCells" :key="cell.typeId" class="inline-flex items-center gap-1" :title="cell.bonus?.name">
                                            <template v-if="cell.bonus">
                                                <ImageFallback v-if="cell.bonus.icon" :src="`/imgs/webp/${cell.bonus.icon}.webp`" :alt="cell.bonus.name" class="size-4 shrink-0 lg:hidden" />
                                                <b class="font-orbitron text-[11px] font-semibold text-primary">+{{ cell.bonus.percent }}%</b>
                                            </template>
                                            <span v-else class="text-[11px] text-base-content/25">—</span>
                                        </span>
                                    </span>
                                    <span v-else class="hidden lg:block" />
                                    <div v-if="tier.tipLines.length" class="basis-full space-y-0.5 text-[11px] leading-relaxed lg:basis-auto">
                                        <p v-for="(line, index) in tier.tipLines" :key="index" :class="line.fact ? 'text-base-content/45' : 'text-base-content/70'">
                                            {{ line.text }}
                                        </p>
                                    </div>
                                </article>
                            </div>
                        </div>
                    </div>
                </template>
            </section>

            <!-- 资源页 / 背包页 / 仓库页 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="RESOURCES" :title="$t('db-transcendence.overview.resources')" :count="resourceRows.length" />
                <p v-if="!resourceRows.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                <div v-else class="space-y-4">
                    <div>
                        <div class="mb-2 flex items-center gap-2">
                            <span class="text-[11px] font-semibold tracking-wide text-base-content/55">{{ $t("db-transcendence.overview.resource_page") }}</span>
                            <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                        </div>
                        <div class="grid gap-2 md:grid-cols-3">
                            <div v-for="group in resourceTabGroups" :key="group.id" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                                <div class="mb-1.5 flex items-center justify-between gap-2">
                                    <p class="text-[12px] font-semibold text-base-content/80">{{ group.name }}</p>
                                    <span class="font-orbitron text-[11px] text-base-content/40">{{ group.rows.length }}</span>
                                </div>
                                <div class="grid gap-0.5">
                                    <SRouterLink
                                        v-for="row in group.rows"
                                        :key="row.id"
                                        :to="`/db/resource/${row.id}`"
                                        class="group flex min-w-0 items-start gap-2 rounded-xs px-1 py-1 transition-colors duration-150 hover:bg-base-content/5"
                                    >
                                        <ImageFallback :src="row.icon" :alt="row.name" class="size-6 shrink-0 overflow-hidden rounded-xs">
                                            <span class="size-6 shrink-0 rounded-xs" :class="rarityGradient(row.rarity)" />
                                        </ImageFallback>
                                        <span class="min-w-0 flex-1">
                                            <span class="block truncate text-[12px] leading-6 text-base-content/75 transition-colors duration-150 group-hover:text-primary">{{ row.name }}</span>
                                            <span v-if="row.desc" class="line-clamp-2 text-[10px] leading-relaxed text-base-content/40">{{ row.desc }}</span>
                                        </span>
                                    </SRouterLink>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div class="mb-2 flex items-center gap-2">
                            <span class="text-[11px] font-semibold tracking-wide text-base-content/55">{{ $t("db-transcendence.overview.bag_page") }}</span>
                            <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                        </div>
                        <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
                            <div
                                v-for="group in bagGroups"
                                :key="group.id"
                                class="flex min-w-0 flex-col justify-center gap-0.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                            >
                                <div class="flex items-center justify-between gap-2">
                                    <span class="truncate text-[12px] font-semibold text-base-content/80">{{ group.name }}</span>
                                    <span class="shrink-0 font-orbitron text-[11px] font-semibold text-primary">
                                        {{ $t("db-transcendence.overview.capacity", { count: group.maxItemNum }) }}
                                    </span>
                                </div>
                                <span v-if="group.fullToast" class="truncate text-[10px] text-base-content/40" :title="group.fullToast">
                                    {{ $t("db-transcendence.overview.full_toast") }} · {{ group.fullToast }}
                                </span>
                            </div>
                        </div>
                        <div class="mt-2 space-y-2">
                            <template v-for="group in bagGroups" :key="group.id">
                                <div v-if="group.rows.length" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                                    <div class="mb-1.5 flex items-center gap-2">
                                        <p class="text-[12px] font-semibold text-base-content/80">{{ group.name }}</p>
                                        <span class="font-orbitron text-[11px] text-base-content/40">{{ group.rows.length }}</span>
                                    </div>
                                    <div class="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-1">
                                        <SRouterLink
                                            v-for="row in group.rows"
                                            :key="row.id"
                                            :to="`/db/resource/${row.id}`"
                                            class="flex min-w-0 items-center gap-1.5 rounded-xs border border-base-content/8 px-1.5 py-1 text-[11px] text-base-content/70 transition-colors duration-150 hover:border-primary/40 hover:text-primary"
                                        >
                                            <ImageFallback :src="row.icon" :alt="row.name" class="size-5 shrink-0 overflow-hidden rounded-xs">
                                                <span class="size-5 shrink-0 rounded-xs" :class="rarityGradient(row.rarity)" />
                                            </ImageFallback>
                                            <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
                                        </SRouterLink>
                                    </div>
                                </div>
                            </template>
                            <div v-if="looseResources.length" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                                <div class="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    <p class="text-[12px] font-semibold text-base-content/80">{{ $t("db-transcendence.overview.other_resources") }}</p>
                                    <span class="font-orbitron text-[11px] text-base-content/40">{{ looseResources.length }}</span>
                                    <span class="ml-auto text-[10px] text-base-content/40">{{ $t("db-transcendence.overview.not_in_bag") }}</span>
                                </div>
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-1">
                                    <SRouterLink
                                        v-for="row in looseResources"
                                        :key="row.id"
                                        :to="`/db/resource/${row.id}`"
                                        class="flex min-w-0 items-center gap-1.5 rounded-xs border border-base-content/8 px-1.5 py-1 text-[11px] text-base-content/70 transition-colors duration-150 hover:border-primary/40 hover:text-primary"
                                    >
                                        <ImageFallback :src="row.icon" :alt="row.name" class="size-5 shrink-0 overflow-hidden rounded-xs">
                                            <span class="size-5 shrink-0 rounded-xs" :class="rarityGradient(row.rarity)" />
                                        </ImageFallback>
                                        <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
                                    </SRouterLink>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div class="mb-2 flex items-center gap-2">
                            <span class="text-[11px] font-semibold tracking-wide text-base-content/55">{{ $t("db-transcendence.overview.stash_page") }}</span>
                            <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                            <span class="font-orbitron text-[11px] text-base-content/40">{{ stashRows.length }}</span>
                        </div>
                        <p v-if="!stashRows.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                        <div v-else class="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
                            <div v-for="row in stashRows" :key="row.id" class="flex min-w-0 flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="text-[12px] font-medium text-base-content/80">{{ $t("db-transcendence.overview.stash_row", { id: row.id }) }}</span>
                                    <span class="font-orbitron text-[11px] font-semibold text-primary">
                                        {{ $t("db-transcendence.overview.capacity", { count: row.maxItemNum }) }}
                                    </span>
                                </div>
                                <div v-if="row.unlockCost" class="flex flex-wrap items-center gap-1" :title="$t('db-transcendence.overview.unlock_cost')">
                                    <ResourceCostItem v-for="(count, id) in row.unlockCost" :key="id" :value="[count, id, 'Resource']" mini />
                                </div>
                                <span v-else class="text-[11px] leading-6 text-base-content/25">—</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 赛季增益：4 类型 × 4 级 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="SEASON BUFF" :title="$t('db-transcendence.overview.buffs')" :count="buffGroups.length">
                    <template #trailing>
                        <span class="text-[11px] text-base-content/40">{{ $t("db-transcendence.overview.drop_bonus") }}</span>
                    </template>
                </SectionHeader>
                <p v-if="!buffGroups.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                <div v-else class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div v-for="group in buffGroups" :key="group.id" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                        <div class="mb-1.5 flex items-center gap-2">
                            <ImageFallback :src="`/imgs/webp/${group.icon}.webp`" :alt="group.desc" class="size-7 shrink-0 overflow-hidden rounded-xs">
                                <Icon icon="ri:magic-line" class="size-5 text-primary/50" />
                            </ImageFallback>
                            <p class="min-w-0 flex-1 text-[12px] leading-snug font-semibold text-base-content/80">{{ group.desc }}</p>
                        </div>
                        <div class="divide-y divide-base-content/8">
                            <div v-for="level in group.levels" :key="level.id" class="grid grid-cols-[3rem_3.5rem_minmax(0,1fr)] items-center gap-2 py-1">
                                <span class="font-orbitron text-[11px] font-semibold text-base-content/50">
                                    {{ $t("db-transcendence.overview.buff_level", { level: level.level }) }}
                                </span>
                                <span class="font-orbitron text-[13px] font-semibold text-primary">+{{ level.percent }}%</span>
                                <span class="flex flex-wrap items-center justify-end gap-1">
                                    <ResourceCostItem v-for="(count, id) in level.cost" :key="id" :value="[count, id, 'Resource']" mini />
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 装备改造：名称 / 说明与条件 / 成本三栏 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="CRAFT" :title="$t('db-transcendence.overview.crafts')" :count="craftRows.length">
                    <template #title>
                        <span class="inline-block size-5 shrink-0 bg-current text-base-content" aria-hidden="true" data-craft-icon :style="craftIconMaskStyle('FinalForge')" />
                    </template>
                </SectionHeader>
                <p v-if="!craftRows.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                <div v-else class="divide-y divide-base-content/8 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                    <article
                        v-for="craft in craftRows"
                        :key="craft.id"
                        class="flex flex-col gap-1.5 px-2.5 py-2.5 transition-colors duration-150 hover:bg-base-content/3 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)_minmax(0,17rem)] lg:items-start lg:gap-4"
                        :data-craft-id="craft.id"
                    >
                        <div class="flex min-w-0 items-start gap-2">
                            <span class="inline-flex size-6 shrink-0 items-center justify-center rounded-xs border border-base-content/10 bg-base-100/40" aria-hidden="true">
                                <span class="inline-block size-4 bg-current text-base-content/80" :data-craft-type-icon="craft.id" :style="craftIconMaskStyle(craft.iconName)" />
                            </span>
                            <div class="min-w-0">
                                <SRouterLink
                                    v-if="craft.title"
                                    :to="`/db/transcendence/gear/craft`"
                                    class="block truncate text-[13px] leading-6 font-semibold text-base-content/85 transition-colors duration-150 hover:text-primary"
                                    data-craft-title
                                    >{{ craft.title }}</SRouterLink
                                >
                                <span v-if="craft.label" class="block text-[10px] text-base-content/40" data-craft-label>{{ craft.label }}</span>
                            </div>
                        </div>
                        <div class="min-w-0 space-y-1 text-[11px] leading-relaxed">
                            <p v-if="craft.desc" class="line-clamp-2 text-base-content/60" :title="craft.desc" data-craft-desc>{{ craft.desc }}</p>
                            <div v-if="craft.condition || craft.maxCount" class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-base-content/45">
                                <span v-if="craft.condition" class="inline-flex items-center gap-1">
                                    <Icon icon="ri:lock-line" class="size-3.5 shrink-0" />
                                    {{ craft.condition }}
                                </span>
                                <span v-if="craft.maxCount" class="font-semibold text-primary">
                                    {{ $t("db-transcendence.overview.craft_limit", { count: craft.maxCount }) }}
                                </span>
                            </div>
                            <p v-if="craft.growth" class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base-content/45" data-craft-growth>
                                <span>{{ $t("db-transcendence.overview.craft_growth", { first: craft.growth.firstMultiplier, factor: craft.growth.factor, cap: craft.growth.capMultiplier, capAt: craft.growth.capAt }) }}</span>
                                <span class="badge badge-xs text-base-content/40">{{ $t("db-transcendence.overview.craft_growth_note") }}</span>
                            </p>
                        </div>
                        <div class="flex flex-wrap items-center gap-1.5 lg:justify-end">
                            <ResourceCostItem v-for="(count, id) in craft.costItems" :key="id" :value="[count, id, 'Resource']" mini />
                            <ResourceCostItem v-if="craft.priceId !== undefined" :value="[craft.priceCount ?? 1, craft.priceId, 'Resource']" mini />
                        </div>
                    </article>
                </div>
            </section>

            <!-- 分解 / 镶嵌摘要 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="DISMANTLE" :title="$t('db-transcendence.overview.breakdown')" :count="breakdownRows.length">
                    <template #title>
                        <span class="inline-block size-4 shrink-0 bg-current text-base-content" aria-hidden="true" data-craft-dismantle-icon :style="craftIconMaskStyle('Sell')" />
                    </template>
                </SectionHeader>
                <p v-if="!breakdownRows.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                <div v-else class="grid gap-1.5 md:grid-cols-2">
                    <div
                        v-for="row in breakdownRows"
                        :key="row.rarity"
                        class="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="flex items-center gap-2">
                            <span class="h-4 w-1 shrink-0 rounded-xs" :class="rarityGradient(row.rarity)" />
                            <span class="text-[12px] font-semibold text-base-content/80">{{ row.rarityName }}</span>
                        </span>
                        <span class="flex flex-wrap items-center justify-end gap-1">
                            <ResourceCostItem v-for="(count, id) in row.cost" :key="id" :value="[count, id, 'Resource']" mini />
                            <ResourceCostItem v-if="row.priceId !== undefined" :value="[row.price ?? 1, row.priceId, 'Resource']" mini />
                        </span>
                    </div>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-[12px] font-semibold text-base-content/80">{{ $t("db-transcendence.overview.inlay_summary", { count: inlays.length }) }}</span>
                    <template v-if="inlayPrices.length">
                        <span class="font-orbitron text-[13px] font-semibold text-primary">{{ Math.min(...inlayPrices) }} – {{ Math.max(...inlayPrices) }}</span>
                        <span v-if="inlayPriceCurrency" class="text-[11px] text-base-content/45">{{ inlayPriceCurrency }}</span>
                    </template>
                    <span v-else class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</span>
                    <span class="ml-auto text-[11px] text-base-content/40">{{ $t("db-transcendence.overview.inlay_hint") }}</span>
                </div>
            </section>
        </div>
    </ScrollSpyLayout>
</template>
te>
