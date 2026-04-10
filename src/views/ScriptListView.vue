<script setup lang="ts">
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut"
import { t } from "i18next"
import { debounce } from "lodash-es"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import {
    clearScriptMcpConsole,
    clearScriptMcpStatus,
    deleteFile,
    getDocumentsDir,
    getScriptMcpServerState,
    listScriptFiles,
    openExplorer,
    readTextFile,
    renameFile,
    resolveScriptHelpRequest,
    runAsAdmin,
    runScript,
    type ScriptHelpResponse,
    type ScriptMcpServerState,
    setScriptMcpServerEnabled,
    unwatchFile,
    watchFile,
    writeTextFile,
} from "@/api/app"
import { createScriptMutation, deleteScriptMutation, updateScriptMutation } from "@/api/gen/api-mutations"
import { type Script, type ScriptCategory, scriptCategoriesQuery, scriptQuery, scriptsCountQuery, scriptsQuery } from "@/api/graphql"
import { openSChat } from "@/api/swindow"
import ContextMenu, { ContextMenuItem } from "@/components/contextmenu"
import { env } from "@/env"
import { useCloudGameStore } from "@/store/cloudgame"
import { type ScriptRuntimeSidePanelTab, useScriptRuntimeStore } from "@/store/scriptRuntime"
import { useUIStore } from "@/store/ui"
import { copyText } from "@/util"
import { parseScriptHeader, replaceScriptHeader } from "@/utils/script-header"

const ui = useUIStore()
const cloudgame = useCloudGameStore()
const scriptRuntime = useScriptRuntimeStore()
const router = useRouter()

const scriptsDir = ref("")
const viewMode = ref<"scheduler" | "local" | "online">("local")
const searchKeyword = ref("")
const selectedCategory = ref<string>("all")
const loading = ref(false)
const onlineScripts = ref<Script[]>([])
const onlineScriptUpdateMap = ref<Record<string, boolean>>({})
const scriptCategories = ref<ScriptCategory[]>([])
const extraOnlineCategoryNames = ref<string[]>([])
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
    ...[...new Set([...scriptCategories.value.map(category => category.name), ...extraOnlineCategoryNames.value])].map(name => ({
        value: name,
        label: name,
    })),
])

/**
 * 获取脚本分类列表，供在线筛选使用。
 */
async function fetchScriptCategories() {
    try {
        const result = await scriptCategoriesQuery(undefined, { requestPolicy: "network-only" })
        scriptCategories.value = result || []
    } catch (error) {
        console.error("获取脚本分类失败", error)
        scriptCategories.value = []
    }
}

/**
 * 将脚本标题转换为本地文件名。
 * @param title 脚本标题
 * @returns 本地脚本文件名（含 .js）
 */
function getScriptFileNameByTitle(title: string): string {
    const normalized = String(title ?? "").replace(/[^a-zA-Z0-9\u4e00-\u9fa5 \-_\(\)]/g, "_")
    return `${normalized}.js`
}

/**
 * 将脚本头中的日期解析为时间戳。
 * @param dateHeader 脚本头中的 @date 值
 * @returns 毫秒时间戳，解析失败返回 null
 */
function parseScriptHeaderDate(dateHeader?: string): number | null {
    if (!dateHeader) return null
    const parsed = Date.parse(dateHeader)
    return Number.isFinite(parsed) ? parsed : null
}

/**
 * 从本地脚本内容解析头部更新时间。
 * @param content 脚本内容
 * @returns 毫秒时间戳，解析失败返回 null
 */
function getLocalScriptUpdateAt(content: string): number | null {
    return parseScriptHeaderDate(parseScriptHeader(content).date)
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
const consoleLogs = computed(() => scriptRuntime.consoleLogs.filter(log => shouldAcceptScopedScriptEvent(log.scope)))
const scriptStatuses = computed(() => scriptRuntime.scriptStatuses.filter(status => shouldAcceptScopedScriptEvent(status.scope)))
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
const consoleOutputRef = ref<HTMLDivElement | null>(null)
const isConsolePinnedToBottom = ref(true)
const isCloudGameEntryActive = computed(() => cloudgame.isWindowOpen || cloudgame.opening)
const cloudGameEntryTitle = computed(() => {
    if (cloudgame.opening) return "正在打开云游戏窗口"
    if (cloudgame.isBridgeConnected) return "聚焦云游戏窗口（已连通）"
    if (cloudgame.isWindowOpen) return "聚焦云游戏窗口"
    return "打开云游戏窗口"
})
let unlistenFileChangedFn: UnlistenFn | null = null
const watchedFiles = ref<Set<string>>(new Set())
const codeEditor = ref<any>()
const showSchedulerDialog = ref(false)
const showScriptMcpDialog = ref(false)
const SCRIPT_MCP_PORT_STORAGE_KEY = "script-mcp-port-v1"
const scriptMcpServerState = ref<ScriptMcpServerState>({
    enabled: false,
    running: false,
    port: 28080,
    address: "http://127.0.0.1:28080/mcp",
    lastError: null,
})
const scriptMcpUpdating = ref(false)
const scriptMcpPortInput = ref<number>(28080)
type ScriptHelpSelectionMode = "point" | "region"

interface ScriptHelpRequestEvent {
    requestId: string
    title: string
    message?: string
    image: string
    selectionMode: ScriptHelpSelectionMode
}

interface ScriptHelpPoint {
    x: number
    y: number
}

interface ScriptHelpRegion {
    x: number
    y: number
    width: number
    height: number
    x2: number
    y2: number
}

const showScriptHelpDialog = ref(false)
const scriptHelpSubmitting = ref(false)
const activeScriptHelpRequest = ref<ScriptHelpRequestEvent | null>(null)
const scriptHelpImageRef = ref<HTMLImageElement | null>(null)
const scriptHelpPoint = ref<ScriptHelpPoint | null>(null)
const scriptHelpRegion = ref<ScriptHelpRegion | null>(null)
const scriptHelpNote = ref("")
const scriptHelpDragging = ref(false)
const scriptHelpDragStart = ref<ScriptHelpPoint | null>(null)
let unlistenScriptHelpRequestFn: UnlistenFn | null = null
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
const SCRIPT_RUNTIME_TIMEOUT_DEFAULT_SECONDS = 30
const SCRIPT_RUNTIME_TIMEOUT_CONFIG_ITEM_NAME = "运行超时"
const SCRIPT_RUNTIME_TIMEOUT_CONFIG_ITEM_DESC = "运行超时秒数，脚本运行中长时间未检测到事件时自动重启，0 表示关闭。"
const scriptConfigStore = computed({
    get: () => scriptRuntime.scriptConfigStore as Record<string, Record<string, ScriptConfigItem>>,
    set: value => {
        scriptRuntime.scriptConfigStore = value as typeof scriptRuntime.scriptConfigStore
    },
})
const showScriptHotkeyDialog = ref(false)
const editingHotkeyScriptName = ref("")
const editingHotkeyValue = ref("")
const editingHotkeyWinActive = ref("")
const editingHotkeyHoldToLoop = ref(false)
let scriptRuntimeWatchdogTimer: ReturnType<typeof setInterval> | null = null
let lastScriptEventAt = 0
let scriptRuntimeRestartingByTimeout = false
const activeConfigScope = computed({
    get: () => scriptRuntime.activeConfigScope,
    set: value => {
        scriptRuntime.activeConfigScope = value
    },
})
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
            const updateEntries = await Promise.all(
                onlineScripts.value.map(async script => [script.id, await isOnlineScriptExpiredLocal(script)] as const)
            )
            onlineScriptUpdateMap.value = Object.fromEntries(updateEntries)
            extraOnlineCategoryNames.value = [...new Set(onlineScripts.value.map(script => script.category).filter(Boolean))].filter(
                name => !scriptCategories.value.some(category => category.name === name)
            )
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
        if (onlineScripts.value.length > 0) {
            await refreshOnlineScriptUpdateMap()
        }
        try {
            await scriptRuntime.syncScriptHotkeysWithBackend(localScripts.value, scriptsDir.value)
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

/**
 * 刷新在线脚本的本地过期状态。
 */
async function refreshOnlineScriptUpdateMap() {
    const updateEntries = await Promise.all(
        onlineScripts.value.map(async script => [script.id, await isOnlineScriptExpiredLocal(script)] as const)
    )
    onlineScriptUpdateMap.value = Object.fromEntries(updateEntries)
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
    ui.showSuccessMessage(t("script-list.scheduler_saved"))
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
    addConsoleLog("info", t("script-list.start_run_named", { name: fileName }))
    const result = await runScript(filePath)
    const normalizedResult = normalizeSchedulerResult(result)
    addConsoleLog("info", t("script-list.run_completed_named", { name: fileName, result: normalizedResult || "(empty)" }))
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
const activeLocalScriptPath = computed(() => {
    if (activeTab.value?.type !== "local" || !scriptsDir.value) {
        return ""
    }
    return `${scriptsDir.value}\\${activeTab.value.name}`
})
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
        return isSchedulerRunning.value ? t("script-list.stop_scheduler") : t("script-list.run_scheduler")
    }
    if (activeTab.value?.type === "online") {
        return t("script-list.download_first")
    }
    const scriptName = activeLocalScriptName.value
    if (!scriptName) {
        return t("script-list.run_script")
    }
    return isActiveLocalScriptRunning.value
        ? t("script-list.stop_script_named", { name: scriptName })
        : t("script-list.run_script_named", { name: scriptName })
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
        addConsoleLog("info", t("script-list.stop_requested_named", { name: scriptName }))
    } catch (error) {
        console.error("停止指定脚本失败", error)
        ui.showErrorMessage(t("script-list.stop_script_failed"), error)
    }
}

