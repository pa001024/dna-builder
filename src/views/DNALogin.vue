<script setup lang="ts">
import { computed, onMounted } from "vue"
import { ref } from "vue"
import { DNAAPI } from "dna-api"
import { tauriFetch } from "../api/app"

const errorMessage = ref("")
const successMessage = ref("")

const phone = ref("")
const code = ref("")
const captchaId = "a9d7b33f6daf81efea5e3dcea8d92bd7"
const dev_code = ref(uuid())

function showSuccessMessage(message: string) {
    successMessage.value = message
    setTimeout(() => {
        successMessage.value = ""
    }, 3e3)
}
function showErrorMessage(message: string) {
    errorMessage.value = message
    setTimeout(() => {
        errorMessage.value = ""
    }, 3e3)
}
function uuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = Math.floor(Math.random() * 16)
        const v = c === "x" ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}
async function getSMSCode(validate: any) {
    const formData = new URLSearchParams()
    formData.append("isCaptcha", "1")
    formData.append("mobile", phone.value)
    formData.append("vJson", JSON.stringify(validate))
    formData.append("timestamp", Date.now().toString())
    const response = await tauriFetch("https://dnabbs-api.yingxiong.com/user/getSmsCode", {
        method: "POST",
        body: formData,
        headers: {
            devcode: dev_code.value,
            source: "ios",
            version: "3.11.0",
            "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        },
    })
    const data = await response.json()
    if (data.code === 200) {
        // showSuccessMessage("验证码发送成功")
    } else {
        showErrorMessage(`验证码发送失败: ${data.msg}`)
    }
}
const login = async () => {
    if (!phone.value) {
        showErrorMessage("请输入手机号")
        return
    }
    if (!code.value) {
        showErrorMessage("请输入验证码")
        return
    }

    try {
        // 向父窗口发送登录成功消息
        if (window.parent) {
            const api = new DNAAPI({
                dev_code: dev_code.value,
                fetchFn: tauriFetch,
            })
            const data = await api.login(phone.value, code.value)
            if (data.code === 200 && data.data) {
                window.parent.postMessage(
                    {
                        type: "LOGIN_SUCCESS",
                        dev_code: dev_code.value,
                        user: { ...data.data },
                    },
                    "*"
                )
            } else {
                showErrorMessage(`登录失败: ${data.msg}`)
                return
            }
        }
    } catch (error) {
        showErrorMessage(`登录失败: ${error}`)
    }
}

const canLogin = computed(() => {
    return phone.value && code.value
})
let captcha: Captcha4Instance

function showCaptcha(e: Event) {
    const elm = e.target as HTMLElement
    const originalText = elm.textContent
    let countdown = 60
    captcha.showCaptcha()
    const timer = setInterval(() => {
        countdown--
        elm.textContent = `${countdown}秒后重试`
        if (countdown <= 0) {
            clearInterval(timer)
            elm.textContent = originalText
        }
    }, 1e3)
}

onMounted(() => {
    window.initAlicom4(
        {
            captchaId, // ios
            https: true,
            product: "bind",
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
// 初始化函数
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
    <div class="w-114 h-116 flex items-center justify-center">
        <!-- 主登录卡片 -->
        <div class="w-full h-full card bg-base-200 shadow-xl overflow-hidden">
            <!-- 卡片头部装饰 -->
            <div class="bg-linear-to-r from-primary/80 to-secondary/80 p-6 text-base-300 flex items-center justify-center gap-4">
                <img src="https://herobox-img.yingxiong.com/h5/img/logo_1.png" alt="皎皎角logo" class="w-16 h-16" />
                <h1 class="text-3xl font-bold text-center">皎皎角登录</h1>
            </div>

            <!-- 卡片主体 -->
            <div class="card-body p-6 gap-4">
                <!-- 手机号输入 -->
                <fieldset class="fieldset">
                    <legend class="fieldset-legend">手机号</legend>
                    <input
                        id="phone"
                        v-model="phone"
                        type="tel"
                        name="phone"
                        required
                        pattern="[0-9]{11}"
                        placeholder="请输入手机号"
                        class="input w-full"
                    />
                </fieldset>

                <!-- 验证码输入和获取按钮 -->
                <fieldset class="fieldset">
                    <legend class="fieldset-legend">验证码</legend>
                    <div class="flex gap-4">
                        <input id="code" v-model="code" type="text" required placeholder="请输入验证码" class="input w-full" />
                        <button class="btn btn-primary" :disabled="phone.length !== 11" @click="showCaptcha">获取验证码</button>
                    </div>
                </fieldset>

                <!-- 登录按钮 -->
                <button class="btn btn-primary btn-block" :disabled="!canLogin" @click="login">登录</button>

                <!-- 辅助信息 -->
                <div class="text-center text-sm text-base-content/70">
                    <p>登录服务不是由DNA Builder提供的。</p>
                </div>
            </div>
        </div>

        <!-- 消息提示 -->
        <div class="fixed bottom-6 right-6 space-y-4">
            <!-- 错误消息 -->
            <transition name="slide-right">
                <div v-if="errorMessage" role="alert" class="alert alert-error cursor-pointer" @click="errorMessage = ''">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <span>{{ errorMessage }}</span>
                </div>
            </transition>

            <!-- 成功消息 -->
            <transition name="slide-right">
                <div v-if="successMessage" role="alert" class="alert alert-success cursor-pointer" @click="successMessage = ''">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <span>{{ successMessage }}</span>
                </div>
            </transition>
        </div>
    </div>
</template>

<style>
.slide-right-enter-active {
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-right-leave-active {
    transition: all 0.2s cubic-bezier(0.6, -0.28, 0.73, 0.04);
}

.slide-right-enter-from {
    opacity: 0;
    transform: translateX(-2rem);
}
.slide-right-leave-to {
    opacity: 0;
    transform: translateX(2rem);
}
</style>
