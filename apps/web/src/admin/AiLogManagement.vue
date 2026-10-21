<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { type AiLogRequestMeta, type AiLogStats, listAiLogs, pruneAiLogs, readAiLogStats } from "@/api/aiLog"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { formatCost, formatCount, formatDuration, formatLogTime } from "@/utils/ai-log-format"
import AdminPageHeader from "./AdminPageHeader.vue"
import AiLogSessionDialog from "./AiLogSessionDialog.vue"
import {
    ADMIN_BADGE,
    ADMIN_BADGE_ERROR,
    ADMIN_BADGE_SUCCESS,
    ADMIN_BTN,
    ADMIN_BTN_DANGER,
    ADMIN_BTN_PRIMARY,
    ADMIN_CHIP,
    ADMIN_CHIP_OFF,
    ADMIN_CHIP_ON,
    ADMIN_EMPTY,
    ADMIN_INPUT,
    ADMIN_LABEL,
    ADMIN_MONO,
    ADMIN_NUM,
    ADMIN_NUM_UNIT,
    ADMIN_PROGRESS_TRACK,
    ADMIN_ROW,
    ADMIN_ROW_ACTION,
    ADMIN_ROW_TONE_NEUTRAL,
    ADMIN_ROW_TONE_PRIMARY,
    ADMIN_STAT_CELL,
    ADMIN_STAT_LABEL,
    ADMIN_STAT_VALUE,
    ADMIN_TABLE,
    ADMIN_TD,
    ADMIN_TH,
} from "./admin-ui"

/**
 * AI 调用日志页（管理员）：按时间段 / 会话 / 状态检索代理的每次调用，并可回放整段会话。
 *
 * 数据来自服务端 `server/data/ai-logs` 的 JSONL（见 `server/src/api/ai-log.ts`）。
 * 服务端按「最新 N 条 + 是否还有更早记录」返回，没有总数，因此这里：一次拉取 `limit` 条在本地分页，
 * 需要更早的记录时把 `limit` 翻倍重查（后端按日期从新到旧扫描，翻倍重查的开销可控）。
 */

const user = useUserStore()
const ui = useUIStore()

const loading = ref(false)
const statsLoading = ref(false)
const pruning = ref(false)
const queryError = ref("")
const enabled = ref(true)

const stats = ref<AiLogStats | null>(null)
const logs = ref<AiLogRequestMeta[]>([])
const truncated = ref(false)
const scannedDays = ref(0)

/** 过滤条件（`result` 用下拉而不是布尔，避免"未选择"与"只成功"混淆）。 */
const filters = reactive({ from: "", to: "", sessionId: "", result: "", status: "" })

/** 结果筛选：选项不超过 5 个，用方章而不是下拉 */
const RESULT_OPTIONS = [
    { label: "全部", value: "" },
    { label: "仅成功", value: "ok" },
    { label: "仅失败", value: "fail" },
]

/** 单次拉取条数，也是「加载更早记录」的游标。选项固定 4 档，用方章而不是下拉。 */
const LIMIT_OPTIONS = [200, 500, 1000, 2000]

/** 后端单次返回上限，与 `ai-log-store.ts` 的 MAX_QUERY_LIMIT 一致。 */
const MAX_LIMIT = 2000
/** 每页展示条数（本地分页）。 */
const PAGE_SIZE = 20
const page = ref(1)

const limit = ref(200)

const sessionDialogOpen = ref(false)
const activeSessionId = ref("")

const pruneDialogOpen = ref(false)
const pruneBefore = ref("")

