<script setup lang="ts">
import { join, tempDir } from "@tauri-apps/api/path"
import * as dialog from "@tauri-apps/plugin-dialog"
import { useLocalStorage } from "@vueuse/core"
import { debounce } from "lodash-es"
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue"
import { decompileLuaBytecodeFiles, enumerateValidPakFiles, exportPakFiles, listPakFiles, moveFile, packPakFolder } from "@/api/app"
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
const exportProgress = ref<number | null>(null)
const luaProgress = ref<number | null>(null)
const packProgress = ref<number | null>(null)
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
    exportProgress.value = 0
    try {
        const result = await exportPakFiles(exportMap, aesKey.value.trim() || null, targetPath.value.trim(), (current, total) => {
            exportProgress.value = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
        })
        const luaFiles = result.flatMap(item => item.exportedFiles).filter(path => path.toLowerCase().endsWith(".lua"))
        // 导出阶段完成，切换为反编译进度浮层
        exportProgress.value = null
        if (luaFiles.length && unluacPath.value.trim() && luaOutputPath.value.trim()) {
            luaProgress.value = 0
            try {
                const decompileResult = await decompileLuaBytecodeFiles(
                    luaFiles,
                    targetPath.value.trim(),
                    unluacPath.value.trim(),
                    luaOutputPath.value.trim(),
                    (current, total) => {
                        luaProgress.value = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
                    }
                )
                if (decompileResult.failedFiles.length) {
                    ui.showErrorMessage(`反编译失败 ${decompileResult.failedFiles.length} 个文件`)
                }
            } finally {
                luaProgress.value = null
            }
        }
        ui.showSuccessMessage("导出完成")
    } catch (error) {
        console.error("导出 pak 文件失败:", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        exportProgress.value = null
        loading.value = false
    }
}

/**
 * 选择目录并打包为 pak：先选源目录，打包完成后弹出保存对话框导出。
 */
async function packSelectedFolder() {
    const selected = await dialog.open({
        directory: true,
        multiple: false,
        title: "选择要打包的目录",
    })
    if (!selected || Array.isArray(selected)) return

    const sourceDir = selected
    const folderName = sourceDir.split(/[\\/]+/).filter(Boolean).pop() || "packed"

    loading.value = true
    packProgress.value = 0
    try {
        // 先打包到系统临时目录，完成后再让用户选择最终保存位置
        const tempOutputPath = await join(await tempDir(), `dna-builder-pack-${Date.now()}.pak`)
        const result = await packPakFolder(sourceDir, aesKey.value.trim() || null, tempOutputPath, (current, total) => {
            packProgress.value = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
        })

        const saved = await dialog.save({
            title: "保存打包结果",
            defaultPath: `${folderName}.pak`,
            filters: [{ name: "pak", extensions: ["pak"] }],
        })
        if (!saved) {
            ui.showSuccessMessage(`打包完成（${result.packedFiles} 个文件），已取消保存`)
            return
        }
        await moveFile(result.outputPath, saved)
        ui.showSuccessMessage(`打包完成（${result.packedFiles} 个文件）`)
    } catch (error) {
        console.error("打包目录失败:", error)
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        packProgress.value = null
        loading.value = false
    }
}

onMounted(async () => {
    scanPakFiles()
})
</script>

