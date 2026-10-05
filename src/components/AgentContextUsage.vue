<script lang="ts" setup>
import i18next from "i18next"
import { useTranslation } from "i18next-vue"
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from "reka-ui"
import { computed, ref } from "vue"
import type { AgentContextUsageCategoryKey, AgentContextUsageSnapshot } from "@/composables/useAgentChatCore"
import { scopedI18nKey } from "@/utils/agent-chat"

/**
 * Agent 上下文容量面板（资料检索与配装助手共用）。
 *
 * 交互对齐 ZCode 的 ChatContextUsage：入口是工具行里一枚无文字小圆环（环即用量，水位变色），
 * 桌面 **hover / 聚焦** 即弹出上方面板，移开即收起；触摸设备（`(hover: none)`）轻点圆环开合，
 * 由 reka HoverCard 的 `enable-touch` 原生承接。入口 hover 有背景色反馈。
 *
 * 面板本体：线性进度条 + 已用/窗口 + 分类占比 + 平均缓存命中率 + 手动压缩。
 * 数据口径见 `useAgentChatCore` 的 `AgentContextUsageSnapshot`：
 * used 优先取末次真实请求（输入 + 输出），没有真实用量时退回本地估算并标注；
 * 分类占比按估算值的相对占比，缓存命中率 = ΣcacheRead / Σinput。
 */
const props = withDefaults(
    defineProps<{
        /** 用量快照；null / 缺省时不渲染指示器（还没有可展示的用量，或宿主不想展示） */
        usage?: AgentContextUsageSnapshot | null
        /** 是否正在生成压缩摘要 */
        compacting?: boolean
        /** 是否提供手动压缩入口（会话里没有可压缩内容时隐藏） */
        canCompact?: boolean
        /** 文案键前缀（对应翻译里的命名空间，默认走资料库的一套） */
        i18nPrefix?: string
    }>(),
    {
        usage: null,
        compacting: false,
        canCompact: false,
        i18nPrefix: "dbAgent.ui",
    }
)

const emit = defineEmits<{
    /** 点击「压缩历史」：压缩编排与边界落库由宿主完成 */
    compact: []
}>()

const { t } = useTranslation()

/**
 * 拼出当前 Agent 的文案键；本命名空间没有该键时回退到通用命名空间（见 scopedI18nKey）。
 * @param key 命名空间内的键名
 * @returns 可交给翻译函数解析的完整文案键
 */
function label(key: string): string {
    return scopedI18nKey(props.i18nPrefix, key, t)
}

/** 分类行的文案键与配色点（顺序即展示顺序） */
const CATEGORY_META: Record<AgentContextUsageCategoryKey, { labelKey: string; dotClass: string }> = {
    messages: { labelKey: "contextUsage.messages", dotClass: "bg-primary" },
    systemTools: { labelKey: "contextUsage.systemTools", dotClass: "bg-secondary" },
    systemPrompt: { labelKey: "contextUsage.systemPrompt", dotClass: "bg-accent" },
}

/**
 * 缓存命中率行的展示阈值：低于它的大多是「上游没有缓存机制」的噪声数据，
 * 展示出来只会误导（与 ZCode 的 CACHE_HIT_RATE_DISPLAY_THRESHOLD 同口径）。
 */
const CACHE_HIT_RATE_DISPLAY_THRESHOLD = 0.78

/** 上下文占用比例（0-1，已钳制） */
const usedPercent = computed(() => {
    const usage = props.usage

    return usage && usage.size > 0 ? Math.min(Math.max(usage.used / usage.size, 0), 1) : 0
})

/** 头部与指示器共用的百分比文案 */
const percentLabel = computed(() => `${(usedPercent.value * 100).toFixed(1)}%`)

/**
 * token 数的紧凑格式：跟随界面语言（zh 系显示「万」，en 显示 K/M）。
 * @param value token 数
 * @returns 紧凑格式文本
 */
