<script setup lang="ts">
import { computed, ref } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { nodeEditorPerf, resetNodeEditorPerf } from "@/utils/nodeEditorPerf"
import { PALETTE_ITEMS } from "./types"

const store = useNodeEditorStore()

/** 当前展开查看调用记录的节点 id */
const expandedNode = ref<string | null>(null)

/** worker 请求类型 → 展示名 */
const WORKER_KIND_LABELS: Record<string, string> = {
    evaluate: "构筑求值",
    panels: "面板",
    autobuild: "自动配装",
    income: "收益估算",
    targetValues: "目标值",
    "wasm-init": "WASM 建表",
}

/**
 * 毫秒格式化：按量级保留精度，便于比较微小阶段耗时。
 * @param value 毫秒
 * @returns 展示字符串
 */
function formatMs(value: number): string {
    if (!Number.isFinite(value)) return "–"
    return value >= 100 ? `${value.toFixed(0)}ms` : value >= 10 ? `${value.toFixed(1)}ms` : `${value.toFixed(2)}ms`
}

const syncRows = computed(() =>
    Object.entries(nodeEditorPerf.sync)
        .map(([phase, bucket]) => ({ phase, ...bucket, avg: bucket.calls > 0 ? bucket.total / bucket.calls : 0 }))
        .sort((a, b) => b.total - a.total)
)

const workerRows = computed(() =>
    Object.entries(nodeEditorPerf.worker)
        .map(([kind, stats]) => ({
            kind,
            label: WORKER_KIND_LABELS[kind] ?? kind,
            ...stats,
            avg: stats.calls > 0 ? stats.total / stats.calls : 0,
        }))
        .sort((a, b) => b.total - a.total)
)

/**
 * 节点标题：自定义标题优先，其次节点库默认名，最后退回节点类型 / id。
 * @param nodeId 节点 id
 * @returns 展示名
 */
function nodeLabel(nodeId: string): string {
    const node = store.nodes.find(item => item.id === nodeId)
    const custom = typeof node?.data?.label === "string" ? node.data.label.trim() : ""
    const palette = PALETTE_ITEMS.find(item => item.type === node?.type)
    return custom || palette?.label || node?.type || nodeId
}

const nodeRows = computed(() =>
    Object.values(nodeEditorPerf.nodes)
        .map(stats => ({ ...stats, label: nodeLabel(stats.nodeId), avg: stats.calls > 0 ? stats.total / stats.calls : 0 }))
        .sort((a, b) => b.total - a.total)
)

/**
 * 展开 / 收起某个节点的最近调用记录。
 * @param nodeId 节点 id
 */
function toggleNode(nodeId: string) {
    expandedNode.value = expandedNode.value === nodeId ? null : nodeId
}

/**
 * 同步阶段或 worker 请求的展示名。
 * @param record 调用记录
 * @returns 展示字符串
 */
function recordLabel(record: { scope: "sync" | "worker"; phase: string }): string {
    return record.scope === "worker" ? (WORKER_KIND_LABELS[record.phase] ?? record.phase) : record.phase
}
</script>

