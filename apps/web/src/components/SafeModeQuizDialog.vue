<script setup lang="ts">
// 安全模式关闭校验弹窗：独立于 Setting.vue 的答题组件。
// 支持选择题（选项方章）与填空题（下划线输入）两种题型；
// 每次打开随机抽取 2 道选择题 + 1 道填空题（共 SAFE_MODE_REQUIRED_COUNT 道），
// 答案用 bcryptjs 与哈希比对，仅校验对错。
// 解锁为双门控（不降级）：答题全对 + 解锁密码正确才 emit("passed")；
// 解锁密码来自服务端下发的当期密码包分享（打开并转存后，从压缩包查看密码填入）。
// 未答对即关闭（取消）时 emit("cancelled")。
import { t } from "i18next"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import type { SafeModeVaultStatus } from "@/api/safe-mode"
import { getSafeModeVaultStatus, verifySafeModeVaultPassword } from "@/api/safe-mode"
import { env } from "@/env"
import { createQrCode, createQrCodePath } from "@/utils/qr-code"
import type { SafeModeQuestion } from "@/utils/safe-mode-questions"
import { checkSafeModeAnswers, pickSafeModeQuestions, SAFE_MODE_REQUIRED_COUNT } from "@/utils/safe-mode-questions"

/** 答错后的冷却时长：5 分钟 */
const QUIZ_COOLDOWN_MS = 5 * 60 * 1000
/** 冷却截止时间在 localStorage 中的持久化 key（防止关闭弹窗绕过冷却） */
const QUIZ_COOLDOWN_KEY = "safe-mode-quiz-cooldown-until"

const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{
    /** 全部答对，允许关闭安全模式 */
    passed: []
    /** 未答对即关闭弹窗（取消），安全模式保持开启 */
    cancelled: []
}>()

/** 当前抽到的题目列表 */
const questions = ref<SafeModeQuestion[]>([])
/** 与 questions 一一对应的用户回答（选择题为选中选项文本，填空题为输入文本） */
const answers = ref<string[]>([])
/** 是否正在校验（bcrypt 比对中） */
const submitting = ref(false)
/** 校验失败提示 */
const error = ref<string | null>(null)
/** 是否已通过校验（避免关闭时重复触发 cancelled） */
let hasPassed = false
/** 解锁密码输入（答题区下方追加：打开分享链接并转存后，从压缩包中查看密码填入） */
const recoveryPassword = ref("")
/** 解锁密码错误提示 */
const recoveryError = ref<string | null>(null)
/** 解锁密码状态（每次打开弹窗时请求；无状态则硬拦截：确认按钮禁用，不降级为仅答题） */
const vaultStatus = ref<SafeModeVaultStatus | null>(null)
const vaultLoading = ref(false)
/** 复制链接后的短暂已复制提示 */
const linkCopied = ref(false)
let linkCopiedTimer: ReturnType<typeof setTimeout> | null = null
/** 冷却截止时间戳（毫秒），0 表示未处于冷却中 */
const cooldownUntil = ref(0)
/** 当前时间戳，用于驱动冷却倒计时显示 */
const now = ref(Date.now())
/** 冷却倒计时定时器句柄 */
let cooldownTimer: ReturnType<typeof setInterval> | null = null

/** 从 localStorage 读取冷却截止时间（已过期则清除），防止关闭弹窗绕过冷却 */
function loadCooldown() {
    const stored = Number(localStorage.getItem(QUIZ_COOLDOWN_KEY) ?? "0")
    if (Number.isFinite(stored) && stored > Date.now()) {
        cooldownUntil.value = stored
        startCooldownTimer()
    } else {
        cooldownUntil.value = 0
        localStorage.removeItem(QUIZ_COOLDOWN_KEY)
    }
}

/** 进入冷却：设置截止时间、持久化并启动倒计时 */
function startCooldown() {
    cooldownUntil.value = Date.now() + QUIZ_COOLDOWN_MS
    localStorage.setItem(QUIZ_COOLDOWN_KEY, String(cooldownUntil.value))
    startCooldownTimer()
}

/** 启动每秒一次的倒计时刷新；冷却到期时自动清除 */
function startCooldownTimer() {
    if (cooldownTimer) return
    cooldownTimer = setInterval(() => {
        now.value = Date.now()
        if (cooldownUntil.value > 0 && now.value >= cooldownUntil.value) {
            cooldownUntil.value = 0
            localStorage.removeItem(QUIZ_COOLDOWN_KEY)
            stopCooldownTimer()
        }
    }, 1000)
}

