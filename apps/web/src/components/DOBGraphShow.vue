<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import type { Graph } from "@/api/graphql"
import {
    deleteGraphMutation,
    graphQuery,
    graphsWithCountQuery,
    likeGraphMutation,
    recommendGraphMutation,
    unlikeGraphMutation,
    updateGraphMutation,
} from "@/api/graphql"
import { env } from "@/env"
import { useAuthStore } from "@/store/auth"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { copyText } from "@/util"
import { formatDateTime } from "@/utils/time"

const props = defineProps<{
    activeGraphId?: string | null
}>()

const ui = useUIStore()
const userStore = useUserStore()
const auth = useAuthStore()
const { t } = useTranslation()

const searchKeyword = ref("")
const sortBy = ref<"latest" | "views" | "likes">("latest")
const loading = ref(false)
const loadingGraph = ref<string | null>(null)
const graphs = ref<Graph[]>([])
const totalCount = ref(0)
const LIMIT = 10

const editModelShow = ref(false)
const editingGraphId = ref<string | null>(null)
const editingGraph = ref<Graph | null>(null)
const editTitle = ref("")
const editDesc = ref("")
const updatingGraph = ref<string | null>(null)
const deletingGraph = ref<string | null>(null)
const recommendingGraph = ref<string | null>(null)
const expandedGraphIds = ref<Record<string, boolean>>({})
const DESCRIPTION_COLLAPSE_THRESHOLD = 40

/** 解析一次拿节点/边数，失败返回 null */
function graphCounts(graph: Graph): { nodes: number; edges: number } | null {
    try {
        const parsed = JSON.parse(graph.graphData) as { nodes?: unknown[]; edges?: unknown[] }
        return {
            nodes: Array.isArray(parsed.nodes) ? parsed.nodes.length : 0,
            edges: Array.isArray(parsed.edges) ? parsed.edges.length : 0,
        }
    } catch {
        return null
    }
}

function nodeCountOf(graph: Graph): number | null {
    return graphCounts(graph)?.nodes ?? null
}

function edgeCountOf(graph: Graph): number | null {
    return graphCounts(graph)?.edges ?? null
}

function formatDate(timestamp: number) {
    return formatDateTime(timestamp).split(" ")[0] ?? ""
}

function shouldShowExpandButton(desc?: string | null) {
    return Boolean(desc?.trim() && desc.trim().length > DESCRIPTION_COLLAPSE_THRESHOLD)
}

function isDescriptionExpanded(id: string) {
    return Boolean(expandedGraphIds.value[id])
}

function toggleDescriptionExpand(id: string) {
    expandedGraphIds.value[id] = !expandedGraphIds.value[id]
}

