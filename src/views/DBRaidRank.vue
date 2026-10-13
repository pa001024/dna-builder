<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { useSearchParam } from "@/composables/useSearchParam"
import { dungeonMap } from "@/data"
import {
    getPreRaidRankReward,
    PreRaidRank,
    type PreRaidRankRewardItem,
    RaidBuff,
    RaidCalculation,
    RaidDungeon,
    RaidSeason,
} from "@/data/d/raid.data"
import { getDropModeText } from "@/utils/i18n-utils"
import {
    getHighestFloor,
    getInitialUnlockFloor,
    getJumpTiers,
    getRaidFloorFullList,
    getRaidFloorList,
    getUnlockFloorCount,
    isFloorSeason,
    isKeyFloor,
    shouldShowBubble,
} from "@/utils/raid-floor-utils"
import { getRewardDetails } from "@/utils/reward-utils"
import { titleFrameIdToKey } from "@/utils/title-frame/title-frame.generated"

const { t } = useTranslation()

// 计算分数函数
const calculateScore = (baseRaidPoint: number, remainingTime: number, formulaId: number): number => {
    // 找到对应的计算公式
    const formula = RaidCalculation.find(item => item.FomulaId === formulaId)
    if (!formula) return baseRaidPoint

    const { RaidTimeRate, RaidTimeZone } = formula
    let totalAddition = 0
    let timeUsed = 0

    // 计算每个时区的加成
    for (let i = 0; i < RaidTimeZone.length; i++) {
        const zoneEnd = RaidTimeZone[i]
        const rate = RaidTimeRate[i]

        // 如果剩余时间已经用完，结束计算
        if (remainingTime <= timeUsed) break

        // 计算当前时区的时间范围
        const zoneStart = i === 0 ? 0 : RaidTimeZone[i - 1]
        const zoneDuration = zoneEnd - zoneStart

        // 计算在当前时区中实际使用的时间
        const timeInZone = Math.min(remainingTime - timeUsed, zoneDuration)

        // 累加当前时区的加成
        totalAddition += timeInZone * rate
        timeUsed += timeInZone
    }

    // 计算最终分数
    return Math.floor(baseRaidPoint + totalAddition * baseRaidPoint)
}

/**
 * 根据目标分数反推剩余时间。
 * @param baseRaidPoint 基础分数
 * @param targetScore 目标分数
 * @param formulaId 公式ID
 * @returns 反推出的剩余时间
 */
const calculateRemainingTimeByScore = (baseRaidPoint: number, targetScore: number, formulaId: number): number => {
    const formula = RaidCalculation.find(item => item.FomulaId === formulaId)
    if (!formula) return 0

    const maxTime = Math.max(...formula.RaidTimeZone)
    if (targetScore <= baseRaidPoint) return 0

    let remainingAddition = targetScore / baseRaidPoint - 1
    let time = 0

    for (let i = 0; i < formula.RaidTimeZone.length; i++) {
        const rate = formula.RaidTimeRate[i] ?? 0
        const zoneEnd = formula.RaidTimeZone[i]
        const zoneStart = i === 0 ? 0 : formula.RaidTimeZone[i - 1]
        const zoneDuration = zoneEnd - zoneStart

        if (rate <= 0) continue

        const zoneAddition = zoneDuration * rate
        if (remainingAddition <= zoneAddition) {
            return Math.min(time + remainingAddition / rate, maxTime)
        }

        remainingAddition -= zoneAddition
        time += zoneDuration
    }

    return maxTime
}

// 状态管理
const raidDungeons = Object.values(RaidDungeon)
const defaultSeason =
    Object.values(RaidSeason)
        .filter(season => raidDungeons.some(dungeon => dungeon.RaidSeason === season.RaidSeason))
        .sort((a, b) => a.RaidSeason - b.RaidSeason)
        .at(-1)?.RaidSeason ?? 0
const defaultDungeon =
    raidDungeons
        .filter(dungeon => dungeon.RaidSeason === defaultSeason)
        .sort((a, b) => a.DifficultyLevel - b.DifficultyLevel)
        .at(-1)?.DungeonId ?? 0

const selectedSeason = useSearchParam<number>("s", defaultSeason)
const scoreInput = ref("")
const remainingTime = ref(30)
const selectedDungeon = useSearchParam<number>("d", defaultDungeon)
const activeInfoTab = useSearchParam<"score" | "dungeon" | "rank" | "floor">("t", "rank")

// 爬塔制赛季（Floor 模式）状态：时期（false=巅峰排名）、选中层数、模拟用通关用时/已通过最高层
const isFloorPreRaid = ref(false)
const selectedFloor = ref(0)
const floorPassTime = ref(30)
const floorPassed = ref(0)
/** 副本限时取自上游 Dungeon.BPOverrideVars.TimeLimit，2170x 系列全为 90 秒 */
const FLOOR_TIME_LIMIT = 90
const seasonTabs = computed(() => Object.values(RaidSeason))
const dungeonTabs = computed(() => {
    const season = RaidSeason[selectedSeason.value]
    if (!season) return []

    return Object.values(RaidDungeon).filter(dungeon => dungeon.RaidSeason === season.RaidSeason)
})

/**
 * 切换赛季时，保留当前副本在新赛季中的序号。
 * @param nextSeason 目标赛季ID
 */
