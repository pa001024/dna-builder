<script setup lang="ts">
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { register, unregister } from "@tauri-apps/plugin-global-shortcut"
import { computed, onUnmounted, ref, watch } from "vue"
import {
    execScript,
    getScriptInputRecorderSnapshot,
    type ScriptInputRecorderSnapshot,
    setScriptInputRecorderHotkeyEnabled,
} from "@/api/app"
import { env } from "@/env"
import { createNodeByKind, useAutoScriptStore } from "@/store/autoScript"
import { useUIStore } from "@/store/ui"
import type { FlowExpr, FlowNode, MouseButton, RoiPickOptions, RoiSelection } from "@/utils/autoscript/types"
import { PALETTE } from "./autoscript/palette"

const show = defineModel<boolean>("show", { default: false })

const props = defineProps<{
    pauseExternalHotkey?: () => Promise<void>
    restoreExternalHotkey?: () => Promise<void>
}>()

const emit = defineEmits<{
    (e: "export", code: string): void
}>()

const store = useAutoScriptStore()
const ui = useUIStore()

const storeWithPersist = store as typeof store & { persist?: () => void }

const PICK_SHORTCUT = "F9"
const WINDOW_FRAME_Y_OFFSET = 30
const pickArmed = ref(false)
const grabbing = ref(false)
let pendingPickApply: ((x: number, y: number, color?: number) => void) | null = null

const recorderSnapshot = ref<ScriptInputRecorderSnapshot>({
    hotkeyEnabled: false,
    recording: false,
    totalTime: 0,
    actionCount: 0,
    actions: [],
})
let unlistenRecorder: UnlistenFn | null = null
let recorderWasEnabled = false

const selectedNode = computed(() => store.selectedNode)
const generated = computed(() => store.generated)
const rightTab = ref<"props" | "preview" | "config">("props")

watch(selectedNode, node => {
    if (node) rightTab.value = "props"
})

const MOUSE_BUTTONS: { value: MouseButton; label: string }[] = [
    { value: "left", label: "左键" },
    { value: "right", label: "右键" },
    { value: "middle", label: "中键" },
    { value: "x1", label: "侧键 X1" },
    { value: "x2", label: "侧键 X2" },
]

const CONFIG_KINDS = [
    { value: "number", label: "数字" },
    { value: "string", label: "文本" },
    { value: "boolean", label: "开关" },
    { value: "select", label: "单选" },
    { value: "multi-select", label: "多选" },
] as const

// ---------- 调色板拖拽 ----------

function onPaletteDragStart(event: DragEvent, kind: FlowNode["kind"]) {
    event.dataTransfer?.setData("autoscript/new", kind)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy"
}

/** 返回循环条件的默认颜色检查表达式。 */
function defaultLoopCondition(): FlowExpr {
    return { op: "call", fn: "colorExists", x: 0, y: 0, color: 0xffffff, tolerance: 10 }
}

/** 切换循环类型并确保条件循环始终拥有可编辑的条件。 */
function onLoopTypeChange(event: Event) {
    const node = selectedNode.value
    if (!node || node.kind !== "loop") return
    node.loopType = (event.target as HTMLSelectElement).value as typeof node.loopType
    if (node.loopType === "while" && !node.condition) node.condition = defaultLoopCondition()
}

// ---------- 坐标抓取（F9） ----------

function armPick(apply: (x: number, y: number, color?: number) => void) {
    if (!env.isApp) {
        ui.showErrorMessage("当前环境不支持坐标抓取")
        return
    }
    pendingPickApply = apply
    pickArmed.value = true
    ui.showSuccessMessage(`坐标抓取已就绪：切换到游戏窗口后按 ${PICK_SHORTCUT} 抓取`)
}

async function onPickHotkey() {
    if (!pickArmed.value || grabbing.value) return
    grabbing.value = true
    try {
        const hwnd = await execScript(`getWindowByProcessName(${JSON.stringify(store.doc.processName || "EM-Win64-Shipping.exe")})`)
        const hwndNum = Number(hwnd) || 0
        const raw = await execScript(
            hwndNum
                ? `JSON.stringify({ pos: getMousePos(${hwndNum}), color: getColor(${hwndNum}, ...getMousePos(${hwndNum})) })`
                : "JSON.stringify({ pos: getMousePos() })"
        )
        const parsed = JSON.parse(raw) as { pos: [number, number]; color?: number }
        const x = Math.round(parsed.pos[0])
        const y = Math.round(parsed.pos[1]) - (store.doc.frameless ? 0 : WINDOW_FRAME_Y_OFFSET)
        const apply = pendingPickApply
        pickArmed.value = false
        pendingPickApply = null
        if (apply) apply(x, y, parsed.color)
        ui.showSuccessMessage(`已抓取坐标 (${x}, ${y})`)
    } catch (error) {
        console.error("抓取坐标失败", error)
        ui.showErrorMessage(`抓取坐标失败: ${error}`)
    } finally {
        grabbing.value = false
    }
}

