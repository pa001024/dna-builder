<script lang="ts" setup>
// 运行环境诊断弹窗：展示系统 / CPU / 内存 / 显卡 / 显示器 / WebView2 的原始信息，
// 支持一键复制上报，并在 WebView2 缺失或版本过低时提供静默安装与官方下载入口。
import { openUrl } from "@tauri-apps/plugin-opener"
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import type { DiagnosticsInfo, DiagnosticsWarning } from "@/api/diagnostics"
import {
    buildDiagnosticsWarnings,
    formatBytes,
    formatDisplayMode,
    formatGpuId,
    getDiagnostics,
    installWebView2,
    MIN_WEBVIEW2_MAJOR,
} from "@/api/diagnostics"
import { copyText } from "@/util"

/** 官方 WebView2 消费者下载页（自动安装失败时引导手动下载） */
const WEBVIEW2_DOWNLOAD_URL = "https://developer.microsoft.com/microsoft-edge/webview2/"

const open = defineModel<boolean>({ default: false })
const { t } = useTranslation()

const info = ref<DiagnosticsInfo | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const copying = ref(false)
const copied = ref(false)
const copyError = ref<string | null>(null)
const installing = ref(false)
const installMessage = ref<string | null>(null)
const installError = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

/** 采集运行环境；失败时保留上一次结果并在错误区提示。 */
async function load() {
    loading.value = true
    loadError.value = null
    try {
        info.value = await getDiagnostics()
    } catch (error) {
        loadError.value = String(error)
    } finally {
        loading.value = false
    }
}

// 父组件以 v-if 挂载本组件，打开时的初始化必须 immediate 才生效
watch(
    open,
    value => {
        if (value) {
            installMessage.value = null
            installError.value = null
            copyError.value = null
            copied.value = false
            void load()
        }
    },
    { immediate: true }
)

onBeforeUnmount(() => {
    if (copiedTimer) {
        clearTimeout(copiedTimer)
        copiedTimer = null
    }
})

const warnings = computed<DiagnosticsWarning[]>(() => (info.value ? buildDiagnosticsWarnings(info.value) : []))
const hasWebView2Issue = computed(() =>
    warnings.value.some(warning => warning.code === "webview2-missing" || warning.code === "webview2-outdated")
)

/** 警告文案（缺失 / 版本过低 / 无硬件显卡 / 内存偏小 / 系统过旧）。 */
function warningText(warning: DiagnosticsWarning): string {
    switch (warning.code) {
        case "webview2-missing":
            return t("diagnostics.warning.webview2Missing")
        case "webview2-outdated":
            return t("diagnostics.warning.webview2Outdated", {
                version: warning.version ?? "",
                minVersion: warning.minVersion ?? "",
            })
        case "no-hardware-gpu":
            return t("diagnostics.warning.noHardwareGpu")
        case "low-memory":
            return t("diagnostics.warning.lowMemory")
        case "old-os-build":
            return t("diagnostics.warning.oldOsBuild", { build: warning.build ?? 0 })
    }
}

/** 警告配色：error 红、warning 黄、info 中性。 */
function warningClass(level: DiagnosticsWarning["level"]) {
    if (level === "error") {
        return "border-error/40 bg-error/10 text-error"
    }
    if (level === "warning") {
        return "border-warning/40 bg-warning/10 text-warning"
    }
    return "border-base-content/15 bg-base-content/5 text-base-content/70"
}

const UNKNOWN = "—"

function orUnknown(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") {
        return UNKNOWN
    }
    return String(value)
}

