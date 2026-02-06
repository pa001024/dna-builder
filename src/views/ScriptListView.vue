<script setup lang="ts">
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut"
import { debounce } from "lodash-es"
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import {
    deleteFile,
    getDocumentsDir,
    listScriptFiles,
    openExplorer,
    readTextFile,
    renameFile,
    runAsAdmin,
    runScript,
    stopScript,
    unwatchFile,
    watchFile,
    writeTextFile,
} from "@/api/app"
import { createScriptMutation, deleteScriptMutation, updateScriptMutation } from "@/api/gen/api-mutations"
import { Script, scriptQuery, scriptsCountQuery, scriptsQuery } from "@/api/graphql"
import ContextMenu, { ContextMenuItem } from "@/components/contextmenu"
import { useUIStore } from "@/store/ui"
import { parseScriptHeader, replaceScriptHeader } from "@/utils/script-header"

const ui = useUIStore()

const scriptsDir = ref("")
const viewMode = ref<"local" | "online">("local")
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

const DEFAULT_SCRIPT_CONTENT = `async function main() {
    console.log("hello world")
    for (let i = 0; i < 10; i++) {
        await sleep(1000)
        console.log(\`hello world after \${i + 1}s\`)
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

interface OpenedTab {
    id: string
    name: string
    type: "local" | "online"
    content: string
    modified: boolean
}

const openedTabs = ref<OpenedTab[]>([])
const activeTabId = ref<string | null>(null)

const activeTab = computed(() => openedTabs.value.find(tab => tab.id === activeTabId.value))

// 控制台相关
const showConsole = ref(false)
const consoleLogs = ref<Array<{ level: string; message: string; timestamp: number }>>([])
const isRunning = ref(false)
let unlistenConsoleFn: UnlistenFn | null = null
let unlistenFileChangedFn: UnlistenFn | null = null
const watchedFiles = ref<Set<string>>(new Set())
const codeEditor = ref<any>()

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

        const count = await scriptsCountQuery({
            category: selectedCategory.value === "all" ? undefined : selectedCategory.value,
        })
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

async function downloadScript(script: Script) {
    try {
        const fileName = `${script.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5 \-_\(\)]/g, "_")}.js`
        const filePath = `${scriptsDir.value}\\${fileName}`
        const result = await scriptQuery({
            id: script.id,
        })
        if (!result) {
            throw new Error("获取脚本内容失败")
        }
        await writeTextFile(filePath, result.content)
        ui.showSuccessMessage(`已下载: ${fileName}`)
        await fetchLocalScripts()
        openLocalScript(fileName)
    } catch (error) {
        console.error("下载脚本失败", error)
        ui.showErrorMessage("下载脚本失败，请重试")
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
    if (!activeTab.value) return
    if (activeTab.value.type === "online") {
        ui.showErrorMessage("请先下载脚本")
        return
    }

    if (isRunning.value) {
        // 停止脚本
        try {
            await stopScript()
            isRunning.value = false
            addConsoleLog("info", "脚本已停止")
        } catch (error) {
            console.error("停止脚本失败", error)
            ui.showErrorMessage("停止脚本失败，请重试")
        }
        return
    }

    try {
        const filePath = `${scriptsDir.value}\\${activeTab.value.name}`

        // 清空控制台日志
        consoleLogs.value = []
        showConsole.value = true
        isRunning.value = true
        addConsoleLog("info", `开始运行脚本: ${activeTab.value.name}`)

        await runScript(filePath)
        // 脚本运行结束
        isRunning.value = false
        addConsoleLog("info", "脚本执行完成")
    } catch (error) {
        console.error("运行脚本失败", error)
        ui.showErrorMessage("运行脚本失败，请重试")
        isRunning.value = false
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
    consoleLogs.value.push({
        level,
        message,
        timestamp: Date.now(),
    })
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
    consoleLogs.value = []
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
        unlistenConsoleFn = await listen<{ level: string; message: string }>("script-console", event => {
            const { level, message } = event.payload
            addConsoleLog(level, message)
        })
    } catch (error) {
        console.error("监听控制台事件失败", error)
    }
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
    editingScript.value = fileName
    editingScriptName.value = fileName.replace(/\.js$/, "")
    nextTick(() => {
        const elm = document.getElementById("script-name-input") as HTMLInputElement
        elm?.focus()
        elm?.select()
    })
}

/**
 * 确认重命名脚本
 */
async function confirmRenameScript() {
    if (!editingScript.value) return

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

        await fetchLocalScripts()
    } catch (error) {
        console.error("重命名失败", error)
        ui.showErrorMessage("重命名失败，请重试")
    } finally {
        editingScript.value = null
    }
}

/**
 * 取消编辑脚本名称
 */
function cancelEditScript() {
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
        ui.showErrorMessage("文件已打开，请先关闭标签页")
        return
    }

    try {
        const filePath = `${scriptsDir.value}\\${fileName}`

        await deleteFile(filePath)
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

function switchToOnline() {
    viewMode.value = "online"
    fetchOnlineScripts()
}

async function openLocalScript(fileName: string) {
    const existingTab = openedTabs.value.find(tab => tab.type === "local" && tab.name === fileName)
    if (existingTab) {
        setActiveTab(existingTab.id)
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

    // 开始监听文件变化
    await startWatchingFile(fileName)
}

async function openOnlineScript(script: Script) {
    const fileName = `${script.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}.js`
    const existingTab = openedTabs.value.find(tab => tab.type === "online" && tab.name === fileName)
    if (existingTab) {
        activeTabId.value = existingTab.id
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
    } else {
        fetchOnlineScripts()
    }
})

onMounted(async () => {
    await initScriptsDir()
    await initEngineDts()
    fetchLocalScripts()
    document.addEventListener("keydown", handleKeyDown)
    await initConsoleListener()
    await initFileChangeListener()
})

onUnmounted(async () => {
    document.removeEventListener("keydown", handleKeyDown)
    if (unlistenConsoleFn) {
        unlistenConsoleFn()
    }
    if (unlistenFileChangedFn) {
        unlistenFileChangedFn()
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
        <div class="flex-1 flex overflow-hidden">
            <div class="w-64 border-r border-base-200 flex flex-col bg-base-100">
                <div class="px-4 py-1 border-b border-base-200 flex justify-center">
                    <div class="flex gap-2">
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
                <ScrollArea class="flex-1">
                    <div v-if="loading" class="flex justify-center items-center h-full p-4">
                        <span class="loading loading-spinner" />
                    </div>
                    <div
                        v-else-if="
                            (viewMode === 'local' && localScripts.length === 0) || (viewMode === 'online' && onlineScripts.length === 0)
                        "
                        class="flex justify-center items-center h-full text-base-content/50 p-4"
                    >
                        {{ viewMode === "local" ? "暂无本地脚本" : "暂无在线脚本" }}
                    </div>
                    <div v-else>
                        <template v-if="viewMode === 'local'">
                            <ContextMenu
                                v-for="script in localScripts"
                                :key="script"
                                class="px-3 py-2 rounded hover:bg-base-200 cursor-pointer flex items-center gap-2 text-sm group"
                                :class="{ 'bg-base-200': activeTab?.name === script }"
                                @click="openLocalScript(script)"
                            >
                                <Icon icon="ri:file-line" class="w-4 h-4 shrink-0" />
                                <span v-if="editingScript !== script" class="flex-1 truncate">
                                    {{ script }}
                                </span>
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
                                        @click="startEditScript(script)"
                                    >
                                        <Icon icon="ri:edit-line" class="w-4 h-4 mr-2" />
                                        重命名
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
                        </template>
                        <template v-else-if="viewMode === 'online'">
                            <ContextMenu
                                v-for="script in onlineScripts"
                                :key="script.id"
                                class="px-3 py-2 rounded hover:bg-base-200 cursor-pointer flex flex-col gap-1 text-sm"
                            >
                                <div class="flex items-center justify-between" @click="openOnlineScript(script)">
                                    <div class="flex-1">
                                        <div class="flex items-center gap-2">
                                            <span class="truncate font-medium">{{ script.title }}</span>
                                        </div>
                                        <div class="text-xs text-base-content/60 truncate">{{ script.description }}</div>
                                        <div class="text-base-content/80 flex items-center gap-1">
                                            <Icon v-if="script.isRecommended" icon="ri:checkbox-circle-fill" class="w-4 h-4 inline-block" />
                                            <span class="text-xs text-base-content/60 truncate">
                                                {{ script.user?.name }}
                                            </span>
                                            <button class="ml-auto btn btn-xs" @click.stop="downloadScript(script)">下载</button>
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
                        <button v-if="onlineScripts.length < totalCount" class="btn btn-sm btn-ghost" @click="loadMore">加载更多</button>
                    </div>
                </ScrollArea>
            </div>

            <div class="flex-1 flex flex-col min-w-0">
                <!-- TABS -->
                <div class="h-10 bg-base-200 border-b border-base-300 flex items-center justify-between">
                    <!-- files -->
                    <ScrollArea horizontal :vertical="false" class="flex items-center flex-1 h-full">
                        <div class="flex">
                            <ContextMenu
                                v-for="tab in openedTabs"
                                :key="tab.id"
                                class="h-10 flex items-center gap-2 px-3 border-r border-base-300 cursor-pointer min-w-max"
                                :class="{ 'bg-base-100': activeTabId === tab.id }"
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
                        <button
                            class="btn btn-sm btn-ghost btn-square"
                            :class="{ 'btn-error': isRunning }"
                            @click="runCurrentTab"
                            :title="isRunning ? '停止脚本' : '运行脚本'"
                        >
                            <Icon :icon="isRunning ? 'ri:stop-circle-line' : 'ri:play-line'" class="w-4 h-4" />
                        </button>
                        <button class="btn btn-sm btn-ghost btn-square" @click="openNewScriptDialog" title="新建脚本">
                            <Icon icon="ri:add-line" class="w-4 h-4" />
                        </button>
                        <button class="btn btn-sm btn-ghost btn-square" @click="openScriptDirectory" title="打开目录">
                            <Icon icon="ri:folder-open-line" class="w-4 h-4" />
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
                            <span v-if="isRunning" class="text-xs text-info">运行中</span>
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
                    <div id="console-output" class="flex-1 overflow-auto p-3 font-mono text-xs">
                        <div v-if="consoleLogs.length === 0" class="text-base-content/40 text-center py-4">暂无输出</div>
                        <div v-else class="space-y-1">
                            <div v-for="(log, index) in consoleLogs" :key="index" class="flex gap-2">
                                <span class="text-base-content/40 shrink-0">{{ new Date(log.timestamp).toLocaleTimeString() }}</span>
                                <span :class="getLogLevelClass(log.level)" class="break-all">{{ log.message }}</span>
                            </div>
                        </div>
                    </div>
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
    </div>
</template>