const handleSeasonChange = (nextSeason: number) => {
    if (selectedSeason.value === nextSeason) return

    const previousDungeon = RaidDungeon[selectedDungeon.value]
    const previousSeasonDungeons = Object.values(RaidDungeon)
        .filter(dungeon => dungeon.RaidSeason === previousDungeon?.RaidSeason)
        .sort((a, b) => a.DifficultyLevel - b.DifficultyLevel)
    const nextSeasonDungeons = Object.values(RaidDungeon)
        .filter(dungeon => dungeon.RaidSeason === nextSeason)
        .sort((a, b) => a.DifficultyLevel - b.DifficultyLevel)

    const previousIndex = previousSeasonDungeons.findIndex(dungeon => dungeon.DungeonId === selectedDungeon.value)

    selectedSeason.value = nextSeason
    selectedDungeon.value = nextSeasonDungeons[previousIndex]?.DungeonId ?? nextSeasonDungeons.at(-1)?.DungeonId ?? selectedDungeon.value
    if (isFloorSeason(nextSeason)) activeInfoTab.value = "floor"
    else if (activeInfoTab.value === "floor") activeInfoTab.value = "score"
}

// 计算当前选中副本的最大允许剩余时间
const maxAllowedTime = computed(() => {
    const dungeon = RaidDungeon[selectedDungeon.value]
    if (!dungeon) return 0

    const formula = RaidCalculation.find(item => item.FomulaId === dungeon.FomulaId)
    if (!formula) return 0

    // 使用RaidTimeZone的最大值作为最大允许时间
    return Math.max(...formula.RaidTimeZone)
})

const currentDungeonData = computed(() => RaidDungeon[selectedDungeon.value])

// 当前赛季是否为爬塔制（RaidSeasonType 2），决定页面走打分分支还是爬塔分支
const currentSeasonIsFloor = computed(() => isFloorSeason(selectedSeason.value))
const currentSeasonData = computed(() => RaidSeason[selectedSeason.value])
/** 楼层类型：1 分组赛，2 巅峰排名（对应打分制的 RaidDungeonType 口径） */
const floorType = computed(() => (isFloorPreRaid.value ? 1 : 2))
/**
 * 当前最高可打层（进度提交态，只增不减）：开赛初始开放层起步，
 * 每次“通关本层并结算”时按（本层 + 本次跳层）推进。
 * 通关用时输入只影响本次结算的跳层预览，不会直接改写解锁。
 */
const floorHighestUnlocked = ref(getInitialUnlockFloor(RaidSeason[selectedSeason.value], isFloorPreRaid.value))
const floorHighest = computed(() => getHighestFloor(selectedSeason.value, floorType.value))
/** 已解锁楼层（游戏内关卡列表口径，只含已解锁层） */
const floorUnlockedList = computed(() => getRaidFloorList(selectedSeason.value, floorType.value, floorHighestUnlocked.value))
/** 全部楼层（资料库完整展示口径，含未解锁层） */
const floorList = computed(() => getRaidFloorFullList(selectedSeason.value, floorType.value))
/** 选中楼层，未选中时默认最高可打层（贴合游戏默认选中最高层的行为） */
const currentFloorData = computed(() => floorList.value.find(item => item.Floor === selectedFloor.value) ?? floorUnlockedList.value.at(-1))
const floorJumpTiers = computed(() => getJumpTiers(currentSeasonData.value, FLOOR_TIME_LIMIT, floorPassTime.value))
const floorJumpCount = computed(() => getUnlockFloorCount(currentSeasonData.value, FLOOR_TIME_LIMIT, floorPassTime.value))
/** 选中楼层是否超出当前进度（资料库允许预览，仅提示未解锁）。 */
const isCurrentFloorLocked = computed(() => (currentFloorData.value?.Floor ?? 0) > floorHighestUnlocked.value)
const currentFloorDungeon = computed(() => (currentFloorData.value ? dungeonMap.get(currentFloorData.value.DungeonId) : undefined))
const currentFloorFirstReward = computed(() => (currentFloorData.value ? getRewardDetails(currentFloorData.value.FirstReward) : undefined))
const currentFloorNormalReward = computed(() =>
    currentFloorData.value ? getRewardDetails(currentFloorData.value.NormalReward) : undefined
)
const infoTabs = computed(() =>
    currentSeasonIsFloor.value
        ? [
              { label: t("db-raid-rank.floor"), value: "floor" },
              { label: t("db-raid-rank.rank_info"), value: "rank" },
          ]
        : [
              { label: t("db-raid-rank.score_calc"), value: "score" },
              { label: t("db-raid-rank.dungeon_info"), value: "dungeon" },
              { label: t("db-raid-rank.rank_info"), value: "rank" },
          ]
)

/**
 * 赛季/时期切换时重置楼层选中，并在打分与爬塔页签之间自动纠偏。
 */
watch(
    [selectedSeason, isFloorPreRaid],
    () => {
        resetFloorProgress()
        floorPassTime.value = 30
        if (currentSeasonIsFloor.value && activeInfoTab.value !== "floor" && activeInfoTab.value !== "rank") activeInfoTab.value = "floor"
        if (!currentSeasonIsFloor.value && activeInfoTab.value === "floor") activeInfoTab.value = "score"
    },
    { immediate: true }
)

/**
 * 楼层是否为关键层（特殊样式标记）。
 * @param floor 层数
 */
function isCurrentKeyFloor(floor: number): boolean {
    return isKeyFloor(currentSeasonData.value, floor, isFloorPreRaid.value)
}

/**
 * 楼层是否显示跳层引导气泡。
 * @param floor 层数
 */
function isCurrentBubbleFloor(floor: number): boolean {
    return shouldShowBubble(currentSeasonData.value, floor, floorHighestUnlocked.value)
}