/** 主频显示：≥1000MHz 换算成 GHz。 */
function formatFrequency(mhz: number): string {
    if (!mhz) {
        return UNKNOWN
    }
    return mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} GHz` : `${mhz} MHz`
}

/** 按区块组织诊断字段，供模板与复制文本共用。 */
const blocks = computed(() => {
    const data = info.value
    if (!data) {
        return []
    }
    const groups: { key: string; title: string; rows: { label: string; value: string }[] }[] = [
        {
            key: "system",
            title: t("diagnostics.section.system"),
            rows: [
                { label: t("diagnostics.field.appVersion"), value: orUnknown(data.appVersion) },
                { label: t("diagnostics.field.os"), value: orUnknown(data.osName) },
                { label: t("diagnostics.field.osVersion"), value: orUnknown(data.osVersion) },
                { label: t("diagnostics.field.osBuild"), value: orUnknown(data.osBuild) },
                { label: t("diagnostics.field.osArch"), value: orUnknown(data.osArch) },
                { label: t("diagnostics.field.processArch"), value: orUnknown(data.processArch) },
                { label: t("diagnostics.field.locale"), value: orUnknown(data.locale) },
                {
                    label: t("diagnostics.field.elevated"),
                    value: data.elevated ? t("diagnostics.value.yes") : t("diagnostics.value.no"),
                },
            ],
        },
        {
            key: "cpu",
            title: t("diagnostics.section.cpu"),
            rows: [
                { label: t("diagnostics.field.cpuBrand"), value: orUnknown(data.cpuBrand) },
                { label: t("diagnostics.field.cpuVendor"), value: orUnknown(data.cpuVendor) },
                {
                    label: t("diagnostics.field.cpuCores"),
                    value: `${data.cpuPhysicalCores} / ${data.cpuLogicalCores}`,
                },
                { label: t("diagnostics.field.cpuFrequency"), value: formatFrequency(data.cpuFrequencyMhz) },
            ],
        },
        {
            key: "memory",
            title: t("diagnostics.section.memory"),
            rows: [
                { label: t("diagnostics.field.memoryTotal"), value: formatBytes(data.totalMemory) },
                { label: t("diagnostics.field.memoryAvailable"), value: formatBytes(data.availableMemory) },
            ],
        },
    ]

    data.gpus.forEach((gpu, index) => {
        groups.push({
            key: `gpu-${index}`,
            title: `${t("diagnostics.section.gpu")} #${index + 1}`,
            rows: [
                {
                    label: t("diagnostics.field.gpuName"),
                    value: `${orUnknown(gpu.name)}${gpu.software ? ` (${t("diagnostics.value.software")})` : ""}`,
                },
                { label: t("diagnostics.field.gpuDriver"), value: orUnknown(gpu.driverVersion) },
                {
                    label: t("diagnostics.field.gpuVram"),
                    value: gpu.dedicatedVideoMemory > 0 ? formatBytes(gpu.dedicatedVideoMemory) : UNKNOWN,
                },
                { label: t("diagnostics.field.gpuSharedMemory"), value: formatBytes(gpu.sharedSystemMemory) },
                { label: t("diagnostics.field.gpuIds"), value: formatGpuId(gpu) },
            ],
        })
    })

    if (data.gpusError) {
        groups.push({
            key: "gpu-error",
            title: t("diagnostics.section.gpu"),
            rows: [{ label: t("diagnostics.field.gpuError"), value: data.gpusError }],
        })
    }

    data.displays.forEach((display, index) => {
        groups.push({
            key: `display-${index}`,
            title: `${t("diagnostics.section.display")} #${index + 1}`,
            rows: [
                { label: t("diagnostics.field.displayAdapter"), value: orUnknown(display.adapterName) },
                { label: t("diagnostics.field.displayMode"), value: formatDisplayMode(display) || UNKNOWN },
                {
                    label: t("diagnostics.field.displayPrimary"),
                    value: display.primary ? t("diagnostics.value.yes") : t("diagnostics.value.no"),
                },
            ],
        })
    })

    groups.push({
        key: "webview2",
        title: t("diagnostics.section.webview2"),
        rows: [
            { label: t("diagnostics.field.webview2Version"), value: orUnknown(data.webview2Version) },
            ...(data.webview2Error
                ? [{ label: t("diagnostics.field.webview2Error"), value: data.webview2Error }]
                : []),
            { label: t("diagnostics.field.webview2Recommended"), value: `>= ${MIN_WEBVIEW2_MAJOR}.0.0.0` },
        ],
    })

    return groups
})

