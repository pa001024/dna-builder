<script setup lang="ts">
import { t } from "i18next"
import { reactive, ref, watch } from "vue"
import { forgotPasswordMutation, loginMutation, registerMutation, resetPasswordMutation } from "@/api/graphql"
import { useAuthStore } from "@/store/auth"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"

const auth = useAuthStore()
const ui = useUIStore()
const user = useUserStore()

// 表单数据
const loading = ref(false)

const loginForm = reactive({
    email: "",
    password: "",
})

const registerForm = reactive({
    name: "",
    qq: "",
    email: "",
    password: "",
})

// 密码重置表单
const resetPasswordForm = reactive({
    step: 1, // 1: 输入邮箱, 2: 输入验证码和新密码
    email: "",
    code: "",
    newPassword: "",
})

/**
 * @description 重置所有表单，保证每次打开弹窗都是干净状态。
 */
function resetForms() {
    loginForm.email = ""
    loginForm.password = ""
    registerForm.name = ""
    registerForm.qq = ""
    registerForm.email = ""
    registerForm.password = ""
    resetPasswordForm.step = 1
    resetPasswordForm.email = ""
    resetPasswordForm.code = ""
    resetPasswordForm.newPassword = ""
    loading.value = false
}

watch(
    () => auth.dialogVisible,
    visible => {
        if (visible) {
            resetForms()
        }
    }
)

/**
 * @description 登录处理：成功后写入 token，由 App.vue 的监听拉取用户资料。
 */
const handleLogin = async () => {
    // 表单验证
    if (!loginForm.email || !loginForm.password) {
        ui.showErrorMessage(t("login-dialog.need_email_password"))
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
            ui.showErrorMessage(loginResult?.message || t("login-dialog.login_failed"))
            return
        }

        // 保存登录状态
        user.jwtToken = loginResult.token
        auth.closeDialog()
        ui.showSuccessMessage(t("login-dialog.login_success"))
    } catch (error) {
        ui.showErrorMessage(t("login-dialog.login_failed_retry"))
        console.error("登录失败:", error)
    } finally {
        loading.value = false
    }
}

/**
 * @description 注册处理：成功后直接登录。
 */
const handleRegister = async () => {
    // 表单验证
    if (!registerForm.name || !registerForm.qq || !registerForm.email || !registerForm.password) {
        ui.showErrorMessage(t("login-dialog.need_all_fields"))
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
            ui.showErrorMessage(registerResult?.message || t("login-dialog.register_failed"))
            return
        }

        // 保存登录状态
        user.jwtToken = registerResult.token
        auth.closeDialog()
        ui.showSuccessMessage(t("login-dialog.register_success"))
    } catch (error) {
        ui.showErrorMessage(t("login-dialog.register_failed_retry"))
        console.error("注册失败:", error)
    } finally {
        loading.value = false
    }
}

/**
 * @description 切换到重置密码页签，并清空重置流程的进度。
 */
const openResetPassword = () => {
    auth.dialogTab = "reset"
    resetPasswordForm.step = 1
    // 复用已填写的邮箱，省去重输
    resetPasswordForm.email = loginForm.email
    resetPasswordForm.code = ""
    resetPasswordForm.newPassword = ""
}

/**
 * @description 发送重置密码验证码，成功后进入第二步。
 */
const sendResetCode = async () => {
    // 表单验证
    if (!resetPasswordForm.email) {
        ui.showErrorMessage(t("login-dialog.email_placeholder"))
        return
    }

    loading.value = true

    try {
        // 发送验证码请求
        const result = await forgotPasswordMutation({
            email: resetPasswordForm.email,
        })

        if (result) {
            ui.showSuccessMessage(t("login-dialog.code_sent"))
            resetPasswordForm.step = 2
        } else {
            ui.showErrorMessage(t("login-dialog.code_send_failed"))
        }
    } catch (error) {
        ui.showErrorMessage(t("login-dialog.code_send_failed"))
        console.error("发送验证码失败:", error)
    } finally {
        loading.value = false
    }
}

/**
 * @description 用验证码重置密码，成功后直接登录。
 */
