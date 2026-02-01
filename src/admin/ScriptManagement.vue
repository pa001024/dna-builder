<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import {
    deleteScriptMutation,
    pinScriptMutation,
    recommendScriptMutation,
    Script,
    scriptsCountQuery,
    scriptsQuery,
    updateScriptMutation,
} from "@/api/graphql"
import { useUIStore } from "@/store/ui"

// 编辑脚本表单数据
interface EditScriptForm {
    title: string
    description: string
    content: string
    category: string
}

const ui = useUIStore()

// 脚本列表数据
const scripts = ref<Script[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const search = ref("")
const categoryFilter = ref("")
const loading = ref(false)
const totalPages = computed(() => Math.ceil(total.value / pageSize.value))

// 编辑脚本相关状态
const editDialogOpen = ref(false)
const editingScript = ref<Script | null>(null)
const editForm = ref<EditScriptForm>({
    title: "",
    description: "",
    content: "",
    category: "",
})
const editFormSubmitting = ref(false)

// 获取脚本列表
const fetchScripts = async () => {
    loading.value = true
    try {
        const offset = (page.value - 1) * pageSize.value
        const result = await scriptsQuery(
            {
                limit: pageSize.value,
                offset,
                search: search.value,
                category: categoryFilter.value,
            },
            { requestPolicy: "network-only" }
        )

        if (result) {
            scripts.value = result || []
        }
    } catch (error) {
        console.error("获取脚本列表失败:", error)
    } finally {
        loading.value = false
    }
}

// 获取脚本总数
const fetchScriptsCount = async () => {
    try {
        const result = await scriptsCountQuery(
            {
                search: search.value,
                category: categoryFilter.value,
            },
            { requestPolicy: "network-only" }
        )
        if (result !== undefined) {
            total.value = result
        }
    } catch (error) {
        console.error("获取脚本总数失败:", error)
    }
}

// 搜索脚本
const handleSearch = () => {
    page.value = 1
    fetchScripts()
    fetchScriptsCount()
}

// 筛选分类
const handleCategoryFilter = () => {
    page.value = 1
    fetchScripts()
    fetchScriptsCount()
}

// 分页变更
const handlePageChange = (newPage: number) => {
    page.value = newPage
    fetchScripts()
}

// 打开编辑对话框
const openEditDialog = (script: Script) => {
    editingScript.value = script
    editForm.value = {
        title: script.title,
        description: script.description || "",
        content: script.content,
        category: script.category,
    }
    editDialogOpen.value = true
}

// 关闭编辑对话框
const closeEditDialog = () => {
    editDialogOpen.value = false
    editingScript.value = null
    editForm.value = {
        title: "",
        description: "",
        content: "",
        category: "",
    }
}

// 提交编辑
const submitEdit = async () => {
    if (!editingScript.value) return

    // 表单验证
    if (!editForm.value.title || editForm.value.title.trim() === "") {
        ui.showErrorMessage("请输入脚本标题")
        return
    }

    if (!editForm.value.category) {
        ui.showErrorMessage("请选择脚本分类")
        return
    }

    if (!editForm.value.content || editForm.value.content.trim() === "") {
        ui.showErrorMessage("请输入脚本内容")
        return
    }

    editFormSubmitting.value = true
    try {
        const result = await updateScriptMutation({
            id: editingScript.value.id,
            input: {
                title: editForm.value.title,
                description: editForm.value.description,
                content: editForm.value.content,
                category: editForm.value.category,
            },
        })

        if (result) {
            // 更新成功，刷新脚本列表并关闭对话框
            await fetchScripts()
            closeEditDialog()
        }
    } catch (error) {
        console.error("更新脚本失败:", error)
        ui.showErrorMessage("更新脚本失败")
    } finally {
        editFormSubmitting.value = false
    }
}

// 删除脚本
const deleteScript = async (scriptId: string) => {
    if (await ui.showDialog("删除确认", "确定要删除这个脚本吗？")) {
        try {
            const result = await deleteScriptMutation({ id: scriptId })

            if (result) {
                // 删除成功，刷新脚本列表
                await fetchScripts()
                await fetchScriptsCount()
            }
        } catch (error) {
            console.error("删除脚本失败:", error)
        }
    }
}

// 切换推荐状态
const toggleRecommend = async (script: Script) => {
    try {
        const newStatus = !script.isRecommended
        const result = await recommendScriptMutation({
            id: script.id,
            recommended: newStatus,
        })

        if (result) {
            // 刷新列表
            await fetchScripts()
        }
    } catch (error) {
        console.error("更新推荐状态失败:", error)
        ui.showErrorMessage("更新推荐状态失败")
    }
}

// 切换置顶状态
const togglePin = async (script: Script) => {
    try {
        const newStatus = !script.isPinned
        const result = await pinScriptMutation({
            id: script.id,
            pinned: newStatus,
        })

        if (result) {
            // 刷新列表
            await fetchScripts()
        }
    } catch (error) {
        console.error("更新置顶状态失败:", error)
        ui.showErrorMessage("更新置顶状态失败")
    }
}

// 页面挂载时获取脚本列表
onMounted(() => {
    fetchScripts()
    fetchScriptsCount()
})
</script>

<template>
    <div class="animate-fadeIn p-6 bg-base-200/50 min-h-screen">
        <!-- 页面标题 -->
        <div class="mb-6">
            <h2 class="text-2xl font-semibold text-base-content">脚本管理</h2>
            <p class="text-sm text-base-content/70 mt-1">管理游戏脚本和推荐</p>
        </div>

        <!-- 搜索和筛选 -->
        <div class="card bg-base-100 shadow-sm border border-base-300 p-6 mb-6 hover:shadow-md transition-all duration-300">
            <div class="flex flex-col md:flex-row gap-4">
                <div class="flex-1">
                    <div class="relative group">
                        <input
                            v-model="search"
                            type="text"
                            placeholder="搜索脚本标题..."
                            class="input input-bordered w-full"
                            @keyup.enter="handleSearch"
                        />
                    </div>
                </div>
                <div class="flex gap-4">
                    <select v-model="categoryFilter" class="select select-bordered w-full md:w-48" @change="handleCategoryFilter">
                        <option value="">全部分类</option>
                        <option value="game">游戏脚本</option>
                        <option value="tool">工具脚本</option>
                        <option value="other">其他</option>
                    </select>
                    <button
                        class="btn btn-primary px-8 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 font-medium"
                        @click="handleSearch"
                    >
                        <Icon icon="ri:search-line" />
                        <span>搜索</span>
                    </button>
                </div>
            </div>
        </div>

        <!-- 脚本列表 -->
        <div class="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:shadow-md transition-all duration-300">
            <ScrollArea horizontal>
                <table class="table w-full">
                    <thead class="bg-base-200">
                        <tr>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">标题</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">分类</th>
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
                            v-for="(script, index) in scripts"
                            :key="script.id"
                            class="hover:bg-base-200/50 transition-colors duration-200"
                            :class="{ 'bg-base-200/30': index % 2 === 0 }"
                        >
                            <td class="px-8 py-5 text-sm text-base-content font-medium max-w-xs truncate">{{ script.title }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm">
                                <span
                                    class="badge badge-sm"
                                    :class="{
                                        'badge-primary': script.category === 'game',
                                        'badge-secondary': script.category === 'tool',
                                    }"
                                >
                                    {{
                                        script.category === "game" ? "游戏脚本" : script.category === "tool" ? "工具脚本" : script.category
                                    }}
                                </span>
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/85">{{ script.user?.name || "-" }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/70">
                                <span class="ri:eye-line mr-1"></span>{{ script.views }} <span class="ri:heart-line mr-1 ml-2"></span
                                >{{ script.likes }}
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm">
                                <div class="flex gap-2">
                                    <button
                                        v-if="script.isPinned"
                                        class="badge badge-success badge-sm cursor-pointer hover:badge-warning"
                                        title="取消置顶"
                                        @click="togglePin(script)"
                                    >
                                        <Icon icon="ri:pushpin-fill"></Icon> 置顶
                                    </button>
                                    <button
                                        v-if="script.isRecommended"
                                        class="badge badge-primary badge-sm cursor-pointer hover:badge-ghost"
                                        title="取消推荐"
                                        @click="toggleRecommend(script)"
                                    >
                                        <Icon icon="ri:star-fill"></Icon> 推荐
                                    </button>
                                    <button
                                        v-if="!script.isRecommended"
                                        class="badge badge-ghost badge-sm cursor-pointer hover:badge-primary"
                                        title="设为推荐"
                                        @click="toggleRecommend(script)"
                                    >
                                        <Icon icon="ri:star-line"></Icon>
                                    </button>
                                </div>
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm font-medium">
                                <div class="flex items-center gap-4">
                                    <button
                                        class="text-primary hover:text-primary/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="openEditDialog(script)"
                                    >
                                        <Icon icon="ri:edit-line" class="group-hover:scale-110 transition-transform duration-200"></Icon>
                                        <span class="group-hover:underline">编辑</span>
                                    </button>
                                    <button
                                        class="text-error hover:text-error/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="deleteScript(script.id)"
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
            <PageFoot :page="page" :pageSize="pageSize" :totalPages="totalPages" :count="total" @update:page="handlePageChange" />
        </div>

        <!-- 编辑脚本对话框 -->
        <Dialog
            v-model:open="editDialogOpen"
            :title="editingScript ? '编辑脚本' : ''"
            :description="editingScript ? `编辑脚本: ${editingScript.title}` : ''"
        >
            <template #content>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">标题</label>
                        <input
                            v-model="editForm.title"
                            type="text"
                            placeholder="脚本标题"
                            class="input input-bordered w-full"
                            :disabled="editFormSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">分类</label>
                        <select v-model="editForm.category" class="select select-bordered w-full" :disabled="editFormSubmitting">
                            <option value="game">游戏脚本</option>
                            <option value="tool">工具脚本</option>
                            <option value="other">其他</option>
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">描述</label>
                        <textarea
                            v-model="editForm.description"
                            placeholder="脚本描述（可选）"
                            class="textarea textarea-bordered w-full h-24"
                            :disabled="editFormSubmitting"
                        ></textarea>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">内容</label>
                        <textarea
                            v-model="editForm.content"
                            placeholder="脚本内容"
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
