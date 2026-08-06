<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { computed, onMounted, ref, watch } from "vue"
import { execScript } from "@/api/app"
import { raceLotteryData, raceLotteryPlayersOrder } from "@/data/d/race-lottery.data"
import { env } from "@/env"
import { useUserStore } from "@/store/user"
import { mergeRaceLotteryBuffIds, parseRaceLotteryOcr, type RaceLotteryBuffIds, type RaceLotteryOcrBuff } from "@/utils/race-lottery-ocr"

type RaceLotteryEntry = {
    id: string
    playerId: number
    buffIds: RaceLotteryBuffIds
    submittedBy: string
    isMine: boolean
    createdAt: number
    updatedAt: number
}

type DailyResponse = {
    date: string
    entries: RaceLotteryEntry[]
}

type RaceLotteryCaptureRegion = {
    x: number
    y: number
    width: number
    height: number
}

type RaceLotteryOcrScriptResponse = {
    cancelled?: boolean
    region?: RaceLotteryCaptureRegion
    text: string
}

const GAME_PROCESS_NAME = "EM-Win64-Shipping.exe"
const OCR_SCOPE = "__race_lottery_ocr__"
const BASE_GAME_WIDTH = 1600
const BASE_GAME_HEIGHT = 900

const user = useUserStore()
const selectedDate = ref(getLocalDate())
const orderedPlayers = raceLotteryPlayersOrder.flatMap(playerId => {
    const player = raceLotteryData.players.find(item => item.playerId === playerId)
    return player ? [player] : []
})
const selectedPlayerId = ref(orderedPlayers[0]?.playerId || 0)
const dailyEntries = ref<RaceLotteryEntry[]>([])
const selectedBuffIds = ref<RaceLotteryBuffIds>([0, 0, 0])
const loading = ref(false)
const submitting = ref(false)
const ocrRunning = ref(false)
const ocrResultText = ref("")
const errorMessage = ref("")
const captureRegion = useLocalStorage<RaceLotteryCaptureRegion | null>("race-lottery.ocr-region", null)

const coveredPlayerCount = computed(() => new Set(dailyEntries.value.map(entry => entry.playerId)).size)
const raceLotteryOcrBuffs: RaceLotteryOcrBuff[] = [...raceLotteryData.outsideBuffs.map(buff => ({ buffId: buff.rumorId, name: buff.name }))]
const raceLotteryBuffById = new Map(raceLotteryData.outsideBuffs.map(buff => [buff.rumorId, buff]))
const hasSelectedBuff = computed(() => selectedBuffIds.value.some(buffId => buffId > 0))
const selectedPlayer = computed(() => raceLotteryData.players.find(player => player.playerId === selectedPlayerId.value))
const selectedPlayerEntries = computed(() => dailyEntries.value.filter(entry => entry.playerId === selectedPlayerId.value))
const selectedPlayerStatusIds = computed(() => mergeRaceLotteryBuffIds(selectedPlayerEntries.value.map(entry => entry.buffIds)))
const selectedPlayerStatusLines = computed(() =>
    Array.from({ length: 3 }, (_, statusIndex) => {
        const buffId = selectedPlayerStatusIds.value[statusIndex] || 0
        const buff = buffId ? raceLotteryBuffById.get(buffId) : undefined
        const entry = buffId ? selectedPlayerEntries.value.find(item => item.buffIds.includes(buffId)) : undefined
        return {
            buffId,
            name: buff?.name || (buffId ? `未知词条 ${buffId}` : "未知"),
            buffMap: buff?.buffMap || "",
            submittedBy: entry?.submittedBy || "",
        }
    })
)

/**
 * 返回选手当日收到的社区词条数量。
 * @param playerId 选手 ID。
 * @returns 词条提交数量。
 */
function getPlayerEntryCount(playerId: number): number {
    return dailyEntries.value.filter(entry => entry.playerId === playerId).length
}

/**
 * 返回选手已识别出的不同状态数量，用于缩略卡状态点。
 * @param playerId 选手 ID。
 * @returns 已识别状态数量。
 */
