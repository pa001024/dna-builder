<script setup lang="ts">
import { DNAAPI } from "dna-api"
import { computed, onMounted, ref, watch } from "vue"
import { tauriFetch } from "@/api/app"

interface LoginToast {
    id: number
    kind: "error" | "success"
    message: string
    /** 为 true 时不自动消失，需手动关闭 */
    sticky: boolean
}

// 右下角提示队列：多条共存，各自独立计时；TransitionGroup 接管退场动画
const toasts = ref<LoginToast[]>([])
let toastSeq = 0
const toastHideTimers = new Map<number, ReturnType<typeof setTimeout>>()

const email = ref("")
const phone = ref("")
const code = ref("")
// 验证码倒计时剩余秒数；> 0 时按钮进入倒计时状态并禁止重复发送
const countdown = ref(0)
// 验证码倒计时的定时器句柄
let countdownTimer: ReturnType<typeof setInterval> | undefined
// const captchaId = "a9d7b33f6daf81efea5e3dcea8d92bd7" // ios
const captchaId = "114d4e96cc4536050c7efaeb7e4f3c8c" // android
// const captchaId = "b4b05ab6ca764ef4242e87cba47df9c8" // h5

const server = ref("cn" as "cn" | "global")

const api = new DNAAPI({
    fetchFn: tauriFetch,
    mode: "android",
})

/** 关闭指定提示，顺带清理其自动隐藏定时器 */
function dismissToast(id: number) {
    const timer = toastHideTimers.get(id)
    if (timer !== undefined) {
        clearTimeout(timer)
        toastHideTimers.delete(id)
    }
    const index = toasts.value.findIndex(toast => toast.id === id)
    if (index >= 0) toasts.value.splice(index, 1)
}

function pushToast(kind: LoginToast["kind"], message: string, sticky: boolean) {
    const id = ++toastSeq
    toasts.value.push({ id, kind, message, sticky })
    if (!sticky) {
        toastHideTimers.set(id, setTimeout(() => dismissToast(id), 3e3))
    }
}

function showSuccessMessage(message: string, sticky = false) {
    pushToast("success", message, sticky)
}
function showErrorMessage(message: string, sticky = false) {
    pushToast("error", message, sticky)
}

async function getEmailCode() {
    const response = await api.user.sendEmailVerifyCode(email.value)
    if (response?.code === 0) {
        startCountdown()
    } else {
        showErrorMessage(`验证码发送失败`)
    }
}

async function getSMSCode(validate: any) {
    const response = await api.getSmsCode(phone.value, JSON.stringify(validate))
    if (response.is_success) {
        startCountdown()
    } else {
        showErrorMessage(`验证码发送失败: ${response.msg}`)
    }
}

const login = async () => {
    const isCN = server.value === "cn"

    if (isCN) {
        if (!phone.value) {
            showErrorMessage("请输入手机号")
            return
        }
        if (!code.value) {
            showErrorMessage("请输入验证码")
            return
        }
    } else {
        if (!email.value) {
            showErrorMessage("请输入邮箱")
            return
        }
        if (!code.value) {
            showErrorMessage("请输入验证码")
            return
        }
    }

    try {
        if (window.parent) {
            if (isCN) {
                const res = await api.login(phone.value, code.value)
                if (res.is_success && res.data) {
                    window.parent.postMessage(
                        {
                            type: "LOGIN_SUCCESS",
                            dev_code: api.dev_code,
                            user: { ...res.data },
                        },
                        "*"
                    )
                } else {
                    showErrorMessage(`登录失败: ${res.msg}`)
                    return
                }
            } else {
                const t = await api.user.emailVerify(email.value, code.value)
                const res = await api.user.loginEmail(email.value, code.value, t.suid, t.accessToken)
                if (res.is_success && res.data) {
                    window.parent.postMessage(
                        {
                            type: "LOGIN_SUCCESS",
                            dev_code: api.dev_code,
                            user: { ...res.data },
                        },
                        "*"
                    )
                } else {
                    showErrorMessage(`登录失败: ${res.msg}`)
                    return
                }
            }
        }
    } catch (error) {
        showErrorMessage(`登录失败: ${error}`)
    }
}

watch(server, (newValue, oldValue) => {
    if (newValue !== oldValue) {
        api.server = newValue
        // 切换服务器时重置验证码倒计时，避免残留旧服务器的倒计时状态
        clearInterval(countdownTimer)
        countdown.value = 0
    }
})

const canLogin = computed(() => {
    const isCN = server.value === "cn"
    if (isCN) {
        return phone.value && code.value
    } else {
        return email.value && code.value
    }
})

let captcha: Captcha4Instance

/**
 * 验证码发送成功后开始 60 秒倒计时。
 * 仅在短信/邮件验证码发送成功时调用；发送失败不启动倒计时。
 */