const totalPages = computed(() => Math.max(1, Math.ceil(logs.value.length / PAGE_SIZE)))
const visibleLogs = computed(() => logs.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const canLoadMore = computed(() => truncated.value && limit.value < MAX_LIMIT)

/**
 * @description 拉取日志目录概况（开关状态、目录、覆盖日期、会话数）。
 */
async function loadStats() {
    statsLoading.value = true
    try {
        const result = await readAiLogStats(user.jwtToken)
        stats.value = result
        enabled.value = result.enabled
    } catch (e) {
        stats.value = null
        ui.showErrorMessage(e instanceof Error ? e.message : "加载日志概况失败")
    } finally {
        statsLoading.value = false
    }
}

/**
 * @description 按当前过滤条件检索日志。
 * @param resetPage 是否回到第一页。
 */
async function search(resetPage = true) {
    if (resetPage) page.value = 1
    loading.value = true
    queryError.value = ""

    try {
        const result = await listAiLogs(
            {
                from: filters.from || undefined,
                to: filters.to || undefined,
                sessionId: filters.sessionId.trim() || undefined,
                ok: filters.result === "" ? undefined : filters.result === "ok",
                status: filters.status.trim() ? Number(filters.status.trim()) : undefined,
                limit: limit.value,
            },
            user.jwtToken
        )

        logs.value = result.logs
        truncated.value = result.truncated
        scannedDays.value = result.scannedDays
        enabled.value = result.enabled
    } catch (e) {
        logs.value = []
        truncated.value = false
        scannedDays.value = 0
        queryError.value = e instanceof Error ? e.message : "查询失败"
    } finally {
        loading.value = false
    }
}

/**
 * @description 加载更早的记录：把单次拉取条数翻倍后重查（服务端始终返回最新的 N 条）。
 */
async function loadMore() {
    limit.value = Math.min(MAX_LIMIT, limit.value * 2)
    await search(false)
}

/**
 * @description 清空过滤条件并重新查询。
 */
async function resetFilters() {
    filters.from = ""
    filters.to = ""
    filters.sessionId = ""
    filters.result = ""
    filters.status = ""
    limit.value = 200
    await search()
}

/**
 * @description 切换结果方章后重新查询。
 * @param result 结果筛选值。
 */
async function changeResult(result: string) {
    filters.result = result
    await search()
}

/**
 * @description 切换拉取条数后重新查询。
 * @param next 单次拉取条数。
 */
async function changeLimit(next: number) {
    limit.value = next
    await search(false)
}

/**
 * @description 打开某个会话的回放弹窗。
 * @param sessionId 会话 id。
 */
function openSession(sessionId: string) {
    activeSessionId.value = sessionId
    sessionDialogOpen.value = true
}

/**
 * @description 把过滤条件收敛到单个会话后重查。
 * @param sessionId 会话 id。
 */
async function filterBySession(sessionId: string) {
    filters.sessionId = sessionId
    await search()
}

/**
 * @description 复制文本到剪贴板并给出提示。
 * @param text 要复制的内容。
 * @param label 提示文案里用的名称，如「会话 ID」「上游 trace id」。
 */
async function copyText(text: string, label: string) {
    try {
        await navigator.clipboard.writeText(text)
        ui.showSuccessMessage(`已复制${label}`)
    } catch {
        ui.showErrorMessage("复制失败，请手动选中复制")
    }
}

/**
 * @description 清理指定日期之前的日志。
 */
async function handlePrune() {
    if (!pruneBefore.value) {
        ui.showErrorMessage("请选择要清理到的日期")
        return
    }

    pruning.value = true
    try {
        const result = await pruneAiLogs(pruneBefore.value, user.jwtToken)
        ui.showSuccessMessage(`已清理 ${result.before} 之前的日志（${result.removed} 个文件）`)
        pruneDialogOpen.value = false
        pruneBefore.value = ""
        await Promise.all([loadStats(), search()])
    } catch (e) {
        ui.showErrorMessage(e instanceof Error ? e.message : "清理失败")
    } finally {
        pruning.value = false
    }
}

/**
 * @description 截断过长的会话 id，仅用于表格展示。
 * @param sessionId 会话 id。
 * @returns 展示文本。
 */
function shortSessionId(sessionId: string): string {
    return sessionId.length > 18 ? `${sessionId.slice(0, 18)}…` : sessionId
}

/**
 * @description 缩略展示上游标识（32 位十六进制的 trace id 排满一列太占宽）。
 * @param value 上游标识。
 * @returns 前 10 位加省略号；无值时返回短横线。
 */
function shortUpstreamId(value: string | null): string {
    return value ? `${value.slice(0, 10)}…` : "-"
}

/**
 * @description 取客户端展示名（未登录的请求只有 IP）。
 * @param log 请求记录。
 * @returns 展示文本。
 */
function clientLabel(log: AiLogRequestMeta): string {
    return log.client.userName || log.client.userId || "未登录"
}

onMounted(async () => {
    await Promise.all([loadStats(), search()])
})
</script>

<template>
    <div class="admin-page mx-auto flex min-h-full w-full max-w-390 flex-col px-5 pb-5">
        <AdminPageHeader
            kicker="AI Logs"
            title="AI 调用日志"
            description="代理接口每次调用的元数据与完整对话，按日期归档；点「查看会话」可回放整段对话"
        >
            <template #actions>
                <button :class="ADMIN_BTN" :disabled="statsLoading" @click="loadStats">
                    <Icon icon="ri:refresh-line" :class="['h-3.25 w-3.25', statsLoading ? 'animate-spin' : '']" />
                    <span>刷新概况</span>
                </button>
                <button :class="ADMIN_BTN_DANGER" @click="pruneDialogOpen = true">
                    <Icon icon="ri:delete-bin-line" class="h-3.25 w-3.25" />
                    <span>清理旧日志</span>
                </button>
            </template>
        </AdminPageHeader>

        <!-- 概况开本 -->
        <div class="flex flex-wrap border-b border-base-content/10">
            <div :class="[ADMIN_STAT_CELL, 'pl-0']">
                <p :class="ADMIN_STAT_LABEL">Status</p>
                <p :class="ADMIN_STAT_VALUE">
                    <Icon
                        :icon="enabled ? 'ri:check-line' : 'ri:prohibited-line'"
                        :class="['h-3.25 w-3.25', enabled ? 'text-success' : 'text-error']"
                    />
                    <span class="text-[13px] font-semibold text-base-content">{{ enabled ? "记录中" : "已关闭" }}</span>
                </p>
            </div>
            <div :class="[ADMIN_STAT_CELL, 'min-w-52']">
                <p :class="ADMIN_STAT_LABEL">Range</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="[ADMIN_MONO, 'text-base-content/85']">
                        {{ stats?.firstDay && stats?.lastDay ? `${stats.firstDay} ~ ${stats.lastDay}` : "-" }}
                    </span>
                    <span :class="ADMIN_NUM_UNIT">共 {{ stats?.days.length ?? 0 }} 天</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Sessions</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ formatCount(stats?.sessionCount) }}</span>
                    <span :class="ADMIN_NUM_UNIT">个会话</span>
                </p>
            </div>
            <div :class="[ADMIN_STAT_CELL, 'min-w-56 flex-[1.4]']">
                <p :class="ADMIN_STAT_LABEL">Directory</p>
                <p class="mt-1 truncate" :title="stats?.dir || ''">
                    <span :class="[ADMIN_MONO, 'text-base-content/60']">{{ stats?.dir || "-" }}</span>
                </p>
            </div>
            <div class="ml-auto flex items-center pr-0.5 text-[10.5px] text-base-content/35">
                {{ loading ? "同步中…" : "已同步" }}
            </div>
        </div>

        <p
            v-if="!enabled"
            class="flex items-center gap-1.5 border-l-2 border-warning py-1.5 pl-2.5 text-[11.5px] text-warning"
        >
            <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
            <span>服务端已关闭日志记录（AI_LOG_ENABLED=false），这里不会再有新的记录。</span>
        </p>

        <!-- 检索条：日期 / 会话 ID / 状态码用下划线输入，结果与条数用方章 -->
        <div class="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-base-content/10 py-2.5">
            <label class="block w-36">
                <span :class="ADMIN_LABEL">起始日期</span>
                <input v-model="filters.from" type="date" :class="[ADMIN_INPUT, 'mt-1']" />
            </label>
            <label class="block w-36">
                <span :class="ADMIN_LABEL">结束日期</span>
                <input v-model="filters.to" type="date" :class="[ADMIN_INPUT, 'mt-1']" />
            </label>
            <label class="block w-52">
                <span :class="ADMIN_LABEL">会话 ID</span>
                <input
                    v-model="filters.sessionId"
                    type="text"
                    placeholder="session id"
                    :class="[ADMIN_INPUT, 'mt-1 font-mono']"
                    @keyup.enter="search()"
                />
            </label>
            <label class="block w-24">
                <span :class="ADMIN_LABEL">状态码</span>
                <input
                    v-model="filters.status"
                    type="number"
                    placeholder="如 502"
                    :class="[ADMIN_INPUT, 'mt-1 tabular-nums']"
                    @keyup.enter="search()"
                />
            </label>
            <div class="flex flex-col gap-1">
                <span :class="ADMIN_LABEL">结果</span>
                <div class="flex flex-wrap items-center gap-1">
                    <button
                        v-for="option in RESULT_OPTIONS"
                        :key="option.value"
                        :class="[ADMIN_CHIP, filters.result === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="changeResult(option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>
            <div class="flex flex-col gap-1">
                <span :class="ADMIN_LABEL">拉取条数</span>
                <div class="flex flex-wrap items-center gap-1">
                    <button
                        v-for="option in LIMIT_OPTIONS"
                        :key="option"
                        :class="[ADMIN_CHIP, limit === option ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="changeLimit(option)"
                    >
                        {{ option }}
                    </button>
                </div>
            </div>
            <div class="flex items-center gap-3 pb-0.5">
                <button :class="ADMIN_BTN_PRIMARY" :disabled="loading" @click="search()">
                    <Icon icon="ri:search-line" class="h-3.25 w-3.25" />
                    <span>{{ loading ? "查询中" : "查询" }}</span>
                </button>
                <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]" @click="resetFilters">重置</button>
            </div>
            <span class="ml-auto font-orbitron text-[11px] tabular-nums text-base-content/40">{{ logs.length }} 条已载入</span>
        </div>

        <p v-if="queryError" class="flex items-center gap-1.5 border-l-2 border-error py-1.5 pl-2.5 text-[11.5px] text-error">
            <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
            <span>{{ queryError }}</span>
        </p>

        <!-- 结果 -->
        <div class="relative min-w-0 flex-1">
            <div v-if="loading" :class="ADMIN_PROGRESS_TRACK">
                <div class="h-full w-1/3 animate-pulse bg-primary" />
            </div>

            <ScrollArea horizontal>
                <table :class="ADMIN_TABLE">
                    <thead>
                        <tr class="bg-base-content/3">
                            <th :class="ADMIN_TH">时间</th>
                            <th :class="ADMIN_TH">会话</th>
                            <th :class="ADMIN_TH">客户端</th>
                            <th :class="ADMIN_TH">状态</th>
                            <th :class="[ADMIN_TH, 'text-right']">耗时</th>
                            <th :class="[ADMIN_TH, 'text-right']">首字</th>
                            <th :class="[ADMIN_TH, 'text-right']">输入 / 输出</th>
                            <th :class="[ADMIN_TH, 'text-right']">费用</th>
                            <th :class="ADMIN_TH">上游 trace</th>
                            <th :class="ADMIN_TH">错误</th>
                            <th :class="[ADMIN_TH, 'text-right']">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="log in visibleLogs" :key="log.requestId" :class="ADMIN_ROW">
                            <td :class="[ADMIN_TD, 'whitespace-nowrap font-mono tabular-nums text-base-content/70']">
                                {{ formatLogTime(log.time) }}
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                <span :class="[ADMIN_MONO, 'text-base-content/75']" :title="log.sessionId">{{
                                    shortSessionId(log.sessionId)
                                }}</span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                <div class="text-base-content/85">{{ clientLabel(log) }}</div>
                                <div :class="[ADMIN_MONO, 'text-[10.5px] text-base-content/40']">{{ log.client.ip || "-" }}</div>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                <span :class="[ADMIN_BADGE, log.ok ? ADMIN_BADGE_SUCCESS : ADMIN_BADGE_ERROR]">{{ log.status }}</span>
                                <span
                                    v-if="log.upstreamStatus && log.upstreamStatus !== log.status"
                                    :class="[ADMIN_MONO, 'ml-1.5 text-[10.5px] text-base-content/45']"
                                >
                                    ↑{{ log.upstreamStatus }}
                                </span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-right tabular-nums text-base-content/85']">
                                {{ formatDuration(log.durationMs) }}
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-right tabular-nums text-base-content/55']">
                                {{ log.ttftMs === null ? "-" : formatDuration(log.ttftMs) }}
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-right tabular-nums text-base-content/85']">
                                <template v-if="log.usage">
                                    {{ formatCount(log.usage.prompt) }}
                                    / {{ formatCount(log.usage.completion) }}
                                </template>
                                <template v-else>-</template>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-right tabular-nums text-base-content/85']">
                                {{ formatCost(log.costMicros) }}
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                <!-- 点一下即复制完整值，方便拿去跟 DeepSeek 官方对账；完整值同时挂在 title 上 -->
                                <button
                                    v-if="log.upstreamTraceId"
                                    :class="[ADMIN_MONO, 'cursor-pointer text-base-content/55 transition-colors duration-150 hover:text-primary']"
                                    :title="`x-ds-trace-id: ${log.upstreamTraceId}`"
                                    @click="copyText(log.upstreamTraceId, '上游 trace id')"
                                >
                                    {{ shortUpstreamId(log.upstreamTraceId) }}
                                </button>
                                <span v-else class="text-base-content/30">-</span>
                            </td>
                            <td :class="[ADMIN_TD, 'max-w-64']">
                                <span v-if="log.error" class="text-error" :title="log.error.message">
                                    [{{ log.error.code }}] {{ log.error.message }}
                                </span>
                                <span v-else class="text-base-content/30">-</span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-right']">
                                <div class="flex items-center justify-end gap-3">
                                    <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_PRIMARY]" @click="openSession(log.sessionId)">
                                        查看会话
                                    </button>
                                    <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]" @click="filterBySession(log.sessionId)">
                                        筛选
                                    </button>
                                    <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]" @click="copyText(log.sessionId, '会话 ID')">
                                        复制
                                    </button>
                                </div>
                            </td>
                        </tr>

                        <tr v-if="!loading && logs.length === 0">
                            <td colspan="11" class="border-b border-base-content/10">
                                <div :class="ADMIN_EMPTY">
                                    <Icon icon="ri:inbox-line" class="h-6.5 w-6.5 text-base-content/20" />
                                    <p class="text-[12.5px] text-base-content/55">
                                        {{ queryError ? "查询失败" : "没有符合条件的日志" }}
                                    </p>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>

            <PageFoot
                :page="page"
                :pageSize="PAGE_SIZE"
                :totalPages="totalPages"
                :count="logs.length"
                @update:page="value => (page = value)"
            />

            <div
                v-if="canLoadMore || truncated"
                class="flex flex-wrap items-center justify-between gap-2 border-t border-base-content/10 py-2.5"
            >
                <p class="text-[11px] text-base-content/45">
                    已加载最新 <b class="font-orbitron tabular-nums text-base-content/75">{{ logs.length }}</b> 条，扫描
                    <b class="font-orbitron tabular-nums text-base-content/75">{{ scannedDays }}</b> 个日期文件<template v-if="truncated"
                        >；可能还有更早的记录</template
                    >
                </p>
                <button v-if="canLoadMore" :class="ADMIN_BTN" :disabled="loading" @click="loadMore">
                    <Icon icon="ri:arrow-down-s-line" class="h-3.25 w-3.25" />
                    <span>加载更早记录（拉取 {{ Math.min(MAX_LIMIT, limit * 2) }} 条）</span>
                </button>
            </div>
        </div>

        <AiLogSessionDialog v-model:open="sessionDialogOpen" :session-id="activeSessionId" />

        <Dialog
            v-if="pruneDialogOpen"
            v-model:open="pruneDialogOpen"
            title="清理旧日志"
            :description="`将删除该日期（不含当天）之前的索引与全部会话轮次，操作不可撤销。`"
        >
            <template #content>
                <div class="space-y-1.5 py-2">
                    <label :class="ADMIN_LABEL">保留该日期及之后的日志</label>
                    <input v-model="pruneBefore" type="date" :class="[ADMIN_INPUT, 'mt-1']" />
                </div>
            </template>
            <template #actions>
                <div class="flex justify-end gap-2">
                    <button type="button" :class="ADMIN_BTN" :disabled="pruning" @click="pruneDialogOpen = false">取消</button>
                    <button type="button" :class="ADMIN_BTN_DANGER" :disabled="pruning" @click="handlePrune">
                        <span>{{ pruning ? "清理中…" : "确认清理" }}</span>
                    </button>
                </div>
            </template>
        </Dialog>
    </div>
</template>