function getPlayerStatusCount(playerId: number): number {
    return mergeRaceLotteryBuffIds(dailyEntries.value.filter(entry => entry.playerId === playerId).map(entry => entry.buffIds)).length
}

/**
 * 获取选手已知的外部词条。
 * @param playerId 选手 ID
 * @returns 已知外部词条列表
 */
function getPlayerKnownOutsideBuffs(playerId: number) {
    const knownBuffIds = mergeRaceLotteryBuffIds(
        dailyEntries.value.filter(entry => entry.playerId === playerId).map(entry => entry.buffIds)
    )
    const knownBuffs = []
    for (const buffId of knownBuffIds) {
        const buff = raceLotteryData.outsideBuffs.find(item => item.rumorId === buffId)
        if (buff) knownBuffs.push(buff)
    }
    return knownBuffs
}

/**
 * 计算选手当前已知外部词条对应的最终速度。
 * @param playerId 选手 ID
 * @returns 已知词条存在时的最终速度，否则返回 null
 */
function getPlayerFinalSpeed(playerId: number): number | null {
    const player = raceLotteryData.players.find(item => item.playerId === playerId)
    if (!player) return null

    const knownBuffs = getPlayerKnownOutsideBuffs(playerId)
    if (!knownBuffs.length) return null

    return knownBuffs.reduce((speed, buff) => speed * buff.pValueEffect, player.defaultSpeed)
}

/**
 * 获取选手当前用于排名的速度。
 * @param playerId 选手 ID
 * @returns 已知词条的最终速度或基础速度
 */
function getPlayerCurrentSpeed(playerId: number): number {
    const player = raceLotteryData.players.find(item => item.playerId === playerId)
    return player ? (getPlayerFinalSpeed(playerId) ?? player.defaultSpeed) : 0
}

/**
 * 按正负方向分组外部词条的 buffMap。
 * @param playerId 选手 ID
 * @returns 红色负向和绿色正向 buffMap 分组
 */
function getPlayerBuffMapGroups(playerId: number): { negative: string[]; positive: string[] } {
    const groups = { negative: [] as string[], positive: [] as string[] }
    for (const buff of getPlayerKnownOutsideBuffs(playerId)) {
        if (buff.buffMap.startsWith("-")) groups.negative.push(buff.buffMap)
        else if (buff.buffMap.startsWith("+")) groups.positive.push(buff.buffMap)
    }
    return groups
}

/**
 * 将词条的 buffMap 拆成独立的正负号标记。
 * @param buffMap 词条正负号映射。
 * @returns 按原顺序排列的正负号。
 */
function getBuffMapMarks(buffMap: string): Array<"+" | "-"> {
    return Array.from(buffMap).filter((mark): mark is "+" | "-" => mark === "+" || mark === "-")
}

const fastestPlayers = computed(() =>
    orderedPlayers
        .map((player, order) => ({
            player,
            order,
            speed: getPlayerCurrentSpeed(player.playerId),
        }))
        .sort((left, right) => right.speed - left.speed || left.order - right.order)
        .slice(0, 6)
)

/**
 * 获取浏览器本地日期，避免 UTC 日期在东八区跨日时显示错误。
 * @returns YYYY-MM-DD 格式日期。
 */
function getLocalDate(): string {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, "0")
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * 返回静态数据中的选手头像路径。
 * @param icon 导出后的资源名。
 * @returns 前端可访问的 webp 头像路径。
 */
function getPlayerIconUrl(icon: string): string {
    return `/imgs/webp/${icon}.webp`
}

/**
 * 构建脚本引擎 OCR 脚本。
 * @param region 已保存的 1600x900 基准坐标区域；为空时首次框选区域
 * @returns 临时脚本源码
 */
