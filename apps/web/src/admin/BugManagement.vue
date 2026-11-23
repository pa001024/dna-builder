<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { type AdminBugFields, adminMergeBugsMutation, adminRevertMergeMutation, adminUpdateBugMutation, type Bug, type BugStatus, bugsQuery, type Severity } from "@/api/graphql"
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
    ADMIN_BTN_DANGER,
    ADMIN_BTN_PRIMARY,
    ADMIN_CHIP,
    ADMIN_CHIP_OFF,
    ADMIN_CHIP_ON,
    ADMIN_EMPTY,
    ADMIN_INPUT,
    ADMIN_KICKER,
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
 * BUG 管理页（管理员）：按状态 / 严重程度 / 分类 / 修复阶段筛选公开 BUG，
 * 支持纠错（分类、严重程度、状态）、合并重复与解除误合并。
 *
 * 列表复用公开 `bugs` 查询：默认筛选会隐藏 resolved/closed/duplicate/rejected，
 * 后台需要看全量，因此不带状态条件时显式传全部状态。合并事件 id 当前没有查询可列，
 * 解除合并需要从归并记录里拿到 id 后手填。
 */

const ui = useUIStore()

const loading = ref(false)
const queryError = ref("")
const bugs = ref<Bug[]>([])
const total = ref(0)
const page = ref(1)
const PAGE_SIZE = 20

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

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
    { value: "S0", label: "S0" },
    { value: "S1", label: "S1" },
    { value: "S2", label: "S2" },
    { value: "S3", label: "S3" },
    { value: "S4", label: "S4" },
    { value: "U", label: "未定级" },
]

const STATUS_OPTIONS: { value: BugStatus; label: string }[] = [
    { value: "untriaged", label: "未分诊" },
    { value: "needs_info", label: "待补充" },
    { value: "confirmed", label: "已确认" },
    { value: "in_progress", label: "处理中" },
    { value: "resolved", label: "已解决" },
    { value: "closed", label: "已关闭" },
    { value: "reopen_requested", label: "申请重开" },
    { value: "duplicate", label: "重复" },
    { value: "rejected", label: "已驳回" },
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map(option => [option.value, option.label])) as Record<BugStatus, string>

const CATEGORY_OPTIONS = [
    { value: "login", label: "登录" },
    { value: "quest", label: "任务" },
    { value: "combat", label: "战斗" },
    { value: "character", label: "角色" },
    { value: "equipment", label: "装备" },
    { value: "map", label: "地图" },
    { value: "ui", label: "界面" },
    { value: "performance", label: "性能" },
    { value: "multiplayer", label: "多人" },
    { value: "audio", label: "音频" },
    { value: "other", label: "其他" },
]

const CATEGORY_LABELS = Object.fromEntries(CATEGORY_OPTIONS.map(option => [option.value, option.label])) as Record<string, string>

const FIX_STAGE_OPTIONS = [
    { value: "fix.unconfirmed", label: "未确认" },
    { value: "fix.needs_info", label: "待补充" },
    { value: "fix.confirmed", label: "已确认" },
    { value: "fix.planned", label: "已排期" },
    { value: "fix.in_progress", label: "修复中" },
    { value: "fix.reported_fixed", label: "已报修复" },
    { value: "fix.released", label: "已发布" },
    { value: "fix.verified", label: "已验证" },
    { value: "fix.regressed", label: "回归" },
]

const FIX_STAGE_LABELS = Object.fromEntries(FIX_STAGE_OPTIONS.map(option => [option.value, option.label])) as Record<string, string>