<template>
    <div class="flex h-full min-h-0 w-full flex-col gap-4 p-4">
        <!-- 操作区：外层区块卡（入场动画与 backdrop-blur 同元素，遵守动画祖先禁则） -->
        <section
            class="flex-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm animate-ef-rise motion-reduce:animate-none"
        >
            <SectionHeader no-animate compact kicker="UNPACK">
                <template #trailing>
                    <div class="flex flex-wrap gap-2">
                        <button class="btn btn-outline rounded-xs" @click="showSettingsDialog = true">
                            <Icon icon="ri:settings-4-line" />
                            设置
                        </button>
                        <button class="btn btn-primary rounded-xs" :disabled="loading" @click="packSelectedFolder">
                            <Icon icon="ri:file-zip-line" />
                            打包
                        </button>
                        <button class="btn btn-primary rounded-xs" :disabled="loading" @click="loadPakFiles">
                            <Icon icon="ri:file-list-line" />
                            读取文件列表
                        </button>
                        <button class="btn btn-primary rounded-xs" :disabled="loading" @click="exportSelectedFiles">
                            <Icon icon="ri:download-2-line" />
                            导出
                        </button>
                    </div>
                </template>
            </SectionHeader>
        </section>

        <!-- 双栏列表：stagger-rise 容器交错入场，blur 区块卡自行动画，无动画祖先包 blur 后代 -->
        <div class="grid min-h-0 w-full flex-1 gap-4 stagger-rise lg:grid-cols-2">
            <!-- 左侧：pak 来源列表 -->
            <section
                class="flex min-h-0 w-full flex-col overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
            >
                <SectionHeader no-animate compact kicker="SOURCE PAK">
                    <template #trailing>
                        <span class="text-sm tabular-nums text-base-content/60">{{ pakPaths.length }} 个</span>
                    </template>
                </SectionHeader>

                <!-- 下划线搜索框 -->
                <div class="relative">
                    <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                    <input
                        v-model="pakPathFilter"
                        type="text"
                        placeholder="筛选 pak 或文件"
                        class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                    />
                    <span
                        class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                    >
                        {{ filteredPakLists.length }}
                    </span>
                </div>

                <!-- 文件树容器（内层小卡） -->
                <div class="mt-2.5 min-h-0 flex-1 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                    <UnpackFileTree
                        class="h-full min-h-0"
                        :paths="filteredPakLists"
                        :selected-paths="selectedPakPaths"
                        :strip-prefix="rootPath"
                        @update:selected-paths="selectedPakPaths = $event"
                    />
                </div>
            </section>

            <!-- 右侧：合并后的包内文件总列表 -->
            <section
                class="flex min-h-0 w-full flex-col overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
            >
                <SectionHeader no-animate compact kicker="MERGED FILES">
                    <template #trailing>
                        <span class="text-sm tabular-nums text-base-content/60">{{ mergedFileEntries.length }} 个</span>
                    </template>
                </SectionHeader>

                <!-- 下划线搜索框 -->
                <div class="relative">
                    <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                    <input
                        v-model="filePathFilter"
                        type="text"
                        placeholder="筛选包内文件"
                        class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                    />
                    <span
                        class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                    >
                        {{ mergedFilePaths.length }}
                    </span>
                </div>

                <!-- 文件树容器（内层小卡） -->
                <div class="mt-2.5 min-h-0 flex-1 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3 p-2">
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

    <!-- 导出进度浮层：定位壳负责居中位移，毛玻璃卡自身播放入场动画 -->
    <div
        v-if="exportProgress !== null"
        class="fixed bottom-4 left-1/2 z-50 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2"
        role="status"
        aria-live="polite"
    >
        <div
            class="rounded-xs border border-base-content/15 bg-base-100/85 p-3 shadow-lg backdrop-blur-md animate-ef-rise motion-reduce:animate-none"
        >
            <div class="mb-2 text-center text-sm font-medium tabular-nums">{{ exportProgress }}%</div>
            <progress class="progress progress-primary block h-2 w-full" :value="exportProgress" max="100" />
        </div>
    </div>

    <!-- 反编译进度浮层 -->
    <div
        v-if="luaProgress !== null"
        class="fixed bottom-4 left-1/2 z-50 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2"
        role="status"
        aria-live="polite"
    >
        <div
            class="rounded-xs border border-accent/30 bg-base-100/85 p-3 shadow-lg backdrop-blur-md animate-ef-rise motion-reduce:animate-none"
        >
            <div class="mb-2 text-center text-sm font-medium tabular-nums">反编译中 {{ luaProgress }}%</div>
            <progress class="progress progress-accent block h-2 w-full" :value="luaProgress" max="100" />
        </div>
    </div>

    <!-- 打包进度浮层 -->
    <div
        v-if="packProgress !== null"
        class="fixed bottom-4 left-1/2 z-50 w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2"
        role="status"
        aria-live="polite"
    >
        <div
            class="rounded-xs border border-primary/30 bg-base-100/85 p-3 shadow-lg backdrop-blur-md animate-ef-rise motion-reduce:animate-none"
        >
            <div class="mb-2 text-center text-sm font-medium tabular-nums">打包中 {{ packProgress }}%</div>
            <progress class="progress progress-primary block h-2 w-full" :value="packProgress" max="100" />
        </div>
    </div>

    <dialog class="modal" :class="{ 'modal-open': showSettingsDialog }">
        <div class="modal-box max-w-3xl rounded-xs bg-base-100/85 backdrop-blur-md">
            <div class="mb-4 flex items-center justify-between gap-3 border-b border-base-content/10 pb-3">
                <h3 class="text-lg font-medium">设置</h3>
                <form method="dialog">
                    <button class="btn btn-ghost btn-sm rounded-xs" @click="showSettingsDialog = false">关闭</button>
                </form>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                    <div class="text-sm text-base-content/60">pak 根目录</div>
                    <input v-model="rootPath" class="input input-bordered w-full" placeholder="pak 根目录" />
                    <button class="btn btn-outline w-full rounded-xs" @click="chooseDirectory('root')">选择目录</button>
                    <button class="btn btn-primary w-full rounded-xs" :disabled="loading" @click="scanPakFiles">扫描 pak</button>
                </div>
                <div class="space-y-2">
                    <div class="text-sm text-base-content/60">AES key</div>
                    <input v-model="aesKey" class="input input-bordered w-full" placeholder="AES key" />
                    <div class="text-sm text-base-content/60">导出目录</div>
                    <input v-model="targetPath" class="input input-bordered w-full" placeholder="导出目录" />
                    <button class="btn btn-outline w-full rounded-xs" @click="chooseDirectory('target')">选择目录</button>
                    <div class="text-sm text-base-content/60">unluac jar</div>
                    <input v-model="unluacPath" class="input input-bordered w-full" placeholder="unluac.jar" />
                    <button class="btn btn-outline w-full rounded-xs" @click="chooseUnluacFile">选择文件</button>
                    <div class="text-sm text-base-content/60">Lua 输出目录</div>
                    <input v-model="luaOutputPath" class="input input-bordered w-full" placeholder="Lua 输出目录" />
                    <button class="btn btn-outline w-full rounded-xs" @click="chooseDirectory('luaOutput')">选择目录</button>
                </div>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button @click="showSettingsDialog = false">close</button>
        </form>
    </dialog>
</template>
