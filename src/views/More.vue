<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import forge from "node-forge"
import { computed, onBeforeUnmount, onMounted } from "vue"
import { useSettingStore } from "@/store/setting"
import { sha256 } from "@/utils/sha256"
import type { IconTypes } from "../components/Icon.vue"
import { env } from "../env"

const setting = useSettingStore()
const scriptUnlocked = useLocalStorage("script-unlocked", false)
const { t } = useTranslation()

type MoreItem = {
    name: string
    path: string
    icon: IconTypes
    show?: boolean
}

const itemsRaw: MoreItem[] = [
    {
        name: "char-build",
        path: "/char",
        icon: "ri:hammer-line",
    },
    {
        name: "guides",
        path: "/guides",
        icon: "ri:book-line",
    },
    {
        name: "counter",
        path: "/counter",
        icon: "plus_one",
    },
    {
        name: "build-compare",
        path: "/char-build-compare",
        icon: "ri:table-view",
    },
    {
        name: "dna-home",
        path: "/dna",
        icon: "ri:chat-thread-line",
    },
    {
        name: "database",
        path: "/db",
        icon: "ri:book-line",
    },
    {
        name: "levelup",
        path: "/levelup",
        icon: "ri:calculator-line",
    },
    {
        name: "achievement",
        path: "/achievement",
        icon: "ri:trophy-line",
    },
    {
        name: "abyss-usage",
        path: "/abyss-usage",
        icon: "ri:bar-chart-line",
    },
    {
        name: "ranking",
        path: "/ranking",
        icon: "ri:sort-number-asc",
    },
    {
        name: "setting",
        path: "/setting",
        icon: "ri:settings-3-line",
    },
    {
        name: "game-launcher",
        path: "/game-launcher",
        icon: "ri:rocket-2-line",
    },
    {
        name: "chat",
        path: "/chat",
        icon: "ri:chat-3-line",
    },
    {
        name: "flow",
        path: "/flow",
        icon: "ri:node-tree",
    },
    {
        name: "inventory",
        path: "/inventory",
        icon: "ri:box-1-line",
    },
    {
        name: "timeline",
        path: "/timeline",
        icon: "ri:timeline-view",
    },
    {
        name: "help",
        path: "/help",
        icon: "ri:question-line",
    },
    {
        name: "game-accounts",
        path: "/game-accounts",
        icon: "ri:user-line",
        show: env.isApp,
    },
    {
        name: "unpack",
        path: "/unpack",
        icon: "ri:file-zip-line",
        show: env.isApp && !setting.safeMode,
    },
    {
        name: "skin-colorize",
        path: "/skin-colorize",
        icon: "ri:palette-line",
    },
    {
        name: "race-lottery",
        path: "/race-lottery",
        icon: "ri:run-line",
    },
]

/**
 * 全量入口列表：在基础列表上按解锁状态追加脚本管理入口。
 */
const items = computed<MoreItem[]>(() => [
    ...itemsRaw,
    {
        name: "script-list",
        path: "/scripts",
        icon: "ri:code-s-slash-line",
        show: scriptUnlocked.value,
    },
])

/** 当前环境下可见的入口（过滤 show 为 false 的项）。 */
const visibleItems = computed(() => items.value.filter(item => item.show !== false))

/** 以入口名为键的可见项索引，供分节与快速访问解析。 */
const visibleItemMap = computed(() => new Map(visibleItems.value.map(item => [item.name, item])))

type MoreSectionConfig = {
    id: string
    title: string
    description: string
    badge: string
    names: string[]
}

/** 分节配置：参照资料库章节索引结构，按功能域划分入口。 */
const sectionConfigs: MoreSectionConfig[] = [
    {
        id: "build",
        title: t("more.section.build.title"),
        description: t("more.section.build.description"),
        badge: t("more.section.build.badge"),
        names: ["char-build", "build-compare", "levelup", "inventory", "skin-colorize", "guides"],
    },
    {
        id: "data",
        title: t("more.section.data.title"),
        description: t("more.section.data.description"),
        badge: t("more.section.data.badge"),
        names: ["database", "abyss-usage", "ranking", "achievement", "race-lottery"],
    },
    {
        id: "tools",
        title: t("more.section.tools.title"),
        description: t("more.section.tools.description"),
        badge: t("more.section.tools.badge"),
        names: ["flow", "timeline", "counter", "unpack", "script-list"],
    },
    {
        id: "system",
        title: t("more.section.system.title"),
        description: t("more.section.system.description"),
        badge: t("more.section.system.badge"),
        names: ["dna-home", "game-accounts", "game-launcher", "chat", "setting", "help"],
    },
]