/** 停止倒计时定时器 */
function stopCooldownTimer() {
    if (cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimer = null
    }
}

/** 剩余冷却秒数（向上取整，用于展示） */
const cooldownRemaining = computed(() => Math.max(0, Math.ceil((cooldownUntil.value - now.value) / 1000)))
/** 是否处于冷却中 */
const inCooldown = computed(() => cooldownRemaining.value > 0)
/** 剩余冷却时间文本（mm:ss） */
const cooldownText = computed(() => {
    const minutes = Math.floor(cooldownRemaining.value / 60)
    const seconds = cooldownRemaining.value % 60
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
})

/**
 * 重置答题状态：随机抽取 2 道选择题 + 1 道填空题，并清空回答与错误提示。
 */
function resetQuiz() {
    hasPassed = false
    const picked = pickSafeModeQuestions()
    questions.value = picked
    answers.value = picked.map(() => "")
    error.value = null
    submitting.value = false
    recoveryPassword.value = ""
    recoveryError.value = null
    vaultStatus.value = null
    vaultLoading.value = false
    void loadVaultStatus()
}

/**
 * 拉取服务端解锁密码状态（确认密码已就绪），失败则保持不可用并禁用提交。
 */
async function loadVaultStatus() {
    vaultLoading.value = true
    try {
        const result = await getSafeModeVaultStatus()
        vaultStatus.value = result.status
    } catch {
        vaultStatus.value = null
    } finally {
        vaultLoading.value = false
    }
}

// 打开弹窗时重新抽题；未通过校验就关闭时视为取消
watch(open, value => {
    if (value) {
        loadCooldown()
        resetQuiz()
    } else if (!hasPassed) {
        emit("cancelled")
    }
})

// 防御：父组件以已打开状态挂载时兜底初始化
onMounted(() => {
    loadCooldown()
    if (open.value) {
        resetQuiz()
    }
})

// 卸载时清理冷却倒计时与复制提示定时器
onBeforeUnmount(() => {
    stopCooldownTimer()
    if (linkCopiedTimer) {
        clearTimeout(linkCopiedTimer)
        linkCopiedTimer = null
    }
})

/** 已作答的题数（选择题以选中选项为准，填空题以非空输入为准） */
const answeredCount = computed(() =>
    questions.value.reduce((count, question, index) => {
        const value = answers.value[index] ?? ""
        const answered = question.kind === "choice" ? value !== "" : value.trim() !== ""
        return count + (answered ? 1 : 0)
    }, 0)
)

/** 是否可提交：不在冷却中、题目全部作答、解锁密码就绪且密码非空、不在校验中（无密码时禁用，不降级） */
const canSubmit = computed(
    () =>
        !submitting.value &&
        !inCooldown.value &&
        questions.value.length > 0 &&
        answeredCount.value === questions.value.length &&
        vaultStatus.value !== null &&
        recoveryPassword.value.trim() !== ""
)

/**
 * 提交解锁：先本地验答题（bcrypt），全对再经服务端验恢复密码，两项都对才通过。
 * 任一失败都进入 5 分钟冷却，冷却期间禁止再次提交。
 */
async function handleSubmit() {
    if (!canSubmit.value) {
        return
    }
    submitting.value = true
    error.value = null
    recoveryError.value = null
    try {
        const allCorrect = await checkSafeModeAnswers(questions.value, answers.value)
        if (!allCorrect) {
            error.value = t("setting.safeModeAnswerWrong")
            startCooldown()
            return
        }
        let matched = false
        try {
            matched = await verifySafeModeVaultPassword(recoveryPassword.value.trim())
        } catch {
            recoveryError.value = t("setting.safeModeRecoveryUnavailable")
            startCooldown()
            return
        }
        if (!matched) {
            recoveryError.value = t("setting.safeModeRecoveryWrong")
            startCooldown()
            return
        }
        hasPassed = true
        emit("passed")
        open.value = false
    } finally {
        submitting.value = false
    }
}

/**
 * 取消校验：关闭弹窗，交由 watch 触发 cancelled。
 */
function handleCancel() {
    open.value = false
}

/** 解锁密码上传时间文本（本地格式，不可用时为空字符串） */
const vaultUploadedText = computed(() => {
    if (!vaultStatus.value) {
        return ""
    }
    return new Date(vaultStatus.value.uploadedAt).toLocaleString()
})

