<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import {
    type CloneCapability,
    type CloneOptions,
    type CloneStatus,
    desktopCloneCapability,
    desktopCloneDiagnose,
    desktopCloneOpen,
    desktopCloneSetOptions,
    desktopCloneStatus,
    toCloneErrorMessage,
} from "@/api/desktop-clone"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"

/**
 * 设置页「桌面分身」分区。
 *
 * 主窗口收不到发给克隆窗口的事件，这里只按命令读取/写入状态，并提供手动刷新。
 * 选项改动会立即持久化；热键路由与静音在已连接时由克隆窗口弹重连确认。
 */
const { t } = useTranslation()
const ui = useUIStore()

const status = ref<CloneStatus | null>(null)
const options = ref<CloneOptions | null>(null)
const loading = ref(true)
const busy = ref("")
const diagnostic = ref("")
const diagnosticBusy = ref(false)
const copied = ref(false)
let copyTimer: number | null = null

const capability = computed<CloneCapability | null>(() => status.value?.capability ?? null)

const capabilityItems = computed(() => {
    const value = capability.value
    if (!value) return []
    return [
        {
            key: "edition",
            label: t("desktop_clone.capability.edition"),
            ok: !/^core/i.test(value.editionId) && value.build > 0,
            detail: [value.productName, value.displayVersion, value.build ? `(${value.build})` : ""].filter(Boolean).join(" "),
        },
        { key: "elevated", label: t("desktop_clone.capability.elevated"), ok: value.elevated, detail: "" },
        { key: "term_service", label: t("desktop_clone.capability.term_service"), ok: value.termServiceRunning, detail: "" },
        { key: "child_sessions", label: t("desktop_clone.capability.child_sessions"), ok: value.childSessionsEnabled, detail: "" },
        { key: "activex", label: t("desktop_clone.capability.activex"), ok: value.activeXAvailable && value.atlAvailable, detail: "" },
    ]
})

function handleError(cause: unknown, messageKey = "desktop_clone.settings.load_failed") {
    const message = toCloneErrorMessage(cause)
    ui.showErrorMessage(t(messageKey, { message }))
    console.error("桌面分身设置操作失败", cause)
}

async function load() {
    if (!env.isApp) {
        loading.value = false
        return
    }
    loading.value = true
    try {
        const value = await desktopCloneStatus()
        status.value = value
        options.value = value.options
    } catch (cause) {
        handleError(cause)
    } finally {
        loading.value = false
    }
}

async function refreshCapability() {
    if (!env.isApp) return
    busy.value = "refresh"
    try {
        const value = await desktopCloneCapability()
        if (status.value) status.value.capability = value
        else await load()
    } catch (cause) {
        handleError(cause)
    } finally {
        busy.value = ""
    }
}

async function openCloneWindow() {
    if (!env.isApp) return
    busy.value = "open"
    try {
        await desktopCloneOpen()
        ui.showSuccessMessage(t("desktop_clone.settings.opened"))
    } catch (cause) {
        handleError(cause, "desktop_clone.settings.open_failed")
    } finally {
        busy.value = ""
    }
}

async function update(patch: Partial<CloneOptions>) {
    if (!options.value || !env.isApp || busy.value === "options") return
    busy.value = "options"
    try {
        // 控制中心可能刚改过程序列表：先取最新状态，只覆盖本次目标字段，
        // 不能用打开设置页时缓存的整份 options 提交，否则会回滚其他窗口的修改
        const latest = await desktopCloneStatus()
        options.value = await desktopCloneSetOptions({ ...latest.options, ...patch })
        if (status.value) status.value.options = options.value
    } catch (cause) {
        await load()
        handleError(cause, "desktop_clone.settings.save_failed")
    } finally {
        busy.value = ""
    }
}

function toggle(event: Event, apply: (checked: boolean) => void) {
    apply((event.target as HTMLInputElement).checked)
}

async function loadDiagnostic() {
    if (!env.isApp || diagnosticBusy.value) return
    diagnosticBusy.value = true
    try {
        diagnostic.value = await desktopCloneDiagnose()
    } catch (cause) {
        handleError(cause)
    } finally {
        diagnosticBusy.value = false
    }
}

async function copyDiagnostic() {
    if (!diagnostic.value) await loadDiagnostic()
    if (!diagnostic.value) return
    try {
        await navigator.clipboard.writeText(diagnostic.value)
        copied.value = true
        if (copyTimer !== null) window.clearTimeout(copyTimer)
        copyTimer = window.setTimeout(() => {
            copied.value = false
            copyTimer = null
        }, 2000)
    } catch (cause) {
        handleError(cause, "desktop_clone.settings.copy_failed")
    }
}

