<script setup lang="ts">
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut"
import { debounce } from "lodash-es"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import {
    deleteFile,
    getDocumentsDir,
    listScriptFiles,
    openExplorer,
    readTextFile,
    renameFile,
    resolveScriptConfigRequest,
    runAsAdmin,
    runScript,
    type ScriptHotkeyBinding,
    syncScriptHotkeyBindings,
    unwatchFile,
    watchFile,
    writeTextFile,
} from "@/api/app"
import { createScriptMutation, deleteScriptMutation, updateScriptMutation } from "@/api/gen/api-mutations"
import { Script, scriptQuery, scriptsCountQuery, scriptsQuery } from "@/api/graphql"
import ContextMenu, { ContextMenuItem } from "@/components/contextmenu"
import { type ScriptRuntimeSidePanelTab, type ScriptStatusItem, useScriptRuntimeStore } from "@/store/scriptRuntime"
import { useUIStore } from "@/store/ui"
import { parseScriptHeader, replaceScriptHeader } from "@/utils/script-header"

const ui = useUIStore()
const scriptRuntime = useScriptRuntimeStore()
const router = useRouter()

const scriptsDir = ref("")
const viewMode = ref<"scheduler" | "local" | "online">("local")
const searchKeyword = ref("")
const selectedCategory = ref<string>("all")
const loading = ref(false)
const onlineScripts = ref<Script[]>([])
const localScripts = ref<string[]>([])
const totalCount = ref(0)
const showNewScriptDialog = ref(false)
const newScriptName = ref("")
const editingScript = ref<string | null>(null)
const editingScriptName = ref("")
const publishingScript = ref(false)
const renamingScriptInFlight = ref(false)
let startEditScriptTimer: ReturnType<typeof setTimeout> | null = null

const DEFAULT_SCRIPT_CONTENT = `const hwnd = getWindowByProcessName("EM-Win64-Shipping.exe")
if (!hwnd || !isElevated()) throw new Error("未找到窗口或非管理员权限")
checkSize(hwnd)
async function main() {
    let i = 0
    const timer = new Timer()
    while (true) {
        const img = captureWindowWGC(hwnd)
        imshow("img", img)
        i++
        if (timer.elapsed() > 1000) {
            setStatus("fps", i)
            i = 0
            timer.reset()
        }
    }
}
main()
`
const newScriptContent = ref(DEFAULT_SCRIPT_CONTENT)

const categoryOptions = computed(() => [
    { value: "all", label: "全部" },
    { value: "战斗", label: "战斗" },
    { value: "采集", label: "采集" },
    { value: "任务", label: "任务" },
    { value: "其他", label: "其他" },
])

/**
 * 将脚本标题转换为本地文件名。
 * @param title 脚本标题
 * @returns 本地脚本文件名（含 .js）
 */
function getScriptFileNameByTitle(title: string): string {
    const normalized = String(title ?? "").replace(/[^a-zA-Z0-9\u4e00-\u9fa5 \-_\(\)]/g, "_")
    return `${normalized}.js`
}

interface OpenedTab {
    id: string
    name: string
    type: "local" | "online"
    content: string
    modified: boolean
}

interface SchedulerCaseRule {
    id: string
    matchValue: string
    targetStepId: string | null
}

interface SchedulerFlowControl {
    enabled: boolean
    cases: SchedulerCaseRule[]
    defaultTargetStepId: string | null
}

interface SchedulerStep {
    id: string
    scriptName: string
    flowControl: SchedulerFlowControl
}

interface SchedulerConfig {
    steps: SchedulerStep[]
}

type ScriptConfigKind = "number" | "string" | "select" | "multi-select" | "boolean"
type ScriptConfigValue = string | number | boolean | string[]

interface ScriptConfigItem {
    name: string
    desc: string
    kind: ScriptConfigKind
    options: string[]
    value: ScriptConfigValue
    defaultValue: ScriptConfigValue
    updatedAt: number
}

interface ScriptReadConfigPayload {
    requestId: string
    scope?: string
    name: string
    desc: string
    kind: ScriptConfigKind
    options?: string[]
    defaultValue?: ScriptConfigValue
}

interface ScriptSetConfigPayload {
    scope?: string
    name: string
    value: unknown
}

interface ScriptLiteralParseResult {
    ok: boolean
    value?: unknown
}

interface ParsedScriptConfigFormat {
    kind: ScriptConfigKind
    options: string[]
}

interface ScriptConfigPreparseSummary {
    createdCount: number
    skippedCount: number
}

interface OpenLocalScriptOptions {
    preferConfigPanel?: boolean
}

interface ScriptHotkeyConfig {
    hotkey: string
    hotIfWinActive: string
    holdToLoop: boolean
    enabled: boolean
}

const openedTabs = ref<OpenedTab[]>([])
const activeTabId = ref<string | null>(null)

const activeTab = computed(() => openedTabs.value.find(tab => tab.id === activeTabId.value))

// 控制台相关
const showConsole = computed({
    get: () => scriptRuntime.showConsole,
    set: value => {
        scriptRuntime.showConsole = value
    },
})
const showStatusPanel = computed({
    get: () => scriptRuntime.showStatusPanel,
    set: value => {
        scriptRuntime.showStatusPanel = value
    },
})
const sidePanelTab = computed({
    get: () => scriptRuntime.sidePanelTab,
    set: value => {
        scriptRuntime.sidePanelTab = value
    },
})
const consoleLogs = computed(() => scriptRuntime.consoleLogs)
const scriptStatuses = computed(() => scriptRuntime.scriptStatuses)
const isRunning = computed({
    get: () => scriptRuntime.isRunning,
    set: value => {
        scriptRuntime.isRunning = value
    },
})
const runningMode = computed({
    get: () => scriptRuntime.runningMode,
    set: value => {
        scriptRuntime.runningMode = value
    },
})
const runningScriptName = computed({
    get: () => scriptRuntime.runningScriptName,
    set: value => {
        scriptRuntime.runningScriptName = value
    },
})
const runningScriptCount = computed({
    get: () => scriptRuntime.runningScriptCount,
    set: value => {
        scriptRuntime.runningScriptCount = value
    },
})
const runningScriptPaths = computed({
    get: () => scriptRuntime.runningScriptPaths,
    set: value => {
        scriptRuntime.runningScriptPaths = value
    },
})
let unlistenConsoleFn: UnlistenFn | null = null
let unlistenStatusFn: UnlistenFn | null = null
let unlistenFileChangedFn: UnlistenFn | null = null
let unlistenScriptConfigFn: UnlistenFn | null = null
let unlistenScriptSetConfigFn: UnlistenFn | null = null
const watchedFiles = ref<Set<string>>(new Set())
const codeEditor = ref<any>()
const showSchedulerDialog = ref(false)
const schedulerStopRequested = computed({
    get: () => scriptRuntime.schedulerStopRequested,
    set: value => {
        scriptRuntime.schedulerStopRequested = value
    },
})
const SCHEDULER_STORAGE_KEY = "script-scheduler-config-v1"
const schedulerConfig = ref<SchedulerConfig>({
    steps: [],
})
const schedulerDraftConfig = ref<SchedulerConfig>({
    steps: [],
})
const schedulerDraftStepOptions = computed(() =>
    schedulerDraftConfig.value.steps.map((step, index) => ({
        id: step.id,
        label: `${index + 1}. ${step.scriptName || "未选择脚本"}`,
    }))
)
const SCRIPT_CONFIG_STORAGE_KEY = "script-runtime-config-v1"
const SCRIPT_HOTKEY_STORAGE_KEY = "script-hotkey-bindings-v1"
const SCRIPT_RUNTIME_TIMEOUT_DEFAULT_SECONDS = 30
const SCRIPT_RUNTIME_TIMEOUT_CONFIG_ITEM_NAME = "运行超时"
const SCRIPT_RUNTIME_TIMEOUT_CONFIG_ITEM_DESC = "运行超时秒数，脚本运行中长时间未检测到事件时自动重启，0 表示关闭。"
const scriptConfigStore = ref<Record<string, Record<string, ScriptConfigItem>>>({})
const scriptHotkeyStore = ref<Record<string, ScriptHotkeyConfig>>({})
const showScriptHotkeyDialog = ref(false)
const editingHotkeyScriptName = ref("")
const editingHotkeyValue = ref("")
const editingHotkeyWinActive = ref("")
const editingHotkeyHoldToLoop = ref(false)
let scriptRuntimeWatchdogTimer: ReturnType<typeof setInterval> | null = null
let lastScriptEventAt = 0
let scriptRuntimeRestartingByTimeout = false
const activeConfigScope = ref("")
const currentConfigScope = computed(() => {
    if (activeTab.value?.type === "local") {
        return resolveStoredScriptConfigScope(activeTab.value.name)
    }
    const explicitScope = resolveStoredScriptConfigScope(activeConfigScope.value)
    if (explicitScope) return explicitScope
    return ""
})

/**
 * 构造脚本运行超时配置项（用于复用既有脚本配置 UI）。
 * @param timeoutSeconds 超时秒数
 * @returns 配置项
 */
function createRuntimeTimeoutConfigItem(timeoutSeconds: number): ScriptConfigItem {
    return {
        name: SCRIPT_RUNTIME_TIMEOUT_CONFIG_ITEM_NAME,
        desc: SCRIPT_RUNTIME_TIMEOUT_CONFIG_ITEM_DESC,
        kind: "number",
        options: [],
        value: normalizeScriptRuntimeTimeoutSeconds(timeoutSeconds),
        defaultValue: SCRIPT_RUNTIME_TIMEOUT_DEFAULT_SECONDS,
        updatedAt: Date.now(),
    }
}

/**
 * 确保指定作用域存在“运行超时”配置项。
 * @param scope 配置作用域
 * @param persist 是否立即持久化
 */
function ensureRuntimeTimeoutConfigItem(scope: string, persist = false) {
    const resolvedScope = resolveStoredScriptConfigScope(scope)
    if (!resolvedScope) return
    const scopedItems = scriptConfigStore.value[resolvedScope] ?? {}
    if (scopedItems[SCRIPT_RUNTIME_TIMEOUT_CONFIG_ITEM_NAME]) return
    scriptConfigStore.value[resolvedScope] = {
        ...scopedItems,
        [SCRIPT_RUNTIME_TIMEOUT_CONFIG_ITEM_NAME]: createRuntimeTimeoutConfigItem(SCRIPT_RUNTIME_TIMEOUT_DEFAULT_SECONDS),
    }
    if (persist) {
        persistScriptConfigItems()
    }
}

const sortedScriptConfigItems = computed(() => {
    const scope = currentConfigScope.value
    if (!scope) return []
    return Object.values(scriptConfigStore.value[scope] ?? {})
})

async function initScriptsDir() {
    try {
        scriptsDir.value = `${await getDocumentsDir()}\\dob-scripts`
    } catch (error) {
        console.error("获取脚本目录失败", error)
        scriptsDir.value = "C:\\Users\\Public\\Documents\\dob-scripts"
    }
}

/**
 * 初始化 engine.d.ts 文件到脚本目录
 * 从 public 目录读取 engine.d.ts 并写入到脚本目录
 */
async function initEngineDts() {
    try {
        const engineDtsPath = `${scriptsDir.value}\\engine.d.ts`

        const response = await fetch("/tpl/engine.d.ts")
        if (!response.ok) {
            throw new Error(`读取 engine.d.ts 失败: ${response.statusText}`)
        }

        const content = await response.text()
        await writeTextFile(engineDtsPath, content)
        const res = await fetch("/tpl/tsconfig.json")
        const tsconfig = await res.text()
        await writeTextFile(`${scriptsDir.value}\\tsconfig.json`, tsconfig)
    } catch (error) {
        console.error("初始化 engine.d.ts 失败", error)
    }
}

async function fetchOnlineScripts(offset = 0) {
    loading.value = true
    try {
        const result = await scriptsQuery(
            {
                category: selectedCategory.value === "all" ? undefined : selectedCategory.value,
                limit: 20,
                offset,
                search: searchKeyword.value,
            },
            {
                requestPolicy: "network-only",
            }
        )

        if (result) {
            if (offset === 0) {
                onlineScripts.value = result
            } else {
                onlineScripts.value.push(...result)
            }
        }

        const count = await scriptsCountQuery(
            {
                category: selectedCategory.value === "all" ? undefined : selectedCategory.value,
            },
            { requestPolicy: "network-only" }
        )
        totalCount.value = count ?? 0
    } finally {
        loading.value = false
    }
}

async function fetchLocalScripts() {
    loading.value = true
    try {
        const files = await listScriptFiles(scriptsDir.value)
        localScripts.value = files
        try {
            await syncScriptHotkeysWithBackend()
        } catch (error) {
            console.error("同步脚本热键失败", error)
            ui.showErrorMessage(`同步脚本热键失败: ${error}`)
        }
    } catch (error) {
        console.error("获取本地脚本列表失败", error)
        localScripts.value = []
    } finally {
        loading.value = false
    }
}

async function loadLocalScriptContent(fileName: string) {
    try {
        const filePath = `${scriptsDir.value}\\${fileName}`
        const content = await readTextFile(filePath)
        return content
    } catch (error) {
        console.error("读取脚本内容失败", error)
        return ""
    }
}

const handleSearch = debounce(() => {
    fetchOnlineScripts(0)
}, 300)

function loadMore() {
    if (viewMode.value === "online") {
        fetchOnlineScripts(onlineScripts.value.length)
    }
}

/**
 * 生成调度器条目所需的唯一 ID。
 * @param prefix 前缀，便于区分类型
 * @returns 唯一 ID
 */
function createSchedulerId(prefix: "step" | "case"): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 创建默认的流控分支规则。
 * @returns 默认 case 规则
 */
function createSchedulerCaseRule(): SchedulerCaseRule {
    return {
        id: createSchedulerId("case"),
        matchValue: "",
        targetStepId: null,
    }
}

/**
 * 创建默认调度步骤。
 * @param scriptName 预设脚本名
 * @returns 默认步骤
 */
function createSchedulerStep(scriptName = ""): SchedulerStep {
    return {
        id: createSchedulerId("step"),
        scriptName,
        flowControl: {
            enabled: false,
            cases: [],
            defaultTargetStepId: null,
        },
    }
}

/**
 * 深拷贝调度器配置，避免弹窗编辑直接污染已保存状态。
 * @param config 原始调度器配置
 * @returns 拷贝后的调度器配置
 */
function cloneSchedulerConfig(config: SchedulerConfig): SchedulerConfig {
    return {
        steps: config.steps.map(step => ({
            id: step.id,
            scriptName: step.scriptName,
            flowControl: {
                enabled: step.flowControl.enabled,
                defaultTargetStepId: step.flowControl.defaultTargetStepId,
                cases: step.flowControl.cases.map(rule => ({
                    id: rule.id,
                    matchValue: rule.matchValue,
                    targetStepId: rule.targetStepId,
                })),
            },
        })),
    }
}

/**
 * 将运行结果规整为字符串，供调度流控匹配使用。
 * @param result 脚本执行返回值
 * @returns 标准化后的字符串结果
 */
function normalizeSchedulerResult(result: string | null | undefined): string {
    const normalized = result ?? ""
    if (normalized === "[object Promise]") {
        return ""
    }
    return normalized
}

/**
 * 根据当前步骤位置获取默认下一步（顺序执行）。
 * @param currentIndex 当前步骤索引
 * @returns 下一步 ID，若不存在则返回 null
 */
function getSequentialNextStepId(currentIndex: number): string | null {
    return schedulerConfig.value.steps[currentIndex + 1]?.id ?? null
}

/**
 * 基于流控规则解析下一步要执行的脚本。
 * @param step 当前步骤
 * @param result 当前步骤返回结果
 * @param currentIndex 当前步骤索引
 * @returns 下一步 ID，若流程结束则返回 null
 */
function resolveSchedulerNextStepId(step: SchedulerStep, result: string, currentIndex: number): string | null {
    if (!step.flowControl.enabled) {
        return getSequentialNextStepId(currentIndex)
    }

    const matchedRule = step.flowControl.cases.find(rule => rule.matchValue === result && rule.targetStepId)
    if (matchedRule?.targetStepId) {
        return matchedRule.targetStepId
    }

    if (step.flowControl.defaultTargetStepId) {
        return step.flowControl.defaultTargetStepId
    }

    return getSequentialNextStepId(currentIndex)
}

/**
 * 从本地存储加载调度器配置。
 */