/** 筛选条件；状态 / 严重程度 / 修复阶段为空表示不过滤。 */
const filters = reactive({
    q: "",
    category: "",
    severity: [] as Severity[],
    status: [] as BugStatus[],
    fixStage: [] as string[],
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const pageVotes = computed(() => bugs.value.reduce((sum, bug) => sum + bug.votes, 0))
const pageReporters = computed(() => bugs.value.reduce((sum, bug) => sum + bug.reporters, 0))
const pageLinked = computed(() => bugs.value.filter(bug => bug.githubIssue).length)

/**
 * @description 按当前筛选条件拉取一页 BUG。
 * @param resetPage 是否回到第一页。
 */
async function search(resetPage = true) {
    if (resetPage) page.value = 1
    loading.value = true
    queryError.value = ""

    try {
        const result = await bugsQuery({
            filter: {
                q: filters.q.trim() || undefined,
                category: filters.category ? [filters.category] : undefined,
                severity: filters.severity.length ? filters.severity : undefined,
                status: filters.status.length ? filters.status : [...ALL_STATUSES],
                fixStage: filters.fixStage.length ? filters.fixStage : undefined,
            },
            sort: "recent",
            offset: (page.value - 1) * PAGE_SIZE,
            limit: PAGE_SIZE,
        })

        if (!result) {
            bugs.value = []
            total.value = 0
            queryError.value = "查询失败，请稍后重试"
            return
        }

        bugs.value = result.items ?? []
        total.value = result.total
    } catch (e) {
        bugs.value = []
        total.value = 0
        queryError.value = e instanceof Error ? e.message : "查询失败"
    } finally {
        loading.value = false
    }
}

/**
 * @description 切换页码后重新查询。
 * @param next 目标页码。
 */
async function changePage(next: number) {
    page.value = next
    await search(false)
}

/**
 * @description 清空全部筛选条件并重新查询。
 */
async function resetFilters() {
    filters.q = ""
    filters.category = ""
    filters.severity = []
    filters.status = []
    filters.fixStage = []
    await search()
}

/**
 * @description 单选分类方章：再次点击已选项即取消。
 * @param value 分类 key。
 */
async function changeCategory(value: string) {
    filters.category = filters.category === value ? "" : value
    await search()
}

/**
 * @description 多选严重程度方章。
 * @param value 严重程度。
 */
async function toggleSeverity(value: Severity) {
    filters.severity = filters.severity.includes(value) ? filters.severity.filter(item => item !== value) : [...filters.severity, value]
    await search()
}

/**
 * @description 清空严重程度筛选。
 */
async function clearSeverity() {
    filters.severity = []
    await search()
}

/**
 * @description 多选状态方章。
 * @param value 状态。
 */
async function toggleStatus(value: BugStatus) {
    filters.status = filters.status.includes(value) ? filters.status.filter(item => item !== value) : [...filters.status, value]
    await search()
}

/**
 * @description 清空状态筛选（服务端会退回默认隐藏集合之外的全部状态）。
 */
async function clearStatus() {
    filters.status = []
    await search()
}

/**
 * @description 多选修复阶段方章。
 * @param value 修复阶段 key。
 */
async function toggleFixStage(value: string) {
    filters.fixStage = filters.fixStage.includes(value) ? filters.fixStage.filter(item => item !== value) : [...filters.fixStage, value]
    await search()
}

/**
 * @description 清空修复阶段筛选。
 */
async function clearFixStage() {
    filters.fixStage = []
    await search()
}

/**
 * @description 状态方章的配色。
 * @param status BUG 状态。
 * @returns `ADMIN_BADGE_*` 颜色类。
 */
function statusTone(status: BugStatus): string {
    if (status === "resolved") return ADMIN_BADGE_SUCCESS
    if (status === "confirmed" || status === "in_progress") return ADMIN_BADGE_PRIMARY
    if (status === "rejected") return ADMIN_BADGE_ERROR
    if (status === "needs_info" || status === "reopen_requested") return ADMIN_BADGE_WARNING
    return ADMIN_BADGE_NEUTRAL
}

/**
 * @description 严重程度方章的配色。
 * @param severity 严重程度。
 * @returns `ADMIN_BADGE_*` 颜色类。
 */
function severityTone(severity: Severity): string {
    if (severity === "S0" || severity === "S1") return ADMIN_BADGE_ERROR
    if (severity === "S2") return ADMIN_BADGE_WARNING
    if (severity === "U") return ADMIN_BADGE_PRIMARY
    return ADMIN_BADGE_NEUTRAL
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
 * @description 取分类展示名（未知分类保留原 key）。
 * @param category 分类 key。
 * @returns 展示文本。
 */
function categoryLabel(category: string): string {
    return CATEGORY_LABELS[category] ?? category
}

/**
 * @description 取修复阶段展示名（未知阶段保留原 key）。
 * @param fixStage 修复阶段 key。
 * @returns 展示文本。
 */
function fixStageLabel(fixStage: string): string {
    return FIX_STAGE_LABELS[fixStage] ?? fixStage
}

/* ------------------------------- 纠错弹窗 ------------------------------- */

const editOpen = ref(false)
const editTarget = ref<Bug | null>(null)
const editError = ref("")
const saving = ref(false)
const editForm = reactive({
    severity: "U" as Severity,
    status: "untriaged" as BugStatus,
    category: "",
    resolution: "",
    fixedVersion: "",
    reason: "",
})

/**
 * @description 打开纠错弹窗并回填当前值。
 * @param bug 目标 BUG。
 */
function openEdit(bug: Bug) {
    editTarget.value = bug
    editForm.severity = bug.severity
    editForm.status = bug.status
    editForm.category = bug.primaryCategory
    editForm.resolution = bug.resolution ?? ""
    editForm.fixedVersion = bug.fixedVersion ?? ""
    editForm.reason = ""
    editError.value = ""
    editOpen.value = true
}

/**
 * @description 提交纠错：只提交与当前值不同的字段，附带必填理由与期望版本。
 */
async function submitEdit() {
    const bug = editTarget.value
    if (!bug) return

    const reason = editForm.reason.trim()
    if (!reason) {
        editError.value = "请填写操作理由"
        return
    }

    const fields: AdminBugFields = {}
    if (editForm.severity !== bug.severity) fields.severity = editForm.severity
    if (editForm.status !== bug.status) fields.status = editForm.status
    if (editForm.category !== bug.primaryCategory) fields.primaryCategory = editForm.category
    if (editForm.resolution !== (bug.resolution ?? "")) fields.resolution = editForm.resolution
    if (editForm.fixedVersion !== (bug.fixedVersion ?? "")) fields.fixedVersion = editForm.fixedVersion

    if (!Object.keys(fields).length) {
        editError.value = "没有需要提交的改动"
        return
    }

    saving.value = true
    editError.value = ""
    try {
        const result = await adminUpdateBugMutation({ bugId: bug.id, fields, reason, expectedVersion: bug.version })
        if (!result) return
        editOpen.value = false
        const changed = result.changed ?? []
        ui.showSuccessMessage(changed.length ? `${bug.displayKey} 已更新：${changed.join("、")}` : `${bug.displayKey} 没有变化`)
        await search(false)
    } finally {
        saving.value = false
    }
}

/* ------------------------------- 合并弹窗 ------------------------------- */

const mergeOpen = ref(false)
const mergeSource = ref<Bug | null>(null)
const mergeTargetId = ref("")
const mergeReason = ref("")
const mergeError = ref("")
const merging = ref(false)

/** 可选目标：当前页里不是自身、且不是重复记录的 BUG。 */
const mergeTargets = computed(() =>
    bugs.value.filter(bug => bug.id !== mergeSource.value?.id && bug.status !== "duplicate" && !bug.duplicateOf)
)

/**
 * @description 打开合并弹窗。
 * @param bug 作为源记录的 BUG。
 */
function openMerge(bug: Bug) {
    mergeSource.value = bug
    mergeTargetId.value = ""
    mergeReason.value = ""
    mergeError.value = ""
    mergeOpen.value = true
}

/**
 * @description 提交合并：期望版本按 [源, 目标] 顺序传给服务端。
 */
async function submitMerge() {
    const source = mergeSource.value
    const target = bugs.value.find(bug => bug.id === mergeTargetId.value)
    if (!source) return
    if (!target) {
        mergeError.value = "请选择目标 BUG"
        return
    }
    const reason = mergeReason.value.trim()
    if (!reason) {
        mergeError.value = "请填写合并理由"
        return
    }

    merging.value = true
    mergeError.value = ""
    try {
        const result = await adminMergeBugsMutation({
            sourceBugIds: [source.id],
            targetBugId: target.id,
            reason,
            expectedVersions: [source.version, target.version],
        })
        if (!result) return
        mergeOpen.value = false
        ui.showSuccessMessage(`${source.displayKey} 已并入 ${target.displayKey}`)
        await search(false)
    } finally {
        merging.value = false
    }
}

/* ------------------------------- 解除合并 ------------------------------- */

const revertOpen = ref(false)
const revertTarget = ref<Bug | null>(null)
const revertEventId = ref("")
const revertReason = ref("")
const revertError = ref("")
const reverting = ref(false)

/**
 * @description 打开解除合并弹窗。
 * @param bug 被并入其他记录的重复 BUG。
 */
function openRevert(bug: Bug) {
    revertTarget.value = bug
    revertEventId.value = ""
    revertReason.value = ""
    revertError.value = ""
    revertOpen.value = true
}

/**
 * @description 提交解除合并；不传期望版本，由服务端按归并记录恢复。
 */
async function submitRevert() {
    const bug = revertTarget.value
    if (!bug) return
    const mergeEventId = revertEventId.value.trim()
    if (!mergeEventId) {
        revertError.value = "请填写归并记录 ID"
        return
    }
    const reason = revertReason.value.trim()
    if (!reason) {
        revertError.value = "请填写解除理由"
        return
    }

    reverting.value = true
    revertError.value = ""
    try {
        const result = await adminRevertMergeMutation({ mergeEventId, reason, expectedVersions: [] })
        if (!result) return
        revertOpen.value = false
        ui.showSuccessMessage(`${bug.displayKey} 已解除合并`)
        await search(false)
    } finally {
        reverting.value = false
    }
}

onMounted(() => search())
</script>

<template>
    <div class="admin-page mx-auto flex min-h-full w-full max-w-390 flex-col px-5 pb-5">
        <AdminPageHeader
            kicker="Bug Ledger"
            title="BUG 管理"
            description="按状态 / 严重程度 / 分类筛选公开 BUG，纠错分类与严重程度、合并重复记录或解除误合并"
        >
            <template #actions>
                <button :class="ADMIN_BTN" :disabled="loading" @click="search(false)">
                    <Icon icon="ri:refresh-line" :class="['h-3.25 w-3.25', loading ? 'animate-spin' : '']" />
                    <span>刷新</span>
                </button>
            </template>
        </AdminPageHeader>

        <!-- 概况开本 -->
        <div class="flex flex-wrap border-b border-base-content/10">
            <div :class="[ADMIN_STAT_CELL, 'pl-0']">
                <p :class="ADMIN_STAT_LABEL">Matched</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ total }}</span>
                    <span :class="ADMIN_NUM_UNIT">条公开 BUG</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Page Votes</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ pageVotes }}</span>
                    <span :class="ADMIN_NUM_UNIT">本页合计</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Reporters</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ pageReporters }}</span>
                    <span :class="ADMIN_NUM_UNIT">本页报障人次</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Linked</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ pageLinked }}</span>
                    <span :class="ADMIN_NUM_UNIT">本页已关联 Issue</span>
                </p>
            </div>
            <div class="ml-auto flex items-center pr-0.5 text-[10.5px] text-base-content/35">
                {{ loading ? "同步中…" : "已同步" }}
            </div>
        </div>

        <!-- 检索条 -->
        <div class="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-base-content/10 py-2.5">
            <label class="block w-64">
                <span :class="ADMIN_LABEL">关键词</span>
                <input v-model="filters.q" type="text" placeholder="标题 / 摘要" :class="[ADMIN_INPUT, 'mt-1']" @keyup.enter="search()" />
            </label>
            <div class="flex flex-col gap-1">
                <span :class="ADMIN_LABEL">分类</span>
                <div class="flex flex-wrap items-center gap-1">
                    <button :class="[ADMIN_CHIP, filters.category === '' ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]" @click="changeCategory('')">
                        全部
                    </button>
                    <button
                        v-for="option in CATEGORY_OPTIONS"
                        :key="option.value"
                        :class="[ADMIN_CHIP, filters.category === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="changeCategory(option.value)"
                    >
                        {{ option.label }}
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
            <span class="ml-auto font-orbitron text-[11px] tabular-nums text-base-content/40">{{ total }} 条匹配</span>
        </div>

        <div class="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-base-content/10 py-2.5">
            <div class="flex flex-col gap-1">
                <span :class="ADMIN_LABEL">严重程度</span>
                <div class="flex flex-wrap items-center gap-1">
                    <button :class="[ADMIN_CHIP, filters.severity.length ? ADMIN_CHIP_OFF : ADMIN_CHIP_ON]" @click="clearSeverity">
                        全部
                    </button>
                    <button
                        v-for="option in SEVERITY_OPTIONS"
                        :key="option.value"
                        :class="[ADMIN_CHIP, filters.severity.includes(option.value) ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="toggleSeverity(option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>
            <div class="flex flex-col gap-1">
                <span :class="ADMIN_LABEL">状态</span>
                <div class="flex flex-wrap items-center gap-1">
                    <button :class="[ADMIN_CHIP, filters.status.length ? ADMIN_CHIP_OFF : ADMIN_CHIP_ON]" @click="clearStatus">
                        全部
                    </button>
                    <button
                        v-for="option in STATUS_OPTIONS"
                        :key="option.value"
                        :class="[ADMIN_CHIP, filters.status.includes(option.value) ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="toggleStatus(option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>
        </div>

        <div class="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-base-content/10 py-2.5">
            <div class="flex flex-col gap-1">
                <span :class="ADMIN_LABEL">修复阶段</span>
                <div class="flex flex-wrap items-center gap-1">
                    <button :class="[ADMIN_CHIP, filters.fixStage.length ? ADMIN_CHIP_OFF : ADMIN_CHIP_ON]" @click="clearFixStage">
                        全部
                    </button>
                    <button
                        v-for="option in FIX_STAGE_OPTIONS"
                        :key="option.value"
                        :class="[ADMIN_CHIP, filters.fixStage.includes(option.value) ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                        @click="toggleFixStage(option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>
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
                            <th :class="ADMIN_TH">标题</th>
                            <th :class="ADMIN_TH">分类</th>
                            <th :class="ADMIN_TH">严重程度</th>
                            <th :class="ADMIN_TH">状态</th>
                            <th :class="ADMIN_TH">修复阶段</th>
                            <th :class="[ADMIN_TH, 'text-right']">投票</th>
                            <th :class="[ADMIN_TH, 'text-right']">报障</th>
                            <th :class="ADMIN_TH">GitHub</th>
                            <th :class="ADMIN_TH">最后活动</th>
                            <th :class="[ADMIN_TH, 'text-right']">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="bug in bugs" :key="bug.id" :class="ADMIN_ROW">
                            <td :class="[ADMIN_TD, 'max-w-80']">
                                <div class="truncate text-base-content/85" :title="bug.title">{{ bug.title }}</div>
                                <div class="mt-0.5 flex items-center gap-1.5">
                                    <span :class="[ADMIN_MONO, 'text-base-content/40']">{{ bug.displayKey }}</span>
                                    <span v-if="bug.duplicateOf" :class="[ADMIN_BADGE, ADMIN_BADGE_WARNING]">已合并</span>
                                </div>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-base-content/70']">{{ categoryLabel(bug.primaryCategory) }}</td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                <span :class="[ADMIN_BADGE, severityTone(bug.severity)]">{{ bug.severity }}</span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                <span :class="[ADMIN_BADGE, statusTone(bug.status)]">{{ STATUS_LABELS[bug.status] }}</span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-base-content/70']">{{ fixStageLabel(bug.fixStage) }}</td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-right tabular-nums text-base-content/85']">{{ bug.votes }}</td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-right tabular-nums text-base-content/85']">{{ bug.reporters }}</td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                <a
                                    v-if="bug.githubIssue"
                                    :href="bug.githubIssue.htmlUrl"
                                    target="_blank"
                                    rel="noreferrer"
                                    :class="[ADMIN_MONO, 'text-primary/90 transition-colors duration-150 hover:text-primary']"
                                >
                                    #{{ bug.githubIssue.issueNumber }}
                                </a>
                                <span v-else class="text-base-content/30">-</span>
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap font-mono tabular-nums text-base-content/55']">
                                {{ formatTime(bug.lastActivityAt ?? bug.createdAt) }}
                            </td>
                            <td :class="[ADMIN_TD, 'whitespace-nowrap text-right']">
                                <div class="flex items-center justify-end gap-3">
                                    <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_PRIMARY]" @click="openEdit(bug)">编辑</button>
                                    <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]" @click="openMerge(bug)">合并</button>
                                    <button
                                        v-if="bug.duplicateOf || bug.status === 'duplicate'"
                                        :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]"
                                        @click="openRevert(bug)"
                                    >
                                        解除合并
                                    </button>
                                </div>
                            </td>
                        </tr>

                        <tr v-if="!loading && bugs.length === 0">
                            <td colspan="10" class="border-b border-base-content/10">
                                <div :class="ADMIN_EMPTY">
                                    <Icon icon="ri:inbox-line" class="h-6.5 w-6.5 text-base-content/20" />
                                    <p class="text-[12.5px] text-base-content/55">
                                        {{ queryError ? "查询失败" : "没有符合条件的 BUG" }}
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
                :count="total"
                @update:page="value => changePage(value)"
            />
        </div>

        <!-- 纠错弹窗：内容较长，自绘宽遮罩而不是通用 Dialog -->
        <div v-if="editOpen && editTarget" class="fixed inset-0 z-100 flex items-center justify-center bg-gray-900/50 p-4" @click.self="editOpen = false">
            <div class="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden border border-base-content/15 bg-base-100">
                <header class="flex shrink-0 items-start justify-between gap-4 border-b border-base-content/10 px-5 py-3.5">
                    <div class="min-w-0">
                        <p :class="ADMIN_KICKER">Edit Bug</p>
                        <h3 class="mt-1.5 truncate text-[17px] font-semibold leading-tight text-base-content">{{ editTarget.title }}</h3>
                        <p :class="[ADMIN_MONO, 'mt-1 text-base-content/55']">
                            {{ editTarget.displayKey }} · v{{ editTarget.version }} · {{ categoryLabel(editTarget.primaryCategory) }}
                        </p>
                    </div>
                    <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL, 'px-1.5 text-[15px] leading-none']" aria-label="关闭" @click="editOpen = false">
                        <Icon icon="ri:close-line" class="h-3.75 w-3.75" />
                    </button>
                </header>

                <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    <div>
                        <span :class="ADMIN_LABEL">严重程度</span>
                        <div class="mt-1.5 flex flex-wrap items-center gap-1">
                            <button
                                v-for="option in SEVERITY_OPTIONS"
                                :key="option.value"
                                :class="[ADMIN_CHIP, editForm.severity === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                                @click="editForm.severity = option.value"
                            >
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div>
                        <span :class="ADMIN_LABEL">状态</span>
                        <div class="mt-1.5 flex flex-wrap items-center gap-1">
                            <button
                                v-for="option in STATUS_OPTIONS"
                                :key="option.value"
                                :class="[ADMIN_CHIP, editForm.status === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                                @click="editForm.status = option.value"
                            >
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div>
                        <span :class="ADMIN_LABEL">主分类</span>
                        <div class="mt-1.5 flex flex-wrap items-center gap-1">
                            <button
                                v-for="option in CATEGORY_OPTIONS"
                                :key="option.value"
                                :class="[ADMIN_CHIP, editForm.category === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                                @click="editForm.category = option.value"
                            >
                                {{ option.label }}
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label class="block">
                            <span :class="ADMIN_LABEL">修复版本</span>
                            <input v-model="editForm.fixedVersion" type="text" placeholder="如 1.4.0" :class="[ADMIN_INPUT, 'mt-1 font-mono']" />
                        </label>
                        <div class="flex items-end pb-1 text-[11px] text-base-content/45">留空表示清除已记录的修复版本</div>
                    </div>

                    <label class="block">
                        <span :class="ADMIN_LABEL">处理说明</span>
                        <textarea v-model="editForm.resolution" rows="3" placeholder="对外的处理结论（可留空）" :class="[ADMIN_INPUT, 'mt-1 min-h-20 resize-y border border-base-content/15 p-2']" />
                    </label>

                    <label class="block">
                        <span :class="ADMIN_LABEL">操作理由 · 必填</span>
                        <textarea
                            v-model="editForm.reason"
                            rows="2"
                            placeholder="记录在审计事件里，说明为什么这样改"
                            :class="[ADMIN_INPUT, 'mt-1 min-h-16 resize-y border border-base-content/15 p-2']"
                        />
                    </label>

                    <p v-if="editError" class="flex items-center gap-1.5 border-l-2 border-error py-1.5 pl-2.5 text-[11.5px] text-error">
                        <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
                        <span>{{ editError }}</span>
                    </p>
                </div>

                <footer class="flex shrink-0 items-center justify-end gap-2 border-t border-base-content/10 px-5 py-3">
                    <button :class="ADMIN_BTN" :disabled="saving" @click="editOpen = false">取消</button>
                    <button :class="ADMIN_BTN_PRIMARY" :disabled="saving" @click="submitEdit">
                        <Icon icon="ri:save-line" class="h-3.25 w-3.25" />
                        <span>{{ saving ? "保存中…" : "保存纠错" }}</span>
                    </button>
                </footer>
            </div>
        </div>

        <!-- 合并弹窗 -->
        <Dialog v-if="mergeOpen" v-model:open="mergeOpen" title="合并 BUG" description="把重复记录并入目标 BUG，可在归并记录中解除。">
            <template #content>
                <div class="space-y-3 py-2">
                    <p class="text-[12px] text-base-content/70">
                        源：<span :class="ADMIN_MONO">{{ mergeSource?.displayKey }}</span> {{ mergeSource?.title }}
                    </p>
                    <div>
                        <span :class="ADMIN_LABEL">目标 BUG</span>
                        <div class="mt-1.5 flex max-h-36 flex-wrap items-center gap-1 overflow-y-auto">
                            <button
                                v-for="target in mergeTargets"
                                :key="target.id"
                                :class="[ADMIN_CHIP, mergeTargetId === target.id ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                                :title="target.title"
                                @click="mergeTargetId = target.id"
                            >
                                {{ target.displayKey }}
                            </button>
                            <span v-if="mergeTargets.length === 0" class="text-[11.5px] text-base-content/45">当前页没有可选目标，请先筛选出目标 BUG</span>
                        </div>
                    </div>
                    <label class="block">
                        <span :class="ADMIN_LABEL">合并理由 · 必填</span>
                        <textarea v-model="mergeReason" rows="2" :class="[ADMIN_INPUT, 'mt-1 min-h-16 resize-y border border-base-content/15 p-2']" />
                    </label>
                    <p v-if="mergeError" class="flex items-center gap-1.5 border-l-2 border-error py-1.5 pl-2.5 text-[11.5px] text-error">
                        <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
                        <span>{{ mergeError }}</span>
                    </p>
                </div>
            </template>
            <template #actions>
                <div class="flex justify-end gap-2">
                    <button type="button" :class="ADMIN_BTN" :disabled="merging" @click="mergeOpen = false">取消</button>
                    <button type="button" :class="ADMIN_BTN_DANGER" :disabled="merging" @click="submitMerge">
                        <span>{{ merging ? "合并中…" : "确认合并" }}</span>
                    </button>
                </div>
            </template>
        </Dialog>

        <!-- 解除合并弹窗 -->
        <Dialog
            v-if="revertOpen"
            v-model:open="revertOpen"
            title="解除合并"
            description="按归并记录恢复各 BUG 的原状态；归并记录 ID 需要从所属 BUG 的归并历史里取得。"
        >
            <template #content>
                <div class="space-y-3 py-2">
                    <p class="text-[12px] text-base-content/70">
                        源：<span :class="ADMIN_MONO">{{ revertTarget?.displayKey }}</span> {{ revertTarget?.title }}
                    </p>
                    <label class="block">
                        <span :class="ADMIN_LABEL">归并记录 ID · 必填</span>
                        <input v-model="revertEventId" type="text" placeholder="bug_merge_events.id" :class="[ADMIN_INPUT, 'mt-1 font-mono']" />
                    </label>
                    <label class="block">
                        <span :class="ADMIN_LABEL">解除理由 · 必填</span>
                        <textarea v-model="revertReason" rows="2" :class="[ADMIN_INPUT, 'mt-1 min-h-16 resize-y border border-base-content/15 p-2']" />
                    </label>
                    <p v-if="revertError" class="flex items-center gap-1.5 border-l-2 border-error py-1.5 pl-2.5 text-[11.5px] text-error">
                        <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
                        <span>{{ revertError }}</span>
                    </p>
                </div>
            </template>
            <template #actions>
                <div class="flex justify-end gap-2">
                    <button type="button" :class="ADMIN_BTN" :disabled="reverting" @click="revertOpen = false">取消</button>
                    <button type="button" :class="ADMIN_BTN_DANGER" :disabled="reverting" @click="submitRevert">
                        <span>{{ reverting ? "处理中…" : "确认解除" }}</span>
                    </button>
                </div>
            </template>
        </Dialog>
    </div>
</template>
