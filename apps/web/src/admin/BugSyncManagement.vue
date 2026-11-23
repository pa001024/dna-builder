<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { adminReconcileMutation, type Bug, type BugStatus, bugsQuery, type GithubIssueSummary } from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import AdminPageHeader from "./AdminPageHeader.vue"
import {
    ADMIN_BADGE,
    ADMIN_BADGE_ERROR,
    ADMIN_BADGE_NEUTRAL,
    ADMIN_BADGE_PRIMARY,
    ADMIN_BADGE_SUCCESS,
    ADMIN_BADGE_WARNING,
    ADMIN_BTN,
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
    ADMIN_ROW_TONE_PRIMARY,
    ADMIN_STAT_CELL,
    ADMIN_STAT_LABEL,
    ADMIN_STAT_VALUE,
    ADMIN_TABLE,
    ADMIN_TD,
    ADMIN_TH,
} from "./admin-ui"

/**
 * BUG 同步页（管理员）：按 Issue 映射查看本站 ↔ GitHub 的同步状态，
 * 对异常映射发起一次对账（写 `reconcile_issue` outbox）。
 *
 * 同步明细来自公开 `bugs` 查询里的 `githubIssue`；outbox / inbox 深度需要服务端聚合查询，
 * 当前没有对应接口，因此概览只统计已载入的映射。映射数据按页拉取，超过上限时给出提示。
 */

type SyncRow = { bug: Bug; issue: GithubIssueSummary }

const ui = useUIStore()

const ALL_STATUSES: BugStatus[] = [
    "untriaged",
    "needs_info",
    "confirmed",
    "in_progress",
    "resolved",
    "closed",
    "reopen_requested",
    "duplicate",
    "rejected",
]

const PAGE_LIMIT = 100
const MAX_PAGES = 10
const PAGE_SIZE = 20

const loading = ref(false)
const queryError = ref("")
const bugs = ref<Bug[]>([])
const truncated = ref(false)
const page = ref(1)
const reconcilingId = ref("")

const filters = ref({ q: "", syncState: "", remoteState: "" })

const SYNC_STATE_OPTIONS = [
    { value: "", label: "全部" },
    { value: "synced", label: "已同步" },
    { value: "pending", label: "待同步" },
    { value: "conflict", label: "冲突" },
    { value: "blocked", label: "阻塞" },
    { value: "failed", label: "失败" },
]

const REMOTE_STATE_OPTIONS = [
    { value: "", label: "全部" },
    { value: "open", label: "打开" },
    { value: "closed", label: "已关闭" },
]

const SYNC_STATE_LABELS: Record<string, string> = {
    synced: "已同步",
    pending: "待同步",
    conflict: "冲突",
    blocked: "阻塞",
    failed: "失败",
}

const REMOTE_STATE_LABELS: Record<string, string> = {
    open: "打开",
    closed: "已关闭",
}

const syncRows = computed<SyncRow[]>(() =>
    bugs.value.flatMap(bug => (bug.githubIssue ? [{ bug, issue: bug.githubIssue }] : []))
)

const filteredRows = computed(() => {
    const keyword = filters.value.q.trim().toLowerCase()
    return syncRows.value.filter(row => {
        if (filters.value.syncState && row.issue.syncState !== filters.value.syncState) return false
        if (filters.value.remoteState && (row.issue.remoteState ?? "") !== filters.value.remoteState) return false
        if (!keyword) return true
        const haystack = `${row.bug.displayKey} ${row.bug.title} ${row.issue.issueNumber}`.toLowerCase()
        return haystack.includes(keyword)
    })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / PAGE_SIZE)))
const visibleRows = computed(() => filteredRows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

const syncedCount = computed(() => syncRows.value.filter(row => row.issue.syncState === "synced").length)
const pendingCount = computed(() => syncRows.value.filter(row => row.issue.syncState === "pending").length)
const abnormalCount = computed(
    () => syncRows.value.filter(row => row.issue.syncState === "conflict" || row.issue.syncState === "blocked" || row.issue.syncState === "failed").length
)

/**
 * @description 分页拉取全部有 GitHub 映射的 BUG（服务端单页上限 100）。
 */
async function load() {
    loading.value = true
    queryError.value = ""
    truncated.value = false

    try {
        const collected: Bug[] = []
        let offset = 0
        let total = 0

        for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
            const result = await bugsQuery({
                filter: { status: [...ALL_STATUSES] },
                sort: "recent",
                offset,
                limit: PAGE_LIMIT,
            })
            if (!result) {
                queryError.value = "查询失败，请稍后重试"
                return
            }
            total = result.total
            collected.push(...(result.items ?? []))
            offset += PAGE_LIMIT
            if (offset >= total) break
        }

        bugs.value = collected
        truncated.value = offset < total
        page.value = 1
    } catch (e) {
        bugs.value = []
        queryError.value = e instanceof Error ? e.message : "查询失败"
    } finally {
        loading.value = false
    }
}

