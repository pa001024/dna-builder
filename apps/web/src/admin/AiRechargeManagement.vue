<script setup lang="ts">
import { onMounted, reactive, ref } from "vue"
import {
    adminCreateRechargeBatchMutation,
    adminRechargeBatchesQuery,
    adminRechargeCodesCountQuery,
    adminRechargeCodesQuery,
    adminRevokeRechargeBatchMutation,
    adminRevokeRechargeCodeMutation,
    type RechargeBatch,
    type RechargeCode,
} from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import { formatCost } from "@/utils/ai-log-format"
import { formatDateTime } from "@/utils/time"
import AdminPageHeader from "./AdminPageHeader.vue"
import {
    ADMIN_BADGE,
    ADMIN_BADGE_ERROR,
    ADMIN_BADGE_PRIMARY,
    ADMIN_BADGE_SUCCESS,
    ADMIN_BTN,
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
    ADMIN_ROW_TONE_ERROR,
    ADMIN_ROW_TONE_NEUTRAL,
    ADMIN_STAT_CELL,
    ADMIN_STAT_LABEL,
    ADMIN_STAT_VALUE,
    ADMIN_TABLE,
    ADMIN_TD,
    ADMIN_TH,
} from "./admin-ui"

/**
 * AI 充值兑换码管理页（管理员）：批量生成面额码、查看批次与单码状态、作废未用码。
 * 本页为后台内部工具，文案直接中文硬编码，不走 i18n。
 */

const ui = useUIStore()

const generating = ref(false)
const form = reactive({ amountYuan: "5", count: "20", expiresInDays: "" })
const lastCodes = ref<string[]>([])
const lastBatchId = ref("")

const batches = ref<RechargeBatch[]>([])
const batchesLoading = ref(false)

const codes = ref<RechargeCode[]>([])
const codesTotal = ref(0)
const codesLoading = ref(false)
const codesPage = ref(1)
const CODES_PAGE_SIZE = 20
const codeFilter = reactive({ batchId: "", status: "", search: "" })

/** 状态筛选：选项不超过 5 个，用方章而不是下拉 */
const STATUS_OPTIONS = [
    { label: "全部", value: "" },
    { label: "未使用", value: "unused" },
    { label: "已兑换", value: "redeemed" },
    { label: "已作废", value: "revoked" },
]

/**
 * @description 刷新批次列表。
 */
async function loadBatches() {
    batchesLoading.value = true
    try {
        batches.value = (await adminRechargeBatchesQuery({ limit: 50, offset: 0 }, { requestPolicy: "network-only" })) ?? []
    } catch (e) {
        ui.showErrorMessage(e instanceof Error ? e.message : "加载批次失败")
    } finally {
        batchesLoading.value = false
    }
}

/**
 * @description 按当前筛选刷新码明细与总数。
 */
async function loadCodes() {
    codesLoading.value = true
    try {
        const params = {
            batchId: codeFilter.batchId || undefined,
            status: codeFilter.status || undefined,
            search: codeFilter.search.trim() || undefined,
            limit: CODES_PAGE_SIZE,
            offset: (codesPage.value - 1) * CODES_PAGE_SIZE,
        }
        const [rows, total] = await Promise.all([
            adminRechargeCodesQuery(params, { requestPolicy: "network-only" }),
            adminRechargeCodesCountQuery(
                { batchId: params.batchId, status: params.status, search: params.search },
                { requestPolicy: "network-only" }
            ),
        ])
        codes.value = rows ?? []
        codesTotal.value = total ?? 0
    } catch (e) {
        ui.showErrorMessage(e instanceof Error ? e.message : "加载兑换码失败")
    } finally {
        codesLoading.value = false
    }
}

/**
 * @description 提交批量生成，成功后展示本批码并刷新列表。
 */