/**
 * 执行当前调度器配置。
 */
async function runScheduler() {
    if (schedulerConfig.value.steps.length === 0) {
        ui.showErrorMessage(t("script-list.configure_scheduler_first"))
        return
    }

    scriptRuntime.clearScriptStatuses()
    activateRuntimeDebugPanelOnStart()
    scriptRuntime.markSchedulerRunning()
    scriptRuntime.clearSchedulerStopRequest()
    addConsoleLog("info", t("script-list.scheduler_started"))

    const MAX_SCHEDULER_EXECUTIONS = 500
    let executionCount = 0
    let nextStepId: string | null = schedulerConfig.value.steps[0]?.id ?? null

    try {
        while (nextStepId && !schedulerStopRequested.value) {
            const stepIndex = schedulerConfig.value.steps.findIndex(step => step.id === nextStepId)
            if (stepIndex < 0) {
                addConsoleLog("warn", t("script-list.scheduler_target_missing"))
                break
            }

            const step = schedulerConfig.value.steps[stepIndex]
            if (!step.scriptName) {
                addConsoleLog("warn", t("script-list.scheduler_step_missing_script", { index: stepIndex + 1 }))
                nextStepId = getSequentialNextStepId(stepIndex)
                continue
            }

            addConsoleLog("info", t("script-list.scheduler_run_step", { index: stepIndex + 1, name: step.scriptName }))
            const result = await runLocalScriptByName(step.scriptName, { keepSchedulerMode: true })
            nextStepId = resolveSchedulerNextStepId(step, result, stepIndex)

            executionCount += 1
            if (executionCount >= MAX_SCHEDULER_EXECUTIONS) {
                addConsoleLog("warn", t("script-list.scheduler_execution_limit"))
                break
            }
        }

        if (schedulerStopRequested.value) {
            addConsoleLog("info", t("script-list.scheduler_stopped"))
        } else {
            addConsoleLog("info", t("script-list.scheduler_completed"))
        }
    } catch (error) {
        console.error("调度器执行失败", error)
        ui.showErrorMessage(t("script-list.scheduler_run_failed"))
        addConsoleLog("error", t("script-list.scheduler_run_failed_with_error", { error: String(error) }))
    } finally {
        if (runningMode.value === "scheduler") {
            runningMode.value = null
        }
        scriptRuntime.clearSchedulerStopRequest()
        await syncRunningStateFromBackend()
    }
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
 * 打开脚本热键编辑弹窗。
 * @param scriptName 脚本名称
 */
function openScriptHotkeyDialog(scriptName: string) {
    editingHotkeyScriptName.value = scriptName
    const existing = scriptRuntime.scriptHotkeyStore[scriptName]
    editingHotkeyValue.value = existing?.hotkey ?? ""
    editingHotkeyWinActive.value = existing?.hotIfWinActive ?? ""
    editingHotkeyHoldToLoop.value = existing?.holdToLoop ?? false
    showScriptHotkeyDialog.value = true
}

/**
 * 切换单个脚本热键启用状态。
 * @param scriptName 脚本名称
 */
async function toggleScriptHotkeyEnabled(scriptName: string) {
    try {
        const nextConfig = await scriptRuntime.toggleScriptHotkeyEnabled(scriptName, localScripts.value, scriptsDir.value)
        if (nextConfig) {
            ui.showSuccessMessage(
                nextConfig.enabled
                    ? t("script-list.hotkey_enabled", { name: scriptName })
                    : t("script-list.hotkey_disabled", { name: scriptName })
            )
        }
    } catch (error) {
        console.error("切换脚本热键状态失败", error)
        ui.showErrorMessage(t("script-list.toggle_hotkey_failed"), error)
    }
}

/**
 * 保存当前脚本热键绑定。
 */
async function saveScriptHotkeyBinding() {
    const scriptName = editingHotkeyScriptName.value
    if (!scriptName) return
    const hotkey = String(editingHotkeyValue.value ?? "").trim()
    if (!hotkey) {
        ui.showErrorMessage(t("script-list.hotkey_required"))
        return
    }

    try {
        await scriptRuntime.saveScriptHotkeyBinding(
            scriptName,
            {
                hotkey,
                hotIfWinActive: String(editingHotkeyWinActive.value ?? "").trim(),
                holdToLoop: Boolean(editingHotkeyHoldToLoop.value),
                enabled: scriptRuntime.scriptHotkeyStore[scriptName]?.enabled ?? true,
            },
            localScripts.value,
            scriptsDir.value
        )
        showScriptHotkeyDialog.value = false
        ui.showSuccessMessage(t("script-list.hotkey_bound", { name: scriptName, hotkey }))
    } catch (error) {
        console.error("保存脚本热键失败", error)
        ui.showErrorMessage(t("script-list.save_hotkey_failed"), error)
    }
}

/**
 * 清除指定脚本的热键绑定。
 * @param scriptName 脚本名称
 * @param silent 是否静默
 */
async function clearScriptHotkeyBinding(scriptName: string, silent = false) {
    try {
        const cleared = await scriptRuntime.clearScriptHotkeyBinding(scriptName, localScripts.value, scriptsDir.value)
        if (!silent && cleared) {
            ui.showSuccessMessage(t("script-list.hotkey_cleared", { name: scriptName }))
        }
    } catch (error) {
        console.error("清除脚本热键失败", error)
        ui.showErrorMessage(t("script-list.clear_hotkey_failed"), error)
    }
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
    scriptRuntime.persistScriptConfigItems()
}

/**
 * 从本地存储加载脚本配置项。
 */
function loadScriptConfigItems() {
    try {
        scriptRuntime.loadScriptConfigItems()
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
    return scriptRuntime.upsertScriptConfigFromRequest(payload, activeTab.value?.name ?? activeConfigScope.value)
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
 * 判断云端脚本是否已过期。
 * @param script 云端脚本
 * @returns 本地脚本是否比云端脚本旧
 */
async function isOnlineScriptExpiredLocal(script: Script): Promise<boolean> {
    const fileName = getScriptFileNameByTitle(script.title)
    if (!localScripts.value.includes(fileName)) {
        return false
    }

    const content = await loadLocalScriptContent(fileName)
    const localUpdateAt = getLocalScriptUpdateAt(content)
    const cloudUpdateAt = Date.parse(script.updateAt)
    if (!Number.isFinite(cloudUpdateAt)) {
        return false
    }
    if (localUpdateAt === null) {
        return true
    }
    return localUpdateAt < cloudUpdateAt
}

/**
 * 获取云端脚本在本地的操作状态。
 * @param script 脚本信息
 * @returns 下载、更新或已最新
 */
function getOnlineScriptActionType(script: Script): "download" | "update" | "latest" {
    const fileName = getScriptFileNameByTitle(script.title)
    const isLocal = localScripts.value.includes(fileName)
    if (!isLocal) {
        return "download"
    }
    return onlineScriptUpdateMap.value[script.id] ? "update" : "latest"
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
    await refreshOnlineScriptUpdateMap()
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
            throw new Error(t("script-list.fetch_script_content_failed"))
        }
        if (hasHighRiskScriptOperation(result.content)) {
            const confirmed = await ui.showDialog(t("script-list.high_risk_title"), t("script-list.high_risk_message"))
            if (!confirmed) {
                return
            }
        }
        await writeTextFile(filePath, result.content)
        await syncOpenedLocalTabAfterCloudUpdate(fileName, result.content)
        const summary = preparseScriptConfigFromSource(fileName, result.content)
        const actionText = isUpdate ? t("script-list.updated") : t("script-list.downloaded")
        const parseText =
            summary.createdCount > 0
                ? `${t("script-list.preparse_prefix", { created: summary.createdCount })}${
                      summary.skippedCount > 0 ? t("script-list.preparse_skipped", { skipped: summary.skippedCount }) : ""
                  }`
                : t("script-list.preparse_none")
        ui.showSuccessMessage(`${actionText}: ${fileName}${parseText}`)
        await fetchLocalScripts()
        await openLocalScript(fileName)
    } catch (error) {
        console.error("下载脚本失败", error)
        ui.showErrorMessage(t("script-list.download_update_failed"))
    }
}

async function openScriptDirectory() {
    try {
        await openExplorer(scriptsDir.value)
    } catch (error) {
        console.error("打开目录失败", error)
        ui.showErrorMessage(t("script-list.open_directory_failed"))
    }
}

/**
 * 打开图色工具页面。
 */
async function openColorToolPage() {
    if (!env.isApp) {
        router.push({ name: "script-color-tool" })
        return
    }

    try {
        await openSChat("/scripts/color-tool")
    } catch (error) {
        console.error("打开图色工具新窗口失败", error)
        router.push({ name: "script-color-tool" })
    }
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
                addConsoleLog("info", t("script-list.scheduler_stop_requested"))
            } catch (error) {
                console.error("停止调度器失败", error)
                ui.showErrorMessage(t("script-list.stop_scheduler_failed"))
            }
            return
        }
        await runScheduler()
        return
    }

    if (!activeTab.value) return
    if (activeTab.value.type === "online") {
        ui.showErrorMessage(t("script-list.download_first"))
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
        ui.showErrorMessage(t("script-list.run_script_failed"))
        addConsoleLog("error", t("script-list.run_script_failed_with_error", { error: String(error) }))
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
        ui.showErrorMessage(t("script-list.enter_script_name"))
        return
    }

    try {
        const fileName = `${newScriptName.value.trim()}.js`
        const filePath = `${scriptsDir.value}\\${fileName}`

        await writeTextFile(filePath, newScriptContent.value)
        ui.showSuccessMessage(t("script-list.script_created", { path: filePath }))
        showNewScriptDialog.value = false
        await fetchLocalScripts()
        await openLocalScript(fileName)
    } catch (error) {
        console.error("创建脚本失败", error)
        ui.showErrorMessage(t("script-list.create_script_failed"))
    }
}

