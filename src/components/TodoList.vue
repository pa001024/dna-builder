<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { computed, onMounted, ref } from "vue"
import { completeTodoMutation, createTodoMutation, deleteTodoMutation, todosQuery, updateTodoMutation } from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { copyText } from "@/util"

const userStore = useUserStore()
const ui = useUIStore()

// 待办事项类型定义
interface Todo {
    id: string
    title: string
    description: string | null
    startTime: string | null
    endTime: string | null
    type: "user" | "system"
    userId: string
    createdAt: string
    updateAt: string
    isCompleted: boolean
    user: {
        id: string
        name: string
    }
}

// 编辑待办事项表单数据
interface EditTodoForm {
    title: string
    description: string
    startTime: string
    endTime: string
}

// 待办事项列表数据
const todos = ref<Todo[]>([])
const loading = ref(false)

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
const hideCompleted = useLocalStorage("todo.hide_completed", true)

// 本地存储的完成状态（未登录用户使用）
const localCompletedTodos = useLocalStorage<Record<string, boolean>>("todo.local_completed_todos", {})

// 计算属性：用户 todos（排在前面）
const userTodos = computed(() => {
    return todos.value.filter(todo => todo.type === "user")
})

// 计算属性：系统 todos
const systemTodos = computed(() => {
    return todos.value.filter(todo => todo.type === "system")
})

// 根据隐藏开关过滤已完成的系统待办
const filteredSystemTodos = computed(() => {
    if (!hideCompleted.value) {
        return systemTodos.value
    }

    return systemTodos.value.filter(todo => !(todo.isCompleted || localCompletedTodos.value[todo.id]))
})

// 当前可见的待办数量（用于空状态展示）
const visibleTodosCount = computed(() => {
    return userTodos.value.length + filteredSystemTodos.value.length
})

// 获取待办事项列表
const fetchTodos = async () => {
    loading.value = true
    try {
        const result = await todosQuery(
            {
                limit: 100,
                offset: 0,
            },
            { requestPolicy: "network-only" }
        )

        if (result) {
            todos.value = (result || []).map(todo => ({
                ...todo,
                description: todo.description ?? "",
                startTime: todo.startTime ?? "",
                endTime: todo.endTime ?? "",
                isCompleted: todo.isCompleted || false,
            })) as Todo[]
        }
    } catch (error) {
        console.error("获取待办事项列表失败:", error)
    } finally {
        loading.value = false
    }
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

        const result = await createTodoMutation({ input })

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

        const result = await updateTodoMutation({
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
            const result = await deleteTodoMutation({ id: todoId })

            if (result) {
                // 删除成功，刷新待办事项列表
                await fetchTodos()
            }
        } catch (error) {
            console.error("删除待办事项失败:", error)
        }
    }
}

// 切换完成状态
const toggleComplete = async (todo: Todo) => {
    // 系统 todo
    if (userStore.userInfo) {
        // 已登录，保存到服务器
        try {
            const result = await completeTodoMutation({ id: todo.id })

            if (result) {
                // 成功，刷新列表
                await fetchTodos()
            }
        } catch (error) {
            console.error("标记完成失败:", error)
            ui.showErrorMessage("标记完成失败")
        }
    } else {
        // 未登录，保存到本地存储
        const newState = !localCompletedTodos.value[todo.id]
        localCompletedTodos.value[todo.id] = newState

        // 更新本地状态
        const todoIndex = todos.value.findIndex(t => t.id === todo.id)
        if (todoIndex !== -1) {
            todos.value[todoIndex].isCompleted = newState
        }
    }
}

// 格式化时间显示
const formatTime = (timeStr: string | null) => {
    if (!timeStr) return ""
    return timeStr.replace("T", " ").substring(0, 16)
}

// 页面挂载时获取待办事项列表
onMounted(() => {
    fetchTodos()
})
</script>