/** 快速访问推荐的核心功能入口。 */
const featuredNames = ["char-build", "database", "guides", "counter", "levelup", "inventory"]

/**
 * 生成快速访问的推荐入口，优先展示高频使用的核心功能。
 */
const featuredItems = computed(() =>
    featuredNames.map(name => visibleItemMap.value.get(name)).filter((item): item is MoreItem => item !== undefined),
)

/**
 * 将扁平入口重组为页面分区，形成更清晰的信息架构。
 */
const sections = computed(() =>
    sectionConfigs.map(section => ({
        ...section,
        items: section.names.map(name => visibleItemMap.value.get(name)).filter((item): item is MoreItem => item !== undefined),
    })),
)

/**
 * 将章节下标格式化为两位数字（0 → "01"），用作索引序号。
 * @param index 章节下标
 * @returns 两位补零的序号字符串
 */
function formatIndex(index: number) {
    return String(index + 1).padStart(2, "0")
}

let hh: string[] = []

/**
 * 计算字符串的 SHA1。
 * @param input 输入字符串。
 * @returns 十六进制摘要。
 */
const sha1 = (input: string) => {
    const md = forge.md.sha1.create()
    md.update(input, "utf8")
    return md.digest().toHex()
}

/**
 * 生成当前输入序列的校验串。
 * @param history 最近 5 次输入。
 * @param input 当前输入字符。
 * @returns 校验串。
 */
const buildSignature = (history: string[], input: string) => {
    const signature = `${sha1(`0:${history[0] ?? ""}`)}${sha1(`1:${history[1] ?? ""}`)}${sha1(`2:${history[2] ?? ""}`)}${sha1(`3:${history[3] ?? ""}`)}${sha1(`4:${history[4] ?? ""}`)}${sha1(`5:${input}`)}`

    return sha256(signature)
}

const scriptSignature = "c43801e66e06857150b1930ae4a9831af5259aeb7d65ed7d73d83176adabec97"

/**
 * 处理 More 页面全局按键输入。
 * @param event 键盘事件。
 */
const handleKeydown = (event: KeyboardEvent) => {
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) {
        return
    }

    const input = event.key.toLowerCase()
    const history = hh.slice(-5)
    const signature = buildSignature(history, input)

    if (signature === scriptSignature) {
        scriptUnlocked.value = !scriptUnlocked.value
        hh = []
        return
    }

    hh = [...history, input].slice(-5)
}

onMounted(() => {
    document.addEventListener("keydown", handleKeydown)
})

onBeforeUnmount(() => {
    document.removeEventListener("keydown", handleKeydown)
})
</script>

<template>
    <ScrollArea class="h-full">
        <div class="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 md:px-6 lg:px-8">
            <!-- 页眉带：功能索引标题 + 模块计数 -->
            <section class="more-rise relative z-40 border-b border-base-content/15 py-8" style="animation-delay: 0.06s">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
                    <div class="flex flex-col gap-2">
                        <span class="more-badge">{{ $t("more.badge") }}</span>
                        <h1 class="text-2xl font-bold tracking-tight text-base-content md:text-3xl">{{ $t("more.desc") }}</h1>
                    </div>
                    <p class="font-mono text-xs tabular-nums tracking-wide text-base-content/45">
                        {{ $t("more.count", { count: visibleItems.length }) }}
                    </p>
                </div>
            </section>

            <!-- 快速访问：内联文字链接条 -->
            <div
                class="more-rise flex flex-wrap items-center gap-x-2 gap-y-2.5 border-b border-base-content/15 py-6"
                style="animation-delay: 0.12s"
            >
                <span class="mr-2 text-xs font-semibold text-base-content/45">{{ $t("view.featuredEntry") }}</span>
                <template v-for="(item, index) in featuredItems" :key="item.name">
                    <span v-if="index" class="select-none text-base-content/25">·</span>
                    <RouterLink
                        :to="item.path"
                        class="group inline-flex items-center gap-1 text-sm font-medium text-base-content/80 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]"
                    >
                        {{ $t(`${item.name}.title`) }}
                        <Icon
                            icon="ri:arrow-right-line"
                            class="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                        />
                    </RouterLink>
                </template>
            </div>

            <!-- 章节索引：01–04 幽灵序号横带 -->
            <main class="flex-1">
                <section
                    v-for="(section, index) in sections"
                    :key="section.id"
                    class="more-rise border-b border-base-content/15"
                    :style="{ animationDelay: `${0.16 + 0.06 * index}s` }"
                >
                    <div class="grid gap-x-12 gap-y-6 py-9 md:py-11 xl:grid-cols-[7.5rem_minmax(0,1fr)]">
                        <div class="flex items-baseline gap-4 xl:block">
                            <span class="more-numeral">{{ formatIndex(index) }}</span>
                            <span class="more-badge xl:mt-3 xl:block">{{ section.badge }}</span>
                        </div>

                        <div class="min-w-0">
                            <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                                <h2 class="text-xl font-bold tracking-tight text-base-content md:text-2xl">{{ section.title }}</h2>
                                <span class="font-mono text-xs tabular-nums text-base-content/40">
                                    {{ section.items.length }} {{ $t("more.entryCount") }}
                                </span>
                            </div>

                            <p class="mt-2.5 max-w-2xl text-sm leading-6 text-base-content/55">{{ section.description }}</p>

                            <ul class="mt-5 grid grid-cols-1 gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
                                <li v-for="item in section.items" :key="item.name" class="more-item">
                                    <RouterLink
                                        :to="item.path"
                                        class="more-entry focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    >
                                        <span class="more-entry-icon" aria-hidden="true">
                                            <Icon :icon="item.icon" class="h-4 w-4" />
                                        </span>
                                        <span class="min-w-0 truncate text-sm font-medium">{{ $t(`${item.name}.title`) }}</span>
                                        <span class="more-leader" aria-hidden="true" />
                                        <Icon icon="ri:arrow-right-line" class="more-entry-arrow" />
                                    </RouterLink>
                                    <p class="more-entry-desc">{{ $t(`${item.name}.desc`) }}</p>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    </ScrollArea>
