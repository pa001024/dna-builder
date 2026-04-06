<script lang="ts" setup>
import * as echarts from "echarts"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { format100, formatBigNumber } from "@/util"
import { abyssDungeonMap, Faction, Monster } from "../data"
import dungeonData from "../data/d/dungeon.data"
import { LeveledMonster } from "../data/leveled/LeveledMonster"
import { getAbyssDungeonGroup, getAbyssDungeonLevel } from "../utils/dungeon-utils"
import { getMonsterTagGroupsByMonster } from "../utils/monster-tag-utils"

const props = defineProps<{
    monster: Monster
    defaultLevel?: number
}>()

const MAX_MONSTER_LEVEL = 240
const currentLevel = ref(props.defaultLevel || 180)
const showRougeStats = ref(false)
const levelTrendChartRef = ref<HTMLElement | null>(null)
let levelTrendChartInstance: echarts.ECharts | null = null

const leveledMonster = computed(() => {
    if (!props.monster) return null
    return new LeveledMonster(props.monster, currentLevel.value, showRougeStats.value)
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
 * 计算怪物有效生命（生命受防御减伤增益后叠加护盾）。
 */
const effectiveHealth = computed(() => {
    if (!leveledMonster.value) {
        return 0
    }

    const defenseMultiplier = 1 - defenseDamageReductionRate.value
    if (defenseMultiplier <= 0) {
        return leveledMonster.value.hp + (leveledMonster.value.es || 0)
    }

    return leveledMonster.value.hp / defenseMultiplier + (leveledMonster.value.es || 0)
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
        }
    }

    const levels: number[] = []
    const hp: number[] = []
    const shield: number[] = []
    const effectiveHealthList: number[] = []

    for (let level = 1; level <= MAX_MONSTER_LEVEL; level++) {
        const leveled = new LeveledMonster(props.monster, level, showRougeStats.value)
        const currentHP = leveled.hp
        const currentShield = leveled.es || 0
        const currentDefenseDamageReductionRate = leveled.def / (300 + leveled.def)
        const defenseMultiplier = Math.max(1 - currentDefenseDamageReductionRate, 0.000001)

        levels.push(level)
        hp.push(currentHP)
        shield.push(currentShield)
        effectiveHealthList.push(Math.round(currentHP / defenseMultiplier + currentShield))
    }

    return {
        levels,
        hp,
        shield,
        effectiveHealth: effectiveHealthList,
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
            data: ["生命", "护盾", "有效生命"],
        },
        grid: {
            left: 16,
            right: 16,
            top: 46,
            bottom: 56,
            containLabel: true,
        },
        xAxis: {
            type: "value",
            name: "等级",
            min: 1,
            max: MAX_MONSTER_LEVEL,
            boundaryGap: [0, 0],
            axisLabel: {
                formatter: value => `Lv.${Number(value)}`,
            },
        },
        yAxis: {
            type: "value",
            name: "数值",
            scale: true,
            axisLabel: {
                formatter: value => formatBigNumber(Number(value)),
            },
        },
        dataZoom: [
            {
                type: "inside",
                xAxisIndex: 0,
                filterMode: "filter",
                startValue: 1,
                endValue: MAX_MONSTER_LEVEL,
            },
            {
                type: "slider",
                xAxisIndex: 0,
                filterMode: "filter",
                startValue: 1,
                endValue: MAX_MONSTER_LEVEL,
                height: 16,
                bottom: 8,
                labelFormatter: value => `Lv.${Math.round(Number(value))}`,
            },
        ],
        series: [
            {
                name: "生命",
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
                name: "护盾",
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
                name: "有效生命",
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
    if (faction === undefined) return "其他"
    return Faction[faction] || `阵营${faction}`
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-3">
            <SRouterLink :to="`/db/monster/${monster.id}`" class="text-lg font-bold link link-primary">
                {{ $t(monster.n) }}
            </SRouterLink>
            <CopyID :id="monster.id" />
            <div class="text-sm text-base-content/70 flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded bg-base-200 text-xs">
                    {{ $t(getFactionName(monster.f)) }}
                </span>
            </div>
            <label class="ml-auto flex items-center gap-1 text-xs">
                <input v-model="showRougeStats" type="checkbox" class="toggle toggle-sm toggle-primary" />
                <span>迷津</span>
            </label>
        </div>

        <div v-if="leveledMonster" class="flex justify-center items-center">
            <img :src="leveledMonster.url" class="w-24 object-cover rounded" />
        </div>

        <div class="flex items-center gap-4">
            <span class="text-sm min-w-20">Lv. <input v-model.number="currentLevel" type="text" class="w-12 text-center" /> </span>
            <input
                v-model.number="currentLevel"
                type="range"
                class="range range-primary range-xs grow"
                :min="1"
                :max="MAX_MONSTER_LEVEL"
                step="1"
            />
        </div>

        <div v-if="leveledMonster" class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
            <div class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">攻击</div>
                <div class="font-bold text-primary">
                    {{ formatBigNumber(leveledMonster.atk) }}
                </div>
            </div>
            <div class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">防御</div>
                <div class="font-bold text-success">
                    {{ formatBigNumber(leveledMonster.def) }}
                </div>
            </div>
            <div class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">生命</div>
                <div class="font-bold text-error">
                    {{ formatBigNumber(leveledMonster.hp) }}
                </div>
            </div>
            <div v-if="leveledMonster.es !== undefined" class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">护盾</div>
                <div class="font-bold text-info">
                    {{ formatBigNumber(leveledMonster.es) }}
                </div>
            </div>
            <div v-if="leveledMonster.tn !== undefined" class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">战姿</div>
                <div class="font-bold text-secondary">
                    {{ formatBigNumber(leveledMonster.tn) }}
                </div>
            </div>
            <div class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">防御减伤率</div>
                <div class="font-bold text-warning">
                    {{ format100(defenseDamageReductionRate, 2) }}
                </div>
            </div>
            <div class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">有效生命</div>
                <div class="font-bold text-accent">
                    {{ formatBigNumber(effectiveHealth) }}
                </div>
            </div>
        </div>

        <div v-if="monsterTagGroups.length">
            <div class="text-xs text-base-content/70 mb-1">号令者信息</div>
            <div v-for="monsterTagGroup in monsterTagGroups" :key="monsterTagGroup.primaryTag.id" class="rounded bg-base-200 p-3 space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <div class="text-sm font-medium">{{ monsterTagGroup.name }}</div>
                    <SRouterLink :to="`/db/monstertag/${monsterTagGroup.primaryTag.id}`" class="text-xs link link-primary">
                        查看详情
                    </SRouterLink>
                </div>
                <div class="text-sm whitespace-pre-line">
                    {{ monsterTagGroup.primaryTag.desc }}
                </div>
                <div v-if="monsterTagGroup.tags.length > 1" class="flex flex-wrap gap-2">
                    <SRouterLink
                        v-for="tag in monsterTagGroup.tags"
                        :key="tag.id"
                        :to="`/db/monstertag/${tag.id}`"
                        class="text-xs px-2 py-1 rounded bg-base-200 hover:bg-base-300 transition-colors duration-200"
                    >
                        {{ tag.id }}
                    </SRouterLink>
                </div>
            </div>
        </div>

        <div v-if="leveledMonster">
            <div class="text-xs text-base-content/70 mb-1">等级成长预览</div>
            <div ref="levelTrendChartRef" class="w-full h-72 rounded bg-base-200/40" />
        </div>

        <div v-if="dungeons.length > 0">
            <h3 class="font-bold mb-2">出现副本</h3>

            <!-- 副本名称Tab筛选 -->
            <div class="mb-3 overflow-x-auto">
                <div class="flex space-x-2 pb-2">
                    <button
                        v-for="dungeonName in allDungeonNames"
                        :key="dungeonName"
                        class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all duration-200"
                        :class="
                            selectedDungeonName === dungeonName
                                ? 'bg-primary text-white'
                                : 'bg-base-200 text-base-content hover:bg-base-300'
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
                    class="p-2 bg-base-200 rounded cursor-pointer hover:bg-base-300 transition-colors duration-200"
                    @click="$router.push(`/db/dungeon/${dungeon.id}`)"
                >
                    <div class="flex items-center justify-between">
                        <span class="font-medium">{{ dungeon.n }}</span>
                        <div class="flex flex-col items-end">
                            <span class="text-xs text-base-content/70">Lv.{{ dungeon.lv }}</span>
                            <CopyID :id="dungeon.id" />
                        </div>
                    </div>
                    <div class="text-xs text-base-content/70 mt-1">
                        {{ dungeon.desc }}
                    </div>
                </div>
            </div>
        </div>

        <div v-if="abyssDungeonsFiltered.length > 0">
            <h3 class="font-bold mb-2">出现深渊</h3>

            <!-- 深渊列表 -->
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                <div
                    v-for="dungeon in abyssDungeonsFiltered"
                    :key="dungeon.id"
                    class="p-2 bg-base-200 rounded cursor-pointer hover:bg-base-300 transition-colors duration-200"
                    @click="$router.push(`/db/abyss/${dungeon.id}`)"
                >
                    <div class="flex items-center justify-between">
                        <span class="font-medium">
                            {{ dungeon.cname }} {{ $t(getAbyssDungeonGroup(dungeon)) }} #{{ getAbyssDungeonLevel(dungeon) }}</span
                        >
                        <div class="flex flex-col items-end">
                            <CopyID :id="dungeon.id" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
