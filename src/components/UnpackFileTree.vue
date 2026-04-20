<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"

defineOptions({
    name: "UnpackFileTree",
})

export interface FileTreeNode {
    name: string
    path: string
    isFile: boolean
    sourcePath?: string
    children: FileTreeNode[]
    leafCount: number
}

interface VisibleTreeRow {
    node: FileTreeNode
    depth: number
    selection: {
        selectedCount: number
        allSelected: boolean
        indeterminate: boolean
    }
}

interface SelectionState {
    selectedCount: number
    allSelected: boolean
    indeterminate: boolean
}

type ViewportTarget = HTMLElement | { value: HTMLElement | null } | null

const props = defineProps<{
    paths: string[]
    selectedPaths: string[]
    stripPrefix?: string
}>()

const emit = defineEmits<{
    (event: "update:selectedPaths", value: string[]): void
}>()

const viewportRef = ref<HTMLElement | null>(null)
const expandedPaths = ref<Set<string>>(new Set())
const scrollTop = ref(0)
const viewportHeight = ref(0)
const rowHeight = 32
const overscan = 6
let viewportResizeObserver: ResizeObserver | null = null

const tree = computed(() => buildTree(props.paths, props.stripPrefix ?? ""))
const selectedSet = computed(() => new Set(props.selectedPaths))
const selectionByPath = computed(() => buildSelectionState(tree.value, selectedSet.value))
const allVisibleRows = computed(() => buildVisibleRows(tree.value, expandedPaths.value, selectionByPath.value))
const totalHeight = computed(() => allVisibleRows.value.length * rowHeight)
const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / rowHeight) - overscan))
const endIndex = computed(() =>
    Math.min(allVisibleRows.value.length, Math.ceil((scrollTop.value + viewportHeight.value) / rowHeight) + overscan)
)
const visibleRows = computed(() => allVisibleRows.value.slice(startIndex.value, endIndex.value))
const topPadding = computed(() => startIndex.value * rowHeight)
const bottomPadding = computed(() => Math.max(0, totalHeight.value - topPadding.value - visibleRows.value.length * rowHeight))

watch(
    tree,
    nextTree => {
        const nextExpanded = new Set<string>()
        collectExpandablePaths(nextTree, nextExpanded)
        expandedPaths.value = nextExpanded
    },
    { immediate: true }
)

/**
 * 清理 viewport 的监听和尺寸观察器。
 */
function clearViewportListeners() {
    if (viewportRef.value) {
        viewportRef.value.removeEventListener("scroll", handleScroll)
    }
    viewportResizeObserver?.disconnect()
    viewportResizeObserver = null
}

/**
 * 同步当前滚动位置。
 */
function handleScroll() {
    scrollTop.value = viewportRef.value?.scrollTop ?? 0
}

/**
 * 解析 ScrollArea 传回的 viewport。
 * @param target ScrollArea 事件参数
 * @returns 真实 viewport 元素
 */
function resolveViewportElement(target: ViewportTarget) {
    if (target && typeof target === "object" && "value" in target) {
        return target.value
    }
    return target
}

/**
 * 绑定真实 viewport 的滚动与尺寸监听。
 * @param target ScrollArea 透传的 viewport
 */
function syncViewport(target: ViewportTarget) {
    const nextViewport = resolveViewportElement(target)
    if (viewportRef.value === nextViewport) {
        viewportHeight.value = nextViewport?.clientHeight ?? 0
        scrollTop.value = nextViewport?.scrollTop ?? 0
        return
    }

    clearViewportListeners()
    viewportRef.value = nextViewport
    scrollTop.value = nextViewport?.scrollTop ?? 0
    viewportHeight.value = nextViewport?.clientHeight ?? 0

    if (!nextViewport) return

    nextViewport.addEventListener("scroll", handleScroll, { passive: true })
    if (typeof ResizeObserver !== "undefined") {
        viewportResizeObserver = new ResizeObserver(() => {
            viewportHeight.value = nextViewport.clientHeight
            scrollTop.value = nextViewport.scrollTop
        })
        viewportResizeObserver.observe(nextViewport)
    }
}

onBeforeUnmount(() => {
    clearViewportListeners()
})

/**
 * 构建文件树。
 * @param paths 文件路径列表
 * @param stripPrefix 需要去掉的展示前缀
 * @returns 文件树
 */