function formatTokens(value: number): string {
    return new Intl.NumberFormat(i18next.language || undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

/** 指示器与面板头部的「已用/窗口」文案 */
const usageLabel = computed(() => (props.usage ? `${formatTokens(props.usage.used)}/${formatTokens(props.usage.size)}` : ""))

/** 分类占比行（占比不足 0.1% 的分类不展示） */
const breakdownRows = computed(() =>
    (props.usage?.breakdown ?? [])
        .filter(row => row.percent >= 0.001)
        .map(row => ({ ...row, percentText: `${(row.percent * 100).toFixed(1)}%`, ...CATEGORY_META[row.key] }))
)

/** 进度条配色：接近窗口上限时逐级告警 */
const barClass = computed(() => {
    if (usedPercent.value >= 0.9) {
        return "bg-error"
    }

    return usedPercent.value >= 0.7 ? "bg-warning" : "bg-primary"
})

/** 入口圆环的几何：viewBox 20、r=8 */
const TRIGGER_CIRCUMFERENCE = 2 * Math.PI * 8

/** 入口圆环的进度弧：占用比例 → 弧长 */
const triggerDash = computed(() => `${TRIGGER_CIRCUMFERENCE * usedPercent.value} ${TRIGGER_CIRCUMFERENCE}`)

/** 入口圆环的配色：与面板进度条同一套水位阈值 */
const triggerRingClass = computed(() => {
    if (usedPercent.value >= 0.9) {
        return "stroke-error"
    }

    return usedPercent.value >= 0.7 ? "stroke-warning" : "stroke-primary"
})

/** 缓存命中率行是否展示（没有真实用量或命中率过低时不展示） */
const showCacheHitRate = computed(() => (props.usage?.cacheHitRate ?? 0) >= CACHE_HIT_RATE_DISPLAY_THRESHOLD)

/** 缓存命中率的展示文案 */
const cacheHitRateLabel = computed(() => `${((props.usage?.cacheHitRate ?? 0) * 100).toFixed(1)}%`)

/** 面板展开态（HoverCard 受控；触摸轻点由 enable-touch 在 trigger 内部开合） */
const isOpen = ref(false)

/**
 * 点击压缩入口：交给宿主编排，收起面板。
 */
function handleCompact() {
    isOpen.value = false
    emit("compact")
}
</script>

<template>
    <HoverCardRoot v-if="props.usage" v-model:open="isOpen" :open-delay="100" :close-delay="150" enable-touch>
        <!--
          入口：一枚无文字的小圆环，环即用量（弧长 = 占用比例，按水位变色）。
          桌面 hover / 聚焦弹出面板（带背景色反馈）；触摸设备轻点开合（enable-touch）。
          名称走 aria-label 与 title，不占版面。
        -->
        <HoverCardTrigger as-child>
            <button
                type="button"
                class="grid size-7 shrink-0 cursor-pointer place-items-center text-base-content/45 transition-colors duration-200 hover:bg-base-content/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                :aria-expanded="isOpen"
                :aria-label="$t(label('contextUsage.title'))"
                :title="$t(label('contextUsage.title'))"
            >
                <svg viewBox="0 0 20 20" class="size-4.5 -rotate-90">
                    <circle cx="10" cy="10" r="8" fill="none" stroke-width="2.5" class="stroke-base-content/20" />
                    <circle
                        v-if="usedPercent > 0"
                        cx="10"
                        cy="10"
                        r="8"
                        fill="none"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        class="transition-[stroke-dasharray] duration-300"
                        :class="triggerRingClass"
                        :stroke-dasharray="triggerDash"
                    />
                </svg>
            </button>
        </HoverCardTrigger>

        <!-- 面板：portal 到 body，锚定在圆环上方、右对齐；配方见 db-style「弹窗与浮层」 -->
        <HoverCardPortal>
            <HoverCardContent
                side="top"
                :side-offset="8"
                align="center"
                class="z-50 w-64 rounded-xs border border-base-content/15 bg-base-100/85 p-3 shadow-lg backdrop-blur-md"
            >
                <!-- 头部：标题 + 已用/窗口（含「万」等本地化单位，不用 font-mono） -->
                <div class="flex items-baseline justify-between gap-3">
                    <p class="shrink-0 text-xs font-medium text-base-content/85">{{ $t(label("contextUsage.title")) }}</p>
                    <p class="min-w-0 truncate text-[11px] tabular-nums text-base-content/55">
                        {{ usageLabel }}（{{ percentLabel }}）
                    </p>
                </div>

                <!-- 总量进度条（线性）：接近上限时逐级告警 -->
                <div class="mt-2.5">
                    <div class="h-1 w-full bg-base-content/10">
                        <div class="h-full transition-[width] duration-300" :class="barClass" :style="{ width: `${usedPercent * 100}%` }" />
                    </div>
                    <p v-if="props.usage.isEstimate" class="mt-1.5 text-[11px] tracking-wide text-base-content/40">
                        {{ $t(label("contextUsage.estimated")) }}
                    </p>
                </div>

                <!-- 分类占比：只给相对占比，不给分类 token 数（避免与总量误读）；纯百分比才用等宽 -->
                <ul class="mt-2.5 flex flex-col gap-1.5">
                    <li v-for="row in breakdownRows" :key="row.key" class="flex items-center gap-2">
                        <span class="size-1.5 shrink-0 rounded-xs" :class="row.dotClass" />
                        <span class="min-w-0 flex-1 text-xs text-base-content/60">{{ $t(label(row.labelKey)) }}</span>
                        <span class="shrink-0 font-mono text-[10px] tabular-nums text-base-content/55">{{ row.percentText }}</span>
                    </li>
                </ul>

                <!-- 平均缓存命中率：上游回传了缓存数据且命中率可信时才展示 -->
                <div
                    v-if="showCacheHitRate"
                    class="mt-1 flex items-center justify-between gap-3 border-t border-base-content/10 pt-2.5"
                >
                    <span class="text-xs text-base-content/60">{{ $t(label("contextUsage.cacheHitRate")) }}</span>
                    <span class="font-mono text-[10px] tabular-nums text-base-content/75">{{ cacheHitRateLabel }}</span>
                </div>

                <!-- 手动压缩入口：方章按钮（db-style「方章」配方） -->
                <div v-if="props.canCompact || props.compacting" class="mt-2.5">
                    <button
                        type="button"
                        class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xs border px-2 py-1 text-[11px] transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                        :class="
                            props.compacting
                                ? 'border-base-content/10 text-base-content/40'
                                : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                        "
                        :disabled="props.compacting"
                        @click="handleCompact"
                    >
                        <Icon
                            icon="ri:file-zip-line"
                            class="h-3.5 w-3.5"
                            :class="props.compacting ? 'animate-spin' : ''"
                        />
                        {{ props.compacting ? $t(label("contextUsage.compacting")) : $t(label("contextUsage.compact")) }}
                    </button>
                </div>
            </HoverCardContent>
        </HoverCardPortal>
    </HoverCardRoot>
</template>
