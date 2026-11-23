<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useGameText } from "@/composables/useGameText"
import { parseNumberOrEmptySearchParam, useSearchParam } from "@/composables/useSearchParam"
import { Faction, LeveledMonster } from "@/data"
import { charMap, dungeonMap, monsterMap } from "@/data/d"
import { tiers as seasonTiers } from "@/data/d/dnaseason.data"
import {
    challenges,
    floors,
    globals,
    monsterScores,
    rankConfigs,
    rankRewards,
    rankRoles,
    seasons as riftSeasons,
} from "@/data/d/dnaseasonrift.data"
import { getMonsterListRarity } from "@/utils/monster-utils"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { getRewardDetails } from "@/utils/reward-utils"
import { formatTimeRange } from "@/utils/time"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import { SEASON_TIER_NAME_KEYS } from "@/utils/transcendence-journey"
import type { RiftFloorRow } from "@/utils/transcendence-rift"
import {
    buildRiftFloorRow,
    formatRankRange,
    formatRiftDuration,
    getElitePoolGroups,
    getRankTypeLabelKey,
    getRiftGlobalLabelKey,
    getRiftTypeLabelKey,
    RIFT_SEASON_LABEL_KEY,
    resolveRiftRole,
} from "@/utils/transcendence-rift"

/** 楼层格固定主轴尺寸（px），两列网格单格取紧凑按钮高度 */
const FLOOR_ITEM_HEIGHT = 52
/** 副本集合缺失时的兜底副本 id（实况 500 层均为 [24001, 24002]） */
const FALLBACK_RIFT_DUNGEON_ID = 24001

const { t, i18next } = useTranslation()
const { gt } = useGameText()

const route = useRoute()

/**
 * 数字型 query 参数是否为非数字脏值（如 `id=abc`）。
 * `useSearchParam` 对非数字会静默回落默认值，只能回看原始 query 才能清掉脏参数。
 * @param key query 参数名
 * @returns 是否是需要清理的脏值
 */
function hasDirtyNumericParam(key: string): boolean {
    const raw = route.query[key]
    const value = Array.isArray(raw) ? raw[0] : raw

    return value !== undefined && value !== null && value !== "" && !Number.isFinite(Number(value))
}

const selectedFloorId = useSearchParam<number>("id", 0)
const floorType = useSearchParam<number>("ft", 1)

/** 子视图由独立路由决定：/rift、/rift/elite、/rift/rules；按 route.name 判别，尾斜杠等 path 变体不受影响 */
const subView = computed<"floors" | "elites" | "rules">(() => {
    if (route.name === "transcendence-rift-elite") {
        return "elites"
    }

    if (route.name === "transcendence-rift-rules") {
        return "rules"
    }

    return "floors"
})

const eliteKeyword = useSearchParam<string>("kw", "")
const eliteFactionFilter = useSearchParam<number | "">("efac", "", { parse: parseNumberOrEmptySearchParam })
const selectedEliteMonsterId = useSearchParam<number>("mid", 0)

/** 全部 500 层的预计算行：join 只做一次，行内不再查表 */
const floorRowMap = computed(() => new Map(floors.map(floor => [floor.id, buildRiftFloorRow(floor)])))

const activeRiftType = computed(() => (floorType.value === 2 ? 2 : 1))

const floorRows = computed<RiftFloorRow[]>(() =>
    floors.filter(floor => floor.floorType === activeRiftType.value).map(floor => floorRowMap.value.get(floor.id) as RiftFloorRow)
)

const floorTypeOptions = computed(() =>
    [1, 2].map(type => ({
        type,
        labelKey: getRiftTypeLabelKey(type),
        count: floors.filter(floor => floor.floorType === type).length,
    }))
)

const selectedFloor = computed(() => (selectedFloorId.value ? (floorRowMap.value.get(selectedFloorId.value) ?? null) : null))

const selectedFloorIndex = computed(() => {
    if (!selectedFloor.value) {
        return null
    }

    const index = floorRows.value.findIndex(row => row.id === selectedFloor.value?.id)

    return index === -1 ? null : index
})