/**
 * 判断控制台是否处于底部附近。
 * @returns 是否贴近底部
 */
function isConsoleNearBottom(): boolean {
    const consoleContainer = consoleOutputRef.value
    if (!consoleContainer) {
        return true
    }
    const threshold = 24
    return consoleContainer.scrollTop + consoleContainer.clientHeight >= consoleContainer.scrollHeight - threshold
}

/**
 * 处理控制台滚动，记录当前是否贴底。
 */
function handleConsoleScroll() {
    isConsolePinnedToBottom.value = isConsoleNearBottom()
}

/**
 * 将控制台滚动到底部。
 */
function scrollConsoleToBottom() {
    const consoleContainer = consoleOutputRef.value
    if (!consoleContainer) {
        return
    }
    consoleContainer.scrollTop = consoleContainer.scrollHeight
}

/**
 * 添加控制台日志
 */
function addConsoleLog(level: string, message: string) {
    scriptRuntime.appendConsoleLog(level, message)
}

/**
 * 清空控制台
 */
async function clearConsole() {
    try {
        await clearScriptMcpConsole(undefined, true)
    } catch (error) {
        console.error("清空脚本控制台缓存失败", error)
    }
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
 * 切换右侧状态栏显示
 */
function toggleStatusPanel() {
    openSidePanel("status")
}

/**
 * 清除指定标题的脚本状态（仅前端显示层）。
 */
async function clearStatus(title: string, scope?: string) {
    const targetPath =
        scope || activeLocalScriptPath.value || (runningScriptPaths.value.length === 1 ? runningScriptPaths.value[0] : undefined)
    try {
        await clearScriptMcpStatus(targetPath, title)
    } catch (error) {
        console.error("清空脚本状态缓存失败", error)
    }
    scriptRuntime.removeScriptStatus(title, scope)
}

/**
 * 清空全部脚本状态（仅前端显示层）。
 */
async function clearAllStatus() {
    const visibleStatuses = [...scriptStatuses.value]
    if (visibleStatuses.length === 0) {
        return
    }
    try {
        await Promise.all(visibleStatuses.map(item => clearScriptMcpStatus(item.scope, item.title)))
    } catch (error) {
        console.error("批量清空脚本状态缓存失败", error)
    }
    for (const item of visibleStatuses) {
        scriptRuntime.removeScriptStatus(item.title, item.scope)
    }
}

/**
 * 判断当前协助请求是否为点选模式。
 */
const isScriptHelpPointMode = computed(() => activeScriptHelpRequest.value?.selectionMode === "point")

/**
 * 判断当前协助请求是否为框选模式。
 */
const isScriptHelpRegionMode = computed(() => activeScriptHelpRequest.value?.selectionMode === "region")

/**
 * 判断当前协助请求是否已完成有效选择。
 */
const hasScriptHelpSelection = computed(() =>
    isScriptHelpPointMode.value
        ? Boolean(scriptHelpPoint.value)
        : Boolean(scriptHelpRegion.value && scriptHelpRegion.value.width > 0 && scriptHelpRegion.value.height > 0)
)

/**
 * 清理协助弹窗本地状态。
 */
function resetScriptHelpState() {
    showScriptHelpDialog.value = false
    scriptHelpSubmitting.value = false
    activeScriptHelpRequest.value = null
    scriptHelpPoint.value = null
    scriptHelpRegion.value = null
    scriptHelpNote.value = ""
    scriptHelpDragging.value = false
    scriptHelpDragStart.value = null
}

/**
 * 读取当前图片显示尺寸与原图尺寸，用于坐标换算。
 * @returns 坐标换算所需的图片元信息
 */
function getScriptHelpImageMetrics() {
    const image = scriptHelpImageRef.value
    if (!image) return null
    const rect = image.getBoundingClientRect()
    const naturalWidth = image.naturalWidth || image.width
    const naturalHeight = image.naturalHeight || image.height
    if (!rect.width || !rect.height || !naturalWidth || !naturalHeight) {
        return null
    }
    return {
        rect,
        naturalWidth,
        naturalHeight,
    }
}

/**
 * 将鼠标事件坐标换算为原图像素点。
 * @param clientX 鼠标横坐标
 * @param clientY 鼠标纵坐标
 * @returns 原图像素点
 */
function getScriptHelpImagePointFromClient(clientX: number, clientY: number): ScriptHelpPoint | null {
    const metrics = getScriptHelpImageMetrics()
    if (!metrics) return null
    const relativeX = (clientX - metrics.rect.left) / metrics.rect.width
    const relativeY = (clientY - metrics.rect.top) / metrics.rect.height
    const x = Math.min(metrics.naturalWidth - 1, Math.max(0, Math.round(relativeX * metrics.naturalWidth)))
    const y = Math.min(metrics.naturalHeight - 1, Math.max(0, Math.round(relativeY * metrics.naturalHeight)))
    return { x, y }
}

/**
 * 根据起止点生成标准化区域。
 * @param start 起点
 * @param end 终点
 * @returns 归一化后的区域
 */
function createScriptHelpRegion(start: ScriptHelpPoint, end: ScriptHelpPoint): ScriptHelpRegion {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const x2 = Math.max(start.x, end.x)
    const y2 = Math.max(start.y, end.y)
    return {
        x,
        y,
        width: x2 - x + 1,
        height: y2 - y + 1,
        x2,
        y2,
    }
}

/**
 * 开始处理协助图片上的点选或框选。
 * @param event 指针事件
 */
function handleScriptHelpPointerDown(event: PointerEvent) {
    if (!activeScriptHelpRequest.value || scriptHelpSubmitting.value) return
    const point = getScriptHelpImagePointFromClient(event.clientX, event.clientY)
    if (!point) return
    if (isScriptHelpPointMode.value) {
        scriptHelpPoint.value = point
        scriptHelpRegion.value = null
        return
    }
    scriptHelpDragging.value = true
    scriptHelpDragStart.value = point
    scriptHelpRegion.value = createScriptHelpRegion(point, point)
}

/**
 * 更新框选拖拽区域。
 * @param event 指针事件
 */
function handleScriptHelpPointerMove(event: PointerEvent) {
    if (!scriptHelpDragging.value || !scriptHelpDragStart.value || !isScriptHelpRegionMode.value) return
    const point = getScriptHelpImagePointFromClient(event.clientX, event.clientY)
    if (!point) return
    scriptHelpRegion.value = createScriptHelpRegion(scriptHelpDragStart.value, point)
}

/**
 * 结束框选拖拽。
 * @param event 指针事件
 */
function handleScriptHelpPointerUp(event: PointerEvent) {
    if (!scriptHelpDragging.value || !scriptHelpDragStart.value || !isScriptHelpRegionMode.value) return
    const point = getScriptHelpImagePointFromClient(event.clientX, event.clientY)
    if (point) {
        scriptHelpRegion.value = createScriptHelpRegion(scriptHelpDragStart.value, point)
    }
    scriptHelpDragging.value = false
    scriptHelpDragStart.value = null
}

/**
 * 将原图点位换算到当前显示坐标，供前端绘制标记。
 * @param point 原图点位
 * @returns 当前显示区域内的偏移
 */
function getScriptHelpDisplayPoint(point: ScriptHelpPoint) {
    const metrics = getScriptHelpImageMetrics()
    if (!metrics) return null
    return {
        left: (point.x / metrics.naturalWidth) * metrics.rect.width,
        top: (point.y / metrics.naturalHeight) * metrics.rect.height,
    }
}

/**
 * 将原图框选区域换算到当前显示坐标，供前端绘制覆盖层。
 * @param region 原图区域
 * @returns 当前显示区域内的覆盖层位置
 */
function getScriptHelpDisplayRegion(region: ScriptHelpRegion) {
    const metrics = getScriptHelpImageMetrics()
    if (!metrics) return null
    const left = (region.x / metrics.naturalWidth) * metrics.rect.width
    const top = (region.y / metrics.naturalHeight) * metrics.rect.height
    const right = ((region.x2 + 1) / metrics.naturalWidth) * metrics.rect.width
    const bottom = ((region.y2 + 1) / metrics.naturalHeight) * metrics.rect.height
    return {
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
    }
}

/**
 * 提交协助结果给后端。
 * @param confirmed 是否确认提交
 */
async function submitScriptHelpResponse(confirmed: boolean) {
    if (!activeScriptHelpRequest.value || scriptHelpSubmitting.value) return
    const request = activeScriptHelpRequest.value
    const metrics = getScriptHelpImageMetrics()
    const response: ScriptHelpResponse = {
        confirmed,
        selectionMode: request.selectionMode,
        point: confirmed && isScriptHelpPointMode.value ? scriptHelpPoint.value : null,
        region: confirmed && isScriptHelpRegionMode.value ? scriptHelpRegion.value : null,
        imageWidth: metrics?.naturalWidth ?? null,
        imageHeight: metrics?.naturalHeight ?? null,
        note: scriptHelpNote.value.trim() || null,
    }
    scriptHelpSubmitting.value = true
    try {
        await resolveScriptHelpRequest(request.requestId, response)
        resetScriptHelpState()
    } catch (error) {
        console.error("回传协助请求失败", error)
        scriptHelpSubmitting.value = false
        ui.showErrorMessage("回传协助请求失败")
    }
}

/**
 * 监听 MCP 发起的协助请求，并展示前端标注弹窗。
 */
async function initScriptHelpRequestListener() {
    if (unlistenScriptHelpRequestFn) return
    try {
        unlistenScriptHelpRequestFn = await listen<ScriptHelpRequestEvent>("script-help-request", event => {
            if (!event?.payload?.requestId || !event.payload.image) return
            resetScriptHelpState()
            activeScriptHelpRequest.value = event.payload
            showScriptHelpDialog.value = true
        })
    } catch (error) {
        console.error("监听脚本协助请求失败", error)
    }
}

/**
 * 当前点选标记的显示样式。
 */
const scriptHelpPointMarkerStyle = computed(() => {
    if (!scriptHelpPoint.value) return null
    const point = getScriptHelpDisplayPoint(scriptHelpPoint.value)
    if (!point) return null
    return {
        left: `${point.left}px`,
        top: `${point.top}px`,
    }
})

/**
 * 当前框选标记的显示样式。
 */
const scriptHelpRegionMarkerStyle = computed(() => {
    if (!scriptHelpRegion.value) return null
    const region = getScriptHelpDisplayRegion(scriptHelpRegion.value)
    if (!region) return null
    return {
        left: `${region.left}px`,
        top: `${region.top}px`,
        width: `${region.width}px`,
        height: `${region.height}px`,
    }
})

/**
 * 从本地存储加载脚本页 MCP 端口配置。
 */
function loadScriptMcpPortConfig() {
    const stored = localStorage.getItem(SCRIPT_MCP_PORT_STORAGE_KEY)
    if (!stored) {
        scriptMcpPortInput.value = scriptMcpServerState.value.port || 28080
        return
    }

    const parsed = Number.parseInt(stored, 10)
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        scriptMcpPortInput.value = scriptMcpServerState.value.port || 28080
        return
    }

    scriptMcpPortInput.value = parsed
}

