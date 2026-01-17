<script setup lang="ts">
import { nextTick, reactive, ref } from "vue"
import { loginMutation, registerMutation, updateUserMetaMutation } from "@/api/graphql"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"

const user = useUserStore()
const ui = useUIStore()

// 表单数据
const loading = ref(false)

const loginForm = reactive({
    open: false,
    email: "",
    password: "",
})

const registerForm = reactive({
    open: false,
    name: "",
    qq: "",
    email: "",
    password: "",
})

const nameEdit = reactive({
    active: false,
    name: "",
})

// 登录处理
const handleLogin = async () => {
    // 表单验证
    if (!loginForm.email || !loginForm.password) {
        ui.showErrorMessage("请输入邮箱和密码")
        return
    }

    loading.value = true

    try {
        // 发送登录请求
        const loginResult = await loginMutation({
            email: loginForm.email,
            password: loginForm.password,
        })

        if (!loginResult?.success || !loginResult.token) {
            ui.showErrorMessage(loginResult?.message || "登录失败")
            return
        }

        // 保存登录状态
        user.jwtToken = loginResult.token
        loginForm.open = false
        ui.showSuccessMessage("登录成功")
    } catch (error) {
        ui.showErrorMessage("登录失败，请稍后重试")
        console.error("登录失败:", error)
    } finally {
        loading.value = false
    }
}

const handleRegister = async () => {
    // 表单验证
    if (!registerForm.name || !registerForm.qq || !registerForm.email || !registerForm.password) {
        ui.showErrorMessage("请填写完整信息")
        return
    }

    loading.value = true

    try {
        // 发送注册请求
        const registerResult = await registerMutation({
            name: registerForm.name,
            qq: registerForm.qq,
            email: registerForm.email,
            password: registerForm.password,
        })

        if (!registerResult?.success || !registerResult.token) {
            ui.showErrorMessage(registerResult?.message || "注册失败")
            return
        }

        // 保存登录状态
        user.jwtToken = registerResult.token
        registerForm.open = false
        ui.showSuccessMessage("注册成功")
    } catch (error) {
        ui.showErrorMessage("注册失败，请稍后重试")
        console.error("注册失败:", error)
    } finally {
        loading.value = false
    }
}
// 退出登录
const handleLogout = async () => {
    if (await ui.showDialog("确认退出", "确定要退出当前账号吗？")) {
        user.jwtToken = ""
        ui.showSuccessMessage("已退出登录")
    }
}

// 打开登录弹窗
const openLoginModal = () => {
    loginForm.email = ""
    loginForm.password = ""
    loginForm.open = true
}

const openRegisterModal = () => {
    registerForm.name = ""
    registerForm.qq = ""
    registerForm.email = ""
    registerForm.password = ""
    registerForm.open = true
}
const nameEl = ref<HTMLSpanElement>()
async function startNameEdit() {
    if (nameEdit.active) {
        nameEdit.active = false
        const result = await updateUserMetaMutation({ data: { name: nameEdit.name } })
        if (result?.success && result.token) {
            user.jwtToken = result.token
        } else {
            nameEl.value!.innerText = user.name || "用户"
        }
    } else {
        nameEdit.active = true
        nameEdit.name = user.name || "用户"
        await nextTick()
        const span = nameEl.value!
        span.focus()
        const selection = window.getSelection()!
        const range = document.createRange()
        range.selectNodeContents(span)
        selection.removeAllRanges()
        selection.addRange(range)
    }
}
</script>