<template>
    <div>
        <!-- 页面标题 -->
        <div class="mb-4 flex items-center justify-between">
            <div>
                <h3 class="text-lg font-semibold text-base-content">待办</h3>
            </div>
            <div class="flex items-center gap-3">
                <label class="label cursor-pointer gap-2 py-0">
                    <span class="label-text text-sm">隐藏已完成</span>
                    <input v-model="hideCompleted" type="checkbox" class="toggle toggle-sm toggle-primary" />
                </label>
                <button class="btn btn-sm btn-primary px-4 flex items-center gap-2" @click="openCreateDialog">
                    <Icon icon="ri:add-line"></Icon>
                    <span>新建</span>
                </button>
            </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="flex justify-center py-8">
            <span class="loading loading-spinner loading-lg"></span>
        </div>

        <!-- 待办事项列表 -->
        <div v-else class="space-y-2">
            <!-- 用户待办事项 -->
            <div v-if="userTodos.length > 0" class="mb-4">
                <h4 class="text-sm font-medium text-base-content/80 mb-2 px-2">个人</h4>
                <div class="space-y-2">
                    <div
                        v-for="todo in userTodos"
                        :key="todo.id"
                        class="card bg-base-100 border border-base-300 p-4 hover:border-primary/50 transition-colors"
                    >
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex-1">
                                <div class="font-medium text-base-content mb-1">{{ todo.title }}</div>
                                <div v-if="todo.description" class="text-sm text-base-content/70 mb-2">
                                    {{ todo.description }}
                                </div>
                                <div v-if="todo.startTime || todo.endTime" class="text-xs text-base-content/50">
                                    <span v-if="todo.startTime">开始: {{ formatTime(todo.startTime) }}</span>
                                    <span v-if="todo.startTime && todo.endTime"> ~ </span>
                                    <span v-if="todo.endTime">结束: {{ formatTime(todo.endTime) }}</span>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button class="btn btn-ghost btn-sm" @click="openEditDialog(todo)">
                                    <Icon icon="ri:edit-line"></Icon>
                                </button>
                                <button class="btn btn-ghost btn-sm text-error" @click="deleteTodo(todo.id)">
                                    <Icon icon="ri:delete-bin-line"></Icon>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 系统待办事项 -->
            <div v-if="filteredSystemTodos.length > 0">
                <h4 class="text-sm font-medium text-base-content/80 mb-2 px-2">系统</h4>
                <div class="space-y-2">
                    <div
                        v-for="todo in filteredSystemTodos"
                        :key="todo.id"
                        class="card bg-base-100 border border-base-300 p-4 hover:border-primary/50 transition-colors"
                        :class="{ 'opacity-60': todo.isCompleted }"
                    >
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex items-start gap-3 flex-1">
                                <!-- 完成状态复选框 -->
                                <input
                                    type="checkbox"
                                    class="checkbox checkbox-primary checkbox-sm mt-1"
                                    :checked="todo.isCompleted || localCompletedTodos[todo.id]"
                                    @click="toggleComplete(todo)"
                                />
                                <div class="flex-1">
                                    <div
                                        class="font-medium text-base-content mb-1"
                                        :class="{ 'line-through text-base-content/50': todo.isCompleted || localCompletedTodos[todo.id] }"
                                    >
                                        {{ todo.title }}

                                        <span
                                            class="inline-block cursor-pointer hover:text-primary ml-1"
                                            @click="copyText(todo.title.replace('兑换码:', '').trim())"
                                            v-if="todo.title.includes('兑换码')"
                                        >
                                            <Icon icon="ri:file-copy-line" />
                                        </span>
                                    </div>
                                    <div v-if="todo.description" class="text-sm text-base-content/70 mb-2">
                                        {{ todo.description }}
                                    </div>
                                    <div v-if="todo.startTime || todo.endTime" class="text-xs text-base-content/50">
                                        <span v-if="todo.startTime">开始: {{ formatTime(todo.startTime) }}</span>
                                        <span v-if="todo.startTime && todo.endTime"> ~ </span>
                                        <span v-if="todo.endTime">结束: {{ formatTime(todo.endTime) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 空状态 -->
            <div v-if="visibleTodosCount === 0" class="text-center text-base-content/50">
                <p>暂无待办事项</p>
            </div>
        </div>

        <!-- 创建待办事项对话框 -->
        <Dialog v-model:open="createDialogOpen" title="新建待办事项">
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
                    <div class="grid grid-cols-2 gap-4">
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
                    <div class="grid grid-cols-2 gap-4">
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
