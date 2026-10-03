<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import type { AskUserAnswer, AskUserQuestion, AskUserRequest } from "@/utils/db-ask-user"

/**
 * Agent 的「向用户提问」卡片（资料检索与配装助手共用）。
 *
 * 模型调用 ask_user 后本组件铺在消息流末尾。多道题按「一页一题」分页填写：
 * 顶部右侧是翻页器（`< 1/3 >`），单选点完自动翻到下一题，可随时翻回去修改；
 * **所有题都作答之前提交按钮不可用**——否则用户只点了一道题，半截答案就被发给模型。
 *
 * 交互约定：
 * - 只有一道题时没有下一页，选完即提交，保留单题的省事路径；
 * - 多选题在页内切换选中态，靠翻页器或「下一题」前进；
 * - 每题都提供自由输入框，模型无法用选项把用户逼死；Enter 等同「下一题 / 提交」；
 * - 整张卡片可以跳过，跳过会告诉模型「用户没给补充信息」，让它自己接着往下做。
 */
const props = withDefaults(
    defineProps<{
        /** 归一化后的提问请求 */
        request: AskUserRequest
        /** 是否正在等待续跑（提交后禁用交互，避免重复提交） */
        busy?: boolean
        /** 文案键前缀（对应翻译里的命名空间，默认走资料库的一套） */
        i18nPrefix?: string
    }>(),
    {
        busy: false,
        i18nPrefix: "dbAgent.ui",
    }
)

const { t } = useTranslation()

/**
 * 取一条文案：优先用前缀命名空间，缺失时回退到资料库的一套。
 * 回退是为了兼容尚未建好自己文案表的调用方，避免界面直接显示键名。
 * @param key 命名空间内的键名
 * @param options 插值参数
 * @returns 展示文本
 */
function label(key: string, options?: Record<string, unknown>): string {
    return t(`${props.i18nPrefix}.${key}`, {
        ...options,
        defaultValue: t(`dbAgent.ui.${key}`, options),
    })
}

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
/** 输入法组合中：Enter 归输入法上屏，不触发翻页 */
const isImeComposing = ref(false)
/** 当前页（即第几道题）下标 */
const page = ref(0)

/** 题目总数 */
const total = computed(() => props.request.questions.length)
/** 当前页的题目 */
const current = computed(() => props.request.questions[page.value])
/** 是否第一页 */
const isFirst = computed(() => page.value <= 0)
/** 是否最后一页 */
const isLast = computed(() => page.value >= total.value - 1)

// 同一张卡片可能先后承载两次提问（模型追问）：requestId 变了就重置页码与作答，
// 否则上一轮的选项会串到这一轮，用户还会停在一个不存在的页码上
watch(
    () => props.request.id,
    () => {
        page.value = 0
        selected.value = {}
        customText.value = {}
    }
)

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
 * 判断某题是否已作答：选中了有效选项，或填了自由输入。
 * @param question 题目
 * @returns 是否已作答
 */
function isAnswered(question: AskUserQuestion): boolean {
    const optionIds = selectionOf(question.id).filter(optionId => question.options.some(option => option.id === optionId))

    return optionIds.length > 0 || !!customText.value[question.id]?.trim()
}

/** 尚未作答的题数，用于门禁提交与提示 */
const unansweredCount = computed(() => props.request.questions.filter(question => !isAnswered(question)).length)
/** 是否所有题都已作答 */
const allAnswered = computed(() => unansweredCount.value === 0)

/**
 * 点击选项：单选选中后自动翻页，多选只切换选中态。
 * @param question 题目
 * @param optionId 选项 id
 */
function toggleOption(question: AskUserQuestion, optionId: string) {
    if (props.busy) {
        return
    }

    const currentSelection = selectionOf(question.id)

    if (!question.multiple) {
        selected.value = { ...selected.value, [question.id]: [optionId] }

        if (total.value <= 1) {
            // 只有一道题：没有下一页可翻，「选完」就等于「全部选完」
            submitAll()
        } else if (!isLast.value) {
            page.value += 1
        }

        return
    }

    selected.value = {
        ...selected.value,
        [question.id]: currentSelection.includes(optionId)
            ? currentSelection.filter(id => id !== optionId)
            : [...currentSelection, optionId],
    }
}

/** 翻到上一题 */
function goPrev() {
    if (!isFirst.value) {
        page.value -= 1
    }
}

/** 翻到下一题 */
function goNext() {
    if (!isLast.value) {
        page.value += 1
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
 * 提交整张卡片的作答，只有全部题目都作答后才放行。
 */
function submitAll() {
    if (props.busy || !allAnswered.value) {
        return
    }

    const answers = collectAnswers()

    if (!answers.length) {
        return
    }

    emit("answer", { requestId: props.request.id, answers })
}

/**
 * 自由输入的键盘处理：Enter 前进（末页则提交）、Shift + Enter 换行。
 * @param event 键盘事件
 */
function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.shiftKey) {
        return
    }

    if (isImeComposing.value || event.isComposing) {
        return
    }

    event.preventDefault()

    if (isLast.value) {
        submitAll()
        return
    }

    goNext()
}

/**
 * 更新自由输入内容。
 * @param questionId 题号
 * @param event 输入事件
 */
