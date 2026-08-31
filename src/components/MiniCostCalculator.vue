<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue"
import { useRouter } from "vue-router"
import { type Dungeon, dungeonMap, LeveledChar, type LeveledMod, modMap } from "@/data"
import { dataPackBootstrapLoading, isDataPackHydrated } from "@/data/data-pack-bridge"
import { LevelUpCalculator, type LevelUpResult, type ModLevelUpConfig, type TimeEstimateConfig } from "@/data/LevelUpCalculator"
import { getDungeonName, getDungeonType } from "@/utils/dungeon-utils"

const props = defineProps<{
    mods: (LeveledMod | null)[]
}>()

const router = useRouter()

// ============ 与完整计算器互通的计划与估算配置（同一 localStorage key） ============

/** 完整计算器的养成计划（lvup.mods），点击跳转时覆盖原计划 */
interface LvupModItem {
    id: number
    config: ModLevelUpConfig
}

const lvupMods = useLocalStorage<LvupModItem[]>("lvup.mods", [])

/** 时间估算配置，与完整计算器共享 */
interface TimeEstimateUIConfig {
    dungeonDropRateBonusPercent: number
    dungeonTimeMultiplier: number
    dungeonTypeTimes: {
        Defense: number
        ExtermPro: number
        SurvivalMiniPro: number
    }
}

const timeEstimateConfig = useLocalStorage<TimeEstimateUIConfig>("lvup.timeEstimateConfig", {
    dungeonDropRateBonusPercent: 30,
    dungeonTimeMultiplier: 1,
    dungeonTypeTimes: {
        Defense: 1,
        ExtermPro: 0.5,
        SurvivalMiniPro: 0.7,
    },
})

// ============ 本地独立计算状态（不点击跳转时保持独立） ============

interface MiniCostMod {
    id: number
    currentLevel: number
    targetLevel: number
    count: number
}

const mods = ref<MiniCostMod[]>([])
const result = shallowRef<LevelUpResult | null>(null)
const calculating = ref(false)
const isConfigOpen = ref(false)
// 当前在弹窗中查看的副本（对齐 DungeonSource 的详情弹窗模式）
const selectedDungeon = ref<Dungeon | null>(null)

/**
 * 副本详情弹窗显示状态：选中副本即打开，关闭时清空选中。
 */
const showDungeonDialog = computed({
    get: () => selectedDungeon.value !== null,
    set: (value: boolean) => {
        if (!value) {
            selectedDungeon.value = null
        }
    },
})

let calculator: LevelUpCalculator | null = null
// 请求ID，用于解决异步竞态条件
let latestRequestId = 0
// 防抖定时器，避免频繁计算导致UI卡顿
let debounceTimer: number | null = null

/**
 * 获取时间估算请求配置
 * @returns 传递给计算器的时间估算配置
 */
function getTimeEstimateRequestConfig(): TimeEstimateConfig {
    const dropRateBonusPercent = Number(timeEstimateConfig.value.dungeonDropRateBonusPercent)
    const dungeonTimeMultiplier = Number(timeEstimateConfig.value.dungeonTimeMultiplier)

    const defenseTime = Number(timeEstimateConfig.value.dungeonTypeTimes.Defense)
    const extermProTime = Number(timeEstimateConfig.value.dungeonTypeTimes.ExtermPro)
    const survivalMiniProTime = Number(timeEstimateConfig.value.dungeonTypeTimes.SurvivalMiniPro)

    return {
        dungeonDropRateBonus: Number.isFinite(dropRateBonusPercent) ? Math.max(-99, dropRateBonusPercent) / 100 : 0,
        dungeonTimeMultiplier: Number.isFinite(dungeonTimeMultiplier) ? Math.max(0.01, dungeonTimeMultiplier) : 1,
        dungeonTypeTimes: {
            Defense: Number.isFinite(defenseTime) ? Math.max(0.01, defenseTime) : 1,
            ExtermPro: Number.isFinite(extermProTime) ? Math.max(0.01, extermProTime) : 0.5,
            SurvivalMiniPro: Number.isFinite(survivalMiniProTime) ? Math.max(0.01, survivalMiniProTime) : 0.7,
        },
    }
}

/**
 * 将已装备魔之楔转换为计算配置。
 * 从 0 级估算完整养成开销（含图纸/道具箱获取成本），避免已满级魔之楔估算为空。
 */
watch(
    () => props.mods,
    () => {
        mods.value = props.mods
            .filter((mod): mod is LeveledMod => mod !== null)
            .map(mod => ({
                id: mod.id,
                currentLevel: 0,
                targetLevel: mod.maxLevel,
                count: 1,
            }))
        scheduleCalculate()
    },
    { immediate: true, deep: true }
)

// 估算配置变化时重新计算
watch(
    () => timeEstimateConfig.value,
    () => scheduleCalculate(),
    { deep: true }
)

/**
 * 防抖触发计算
 */