function loadSchedulerConfig() {
    const stored = localStorage.getItem(SCHEDULER_STORAGE_KEY)
    if (!stored) {
        schedulerConfig.value = { steps: [] }
        schedulerDraftConfig.value = { steps: [] }
        return
    }

    try {
        const parsed = JSON.parse(stored) as Partial<SchedulerConfig>
        const rawSteps = Array.isArray(parsed?.steps) ? parsed.steps : []
        const steps = rawSteps
            .filter(item => item && typeof item === "object")
            .map(item => {
                const step = item as Partial<SchedulerStep>
                const flowControl = step.flowControl as Partial<SchedulerFlowControl> | undefined
                const rawCases = Array.isArray(flowControl?.cases) ? flowControl.cases : []
                const cases = rawCases
                    .filter(rule => rule && typeof rule === "object")
                    .map(rule => {
                        const nextRule = rule as Partial<SchedulerCaseRule>
                        return {
                            id: typeof nextRule.id === "string" ? nextRule.id : createSchedulerId("case"),
                            matchValue: typeof nextRule.matchValue === "string" ? nextRule.matchValue : "",
                            targetStepId: typeof nextRule.targetStepId === "string" ? nextRule.targetStepId : null,
                        }
                    })
                return {
                    id: typeof step.id === "string" ? step.id : createSchedulerId("step"),
                    scriptName: typeof step.scriptName === "string" ? step.scriptName : "",
                    flowControl: {
                        enabled: Boolean(flowControl?.enabled),
                        cases,
                        defaultTargetStepId: typeof flowControl?.defaultTargetStepId === "string" ? flowControl.defaultTargetStepId : null,
                    },
                } satisfies SchedulerStep
            })

        schedulerConfig.value = { steps }
        schedulerDraftConfig.value = cloneSchedulerConfig(schedulerConfig.value)
    } catch (error) {
        console.error("读取调度器配置失败", error)
        schedulerConfig.value = { steps: [] }
        schedulerDraftConfig.value = { steps: [] }
    }
}

/**
 * 打开调度器配置弹窗。
 */
async function openSchedulerDialog() {
    await fetchLocalScripts()
    schedulerDraftConfig.value = cloneSchedulerConfig(schedulerConfig.value)
    showSchedulerDialog.value = true
}

/**
 * 向调度器草稿中新增一步脚本。
 */
function addSchedulerStep() {
    const defaultScript = localScripts.value[0] ?? ""
    schedulerDraftConfig.value.steps.push(createSchedulerStep(defaultScript))
}

/**
 * 删除调度器草稿中的指定步骤并清理相关跳转引用。
 * @param index 要删除的步骤索引
 */
function removeSchedulerStep(index: number) {
    const removedStep = schedulerDraftConfig.value.steps[index]
    if (!removedStep) return
    schedulerDraftConfig.value.steps.splice(index, 1)

    for (const step of schedulerDraftConfig.value.steps) {
        if (step.flowControl.defaultTargetStepId === removedStep.id) {
            step.flowControl.defaultTargetStepId = null
        }
        for (const rule of step.flowControl.cases) {
            if (rule.targetStepId === removedStep.id) {
                rule.targetStepId = null
            }
        }
    }
}

/**
 * 调整步骤顺序。
 * @param index 当前索引
 * @param direction 方向，-1 表示上移，1 表示下移
 */
function moveSchedulerStep(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= schedulerDraftConfig.value.steps.length) return
    const step = schedulerDraftConfig.value.steps[index]
    schedulerDraftConfig.value.steps.splice(index, 1)
    schedulerDraftConfig.value.steps.splice(targetIndex, 0, step)
}

/**
 * 给指定步骤新增 case 分支。
 * @param stepIndex 步骤索引
 */
function addSchedulerCase(stepIndex: number) {
    const step = schedulerDraftConfig.value.steps[stepIndex]
    if (!step) return
    step.flowControl.cases.push(createSchedulerCaseRule())
}

/**
 * 删除指定步骤的某条 case 分支。
 * @param stepIndex 步骤索引
 * @param caseIndex 分支索引
 */
function removeSchedulerCase(stepIndex: number, caseIndex: number) {
    const step = schedulerDraftConfig.value.steps[stepIndex]
    if (!step) return
    step.flowControl.cases.splice(caseIndex, 1)
}

/**
 * 持久化保存调度器配置并切换到调度视图。
 */
function saveSchedulerConfig() {
    schedulerConfig.value = cloneSchedulerConfig(schedulerDraftConfig.value)
    localStorage.setItem(SCHEDULER_STORAGE_KEY, JSON.stringify(schedulerConfig.value))
    showSchedulerDialog.value = false
    viewMode.value = "scheduler"
    ui.showSuccessMessage("调度器配置已保存")
}

/**
 * 打开并运行指定本地脚本。
 * @param fileName 本地脚本文件名
 * @param options 运行附加选项
 * @returns 脚本返回结果字符串
 */
async function runLocalScriptByName(
    fileName: string,
    options: {
        keepSchedulerMode?: boolean
    } = {}
): Promise<string> {
    await openLocalScript(fileName, { preferConfigPanel: false })
    const filePath = `${scriptsDir.value}\\${fileName}`
    scriptRuntime.markRunningScript(fileName, { keepSchedulerMode: options.keepSchedulerMode })
    touchScriptRuntimeEvent()
    addConsoleLog("info", `开始运行脚本: ${fileName}`)
    const result = await runScript(filePath)
    const normalizedResult = normalizeSchedulerResult(result)
    addConsoleLog("info", `脚本执行完成: ${fileName}，返回结果: ${normalizedResult || "(empty)"}`)
    return normalizedResult
}

/**
 * 按脚本路径提取文件名。
 * @param scriptPath 脚本完整路径
 * @returns 文件名（提取失败返回空字符串）
 */
function getScriptFileNameFromPath(scriptPath: string): string {
    return (
        String(scriptPath ?? "")
            .split(/[\\/]/)
            .filter(Boolean)
            .pop() ?? ""
    )
}

/**
 * 规范化脚本配置作用域键（统一使用文件名）。
 * @param scope 原始作用域（可能是文件名或完整路径）
 * @returns 规范化后的作用域键
 */
function normalizeScriptConfigScope(scope?: string | null): string {
    const normalized = String(scope ?? "").trim()
    if (!normalized) return ""
    const fileName = getScriptFileNameFromPath(normalized).trim()
    return fileName || normalized
}

/**
 * 解析脚本配置作用域到存储中的实际键（不区分大小写，兼容历史路径键）。
 * @param scope 原始作用域
 * @returns 可直接用于 scriptConfigStore 的键
 */
function resolveStoredScriptConfigScope(scope?: string | null): string {
    const normalizedScope = normalizeScriptConfigScope(scope)
    if (!normalizedScope) return ""
    const lowerScope = normalizedScope.toLowerCase()
    const matchedScope = Object.keys(scriptConfigStore.value).find(key => normalizeScriptConfigScope(key).toLowerCase() === lowerScope)
    return matchedScope ?? normalizedScope
}

/**
 * 规范化脚本事件作用域（路径），用于跨平台与大小写无关比较。
 * @param scope 事件携带的 scope
 * @returns 规范化后的 scope
 */
function normalizeScriptEventScope(scope?: string | null): string {
    return String(scope ?? "")
        .trim()
        .replace(/\//g, "\\")
        .toLowerCase()
}

/**
 * 获取当前前端用于接收脚本事件的作用域。
 * 优先使用当前激活本地标签页，其次退化到唯一运行实例路径。
 * @returns 当前作用域（为空表示不接收 scoped 事件）
 */
function getCurrentScriptEventScope(): string {
    if (activeTab.value?.type === "local") {
        return normalizeScriptEventScope(`${scriptsDir.value}\\${activeTab.value.name}`)
    }
    if (runningScriptPaths.value.length === 1) {
        return normalizeScriptEventScope(runningScriptPaths.value[0])
    }
    return ""
}

/**
 * 判断当前事件 scope 是否应被前端接收。
 * @param scope 事件 scope
 * @returns true 表示接收；false 表示忽略
 */
function shouldAcceptScopedScriptEvent(scope?: string | null): boolean {
    const payloadScope = normalizeScriptEventScope(scope)
    if (!payloadScope) {
        return true
    }
    const currentScope = getCurrentScriptEventScope()
    if (!currentScope) {
        return false
    }
    if (payloadScope === currentScope) {
        return true
    }
    const payloadFileName = getScriptFileNameFromPath(payloadScope).toLowerCase()
    const currentFileName = getScriptFileNameFromPath(currentScope).toLowerCase()
    return Boolean(payloadFileName) && payloadFileName === currentFileName
}

const runningScriptFileNameSet = computed(
    () => new Set(runningScriptPaths.value.map(path => getScriptFileNameFromPath(path)).filter(Boolean))
)
const activeLocalScriptName = computed(() => (activeTab.value?.type === "local" ? activeTab.value.name : ""))
const isActiveLocalScriptRunning = computed(() => {
    const scriptName = activeLocalScriptName.value
    return scriptName ? isLocalScriptRunning(scriptName) : false
})
const isSchedulerRunning = computed(() => runningMode.value === "scheduler" && isRunning.value)
const isRunButtonInStopState = computed(() =>
    viewMode.value === "scheduler" ? isSchedulerRunning.value : isActiveLocalScriptRunning.value
)
const runButtonTitle = computed(() => {
    if (viewMode.value === "scheduler") {
        return isSchedulerRunning.value ? "停止调度器" : "运行调度器"
    }
    if (activeTab.value?.type === "online") {
        return "请先下载脚本"
    }
    const scriptName = activeLocalScriptName.value
    if (!scriptName) {
        return "运行脚本"
    }
    return isActiveLocalScriptRunning.value ? `停止脚本: ${scriptName}` : `运行脚本: ${scriptName}`
})

/**
 * 判断指定本地脚本当前是否在运行。
 * @param scriptName 本地脚本文件名
 * @returns 是否正在运行
 */
function isLocalScriptRunning(scriptName: string): boolean {
    return runningScriptFileNameSet.value.has(scriptName)
}

/**
 * 停止指定本地脚本对应的运行实例。
 * @param fileName 本地脚本文件名
 */
async function stopLocalScriptByName(fileName: string) {
    const scriptName = String(fileName ?? "").trim()
    if (!scriptName) return
    try {
        await scriptRuntime.stopScriptByFilePath(`${scriptsDir.value}\\${scriptName}`)
        addConsoleLog("info", `已发送停止请求: ${scriptName}`)
    } catch (error) {
        console.error("停止指定脚本失败", error)
        ui.showErrorMessage(`停止脚本失败: ${error}`)
    }
}

/**
 * 执行当前调度器配置。
 */
async function runScheduler() {
    if (schedulerConfig.value.steps.length === 0) {
        ui.showErrorMessage("请先在更多操作中配置调度器")
        return
    }

    scriptRuntime.clearScriptStatuses()
    activateRuntimeDebugPanelOnStart()
    scriptRuntime.markSchedulerRunning()
    scriptRuntime.clearSchedulerStopRequest()
    addConsoleLog("info", "开始执行调度器")

    const MAX_SCHEDULER_EXECUTIONS = 500
    let executionCount = 0
    let nextStepId: string | null = schedulerConfig.value.steps[0]?.id ?? null

    try {
        while (nextStepId && !schedulerStopRequested.value) {
            const stepIndex = schedulerConfig.value.steps.findIndex(step => step.id === nextStepId)
            if (stepIndex < 0) {
                addConsoleLog("warn", "调度器跳转目标不存在，已终止执行")
                break
            }

            const step = schedulerConfig.value.steps[stepIndex]
            if (!step.scriptName) {
                addConsoleLog("warn", `步骤 #${stepIndex + 1} 未配置脚本，自动跳过`)
                nextStepId = getSequentialNextStepId(stepIndex)
                continue
            }

            addConsoleLog("info", `调度器执行步骤 #${stepIndex + 1}: ${step.scriptName}`)
            const result = await runLocalScriptByName(step.scriptName, { keepSchedulerMode: true })
            nextStepId = resolveSchedulerNextStepId(step, result, stepIndex)

            executionCount += 1
            if (executionCount >= MAX_SCHEDULER_EXECUTIONS) {
                addConsoleLog("warn", "调度器执行次数超过上限，已自动停止")
                break
            }
        }

        if (schedulerStopRequested.value) {
            addConsoleLog("info", "调度器已停止")
        } else {
            addConsoleLog("info", "调度器执行完成")
        }
    } catch (error) {
        console.error("调度器执行失败", error)
        ui.showErrorMessage("调度器执行失败，请检查脚本配置")
        addConsoleLog("error", `调度器执行失败: ${error}`)
    } finally {
        if (runningMode.value === "scheduler") {
            runningMode.value = null
        }
        scriptRuntime.clearSchedulerStopRequest()
        await syncRunningStateFromBackend()
    }
}

/**
 * 规范化热键文本。
 * @param hotkey 输入热键
 * @returns 去首尾空白后的热键
 */
function normalizeScriptHotkeyValue(hotkey: string): string {
    return String(hotkey ?? "").trim()
}

/**
 * 规范化热键生效条件（对应 `#HotIf WinActive("WinTitle")` 的 WinTitle 字符串）。
 * @param value 用户输入
 * @returns 去首尾空白后的条件字符串
 */
function normalizeScriptHotIfWinActiveValue(value: string): string {
    return String(value ?? "").trim()
}

/**
 * 规范化“按住循环”配置值。
 * @param value 原始值
 * @returns 布尔值
 */
function normalizeScriptHotkeyHoldToLoopValue(value: unknown): boolean {
    return Boolean(value)
}

/**
 * 规范化热键启用状态。
 * @param value 原始值
 * @returns 布尔值（默认启用）
 */
function normalizeScriptHotkeyEnabledValue(value: unknown): boolean {
    if (typeof value === "boolean") return value
    return true
}

/**
 * 构造默认热键配置。
 * @returns 默认配置对象
 */
function createDefaultScriptHotkeyConfig(): ScriptHotkeyConfig {
    return {
        hotkey: "",
        hotIfWinActive: "",
        holdToLoop: false,
        enabled: true,
    }
}

/**
 * 规范化热键配置对象（兼容旧版仅字符串热键格式）。
 * @param raw 原始配置
 * @returns 规范化后的配置；无效时返回 null
 */
function normalizeScriptHotkeyConfig(raw: unknown): ScriptHotkeyConfig | null {
    if (typeof raw === "string") {
        const hotkey = normalizeScriptHotkeyValue(raw)
        if (!hotkey) return null
        return {
            hotkey,
            hotIfWinActive: "",
            holdToLoop: false,
            enabled: true,
        }
    }

    if (!raw || typeof raw !== "object") return null
    const maybeConfig = raw as Partial<ScriptHotkeyConfig>
    const hotkey = normalizeScriptHotkeyValue(maybeConfig.hotkey ?? "")
    if (!hotkey) return null
    return {
        hotkey,
        hotIfWinActive: normalizeScriptHotIfWinActiveValue(maybeConfig.hotIfWinActive ?? ""),
        holdToLoop: normalizeScriptHotkeyHoldToLoopValue(maybeConfig.holdToLoop),
        enabled: normalizeScriptHotkeyEnabledValue((maybeConfig as { enabled?: unknown }).enabled),
    }
}

/**
 * 构造用于列表展示的热键标签文本。
 * @param config 热键配置
 * @returns 展示文本
 */
function formatScriptHotkeyBadgeText(config?: ScriptHotkeyConfig): string {
    if (!config) return ""
    const base = normalizeScriptHotkeyValue(config.hotkey)
    if (!base) return ""
    if (!config.enabled) {
        return `${base} [已禁用]`
    }
    if (config.holdToLoop) {
        return `${base} [按住循环]`
    }
    return base
}

/**
 * 规范化脚本运行超时秒数（0 表示关闭自动重启）。
 * @param value 原始值
 * @returns 非负整数秒
 */
function normalizeScriptRuntimeTimeoutSeconds(value: unknown): number {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
        return SCRIPT_RUNTIME_TIMEOUT_DEFAULT_SECONDS
    }
    return Math.max(0, Math.floor(numeric))
}

/**
 * 更新最近一次脚本事件时间戳。
 */
function touchScriptRuntimeEvent() {
    lastScriptEventAt = Date.now()
}

/**
 * 获取脚本 scope 对应的超时重启秒数（未配置时使用默认值）。
 * @param scope 脚本配置作用域
 * @returns 超时秒数（0 表示关闭）
 */
