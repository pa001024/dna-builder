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
 * @description 兑换码状态中文名。
 * @param status 状态值
 */
function statusLabel(status: string): string {
    if (status === "redeemed") return "已兑换"
    if (status === "revoked") return "已作废"
    return "未使用"
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
    <div class="min-h-screen bg-base-200/50 p-6">
        <div class="mb-6">
            <h2 class="text-2xl font-semibold text-base-content">AI 充值兑换码</h2>
            <p class="mt-1 text-sm text-base-content/70">批量生成面额兑换码，用户在前端输入兑换后额度永久到账；免费额度仍每日重置</p>
        </div>

        <!-- 生成表单 -->
        <div class="card mb-6 border border-base-300 bg-base-100 p-5 shadow-sm">
            <h3 class="mb-3 text-sm font-semibold">批量生成</h3>
            <div class="flex flex-wrap items-end gap-3">
                <label class="form-control w-36">
                    <span class="label-text text-xs">单张面额（元）</span>
                    <input v-model="form.amountYuan" type="number" min="0.1" max="500" step="0.1" class="input input-sm input-bordered" />
                </label>
                <label class="form-control w-32">
                    <span class="label-text text-xs">数量（≤500）</span>
                    <input v-model="form.count" type="number" min="1" max="500" step="1" class="input input-sm input-bordered" />
                </label>
                <label class="form-control w-40">
                    <span class="label-text text-xs">有效期（天，空=永久）</span>
                    <input v-model="form.expiresInDays" type="number" min="1" max="3650" step="1" class="input input-sm input-bordered" />
                </label>
                <button class="btn btn-sm btn-primary" :disabled="generating" @click="generate">
                    <span v-if="generating" class="loading loading-spinner loading-xs" />
                    生成兑换码
                </button>
            </div>
            <div v-if="lastCodes.length > 0" class="mt-3 border-t border-base-300 pt-3">
                <div class="mb-2 flex items-center gap-2">
                    <span class="text-xs text-base-content/60">本批 {{ lastCodes.length }} 张（批次 {{ lastBatchId }}）</span>
                    <button class="btn btn-xs btn-outline" @click="copyText(lastCodes.join('\n'), '本批兑换码')">
                        复制全部
                    </button>
                </div>
                <div class="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto font-mono text-xs md:grid-cols-4">
                    <span v-for="code in lastCodes" :key="code" class="border border-base-300 px-2 py-1">{{ code }}</span>
                </div>
            </div>
        </div>

        <!-- 批次列表 -->
        <div class="card mb-6 border border-base-300 bg-base-100 p-5 shadow-sm">
            <div class="mb-3 flex items-center justify-between">
                <h3 class="text-sm font-semibold">批次</h3>
                <button class="btn btn-xs btn-ghost" :disabled="batchesLoading" @click="loadBatches">
                    <span v-if="batchesLoading" class="loading loading-spinner loading-xs" />
                    刷新
                </button>
            </div>
            <div class="overflow-x-auto">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>批次</th>
                            <th>面额</th>
                            <th>总数</th>
                            <th>已兑换</th>
                            <th>已作废</th>
                            <th>未使用</th>
                            <th>有效期</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="batch in batches" :key="batch.id">
                            <td class="font-mono text-xs">{{ batch.id }}</td>
                            <td class="tabular-nums">{{ formatCost(batch.amountMicros) }}</td>
                            <td>{{ batch.total }}</td>
                            <td>{{ batch.redeemed }}</td>
                            <td>{{ batch.revoked }}</td>
                            <td>{{ batch.unused }}</td>
                            <td class="text-xs">{{ expireLabel(batch.expiresAt) }}</td>
                            <td class="flex gap-1">
                                <button class="btn btn-xs btn-ghost" @click="viewBatch(batch.id)">查看</button>
                                <button class="btn btn-xs btn-ghost text-error" :disabled="batch.unused === 0" @click="revokeBatch(batch.id)">
                                    作废未用
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="batches.length === 0 && !batchesLoading" class="py-4 text-center text-sm text-base-content/50">暂无批次</p>
            </div>
        </div>

        <!-- 码明细 -->
        <div class="card border border-base-300 bg-base-100 p-5 shadow-sm">
            <h3 class="mb-3 text-sm font-semibold">兑换码明细</h3>
            <div class="mb-3 flex flex-wrap items-end gap-2">
                <label class="form-control w-44">
                    <span class="label-text text-xs">批次 ID</span>
                    <input v-model="codeFilter.batchId" type="text" placeholder="全部" class="input input-sm input-bordered" />
                </label>
                <label class="form-control w-32">
                    <span class="label-text text-xs">状态</span>
                    <select v-model="codeFilter.status" class="select select-sm select-bordered">
                        <option value="">全部</option>
                        <option value="unused">未使用</option>
                        <option value="redeemed">已兑换</option>
                        <option value="revoked">已作废</option>
                    </select>
                </label>
                <label class="form-control w-56">
                    <span class="label-text text-xs">兑换码搜索</span>
                    <input v-model="codeFilter.search" type="text" placeholder="输入完整或部分码" class="input input-sm input-bordered" />
                </label>
                <button
                    class="btn btn-sm btn-outline"
                    @click="
                        codesPage = 1;
                        loadCodes();
                    "
                >
                    查询
                </button>
            </div>
            <div class="overflow-x-auto">
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>兑换码</th>
                            <th>面额</th>
                            <th>状态</th>
                            <th>兑换时间</th>
                            <th>有效期</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in codes" :key="item.code">
                            <td class="font-mono text-xs">{{ item.code }}</td>
                            <td class="tabular-nums">{{ formatCost(item.amountMicros) }}</td>
                            <td>
                                <span
                                    class="badge badge-sm"
                                    :class="item.status === 'unused' ? 'badge-success' : item.status === 'redeemed' ? 'badge-info' : 'badge-error'"
                                >
                                    {{ statusLabel(item.status) }}
                                </span>
                            </td>
                            <td class="text-xs">{{ item.redeemedAt ? formatDateTime(item.redeemedAt) : "-" }}</td>
                            <td
                                class="text-xs"
                                :class="item.expiresAt && item.expiresAt < Date.now() && item.status === 'unused' ? 'text-error' : ''"
                            >
                                {{ expireLabel(item.expiresAt) }}
                            </td>
                            <td>
                                <button
                                    v-if="item.status === 'unused'"
                                    class="btn btn-xs btn-ghost text-error"
                                    @click="revokeCode(item.code)"
                                >
                                    作废
                                </button>
                                <span v-else class="text-xs text-base-content/40">-</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="codes.length === 0 && !codesLoading" class="py-4 text-center text-sm text-base-content/50">暂无数据</p>
            </div>
            <div class="mt-3 flex items-center justify-between text-xs text-base-content/60">
                <span>共 {{ codesTotal }} 条</span>
                <div class="flex items-center gap-2">
                    <button
                        class="btn btn-xs"
                        :disabled="codesPage <= 1"
                        @click="
                            codesPage--;
                            loadCodes();
                        "
                    >
                        上一页
                    </button>
                    <span>{{ codesPage }} / {{ totalPages() }}</span>
                    <button
                        class="btn btn-xs"
                        :disabled="codesPage >= totalPages()"
                        @click="
                            codesPage++;
                            loadCodes();
                        "
                    >
                        下一页
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