/** 生成纯文本报告：字段名固定为英文，便于跨语言上报。 */
function buildReport(): string {
    const data = info.value
    if (!data) {
        return ""
    }
    const lines: string[] = ["=== DNA Builder Diagnostics ==="]
    lines.push(`App version: ${data.appVersion}`)
    lines.push(`Platform: ${data.platform}`)
    lines.push(`OS: ${[data.osName, data.osVersion].filter(Boolean).join(" ")}`)
    lines.push(`OS build: ${data.osBuild || UNKNOWN}`)
    lines.push(`Architecture: ${data.osArch} (process ${data.processArch})`)
    if (data.locale) {
        lines.push(`Locale: ${data.locale}`)
    }
    lines.push(`Elevated: ${data.elevated ? "yes" : "no"}`)
    lines.push(`CPU: ${data.cpuBrand || UNKNOWN}`)
    lines.push(`CPU vendor: ${data.cpuVendor || UNKNOWN}`)
    lines.push(`CPU cores: ${data.cpuPhysicalCores} physical / ${data.cpuLogicalCores} logical`)
    lines.push(`CPU frequency: ${formatFrequency(data.cpuFrequencyMhz)}`)
    lines.push(`Memory: ${formatBytes(data.totalMemory)} total, ${formatBytes(data.availableMemory)} available`)
    data.gpus.forEach((gpu, index) => {
        const parts = [
            gpu.name || UNKNOWN,
            `driver ${gpu.driverVersion || UNKNOWN}`,
            `VRAM ${gpu.dedicatedVideoMemory > 0 ? formatBytes(gpu.dedicatedVideoMemory) : "n/a"}`,
            `shared ${formatBytes(gpu.sharedSystemMemory)}`,
            formatGpuId(gpu),
        ]
        if (gpu.software) {
            parts.push("software adapter")
        }
        lines.push(`GPU ${index}: ${parts.join(" | ")}`)
    })
    if (data.gpusError) {
        lines.push(`GPU enumeration error: ${data.gpusError}`)
    }
    data.displays.forEach((display, index) => {
        const mode = formatDisplayMode(display) || UNKNOWN
        lines.push(`Display ${index}: ${display.adapterName || UNKNOWN} | ${mode} | ${display.primary ? "primary" : "secondary"}`)
    })
    lines.push(`WebView2: ${data.webview2Version || data.webview2Error || UNKNOWN}`)
    lines.push(`Recommended WebView2: >= ${MIN_WEBVIEW2_MAJOR}.0.0.0`)
    if (warnings.value.length > 0) {
        lines.push(
            `Warnings: ${warnings.value.map(warning => warning.code).join(", ")}`
        )
    }
    return lines.join("\n")
}

/** 复制完整报告，成功后短暂提示。 */
async function handleCopy() {
    if (copying.value) {
        return
    }
    copying.value = true
    copyError.value = null
    try {
        await copyText(buildReport())
        copied.value = true
        if (copiedTimer) {
            clearTimeout(copiedTimer)
        }
        copiedTimer = setTimeout(() => {
            copied.value = false
        }, 2000)
    } catch (error) {
        copyError.value = String(error)
    } finally {
        copying.value = false
    }
}

/** 下载并静默安装官方 WebView2 运行时，完成后刷新版本信息。 */
async function handleInstall() {
    if (installing.value) {
        return
    }
    installing.value = true
    installMessage.value = null
    installError.value = null
    try {
        const version = await installWebView2()
        installMessage.value = version
            ? t("diagnostics.installDone", { version })
            : t("diagnostics.installDoneUnknown")
        await load()
    } catch (error) {
        installError.value = String(error)
    } finally {
        installing.value = false
    }
}

/** 打开微软官方 WebView2 下载页，交由用户手动安装。 */
async function handleOpenOfficial() {
    try {
        await openUrl(WEBVIEW2_DOWNLOAD_URL)
    } catch (error) {
        installError.value = String(error)
    }
}

function handleClose() {
    open.value = false
}
</script>

