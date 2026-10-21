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
import AdminPageHeader from "./AdminPageHeader.vue"
import {
    ADMIN_BADGE,
    ADMIN_BADGE_NEUTRAL,
    ADMIN_BADGE_PRIMARY,
    ADMIN_BTN,
    ADMIN_BTN_DANGER,
    ADMIN_BTN_PRIMARY,
    ADMIN_EMPTY,
    ADMIN_INPUT,
    ADMIN_LABEL,
    ADMIN_NUM,
    ADMIN_NUM_UNIT,
    ADMIN_ROW_ACTION,
    ADMIN_ROW_TONE_ERROR,
    ADMIN_STAT_CELL,
    ADMIN_STAT_LABEL,
    ADMIN_STAT_VALUE,
} from "./admin-ui"

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

/** 角色 / 构筑选项过多，下拉不能退化成方章，统一套用下划线输入外观 */
const SELECT_CLASS = [ADMIN_INPUT, "cursor-pointer appearance-none pr-5"].join(" ")

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
    <div class="admin-page mx-auto flex min-h-full w-full max-w-390 flex-col px-5 pb-5">
        <AdminPageHeader kicker="Rankings" title="榜单管理" description="按角色配置构筑条目并保存榜单">
            <template #actions>
                <button :class="ADMIN_BTN" @click="resetDraft">
                    <Icon icon="ri:add-line" class="h-3.25 w-3.25" />
                    <span>新建榜单</span>
                </button>
                <button :class="ADMIN_BTN_PRIMARY" :disabled="saving" @click="saveList">
                    <Icon icon="ri:save-line" class="h-3.25 w-3.25" />
                    <span>{{ saving ? "保存中…" : "保存榜单" }}</span>
                </button>
            </template>
        </AdminPageHeader>

        <!-- 统计开本：榜单数 / 当前条目 / 状态，连续表面 + 竖细线 -->
        <div class="flex border-b border-base-content/10">
            <div :class="[ADMIN_STAT_CELL, 'pl-0']">
                <p :class="ADMIN_STAT_LABEL">Lists</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ lists.length }}</span>
                    <span :class="ADMIN_NUM_UNIT">个榜单</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">Entries</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ totalItems }}</span>
                    <span :class="ADMIN_NUM_UNIT">个条目</span>
                </p>
            </div>
            <div :class="ADMIN_STAT_CELL">
                <p :class="ADMIN_STAT_LABEL">State</p>
                <p :class="ADMIN_STAT_VALUE">
                    <span class="text-[13px] font-semibold text-base-content">
                        {{ saving ? "保存中" : loading ? "加载中" : "就绪" }}
                    </span>
                </p>
            </div>
            <div class="ml-auto flex items-center pr-0.5 text-[10.5px] text-base-content/35">
                {{ activeId ? "编辑已有榜单" : "新建榜单草稿" }}
            </div>
        </div>

        <div class="grid min-h-0 flex-1 xl:grid-cols-[320px_1fr]">
            <!-- 左：榜单索引（编号 + 名称 + 描述，选中态左侧竖条） -->
            <aside class="flex min-w-0 flex-col border-b border-base-content/10 xl:border-r xl:border-b-0">
                <div class="flex items-center gap-2 py-2.5">
                    <h2 class="text-[15px] font-semibold text-base-content">已有榜单</h2>
                    <span class="font-orbitron text-[11px] tabular-nums text-base-content/40">{{ lists.length }}</span>
                    <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                </div>

                <p v-if="loading" class="border-t border-base-content/10 py-6 text-center text-[11.5px] text-base-content/40">
                    读取中…
                </p>

                <div v-else-if="lists.length === 0" :class="ADMIN_EMPTY">
                    <Icon icon="ri:inbox-line" class="h-5.5 w-5.5 text-base-content/20" />
                    <p class="text-[12px] text-base-content/50">还没有榜单，点「新建榜单」开始</p>
                </div>

                <div v-else class="border-t border-base-content/10">
                    <button
                        v-for="(item, index) in lists"
                        :key="item.id"
                        :class="[
                            'relative w-full cursor-pointer border-b border-base-content/[0.07] px-3 py-3 text-left transition-colors duration-150',
                            activeId === item.id ? 'bg-primary/8' : 'hover:bg-base-content/[0.035]',
                        ]"
                        @click="selectList(item)"
                    >
                        <span v-if="activeId === item.id" class="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden="true" />
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="flex items-baseline gap-2">
                                    <span class="font-orbitron text-[10px] tabular-nums text-base-content/30">
                                        {{ String(index + 1).padStart(2, "0") }}
                                    </span>
                                    <span class="truncate text-[12.5px] font-semibold text-base-content">{{ item.name }}</span>
                                </div>
                                <div class="mt-1 line-clamp-2 pl-6 text-[11.5px] leading-relaxed text-base-content/50">
                                    {{ item.desc || "无描述" }}
                                </div>
                            </div>
                            <span :class="[ADMIN_BADGE, activeId === item.id ? ADMIN_BADGE_PRIMARY : ADMIN_BADGE_NEUTRAL]">
                                {{ activeId === item.id ? "已选" : "切换" }}
                            </span>
                        </div>
                    </button>
                </div>
            </aside>

            <!-- 右：榜单编辑 -->
            <section class="flex min-w-0 flex-col xl:pl-5">
                <div class="grid gap-x-6 gap-y-3 border-b border-base-content/10 py-4 lg:grid-cols-2">
                    <label class="block min-w-0">
                        <span :class="ADMIN_LABEL">榜单名称</span>
                        <input v-model="name" type="text" placeholder="请输入榜单名称" :class="[ADMIN_INPUT, 'mt-1']" />
                    </label>
                    <label class="block min-w-0">
                        <span :class="ADMIN_LABEL">描述</span>
                        <input v-model="desc" type="text" placeholder="请输入描述" :class="[ADMIN_INPUT, 'mt-1']" />
                    </label>
                </div>

                <div class="flex items-center gap-2 py-2.5">
                    <h2 class="text-[15px] font-semibold text-base-content">条目</h2>
                    <span class="font-orbitron text-[11px] tabular-nums text-base-content/40">{{ rows.length }}</span>
                    <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                    <button :class="ADMIN_BTN" @click="addRow">
                        <Icon icon="ri:add-line" class="h-3.25 w-3.25" />
                        <span>添加条目</span>
                    </button>
                </div>

                <div class="border-t border-base-content/10">
                    <div
                        v-for="(row, index) in rows"
                        :key="`${row.charId}-${index}`"
                        class="grid gap-x-4 gap-y-3 border-b border-base-content/[0.07] py-3 lg:grid-cols-[26px_1fr_1fr_auto] lg:items-end"
                    >
                        <span class="font-orbitron text-[10.5px] tabular-nums text-base-content/30 lg:pb-2">
                            {{ String(index + 1).padStart(2, "0") }}
                        </span>
                        <label class="block min-w-0">
                            <span :class="ADMIN_LABEL">角色</span>
                            <span class="relative mt-1 block">
                                <select
                                    v-model.number="row.charId"
                                    :class="[SELECT_CLASS, 'block']"
                                    @change="handleCharChange(index)"
                                >
                                    <option v-for="char in charData" :key="char.id" :value="char.id">{{ char.名称 }}</option>
                                </select>
                                <Icon
                                    icon="ri:arrow-down-s-line"
                                    class="pointer-events-none absolute right-0 bottom-1.5 h-3.5 w-3.5 text-base-content/35"
                                />
                            </span>
                        </label>
                        <label class="block min-w-0">
                            <span :class="ADMIN_LABEL">构筑</span>
                            <span class="relative mt-1 block">
                                <select
                                    v-model="row.buildId"
                                    :class="[SELECT_CLASS, 'block']"
                                    @focus="loadBuildOptions(row.charId)"
                                >
                                    <option value="">请选择构筑</option>
                                    <option v-for="build in buildMap[row.charId] || []" :key="build.id" :value="build.id">
                                        {{ build.title }}
                                    </option>
                                </select>
                                <Icon
                                    icon="ri:arrow-down-s-line"
                                    class="pointer-events-none absolute right-0 bottom-1.5 h-3.5 w-3.5 text-base-content/35"
                                />
                            </span>
                        </label>
                        <button
                            :class="[ADMIN_ROW_ACTION, ADMIN_ROW_TONE_ERROR, 'justify-self-end pb-2']"
                            @click="removeRow(index)"
                        >
                            删除
                        </button>
                    </div>

                    <div v-if="rows.length === 0" :class="ADMIN_EMPTY">
                        <Icon icon="ri:inbox-line" class="h-5.5 w-5.5 text-base-content/20" />
                        <p class="text-[12px] text-base-content/50">还没有条目，点「添加条目」加入一个角色构筑</p>
                    </div>
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3 py-3">
                    <button v-if="activeId" :class="ADMIN_BTN_DANGER" @click="removeList(activeList!)">
                        <Icon icon="ri:delete-bin-line" class="h-3.25 w-3.25" />
                        <span>删除当前榜单</span>
                    </button>
                    <span class="ml-auto text-[10.5px] tracking-wide text-base-content/35">
                        {{ activeId ? "正在编辑已有榜单" : "正在新建榜单" }}
                    </span>
                </div>
            </section>
        </div>
    </div>
</template>