/**
 * @description 修改筛选条件后回到第一页。
 */
function resetPage() {
    page.value = 1
}

/**
 * @description 切换同步状态筛选。
 * @param value 同步状态原值；空串表示全部。
 */
function changeSyncState(value: string) {
    filters.value.syncState = value
    resetPage()
}

/**
 * @description 切换远端状态筛选。
 * @param value 远端状态；空串表示全部。
 */
function changeRemoteState(value: string) {
    filters.value.remoteState = value
    resetPage()
}

/**
 * @description 取同步状态展示名。
 * @param state 同步状态原值。
 * @returns 展示文本。
 */
function syncStateLabel(state: string): string {
    return SYNC_STATE_LABELS[state] ?? state
}

/**
 * @description 同步状态方章配色。
 * @param state 同步状态原值。
 * @returns `ADMIN_BADGE_*` 颜色类。
 */
function syncStateTone(state: string): string {
    if (state === "synced") return ADMIN_BADGE_SUCCESS
    if (state === "pending") return ADMIN_BADGE_PRIMARY
    if (state === "conflict" || state === "failed") return ADMIN_BADGE_ERROR
    if (state === "blocked") return ADMIN_BADGE_WARNING
    return ADMIN_BADGE_NEUTRAL
}

/**
 * @description 取远端状态展示名（未知值保留原值）。
 * @param state 远端状态。
 * @returns 展示文本。
 */
function remoteStateLabel(state: string | undefined): string {
    if (!state) return "-"
    return REMOTE_STATE_LABELS[state] ?? state
}

/**
 * @description 格式化毫秒时间戳。
 * @param ms 毫秒时间戳。
 * @returns 本地时间文本；无值时返回短横线。
 */
function formatTime(ms: number | null | undefined): string {
    if (!ms || !Number.isFinite(ms)) return "-"
    return new Date(ms).toLocaleString("zh-CN", { hour12: false })
}

/**
 * @description 对指定映射发起一次对账，服务端会写 `reconcile_issue` outbox。
 * @param row 映射行。
 */
async function reconcile(row: SyncRow) {
    reconcilingId.value = row.issue.linkId
    try {
        const ok = await adminReconcileMutation({ syncId: row.issue.linkId })
        if (ok) ui.showSuccessMessage(`已为 ${row.bug.displayKey} 安排对账`)
    } finally {
        reconcilingId.value = ""
    }
}

onMounted(() => load())
</script>