<template>
    <div class="flex flex-col gap-4">
        <!-- 账号信息卡片 -->
        <div class="bg-base-100 p-4 rounded-lg">
            <div v-if="user.jwtToken" class="flex flex-col gap-3">
                <!-- 已登录状态 -->
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="flex-none">
                            <QQAvatar v-if="user.qq" :qq="user.qq" :name="user.name!" class="size-12 shadow-lg rounded-full" />
                        </div>
                        <h1 class="text-2xl font-bold flex gap-2 items-center">
                            <div>
                                <div class="font-semibold text-base-content">
                                    <span
                                        v-if="nameEdit.active"
                                        ref="nameEl"
                                        class="select-text px-1 outline rounded-sm"
                                        :contenteditable="nameEdit.active"
                                        @input="nameEdit.name = ($event.target as any)!.textContent"
                                        >{{ nameEdit.name }}</span
                                    >
                                    <span v-else>
                                        {{ user.name || "用户" }}
                                    </span>
                                    <button class="btn btn-ghost btn-square btn-sm" @click="startNameEdit">
                                        <Icon v-if="nameEdit.active" icon="radix-icons:check" class="size-4" />
                                        <Icon v-else icon="ri:edit-line" class="size-4" />
                                    </button>
                                </div>
                                <div class="text-sm text-base-content/60">{{ user.email || "" }}</div>
                            </div>
                        </h1>
                    </div>
                    <div class="ml-auto flex items-center gap-2">
                        <button v-if="user.roles.includes('admin')" class="btn btn-sm btn-outline" @click="$router.push('/admin')">
                            管理
                        </button>
                        <button class="btn btn-sm btn-outline btn-error" @click="handleLogout">退出登录</button>
                    </div>
                </div>
                <!-- 用户详细信息 -->
                <div class="text-sm space-y-1 pt-2 border-t border-base-300">
                    <div v-if="user.qq" class="flex justify-between">
                        <span class="text-base-content/60">QQ:</span>
                        <span>{{ user.qq }}</span>
                    </div>
                    <div v-if="user.roles && user.roles.length" class="flex justify-between">
                        <span class="text-base-content/60">角色:</span>
                        <span v-for="role in user.roles" :key="role" class="badge badge-primary">{{ role }}</span>
                    </div>
                </div>
            </div>
            <!-- 未登录状态 -->
            <div v-else class="text-center py-4">
                <div class="text-base-content/60 mb-2">未登录 DNA Builder 账号</div>
                <button class="btn btn-primary px-12 mx-2" @click="openLoginModal">登录</button>
                <button class="btn btn-primary px-12 mx-2" @click="openRegisterModal">注册</button>
            </div>
        </div>

        <!-- 功能说明 -->
        <div class="text-xs text-base-content/50 p-4">
            <p>DNA Builder 账号用于访问社区功能、分享构建方案等</p>
        </div>

        <!-- 登录模态框 -->
        <div class="modal" :class="{ 'modal-open': loginForm.open }">
            <div class="modal-box bg-base-200 shadow-2xl rounded-xl p-0 w-96">
                <div class="p-6">
                    <!-- 登录表单 -->
                    <form class="space-y-4" @submit.prevent="handleLogin">
                        <div class="text-center mb-6">
                            <div class="w-16 h-16 bg-base-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                                <img src="/app-icon.png" alt="DNA Builder" class="w-12 h-12" />
                            </div>
                            <span class="text-lg font-bold">用户登录</span>
                        </div>
                        <label class="input input-bordered flex items-center gap-2 w-full">
                            <Icon icon="ri:mail-line" class="w-4 h-4 opacity-70" />
                            <input v-model="loginForm.email" type="text" class="grow" placeholder="邮箱" />
                        </label>
                        <label class="input input-bordered flex items-center gap-2 w-full">
                            <Icon icon="ri:lock-line" class="w-4 h-4 opacity-70" />
                            <input v-model="loginForm.password" type="password" class="grow" placeholder="密码" />
                        </label>
                        <!-- 登录按钮 -->
                        <button
                            type="submit"
                            class="w-full bg-linear-to-r from-blue-600 to-indigo-600 text-white py-2.5 px-4 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg"
                            :disabled="loading"
                        >
                            <div v-if="loading" class="flex items-center justify-center gap-2">
                                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>登录中...</span>
                            </div>
                            <span v-else>登录</span>
                        </button>
                    </form>
                    <!-- 额外信息 -->
                    <div class="text-center mt-4 text-sm text-base-content/60">
                        <p>登录后即可使用社区功能</p>
                    </div>
                </div>
            </div>

            <!-- 模态框背景 -->
            <div class="modal-backdrop" @click="loginForm.open = false" />
        </div>
        <!-- 注册模态框 -->
        <div class="modal" :class="{ 'modal-open': registerForm.open }">
            <div class="modal-box bg-base-200 shadow-2xl rounded-xl p-0 w-96">
                <div class="p-6">
                    <!-- 注册表单 -->
                    <form class="space-y-4" @submit.prevent="handleRegister">
                        <div class="text-center mb-6">
                            <div class="w-16 h-16 bg-base-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                                <img src="/app-icon.png" alt="DNA Builder" class="w-12 h-12" />
                            </div>
                            <span class="text-lg font-bold">用户注册</span>
                        </div>
                        <label class="input input-bordered flex items-center gap-2 w-full">
                            <Icon icon="ri:user-line" class="w-4 h-4 opacity-70" />
                            <input v-model="registerForm.name" type="text" class="grow" placeholder="昵称" />
                        </label>
                        <label class="input input-bordered flex items-center gap-2 w-full">
                            <Icon icon="ri:mail-line" class="w-4 h-4 opacity-70" />
                            <input v-model="registerForm.email" type="text" class="grow" placeholder="邮箱" />
                        </label>
                        <label class="input input-bordered flex items-center gap-2 w-full">
                            <Icon icon="ri:lock-line" class="w-4 h-4 opacity-70" />
                            <input v-model="registerForm.password" type="password" class="grow" placeholder="密码" />
                        </label>
                        <label class="input input-bordered flex items-center gap-2 w-full">
                            <Icon icon="ri:qq-line" class="w-4 h-4 opacity-70" />
                            <input v-model="registerForm.qq" type="text" class="grow" placeholder="QQ" />
                        </label>
                        <LocalQQ
                            @select="
                                qq => {
                                    registerForm.qq = String(qq.uin)
                                    registerForm.name = qq.nickname
                                }
                            "
                        />
                        <!-- 登录按钮 -->
                        <button
                            type="submit"
                            class="w-full bg-linear-to-r from-blue-600 to-indigo-600 text-white py-2.5 px-4 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg"
                            :disabled="loading"
                        >
                            <div v-if="loading" class="flex items-center justify-center gap-2">
                                <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>注册中...</span>
                            </div>
                            <span v-else>注册</span>
                        </button>
                    </form>
                    <!-- 额外信息 -->
                    <div class="text-center mt-4 text-sm text-base-content/60">
                        <label class="label cursor-pointer">
                            <span>*QQ号仅用于显示头像 无其他用途</span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- 模态框背景 -->
            <div class="modal-backdrop" @click="registerForm.open = false" />
        </div>
    </div>
</template>