/** 截取目标窗口并通过 selectroi 选择区域，返回用于 c.croi 的感知 hash。 */
async function pickRegionFeature(apply: (selection: RoiSelection) => void, options: RoiPickOptions) {
    if (!env.isApp) {
        ui.showErrorMessage("当前环境不支持 ROI 选择")
        return
    }
    if (grabbing.value) return
    grabbing.value = true
    try {
        const processName = store.doc.processName || "EM-Win64-Shipping.exe"
        const filterColor = Number.isFinite(options.filterColor) ? Math.max(0, Math.floor(options.filterColor)) : 0xffffff
        const filterTolerance = Number.isFinite(options.filterTolerance) ? Math.max(0, Math.round(options.filterTolerance)) : 30
        const filterSource = options.useFilter ? `roi = colorFilter(roi, [${filterColor}], ${filterTolerance})` : ""
        const script = `import { Cap } from "cap"
const hwnd = getWindowByProcessName(${JSON.stringify(processName)})
if (!hwnd) throw new Error("未找到目标窗口")
const c = new Cap(hwnd${store.doc.frameless ? ', { frameless: true }' : ""})
const frame = c.cap()
const selected = await selectroi("AutoScript ROI", frame)
let output = ""
if (selected) {
    const [x, y, width, height] = selected
    let roi = frame.roi(x, y, width, height)
    ${filterSource}
    output = JSON.stringify({ x, y, width, height, hash: perceptualHash(roi) })
}
output`
        const raw = await execScript(script, "__autoscript_roi__", 120000)
        const selection = raw ? (JSON.parse(raw) as RoiSelection | null) : null
        if (!selection) return
        apply(selection)
        ui.showSuccessMessage(`已选择 ROI (${selection.x}, ${selection.y}, ${selection.width}, ${selection.height})`)
    } catch (error) {
        console.error("选择 ROI 失败", error)
        ui.showErrorMessage(`选择 ROI 失败: ${error}`)
    } finally {
        grabbing.value = false
    }
}

async function enablePickHotkey() {
    if (!env.isApp) return
    try {
        try {
            await unregister(PICK_SHORTCUT)
        } catch {
            // 刷新后可能残留旧注册，注销失败时继续尝试重新注册。
        }
        await register(PICK_SHORTCUT, event => {
            if (event.state === "Pressed") void onPickHotkey()
        })
    } catch (error) {
        console.warn("注册坐标抓取快捷键失败", error)
    }
}

async function disablePickHotkey() {
    if (!env.isApp) return
    try {
        await unregister(PICK_SHORTCUT)
    } catch (error) {
        console.warn("注销坐标抓取快捷键失败", error)
    }
}

// ---------- 录制（F10） ----------

function normalizeButton(button: string | undefined): MouseButton {
    const value = (button ?? "left").toLowerCase()
    if (value === "right" || value === "middle" || value === "x1" || value === "x2") return value
    return "left"
}