/**
 * 持久化脚本页 MCP 端口配置。
 */
function persistScriptMcpPortConfig() {
    localStorage.setItem(SCRIPT_MCP_PORT_STORAGE_KEY, String(scriptMcpPortInput.value))
}

/**
 * 同步脚本页 MCP 服务状态。
 */
async function syncScriptMcpServerState() {
    if (!env.isApp) {
        return
    }
    try {
        scriptMcpServerState.value = await getScriptMcpServerState()
        if (scriptMcpServerState.value.port > 0) {
            scriptMcpPortInput.value = scriptMcpServerState.value.port
            persistScriptMcpPortConfig()
        }
    } catch (error) {
        console.error("获取脚本 MCP 服务状态失败", error)
    }
}

/**
 * 打开脚本页 MCP 服务面板。
 */
async function openScriptMcpDialog() {
    showScriptMcpDialog.value = true
    await syncScriptMcpServerState()
}

/**
 * 切换脚本页 MCP 服务开关。
 */
async function toggleScriptMcpServer() {
    if (!env.isApp || scriptMcpUpdating.value) {
        return
    }
    scriptMcpUpdating.value = true
    try {
        const nextEnabled = !scriptMcpServerState.value.enabled
        if (
            nextEnabled &&
            (!Number.isFinite(scriptMcpPortInput.value) || scriptMcpPortInput.value <= 0 || scriptMcpPortInput.value > 65535)
        ) {
            ui.showErrorMessage("MCP 端口必须在 1 到 65535 之间")
            return
        }
        persistScriptMcpPortConfig()
        scriptMcpServerState.value = await setScriptMcpServerEnabled(nextEnabled, nextEnabled ? scriptMcpPortInput.value : undefined)
        scriptMcpPortInput.value = scriptMcpServerState.value.port
        ui.showSuccessMessage(nextEnabled ? "MCP Server 已启动" : "MCP Server 已停止")
    } catch (error) {
        console.error("切换脚本 MCP 服务失败", error)
        ui.showErrorMessage("切换 MCP Server 失败")
        await syncScriptMcpServerState()
    } finally {
        scriptMcpUpdating.value = false
    }
}

/**
 * 复制脚本页 MCP 地址。
 */
