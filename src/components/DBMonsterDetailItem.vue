<script lang="ts" setup>
import * as echarts from "echarts"
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { useSearchParam } from "@/composables/useSearchParam"
import { abyssDungeonMap, Monster } from "@/data"
import { MaxMonsterLevelLimit } from "@/data/d/const.data"
import dungeonData from "@/data/d/dungeon.data"
import { soloTreasureDropData } from "@/data/d/solotreasure.data"
import { Faction } from "@/data/game-const"
import { LeveledMonster } from "@/data/leveled/LeveledMonster"
import { format100, formatBigNumber } from "@/util"
import { getAbyssDungeonGroup, getAbyssDungeonLevel } from "@/utils/dungeon-utils"
import { getMonsterTagGroupsByMonster } from "@/utils/monster-tag-utils"

const props = defineProps<{
    monster: Monster
    defaultLevel?: number
}>()
const { t } = useTranslation()

const currentLevel = useSearchParam("level", props.defaultLevel || 180)
const showRougeStats = useSearchParam("rouge", false)
const useEightHpMultiplier = useSearchParam("hp8", false)
const levelTrendChartRef = ref<HTMLElement | null>(null)
let levelTrendChartInstance: echarts.ECharts | null = null
const monsterHpMultiplier = computed(() => (useEightHpMultiplier.value ? 8 : 1))

const leveledMonster = computed(() => {
    if (!props.monster) return null
    return new LeveledMonster(props.monster, currentLevel.value, showRougeStats.value, monsterHpMultiplier.value)
})

const dungeons = computed(() => {
    if (!props.monster) return []
    return dungeonData.filter(d => {
        const normalMonsters = d.m || []
        const specialMonsters = d.sm || []
        return normalMonsters.includes(props.monster.id) || specialMonsters.includes(props.monster.id)
    })
})

const abyssDungeonsFiltered = computed(() => {
    if (!props.monster) return []
    return [...abyssDungeonMap.values()].filter(d => {
        const normalMonsters = d.m || []
        return normalMonsters.includes(props.monster.id)
    })
})
// 按照副本名称分组
const dungeonGroups = computed(() => {
    const groups: Record<string, typeof dungeons.value> = {}
    dungeons.value.forEach(dungeon => {
        const dn = dungeon.n.replace(/·.+/, "")
        if (!groups[dn]) {
            groups[dn] = []
        }
        groups[dn].push(dungeon)
    })

    // 对每个组内的副本按等级升序排列
    Object.keys(groups).forEach(groupName => {
        groups[groupName].sort((a, b) => a.lv - b.lv)
    })

    return groups
})

// 所有副本名称（用于tab筛选）
const allDungeonNames = computed(() => Object.keys(dungeonGroups.value).sort())

// 当前选中的副本名称
const selectedDungeonName = ref<string>(allDungeonNames.value[0] || "")

// 当前选中的副本组
const selectedDungeons = computed(() => {
    return dungeonGroups.value[selectedDungeonName.value] || []
})

const soloTreasureDropEntries = computed(() => {
    if (!props.monster) {
        return []
    }

    const tags = new Set(props.monster.tags || [])
    return Object.values(soloTreasureDropData).filter(entry => tags.has(entry.MonsterTag))
})

/**
 * 获取掉落项的展示标题。
 * @param entry 掉落项。
 * @returns 标题文本。
 */
function getSoloTreasureDropTitle(entry: (typeof soloTreasureDropEntries.value)[number]): string {
    return entry.DropMechanismId !== undefined
        ? t("monster.mechanism", { id: entry.DropMechanismId })
        : entry.KillScore !== undefined
          ? t("monster.killScore", { score: entry.KillScore })
          : t("monster.dropInfo")
}

/**
 * 校验当前选中的副本名称是否仍有效，避免切换怪物后出现悬空选项。
 */
watch(
    allDungeonNames,
    names => {
        if (names.length === 0) {
            selectedDungeonName.value = ""
            return
        }

        if (!names.includes(selectedDungeonName.value)) {
            selectedDungeonName.value = names[0]
        }
    },
    { immediate: true }
)