function scheduleCalculate() {
    if (debounceTimer) {
        clearTimeout(debounceTimer)
    }
    debounceTimer = window.setTimeout(() => {
        debounceTimer = null
        void calculate()
    }, 400)
}

/**
 * 计算已装备魔之楔的养成开销与时间估算（Web Worker 后台计算）
 */
async function calculate() {
    if (dataPackBootstrapLoading.value) return
    if (!isDataPackHydrated()) {
        result.value = null
        return
    }
    if (mods.value.length === 0) {
        result.value = null
        return
    }
    if (!calculator) {
        calculator = new LevelUpCalculator()
    }

    // 递增请求ID并保存当前请求ID
    const requestId = ++latestRequestId
    calculating.value = true
    try {
        const actualMods = mods.value.map(item => modMap.get(item.id)).filter((mod): mod is NonNullable<typeof mod> => mod !== undefined)
        const configs = mods.value.map(item => ({
            currentLevel: item.currentLevel,
            targetLevel: item.targetLevel,
            count: item.count,
        }))

        const merged = await calculator.mergeCalculate(undefined, undefined, undefined, undefined, actualMods, configs)
        if (requestId !== latestRequestId) return

        const modResult = merged.modResult
        if (!modResult) {
            result.value = null
            return
        }
        const timeEstimate = await calculator.estimateTime(modResult.totalCost, getTimeEstimateRequestConfig())
        if (requestId !== latestRequestId) return

        result.value = { ...modResult, timeEstimate }
    } catch (error) {
        console.error("迷你开销计算失败:", error)
        if (requestId === latestRequestId) {
            result.value = null
        }
    } finally {
        if (requestId === latestRequestId) {
            calculating.value = false
        }
    }
}

/**
 * 一键跳转完整计算器：将当前魔之楔写入 lvup.mods 覆盖原计划，
 * 先取消待执行计算并销毁 worker，再跳转并定位到魔之楔页签。
 */
function jumpToFullCalculator() {
    lvupMods.value = mods.value.map(item => ({
        id: item.id,
        config: {
            currentLevel: item.currentLevel,
            targetLevel: item.targetLevel,
            count: item.count,
        },
    }))
    // 处理生命周期：取消待执行计算、销毁 worker 实例
    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
    calculator?.destroy()
    calculator = null
    // 跳转完整计算器并定位到魔之楔页签
    void router.push("/levelup?tab=mods")
}

onBeforeUnmount(() => {
    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
    calculator?.destroy()
    calculator = null
})

// 副本行数据：合并掉落副本与次数/原因
const dungeonRows = computed(() => {
    const dungeonTimes = result.value?.timeEstimate?.dungeonTimes
    if (!dungeonTimes) return []
    return Object.entries(dungeonTimes)
        .map(([id, [times, reason]]) => {
            const dungeon = dungeonMap.get(+id)
            if (!dungeon) return null
            return { dungeon, times, reason }
        })
        .filter((row): row is { dungeon: Dungeon; times: number; reason: string } => row !== null)
})

// 时间估算配置项，驱动模板渲染（与完整计算器保持一致）
const timeEstimateFields = [
    { key: "dungeonDropRateBonusPercent", label: "掉落率加成(%)", min: -100, max: 1000, step: 1 },
    { key: "dungeonTimeMultiplier", label: "副本耗时倍率", min: 0.01, max: 20, step: 0.01 },
] as const

const dungeonTimeFields = [
    { key: "Defense", label: "扼守", hint: "单次时间(分钟)" },
    { key: "ExtermPro", label: "驱离", hint: "单次时间(分钟)" },
    { key: "SurvivalMiniPro", label: "避险", hint: "单次时间(分钟)" },
] as const
</script>