async function generate() {
    const amountYuan = Number(form.amountYuan)
    const count = Number(form.count)
    const expiresInDays = form.expiresInDays.trim() === "" ? undefined : Number(form.expiresInDays)
    if (!Number.isFinite(amountYuan) || !Number.isFinite(count)) {
        ui.showErrorMessage("面额与数量必须是数字")
        return
    }
    generating.value = true
    try {
        const result = await adminCreateRechargeBatchMutation({ amountYuan, count, expiresInDays })
        if (!result) throw new Error("生成失败")
        lastCodes.value = result.codes ?? []
        lastBatchId.value = result.batch.id
        ui.showSuccessMessage(`已生成 ${lastCodes.value.length} 张，每张 ${formatCost(result.batch.amountMicros)}`)
        await Promise.all([loadBatches(), loadCodes()])
    } catch (e) {
        ui.showErrorMessage(e instanceof Error ? e.message : "生成失败")
    } finally {
        generating.value = false
    }
}

/**
 * @description 复制文本到剪贴板。
 * @param text 待复制文本
 * @param label 成功提示中的名称
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
 * @description 作废单张未用码，二次确认后执行。
 * @param code 兑换码
 */
async function revokeCode(code: string) {
    if (!(await ui.showDialog("作废兑换码", `确定作废 ${code} 吗？已兑换的不受影响。`))) return
    try {
        await adminRevokeRechargeCodeMutation({ code })
        ui.showSuccessMessage("已作废")
        await Promise.all([loadBatches(), loadCodes()])
    } catch (e) {
        ui.showErrorMessage(e instanceof Error ? e.message : "作废失败")
    }
}

/**
 * @description 作废整批未用码，二次确认后执行。
 * @param batchId 批次 ID
 */
async function revokeBatch(batchId: string) {
    if (!(await ui.showDialog("作废整批", `确定作废该批次下全部未用码吗？已兑换的不受影响。`))) return
    try {
        const revoked = await adminRevokeRechargeBatchMutation({ batchId })
        ui.showSuccessMessage(`已作废 ${revoked ?? 0} 张`)
        await Promise.all([loadBatches(), loadCodes()])
    } catch (e) {
        ui.showErrorMessage(e instanceof Error ? e.message : "作废失败")
    }
}

/**
 * @description 查看某批次的码：收敛筛选后重查。
 * @param batchId 批次 ID
 */
async function viewBatch(batchId: string) {
    codeFilter.batchId = batchId
    codeFilter.status = ""
    codeFilter.search = ""
    codesPage.value = 1
    await loadCodes()
}

/**
 * @description 切换状态方章后立即重查（口径同筛选变更）。
 * @param status 状态值
 */
async function changeStatus(status: string) {
    codeFilter.status = status
    codesPage.value = 1
    await loadCodes()
}

/**
 * @description 切换页码后重查。
 * @param page 目标页码
 */
async function changeCodesPage(page: number) {
    codesPage.value = Math.min(Math.max(1, page), totalPages())
    await loadCodes()
}

/**
 * @description 兑换码状态中文名。
 * @param status 状态值
 */
function statusLabel(status: string): string {
    if (status === "redeemed") return "已兑换"
    if (status === "revoked") return "已作废"
    return "未使用"
}

/**
 * @description 状态方章配色。
 * @param status 状态值
 */
function statusBadgeClass(status: string): string {
    if (status === "redeemed") return ADMIN_BADGE_PRIMARY
    if (status === "revoked") return ADMIN_BADGE_ERROR
    return ADMIN_BADGE_SUCCESS
}

/**
 * @description 过期时间展示，空为永久有效，过期标红由调用方样式处理。
 * @param expiresAt 过期时间戳
 */
function expireLabel(expiresAt: number | null | undefined): string {
    if (expiresAt === null || expiresAt === undefined) return "永久有效"
    return formatDateTime(expiresAt)
}

const totalPages = () => Math.max(1, Math.ceil(codesTotal.value / CODES_PAGE_SIZE))

onMounted(async () => {
    await Promise.all([loadBatches(), loadCodes()])
})
</script>