function buildRaceLotteryOcrScript(region: RaceLotteryCaptureRegion | null): string {
    const regionSource = region ? JSON.stringify(region) : "null"
    return `import { Cap } from "cap"
const hwnd = getWindowByProcessName(${JSON.stringify(GAME_PROCESS_NAME)})
if (!hwnd) throw new Error("未找到游戏窗口")
initOcr()
const c = new Cap(hwnd)
let region = ${regionSource}
if (!region) {
    const selected = await selectroi("RaceLottery 选手卡片区域", c.frame)
    if (selected) {
        region = {
            x: Math.round(selected[0]),
            y: Math.round(selected[1]),
            width: Math.round(selected[2]),
            height: Math.round(selected[3]),
        }
    }
}
let output = { cancelled: true, text: "" }
if (region) {
    const x = Math.max(0, Math.min(${BASE_GAME_WIDTH - 1}, Math.round(region.x)))
    const y = Math.max(0, Math.min(${BASE_GAME_HEIGHT - 1}, Math.round(region.y)))
    const width = Math.max(1, Math.min(${BASE_GAME_WIDTH} - x, Math.round(region.width)))
    const height = Math.max(1, Math.min(${BASE_GAME_HEIGHT} - y, Math.round(region.height)))
    const card = c.frame.roi(x, y, width, height)
    output = { cancelled: false, region, text: ocrText(card) }
}
export default JSON.stringify(output)`
}

/**
 * 截图并执行一次 RaceLottery OCR。
 * @returns OCR 原文与实际使用的区域
 */
async function requestRaceLotteryOcr(): Promise<RaceLotteryOcrScriptResponse> {
    const raw = (await execScript(buildRaceLotteryOcrScript(captureRegion.value), OCR_SCOPE, 120000)).trim()
    if (!raw) throw new Error("OCR 没有返回结果")
    return JSON.parse(raw) as RaceLotteryOcrScriptResponse
}

/**
 * 请求指定日期的公开词条。
 * @param date 日期。
 * @returns 单日数据。
 */
async function requestDailyData(date: string): Promise<DailyResponse> {
    const response = await fetch(`${env.apiEndpoint}/api/race-lottery/${encodeURIComponent(date)}`, {
        headers: { token: user.jwtToken },
    })
    const result = (await response.json()) as DailyResponse & { error?: string }
    if (!response.ok) throw new Error(result.error || "读取赛事数据失败")
    return result
}

/**
 * 加载当前日期的所有选手词条。
 */
async function loadDailyData(): Promise<void> {
    loading.value = true
    errorMessage.value = ""
    try {
        const result = await requestDailyData(selectedDate.value)
        dailyEntries.value = result.entries
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "读取赛事数据失败"
        dailyEntries.value = []
    } finally {
        loading.value = false
    }
}

/**
 * 回填当前用户在选中选手上的词条，方便继续编辑。
 */
function fillOwnEntry(): void {
    const buffIds = dailyEntries.value.find(entry => entry.playerId === selectedPlayerId.value && entry.isMine)?.buffIds
    selectedBuffIds.value = buffIds ? [...buffIds] : [0, 0, 0]
}

/**
 * 提交或更新当前用户对选中选手的词条。
 * @param playerId 选手 ID。
 * @param buffIds 三个状态位置的 buff ID。
 * @returns 是否提交成功。
 */
async function submitEntry(playerId = selectedPlayerId.value, buffIds = selectedBuffIds.value): Promise<boolean> {
    const player = raceLotteryData.players.find(item => item.playerId === playerId)
    const normalizedBuffIds: RaceLotteryBuffIds = [buffIds[0] || 0, buffIds[1] || 0, buffIds[2] || 0]
    if (!user.jwtToken || !player || !normalizedBuffIds.some(buffId => buffId > 0)) return false

    submitting.value = true
    errorMessage.value = ""
    try {
        const response = await fetch(`${env.apiEndpoint}/api/race-lottery/${encodeURIComponent(selectedDate.value)}/entries`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                token: user.jwtToken,
            },
            body: JSON.stringify({
                playerId: player.playerId,
                buffIds: normalizedBuffIds,
            }),
        })
        const result = (await response.json()) as { success?: boolean; entry?: RaceLotteryEntry; error?: string }
        if (!response.ok || !result.success || !result.entry) throw new Error(result.error || "提交失败")

        const index = dailyEntries.value.findIndex(entry => entry.id === result.entry?.id)
        if (index >= 0) dailyEntries.value[index] = result.entry
        else dailyEntries.value.push(result.entry)
        selectedPlayerId.value = player.playerId
        selectedBuffIds.value = [...result.entry.buffIds]
        return true
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "提交失败"
        return false
    } finally {
        submitting.value = false
    }
}

