<script lang="ts">
import { raceLotteryData } from "@/data/d/race-lottery.data"

/** 魔灵竞速活动开始时间（黄金旅途·魔灵竞速 EventId 103025），用于计算当前赛事天数。 */
const RACE_EVENT_START = 1785945600

/**
 * 计算当前赛事天数，用于筛选已解锁的赛内词条。
 * @returns 1 到 活动天数之间的天数。
 */
function computeCurrentDay(): number {
    const now = Math.floor(Date.now() / 1000)
    const day = Math.floor((now - RACE_EVENT_START) / 86400) + 1
    return Math.max(1, Math.min(day, raceLotteryData.maxStakes.length))
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { type RaceLotteryInsideBuff, type RaceLotteryPlayer } from "@/data/d/race-lottery.data"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments, type StoryTextSegment } from "@/utils/story-text"

interface RaceLotterySimPlayer {
    player: RaceLotteryPlayer
    speed: number
}

const props = withDefaults(
    defineProps<{
        players: RaceLotterySimPlayer[]
        day?: number
    }>(),
    {
        day: () => computeCurrentDay(),
    }
)

const emit = defineEmits<{ close: [] }>()

const TRACK_LENGTH = 100
const SPRINT_TIME = 30
const BUFF_MARKS = [5, 10, 15, 20, 25]
const ALL_MARKS = [...BUFF_MARKS, SPRINT_TIME]
const SPRINT_BUFF_ID = 3002
const SPEED_OPTIONS = [1, 2, 4, 8]
const MAX_LOG_ENTRIES = 200

type SimPhase = "idle" | "running" | "done"

interface SimRunner {
    player: RaceLotteryPlayer
    initialSpeed: number
    speed: number
    distance: number
    buff: RaceLotteryInsideBuff | null
    finished: boolean
    finishTime: number | null
    rank: number | null
    laneTop: string
    laneHeight: string
}

interface LogEntry {
    key: number
    time: number
    segments: StoryTextSegment[]
}

/**
 * 按当天可解锁的赛内词条池，同名词条只保留最后一个，且剔除随机权重为 0 的词条。
 */
const buffPool = computed(() => {
    const eligible = raceLotteryData.insideBuffs.filter(buff => buff.unlockDay <= props.day)
    const result: RaceLotteryInsideBuff[] = []
    const indexByName = new Map<string, number>()
    for (const buff of eligible) {
        const existingIndex = indexByName.get(buff.name)
        if (existingIndex !== undefined) {
            result[existingIndex] = buff
        } else {
            indexByName.set(buff.name, result.length)
            result.push(buff)
        }
    }
    return result.filter(buff => buff.randomWeight > 0)
})

const sprintBuff = computed(() => raceLotteryData.insideBuffs.find(buff => buff.insideBuffId === SPRINT_BUFF_ID))

const runners = ref<SimRunner[]>([])
const log = ref<LogEntry[]>([])
const raceTime = ref(0)
const finishedCount = ref(0)
const state = ref<SimPhase>("idle")
const speedMult = ref(1)
const logRef = ref<HTMLElement | null>(null)
let keyCounter = 0
let rafId = 0
let lastTimestamp = 0

/**
 * 按随机权重从词条池中抽取一个词条。
 * @returns 抽中的赛内词条。
 */
function pickBuff(): RaceLotteryInsideBuff {
    const pool = buffPool.value
    const total = pool.reduce((sum, buff) => sum + buff.randomWeight, 0)
    if (total <= 0) {
        return pool[pool.length - 1] ?? raceLotteryData.insideBuffs[0]
    }
    let roll = Math.random() * total
    for (const buff of pool) {
        roll -= buff.randomWeight
        if (roll < 0) return buff
    }
    return pool[pool.length - 1]
}

/**
 * 记录一条词条日志，渲染 description 的高亮标签并把 %s 替换为选手名。
 */
function pushLog(buff: RaceLotteryInsideBuff, time: number, playerName: string) {
    const text = (buff.description || "").replace(/%s/g, playerName)
    log.value.push({
        key: ++keyCounter,
        time,
        segments: parseStoryTextSegments(text, DEFAULT_STORY_TEXT_CONFIG),
    })
    if (log.value.length > MAX_LOG_ENTRIES) {
        log.value.splice(0, log.value.length - MAX_LOG_ENTRIES)
    }
}

