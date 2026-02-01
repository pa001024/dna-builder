<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { createSystemTodoMutation, deleteSystemTodoMutation, Todo, todosWithCountQuery, updateSystemTodoMutation } from "@/api/graphql"
import { useUIStore } from "@/store/ui"

// 编辑待办事项表单数据
interface EditTodoForm {
    title: string
    description: string
    startTime: string
    endTime: string
}

// 待办事项列表数据
const todos = ref<Todo[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const ui = useUIStore()

// 编辑待办事项相关状态
const editDialogOpen = ref(false)
const editingTodo = ref<Todo | null>(null)
const editForm = ref<EditTodoForm>({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
})
const createDialogOpen = ref(false)
const createForm = ref<EditTodoForm>({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
})
const formSubmitting = ref(false)

// 获取待办事项列表
const fetchTodos = async () => {
    loading.value = true
    try {
        const offset = (page.value - 1) * pageSize
        const result = await todosWithCountQuery(
            {
                limit: pageSize,
                offset,
                type: "system", // 只获取系统待办事项
            },
            { requestPolicy: "network-only" }
        )

        if (result) {
            todos.value = (result.todos || []).map(todo => ({
                ...todo,
                description: todo.description ?? "",
                startTime: todo.startTime ?? "",
                endTime: todo.endTime ?? "",
            }))
            total.value = result.todosCount || 0
        }
    } catch (error) {
        console.error("获取待办事项列表失败:", error)
    } finally {
        loading.value = false
    }
}

// 分页变更
const handlePageChange = (newPage: number) => {
    page.value = newPage
    fetchTodos()
}

// 打开创建对话框
const openCreateDialog = () => {
    createForm.value = {
        title: "",
        description: "",
        startTime: "",
        endTime: "",
    }
    createDialogOpen.value = true
}

// 关闭创建对话框
const closeCreateDialog = () => {
    createDialogOpen.value = false
    createForm.value = {
        title: "",
        description: "",
        startTime: "",
        endTime: "",
    }
}

// 打开编辑对话框
const openEditDialog = (todo: Todo) => {
    editingTodo.value = todo
    editForm.value = {
        title: todo.title,
        description: todo.description ?? "",
        startTime: todo.startTime ?? "",
        endTime: todo.endTime ?? "",
    }
    editDialogOpen.value = true
}

// 关闭编辑对话框
const closeEditDialog = () => {
    editDialogOpen.value = false
    editingTodo.value = null
    editForm.value = {
        title: "",
        description: "",
        startTime: "",
        endTime: "",
    }
}

// 提交创建
const submitCreate = async () => {
    // 表单验证
    if (!createForm.value.title || createForm.value.title.trim() === "") {
        ui.showErrorMessage("请输入待办事项标题")
        return
    }

    formSubmitting.value = true
    try {
        const input: any = {
            title: createForm.value.title,
            description: createForm.value.description || null,
        }

        if (createForm.value.startTime) {
            input.startTime = createForm.value.startTime
        }
        if (createForm.value.endTime) {
            input.endTime = createForm.value.endTime
        }

        const result = await createSystemTodoMutation({ input })

        if (result) {
            // 创建成功，刷新待办事项列表并关闭对话框
            await fetchTodos()
            closeCreateDialog()
        }
    } catch (error) {
        console.error("创建待办事项失败:", error)
        ui.showErrorMessage("创建待办事项失败")
    } finally {
        formSubmitting.value = false
    }
}

// 提交编辑
const submitEdit = async () => {
    if (!editingTodo.value) return

    // 表单验证
    if (!editForm.value.title || editForm.value.title.trim() === "") {
        ui.showErrorMessage("请输入待办事项标题")
        return
    }

    formSubmitting.value = true
    try {
        const input: any = {
            title: editForm.value.title,
            description: editForm.value.description || null,
        }

        if (editForm.value.startTime) {
            input.startTime = editForm.value.startTime
        }
        if (editForm.value.endTime) {
            input.endTime = editForm.value.endTime
        }

        const result = await updateSystemTodoMutation({
            id: editingTodo.value.id,
            input,
        })

        if (result) {
            // 更新成功，刷新待办事项列表并关闭对话框
            await fetchTodos()
            closeEditDialog()
        }
    } catch (error) {
        console.error("更新待办事项失败:", error)
        ui.showErrorMessage("更新待办事项失败")
    } finally {
        formSubmitting.value = false
    }
}

// 删除待办事项
const deleteTodo = async (todoId: string) => {
    if (await ui.showDialog("删除确认", "确定要删除这个待办事项吗？")) {
        try {
            const result = await deleteSystemTodoMutation({ id: todoId })

            if (result) {
                // 删除成功，刷新待办事项列表
                await fetchTodos()
            }
        } catch (error) {
            console.error("删除待办事项失败:", error)
        }
    }
}

// 格式化时间显示
const formatTime = (timeStr: string | null) => {
    if (!timeStr) return "-"
    return timeStr
}

// 计算总页数
const totalPages = computed(() => Math.ceil(total.value / pageSize))

// 页面挂载时获取待办事项列表
onMounted(() => {
    fetchTodos()
})
</script>

<template>
    <div class="animate-fadeIn p-6 bg-base-200/50 min-h-screen">
        <!-- 页面标题 -->
        <div class="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
                <h2 class="text-2xl font-semibold text-base-content">待办事项管理</h2>
                <p class="text-sm text-base-content/70 mt-1">管理系统待办事项和任务</p>
            </div>
            <button
                class="btn btn-primary px-6 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 font-medium"
                @click="openCreateDialog"
            >
                <Icon icon="ri:add-line"></Icon>
                <span>创建待办事项</span>
            </button>
        </div>

        <!-- 待办事项列表 -->
        <div class="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:shadow-md transition-all duration-300">
            <ScrollArea horizontal>
                <table class="table w-full">
                    <thead class="bg-base-200">
                        <tr>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">标题</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">描述</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                                时间范围
                            </th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">创建者</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                                创建时间
                            </th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-base-200">
                        <tr
                            v-for="(todo, index) in todos"
                            :key="todo.id"
                            class="hover:bg-base-200/50 transition-colors duration-200"
                            :class="{ 'bg-base-200/30': index % 2 === 0 }"
                        >
                            <td class="px-8 py-5 text-sm text-base-content font-medium max-w-xs truncate">{{ todo.title }}</td>
                            <td class="px-8 py-5 text-sm text-base-content/70 max-w-xs truncate">
                                {{ todo.description || "-" }}
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/70">
                                <span v-if="todo.startTime && todo.endTime">
                                    {{ formatTime(todo.startTime) }} ~ {{ formatTime(todo.endTime) }}
                                </span>
                                <span v-else>-</span>
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/85">{{ todo.user!.name }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/70">{{ todo.createdAt }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm font-medium">
                                <div class="flex items-center gap-4">
                                    <button
                                        class="text-primary hover:text-primary/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="openEditDialog(todo)"
                                    >
                                        <Icon icon="ri:edit-line" class="group-hover:scale-110 transition-transform duration-200"></Icon>
                                        <span class="group-hover:underline">编辑</span>
                                    </button>
                                    <button
                                        class="text-error hover:text-error/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="deleteTodo(todo.id)"
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

        <!-- 创建待办事项对话框 -->
        <Dialog v-model:open="createDialogOpen" title="创建待办事项">
            <template #content>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">标题 <span class="text-error">*</span></label>
                        <input
                            v-model="createForm.title"
                            type="text"
                            placeholder="待办事项标题"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">描述</label>
                        <textarea
                            v-model="createForm.description"
                            placeholder="待办事项描述（可选）"
                            class="textarea textarea-bordered w-full h-24"
                            :disabled="formSubmitting"
                        ></textarea>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">开始时间</label>
                            <input
                                v-model="createForm.startTime"
                                type="datetime-local"
                                class="input input-bordered w-full"
                                :disabled="formSubmitting"
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">结束时间</label>
                            <input
                                v-model="createForm.endTime"
                                type="datetime-local"
                                class="input input-bordered w-full"
                                :disabled="formSubmitting"
                            />
                        </div>
                    </div>
                </div>
            </template>
            <template #actions>
                <button class="btn" :disabled="formSubmitting" @click="closeCreateDialog">取消</button>
                <button class="btn btn-primary" :disabled="formSubmitting" @click="submitCreate">
                    <span v-if="formSubmitting" class="loading loading-spinner loading-sm mr-2"></span>
                    创建
                </button>
            </template>
        </Dialog>

        <!-- 编辑待办事项对话框 -->
        <Dialog
            v-model:open="editDialogOpen"
            :title="editingTodo ? '编辑待办事项' : ''"
            :description="editingTodo ? `编辑待办事项: ${editingTodo.title}` : ''"
        >
            <template #content>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">标题 <span class="text-error">*</span></label>
                        <input
                            v-model="editForm.title"
                            type="text"
                            placeholder="待办事项标题"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">描述</label>
                        <textarea
                            v-model="editForm.description"
                            placeholder="待办事项描述（可选）"
                            class="textarea textarea-bordered w-full h-24"
                            :disabled="formSubmitting"
                        ></textarea>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">开始时间</label>
                            <input
                                v-model="editForm.startTime"
                                type="datetime-local"
                                class="input input-bordered w-full"
                                :disabled="formSubmitting"
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">结束时间</label>
                            <input
                                v-model="editForm.endTime"
                                type="datetime-local"
                                class="input input-bordered w-full"
                                :disabled="formSubmitting"
                            />
                        </div>
                    </div>
                </div>
            </template>
            <template #actions>
                <button class="btn" :disabled="formSubmitting" @click="closeEditDialog">取消</button>
                <button class="btn btn-primary" :disabled="formSubmitting" @click="submitEdit">
                    <span v-if="formSubmitting" class="loading loading-spinner loading-sm mr-2"></span>
                    保存
                </button>
            </template>
        </Dialog>
    </div>
</template>
