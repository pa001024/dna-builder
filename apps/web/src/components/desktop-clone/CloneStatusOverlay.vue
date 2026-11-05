<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { cloneErrorI18nKey, toCloneErrorMessage } from "@/api/desktop-clone"
import { prepareCloneOverlay, useDesktopCloneStore, watchCloneOverlay } from "@/store/desktop-clone"

/**
 * 克隆窗口的状态层：能力清单、准备/连接进度、断开/错误提示与诊断面板。
 *
 * 覆盖层显示期间原生 RDP 子窗口会被隐藏（由 DesktopCloneView 的引用计数控制），
 * 因此这里的背景必须是不透明的，才能完全替代远端画面。
 */
const emit = defineEmits<{
    start: []
    retry: []
    reconnect: []
    cancel: []
}>()

const { t } = useTranslation()
const store = useDesktopCloneStore()

const diagnosticOpen = ref(false)
const diagnosticBusy = ref(false)
const diagnosticText = ref("")
const diagnosticError = ref("")
const copied = ref(false)
const diagnosticDialog = ref<HTMLDialogElement | null>(null)
let copyTimer: number | null = null

const capabilityItems = computed(() => {
    const capability = store.capability
    if (!capability) return []
    const editionDetail = [capability.productName, capability.displayVersion, capability.build ? `(${capability.build})` : ""]
        .filter(Boolean)
        .join(" ")
    return [
        {
            key: "edition",
            label: t("desktop_clone.capability.edition"),
            detail: editionDetail,
            ok: !/^core/i.test(capability.editionId) && capability.build > 0,
        },
        { key: "elevated", label: t("desktop_clone.capability.elevated"), detail: "", ok: capability.elevated },
        { key: "term_service", label: t("desktop_clone.capability.term_service"), detail: "", ok: capability.termServiceRunning },
        { key: "child_sessions", label: t("desktop_clone.capability.child_sessions"), detail: "", ok: capability.childSessionsEnabled },
        {
            key: "activex",
            label: t("desktop_clone.capability.activex"),
            detail: "",
            ok: capability.activeXAvailable && capability.atlAvailable,
        },
    ]
})

const canStart = computed(() => store.capability?.supported === true && store.busy === "" && store.state !== "unsupported")

const unsupportedKey = computed(() => {
    const capability = store.capability
    if (!capability) return "desktop_clone.unsupported.generic"
    if (/^core/i.test(capability.editionId)) return "desktop_clone.unsupported.home_edition"
    if (!capability.elevated) return "desktop_clone.unsupported.not_elevated"
    if (!capability.atlAvailable || !capability.activeXAvailable) return "desktop_clone.unsupported.activex"
    if (!capability.build) return "desktop_clone.unsupported.unknown_build"
    return "desktop_clone.unsupported.generic"
})

const errorKey = computed(() => cloneErrorI18nKey(store.error?.code, store.error?.message))
const errorHeadline = computed(() => (errorKey.value ? t(errorKey.value) : store.errorMessage))

const steps = computed(() => [
    { key: "env", label: t("desktop_clone.progress.step_env") },
    { key: "session", label: t("desktop_clone.progress.step_session") },
    { key: "connect", label: t("desktop_clone.progress.step_connect") },
])

const stepIndex = computed(() => {
    if (store.state === "preparing") return 0
    if (store.state === "connecting") return 2
    return -1
})

async function loadDiagnostic() {
    diagnosticBusy.value = true
    diagnosticError.value = ""
    try {
        diagnosticText.value = await store.diagnose()
    } catch (cause) {
        diagnosticError.value = toCloneErrorMessage(cause)
    } finally {
        diagnosticBusy.value = false
    }
}

async function openDiagnostics() {
    await prepareCloneOverlay()
    diagnosticOpen.value = true
    await loadDiagnostic()
}

async function copyDiagnostic() {
    if (!diagnosticText.value) await loadDiagnostic()
    if (!diagnosticText.value) return
    try {
        await navigator.clipboard.writeText(diagnosticText.value)
        copied.value = true
        if (copyTimer !== null) window.clearTimeout(copyTimer)
        copyTimer = window.setTimeout(() => {
            copied.value = false
            copyTimer = null
        }, 2000)
    } catch (cause) {
        diagnosticError.value = toCloneErrorMessage(cause)
    }
}

watch(
    () => diagnosticOpen.value,
    open => {
        const dialog = diagnosticDialog.value
        if (!dialog) return
        if (open && !dialog.open) dialog.showModal()
        else if (!open && dialog.open) dialog.close()
    },
    { flush: "post" }
)

watchCloneOverlay(() => diagnosticOpen.value)

function closeDiagnostics() {
    diagnosticOpen.value = false
}

function retryLoad() {
    void store.refresh()
}

onBeforeUnmount(() => {
    if (copyTimer !== null) window.clearTimeout(copyTimer)
})
</script>

