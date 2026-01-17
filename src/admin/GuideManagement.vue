<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import {
    deleteGuideMutation,
    Guide,
    guidesWithCountQuery,
    pinGuideMutation,
    recommendGuideMutation,
    updateGuideMutation,
} from "@/api/graphql"
import { useUIStore } from "@/store/ui"

// 编辑攻略表单数据
interface EditGuideForm {
    title: string
    type: string
    content: string
    charId?: number
}

const ui = useUIStore()

// 攻略列表数据
const guides = ref<Guide[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const search = ref("")
const typeFilter = ref("")
const loading = ref(false)
const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

// 编辑攻略相关状态
const editDialogOpen = ref(false)
const editingGuide = ref<Guide | null>(null)
const editForm = ref<EditGuideForm>({
    title: "",
    type: "",
    content: "",
    charId: undefined,
})
const editFormSubmitting = ref(false)

// 获取攻略列表
const fetchGuides = async () => {
    loading.value = true
    try {
        const offset = (page.value - 1) * pageSize.value
        const result = await guidesWithCountQuery(
            {
                limit: pageSize.value,
                offset,
                search: search.value,
                type: typeFilter.value,
            },
            { requestPolicy: "network-only" }
        )

        if (result) {
            guides.value = result.guides || []
            total.value = result.guidesCount || 0
        }
    } catch (error) {
        console.error("获取攻略列表失败:", error)
    } finally {
        loading.value = false
    }
}

// 搜索攻略
const handleSearch = () => {
    page.value = 1
    fetchGuides()
}

// 筛选类型
const handleTypeFilter = () => {
    page.value = 1
    fetchGuides()
}

// 分页变更
const handlePageChange = (newPage: number) => {
    page.value = newPage
    fetchGuides()
}

// 打开编辑对话框
const openEditDialog = (guide: Guide) => {
    editingGuide.value = guide
    editForm.value = {
        title: guide.title,
        type: guide.type,
        content: guide.content,
        charId: guide.charId,
    }
    editDialogOpen.value = true
}

// 关闭编辑对话框
const closeEditDialog = () => {
    editDialogOpen.value = false
    editingGuide.value = null
    editForm.value = {
        title: "",
        type: "",
        content: "",
        charId: undefined,
    }
}

// 提交编辑
const submitEdit = async () => {
    if (!editingGuide.value) return

    // 表单验证
    if (!editForm.value.title || editForm.value.title.trim() === "") {
        ui.showErrorMessage("请输入攻略标题")
        return
    }

    if (!editForm.value.type) {
        ui.showErrorMessage("请选择攻略类型")
        return
    }

    if (!editForm.value.content || editForm.value.content.trim() === "") {
        ui.showErrorMessage("请输入攻略内容")
        return
    }

    editFormSubmitting.value = true
    try {
        const result = await updateGuideMutation({
            id: editingGuide.value.id,
            input: {
                title: editForm.value.title,
                type: editForm.value.type,
                content: editForm.value.content,
                images: editingGuide.value.images || [],
                charId: editForm.value.charId,
                buildId: editingGuide.value.buildId,
            },
        })

        if (result) {
            // 更新成功，刷新攻略列表并关闭对话框
            await fetchGuides()
            closeEditDialog()
        }
    } catch (error) {
        console.error("更新攻略失败:", error)
        ui.showErrorMessage("更新攻略失败")
    } finally {
        editFormSubmitting.value = false
    }
}

// 删除攻略
const deleteGuide = async (guideId: string) => {
    if (await ui.showDialog("删除确认", "确定要删除这个攻略吗？")) {
        try {
            const result = await deleteGuideMutation({ id: guideId })

            if (result) {
                // 删除成功，刷新攻略列表
                await fetchGuides()
            }
        } catch (error) {
            console.error("删除攻略失败:", error)
        }
    }
}

// 切换推荐状态
const toggleRecommend = async (guide: Guide) => {
    try {
        const newStatus = !guide.isRecommended
        const result = await recommendGuideMutation({
            id: guide.id,
            recommended: newStatus,
        })

        if (result) {
            // 刷新列表
            await fetchGuides()
        }
    } catch (error) {
        console.error("更新推荐状态失败:", error)
        ui.showErrorMessage("更新推荐状态失败")
    }
}

// 切换置顶状态
const togglePin = async (guide: Guide) => {
    try {
        const newStatus = !guide.isPinned
        const result = await pinGuideMutation({
            id: guide.id,
            pinned: newStatus,
        })

        if (result) {
            // 刷新列表
            await fetchGuides()
        }
    } catch (error) {
        console.error("更新置顶状态失败:", error)
        ui.showErrorMessage("更新置顶状态失败")
    }
}

// 页面挂载时获取攻略列表
onMounted(() => {
    fetchGuides()
})
</script>

<template>
    <div class="animate-fadeIn p-6 bg-base-200/50 min-h-screen">
        <!-- 页面标题 -->
        <div class="mb-6">
            <h2 class="text-2xl font-semibold text-base-content">攻略管理</h2>
            <p class="text-sm text-base-content/70 mt-1">管理游戏攻略和推荐</p>
        </div>

        <!-- 搜索和筛选 -->
        <div class="card bg-base-100 shadow-sm border border-base-300 p-6 mb-6 hover:shadow-md transition-all duration-300">
            <div class="flex flex-col md:flex-row gap-4">
                <div class="flex-1">
                    <div class="relative group">
                        <span
                            class="absolute left-4 top-1/2 transform -translate-y-1/2 text-base-content/50 ri:search-line text-lg group-hover:text-primary transition-colors duration-200"
                        ></span>
                        <input
                            v-model="search"
                            type="text"
                            placeholder="搜索攻略标题..."
                            class="input input-bordered w-full pl-12 bg-base-100 text-base-content placeholder:text-base-content/50 focus:outline-none focus:border-primary transition-all duration-200 text-sm"
                            @keyup.enter="handleSearch"
                        />
                    </div>
                </div>
                <div class="flex gap-4">
                    <select v-model="typeFilter" class="select select-bordered w-full md:w-48" @change="handleTypeFilter">
                        <option value="">全部类型</option>
                        <option value="char">角色攻略</option>
                        <option value="mission">任务攻略</option>
                        <option value="other">其他</option>
                    </select>
                    <button
                        class="btn btn-primary px-8 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 font-medium"
                        @click="handleSearch"
                    >
                        <Icon icon="ri:search-line"></Icon>
                        <span>搜索</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- 攻略列表 -->
        <div class="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:shadow-md transition-all duration-300">
            <ScrollArea horizontal>
                <table class="table w-full">
                    <thead class="bg-base-200">
                        <tr>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">标题</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">类型</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">作者</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                                浏览/点赞
                            </th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">状态</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-base-200">
                        <tr
                            v-for="(guide, index) in guides"
                            :key="guide.id"
                            class="hover:bg-base-200/50 transition-colors duration-200"
                            :class="{ 'bg-base-200/30': index % 2 === 0 }"
                        >
                            <td class="px-8 py-5 text-sm text-base-content font-medium max-w-xs truncate">{{ guide.title }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm">
                                <span
                                    class="badge badge-sm"
                                    :class="{
                                        'badge-primary': guide.type === 'text',
                                        'badge-secondary': guide.type === 'image',
                                    }"
                                >
                                    {{ guide.type === "text" ? "图文" : guide.type === "image" ? "一图流" : guide.type }}
                                </span>
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/85">{{ guide.user?.name || "-" }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/70">
                                <span class="ri:eye-line mr-1"></span>{{ guide.views }} <span class="ri:heart-line mr-1 ml-2"></span
                                >{{ guide.likes }}
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm">
                                <div class="flex gap-2">
                                    <button
                                        v-if="guide.isPinned"
                                        class="badge badge-success badge-sm cursor-pointer hover:badge-warning"
                                        title="取消置顶"
                                        @click="togglePin(guide)"
                                    >
                                        <Icon icon="ri:pushpin-fill"></Icon> 置顶
                                    </button>
                                    <button
                                        v-if="guide.isRecommended"
                                        class="badge badge-primary badge-sm cursor-pointer hover:badge-ghost"
                                        title="取消推荐"
                                        @click="toggleRecommend(guide)"
                                    >
                                        <Icon icon="ri:star-fill"></Icon> 推荐
                                    </button>
                                    <button
                                        v-if="!guide.isRecommended"
                                        class="badge badge-ghost badge-sm cursor-pointer hover:badge-primary"
                                        title="设为推荐"
                                        @click="toggleRecommend(guide)"
                                    >
                                        <Icon icon="ri:star-line"></Icon>
                                    </button>
                                </div>
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm font-medium">
                                <div class="flex items-center gap-4">
                                    <button
                                        class="text-primary hover:text-primary/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="openEditDialog(guide)"
                                    >
                                        <Icon icon="ri:edit-line" class="group-hover:scale-110 transition-transform duration-200"></Icon>
                                        <span class="group-hover:underline">编辑</span>
                                    </button>
                                    <button
                                        class="text-error hover:text-error/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="deleteGuide(guide.id)"
                                    >
                                        <Icon
                                            icon="ri:delete-bin-line"
                                            class="group-hover:scale-110 transition-transform duration-200"
                                        ></Icon>
                                        <span class="group-hover:underline">删除</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>

            <!-- 分页 -->
            <div class="mt-0 py-6 px-8 bg-base-200/50 border-t border-base-200">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div class="text-sm text-base-content/70">
                        <span class="font-medium text-base-content/85"
                            >显示 {{ (page - 1) * pageSize + 1 }} 到 {{ Math.min(page * pageSize, total) }} 条，共
                            <span class="font-semibold">{{ total }}</span> 条</span
                        >
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-sm btn-outline" :disabled="page <= 1" @click="handlePageChange(page - 1)">上一页</button>
                        <input v-model="page" type="number" min="1" :max="totalPages" class="input input-bordered input-sm w-20" />
                        <button class="btn btn-sm btn-outline" :disabled="page >= totalPages" @click="handlePageChange(page + 1)">
                            下一页
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 编辑攻略对话框 -->
        <Dialog
            v-model:open="editDialogOpen"
            :title="editingGuide ? '编辑攻略' : ''"
            :description="editingGuide ? `编辑攻略: ${editingGuide.title}` : ''"
        >
            <template #content>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">标题</label>
                        <input
                            v-model="editForm.title"
                            type="text"
                            placeholder="攻略标题"
                            class="input input-bordered w-full"
                            :disabled="editFormSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">类型</label>
                        <select v-model="editForm.type" class="select select-bordered w-full" :disabled="editFormSubmitting">
                            <option value="char">角色攻略</option>
                            <option value="mission">任务攻略</option>
                            <option value="other">其他</option>
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">内容</label>
                        <textarea
                            v-model="editForm.content"
                            placeholder="攻略内容（支持Markdown）"
                            class="textarea textarea-bordered w-full h-48"
                            :disabled="editFormSubmitting"
                        ></textarea>
                    </div>
                </div>
            </template>
            <template #actions>
                <button class="btn" :disabled="editFormSubmitting" @click="closeEditDialog">取消</button>
                <button class="btn btn-primary" :disabled="editFormSubmitting" @click="submitEdit">
                    <span v-if="editFormSubmitting" class="loading loading-spinner loading-sm mr-2"></span>
                    保存
                </button>
            </template>
        </Dialog>
    </div>
</template>