/**
 * 为选手应用一个词条并更新其当前速度。
 */
function applyBuff(runner: SimRunner, buff: RaceLotteryInsideBuff, time: number) {
    runner.buff = buff
    runner.speed = runner.initialSpeed * buff.effect
    pushLog(buff, time, runner.player.name)
}

/**
 * 在时间节点上为所有未完赛选手重抽词条，30 秒时切换为冲刺词条。
 */
function applyBuffsAt(mark: number) {
    for (const runner of runners.value) {
        if (runner.finished) continue
        const buff = mark === SPRINT_TIME && sprintBuff.value ? sprintBuff.value : pickBuff()
        applyBuff(runner, buff, mark)
    }
}

/**
 * 让所有未完赛选手按当前速度前进一段距离。
 */
function movePlayers(dt: number, endTime: number) {
    if (dt <= 0) return
    for (const runner of runners.value) {
        if (runner.finished) continue
        runner.distance = Math.max(0, Math.min(TRACK_LENGTH, runner.distance + runner.speed * dt))
        if (runner.distance >= TRACK_LENGTH) {
            runner.distance = TRACK_LENGTH
            runner.finished = true
            runner.finishTime = endTime
            runner.rank = ++finishedCount.value
        }
    }
}

/**
 * 推进一步模拟，按词条重抽节点分段计算移动距离，保证大步长下依然准确。
 */
function runSimStep(dt: number) {
    const prev = raceTime.value
    raceTime.value += dt
    let cursor = prev
    for (const mark of ALL_MARKS) {
        if (prev < mark && mark <= raceTime.value) {
            movePlayers(mark - cursor, mark)
            cursor = mark
            applyBuffsAt(mark)
        }
    }
    const remaining = raceTime.value - cursor
    if (remaining > 0) movePlayers(remaining, raceTime.value)
}

function tick(timestamp: number) {
    if (state.value !== "running") return
    if (lastTimestamp) {
        const dtReal = Math.min((timestamp - lastTimestamp) / 1000, 0.1)
        runSimStep(dtReal * speedMult.value)
    }
    lastTimestamp = timestamp
    if (finishedCount.value >= runners.value.length) {
        finishRace()
        return
    }
    rafId = requestAnimationFrame(tick)
}

/**
 * 开始新一轮赛跑：重置状态、抽取初始词条并启动动画循环。
 */
function start() {
    cancelAnimationFrame(rafId)
    log.value = []
    raceTime.value = 0
    finishedCount.value = 0
    keyCounter = 0
    lastTimestamp = 0
    state.value = "running"
    const total = Math.max(1, props.players.length)
    const laneHeight = 100 / total
    runners.value = props.players.map((item, index) => ({
        player: item.player,
        initialSpeed: Math.max(0.1, item.speed),
        speed: Math.max(0.1, item.speed),
        distance: 0,
        buff: null,
        finished: false,
        finishTime: null,
        rank: null,
        laneTop: `${index * laneHeight}%`,
        laneHeight: `${laneHeight}%`,
    }))
    for (const runner of runners.value) {
        applyBuff(runner, pickBuff(), 0)
    }
    rafId = requestAnimationFrame(tick)
}

/**
 * 跳过剩余动画，直接推演到全部选手完赛。
 */
function skip() {
    if (state.value === "done") return
    cancelAnimationFrame(rafId)
    let guard = 0
    while (finishedCount.value < runners.value.length && guard < 200000) {
        runSimStep(0.05)
        guard++
    }
    finishRace()
}

function finishRace() {
    cancelAnimationFrame(rafId)
    state.value = "done"
}

function resetAndStart() {
    start()
}

const finishedSorted = computed(() => runners.value.filter(runner => runner.finished).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)))

const top6 = computed(() => finishedSorted.value.slice(0, 6))

