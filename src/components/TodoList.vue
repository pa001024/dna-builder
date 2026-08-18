<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { t } from "i18next"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { completeTodoMutation, createTodoMutation, deleteTodoMutation, todosQuery, updateTodoMutation } from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { copyText } from "@/util"
import { formatDateTime } from "@/utils/time"

const userStore = useUserStore()
const ui = useUIStore()

// 待办事项类型定义
interface Todo {
    id: string
    title: string
    description: string | null
    startTime: number | null
    endTime: number | null
    type: "user" | "system"
    userId: string
    createdAt: number
    updateAt: number
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

// 周常 TODO 定义（每周一 5:00 +08 刷新）
const WEEKLY_ITEMS = [
    { id: "race", titleKey: "todo.weeklyRace" },
    { id: "nightmare", titleKey: "todo.weeklyNightmare" },
    { id: "rouge", titleKey: "todo.weeklyRouge" },
    { id: "bait", titleKey: "todo.weeklyBait" },
    { id: "dungeon-moling", titleKey: "todo.weeklyDungeonMoling" },
    { id: "fish-moling", titleKey: "todo.weeklyFishMoling" },
    { id: "guild-reputation", titleKey: "todo.weeklyGuildReputation" },
    { id: "guild-shop", titleKey: "todo.weeklyGuildShop" },
] as const

/**
 * @description 计算当前周一起始点（周一 05:00 +08:00）的 UTC 时间戳，
 * 用于生成本周的 weekKey 字符串。
 */
function getWeekKey(now = Date.now()) {
    const CST_OFFSET = 8 * 3600 * 1000
    const cst = new Date(now + CST_OFFSET)
    const daysSinceMonday = (cst.getUTCDay() + 6) % 7
    const mondayMidnightUtc = Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate()) - daysSinceMonday * 86400000
    return new Date(mondayMidnightUtc + 5 * 3600 * 1000).toISOString().slice(0, 10)
}

// 周常完成状态：todo.weekly_completed = { [itemId]: weekKey }
const weeklyCompleted = useLocalStorage<Record<string, string>>("todo.weekly_completed", {})
const weekKey = ref(getWeekKey())
let weekTimer: number | null = null

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

// 周常完成判定
function isWeeklyDone(id: string) {
    return weeklyCompleted.value[id] === weekKey.value
}

// 切换周常完成状态
function toggleWeekly(id: string) {
    const next = { ...weeklyCompleted.value }
    if (isWeeklyDone(id)) {
        delete next[id]
    } else {
        next[id] = weekKey.value
    }
    weeklyCompleted.value = next
}

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
                startTime: todo.startTime ?? 0,
                endTime: todo.endTime ?? 0,
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
        startTime: todo.startTime ? new Date(todo.startTime).toISOString().slice(0, 16) : "",
        endTime: todo.endTime ? new Date(todo.endTime).toISOString().slice(0, 16) : "",
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
        ui.showErrorMessage(t("todo.enterTitle"))
        return
    }

    formSubmitting.value = true
    try {
        const input: any = {
            title: createForm.value.title,
            description: createForm.value.description || null,
        }

        if (createForm.value.startTime) {
            input.startTime = Number(createForm.value.startTime)
        }
        if (createForm.value.endTime) {
            input.endTime = Number(createForm.value.endTime)
        }

        const result = await createTodoMutation({ input })

        if (result) {
            // 创建成功，刷新待办事项列表并关闭对话框
            await fetchTodos()
            closeCreateDialog()
        }
    } catch (error) {
        console.error("创建待办事项失败:", error)
        ui.showErrorMessage(t("todo.createFailed"))
    } finally {
        formSubmitting.value = false
    }
}

