<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from "vue"
import { deleteUserMutation, User, updateUserMutation, usersWithCountQuery } from "@/api/graphql"
import { useUIStore } from "@/store/ui"

// 编辑用户表单数据
interface EditUserForm {
    email: string
    roles: string
}

// 用户列表数据
const users = ref<User[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const search = ref("")
const loading = ref(false)
const ui = useUIStore()

// 编辑用户相关状态
const editDialogOpen = ref(false)
const editingUser = ref<User | null>(null)
const editForm = ref<EditUserForm>({
    email: "",
    roles: "",
})
const editFormSubmitting = ref(false)

// 获取用户列表
const fetchUsers = async () => {
    loading.value = true
    try {
        const offset = (page.value - 1) * pageSize
        const result = await usersWithCountQuery(
            {
                limit: pageSize,
                offset,
                search: search.value,
            },
            { requestPolicy: "network-only" }
        )

        if (result) {
            users.value = result.users || []
            total.value = result.usersCount || 0
        }
    } catch (error) {
        console.error("获取用户列表失败:", error)
    } finally {
        loading.value = false
    }
}

// 搜索用户
const handleSearch = () => {
    page.value = 1
    fetchUsers()
}

// 分页变更
const handlePageChange = (newPage: number) => {
    page.value = newPage
    fetchUsers()
}

// 删除用户
const deleteUser = async (userId: string) => {
    if (await ui.showDialog("删除确认", "确定要删除这个用户吗？")) {
        try {
            const result = await deleteUserMutation({ id: userId })

            if (result) {
                // 删除成功，刷新用户列表
                await fetchUsers()
            }
        } catch (error) {
            console.error("删除用户失败:", error)
        }
    }
}

// 打开编辑对话框
const openEditDialog = (user: User) => {
    editingUser.value = user
    editForm.value = {
        email: user.email || "",
        roles: user.roles || "",
    }
    editDialogOpen.value = true
}

// 关闭编辑对话框
const closeEditDialog = () => {
    editDialogOpen.value = false
    editingUser.value = null
    editForm.value = {
        email: "",
        roles: "",
    }
}

// 提交编辑
const submitEdit = async () => {
    if (!editingUser.value) return

    // 表单验证
    if (!editForm.value.email || !editForm.value.email.match(/.+@.+\..+/)) {
        ui.showErrorMessage("请输入有效的邮箱地址")
        return
    }

    if (!editForm.value.roles) {
        ui.showErrorMessage("请输入用户角色")
        return
    }

    editFormSubmitting.value = true
    try {
        const result = await updateUserMutation({
            id: editingUser.value.id,
            email: editForm.value.email,
            roles: editForm.value.roles,
        })

        if (result) {
            // 更新成功，刷新用户列表并关闭对话框
            await fetchUsers()
            closeEditDialog()
        }
    } catch (error) {
        console.error("更新用户失败:", error)
        ui.showErrorMessage("更新用户失败")
    } finally {
        editFormSubmitting.value = false
    }
}

const totalPages = computed(() => Math.ceil(total.value / pageSize))
// 页面挂载时获取用户列表
onMounted(() => {
    watchEffect(fetchUsers)
})
</script>

<template>
    <div class="animate-fadeIn p-6 bg-base-200/50 min-h-screen">
        <!-- 页面标题 -->
        <div class="mb-6">
            <h2 class="text-2xl font-semibold text-base-content">用户管理</h2>
            <p class="text-sm text-base-content/70 mt-1">管理系统用户和权限</p>
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
                            placeholder="搜索用户邮箱..."
                            class="input input-bordered w-full pl-12 bg-base-100 text-base-content placeholder:text-base-content/50 focus:outline-none focus:border-primary transition-all duration-200 text-sm"
                            @keyup.enter="handleSearch"
                        />
                    </div>
                </div>
                <button
                    class="btn btn-primary px-8 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 font-medium"
                    @click="handleSearch"
                >
                    <Icon icon="ri:search-line"></Icon>
                    <span>搜索</span>
                </button>
            </div>
        </div>

        <!-- 用户列表 -->
        <div class="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:shadow-md transition-all duration-300">
            <ScrollArea horizontal>
                <table class="table w-full">
                    <thead class="bg-base-200">
                        <tr>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">ID</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">邮箱</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">姓名</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">QQ</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">角色</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                                创建时间
                            </th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-base-200">
                        <tr
                            v-for="(user, index) in users"
                            :key="user.id"
                            class="hover:bg-base-200/50 transition-colors duration-200"
                            :class="{ 'bg-base-200/30': index % 2 === 0 }"
                        >
                            <td class="px-8 py-5 whitespace-nowrap text-sm font-medium text-base-content font-mono">{{ user.id }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/85">{{ user.email }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/85 font-medium">{{ user.name }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/85">{{ user.qq }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm">
                                <span
                                    class="badge badge-sm font-semibold"
                                    :class="{
                                        'badge-primary': user.roles === 'admin',
                                    }"
                                >
                                    {{ user.roles || "user" }}
                                </span>
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/70">{{ user.createdAt }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm font-medium">
                                <div class="flex items-center gap-4">
                                    <button
                                        class="text-primary hover:text-primary/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="openEditDialog(user)"
                                    >
                                        <Icon icon="ri:edit-line" class="group-hover:scale-110 transition-transform duration-200"></Icon>
                                        <span class="group-hover:underline">编辑</span>
                                    </button>
                                    <button
                                        class="text-error hover:text-error/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="deleteUser(user.id)"
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
            <div class="flex justify-between items-center p-4 border-t border-base-300">
                <div class="text-sm text-base-content/70">
                    显示 {{ (page - 1) * pageSize + 1 }} 到 {{ Math.min(page * pageSize, users.length) }} 条，共 {{ users.length }} 条记录
                </div>
                <div class="flex gap-2">
                    <button class="btn btn-sm btn-outline" :disabled="page <= 1" @click="page--">上一页</button>
                    <input v-model="page" type="number" min="1" :max="totalPages" class="input input-bordered input-sm w-20" />
                    <button class="btn btn-sm btn-outline" :disabled="page >= totalPages" @click="page++">下一页</button>
                </div>
            </div>
            <!-- 编辑用户对话框 -->
            <Dialog
                v-model:open="editDialogOpen"
                :title="editingUser ? '编辑用户' : ''"
                :description="editingUser ? `编辑用户: ${editingUser.name}` : ''"
            >
                <template #content>
                    <div class="space-y-4 py-4">
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">邮箱</label>
                            <input
                                v-model="editForm.email"
                                type="email"
                                placeholder="user@example.com"
                                class="input input-bordered w-full"
                                :disabled="editFormSubmitting"
                            />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-base-content">角色</label>
                            <select v-model="editForm.roles" class="select select-bordered w-full" :disabled="editFormSubmitting">
                                <option value="user">user</option>
                                <option value="admin">admin</option>
                            </select>
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

            <!-- 分页 -->
            <div class="mt-0 py-6 px-8 bg-base-200/50 border-t border-base-200">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div class="text-sm text-base-content/70">
                        <span class="font-medium text-base-content/85"
                            >显示 {{ (page - 1) * pageSize + 1 }} 到 {{ Math.min(page * pageSize, total) }} 条，共
                            <span class="font-semibold">{{ total }}</span> 条</span
                        >
                    </div>
                    <div class="flex items-center gap-3">
                        <button class="btn btn-sm btn-outline" :disabled="page === 1" @click="handlePageChange(page - 1)">
                            <span class="ri:arrow-left-line mr-1.5"></span>
                            上一页
                        </button>
                        <button class="btn btn-sm btn-outline" :disabled="page * pageSize >= total" @click="handlePageChange(page + 1)">
                            下一页
                            <span class="ri:arrow-right-line ml-1.5"></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