/**
 * 当前怪物关联的号令者信息。
 */
const monsterTagGroups = computed(() => {
    if (!props.monster) {
        return []
    }

    return getMonsterTagGroupsByMonster(props.monster)
})

/**
 * 计算怪物防御减伤率。
 */
const defenseDamageReductionRate = computed(() => {
    if (!leveledMonster.value) {
        return 0
    }

    return leveledMonster.value.def / (300 + leveledMonster.value.def)
})

/**
 * 计算高等级减伤乘区。
 * 怪物等级大于等于 200 时生效。
 */
const levelReduceRate = computed(() => {
    if (!leveledMonster.value) {
        return 1
    }

    if (currentLevel.value < 200) {
        return 1
    }

    return 1 / (1 + (currentLevel.value - 190) * 0.05)
})

/**
 * 计算等级减伤率。
 * 表格展示使用 1 - 乘区 的形式。
 */
const levelDamageReductionRate = computed(() => 1 - levelReduceRate.value)

/**
 * 计算怪物有效生命（防御先算 EHP，再额外乘等级减伤）。
 */
const effectiveHealth = computed(() => {
    if (!leveledMonster.value) {
        return 0
    }

    const defenseMultiplier = Math.max(1 - defenseDamageReductionRate.value, 0.000001)
    const levelMultiplier = Math.max(levelReduceRate.value, 0.000001)
    return (leveledMonster.value.hp / defenseMultiplier + (leveledMonster.value.es || 0)) / levelMultiplier
})

/**
 * 等级趋势图数据（生命/护盾/有效生命）。
 */
const levelTrendData = computed(() => {
    if (!props.monster) {
        return {
            levels: [] as number[],
            hp: [] as number[],
            shield: [] as number[],
            effectiveHealth: [] as number[],
            levelDamageReductionRate: [] as number[],
        }
    }

    const levels: number[] = []
    const hp: number[] = []
    const shield: number[] = []
    const effectiveHealthList: number[] = []
    const levelDamageReductionRateList: number[] = []

    for (let level = 1; level <= MaxMonsterLevelLimit; level++) {
        const leveled = new LeveledMonster(props.monster, level, showRougeStats.value, monsterHpMultiplier.value)
        const currentHP = leveled.hp
        const currentShield = leveled.es || 0
        const currentDefenseDamageReductionRate = leveled.def / (300 + leveled.def)
        const currentLevelReduceRate = level >= 200 ? 1 / (1 + (level - 190) * 0.05) : 1
        const currentDefenseMultiplier = Math.max(1 - currentDefenseDamageReductionRate, 0.000001)

        levels.push(level)
        hp.push(currentHP)
        shield.push(currentShield)
        effectiveHealthList.push(
            Math.round((currentHP / currentDefenseMultiplier + currentShield) / Math.max(currentLevelReduceRate, 0.000001))
        )
        levelDamageReductionRateList.push(1 - currentLevelReduceRate)
    }

    return {
        levels,
        hp,
        shield,
        effectiveHealth: effectiveHealthList,
        levelDamageReductionRate: levelDamageReductionRateList,
    }
})

/**
 * 等级趋势图配置。
 */
