<script setup lang="ts">
import { ref, onMounted } from "vue"
import { gql } from "@urql/vue"
import { gqClient } from "@/api/graphql"

// 用户类型定义
interface User {
    id: string
    email: string
    name: string
    qq: string
    roles: string
    createdAt: string
    updateAt: string
}

// 用户列表数据
const users = ref<User[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const search = ref("")
const loading = ref(false)

// 获取用户列表 query
const usersQuery = gql`
    query Users($limit: Int, $offset: Int, $search: String) {
        users(limit: $limit, offset: $offset, search: $search) {
            id
            name
            email
            qq
            roles
            createdAt
            updateAt
        }
        usersCount(search: $search)
    }
`

// 删除用户 mutation
const deleteUserMutation = gql`
    mutation DeleteUser($id: String!) {
        deleteUser(id: $id)
    }
`

// 获取用户列表
const fetchUsers = async () => {
    loading.value = true
    try {
        const offset = (page.value - 1) * pageSize.value
        const result = await gqClient
            .query(usersQuery, {
                limit: pageSize.value,
                offset,
                search: search.value,
            })
            .toPromise()

        if (result.error) {
            console.error("获取用户列表失败:", result.error)
            return
        }

        users.value = result.data?.users || []
        total.value = result.data?.usersCount || 0
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
    if (confirm("确定要删除这个用户吗？")) {
        try {
            const result = await gqClient
                .mutation(deleteUserMutation, {
                    id: userId,
                })
                .toPromise()

            if (result.error) {
                console.error("删除用户失败:", result.error)
                return
            }

            if (result.data?.deleteUser) {
                // 删除成功，刷新用户列表
                await fetchUsers()
            }
        } catch (error) {
            console.error("删除用户失败:", error)
        }
    }
}

// 页面挂载时获取用户列表
onMounted(() => {
    fetchUsers()
})
</script>

<template>
    <div class="animate-fadeIn p-6">
        <h2 class="text-2xl font-semibold text-gray-800 mb-6">用户管理</h2>

        <!-- 搜索和筛选 -->
        <div class="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-6 hover:shadow-lg transition-all duration-300">
            <div class="flex flex-col md:flex-row gap-4">
                <div class="flex-1">
                    <div class="relative">
                        <span class="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 ri:search-line text-lg"></span>
                        <input
                            v-model="search"
                            type="text"
                            placeholder="搜索用户邮箱..."
                            class="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm focus:shadow-md"
                            @keyup.enter="handleSearch"
                        />
                    </div>
                </div>
                <button
                    class="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center gap-2"
                    @click="handleSearch"
                >
                    <span class="ri:search-line"></span>
                    <span>搜索</span>
                </button>
            </div>
        </div>

        <!-- 用户列表 -->
        <div class="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300">
            <div class="overflow-x-auto">
                <table class="w-full min-w-full divide-y divide-gray-100">
                    <thead class="bg-gradient-to-r from-gray-50 to-blue-50">
                        <tr>
                            <th class="px-8 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                            <th class="px-8 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">邮箱</th>
                            <th class="px-8 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">姓名</th>
                            <th class="px-8 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">QQ</th>
                            <th class="px-8 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">角色</th>
                            <th class="px-8 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">创建时间</th>
                            <th class="px-8 py-4 text-left text-sm font-semibold text-gray-600 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-100">
                        <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50 transition-colors duration-200">
                            <td class="px-8 py-5 whitespace-nowrap text-sm font-medium text-gray-900">{{ user.id }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-gray-600">{{ user.email }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-gray-600">{{ user.name }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-gray-600">{{ user.qq }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm">
                                <span
                                    class="px-3 py-1 rounded-full text-xs font-medium"
                                    :class="{
                                        'bg-green-100 text-green-800': user.roles === 'admin',
                                        'bg-blue-100 text-blue-800': user.roles === 'user',
                                    }"
                                >
                                    {{ user.roles || "user" }}
                                </span>
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-gray-500">{{ user.createdAt }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm font-medium">
                                <button
                                    class="text-blue-600 hover:text-blue-800 mr-6 transition-colors duration-200 flex items-center gap-1 group"
                                >
                                    <span class="ri:edit-line"></span>
                                    <span class="group-hover:underline">编辑</span>
                                </button>
                                <button
                                    class="text-red-600 hover:text-red-800 transition-colors duration-200 flex items-center gap-1 group"
                                    @click="deleteUser(user.id)"
                                >
                                    <span class="ri:delete-bin-line"></span>
                                    <span class="group-hover:underline">删除</span>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- 分页 -->
            <div class="mt-0 py-6 px-8 bg-gray-50 border-t border-gray-100">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div class="text-sm text-gray-600">
                        <span class="font-medium"
                            >显示 {{ (page - 1) * pageSize + 1 }} 到 {{ Math.min(page * pageSize, total) }} 条，共 {{ total }} 条</span
                        >
                    </div>
                    <div class="flex space-x-3">
                        <button
                            class="px-5 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                            :disabled="page === 1"
                            @click="handlePageChange(page - 1)"
                        >
                            <span class="ri:arrow-left-line mr-1"></span>
                            上一页
                        </button>
                        <button
                            class="px-5 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                            :disabled="page * pageSize >= total"
                            @click="handlePageChange(page + 1)"
                        >
                            下一页
                            <span class="ri:arrow-right-line ml-1"></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