<template>
    <DialogRoot v-model:open="open">
        <DialogPortal>
            <DialogOverlay class="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm data-[state=open]:animate-overlayShow" />
            <DialogContent
                class="fixed top-1/2 left-1/2 z-100 flex max-h-[85vh] w-[92vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xs border border-base-content/15 bg-base-100/70 shadow-lg backdrop-blur-md data-[state=open]:animate-contentShow"
            >
                <DialogClose
                    class="absolute top-2.5 right-2.5 z-10 cursor-pointer rounded-xs border border-base-content/20 bg-base-100/80 p-1 text-base-content/60 backdrop-blur transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                    aria-label="close"
                >
                    <Icon icon="radix-icons:cross2" class="block size-3.5" />
                </DialogClose>
                <DialogTitle class="sr-only">{{ $t("diagnostics.title") }}</DialogTitle>

                <div class="flex min-h-0 flex-1 flex-col">
                    <div class="shrink-0 border-b border-base-content/10 px-4 pt-3 pb-2 pr-12">
                        <SectionHeader no-animate compact kicker="SYSTEM INFO" :title="$t('diagnostics.title')">
                            <template #trailing>
                                <button
                                    type="button"
                                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border border-base-content/20 px-2 py-1 text-[12px] text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                                    :disabled="loading"
                                    @click="load"
                                >
                                    {{ $t("diagnostics.refresh") }}
                                </button>
                            </template>
                        </SectionHeader>
                    </div>

                    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                        <!-- 异常提示与 WebView2 修复入口 -->
                        <div v-if="warnings.length > 0" class="mb-2 flex flex-col gap-1.5">
                            <div
                                v-for="warning in warnings"
                                :key="warning.code"
                                class="rounded-xs border px-2.5 py-1.5 text-[12px] leading-5"
                                :class="warningClass(warning.level)"
                            >
                                {{ warningText(warning) }}
                            </div>
                        </div>
                        <div v-if="hasWebView2Issue" class="mb-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs border border-primary bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                                :disabled="installing"
                                @click="handleInstall"
                            >
                                <span v-if="installing" class="loading loading-spinner loading-xs" />
                                {{ installing ? $t("diagnostics.installing") : $t("diagnostics.install") }}
                            </button>
                            <button
                                type="button"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border border-base-content/20 px-3 py-1.5 text-[12px] text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                @click="handleOpenOfficial"
                            >
                                {{ $t("diagnostics.officialLink") }}
                            </button>
                        </div>
                        <p v-if="installMessage" class="mb-2 text-[12px] text-success">{{ installMessage }}</p>
                        <p v-if="installError" class="mb-2 text-[12px] text-error">{{ installError }}</p>
                        <p v-if="copyError" class="mb-2 text-[12px] text-error">{{ copyError }}</p>

                        <div v-if="loading && !info" class="flex items-center gap-2 py-6 text-xs text-base-content/55">
                            <span class="loading loading-spinner loading-xs" />
                            {{ $t("diagnostics.loading") }}
                        </div>
                        <p v-else-if="loadError && !info" class="py-6 text-xs text-error">
                            {{ $t("diagnostics.loadFailed", { error: loadError }) }}
                        </p>

                        <div v-else class="flex flex-col gap-3">
                            <div
                                v-for="block in blocks"
                                :key="block.key"
                                class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                            >
                                <div class="mb-1 text-[12px] font-semibold tracking-wide text-base-content/70">
                                    {{ block.title }}
                                </div>
                                <div
                                    v-for="row in block.rows"
                                    :key="row.label"
                                    class="grid grid-cols-[minmax(0,8.5rem)_1fr] items-baseline gap-2 py-0.5"
                                >
                                    <span class="text-[12px] text-base-content/50">{{ row.label }}</span>
                                    <span class="select-text break-all font-mono text-[12px] text-base-content/90">{{
                                        row.value
                                    }}</span>
                                </div>
                            </div>
                            <p v-if="loadError" class="text-[12px] text-error">
                                {{ $t("diagnostics.loadFailed", { error: loadError }) }}
                            </p>
                        </div>
                    </div>

                    <div class="flex-none border-t border-base-content/10 px-4 py-2.5">
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0 text-[11px] tracking-wide text-base-content/50">
                                {{ $t("diagnostics.copyHint") }}
                            </div>
                            <div class="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border border-base-content/20 px-3 py-1.5 text-[12px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                    @click="handleClose"
                                >
                                    {{ $t("common.close") }}
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs border border-primary bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                                    :disabled="!info || copying"
                                    @click="handleCopy"
                                >
                                    <span v-if="copying" class="loading loading-spinner loading-xs" />
                                    {{ copied ? $t("diagnostics.copied") : $t("diagnostics.copy") }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
