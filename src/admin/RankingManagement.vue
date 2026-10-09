<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import {
    buildsQuery,
    createRankingListMutation,
    deleteRankingListMutation,
    type RankingList,
    rankingListQuery,
    rankingListsQuery,
    updateRankingListMutation,
} from "@/api/graphql"
import { charData } from "@/data"
import { useUIStore } from "@/store/ui"

type RankRow = {
    charId: number
    buildId: string
}

const ui = useUIStore()
const lists = ref<RankingList[]>([])
const loading = ref(false)
const saving = ref(false)
const activeId = ref("")
const name = ref("")
const desc = ref("")
const rows = ref<RankRow[]>([])
const buildMap = ref<Record<number, { id: string; title: string }[]>>({})
const inflightBuilds = new Map<number, Promise<void>>()
let selectSeq = 0

const activeList = computed(() => lists.value.find(item => item.id === activeId.value) || null)
const totalItems = computed(() => rows.value.length)

function addRow() {
    const charId = charData[0]?.id || 0
    rows.value.push({ charId, buildId: "" })
    void loadBuildOptions(charId)
}

function removeRow(index: number) {
    rows.value.splice(index, 1)
}

async function loadBuildOptions(charId: number, force = false) {
    if (buildMap.value[charId] && !force) return
    const pending = inflightBuilds.get(charId)
    if (pending) {
        await pending
        return
    }
    const task = (async () => {
        const result = await buildsQuery({ charId, limit: 200, offset: 0 }, { requestPolicy: "network-only" }).catch(() => undefined)
        const fetched = (result || []).map(build => ({ id: build.id, title: build.title }))
        // 与已播种的当前选中项合并去重，避免覆盖 rankingList 自带的 build 标题
        const merged = new Map<string, { id: string; title: string }>()
        for (const build of buildMap.value[charId] || []) merged.set(build.id, build)
        for (const build of fetched) merged.set(build.id, build)
        buildMap.value[charId] = [...merged.values()]
    })().finally(() => {
        inflightBuilds.delete(charId)
    })
    inflightBuilds.set(charId, task)
    await task
}

async function handleCharChange(index: number) {
    const row = rows.value[index]
    if (!row) return
    row.buildId = ""
    await loadBuildOptions(row.charId)
}

async function loadLists() {
    loading.value = true
    try {
        const result = await rankingListsQuery({}, { requestPolicy: "network-only" })
        lists.value = result || []
        if (!activeId.value && lists.value[0]) {
            await selectList(lists.value[0])
        }
    } finally {
        loading.value = false
    }
}

