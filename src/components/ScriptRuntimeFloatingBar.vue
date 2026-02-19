<script setup lang="ts">
import { computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useScriptRuntimeStore } from "@/store/scriptRuntime"
import { useUIStore } from "@/store/ui"

const scriptRuntime = useScriptRuntimeStore()
const ui = useUIStore()
const route = useRoute()
const router = useRouter()

/**
 * 判断是否展示脚本运行悬浮窗。
 * 在脚本页不展示，避免与页面内控制台状态重复。
 */
const showScriptRuntimeFloating = computed(() => scriptRuntime.isRunning && route.name !== "script-list")

/**
 * 去除脚本名扩展名。
 * @param scriptName 原始脚本名
 * @returns 去扩展名后的脚本名
 */
function trimScriptExtension(scriptName: string): string {
    return String(scriptName ?? "")
        .trim()
        .replace(/\.[^./\\]+$/, "")
}

/**
 * 从路径中提取文件名。
 * @param scriptPath 脚本完整路径
 * @returns 文件名（可能为空）
 */
function getScriptFileNameFromPath(scriptPath: string): string {
    return String(scriptPath ?? "")
        .split(/[\\/]/)
        .filter(Boolean)
        .pop() ?? ""
}

/**
 * 当前运行脚本列表（去扩展名，逗号分隔）。
 */
const runningScriptListText = computed(() => {
    const namesFromPaths = scriptRuntime.runningScriptPaths
        .map(path => getScriptFileNameFromPath(path))
        .map(trimScriptExtension)
        .filter(Boolean)
    const fallbackName = trimScriptExtension(scriptRuntime.runningScriptName)
    const names = namesFromPaths.length > 0 ? namesFromPaths : fallbackName ? [fallbackName] : ["..."]
    return names.join(",")
})

/**
 * 当前运行脚本数量（用于运行状态显示）。
 */
const runningScriptCountText = computed(() => {
    const namesFromPathsCount = scriptRuntime.runningScriptPaths.filter(Boolean).length
    const fallbackCount = scriptRuntime.runningScriptName ? 1 : 0
    return Math.max(scriptRuntime.runningScriptCount || 0, namesFromPathsCount || fallbackCount || 0)
})

/**
 * 格式化运行时长（毫秒）为可读文本。
 * @param durationMs 时长（毫秒）
 * @returns 格式化字符串
 */
function formatRuntimeDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const pad = (value: number) => String(value).padStart(2, "0")
    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    }
    return `${pad(minutes)}:${pad(seconds)}`
}

/**
 * 计算悬浮窗展示的运行时长。
 */
const floatingRuntimeDuration = computed(() => {
    if (!scriptRuntime.runningStartedAt) {
        return "00:00"
    }
    return formatRuntimeDuration(ui.timeNow - scriptRuntime.runningStartedAt)
})

/**
 * 从悬浮窗停止当前脚本运行。
 */
async function stopRunningScriptFromFloating() {
    try {
        if (scriptRuntime.runningMode === "scheduler") {
            scriptRuntime.requestSchedulerStop()
        }
        await scriptRuntime.stopAllScripts()
        ui.showSuccessMessage("已发送停止请求")
    } catch (error) {
        console.error("停止脚本失败", error)
        ui.showErrorMessage("停止脚本失败，请重试")
    }
}

/**
 * 从悬浮窗跳转回脚本页面。
 */
function openScriptPageFromFloating() {
    router.push({ name: "script-list" })
}

onMounted(async () => {
    try {
        await scriptRuntime.initRuntimeTracking()
    } catch (error) {
        console.error("初始化脚本运行态监听失败", error)
    }
})
</script>

<template>
    <div v-if="showScriptRuntimeFloating"
        class="fixed left-1/2 bottom-3 z-90 -translate-x-1/2 w-[min(40rem,calc(100vw-1rem))] opacity-80 hover:opacity-100 transition-opacity duration-200">
        <div
            class="rounded-[14px] border border-base-content/20 bg-base-100/60 text-base-content shadow-[0_16px_30px_rgb(0_0_0/0.25)] backdrop-blur-md">
            <div class="flex items-center gap-2 px-2.5 py-2">
                <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-base-content/15 bg-base-100/45">
                    <Icon icon="ri:code-s-slash-line" class="w-4 h-4 opacity-85" />
                </div>
                <div class="min-w-0 flex-1 flex items-center gap-1.5"
                    :title="`运行中(${runningScriptCountText}) ${runningScriptListText}`">
                    <span class="shrink-0 text-[11px] font-semibold tracking-[0.04em] opacity-85 font-orbitron">
                        运行中({{ runningScriptCountText }})
                    </span>
                    <span class="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[0.01em]">
                        {{ runningScriptListText }}
                    </span>
                    <span class="shrink-0 text-[11px] opacity-80 font-orbitron">
                        {{ floatingRuntimeDuration }}
                    </span>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                    <button
                        class="btn btn-xs btn-square h-7 w-7 min-h-0 border border-base-content/16 bg-base-100/52 text-base-content hover:bg-base-100/78 hover:border-base-content/30"
                        @click="openScriptPageFromFloating" :title="`前往脚本页: ${runningScriptListText}`">
                        <Icon icon="ri:arrow-right-line" class="w-4 h-4" />
                    </button>
                    <button
                        class="btn btn-xs btn-square h-7 w-7 min-h-0 border border-base-content/16 bg-base-100/52 text-error hover:bg-error/14 hover:border-error/40"
                        @click="stopRunningScriptFromFloating" title="停止脚本">
                        <Icon icon="ri:stop-circle-line" class="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