/** 网盘分享链接（服务端当期下发优先，缺失时回退静态配置 env.quarkShareUrl） */
const shareUrl = computed(() => vaultStatus.value?.shareUrl?.trim() || env.quarkShareUrl.trim())
/** 是否配置了分享链接 */
const hasShareLink = computed(() => shareUrl.value !== "")
/** 分享链接的二维码（边长模块数 + SVG path），编码失败时为 null，供 hover 浮层渲染 */
const qrCode = computed(() => {
    if (!hasShareLink.value) {
        return null
    }
    try {
        const qr = createQrCode(shareUrl.value)
        return { size: qr.size, path: createQrCodePath(qr) }
    } catch {
        return null
    }
})

/**
 * 复制网盘分享链接到剪贴板，成功后短暂显示已复制。
 */
async function handleCopyShareLink() {
    const url = shareUrl.value
    if (!url) {
        return
    }
    try {
        await navigator.clipboard.writeText(url)
    } catch {
        const textarea = document.createElement("textarea")
        textarea.value = url
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        textarea.remove()
    }
    linkCopied.value = true
    if (linkCopiedTimer) {
        clearTimeout(linkCopiedTimer)
    }
    linkCopiedTimer = setTimeout(() => {
        linkCopied.value = false
    }, 2000)
}
</script>