function handleCustomInput(questionId: string, event: Event) {
    customText.value = { ...customText.value, [questionId]: (event.target as HTMLInputElement).value }
}
</script>

<template>
    <!--
      提问卡片：与结果面板同一套视觉语言——透明底、hairline 边框、直角。
      放在消息流末尾，视觉上属于「助手抛回来的问题」。
    -->
    <div class="db-ask-user border border-primary/30 bg-primary/5 px-3 py-2.5">
        <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-baseline gap-2">
                <Icon icon="ri:questionnaire-line" class="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-primary" />
                <p class="truncate text-[10px] tracking-[0.2em] text-primary/70 uppercase">
                    {{ request.title || label("askDefaultTitle") }}
                </p>
            </div>

            <!-- 翻页器：多题时才出现，可在任意页之间来回翻 -->
            <div v-if="total > 1" class="flex shrink-0 items-center gap-0.5">
                <button
                    type="button"
                    class="grid size-5 cursor-pointer place-items-center text-base-content/45 transition-colors duration-150 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:text-base-content/20 disabled:hover:text-base-content/20"
                    :title="label('askPrev')"
                    :aria-label="label('askPrev')"
                    :disabled="props.busy || isFirst"
                    @click="goPrev"
                >
                    <Icon icon="ri:arrow-left-s-line" class="h-3.5 w-3.5" />
                </button>

                <span class="min-w-9 text-center font-orbitron text-[11px] tabular-nums text-base-content/55">
                    {{ page + 1 }}/{{ total }}
                </span>

                <button
                    type="button"
                    class="grid size-5 cursor-pointer place-items-center text-base-content/45 transition-colors duration-150 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:text-base-content/20 disabled:hover:text-base-content/20"
                    :title="label('askNext')"
                    :aria-label="label('askNext')"
                    :disabled="props.busy || isLast"
                    @click="goNext"
                >
                    <Icon icon="ri:arrow-right-s-line" class="h-3.5 w-3.5" />
                </button>
            </div>
        </div>

        <!-- 一页只放一道题：选完一题自动前进，题与题之间不再互相干扰 -->
        <div v-if="current" class="mt-2 flex flex-col gap-1.5">
            <div class="flex flex-col gap-0.5">
                <p class="text-sm leading-6 font-medium text-base-content/85">{{ current.header }}</p>
                <p v-if="current.question" class="text-xs leading-5 text-base-content/55">{{ current.question }}</p>
                <p v-if="current.multiple && current.options.length" class="text-[10px] leading-4 text-base-content/40">
                    {{ label("askMultipleHint") }}
                </p>
            </div>

            <!-- 选项：单选点完翻页，多选只切换选中态 -->
            <div v-if="current.options.length" class="flex flex-wrap gap-1.5">
                <button
                    v-for="option in current.options"
                    :key="option.id"
                    type="button"
                    class="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-xs border px-2 py-1 text-left text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    :class="
                        isSelected(current, option.id)
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/65 hover:border-primary/60 hover:text-primary'
                    "
                    :disabled="props.busy"
                    :aria-pressed="isSelected(current, option.id)"
                    :title="option.description || undefined"
                    @click="toggleOption(current, option.id)"
                >
                    <span class="min-w-0 truncate">{{ option.label }}</span>
                </button>
            </div>

            <!-- 自由输入：始终提供，模型不能把用户锁死在选项里 -->
            <input
                v-if="current.allowCustom"
                :value="customText[current.id] ?? ''"
                type="text"
                spellcheck="false"
                class="w-full border border-base-content/15 bg-transparent px-2 py-1.5 text-xs leading-5 text-base-content outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary/55 disabled:opacity-50"
                :placeholder="current.options.length ? label('askCustomPlaceholder') : label('askInputPlaceholder')"
                :disabled="props.busy"
                @input="handleCustomInput(current.id, $event)"
                @keydown="handleKeydown"
                @compositionstart="isImeComposing = true"
                @compositionend="isImeComposing = false"
            />
        </div>

        <!-- 底部操作：非末页前进，末页提交（全部作答后才可用）；任何时候都能跳过 -->
        <div class="mt-2.5 flex items-center justify-between gap-3">
            <button
                type="button"
                class="cursor-pointer text-[10px] text-base-content/40 transition-colors duration-200 hover:text-base-content/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed"
                :disabled="props.busy"
                @click="emit('skip')"
            >
                {{ label("askSkip") }}
            </button>

            <div class="flex shrink-0 items-center gap-2">
                <span v-if="isLast && !allAnswered" class="text-[10px] text-base-content/40">
                    {{ label("askUnanswered", { n: unansweredCount }) }}
                </span>

                <button
                    v-if="!isLast"
                    type="button"
                    class="cursor-pointer border border-primary bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-content transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
                    :disabled="props.busy"
                    @click="goNext"
                >
                    {{ label("askNext") }}
                </button>

                <button
                    v-else
                    type="button"
                    class="cursor-pointer border px-2 py-0.5 text-[11px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97] disabled:cursor-not-allowed"
                    :class="
                        allAnswered && !props.busy
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/40'
                    "
                    :disabled="props.busy || !allAnswered"
                    @click="submitAll"
                >
                    {{ props.busy ? label("askSubmitting") : label("askSubmit") }}
                </button>
            </div>
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