/**
 * 通关用时输入钳制到副本限时内。
 * @param value 输入的通关用时
 */
function updateFloorPassTime(value: number): void {
    floorPassTime.value = Number.isFinite(value) ? Math.max(0, Math.min(value, FLOOR_TIME_LIMIT)) : 0
}

/** 重置爬塔进度到开赛初始状态（已通过清零，解锁回到初始开放层）。 */
function resetFloorProgress(): void {
    floorPassed.value = 0
    selectedFloor.value = 0
    floorHighestUnlocked.value = getInitialUnlockFloor(currentSeasonData.value, isFloorPreRaid.value)
}

/** 楼层列表吸顶容器的实测高度（动态计算，保证滚到哪底部都可点）。 */
const floorListBox = ref<HTMLElement | null>(null)
const floorListHeight = ref(384)
let floorListRaf = 0

/**
 * 按可视区域底部动态计算列表高度：容器顶边到最近滚动祖先可视底边的距离，
 * 再减去卡片下 padding 与底部边距。卡片里的标题栏高度不用单独算——
 * 容器顶边本来就是标题栏下方实测出来的。
 * 吸顶（sticky）后卡片底恰好留出边距，页面滚一半也不会点不到最下面一层。
 */
function updateFloorListHeight(): void {
    const box = floorListBox.value
    if (!box || typeof window === "undefined") return
    const section = box.closest("section")
    const padBottom = section ? Number.parseFloat(getComputedStyle(section).paddingBottom) || 0 : 0
    const top = box.getBoundingClientRect().top
    const bottom = getScrollportBottom(box)
    floorListHeight.value = Math.max(256, Math.round(bottom - top - padBottom - 12))
}

/**
 * 向上找到最近的可滚动祖先，取其可视底边作为高度基准。
 * 不能直接用 window.innerHeight：底部固定导航栏不在滚动视口内，
 * 按整窗高度算会让列表底部伸到导航栏底下被遮住。
 * @param el 起始元素（从其父级开始向上找，跳过自身）
 * @returns 可视底边在视口中的位置，找不到时回落到整窗高度
 */
function getScrollportBottom(el: HTMLElement): number {
    let node: HTMLElement | null = el.parentElement
    while (node) {
        if (node.scrollHeight > node.clientHeight + 1) return node.getBoundingClientRect().bottom
        node = node.parentElement
    }
    return window.innerHeight
}

/** rAF 节流的高度重算（scroll 捕获监听会高频触发）。 */
function scheduleFloorListHeight(): void {
    if (floorListRaf) return
    floorListRaf = requestAnimationFrame(() => {
        floorListRaf = 0
        updateFloorListHeight()
    })
}

watch(activeInfoTab, value => {
    if (value === "floor") nextTick(updateFloorListHeight)
})

onMounted(() => {
    updateFloorListHeight()
    window.addEventListener("resize", scheduleFloorListHeight)
    window.addEventListener("scroll", scheduleFloorListHeight, true)
})

onUnmounted(() => {
    window.removeEventListener("resize", scheduleFloorListHeight)
    window.removeEventListener("scroll", scheduleFloorListHeight, true)
    if (floorListRaf) cancelAnimationFrame(floorListRaf)
})

/**
 * 通关用时输入事件（number input 与 range 共用）。
 * @param event 输入事件
 */
function handleFloorPassTimeInput(event: Event): void {
    updateFloorPassTime(Number((event.target as HTMLInputElement).value))
}

/**
 * 选中楼层，右侧详情即时展示（列表与详情同页分栏）。
 * @param floor 层数
 */
function selectFloor(floor: number): void {
    selectedFloor.value = floor
}

/** 选中当前最高可打层，右侧详情即时展示。 */
function gotoHighestUnlocked(): void {
    const target = floorUnlockedList.value.at(-1)
    if (target) selectFloor(target.Floor)
}

/**
 * 通关当前选中楼层并结算：已通过进度推进到本层，解锁按（本层 + 本次跳层）推进（只增不减），
 * 并选中新的最高可打层（同页右侧即时展示）。
 * 未解锁层不允许结算（按钮侧已禁用，此处再守一次）。
 */
function settleCurrentFloor(): void {
    const floor = currentFloorData.value?.Floor ?? 0
    if (floor <= 0 || floor > floorHighestUnlocked.value) return
    floorPassed.value = Math.max(floorPassed.value, floor)
    floorHighestUnlocked.value = Math.min(floorHighest.value, Math.max(floorHighestUnlocked.value, floor + floorJumpCount.value))
    selectedFloor.value = floorUnlockedList.value.at(-1)?.Floor ?? floor
}

const maxScore = computed(() => {
    const dungeon = currentDungeonData.value
    if (!dungeon) return 0
    return calculateScore(dungeon.BaseRaidPoint, maxAllowedTime.value, dungeon.FomulaId)
})

const minScore = computed(() => currentDungeonData.value?.BaseRaidPoint ?? 0)

/**
 * 将输入的剩余时间限制在允许范围内，并同步分数输入。
 * @param value 输入的剩余时间
 */
const updateRemainingTime = (value: number) => {
    const maxTime = maxAllowedTime.value
    const nextTime = Math.max(0, Math.min(value, maxTime))
    remainingTime.value = nextTime

    const dungeon = currentDungeonData.value
    if (!dungeon) return
    scoreInput.value = `${calculateScore(dungeon.BaseRaidPoint, nextTime, dungeon.FomulaId)}`
}

/**
 * 根据输入分数反推剩余时间，并同步分数输入。
 * @param event 输入事件
 */
const handleScoreInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target) {
        const rawValue = target.value
        scoreInput.value = rawValue

        if (!rawValue.trim()) return

        const dungeon = currentDungeonData.value
        if (!dungeon) return

        const parsedScore = Number(rawValue)
        if (!Number.isFinite(parsedScore)) return
        if (parsedScore < minScore.value) return

        const nextScore = Math.max(0, Math.min(parsedScore, maxScore.value))
        updateRemainingTime(calculateRemainingTimeByScore(dungeon.BaseRaidPoint, nextScore, dungeon.FomulaId))
    }
}

/**
 * 分数输入失焦后统一规整显示值。
 */
const commitScoreInput = () => {
    const dungeon = currentDungeonData.value
    if (!dungeon) return

    const parsedScore = Number(scoreInput.value)
    const nextScore = Number.isFinite(parsedScore)
        ? Math.max(minScore.value, Math.min(Math.floor(parsedScore), maxScore.value))
        : maxScore.value

    scoreInput.value = `${nextScore}`
    updateRemainingTime(calculateRemainingTimeByScore(dungeon.BaseRaidPoint, nextScore, dungeon.FomulaId))
}

/**
 * 根据输入剩余时间更新分数输入。
 * @param event 输入事件
 */
const handleRemainingTimeInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target) {
        updateRemainingTime(Number(target.value))
    }
}

// 计算当前选中副本的分数
const currentScore = computed(() => {
    const dungeon = currentDungeonData.value
    if (!dungeon) return 0

    // 确保使用的剩余时间不超过最大值
    const actualTime = Math.min(remainingTime.value, maxAllowedTime.value)
    return calculateScore(dungeon.BaseRaidPoint, actualTime, dungeon.FomulaId)
})

const currentFormula = computed(() => {
    const formulaId = currentDungeonData.value?.FomulaId
    if (!formulaId) return undefined

    return RaidCalculation.find(item => item.FomulaId === formulaId)
})

/**
 * 初始化或切换副本时，回填最高分数和最大剩余时间。
 */
const fillMaxScoreAndTime = () => {
    remainingTime.value = maxAllowedTime.value
    scoreInput.value = `${maxScore.value}`
}

watch(selectedDungeon, fillMaxScoreAndTime, { immediate: true })

// 当前赛季/副本的分数奖励配置（RaidPointToRewrad 与最大奖励次数）
/**
 * 新赛季（1006 起）奖励配置迁移到副本维度，优先取当前副本的配置，旧赛季回退到赛季维度。
 */
const rewardConfig = computed(() => {
    const dungeon = currentDungeonData.value
    const seasonData = RaidSeason[selectedSeason.value]
    return {
        reward: dungeon?.RaidPointToRewrad ?? seasonData?.RaidPointToRewrad,
        maxTime: dungeon?.RaidPointToRewradMaxTime ?? seasonData?.RaidPointToRewradMaxTime,
    }
})

// 计算奖励次数函数
const calculateRewardCount = (score: number, season: number | string): number => {
    const seasonData = RaidSeason[season]
    if (!seasonData) return 0

    // 最大奖励次数优先取当前副本配置（新赛季），旧赛季回退到赛季配置
    const maxTime = currentDungeonData.value?.RaidPointToRewradMaxTime ?? seasonData.RaidPointToRewradMaxTime ?? 0

    // 计算奖励次数 = 分数 / 1000（向下取整）
    let rewardCount = Math.floor(score / 1000)

    // 限制最大奖励次数
    rewardCount = Math.min(rewardCount, maxTime)

    return rewardCount
}

// 计算当前分数对应的奖励次数
const currentRewardCount = computed(() => {
    return calculateRewardCount(currentScore.value, selectedSeason.value)
})

// 获取当前赛季/副本的奖励ID
const rewardId = computed(() => {
    // RaidPointToRewrad的键是分数阈值，值是奖励ID
    // 新赛季配置迁移到副本维度，优先取副本配置，旧赛季回退到赛季配置
    const rewardMap = rewardConfig.value.reward
    if (!rewardMap) return 0

    const firstRewardKey = Object.keys(rewardMap)[0]
    return rewardMap[firstRewardKey] || 0
})

// 获取当前奖励详情
const currentReward = computed(() => {
    const id = rewardId.value
    return getRewardDetails(id)
})

const currentDungeon = computed(() => {
    return dungeonMap.get(selectedDungeon.value)
})

// 原始排名数据（暂时保留）
interface RankDataItem {
    percent: number
    rank: string
    reward: PreRaidRankRewardItem
}

/**
 * 取排名奖励对应的称号框 ID。
 *
 * 可渲染性由生成的 `titleFrameIdToKey` 决定（来源：游戏 TitleFrame.lua），
 * 不再维护手写白名单，赛季更新后重新生成数据即可自动生效。
 *
 * @param reward 名次奖励
 * @returns 称号框 ID，无对应称号框时 undefined
 */
function getTitleFrameId(reward: PreRaidRankRewardItem) {
    const titleFrameId = reward.child?.[0]?.id
    if (!titleFrameId || !titleFrameIdToKey[titleFrameId]) return undefined
    return titleFrameId
}

const rankData = computed<RankDataItem[]>(() => {
    const data = PreRaidRank[selectedSeason.value]
    if (!data) return []

    return data.RankName.flatMap((item, index) => {
        const reward = getPreRaidRankReward(selectedSeason.value, index)
        if (!reward) return []

        return [
            {
                rank: item,
                percent: data.RankPercent[index],
                reward,
            },
        ]
    })
})