<template>
    <DialogRoot v-model:open="open">
        <DialogPortal>
            <DialogOverlay class="fixed inset-0 z-30 bg-gray-900/50 backdrop-blur-sm data-[state=open]:animate-overlayShow" />
            <DialogContent
                class="fixed top-1/2 left-1/2 z-100 flex max-h-[85vh] w-[92vw] max-w-xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xs border border-base-content/15 bg-base-100/70 shadow-lg backdrop-blur-md data-[state=open]:animate-contentShow"
            >
                <DialogClose
                    class="absolute top-2.5 right-2.5 z-10 cursor-pointer rounded-xs border border-base-content/20 bg-base-100/80 p-1 text-base-content/60 backdrop-blur transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                    aria-label="close"
                >
                    <Icon icon="radix-icons:cross2" class="block size-3.5" />
                </DialogClose>
                <DialogTitle class="sr-only">{{ $t("setting.safeModeQuizTitle") }}</DialogTitle>

                <div class="flex min-h-0 flex-1 flex-col">
                    <!-- 头部：kicker + 标题 + 作答进度 -->
                    <div class="shrink-0 border-b border-base-content/10 px-4 pt-3 pb-2 pr-12">
                        <SectionHeader no-animate compact kicker="SAFE MODE" :title="$t('setting.safeModeQuizTitle')">
                            <template #trailing>
                                <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">
                                    {{ answeredCount }}
                                    / {{ SAFE_MODE_REQUIRED_COUNT }}
                                </span>
                            </template>
                        </SectionHeader>
                    </div>

                    <!-- 题目区（含下方追加的恢复密码区） -->
                    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                        <p class="mb-3 text-[11px] tracking-wide text-base-content/55">
                            {{ $t("setting.safeModeQuizTip", { count: SAFE_MODE_REQUIRED_COUNT }) }}
                        </p>
                        <div class="flex flex-col gap-2.5">
                            <div
                                v-for="(question, index) in questions"
                                :key="index"
                                class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                            >
                                <div class="mb-2 flex items-baseline justify-between gap-3">
                                    <span class="text-[13px] leading-5 text-base-content/90 font-wt select-text">{{
                                        question.question
                                    }}</span>
                                    <span class="shrink-0 font-orbitron text-[11px] tabular-nums text-base-content/45">
                                        #{{ index + 1 }}
                                    </span>
                                </div>
                                <!-- 选择题：选项方章 -->
                                <div v-if="question.kind === 'choice'" class="flex flex-wrap gap-1.5">
                                    <button
                                        v-for="option in question.options"
                                        :key="option"
                                        type="button"
                                        class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-1 text-[12px] transition-colors duration-150 active:scale-[0.97]"
                                        :class="
                                            answers[index] === option
                                                ? 'border-primary bg-primary font-semibold text-primary-content'
                                                : 'border-base-content/20 text-base-content/70 hover:border-primary/60 hover:text-primary'
                                        "
                                        @click="answers[index] = option"
                                    >
                                        {{ option }}
                                    </button>
                                </div>
                                <!-- 填空题：下划线输入 -->
                                <div v-else class="relative">
                                    <input
                                        v-model="answers[index]"
                                        type="text"
                                        :placeholder="$t('setting.safeModeQuizInputPlaceholder')"
                                        class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-0.5 pr-10 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                                    />
                                </div>
                            </div>
                        </div>
                        <p v-if="error" class="mt-3 text-xs text-error">{{ error }}</p>
                        <p v-if="inCooldown" class="mt-3 flex items-center gap-1.5 text-xs text-warning">
                            <Icon icon="ri:timer-flash-line" class="size-3.5 shrink-0" />
                            {{ $t("setting.safeModeQuizCooldown", { time: cooldownText }) }}
                        </p>
                        <!-- 追加：恢复密码区（打开分享链接并转存后，从压缩包查看密码填入） -->
                        <div class="mt-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <div class="mb-1 text-[13px] text-base-content/90 font-wt">
                                {{ $t("setting.safeModeRecoveryTitle") }}
                            </div>
                            <p class="mb-2 text-[11px] tracking-wide text-base-content/55">
                                {{ $t("setting.safeModeRecoveryTip") }}
                            </p>
                            <div v-if="!hasShareLink" class="py-2 text-xs text-warning">
                                {{ $t("setting.safeModeRecoveryNoLink") }}
                            </div>
                            <div v-else class="flex flex-col gap-2">
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <span class="group relative inline-flex shrink-0">
                                        <a
                                            :href="shareUrl"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-xs border border-primary bg-primary px-2 py-1 text-[12px] font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97]"
                                        >
                                            {{ $t("setting.safeModeRecoveryOpenLink") }}
                                        </a>
                                        <span
                                            v-if="qrCode"
                                            class="pointer-events-none absolute bottom-full left-0 z-10 mb-2 hidden w-36 rounded-xs border border-base-content/15 bg-base-100 p-2 shadow-lg group-hover:block"
                                        >
                                            <svg :viewBox="`-4 -4 ${qrCode.size + 8} ${qrCode.size + 8}`" class="block h-auto w-full">
                                                <rect x="-4" y="-4" :width="qrCode.size + 8" :height="qrCode.size + 8" fill="white" />
                                                <path :d="qrCode.path" fill="black" />
                                            </svg>
                                            <span class="mt-1 block text-center text-[11px] text-base-content/60">{{
                                                $t("setting.safeModeRecoveryQrCaption")
                                            }}</span>
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border border-base-content/20 px-2 py-1 text-[12px] text-base-content/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                        @click="handleCopyShareLink"
                                    >
                                        {{ linkCopied ? $t("setting.safeModeRecoveryCopied") : $t("setting.safeModeRecoveryCopyLink") }}
                                    </button>
                                    <span v-if="vaultStatus" class="shrink-0 text-[11px] tabular-nums text-base-content/45">{{
                                        vaultUploadedText
                                    }}</span>
                                </div>
                                <div v-if="vaultLoading" class="flex items-center gap-2 py-1 text-xs text-base-content/55">
                                    <span class="loading loading-spinner loading-xs" />
                                </div>
                                <div v-else-if="!vaultStatus" class="py-1 text-xs text-warning">
                                    {{ $t("setting.safeModeRecoveryUnavailable") }}
                                </div>
                                <input
                                    v-model="recoveryPassword"
                                    type="text"
                                    autocomplete="off"
                                    spellcheck="false"
                                    :placeholder="$t('setting.safeModeRecoveryPlaceholder')"
                                    class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-0.5 pr-10 font-mono text-sm tracking-wider outline-none transition-colors duration-200 placeholder:text-base-content/35 placeholder:font-sans placeholder:tracking-normal focus:border-primary"
                                    @keyup.enter="handleSubmit"
                                />
                            </div>
                        </div>
                        <p v-if="recoveryError" class="mt-3 text-xs text-error">{{ recoveryError }}</p>
                    </div>

                    <!-- 底部操作 -->
                    <div class="flex-none border-t border-base-content/10 px-4 py-2.5">
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0 text-[11px] tracking-wide text-base-content/50">
                                {{ $t("setting.safeModeHint") }}
                            </div>
                            <div class="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border border-base-content/20 px-3 py-1.5 text-[12px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                    @click="handleCancel"
                                >
                                    {{ $t("setting.safeModeQuizCancel") }}
                                </button>
                                <button
                                    type="button"
                                    class="inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xs border border-primary bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                                    :disabled="!canSubmit"
                                    @click="handleSubmit"
                                >
                                    <span v-if="submitting" class="loading loading-spinner loading-xs" />
                                    {{ $t("setting.confirm") }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