/** 楼层自带的副本集合；实况 500 层均为 [24001, 24002]，缺失时回退全量楼层并集 */
const seasonRiftDungeonIds = [...new Set(floors.flatMap(floor => floor.dungeonIds ?? []))]

const riftDungeonOptions = computed(() => {
    const rows = selectedFloor.value?.dungeons ?? []

    if (rows.length) {
        return rows.map(row => ({ id: row.id, name: row.name ?? "" }))
    }

    return seasonRiftDungeonIds.map(id => ({ id, name: dungeonMap.get(id)?.n ?? "" }))
})

const riftDungeonId = ref(seasonRiftDungeonIds[0] ?? FALLBACK_RIFT_DUNGEON_ID)

/** 当前选中的副本 id：候选集合变化（切层）后旧选择不在集合内时回落到第一个 */
const selectedRiftDungeonId = computed(() =>
    riftDungeonOptions.value.some(option => option.id === riftDungeonId.value)
        ? riftDungeonId.value
        : (riftDungeonOptions.value[0]?.id ?? FALLBACK_RIFT_DUNGEON_ID)
)

const selectedDungeon = computed(() => dungeonMap.get(selectedRiftDungeonId.value) ?? null)

/**
 * 切换螺旋副本：24001/24002 本地数据同构且无 floorType 对应证据，由用户显式选择。
 * @param id 目标副本 id
 */
function switchRiftDungeon(id: number): void {
    riftDungeonId.value = id
}

/** 解锁档位 id → 难度名键（16 档与 16 难度阶按 id 对齐） */
const seasonTierMap = new Map(seasonTiers.map(tier => [tier.id, tier]))

/** 楼层解锁档位：只保留能对上难度名的档位（§90 不显示档位 ID） */
const selectedFloorTiers = computed(() =>
    (selectedFloor.value?.tierIds ?? []).flatMap(tierId => {
        const tier = seasonTierMap.get(tierId)
        const nameKey = tier ? (SEASON_TIER_NAME_KEYS[tier.tierLevel] ?? "") : ""

        return nameKey ? [{ id: tierId, nameKey, nameTier: tier?.nameTier ?? "" }] : []
    })
)

/** 非法楼层 id 或指向另一分栏的 id：归一 ft，并切回层表 */
watch(
    selectedFloorId,
    id => {
        if (!id) {
            if (hasDirtyNumericParam("id")) {
                selectedFloorId.value = 0
            }

            return
        }

        const floor = floorRowMap.value.get(id)

        if (!floor) {
            selectedFloorId.value = 0
            return
        }

        floorType.value = floor.floorType
    },
    { immediate: true }
)

watch(
    floorType,
    value => {
        if (value !== 1 && value !== 2) {
            floorType.value = 1
            return
        }

        // 非数字脏值（ft=abc）会静默回落 1：按已选楼层分栏或 1 写回，顺带清掉脏参数
        if (hasDirtyNumericParam("ft")) {
            floorType.value = selectedFloor.value?.floorType ?? 1
        }
    },
    { immediate: true }
)

/**
 * 切换楼层分栏：选中 id 属于另一分栏，必须清空。
 * @param type 目标分栏
 */
function switchRiftType(type: number): void {
    if (floorType.value === type) {
        return
    }

    floorType.value = type
    selectedFloorId.value = 0
}

/** 精英池怪物行：按 UnitId 去重（同一只怪可能出现在多个刷怪组），附带来源刷怪组 id */
const eliteRows = computed(() => {
    const groupsByUnit = new Map<number, Set<number>>()

    for (const group of getElitePoolGroups()) {
        for (const unitId of group.unitIds) {
            const spawnIds = groupsByUnit.get(unitId)

            if (spawnIds) {
                spawnIds.add(group.spawnId)
            } else {
                groupsByUnit.set(unitId, new Set([group.spawnId]))
            }
        }
    }

    return [...groupsByUnit.entries()].flatMap(([unitId, spawnIds]) => {
        const monster = monsterMap.get(unitId)

        return monster ? [{ monster, spawnIds: [...spawnIds] }] : []
    })
})