// 提交编辑
const submitEdit = async () => {
    if (!editingTodo.value) return

    // 表单验证
    if (!editForm.value.title || editForm.value.title.trim() === "") {
        ui.showErrorMessage(t("todo.enterTitle"))
        return
    }

    formSubmitting.value = true
    try {
        const input: any = {
            title: editForm.value.title,
            description: editForm.value.description || null,
        }

        if (editForm.value.startTime) {
            input.startTime = Number(editForm.value.startTime)
        }
        if (editForm.value.endTime) {
            input.endTime = Number(editForm.value.endTime)
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
        ui.showErrorMessage(t("todo.updateFailed"))
    } finally {
        formSubmitting.value = false
    }
}

// 删除待办事项
const deleteTodo = async (todoId: string) => {
    if (await ui.showDialog(t("todo.deleteConfirmTitle"), t("todo.deleteConfirmMessage"))) {
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
            ui.showErrorMessage(t("todo.completeFailed"))
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
const formatTime = (timestamp: number | null) => {
    if (!timestamp) return ""
    return formatDateTime(timestamp)
}

// 每分钟检查周常是否跨周
onMounted(() => {
    fetchTodos()
    weekTimer = window.setInterval(() => {
        const next = getWeekKey()
        if (next !== weekKey.value) weekKey.value = next
    }, 60 * 1000)
})

onBeforeUnmount(() => {
    if (weekTimer !== null) window.clearInterval(weekTimer)
})
</script>

<template>
    <div class="w-full">
        <!-- 章节头：序号 + 标签 + 标题 -->
        <div class="mb-5 flex items-center gap-3.5 animate-ef-rise motion-reduce:animate-none">
            <span
                class="inline-flex h-9 min-w-9 items-center justify-center rounded-xs bg-primary px-2 font-orbitron text-sm font-semibold tracking-wide text-primary-content tabular-nums"
            >
                02
            </span>
            <span class="text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">OPERATIONS</span>
            <span class="text-[17px] font-semibold text-base-content">{{ $t("todo.title") }}</span>
            <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />
        </div>

        <!-- 周常 TODO -->
        <div class="mb-5">
            <div class="mb-2.5 flex items-center gap-2">
                <span class="text-[13px] font-semibold text-base-content">{{ $t("todo.weekly") }}</span>
                <span class="rounded-xs border border-primary/40 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {{ $t("todo.weeklyHint") }}
                </span>
            </div>
            <div class="space-y-1.5">
                <button
                    v-for="item in WEEKLY_ITEMS"
                    :key="item.id"
                    type="button"
                    class="group flex w-full items-center gap-2.5 rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2 text-left transition-colors hover:border-primary/40"
                    :class="{ 'opacity-60': isWeeklyDone(item.id) }"
                    @click="toggleWeekly(item.id)"
                >
                    <span
                        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border transition-colors"
                        :class="
                            isWeeklyDone(item.id)
                                ? 'border-primary bg-primary text-primary-content'
                                : 'border-base-content/30 group-hover:border-primary'
                        "
                    >
                        <Icon v-if="isWeeklyDone(item.id)" icon="radix-icons:check" class="h-3.5 w-3.5" />
                    </span>
                    <span
                        class="flex-1 text-[13px] text-base-content"
                        :class="{ 'line-through': isWeeklyDone(item.id) }"
                    >
                        {{ $t(item.titleKey) }}
                    </span>
                </button>
            </div>
        </div>

        <div class="mb-5 h-px bg-base-content/10" aria-hidden="true" />

        <!-- 工具栏：隐藏已完成 + 新建 -->
        <div class="mb-4 flex items-center justify-between gap-2">
            <label class="flex cursor-pointer items-center gap-2 py-0">
                <span class="text-xs text-base-content/60">{{ $t("todo.hideCompleted") }}</span>
                <input v-model="hideCompleted" type="checkbox" class="toggle toggle-sm toggle-primary rounded-xs" />
            </label>
            <button class="btn btn-sm btn-primary rounded-xs" @click="openCreateDialog">
                <Icon icon="ri:add-line" class="h-4 w-4" />
                <span>{{ $t("todo.create") }}</span>
            </button>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="flex justify-center py-8">
            <span class="loading loading-spinner loading-lg" />
        </div>

        <!-- 待办事项列表 -->
        <div v-else class="space-y-2">
            <!-- 用户待办事项 -->
            <div v-if="userTodos.length > 0" class="mb-4">
                <h4 class="mb-2 px-2 text-sm font-medium text-base-content/80">{{ $t("todo.personal") }}</h4>
                <div class="space-y-2">
                    <div
                        v-for="todo in userTodos"
                        :key="todo.id"
                        class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 transition-colors duration-200 hover:border-primary/40"
                    >
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex-1">
                                <div class="mb-1 text-[13px] font-medium text-base-content">{{ todo.title }}</div>
                                <div v-if="todo.description" class="mb-2 text-xs text-base-content/70">
                                    {{ todo.description }}
                                </div>
                                <div v-if="todo.startTime || todo.endTime" class="text-[11px] text-base-content/50">
                                    <span v-if="todo.startTime">{{ $t("todo.start") }}: {{ formatTime(todo.startTime) }}</span>
                                    <span v-if="todo.startTime && todo.endTime"> ~ </span>
                                    <span v-if="todo.endTime">{{ $t("todo.end") }}: {{ formatTime(todo.endTime) }}</span>
                                </div>
                            </div>
                            <div class="flex gap-1">
                                <button class="btn btn-ghost btn-sm rounded-xs" @click="openEditDialog(todo)">
                                    <Icon icon="ri:edit-line" class="h-4 w-4" />
                                </button>
                                <button class="btn btn-ghost btn-sm rounded-xs text-error" @click="deleteTodo(todo.id)">
                                    <Icon icon="ri:delete-bin-line" class="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 系统待办事项 -->
            <div v-if="filteredSystemTodos.length > 0">
                <h4 class="mb-2 px-2 text-sm font-medium text-base-content/80">{{ $t("todo.system") }}</h4>
                <div class="space-y-2">
                    <div
                        v-for="todo in filteredSystemTodos"
                        :key="todo.id"
                        class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 transition-colors duration-200 hover:border-primary/40"
                        :class="{ 'opacity-60': todo.isCompleted }"
                    >
                        <div class="flex items-start justify-between gap-3">
                            <div class="flex items-start gap-3 flex-1">
                                <!-- 完成状态复选框 -->
                                <input
                                    type="checkbox"
                                    class="checkbox checkbox-primary checkbox-sm mt-1 rounded-none"
                                    :checked="todo.isCompleted || localCompletedTodos[todo.id]"
                                    @click="toggleComplete(todo)"
                                />
                                <div class="flex-1">
                                    <div
                                        class="mb-1 text-[13px] font-medium text-base-content"
                                        :class="{ 'line-through text-base-content/50': todo.isCompleted || localCompletedTodos[todo.id] }"
                                    >
                                        {{ todo.title }}

                                        <span
                                            class="ml-1 inline-block cursor-pointer hover:text-primary"
                                            @click="copyText(todo.title.replace('兑换码:', '').trim())"
                                            v-if="todo.title.includes('兑换码')"
                                        >
                                            <Icon icon="ri:file-copy-line" class="h-4 w-4" />
                                        </span>
                                    </div>
                                    <div v-if="todo.description" class="mb-2 text-xs text-base-content/70">
                                        {{ todo.description }}
                                    </div>
                                    <div v-if="todo.startTime || todo.endTime" class="text-[11px] text-base-content/50">
                                        <span v-if="todo.startTime">{{ $t("todo.start") }}: {{ formatTime(todo.startTime) }}</span>
                                        <span v-if="todo.startTime && todo.endTime"> ~ </span>
                                        <span v-if="todo.endTime">{{ $t("todo.end") }}: {{ formatTime(todo.endTime) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 空状态 -->
            <div v-if="visibleTodosCount === 0" class="text-base-content/50 text-center text-[13px]">
                <p>{{ $t("todo.empty") }}</p>
            </div>
        </div>

        <!-- 创建待办事项对话框 -->
        <Dialog v-model:open="createDialogOpen" :title="$t('todo.createDialogTitle')">
            <template #content>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content"
                            >{{ $t("todo.formTitle") }} <span class="text-error">*</span></label
                        >
                        <input
                            v-model="createForm.title"
                            type="text"
                            :placeholder="$t('todo.titlePlaceholder')"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">{{ $t("todo.formDescription") }}</label>
                        <textarea
                            v-model="createForm.description"
                            :placeholder="$t('todo.descriptionPlaceholder')"
                            class="textarea textarea-bordered h-24 w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">{{ $t("todo.start") }}</label>
                            <input
                                v-model="createForm.startTime"
                                type="datetime-local"
                                class="input input-bordered w-full"
                                :disabled="formSubmitting"
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">{{ $t("todo.end") }}</label>
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
                <button class="btn" :disabled="formSubmitting" @click="closeCreateDialog">{{ $t("setting.cancel") }}</button>
                <button class="btn btn-primary" :disabled="formSubmitting" @click="submitCreate">
                    <span v-if="formSubmitting" class="loading loading-spinner loading-sm mr-2" />
                    {{ $t("todo.save") }}
                </button>
            </template>
        </Dialog>

        <!-- 编辑待办事项对话框 -->
        <Dialog v-model:open="editDialogOpen" :title="$t('todo.editDialogTitle')">
            <template #content>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content"
                            >{{ $t("todo.formTitle") }} <span class="text-error">*</span></label
                        >
                        <input
                            v-model="editForm.title"
                            type="text"
                            :placeholder="$t('todo.titlePlaceholder')"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">{{ $t("todo.formDescription") }}</label>
                        <textarea
                            v-model="editForm.description"
                            :placeholder="$t('todo.descriptionPlaceholder')"
                            class="textarea textarea-bordered h-24 w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">{{ $t("todo.start") }}</label>
                            <input
                                v-model="editForm.startTime"
                                type="datetime-local"
                                class="input input-bordered w-full"
                                :disabled="formSubmitting"
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">{{ $t("todo.end") }}</label>
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
                <button class="btn" :disabled="formSubmitting" @click="closeEditDialog">{{ $t("setting.cancel") }}</button>
                <button class="btn btn-primary" :disabled="formSubmitting" @click="submitEdit">
                    <span v-if="formSubmitting" class="loading loading-spinner loading-sm mr-2" />
                    {{ $t("todo.save") }}
                </button>
            </template>
        </Dialog>
    </div>
</template>