</template>

<style scoped>
/* 页面级一次性入场动画：轻量上浮淡入，仅播放一次，不做循环装饰 */
.more-rise {
    animation: more-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes more-rise {
    from {
        opacity: 0;
        transform: translateY(14px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* 章节幽灵数字：超大号低对比数字，作为索引主锚点 */
.more-numeral {
    font-size: clamp(2.75rem, 5vw, 4.5rem);
    line-height: 0.95;
    font-weight: 900;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--color-base-content) 13%, transparent);
}

/* 章节英文徽记：等宽小号字距大写 */
.more-badge {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.625rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--color-base-content) 45%, transparent);
}

/* 索引条目行：图标方章 + 名称 + 虚线引导线 + 箭头，模仿目录条目 */
.more-entry {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.55rem 0 0.15rem;
    cursor: pointer;
    text-align: left;
    color: color-mix(in srgb, var(--color-base-content) 82%, transparent);
    transition: color 0.2s ease;
}

.more-entry:hover {
    color: var(--color-primary);
}

/* 图标方章：直角细边框的小方块，延续"方章"造型语言 */
.more-entry-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid color-mix(in srgb, var(--color-base-content) 22%, transparent);
    color: color-mix(in srgb, var(--color-base-content) 52%, transparent);
    transition:
        color 0.2s ease,
        border-color 0.2s ease;
}

.more-entry:hover .more-entry-icon {
    color: var(--color-primary);
    border-color: color-mix(in srgb, var(--color-primary) 45%, transparent);
}

/* 目录点线：悬停时跟随强调色 */
.more-leader {
    flex: 1 1 auto;
    min-width: 1.25rem;
    border-bottom: 1px dotted color-mix(in srgb, var(--color-base-content) 30%, transparent);
    transform: translateY(-0.12em);
    transition: border-color 0.2s ease;
}

.more-entry:hover .more-leader {
    border-color: color-mix(in srgb, var(--color-primary) 55%, transparent);
}

/* 条目箭头：悬停时滑入显现 */
.more-entry-arrow {
    flex-shrink: 0;
    width: 0.875rem;
    height: 0.875rem;
    opacity: 0;
    transform: translateX(-0.4rem);
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.more-entry:hover .more-entry-arrow {
    opacity: 1;
    transform: translateX(0);
}

.more-entry:active {
    transform: scale(0.985);
}

/* 条目描述：小号弱化文本，缩进对齐条目名称 */
.more-entry-desc {
    margin: 0.1rem 0 0.6rem;
    padding-left: 2.35rem;
    padding-right: 0.25rem;
    font-size: 0.75rem;
    line-height: 1.5;
    color: color-mix(in srgb, var(--color-base-content) 45%, transparent);
}

.more-item {
    min-width: 0;
}

/* 减少动态偏好：关闭入场动画 */
@media (prefers-reduced-motion: reduce) {
    .more-rise {
        animation: none;
    }
}
</style>