/**
 * 提交手动编辑的词条，隔离表单事件参数与通用提交函数。
 */
async function submitManualEntry(): Promise<void> {
    await submitEntry()
}

/**
 * 截图识别选手卡片并自动上传词条。
 */
async function runRaceLotteryOcrUpload(): Promise<void> {
    if (!env.isApp || ocrRunning.value || !user.jwtToken) return

    ocrRunning.value = true
    errorMessage.value = ""
    try {
        const result = await requestRaceLotteryOcr()
        if (result.cancelled) return
        if (result.region) captureRegion.value = result.region
        ocrResultText.value = result.text

        const parsed = parseRaceLotteryOcr(
            result.text,
            raceLotteryData.players.map(player => ({ playerId: player.playerId, name: player.name })),
            raceLotteryOcrBuffs
        )
        if (!parsed.playerId) throw new Error("OCR 未识别到选手名称")
        if (!parsed.buffIds.some(buffId => buffId > 0)) throw new Error(`已识别选手 ${parsed.playerName || ""}，但未识别到状态词条`)

        const submitted = await submitEntry(parsed.playerId, parsed.buffIds)
        if (!submitted) throw new Error("词条上传失败")
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : "OCR 上传失败"
    } finally {
        ocrRunning.value = false
    }
}

/**
 * 清除已保存的 OCR 区域，下次识别时重新框选。
 */
function resetCaptureRegion(): void {
    captureRegion.value = null
    ocrResultText.value = ""
}

watch(selectedDate, loadDailyData)
watch(selectedPlayerId, fillOwnEntry)
watch(dailyEntries, fillOwnEntry)

onMounted(loadDailyData)
</script>