function buildTree(paths: string[], stripPrefix = ""): FileTreeNode[] {
    const roots: FileTreeNode[] = []
    const normalizedPrefix = normalizePath(stripPrefix)

    for (const rawPath of paths) {
        const normalizedPath = rawPath.trim()
        if (!normalizedPath) continue

        const displayPath = getDisplayPath(normalizedPath, normalizedPrefix)
        const segments = displayPath.split(/[\\/]+/).filter(Boolean)
        if (!segments.length) continue

        let children = roots
        let currentPath = ""

        for (let index = 0; index < segments.length; index += 1) {
            const name = segments[index]
            const isFile = index === segments.length - 1
            currentPath = currentPath ? `${currentPath}/${name}` : name

            let node = children.find(item => item.name === name && item.isFile === isFile)
            if (!node) {
                node = isFile
                    ? {
                          name,
                          path: displayPath,
                          isFile: true,
                          sourcePath: normalizedPath,
                          children: [],
                          leafCount: 1,
                      }
                    : {
                          name,
                          path: currentPath,
                          isFile: false,
                          children: [],
                          leafCount: 0,
                      }
                children.push(node)
            }

            if (!isFile) {
                children = node.children
            }
        }
    }

    const finalizeNode = (node: FileTreeNode): FileTreeNode => {
        node.children.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"))
        for (const child of node.children) {
            finalizeNode(child)
        }
        if (!node.isFile) {
            node.leafCount = node.children.reduce((sum, child) => sum + child.leafCount, 0)
        }
        return node
    }

    roots.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"))
    return roots.map(finalizeNode)
}

/**
 * 规范化路径。
 * @param path 原始路径
 * @returns 规范化路径
 */
function normalizePath(path: string) {
    return path.trim().replaceAll("\\", "/").replace(/\/+/g, "/").replace(/\/$/, "")
}

/**
 * 获取用于展示的相对路径。
 * @param rawPath 原始路径
 * @param stripPrefix 需要去掉的前缀
 * @returns 展示路径
 */
function getDisplayPath(rawPath: string, stripPrefix: string) {
    const normalizedPath = normalizePath(rawPath)
    if (!stripPrefix) return normalizedPath

    const normalizedPrefix = normalizePath(stripPrefix)
    if (normalizedPath === normalizedPrefix) {
        return normalizedPath.split("/").pop() ?? normalizedPath
    }
    if (normalizedPath.startsWith(`${normalizedPrefix}/`)) {
        return normalizedPath.slice(normalizedPrefix.length + 1)
    }
    return normalizedPath
}

/**
 * 收集默认展开的目录。
 * @param nodes 文件树
 * @param output 展开集合
 */
function collectExpandablePaths(nodes: FileTreeNode[], output: Set<string>) {
    const stack = [...nodes]
    while (stack.length) {
        const node = stack.pop()
        if (!node || node.isFile) continue
        output.add(node.path)
        for (let index = node.children.length - 1; index >= 0; index -= 1) {
            stack.push(node.children[index])
        }
    }
}

/**
 * 将树展开为可见行。
 * @param nodes 文件树
 * @param expanded 当前展开路径
 * @returns 可见行
 */
function buildVisibleRows(
    nodes: FileTreeNode[],
    expanded: Set<string>,
    selectionByPath: Map<string, SelectionState>
): VisibleTreeRow[] {
    const rows: VisibleTreeRow[] = []
    const stack: Array<{ node: FileTreeNode; depth: number }> = []

    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        stack.push({ node: nodes[index], depth: 0 })
    }

    while (stack.length) {
        const current = stack.pop()
        if (!current) continue
        const selection = selectionByPath.get(current.node.path) ?? { selectedCount: 0, allSelected: false, indeterminate: false }
        rows.push({ node: current.node, depth: current.depth, selection })

        if (!current.node.isFile && expanded.has(current.node.path)) {
            for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
                stack.push({ node: current.node.children[index], depth: current.depth + 1 })
            }
        }
    }
    return rows
}

/**
 * 判断节点是否展开。
 * @param node 树节点
 * @returns 是否展开
 */
function isExpanded(node: FileTreeNode) {
    return !node.isFile && expandedPaths.value.has(node.path)
}

/**
 * 切换目录展开状态。
 * @param node 树节点
 */
function toggleExpanded(node: FileTreeNode) {
    if (node.isFile) return
    const next = new Set(expandedPaths.value)
    if (next.has(node.path)) {
        next.delete(node.path)
    } else {
        next.add(node.path)
    }
    expandedPaths.value = next
}

/**
 * 切换节点选中状态。
 * @param node 树节点
 */