<template>
    <div class="admin-page mx-auto flex min-h-full w-full max-w-390 flex-col px-5 pb-5">
        <AdminPageHeader
            kicker="Bug Sync"
            title="BUG 同步"
            description="查看本站 BUG 与 GitHub Issue 的映射和同步状态，对异常映射发起对账"
        >
            <template #actions>
                <button :class="ADMIN_BTN" :disabled="loading" @click="load">
                    <Icon icon="ri:refresh-line" :class="['h-3.25 w-3.25', loading ? 'animate-spin' : '']" />
                    <span>刷新</span>
                </button>
            </template>
        </AdminPageHeader>

        <!-- 同步概况：只统计已载入的映射，outbox / inbox 深度待服务端聚合查询 -->
        <div class="flex flex-wrap border-b border-base-content/10">
            <div :class="[ADMIN_STAT_CELL, 'pl-0']">
                <p :class="ADMIN_STAT_LABEL">Mapped</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ syncRows.length }}</span>
                    <span :class="ADMIN_NUM_UNIT">条 Issue 映射</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Synced</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ syncedCount }}</span>
                    <span :class="ADMIN_NUM_UNIT">已同步</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Pending</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ pendingCount }}</span>
                    <span :class="ADMIN_NUM_UNIT">待同步</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Abnormal</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ abnormalCount }}</span>
                    <span :class="ADMIN_NUM_UNIT">冲突 / 阻塞 / 失败</span>
                </p>
            </div>
            <div class="ml-auto flex items-center pr-0.5 text-[10.5px] text-base-content/35">
                {{ loading ? "同步中…" : "已同步" }}
            </div>
        </div>

        <p v-if="truncated" class="flex items-center gap-1.5 border-l-2 border-warning py-1.5 pl-2.5 text-[11.5px] text-warning">
            <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
            <span>映射较多，当前只载入最近 {{ MAX_PAGES * PAGE_LIMIT }} 条，更早的映射未统计。</span>
        </p>

        <!-- 筛选 -->
        <div class="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-base-content/10 py-2.5">
            <label class="block w-64">
                <span :class="ADMIN_LABEL">关键词</span>
                <input v-model="filters.q" type="text" placeholder="BUG 编号 / 标题 / Issue 号" :class="[ADMIN_INPUT, 'mt-1']" @input="resetPage" />
            </label>
            <div class="flex flex-col gap-1">
                <span :class="ADMIN_LABEL">同步状态</span>
                <div class="flex flex-wrap items-center gap-1">
                    <button
                        v-for="option in SYNC_STATE_OPTIONS"
                        :key="option.value"
                        :class="[ADMIN_CHIP, filters.syncState === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="changeSyncState(option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>
            <div class="flex flex-col gap-1">
                <span :class="ADMIN_LABEL">远端状态</span>
                <div class="flex flex-wrap items-center gap-1">
                    <button
                        v-for="option in REMOTE_STATE_OPTIONS"
                        :key="option.value"
                        :class="[ADMIN_CHIP, filters.remoteState === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="changeRemoteState(option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>
            <span class="ml-auto font-orbitron text-[11px] tabular-nums text-base-content/40">{{ filteredRows.length }} 条映射</span>
        </div>

        <p v-if="queryError" class="flex items-center gap-1.5 border-l-2 border-error py-1.5 pl-2.5 text-[11.5px] text-error">
            <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
            <span>{{ queryError }}</span>
        </p>

        <!-- 映射表 -->
        <div class="relative min-w-0 flex-1">
            <div v-if="loading" :class="ADMIN_PROGRESS_TRACK">
                <div class="h-full w-1/3 animate-pulse bg-primary" />
            </div>

            <ScrollArea horizontal>
                <table :class="ADMIN_TABLE">
                    <thead>
                        <tr class="bg-base-content/3">
                            <th :class="ADMIN_TH">BUG</th>
                            <th :class="ADMIN_TH">GitHub Issue</th>
                            <th :class="ADMIN_TH">同步状态</th>
                            <th :class="ADMIN_TH">远端状态</th>
                            <th :class="ADMIN_TH">远端原因</th>
                            <th :class="ADMIN_TH">映射更新</th>
                            <th :class="[ADMIN_TH, 'text-right']">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in visibleRows" :key="row.issue.linkId" :class="ADMIN_ROW">
                            <td :class="[ADMIN_TD, 'max-w-72']">
                                <div class="truncate text-base-content/85" :title="row.bug.title">{{ row.bug.title }}</div>
                                <span :class="[ADMIN_MONO, 'text-base-content/40']">{{ row.bug.displayKey }}</span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                <a
                                    :href="row.issue.htmlUrl"
                                    target="_blank"
                                    rel="noreferrer"
                                    :class="[ADMIN_MONO, 'text-primary/90 transition-colors duration-150 hover:text-primary']"
                                >
                                    #{{ row.issue.issueNumber }}
                                </a>
                                <span :class="[ADMIN_MONO, 'ml-1.5 text-[10.5px] text-base-content/35']">{{ row.issue.role }}</span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                <span :class="[ADMIN_BADGE, syncStateTone(row.issue.syncState)]">{{ syncStateLabel(row.issue.syncState) }}</span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-base-content/70']">{{ remoteStateLabel(row.issue.remoteState) }}</td>
                            <td :class="[ADMIN_TD, 'max-w-64']">
                                <span v-if="row.issue.remoteStateReason" :title="row.issue.remoteStateReason">{{ row.issue.remoteStateReason }}</span>
                                <span v-else class="text-base-content/30">-</span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap font-mono tabular-nums text-base-content/55']">
                                {{ formatTime(row.issue.updatedAt) }}
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-right']">
                                <button
                                    :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_PRIMARY]"
                                    :disabled="reconcilingId === row.issue.linkId"
                                    @click="reconcile(row)"
                                >
                                    {{ reconcilingId === row.issue.linkId ? "对账中…" : "对账" }}
                                </button>
                            </td>
                        </tr>

                        <tr v-if="!loading && filteredRows.length === 0">
                            <td colspan="7" class="border-b border-base-content/10">
                                <div :class="ADMIN_EMPTY">
                                    <Icon icon="ri:inbox-line" class="h-6.5 w-6.5 text-base-content/20" />
                                    <p class="text-[12.5px] text-base-content/55">
                                        {{ queryError ? "查询失败" : "没有符合条件的 Issue 映射" }}
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
                :count="filteredRows.length"
                @update:page="value => (page = value)"
            />
        </div>
    </div>
</template>
