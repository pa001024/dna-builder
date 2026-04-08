<script setup lang="ts">
import * as dialog from "@tauri-apps/plugin-dialog"
import { useLocalStorage } from "@vueuse/core"
import { debounce } from "lodash-es"
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue"
import { decompileLuaBytecodeFiles, enumerateValidPakFiles, exportPakFiles, listPakFiles } from "@/api/app"
import { useGameStore } from "@/store/game"
import { useUIStore } from "@/store/ui"

const ui = useUIStore()
const game = useGameStore()
const DEFAULT_AES_KEY = "0x5B82ACB93E4F7133BE70A989539A8529EB487F59D7F0356D4C40438206158AB2"

const defaultRootPath = computed(() => (game.gameDir ? `${game.gameDir}EM` : ""))
const rootPath = ref(defaultRootPath.value)
const aesKey = ref(DEFAULT_AES_KEY)
const targetPath = useLocalStorage("unpack.target_path", "")
const unluacPath = useLocalStorage("unpack.unluac_path", "")
const luaOutputPath = useLocalStorage("unpack.lua_output_path", "")
const pakPaths = ref<string[]>([])
const pakFileLists = ref<{ pakPath: string; files: string[] }[]>([])
const selectedPakPaths = ref<string[]>([])
const selectedMergedPaths = ref<string[]>([])
const showSettingsDialog = ref(false)
const loading = ref(false)
const pakPathFilter = ref("")
const filePathFilter = ref("")
const debouncedFilePathFilter = ref("")
const pakFileMap = computed(() => new Map(pakFileLists.value.map(item => [item.pakPath, item.files] as const)))

interface MergedFileEntry {
    path: string
    sourcePakPath: string
}

/**
 * 过滤 pak 路径，便于在目录很大时快速定位目标包。
 */
const filteredPakLists = computed(() => {
    const keyword = pakPathFilter.value.trim().toLowerCase()
    if (!keyword) return pakPaths.value
    return pakPaths.value.filter(path => path.toLowerCase().includes(keyword))
})

/**
 * 按 pak 优先级合并包内文件，后选中的 pak 覆盖先选中的 pak。
 */
const mergedFileEntries = computed<MergedFileEntry[]>(() => {
    const nextSourceByPath = new Map<string, string>()
    const activePakPaths = selectedPakPaths.value.filter(path => pakFileMap.value.has(path))

    for (const pakPath of [...activePakPaths].reverse()) {
        const files = pakFileMap.value.get(pakPath) ?? []
        for (const filePath of files) {
            if (!nextSourceByPath.has(filePath)) {
                nextSourceByPath.set(filePath, pakPath)
            }
        }
    }

    return Array.from(nextSourceByPath.entries())
        .map(([path, sourcePakPath]) => ({ path, sourcePakPath }))
        .sort((left, right) => left.path.localeCompare(right.path, "zh-Hans-CN"))
})

/**
 * 过滤合并后的文件总列表。
 */
const filteredMergedFileEntries = computed(() => {
    const keyword = debouncedFilePathFilter.value.trim().toLowerCase()
    if (!keyword) return mergedFileEntries.value
    return mergedFileEntries.value.filter(entry => entry.path.toLowerCase().includes(keyword))
})

/**
 * 生成右侧总列表的稳定路径数组，避免模板内联 map 导致每次渲染都重建展开状态。
 */
const mergedFilePaths = computed(() => filteredMergedFileEntries.value.map(entry => entry.path))

/**
 * 合并文件路径到来源 pak 的映射。
 */
const mergedSourcePakMap = computed(() => new Map(mergedFileEntries.value.map(entry => [entry.path, entry.sourcePakPath] as const)))

/**
 * 裁剪已失效的选中项，避免在列表刷新时触发自我循环更新。
 */
watch(
    mergedFileEntries,
    nextEntries => {
        const visiblePaths = new Set(nextEntries.map(entry => entry.path))
        const nextSelected = selectedMergedPaths.value.filter(path => visiblePaths.has(path))
        if (nextSelected.length === selectedMergedPaths.value.length) {
            let hasChange = false
            for (let index = 0; index < nextSelected.length; index += 1) {
                if (nextSelected[index] !== selectedMergedPaths.value[index]) {
                    hasChange = true
                    break
                }
            }
            if (!hasChange) return
        }
        selectedMergedPaths.value = nextSelected
    },
    { immediate: true }
)