/** 将后端录制动作转换为流程节点（按键 down/up 合并为 keyPress，间隔转 sleep）。 */
function convertRecordedActions(snapshot: ScriptInputRecorderSnapshot): FlowNode[] {
    const actions = [...snapshot.actions].sort((a, b) => a.time - b.time)
    if (actions.length === 0) return []
    const baseTime = actions[0].time
    const nodes: FlowNode[] = []
    let emittedMs = 0
    const pendingKeyDown = new Map<string, { time: number }>()
    let pendingMouseDown: { button: MouseButton; time: number } | null = null

    const pushSleep = (timeSec: number) => {
        const targetMs = Math.max(0, Math.round((timeSec - baseTime) * 1000))
        const delta = targetMs - emittedMs
        if (delta > 30) {
            nodes.push(createNodeByKind("sleep"))
            const node = nodes[nodes.length - 1] as FlowNode & { kind: "sleep" }
            node.ms = delta
            emittedMs = targetMs
        }
    }

    for (const action of actions) {
        if (action.type === "key_down" && action.key) {
            pendingKeyDown.set(action.key, { time: action.time })
        } else if (action.type === "key_up" && action.key) {
            const down = pendingKeyDown.get(action.key)
            if (down) {
                pushSleep(down.time)
                const node = createNodeByKind("keyPress") as FlowNode & { kind: "keyPress" }
                node.key = action.key
                const duration = Math.round((action.time - down.time) * 1000)
                if (duration > 30) node.duration = duration
                nodes.push(node)
                pendingKeyDown.delete(action.key)
            } else {
                pushSleep(action.time)
                const node = createNodeByKind("keyPress") as FlowNode & { kind: "keyPress" }
                node.key = action.key
                nodes.push(node)
            }
        } else if (action.type === "mouse_down") {
            pendingMouseDown = { button: normalizeButton(action.button), time: action.time }
        } else if (action.type === "mouse_up") {
            const button = normalizeButton(action.button)
            pushSleep(action.time)
            const node = createNodeByKind("mouseClick") as FlowNode & { kind: "mouseClick" }
            node.x = undefined
            node.y = undefined
            node.button = pendingMouseDown?.button ?? button
            nodes.push(node)
            pendingMouseDown = null
        }
    }

    for (const [key, down] of pendingKeyDown) {
        pushSleep(down.time)
        const node = createNodeByKind("keyDown") as FlowNode & { kind: "keyDown" }
        node.key = key
        nodes.push(node)
    }
    if (pendingMouseDown) {
        pushSleep(pendingMouseDown.time)
        const node = createNodeByKind("mouseDown") as FlowNode & { kind: "mouseDown" }
        node.x = undefined
        node.y = undefined
        node.button = pendingMouseDown.button
        nodes.push(node)
    }
    return nodes
}

async function toggleRecording() {
    if (!env.isApp) {
        ui.showErrorMessage("当前环境不支持录制")
        return
    }
    try {
        if (recorderSnapshot.value.recording) {
            await setScriptInputRecorderHotkeyEnabled(false)
            recorderSnapshot.value = await getScriptInputRecorderSnapshot()
            const nodes = convertRecordedActions(recorderSnapshot.value)
            store.appendRecordedNodes(nodes)
            ui.showSuccessMessage(`录制完成，已追加 ${nodes.length} 个节点`)
            await setScriptInputRecorderHotkeyEnabled(true)
        } else {
            recorderSnapshot.value = await getScriptInputRecorderSnapshot()
            await setScriptInputRecorderHotkeyEnabled(true)
            ui.showSuccessMessage("录制热键已启用：按 F10 开始/结束录制，结束后回到此处点击“完成录制”")
        }
    } catch (error) {
        console.error("切换录制状态失败", error)
        ui.showErrorMessage(`切换录制状态失败: ${error}`)
    }
}

async function initRecorder() {
    if (!env.isApp) return
    try {
        const snapshot = await getScriptInputRecorderSnapshot()
        recorderWasEnabled = snapshot.hotkeyEnabled
        recorderSnapshot.value = snapshot
        unlistenRecorder = await listen<ScriptInputRecorderSnapshot>("script-input-recorder-updated", event => {
            recorderSnapshot.value = event.payload
        })
        if (!recorderWasEnabled) await setScriptInputRecorderHotkeyEnabled(true)
    } catch (error) {
        console.warn("初始化录制器失败", error)
    }
}

async function cleanupRecorder() {
    if (unlistenRecorder) {
        unlistenRecorder()
        unlistenRecorder = null
    }
    if (!env.isApp) return
    try {
        if (!recorderWasEnabled) await setScriptInputRecorderHotkeyEnabled(false)
    } catch (error) {
        console.warn("恢复录制热键状态失败", error)
    }
}

// ---------- 生命周期 ----------

watch(
    show,
    async value => {
        if (value) {
            await props.pauseExternalHotkey?.()
            await enablePickHotkey()
            await initRecorder()
        } else {
            pickArmed.value = false
            pendingPickApply = null
            await disablePickHotkey()
            await cleanupRecorder()
            await props.restoreExternalHotkey?.()
        }
    },
    { immediate: true }
)

onUnmounted(async () => {
    await disablePickHotkey()
    await cleanupRecorder()
})

// ---------- 导出 ----------

function exportToTab() {
    emit("export", generated.value.code)
}

function close() {
    show.value = false
}

// ---------- 属性面板输入处理 ----------