function toggleNode(node: FileTreeNode) {
    if (node.isFile) {
        const sourcePath = node.sourcePath ?? node.path
        if (selectedSet.value.has(sourcePath)) {
            emit(
                "update:selectedPaths",
                props.selectedPaths.filter(path => path !== sourcePath)
            )
            return
        }
        emit("update:selectedPaths", [...props.selectedPaths, sourcePath])
        return
    }

    const selection = selectionByPath.value.get(node.path) ?? { selectedCount: 0, allSelected: false, indeterminate: false }
    const selectedCount = selection.selectedCount
    const allSelected = node.leafCount > 0 && selectedCount === node.leafCount
    if (allSelected) {
        const removeSet = collectLeafPaths(node)
        emit(
            "update:selectedPaths",
            props.selectedPaths.filter(path => !removeSet.has(path))
        )
        return
    }

    const next = new Set(props.selectedPaths)
    for (const path of collectLeafPaths(node)) {
        next.add(path)
    }
    emit("update:selectedPaths", Array.from(next))
}

/**
 * 计算整棵树的选中状态。
 * @param nodes 文件树
 * @param selected 已选集合
 * @returns 按路径索引的选中状态
 */
function buildSelectionState(nodes: FileTreeNode[], selected: Set<string>) {
    const selectionByPath = new Map<string, SelectionState>()

    const visit = (node: FileTreeNode): SelectionState => {
        if (node.isFile) {
            const selectedCount = selected.has(node.sourcePath ?? node.path) ? 1 : 0
            const state = {
                selectedCount,
                allSelected: selectedCount === 1,
                indeterminate: false,
            }
            selectionByPath.set(node.path, state)
            return state
        }

        let selectedCount = 0
        for (const child of node.children) {
            selectedCount += visit(child).selectedCount
        }

        const state = {
            selectedCount,
            allSelected: node.leafCount > 0 && selectedCount === node.leafCount,
            indeterminate: selectedCount > 0 && selectedCount < node.leafCount,
        }
        selectionByPath.set(node.path, state)
        return state
    }

    for (const node of nodes) {
        visit(node)
    }

    return selectionByPath
}

/**
 * 收集节点下所有叶子路径。
 * @param node 树节点
 * @returns 叶子路径集合
 */
function collectLeafPaths(node: FileTreeNode) {
    const output = new Set<string>()
    const stack = [node]
    while (stack.length) {
        const current = stack.pop()
        if (!current) continue
        if (current.isFile) {
            output.add(current.sourcePath ?? current.path)
            continue
        }
        for (let index = current.children.length - 1; index >= 0; index -= 1) {
            stack.push(current.children[index])
        }
    }
    return output
}

/**
 * 生成缩进样式。
 * @param depth 层级
 * @returns 内联样式
 */
function getRowStyle(depth: number) {
    return { paddingLeft: `${depth * 1.1}rem` }
}
</script>

<template>
    <ScrollArea class="h-full min-h-0 overflow-hidden" @loadref="syncViewport">
        <div v-if="tree.length" :style="{ height: `${totalHeight}px` }" class="relative w-full">
            <div :style="{ transform: `translateY(${topPadding}px)` }" class="absolute left-0 top-0 w-full">
                <div v-for="row in visibleRows" :key="row.node.path" class="h-8">
                    <div
                        class="group flex h-8 cursor-pointer items-center gap-2 rounded px-3 text-sm transition hover:bg-base-200"
                        :class="{ 'bg-base-200': row.selection.allSelected }"
                        :style="getRowStyle(row.depth)"
                        @click="row.node.isFile ? toggleNode(row.node) : toggleExpanded(row.node)"
                    >
                        <button
                            v-if="!row.node.isFile"
                            type="button"
                            class="flex h-4 w-4 shrink-0 items-center justify-center"
                            @click.stop="toggleExpanded(row.node)"
                        >
                            <span class="text-xs leading-none">{{ isExpanded(row.node) ? "−" : "+" }}</span>
                        </button>
                        <span v-else class="w-4 shrink-0" />
                        <input
                            type="checkbox"
                            class="checkbox checkbox-sm"
                            :checked="row.selection.allSelected"
                            @click.stop
                            :ref="el => {
                                if (el) (el as HTMLInputElement).indeterminate = row.selection.indeterminate
                            }"
                            @change="toggleNode(row.node)"
                        />
                        <span class="min-w-0 flex-1 truncate" :class="{ 'font-medium': !row.node.isFile }" :title="row.node.path">
                            {{ row.node.name }}
                        </span>
                    </div>
                </div>
            </div>
            <div :style="{ height: `${bottomPadding}px` }" />
        </div>
        <div v-else class="px-2 py-3 text-sm opacity-70">无文件</div>
    </ScrollArea>
</template>