const updateDebouncedFilePathFilter = debounce((value: string) => {
    debouncedFilePathFilter.value = value
}, 250)

/**
 * 对右侧文件筛选做防抖，减少输入时的重复过滤开销。
 */
watch(filePathFilter, value => {
    updateDebouncedFilePathFilter(value)
})

/**
 * 清理右侧筛选防抖任务。
 */
onBeforeUnmount(() => {
    updateDebouncedFilePathFilter.cancel()
})

/**
 * 选择目录并回填到对应输入框。
 * @param target 目标输入框
 */
async function chooseDirectory(target: "root" | "target" | "luaOutput") {
    const selected = await dialog.open({
        directory: true,
        multiple: false,
        title: target === "root" ? "选择 pak 根目录" : target === "target" ? "选择导出目录" : "选择 Lua 输出目录",
    })
    if (!selected || Array.isArray(selected)) return
    if (target === "root") {
        rootPath.value = selected
        return
    }
    if (target === "target") {
        targetPath.value = selected
        return
    }
    luaOutputPath.value = selected
}

/**
 * 选择单个文件并回填到对应输入框。
 */
async function chooseUnluacFile() {
    const selected = await dialog.open({
        directory: false,
        multiple: false,
        title: "选择 unluac jar",
    })
    if (!selected || Array.isArray(selected)) return
    unluacPath.value = selected
}

/**
 * 只在输入框为空时，自动补上默认 pak 根目录。
 */
watchEffect(() => {
    if (!rootPath.value.trim() && defaultRootPath.value) {
        rootPath.value = defaultRootPath.value
    }
})

/**
 * 扫描目录中的 pak 文件，并默认全选。
 */