/** 精英池出现的阵营（按数值升序） */
const eliteFactions = computed(() =>
    [...new Set(eliteRows.value.flatMap(row => (row.monster.f === undefined ? [] : [row.monster.f])))].sort((left, right) => left - right)
)

/**
 * 阵营 ID → 展示名（未知归入「其他」）。
 * @param faction 阵营 ID
 * @returns 阵营名原文（调用方再过 gt）
 */
function getFactionName(faction: number | undefined): string {
    if (faction === undefined) {
        return "其他"
    }

    return Faction[faction] || `阵营${faction}`
}

/**
 * 关键词命中程度，数值越小越靠前。
 * @param monsterId 怪物 ID
 * @param keyword 已去除首尾空白的关键词
 * @returns 0=ID 完全相等，1=ID 前缀命中，2=其余命中
 */
function monsterKeywordRank(monsterId: number, keyword: string): number {
    const id = String(monsterId)

    if (id === keyword) {
        return 0
    }

    return id.startsWith(keyword) ? 1 : 2
}

const filteredEliteRows = computed(() => {
    const keyword = eliteKeyword.value.trim()
    const lowerKeyword = keyword.toLowerCase()

    const matched = eliteRows.value.filter(row => {
        if (eliteFactionFilter.value !== "" && row.monster.f !== eliteFactionFilter.value) {
            return false
        }

        if (!keyword) {
            return true
        }

        return (
            `${row.monster.id}`.includes(keyword) ||
            row.monster.n.includes(keyword) ||
            gt(row.monster.n).toLowerCase().includes(lowerKeyword) ||
            row.spawnIds.some(spawnId => `${spawnId}`.includes(keyword)) ||
            matchPinyin(row.monster.n, keyword).match
        )
    })

    return keyword === ""
        ? matched
        : matched.slice().sort((left, right) => monsterKeywordRank(left.monster.id, keyword) - monsterKeywordRank(right.monster.id, keyword))
})

const selectedEliteMonster = computed(() => {
    if (!selectedEliteMonsterId.value) {
        return null
    }

    return eliteRows.value.find(row => row.monster.id === selectedEliteMonsterId.value)?.monster ?? null
})

/** 非精英池内的 mid（手改 URL / 前进后退）直接清掉，避免右栏空白但 URL 仍带选中 */
watch(
    selectedEliteMonsterId,
    id => {
        if (!id) {
            if (hasDirtyNumericParam("mid")) {
                selectedEliteMonsterId.value = 0
            }

            return
        }

        if (!eliteRows.value.some(row => row.monster.id === id)) {
            selectedEliteMonsterId.value = 0
        }
    },
    { immediate: true }
)

/** 挑战：detailTitle 的 %s 用 param1 代入；掉落率由基点转百分比 */
const challengeRows = computed(() =>
    challenges.map(challenge => ({
        ...challenge,
        titleText: cleanGameMarkup(gt(challenge.title)),
        detailTitleText: cleanGameMarkup(gt(challenge.detailTitle)).replace("%s", String(challenge.param1)),
        detailDescText: cleanGameMarkup(gt(challenge.detailDesc)),
        rates: challenge.dropBonus.map(bonus => bonus.rate / 100),
    }))
)

const challengeRowMap = computed(() => new Map(challengeRows.value.map(row => [row.id, row])))

/** 楼层挑战：文案与掉率已在规则行里清洗，组件只负责排版（缺失 id 由组件降级显示） */
const selectedFloorChallenges = computed(() =>
    (selectedFloor.value?.challengeIds ?? []).map(id => {
        const row = challengeRowMap.value.get(id)

        return {
            id,
            title: row?.titleText ?? "",
            detailTitle: row?.detailTitleText ?? "",
            detailDesc: row?.detailDescText ?? "",
            rates: row?.rates ?? [],
        }
    })
)

/** 全局参数：字段名 → 文案键由 utils 统一维护，未映射的字段不展示 */
const globalRows = computed(() =>
    Object.entries(globals)
        .map(([key, value]) => ({ key, labelKey: getRiftGlobalLabelKey(key), value }))
        .filter(row => row.labelKey)
)

