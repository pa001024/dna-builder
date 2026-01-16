<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRoute } from "vue-router"
import {
    deleteTimelineMutation,
    likeTimelineMutation,
    pinTimelineMutation,
    recommendTimelineMutation,
    unlikeTimelineMutation,
} from "@/api/mutation"
import { timelinesWithCountQuery } from "@/api/query"
import { charData } from "@/data"
import { useUIStore } from "@/store/ui"

const route = useRoute()
const ui = useUIStore()

// 状态
const loading = ref(false)
const search = ref("")
const currentPage = ref(1)
const pageSize = 20
const selectedItems = ref<string[]>([])
const timelineDialogOpen = ref(false)
const timelineToDelete = ref<string | null>(null)
const sortBy = ref("recent")
const timelines = ref<any[]>([])
const total = ref(0)

// 获取角色名称
const charName = (charId: number) => {
    const char = charData.find(c => c.id === charId)
    return char ? char.名称 : `角色${charId}`
}

// 获取时间线列表
const fetchTimelines = async () => {
    loading.value = true
    try {
        const offset = (currentPage.value - 1) * pageSize
        const result = await timelinesWithCountQuery(
            {
                limit: pageSize,
                offset,
                search: search.value,
                charId: route.query.charId ? parseInt(route.query.charId as string) : undefined,
                userId: undefined,
            },
            { requestPolicy: "network-only" }
        )

        if (result) {
            timelines.value = result.timelines || []
            total.value = result.timelinesCount || 0
        }
    } catch (error) {
        console.error("获取时间线列表失败:", error)
    } finally {
        loading.value = false
    }
}

// 计算属性
const totalPages = computed(() => Math.ceil(total.value / pageSize))

const filteredTimelines = computed(() => {
    return timelines.value.filter((timeline: any) => {
        // 搜索过滤
        if (search.value && !timeline.title.toLowerCase().includes(search.value.toLowerCase())) {
            return false
        }

        // 角色过滤
        if (route.query.charId && timeline.charId !== parseInt(route.query.charId as string)) {
            return false
        }

        return true
    })
})

const selectedAll = computed(() => filteredTimelines.value.length > 0 && selectedItems.value.length === filteredTimelines.value.length)

// 方法
const toggleSelect = (id: string) => {
    if (selectedItems.value.includes(id)) {
        selectedItems.value = selectedItems.value.filter(item => item !== id)
    } else {
        selectedItems.value.push(id)
    }
}

const selectAll = () => {
    if (selectedAll.value) {
        selectedItems.value = []
    } else {
        selectedItems.value = filteredTimelines.value.map(timeline => timeline.id)
    }
}

const clearSelection = () => {
    selectedItems.value = []
}

const handleSearch = () => {
    currentPage.value = 1
    fetchTimelines()
}

