<script setup lang="ts">
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRouter } from "vue-router"
import {
    clearScriptInputRecorderActions,
    getScriptInputRecorderSnapshot,
    setScriptInputRecorderHotkeyEnabled,
    type ScriptInputRecorderAction,
    type ScriptInputRecorderSnapshot,
} from "@/api/app"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { copyText } from "@/util"

type GeneratedActionType = ScriptInputRecorderAction["type"] | "mouse_click"

interface GeneratedAction {
    type: GeneratedActionType
    key?: string
    button?: string
    time: number
}

interface RecorderImportPayload {
    actions?: unknown
}

const router = useRouter()
const ui = useUIStore()
const recorderSnapshot = ref<ScriptInputRecorderSnapshot>({
    hotkeyEnabled: false,
    recording: false,
    totalTime: 0,
    actionCount: 0,
    actions: [],
})
const importedActions = ref<ScriptInputRecorderAction[] | null>(null)
const importJsonText = ref("")
const importFileRef = ref<HTMLInputElement | null>(null)
const recorderUnavailable = ref(false)
let unlistenRecorderUpdate: UnlistenFn | null = null

const usingImportedActions = computed(() => importedActions.value !== null)
const currentActions = computed(() => importedActions.value ?? recorderSnapshot.value.actions)
const currentActionCount = computed(() => currentActions.value.length)
const currentTotalTime = computed(() => currentActions.value.at(-1)?.time ?? 0)
const generatedCode = computed(() => buildRecordedCode(currentActions.value))

/**
 * 返回脚本列表页。
 */
function backToScriptPage() {
    router.push({ name: "script-list" })
}

/**
 * 将秒值格式化为带三位小数的文本。
 * @param seconds 秒
 * @returns 格式化文本
 */
function formatSeconds(seconds: number): string {
    return `${seconds.toFixed(3)}s`
}

/**
 * 将导入/录制动作归一化为可生成代码的数据结构。
 * @param action 原始动作
 * @returns 归一化动作，非法时返回 null
 */
function normalizeRecordedAction(action: unknown): ScriptInputRecorderAction | null {
    if (!action || typeof action !== "object") {
        return null
    }
    const candidate = action as Record<string, unknown>
    const type = String(candidate.type ?? "").trim().toLowerCase()
    const timeRaw = Number(candidate.time)
    if (!Number.isFinite(timeRaw) || timeRaw < 0) {
        return null
    }
    const base: ScriptInputRecorderAction = {
        type: "key_down",
        time: timeRaw,
    }
    if (type === "key_down" || type === "key_up") {
        const key = String(candidate.key ?? "").trim().toLowerCase()
        if (!key) {
            return null
        }
        base.type = type
        base.key = key
        return base
    }
    if (type === "mouse_down" || type === "mouse_up") {
        const button = String(candidate.button ?? "left").trim().toLowerCase() || "left"
        base.type = type
        base.button = button
        return base
    }
    return null
}

/**
 * 归一化动作时间轴，统一从第一条动作开始计时。
 * @param actions 原始动作列表
 * @returns 归一化后的绝对时间动作
 */
function normalizeActionTimeline(actions: ScriptInputRecorderAction[]): ScriptInputRecorderAction[] {
    if (actions.length === 0) {
        return []
    }
    const sorted = [...actions].sort((a, b) => a.time - b.time)
    const baseTime = sorted[0].time
    return sorted.map(item => ({
        ...item,
        time: Math.max(0, item.time - baseTime),
    }))
}

/**
 * 压缩连续的鼠标按下/抬起为单条点击动作，便于输出 `mc(hwnd)`。
 * @param actions 归一化后的动作
 * @returns 压缩后的动作
 */
function compressMouseActions(actions: ScriptInputRecorderAction[]): GeneratedAction[] {
    const result: GeneratedAction[] = []
    let index = 0
    while (index < actions.length) {
        const current = actions[index]
        const next = actions[index + 1]
        if (
            current.type === "mouse_down" &&
            next &&
            next.type === "mouse_up" &&
            (current.button ?? "left") === (next.button ?? "left")
        ) {
            result.push({
                type: "mouse_click",
                button: next.button ?? "left",
                time: next.time,
            })
            index += 2
            continue
        }
        result.push({
            type: current.type,
            key: current.key,
            button: current.button,
            time: current.time,
        })
        index += 1
    }
    return result
}

/**
 * 将单条动作转换为脚本 API 调用行。
 * @param action 动作
 * @returns 代码行
 */