function getRuntimeTimeoutSecondsByScope(scope: string): number {
    const resolvedScope = resolveStoredScriptConfigScope(scope)
    if (!resolvedScope) return SCRIPT_RUNTIME_TIMEOUT_DEFAULT_SECONDS
    const timeoutItem = scriptConfigStore.value[resolvedScope]?.[SCRIPT_RUNTIME_TIMEOUT_CONFIG_ITEM_NAME]
    if (!timeoutItem) return SCRIPT_RUNTIME_TIMEOUT_DEFAULT_SECONDS
    return normalizeScriptRuntimeTimeoutSeconds(timeoutItem.value)
}

/**
 * 解析当前运行脚本对应的配置作用域。
 * @returns 脚本配置作用域；无法确定时返回空字符串
 */
function resolveRuntimeWatchdogScope(): string {
    const runningPathScope = resolveStoredScriptConfigScope(runningScriptPaths.value[0] ?? "")
    if (runningPathScope) return runningPathScope
    return resolveStoredScriptConfigScope(runningScriptName.value)
}

/**
 * 解析当前可用于自动重启的脚本文件名。
 * @returns 本地脚本文件名；不可重启时返回空字符串
 */
function resolveRuntimeWatchdogScriptName(): string {
    if (!isRunning.value || runningMode.value !== "single") return ""
    if (runningScriptCount.value > 1 || runningScriptPaths.value.length > 1) return ""
    const pathFileName = getScriptFileNameFromPath(runningScriptPaths.value[0] ?? "")
    const fallbackName = String(runningScriptName.value ?? "").trim()
    return pathFileName || fallbackName
}

/**
 * 后台启动本地脚本，并在脚本结束后回收运行态。
 * @param scriptName 本地脚本文件名
 */
function launchLocalScriptInBackground(scriptName: string) {
    void runLocalScriptByName(scriptName)
        .catch(error => {
            console.error("脚本自动重启后再次运行失败", error)
            addConsoleLog("error", `脚本自动重启后运行失败: ${error}`)
        })
        .finally(() => {
            void syncRunningStateFromBackend(false)
        })
}

/**
 * 在脚本超时未上报事件时自动重启当前脚本。
 * @param timeoutSeconds 超时阈值（秒）
 */
async function restartRunningScriptByTimeout(timeoutSeconds: number) {
    if (scriptRuntimeRestartingByTimeout) return
    const scriptName = resolveRuntimeWatchdogScriptName()
    if (!scriptName) return
    scriptRuntimeRestartingByTimeout = true

    try {
        addConsoleLog("warn", `超过 ${timeoutSeconds} 秒未检测到脚本事件，正在自动重启: ${scriptName}`)
        const runningPath = runningScriptPaths.value[0]
        const scriptPath = runningPath || (scriptsDir.value ? `${scriptsDir.value}\\${scriptName}` : "")
        if (!scriptPath) {
            addConsoleLog("warn", `自动重启已跳过：无法解析脚本路径 (${scriptName})`)
            return
        }
        await scriptRuntime.stopScriptByFilePath(scriptPath)
        touchScriptRuntimeEvent()
        launchLocalScriptInBackground(scriptName)
        addConsoleLog("info", `脚本自动重启已触发: ${scriptName}`)
    } catch (error) {
        console.error("脚本超时自动重启失败", error)
        addConsoleLog("error", `脚本超时自动重启失败: ${error}`)
    } finally {
        scriptRuntimeRestartingByTimeout = false
        touchScriptRuntimeEvent()
        await syncRunningStateFromBackend(false)
    }
}

/**
 * 检查脚本事件是否超时，若超时则自动重启。
 */
async function checkScriptRuntimeWatchdog() {
    const scope = resolveRuntimeWatchdogScope()
    if (!scope) return
    const timeoutSeconds = getRuntimeTimeoutSecondsByScope(scope)
    if (timeoutSeconds <= 0) return
    if (scriptRuntimeRestartingByTimeout) return
    if (!resolveRuntimeWatchdogScriptName()) return
    if (!lastScriptEventAt) {
        touchScriptRuntimeEvent()
        return
    }
    if (Date.now() - lastScriptEventAt < timeoutSeconds * 1000) return
    await restartRunningScriptByTimeout(timeoutSeconds)
}

/**
 * 启动脚本运行超时看门狗。
 */
function startScriptRuntimeWatchdog() {
    if (scriptRuntimeWatchdogTimer) return
    scriptRuntimeWatchdogTimer = setInterval(() => {
        void checkScriptRuntimeWatchdog()
    }, 1000)
}

/**
 * 停止脚本运行超时看门狗。
 */
function stopScriptRuntimeWatchdog() {
    if (!scriptRuntimeWatchdogTimer) return
    clearInterval(scriptRuntimeWatchdogTimer)
    scriptRuntimeWatchdogTimer = null
}

/**
 * 持久化脚本热键绑定。
 */
function persistScriptHotkeys() {
    localStorage.setItem(SCRIPT_HOTKEY_STORAGE_KEY, JSON.stringify(scriptHotkeyStore.value))
}

/**
 * 加载本地持久化的脚本热键绑定。
 */
function loadScriptHotkeys() {
    const stored = localStorage.getItem(SCRIPT_HOTKEY_STORAGE_KEY)
    if (!stored) {
        scriptHotkeyStore.value = {}
        return
    }
    try {
        const parsed = JSON.parse(stored) as Record<string, unknown>
        const normalized: Record<string, ScriptHotkeyConfig> = {}
        for (const [scriptName, rawConfig] of Object.entries(parsed ?? {})) {
            const normalizedScriptName = String(scriptName ?? "").trim()
            const normalizedConfig = normalizeScriptHotkeyConfig(rawConfig)
            if (!normalizedScriptName || !normalizedConfig) continue
            normalized[normalizedScriptName] = normalizedConfig
        }
        scriptHotkeyStore.value = normalized
    } catch (error) {
        console.error("加载脚本热键失败", error)
        scriptHotkeyStore.value = {}
    }
}

/**
 * 构建后端热键同步载荷（仅同步当前本地脚本列表中存在的绑定）。
 * @returns 后端热键绑定载荷
 */
function buildScriptHotkeyBindingsPayload(): ScriptHotkeyBinding[] {
    const payload: ScriptHotkeyBinding[] = []
    const localScriptSet = new Set(localScripts.value)
    for (const [scriptName, config] of Object.entries(scriptHotkeyStore.value)) {
        if (!localScriptSet.has(scriptName)) continue
        if (!config.enabled) continue
        const normalizedHotkey = normalizeScriptHotkeyValue(config.hotkey)
        if (!normalizedHotkey) continue
        payload.push({
            scriptPath: `${scriptsDir.value}\\${scriptName}`,
            hotkey: normalizedHotkey,
            hotIfWinActive: normalizeScriptHotIfWinActiveValue(config.hotIfWinActive),
            holdToLoop: normalizeScriptHotkeyHoldToLoopValue(config.holdToLoop),
        })
    }
    return payload
}

/**
 * 同步脚本热键到后端并清理已删除脚本的脏绑定。
 */
async function syncScriptHotkeysWithBackend() {
    const localScriptSet = new Set(localScripts.value)
    let changed = false
    for (const scriptName of Object.keys(scriptHotkeyStore.value)) {
        if (localScriptSet.has(scriptName)) continue
        delete scriptHotkeyStore.value[scriptName]
        changed = true
    }
    if (changed) {
        persistScriptHotkeys()
    }
    const payload = buildScriptHotkeyBindingsPayload()
    await syncScriptHotkeyBindings(payload)
}

/**
 * 切换单个脚本热键启用状态。
 * @param scriptName 本地脚本名
 */
async function toggleScriptHotkeyEnabled(scriptName: string) {
    const previousConfig = scriptHotkeyStore.value[scriptName]
    if (!previousConfig) return
    const nextConfig: ScriptHotkeyConfig = {
        ...previousConfig,
        enabled: !previousConfig.enabled,
    }
    scriptHotkeyStore.value[scriptName] = nextConfig
    try {
        await syncScriptHotkeysWithBackend()
        persistScriptHotkeys()
        ui.showSuccessMessage(nextConfig.enabled ? `已启用热键: ${scriptName}` : `已禁用热键: ${scriptName}`)
    } catch (error) {
        scriptHotkeyStore.value[scriptName] = previousConfig
        console.error("切换脚本热键状态失败", error)
        ui.showErrorMessage(`切换脚本热键状态失败: ${error}`)
    }
}

/**
 * 打开热键绑定弹窗。
 * @param scriptName 本地脚本名
 */
function openScriptHotkeyDialog(scriptName: string) {
    editingHotkeyScriptName.value = scriptName
    const existing = scriptHotkeyStore.value[scriptName] ?? createDefaultScriptHotkeyConfig()
    editingHotkeyValue.value = existing.hotkey
    editingHotkeyWinActive.value = existing.hotIfWinActive
    editingHotkeyHoldToLoop.value = existing.holdToLoop
    showScriptHotkeyDialog.value = true
}

/**
 * 保存当前脚本热键绑定。
 */
async function saveScriptHotkeyBinding() {
    const scriptName = editingHotkeyScriptName.value
    if (!scriptName) return
    const previousConfig = scriptHotkeyStore.value[scriptName] ? { ...scriptHotkeyStore.value[scriptName] } : null
    const hotkey = normalizeScriptHotkeyValue(editingHotkeyValue.value)
    if (!hotkey) {
        ui.showErrorMessage("请输入热键，示例：^c、CapsLock & c、RButton & XButton1")
        return
    }

    try {
        const enabled = previousConfig?.enabled ?? true
        scriptHotkeyStore.value[scriptName] = {
            hotkey,
            hotIfWinActive: normalizeScriptHotIfWinActiveValue(editingHotkeyWinActive.value),
            holdToLoop: normalizeScriptHotkeyHoldToLoopValue(editingHotkeyHoldToLoop.value),
            enabled,
        }
        await syncScriptHotkeysWithBackend()
        persistScriptHotkeys()
        showScriptHotkeyDialog.value = false
        ui.showSuccessMessage(`已绑定热键: ${scriptName} -> ${hotkey}`)
    } catch (error) {
        if (previousConfig) {
            scriptHotkeyStore.value[scriptName] = previousConfig
        } else {
            delete scriptHotkeyStore.value[scriptName]
        }
        console.error("保存脚本热键失败", error)
        ui.showErrorMessage(`保存热键失败: ${error}`)
    }
}

/**
 * 清除指定脚本的热键绑定。
 * @param scriptName 本地脚本名
 * @param silent 是否静默（不提示）
 */
async function clearScriptHotkeyBinding(scriptName: string, silent = false) {
    if (!scriptHotkeyStore.value[scriptName]) return
    const previousConfig = { ...scriptHotkeyStore.value[scriptName] }
    try {
        delete scriptHotkeyStore.value[scriptName]
        await syncScriptHotkeysWithBackend()
        persistScriptHotkeys()
        if (!silent) {
            ui.showSuccessMessage(`已清除热键: ${scriptName}`)
        }
    } catch (error) {
        scriptHotkeyStore.value[scriptName] = previousConfig
        console.error("清除脚本热键失败", error)
        ui.showErrorMessage(`清除热键失败: ${error}`)
    }
}

/**
 * 规范化配置选项列表（去空、去重）。
 * @param options 原始选项
 * @returns 规范化后的选项
 */
function normalizeScriptConfigOptions(options: unknown): string[] {
    if (!Array.isArray(options)) return []
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const option of options) {
        const text = String(option ?? "").trim()
        if (!text || seen.has(text)) continue
        seen.add(text)
        normalized.push(text)
    }
    return normalized
}

/**
 * 判断字符是否为标识符字符。
 * @param char 输入字符
 * @returns 是否是标识符字符
 */
function isIdentifierChar(char: string): boolean {
    return /[A-Za-z0-9_$]/.test(char)
}

/**
 * 从指定位置开始读取字符串字面量结束下标（不含结束下标）。
 * @param source 源代码
 * @param start 字符串起始引号位置
 * @returns 结束下标；未闭合返回 -1
 */
function findStringLiteralEnd(source: string, start: number): number {
    const quote = source[start]
    let index = start + 1
    while (index < source.length) {
        const char = source[index]
        if (char === "\\") {
            index += 2
            continue
        }
        if (char === quote) {
            return index
        }
        index += 1
    }
    return -1
}

/**
 * 从指定位置开始读取行注释结束下标（不含结束下标）。
 * @param source 源代码
 * @param start 注释起始位置（/）
 * @returns 结束下标
 */
function findLineCommentEnd(source: string, start: number): number {
    let index = start + 2
    while (index < source.length && source[index] !== "\n") {
        index += 1
    }
    return index
}

/**
 * 从指定位置开始读取块注释结束下标（不含结束下标）。
 * @param source 源代码
 * @param start 注释起始位置（/）
 * @returns 结束下标；未闭合返回 source.length
 */
function findBlockCommentEnd(source: string, start: number): number {
    const end = source.indexOf("*/", start + 2)
    if (end < 0) return source.length
    return end + 2
}

/**
 * 查找从 openingIndex 开始的括号匹配位置。
 * @param source 源代码
 * @param openingIndex 左括号位置
 * @returns 右括号位置；未匹配返回 -1
 */
function findMatchingParenthesis(source: string, openingIndex: number): number {
    let depth = 0
    let index = openingIndex
    while (index < source.length) {
        const char = source[index]
        const nextChar = source[index + 1]

        if (char === "'" || char === '"' || char === "`") {
            const stringEnd = findStringLiteralEnd(source, index)
            if (stringEnd < 0) return -1
            index = stringEnd + 1
            continue
        }
        if (char === "/" && nextChar === "/") {
            index = findLineCommentEnd(source, index)
            continue
        }
        if (char === "/" && nextChar === "*") {
            index = findBlockCommentEnd(source, index)
            continue
        }

        if (char === "(") depth += 1
        if (char === ")") {
            depth -= 1
            if (depth === 0) return index
            if (depth < 0) return -1
        }
        index += 1
    }
    return -1
}

/**
 * 按顶层逗号拆分函数参数文本。
 * @param argsText 参数整体文本（不含外层括号）
 * @returns 参数列表（已 trim）
 */
function splitTopLevelArguments(argsText: string): string[] {
    const args: string[] = []
    let start = 0
    let depthParen = 0
    let depthBracket = 0
    let depthBrace = 0
    let index = 0

    while (index < argsText.length) {
        const char = argsText[index]
        const nextChar = argsText[index + 1]

        if (char === "'" || char === '"' || char === "`") {
            const stringEnd = findStringLiteralEnd(argsText, index)
            if (stringEnd < 0) {
                args.push(argsText.slice(start).trim())
                return args.filter(arg => arg.length > 0)
            }
            index = stringEnd + 1
            continue
        }
        if (char === "/" && nextChar === "/") {
            index = findLineCommentEnd(argsText, index)
            continue
        }
        if (char === "/" && nextChar === "*") {
            index = findBlockCommentEnd(argsText, index)
            continue
        }

        if (char === "(") depthParen += 1
        else if (char === ")") depthParen -= 1
        else if (char === "[") depthBracket += 1
        else if (char === "]") depthBracket -= 1
        else if (char === "{") depthBrace += 1
        else if (char === "}") depthBrace -= 1
        else if (char === "," && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
            args.push(argsText.slice(start, index).trim())
            start = index + 1
        }

        index += 1
    }

    const tail = argsText.slice(start).trim()
    if (tail) {
        args.push(tail)
    }
    return args
}

/**
 * 在脚本源码中提取所有 readConfig 调用参数。
 * @param source 脚本源码
 * @returns 每个调用的参数字符串数组
 */