const confirmDelete = async () => {
    if (!timelineToDelete.value) return

    loading.value = true
    try {
        await deleteTimelineMutation({ id: timelineToDelete.value })
        ui.showSuccessMessage("时间线已删除")
        await fetchTimelines()
        clearSelection()
    } catch (error) {
        ui.showErrorMessage("删除失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        loading.value = false
        timelineToDelete.value = null
        timelineDialogOpen.value = false
    }
}

const handleLike = async (timeline: any) => {
    loading.value = true
    try {
        if (!timeline.isLiked) {
            await likeTimelineMutation({ id: timeline.id })
            ui.showSuccessMessage("已点赞")
        } else {
            await unlikeTimelineMutation({ id: timeline.id })
            ui.showSuccessMessage("已取消点赞")
        }
        await fetchTimelines()
    } catch (error) {
        ui.showErrorMessage("操作失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        loading.value = false
    }
}

const handleRecommend = async (timeline: any, recommended: boolean) => {
    loading.value = true
    try {
        await recommendTimelineMutation({ id: timeline.id, recommended })
        ui.showSuccessMessage("推荐设置已更新")
        await fetchTimelines()
    } catch (error) {
        ui.showErrorMessage("操作失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        loading.value = false
    }
}

const handlePin = async (timeline: any, pinned: boolean) => {
    loading.value = true
    try {
        await pinTimelineMutation({ id: timeline.id, pinned })
        ui.showSuccessMessage("置顶状态已更新")
        await fetchTimelines()
    } catch (error) {
        ui.showErrorMessage("操作失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        loading.value = false
    }
}

const openDeleteDialog = (timeline: any) => {
    timelineToDelete.value = timeline.id
    timelineDialogOpen.value = true
}

const handleBatchDelete = async () => {
    const count = selectedItems.value.length
    if (count === 0) return

    const confirmed = await ui.showDialog(`确认删除`, `确定要删除这${count}个时间线吗？此操作无法撤销。`)

    if (!confirmed) return

    loading.value = true
    try {
        await Promise.all(selectedItems.value.map(id => deleteTimelineMutation({ id })))
        ui.showSuccessMessage(`成功删除${count}个时间线`)
        await fetchTimelines()
        clearSelection()
    } catch (error) {
        ui.showErrorMessage("批量删除失败:", error instanceof Error ? error.message : "未知错误")
    } finally {
        loading.value = false
    }
}

// 页面挂载时获取时间线列表
onMounted(() => {
    fetchTimelines()
})
</script>

<template>
    <div class="animate-fadeIn p-6 h-full bg-base-200 overflow-hidden">
        <!-- 页面标题 -->
        <header class="bg-base-100 border-b border-base-300 px-6 py-4 mb-4 shadow-sm">
            <h2 class="text-2xl font-bold text-base-content">时间线管理</h2>
        </header>

        <!-- 操作栏 -->
        <div class="px-6 py-4 bg-base-100 border-b border-base-300 mb-4 flex flex-wrap gap-4">
            <!-- 搜索框 -->
            <input
                v-model="search"
                type="text"
                class="input input-bordered w-64"
                placeholder="搜索时间线名称..."
                @keyup.enter="handleSearch"
            />

            <!-- 排序选择 -->
            <select v-model="sortBy" class="select select-bordered w-48">
                <option value="recent">最新</option>
                <option value="likes">最多点赞</option>
                <option value="views">最多浏览</option>
            </select>

            <!-- 刷新按钮 -->
            <button :disabled="loading" class="btn btn-ghost" @click="fetchTimelines">
                <Icon icon="ri:refresh-line" />
            </button>

            <!-- 批量操作 -->
            <button
                v-if="selectedItems.length > 0"
                class="btn btn-ghost"
                @click="selectedItems.length === filteredTimelines.length ? selectAll() : clearSelection"
            >
                {{ selectedItems.length === filteredTimelines.length ? "取消选择" : "全选" }}
            </button>

            <!-- 批量删除 -->
            <button v-if="selectedItems.length > 0" :disabled="loading" class="btn btn-error" @click="handleBatchDelete">
                <Icon icon="ri:delete-bin-line" />
                删除所选 ({{ selectedItems.length }})
            </button>
        </div>

        <!-- 时间线列表 -->
        <div class="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:shadow-md transition-all duration-300">
            <ScrollArea horizontal>
                <table class="table w-full">
                    <thead>
                        <tr>
                            <th class="px-2 text-left">
                                <input
                                    type="checkbox"
                                    :checked="selectedItems.length === filteredTimelines.length"
                                    class="checkbox checkbox-primary checkbox-sm"
                                    @click="selectAll"
                                />
                            </th>
                            <th class="px-2 text-left">时间线名称</th>
                            <th class="px-2 text-left">角色</th>
                            <th class="px-2 text-center">浏览</th>
                            <th class="px-2 text-center">点赞</th>
                            <th class="px-2 text-center">推荐</th>
                            <th class="px-2 text-center">置顶</th>
                            <th class="px-2 text-center">创建者</th>
                            <th class="px-2 text-center">创建时间</th>
                            <th class="px-4 text-left">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="timeline in filteredTimelines"
                            :key="timeline.id"
                            class="group hover:bg-base-50/50 transition-colors duration-100"
                        >
                            <td class="px-2 align-top">
                                <input
                                    type="checkbox"
                                    :checked="selectedItems.includes(timeline.id)"
                                    class="checkbox checkbox-primary checkbox-sm"
                                    @click.stop="toggleSelect(timeline.id)"
                                />
                            </td>
                            <td class="px-2">
                                <span class="font-semibold hover:text-primary cursor-pointer">
                                    {{ timeline.title }}
                                </span>
                            </td>
                            <td class="px-2">{{ charName(timeline.charId) }}</td>
                            <td class="text-center text-base-content/60">{{ timeline.views || 0 }}</td>
                            <td class="text-center">
                                <button
                                    :disabled="loading"
                                    class="btn btn-ghost btn-xs hover:bg-base-200"
                                    title="点赞"
                                    @click="handleLike(timeline)"
                                >
                                    <Icon :icon="timeline.isLiked ? 'ri:thumb-up-fill' : 'ri:thumb-up-line'" />
                                    {{ timeline.likes }}
                                </button>
                            </td>
                            <td class="text-center">
                                <button
                                    :disabled="loading"
                                    class="btn btn-ghost btn-xs hover:bg-base-200"
                                    title="推荐"
                                    @click="handleRecommend(timeline, !timeline.isRecommended)"
                                >
                                    <Icon :icon="timeline.isRecommended ? 'ri:star-fill' : 'ri:star-line'" class="text-yellow-500" />
                                </button>
                            </td>
                            <td class="text-center">
                                <button
                                    :disabled="loading"
                                    class="btn btn-ghost btn-xs hover:bg-base-200"
                                    title="置顶"
                                    @click="handlePin(timeline, !timeline.isPinned)"
                                >
                                    <Icon :icon="timeline.isPinned ? 'ri:pushpin-fill' : 'ri:pushpin-2-line'" class="text-blue-500" />
                                </button>
                            </td>
                            <td class="px-2">
                                <span class="text-sm text-base-content/70">
                                    {{ timeline.user?.name || "-" }}
                                </span>
                            </td>
                            <td class="px-2 text-xs">
                                {{ new Date(timeline.createdAt).toLocaleDateString() }}
                            </td>
                            <td class="px-2">
                                <button
                                    :disabled="loading"
                                    class="btn btn-ghost btn-xs hover:bg-base-200 text-error"
                                    title="删除"
                                    @click="openDeleteDialog(timeline)"
                                >
                                    <Icon icon="ri:delete-bin-line" />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>

            <!-- 分页 -->
            <div class="flex justify-between items-center p-4 border-t border-base-300">
                <div class="text-sm text-base-content/70">
                    显示 {{ (currentPage - 1) * pageSize + 1 }} 到 {{ Math.min(currentPage * pageSize, filteredTimelines.length) }} 条，共
                    {{ filteredTimelines.length }} 条记录
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-sm btn-outline" :disabled="currentPage <= 1" @click="currentPage--">上一页</button>
                    <input v-model="currentPage" type="number" min="1" :max="totalPages" class="input input-bordered input-sm w-20" />
                    <button class="btn btn-sm btn-outline" :disabled="currentPage >= totalPages" @click="currentPage++">下一页</button>
                </div>
            </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="absolute inset-0 bg-base-200/80 flex items-center justify-center z-50">
            <span class="loading loading-lg loading-spinner"></span>
        </div>

        <!-- 删除确认对话框 -->
        <dialog class="modal" :class="{ 'modal-open': timelineDialogOpen }">
            <div class="modal-box modal-sm">
                <h3 class="font-bold text-lg mb-4">删除确认</h3>
                <p class="mb-4">此操作无法撤销，确定要删除这个时间线吗？</p>
                <div class="modal-action">
                    <button class="btn btn-error" :disabled="loading" @click="confirmDelete">删除</button>
                    <form method="dialog">
                        <button class="btn btn-ghost" @click="timelineDialogOpen = false">取消</button>
                    </form>
                </div>
            </div>
        </dialog>
    </div>
</template>