const handleResetPassword = async () => {
    // 表单验证
    if (!resetPasswordForm.code || !resetPasswordForm.newPassword) {
        ui.showErrorMessage(t("login-dialog.need_code_password"))
        return
    }

    loading.value = true

    try {
        // 发送重置密码请求
        const result = await resetPasswordMutation({
            token: resetPasswordForm.code,
            new_password: resetPasswordForm.newPassword,
        })

        if (result?.success && result.token) {
            // 保存新的登录状态
            user.jwtToken = result.token
            auth.closeDialog()
            ui.showSuccessMessage(t("login-dialog.reset_success"))
        } else {
            ui.showErrorMessage(result?.message || t("login-dialog.reset_failed"))
        }
    } catch (error) {
        ui.showErrorMessage(t("login-dialog.reset_failed_retry"))
        console.error("密码重置失败:", error)
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <!--
        账号弹窗统一 Teleport 到 body：
        页面卡片常带 animate-ef-rise（fill 模式保留 transform）与 backdrop-blur-sm，
        二者都会让卡片成为 position: fixed 后代的包含块，
        导致 daisyUI 的 .modal 按卡片尺寸定位/裁剪，出现弹窗显示不全的问题。
    -->
    <Teleport to="body">
        <div class="modal" :class="{ 'modal-open': auth.dialogVisible }">
            <div class="modal-box relative bg-base-100 shadow-2xl rounded-xs p-0 w-96">
                <div class="p-6">
                    <!-- 登录 -->
                    <form v-if="auth.dialogTab === 'login'" class="space-y-4" @submit.prevent="handleLogin">
                        <div class="text-center mb-6">
                            <div class="w-16 h-16 rounded-xs border border-base-content/10 bg-base-content/3 flex items-center justify-center mx-auto mb-4">
                                <img src="/app-icon.png" alt="DNA Builder" class="w-12 h-12" />
                            </div>
                            <span class="text-lg font-bold">{{ $t('login-dialog.title') }}</span>
                        </div>
                        <!-- 由「需要登录」的功能拉起时，说明当前操作为何需要登录 -->
                        <div v-if="auth.dialogHint" class="rounded-xs border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-base-content/70">
                            {{ auth.dialogHint }}
                        </div>
                        <label class="flex items-center gap-2 w-full">
                            <Icon icon="ri:mail-line" class="w-4 h-4 opacity-70" />
                            <input v-model="loginForm.email" type="text" class="grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary" :placeholder="$t('login-dialog.email_placeholder')" />
                        </label>
                        <label class="flex items-center gap-2 w-full">
                            <Icon icon="ri:lock-line" class="w-4 h-4 opacity-70" />
                            <input v-model="loginForm.password" type="password" class="grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary" :placeholder="$t('login-dialog.password_placeholder')" />
                        </label>
                        <button type="submit" class="btn btn-primary w-full" :disabled="loading">
                            <span v-if="loading" class="loading loading-spinner loading-xs" />
                            <span>{{ loading ? $t('dob-account.logging_in') : $t('dob-account.login') }}</span>
                        </button>
                        <div class="flex items-center justify-between gap-2 text-sm">
                            <button type="button" class="link link-primary transition-colors duration-200" @click="openResetPassword">
                                {{ $t('login-dialog.forgot_password') }}
                            </button>
                            <span class="text-base-content/60">
                                {{ $t('login-dialog.switch_to_register') }}
                                <button type="button" class="link link-primary transition-colors duration-200" @click="auth.openRegister()">
                                    {{ $t('login-dialog.switch_to_register_action') }}
                                </button>
                            </span>
                        </div>
                        <div class="text-center text-sm text-base-content/60">
                            <p>{{ $t('login-dialog.login_hint') }}</p>
                        </div>
                    </form>

                    <!-- 注册 -->
                    <form v-else-if="auth.dialogTab === 'register'" class="space-y-4" @submit.prevent="handleRegister">
                        <div class="text-center mb-6">
                            <div class="w-16 h-16 rounded-xs border border-base-content/10 bg-base-content/3 flex items-center justify-center mx-auto mb-4">
                                <img src="/app-icon.png" alt="DNA Builder" class="w-12 h-12" />
                            </div>
                            <span class="text-lg font-bold">{{ $t('login-dialog.register_title') }}</span>
                        </div>
                        <label class="flex items-center gap-2 w-full">
                            <Icon icon="ri:user-line" class="w-4 h-4 opacity-70" />
                            <input v-model="registerForm.name" type="text" class="grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary" :placeholder="$t('login-dialog.nickname_placeholder')" />
                        </label>
                        <label class="flex items-center gap-2 w-full">
                            <Icon icon="ri:mail-line" class="w-4 h-4 opacity-70" />
                            <input v-model="registerForm.email" type="text" class="grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary" :placeholder="$t('login-dialog.email_placeholder')" />
                        </label>
                        <label class="flex items-center gap-2 w-full">
                            <Icon icon="ri:lock-line" class="w-4 h-4 opacity-70" />
                            <input v-model="registerForm.password" type="password" class="grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary" :placeholder="$t('login-dialog.password_placeholder')" />
                        </label>
                        <label class="flex items-center gap-2 w-full">
                            <Icon icon="ri:qq-line" class="w-4 h-4 opacity-70" />
                            <input v-model="registerForm.qq" type="text" class="grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary" :placeholder="$t('login-dialog.qq_placeholder')" />
                        </label>
                        <LocalQQ
                            @select="
                                qq => {
                                    registerForm.qq = String(qq.uin)
                                    registerForm.name = qq.nickname
                                }
                            "
                        />
                        <button type="submit" class="btn btn-primary w-full" :disabled="loading">
                            <span v-if="loading" class="loading loading-spinner loading-xs" />
                            <span>{{ loading ? $t('dob-account.registering') : $t('dob-account.register') }}</span>
                        </button>
                        <div class="text-center text-sm text-base-content/60">
                            <span>
                                {{ $t('login-dialog.switch_to_login') }}
                                <button type="button" class="link link-primary transition-colors duration-200" @click="auth.openLogin()">
                                    {{ $t('login-dialog.switch_to_login_action') }}
                                </button>
                            </span>
                        </div>
                        <div class="text-center text-sm text-base-content/60">
                            <label class="label cursor-pointer">
                                <span>{{ $t('dob-account.qq_hint') }}</span>
                            </label>
                        </div>
                    </form>

                    <!-- 密码重置 -->
                    <div v-else class="space-y-4">
                        <div class="text-center mb-6">
                            <div class="w-16 h-16 rounded-xs border border-base-content/10 bg-base-content/3 flex items-center justify-center mx-auto mb-4">
                                <img src="/app-icon.png" alt="DNA Builder" class="w-12 h-12" />
                            </div>
                            <span class="text-lg font-bold">{{ $t('login-dialog.reset_title') }}</span>
                        </div>

                        <!-- 步骤1: 输入邮箱 -->
                        <template v-if="resetPasswordForm.step === 1">
                            <div>
                                <p class="text-sm text-base-content/60 mb-2">{{ $t('login-dialog.reset_intro') }}</p>
                                <label class="flex items-center gap-2 w-full">
                                    <Icon icon="ri:mail-line" class="w-4 h-4 opacity-70" />
                                    <input v-model="resetPasswordForm.email" type="text" class="grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary" :placeholder="$t('login-dialog.email_placeholder')" />
                                </label>
                            </div>
                            <button type="button" class="btn btn-primary w-full" :disabled="loading" @click="sendResetCode">
                                <span v-if="loading" class="loading loading-spinner loading-xs" />
                                <span>{{ loading ? $t('dob-account.sending') : $t('dob-account.send_code') }}</span>
                            </button>
                        </template>

                        <!-- 步骤2: 输入验证码和新密码 -->
                        <template v-else>
                            <div>
                                <p class="text-sm text-base-content/60 mb-2">{{ $t('dob-account.enter_code') }}</p>
                                <label class="flex items-center gap-2 w-full">
                                    <Icon icon="ri:lock-line" class="w-4 h-4 opacity-70" />
                                    <input
                                        v-model="resetPasswordForm.code"
                                        type="text"
                                        class="grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                        :placeholder="$t('login-dialog.reset_code_placeholder')"
                                        maxlength="6"
                                    />
                                </label>
                            </div>

                            <div>
                                <p class="text-sm text-base-content/60 mb-2">{{ $t('login-dialog.reset_new_password') }}</p>
                                <label class="flex items-center gap-2 w-full">
                                    <Icon icon="ri:lock-line" class="w-4 h-4 opacity-70" />
                                    <input v-model="resetPasswordForm.newPassword" type="password" class="grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary" :placeholder="$t('login-dialog.reset_new_password_placeholder')" />
                                </label>
                            </div>

                            <div class="flex gap-2">
                                <button type="button" class="btn w-1/3" @click="resetPasswordForm.step = 1">
                                    {{ $t('login-dialog.prev_step') }}
                                </button>
                                <button type="button" class="btn btn-primary flex-1" :disabled="loading" @click="handleResetPassword">
                                    <span v-if="loading" class="loading loading-spinner loading-xs" />
                                    <span>{{ loading ? $t('dob-account.resetting') : $t('dob-account.reset_password') }}</span>
                                </button>
                            </div>
                        </template>

                        <div class="text-center">
                            <button type="button" class="text-sm text-base-content/60 hover:text-base-content transition-colors duration-200" @click="auth.openLogin()">
                                {{ $t('login-dialog.back_to_login') }}
                            </button>
                        </div>
                    </div>

                    <!-- 关闭 -->
                    <button
                        type="button"
                        class="btn btn-ghost btn-square btn-sm absolute right-2 top-2"
                        :aria-label="$t('common.close')"
                        @click="auth.closeDialog()"
                    >
                        <Icon icon="ri:close-line" class="size-4" />
                    </button>
                </div>
            </div>

            <!-- 模态框背景 -->
            <div class="modal-backdrop" @click="auth.closeDialog()" />
        </div>
    </Teleport>
</template>
