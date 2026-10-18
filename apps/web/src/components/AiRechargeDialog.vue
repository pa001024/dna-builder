<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { ref, watch } from "vue"
import { type AiQuota, aiQuotaQuery, myRechargeRedemptionsQuery, type RechargeCode, redeemRechargeCodeMutation } from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import { formatCost } from "@/utils/ai-log-format"
import { formatDateTime } from "@/utils/time"

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ "update:open": [open: boolean]; redeemed: [] }>()

const { t } = useTranslation()
const ui = useUIStore()

const loading = ref(false)
const redeeming = ref(false)
const loadFailed = ref(false)
const quota = ref<AiQuota | null>(null)
const history = ref<RechargeCode[]>([])
const code = ref("")

/**
 * @description 打开弹窗时刷新额度与兑换记录。
 * @param isOpen 弹窗是否打开
 */
async function refreshOnOpen(isOpen: boolean) {
    if (!isOpen) return
    code.value = ""
    loading.value = true
    loadFailed.value = false
    try {
        const [quotaResult, historyResult] = await Promise.all([
            aiQuotaQuery(undefined, { requestPolicy: "network-only" }),
            myRechargeRedemptionsQuery({ limit: 10 }, { requestPolicy: "network-only" }),
        ])
        quota.value = quotaResult ?? null
        history.value = historyResult ?? []
        if (!quotaResult) loadFailed.value = true
    } catch {
        quota.value = null
        history.value = []
        loadFailed.value = true
    } finally {
        loading.value = false
    }
}

watch(
    () => props.open,
    refreshOnOpen,
    { immediate: true }
)

/**
 * @description 提交兑换码，成功后刷新额度与记录并通知父组件。
 */
async function redeem() {
    const input = code.value.trim()
    if (!input || redeeming.value) return
    redeeming.value = true
    try {
        const result = await redeemRechargeCodeMutation({ code: input })
        if (!result?.success) {
            ui.showErrorMessage(result?.message || t("ai-recharge.quota_unavailable"))
            return
        }
        ui.showSuccessMessage(`${t("ai-recharge.redeem")}：${formatCost(result.amountMicros)}`)
        quota.value = result.quota ?? null
        code.value = ""
        history.value = (await myRechargeRedemptionsQuery({ limit: 10 }, { requestPolicy: "network-only" })) ?? []
        emit("redeemed")
    } catch (e) {
        ui.showErrorMessage(e instanceof Error ? e.message : t("ai-recharge.quota_unavailable"))
    } finally {
        redeeming.value = false
    }
}

/**
 * @description 关闭弹窗。
 */
function close() {
    emit("update:open", false)
}
</script>

<template>
    <DialogRoot :open="open" @update:open="close">
        <DialogPortal>
            <DialogOverlay class="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm" />
            <DialogContent
                class="fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-base-content/15 bg-base-100 p-5 shadow-2xl"
            >
                <div class="flex items-center justify-between">
                    <h2 class="text-sm font-semibold">{{ t("ai-recharge.title") }}</h2>
                    <button
                        type="button"
                        class="grid size-6 cursor-pointer place-items-center text-base-content/45 hover:text-primary"
                        :aria-label="t('ai-recharge.cancel')"
                        @click="close"
                    >
                        <Icon icon="ri:close-line" class="h-4 w-4" />
                    </button>
                </div>

                <div v-if="loading" class="flex items-center justify-center py-8">
                    <span class="loading loading-spinner loading-md" />
                </div>
                <p v-else-if="loadFailed" class="py-6 text-center text-sm text-base-content/50">{{ t("ai-recharge.quota_unavailable") }}</p>
                <div v-else-if="quota" class="mt-3 space-y-3">
                    <div class="grid grid-cols-3 gap-2">
                        <div class="overflow-hidden border border-base-content/10 p-2 text-center">
                            <div class="text-[11px] whitespace-nowrap text-base-content/55">{{ t("ai-recharge.free_balance") }}</div>
                            <div class="font-orbitron text-sm font-semibold whitespace-nowrap text-primary tabular-nums">{{ formatCost(quota.freeBalance) }}</div>
                        </div>
                        <div class="overflow-hidden border border-base-content/10 p-2 text-center">
                            <div class="text-[11px] whitespace-nowrap text-base-content/55">{{ t("ai-recharge.permanent_balance") }}</div>
                            <div class="font-orbitron text-sm font-semibold whitespace-nowrap text-secondary tabular-nums">
                                {{ formatCost(quota.permanentBalance) }}
                            </div>
                        </div>
                        <div class="overflow-hidden border border-primary/30 bg-primary/5 p-2 text-center">
                            <div class="text-[11px] whitespace-nowrap text-base-content/55">{{ t("ai-recharge.total_balance") }}</div>
                            <div class="font-orbitron text-sm font-semibold whitespace-nowrap text-primary tabular-nums">
                                {{ formatCost(quota.totalBalance) }}
                            </div>
                        </div>
                    </div>

                    <div class="flex items-end gap-2">
                        <input
                            v-model="code"
                            type="text"
                            class="min-w-0 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] uppercase text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary disabled:border-base-content/10 disabled:opacity-50"
                            :placeholder="t('ai-recharge.code_placeholder')"
                            :disabled="redeeming"
                            @keyup.enter="redeem"
                        />
                        <button
                            type="button"
                            class="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border px-3 text-xs transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                            :class="!code.trim() || redeeming ? 'border-base-content/15 text-base-content/40' : 'border-primary/60 text-primary hover:bg-primary hover:text-primary-content'"
                            :disabled="!code.trim() || redeeming"
                            @click="redeem"
                        >
                            <span v-if="redeeming" class="loading loading-spinner loading-xs" />
                            {{ redeeming ? t("ai-recharge.redeeming") : t("ai-recharge.redeem") }}
                        </button>
                    </div>

                    <div class="flex justify-end">
                        <a
                            href="https://afdian.com/a/pa001024"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary/80 transition-colors duration-150 hover:text-primary"
                        >
                            {{ t("ai-recharge.buy_code") }}
                            <Icon icon="ri:external-link-line" class="h-3 w-3" />
                        </a>
                    </div>

                    <div>
                        <div class="mb-1 text-xs font-medium text-base-content/60">{{ t("ai-recharge.history") }}</div>
                        <p v-if="history.length === 0" class="text-xs text-base-content/40">{{ t("ai-recharge.no_history") }}</p>
                        <ul v-else class="max-h-36 space-y-1 overflow-y-auto text-xs">
                            <li
                                v-for="item in history"
                                :key="item.code"
                                class="flex items-center justify-between border-b border-base-content/8 py-1"
                            >
                                <span class="font-mono">{{ item.code }}</span>
                                <span class="tabular-nums text-primary">+{{ formatCost(item.amountMicros) }}</span>
                                <span class="text-base-content/45">{{ item.redeemedAt ? formatDateTime(item.redeemedAt) : "" }}</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