function extractReadConfigCalls(source: string): string[][] {
    const calls: string[][] = []
    let index = 0
    const keyword = "readConfig"

    while (index < source.length) {
        const char = source[index]
        const nextChar = source[index + 1]

        if (char === "'" || char === '"' || char === "`") {
            const stringEnd = findStringLiteralEnd(source, index)
            if (stringEnd < 0) break
            index = stringEnd + 1
            continue
        }
        if (char === "/" && nextChar === "/") {
            index = findLineCommentEnd(source, index)
            continue
        }
        if (char === "/" && nextChar === "*") {
            index = findBlockCommentEnd(source, index)
            continue
        }

        if (source.slice(index, index + keyword.length) === keyword) {
            const prevChar = index > 0 ? source[index - 1] : ""
            const afterKeyword = index + keyword.length
            const nextKeywordChar = afterKeyword < source.length ? source[afterKeyword] : ""
            if (isIdentifierChar(prevChar) || isIdentifierChar(nextKeywordChar)) {
                index += keyword.length
                continue
            }

            let cursor = afterKeyword
            while (cursor < source.length && /\s/.test(source[cursor])) {
                cursor += 1
            }
            if (source[cursor] !== "(") {
                index += keyword.length
                continue
            }

            const end = findMatchingParenthesis(source, cursor)
            if (end < 0) {
                index = cursor + 1
                continue
            }

            const argsText = source.slice(cursor + 1, end)
            calls.push(splitTopLevelArguments(argsText))
            index = end + 1
            continue
        }

        index += 1
    }

    return calls
}

/**
 * 解析脚本字面量（仅支持字符串/数字/布尔/null/数组/对象/undefined）。
 * @param text 文本表达式
 * @returns 解析结果
 */
function parseScriptLiteral(text: string): ScriptLiteralParseResult {
    const source = text.trim()
    if (!source) return { ok: false }

    let index = 0

    /**
     * 跳过空白与注释。
     */
    function skipSpacesAndComments() {
        while (index < source.length) {
            const char = source[index]
            const nextChar = source[index + 1]
            if (/\s/.test(char)) {
                index += 1
                continue
            }
            if (char === "/" && nextChar === "/") {
                index = findLineCommentEnd(source, index)
                continue
            }
            if (char === "/" && nextChar === "*") {
                index = findBlockCommentEnd(source, index)
                continue
            }
            break
        }
    }

    /**
     * 解析字符串字面量。
     * @returns 解析后的字符串
     */
    function parseStringValue(): string | undefined {
        const quote = source[index]
        const end = findStringLiteralEnd(source, index)
        if (end < 0) return undefined
        const raw = source.slice(index + 1, end)
        const escaped = raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t")
        let value = raw
        try {
            value = JSON.parse(`"${escaped}"`) as string
        } catch {
            value = raw
        }
        index = end + 1
        if (quote === "`" && value.includes("${")) {
            return undefined
        }
        return value
    }

    /**
     * 解析数字字面量。
     * @returns 数字
     */
    function parseNumberValue(): number | undefined {
        const rest = source.slice(index)
        const match = rest.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+\-]?\d+)?/)
        if (!match) return undefined
        const number = Number(match[0])
        if (!Number.isFinite(number)) return undefined
        index += match[0].length
        return number
    }

    /**
     * 解析数组字面量。
     * @returns 数组值
     */
    function parseArrayValue(): unknown[] | undefined {
        if (source[index] !== "[") return undefined
        index += 1
        const values: unknown[] = []
        skipSpacesAndComments()
        if (source[index] === "]") {
            index += 1
            return values
        }
        while (index < source.length) {
            const value = parseValue()
            if (!value.ok) return undefined
            values.push(value.value)
            skipSpacesAndComments()
            if (source[index] === ",") {
                index += 1
                skipSpacesAndComments()
                if (source[index] === "]") {
                    index += 1
                    return values
                }
                continue
            }
            if (source[index] === "]") {
                index += 1
                return values
            }
            return undefined
        }
        return undefined
    }

    /**
     * 解析对象 key。
     * @returns key 文本
     */
    function parseObjectKey(): string | undefined {
        skipSpacesAndComments()
        const char = source[index]
        if (char === "'" || char === '"' || char === "`") {
            return parseStringValue()
        }
        const rest = source.slice(index)
        const match = rest.match(/^[A-Za-z_$][A-Za-z0-9_$]*/)
        if (!match) return undefined
        index += match[0].length
        return match[0]
    }

    /**
     * 解析对象字面量。
     * @returns 对象值
     */
    function parseObjectValue(): Record<string, unknown> | undefined {
        if (source[index] !== "{") return undefined
        index += 1
        const result: Record<string, unknown> = {}
        skipSpacesAndComments()
        if (source[index] === "}") {
            index += 1
            return result
        }
        while (index < source.length) {
            const key = parseObjectKey()
            if (!key) return undefined
            skipSpacesAndComments()
            if (source[index] !== ":") return undefined
            index += 1
            const value = parseValue()
            if (!value.ok) return undefined
            result[key] = value.value
            skipSpacesAndComments()
            if (source[index] === ",") {
                index += 1
                skipSpacesAndComments()
                if (source[index] === "}") {
                    index += 1
                    return result
                }
                continue
            }
            if (source[index] === "}") {
                index += 1
                return result
            }
            return undefined
        }
        return undefined
    }

    /**
     * 解析单个字面量值。
     * @returns 解析结果
     */
    function parseValue(): ScriptLiteralParseResult {
        skipSpacesAndComments()
        if (index >= source.length) return { ok: false }
        const char = source[index]
        if (char === "'" || char === '"' || char === "`") {
            const value = parseStringValue()
            return value === undefined ? { ok: false } : { ok: true, value }
        }
        if (char === "[") {
            const value = parseArrayValue()
            return value === undefined ? { ok: false } : { ok: true, value }
        }
        if (char === "{") {
            const value = parseObjectValue()
            return value === undefined ? { ok: false } : { ok: true, value }
        }

        const rest = source.slice(index)
        if (rest.startsWith("true")) {
            index += 4
            return { ok: true, value: true }
        }
        if (rest.startsWith("false")) {
            index += 5
            return { ok: true, value: false }
        }
        if (rest.startsWith("null")) {
            index += 4
            return { ok: true, value: null }
        }
        if (rest.startsWith("undefined")) {
            index += 9
            return { ok: true, value: undefined }
        }

        const number = parseNumberValue()
        if (number !== undefined) {
            return { ok: true, value: number }
        }
        return { ok: false }
    }

    const parsed = parseValue()
    if (!parsed.ok) return parsed
    skipSpacesAndComments()
    if (index !== source.length) return { ok: false }
    return parsed
}

/**
 * 解析 readConfig 的 format 字面量。
 * @param formatArg format 参数文本
 * @returns 解析后的配置格式
 */
function parseReadConfigFormat(formatArg?: string): ParsedScriptConfigFormat {
    if (!formatArg || !formatArg.trim()) {
        return { kind: "string", options: [] }
    }

    const parsed = parseScriptLiteral(formatArg)
    if (!parsed.ok) {
        return { kind: "string", options: [] }
    }

    const value = parsed.value
    if (Array.isArray(value)) {
        return { kind: "select", options: normalizeScriptConfigOptions(value) }
    }
    if (typeof value === "string") {
        const raw = value.trim()
        const lower = raw.toLowerCase()
        if (lower === "number") return { kind: "number", options: [] }
        if (lower === "string") return { kind: "string", options: [] }
        if (lower === "boolean" || lower === "bool") return { kind: "boolean", options: [] }
        if (lower === "select") return { kind: "select", options: [] }
        if (lower === "multi-select" || lower === "multiselect" || lower === "multi_select") {
            return { kind: "multi-select", options: [] }
        }
        if (lower.startsWith("select:") || lower.startsWith("multi-select:") || lower.startsWith("multiselect:")) {
            const [prefix, tail = ""] = raw.split(":", 2)
            const separator = tail.includes("|") ? "|" : ","
            const options = normalizeScriptConfigOptions(tail.split(separator))
            const normalizedPrefix = prefix.toLowerCase()
            return {
                kind:
                    normalizedPrefix === "select"
                        ? "select"
                        : normalizedPrefix === "multi-select" || normalizedPrefix === "multiselect"
                          ? "multi-select"
                          : "string",
                options,
            }
        }
        return { kind: "string", options: [] }
    }
    if (value && typeof value === "object") {
        const objectValue = value as { type?: unknown; options?: unknown }
        const typeText = String(objectValue.type ?? "")
            .trim()
            .toLowerCase()
        const options = normalizeScriptConfigOptions(objectValue.options)
        if (typeText === "number") return { kind: "number", options: [] }
        if (typeText === "string") return { kind: "string", options: [] }
        if (typeText === "boolean" || typeText === "bool") return { kind: "boolean", options: [] }
        if (typeText === "select") return { kind: "select", options }
        if (typeText === "multi-select" || typeText === "multiselect" || typeText === "multi_select") {
            return { kind: "multi-select", options }
        }
    }
    return { kind: "string", options: [] }
}

/**
 * 按配置类型规整配置值。
 * @param kind 配置类型
 * @param rawValue 原始值
 * @param defaultValue 默认值
 * @param options select/multi-select 选项
 * @returns 规整后的值
 */
function normalizeScriptConfigValue(
    kind: ScriptConfigKind,
    rawValue: unknown,
    defaultValue: ScriptConfigValue,
    options: string[]
): ScriptConfigValue {
    if (kind === "multi-select") {
        const fallback = Array.isArray(defaultValue) ? defaultValue : []
        const candidates = Array.isArray(rawValue) ? rawValue : rawValue === undefined || rawValue === null ? fallback : [rawValue]
        const seen = new Set<string>()
        const normalized: string[] = []
        for (const candidate of candidates) {
            const text = String(candidate ?? "").trim()
            if (!text || seen.has(text)) continue
            if (options.length > 0 && !options.includes(text)) continue
            seen.add(text)
            normalized.push(text)
        }
        return normalized
    }

    if (kind === "number") {
        const number = typeof rawValue === "number" ? rawValue : Number(rawValue)
        if (Number.isFinite(number)) {
            return number
        }
        return typeof defaultValue === "number" ? defaultValue : 0
    }
    if (kind === "boolean") {
        if (typeof rawValue === "boolean") return rawValue
        if (typeof rawValue === "number") return rawValue !== 0
        const text = String(rawValue ?? "")
            .trim()
            .toLowerCase()
        return ["1", "true", "yes", "y", "on"].includes(text)
    }

    const text = String(rawValue ?? "")
    if (kind === "select" && options.length > 0) {
        if (options.includes(text)) {
            return text
        }
        if (typeof defaultValue === "string" && options.includes(defaultValue)) {
            return defaultValue
        }
        return options[0]
    }
    return text
}

/**
 * 获取 multi-select 当前值（始终返回数组）。
 * @param item 配置项
 * @returns 规整后的已选值数组
 */
function getScriptConfigMultiSelectValues(item: ScriptConfigItem): string[] {
    return normalizeScriptConfigValue("multi-select", item.value, item.defaultValue, item.options) as string[]
}

/**
 * 判断 multi-select 选项是否已勾选。
 * @param item 配置项
 * @param option 选项值
 * @returns 是否已勾选
 */
function isScriptConfigMultiSelectOptionChecked(item: ScriptConfigItem, option: string): boolean {
    return getScriptConfigMultiSelectValues(item).includes(option)
}

/**
 * 获取 multi-select 选项在已选列表中的顺序索引。
 * @param item 配置项
 * @param option 选项值
 * @returns 索引（未选中时为 -1）
 */
function getScriptConfigMultiSelectOptionIndex(item: ScriptConfigItem, option: string): number {
    return getScriptConfigMultiSelectValues(item).indexOf(option)
}

/**
 * 获取 multi-select 渲染顺序（已选项按当前值顺序排列，未选项保留在后方）。
 * @param item 配置项
 * @returns 用于界面渲染的选项顺序
 */
function getScriptConfigMultiSelectDisplayOptions(item: ScriptConfigItem): string[] {
    const normalizedOptions = normalizeScriptConfigOptions(item.options)
    if (normalizedOptions.length === 0) return []

    const selectedValues = getScriptConfigMultiSelectValues(item)
    if (selectedValues.length === 0) return normalizedOptions

    const availableOptionSet = new Set(normalizedOptions)
    const selectedOrdered = selectedValues.filter(option => availableOptionSet.has(option))
    const selectedSet = new Set(selectedOrdered)
    const unselected = normalizedOptions.filter(option => !selectedSet.has(option))

    return [...selectedOrdered, ...unselected]
}

/**
 * 持久化脚本配置项。
 */
function persistScriptConfigItems() {
    localStorage.setItem(SCRIPT_CONFIG_STORAGE_KEY, JSON.stringify(scriptConfigStore.value))
}

/**
 * 从本地存储加载脚本配置项。
 */
function loadScriptConfigItems() {
    const stored = localStorage.getItem(SCRIPT_CONFIG_STORAGE_KEY)
    if (!stored) {
        scriptConfigStore.value = {}
        return
    }

    try {
        const parsed = JSON.parse(stored) as Record<string, Record<string, Partial<ScriptConfigItem>>>
        const normalizedStore: Record<string, Record<string, ScriptConfigItem>> = {}
        for (const [scope, items] of Object.entries(parsed ?? {})) {
            const normalizedScope = normalizeScriptConfigScope(scope)
            if (!normalizedScope || !items || typeof items !== "object") continue
            const scopeKey =
                Object.keys(normalizedStore).find(key => key.toLowerCase() === normalizedScope.toLowerCase()) ?? normalizedScope
            const scopeItems: Record<string, ScriptConfigItem> = {
                ...(normalizedStore[scopeKey] ?? {}),
            }
            for (const [name, item] of Object.entries(items as Record<string, Partial<ScriptConfigItem>>)) {
                if (!item || typeof item !== "object") continue
                const normalizedName = String(name ?? "").trim()
                if (!normalizedName) continue
                const kind: ScriptConfigKind = ["number", "string", "select", "multi-select", "boolean"].includes(String(item.kind))
                    ? (item.kind as ScriptConfigKind)
                    : "string"
                const options = normalizeScriptConfigOptions(item.options)
                const fallbackDefaultValue: ScriptConfigValue =
                    kind === "number" ? 0 : kind === "boolean" ? false : kind === "multi-select" ? [] : ""
                const defaultValue = normalizeScriptConfigValue(kind, item.defaultValue, fallbackDefaultValue, options)
                const value = normalizeScriptConfigValue(kind, item.value, defaultValue, options)
                scopeItems[normalizedName] = {
                    name: normalizedName,
                    desc: String(item.desc ?? ""),
                    kind,
                    options,
                    value,
                    defaultValue,
                    updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
                }
            }
            normalizedStore[scopeKey] = scopeItems
        }
        scriptConfigStore.value = normalizedStore
        for (const scope of Object.keys(scriptConfigStore.value)) {
            ensureRuntimeTimeoutConfigItem(scope)
        }
    } catch (error) {
        console.error("加载脚本配置失败", error)
        scriptConfigStore.value = {}
    }
}

/**
 * 根据 readConfig 请求创建或更新配置项，并返回当前值。
 * @param payload readConfig 事件负载
 * @returns 当前配置值
 */
function upsertScriptConfigFromRequest(payload: ScriptReadConfigPayload): ScriptConfigValue {
    const scope = resolveStoredScriptConfigScope(payload.scope ?? activeTab.value?.name ?? activeConfigScope.value)
    const normalizedName = String(payload.name ?? "").trim()
    const kind: ScriptConfigKind = ["number", "string", "select", "multi-select", "boolean"].includes(String(payload.kind))
        ? payload.kind
        : "string"
    const options = normalizeScriptConfigOptions(payload.options)
    const fallbackDefaultValue: ScriptConfigValue = kind === "number" ? 0 : kind === "boolean" ? false : kind === "multi-select" ? [] : ""
    const defaultValue = normalizeScriptConfigValue(kind, payload.defaultValue, fallbackDefaultValue, options)
    if (!scope || !normalizedName) {
        return defaultValue
    }
    const scopedItems = scriptConfigStore.value[scope] ?? {}
    const existing = scopedItems[normalizedName]
    const nextValue = normalizeScriptConfigValue(kind, existing?.value ?? defaultValue, defaultValue, options)
    const merged: ScriptConfigItem = {
        name: normalizedName,
        desc: String(payload.desc ?? existing?.desc ?? ""),
        kind,
        options,
        defaultValue,
        value: nextValue,
        updatedAt: Date.now(),
    }
    scriptConfigStore.value[scope] = {
        ...scopedItems,
        [normalizedName]: merged,
    }
    activeConfigScope.value = scope
    persistScriptConfigItems()
    return merged.value
}

/**
 * 处理脚本 setConfig 事件并更新已存在的配置项。
 * @param payload setConfig 事件负载
 * @returns 是否成功更新
 */