<template>
    <div class="admin-page mx-auto flex min-h-full w-full max-w-390 flex-col px-5 pb-5">
        <AdminPageHeader
            kicker="Recharge"
            title="AI 充值兑换码"
            description="批量生成面额兑换码，用户在前端输入兑换后额度永久到账；免费额度仍每日重置"
        >
            <template #actions>
                <span class="font-orbitron text-[10px] tabular-nums text-base-content/30">
                    {{ generating ? "GENERATING" : "READY" }}
                </span>
            </template>
        </AdminPageHeader>

        <!-- 统计开本 -->
        <div class="flex flex-wrap border-b border-base-content/10">
            <div :class="[ADMIN_STAT_CELL, 'pl-0']">
                <p :class="ADMIN_STAT_LABEL">Batches</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ batches.length }}</span>
                    <span :class="ADMIN_NUM_UNIT">批（最近 50）</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Codes</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ codesTotal }}</span>
                    <span :class="ADMIN_NUM_UNIT">张（当前筛选）</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">On Page</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ codes.length }}</span>
                    <span :class="ADMIN_NUM_UNIT">张</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Last Batch</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ lastCodes.length }}</span>
                    <span :class="ADMIN_NUM_UNIT">{{ lastCodes.length ? "张待复制" : "尚未生成" }}</span>
                </p>
            </div>
            <div class="ml-auto flex items-center pr-0.5 text-[10.5px] text-base-content/35">
                {{ codesLoading || batchesLoading ? "同步中…" : "已同步" }}
            </div>
        </div>

        <!-- 批量生成 -->
        <section class="border-b border-base-content/10 py-3">
            <div class="mb-2 flex items-center gap-2">
                <h2 class="text-[15px] font-semibold text-base-content">批量生成</h2>
                <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
            </div>

            <div class="flex flex-wrap items-end gap-x-5 gap-y-3">
                <label class="block w-36">
                    <span :class="ADMIN_LABEL">单张面额（元）</span>
                    <input
                        v-model="form.amountYuan"
                        type="number"
                        min="0.1"
                        max="500"
                        step="0.1"
                        :class="[ADMIN_INPUT, 'mt-1 tabular-nums']"
                    />
                </label>
                <label class="block w-32">
                    <span :class="ADMIN_LABEL">数量（≤500）</span>
                    <input v-model="form.count" type="number" min="1" max="500" step="1" :class="[ADMIN_INPUT, 'mt-1 tabular-nums']" />
                </label>
                <label class="block w-40">
                    <span :class="ADMIN_LABEL">有效期（天，空=永久）</span>
                    <input
                        v-model="form.expiresInDays"
                        type="number"
                        min="1"
                        max="3650"
                        step="1"
                        :class="[ADMIN_INPUT, 'mt-1 tabular-nums']"
                    />
                </label>
                <button :class="ADMIN_BTN_PRIMARY" :disabled="generating" @click="generate">
                    <Icon icon="ri:coupon-line" class="h-3.25 w-3.25" />
                    <span>{{ generating ? "生成中…" : "生成兑换码" }}</span>
                </button>
            </div>

            <div v-if="lastCodes.length > 0" class="mt-3 border-t border-base-content/10 pt-3">
                <div class="mb-2 flex flex-wrap items-center gap-3">
                    <span class="text-[11.5px] text-base-content/60">
                        本批 <b class="font-orbitron tabular-nums text-base-content/85">{{ lastCodes.length }}</b> 张（批次
                        <span :class="[ADMIN_MONO, 'text-base-content/70']">{{ lastBatchId }}</span>）
                    </span>
                    <button :class="ADMIN_BTN" @click="copyText(lastCodes.join('\n'), '本批兑换码')">
                        <Icon icon="ri:file-copy-line" class="h-3.25 w-3.25" />
                        <span>复制全部</span>
                    </button>
                </div>
                <div
                    class="grid max-h-40 grid-cols-2 gap-x-4 overflow-y-auto border-t border-base-content/10 md:grid-cols-4"
                >
                    <span
                        v-for="code in lastCodes"
                        :key="code"
                        :class="[ADMIN_MONO, 'border-b border-base-content/[0.07] py-1 text-base-content/75']"
                    >
                        {{ code }}
                    </span>
                </div>
            </div>
        </section>

        <!-- 批次 -->
        <section class="border-b border-base-content/10 py-3">
            <div class="mb-2 flex items-center gap-2">
                <h2 class="text-[15px] font-semibold text-base-content">批次</h2>
                <span class="font-orbitron text-[11px] tabular-nums text-base-content/40">{{ batches.length }}</span>
                <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                <button :class="ADMIN_BTN" :disabled="batchesLoading" @click="loadBatches">
                    <Icon icon="ri:refresh-line" :class="['h-3.25 w-3.25', batchesLoading ? 'animate-spin' : '']" />
                    <span>刷新</span>
                </button>
            </div>

            <div class="relative min-w-0">
                <div v-if="batchesLoading" :class="ADMIN_PROGRESS_TRACK">
                    <div class="h-full w-1/3 animate-pulse bg-primary" />
                </div>
                <ScrollArea horizontal>
                    <table :class="ADMIN_TABLE">
                        <thead>
                            <tr class="bg-base-content/3">
                                <th :class="ADMIN_TH">批次</th>
                                <th :class="ADMIN_TH">面额</th>
                                <th :class="ADMIN_TH">总数</th>
                                <th :class="ADMIN_TH">已兑换</th>
                                <th :class="ADMIN_TH">已作废</th>
                                <th :class="ADMIN_TH">未使用</th>
                                <th :class="ADMIN_TH">有效期</th>
                                <th :class="[ADMIN_TH, 'text-right']">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="batch in batches" :key="batch.id" :class="ADMIN_ROW">
                                <td :class="[ADMIN_TD, ADMIN_MONO]">{{ batch.id }}</td>
                                <td :class="[ADMIN_TD, 'tabular-nums']">{{ formatCost(batch.amountMicros) }}</td>
                                <td :class="[ADMIN_TD, 'tabular-nums']">{{ batch.total }}</td>
                                <td :class="[ADMIN_TD, 'tabular-nums']">{{ batch.redeemed }}</td>
                                <td :class="[ADMIN_TD, 'tabular-nums']">{{ batch.revoked }}</td>
                                <td :class="[ADMIN_TD, 'tabular-nums']">{{ batch.unused }}</td>
                                <td :class="[ADMIN_TD, 'whitespace-nowrap text-base-content/70']">{{ expireLabel(batch.expiresAt) }}</td>
                                <td :class="[ADMIN_TD, 'text-right']">
                                    <div class="flex items-center justify-end gap-2.5 whitespace-nowrap">
                                        <button :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_NEUTRAL]" @click="viewBatch(batch.id)">
                                            查看
                                        </button>
                                        <button
                                            :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_ERROR]"
                                            :disabled="batch.unused === 0"
                                            @click="revokeBatch(batch.id)"
                                        >
                                            作废未用
                                        </button>
                                    </div>
                                </td>
                            </tr>

                            <tr v-if="batches.length === 0 && !batchesLoading">
                                <td colspan="8" class="border-b border-base-content/10">
                                    <div :class="ADMIN_EMPTY">
                                        <Icon icon="ri:inbox-line" class="h-5.5 w-5.5 text-base-content/20" />
                                        <p class="text-[12px] text-base-content/50">暂无批次</p>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </ScrollArea>
            </div>
        </section>

        <!-- 兑换码明细 -->
        <section class="flex min-h-0 flex-1 flex-col py-3">
            <div class="mb-2 flex items-center gap-2">
                <h2 class="text-[15px] font-semibold text-base-content">兑换码明细</h2>
                <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
            </div>

            <div class="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-base-content/10 pb-2.5">
                <label class="block w-44">
                    <span :class="ADMIN_LABEL">批次 ID</span>
                    <input v-model="codeFilter.batchId" type="text" placeholder="全部" :class="[ADMIN_INPUT, 'mt-1']" />
                </label>
                <div class="flex flex-col gap-1">
                    <span :class="ADMIN_LABEL">状态</span>
                    <div class="flex flex-wrap items-center gap-1">
                        <button
                            v-for="option in STATUS_OPTIONS"
                            :key="option.value"
                            :class="[ADMIN_CHIP, codeFilter.status === option.value ? ADMIN_CHIP_ON : ADMIN_CHIP_OFF]"
                            @click="changeStatus(option.value)"
                        >
                            {{ option.label }}
                        </button>
                    </div>
                </div>
                <label class="block w-56">
                    <span :class="ADMIN_LABEL">兑换码搜索</span>
                    <input
                        v-model="codeFilter.search"
                        type="text"
                        placeholder="输入完整或部分码"
                        :class="[ADMIN_INPUT, 'mt-1']"
                        @keyup.enter="
                            codesPage = 1;
                            loadCodes();
                        "
                    />
                </label>
                <button
                    :class="ADMIN_BTN"
                    @click="
                        codesPage = 1;
                        loadCodes();
                    "
                >
                    <Icon icon="ri:search-line" class="h-3.25 w-3.25" />
                    <span>查询</span>
                </button>
            </div>

            <div class="relative min-w-0 flex-1">
                <div v-if="codesLoading" :class="ADMIN_PROGRESS_TRACK">
                    <div class="h-full w-1/3 animate-pulse bg-primary" />
                </div>
                <ScrollArea horizontal>
                    <table :class="ADMIN_TABLE">
                        <thead>
                            <tr class="bg-base-content/3">
                                <th :class="ADMIN_TH">兑换码</th>
                                <th :class="ADMIN_TH">面额</th>
                                <th :class="ADMIN_TH">状态</th>
                                <th :class="ADMIN_TH">兑换时间</th>
                                <th :class="ADMIN_TH">有效期</th>
                                <th :class="[ADMIN_TH, 'text-right']">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="item in codes" :key="item.code" :class="ADMIN_ROW">
                                <td :class="[ADMIN_TD, ADMIN_MONO]">{{ item.code }}</td>
                                <td :class="[ADMIN_TD, 'tabular-nums']">{{ formatCost(item.amountMicros) }}</td>
                                <td :class="[ADMIN_TD, 'whitespace-nowrap']">
                                    <span :class="[ADMIN_BADGE, statusBadgeClass(item.status)]">{{ statusLabel(item.status) }}</span>
                                </td>
                                <td :class="[ADMIN_TD, 'whitespace-nowrap text-base-content/70']">
                                    {{ item.redeemedAt ? formatDateTime(item.redeemedAt) : "-" }}
                                </td>
                                <td
                                    :class="[
                                        ADMIN_TD,
                                        'whitespace-nowrap',
                                        item.expiresAt && item.expiresAt < Date.now() && item.status === 'unused'
                                            ? 'text-error'
                                            : 'text-base-content/70',
                                    ]"
                                >
                                    {{ expireLabel(item.expiresAt) }}
                                </td>
                                <td :class="[ADMIN_TD, 'text-right']">
                                    <div class="flex items-center justify-end whitespace-nowrap">
                                        <button
                                            v-if="item.status === 'unused'"
                                            :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_ERROR]"
                                            @click="revokeCode(item.code)"
                                        >
                                            作废
                                        </button>
                                        <span v-else class="text-[11.5px] text-base-content/30">-</span>
                                    </div>
                                </td>
                            </tr>

                            <tr v-if="codes.length === 0 && !codesLoading">
                                <td colspan="6" class="border-b border-base-content/10">
                                    <div :class="ADMIN_EMPTY">
                                        <Icon icon="ri:inbox-line" class="h-5.5 w-5.5 text-base-content/20" />
                                        <p class="text-[12px] text-base-content/50">暂无数据</p>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </ScrollArea>

                <PageFoot
                    :page="codesPage"
                    :pageSize="CODES_PAGE_SIZE"
                    :totalPages="totalPages()"
                    :count="codesTotal"
                    @update:page="changeCodesPage"
                />
            </div>
        </section>
    </div>
</template>