function getDungeonName(dungeonId: number) {
    return dungeonMap.get(dungeonId)?.n || `${dungeonId}`
}

function getSeasonName(str: number) {
    return `${~~(str / 1000)}.${~~(str % 1000)}`
}

/**
 * 判断名次条目是否属于前三档（用于主色强调）。
 * @param index 名次条目索引
 * @returns 是否属于前三档
 */
function isTopThreeRank(index: number): boolean {
    return index < 3
}

/** 加载失败的赛季 fallback 图（称号框未生成且无赛季截图时隐藏破图，只留文字）。 */
const rankImgFailed = ref(new Set<string>())

/**
 * 赛季 fallback 图加载失败时记入集合，避免显示破图。
 * @param key 赛季_名次键
 */
function onRankImgError(key: string): void {
    rankImgFailed.value.add(key)
}
</script>
<template>
    <ScrollArea class="h-full min-h-0">
        <div class="stagger-rise space-y-4 p-4">
            <!-- 赛季 / 副本筛选：方章 chip -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <div class="space-y-3">
                    <!-- 赛季筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">SEASON</span>
                        <button
                            v-for="season in seasonTabs"
                            :key="season.RaidSeason"
                            type="button"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedSeason === season.RaidSeason
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="handleSeasonChange(season.RaidSeason)"
                        >
                            {{ getSeasonName(season.RaidSeason) }}
                        </button>
                    </div>
                    <!-- 副本筛选（打分制） -->
                    <div v-if="!currentSeasonIsFloor" class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">DUNGEON</span>
                        <button
                            v-for="dungeon in dungeonTabs"
                            :key="dungeon.DungeonId"
                            type="button"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedDungeon === dungeon.DungeonId
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedDungeon = dungeon.DungeonId"
                        >
                            {{ $t(getDungeonName(dungeon.DungeonId)) }} ({{
                                t("db-raid-rank.difficulty_label", { level: dungeon.DifficultyLevel })
                            }})
                        </button>
                    </div>
                    <!-- 时期筛选（爬塔制）：分组赛 FloorType 1，巅峰排名 FloorType 2（官方文本） -->
                    <div v-else class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">PERIOD</span>
                        <button
                            v-for="period in [{ value: true }, { value: false }]"
                            :key="String(period.value)"
                            type="button"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                isFloorPreRaid === period.value
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="isFloorPreRaid = period.value"
                        >
                            {{ period.value ? $t("分组赛") : $t("巅峰排名") }}
                        </button>
                        <span class="text-[11px] tabular-nums text-base-content/45">
                            {{ t("db-raid-rank.unlocked_up_to", { value: floorHighestUnlocked }) }}
                            / {{ t("db-raid-rank.highest_floor_x", { value: floorHighest }) }}
                        </span>
                    </div>
                </div>
            </section>

            <!-- 词缀说明：打分制取选中副本，爬塔制取选中楼层 -->
            <p v-if="!currentSeasonIsFloor" class="flex flex-wrap items-center gap-x-2 text-sm leading-relaxed text-base-content/70">
                <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">BUFF</span>
                {{ RaidDungeon[selectedDungeon]?.RaidBuffID.map(id => $t(RaidBuff[id].RaidBuffDes)).join("、") }}
            </p>
            <p v-else class="flex flex-wrap items-center gap-x-2 text-sm leading-relaxed text-base-content/70">
                <span class="mr-1 shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">BUFF</span>
                {{ currentFloorData?.RaidBuffID.map(id => $t(RaidBuff[id].RaidBuffDes)).join("、") }}
            </p>

            <!-- 信息分页 -->
            <AniTabs v-model="activeInfoTab" :tabs="infoTabs" />

            <!-- 计算说明（打分制） -->
            <div v-if="activeInfoTab === 'score' && !currentSeasonIsFloor" class="space-y-3">
                <!-- 分数计算器 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="CALCULATOR" :title="$t('db-raid-rank.score_calc')" />
                    <!-- 当前分数 -->
                    <div class="flex items-baseline gap-2">
                        <span class="text-sm text-base-content/60">{{ $t("common.score") }}</span>
                        <span class="font-orbitron text-2xl font-bold tabular-nums text-primary">{{ currentScore }}</span>
                    </div>
                    <!-- 分数 / 剩余时间输入 -->
                    <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                        <label class="block">
                            <span class="mb-1 block text-sm font-medium text-base-content/80">{{ $t("common.score") }}</span>
                            <input
                                :value="scoreInput"
                                @input="handleScoreInput"
                                @change="commitScoreInput"
                                type="number"
                                :min="minScore"
                                :max="maxScore"
                                :placeholder="$t('db-raid-rank.input_score')"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 font-orbitron text-sm tabular-nums outline-none transition-colors duration-200 placeholder:text-base-content/35 placeholder:font-sans focus:border-primary"
                            />
                            <span class="mt-1 block text-[11px] tabular-nums text-base-content/45">{{
                                t("db-raid-rank.max_score", { value: maxScore })
                            }}</span>
                        </label>
                        <label class="block">
                            <span class="mb-1 block text-sm font-medium text-base-content/80">{{ $t("db-raid-rank.remaining_time") }}</span>
                            <input
                                :value="remainingTime"
                                @input="handleRemainingTimeInput"
                                type="number"
                                min="0"
                                :max="maxAllowedTime"
                                step="0.1"
                                :placeholder="$t('db-raid-rank.input_remaining_time')"
                                class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 font-orbitron text-sm tabular-nums outline-none transition-colors duration-200 placeholder:text-base-content/35 placeholder:font-sans focus:border-primary"
                            />
                            <span class="mt-1 block text-[11px] tabular-nums text-base-content/45">
                                {{ t("db-raid-rank.max_allowed_time", { value: maxAllowedTime }) }}
                                {{ t("db-raid-rank.elapsed_time", { value: +(maxAllowedTime - remainingTime).toFixed(2) }) }}
                            </span>
                        </label>
                        <div class="col-span-2">
                            <input
                                type="range"
                                :value="remainingTime"
                                @input="handleRemainingTimeInput"
                                :max="maxAllowedTime"
                                step="0.1"
                                class="range range-primary range-xs w-full"
                            />
                        </div>
                    </div>
                </section>

                <!-- 公式说明 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="FORMULA" :title="$t('db-raid-rank.score_calc_desc')" />
                    <p class="text-sm leading-relaxed text-base-content/90">
                        {{ $t("db-raid-rank.formula") }}
                        <span class="ml-1 text-xs opacity-80">{{ $t("db-raid-rank.formula_note") }}</span>
                    </p>
                    <p class="mt-2 text-[11px] leading-relaxed tabular-nums text-base-content/55">
                        {{ t("db-raid-rank.current_dungeon", { id: RaidDungeon[selectedDungeon]?.DungeonId }) }} | BaseRaidPoint:
                        {{ RaidDungeon[selectedDungeon]?.BaseRaidPoint }} |
                        {{ t("db-raid-rank.formula_id", { id: RaidDungeon[selectedDungeon]?.FomulaId }) }} |
                        {{ t("db-raid-rank.time_zone") }}:
                        {{ currentFormula?.RaidTimeZone }} | {{ t("db-raid-rank.rate") }}:
                        {{ currentFormula?.RaidTimeRate }}
                    </p>
                </section>

                <!-- 奖励数量展示 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="REWARD" :title="$t('db-raid-rank.score_reward_calc')" />
                    <p class="text-sm leading-relaxed text-base-content/90">
                        {{ $t("db-raid-rank.per_1000_points") }} <b class="font-orbitron tabular-nums text-primary">1</b>
                        {{ $t("db-raid-rank.rewards_max") }}
                        <b class="font-orbitron tabular-nums text-primary">{{ rewardConfig.maxTime ?? 0 }}</b>
                        {{ $t("common.times") }}
                    </p>
                    <div class="mt-3">
                        <p class="text-sm font-medium text-base-content/80">{{ $t("db-raid-rank.current_rewards") }}</p>
                        <div class="mt-1 flex items-baseline gap-1">
                            <span class="font-orbitron text-lg font-bold text-primary">{{ currentRewardCount }}</span>
                            <span class="text-sm text-base-content/55">{{ $t("common.times") }}</span>
                        </div>

                        <!-- 奖励组（内层小卡） -->
                        <div class="mt-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <div class="mb-1 flex items-center justify-between gap-2">
                                <span class="text-sm font-medium text-base-content/85">{{
                                    t("reward-item.reward_group_id", { id: rewardId })
                                }}</span>
                                <span
                                    class="rounded-xs px-1.5 py-0.5 text-[10px] leading-4"
                                    :class="
                                        currentReward?.m === 'Independent'
                                            ? 'bg-success text-success-content'
                                            : 'bg-warning text-warning-content'
                                    "
                                >
                                    {{ getDropModeText(currentReward?.m || "") }}
                                </span>
                            </div>
                            <RewardItem :reward="currentReward!" />
                        </div>
                    </div>
                </section>
                <!-- 副本展示 -->
            </div>

            <!-- 爬塔制：楼层 / 跳层模拟 -->
            <div v-if="activeInfoTab === 'floor' && currentSeasonIsFloor" class="space-y-3">
                <!-- 爬塔进度：规则与模拟合一（状态行 + 跳层档位 + 操作提示） -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="SIMULATOR" :title="$t('db-raid-rank.jump_simulator')" />
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span class="font-orbitron text-xl font-bold tabular-nums text-primary">
                            {{ t("db-raid-rank.simulated_unlock_x", { value: floorHighestUnlocked }) }}
                        </span>
                        <button
                            type="button"
                            class="cursor-pointer rounded-xs border border-primary/50 px-2 py-0.5 text-[11px] text-primary transition-colors duration-150 hover:bg-primary hover:text-primary-content active:scale-[0.97]"
                            @click="gotoHighestUnlocked"
                        >
                            {{ $t("db-raid-rank.goto_unlock") }}
                        </button>
                        <span class="text-[11px] tabular-nums text-base-content/55">
                            {{ $t("db-raid-rank.passed_floor") }}：{{
                                floorPassed > 0 ? t("db-raid-rank.floor_name", { value: floorPassed }) : "–"
                            }}
                        </span>
                        <button
                            v-if="floorPassed > 0"
                            type="button"
                            class="cursor-pointer rounded-xs border border-base-content/20 px-1.5 py-0.5 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                            @click="resetFloorProgress"
                        >
                            {{ $t("db-raid-rank.reset_progress") }}
                        </button>
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <span class="text-[11px] tabular-nums text-base-content/55">{{
                            t("db-raid-rank.time_limit_x", { value: FLOOR_TIME_LIMIT })
                        }}</span>
                        <span
                            v-for="tier in floorJumpTiers"
                            :key="tier.jumpTime"
                            class="rounded-xs border border-base-content/25 bg-base-content/5 px-2 py-0.5 font-mono text-[11px] tabular-nums text-base-content/85"
                        >
                            ≥{{ tier.jumpTime }}s → +{{ tier.jumpFloor }}
                        </span>
                    </div>
                    <p class="mt-2 text-[11px] leading-relaxed text-base-content/55">{{ $t("db-raid-rank.progress_note") }}</p>
                </section>

                <div class="grid grid-cols-1 items-start gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <!-- 楼层列表 -->
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm lg:sticky lg:top-3">
                        <SectionHeader no-animate compact kicker="FLOORS" :title="$t('db-raid-rank.floor_list')" />
                        <div ref="floorListBox">
                            <ScrollArea :style="{ height: `${floorListHeight}px` }">
                                <div class="grid grid-cols-2 gap-1.5">
                                    <button
                                        v-for="item in floorList"
                                        :key="item.FloorId"
                                        type="button"
                                        class="relative cursor-pointer rounded-xs border px-2 py-1.5 text-left transition-colors duration-150 active:scale-[0.97]"
                                        :title="item.Floor > floorHighestUnlocked ? $t('db-raid-rank.locked_preview') : ''"
                                        :class="
                                currentFloorData?.FloorId === item.FloorId
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : item.Floor > floorHighestUnlocked
                                      ? 'border-base-content/10 text-base-content/40 hover:border-primary/60'
                                      : 'border-base-content/20 text-base-content/70 hover:border-primary/60'
                            "
                                        @click="selectFloor(item.Floor)"
                                    >
                                        <span class="font-orbitron text-sm font-bold tabular-nums">{{
                                            t("db-raid-rank.floor_name", { value: item.Floor })
                                        }}</span>
                                        <span class="mt-0.5 block text-[10px] tabular-nums opacity-70">Lv.{{ item.RecLevel }}</span>
                                        <span
                                            v-if="item.Floor > floorHighestUnlocked"
                                            class="mt-1 inline-block rounded-xs bg-base-content/10 px-1 text-[10px] leading-4"
                                        >
                                            {{ $t("db-raid-rank.locked") }}
                                        </span>
                                        <span class="mt-1 flex flex-wrap gap-1">
                                            <span
                                                v-if="isCurrentKeyFloor(item.Floor)"
                                                class="rounded-xs bg-warning px-1 text-[10px] leading-4 text-warning-content"
                                            >
                                                {{ $t("db-raid-rank.key_floor") }}
                                            </span>
                                            <span
                                                v-if="isCurrentBubbleFloor(item.Floor)"
                                                class="rounded-xs bg-info px-1 text-[10px] leading-4 text-info-content"
                                            >
                                                {{ $t("db-raid-rank.bubble_tip") }}
                                            </span>
                                        </span>
                                    </button>
                                </div>
                            </ScrollArea>
                        </div>
                    </section>
                    <!-- 选中楼层详情（与列表同页分栏） -->
                    <div v-if="currentFloorData" class="min-w-0 space-y-3">
                        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                            <SectionHeader no-animate compact kicker="FLOOR" :title="$t('db-raid-rank.floor_detail')" />
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="font-orbitron text-2xl font-bold tabular-nums text-primary">
                                    {{ t("db-raid-rank.floor_name", { value: currentFloorData.Floor }) }}
                                </span>
                                <span
                                    v-if="isCurrentKeyFloor(currentFloorData.Floor)"
                                    class="rounded-xs bg-warning px-1.5 py-0.5 text-[10px] leading-4 text-warning-content"
                                >
                                    {{ $t("db-raid-rank.key_floor") }}
                                </span>
                            </div>
                            <p
                                v-if="isCurrentFloorLocked"
                                class="mt-2 rounded-xs border border-warning/40 bg-warning/10 p-2 text-sm leading-relaxed text-base-content/80"
                            >
                                {{ $t("db-raid-rank.locked_preview") }}
                            </p>
                            <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums text-base-content/80 sm:grid-cols-4">
                                <span>{{ t("db-raid-rank.monster_level_x", { value: currentFloorData.MonsterLevel }) }}</span>
                                <span>{{ t("db-raid-rank.rec_level_x", { value: currentFloorData.RecLevel }) }}</span>
                                <span class="col-span-2">{{
                                    t("db-raid-rank.min_damage_x", { value: currentFloorData.MinCompleteDamage })
                                }}</span>
                            </div>
                            <!-- 通关操作：用时与结算放同一块，填完即点 -->
                            <div class="mt-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                                <div class="flex flex-wrap items-end gap-x-3 gap-y-2">
                                    <label class="block w-36">
                                        <span class="mb-1 block text-sm font-medium text-base-content/80">{{
                                            $t("db-raid-rank.pass_time")
                                        }}</span>
                                        <input
                                            :value="floorPassTime"
                                            @input="handleFloorPassTimeInput"
                                            type="number"
                                            min="0"
                                            :max="FLOOR_TIME_LIMIT"
                                            step="0.1"
                                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 font-orbitron text-sm tabular-nums outline-none transition-colors duration-200 focus:border-primary"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        :disabled="isCurrentFloorLocked"
                                        :title="isCurrentFloorLocked ? $t('db-raid-rank.locked_preview') : ''"
                                        class="cursor-pointer rounded-xs border border-primary/50 px-2 py-1 text-[12px] text-primary transition-colors duration-150 hover:bg-primary hover:text-primary-content active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-primary"
                                        @click="settleCurrentFloor"
                                    >
                                        {{ $t("db-raid-rank.settle_floor") }}
                                    </button>
                                    <span class="pb-1 text-[11px] tabular-nums text-base-content/55">
                                        {{
                                            t("db-raid-rank.time_remain_x", {
                                                value: Math.max(0, FLOOR_TIME_LIMIT - floorPassTime).toFixed(1),
                                            })
                                        }}
                                        · {{ t("db-raid-rank.jump_count_x", { value: floorJumpCount }) }}
                                    </span>
                                </div>
                                <input
                                    :value="floorPassTime"
                                    @input="handleFloorPassTimeInput"
                                    type="range"
                                    :max="FLOOR_TIME_LIMIT"
                                    step="0.1"
                                    class="range range-primary range-xs mt-2 w-full"
                                />
                            </div>
                            <div class="mt-3 space-y-3">
                                <div>
                                    <p class="mb-1 text-sm font-medium text-base-content/80">{{ $t("db-raid-rank.first_reward") }}</p>
                                    <RewardItem v-if="currentFloorFirstReward" :reward="currentFloorFirstReward" />
                                </div>
                                <div>
                                    <p class="mb-1 text-sm font-medium text-base-content/80">{{ $t("db-raid-rank.normal_reward") }}</p>
                                    <RewardItem v-if="currentFloorNormalReward" :reward="currentFloorNormalReward" />
                                </div>
                            </div>
                        </section>
                        <div
                            v-if="currentFloorDungeon"
                            class="rounded-xs border border-base-content/10 bg-base-100/60 p-1 backdrop-blur-sm"
                        >
                            <DBDungeonDetailItem
                                :key="currentFloorData.FloorId"
                                :dungeon="currentFloorDungeon"
                                :initial-level="currentFloorData.MonsterLevel"
                            />
                        </div>
                        <p v-else class="text-[11px] text-base-content/45">
                            {{ t("db-raid-rank.dungeon_missing", { id: currentFloorData.DungeonId }) }}
                        </p>
                    </div>
                </div>
            </div>

            <!-- 副本信息（打分制） -->
            <div
                v-if="activeInfoTab === 'dungeon' && !currentSeasonIsFloor && currentDungeon"
                class="rounded-xs border border-base-content/10 bg-base-100/60 p-1 backdrop-blur-sm"
            >
                <DBDungeonDetailItem :dungeon="currentDungeon" />
            </div>

            <!-- 排名信息：榜单行（前三档主色强调） -->
            <div v-if="activeInfoTab === 'rank'" class="space-y-3">
                <p
                    v-if="currentSeasonIsFloor"
                    class="rounded-xs border border-info/30 bg-info/5 p-2.5 text-sm leading-relaxed text-base-content/80"
                >
                    {{ $t("db-raid-rank.rank_floor_note") }}
                </p>
                <div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    <article
                        v-for="(item, index) in rankData"
                        :key="item.rank"
                        class="relative overflow-hidden rounded-xs border p-3 backdrop-blur-sm animate-ef-rise motion-reduce:animate-none"
                        :class="isTopThreeRank(index) ? 'border-primary/40 bg-primary/6' : 'border-base-content/10 bg-base-100/60'"
                        :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                    >
                        <!-- 左侧主色强调条：前三档显现 -->
                        <span
                            class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                            :class="isTopThreeRank(index) ? 'opacity-100' : 'opacity-0'"
                            aria-hidden="true"
                        />
                        <div class="flex items-center gap-3">
                            <img class="h-12 shrink-0" :src="`/imgs/rank/T_Activity_GuildWar_Rank_${item.rank}.webp`" :alt="item.rank" />
                            <div class="min-w-0">
                                <p
                                    class="font-orbitron text-lg font-bold tabular-nums"
                                    :class="isTopThreeRank(index) ? 'text-primary' : ''"
                                >
                                    {{ item.rank }}
                                </p>
                                <p class="mt-0.5 text-[11px] text-base-content/50">
                                    {{ t("db-raid-rank.rank_requirement", { percent: item.percent }) }}
                                </p>
                            </div>
                        </div>
                        <!--
                        称号框给固定尺寸（210×64）。宽度按实机截图反推：截图里
                        「卑鄙的异乡人」六个字共 80px，中日韩字形的步进是 1.0em，
                        即字号 15 单位 → 每字 13.3px，实机缩放约 0.89 像素/设计单位，
                        对应设计画布 236 单位 → 210px。组件内部按设计画布定比例，
                        与各框贴图的实际大小无关，所以所有赛季的文字像素大小一致。
                    -->
                        <div class="relative mt-3 inline-flex w-52.5 max-w-full">
                            <TitleFrameRender
                                v-if="getTitleFrameId(item.reward)"
                                class="h-16 w-full shrink-0"
                                :title-frame-id="getTitleFrameId(item.reward)"
                                :title="$t(item.reward.child?.[0].n || '')"
                            />
                            <img
                                v-else-if="!rankImgFailed.has(`${selectedSeason}_${item.rank}`)"
                                class="h-12"
                                :src="`/imgs/rank/${selectedSeason}_${item.rank}.webp`"
                                :alt="item.rank"
                                @error="onRankImgError(`${selectedSeason}_${item.rank}`)"
                            />
                            <div v-if="!getTitleFrameId(item.reward)" class="absolute inset-0 flex items-center justify-center">
                                <p class="text-sm font-bold text-white">{{ $t(item.reward.child?.[0].n || "") }}</p>
                            </div>
                        </div>
                        <!-- 奖励明细（内层小卡） -->
                        <div :key="item.reward.id" class="mt-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <!-- 使用 RewardItem 组件显示奖励 -->
                            <RewardItem :reward="item.reward" header />
                        </div>
                    </article>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