async function copyScriptMcpAddress() {
    try {
        await copyText(scriptMcpServerState.value.address)
        ui.showSuccessMessage("MCP 地址已复制")
    } catch (error) {
        console.error("复制 MCP 地址失败", error)
        ui.showErrorMessage("复制 MCP 地址失败")
    }
}

/**
 * 监听文件变化事件
 */
async function initFileChangeListener() {
    try {
        unlistenFileChangedFn = await listen<string>("file-changed", event => {
            const filePath = event.payload
            const fileName = filePath.split(/[\\/]/).pop() || ""
            if (!fileName) return
            void reloadFileContent(fileName)
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
        ui.showErrorMessage(t("script-list.enter_script_name"))
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
        ui.showSuccessMessage(t("script-list.rename_success"))

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
        await scriptRuntime.renameScriptHotkeyBinding(oldFileName, newFileName, localScripts.value, scriptsDir.value)

        await fetchLocalScripts()
    } catch (error) {
        console.error("重命名失败", error)
        ui.showErrorMessage(t("script-list.rename_failed"))
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
        await scriptRuntime.clearScriptHotkeyBinding(fileName, localScripts.value, scriptsDir.value)
        ui.showSuccessMessage(t("script-list.file_moved_to_recycle_bin"))
        await fetchLocalScripts()
    } catch (error) {
        console.error("删除失败", error)
        ui.showErrorMessage(t("script-list.delete_failed"))
    }
}

async function deleteOnlineScript(script: Script) {
    try {
        const result = await deleteScriptMutation({ id: script.id })
        if (result) {
            ui.showSuccessMessage(t("script-list.script_deleted"))
            await fetchOnlineScripts()
        }
    } catch (error) {
        console.error("删除失败", error)
        ui.showErrorMessage(t("script-list.delete_failed"))
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
            const latest = await scriptQuery({ id: script.id, preview: true }, { requestPolicy: "network-only" })
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
    const result = await scriptQuery({ id: script.id, preview: true }, { requestPolicy: "network-only" })
    if (!result) {
        ui.showErrorMessage(t("script-list.fetch_script_content_failed"))
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
        if (!(await ui.showDialog(t("script-list.confirm_close_title"), t("script-list.confirm_close_message")))) {
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
    if (hasUnsaved && !confirm(t("script-list.confirm_close_others_unsaved"))) {
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
    if (hasUnsaved && !confirm(t("script-list.confirm_close_all_unsaved"))) {
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
 * 根据文件名查找已打开的本地脚本标签。
 * @param fileName 脚本文件名
 * @returns 匹配的标签页，未找到则返回 null
 */
function findLocalTabByName(fileName: string) {
    return openedTabs.value.find(tab => tab.type === "local" && tab.name === fileName) ?? null
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
    const tab = findLocalTabByName(fileName)
    if (!tab) return

    try {
        const content = await loadLocalScriptContent(fileName)
        tab.content = content
        tab.modified = false
        if (tab.id === activeTabId.value) {
            nextTick(() => {
                codeEditor.value?.safeUpdate(content)
            })
        }
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
                ui.showSuccessMessage(t("script-list.script_updated_success"))
            }
        } else {
            result = await createScriptMutation({
                input: scriptInput,
            })
            ui.showSuccessMessage(t("script-list.script_publish_success"))
            await fetchScriptCategories()

            if (result) {
                const newHeader = replaceScriptHeader(content, {
                    id: result.id,
                    name: header.name || fileName.replace(/\.js$/, ""),
                    desc: header.desc || "",
                    author: result.user?.name || "",
                    date: result.updateAt || undefined,
                })

                const filePath = `${scriptsDir.value}\\${fileName}`
                await writeTextFile(filePath, newHeader)
                await refreshOnlineScriptUpdateMap()

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
        ui.showErrorMessage(t("script-list.publish_update_failed"))
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

/**
 * 从脚本页打开或聚焦云游戏窗口。
 */
async function openCloudGameFromScript() {
    await cloudgame.openOrFocusCloudGame()
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
        ui.showErrorMessage(t("script-list.restart_as_admin_failed"))
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
            ui.showSuccessMessage(t("script-list.global_shortcut_disabled"))
        } else {
            // 启用快捷键
            await register("F10", e => {
                if (e.state === "Pressed") {
                    // 当按下 F10 时，运行当前脚本
                    runCurrentTab()
                }
            })
            globalShortcutEnabled.value = true
            ui.showSuccessMessage(t("script-list.global_shortcut_enabled"))
        }
    } catch (error) {
        console.error("切换全局快捷键失败", error)
        ui.showErrorMessage(t("script-list.toggle_global_shortcut_failed"))
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

watch(
    () => scriptRuntime.lastEventAt,
    timestamp => {
        if (!timestamp) return
        lastScriptEventAt = timestamp
    }
)

watch(showConsole, async visible => {
    if (!visible) {
        return
    }
    isConsolePinnedToBottom.value = true
    await nextTick()
    scrollConsoleToBottom()
})

watch(
    () => consoleLogs.value.length,
    async () => {
        if (!showConsole.value || !isConsolePinnedToBottom.value) {
            return
        }
        await nextTick()
        scrollConsoleToBottom()
    }
)

onMounted(async () => {
    if (!env.isApp) {
        startScriptRuntimeWatchdog()

        try {
            await scriptRuntime.initRuntimeTracking()
        } catch (error) {
            console.error("初始化脚本运行态监听失败", error)
        }
    }

    await fetchScriptCategories()
    await initScriptsDir()
    await initEngineDts()
    loadSchedulerConfig()
    loadScriptMcpPortConfig()
    loadScriptConfigItems()
    scriptRuntime.loadScriptHotkeys()
    await fetchLocalScripts()
    document.addEventListener("keydown", handleKeyDown)
    await initFileChangeListener()
    await initScriptHelpRequestListener()
    await syncRunningStateFromBackend()
    await syncScriptMcpServerState()
    await cloudgame.initCloudGameTracking()
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
    if (unlistenFileChangedFn) {
        unlistenFileChangedFn()
    }
    if (unlistenScriptHelpRequestFn) {
        unlistenScriptHelpRequestFn()
        unlistenScriptHelpRequestFn = null
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
                            :title="$t('script-list.scheduler')"
                        >
                            <Icon icon="ri:git-branch-line" class="w-4 h-4" />
                        </button>
                        <button
                            class="p-2 rounded-md text-xs flex gap-2 font-bold cursor-pointer hover:bg-base-300"
                            :class="{ 'bg-base-300': viewMode === 'local' }"
                            @click="switchToLocal"
                        >
                            <Icon icon="ri:folder-line" class="w-4 h-4" />
                            {{ $t("script-list.local") }}
                        </button>
                        <button
                            class="p-2 rounded-md text-xs flex gap-2 font-bold cursor-pointer hover:bg-base-300"
                            :class="{ 'bg-base-300': viewMode === 'online' }"
                            @click="switchToOnline"
                        >
                            <Icon icon="ri:cloud-line" class="w-4 h-4" />
                            {{ $t("script-list.online") }}
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
                        :placeholder="$t('script-list.search_placeholder')"
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
                            {{ $t("script-list.empty_local") }}
                        </div>
                        <div
                            v-else-if="
                                (viewMode === 'online' && onlineScripts.length === 0) ||
                                (viewMode === 'scheduler' && schedulerConfig.steps.length === 0)
                            "
                            class="flex justify-center items-center h-full text-base-content/50 p-4"
                        >
                            {{ viewMode === "scheduler" ? $t("script-list.empty_scheduler") : $t("script-list.empty_online") }}
                        </div>
                        <div v-else>
                            <template v-if="viewMode === 'scheduler'">
                                <div class="px-3 py-2 text-xs text-base-content/60 border-b border-base-200">
                                    {{ $t("script-list.scheduler_script_list") }}
                                </div>
                                <div
                                    v-for="(step, index) in schedulerConfig.steps"
                                    :key="step.id"
                                    class="px-3 py-2 rounded hover:bg-base-200 cursor-pointer flex items-center gap-2 text-sm"
                                    @click="openLocalScript(step.scriptName)"
                                >
                                    <div class="text-xs font-mono text-base-content/60 w-7 shrink-0">#{{ index + 1 }}</div>
                                    <Icon icon="ri:file-line" class="w-4 h-4 shrink-0" />
                                    <div class="flex-1 truncate">{{ step.scriptName || $t("script-list.no_script_selected") }}</div>
                                    <Icon
                                        v-if="step.flowControl.enabled"
                                        icon="ri:git-branch-line"
                                        class="w-4 h-4 text-warning shrink-0"
                                        :title="$t('script-list.flow_control_enabled')"
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
                                            :title="$t('script-list.stop_script')"
                                            @click.stop="stopLocalScriptByName(script)"
                                        >
                                            <span class="w-3 h-3 bg-error rounded-xs" />
                                        </button>
                                        <Icon v-else icon="ri:file-line" class="w-4 h-4 shrink-0" />
                                        <div v-if="editingScript !== script" class="flex-1 min-w-0 flex items-center gap-2">
                                            <span class="truncate">{{ script }}</span>
                                            <span v-if="scriptRuntime.scriptHotkeyStore[script]" class="badge badge-outline badge-xs shrink-0">
                                                {{ scriptRuntime.formatScriptHotkeyBadgeText(scriptRuntime.scriptHotkeyStore[script]) }}
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
                                                {{ $t("script-list.new_script") }}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                                @click="openScriptDirectory"
                                            >
                                                <Icon icon="ri:folder-open-line" class="w-4 h-4 mr-2" />
                                                {{ $t("script-list.open_directory") }}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                                @click.stop="startEditScript(script)"
                                            >
                                                <Icon icon="ri:edit-line" class="w-4 h-4 mr-2" />
                                                {{ $t("char-build.rename") }}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                                @click="openScriptHotkeyDialog(script)"
                                            >
                                                <Icon icon="ri:edit-line" class="w-4 h-4 mr-2" />
                                                {{
                                                    scriptRuntime.scriptHotkeyStore[script]
                                                        ? $t("script-list.edit_hotkey")
                                                        : $t("script-list.save_hotkey")
                                                }}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                v-if="scriptRuntime.scriptHotkeyStore[script]"
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-warning data-highlighted:text-base-100"
                                                @click="clearScriptHotkeyBinding(script)"
                                            >
                                                <Icon icon="ri:close-circle-line" class="w-4 h-4 mr-2" />
                                                {{ $t("script-list.clear_hotkey") }}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                v-if="scriptRuntime.scriptHotkeyStore[script]"
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                                @click="toggleScriptHotkeyEnabled(script)"
                                            >
                                                <Icon icon="ri:stop-circle-line" class="w-4 h-4 mr-2" />
                                                {{
                                                    scriptRuntime.scriptHotkeyStore[script].enabled
                                                        ? $t("script-list.disable_hotkey")
                                                        : $t("script-list.enable_hotkey")
                                                }}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-success data-highlighted:text-base-100"
                                                @click="publishScript(script)"
                                            >
                                                <Icon icon="ri:upload-cloud-line" class="w-4 h-4 mr-2" />
                                                {{ $t("script-list.publish_update") }}
                                            </ContextMenuItem>
                                            <ContextMenuItem
                                                class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-error data-highlighted:text-base-100"
                                                @click="deleteScript(script)"
                                            >
                                                <Icon icon="ri:delete-bin-line" class="w-4 h-4 mr-2" />
                                                {{ $t("common.delete") }}
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
                                                    {{
                                                        getOnlineScriptActionType(script) === "update"
                                                            ? $t("script-list.update")
                                                            : getOnlineScriptActionType(script) === "latest"
                                                              ? $t("script-list.latest")
                                                              : $t("script-list.download")
                                                    }}
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
                                            {{ $t("common.delete") }}
                                        </ContextMenuItem>
                                    </template>
                                </ContextMenu>
                            </template>
                        </div>
                        <div v-if="viewMode === 'online'" class="flex justify-center p-2">
                            <button v-if="onlineScripts.length < totalCount" class="btn btn-sm btn-ghost" @click="loadMore">
                                {{ $t("script-list.load_more") }}
                            </button>
                        </div>
                    </ScrollArea>
                    <template v-if="viewMode === 'local'" #menu>
                        <ContextMenuItem
                            class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                            @click="openNewScriptDialog"
                        >
                            <Icon icon="ri:add-line" class="w-4 h-4 mr-2" />
                            {{ $t("script-list.new_script") }}
                        </ContextMenuItem>
                        <ContextMenuItem
                            class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                            @click="openScriptDirectory"
                        >
                            <Icon icon="ri:folder-open-line" class="w-4 h-4 mr-2" />
                            {{ $t("script-list.open_directory") }}
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
                                            {{ $t("script-list.close_others") }}
                                        </ContextMenuItem>
                                        <ContextMenuItem
                                            class="text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                            @click="closeAllTabs"
                                        >
                                            {{ $t("script-list.close_all") }}
                                        </ContextMenuItem>
                                    </template>
                                </ContextMenu>
                            </div>
                        </ScrollArea>
                        <!-- actions -->
                        <div class="flex items-center gap-2 ml-2 px-1">
                            <button
                                class="btn btn-sm btn-ghost btn-square"
                                :class="{ 'btn-primary': isCloudGameEntryActive }"
                                :disabled="cloudgame.opening"
                                @click="openCloudGameFromScript"
                                :title="cloudGameEntryTitle"
                            >
                                <Icon :icon="cloudgame.isBridgeConnected ? 'ri:cloud-fill' : 'ri:cloud-line'" class="w-4 h-4" />
                            </button>
                            <button
                                class="btn btn-sm btn-ghost btn-square"
                                @click="showConsole = !showConsole"
                                :title="$t('script-list.toggle_console')"
                            >
                                <Icon :icon="showConsole ? 'ri:terminal-box-line' : 'ri:terminal-line'" class="w-4 h-4" />
                            </button>
                            <button
                                class="btn btn-sm btn-ghost btn-square"
                                @click="toggleStatusPanel"
                                :title="$t('script-list.toggle_status_panel')"
                            >
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
                                :title="$t('char-build.save')"
                            >
                                <Icon icon="ri:save-line" class="w-4 h-4" />
                            </button>
                            <div class="dropdown dropdown-end">
                                <div
                                    tabindex="0"
                                    role="button"
                                    class="btn btn-sm btn-ghost btn-square"
                                    :title="$t('script-list.more_actions')"
                                >
                                    <Icon icon="ri:more-line" class="w-4 h-4" />
                                </div>
                                <ul tabindex="-1" class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
                                    <li>
                                        <a @click="openScriptMcpDialog">MCP Server</a>
                                    </li>
                                    <li>
                                        <a @click="openSchedulerDialog">{{ $t("script-list.scheduler_config") }}</a>
                                    </li>
                                    <li>
                                        <a @click="openSidePanel('config')">{{ $t("script-list.script_config") }}</a>
                                    </li>
                                    <li>
                                        <a @click="openColorToolPage">{{ $t("script-list.color_tool") }}</a>
                                    </li>
                                    <li>
                                        <a @click="openRecordToolPage">{{ $t("script-list.record_tool") }}</a>
                                    </li>
                                    <li>
                                        <a @click="restartAsAdmin">{{ $t("script-list.restart_as_admin") }}</a>
                                    </li>
                                    <li>
                                        <a @click="toggleGlobalShortcut">{{
                                            globalShortcutEnabled
                                                ? $t("script-list.disable_global_shortcut")
                                                : $t("script-list.enable_global_shortcut")
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
                                    :placeholder="$t('script-list.script_content_placeholder')"
                                    class="w-full h-full p-2 font-mono text-sm"
                                    @update:modelValue="onCodeEditorUpdate"
                                />
                            </ScrollArea>
                        </div>
                        <div v-else class="flex-1 flex items-center justify-center text-base-content/50">
                            <div class="text-center">
                                <Icon icon="ri:file-line" class="w-16 h-16 mx-auto mb-4" />
                                <p>{{ $t("script-list.select_script_to_edit") }}</p>
                            </div>
                        </div>
                    </div>

                    <!-- 控制台面板 -->
                    <div v-if="showConsole" class="h-48 border-t border-base-300 flex flex-col bg-base-900">
                        <div class="h-8 bg-base-800 border-b border-base-700 flex items-center justify-between px-3 shrink-0">
                            <div class="flex items-center gap-2">
                                <Icon icon="ri:terminal-line" class="w-4 h-4 text-base-content/60" />
                                <span class="text-xs text-base-content/60">{{ $t("script-list.console") }}</span>
                                <span v-if="isRunning" class="text-xs text-info">
                                    {{
                                        $t("script-runtime-floating.runningLabel", {
                                            count: runningScriptCount > 0 ? runningScriptCount : 1,
                                        })
                                    }}<span v-if="runningScriptName">: {{ runningScriptName }}</span>
                                    <span v-if="runningScriptCount > 1">（{{ runningScriptCount }}）</span>
                                </span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button class="btn btn-xs btn-ghost" @click="clearConsole" :title="$t('script-list.clear')">
                                    <Icon icon="ri:delete-bin-line" class="w-3 h-3" />
                                </button>
                                <button class="btn btn-xs btn-ghost" @click="showConsole = false" :title="$t('script-list.close')">
                                    <Icon icon="ri:close-line" class="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                        <div
                            id="console-output"
                            ref="consoleOutputRef"
                            class="flex-1 overflow-auto p-3 font-mono text-xs user-select"
                            @scroll="handleConsoleScroll"
                        >
                            <div v-if="consoleLogs.length === 0" class="text-base-content/40 text-center py-4">
                                {{ $t("script-list.no_output") }}
                            </div>
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
                                :title="$t('script-list.clear')"
                            >
                                <Icon icon="ri:delete-bin-line" class="w-3 h-3" />
                            </button>
                            <button class="btn btn-xs btn-ghost" @click="showStatusPanel = false" :title="$t('script-list.close')">
                                <Icon icon="ri:close-line" class="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    <template v-if="sidePanelTab === 'config'">
                        <div v-if="!currentConfigScope" class="flex-1 flex items-center justify-center text-base-content/50 text-sm p-3">
                            {{ $t("script-list.open_and_run_local_first") }}
                        </div>
                        <div
                            v-else-if="sortedScriptConfigItems.length === 0"
                            class="flex-1 flex items-center justify-center text-base-content/50 text-sm p-3"
                        >
                            {{ $t("script-list.no_config_yet") }}
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
                                                :title="$t('script-list.delete_config')"
                                            >
                                                <Icon icon="ri:delete-bin-line" class="w-3 h-3" />
                                            </button>
                                        </div>
                                        <div v-if="item.desc" class="text-xs text-base-content/70 break-all">{{ item.desc }}</div>
                                        <div class="text-[11px] text-base-content/50">{{ $t("script-list.type") }}: {{ item.kind }}</div>

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
                                            <div v-if="item.options.length === 0" class="text-xs text-base-content/60">
                                                {{ $t("script-list.no_options") }}
                                            </div>
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
                                                            :title="$t('script-list.move_up')"
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
                                                            :title="$t('script-list.move_down')"
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
                                            <span class="text-sm">{{ $t("script-list.enable") }}</span>
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
                            {{ $t("script-list.no_status") }}
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
                                            <button class="btn btn-xs btn-ghost" @click="clearStatus(item.title, item.scope)">
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

        <dialog v-if="showScriptHelpDialog" :open="showScriptHelpDialog" class="modal">
            <div class="modal-box max-w-6xl">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h3 class="font-bold text-lg">{{ activeScriptHelpRequest?.title || "协助标注" }}</h3>
                        <div class="text-sm text-base-content/70 mt-1">
                            {{
                                activeScriptHelpRequest?.message ||
                                (isScriptHelpPointMode ? "请直接点击目标点。" : "请在图片上拖拽框选目标区域。")
                            }}
                        </div>
                    </div>
                    <div class="badge badge-outline">
                        {{ isScriptHelpPointMode ? "点选" : "框选" }}
                    </div>
                </div>

                <div class="mt-4 rounded-xl border border-base-300 bg-base-200/30 p-3">
                    <div
                        class="relative inline-block max-w-full select-none"
                        @pointerdown.prevent="handleScriptHelpPointerDown"
                        @pointermove.prevent="handleScriptHelpPointerMove"
                        @pointerup.prevent="handleScriptHelpPointerUp"
                        @pointercancel.prevent="handleScriptHelpPointerUp"
                    >
                        <img
                            ref="scriptHelpImageRef"
                            :src="activeScriptHelpRequest?.image"
                            alt="script help"
                            class="max-w-full max-h-[70vh] rounded-lg border border-base-300"
                            draggable="false"
                        />
                        <div
                            v-if="scriptHelpPointMarkerStyle"
                            class="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-error bg-error/30 shadow"
                            :style="scriptHelpPointMarkerStyle"
                        >
                            <div class="absolute left-1/2 top-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 bg-error/80"></div>
                            <div class="absolute left-1/2 top-1/2 h-px w-8 -translate-x-1/2 -translate-y-1/2 bg-error/80"></div>
                        </div>
                        <div
                            v-if="scriptHelpRegionMarkerStyle"
                            class="pointer-events-none absolute border-2 border-primary bg-primary/15 shadow-inner"
                            :style="scriptHelpRegionMarkerStyle"
                        ></div>
                    </div>
                </div>

                <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <div class="rounded-xl border border-base-300 p-3 text-sm">
                        <div v-if="isScriptHelpPointMode">
                            当前点位：
                            {{ scriptHelpPoint ? `(${scriptHelpPoint.x}, ${scriptHelpPoint.y})` : "未选择" }}
                        </div>
                        <div v-else>
                            当前区域：
                            {{
                                scriptHelpRegion
                                    ? `(${scriptHelpRegion.x}, ${scriptHelpRegion.y}) -> (${scriptHelpRegion.x2}, ${scriptHelpRegion.y2}), ${scriptHelpRegion.width} x ${scriptHelpRegion.height}`
                                    : "未选择"
                            }}
                        </div>
                    </div>
                    <label class="form-control">
                        <div class="label py-1">
                            <span class="label-text text-sm">备注</span>
                        </div>
                        <textarea
                            v-model="scriptHelpNote"
                            class="textarea textarea-bordered h-24 resize-none"
                            placeholder="可选，补充你的判断依据"
                        />
                    </label>
                </div>

                <div class="mt-4 flex justify-end gap-2">
                    <button class="btn btn-ghost" :disabled="scriptHelpSubmitting" @click="submitScriptHelpResponse(false)">取消</button>
                    <button
                        class="btn btn-primary"
                        :disabled="!hasScriptHelpSelection || scriptHelpSubmitting"
                        @click="submitScriptHelpResponse(true)"
                    >
                        确认返回
                    </button>
                </div>
            </div>
        </dialog>

        <dialog :open="showNewScriptDialog" class="modal">
            <div class="modal-box">
                <h3 class="font-bold text-lg mb-4">{{ $t("script-list.new_script") }}</h3>
                <div class="mb-4">
                    <label class="label block">
                        <div class="mb-2 text-sm">{{ $t("script-list.script_name") }}</div>
                        <input
                            v-model="newScriptName"
                            type="text"
                            :placeholder="$t('script-list.enter_script_name')"
                            class="input input-bordered w-full"
                        />
                    </label>
                </div>
                <div class="mb-4">
                    <label class="label block">
                        <div class="mb-2 text-sm">{{ $t("script-list.script_content") }}</div>
                        <textarea
                            v-model="newScriptContent"
                            :placeholder="$t('script-list.enter_script_content')"
                            class="textarea textarea-bordered w-full h-64 resize-none"
                        />
                    </label>
                </div>
                <div class="flex justify-end gap-2">
                    <button class="btn btn-ghost" @click="showNewScriptDialog = false">{{ $t("setting.cancel") }}</button>
                    <button class="btn btn-primary" @click="createNewScript">{{ $t("script-list.create") }}</button>
                </div>
            </div>
        </dialog>

        <dialog :open="showScriptHotkeyDialog" class="modal">
            <div class="modal-box max-w-lg">
                <h3 class="font-bold text-lg mb-4">{{ $t("script-list.save_hotkey") }}</h3>
                <div class="space-y-3">
                    <div class="text-sm">
                        <span class="text-base-content/70">{{ $t("script-list.script_name") }}：</span>
                        <span class="font-mono">{{ editingHotkeyScriptName }}</span>
                    </div>
                    <label class="label block">
                        <div class="mb-2 text-sm">{{ $t("script-list.ahk_hotkey") }}</div>
                        <input
                            v-model="editingHotkeyValue"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="$t('script-list.hotkey_example')"
                        />
                    </label>
                    <label class="label block">
                        <div class="mb-2 text-sm">{{ $t("script-list.hotif_condition") }}</div>
                        <input
                            v-model="editingHotkeyWinActive"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="$t('script-list.hotif_example')"
                        />
                    </label>
                    <label class="label cursor-pointer justify-start gap-3">
                        <input v-model="editingHotkeyHoldToLoop" type="checkbox" class="checkbox checkbox-sm" />
                        <span class="label-text text-sm">{{ $t("script-list.hold_to_loop") }}</span>
                    </label>
                    <div class="text-xs text-base-content/60 select-text">
                        {{ $t("script-list.hotkey_help") }}
                    </div>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-ghost" @click="showScriptHotkeyDialog = false">{{ $t("setting.cancel") }}</button>
                    <button
                        v-if="scriptRuntime.scriptHotkeyStore[editingHotkeyScriptName]"
                        class="btn btn-warning"
                        @click="(clearScriptHotkeyBinding(editingHotkeyScriptName), (showScriptHotkeyDialog = false))"
                    >
                        {{ $t("script-list.clear_binding") }}
                    </button>
                    <button class="btn btn-primary" @click="saveScriptHotkeyBinding">{{ $t("char-build.save") }}</button>
                </div>
            </div>
        </dialog>

        <dialog :open="showScriptMcpDialog" class="modal">
            <div class="modal-box max-w-4xl">
                <h3 class="font-bold text-lg mb-4">MCP Server (Stream HTTP)</h3>
                <div class="space-y-4">
                    <div class="flex items-center justify-between gap-4 rounded-lg border border-base-300 p-4">
                        <div class="space-y-1">
                            <div class="font-medium">服务开关</div>
                            <div class="text-sm text-base-content/70">
                                {{ scriptMcpServerState.running ? "运行中" : "已停止" }}
                            </div>
                            <div v-if="scriptMcpServerState.lastError" class="text-xs text-error break-all">
                                {{ scriptMcpServerState.lastError }}
                            </div>
                        </div>
                        <div class="flex-1"></div>

                        <input
                            v-model.number="scriptMcpPortInput"
                            type="number"
                            min="1"
                            max="65535"
                            class="input input-bordered w-40"
                            :disabled="scriptMcpServerState.enabled"
                            @change="persistScriptMcpPortConfig"
                        />
                        <button
                            class="btn"
                            :class="scriptMcpServerState.enabled ? 'btn-error' : 'btn-primary'"
                            :disabled="scriptMcpUpdating"
                            @click="toggleScriptMcpServer"
                        >
                            {{ scriptMcpServerState.enabled ? "停止" : "启动" }}
                        </button>
                    </div>
                    <div class="rounded-lg border border-base-300 p-4 space-y-3">
                        <div class="font-medium">MCP 地址</div>
                        <div class="flex items-center gap-2">
                            <input :value="scriptMcpServerState.address" class="input input-bordered flex-1" readonly />
                            <button class="btn btn-primary" @click="copyScriptMcpAddress">复制地址</button>
                        </div>
                    </div>

                    <div class="rounded-lg border border-base-300 p-4 space-y-3">
                        <div class="font-medium">基本操控</div>
                        <div class="flex flex-wrap gap-2">
                            <button class="btn btn-primary" :disabled="!activeTab || activeTab.type !== 'local'" @click="runCurrentTab">
                                运行当前脚本
                            </button>
                            <button class="btn btn-error" :disabled="!isRunning" @click="scriptRuntime.stopAllScripts()">
                                停止全部脚本
                            </button>
                            <button class="btn btn-ghost" @click="openSidePanel('status')">查看状态面板</button>
                            <button class="btn btn-ghost" @click="showConsole = true">查看控制台</button>
                        </div>
                    </div>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-ghost" @click="showScriptMcpDialog = false">关闭</button>
                </div>
            </div>
        </dialog>

        <dialog :open="showSchedulerDialog" class="modal">
            <div class="modal-box max-w-5xl">
                <h3 class="font-bold text-lg mb-4">{{ $t("script-list.scheduler_config") }}</h3>
                <div class="mb-3 flex items-center gap-2">
                    <button class="btn btn-sm btn-primary" @click="addSchedulerStep">{{ $t("script-list.add_local_script") }}</button>
                    <span class="text-xs text-base-content/70">{{ $t("script-list.scheduler_help") }}</span>
                </div>
                <div class="space-y-3 max-h-[60vh] overflow-auto pr-1">
                    <div
                        v-if="schedulerDraftConfig.steps.length === 0"
                        class="border border-dashed border-base-300 rounded p-4 text-center text-base-content/60 text-sm"
                    >
                        {{ $t("script-list.no_steps_config_hint") }}
                    </div>
                    <div
                        v-for="(step, stepIndex) in schedulerDraftConfig.steps"
                        :key="step.id"
                        class="border border-base-300 rounded-lg p-3 bg-base-100/60 space-y-3"
                    >
                        <div class="flex flex-wrap items-center gap-2">
                            <div class="text-xs font-mono text-base-content/70 shrink-0">#{{ stepIndex + 1 }}</div>
                            <select v-model="step.scriptName" class="select select-bordered select-sm min-w-52">
                                <option value="">{{ $t("script-list.select_local_script") }}</option>
                                <option v-for="script in localScripts" :key="script" :value="script">{{ script }}</option>
                            </select>
                            <select v-model="step.flowControl.enabled" class="select select-bordered select-sm">
                                <option :value="false">{{ $t("script-list.sequential_default") }}</option>
                                <option :value="true">{{ $t("script-list.enable_flow_control") }}</option>
                            </select>
                            <button class="btn btn-xs" :disabled="stepIndex === 0" @click="moveSchedulerStep(stepIndex, -1)">
                                {{ $t("script-list.move_up") }}
                            </button>
                            <button
                                class="btn btn-xs"
                                :disabled="stepIndex === schedulerDraftConfig.steps.length - 1"
                                @click="moveSchedulerStep(stepIndex, 1)"
                            >
                                {{ $t("script-list.move_down") }}
                            </button>
                            <button class="btn btn-xs btn-error" @click="removeSchedulerStep(stepIndex)">{{ $t("common.delete") }}</button>
                        </div>

                        <div v-if="step.flowControl.enabled" class="space-y-2 rounded border border-warning/40 p-2">
                            <div class="text-xs font-medium text-warning-content">{{ $t("script-list.flow_control_switch") }}</div>
                            <div
                                v-for="(rule, caseIndex) in step.flowControl.cases"
                                :key="rule.id"
                                class="flex flex-wrap items-center gap-2"
                            >
                                <span class="text-xs">{{ $t("script-list.case_label") }}</span>
                                <input
                                    v-model="rule.matchValue"
                                    type="text"
                                    class="input input-bordered input-sm w-40"
                                    :placeholder="$t('script-list.return_value')"
                                />
                                <span class="text-xs">=></span>
                                <select v-model="rule.targetStepId" class="select select-bordered select-sm min-w-52">
                                    <option :value="null">{{ $t("script-list.no_jump") }}</option>
                                    <option v-for="option in schedulerDraftStepOptions" :key="option.id" :value="option.id">
                                        {{ option.label }}
                                    </option>
                                </select>
                                <button class="btn btn-xs btn-ghost" @click="removeSchedulerCase(stepIndex, caseIndex)">
                                    {{ $t("script-list.delete_case") }}
                                </button>
                            </div>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="text-xs">{{ $t("script-list.default_label") }}</span>
                                <span class="text-xs">=></span>
                                <select v-model="step.flowControl.defaultTargetStepId" class="select select-bordered select-sm min-w-52">
                                    <option :value="null">{{ $t("script-list.next_step_default") }}</option>
                                    <option v-for="option in schedulerDraftStepOptions" :key="option.id" :value="option.id">
                                        {{ option.label }}
                                    </option>
                                </select>
                                <button class="btn btn-xs" @click="addSchedulerCase(stepIndex)">{{ $t("script-list.add_case") }}</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                    <button class="btn btn-ghost" @click="showSchedulerDialog = false">{{ $t("setting.cancel") }}</button>
                    <button class="btn btn-primary" @click="saveSchedulerConfig">{{ $t("script-list.save_and_switch") }}</button>
                </div>
            </div>
        </dialog>
    </div>
</template>