const levelTrendChartOption = computed<echarts.EChartsOption>(() => {
    return {
        tooltip: {
            trigger: "axis",
            formatter: params => {
                const paramList = Array.isArray(params) ? params : [params]
                if (paramList.length === 0) {
                    return ""
                }

                const firstValue = paramList[0]?.value
                const level =
                    Array.isArray(firstValue) && firstValue.length > 0 ? Math.round(Number(firstValue[0])) : Number(paramList[0]?.name || 0)
                const lines = [`Lv.${level}`]
                paramList.forEach(item => {
                    const rawValue = Array.isArray(item.value) ? item.value[item.value.length - 1] : item.value
                    const value = typeof rawValue === "number" ? rawValue : Number(rawValue || 0)
                    lines.push(`${item.marker}${item.seriesName}: ${formatBigNumber(value)}`)
                })
                return lines.join("<br/>")
            },
        },
        legend: {
            top: 6,
            data: [
                t("monster-detail.hp"),
                t("monster-detail.shield"),
                t("monster-detail.effectiveHealth"),
                t("monster-detail.levelDamageReductionRate"),
            ],
        },
        grid: {
            left: 16,
            right: 56,
            top: 46,
            bottom: 56,
            containLabel: true,
        },
        xAxis: {
            type: "value",
            name: t("monster-detail.level"),
            min: 1,
            max: MaxMonsterLevelLimit,
            boundaryGap: [0, 0],
            axisLabel: {
                formatter: value => `Lv.${Number(value)}`,
            },
        },
        yAxis: [
            {
                type: "value",
                name: t("monster-detail.value"),
                scale: true,
                axisLabel: {
                    formatter: value => formatBigNumber(Number(value)),
                },
            },
            {
                type: "value",
                name: t("monster-detail.levelDamageReductionRate"),
                position: "right",
                min: 0,
                max: 1,
                axisLabel: {
                    formatter: value => `${Math.round(Number(value) * 100)}%`,
                },
                splitLine: {
                    show: false,
                },
            },
        ],
        dataZoom: [
            {
                type: "inside",
                xAxisIndex: 0,
                filterMode: "filter",
                startValue: 1,
                endValue: MaxMonsterLevelLimit,
            },
            {
                type: "slider",
                xAxisIndex: 0,
                filterMode: "filter",
                startValue: 1,
                endValue: MaxMonsterLevelLimit,
                height: 16,
                bottom: 8,
                labelFormatter: value => `Lv.${Math.round(Number(value))}`,
            },
        ],
        series: [
            {
                name: t("monster-detail.hp"),
                type: "line",
                smooth: true,
                showSymbol: false,
                lineStyle: {
                    width: 2,
                    color: "#ef4444",
                },
                itemStyle: {
                    color: "#ef4444",
                },
                data: levelTrendData.value.levels.map((level, index) => [level, levelTrendData.value.hp[index]]),
            },
            {
                name: t("monster-detail.shield"),
                type: "line",
                smooth: true,
                showSymbol: false,
                lineStyle: {
                    width: 2,
                    color: "#06b6d4",
                },
                itemStyle: {
                    color: "#06b6d4",
                },
                data: levelTrendData.value.levels.map((level, index) => [level, levelTrendData.value.shield[index]]),
            },
            {
                name: t("monster-detail.effectiveHealth"),
                type: "line",
                smooth: true,
                showSymbol: false,
                lineStyle: {
                    width: 2,
                    color: "#a855f7",
                },
                itemStyle: {
                    color: "#a855f7",
                },
                data: levelTrendData.value.levels.map((level, index) => [level, levelTrendData.value.effectiveHealth[index]]),
            },
            {
                name: t("monster-detail.levelDamageReductionRate"),
                type: "line",
                yAxisIndex: 1,
                smooth: true,
                showSymbol: false,
                lineStyle: {
                    width: 2,
                    color: "#f59e0b",
                },
                itemStyle: {
                    color: "#f59e0b",
                },
                data: levelTrendData.value.levels.map((level, index) => [level, levelTrendData.value.levelDamageReductionRate[index]]),
            },
        ],
    }
})

/**
 * 重绘等级趋势图。
 */
function renderLevelTrendChart(): void {
    if (!levelTrendChartRef.value) {
        return
    }

    if (!levelTrendChartInstance) {
        levelTrendChartInstance = echarts.init(levelTrendChartRef.value)
    }

    levelTrendChartInstance.setOption(levelTrendChartOption.value, { notMerge: true })
    levelTrendChartInstance.resize()
}

/**
 * 处理等级趋势图容器尺寸变化。
 */
function handleLevelTrendChartResize(): void {
    levelTrendChartInstance?.resize()
}

watch(
    levelTrendChartOption,
    async () => {
        await nextTick()
        renderLevelTrendChart()
    },
    { immediate: true }
)

onMounted(() => {
    window.addEventListener("resize", handleLevelTrendChartResize)
})

onUnmounted(() => {
    window.removeEventListener("resize", handleLevelTrendChartResize)
    if (levelTrendChartInstance) {
        levelTrendChartInstance.dispose()
        levelTrendChartInstance = null
    }
})

