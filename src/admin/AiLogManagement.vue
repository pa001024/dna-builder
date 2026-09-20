<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { type AiLogRequestMeta, type AiLogStats, listAiLogs, pruneAiLogs, readAiLogStats } from "@/api/aiLog"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { formatCost, formatCount, formatDuration, formatLogTime } from "@/utils/ai-log-format"
import AiLogSessionDialog from "./AiLogSessionDialog.vue"

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

/** 单次拉取条数，也是「加载更早记录」的游标。 */
const limit = ref(200)
/** 后端单次返回上限，与 `ai-log-store.ts` 的 MAX_QUERY_LIMIT 一致。 */
const MAX_LIMIT = 2000
/** 每页展示条数（本地分页）。 */
const PAGE_SIZE = 20
const page = ref(1)

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
    <div class="animate-fadeIn relative min-h-screen bg-base-200/50 p-6">
        <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
                <h2 class="text-2xl font-semibold text-base-content">AI 调用日志</h2>
                <p class="mt-1 text-sm text-base-content/70">
                    代理接口每次调用的元数据与完整对话，按日期归档；点「查看会话」可回放整段对话
                </p>
            </div>
            <div class="flex items-center gap-2">
                <button class="btn btn-sm btn-ghost" :disabled="statsLoading" @click="loadStats">
                    <span v-if="statsLoading" class="loading loading-spinner loading-xs"></span>
                    <Icon v-else icon="ri:refresh-line" />
                    <span>刷新概况</span>
                </button>
                <button class="btn btn-sm btn-outline btn-error" @click="pruneDialogOpen = true">
                    <Icon icon="ri:delete-bin-line" />
                    <span>清理旧日志</span>
                </button>
            </div>
        </div>

        <div v-if="!enabled" class="alert alert-warning mb-6 text-sm">
            <Icon icon="ri:error-warning-line" class="text-lg" />
            <span>服务端已关闭日志记录（AI_LOG_ENABLED=false），这里不会再有新的记录。</span>
        </div>

        <!-- 概况 -->
        <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div class="card border border-base-300 bg-base-100 p-5 shadow-sm">
                <p class="text-xs text-base-content/60">记录状态</p>
                <p class="mt-1 flex items-center gap-2 text-lg font-semibold text-base-content">
                    <Icon :icon="enabled ? 'ri:check-line' : 'ri:prohibited-line'" :class="enabled ? 'text-success' : 'text-error'" />
                    <span>{{ enabled ? "记录中" : "已关闭" }}</span>
                </p>
            </div>
            <div class="card border border-base-300 bg-base-100 p-5 shadow-sm">
                <p class="text-xs text-base-content/60">覆盖日期</p>
                <p class="mt-1 font-mono text-lg font-semibold text-base-content">
                    {{ stats?.firstDay && stats?.lastDay ? `${stats.firstDay} ~ ${stats.lastDay}` : "-" }}
                </p>
                <p class="mt-1 text-xs text-base-content/50">共 {{ stats?.days.length ?? 0 }} 天</p>
            </div>
            <div class="card border border-base-300 bg-base-100 p-5 shadow-sm">
                <p class="text-xs text-base-content/60">会话数</p>
                <p class="mt-1 font-mono text-lg font-semibold text-base-content">{{ formatCount(stats?.sessionCount) }}</p>
            </div>
            <div class="card border border-base-300 bg-base-100 p-5 shadow-sm">
                <p class="text-xs text-base-content/60">日志目录</p>
                <p class="mt-1 truncate font-mono text-xs text-base-content/80" :title="stats?.dir || ''">{{ stats?.dir || "-" }}</p>
            </div>
        </div>

        <!-- 过滤 -->
        <div class="card mb-6 border border-base-300 bg-base-100 p-6 shadow-sm">
            <div class="flex flex-col gap-4 md:flex-row md:items-end md:flex-wrap">
                <div class="w-full md:w-40">
                    <label class="mb-1 block text-xs text-base-content/60">起始日期</label>
                    <input v-model="filters.from" type="date" class="input input-bordered w-full" />
                </div>
                <div class="w-full md:w-40">
                    <label class="mb-1 block text-xs text-base-content/60">结束日期</label>
                    <input v-model="filters.to" type="date" class="input input-bordered w-full" />
                </div>
                <div class="w-full md:w-52">
                    <label class="mb-1 block text-xs text-base-content/60">会话 ID</label>
                    <input v-model="filters.sessionId" type="text" placeholder="session id" class="input input-bordered w-full" @keyup.enter="search()" />
                </div>
                <div class="w-full md:w-32">
                    <label class="mb-1 block text-xs text-base-content/60">结果</label>
                    <select v-model="filters.result" class="select select-bordered w-full">
                        <option value="">全部</option>
                        <option value="ok">仅成功</option>
                        <option value="fail">仅失败</option>
                    </select>
                </div>
                <div class="w-full md:w-28">
                    <label class="mb-1 block text-xs text-base-content/60">状态码</label>
                    <input v-model="filters.status" type="number" placeholder="如 502" class="input input-bordered w-full" @keyup.enter="search()" />
                </div>
                <div class="w-full md:w-32">
                    <label class="mb-1 block text-xs text-base-content/60">拉取条数</label>
                    <select v-model.number="limit" class="select select-bordered w-full" @change="search()">
                        <option :value="200">200</option>
                        <option :value="500">500</option>
                        <option :value="1000">1000</option>
                        <option :value="2000">2000</option>
                    </select>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn btn-primary px-6" :disabled="loading" @click="search()">
                        <span v-if="loading" class="loading loading-spinner loading-sm"></span>
                        <Icon v-else icon="ri:search-line" />
                        <span>查询</span>
                    </button>
                    <button class="btn btn-ghost" @click="resetFilters">重置</button>
                </div>
            </div>
        </div>

        <div v-if="queryError" class="alert alert-error mb-6 text-sm">
            <Icon icon="ri:error-warning-line" class="text-lg" />
            <span>{{ queryError }}</span>
        </div>

        <!-- 结果 -->
        <div class="card overflow-hidden border border-base-300 bg-base-100 shadow-sm">
            <ScrollArea horizontal>
                <table class="table w-full">
                    <thead class="bg-base-200">
                        <tr>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">时间</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">会话</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">客户端</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">状态</th>
                            <th class="px-4 py-4 text-right text-xs font-semibold tracking-wider text-base-content/70 uppercase">耗时</th>
                            <th class="px-4 py-4 text-right text-xs font-semibold tracking-wider text-base-content/70 uppercase">首字</th>
                            <th class="px-4 py-4 text-right text-xs font-semibold tracking-wider text-base-content/70 uppercase">输入 / 输出</th>
                            <th class="px-4 py-4 text-right text-xs font-semibold tracking-wider text-base-content/70 uppercase">费用</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">上游 trace</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">错误</th>
                            <th class="px-4 py-4 text-left text-xs font-semibold tracking-wider text-base-content/70 uppercase">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(log, index) in visibleLogs"
                            :key="log.requestId"
                            class="transition-colors duration-200 hover:bg-base-200/50"
                            :class="{ 'bg-base-200/30': index % 2 === 0 }"
                        >
                            <td class="px-4 py-4 font-mono text-xs whitespace-nowrap text-base-content/85">
                                {{ formatLogTime(log.time) }}
                            </td>
                            <td class="px-4 py-4 text-xs whitespace-nowrap">
                                <span class="font-mono text-base-content/85" :title="log.sessionId">{{ shortSessionId(log.sessionId) }}</span>
                            </td>
                            <td class="px-4 py-4 text-xs whitespace-nowrap">
                                <div class="text-base-content/85">{{ clientLabel(log) }}</div>
                                <div class="font-mono text-base-content/50">{{ log.client.ip || "-" }}</div>
                            </td>
                            <td class="px-4 py-4 text-xs whitespace-nowrap">
                                <span class="badge badge-sm" :class="log.ok ? 'badge-success' : 'badge-error'">{{ log.status }}</span>
                                <span v-if="log.upstreamStatus && log.upstreamStatus !== log.status" class="ml-1 font-mono text-base-content/50">
                                    ↑{{ log.upstreamStatus }}
                                </span>
                            </td>
                            <td class="px-4 py-4 text-right font-mono text-xs whitespace-nowrap text-base-content/85">
                                {{ formatDuration(log.durationMs) }}
                            </td>
                            <td class="px-4 py-4 text-right font-mono text-xs whitespace-nowrap text-base-content/60">
                                {{ log.ttftMs === null ? "-" : formatDuration(log.ttftMs) }}
                            </td>
                            <td class="px-4 py-4 text-right font-mono text-xs whitespace-nowrap text-base-content/85">
                                <template v-if="log.usage">
                                    {{ formatCount(log.usage.prompt) }} / {{ formatCount(log.usage.completion) }}
                                </template>
                                <template v-else>-</template>
                            </td>
                            <td class="px-4 py-4 text-right font-mono text-xs whitespace-nowrap text-base-content/85">
                                {{ formatCost(log.costMicros) }}
                            </td>
                            <td class="px-4 py-4 text-xs whitespace-nowrap">
                                <!-- 点一下即复制完整值，方便拿去跟 DeepSeek 官方对账；完整值同时挂在 title 上 -->
                                <button
                                    v-if="log.upstreamTraceId"
                                    class="font-mono text-base-content/75 hover:text-primary hover:underline"
                                    :title="`x-ds-trace-id: ${log.upstreamTraceId}`"
                                    @click="copyText(log.upstreamTraceId, '上游 trace id')"
                                >
                                    {{ shortUpstreamId(log.upstreamTraceId) }}
                                </button>
                                <span v-else class="text-base-content/40">-</span>
                            </td>
                            <td class="max-w-64 px-4 py-4 text-xs">
                                <span v-if="log.error" class="text-error" :title="log.error.message">
                                    [{{ log.error.code }}] {{ log.error.message }}
                                </span>
                                <span v-else class="text-base-content/40">-</span>
                            </td>
                            <td class="px-4 py-4 text-xs whitespace-nowrap">
                                <div class="flex items-center gap-3">
                                    <button class="flex items-center gap-1.5 font-medium text-primary hover:underline" @click="openSession(log.sessionId)">
                                        <Icon icon="ri:chat-thread-line" />
                                        <span>查看会话</span>
                                    </button>
                                    <button class="flex items-center gap-1.5 font-medium text-base-content/70 hover:underline" @click="filterBySession(log.sessionId)">
                                        <Icon icon="ri:filter-line" />
                                        <span>筛选</span>
                                    </button>
                                    <button class="flex items-center gap-1.5 font-medium text-base-content/70 hover:underline" @click="copyText(log.sessionId, '会话 ID')">
                                        <Icon icon="ri:file-copy-line" />
                                        <span>复制</span>
                                    </button>
                                </div>
                            </td>
                        </tr>

                        <tr v-if="!loading && logs.length === 0">
                            <td colspan="10" class="px-8 py-10 text-center text-sm text-base-content/70">
                                {{ queryError ? "查询失败" : "没有符合条件的日志" }}
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

            <div v-if="canLoadMore || truncated" class="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 px-4 py-3">
                <p class="text-xs text-base-content/60">
                    已加载最新 {{ logs.length }} 条，扫描 {{ scannedDays }} 个日期文件<template v-if="truncated">；可能还有更早的记录</template>
                </p>
                <button v-if="canLoadMore" class="btn btn-xs btn-outline" :disabled="loading" @click="loadMore">
                    <span v-if="loading" class="loading loading-spinner loading-xs"></span>
                    <span>加载更早记录（拉取 {{ Math.min(MAX_LIMIT, limit * 2) }} 条）</span>
                </button>
            </div>
        </div>

        <div v-if="loading" class="absolute inset-0 z-50 flex items-center justify-center bg-base-200/60">
            <span class="loading loading-spinner loading-lg"></span>
        </div>

        <AiLogSessionDialog v-model:open="sessionDialogOpen" :session-id="activeSessionId" />

        <Dialog v-if="pruneDialogOpen" v-model:open="pruneDialogOpen" title="清理旧日志" :description="`将删除该日期（不含当天）之前的索引与全部会话轮次，操作不可撤销。`">
            <template #content>
                <div class="space-y-2 py-4">
                    <label class="text-sm font-medium text-base-content">保留该日期及之后的日志</label>
                    <input v-model="pruneBefore" type="date" class="input input-bordered w-full" />
                </div>
            </template>
            <template #actions>
                <div class="flex justify-end gap-2">
                    <button type="button" class="btn" :disabled="pruning" @click="pruneDialogOpen = false">取消</button>
                    <button type="button" class="btn btn-error" :disabled="pruning" @click="handlePrune">
                        <span v-if="pruning" class="loading loading-spinner loading-sm"></span>
                        <span>确认清理</span>
                    </button>
                </div>
            </template>
        </Dialog>
    </div>
</template>
