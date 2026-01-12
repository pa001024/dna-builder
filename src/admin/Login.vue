<script setup lang="ts">
import { ref } from "vue"
import { useRouter } from "vue-router"
import { gql } from "@urql/vue"
import { gqClient } from "@/api/graphql"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"

const router = useRouter()
const settingStore = useSettingStore()
const uiStore = useUIStore()

// 表单数据
const email = ref("")
const password = ref("")
const loading = ref(false)
const errorMessage = ref("")

// 登录 mutation
const loginMutation = gql`
    mutation Login($email: String!, $password: String!) {
        login(email: $email, password: $password) {
            success
            message
            token
            user {
                id
                name
                email
                qq
                roles
                createdAt
                updateAt
            }
        }
    }
`

// 登录处理
const handleLogin = async () => {
    // 表单验证
    if (!email.value || !password.value) {
        errorMessage.value = "请输入邮箱和密码"
        return
    }

    loading.value = true
    errorMessage.value = ""

    try {
        // 发送登录请求
        const result = await gqClient
            .mutation(loginMutation, {
                email: email.value,
                password: password.value,
            })
            .toPromise()

        if (result.error) {
            errorMessage.value = result.error.message
            return
        }

        const loginResult = result.data?.login
        if (!loginResult?.success) {
            errorMessage.value = loginResult?.message || "登录失败"
            return
        }

        // 保存登录状态
        settingStore.jwtToken = loginResult.token
        localStorage.setItem("loginState", "true")
        localStorage.setItem("userInfo", JSON.stringify(loginResult.user))
        uiStore.setLoginState(true)

        // 检查是否有管理员权限
        if (loginResult.user?.roles?.includes("admin")) {
            // 跳转到后台管理首页
            router.push("/")
        } else {
            errorMessage.value = "您没有管理员权限"
        }
    } catch (error) {
        errorMessage.value = "登录失败，请稍后重试"
        console.error("登录失败:", error)
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div class="admin-login min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div
            class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1"
        >
            <!-- 品牌标识 -->
            <div class="text-center mb-8">
                <div
                    class="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg"
                >
                    <span class="ri:dna-line text-white text-3xl"></span>
                </div>
                <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">DNA Builder</h1>
                <p class="text-gray-500 mt-2">管理员登录</p>
            </div>

            <!-- 错误提示 -->
            <div v-if="errorMessage" class="bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-xl mb-6 shadow-sm animate-shake">
                <div class="flex items-center gap-2">
                    <span class="ri:error-warning-line text-xl"></span>
                    <span>{{ errorMessage }}</span>
                </div>
            </div>

            <!-- 登录表单 -->
            <form class="space-y-6" @submit.prevent="handleLogin">
                <!-- 邮箱输入 -->
                <div>
                    <label for="email" class="block text-sm font-medium text-gray-700 mb-2">邮箱</label>
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 ri:mail-line text-lg"></span>
                        <input
                            id="email"
                            v-model="email"
                            type="email"
                            class="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm focus:shadow-md"
                            placeholder="请输入管理员邮箱"
                            required
                        />
                    </div>
                </div>

                <!-- 密码输入 -->
                <div>
                    <label for="password" class="block text-sm font-medium text-gray-700 mb-2">密码</label>
                    <div class="relative">
                        <span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 ri:lock-line text-lg"></span>
                        <input
                            id="password"
                            v-model="password"
                            type="password"
                            class="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 shadow-sm focus:shadow-md"
                            placeholder="请输入管理员密码"
                            required
                        />
                    </div>
                </div>

                <!-- 登录按钮 -->
                <button
                    type="submit"
                    class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    :disabled="loading"
                >
                    <div v-if="loading" class="flex items-center justify-center gap-2">
                        <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>登录中...</span>
                    </div>
                    <span v-else>登录</span>
                </button>
            </form>

            <!-- 额外信息 -->
            <div class="text-center mt-6 text-sm text-gray-500">
                <p>登录后即可管理系统数据和用户</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
.admin-login {
    animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