function applyScriptSetConfigFromEvent(payload: ScriptSetConfigPayload): boolean {
    const scope = resolveStoredScriptConfigScope(payload.scope ?? activeTab.value?.name ?? activeConfigScope.value)
    const normalizedName = String(payload.name ?? "").trim()
    if (!scope || !normalizedName) {
        return false
    }

    const scopedItems = scriptConfigStore.value[scope]
    if (!scopedItems) {
        return false
    }
    const matchedName = Object.keys(scopedItems).find(key => key.toLowerCase() === normalizedName.toLowerCase()) ?? normalizedName
    const item = scopedItems[matchedName]
    if (!item) {
        return false
    }

    item.value = normalizeScriptConfigValue(item.kind, payload.value, item.defaultValue, item.options)
    item.updatedAt = Date.now()
    activeConfigScope.value = scope
    persistScriptConfigItems()
    return true
}

/**
 * 更新配置值并持久化。
 * @param name 配置名
 * @param value 新值
 */
function updateScriptConfigValue(name: string, value: unknown) {
    const normalizedName = String(name ?? "").trim()
    if (!normalizedName) return

    const scope = currentConfigScope.value
    if (!scope) return

    const item = scriptConfigStore.value[scope]?.[normalizedName]
    if (!item) return
    item.value = normalizeScriptConfigValue(item.kind, value, item.defaultValue, item.options)
    item.updatedAt = Date.now()
    persistScriptConfigItems()
}

/**
 * 切换 multi-select 选项勾选状态。
 * @param name 配置名
 * @param option 选项值
 * @param checked 是否勾选
 */
function toggleScriptConfigMultiSelectOption(name: string, option: string, checked: boolean) {
    const scope = currentConfigScope.value
    if (!scope) return
    const item = scriptConfigStore.value[scope]?.[name]
    if (!item || item.kind !== "multi-select") return

    const currentValues = getScriptConfigMultiSelectValues(item)
    const nextValues = checked ? [...currentValues, option] : currentValues.filter(value => value !== option)
    updateScriptConfigValue(name, nextValues)
}

/**
 * 调整 multi-select 已选项顺序。
 * @param name 配置名
 * @param option 目标选项
 * @param direction 方向（-1 上移，1 下移）
 */
function moveScriptConfigMultiSelectOption(name: string, option: string, direction: -1 | 1) {
    const scope = currentConfigScope.value
    if (!scope) return
    const item = scriptConfigStore.value[scope]?.[name]
    if (!item || item.kind !== "multi-select") return

    const currentValues = getScriptConfigMultiSelectValues(item)
    const index = currentValues.indexOf(option)
    if (index < 0) return
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= currentValues.length) return

    const nextValues = [...currentValues]
    ;[nextValues[index], nextValues[targetIndex]] = [nextValues[targetIndex], nextValues[index]]
    updateScriptConfigValue(name, nextValues)
}

/**
 * 删除配置项并持久化。
 * @param name 配置名
 */
function deleteScriptConfigItem(name: string) {
    const normalizedName = String(name ?? "").trim()
    if (!normalizedName) return
    const scope = currentConfigScope.value
    if (!scope) return
    if (!scriptConfigStore.value[scope]?.[normalizedName]) return
    delete scriptConfigStore.value[scope][normalizedName]
    if (Object.keys(scriptConfigStore.value[scope]).length === 0) {
        delete scriptConfigStore.value[scope]
        if (activeConfigScope.value === scope) {
            activeConfigScope.value = ""
        }
    }
    persistScriptConfigItems()
    ensureRuntimeTimeoutConfigItem(scope, true)
}

/**
 * 按作用域删除全部脚本配置并持久化。
 * @param scope 配置作用域（本地脚本文件名）
 */
function removeScriptConfigScope(scope: string) {
    const normalizedScope = normalizeScriptConfigScope(scope)
    if (!normalizedScope) return
    const matchedScopes = Object.keys(scriptConfigStore.value).filter(
        key => normalizeScriptConfigScope(key).toLowerCase() === normalizedScope.toLowerCase()
    )
    if (matchedScopes.length === 0) return
    for (const matchedScope of matchedScopes) {
        delete scriptConfigStore.value[matchedScope]
    }
    if (normalizeScriptConfigScope(activeConfigScope.value).toLowerCase() === normalizedScope.toLowerCase()) {
        activeConfigScope.value = ""
    }
    persistScriptConfigItems()
}

/**
 * 清空当前作用域下的全部脚本配置项。
 */
function clearAllScriptConfigItems() {
    const scope = currentConfigScope.value
    removeScriptConfigScope(scope)
    ensureRuntimeTimeoutConfigItem(scope, true)
}

/**
 * 打开右侧面板并切换到指定标签页。
 * @param tab 目标标签
 */
function openSidePanel(tab: ScriptRuntimeSidePanelTab) {
    if (showStatusPanel.value && sidePanelTab.value === tab) {
        showStatusPanel.value = false
        return
    }
    sidePanelTab.value = tab
    showStatusPanel.value = true
}

/**
 * 在脚本启动时展示运行调试面板（仅启动时切换一次）。
 */
function activateRuntimeDebugPanelOnStart() {
    sidePanelTab.value = "status"
    showStatusPanel.value = true
    showConsole.value = true
}

/**
 * 若指定脚本已有配置项，则默认展示脚本配置面板。
 * @param fileName 本地脚本文件名（配置作用域）
 */
function showConfigPanelIfScriptHasConfig(fileName: string) {
    const scope = resolveStoredScriptConfigScope(fileName)
    if (!scope) return
    const hasConfig = Object.keys(scriptConfigStore.value[scope] ?? {}).length > 0
    if (!hasConfig) return
    activeConfigScope.value = scope
    sidePanelTab.value = "config"
    showStatusPanel.value = true
}

/**
 * 预解析脚本源码中的 readConfig 调用并创建配置项（不执行脚本）。
 * @param scope 配置作用域（脚本文件名）
 * @param source 脚本源码
 * @returns 预解析结果统计
 */
function preparseScriptConfigFromSource(scope: string, source: string): ScriptConfigPreparseSummary {
    const normalizedScope = resolveStoredScriptConfigScope(scope)
    if (!normalizedScope) {
        return { createdCount: 0, skippedCount: 0 }
    }

    const calls = extractReadConfigCalls(source)
    if (calls.length === 0) {
        return { createdCount: 0, skippedCount: 0 }
    }

    let createdCount = 0
    let skippedCount = 0
    const requestPrefix = `preparse_${Date.now()}`

    for (let index = 0; index < calls.length; index += 1) {
        const args = calls[index]
        const nameParsed = parseScriptLiteral(args[0] ?? "")
        if (!nameParsed.ok || typeof nameParsed.value !== "string" || !nameParsed.value.trim()) {
            skippedCount += 1
            continue
        }

        const descParsed = parseScriptLiteral(args[1] ?? "")
        const desc = descParsed.ok && typeof descParsed.value === "string" ? descParsed.value : ""
        const format = parseReadConfigFormat(args[2] ?? "")

        const fallbackDefaultValue: ScriptConfigValue =
            format.kind === "number" ? 0 : format.kind === "boolean" ? false : format.kind === "multi-select" ? [] : ""
        const defaultParsed = parseScriptLiteral(args[3] ?? "")
        const defaultValue = normalizeScriptConfigValue(
            format.kind,
            defaultParsed.ok ? defaultParsed.value : fallbackDefaultValue,
            fallbackDefaultValue,
            format.options
        )

        upsertScriptConfigFromRequest({
            requestId: `${requestPrefix}_${index}`,
            scope: normalizedScope,
            name: nameParsed.value.trim(),
            desc,
            kind: format.kind,
            options: format.options,
            defaultValue,
        })
        createdCount += 1
    }

    activeConfigScope.value = normalizedScope
    return { createdCount, skippedCount }
}

/**
 * 判断云端脚本是否已存在于本地。
 * @param script 云端脚本
 * @returns 是否存在同名本地脚本
 */
function isOnlineScriptExistsLocal(script: Script): boolean {
    const fileName = getScriptFileNameByTitle(script.title)
    return localScripts.value.includes(fileName)
}

/**
 * 云端覆盖下载后同步已打开的本地标签页内容。
 * @param fileName 本地脚本文件名
 * @param content 覆盖后的脚本内容
 */
async function syncOpenedLocalTabAfterCloudUpdate(fileName: string, content: string) {
    const tab = openedTabs.value.find(item => item.type === "local" && item.name === fileName)
    if (!tab) return

    tab.content = content
    tab.modified = false
    await startWatchingFile(fileName)
    if (activeTabId.value === tab.id) {
        nextTick(() => {
            codeEditor.value?.safeUpdate(content)
        })
    }
}

/**
 * 监听脚本 readConfig 请求事件，创建配置 UI 并回传当前值。
 */
async function initScriptConfigListener() {
    try {
        unlistenScriptConfigFn = await listen<ScriptReadConfigPayload>("script-read-config", async event => {
            const payload = event.payload
            if (!payload?.requestId || !payload?.name) return
            if (shouldAcceptScopedScriptEvent(payload.scope)) {
                touchScriptRuntimeEvent()
            }
            const value = upsertScriptConfigFromRequest(payload)
            try {
                await resolveScriptConfigRequest(payload.requestId, value)
            } catch (error) {
                console.error("回传脚本配置失败", error)
            }
        })
    } catch (error) {
        console.error("监听脚本配置事件失败", error)
    }
}

/**
 * 监听脚本 setConfig 事件并更新前端配置存储。
 */
async function initScriptSetConfigListener() {
    try {
        unlistenScriptSetConfigFn = await listen<ScriptSetConfigPayload>("script-set-config", event => {
            const payload = event.payload
            if (!payload?.name) return
            if (shouldAcceptScopedScriptEvent(payload.scope)) {
                touchScriptRuntimeEvent()
            }
            applyScriptSetConfigFromEvent(payload)
        })
    } catch (error) {
        console.error("监听脚本 setConfig 事件失败", error)
    }
}

/**
 * 从后端同步脚本运行状态，确保页面刷新后仍可停止脚本。
 */
async function syncRunningStateFromBackend(appendDetectedLog = true) {
    try {
        const wasRunning = scriptRuntime.isRunning
        await scriptRuntime.syncRunningStateFromBackend()
        if (scriptRuntime.isRunning) {
            touchScriptRuntimeEvent()
            showConsole.value = true
        }
        if (!appendDetectedLog || wasRunning || !scriptRuntime.isRunning) {
            return
        }

        const runningLabel = scriptRuntime.runningScriptPaths.map(path => getScriptFileNameFromPath(path) || path).join(", ")
        const suffix = scriptRuntime.runningScriptCount > 1 ? `（共 ${scriptRuntime.runningScriptCount} 个运行实例）` : ""
        addConsoleLog("info", `检测到后端仍有脚本在运行: ${runningLabel}${suffix}，可点击停止按钮中断`)
    } catch (error) {
        console.error("同步脚本运行状态失败", error)
    }
}

/**
 * 检测脚本源码是否包含高风险函数调用。
 * @param source 脚本源码
 * @returns 是否命中 eval / dllCall 调用
 */