function optionalNumberInput(event: Event): number | undefined {
    const raw = (event.target as HTMLInputElement).value
    return raw === "" ? undefined : Number(raw)
}

function onOptionalCoord(field: "x" | "y" | "duration" | "timeout", event: Event) {
    const node = selectedNode.value
    if (!node) return
    if ((node.kind === "mouseClick" || node.kind === "mouseDown" || node.kind === "mouseUp") && (field === "x" || field === "y")) {
        node[field] = optionalNumberInput(event)
    } else if (node.kind === "keyPress" && field === "duration") {
        node.duration = optionalNumberInput(event)
    } else if (node.kind === "waitColor" && field === "timeout") {
        node.timeout = optionalNumberInput(event)
    }
}

function onColorHexInput(event: Event) {
    const node = selectedNode.value
    if (node?.kind !== "waitColor") return
    node.color = parseInt((event.target as HTMLInputElement).value.replace("#", ""), 16) || 0
}

function pickMouseCoord() {
    armPick((x, y) => {
        const node = selectedNode.value
        if (node && (node.kind === "mouseClick" || node.kind === "mouseDown" || node.kind === "mouseUp")) {
            node.x = x
            node.y = y
        }
    })
}

function pickWaitColorCoord() {
    armPick((x, y, color) => {
        const node = selectedNode.value
        if (node?.kind === "waitColor") {
            node.x = x
            node.y = y
            if (color != null) node.color = color
        }
    })
}

function onOptionsInput(configVar: { options: string[] }, event: Event) {
    configVar.options = (event.target as HTMLInputElement).value
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
}

function onDefaultBoolChange(configVar: { defaultValue: string | number | boolean | string[] }, event: Event) {
    configVar.defaultValue = (event.target as HTMLInputElement).checked
}

function addSwitchCase() {
    const node = selectedNode.value
    if (node?.kind !== "switch") return
    node.cases.push({ id: `c_${Date.now().toString(36)}`, match: "", body: [] })
}

function removeSwitchCase(caseIndex: number) {
    const node = selectedNode.value
    if (node?.kind !== "switch") return
    node.cases.splice(caseIndex, 1)
}

const actionPalette = computed(() => PALETTE.filter(entry => entry.category === "action"))
const controlPalette = computed(() => PALETTE.filter(entry => entry.category === "control"))
</script>