const startCountdown = () => {
    clearInterval(countdownTimer)
    countdown.value = 60
    countdownTimer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) {
            clearInterval(countdownTimer)
        }
    }, 1e3)
}

function showCaptcha() {
    const isCN = server.value === "cn"
    if (isCN) {
        captcha.showCaptcha()
    } else {
        getEmailCode()
    }
}

onMounted(() => {
    window.initAlicom4(
        {
            captchaId,
            https: true,
            product: "bind",
            clientType: "android",
        },
        (captchaInstance: Captcha4Instance) => {
            captcha = captchaInstance
            captcha
                .onReady(() => {})
                .onNextReady(() => {})
                .onSuccess(() => {
                    const validate = captcha.getValidate()
                    if (!validate) {
                        showSuccessMessage("验证码校验失败")
                        return
                    }
                    validate.captcha_id = captchaId
                    getSMSCode(validate)
                })
                .onFail(e => {
                    console.log(e)
                    showErrorMessage(`验证码校验失败: ${e}`)
                })
                .onError(e => {
                    console.log(e)
                    showErrorMessage(`验证码校验失败: ${e}`)
                })
        }
    )
})

//#region ts定义
declare global {
    interface Window {
        initAlicom4: (userConfig: ConfigOptions, callback: (captcha: Captcha4Instance) => void) => void
    }
}

interface ConfigOptions {
    apiServers?: string[]
    staticServers?: string[]
    protocol?: string
    typePath?: string
    timeout?: number
    https?: boolean
    product?: string
    getType?: Record<string, unknown>
    captchaId?: string
    challenge?: string
    riskType?: string
    userInfo?: string
    callType?: string
    language?: string
    clientType?: string
    debug?: Record<string, unknown>
    offlineCb?: () => void
    onError?: (error: { desc: unknown; msg: unknown; code: unknown }) => void
    gt?: string
    error_code?: string
}