function hasHighRiskScriptOperation(source: string): boolean {
    const highRiskCallPatterns = [/\beval\s*\(/, /\bdllCall\s*\(/]
    return highRiskCallPatterns.some(pattern => pattern.test(source))
}

async function downloadScript(script: Script) {
    try {
        const fileName = getScriptFileNameByTitle(script.title)
        const filePath = `${scriptsDir.value}\\${fileName}`
        const isUpdate = localScripts.value.includes(fileName)
        const result = await scriptQuery(
            {
                id: script.id,
            },
            { requestPolicy: "network-only" }
        )
        if (!result) {
            throw new Error("获取脚本内容失败")
        }
        if (hasHighRiskScriptOperation(result.content)) {
            const confirmed = await ui.showDialog("高风险操作警告", "此脚本包含高风险操作 请在信任脚本作者的情况下使用")
            if (!confirmed) {
                return
            }
        }
        await writeTextFile(filePath, result.content)
        await syncOpenedLocalTabAfterCloudUpdate(fileName, result.content)
        const summary = preparseScriptConfigFromSource(fileName, result.content)
        const actionText = isUpdate ? "已更新" : "已下载"
        const parseText =
            summary.createdCount > 0
                ? `，预解析 ${summary.createdCount} 项${summary.skippedCount > 0 ? `（跳过 ${summary.skippedCount} 项）` : ""}`
                : "，未解析到可用 readConfig 字面量"
        ui.showSuccessMessage(`${actionText}: ${fileName}${parseText}`)
        await fetchLocalScripts()
        await openLocalScript(fileName)
    } catch (error) {
        console.error("下载脚本失败", error)
        ui.showErrorMessage("下载/更新脚本失败，请重试")
    }
}

async function openScriptDirectory() {
    try {
        await openExplorer(scriptsDir.value)
    } catch (error) {
        console.error("打开目录失败", error)
        ui.showErrorMessage("打开目录失败，请重试")
    }
}

/**
 * 打开图色工具页面。
 */
function openColorToolPage() {
    router.push({ name: "script-color-tool" })
}

/**
 * 打开录制工具页面。
 */
function openRecordToolPage() {
    router.push({ name: "script-record-tool" })
}

async function saveCurrentTab() {
    if (!activeTab.value) return
    try {
        const filePath = `${scriptsDir.value}\\${activeTab.value.name}`
        const newContent = replaceScriptHeader(activeTab.value.content, { name: activeTab.value.name.slice(0, -3) })
        activeTab.value.content = newContent
        activeTab.value.modified = false
        codeEditor.value?.safeUpdate(newContent)
        await writeTextFile(filePath, newContent)
        // 保存后重新监听文件变化
        await startWatchingFile(activeTab.value.name)
    } catch (error) {
        console.error("保存失败", error)
        ui.showErrorMessage(`保存失败: ${error}`)
    }
}

function setActiveTab(tabId: string) {
    activeTabId.value = tabId
    const tab = activeTab.value
    if (tab) {
        nextTick(() => {
            codeEditor.value?.safeUpdate(tab.content)
        })
    }
}

async function runCurrentTab() {
    if (viewMode.value === "scheduler") {
        if (isSchedulerRunning.value) {
            try {
                scriptRuntime.requestSchedulerStop()
                await scriptRuntime.stopAllScripts()
                addConsoleLog("info", "调度器停止请求已发送")
            } catch (error) {
                console.error("停止调度器失败", error)
                ui.showErrorMessage("停止调度器失败，请重试")
            }
            return
        }
        await runScheduler()
        return
    }

    if (!activeTab.value) return
    if (activeTab.value.type === "online") {
        ui.showErrorMessage("请先下载脚本")
        return
    }
    if (isLocalScriptRunning(activeTab.value.name)) {
        await stopLocalScriptByName(activeTab.value.name)
        return
    }

    try {
        scriptRuntime.clearScriptStatuses()
        activateRuntimeDebugPanelOnStart()
        await runLocalScriptByName(activeTab.value.name)
    } catch (error) {
        console.error("运行脚本失败", error)
        ui.showErrorMessage("运行脚本失败，请重试")
        addConsoleLog("error", `运行脚本失败: ${error}`)
    } finally {
        scriptRuntime.clearSchedulerStopRequest()
        await syncRunningStateFromBackend(false)
    }
}

function openNewScriptDialog() {
    newScriptName.value = ""
    newScriptContent.value = DEFAULT_SCRIPT_CONTENT
    showNewScriptDialog.value = true
}

async function createNewScript() {
    if (!newScriptName.value.trim()) {
        ui.showErrorMessage("请输入脚本名称")
        return
    }

    try {
        const fileName = `${newScriptName.value.trim()}.js`
        const filePath = `${scriptsDir.value}\\${fileName}`

        await writeTextFile(filePath, newScriptContent.value)
        ui.showSuccessMessage(`脚本已创建: ${filePath}`)
        showNewScriptDialog.value = false
        await fetchLocalScripts()
        await openLocalScript(fileName)
    } catch (error) {
        console.error("创建脚本失败", error)
        ui.showErrorMessage("创建脚本失败，请重试")
    }
}

/**
 * 添加控制台日志
 */
function addConsoleLog(level: string, message: string) {
    scriptRuntime.appendConsoleLog(level, message)
    // 自动滚动到底部
    nextTick(() => {
        const consoleContainer = document.getElementById("console-output")
        if (consoleContainer) {
            consoleContainer.scrollTop = consoleContainer.scrollHeight
        }
    })
}

/**
 * 清空控制台
 */
function clearConsole() {
    scriptRuntime.clearConsoleLogs()
}

/**
 * 获取日志级别对应的样式类
 */
function getLogLevelClass(level: string): string {
    switch (level) {
        case "error":
            return "text-error"
        case "warn":
            return "text-warning"
        case "info":
            return "text-info"
        case "debug":
            return "text-base-content/60"
        default:
            return "text-base-content"
    }
}

/**
 * 监听 Tauri 控制台事件
 */
async function initConsoleListener() {
    try {
        unlistenConsoleFn = await listen<{ scope?: string; level: string; message: string }>("script-console", event => {
            const { scope, level, message } = event.payload
            if (!shouldAcceptScopedScriptEvent(scope)) return
            touchScriptRuntimeEvent()
            addConsoleLog(level, message)
        })
    } catch (error) {
        console.error("监听控制台事件失败", error)
    }
}

/**
 * 监听脚本状态事件（文字/图片）
 */
async function initStatusListener() {
    try {
        unlistenStatusFn = await listen<{
            scope?: string
            action?: "upsert" | "remove"
            title?: string
            text?: string
            image?: string
            images?: string[]
            timestamp?: number
        }>("script-status", event => {
            const { scope, action, title, text, image, images, timestamp } = event.payload ?? {}
            if (!shouldAcceptScopedScriptEvent(scope)) return
            const normalizedTitle = title?.trim()
            if (!normalizedTitle) return
            touchScriptRuntimeEvent()

            const normalizedImages = Array.isArray(images) ? images.filter(item => typeof item === "string" && item.trim().length > 0) : []
            const normalizedImage = typeof image === "string" && image.trim().length > 0 ? image : undefined
            if (normalizedImages.length === 0 && normalizedImage) {
                normalizedImages.push(normalizedImage)
            }

            if (action === "remove" || (!text && normalizedImages.length === 0)) {
                scriptRuntime.removeScriptStatus(normalizedTitle)
                return
            }

            const nextItem: ScriptStatusItem = {
                title: normalizedTitle,
                text,
                image: normalizedImages[0],
                images: normalizedImages,
                timestamp: timestamp ?? Date.now(),
            }
            scriptRuntime.upsertScriptStatus(nextItem)
        })
    } catch (error) {
        console.error("监听脚本状态事件失败", error)
    }
}

/**
 * 切换右侧状态栏显示
 */
function toggleStatusPanel() {
    openSidePanel("status")
}

/**
 * 清除指定标题的脚本状态（仅前端显示层）。
 */
function clearStatus(title: string) {
    scriptRuntime.removeScriptStatus(title)
}

/**
 * 清空全部脚本状态（仅前端显示层）。
 */
function clearAllStatus() {
    scriptRuntime.clearScriptStatuses()
}

/**
 * 监听文件变化事件
 */
async function initFileChangeListener() {
    try {
        unlistenFileChangedFn = await listen<string>("file-changed", event => {
            const filePath = event.payload
            const fileName = filePath.split("\\").pop() || ""
            reloadFileContent(fileName)
        })
    } catch (error) {
        console.error("监听文件变化事件失败", error)
    }
}

/**
 * 开始编辑脚本名称
 * @param fileName 当前文件名
 */
function startEditScript(fileName: string) {
    if (startEditScriptTimer) {
        clearTimeout(startEditScriptTimer)
        startEditScriptTimer = null
    }
    // 先隐藏输入框，等待右键菜单关闭后再进入编辑态，避免瞬时 blur。
    editingScript.value = null
    editingScriptName.value = fileName.replace(/\.js$/, "")
    startEditScriptTimer = setTimeout(() => {
        editingScript.value = fileName
        nextTick(() => {
            const elm = document.getElementById("script-name-input") as HTMLInputElement
            elm?.focus()
            elm?.select()
        })
        startEditScriptTimer = null
    }, 120)
}

/**
 * 确认重命名脚本
 */
async function confirmRenameScript() {
    if (!editingScript.value || renamingScriptInFlight.value) return

    const newName = editingScriptName.value.trim()
    if (!newName) {
        ui.showErrorMessage("请输入脚本名称")
        return
    }

    const oldFileName = editingScript.value
    const newFileName = `${newName}.js`

    if (newFileName === oldFileName) {
        editingScript.value = null
        return
    }

    // 先退出编辑态并锁定重命名流程，避免 Enter + blur 导致重复提交。
    editingScript.value = null
    renamingScriptInFlight.value = true

    try {
        const oldPath = `${scriptsDir.value}\\${oldFileName}`
        const newPath = `${scriptsDir.value}\\${newFileName}`

        await renameFile(oldPath, newPath)
        ui.showSuccessMessage("重命名成功")

        // 如果该文件已打开，更新标签页名称
        const tab = openedTabs.value.find(t => t.type === "local" && t.name === oldFileName)
        if (tab) {
            tab.name = newFileName
            tab.id = `local_${newFileName}`
            if (activeTabId.value === `local_${oldFileName}`) {
                activeTabId.value = tab.id
            }
        }

        // 同步热键绑定（旧文件名迁移到新文件名）。
        const oldHotkey = scriptHotkeyStore.value[oldFileName]
        if (oldHotkey) {
            delete scriptHotkeyStore.value[oldFileName]
            scriptHotkeyStore.value[newFileName] = oldHotkey
            await syncScriptHotkeysWithBackend()
            persistScriptHotkeys()
        }

        await fetchLocalScripts()
    } catch (error) {
        console.error("重命名失败", error)
        ui.showErrorMessage("重命名失败，请重试")
    } finally {
        renamingScriptInFlight.value = false
    }
}

/**
 * 取消编辑脚本名称
 */
function cancelEditScript() {
    if (startEditScriptTimer) {
        clearTimeout(startEditScriptTimer)
        startEditScriptTimer = null
    }
    editingScript.value = null
    editingScriptName.value = ""
}

/**
 * 处理编辑时的键盘事件
 * @param e 键盘事件
 */
function handleEditKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
        e.preventDefault()
        confirmRenameScript()
    } else if (e.key === "Escape") {
        e.preventDefault()
        cancelEditScript()
    }
}

/**
 * 删除脚本
 * @param fileName 文件名
 */
async function deleteScript(fileName: string) {
    // 检查是否有打开的标签页
    const tab = openedTabs.value.find(t => t.type === "local" && t.name === fileName)
    if (tab) {
        await closeTab(tab.id)
    }

    try {
        const filePath = `${scriptsDir.value}\\${fileName}`

        await deleteFile(filePath)
        removeScriptConfigScope(fileName)
        await clearScriptHotkeyBinding(fileName, true)
        ui.showSuccessMessage("文件已移动到回收站")
        await fetchLocalScripts()
    } catch (error) {
        console.error("删除失败", error)
        ui.showErrorMessage("删除失败，请重试")
    }
}

async function deleteOnlineScript(script: Script) {
    try {
        const result = await deleteScriptMutation({ id: script.id })
        if (result) {
            ui.showSuccessMessage("脚本已删除")
            await fetchOnlineScripts()
        }
    } catch (error) {
        console.error("删除失败", error)
        ui.showErrorMessage("删除失败，请重试")
    }
}

function switchToLocal() {
    viewMode.value = "local"
    fetchLocalScripts()
}

/**
 * 切换到调度器视图。
 */
function switchToScheduler() {
    viewMode.value = "scheduler"
}

function switchToOnline() {
    viewMode.value = "online"
    fetchOnlineScripts()
}

/**
 * 打开本地脚本并可选地默认展示其配置面板。
 * @param fileName 本地脚本文件名
 * @param options 打开行为选项
 */
async function openLocalScript(fileName: string, options: OpenLocalScriptOptions = {}) {
    const { preferConfigPanel = true } = options
    const existingTab = openedTabs.value.find(tab => tab.type === "local" && tab.name === fileName)
    if (existingTab) {
        setActiveTab(existingTab.id)
        if (preferConfigPanel) {
            showConfigPanelIfScriptHasConfig(fileName)
        }
        return
    }

    const content = await loadLocalScriptContent(fileName)
    const newTab: OpenedTab = {
        id: `local_${fileName}`,
        name: fileName,
        type: "local",
        content,
        modified: false,
    }
    openedTabs.value.push(newTab)
    setActiveTab(newTab.id)
    if (preferConfigPanel) {
        showConfigPanelIfScriptHasConfig(fileName)
    }

    // 开始监听文件变化
    await startWatchingFile(fileName)
}

async function openOnlineScript(script: Script) {
    const fileName = getScriptFileNameByTitle(script.title)
    const existingTab = openedTabs.value.find(tab => tab.type === "online" && tab.name === fileName)
    if (existingTab) {
        try {
            const latest = await scriptQuery({ id: script.id }, { requestPolicy: "network-only" })
            if (latest) {
                existingTab.content = latest.content
                existingTab.modified = false
            }
        } catch (error) {
            console.error("刷新在线脚本内容失败", error)
        }
        setActiveTab(existingTab.id)
        return
    }
    const result = await scriptQuery({ id: script.id }, { requestPolicy: "network-only" })
    if (!result) {
        ui.showErrorMessage("获取脚本内容失败")
        return
    }
    const newTab: OpenedTab = {
        id: `online_${script.id}`,
        name: fileName,
        type: "online",
        content: result.content,
        modified: false,
    }
    openedTabs.value.push(newTab)
    setActiveTab(newTab.id)
}

async function closeTab(tabId: string) {
    const index = openedTabs.value.findIndex(tab => tab.id === tabId)
    if (index === -1) return

    const tab = openedTabs.value[index]
    if (tab.modified) {
        if (!(await ui.showDialog("确认关闭", "文件已修改，确定要关闭吗？"))) {
            return
        }
    }

    // 如果是本地文件，停止监听
    if (tab.type === "local") {
        await stopWatchingFile(tab.name)
    }

    openedTabs.value.splice(index, 1)
    if (activeTabId.value === tabId) {
        if (openedTabs.value.length > 0) {
            const newIndex = Math.min(index, openedTabs.value.length - 1)
            setActiveTab(openedTabs.value[newIndex].id)
        } else {
            activeTabId.value = null
        }
    }
}

async function closeOtherTabs(tabId: string) {
    const tab = openedTabs.value.find(t => t.id === tabId)
    if (!tab) return

    const hasUnsaved = openedTabs.value.some(t => t.id !== tabId && t.modified)
    if (hasUnsaved && !confirm("其他文件有未保存的修改，确定要关闭吗？")) {
        return
    }

    // 停止其他标签的文件监听
    const stopPromises = openedTabs.value.filter(t => t.id !== tabId && t.type === "local").map(t => stopWatchingFile(t.name))
    await Promise.all(stopPromises)

    openedTabs.value = [tab]
    activeTabId.value = tabId
}

async function closeAllTabs() {
    const hasUnsaved = openedTabs.value.some(t => t.modified)
    if (hasUnsaved && !confirm("有文件未保存，确定要关闭所有标签吗？")) {
        return
    }

    // 停止所有文件监听
    const stopPromises = openedTabs.value.filter(tab => tab.type === "local").map(tab => stopWatchingFile(tab.name))
    await Promise.all(stopPromises)

    openedTabs.value = []
    activeTabId.value = null
}

/**
 * 开始监听文件变化
 */
async function startWatchingFile(fileName: string) {
    const filePath = `${scriptsDir.value}\\${fileName}`

    // 如果已经在监听，则不重复监听
    if (watchedFiles.value.has(fileName)) {
        return
    }

    try {
        await watchFile(filePath)
        watchedFiles.value.add(fileName)
    } catch (error) {
        console.error("监听文件失败", error)
    }
}

/**
 * 停止监听文件变化
 */
async function stopWatchingFile(fileName: string) {
    const filePath = `${scriptsDir.value}\\${fileName}`

    try {
        await unwatchFile(filePath)
        watchedFiles.value.delete(fileName)
    } catch (error) {
        console.error("停止监听文件失败", error)
    }
}
function onCodeEditorUpdate(code: string) {
    if (!activeTab.value || activeTab.value.type !== "local") return
    activeTab.value.content = code
    activeTab.value.modified = true
    // 变化后停止监听
    stopWatchingFile(activeTab.value.name)
}

/**
 * 重新加载文件内容
 */
async function reloadFileContent(fileName: string) {
    const tab = openedTabs.value.find(t => t.type === "local" && t.name === fileName)
    if (!tab) return

    try {
        const content = await loadLocalScriptContent(fileName)
        tab.content = content
        tab.modified = false
        nextTick(() => {
            codeEditor.value?.safeUpdate(content)
        })
    } catch (error) {
        console.error("重新加载文件失败", error)
    }
}

/**
 * 发布或更新脚本
 * @param fileName 本地脚本文件名
 */
async function publishScript(fileName: string) {
    if (publishingScript.value) return

    publishingScript.value = true
    try {
        const content = await loadLocalScriptContent(fileName)
        const header = parseScriptHeader(content)
        const scriptId = header.id

        const scriptInput = {
            title: header.name || fileName.replace(/\.js$/, ""),
            description: header.desc || "",
            content: content,
            category: header.category || "其他",
        }

        let result
        if (scriptId && scriptId !== "-") {
            result = await updateScriptMutation({
                id: scriptId,
                input: scriptInput,
            })
            if (result) {
                ui.showSuccessMessage("脚本更新成功")
            }
        } else {
            result = await createScriptMutation({
                input: scriptInput,
            })
            ui.showSuccessMessage("脚本发布成功")

            if (result) {
                const newHeader = replaceScriptHeader(content, {
                    id: result.id,
                    name: header.name || fileName.replace(/\.js$/, ""),
                    desc: header.desc || "",
                    author: result.user?.name || "",
                })

                const filePath = `${scriptsDir.value}\\${fileName}`
                await writeTextFile(filePath, newHeader)

                const tab = openedTabs.value.find(t => t.type === "local" && t.name === fileName)
                if (tab) {
                    tab.content = newHeader
                    nextTick(() => {
                        codeEditor.value?.safeUpdate(newHeader)
                    })
                }
            }
        }
    } catch (error) {
        console.error("发布/更新脚本失败", error)
        ui.showErrorMessage("发布/更新脚本失败，请重试")
    } finally {
        publishingScript.value = false
    }
}

function handleKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === "s") {
        e.preventDefault()
        saveCurrentTab()
    } else if (e.ctrlKey && e.key === "w") {
        e.preventDefault()
        if (activeTabId.value) {
            closeTab(activeTabId.value)
        }
    }
}

function handleTabMiddleClick(e: MouseEvent, tabId: string) {
    if (e.button === 1) {
        e.preventDefault()
        closeTab(tabId)
    }
}

/**
 * 以管理员权限重新启动应用
 */
async function restartAsAdmin() {
    try {
        await runAsAdmin()
    } catch (error) {
        console.error("以管理员权限重新启动失败", error)
        ui.showErrorMessage("以管理员权限重新启动失败")
    }
}

/**
 * 全局快捷键状态
 */
const globalShortcutEnabled = ref(false)

/**
 * 切换全局快捷键状态
 */
async function toggleGlobalShortcut() {
    try {
        if (globalShortcutEnabled.value) {
            // 禁用快捷键
            await unregisterAll()
            globalShortcutEnabled.value = false
            ui.showSuccessMessage("全局快捷键已禁用")
        } else {
            // 启用快捷键
            await register("F10", e => {
                if (e.state === "Pressed") {
                    // 当按下 F10 时，运行当前脚本
                    runCurrentTab()
                }
            })
            globalShortcutEnabled.value = true
            ui.showSuccessMessage("全局快捷键已启用 (F10)")
        }
    } catch (error) {
        console.error("切换全局快捷键失败", error)
        ui.showErrorMessage("切换全局快捷键失败")
    }
}

watch(viewMode, newMode => {
    if (newMode === "local") {
        fetchLocalScripts()
    } else if (newMode === "online") {
        fetchOnlineScripts()
    }
})

watch(
    currentConfigScope,
    scope => {
        if (!scope) return
        ensureRuntimeTimeoutConfigItem(scope, true)
    },
    { immediate: true }
)

watch(isRunning, running => {
    if (running) {
        touchScriptRuntimeEvent()
        return
    }
    lastScriptEventAt = 0
    scriptRuntimeRestartingByTimeout = false
})

onMounted(async () => {
    startScriptRuntimeWatchdog()
    try {
        await scriptRuntime.initRuntimeTracking()
    } catch (error) {
        console.error("初始化脚本运行态监听失败", error)
    }
    await initScriptsDir()
    await initEngineDts()
    loadSchedulerConfig()
    loadScriptConfigItems()
    loadScriptHotkeys()
    await fetchLocalScripts()
    document.addEventListener("keydown", handleKeyDown)
    await initConsoleListener()
    await initStatusListener()
    await initFileChangeListener()
    await initScriptConfigListener()
    await initScriptSetConfigListener()
    await syncRunningStateFromBackend()
})