function toScriptActionLine(action: GeneratedAction): string | null {
    if (action.type === "key_down" && action.key) {
        return `kd(hwnd, ${JSON.stringify(action.key)})`
    }
    if (action.type === "key_up" && action.key) {
        return `ku(hwnd, ${JSON.stringify(action.key)})`
    }
    if (action.type === "mouse_click") {
        if ((action.button ?? "left") === "left") {
            return "mc(hwnd)"
        }
        return `mc(hwnd, ${JSON.stringify(action.button ?? "left")})`
    }
    if (action.type === "mouse_down") {
        if ((action.button ?? "left") === "left") {
            return "md(hwnd)"
        }
        return `md(hwnd, ${JSON.stringify(action.button ?? "left")})`
    }
    if (action.type === "mouse_up") {
        if ((action.button ?? "left") === "left") {
            return "mu(hwnd)"
        }
        return `mu(hwnd, ${JSON.stringify(action.button ?? "left")})`
    }
    return null
}

/**
 * 根据绝对时间动作生成录制脚本代码。
 * @param actions 输入动作列表
 * @returns 生成后的脚本
 */
function buildRecordedCode(actions: ScriptInputRecorderAction[]): string {
    const normalized = normalizeActionTimeline(actions)
    const compressed = compressMouseActions(normalized)
    const lines: string[] = ["async function recorded() {", "    const timer = new Timer()"]
    let emittedTimelineMs = 0

    for (const action of compressed) {
        const targetTimelineMs = Math.max(0, Math.round(action.time * 1000))
        const sleepMs = targetTimelineMs - emittedTimelineMs
        if (sleepMs > 0) {
            lines.push(`    await timer.sleep(${sleepMs})`)
        }
        const actionLine = toScriptActionLine(action)
        if (actionLine) {
            lines.push(`    ${actionLine}`)
        }
        emittedTimelineMs = targetTimelineMs
    }

    lines.push("}")
    return lines.join("\n")
}

/**
 * 读取后端录制器快照并刷新页面状态。
 */
async function refreshRecorderSnapshot() {
    if (!env.isApp) {
        recorderUnavailable.value = true
        return
    }
    recorderSnapshot.value = await getScriptInputRecorderSnapshot()
}

/**
 * 监听后端录制器实时状态更新事件。
 */
async function initRecorderListener() {
    if (!env.isApp) {
        return
    }
    unlistenRecorderUpdate = await listen<ScriptInputRecorderSnapshot>("script-input-recorder-updated", event => {
        recorderSnapshot.value = event.payload
    })
}

/**
 * 启用 F10 录制热键监听。
 */
async function enableRecorderHotkey() {
    if (!env.isApp) {
        return
    }
    await setScriptInputRecorderHotkeyEnabled(true)
}

/**
 * 禁用 F10 录制热键监听。
 */
async function disableRecorderHotkey() {
    if (!env.isApp) {
        return
    }
    await setScriptInputRecorderHotkeyEnabled(false)
}

/**
 * 清空当前动作列表。
 * 导入模式下仅清空导入数据；录制模式下同步清空后端动作。
 */
async function clearCurrentActions() {
    if (usingImportedActions.value) {
        importedActions.value = null
        importJsonText.value = ""
        ui.showSuccessMessage("已清空导入动作")
        return
    }
    if (!env.isApp) {
        ui.showErrorMessage("当前环境不支持清空录制动作")
        return
    }
    await clearScriptInputRecorderActions()
    ui.showSuccessMessage("录制动作已清空")
}

/**
 * 复制当前生成代码到剪贴板。
 */
async function copyGeneratedCode() {
    await copyText(generatedCode.value)
    ui.showSuccessMessage("录制代码已复制")
}

/**
 * 解析 JSON 文本并导入动作。
 */
function importActionsFromJsonText() {
    const text = importJsonText.value.trim()
    if (!text) {
        throw new Error("请先输入 JSON 文本")
    }
    const payload = JSON.parse(text) as RecorderImportPayload
    if (!Array.isArray(payload.actions)) {
        throw new Error("JSON 中缺少 actions 数组")
    }
    const normalized = payload.actions
        .map(item => normalizeRecordedAction(item))
        .filter((item): item is ScriptInputRecorderAction => item !== null)
    if (normalized.length === 0) {
        throw new Error("未解析到可用动作")
    }
    importedActions.value = normalized
}

/**
 * 执行 JSON 导入并提示结果。
 */
function handleImportJson() {
    try {
        importActionsFromJsonText()
        ui.showSuccessMessage(`导入成功，共 ${currentActionCount.value} 条动作`)
    } catch (error) {
        console.error("导入录制 JSON 失败", error)
        ui.showErrorMessage(error instanceof Error ? error.message : "导入失败")
    }
}

/**
 * 从本地文件读取 JSON 内容并填充导入输入框。
 * @param event 文件输入事件
 */
async function handleImportFileChange(event: Event) {
    const target = event.target as HTMLInputElement | null
    const file = target?.files?.[0]
    if (!file) {
        return
    }
    try {
        importJsonText.value = await file.text()
        handleImportJson()
    } catch (error) {
        console.error("读取录制 JSON 文件失败", error)
        ui.showErrorMessage("读取文件失败")
    } finally {
        if (target) {
            target.value = ""
        }
    }
}

/**
 * 打开文件选择器导入 JSON 文件。
 */
function openImportFilePicker() {
    importFileRef.value?.click()
}