interface Captcha4Instance {
    onReady(callback: () => void): Captcha4Instance
    onNextReady(callback: () => void): Captcha4Instance
    onSuccess(callback: () => void): Captcha4Instance
    onFail(callback: (fail: unknown) => void): Captcha4Instance
    onError(callback: (error: unknown) => void): Captcha4Instance
    getValidate(): {
        captcha_id: string
    }
    showCaptcha(): void
    destroy(): void
}
//#endregion
</script>
<template>
    <div class="flex h-full w-full flex-col">
        <!-- 主登录卡（外层区块卡，透出父级弹窗毛玻璃） -->
        <div class="flex h-full w-full flex-col overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60 backdrop-blur-sm">
            <!-- 登录档案头：纸面 + primary 强调线 + 斜切楔形 -->
            <header class="relative flex-none overflow-hidden border-b-2 border-primary px-5 pb-4 pt-5">
                <!-- 右上角斜切楔形 -->
                <span
                    class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                    aria-hidden="true"
                />
                <div class="relative flex items-center gap-3.5">
                    <div class="size-14 shrink-0 overflow-hidden rounded-xs bg-primary/15">
                        <img
                            src="https://herobox-img.yingxiong.com/h5/img/logo_1.png"
                            :alt="$t('dna-login.logo_alt')"
                            class="h-full w-full object-cover"
                        />
                    </div>
                    <div class="min-w-0">
                        <p class="mb-1 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                            <span class="h-px w-6 bg-primary" aria-hidden="true" />
                            Account Login
                        </p>
                        <h1 class="text-xl font-bold leading-none tracking-tight text-base-content">{{ $t("dna-login.title") }}</h1>
                    </div>
                </div>
            </header>

            <!-- 卡片主体 -->
            <div class="flex-1 space-y-4 overflow-y-auto p-5">
                <!-- 服务器选择 -->
                <div>
                    <label for="server" class="mb-1.5 block text-[11px] tracking-wide text-base-content/55">{{
                        $t("dna-login.server")
                    }}</label>
                    <Select
                        id="server"
                        v-model="server"
                        class="w-full cursor-pointer rounded-xs border border-base-content/15 bg-base-content/3 px-2.5 py-2 text-sm text-base-content/85 outline-none transition-colors duration-150 focus:border-primary"
                    >
                        <SelectItem value="cn">{{ $t("dna-login.server_cn") }}</SelectItem>
                        <SelectItem value="global">{{ $t("dna-login.server_intl") }}</SelectItem>
                    </Select>
                </div>

                <!-- 邮箱输入 -->
                <div v-if="server !== 'cn'">
                    <label for="email" class="mb-1.5 block text-[11px] tracking-wide text-base-content/55">{{
                        $t("dna-login.email")
                    }}</label>
                    <input
                        id="email"
                        v-model="email"
                        type="email"
                        name="email"
                        required
                        :placeholder="$t('dna-login.email_placeholder')"
                        class="w-full rounded-xs border border-base-content/15 bg-base-content/3 px-2.5 py-2 text-sm text-base-content/85 outline-none transition-colors duration-150 placeholder:text-base-content/35 focus:border-primary"
                    />
                </div>

                <!-- 手机号输入 -->
                <div v-if="server === 'cn'">
                    <label for="phone" class="mb-1.5 block text-[11px] tracking-wide text-base-content/55">{{
                        $t("dna-login.phone")
                    }}</label>
                    <input
                        id="phone"
                        v-model="phone"
                        type="tel"
                        name="phone"
                        required
                        pattern="[0-9]{11}"
                        :placeholder="$t('dna-login.phone_placeholder')"
                        class="w-full rounded-xs border border-base-content/15 bg-base-content/3 px-2.5 py-2 text-sm text-base-content/85 outline-none transition-colors duration-150 placeholder:text-base-content/35 focus:border-primary"
                    />
                </div>

                <!-- 验证码输入和获取按钮 -->
                <div>
                    <label for="code" class="mb-1.5 block text-[11px] tracking-wide text-base-content/55">{{ $t("dna-login.code") }}</label>
                    <div class="flex gap-2">
                        <input
                            id="code"
                            v-model="code"
                            type="text"
                            required
                            :placeholder="$t('dna-login.code_placeholder')"
                            class="min-w-0 flex-1 rounded-xs border border-base-content/15 bg-base-content/3 px-2.5 py-2 text-sm text-base-content/85 outline-none transition-colors duration-150 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <button
                            class="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-xs border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors duration-150 hover:border-primary/60 hover:bg-primary/15 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                            :disabled="countdown > 0 || (server === 'cn' ? phone.length !== 11 : !email || email.length < 5)"
                            @click="showCaptcha"
                        >
                            {{ countdown > 0 ? `${countdown}秒后重试` : "获取验证码" }}
                        </button>
                    </div>
                </div>

                <!-- 登录按钮 -->
                <button
                    class="inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-xs border border-primary bg-primary text-sm font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                    :disabled="!canLogin"
                    @click="login"
                >
                    {{ $t("dna-login.login") }}
                </button>

                <!-- 辅助信息 -->
                <p class="text-center text-xs text-base-content/50">{{ $t("dna-login.privacy_note") }}</p>
            </div>
        </div>

        <!-- 消息提示队列：多条共存，各自独立计时 -->
        <div class="pointer-events-none fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2">
            <TransitionGroup name="toast-slide">
                <div
                    v-for="toast in toasts"
                    :key="toast.id"
                    role="alert"
                    title="点击关闭"
                    class="pointer-events-auto flex max-w-md cursor-pointer items-start gap-2 rounded-xs border bg-base-100/85 px-4 py-2.5 shadow-lg backdrop-blur-md"
                    :class="toast.kind === 'error' ? 'border-error/40 hover:border-error/70' : 'border-success/40 hover:border-success/70'"
                    @click="dismissToast(toast.id)"
                >
                    <Icon
                        :icon="toast.kind === 'error' ? 'ri:error-warning-line' : 'ri:checkbox-circle-line'"
                        class="mt-0.5 size-5 shrink-0"
                        :class="toast.kind === 'error' ? 'text-error' : 'text-success'"
                    />
                    <span class="text-sm text-base-content/85">{{ toast.message }}</span>
                    <button
                        v-if="toast.sticky"
                        class="ml-1 shrink-0 cursor-pointer rounded-xs p-0.5 text-base-content/50 transition-colors hover:bg-base-content/10 hover:text-base-content"
                        aria-label="关闭提示"
                        @click.stop="dismissToast(toast.id)"
                    >
                        <Icon icon="ri:close-line" class="block size-4" />
                    </button>
                </div>
            </TransitionGroup>
        </div>
    </div>
</template>
<style>
/*
 * 提示条专用转场：只过渡 opacity 与 transform，不用 all。
 * 若用 all，长文本换成短文本时宽高会参与过渡，堆叠布局会被拉着慢慢变形。
 * 队列增删时剩余提示用 move 过渡平滑归位；退场动画由 TransitionGroup 保留节点完成。
 */
.toast-slide-move {
    transition: transform 0.25s ease;
}
.toast-slide-enter-active {
    transition:
        opacity 0.24s ease-out,
        transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-slide-leave-active {
    transition:
        opacity 0.2s ease-in,
        transform 0.2s cubic-bezier(0.6, -0.28, 0.73, 0.04);
}

.toast-slide-enter-from,
.toast-slide-leave-to {
    opacity: 0;
    transform: translateX(2rem);
}

@media (prefers-reduced-motion: reduce) {
    .toast-slide-enter-active,
    .toast-slide-leave-active {
        transition: none;
    }
}
</style>