async function scanPakFiles() {
    if (!rootPath.value.trim()) {
        ui.showErrorMessage("请先选择目录")
        return
    }

    loading.value = true
    try {
        const result = await enumerateValidPakFiles(rootPath.value.trim(), aesKey.value.trim() || null)
        pakPaths.value = result
        selectedPakPaths.value = result.slice()
        pakFileLists.value = []
        selectedMergedPaths.value = []
    } catch (error) {
        console.error("扫描 pak 失败:", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        loading.value = false
    }
}

/**
 * 读取当前选中的 pak 文件列表，并默认勾选全部包内文件。
 */
async function loadPakFiles() {
    if (!selectedPakPaths.value.length) {
        ui.showErrorMessage("请先选择 pak 文件")
        return
    }

    loading.value = true
    try {
        pakFileLists.value = await listPakFiles(selectedPakPaths.value, aesKey.value.trim() || null)
        selectedMergedPaths.value = mergedFileEntries.value.map(entry => entry.path)
    } catch (error) {
        console.error("读取 pak 文件列表失败:", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        loading.value = false
    }
}

/**
 * 将当前勾选的 pak 和包内文件导出到目标目录。
 */
async function exportSelectedFiles() {
    if (!targetPath.value.trim()) {
        ui.showErrorMessage("请先选择导出目录")
        return
    }
    if (!pakFileLists.value.length) {
        ui.showErrorMessage("请先加载 pak 文件列表")
        return
    }

    const exportMap: Record<string, string[]> = {}
    for (const filePath of selectedMergedPaths.value) {
        const sourcePakPath = mergedSourcePakMap.value.get(filePath)
        if (!sourcePakPath) continue
        if (!exportMap[sourcePakPath]) {
            exportMap[sourcePakPath] = []
        }
        exportMap[sourcePakPath].push(filePath)
    }
    if (Object.keys(exportMap).length === 0) {
        ui.showErrorMessage("请先勾选要导出的文件")
        return
    }

    loading.value = true
    try {
        const result = await exportPakFiles(exportMap, aesKey.value.trim() || null, targetPath.value.trim())
        const luaFiles = result.flatMap(item => item.exportedFiles).filter(path => path.toLowerCase().endsWith(".lua"))
        if (luaFiles.length && unluacPath.value.trim() && luaOutputPath.value.trim()) {
            const decompileResult = await decompileLuaBytecodeFiles(
                luaFiles,
                targetPath.value.trim(),
                unluacPath.value.trim(),
                luaOutputPath.value.trim()
            )
            if (decompileResult.failedFiles.length) {
                ui.showErrorMessage(`反编译失败 ${decompileResult.failedFiles.length} 个文件`)
            }
        }
        ui.showSuccessMessage("导出完成")
    } catch (error) {
        console.error("导出 pak 文件失败:", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        loading.value = false
    }
}

onMounted(async () => {
    scanPakFiles()
})
</script>

<template>
    <div class="flex h-full min-h-0 w-full flex-col gap-4 p-4">
        <div class="flex flex-wrap gap-2 w-full">
            <button class="btn btn-outline" @click="showSettingsDialog = true">设置</button>
            <button class="btn btn-primary" :disabled="loading" @click="loadPakFiles">读取文件列表</button>
            <button class="btn btn-primary" :disabled="loading" @click="exportSelectedFiles">导出</button>
        </div>

        <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 w-full">
            <section class="w-full min-h-0 flex flex-col">
                <div class="flex items-center justify-between gap-3 mb-2">
                    <span class="text-sm opacity-70">{{ pakPaths.length }} 个</span>
                </div>
                <input v-model="pakPathFilter" class="input input-bordered w-full mb-2" placeholder="筛选 pak 或文件" />
                <div class="flex-1 min-h-0 rounded border border-base-300">
                    <UnpackFileTree
                        class="h-full min-h-0"
                        :paths="filteredPakLists"
                        :selected-paths="selectedPakPaths"
                        :strip-prefix="rootPath"
                        @update:selected-paths="selectedPakPaths = $event"
                    />
                </div>
            </section>

            <section class="w-full min-h-0 flex flex-col">
                <div class="flex items-center justify-between gap-3 mb-2">
                    <span class="text-sm opacity-70">{{ mergedFileEntries.length }} 个</span>
                </div>
                <input v-model="filePathFilter" class="input input-bordered w-full mb-2" placeholder="筛选包内文件" />
                <div class="flex-1 min-h-0 rounded border border-base-300 p-2">
                    <UnpackFileTree
                        class="h-full min-h-0"
                        :paths="mergedFilePaths"
                        :selected-paths="selectedMergedPaths"
                        @update:selected-paths="selectedMergedPaths = $event"
                    />
                </div>
            </section>
        </div>
    </div>

    <dialog class="modal" :class="{ 'modal-open': showSettingsDialog }">
        <div class="modal-box max-w-3xl">
            <div class="flex items-center justify-between gap-3 mb-4">
                <h3 class="font-medium text-lg">设置</h3>
                <form method="dialog">
                    <button class="btn btn-sm btn-ghost" @click="showSettingsDialog = false">关闭</button>
                </form>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                    <div class="text-sm opacity-70">pak 根目录</div>
                    <input v-model="rootPath" class="input input-bordered w-full" placeholder="pak 根目录" />
                    <button class="btn btn-outline w-full" @click="chooseDirectory('root')">选择目录</button>
                    <button class="btn btn-primary w-full" :disabled="loading" @click="scanPakFiles">扫描 pak</button>
                </div>
                <div class="space-y-2">
                    <div class="text-sm opacity-70">AES key</div>
                    <input v-model="aesKey" class="input input-bordered w-full" placeholder="AES key" />
                    <div class="text-sm opacity-70">导出目录</div>
                    <input v-model="targetPath" class="input input-bordered w-full" placeholder="导出目录" />
                    <button class="btn btn-outline w-full" @click="chooseDirectory('target')">选择目录</button>
                    <div class="text-sm opacity-70">unluac jar</div>
                    <input v-model="unluacPath" class="input input-bordered w-full" placeholder="unluac.jar" />
                    <button class="btn btn-outline w-full" @click="chooseUnluacFile">选择文件</button>
                    <div class="text-sm opacity-70">Lua 输出目录</div>
                    <input v-model="luaOutputPath" class="input input-bordered w-full" placeholder="Lua 输出目录" />
                    <button class="btn btn-outline w-full" @click="chooseDirectory('luaOutput')">选择目录</button>
                </div>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="showSettingsDialog = false">close</button>
        </form>
    </dialog>
</template>
