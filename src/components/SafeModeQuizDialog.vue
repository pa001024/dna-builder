<script setup lang="ts">
// 安全模式关闭校验弹窗：独立于 Setting.vue 的答题组件。
// 支持选择题（选项方章）与填空题（下划线输入）两种题型；
// 每次打开随机抽取 SAFE_MODE_REQUIRED_COUNT 道题，答案用 bcryptjs 与哈希比对，仅校验对错。
// 全部答对时 emit("passed")，由父组件关闭安全模式；未答对即关闭（取消）时 emit("cancelled")。
import { t } from "i18next"
import { computed, onMounted, ref, watch } from "vue"
import type { SafeModeQuestion } from "@/data/safe-mode-questions"
import { checkSafeModeAnswers, pickSafeModeQuestions, SAFE_MODE_REQUIRED_COUNT } from "@/data/safe-mode-questions"

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

/**
 * 重置答题状态：随机抽题并清空回答与错误提示。
 */
function resetQuiz() {
    hasPassed = false
    const picked = pickSafeModeQuestions(SAFE_MODE_REQUIRED_COUNT)
    questions.value = picked
    answers.value = picked.map(() => "")
    error.value = null
    submitting.value = false
}

// 打开弹窗时重新抽题；未通过校验就关闭时视为取消
watch(open, value => {
    if (value) {
        resetQuiz()
    } else if (!hasPassed) {
        emit("cancelled")
    }
})

// 防御：父组件以已打开状态挂载时兜底初始化
onMounted(() => {
    if (open.value) {
        resetQuiz()
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

/** 是否可提交：全部作答完毕且不在校验中 */
const canSubmit = computed(() => !submitting.value && questions.value.length > 0 && answeredCount.value === questions.value.length)

/**
 * 提交全部回答：逐一与 bcrypt 哈希比对，全部正确才通过。
 */
async function handleSubmit() {
    if (!canSubmit.value) {
        return
    }
    submitting.value = true
    error.value = null
    try {
        const allCorrect = await checkSafeModeAnswers(questions.value, answers.value)
        if (allCorrect) {
            hasPassed = true
            emit("passed")
            open.value = false
        } else {
            error.value = t("setting.safeModeAnswerWrong")
        }
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
                                <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                                    {{ answeredCount }} / {{ SAFE_MODE_REQUIRED_COUNT }}
                                </span>
                            </template>
                        </SectionHeader>
                    </div>

                    <!-- 题目区 -->
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