/** 排行：按子赛季分组，名次行保留类型与名次区间，角色排行行内嵌该组角色 */
const seasonGroups = computed(() =>
    riftSeasons.map(season => {
        const roleGroups = new Map(
            rankRoles
                .filter(role => role.subSeasonId === season.id)
                .map(role => [role.group, role])
        )

        return {
            id: season.id,
            subSeasonNum: season.subSeasonNum,
            timeRange: formatTimeRange(season.startTime, season.endTime, t("database.until_now"), i18next.language),
            rewards: rankRewards
                .filter(reward => reward.subSeasonId === season.id)
                .map(reward => {
                    const role = reward.rankType === 2 && reward.rankSubType !== undefined ? roleGroups.get(reward.rankSubType) : undefined

                    return {
                        id: reward.id,
                        typeKey: getRankTypeLabelKey(reward.rankType),
                        subType: reward.rankSubType,
                        range: formatRankRange(reward.rankRange),
                        rewardMailId: reward.rewardMailId,
                        // 主角占位角色与本体重复，按归并后的角色 id 去重，只保留一个
                        members: [...new Set((role?.roleIds ?? []).map(roleId => resolveRiftRole(roleId).id))].map(resolvedId => {
                            const char = charMap.get(resolvedId)

                            return {
                                resolvedId,
                                resolved: Boolean(char),
                                name: gt(char?.名称) || t("db-transcendence.unknown_entity", { id: resolvedId }),
                            }
                        }),
                    }
                }),
        }
    })
)

/** 名次奖励的邮件/附件：各档位奖励相同，按邮件与奖励组去重后只展示一份 */
const rankRewardMails = computed(() => {
    const seen = new Set<string>()
    const rows: {
        rewardMailId: number
        rewardId?: number
        mail?: (typeof rankRewards)[number]["mail"]
        rewardDetail: ReturnType<typeof getRewardDetails>
    }[] = []

    for (const reward of rankRewards) {
        const key = `${reward.rewardMailId}:${reward.rewardId ?? ""}`
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        rows.push({
            rewardMailId: reward.rewardMailId,
            rewardId: reward.rewardId,
            mail: reward.mail,
            rewardDetail: reward.rewardId ? getRewardDetails(reward.rewardId) : null,
        })
    }

    return rows
})

/** 排行配置是赛季无关的全局表（10 条：单人 / 角色 / 团队） */
const rankConfigRows = computed(() =>
    rankConfigs.map(config => ({
        id: config.id,
        typeKey: getRankTypeLabelKey(config.rankType),
        subType: config.rankSubType,
        capacity: config.capacity,
        viewCapacity: config.viewCapacity,
    }))
)

/** 规则子页实际渲染的区块数：排行 / 排行配置 / 挑战 / 计分 / 全局参数 */
const ruleBlockCount = computed(
    () =>
        [riftSeasons.length, rankConfigRows.value.length, challengeRows.value.length, monsterScores.length, globalRows.value.length].filter(
            count => count > 0
        ).length
)

const subViews = computed(() => [
    { key: "floors" as const, path: "/db/transcendence/rift", labelKey: "db-transcendence.rift.view_floors", count: floors.length },
    { key: "elites" as const, path: "/db/transcendence/rift/elite", labelKey: "db-transcendence.rift.view_elites", count: eliteRows.value.length },
    { key: "rules" as const, path: "/db/transcendence/rift/rules", labelKey: "db-transcendence.rift.view_rules", count: ruleBlockCount.value },
])

/** 切换子视图时保留筛选/选中参数 */
function subViewTarget(path: string) {
    return { path, query: route.query, hash: route.hash }
}

/** 筛选后覆盖的刷怪组数（精英池底部统计补充） */
const filteredEliteGroupCount = computed(() => new Set(filteredEliteRows.value.flatMap(row => row.spawnIds)).size)
</script>

