<script lang="ts" setup>
import { computed, ref } from "vue"
import type { AskUserAnswer, AskUserQuestion, AskUserRequest } from "@/utils/db-ask-user"

/**
 * 资料检索 Agent 的「向用户提问」卡片。
 *
 * 模型调用 ask_user 后本组件铺在消息流末尾：每道题给出可选项（可多选），
 * 并始终提供自由输入框，用户既能点选也能自己写。
 *
 * 交互约定：
 * - 选项是「即选即提交」的（单选点完直接提交），这与同类产品的做法一致，
 *   少一次「确认」点击；多选题才需要点提交按钮；
 * - 自由输入支持 Enter 提交（Shift + Enter 换行），提交时带上该题已选的选项；
 * - 整张卡片可以跳过，跳过会告诉模型「用户没给补充信息」，让它自己接着检索。
 */
const props = defineProps<{
    /** 归一化后的提问请求 */
    request: AskUserRequest
    /** 是否正在等待续跑（提交后禁用交互，避免重复提交） */
    busy?: boolean
}>()

const emit = defineEmits<{
    /** 用户提交回答 */
    answer: [response: { requestId: string; answers: AskUserAnswer[] }]
    /** 用户跳过整张卡片 */
    skip: []
}>()

/** 题号 → 已选选项 id */
const selected = ref<Record<string, string[]>>({})
/** 题号 → 自由输入文本 */
const customText = ref<Record<string, string>>({})
/** 输入法组合中：Enter 归输入法上屏，不触发提交 */
const isImeComposing = ref(false)

/**
 * 读取某题当前选中的选项 id 列表。
 * @param questionId 题号
 * @returns 已选选项 id
 */
function selectionOf(questionId: string): string[] {
    return selected.value[questionId] ?? []
}

/**
 * 判断某选项是否已被选中。
 * @param question 题目
 * @param optionId 选项 id
 * @returns 是否选中
 */
function isSelected(question: AskUserQuestion, optionId: string): boolean {
    return selectionOf(question.id).includes(optionId)
}

/**
 * 点击选项：单选即提交，多选只切换选中态。
 * @param question 题目
 * @param optionId 选项 id
 */
function toggleOption(question: AskUserQuestion, optionId: string) {
    if (props.busy) {
        return
    }

    const current = selectionOf(question.id)

    if (!question.multiple) {
        selected.value = { ...selected.value, [question.id]: [optionId] }
        // 单选即提交：少一次确认点击，与同类交互一致
        submitQuestion(question)
        return
    }

    selected.value = {
        ...selected.value,
        [question.id]: current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId],
    }
}

/**
 * 收集全部题目的作答（跳过没有任何作答的题）。
 * @returns 逐题回答
 */
function collectAnswers(): AskUserAnswer[] {
    const answers: AskUserAnswer[] = []

    for (const question of props.request.questions) {
        const optionIds = selectionOf(question.id).filter(optionId => question.options.some(option => option.id === optionId))
        const custom = customText.value[question.id]?.trim() ?? ""

        if (!optionIds.length && !custom) {
            continue
        }

        answers.push({ questionId: question.id, optionIds, custom: custom || undefined })
    }

    return answers
}

/**
 * 提交整张卡片的作答。
 */
function submitAll() {
    const answers = collectAnswers()

    if (!answers.length) {
        return
    }

    emit("answer", { requestId: props.request.id, answers })
}

/**
 * 提交单道题（单选即提交时走这里）。
 * 只带这一道题的答案，其余题留空，模型拿到的就是「用户回答了哪一道」。
 * @param question 题目
 */
function submitQuestion(question: AskUserQuestion) {
    const optionIds = selectionOf(question.id).filter(optionId => question.options.some(option => option.id === optionId))
    const custom = customText.value[question.id]?.trim() ?? ""

    if (!optionIds.length && !custom) {
        return
    }

    emit("answer", {
        requestId: props.request.id,
        answers: [{ questionId: question.id, optionIds, custom: custom || undefined }],
    })
}

/**
 * 自由输入的键盘处理：Enter 提交、Shift + Enter 换行。
 * @param question 题目
 * @param event 键盘事件
 */
function handleKeydown(question: AskUserQuestion, event: KeyboardEvent) {
    if (event.key !== "Enter" || event.shiftKey) {
        return
    }

    if (isImeComposing.value || event.isComposing) {
        return
    }

    event.preventDefault()
    submitQuestion(question)
}