onMounted(load)

onBeforeUnmount(() => {
    if (copyTimer !== null) window.clearTimeout(copyTimer)
})
</script>

<template>
    <div class="flex flex-col gap-2">
        <div
            class="animate-ef-rise motion-reduce:animate-none flex flex-col gap-3 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <div class="label-text">
                        {{ t("desktop_clone.section_title") }}
                        <div class="text-xs text-base-content/50">{{ t("desktop_clone.settings.description") }}</div>
                    </div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                    <button type="button" class="btn btn-xs btn-ghost btn-square" :title="t('desktop_clone.settings.refresh')" @click="load">
                        <Icon icon="ri:refresh-line" class="size-3.5" />
                    </button>
                    <button type="button" class="btn btn-sm btn-primary" :disabled="!capability?.supported || busy === 'open'" @click="openCloneWindow">
                        <span v-if="busy === 'open'" class="loading loading-spinner loading-xs" />
                        <Icon v-else icon="ri:windows-fill" class="size-4" />
                        {{ t("desktop_clone.settings.open") }}
                    </button>
                </div>
            </div>

            <div v-if="loading" class="flex justify-center py-3">
                <span class="loading loading-spinner loading-sm" />
            </div>
            <div v-else class="flex flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.capability.title") }}</span>
                    <button type="button" class="btn btn-xs btn-ghost" :disabled="busy === 'refresh'" @click="refreshCapability">
                        <span v-if="busy === 'refresh'" class="loading loading-spinner loading-xs" />
                        {{ t("desktop_clone.settings.refresh") }}
                    </button>
                </div>
                <div v-for="item in capabilityItems" :key="item.key" class="flex items-center gap-2 text-xs">
                    <Icon
                        :icon="item.ok ? 'ri:checkbox-circle-fill' : 'ri:close-circle-line'"
                        class="size-4 shrink-0"
                        :class="item.ok ? 'text-success' : 'text-warning'"
                    />
                    <span class="text-base-content/70">{{ item.label }}</span>
                    <span v-if="item.detail" class="truncate text-base-content/40">{{ item.detail }}</span>
                </div>
                <p v-if="capability && !capability.supported && capability.reason" class="text-[11px] text-warning">
                    {{ capability.reason }}
                </p>
                <p class="text-[11px] leading-snug text-base-content/45">{{ t("desktop_clone.settings.requirements") }}</p>
            </div>
        </div>

        <div
            v-if="options"
            class="animate-ef-rise motion-reduce:animate-none flex flex-col gap-2 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
            :style="{ animationDelay: '0.03s' }"
        >
            <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.settings.options") }}</span>

            <label class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-sm">{{ t("desktop_clone.options.always_on_top") }}</span>
                <input
                    type="checkbox"
                    class="toggle toggle-sm toggle-secondary"
                    :checked="options.alwaysOnTop"
                    :disabled="busy === 'options'"
                    @change="toggle($event, checked => update({ alwaysOnTop: checked }))"
                />
            </label>

            <label class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-sm">
                    {{ t("desktop_clone.options.scaling") }}
                    <span class="block text-[11px] text-base-content/45">{{ t("desktop_clone.options.scaling_desc") }}</span>
                </span>
                <input
                    type="checkbox"
                    class="toggle toggle-sm toggle-secondary"
                    :checked="options.smartSizing"
                    :disabled="busy === 'options'"
                    @change="toggle($event, checked => update({ smartSizing: checked }))"
                />
            </label>

            <label class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-sm">
                    {{ t("desktop_clone.options.aspect_lock") }}
                    <span class="block text-[11px] text-base-content/45">{{ t("desktop_clone.options.aspect_lock_desc") }}</span>
                </span>
                <input
                    type="checkbox"
                    class="toggle toggle-sm toggle-secondary"
                    :checked="options.aspectLock"
                    :disabled="busy === 'options'"
                    @change="toggle($event, checked => update({ aspectLock: checked }))"
                />
            </label>

            <div class="flex flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-sm">{{ t("desktop_clone.options.small_window") }}</span>
                <div class="grid grid-cols-3 gap-1">
                    <button
                        type="button"
                        class="btn btn-xs"
                        :class="options.smallWindow === 'off' ? 'btn-primary' : 'btn-ghost border border-base-content/10'"
                        :disabled="busy === 'options'"
                        @click="update({ smallWindow: 'off' })"
                    >
                        {{ t("desktop_clone.options.small_window_off") }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-xs"
                        :class="options.smallWindow === '500' ? 'btn-primary' : 'btn-ghost border border-base-content/10'"
                        :disabled="busy === 'options'"
                        @click="update({ smallWindow: '500' })"
                    >
                        {{ t("desktop_clone.options.small_window_500") }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-xs"
                        :class="options.smallWindow === '1280' ? 'btn-primary' : 'btn-ghost border border-base-content/10'"
                        :disabled="busy === 'options'"
                        @click="update({ smallWindow: '1280' })"
                    >
                        {{ t("desktop_clone.options.small_window_1280") }}
                    </button>
                </div>
            </div>

            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-sm">
                    {{ t("desktop_clone.options.mouse_mode") }}
                    <span class="block text-[11px] text-base-content/45">{{ t("desktop_clone.options.mouse_mode_desc") }}</span>
                </span>
                <input
                    type="checkbox"
                    class="toggle toggle-sm toggle-secondary"
                    :checked="options.mouseMode === 'game'"
                    :disabled="busy === 'options'"
                    @change="toggle($event, checked => update({ mouseMode: checked ? 'game' : 'normal' }))"
                />
            </div>

            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-sm">
                    {{ t("desktop_clone.options.keyboard_hook") }}
                    <span class="block text-[11px] text-base-content/45">{{ t("desktop_clone.options.keyboard_hook_desc") }}</span>
                </span>
                <input
                    type="checkbox"
                    class="toggle toggle-sm toggle-secondary"
                    :checked="options.keyboardHook === 'remote'"
                    :disabled="busy === 'options'"
                    @change="toggle($event, checked => update({ keyboardHook: checked ? 'remote' : 'local' }))"
                />
            </div>

            <label class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-sm">
                    {{ t("desktop_clone.options.mute") }}
                    <span class="block text-[11px] text-base-content/45">{{ t("desktop_clone.options.mute_desc") }}</span>
                </span>
                <input
                    type="checkbox"
                    class="toggle toggle-sm toggle-secondary"
                    :checked="options.muted"
                    :disabled="busy === 'options'"
                    @change="toggle($event, checked => update({ muted: checked }))"
                />
            </label>

            <p class="text-[11px] leading-snug text-base-content/45">{{ t("desktop_clone.settings.reconnect_hint") }}</p>
            <p class="text-[11px] leading-snug text-base-content/45">{{ t("desktop_clone.settings.close_hint") }}</p>
        </div>

        <div
            v-if="options"
            class="animate-ef-rise motion-reduce:animate-none flex flex-col gap-2 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
            :style="{ animationDelay: '0.05s' }"
        >
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.settings.programs") }}</span>
                <span class="text-[11px] text-base-content/40">{{ t("desktop_clone.settings.programs_count", { total: options.programs.length }) }}</span>
            </div>
            <p v-if="!options.programs.length" class="text-xs text-base-content/45">{{ t("desktop_clone.settings.programs_empty") }}</p>
            <div
                v-for="program in options.programs"
                :key="program.id"
                class="flex flex-col gap-0.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5"
            >
                <div class="flex items-center gap-2">
                    <span class="truncate text-sm">{{ program.name }}</span>
                    <span v-if="program.elevated" class="shrink-0 rounded-xs border border-warning/40 px-1 text-[10px] text-warning">
                        {{ t("desktop_clone.settings.elevated_option") }}
                    </span>
                </div>
                <span class="truncate text-[11px] text-base-content/40" :title="program.path">{{ program.path }}</span>
            </div>
        </div>

        <div
            class="animate-ef-rise motion-reduce:animate-none flex flex-col gap-2 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
            :style="{ animationDelay: '0.07s' }"
        >
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-base-content/55">{{ t("desktop_clone.settings.diagnostics") }}</span>
                <div class="flex items-center gap-1">
                    <button type="button" class="btn btn-xs btn-ghost" :disabled="diagnosticBusy" @click="loadDiagnostic">
                        <span v-if="diagnosticBusy" class="loading loading-spinner loading-xs" />
                        {{ t("desktop_clone.action.diagnose") }}
                    </button>
                    <button type="button" class="btn btn-xs btn-outline" :disabled="diagnosticBusy" @click="copyDiagnostic">
                        {{ copied ? t("desktop_clone.action.copied") : t("desktop_clone.action.copy_diagnostic") }}
                    </button>
                </div>
            </div>
            <p class="text-[11px] leading-snug text-base-content/45">{{ t("desktop_clone.settings.diagnostics_desc") }}</p>
            <pre
                v-if="diagnostic"
                class="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xs bg-base-content/5 p-2 text-[11px] leading-relaxed"
                >{{ diagnostic }}</pre
            >
        </div>
    </div>
</template>