<template>
    <div class="space-y-2 p-1.5 text-[10px]">
        <div class="flex items-center gap-1.5 px-1 py-1">
            <Icon icon="ri:speed-line" class="size-3.5 text-base-content/50" />
            <span class="text-[11px] tracking-wide text-base-content/55">性能</span>
            <button
                type="button"
                class="ml-auto cursor-pointer border border-base-content/10 px-1 py-0.5 text-[9px] text-base-content/45 transition-colors duration-150 hover:border-primary/40 hover:text-primary active:scale-[0.97]"
                @click="resetNodeEditorPerf()"
            >
                清空
            </button>
        </div>

        <div class="grid grid-cols-2 gap-1">
            <div class="border border-base-content/10 bg-base-100 px-1.5 py-1">
                <div class="text-[9px] text-base-content/40">同步耗时</div>
                <div class="font-mono text-[11px] text-primary tabular-nums">{{ formatMs(nodeEditorPerf.syncTotal) }}</div>
            </div>
            <div class="border border-base-content/10 bg-base-100 px-1.5 py-1">
                <div class="text-[9px] text-base-content/40">同步次数</div>
                <div class="font-mono text-[11px] text-base-content/70 tabular-nums">{{ nodeEditorPerf.syncCalls }}</div>
            </div>
            <div class="border border-base-content/10 bg-base-100 px-1.5 py-1">
                <div class="text-[9px] text-base-content/40">Worker 耗时</div>
                <div class="font-mono text-[11px] text-primary tabular-nums">{{ formatMs(nodeEditorPerf.workerTotal) }}</div>
            </div>
            <div class="border border-base-content/10 bg-base-100 px-1.5 py-1">
                <div class="text-[9px] text-base-content/40">请求数</div>
                <div class="font-mono text-[11px] text-base-content/70 tabular-nums">
                    {{ nodeEditorPerf.workerCalls }}
                    <span v-if="nodeEditorPerf.workerErrors > 0" class="text-error">/ {{ nodeEditorPerf.workerErrors }} 失败</span>
                </div>
            </div>
        </div>

        <div>
            <div class="px-1 py-0.5 text-[10px] text-base-content/40">同步阶段</div>
            <div v-if="syncRows.length === 0" class="px-1.5 py-2 text-[10px] text-base-content/35">暂无同步数据</div>
            <div v-for="row in syncRows" :key="row.phase" class="px-1 py-0.5">
                <div class="flex items-center justify-between gap-2">
                    <span class="min-w-0 flex-1 truncate text-base-content/70">{{ row.phase }}</span>
                    <span class="shrink-0 font-mono text-base-content/45 tabular-nums">{{ row.calls }}×</span>
                </div>
                <div class="font-mono text-[9px] text-base-content/35 tabular-nums">
                    总 {{ formatMs(row.total) }} · 均 {{ formatMs(row.avg) }} · 峰 {{ formatMs(row.max) }}
                </div>
            </div>
        </div>

        <div>
            <div class="px-1 py-0.5 text-[10px] text-base-content/40">Worker 请求</div>
            <div v-if="workerRows.length === 0" class="px-1.5 py-2 text-[10px] text-base-content/35">暂无请求</div>
            <div v-for="row in workerRows" :key="row.kind" class="px-1 py-0.5">
                <div class="flex items-center justify-between gap-2">
                    <span class="min-w-0 flex-1 truncate text-base-content/70">{{ row.label }}</span>
                    <span class="shrink-0 font-mono text-base-content/45 tabular-nums">{{ row.calls }}× · 均 {{ formatMs(row.avg) }}</span>
                </div>
                <div class="flex flex-wrap items-center gap-1 font-mono text-[9px] text-base-content/35 tabular-nums">
                    <span>总 {{ formatMs(row.total) }} · 峰 {{ formatMs(row.max) }}</span>
                    <span v-for="(count, engine) in row.byEngine" :key="engine" class="border border-base-content/10 px-1">
                        {{ engine }} {{ count }}
                    </span>
                    <span v-if="row.errors > 0" class="text-error">{{ row.errors }} 失败</span>
                </div>
            </div>
        </div>

        <div>
            <div class="flex items-center gap-1 px-1 py-0.5 text-[10px] text-base-content/40">
                节点调用
                <span class="font-mono text-base-content/30">{{ nodeRows.length }}</span>
            </div>
            <div v-if="nodeRows.length === 0" class="px-1.5 py-2 text-[10px] text-base-content/35">暂无节点记录</div>
            <div v-for="row in nodeRows" :key="row.nodeId">
                <button
                    type="button"
                    class="flex w-full cursor-pointer items-center gap-1 border border-transparent px-1 py-0.5 text-left transition-colors duration-150 hover:border-primary/30 hover:bg-primary/5"
                    @click="toggleNode(row.nodeId)"
                >
                    <Icon
                        :icon="expandedNode === row.nodeId ? 'ri:arrow-down-s-line' : 'ri:arrow-right-s-line'"
                        class="size-3 shrink-0 text-base-content/40"
                    />
                    <span class="min-w-0 flex-1 truncate text-base-content/70">{{ row.label }}</span>
                    <span class="shrink-0 font-mono text-[9px] text-base-content/45 tabular-nums">{{ row.calls }}× · {{ formatMs(row.total) }}</span>
                </button>
                <div v-if="expandedNode === row.nodeId" class="ml-1.5 space-y-px border-l border-base-content/10 pl-2">
                    <div class="px-1 py-0.5 text-[9px] text-base-content/35">
                        同步 {{ row.syncCalls }} · Worker {{ row.workerCalls }} · 均 {{ formatMs(row.avg) }} · 峰 {{ formatMs(row.max) }}
                    </div>
                    <div
                        v-for="(record, index) in row.records"
                        :key="index"
                        class="flex items-center justify-between gap-2 px-1 py-0.5 font-mono text-[9px] tabular-nums"
                    >
                        <span class="min-w-0 truncate" :class="record.scope === 'worker' ? 'text-base-content/55' : 'text-base-content/45'">
                            {{ recordLabel(record) }}
                            <span v-if="record.engine" class="text-base-content/30">·{{ record.engine }}</span>
                            <span v-if="record.status === 'error'" class="text-error">失败</span>
                        </span>
                        <span class="shrink-0 text-primary/80">{{ formatMs(record.duration) }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