<template>
    <div class="h-full flex flex-col">
        <!-- DB 标准页头：子页 / 迷境类型 chip 选择器 -->
        <div class="flex-none space-y-2 border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <SRouterLink
                    v-for="item in subViews"
                    :key="item.key"
                    :to="subViewTarget(item.path)"
                    class="btn btn-xs whitespace-nowrap"
                    :class="subView === item.key ? 'btn-primary' : ''"
                    :aria-current="subView === item.key ? 'page' : undefined"
                >
                    {{ $t(item.labelKey) }}
                    <span class="font-mono text-[10px] opacity-70">{{ item.count }}</span>
                </SRouterLink>
            </div>
            <div v-if="subView === 'floors'" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span class="mr-1 shrink-0 text-[11px] tracking-wide text-base-content/55" :title="$t('db-transcendence.rift.type_hint')">{{ $t("db-transcendence.rift.filter_type") }}</span>
                <button
                    v-for="option in floorTypeOptions"
                    :key="option.type"
                    type="button"
                    class="btn btn-xs whitespace-nowrap"
                    :class="activeRiftType === option.type ? 'btn-primary' : ''"
                    :title="$t('db-transcendence.rift.type_hint')"
                    @click="switchRiftType(option.type)"
                >
                    {{ $t(option.labelKey) }}
                    <span class="font-mono text-[10px] opacity-70">{{ option.count }}</span>
                </button>
            </div>
        </div>

        <SplitView v-if="subView === 'floors'" :desktop-ratio="1 / 3" :detail-open="Boolean(selectedFloor)" @collapse="selectedFloorId = 0">
            <template #master>
                <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedFloor }">
                    <div v-if="!floorRows.length" class="flex flex-1 items-center justify-center p-6 text-[12px] text-base-content/45">
                        {{ $t("common.no_data") }}
                    </div>
                    <!-- 双列楼层选择：对齐 DBRaidRank 跳层楼层列表的紧凑按钮 -->
                    <VirtualList
                        v-else
                        class="flex-1"
                        :items="floorRows"
                        :columns="2"
                        :gap="6"
                        :item-height="FLOOR_ITEM_HEIGHT"
                        :item-key="row => row.id"
                        :active-index="selectedFloorIndex"
                        v-slot="{ item: row, index, animate, rowHeight }"
                    >
                        <button
                            type="button"
                            data-row-title
                            class="relative flex cursor-pointer flex-col items-start rounded-xs border px-2 py-1.5 text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.97]"
                            :class="[
                                selectedFloorId === row.id
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 bg-base-100/60 text-base-content/70 hover:border-primary/60',
                                animate ? 'animate-ef-rise motion-reduce:animate-none' : '',
                            ]"
                            :style="{ minHeight: `${rowHeight}px`, animationDelay: `${Math.min(index * 30, 300)}ms` }"
                            @click="selectedFloorId = row.id"
                        >
                            <span class="font-orbitron text-sm leading-tight font-bold">{{ $t("db-transcendence.rift.floor_title", { n: row.floor }) }}</span>
                            <span class="mt-0.5 block text-[10px] tabular-nums opacity-70">Lv.{{ row.monsterLevel }} · {{ formatRiftDuration(row.completeTime) }}</span>
                        </button>
                    </VirtualList>

                    <div class="flex flex-none items-center justify-between gap-2 border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ floorRows.length }}</b>
                            {{ $t("db-transcendence.rift.floor_count") }}
                        </p>
                        <p v-if="!selectedFloor" class="text-[11px] text-base-content/40">{{ $t("db-transcendence.rift.select_hint") }}</p>
                    </div>
                </div>
            </template>
            <template #detail>
                <ScrollArea v-if="selectedFloor && selectedDungeon" class="min-h-0 min-w-0 flex-1">
                    <DBDungeonDetailItem
                        :dungeon="selectedDungeon"
                        :rift-floor="selectedFloor"
                        :rift-challenges="selectedFloorChallenges"
                        :rift-tiers="selectedFloorTiers"
                        :rift-dungeon-options="riftDungeonOptions"
                        @select-rift-dungeon="switchRiftDungeon"
                    />
                </ScrollArea>
                <div v-else class="flex flex-1 items-center justify-center p-6 text-sm text-base-content/60">
                    {{ $t("common.no_data") }}
                </div>
            </template>
        </SplitView>

        <SplitView
            v-else-if="subView === 'elites'"
            :desktop-ratio="1 / 2"
            :detail-open="Boolean(selectedEliteMonster)"
            @collapse="selectedEliteMonsterId = 0"
        >
            <template #master>
                <div
                    class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0"
                    :class="{ 'sm:border-r border-base-content/10': selectedEliteMonster }"
                >
                    <!-- 检索带：下划线搜索 + 计数 + 阵营方章 -->
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="eliteKeyword"
                            :placeholder="$t('db-transcendence.rift.search_elite')"
                            :count="filteredEliteRows.length"
                        />
                        <div class="mt-1.5 flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                class="btn btn-xs whitespace-nowrap"
                                :class="eliteFactionFilter === '' ? 'btn-primary' : ''"
                                @click="eliteFactionFilter = ''"
                            >
                                {{ $t("common.all") }}
                            </button>
                            <button
                                v-for="faction in eliteFactions"
                                :key="faction"
                                type="button"
                                class="btn btn-xs whitespace-nowrap"
                                :class="eliteFactionFilter === faction ? 'btn-primary' : ''"
                                @click="eliteFactionFilter = faction"
                            >
                                {{ gt(getFactionName(faction)) }}
                            </button>
                        </div>
                    </div>

                    <ScrollArea class="flex-1">
                        <div class="p-3 grid gap-2 grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
                            <article
                                v-for="(row, index) in filteredEliteRows"
                                :key="row.monster.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="selectedEliteMonsterId === row.monster.id ? 'dbrl-elite-active border-primary/70 bg-primary/10' : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'"
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectedEliteMonsterId = row.monster.id"
                            >
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedEliteMonsterId === row.monster.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex flex-col items-center gap-2 p-3 text-center">
                                    <ImageFallback
                                        :src="LeveledMonster.url(row.monster.icon)"
                                        :alt="row.monster.n"
                                        class="size-14 shrink-0 overflow-hidden rounded-xs bg-linear-15"
                                        :class="getRarityGradientClass(getMonsterListRarity(row.monster.t))"
                                    >
                                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="row.monster.n" class="size-14 shrink-0" />
                                    </ImageFallback>
                                    <div class="min-w-0 w-full">
                                        <div
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedEliteMonsterId === row.monster.id }"
                                        >
                                            {{ gt(row.monster.n) }}
                                        </div>
                                        <div class="mt-1 truncate text-[11px] text-base-content/55">
                                            {{ gt(getFactionName(row.monster.f)) }}
                                        </div>
                                    </div>
                                    <CopyID :id="row.monster.id" />
                                </div>
                            </article>
                        </div>
                    </ScrollArea>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-center text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary">{{ filteredEliteRows.length }}</b>
                            {{ $t("db-transcendence.rift.elite_monster_unit") }}
                            <span class="text-base-content/35">· {{ $t("common.count_groups", { count: filteredEliteGroupCount }) }}</span>
                        </p>
                    </div>
                </div>
            </template>
            <template #detail>
                <ScrollArea v-if="selectedEliteMonster" class="min-h-0 min-w-0 flex-1">
                    <DBMonsterDetailItem :key="selectedEliteMonster.id" :monster="selectedEliteMonster" />
                </ScrollArea>
                <div v-else class="flex flex-1 items-center justify-center p-6 text-sm text-base-content/60">
                    {{ $t("common.no_data") }}
                </div>
            </template>
        </SplitView>

        <ScrollArea v-else class="flex-1">
            <div class="space-y-3 p-3 sm:p-4 stagger-rise">
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="RANK" :title="$t('db-transcendence.rift.rank')" :count="riftSeasons.length" />
                    <div v-if="rankRewardMails.length" class="mb-2 space-y-1.5">
                        <div
                            v-for="mail in rankRewardMails"
                            :key="`${mail.rewardMailId}-${mail.rewardId ?? 0}`"
                            class="rounded-xs border border-base-content/10 bg-base-100/40 px-2.5 py-2"
                        >
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-[11px] font-medium text-base-content/75">{{ $t("db-transcendence.rift.rank_reward") }}</span>
                                <span class="text-[10px] text-base-content/40">{{ $t("db-transcendence.rift.reward_mail") }}</span>
                                <CopyID :id="mail.rewardMailId" />
                                <CopyID v-if="mail.rewardId !== undefined" :id="mail.rewardId" class="ml-auto" />
                            </div>
                            <div v-if="mail.mail" class="mt-1 space-y-0.5">
                                <p class="text-[11px] font-medium text-base-content/75">{{ gt(mail.mail.title) }}</p>
                                <p class="text-[10px] leading-relaxed text-base-content/45">{{ gt(mail.mail.content) }}</p>
                                <p class="text-[10px] tabular-nums text-base-content/35">
                                    {{ t("db-transcendence.rift.mail_valid_days", { days: mail.mail.timeLimitDays }) }}
                                </p>
                            </div>
                            <RewardItem v-if="mail.rewardDetail" :reward="mail.rewardDetail" header class="mt-1.5" />
                            <RewardItem v-else-if="mail.rewardId" :reward="null" :reward-id="mail.rewardId" class="mt-1.5" />
                        </div>
                    </div>
                    <p v-if="!seasonGroups.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                    <div v-else class="space-y-2">
                        <div v-for="season in seasonGroups" :key="season.id" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-[12px] font-semibold text-base-content/80">{{ $t(RIFT_SEASON_LABEL_KEY, { n: season.subSeasonNum }) }}</span>
                                <CopyID :id="season.id" />
                                <span class="ml-auto font-orbitron text-[11px] tabular-nums text-base-content/45">{{ season.timeRange }}</span>
                            </div>
                            <div class="mt-2 space-y-1">
                                <div v-for="reward in season.rewards" :key="reward.id" class="rounded-xs border border-base-content/10 bg-base-100/40 px-2 py-1.5">
                                    <div class="flex flex-wrap items-center gap-2">
                                        <span class="rounded-xs border border-primary/40 px-1.5 text-[10px] leading-4 text-primary">{{ $t(reward.typeKey) }}</span>
                                        <CopyID v-if="reward.subType !== undefined" :id="reward.subType" />
                                        <span class="text-[11px] text-base-content/60">{{ $t("db-transcendence.rift.rank_range", { range: reward.range }) }}</span>
                                        <span class="ml-auto text-[10px] text-base-content/40">{{ $t("db-transcendence.rift.reward_mail") }}</span>
                                        <CopyID :id="reward.rewardMailId" />
                                    </div>
                                    <div v-if="reward.members.length" class="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-base-content/10 pt-1.5">
                                        <span v-for="member in reward.members" :key="member.resolvedId" class="inline-flex items-center">
                                            <ResourceCostItem v-if="member.resolved" :value="[0, member.resolvedId, 'Char']" mini />
                                            <span v-else class="max-w-28 truncate text-[11px] text-base-content/70">{{ member.name }}</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="RANK CONFIG" :title="$t('db-transcendence.rift.rank_configs')" :count="rankConfigRows.length" />
                    <p v-if="!rankConfigRows.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                    <div v-else class="space-y-1">
                        <div v-for="config in rankConfigRows" :key="config.id" class="flex flex-wrap items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5">
                            <CopyID :id="config.id" />
                            <span class="text-[11px] text-base-content/70">{{ $t(config.typeKey) }}</span>
                            <CopyID v-if="config.subType !== undefined" :id="config.subType" />
                            <span class="ml-auto text-[11px] text-base-content/50">{{ $t("db-transcendence.rift.rank_capacity") }}</span>
                            <span class="font-orbitron text-[12px] font-semibold tabular-nums text-primary">{{ config.capacity }} / {{ config.viewCapacity }}</span>
                        </div>
                    </div>
                </section>

                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="CHALLENGE" :title="$t('db-transcendence.rift.challenges')" :count="challengeRows.length" />
                    <p v-if="!challengeRows.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                    <div v-else class="grid gap-2 lg:grid-cols-2">
                        <div v-for="challenge in challengeRows" :key="challenge.id" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-[12px] font-semibold text-base-content/80">{{ challenge.titleText }}</span>
                                <CopyID :id="challenge.id" />
                            </div>
                            <p class="mt-1 text-[11px] text-base-content/60">{{ challenge.detailTitleText }}</p>
                            <p class="mt-1 text-[11px] text-base-content/45">{{ challenge.detailDescText }}</p>
                            <p class="mt-1 text-[11px] text-primary">{{ challenge.rates.map(rate => $t("db-transcendence.rift.drop_rate", { rate })).join(" · ") }}</p>
                        </div>
                    </div>
                </section>

                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="SCORE" :title="$t('db-transcendence.rift.monster_scores')" :count="monsterScores.length" />
                    <p v-if="!monsterScores.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                    <div v-else class="grid gap-2 lg:grid-cols-2">
                        <div v-for="score in monsterScores" :key="score.id" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <div class="flex flex-wrap items-center gap-2">
                                <CopyID :id="score.id" />
                                <span class="text-[10px] text-base-content/40">{{ $t("db-transcendence.rift.kill_score") }}</span>
                                <span class="text-[11px]" :class="score.enableKillScore ? 'text-primary' : 'text-base-content/40'">{{ score.enableKillScore ? $t("db-transcendence.rift.kill_score_on") : $t("db-transcendence.rift.kill_score_off") }}</span>
                            </div>
                            <div class="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-100/40 px-2 py-1">
                                    <span class="text-[10px] text-base-content/45">{{ $t("db-transcendence.rift.score_normal") }}</span>
                                    <span class="font-orbitron text-[11px] tabular-nums text-primary">{{ score.normal }}</span>
                                </div>
                                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-100/40 px-2 py-1">
                                    <span class="text-[10px] text-base-content/45">{{ $t("db-transcendence.rift.score_elite") }}</span>
                                    <span class="font-orbitron text-[11px] tabular-nums text-primary">{{ score.elite }}</span>
                                </div>
                                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-100/40 px-2 py-1">
                                    <span class="text-[10px] text-base-content/45">{{ $t("db-transcendence.rift.score_strong") }}</span>
                                    <span class="font-orbitron text-[11px] tabular-nums text-primary">{{ score.strong }}</span>
                                </div>
                                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-100/40 px-2 py-1">
                                    <span class="text-[10px] text-base-content/45">{{ $t("db-transcendence.rift.score_advanced") }}</span>
                                    <span class="font-orbitron text-[11px] tabular-nums text-primary">{{ score.advanced }}</span>
                                </div>
                                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-100/40 px-2 py-1">
                                    <span class="text-[10px] text-base-content/45">{{ $t("db-transcendence.rift.score_segment") }}</span>
                                    <span class="font-orbitron text-[11px] tabular-nums text-primary">{{ score.segmentScoreThreshold }}</span>
                                </div>
                                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-100/40 px-2 py-1">
                                    <span class="text-[10px] text-base-content/45">{{ $t("db-transcendence.rift.score_total") }}</span>
                                    <span class="font-orbitron text-[11px] tabular-nums text-primary">{{ score.totalScoreThreshold }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="GLOBALS" :title="$t('db-transcendence.rift.globals')" :count="globalRows.length" />
                    <p v-if="!globalRows.length" class="text-[11px] text-base-content/35">{{ $t("common.no_data") }}</p>
                    <div v-else class="grid gap-1.5 sm:grid-cols-2">
                        <div v-for="row in globalRows" :key="row.key" class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                            <span class="text-[11px] text-base-content/55">{{ $t(row.labelKey) }}</span>
                            <span class="font-orbitron text-[12px] font-semibold tabular-nums text-primary">{{ row.value }}</span>
                        </div>
                    </div>
                </section>
            </div>
        </ScrollArea>
    </div>
</template>