<template>
    <div class="absolute inset-0 flex items-center justify-center overflow-auto bg-base-300 p-5">
        <div class="flex w-full max-w-lg flex-col gap-4">
            <!-- 读取状态失败：不能停在空白页，给出原因与重试 -->
            <template v-if="store.loadFailed && !store.status">
                <div class="flex items-center gap-2">
                    <Icon icon="ri:error-warning-line" class="size-5 text-error" />
                    <span class="text-sm font-semibold">{{ t("desktop_clone.status.load_failed") }}</span>
                </div>
                <p v-if="store.lastError" class="break-all rounded-xs border border-error/25 bg-error/5 p-3 text-xs text-base-content/60">
                    {{ store.lastError }}
                </p>
                <button type="button" class="btn btn-sm btn-primary self-start" @click="retryLoad">
                    {{ t("common.retry") }}
                </button>
            </template>

            <!-- 首次读取状态 -->
            <template v-else-if="!store.status && !store.initialized">
                <div class="flex flex-col items-center gap-2 py-6 text-base-content/50">
                    <span class="loading loading-spinner loading-md" />
                    <span class="text-xs">{{ t("common.loading") }}</span>
                </div>
            </template>

            <!-- 不支持 -->
            <template v-else-if="store.state === 'unsupported'">
                <div class="rounded-xs border border-error/30 bg-error/10 p-4">
                    <div class="flex items-center gap-2 text-error">
                        <Icon icon="ri:error-warning-line" class="size-5" />
                        <span class="text-sm font-semibold">{{ t(unsupportedKey) }}</span>
                    </div>
                    <p v-if="store.capability?.reason" class="mt-2 text-xs text-base-content/60">{{ store.capability.reason }}</p>
                </div>
                <div class="flex flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-100/60 p-3">
                    <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.capability.title") }}</span>
                    <div v-for="item in capabilityItems" :key="item.key" class="flex items-center gap-2 text-xs">
                        <Icon
                            :icon="item.ok ? 'ri:checkbox-circle-fill' : 'ri:close-circle-line'"
                            class="size-4 shrink-0"
                            :class="item.ok ? 'text-success' : 'text-error'"
                        />
                        <span class="text-base-content/70">{{ item.label }}</span>
                        <span v-if="item.detail" class="truncate text-base-content/40">{{ item.detail }}</span>
                    </div>
                </div>
                <button type="button" class="btn btn-sm btn-outline self-start" @click="openDiagnostics">
                    {{ t("desktop_clone.action.diagnose") }}
                </button>
            </template>

            <!-- 未连接 -->
            <template v-else-if="store.state === 'idle'">
                <div class="flex flex-col gap-1">
                    <span class="text-lg font-semibold">{{ t("desktop_clone.status.idle") }}</span>
                    <span class="text-xs text-base-content/55">{{ t("desktop_clone.idle.description") }}</span>
                </div>
                <div class="flex flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-100/60 p-3">
                    <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.capability.title") }}</span>
                    <div v-for="item in capabilityItems" :key="item.key" class="flex items-center gap-2 text-xs">
                        <Icon
                            :icon="item.ok ? 'ri:checkbox-circle-fill' : 'ri:close-circle-line'"
                            class="size-4 shrink-0"
                            :class="item.ok ? 'text-success' : 'text-warning'"
                        />
                        <span class="text-base-content/70">{{ item.label }}</span>
                        <span v-if="item.detail" class="truncate text-base-content/40">{{ item.detail }}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="btn btn-sm btn-primary" :disabled="!canStart" @click="emit('start')">
                        <Icon icon="ri:play-line" class="size-4" />
                        {{ t("desktop_clone.action.start") }}
                    </button>
                    <button type="button" class="btn btn-sm btn-ghost" @click="openDiagnostics">{{ t("desktop_clone.action.diagnose") }}</button>
                </div>
            </template>

            <!-- 准备中 / 连接中 -->
            <template v-else-if="store.state === 'preparing' || store.state === 'connecting'">
                <div class="flex items-center gap-2">
                    <span class="loading loading-spinner loading-sm text-primary" />
                    <span class="text-sm font-semibold">
                        {{
                            store.state === "preparing"
                                ? t("desktop_clone.progress.preparing")
                                : t("desktop_clone.progress.connecting")
                        }}
                    </span>
                </div>
                <div class="flex flex-col gap-2 rounded-xs border border-base-content/10 bg-base-100/60 p-3">
                    <div v-for="(step, index) in steps" :key="step.key" class="flex items-center gap-2 text-xs">
                        <Icon
                            v-if="index < stepIndex"
                            icon="ri:checkbox-circle-fill"
                            class="size-4 shrink-0 text-success"
                        />
                        <span v-else-if="index === stepIndex" class="loading loading-spinner loading-xs shrink-0 text-primary" />
                        <span v-else class="size-4 shrink-0 rounded-full border border-base-content/20" />
                        <span :class="index <= stepIndex ? 'text-base-content/80' : 'text-base-content/40'">{{ step.label }}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="btn btn-sm btn-ghost" :disabled="store.busy !== ''" @click="emit('cancel')">
                        {{ t("desktop_clone.action.cancel") }}
                    </button>
                    <span class="text-[11px] text-base-content/40">{{ t("desktop_clone.progress.cancel_hint") }}</span>
                </div>
            </template>

            <!-- 等待凭据：对话框通常盖在上层；关掉对话框后仍可从这里的按钮重新打开 -->
            <template v-else-if="store.state === 'awaiting-credentials'">
                <div class="flex flex-col items-center gap-2 text-center">
                    <Icon icon="ri:lock-line" class="size-8 text-base-content/30" />
                    <span class="text-sm text-base-content/60">{{ t("desktop_clone.credentials.required") }}</span>
                </div>
                <div class="flex items-center justify-center gap-2">
                    <button type="button" class="btn btn-sm btn-primary" @click="emit('start')">
                        {{ t("desktop_clone.credentials.submit") }}
                    </button>
                    <button type="button" class="btn btn-sm btn-ghost" @click="emit('cancel')" :disabled="store.busy !== ''">
                        {{ t("desktop_clone.action.cancel") }}
                    </button>
                </div>
            </template>

            <!-- 已断开 -->
            <template v-else-if="store.state === 'disconnected'">
                <div class="flex items-center gap-2">
                    <Icon icon="ri:close-circle-line" class="size-5 text-warning" />
                    <span class="text-sm font-semibold">{{ t("desktop_clone.disconnected.title") }}</span>
                </div>
                <p class="text-xs text-base-content/60">{{ errorHeadline || t("desktop_clone.disconnected.description") }}</p>
                <div class="flex flex-wrap items-center gap-2">
                    <button type="button" class="btn btn-sm btn-primary" @click="emit('reconnect')">
                        {{ t("desktop_clone.action.reconnect") }}
                    </button>
                    <button type="button" class="btn btn-sm btn-ghost" @click="openDiagnostics">{{ t("desktop_clone.action.diagnose") }}</button>
                </div>
            </template>

            <!-- 错误 -->
            <template v-else-if="store.state === 'error'">
                <div class="flex items-center gap-2">
                    <Icon icon="ri:error-warning-line" class="size-5 text-error" />
                    <span class="text-sm font-semibold">{{ t("desktop_clone.error.title") }}</span>
                </div>
                <div class="flex flex-col gap-1 rounded-xs border border-error/25 bg-error/5 p-3">
                    <span class="text-sm text-error">{{ errorHeadline }}</span>
                    <span v-if="errorHeadline !== store.errorMessage" class="text-[11px] text-base-content/50">
                        {{ t("desktop_clone.error.code", { code: store.error?.code || "-" }) }}
                    </span>
                    <span v-if="errorHeadline !== store.errorMessage" class="break-all text-[11px] text-base-content/60">
                        {{ store.errorMessage }}
                    </span>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <button type="button" class="btn btn-sm btn-primary" @click="emit('retry')">{{ t("desktop_clone.action.retry") }}</button>
                    <button type="button" class="btn btn-sm btn-ghost" @click="openDiagnostics">{{ t("desktop_clone.action.diagnose") }}</button>
                    <button type="button" class="btn btn-sm btn-outline" @click="copyDiagnostic">
                        {{ copied ? t("desktop_clone.action.copied") : t("desktop_clone.action.copy_diagnostic") }}
                    </button>
                </div>
            </template>

            <!-- 正在关闭 -->
            <template v-else-if="store.state === 'closing'">
                <div class="flex flex-col items-center gap-2 py-6">
                    <span class="loading loading-spinner loading-md text-primary" />
                    <span class="text-sm text-base-content/60">{{ t("desktop_clone.progress.closing") }}</span>
                </div>
            </template>
        </div>

        <dialog ref="diagnosticDialog" class="modal" @cancel.prevent="closeDiagnostics">
            <div class="modal-box max-w-2xl rounded-xs border border-base-content/10 bg-base-100">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold">{{ t("desktop_clone.action.diagnose") }}</span>
                    <button type="button" class="btn btn-ghost btn-xs btn-square" @click="closeDiagnostics">
                        <Icon icon="codicon:chrome-close" class="size-3.5" />
                    </button>
                </div>
                <div v-if="diagnosticBusy" class="flex justify-center py-8">
                    <span class="loading loading-spinner loading-md" />
                </div>
                <pre
                    v-else
                    class="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-xs bg-base-content/5 p-2 text-[11px] leading-relaxed"
                    >{{ diagnosticText }}</pre
                >
                <p v-if="diagnosticError" class="mt-2 text-xs text-error">{{ diagnosticError }}</p>
                <div class="modal-action">
                    <button type="button" class="btn btn-sm btn-ghost" @click="closeDiagnostics">
                        {{ t("desktop_clone.action.cancel") }}
                    </button>
                    <button type="button" class="btn btn-sm btn-outline" :disabled="diagnosticBusy" @click="copyDiagnostic">
                        {{ copied ? t("desktop_clone.action.copied") : t("desktop_clone.action.copy_diagnostic") }}
                    </button>
                </div>
            </div>
        </dialog>
    </div>
</template>