<template>
    <div class="h-full overflow-auto">
        <main class="mx-auto max-w-375 space-y-3 p-3 sm:p-5">
            <header
                class="flex flex-col gap-3 rounded-lg border border-base-300 bg-base-100/80 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
                <div class="min-w-0">
                    <div class="flex items-baseline gap-3">
                        <h1 class="truncate text-xl font-bold sm:text-2xl">魔灵竞速</h1>
                        <span class="hidden text-xs font-semibold uppercase tracking-[0.18em] text-primary sm:inline">Race Lottery</span>
                    </div>
                    <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/60">
                        <span>{{ raceLotteryData.players.length }} 名选手</span>
                        <span>{{ coveredPlayerCount }}/{{ raceLotteryData.players.length }} 已有词条</span>
                        <span>{{ dailyEntries.length }} 条社区记录</span>
                    </div>
                </div>
                <label class="form-control w-full sm:w-auto sm:min-w-44">
                    <span class="label-text mb-1 text-xs">比赛日期</span>
                    <input v-model="selectedDate" type="date" class="input input-bordered input-sm w-full" />
                </label>
            </header>

            <section class="rounded-lg border border-warning/40 bg-warning/5 p-3 shadow-sm sm:p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <h2 class="text-sm font-bold sm:text-base">速度排名</h2>
                        <p class="text-xs text-base-content/55">排名不代表最终胜负</p>
                    </div>
                    <span class="text-xs font-bold uppercase tracking-[0.16em] text-warning">Top 6</span>
                </div>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <button
                        v-for="(item, index) in fastestPlayers"
                        :key="item.player.playerId"
                        type="button"
                        class="flex min-w-0 items-center gap-2 rounded-md border border-base-300 bg-base-100/80 p-2 text-left transition hover:border-warning/70 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
                        @click="selectedPlayerId = item.player.playerId"
                    >
                        <span class="w-5 shrink-0 text-center text-sm font-black tabular-nums text-warning">{{ index + 1 }}</span>
                        <img
                            :src="getPlayerIconUrl(item.player.icon)"
                            :alt="item.player.name"
                            loading="lazy"
                            class="size-10 shrink-0 object-contain"
                        />
                        <span class="min-w-0 flex-1">
                            <span class="block truncate text-xs font-semibold">{{ item.player.name }}</span>
                            <span class="mt-0.5 block text-sm font-bold tabular-nums text-primary">{{ item.speed.toFixed(2) }}</span>
                        </span>
                    </button>
                </div>
            </section>

            <div v-if="errorMessage" class="alert alert-error py-2 text-sm">
                <span>{{ errorMessage }}</span>
            </div>

            <div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,25rem)]">
                <section class="min-w-0 rounded-lg border border-base-300 bg-base-200/40 p-2 sm:p-3">
                    <div class="mb-2 flex items-center justify-between gap-3 px-1">
                        <div>
                            <h2 class="text-sm font-bold sm:text-base">选手名册</h2>
                            <p class="text-xs text-base-content/55">点击卡片查看详情</p>
                        </div>
                        <span v-if="loading" class="loading loading-spinner loading-sm text-primary" />
                    </div>

                    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <button
                            v-for="(player, index) in orderedPlayers"
                            :key="player.playerId"
                            type="button"
                            class="group relative aspect-3/4 min-w-0 overflow-hidden rounded-sm border-2 bg-base-100 p-1 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-warning/70 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-warning"
                            :class="
                                selectedPlayerId === player.playerId ? 'border-warning ring-1 ring-warning/70 shadow-md' : 'border-base-300'
                            "
                            :aria-label="`${player.name}，编号 ${index + 1}`"
                            @click="selectedPlayerId = player.playerId"
                        >
                            <div class="flex h-full min-h-0 flex-col text-base-content">
                                <div class="flex shrink-0 items-start justify-between px-1 pt-0.5">
                                    <div class="leading-none">
                                        <div class="text-[0.55rem] font-semibold uppercase tracking-wider text-base-content/50">No.</div>
                                        <div class="text-sm font-bold tabular-nums">{{ String(index + 1).padStart(2, "0") }}</div>
                                    </div>
                                    <div class="flex flex-wrap items-end gap-0.5 pt-0.5" aria-hidden="true">
                                        <span
                                            v-for="(buffMap, buffIndex) in getPlayerBuffMapGroups(player.playerId).negative"
                                            :key="`negative-${buffMap}-${buffIndex}`"
                                            class="flex h-3 min-w-3 items-center justify-center rounded-full border border-error/70 bg-error/10 px-0.5 text-[0.5rem] font-black leading-none text-error"
                                        >
                                            {{ buffMap }}
                                        </span>
                                        <span
                                            v-for="(buffMap, buffIndex) in getPlayerBuffMapGroups(player.playerId).positive"
                                            :key="`positive-${buffMap}-${buffIndex}`"
                                            class="flex h-3 min-w-3 items-center justify-center rounded-full border border-success/70 bg-success/10 px-0.5 text-[0.5rem] font-black leading-none text-success"
                                        >
                                            {{ buffMap }}
                                        </span>
                                    </div>
                                </div>
                                <div class="flex min-h-0 flex-1 items-center justify-center px-1 py-1">
                                    <img
                                        :src="getPlayerIconUrl(player.icon)"
                                        :alt="player.name"
                                        loading="lazy"
                                        class="size-full min-h-0 object-contain drop-shadow-[0_5px_4px_rgba(0,0,0,0.18)]"
                                    />
                                </div>
                                <div
                                    class="flex shrink-0 items-center justify-center gap-1 rounded-sm bg-neutral px-1 py-1 text-neutral-content"
                                >
                                    <span class="text-[0.68rem]">↗</span>
                                    <span class="text-xs font-bold tabular-nums sm:text-sm">
                                        {{ getPlayerCurrentSpeed(player.playerId).toFixed(2) }}
                                    </span>
                                </div>
                                <div class="flex shrink-0 items-center justify-center gap-1 py-0.5 text-[0.55rem] text-base-content/55">
                                    <span
                                        class="size-1.5 rounded-full"
                                        :class="getPlayerEntryCount(player.playerId) ? 'bg-success' : 'bg-base-content/25'"
                                    />
                                    <span>{{ getPlayerEntryCount(player.playerId) ? "已知" : "待补充" }}</span>
                                </div>
                            </div>
                        </button>
                    </div>
                </section>

                <aside class="min-w-0 space-y-3 lg:sticky lg:top-3">
                    <section v-if="selectedPlayer" class="overflow-hidden rounded-lg border-2 border-base-300 bg-base-100 shadow-md">
                        <div class="relative aspect-2/3 overflow-hidden bg-base-200/45">
                            <div class="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
                                <div class="leading-none">
                                    <div class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-base-content/50">No.</div>
                                    <div class="text-4xl font-bold tabular-nums text-base-content/80">
                                        {{ String(orderedPlayers.indexOf(selectedPlayer) + 1).padStart(2, "0") }}
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="text-xs font-semibold text-base-content/55">记录</div>
                                    <div class="mt-1 text-2xl font-bold tabular-nums text-primary">
                                        {{ getPlayerStatusCount(selectedPlayer.playerId) }}
                                    </div>
                                </div>
                            </div>
                            <div class="flex h-full flex-col pt-14">
                                <div class="min-h-0 flex-1 px-5 pb-1">
                                    <img
                                        :src="getPlayerIconUrl(selectedPlayer.icon)"
                                        :alt="selectedPlayer.name"
                                        class="size-full object-contain drop-shadow-[0_12px_8px_rgba(0,0,0,0.2)]"
                                    />
                                </div>
                                <div class="shrink-0 px-4 pb-3 text-center">
                                    <h2 class="truncate text-2xl font-bold sm:text-3xl">{{ selectedPlayer.name }}</h2>
                                    <div class="mt-1 flex items-center justify-center gap-2 text-sm text-base-content/60">
                                        <span>基础速度</span>
                                        <span class="text-xl font-bold tabular-nums text-base-content">{{
                                            selectedPlayer.defaultSpeed.toFixed(2)
                                        }}</span>
                                    </div>
                                </div>
                                <div class="max-h-52 shrink-0 space-y-1.5 overflow-auto bg-base-300 p-3 text-base-content">
                                    <div
                                        v-for="(statusLine, statusIndex) in selectedPlayerStatusLines"
                                        :key="`status-${statusIndex}`"
                                        class="flex min-h-9 min-w-0 items-center justify-between gap-2 rounded-sm border border-base-content/10 bg-neutral-content/10 px-2 py-1.5 text-sm"
                                        :title="statusLine.submittedBy ? `提交者：${statusLine.submittedBy}` : undefined"
                                    >
                                        <span class="min-w-0 flex-1 truncate font-medium text-base-content/85">
                                            状态{{ statusIndex + 1 }}：{{ statusLine.name }}
                                        </span>
                                        <span class="flex min-w-5 shrink-0 items-center justify-end gap-1" aria-hidden="true">
                                            <template v-if="statusLine.buffMap">
                                                <span
                                                    v-for="(mark, markIndex) in getBuffMapMarks(statusLine.buffMap)"
                                                    :key="`${statusIndex}-${markIndex}`"
                                                    class="flex size-5 items-center justify-center rounded-full border text-sm font-bold leading-none"
                                                    :class="
                                                        mark === '+'
                                                            ? 'border-success/80 bg-success/85 text-success-content'
                                                            : 'border-error/80 bg-error/85 text-error-content'
                                                    "
                                                >
                                                    {{ mark }}
                                                </span>
                                            </template>
                                            <span v-else class="size-5" />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section v-if="env.isApp" class="rounded-lg border border-secondary/30 bg-secondary/5 p-3">
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <h2 class="text-sm font-bold">截图识别上传</h2>
                                <p class="mt-1 text-xs text-base-content/60">
                                    {{ captureRegion ? "已保存区域" : "首次识别需要框选区域" }}
                                </p>
                            </div>
                            <Icon icon="ri:screenshot-2-line" class="size-5 shrink-0 text-secondary" />
                        </div>
                        <div class="mt-3 flex gap-2">
                            <button
                                class="btn btn-secondary btn-sm min-w-0 flex-1"
                                type="button"
                                :disabled="!user.jwtToken || ocrRunning"
                                @click="runRaceLotteryOcrUpload"
                            >
                                <span v-if="ocrRunning" class="loading loading-spinner loading-sm" />
                                <Icon v-else icon="ri:screenshot-2-line" />
                                {{ user.jwtToken ? "识别并上传" : "登录后识别上传" }}
                            </button>
                            <button
                                v-if="captureRegion"
                                class="btn btn-ghost btn-sm"
                                type="button"
                                title="重新选择截图区域"
                                aria-label="重新选择截图区域"
                                @click="resetCaptureRegion"
                            >
                                <Icon icon="ri:refresh-line" />
                            </button>
                        </div>
                        <div v-if="ocrResultText" class="mt-2 rounded-md bg-base-200/70 p-2">
                            <div class="text-xs text-base-content/50">最近一次 OCR</div>
                            <div class="mt-1 max-h-20 overflow-auto whitespace-pre-wrap wrap-break-word text-xs">{{ ocrResultText }}</div>
                        </div>
                    </section>

                    <section class="rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <h2 class="text-sm font-bold">提交词条</h2>
                        <form class="mt-3 space-y-3" @submit.prevent="submitManualEntry">
                            <label class="form-control">
                                <span class="label-text mb-1 text-xs">选手</span>
                                <select v-model="selectedPlayerId" class="select select-bordered select-sm w-full">
                                    <option v-for="player in orderedPlayers" :key="player.playerId" :value="player.playerId">
                                        {{ player.name }}
                                    </option>
                                </select>
                            </label>
                            <div class="space-y-2">
                                <div class="text-xs text-base-content/70">状态词条（3 个位置，可不选）</div>
                                <label v-for="slot in 3" :key="slot" class="form-control">
                                    <span class="label-text mb-1 text-xs">状态{{ slot }}</span>
                                    <select
                                        v-model="selectedBuffIds[slot - 1]"
                                        class="select select-bordered select-sm w-full"
                                        :aria-label="`状态${slot}`"
                                    >
                                        <option :value="0">不选择</option>
                                        <option v-for="buff in raceLotteryData.outsideBuffs" :key="buff.rumorId" :value="buff.rumorId">
                                            {{ buff.name }} ({{ buff.buffMap }})
                                        </option>
                                    </select>
                                </label>
                            </div>
                            <button
                                class="btn btn-primary btn-sm w-full"
                                type="submit"
                                :disabled="!user.jwtToken || submitting || !hasSelectedBuff"
                            >
                                <span v-if="submitting" class="loading loading-spinner loading-sm" />
                                {{ user.jwtToken ? "提交词条" : "登录后提交" }}
                            </button>
                        </form>
                    </section>

                    <section class="rounded-lg border border-base-300 bg-base-200/40 p-3">
                        <h2 class="text-sm font-bold">每日最高投注</h2>
                        <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div v-for="item in raceLotteryData.maxStakes" :key="item.EventDay" class="flex justify-between gap-2">
                                <span class="text-base-content/60">第 {{ item.EventDay }} 天</span>
                                <span class="font-medium">{{ item.MaxStake.toLocaleString() }}</span>
                            </div>
                        </div>
                    </section>

                    <details class="rounded-lg border border-base-300 bg-base-200/40 p-3">
                        <summary class="cursor-pointer text-sm font-bold">活动词条参考</summary>
                        <div class="mt-3 space-y-3 text-sm">
                            <div v-for="buff in raceLotteryData.outsideBuffs" :key="buff.rumorId" class="flex justify-between gap-3">
                                <span>{{ buff.name }}</span>
                                <span class="whitespace-nowrap text-base-content/60">{{ buff.buffMap }} · ×{{ buff.pValueEffect }}</span>
                            </div>
                            <div class="divider my-1" />
                            <div class="py-1 text-secondary text-xs">赛中</div>
                            <div v-for="buff in raceLotteryData.insideBuffs" :key="buff.insideBuffId" class="flex justify-between gap-3">
                                <span>{{ buff.name }}</span>
                                <span class="whitespace-nowrap text-base-content/60">第 {{ buff.unlockDay }} 天 · ×{{ buff.effect }}</span>
                            </div>
                        </div>
                    </details>
                </aside>
            </div>
        </main>
    </div>
</template>