async function fetchGraphs(offset = 0) {
    loading.value = true
    try {
        const result = await graphsWithCountQuery(
            {
                limit: LIMIT,
                offset,
                search: searchKeyword.value || undefined,
                sortBy: sortBy.value,
            },
            { requestPolicy: "cache-and-network" }
        )

        if (result) {
            graphs.value = result.graphs
            totalCount.value = result.graphsCount
            expandedGraphIds.value = {}
        }
    } catch (error) {
        ui.showErrorMessage("加载节点图列表失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        loading.value = false
    }
}

function handleSearch() {
    void fetchGraphs(0)
}

function handleSortSelect(value: string) {
    sortBy.value = value as "latest" | "views" | "likes"
    handleSearch()
}

const emits = defineEmits<{
    useGraph: [graphData: string, remoteId: string]
}>()

async function useGraph(graphId: string) {
    loadingGraph.value = graphId
    try {
        const result = await graphQuery({ id: graphId }, { requestPolicy: "network-only" })

        if (result?.graphData) {
            emits("useGraph", result.graphData, graphId)
        }
    } catch (error) {
        ui.showErrorMessage("加载节点图失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        loadingGraph.value = null
    }
}

function openEditModal(graph: Graph) {
    editingGraphId.value = graph.id
    editingGraph.value = graph
    editTitle.value = graph.title
    editDesc.value = graph.desc || ""
    editModelShow.value = true
}

async function confirmEdit() {
    if (!editingGraphId.value || !editingGraph.value) return

    if (userStore.id !== editingGraph.value.userId && !userStore.isAdmin) {
        ui.showErrorMessage("没有权限编辑该节点图")
        editModelShow.value = false
        editingGraphId.value = null
        editingGraph.value = null
        return
    }

    updatingGraph.value = editingGraphId.value
    const savedId = editingGraphId.value
    try {
        const result = await updateGraphMutation({
            id: savedId,
            input: {
                title: editTitle.value,
                desc: editDesc.value,
                graphData: editingGraph.value.graphData,
            },
        })

        if (result) {
            const index = graphs.value.findIndex(g => g.id === savedId)
            if (index > -1) {
                graphs.value[index].title = editTitle.value
                graphs.value[index].desc = editDesc.value
            }
            ui.showSuccessMessage("节点图已更新")
        }
    } catch (error) {
        ui.showErrorMessage("更新节点图失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        updatingGraph.value = null
        editModelShow.value = false
        editingGraphId.value = null
        editingGraph.value = null
    }
}

async function toggleRecommend() {
    if (!editingGraphId.value || !editingGraph.value) return
    if (!userStore.isAdmin) return

    const editingGraphIdVal = editingGraphId.value
    const editingGraphVal = editingGraph.value
    recommendingGraph.value = editingGraphIdVal
    try {
        const result = await recommendGraphMutation({
            id: editingGraphIdVal,
            recommended: !editingGraphVal.isRecommended,
        })

        if (result) {
            editingGraphVal.isRecommended = result.isRecommended ?? false
            ui.showSuccessMessage(editingGraphVal.isRecommended ? "节点图已推荐" : "节点图已取消推荐")
        }
    } catch (error) {
        ui.showErrorMessage("推荐操作失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        recommendingGraph.value = null
    }
}

async function deleteGraph() {
    if (!editingGraphId.value || !editingGraph.value) return

    if (userStore.id !== editingGraph.value.userId && !userStore.isAdmin) {
        ui.showErrorMessage("没有权限删除该节点图")
        return
    }

    if (!(await ui.showDialog("删除确认", "确定要删除该节点图吗？此操作不可恢复。"))) {
        return
    }

    deletingGraph.value = editingGraphId.value
    try {
        const result = await deleteGraphMutation({
            id: editingGraphId.value,
        })

        if (result) {
            graphs.value = graphs.value.filter(g => g.id !== editingGraphId.value)
            totalCount.value--
            ui.showSuccessMessage("节点图已删除")
            editModelShow.value = false
        }
    } catch (error) {
        ui.showErrorMessage("删除节点图失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        deletingGraph.value = null
        editingGraphId.value = null
        editingGraph.value = null
    }
}

function copyLink(url: string) {
    void copyText(url)
    ui.showSuccessMessage("链接已复制")
}

async function toggleLike(graph: Graph) {
    if (!auth.requireLogin(t("login-dialog.need_login_hint"))) {
        return
    }

    try {
        if (graph.isLiked) {
            const result = await unlikeGraphMutation({ id: graph.id })
            if (result) {
                graph.isLiked = result.isLiked
                graph.likes = result.likes
            }
        } else {
            const result = await likeGraphMutation({ id: graph.id })
            if (result) {
                graph.isLiked = result.isLiked
                graph.likes = result.likes
            }
        }
    } catch (error) {
        ui.showErrorMessage("点赞操作失败:", error instanceof Error ? error.message : "未知错误")
    }
}

async function loadMore() {
    if (graphs.value.length < totalCount.value) {
        const offset = graphs.value.length
        loading.value = true
        try {
            const result = await graphsWithCountQuery(
                {
                    limit: LIMIT,
                    offset,
                    search: searchKeyword.value || undefined,
                    sortBy: sortBy.value,
                },
                { requestPolicy: "cache-and-network" }
            )

            if (result) {
                graphs.value.push(...result.graphs)
            }
        } catch (error) {
            ui.showErrorMessage("加载更多失败:", error instanceof Error ? error.message : "未知错误")
        } finally {
            loading.value = false
        }
    }
}

const mineOnly = computed(() => Boolean(userStore.id))

onMounted(() => {
    void fetchGraphs()
})

defineExpose({
    fetchGraphs,
})
</script>

<template>
    <div class="flex h-full flex-col">
        <div class="p-2">
            <div class="flex flex-wrap gap-2 p-1.5">
                <input
                    v-model="searchKeyword"
                    type="text"
                    placeholder="搜索节点图标题..."
                    class="min-w-50 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                    @keyup.enter="handleSearch"
                />
                <Select :model-value="sortBy" class="w-36" @update:model-value="handleSortSelect">
                    <SelectItem value="latest">最近更新</SelectItem>
                    <SelectItem value="views">最多浏览</SelectItem>
                    <SelectItem value="likes">最多点赞</SelectItem>
                </Select>
                <button class="btn btn-primary btn-sm" @click="handleSearch">
                    <Icon icon="ri:search-line" class="h-4 w-4" />
                    搜索
                </button>
            </div>
        </div>

        <ScrollArea class="flex-1">
            <div v-if="loading && graphs.length === 0" class="m-4 flex h-full items-center justify-center">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="graphs.length === 0" class="m-4 flex h-full items-center justify-center text-base-content/50">
                <div class="text-center">
                    <Icon icon="ri:inbox-line" class="mx-auto mb-2 h-16 w-16 opacity-30" />
                    <div>暂无节点图</div>
                </div>
            </div>

            <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 p-2">
                <div
                    v-for="(graph, index) in graphs"
                    :key="graph.id"
                    class="group flex animate-ef-rise flex-col rounded-xs border border-base-content/10 bg-base-100/60 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg motion-reduce:animate-none"
                    :style="{ animationDelay: `${Math.min(index * 40, 400)}ms` }"
                >
                    <div class="flex flex-1 flex-col p-4">
                        <div class="mb-2 flex items-start justify-between">
                            <a
                                :href="`${env.endpoint}/graph/${graph.id}`"
                                :title="t('dob-build-show.click_copy_link')"
                                class="line-clamp-2 flex-1 text-base font-semibold text-base-content transition-colors duration-200 group-hover:text-primary"
                                @click.prevent="copyLink(`${env.endpoint}/graph/${graph.id}`)"
                            >
                                {{ graph.title }}
                            </a>
                            <div class="ml-2 flex gap-1">
                                <div v-if="props.activeGraphId === graph.id" class="badge badge-success badge-sm gap-1">
                                    <Icon icon="ri:check-line" class="h-3 w-3" />
                                    使用中
                                </div>
                                <div v-if="graph.isRecommended" class="badge badge-warning badge-sm">
                                    <Icon icon="ri:star-fill" class="h-3 w-3" />
                                </div>
                                <div v-if="graph.isPinned" class="badge badge-primary badge-sm">
                                    <Icon icon="ri:pushpin-fill" class="h-3 w-3" />
                                </div>
                            </div>
                        </div>
                        <div class="mb-2 flex-1 text-sm text-base-content/60">
                            <div :class="{ 'line-clamp-2': !isDescriptionExpanded(graph.id) }">
                                {{ graph.desc || "作者很懒没填任何东西..." }}
                            </div>
                            <button
                                v-if="shouldShowExpandButton(graph.desc)"
                                type="button"
                                class="mt-1 cursor-pointer text-xs text-primary"
                                @click.stop="toggleDescriptionExpand(graph.id)"
                            >
                                {{ isDescriptionExpanded(graph.id) ? "收起" : "查看全部" }}
                            </button>
                        </div>

                        <div v-if="graph.user" class="mb-3 flex items-center gap-2">
                            <div class="avatar placeholder">
                                <div class="bg-neutral text-neutral-content inline-flex h-6 w-6 items-center justify-center rounded-full text-xs">
                                    <QQAvatar :qq="graph.user.qq || 0" :name="graph.user.name" />
                                </div>
                            </div>
                            <span class="text-xs text-base-content/70">{{ graph.user.name }}</span>
                        </div>

                        <div class="mb-3 flex items-center justify-between gap-2">
                            <span class="font-mono text-[11px] tabular-nums text-base-content/55">
                                {{ nodeCountOf(graph) ?? "—" }} 节点 · {{ edgeCountOf(graph) ?? "—" }} 边
                            </span>
                            <span class="font-orbitron text-xs tabular-nums text-base-content/50">{{ formatDate(graph.updateAt) }}</span>
                        </div>

                        <div class="mb-3 flex items-center justify-between text-xs text-base-content/50">
                            <div class="flex items-center gap-3">
                                <div class="flex items-center gap-1 font-orbitron tabular-nums">
                                    <Icon icon="ri:eye-line" class="h-4 w-4" />
                                    <span>{{ graph.views }}</span>
                                </div>
                                <div
                                    class="flex cursor-pointer items-center gap-1 font-orbitron tabular-nums transition-opacity duration-200 hover:opacity-80"
                                    @click="toggleLike(graph)"
                                >
                                    <Icon
                                        :icon="graph.isLiked ? 'ri:heart-fill' : 'ri:heart-line'"
                                        class="h-4 w-4"
                                        :class="graph.isLiked ? 'text-secondary' : ''"
                                    />
                                    <span>{{ graph.likes }}</span>
                                </div>
                            </div>
                            <span v-if="mineOnly && userStore.id === graph.userId" class="text-[11px] text-base-content/40">我的分享</span>
                        </div>

                        <div class="card-actions mt-2 flex justify-end gap-2">
                            <button
                                v-if="userStore.id === graph.userId || userStore.isAdmin"
                                class="btn btn-secondary btn-sm flex-1"
                                :class="{ 'btn-disabled': updatingGraph === graph.id }"
                                @click.stop="openEditModal(graph)"
                            >
                                <span v-if="updatingGraph === graph.id" class="loading loading-spinner loading-sm" />
                                <Icon v-else icon="ri:edit-line" class="h-4 w-4" />
                                编辑
                            </button>
                            <button
                                class="btn btn-primary btn-sm flex-1"
                                :class="{ 'btn-disabled': loadingGraph === graph.id }"
                                @click.stop="useGraph(graph.id)"
                            >
                                <span v-if="loadingGraph === graph.id" class="loading loading-spinner loading-sm" />
                                <Icon v-else icon="ri:download-2-line" class="h-4 w-4" />
                                {{ loadingGraph === graph.id ? "加载中..." : "载入" }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="flex justify-center p-4">
                <button
                    v-if="graphs.length >= LIMIT && graphs.length < totalCount"
                    class="btn btn-ghost btn-sm border border-base-content/15"
                    :class="{ 'btn-disabled': loading }"
                    @click="loadMore"
                >
                    <span v-if="loading" class="loading loading-spinner loading-sm" />
                    <span v-else>加载更多</span>
                </button>
            </div>
        </ScrollArea>

        <div class="border-t border-base-content/10 p-2 text-center text-xs text-base-content/50">
            共 <span class="font-orbitron tabular-nums">{{ totalCount }}</span> 个节点图
        </div>

        <DialogModel v-model="editModelShow" class="bg-base-300">
            <div class="space-y-4">
                <h3 class="text-xl font-bold">编辑节点图</h3>
                <div>
                    <label class="label" for="edit-graph-title">
                        <span class="label-text">标题</span>
                    </label>
                    <input
                        id="edit-graph-title"
                        v-model="editTitle"
                        type="text"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        placeholder="输入标题..."
                        maxlength="50"
                    />
                </div>
                <div>
                    <label class="label" for="edit-graph-desc">
                        <span class="label-text">描述</span>
                    </label>
                    <textarea
                        id="edit-graph-desc"
                        v-model="editDesc"
                        class="w-full resize-none rounded-none border-b border-base-content/20 bg-transparent px-0.5 py-1 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        placeholder="输入描述..."
                        rows="3"
                        maxlength="800"
                    ></textarea>
                </div>
                <div
                    v-if="userStore.isAdmin"
                    class="flex items-center justify-between gap-3 rounded-xs border border-base-content/10 bg-base-100/60 p-3"
                >
                    <div class="flex min-w-0 items-center gap-2">
                        <Icon
                            :icon="editingGraph?.isRecommended ? 'ri:star-fill' : 'ri:star-line'"
                            class="size-4 shrink-0"
                            :class="editingGraph?.isRecommended ? 'text-warning' : 'text-base-content/40'"
                        />
                        <div class="min-w-0">
                            <div class="text-sm font-medium">推荐</div>
                            <div class="text-xs text-base-content/60">推荐后将在推荐区域展示该节点图</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        class="btn btn-sm shrink-0"
                        :class="editingGraph?.isRecommended ? 'btn-warning' : 'btn-ghost border border-base-content/20'"
                        :disabled="recommendingGraph === editingGraphId"
                        @click="toggleRecommend"
                    >
                        <span v-if="recommendingGraph === editingGraphId" class="loading loading-spinner loading-sm" />
                        <Icon v-else :icon="editingGraph?.isRecommended ? 'ri:star-fill' : 'ri:star-line'" class="h-4 w-4" />
                        {{ editingGraph?.isRecommended ? "已推荐" : "推荐" }}
                    </button>
                </div>
            </div>
            <template #action>
                <button
                    type="button"
                    class="btn btn-danger flex-1"
                    :class="{ 'btn-disabled': deletingGraph === editingGraphId }"
                    @click="deleteGraph"
                >
                    <span v-if="deletingGraph === editingGraphId" class="loading loading-spinner loading-sm" />
                    <Icon v-else icon="ri:delete-bin-line" class="h-4 w-4" />
                    删除
                </button>
                <button
                    type="button"
                    class="btn btn-primary flex-1"
                    :class="{ 'btn-disabled': updatingGraph === editingGraphId }"
                    @click="confirmEdit"
                >
                    <span v-if="updatingGraph === editingGraphId" class="loading loading-spinner loading-sm" />
                    保存
                </button>
            </template>
        </DialogModel>
    </div>
</template>