<template>
    <div class="rounded-xs border border-primary/25 bg-primary/5">
        <!-- 头部：标题 + 一键跳转完整计算器 -->
        <div class="flex items-center gap-2 px-3 py-2.5">
            <div class="flex items-center gap-1.5 text-xs font-medium tracking-wide text-base-content/70">
                <Icon icon="ri:calculator-line" class="text-primary" />
                养成开销估算
            </div>
            <div class="ml-auto flex items-center gap-1.5">
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center gap-1 rounded-xs border border-base-content/15 px-2 text-[11px] text-base-content/55 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                    :aria-expanded="isConfigOpen"
                    @click="isConfigOpen = !isConfigOpen"
                >
                    <Icon icon="ri:settings-3-line" />
                    估算设置
                </button>
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center gap-1 rounded-xs border border-primary/40 bg-primary/10 px-2 text-[11px] font-medium text-primary transition-colors duration-150 hover:bg-primary/20"
                    @click="jumpToFullCalculator"
                >
                    <Icon icon="ri:arrow-right-up-line" />
                    完整计算器
                </button>
            </div>
        </div>

        <!-- 估算设置（可折叠，与完整计算器互通） -->
        <div v-if="isConfigOpen" class="border-t border-base-content/10 px-3 py-2.5">
            <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                <label
                    v-for="field in timeEstimateFields"
                    :key="field.key"
                    class="flex flex-col gap-1 rounded-xs border border-base-content/10 bg-base-100/60 px-2.5 py-2"
                >
                    <span class="text-[11px] text-base-content/50">{{ field.label }}</span>
                    <input
                        v-model.number="timeEstimateConfig[field.key]"
                        type="number"
                        class="w-full bg-transparent text-xs font-medium tabular-nums outline-none"
                        :min="field.min"
                        :max="field.max"
                        :step="field.step"
                    />
                </label>
                <label
                    v-for="field in dungeonTimeFields"
                    :key="field.key"
                    class="flex flex-col gap-1 rounded-xs border border-base-content/10 bg-base-100/60 px-2.5 py-2"
                >
                    <span class="text-[11px] text-base-content/50">{{ field.label }} · {{ field.hint }}</span>
                    <input
                        v-model.number="timeEstimateConfig.dungeonTypeTimes[field.key]"
                        type="number"
                        class="w-full bg-transparent text-xs font-medium tabular-nums outline-none"
                        min="0.01"
                        max="60"
                        step="0.1"
                    />
                </label>
            </div>
            <p class="mt-2 text-[11px] text-base-content/40">以上参数仅影响时间估算结果，不影响资源消耗统计</p>
        </div>

        <!-- 计算中 -->
        <div v-if="calculating" class="flex items-center justify-center gap-2 px-3 py-6">
            <span class="loading loading-spinner loading-sm text-primary"></span>
            <span class="text-xs text-base-content/50">正在估算副本开销...</span>
        </div>

        <!-- 无魔之楔 -->
        <div v-else-if="mods.length === 0" class="flex items-center justify-center gap-2 px-3 py-6">
            <Icon icon="po-A" class="text-xl text-base-content/25" />
            <span class="text-xs text-base-content/50">未装备魔之楔，暂无开销估算</span>
        </div>

        <!-- 估算结果 -->
        <template v-else-if="result?.timeEstimate">
            <div class="flex flex-wrap items-end gap-x-5 gap-y-2 px-3 pb-2.5">
                <div class="flex items-baseline gap-2">
                    <span class="font-orbitron text-3xl font-bold tabular-nums text-primary">{{ result.timeEstimate.days }}</span>
                    <span class="text-xs text-base-content/60">天</span>
                    <span class="font-orbitron text-xl font-bold tabular-nums text-primary">{{ result.timeEstimate.hours }}</span>
                    <span class="text-xs text-base-content/60">小时</span>
                    <span class="font-orbitron text-xl font-bold tabular-nums text-primary">{{ result.timeEstimate.mins }}</span>
                    <span class="text-xs text-base-content/60">分钟</span>
                </div>
                <span class="text-[11px] text-base-content/40">
                    需挑战
                    <b class="font-orbitron tabular-nums">{{ Object.keys(result.timeEstimate.dungeonTimes).length }}</b>
                    种副本
                </span>
            </div>
            <div class="p-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                <!-- 副本卡片：点击打开详情弹窗（对齐 DungeonSource），副本名可直达详情页 -->
                <div
                    v-for="{ dungeon, times, reason } in dungeonRows"
                    :key="dungeon.id"
                    class="group flex w-full cursor-pointer items-center gap-2.5 rounded-xs border border-base-content/10 bg-base-100/60 px-2.5 py-2 text-left transition-colors duration-200 hover:border-primary/40 hover:bg-base-content/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    @click="selectedDungeon = dungeon"
                >
                    <img
                        v-if="dungeon.e"
                        :src="LeveledChar.elementUrl(dungeon.e)"
                        alt=""
                        class="h-7 w-3.5 shrink-0 rounded-xs object-cover"
                    />
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-xs font-medium">
                            <SRouterLink :to="`/db/dungeon/${dungeon.id}`" stop class="hover:underline">
                                {{ getDungeonName(dungeon) }}
                            </SRouterLink>
                        </div>
                        <div class="mt-0.5 truncate text-[11px] text-base-content/45">{{ reason }}</div>
                    </div>
                    <span class="shrink-0 rounded-xs px-1.5 py-0.5 text-[10px]" :class="getDungeonType(dungeon.t).color + ' text-white'">
                        {{ getDungeonType(dungeon.t).label }}
                    </span>
                    <span class="shrink-0 font-orbitron text-sm font-bold tabular-nums text-primary">×{{ times }}</span>
                </div>
            </div>

            <!-- 副本详情弹窗（复用 DungeonSource 的 SourceDetailDialog 模式） -->
            <SourceDetailDialog v-model="showDungeonDialog">
                <DBDungeonDetailItem v-if="selectedDungeon" :dungeon="selectedDungeon" />
            </SourceDetailDialog>
        </template>

        <!-- 无可估算结果（数据未就绪） -->
        <div v-else class="flex items-center justify-center gap-2 px-3 py-6">
            <Icon icon="ri:time-line" class="text-xl text-base-content/25" />
            <span class="text-xs text-base-content/50">暂无估算结果</span>
        </div>
    </div>
</template>