/**
 * 更新自由输入内容。
 * @param questionId 题号
 * @param event 输入事件
 */
function handleCustomInput(questionId: string, event: Event) {
    customText.value = { ...customText.value, [questionId]: (event.target as HTMLInputElement).value }
}

/** 是否存在任何作答（决定提交按钮是否可用，多选题场景） */
const hasAnyAnswer = computed(() => collectAnswers().length > 0)

/** 是否存在多选题（决定要不要展示「提交」按钮） */
const hasMultipleQuestion = computed(() => props.request.questions.some(question => question.multiple && question.options.length > 0))
</script>

<template>
    <!--
      提问卡片：与结果面板同一套视觉语言——透明底、hairline 边框、直角。
      放在消息流末尾，视觉上属于「助手抛回来的问题」。
    -->
    <div class="db-ask-user border border-primary/30 bg-primary/5 px-3 py-2.5">
        <div class="flex items-baseline gap-2">
            <Icon icon="ri:questionnaire-line" class="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-primary" />
            <p class="text-[10px] uppercase tracking-[0.2em] text-primary/70">
                {{ request.title || $t("dbAgent.ui.askDefaultTitle") }}
            </p>
        </div>

        <div class="mt-2 flex flex-col gap-3">
            <div v-for="question in request.questions" :key="question.id" class="flex flex-col gap-1.5">
                <div class="flex flex-col gap-0.5">
                    <p class="text-sm font-medium leading-6 text-base-content/85">{{ question.header }}</p>
                    <p v-if="question.question" class="text-xs leading-5 text-base-content/55">{{ question.question }}</p>
                </div>

                <!-- 选项：单选即提交，多选切换选中态 -->
                <div v-if="question.options.length" class="flex flex-wrap gap-1.5">
                    <button
                        v-for="option in question.options"
                        :key="option.id"
                        type="button"
                        class="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-xs border px-2 py-1 text-left text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        :class="
                            isSelected(question, option.id)
                                ? 'border-primary bg-primary font-semibold text-primary-content'
                                : 'border-base-content/20 text-base-content/65 hover:border-primary/60 hover:text-primary'
                        "
                        :disabled="props.busy"
                        :aria-pressed="isSelected(question, option.id)"
                        :title="option.description || undefined"
                        @click="toggleOption(question, option.id)"
                    >
                        <span class="min-w-0 truncate">{{ option.label }}</span>
                    </button>
                </div>

                <!-- 自由输入：始终提供，模型不能把用户锁死在选项里 -->
                <input
                    v-if="question.allowCustom"
                    :value="customText[question.id] ?? ''"
                    type="text"
                    spellcheck="false"
                    class="w-full border border-base-content/15 bg-transparent px-2 py-1.5 text-xs leading-5 text-base-content outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary/55 disabled:opacity-50"
                    :placeholder="question.options.length ? $t('dbAgent.ui.askCustomPlaceholder') : $t('dbAgent.ui.askInputPlaceholder')"
                    :disabled="props.busy"
                    @input="handleCustomInput(question.id, $event)"
                    @keydown="handleKeydown(question, $event)"
                    @compositionstart="isImeComposing = true"
                    @compositionend="isImeComposing = false"
                />
            </div>
        </div>

        <!-- 底部操作：多选需要显式提交；任何时候都能跳过 -->
        <div class="mt-2.5 flex items-center justify-between gap-3">
            <button
                type="button"
                class="cursor-pointer text-[10px] text-base-content/40 transition-colors duration-200 hover:text-base-content/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
                :disabled="props.busy"
                @click="emit('skip')"
            >
                {{ $t("dbAgent.ui.askSkip") }}
            </button>

            <button
                v-if="hasMultipleQuestion"
                type="button"
                class="cursor-pointer border px-2 py-0.5 text-[11px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
                :class="
                    hasAnyAnswer && !props.busy
                        ? 'border-primary bg-primary font-semibold text-primary-content'
                        : 'border-base-content/20 text-base-content/40'
                "
                :disabled="props.busy || !hasAnyAnswer"
                @click="submitAll"
            >
                {{ props.busy ? $t("dbAgent.ui.askSubmitting") : $t("dbAgent.ui.askSubmit") }}
            </button>
        </div>
    </div>
</template>

<style scoped>
/* 提问卡片允许选中文本：全局 user-select:none 会继承下来 */
.db-ask-user,
.db-ask-user :deep(*) {
    user-select: text;
}
</style>