const liveRanking = computed(() =>
    [...runners.value]
        .sort((a, b) => {
            if (a.finished && b.finished) return (a.rank ?? 0) - (b.rank ?? 0)
            if (a.finished) return -1
            if (b.finished) return 1
            return b.distance - a.distance
        })
        .slice(0, 6)
)

function getPlayerIconUrl(icon: string): string {
    return `/imgs/webp/${icon}.webp`
}

watch(
    () => log.value.length,
    () => {
        nextTick(() => {
            if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight
        })
    }
)

onMounted(() => start())
onBeforeUnmount(() => cancelAnimationFrame(rafId))
</script>

<template>
    <div class="isolate relative flex h-full w-full flex-col overflow-hidden bg-base-100 text-base-content">
        <!-- 顶栏 -->
        <div class="flex items-center gap-3 border-b border-base-300 bg-base-200/50 py-2 pl-2 pr-4">
            <button type="button" class="btn btn-ghost btn-xs" aria-label="关闭模拟" title="关闭模拟" @click="emit('close')">
                <Icon icon="ri:close-line" />
            </button>
            <Icon icon="ri:play-fill" class="text-lg text-primary" />
            <span class="text-sm font-bold">赛跑模拟</span>
            <span class="badge badge-sm badge-outline">第 {{ props.day }} 天</span>
            <span class="text-xs tabular-nums text-base-content/50">{{ raceTime.toFixed(1) }}s</span>
            <span v-if="state === 'running'" class="text-xs text-base-content/50">{{ finishedCount }}/{{ runners.length }} 完赛</span>
            <div class="ml-auto flex items-center gap-1">
                <span class="mr-1 text-xs text-base-content/50">倍速</span>
                <button
                    v-for="speed in SPEED_OPTIONS"
                    :key="speed"
                    type="button"
                    class="btn btn-ghost btn-xs"
                    :class="speedMult === speed && 'btn-primary'"
                    @click="speedMult = speed"
                >
                    {{ speed }}x
                </button>
                <button v-if="state === 'running'" type="button" class="btn btn-ghost btn-xs gap-1" @click="skip">
                    <Icon icon="ri:skip-forward-line" />
                    跳过
                </button>
            </div>
        </div>

        <!-- 赛道 -->
        <div class="relative min-h-0 flex-1 mx-8">
            <div class="absolute inset-y-0 left-0 w-px bg-base-content/25" />
            <div class="absolute inset-y-0 right-0 w-1 bg-error/80" />
            <template v-for="runner in runners" :key="runner.player.playerId">
                <div
                    class="absolute inset-x-0 flex items-center justify-center border-b border-base-content/5"
                    :style="{ top: runner.laneTop, height: runner.laneHeight }"
                >
                    <div
                        class="absolute flex flex-col items-center"
                        :style="{ left: runner.distance + '%', transform: 'translateX(-50%)' }"
                    >
                        <span v-if="!runner.finished" class="max-w-20 truncate text-[0.5rem] leading-none text-base-content/60">
                            {{ runner.player.name }}
                        </span>
                        <div class="relative mt-0.5">
                            <img
                                :src="getPlayerIconUrl(runner.player.icon)"
                                :alt="runner.player.name"
                                class="size-5 object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.2)]"
                            />
                            <span
                                v-if="runner.finished && runner.rank"
                                class="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-neutral px-1.5 py-px text-[0.55rem] font-black leading-none text-neutral-content"
                            >
                                {{ runner.rank }}
                            </span>
                        </div>
                    </div>
                </div>
            </template>
        </div>

        <!-- 距离标尺 -->
        <div class="relative mx-8 h-5 shrink-0 border-t border-base-300/60 text-[0.6rem] text-base-content/40">
            <span class="absolute left-0 top-0.5">0m</span>
            <span class="absolute left-1/2 top-0.5 -translate-x-1/2">50m</span>
            <span class="absolute right-0 top-0.5">100m</span>
        </div>

        <!-- 底部信息区 -->
        <div class="flex h-36 shrink-0 border-t border-base-300 bg-base-200/30">
            <div class="flex w-80 max-w-[55%] flex-col border-r border-base-300">
                <div class="flex items-center gap-2 border-b border-base-300/60 px-3 py-1 text-xs font-semibold text-base-content/60">
                    <Icon icon="ri:chat-3-line" class="text-sm text-primary" />
                    LOG
                </div>
                <div ref="logRef" class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-1.5 text-xs leading-snug">
                    <div v-for="entry in log" :key="entry.key" class="flex gap-1.5">
                        <span class="shrink-0 tabular-nums text-base-content/35">{{ entry.time.toFixed(1) }}s</span>
                        <span class="min-w-0 wrap-break-word">
                            <template v-for="(segment, index) in entry.segments" :key="index">
                                <span :class="segment.tone === 'highlight' ? 'font-semibold text-primary' : ''">
                                    {{ segment.text }}
                                </span>
                            </template>
                        </span>
                    </div>
                </div>
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex items-center gap-2 border-b border-base-300/60 px-3 py-1 text-xs font-semibold text-base-content/60">
                    <Icon icon="ri:bar-chart-line" class="text-sm text-primary" />
                    RANK
                </div>
                <div class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-1.5">
                    <div v-for="(item, index) in liveRanking" :key="item.player.playerId" class="flex items-center gap-2 text-xs">
                        <span
                            class="w-4 shrink-0 text-right font-black tabular-nums"
                            :class="index === 0 ? 'text-warning' : 'text-base-content/40'"
                        >
                            {{ item.rank ?? index + 1 }}
                        </span>
                        <img :src="getPlayerIconUrl(item.player.icon)" :alt="item.player.name" class="size-4 shrink-0 object-contain" />
                        <span class="min-w-0 flex-1 truncate text-base-content/80">{{ item.player.name }}</span>
                        <span class="shrink-0 tabular-nums text-base-content/45">
                            {{ item.finished ? `${(item.finishTime ?? 0).toFixed(1)}s` : `${item.distance.toFixed(1)}m` }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 完赛结果覆盖层 -->
        <div v-if="state === 'done'" class="absolute inset-0 z-10 flex items-center justify-center bg-base-100/75 backdrop-blur-sm">
            <div class="w-96 max-w-[92%] rounded-xl border border-primary/30 bg-base-100 shadow-2xl">
                <div class="flex items-center justify-between border-b border-base-200 px-4 py-3">
                    <h3 class="flex items-center gap-2 text-sm font-bold">
                        <Icon icon="ri:trophy-line" class="text-lg text-warning" />
                        比赛结束 · 前 6 名
                    </h3>
                    <button type="button" class="btn btn-ghost btn-xs" aria-label="关闭" @click="emit('close')">
                        <Icon icon="ri:close-line" />
                    </button>
                </div>
                <div class="space-y-1 p-3">
                    <div
                        v-for="item in top6"
                        :key="item.player.playerId"
                        class="flex items-center gap-2 rounded-md px-2 py-1"
                        :class="
                            item.rank === 1 ? 'bg-warning/10' : item.rank === 2 ? 'bg-base-200/60' : item.rank === 3 ? 'bg-primary/5' : ''
                        "
                    >
                        <span
                            class="flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums"
                            :class="
                                item.rank === 1
                                    ? 'bg-warning text-warning-content'
                                    : item.rank === 2
                                      ? 'bg-base-300 text-base-content'
                                      : item.rank === 3
                                        ? 'bg-primary text-primary-content'
                                        : 'bg-base-200 text-base-content/60'
                            "
                        >
                            {{ item.rank }}
                        </span>
                        <img :src="getPlayerIconUrl(item.player.icon)" :alt="item.player.name" class="size-7 shrink-0 object-contain" />
                        <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ item.player.name }}</span>
                        <span class="shrink-0 text-xs tabular-nums text-base-content/50">{{ item.finishTime?.toFixed(1) }}s</span>
                    </div>
                </div>
                <div class="flex justify-end gap-2 border-t border-base-200 px-4 py-3">
                    <button type="button" class="btn btn-ghost btn-sm" @click="emit('close')">关闭</button>
                    <button type="button" class="btn btn-primary btn-sm gap-1" @click="resetAndStart">
                        <Icon icon="ri:refresh-line" />
                        再跑一次
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