/**
 * 退出导入模式并回到实时录制数据。
 */
function useRecordedActions() {
    importedActions.value = null
}

onMounted(async () => {
    try {
        await initRecorderListener()
        await enableRecorderHotkey()
        await refreshRecorderSnapshot()
    } catch (error) {
        console.error("初始化录制工具失败", error)
        recorderUnavailable.value = true
        ui.showErrorMessage("初始化录制工具失败")
    }
})

onUnmounted(async () => {
    if (unlistenRecorderUpdate) {
        unlistenRecorderUpdate()
        unlistenRecorderUpdate = null
    }
    try {
        await disableRecorderHotkey()
    } catch (error) {
        console.error("关闭录制热键监听失败", error)
    }
})
</script>

<template>
    <div class="h-full flex flex-col p-4 gap-4 overflow-hidden">
        <div class="flex items-center justify-between gap-3">
            <div>
                <h1 class="text-xl font-bold">脚本录制工具</h1>
                <p class="text-sm opacity-70">按 F10 开始/停止录制，时间轴按第一次输入归零并生成绝对时序代码。</p>
            </div>
            <button class="btn btn-sm btn-ghost" @click="backToScriptPage">
                <Icon icon="ri:arrow-left-line" class="w-4 h-4" />
                返回脚本页
            </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div class="card bg-base-200 shadow-sm">
                <div class="card-body p-4">
                    <div class="text-xs opacity-70">当前状态</div>
                    <div class="text-lg font-semibold">
                        {{ recorderSnapshot.recording ? "录制中" : "未录制" }}
                    </div>
                    <div class="text-xs opacity-70">
                        {{ recorderUnavailable ? "当前环境不支持实时录制" : "F10 全局切换录制状态" }}
                    </div>
                </div>
            </div>
            <div class="card bg-base-200 shadow-sm">
                <div class="card-body p-4">
                    <div class="text-xs opacity-70">动作数量</div>
                    <div class="text-lg font-semibold">{{ currentActionCount }}</div>
                    <div class="text-xs opacity-70">
                        {{ usingImportedActions ? "来源：导入 JSON" : "来源：实时录制" }}
                    </div>
                </div>
            </div>
            <div class="card bg-base-200 shadow-sm">
                <div class="card-body p-4">
                    <div class="text-xs opacity-70">总时长</div>
                    <div class="text-lg font-semibold">{{ formatSeconds(currentTotalTime) }}</div>
                    <div class="text-xs opacity-70">按绝对时间点换算 sleep</div>
                </div>
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <button class="btn btn-sm btn-primary" @click="copyGeneratedCode">复制代码</button>
            <button class="btn btn-sm btn-outline" @click="clearCurrentActions">清空当前动作</button>
            <button v-if="usingImportedActions" class="btn btn-sm btn-ghost" @click="useRecordedActions">切回实时录制数据</button>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0 flex-1">
            <div class="card bg-base-100 border border-base-300 shadow-sm min-h-0">
                <div class="card-body p-4 min-h-0 flex flex-col gap-3">
                    <h2 class="card-title text-base">导入 JSON（绝对时间制）</h2>
                    <textarea
                        v-model="importJsonText"
                        class="textarea textarea-bordered w-full flex-1 min-h-40 font-mono text-xs"
                        placeholder='{"actions":[{"type":"key_down","key":"w","time":0}]}'
                    />
                    <input ref="importFileRef" type="file" class="hidden" accept=".json,application/json" @change="handleImportFileChange" />
                    <div class="flex flex-wrap items-center gap-2">
                        <button class="btn btn-sm btn-primary" @click="handleImportJson">导入文本</button>
                        <button class="btn btn-sm btn-outline" @click="openImportFilePicker">导入 JSON 文件</button>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 border border-base-300 shadow-sm min-h-0">
                <div class="card-body p-4 min-h-0 flex flex-col gap-3">
                    <h2 class="card-title text-base">生成代码</h2>
                    <textarea class="textarea textarea-bordered w-full flex-1 min-h-40 font-mono text-xs" readonly :value="generatedCode" />
                </div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-300 shadow-sm min-h-0 flex-1">
            <div class="card-body p-0 min-h-0">
                <div class="px-4 pt-4 pb-2 text-sm font-medium">动作明细</div>
                <div class="overflow-auto px-4 pb-4">
                    <table class="table table-zebra table-sm">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>时间(s)</th>
                                <th>类型</th>
                                <th>按键</th>
                                <th>鼠标</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(action, index) in currentActions" :key="`${index}-${action.time}`">
                                <td>{{ index + 1 }}</td>
                                <td>{{ action.time.toFixed(6) }}</td>
                                <td>{{ action.type }}</td>
                                <td>{{ action.key ?? "-" }}</td>
                                <td>{{ action.button ?? "-" }}</td>
                            </tr>
                            <tr v-if="currentActions.length === 0">
                                <td colspan="5" class="text-center opacity-60 py-8">暂无动作数据</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>