onUnmounted(async () => {
    stopScriptRuntimeWatchdog()
    lastScriptEventAt = 0
    scriptRuntimeRestartingByTimeout = false
    if (startEditScriptTimer) {
        clearTimeout(startEditScriptTimer)
        startEditScriptTimer = null
    }
    document.removeEventListener("keydown", handleKeyDown)
    if (unlistenConsoleFn) {
        unlistenConsoleFn()
    }
    if (unlistenStatusFn) {
        unlistenStatusFn()
    }
    if (unlistenFileChangedFn) {
        unlistenFileChangedFn()
    }
    if (unlistenScriptConfigFn) {
        unlistenScriptConfigFn()
    }
    if (unlistenScriptSetConfigFn) {
        unlistenScriptSetConfigFn()
    }
    // 停止所有文件监听
    const stopPromises = Array.from(watchedFiles.value).map(fileName => stopWatchingFile(fileName))
    await Promise.all(stopPromises)
    // 注销所有全局快捷键
    await unregisterAll()
})
</script>

<template>
    <div class="h-full flex flex-col overflow-hidden">
        <div class="flex-1 flex overflow-hidden min-h-0">
            <div class="w-64 border-r border-base-200 flex flex-col bg-base-100 min-h-0">
                <div class="px-4 py-1 border-b border-base-200 flex justify-center">
                    <div class="flex gap-2 items-center">
                        <button
                            class="p-2 rounded-md text-xs font-bold cursor-pointer hover:bg-base-300"
                            :class="{ 'bg-base-300': viewMode === 'scheduler' }"
                            @click="switchToScheduler"
                            title="调度器"
                        >
                            <Icon icon="ri:git-branch-line" class="w-4 h-4" />
                        </button>
                        <button
                            class="p-2 rounded-md text-xs flex gap-2 font-bold cursor-pointer hover:bg-base-300"
                            :class="{ 'bg-base-300': viewMode === 'local' }"
                            @click="switchToLocal"
                        >
                            <Icon icon="ri:folder-line" class="w-4 h-4" />
                            本地
                        </button>
                        <button
                            class="p-2 rounded-md text-xs flex gap-2 font-bold cursor-pointer hover:bg-base-300"
                            :class="{ 'bg-base-300': viewMode === 'online' }"
                            @click="switchToOnline"
                        >
                            <Icon icon="ri:cloud-line" class="w-4 h-4" />
                            云端
                        </button>
                        <div
                            class="p-2 rounded-md cursor-pointer hover:bg-base-300"
                            @click="viewMode === 'online' ? fetchOnlineScripts() : fetchLocalScripts()"
                        >
                            <Icon icon="ri:refresh-line" class="w-4 h-4" />
                        </div>
                    </div>
                </div>
                <div v-if="viewMode === 'online'" class="p-3 border-b border-base-200 flex flex-col gap-2">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索脚本..."
                        class="input input-bordered input-sm w-full"
                        @input="handleSearch"
                    />
                    <Select v-model="selectedCategory" class="input input-sm w-full" @change="handleSearch">
                        <SelectItem v-for="option in categoryOptions" :key="option.value" :value="option.value">
                            {{ option.label }}
                        </SelectItem>
                    </Select>
                </div>
                <ContextMenu class="flex-1 min-h-0">
                    <ScrollArea class="h-full min-h-0">
                        <div v-if="loading" class="flex justify-center items-center h-full p-4">
                            <span class="loading loading-spinner" />
                        </div>
                        <div
                            v-else-if="viewMode === 'local' && localScripts.length === 0"
                            class="flex justify-center items-center h-full text-base-content/50 p-4"
                        >
                            暂无本地脚本
                        </div>
                        <div
                            v-else-if="
                                (viewMode === 'online' && onlineScripts.length === 0) ||
                                (viewMode === 'scheduler' && schedulerConfig.steps.length === 0)
                            "
                            class="flex justify-center items-center h-full text-base-content/50 p-4"
                        >
                            {{ viewMode === "scheduler" ? "暂无调度脚本，请在更多操作中配置调度器" : "暂无在线脚本" }}
                        </div>
                        <div v-else>
                            <template v-if="viewMode === 'scheduler'">
                                <div class="px-3 py-2 text-xs text-base-content/60 border-b border-base-200">
                                    调度脚本列表（按执行顺序）
                                </div>
                                <div
                                    v-for="(step, index) in schedulerConfig.steps"
                                    :key="step.id"
                                    class="px-3 py-2 rounded hover:bg-base-200 cursor-pointer flex items-center gap-2 text-sm"
                                    @click="openLocalScript(step.scriptName)"
                                >
                                    <div class="text-xs font-mono text-base-content/60 w-7 shrink-0">#{{ index + 1 }}</div>
                                    <Icon icon="ri:file-line" class="w-4 h-4 shrink-0" />
                                    <div class="flex-1 truncate">{{ step.scriptName || "未选择脚本" }}</div>
                                    <Icon
                                        v-if="step.flowControl.enabled"
                                        icon="ri:git-branch-line"
                                        class="w-4 h-4 text-warning shrink-0"
                                        title="流控已开启"
                                    />
                                </div>
                            </template>
                            <template v-else-if="viewMode === 'local'">
                                <div class="min-h-full">
                                    <ContextMenu
                                        v-for="script in localScripts"
                                        :key="script"
                                        class="px-3 py-2 rounded hover:bg-base-200 cursor-pointer flex items-center gap-2 text-sm group"
                                        :class="{ 'bg-base-200': activeTab?.name === script }"
                                        @click="openLocalScript(script)"
                                    >
                                        <button
                                            v-if="isLocalScriptRunning(script)"
                                            class="w-4 h-4 shrink-0 flex items-center justify-center cursor-pointer hover:opacity-80"
                                            title="停止脚本"
                                            @click.stop="stopLocalScriptByName(script)"
                                        >
                                            <span class="w-3 h-3 bg-error rounded-xs" />
                                        </button>
                                        <Icon v-else icon="ri:file-line" class="w-4 h-4 shrink-0" />
                                        <div v-if="editingScript !== script" class="flex-1 min-w-0 flex items-center gap-2">
                                            <span class="truncate">{{ script }}</span>
                                            <span v-if="scriptHotkeyStore[script]" class="badge badge-outline badge-xs shrink-0">
                                                {{ formatScriptHotkeyBadgeText(scriptHotkeyStore[script]) }}
                                            </span>
                                        </div>
                                        <input
                                            v-else
                                            id="script-name-input"
                                            v-model="editingScriptName"
                                            type="text"
                                            class="flex-1 input input-bordered input-xs px-2 py-1 h-6"
                                            @blur="confirmRenameScript"
                                            @keydown="handleEditKeyDown"
                                            @click.stop
                                        />
                                        <template #menu>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                                @click="openNewScriptDialog"
                                            >
                                                <Icon icon="ri:add-line" class="w-4 h-4 mr-2" />
                                                新建脚本
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                                @click="openScriptDirectory"
                                            >
                                                <Icon icon="ri:folder-open-line" class="w-4 h-4 mr-2" />
                                                打开目录
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                                @click.stop="startEditScript(script)"
                                            >
                                                <Icon icon="ri:edit-line" class="w-4 h-4 mr-2" />
                                                重命名
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                                @click="openScriptHotkeyDialog(script)"
                                            >
                                                <Icon icon="ri:edit-line" class="w-4 h-4 mr-2" />
                                                {{ scriptHotkeyStore[script] ? "修改热键" : "设置热键" }}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                v-if="scriptHotkeyStore[script]"
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-warning data-highlighted:text-base-100"
                                                @click="clearScriptHotkeyBinding(script)"
                                            >
                                                <Icon icon="ri:close-circle-line" class="w-4 h-4 mr-2" />
                                                清除热键
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                v-if="scriptHotkeyStore[script]"
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                                @click="toggleScriptHotkeyEnabled(script)"
                                            >
                                                <Icon icon="ri:stop-circle-line" class="w-4 h-4 mr-2" />
                                                {{ scriptHotkeyStore[script].enabled ? "禁用热键" : "启用热键" }}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-success data-highlighted:text-base-100"
                                                @click="publishScript(script)"
                                            >
                                                <Icon icon="ri:upload-cloud-line" class="w-4 h-4 mr-2" />
                                                发布/更新
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-error data-highlighted:text-base-100"
                                                @click="deleteScript(script)"
                                            >
                                                <Icon icon="ri:delete-bin-line" class="w-4 h-4 mr-2" />
                                                删除
                                            </ContextMenuItem>
                                        </template>
                                    </ContextMenu>
                                </div>
                            </template>
                            <template v-else-if="viewMode === 'online'">
                                <ContextMenu
                                    v-for="script in onlineScripts"
                                    :key="script.id"
                                    class="px-3 py-2 rounded hover:bg-base-200 cursor-pointer flex flex-col gap-1 text-sm"
                                >
                                    <div class="flex items-center justify-between" @click="openOnlineScript(script)">
                                        <div class="flex-1">
                                            <div class="flex justify-between items-center gap-2">
                                                <span class="truncate font-medium">{{ script.title }}</span>
                                                <span class="truncate text-xs opacity-80 inline-flex items-center gap-1">
                                                    <Icon icon="ri:eye-line" />
                                                    {{ script.views }}
                                                </span>
                                            </div>
                                            <div class="text-xs text-base-content/60 truncate">{{ script.description }}</div>
                                            <div class="text-base-content/80 flex items-center gap-1">
                                                <Icon
                                                    v-if="script.isRecommended"
                                                    icon="ri:checkbox-circle-fill"
                                                    class="w-4 h-4 inline-block"
                                                />
                                                <span class="text-xs text-base-content/60 truncate">
                                                    {{ script.user?.name }}
                                                </span>
                                                <button class="ml-auto btn btn-xs" @click.stop="downloadScript(script)">
                                                    {{ isOnlineScriptExistsLocal(script) ? "更新" : "下载" }}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <template #menu>
                                        <ContextMenuItem
                                            class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-error data-highlighted:text-base-100"
                                            @click="deleteOnlineScript(script)"
                                        >
                                            <Icon icon="ri:delete-bin-line" class="w-4 h-4 mr-2" />
                                            删除
                                        </ContextMenuItem>
                                    </template>
                                </ContextMenu>
                            </template>
                        </div>
                        <div v-if="viewMode === 'online'" class="flex justify-center p-2">
                            <button v-if="onlineScripts.length < totalCount" class="btn btn-sm btn-ghost" @click="loadMore">
                                加载更多
                            </button>
                        </div>
                    </ScrollArea>
                    <template v-if="viewMode === 'local'" #menu>
                        <ContextMenuItem
                            class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                            @click="openNewScriptDialog"
                        >
                            <Icon icon="ri:add-line" class="w-4 h-4 mr-2" />
                            新建脚本
                        </ContextMenuItem>
                        <ContextMenuItem
                            class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                            @click="openScriptDirectory"
                        >
                            <Icon icon="ri:folder-open-line" class="w-4 h-4 mr-2" />
                            打开目录
                        </ContextMenuItem>
                    </template>
                </ContextMenu>
            </div>

            <div class="flex-1 flex min-w-0">
                <div class="flex-1 flex flex-col min-w-0">
                    <!-- TABS -->
                    <div class="h-10 bg-base-100 border-b border-base-300 flex items-center justify-between">
                        <!-- files -->
                        <ScrollArea horizontal :vertical="false" class="flex items-center flex-1 h-full">
                            <div class="flex">
                                <ContextMenu
                                    v-for="tab in openedTabs"
                                    :key="tab.id"
                                    class="h-10 flex items-center gap-2 px-3 border-r border-base-300 cursor-pointer min-w-max"
                                    :class="{ 'bg-base-200 border-t border-t-base-content': activeTabId === tab.id }"
                                    @click="setActiveTab(tab.id)"
                                    @mousedown="handleTabMiddleClick($event, tab.id)"
                                >
                                    <Icon :icon="tab.type === 'local' ? 'ri:file-line' : 'ri:cloud-line'" class="w-4 h-4" />
                                    <span class="text-sm truncate max-w-32">{{ tab.name }}</span>
                                    <button
                                        v-if="tab.modified"
                                        class="w-5 h-5 rounded hover:bg-base-300 flex items-center justify-center cursor-pointer"
                                        @click.stop="saveCurrentTab"
                                        title="保存"
                                    >
                                        <span class="w-2 h-2 rounded-full bg-warning" />
                                    </button>
                                    <button
                                        v-else
                                        class="w-5 h-5 rounded hover:bg-base-300 flex items-center justify-center cursor-pointer"
                                        @click.stop="closeTab(tab.id)"
                                    >
                                        <Icon icon="ri:close-line" class="w-3 h-3" />
                                    </button>
                                    <template #menu>
                                        <ContextMenuItem
                                            class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                            @click="closeOtherTabs(tab.id)"
                                        >
                                            关闭其他
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                            @click="closeAllTabs"
                                        >
                                            关闭所有
                                        </ContextMenuItem>
                                    </template>
                                </ContextMenu>
                            </div>
                        </ScrollArea>
                        <!-- actions -->
                        <div class="flex items-center gap-2 ml-2 px-1">
                            <button class="btn btn-sm btn-ghost btn-square" @click="showConsole = !showConsole" title="切换控制台">
                                <Icon :icon="showConsole ? 'ri:terminal-box-line' : 'ri:terminal-line'" class="w-4 h-4" />
                            </button>
                            <button class="btn btn-sm btn-ghost btn-square" @click="toggleStatusPanel" title="切换状态栏">
                                <Icon :icon="showStatusPanel ? 'ri:menu-fold-line' : 'ri:menu-unfold-line'" class="w-4 h-4" />
                            </button>
                            <button
                                v-if="activeTab && activeTab.type === 'local'"
                                class="btn btn-sm btn-ghost btn-square"
                                :class="{ 'btn-error': isRunButtonInStopState }"
                                @click="runCurrentTab"
                                :title="runButtonTitle"
                            >
                                <Icon :icon="isRunButtonInStopState ? 'ri:stop-circle-line' : 'ri:play-line'" class="w-4 h-4" />
                            </button>
                            <button
                                v-if="activeTab && activeTab.type === 'local'"
                                class="btn btn-sm btn-primary btn-square"
                                @click="saveCurrentTab"
                                :disabled="!activeTab.modified"
                                title="保存"
                            >
                                <Icon icon="ri:save-line" class="w-4 h-4" />
                            </button>
                            <div class="dropdown dropdown-end">
                                <div tabindex="0" role="button" class="btn btn-sm btn-ghost btn-square" title="更多操作">
                                    <Icon icon="ri:more-line" class="w-4 h-4" />
                                </div>
                                <ul tabindex="-1" class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
                                    <li><a @click="openSchedulerDialog">调度器配置</a></li>
                                    <li><a @click="openSidePanel('config')">脚本配置</a></li>
                                    <li><a @click="openColorToolPage">图色工具</a></li>
                                    <li><a @click="openRecordToolPage">录制工具</a></li>
                                    <li><a @click="restartAsAdmin">以管理员权限重新启动</a></li>
                                    <li>
                                        <a @click="toggleGlobalShortcut">{{
                                            globalShortcutEnabled ? "禁用全局快捷键(F10)" : "启用全局快捷键(F10)"
                                        }}</a>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div class="flex-1 flex flex-col min-h-0">
                        <div v-if="activeTab" class="flex-1 flex flex-col min-h-0">
                            <ScrollArea class="flex-1 overflow-hidden">
                                <CodeEditor
                                    :readonly="activeTab.type !== 'local'"
                                    :file="activeTab.name"
                                    ref="codeEditor"
                                    v-model="activeTab.content"
                                    placeholder="脚本内容..."
                                    class="w-full h-full p-2 font-mono text-sm"
                                    @update:modelValue="onCodeEditorUpdate"
                                />
                            </ScrollArea>
                        </div>
                        <div v-else class="flex-1 flex items-center justify-center text-base-content/50">
                            <div class="text-center">
                                <Icon icon="ri:file-line" class="w-16 h-16 mx-auto mb-4" />
                                <p>从左侧选择一个脚本开始编辑</p>
                            </div>
                        </div>
                    </div>

                    <!-- 控制台面板 -->
                    <div v-if="showConsole" class="h-48 border-t border-base-300 flex flex-col bg-base-900">
                        <div class="h-8 bg-base-800 border-b border-base-700 flex items-center justify-between px-3 shrink-0">
                            <div class="flex items-center gap-2">
                                <Icon icon="ri:terminal-line" class="w-4 h-4 text-base-content/60" />
                                <span class="text-xs text-base-content/60">控制台</span>
                                <span v-if="isRunning" class="text-xs text-info">
                                    运行中<span v-if="runningScriptName">: {{ runningScriptName }}</span>
                                    <span v-if="runningScriptCount > 1">（{{ runningScriptCount }}）</span>
                                </span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button class="btn btn-xs btn-ghost" @click="clearConsole" title="清空">
                                    <Icon icon="ri:delete-bin-line" class="w-3 h-3" />
                                </button>
                                <button class="btn btn-xs btn-ghost" @click="showConsole = false" title="关闭">
                                    <Icon icon="ri:close-line" class="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                        <div id="console-output" class="flex-1 overflow-auto p-3 font-mono text-xs user-select">
                            <div v-if="consoleLogs.length === 0" class="text-base-content/40 text-center py-4">暂无输出</div>
                            <div v-else class="space-y-1">
                                <div v-for="(log, index) in consoleLogs" :key="index" class="flex gap-2">
                                    <span class="text-base-content/40 shrink-0">{{
                                        new Date(log.timestamp).toLocaleTimeString("zh-CN", {
                                            hour12: false,
                                        })
                                    }}</span>
                                    <span :class="getLogLevelClass(log.level)" class="break-all">{{ log.message }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 右侧面板（调试状态 + 脚本配置） -->
                <div v-if="showStatusPanel" class="w-88 max-w-[45%] min-w-70 border-l border-base-300 bg-base-950/20 flex flex-col">
                    <div class="h-10 px-3 border-b border-base-300 flex items-center justify-between gap-2">
                        <div class="tabs tabs-box tabs-xs">
                            <button class="tab" :class="{ 'tab-active': sidePanelTab === 'status' }" @click="sidePanelTab = 'status'">
                                调试状态
                            </button>
                            <button class="tab" :class="{ 'tab-active': sidePanelTab === 'config' }" @click="sidePanelTab = 'config'">
                                脚本配置
                            </button>
                        </div>
                        <div class="flex items-center gap-2">
                            <button
                                class="btn btn-xs btn-ghost"
                                :disabled="sidePanelTab === 'status' ? scriptStatuses.length === 0 : sortedScriptConfigItems.length === 0"
                                @click="sidePanelTab === 'status' ? clearAllStatus() : clearAllScriptConfigItems()"
                                title="清空"
                            >
                                <Icon icon="ri:delete-bin-line" class="w-3 h-3" />
                            </button>
                            <button class="btn btn-xs btn-ghost" @click="showStatusPanel = false" title="关闭">
                                <Icon icon="ri:close-line" class="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    <template v-if="sidePanelTab === 'config'">
                        <div v-if="!currentConfigScope" class="flex-1 flex items-center justify-center text-base-content/50 text-sm p-3">
                            请先打开并运行本地脚本
                        </div>
                        <div
                            v-else-if="sortedScriptConfigItems.length === 0"
                            class="flex-1 flex items-center justify-center text-base-content/50 text-sm p-3"
                        >
                            暂无配置，脚本调用 readConfig 后会自动创建
                        </div>
                        <div v-else class="flex-1 min-h-0">
                            <ScrollArea class="h-full p-2">
                                <div class="flex flex-col gap-2">
                                    <div
                                        v-for="item in sortedScriptConfigItems"
                                        :key="item.name"
                                        class="border border-base-300 rounded bg-base-100/40 p-2 space-y-2"
                                    >
                                        <div class="flex items-center justify-between gap-2">
                                            <div class="text-sm font-medium truncate">{{ item.name }}</div>
                                            <button
                                                class="btn btn-xs btn-ghost"
                                                @click="deleteScriptConfigItem(item.name)"
                                                title="删除配置"
                                            >
                                                <Icon icon="ri:delete-bin-line" class="w-3 h-3" />
                                            </button>
                                        </div>
                                        <div v-if="item.desc" class="text-xs text-base-content/70 break-all">{{ item.desc }}</div>
                                        <div class="text-[11px] text-base-content/50">类型: {{ item.kind }}</div>

                                        <input
                                            v-if="item.kind === 'string'"
                                            :value="String(item.value)"
                                            type="text"
                                            class="input input-bordered input-sm w-full"
                                            @input="updateScriptConfigValue(item.name, ($event.target as HTMLInputElement).value)"
                                        />

                                        <input
                                            v-else-if="item.kind === 'number'"
                                            :value="Number(item.value)"
                                            type="number"
                                            class="input input-bordered input-sm w-full"
                                            @input="updateScriptConfigValue(item.name, ($event.target as HTMLInputElement).value)"
                                        />

                                        <select
                                            v-else-if="item.kind === 'select'"
                                            :value="String(item.value)"
                                            class="select select-bordered select-sm w-full"
                                            @change="updateScriptConfigValue(item.name, ($event.target as HTMLSelectElement).value)"
                                        >
                                            <option v-for="option in item.options" :key="option" :value="option">{{ option }}</option>
                                        </select>

                                        <div v-else-if="item.kind === 'multi-select'" class="space-y-2">
                                            <div v-if="item.options.length === 0" class="text-xs text-base-content/60">暂无可选项</div>
                                            <div v-else class="space-y-1">
                                                <div
                                                    v-for="option in getScriptConfigMultiSelectDisplayOptions(item)"
                                                    :key="option"
                                                    class="flex items-center justify-between gap-2"
                                                >
                                                    <label class="label cursor-pointer justify-start gap-2 py-1 flex-1">
                                                        <input
                                                            type="checkbox"
                                                            class="checkbox checkbox-sm"
                                                            :checked="isScriptConfigMultiSelectOptionChecked(item, option)"
                                                            @change="
                                                                toggleScriptConfigMultiSelectOption(
                                                                    item.name,
                                                                    option,
                                                                    ($event.target as HTMLInputElement).checked
                                                                )
                                                            "
                                                        />
                                                        <span class="text-sm break-all">{{ option }}</span>
                                                    </label>
                                                    <div
                                                        v-if="isScriptConfigMultiSelectOptionChecked(item, option)"
                                                        class="flex items-center gap-1"
                                                    >
                                                        <button
                                                            class="btn btn-xs btn-ghost"
                                                            :disabled="getScriptConfigMultiSelectOptionIndex(item, option) <= 0"
                                                            @click="moveScriptConfigMultiSelectOption(item.name, option, -1)"
                                                            title="上移"
                                                        >
                                                            <Icon icon="ri:arrow-down-line" class="w-3 h-3 rotate-180" />
                                                        </button>
                                                        <button
                                                            class="btn btn-xs btn-ghost"
                                                            :disabled="
                                                                getScriptConfigMultiSelectOptionIndex(item, option) >=
                                                                getScriptConfigMultiSelectValues(item).length - 1
                                                            "
                                                            @click="moveScriptConfigMultiSelectOption(item.name, option, 1)"
                                                            title="下移"
                                                        >
                                                            <Icon icon="ri:arrow-down-line" class="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <label v-else class="label cursor-pointer justify-start gap-2">
                                            <input
                                                type="checkbox"
                                                class="toggle toggle-sm"
                                                :checked="Boolean(item.value)"
                                                @change="updateScriptConfigValue(item.name, ($event.target as HTMLInputElement).checked)"
                                            />
                                            <span class="text-sm">启用</span>
                                        </label>
                                    </div>
                                </div>
                            </ScrollArea>
                        </div>
                    </template>

                    <template v-else>
                        <div
                            v-if="scriptStatuses.length === 0"
                            class="flex-1 flex items-center justify-center text-base-content/50 text-sm"
                        >
                            暂无状态
                        </div>
                        <div v-else class="flex-1 min-h-0">
                            <ScrollArea class="h-full p-2">
                                <div class="flex flex-col gap-2 user-select">
                                    <div
                                        v-for="item in scriptStatuses"
                                        :key="item.title"
                                        class="border border-base-300 rounded bg-base-100/40 p-2 space-y-2"
                                    >
                                        <div class="flex items-center justify-between gap-2">
                                            <div class="text-xs text-base-content/70 truncate">{{ item.title }}</div>
                                            <button class="btn btn-xs btn-ghost" @click="clearStatus(item.title)">
                                                <Icon icon="ri:close-line" class="w-3 h-3" />
                                            </button>
                                        </div>
                                        <div class="text-[11px] text-base-content/40">
                                            {{ new Date(item.timestamp).toLocaleTimeString() }}
                                        </div>
                                        <div v-if="item.text" class="text-xs text-base-content/85 whitespace-pre-wrap break-all">
                                            {{ item.text }}
                                        </div>
                                        <div v-if="item.images && item.images.length > 0" class="space-y-2">
                                            <img
                                                v-for="(statusImage, imageIndex) in item.images"
                                                :key="`${item.title}-${imageIndex}`"
                                                :src="statusImage"
                                                class="max-w-full"
                                            />
                                        </div>
                                        <img v-else-if="item.image" :src="item.image" class="max-w-full" />
                                    </div>
                                </div>
                            </ScrollArea>
                        </div>
                    </template>
                </div>
            </div>
        </div>

        <dialog :open="showNewScriptDialog" class="modal">
            <div class="modal-box">
                <h3 class="font-bold text-lg mb-4">新建脚本</h3>
                <div class="mb-4">
                    <label class="label block">
                        <div class="mb-2 text-sm">脚本名称</div>
                        <input v-model="newScriptName" type="text" placeholder="请输入脚本名称" class="input input-bordered w-full" />
                    </label>
                </div>
                <div class="mb-4">
                    <label class="label block">
                        <div class="mb-2 text-sm">脚本内容</div>
                        <textarea
                            v-model="newScriptContent"
                            placeholder="请输入脚本内容"
                            class="textarea textarea-bordered w-full h-64 resize-none"
                        />
                    </label>
                </div>
                <div class="flex justify-end gap-2">
                    <button class="btn btn-ghost" @click="showNewScriptDialog = false">取消</button>
                    <button class="btn btn-primary" @click="createNewScript">创建</button>
                </div>
            </div>
        </dialog>

        <dialog :open="showScriptHotkeyDialog" class="modal">
            <div class="modal-box max-w-lg">
                <h3 class="font-bold text-lg mb-4">设置脚本热键</h3>
                <div class="space-y-3">
                    <div class="text-sm">
                        <span class="text-base-content/70">脚本：</span>
                        <span class="font-mono">{{ editingHotkeyScriptName }}</span>
                    </div>
                    <label class="label block">
                        <div class="mb-2 text-sm">AHK 格式热键</div>
                        <input
                            v-model="editingHotkeyValue"
                            type="text"
                            class="input input-bordered w-full"
                            placeholder="例如：^c / CapsLock & c / RButton / RButton & XButton1"
                        />
                    </label>
                    <label class="label block">
                        <div class="mb-2 text-sm">生效条件（#HotIf WinActive）</div>
                        <input
                            v-model="editingHotkeyWinActive"
                            type="text"
                            class="input input-bordered w-full"
                            placeholder="示例：Moonlight / ahk_exe EM-Win64-Shipping.exe / Moonlight ahk_exe EM-Win64-Shipping.exe（留空=全局）"
                        />
                    </label>
                    <label class="label cursor-pointer justify-start gap-3">
                        <input v-model="editingHotkeyHoldToLoop" type="checkbox" class="checkbox checkbox-sm" />
                        <span class="label-text text-sm">按住循环（按住热键时循环运行脚本）</span>
                    </label>
                    <div class="text-xs text-base-content/60 select-text">
                        支持：`^ ! + # *` 前缀、`A & B` 组合键、`Up` 抬起触发，以及鼠标键 `LButton/RButton/MButton/XButton1/XButton2`
                        ；WinActive 条件按窗口标题，支持`ahk_exe/ahk_class/ahk_pid` 示例: ahk_exe EM-Win64-Shipping.exe
                    </div>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-ghost" @click="showScriptHotkeyDialog = false">取消</button>
                    <button
                        v-if="scriptHotkeyStore[editingHotkeyScriptName]"
                        class="btn btn-warning"
                        @click="(clearScriptHotkeyBinding(editingHotkeyScriptName), (showScriptHotkeyDialog = false))"
                    >
                        清除绑定
                    </button>
                    <button class="btn btn-primary" @click="saveScriptHotkeyBinding">保存</button>
                </div>
            </div>
        </dialog>

        <dialog :open="showSchedulerDialog" class="modal">
            <div class="modal-box max-w-5xl">
                <h3 class="font-bold text-lg mb-4">调度器配置</h3>
                <div class="mb-3 flex items-center gap-2">
                    <button class="btn btn-sm btn-primary" @click="addSchedulerStep">添加本地脚本</button>
                    <span class="text-xs text-base-content/70"> 默认按顺序执行；启用流控后可按返回值使用 case/default 跳转 </span>
                </div>
                <div class="space-y-3 max-h-[60vh] overflow-auto pr-1">
                    <div
                        v-if="schedulerDraftConfig.steps.length === 0"
                        class="border border-dashed border-base-300 rounded p-4 text-center text-base-content/60 text-sm"
                    >
                        暂无步骤，点击“添加本地脚本”开始配置
                    </div>
                    <div
                        v-for="(step, stepIndex) in schedulerDraftConfig.steps"
                        :key="step.id"
                        class="border border-base-300 rounded-lg p-3 bg-base-100/60 space-y-3"
                    >
                        <div class="flex flex-wrap items-center gap-2">
                            <div class="text-xs font-mono text-base-content/70 shrink-0">#{{ stepIndex + 1 }}</div>
                            <select v-model="step.scriptName" class="select select-bordered select-sm min-w-52">
                                <option value="">选择本地脚本</option>
                                <option v-for="script in localScripts" :key="script" :value="script">{{ script }}</option>
                            </select>
                            <select v-model="step.flowControl.enabled" class="select select-bordered select-sm">
                                <option :value="false">顺序执行（默认）</option>
                                <option :value="true">启用流控</option>
                            </select>
                            <button class="btn btn-xs" :disabled="stepIndex === 0" @click="moveSchedulerStep(stepIndex, -1)">上移</button>
                            <button
                                class="btn btn-xs"
                                :disabled="stepIndex === schedulerDraftConfig.steps.length - 1"
                                @click="moveSchedulerStep(stepIndex, 1)"
                            >
                                下移
                            </button>
                            <button class="btn btn-xs btn-error" @click="removeSchedulerStep(stepIndex)">删除</button>
                        </div>

                        <div v-if="step.flowControl.enabled" class="space-y-2 rounded border border-warning/40 p-2">
                            <div class="text-xs font-medium text-warning-content">流程控制（switch 风格）</div>
                            <div
                                v-for="(rule, caseIndex) in step.flowControl.cases"
                                :key="rule.id"
                                class="flex flex-wrap items-center gap-2"
                            >
                                <span class="text-xs">case</span>
                                <input
                                    v-model="rule.matchValue"
                                    type="text"
                                    class="input input-bordered input-sm w-40"
                                    placeholder="返回值"
                                />
                                <span class="text-xs">=></span>
                                <select v-model="rule.targetStepId" class="select select-bordered select-sm min-w-52">
                                    <option :value="null">不跳转</option>
                                    <option v-for="option in schedulerDraftStepOptions" :key="option.id" :value="option.id">
                                        {{ option.label }}
                                    </option>
                                </select>
                                <button class="btn btn-xs btn-ghost" @click="removeSchedulerCase(stepIndex, caseIndex)">删除 case</button>
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-xs">default</span>
                                <span class="text-xs">=></span>
                                <select v-model="step.flowControl.defaultTargetStepId" class="select select-bordered select-sm min-w-52">
                                    <option :value="null">顺序下一步</option>
                                    <option v-for="option in schedulerDraftStepOptions" :key="option.id" :value="option.id">
                                        {{ option.label }}
                                    </option>
                                </select>
                                <button class="btn btn-xs" @click="addSchedulerCase(stepIndex)">添加 case</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-ghost" @click="showSchedulerDialog = false">取消</button>
                    <button class="btn btn-primary" @click="saveSchedulerConfig">保存并切换</button>
                </div>
            </div>
        </dialog>
    </div>
</template>