async function selectList(item: RankingList) {
    const seq = ++selectSeq
    activeId.value = item.id
    name.value = item.name
    desc.value = item.desc || ""
    const result = await rankingListQuery({ id: item.id }, { requestPolicy: "network-only" }).catch(() => null)
    if (seq !== selectSeq) return
    const items = (result?.items || []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
    // 先用 rankingList 自带的 build.{id,title} 播种下拉选项，避免等待 buildsQuery 时下拉空白
    for (const entry of items) {
        if (!entry.build) continue
        const list = (buildMap.value[entry.charId] ||= [])
        if (!list.some(build => build.id === entry.build!.id)) {
            list.push({ id: entry.build.id, title: entry.build.title })
        }
    }
    rows.value = items.map(item => ({ charId: item.charId, buildId: item.buildId }))
    // 再并行拉取各角色全量构筑以补齐可选项（合并而非覆盖，保留已播种的当前项）
    const charIds = [...new Set(rows.value.map(row => row.charId))]
    await Promise.all(charIds.map(charId => loadBuildOptions(charId, true)))
}

function resetDraft() {
    activeId.value = ""
    name.value = ""
    desc.value = ""
    rows.value = []
}

async function saveList() {
    if (!name.value.trim()) {
        ui.showErrorMessage("请输入榜单名称")
        return
    }
    if (rows.value.length === 0) {
        ui.showErrorMessage("请至少添加一个条目")
        return
    }
    saving.value = true
    try {
        const payload = {
            name: name.value.trim(),
            desc: desc.value.trim(),
            items: rows.value.map((row, index) => ({
                charId: row.charId,
                buildId: row.buildId,
                sortOrder: index,
            })),
        }

        if (activeId.value) {
            await updateRankingListMutation({ id: activeId.value, input: payload })
            ui.showSuccessMessage("榜单已更新")
        } else {
            await createRankingListMutation({ input: payload })
            ui.showSuccessMessage("榜单已创建")
        }
        await loadLists()
    } finally {
        saving.value = false
    }
}

async function removeList(item: RankingList) {
    if (!(await ui.showDialog("删除确认", `确定要删除榜单「${item.name}」吗？`))) return
    await deleteRankingListMutation({ id: item.id })
    ui.showSuccessMessage("榜单已删除")
    await loadLists()
    if (activeId.value === item.id) {
        resetDraft()
    }
}

onMounted(loadLists)
</script>

<template>
    <div class="min-h-full bg-base-200 p-4 sm:p-6">
        <div class="mx-auto flex max-w-7xl flex-col gap-6">
            <section class="card bg-base-100 border border-base-300 shadow-sm">
                <div class="card-body gap-4 p-6 sm:p-8">
                    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h1 class="text-3xl font-bold text-base-content">榜单管理</h1>
                            <p class="mt-2 text-sm text-base-content/70">按角色配置构筑条目并保存榜单</p>
                        </div>

                        <div class="grid gap-3 sm:grid-cols-3 lg:min-w-120">
                            <div class="rounded-2xl border border-base-300 bg-base-200/50 p-4">
                                <div class="text-xs uppercase tracking-[0.24em] text-base-content/50">榜单数</div>
                                <div class="mt-2 text-2xl font-bold text-base-content">{{ lists.length }}</div>
                            </div>
                            <div class="rounded-2xl border border-base-300 bg-base-200/50 p-4">
                                <div class="text-xs uppercase tracking-[0.24em] text-base-content/50">当前条目</div>
                                <div class="mt-2 text-2xl font-bold text-base-content">{{ totalItems }}</div>
                            </div>
                            <div class="rounded-2xl border border-base-300 bg-base-200/50 p-4">
                                <div class="text-xs uppercase tracking-[0.24em] text-base-content/50">状态</div>
                                <div class="mt-2 text-2xl font-bold text-base-content">{{ saving ? "保存中" : loading ? "加载中" : "就绪" }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div class="grid gap-6 xl:grid-cols-[360px_1fr]">
                <aside class="card border border-base-300 bg-base-100 shadow-sm">
                    <div class="card-body p-4 sm:p-5">
                        <div class="flex items-center justify-between">
                            <div>
                                <h2 class="text-lg font-bold text-base-content">已有榜单</h2>
                            </div>
                            <span class="rounded-full bg-base-200 px-3 py-1 text-xs text-base-content/70">{{ lists.length }}</span>
                        </div>

                    <div v-if="loading" class="mt-4 space-y-3">
                        <div v-for="index in 4" :key="index" class="h-20 animate-pulse rounded-2xl border border-base-300 bg-base-200/40"></div>
                    </div>

                    <div v-else class="mt-4 space-y-3">
                        <button
                            v-for="item in lists"
                            :key="item.id"
                            class="group w-full rounded-2xl border border-base-300 bg-base-100 p-4 text-left transition-all duration-200 hover:border-primary/30 hover:bg-primary/5"
                            :class="activeId === item.id ? 'border-primary bg-primary/10' : ''"
                            @click="selectList(item)"
                        >
                            <div class="flex items-start justify-between gap-4">
                                <div class="min-w-0">
                                    <div class="truncate text-base font-medium text-base-content">{{ item.name }}</div>
                                    <div class="mt-2 line-clamp-2 text-sm leading-6 text-base-content/60">{{ item.desc || "无描述" }}</div>
                                </div>
                                <span class="shrink-0 rounded-full bg-base-200 px-2.5 py-1 text-xs text-base-content/70">
                                    {{ activeId === item.id ? "已选" : "切换" }}
                                </span>
                            </div>
                        </button>
                    </div>
                    </div>
                </aside>

                <section class="card border border-base-300 bg-base-100 shadow-sm">
                    <div class="card-body p-4 sm:p-6">
                    <div class="grid gap-4 lg:grid-cols-2">
                        <label class="form-control">
                            <div class="label">
                                <span class="label-text text-base-content">榜单名称</span>
                            </div>
                            <input v-model="name" class="input input-bordered w-full" placeholder="请输入榜单名称" />
                        </label>
                        <label class="form-control">
                            <div class="label">
                                <span class="label-text text-base-content">描述</span>
                            </div>
                            <input v-model="desc" class="input input-bordered w-full" placeholder="请输入描述" />
                        </label>
                    </div>

                    <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 class="text-lg font-bold text-base-content">条目</h2>
                        </div>
                        <button class="btn btn-outline" @click="addRow">
                            添加条目
                        </button>
                    </div>

                    <div class="mt-4 space-y-3">
                        <div
                            v-for="(row, index) in rows"
                            :key="`${row.charId}-${index}`"
                            class="grid gap-3 rounded-2xl border border-base-300 bg-base-100 p-4 lg:grid-cols-[1.1fr_1.1fr_auto]"
                        >
                            <label class="form-control">
                                <div class="label">
                                    <span class="label-text text-base-content/70">角色</span>
                                </div>
                                <select v-model.number="row.charId" class="select select-bordered w-full" @change="handleCharChange(index)">
                                    <option v-for="char in charData" :key="char.id" :value="char.id">{{ char.名称 }}</option>
                                </select>
                            </label>
                            <label class="form-control">
                                <div class="label">
                                    <span class="label-text text-base-content/70">构筑</span>
                                </div>
                                <select v-model="row.buildId" class="select select-bordered w-full" @focus="loadBuildOptions(row.charId)">
                                    <option value="">请选择构筑</option>
                                    <option v-for="build in buildMap[row.charId] || []" :key="build.id" :value="build.id">{{ build.title }}</option>
                                </select>
                            </label>
                            <div class="flex items-end">
                                <button class="btn btn-error btn-outline" @click="removeRow(index)">删除</button>
                            </div>
                        </div>
                    </div>

                    <div class="mt-6 flex flex-wrap justify-between gap-3">
                        <div class="flex flex-wrap gap-2">
                            <button v-if="activeId" class="btn btn-error btn-outline" @click="removeList(activeList!)">
                                删除当前榜单
                            </button>
                            <button class="btn btn-outline" @click="resetDraft">
                                新建榜单
                            </button>
                        </div>
                        <button class="btn btn-primary" @click="saveList">
                            保存榜单
                        </button>
                    </div>
                    </div>
                </section>
            </div>
        </div>
    </div>
</template>