function getFactionName(faction: number | undefined): string {
    if (faction === undefined) return t("monster-detail.factionOther")
    return Faction[faction] || `${t("monster-detail.factionPrefix")}${faction}`
}
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 魔物档案头：纸面直角 + 引导网格 + 斜切楔形 + primary 强调线 -->
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
            <div class="relative flex items-start gap-3.5">
                <div v-if="leveledMonster" class="size-20 shrink-0 overflow-hidden rounded-xs sm:size-24">
                    <img :src="leveledMonster.url" :alt="$t(monster.n)" class="h-full w-full object-cover object-top" />
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Monster File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/monster/${monster.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(monster.n) }}
                        </SRouterLink>
                        <CopyID :id="monster.id" />
                    </div>
                    <!-- 元信息行：阵营方章 -->
                    <div class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                        <span class="inline-flex items-center rounded-xs border border-base-content/15 px-2 py-0.5">
                            {{ $t(getFactionName(monster.f)) }}
                        </span>
                    </div>
                </div>
            </div>
        </header>

        <!-- 等级调整 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVEL" :title="$t('等级调整')">
                <template #trailing>
                    <!-- 统计口径开关（肉鸽徽记 / 八倍生命），绑定保持不变 -->
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/60">
                        <label class="flex items-center gap-1">
                            <input v-model="showRougeStats" type="checkbox" class="toggle toggle-sm toggle-primary" />
                            <span>{{ $t("monster-detail.badgeTitle") }}</span>
                        </label>
                        <label class="flex items-center gap-1">
                            <input v-model="useEightHpMultiplier" type="checkbox" class="checkbox checkbox-xs checkbox-primary" />
                            <span>{{ $t("monster-detail.showEightHp") }}</span>
                        </label>
                    </div>
                </template>
            </SectionHeader>
            <LevelSlider v-model="currentLevel" :max="MaxMonsterLevelLimit" />
        </section>

        <!-- 基础属性 -->
        <section v-if="leveledMonster" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ATTRIBUTES" :title="$t('基础属性')" />
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1.5 text-sm">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("monster-detail.attack") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ formatBigNumber(leveledMonster.atk) }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("monster-detail.defense") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ formatBigNumber(leveledMonster.def) }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("monster-detail.hp") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ formatBigNumber(leveledMonster.hp) }}
                    </span>
                </div>
                <div
                    v-if="leveledMonster.es !== undefined"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("monster-detail.shield") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ formatBigNumber(leveledMonster.es) }}
                    </span>
                </div>
                <div
                    v-if="leveledMonster.tn !== undefined"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("monster-detail.stance") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ formatBigNumber(leveledMonster.tn) }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("monster-detail.defenseDamageReductionRate") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ format100(defenseDamageReductionRate, 2) }}
                    </span>
                </div>
                <div
                    v-if="levelDamageReductionRate > 0"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("monster-detail.levelDamageReductionRate") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ format100(levelDamageReductionRate, 2) }}
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("monster-detail.effectiveHealth") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        {{ formatBigNumber(effectiveHealth) }}
                    </span>
                </div>
            </div>
        </section>

        <!-- 标签信息 -->
        <section v-if="monsterTagGroups.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="TAGS" :title="$t('monster-detail.monsterTagInfo')" />
            <div class="space-y-2">
                <div
                    v-for="monsterTagGroup in monsterTagGroups"
                    :key="monsterTagGroup.primaryTag.id"
                    class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex items-center justify-between gap-2">
                        <div class="text-sm font-medium">{{ monsterTagGroup.name }}</div>
                        <SRouterLink
                            :to="`/db/monstertag/${monsterTagGroup.primaryTag.id}`"
                            class="shrink-0 text-xs text-base-content/50 transition-colors duration-150 hover:text-primary"
                        >
                            {{ $t("monster-detail.showDetail") }}
                        </SRouterLink>
                    </div>
                    <div class="text-sm leading-relaxed whitespace-pre-line text-base-content/85">
                        {{ monsterTagGroup.primaryTag.desc }}
                    </div>
                    <div v-if="monsterTagGroup.tags.length > 1" class="flex flex-wrap gap-2">
                        <SRouterLink
                            v-for="tag in monsterTagGroup.tags"
                            :key="tag.id"
                            :to="`/db/monstertag/${tag.id}`"
                            class="rounded-xs border border-base-content/15 px-2 py-0.5 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        >
                            {{ tag.id }}
                        </SRouterLink>
                    </div>
                </div>
            </div>
        </section>

        <!-- 成长预览 -->
        <section v-if="leveledMonster" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="GROWTH" :title="$t('monster-detail.growthPreview')" />
            <div ref="levelTrendChartRef" class="h-72 w-full" />
        </section>

        <!-- 掉落信息 -->
        <section v-if="soloTreasureDropEntries.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DROP" :title="$t('monster-detail.drop')" />
            <div class="space-y-2">
                <div
                    v-for="entry in soloTreasureDropEntries"
                    :key="entry.MonsterTag"
                    class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex items-center justify-between gap-3">
                        <div class="text-sm font-medium">{{ getSoloTreasureDropTitle(entry) }}</div>
                        <CopyID :id="entry.MonsterTag" />
                    </div>
                    <div class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("monster-detail.dropMonsterTag") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                                entry.MonsterTag
                            }}</span>
                        </div>
                        <div
                            v-if="entry.DropMechanismId !== undefined"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("monster-detail.dropMechanismId") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                                entry.DropMechanismId
                            }}</span>
                        </div>
                        <div
                            v-if="entry.BoxDropRate !== undefined"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("monster-detail.dropRate") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                                entry.BoxDropRate
                            }}</span>
                        </div>
                        <div
                            v-if="entry.KillScore !== undefined"
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("monster-detail.killScore") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                                entry.KillScore
                            }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 出现副本 -->
        <section v-if="dungeons.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DUNGEONS" :title="$t('monster-detail.appearingDungeon')" />

            <!-- 副本名称Tab筛选（方章） -->
            <div class="mb-3 overflow-x-auto">
                <div class="flex gap-2 pb-2">
                    <button
                        v-for="dungeonName in allDungeonNames"
                        :key="dungeonName"
                        class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                        :class="
                            selectedDungeonName === dungeonName
                                ? 'border-primary bg-primary font-semibold text-primary-content'
                                : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                        "
                        @click="selectedDungeonName = dungeonName"
                    >
                        {{ dungeonName }}
                    </button>
                </div>
            </div>

            <!-- 副本列表 -->
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                <div
                    v-for="dungeon in selectedDungeons"
                    :key="dungeon.id"
                    class="cursor-pointer rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-150 hover:border-primary/50"
                    @click="$router.push(`/db/dungeon/${dungeon.id}`)"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span class="truncate text-sm font-medium">{{ $t(dungeon.n) }}</span>
                        <div class="flex shrink-0 flex-col items-end">
                            <span class="font-mono text-[11px] tabular-nums text-base-content/55">Lv.{{ dungeon.lv }}</span>
                            <CopyID :id="dungeon.id" />
                        </div>
                    </div>
                    <div class="mt-1 text-xs leading-relaxed text-base-content/55">
                        {{ dungeon.desc }}
                    </div>
                </div>
            </div>
        </section>

        <!-- 出现深渊 -->
        <section
            v-if="abyssDungeonsFiltered.length > 0"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="ABYSS" :title="$t('monster-detail.appearingAbyss')" />

            <!-- 深渊列表 -->
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                <div
                    v-for="dungeon in abyssDungeonsFiltered"
                    :key="dungeon.id"
                    class="cursor-pointer rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-150 hover:border-primary/50"
                    @click="$router.push(`/db/abyss/${dungeon.id}`)"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span class="truncate text-sm font-medium">
                            {{ dungeon.cname }} {{ $t(getAbyssDungeonGroup(dungeon)) }} #{{ getAbyssDungeonLevel(dungeon) }}
                        </span>
                        <div class="flex shrink-0 flex-col items-end">
                            <CopyID :id="dungeon.id" />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>