<template>
    <dialog :open="show" class="modal">
        <div class="modal-box w-11/12 max-w-7xl h-[85vh] flex flex-col p-0">
            <!-- 标题栏 -->
            <div class="flex items-center gap-2 px-4 py-2 border-b border-base-300">
                <Icon icon="ri:node-tree" class="w-5 h-5 text-primary" />
                <span class="font-bold">图形化脚本编辑器</span>
                <div class="flex items-center gap-2 ml-4 text-xs">
                    <span class="text-base-content/60">目标进程</span>
                    <input
                        v-model="store.doc.processName"
                        class="input input-xs input-bordered w-48 font-mono"
                        placeholder="EM-Win64-Shipping.exe"
                    />
                    <label class="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" class="checkbox checkbox-xs" v-model="store.doc.frameless" />
                        <span>无边框模式 (frameless)</span>
                    </label>
                </div>
                <div class="flex-1" />
                <button
                    class="btn btn-xs"
                    :class="recorderSnapshot.recording ? 'btn-error' : 'btn-ghost'"
                    :title="recorderSnapshot.recording ? '结束录制并追加节点' : '启用 F10 录制热键'"
                    @click="toggleRecording"
                >
                    <Icon :icon="recorderSnapshot.recording ? 'ri:stop-circle-line' : 'ri:record-circle-line'" class="w-3.5 h-3.5" />
                    {{ recorderSnapshot.recording ? `完成录制 (${recorderSnapshot.actionCount})` : "录制" }}
                </button>
                <span v-if="pickArmed" class="badge badge-warning badge-sm">按 F9 抓取坐标…</span>
                <button class="btn btn-xs btn-primary" title="导出到当前脚本标签页" @click="exportToTab">
                    <Icon icon="ri:save-line" class="w-3.5 h-3.5" />导出代码
                </button>
                <button class="btn btn-sm btn-ghost btn-square" title="关闭" @click="close">
                    <Icon icon="ri:close-line" class="w-4 h-4" />
                </button>
            </div>

            <div class="flex-1 flex min-h-0">
                <!-- 调色板 -->
                <div class="w-44 border-r border-base-300 flex flex-col min-h-0">
                    <ScrollArea class="flex-1 p-2">
                        <div class="text-xs font-bold text-base-content/60 mb-1">流程控制</div>
                        <div
                            v-for="entry in controlPalette"
                            :key="entry.kind"
                            class="flex items-center gap-1.5 px-2 py-1.5 mb-1 rounded border border-base-300 bg-base-100 cursor-grab hover:border-primary/60 text-xs"
                            draggable="true"
                            :title="entry.hint"
                            @dragstart="onPaletteDragStart($event, entry.kind)"
                        >
                            <Icon :icon="entry.icon" class="w-3.5 h-3.5 text-secondary" />
                            {{ entry.label }}
                        </div>
                        <div class="text-xs font-bold text-base-content/60 mt-3 mb-1">动作</div>
                        <div
                            v-for="entry in actionPalette"
                            :key="entry.kind"
                            class="flex items-center gap-1.5 px-2 py-1.5 mb-1 rounded border border-base-300 bg-base-100 cursor-grab hover:border-primary/60 text-xs"
                            draggable="true"
                            :title="entry.hint"
                            @dragstart="onPaletteDragStart($event, entry.kind)"
                        >
                            <Icon :icon="entry.icon" class="w-3.5 h-3.5 text-primary" />
                            {{ entry.label }}
                        </div>
                    </ScrollArea>
                    <div class="p-2 border-t border-base-300 text-[10px] text-base-content/50 leading-4">
                        拖动节点到右侧流程中<br />F9 抓取坐标 · F10 录制
                    </div>
                </div>

                <!-- 流程画布 -->
                <div class="flex-1 min-w-0 border-r border-base-300">
                    <ScrollArea class="h-full p-3">
                        <FlowList :nodes="store.doc.main" :depth="0" />
                    </ScrollArea>
                </div>

                <!-- 右侧面板 -->
                <div class="w-96 flex flex-col min-h-0">
                    <div class="tabs tabs-border px-2 pt-1">
                        <a class="tab tab-sm" :class="{ 'tab-active': rightTab === 'props' }" @click="rightTab = 'props'">属性</a>
                        <a class="tab tab-sm" :class="{ 'tab-active': rightTab === 'preview' }" @click="rightTab = 'preview'">代码预览</a>
                        <a class="tab tab-sm" :class="{ 'tab-active': rightTab === 'config' }" @click="rightTab = 'config'">配置变量</a>
                    </div>

                    <!-- 属性面板 -->
                    <ScrollArea v-if="rightTab === 'props'" class="flex-1 p-3">
                        <div v-if="!selectedNode" class="text-sm text-base-content/50 text-center mt-8">点击流程中的节点进行编辑</div>
                        <template v-else>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="badge badge-primary badge-sm">{{ selectedNode.kind }}</span>
                                <input
                                    v-model="selectedNode.comment"
                                    class="input input-xs input-bordered flex-1"
                                    placeholder="备注（生成注释）"
                                    @input="storeWithPersist.persist?.()"
                                />
                            </div>

                            <!-- 鼠标动作 -->
                            <template
                                v-if="
                                    selectedNode.kind === 'mouseClick' ||
                                    selectedNode.kind === 'mouseDown' ||
                                    selectedNode.kind === 'mouseUp'
                                "
                            >
                                <div class="flex items-center gap-1 mb-1">
                                    <span class="text-xs w-12">按键</span>
                                    <select v-model="selectedNode.button" class="select select-xs select-bordered flex-1">
                                        <option v-for="button in MOUSE_BUTTONS" :key="button.value" :value="button.value">
                                            {{ button.label }}
                                        </option>
                                    </select>
                                </div>
                                <div class="flex items-center gap-1 mb-1">
                                    <span class="text-xs w-12">坐标</span>
                                    <input
                                        type="number"
                                        class="input input-xs input-bordered w-20"
                                        placeholder="x"
                                        :value="selectedNode.x ?? ''"
                                        @input="onOptionalCoord('x', $event)"
                                    />
                                    <input
                                        type="number"
                                        class="input input-xs input-bordered w-20"
                                        placeholder="y"
                                        :value="selectedNode.y ?? ''"
                                        @input="onOptionalCoord('y', $event)"
                                    />
                                    <button class="btn btn-xs btn-ghost" title="按 F9 抓取坐标" @click="pickMouseCoord">
                                        <Icon icon="ri:crosshair-2-line" class="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div class="text-[10px] text-base-content/40 mb-2">留空表示在当前位置点击</div>
                            </template>

                            <!-- 键盘动作 -->
                            <template
                                v-else-if="
                                    selectedNode.kind === 'keyPress' || selectedNode.kind === 'keyDown' || selectedNode.kind === 'keyUp'
                                "
                            >
                                <div class="flex items-center gap-1 mb-1">
                                    <span class="text-xs w-12">按键</span>
                                    <input
                                        v-model="selectedNode.key"
                                        class="input input-xs input-bordered w-24 font-mono"
                                        placeholder="q / enter / f1"
                                    />
                                    <template v-if="selectedNode.kind === 'keyPress'">
                                        <span class="text-xs">时长</span>
                                        <input
                                            type="number"
                                            class="input input-xs input-bordered w-20"
                                            placeholder="ms"
                                            :value="selectedNode.duration ?? ''"
                                            @input="onOptionalCoord('duration', $event)"
                                        />
                                    </template>
                                </div>
                            </template>

                            <!-- 等待 -->
                            <template v-else-if="selectedNode.kind === 'sleep'">
                                <div class="flex items-center gap-1 mb-1">
                                    <span class="text-xs w-12">毫秒</span>
                                    <input
                                        type="number"
                                        v-model.number="selectedNode.ms"
                                        class="input input-xs input-bordered w-28"
                                        min="0"
                                    />
                                </div>
                            </template>

                            <!-- 等待颜色 -->
                            <template v-else-if="selectedNode.kind === 'waitColor'">
                                <div class="flex items-center gap-1 mb-1">
                                    <span class="text-xs w-12">坐标</span>
                                    <input
                                        type="number"
                                        v-model.number="selectedNode.x"
                                        class="input input-xs input-bordered w-20"
                                        placeholder="x"
                                    />
                                    <input
                                        type="number"
                                        v-model.number="selectedNode.y"
                                        class="input input-xs input-bordered w-20"
                                        placeholder="y"
                                    />
                                    <button class="btn btn-xs btn-ghost" title="抓取坐标与颜色" @click="pickWaitColorCoord">
                                        <Icon icon="ri:crosshair-2-line" class="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div class="flex items-center gap-1 mb-1">
                                    <span class="text-xs w-12">颜色</span>
                                    <input
                                        class="input input-xs input-bordered w-24 font-mono"
                                        :value="'#' + selectedNode.color.toString(16).toUpperCase().padStart(6, '0')"
                                        @input="onColorHexInput"
                                    />
                                    <span class="text-xs">容差</span>
                                    <input
                                        type="number"
                                        v-model.number="selectedNode.tolerance"
                                        class="input input-xs input-bordered w-16"
                                    />
                                </div>
                                <div class="flex items-center gap-1 mb-1">
                                    <span class="text-xs w-12">超时</span>
                                    <input
                                        type="number"
                                        class="input input-xs input-bordered w-24"
                                        placeholder="20000"
                                        :value="selectedNode.timeout ?? ''"
                                        @input="onOptionalCoord('timeout', $event)"
                                    />
                                    <span class="text-xs">存到</span>
                                    <input
                                        v-model="selectedNode.saveAs"
                                        class="input input-xs input-bordered w-20 font-mono"
                                        placeholder="变量名"
                                    />
                                </div>
                            </template>

                            <!-- DSL 宏 -->
                            <template v-else-if="selectedNode.kind === 'playDsl'">
                                <textarea
                                    v-model="selectedNode.dsl"
                                    class="textarea textarea-bordered textarea-xs w-full font-mono"
                                    rows="3"
                                    placeholder="L(800,450)0.1 q #0.5"
                                />
                                <div class="flex items-center gap-1 mt-1">
                                    <span class="text-xs">Promise 存到</span>
                                    <input
                                        v-model="selectedNode.saveAs"
                                        class="input input-xs input-bordered w-24 font-mono"
                                        placeholder="留空则 await"
                                    />
                                </div>
                                <div class="text-[10px] text-base-content/40 mt-1">语法：L/R/M/X1/X2(x,y)时长 按键 #等待秒 +次数(循环)</div>
                            </template>

                            <!-- 状态/配置/代码 -->
                            <template v-else-if="selectedNode.kind === 'setStatus'">
                                <input
                                    v-model="selectedNode.title"
                                    class="input input-xs input-bordered w-full mb-1"
                                    placeholder="状态标题"
                                />
                                <textarea
                                    v-model="selectedNode.payload"
                                    class="textarea textarea-bordered textarea-xs w-full"
                                    rows="2"
                                    placeholder="状态内容（文本）"
                                />
                            </template>
                            <template v-else-if="selectedNode.kind === 'setConfig'">
                                <select v-model="selectedNode.name" class="select select-xs select-bordered w-full mb-1">
                                    <option value="" disabled>选择配置项</option>
                                    <option v-for="configVar in store.doc.configVars" :key="configVar.varName" :value="configVar.name">
                                        {{ configVar.name }}
                                    </option>
                                </select>
                                <input v-model="selectedNode.value" class="input input-xs input-bordered w-full" placeholder="写入的值" />
                            </template>
                            <template v-else-if="selectedNode.kind === 'code'">
                                <textarea
                                    v-model="selectedNode.source"
                                    class="textarea textarea-bordered textarea-xs w-full font-mono"
                                    rows="6"
                                    placeholder="原生 JS 代码（可访问 c / 引擎函数）"
                                />
                            </template>

                            <!-- 循环 -->
                            <template v-else-if="selectedNode.kind === 'loop'">
                                <div class="flex items-center gap-1 mb-2">
                                    <select :value="selectedNode.loopType" class="select select-xs select-bordered" @change="onLoopTypeChange">
                                        <option value="forever">无限循环</option>
                                        <option value="count">次数循环</option>
                                        <option value="while">条件循环 (while)</option>
                                    </select>
                                    <input
                                        v-if="selectedNode.loopType === 'count'"
                                        type="number"
                                        v-model.number="selectedNode.count"
                                        class="input input-xs input-bordered w-24"
                                        min="0"
                                    />
                                </div>
                                <template v-if="selectedNode.loopType === 'while'">
                                    <div class="text-xs text-base-content/60 mb-1">循环条件</div>
                                    <ExprEditor
                                        :expr="selectedNode.condition ?? defaultLoopCondition()"
                                        :variables="store.variableNames"
                                        :clearable="false"
                                        @update="selectedNode.condition = $event ?? defaultLoopCondition()"
                                        @pickCoord="armPick"
                                        @pickRoi="pickRegionFeature"
                                    />
                                </template>
                            </template>

                            <!-- 条件判断 -->
                            <template v-else-if="selectedNode.kind === 'if'">
                                <div class="text-xs text-base-content/60 mb-1">判断条件</div>
                                <ExprEditor
                                    :expr="selectedNode.condition"
                                    :variables="store.variableNames"
                                    @update="
                                        selectedNode.condition = $event ?? {
                                            op: 'call',
                                            fn: 'colorExists',
                                            x: 0,
                                            y: 0,
                                            color: 0xffffff,
                                            tolerance: 10,
                                        }
                                    "
                                    @pickCoord="armPick"
                                    @pickRoi="pickRegionFeature"
                                />
                            </template>

                            <!-- 多条件分支 -->
                            <template v-else-if="selectedNode.kind === 'switch'">
                                <div class="flex items-center gap-1 mb-2">
                                    <span class="text-xs w-16">判断变量</span>
                                    <select v-model="selectedNode.subjectVar" class="select select-xs select-bordered flex-1">
                                        <option value="" disabled>选择变量</option>
                                        <option v-for="name in store.variableNames" :key="name" :value="name">{{ name }}</option>
                                    </select>
                                </div>
                                <div
                                    v-for="(switchCase, caseIndex) in selectedNode.cases"
                                    :key="switchCase.id"
                                    class="flex items-center gap-1 mb-1"
                                >
                                    <span class="text-xs w-10">case {{ caseIndex + 1 }}</span>
                                    <input
                                        v-model="switchCase.match"
                                        class="input input-xs input-bordered flex-1"
                                        placeholder="匹配值（字符串）"
                                    />
                                    <button class="btn btn-xs btn-ghost btn-square text-error" @click="removeSwitchCase(caseIndex)">
                                        <Icon icon="ri:close-line" class="w-3 h-3" />
                                    </button>
                                </div>
                                <button class="btn btn-xs btn-ghost mt-1" @click="addSwitchCase">
                                    <Icon icon="ri:add-line" class="w-3 h-3" />添加分支
                                </button>
                            </template>

                            <!-- 函数 -->
                            <template v-else-if="selectedNode.kind === 'functionDef'">
                                <div class="flex items-center gap-1">
                                    <span class="text-xs w-16">函数名</span>
                                    <input
                                        v-model="selectedNode.funcName"
                                        class="input input-xs input-bordered flex-1"
                                        placeholder="如：刷图"
                                    />
                                </div>
                                <div class="text-[10px] text-base-content/40 mt-1">生成 async function fn_函数名()</div>
                            </template>
                            <template v-else-if="selectedNode.kind === 'functionCall'">
                                <div class="flex items-center gap-1">
                                    <span class="text-xs w-16">调用</span>
                                    <select v-model="selectedNode.funcName" class="select select-xs select-bordered flex-1">
                                        <option value="" disabled>选择函数</option>
                                        <option v-for="name in store.functionNames" :key="name" :value="name">{{ name }}</option>
                                    </select>
                                </div>
                            </template>

                            <div class="text-[10px] text-base-content/30 mt-3">ID: {{ selectedNode.id }}</div>
                        </template>
                    </ScrollArea>

                    <!-- 代码预览 -->
                    <div v-else-if="rightTab === 'preview'" class="flex-1 flex flex-col min-h-0">
                        <div v-if="generated.issues.length" class="px-3 py-1 border-b border-base-300">
                            <div
                                v-for="(issue, index) in generated.issues"
                                :key="index"
                                class="text-xs text-warning flex items-center gap-1"
                            >
                                <Icon icon="ri:error-warning-line" class="w-3 h-3" />{{ issue.message }}
                            </div>
                        </div>
                        <div class="flex-1 min-h-0">
                            <CodeEditor
                                file="autoscript-preview.js"
                                :readonly="true"
                                :model-value="generated.code"
                                class="w-full h-full p-2 font-mono text-xs"
                            />
                        </div>
                    </div>

                    <!-- 配置变量 -->
                    <ScrollArea v-else class="flex-1 p-3">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs text-base-content/60">readConfig 配置项（生成到脚本顶部）</span>
                            <button class="btn btn-xs btn-ghost" @click="store.addConfigVar()">
                                <Icon icon="ri:add-line" class="w-3 h-3" />添加
                            </button>
                        </div>
                        <div v-if="store.doc.configVars.length === 0" class="text-sm text-base-content/50 text-center mt-6">
                            暂无配置变量
                        </div>
                        <div
                            v-for="(configVar, index) in store.doc.configVars"
                            :key="index"
                            class="border border-base-300 rounded p-2 mb-2"
                        >
                            <div class="flex items-center gap-1 mb-1">
                                <input v-model="configVar.name" class="input input-xs input-bordered flex-1" placeholder="配置名" />
                                <input
                                    v-model="configVar.varName"
                                    class="input input-xs input-bordered w-20 font-mono"
                                    placeholder="变量名"
                                />
                                <button class="btn btn-xs btn-ghost btn-square text-error" @click="store.removeConfigVar(index)">
                                    <Icon icon="ri:delete-bin-line" class="w-3 h-3" />
                                </button>
                            </div>
                            <div class="flex items-center gap-1 mb-1">
                                <select v-model="configVar.kind" class="select select-xs select-bordered">
                                    <option v-for="kind in CONFIG_KINDS" :key="kind.value" :value="kind.value">{{ kind.label }}</option>
                                </select>
                                <input v-model="configVar.desc" class="input input-xs input-bordered flex-1" placeholder="描述" />
                            </div>
                            <div class="flex items-center gap-1">
                                <template v-if="configVar.kind === 'select' || configVar.kind === 'multi-select'">
                                    <input
                                        class="input input-xs input-bordered flex-1"
                                        placeholder="选项（逗号分隔）"
                                        :value="configVar.options.join(',')"
                                        @input="onOptionsInput(configVar, $event)"
                                    />
                                </template>
                                <input
                                    v-if="configVar.kind === 'number'"
                                    type="number"
                                    v-model.number="configVar.defaultValue"
                                    class="input input-xs input-bordered w-24"
                                    placeholder="默认值"
                                />
                                <label v-else-if="configVar.kind === 'boolean'" class="flex items-center gap-1 text-xs">
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-xs"
                                        :checked="Boolean(configVar.defaultValue)"
                                        @change="onDefaultBoolChange(configVar, $event)"
                                    />
                                    默认开
                                </label>
                                <input
                                    v-else-if="configVar.kind === 'string' || configVar.kind === 'select'"
                                    v-model="configVar.defaultValue"
                                    class="input input-xs input-bordered w-24"
                                    placeholder="默认值"
                                />
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop" @click.prevent="close"><button>close</button></form>
    </dialog>
</template>
