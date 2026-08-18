<script lang="tsx" setup>
import { computed } from "vue"
import { useUIStore } from "@/store/ui"
import pg from "../../package.json"
import type { IconTypes } from "../components/Icon.vue"
import { env } from "../env"

// 快捷导航：小图标 + 标题，宽屏 2 行 4 列 / 窄屏 4 行 2 列
const quickNav = [
    { path: "/char", icon: "ri:hammer-line", titleKey: "char-build.title" },
    { path: "/db", icon: "ri:book-line", titleKey: "database.title" },
    { path: "/levelup", icon: "ri:calculator-line", titleKey: "levelup.title" },
    { path: "/db/resource", icon: "ri:box-1-line", titleKey: "database.resource" },
    { path: "/ranking", icon: "ri:bar-chart-line", titleKey: "ranking.title" },
    { path: "/abyss-usage", icon: "ri:percent-line", titleKey: "abyss-usage.title" },
    { path: "/achievement", icon: "ri:trophy-line", titleKey: "achievement.title" },
    { path: "/more", icon: "ri:more-line", titleKey: "more.title" },
] satisfies { path: string; icon: IconTypes; titleKey: string }[]

const OPEN_SERVER_DATE = "2025-10-28T00:00:00+08:00"

/**
 * @description 计算从 2025-10-28 起的开服天数，首日记为第 1 天。
 */
const openServerDays = computed(() => {
    const start = new Date(OPEN_SERVER_DATE).getTime()
    const now = Date.now()
    const diffDays = Math.floor((now - start) / (24 * 60 * 60 * 1000))
    return Math.max(1, diffDays + 1)
})

/**
 * @description 检查并更新应用版本，成功后提示已是最新版本。
 */
async function checkUpdate() {
    await window.updateApp()
    useUIStore().showSuccessMessage("已是最新版本")
}
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea class="h-full">
            <!-- 主视觉面板：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
            <header class="relative overflow-hidden border-b-2 border-primary bg-base-100">
                <!-- 引导线网格（装饰性，随主题明暗） -->
                <div
                    class="pointer-events-none absolute inset-0"
                    style="
                        background-image:
                            linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                            linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                        background-size: 52px 52px;
                        mask-image: linear-gradient(to bottom, black, transparent 85%);
                    "
                    aria-hidden="true"
                />
                <!-- 右上角斜切楔形 -->
                <span
                    class="pointer-events-none absolute top-0 right-0 h-12 w-12 bg-primary max-md:h-9 max-md:w-9 [clip-path:polygon(100%_0,100%_100%,0_0)]"
                    aria-hidden="true"
                />
                <div class="mx-auto max-w-6xl px-5 pt-12 pb-10 animate-ef-rise motion-reduce:animate-none sm:pt-14 sm:pb-12">
                    <p class="mb-4 inline-flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-7 bg-primary" aria-hidden="true" />
                        Duet Night Abyss
                    </p>
                    <h1 class="font-orbitron text-4xl font-bold leading-none tracking-tight text-base-content sm:text-6xl">
                        DNA <span class="text-primary">Builder</span>
                    </h1>
                    <p class="mt-5 mb-7 flex flex-wrap items-center gap-2.5 text-sm text-base-content/60">
                        <span
                            >开服第 <b class="font-orbitron text-primary tabular-nums">{{ openServerDays }}</b> 天</span
                        >
                        <span class="h-4 w-px bg-base-content/40" aria-hidden="true" />
                        <span>{{ $t("home.cureent_version") }}</span>
                        <a
                            class="text-primary underline decoration-primary/40 underline-offset-[3px] tabular-nums hover:decoration-primary"
                            :href="`https://github.com/pa001024/dna-builder/releases/tag/v${pg.version}`"
                            target="_blank"
                        >
                            v{{ pg.version }}
                        </a>
                    </p>
                    <div class="flex flex-wrap gap-3">
                        <a
                            v-if="!env.isApp"
                            href="/api/download"
                            target="_blank"
                            class="cursor-pointer inline-flex h-11 items-center justify-center gap-2 rounded-xs bg-primary px-5 text-sm font-semibold text-primary-content transition-all duration-150 hover:bg-primary/90 active:translate-y-px motion-reduce:transition-none"
                        >
                            <Icon icon="ri:windows-fill" class="h-5 w-5" />
                            <span>{{ $t("home.download") }}</span>
                        </a>
                        <button
                            v-else
                            type="button"
                            class="cursor-pointer inline-flex h-11 items-center justify-center gap-2 rounded-xs bg-primary px-5 text-sm font-semibold text-primary-content transition-all duration-150 hover:bg-primary/90 active:translate-y-px motion-reduce:transition-none"
                            @click="checkUpdate"
                        >
                            <Icon icon="ri:refresh-line" class="h-5 w-5" />
                            <span>{{ $t("home.checkUpdate") }}</span>
                        </button>
                        <a
                            href="https://github.com/pa001024/dna-builder"
                            target="_blank"
                            class="cursor-pointer inline-flex h-11 items-center justify-center gap-2 rounded-xs border border-base-content/30 bg-base-100 px-5 text-sm font-semibold text-base-content transition-colors duration-150 hover:bg-base-content/5 active:translate-y-px"
                        >
                            <Icon icon="ri:github-fill" class="h-5 w-5" />
                            <span>{{ $t("home.starme") }}</span>
                        </a>
                    </div>
                </div>
            </header>

            <div class="mx-auto max-w-6xl px-5 py-8 pb-10">
                <div class="flex flex-col gap-10 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-6 xl:[grid-template-areas:'left_right']">
                    <!-- 左列（分栏时同列堆叠；单列时经 contents 拆散为扁平顺序 01→02→03→04→05） -->
                    <div class="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-6 xl:[grid-area:left]">
                        <!-- 01 快捷导航 -->
                        <section class="order-1">
                            <div class="mb-4 flex items-center gap-3.5 animate-ef-rise motion-reduce:animate-none">
                                <span
                                    class="inline-flex h-9 min-w-9 items-center justify-center rounded-xs bg-primary px-2 font-orbitron text-sm font-semibold tracking-wide text-primary-content tabular-nums"
                                >
                                    01
                                </span>
                                <span class="text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">MODULES</span>
                                <span class="text-[17px] font-semibold text-base-content">{{ $t("home.modules") }}</span>
                                <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />
                                <span class="text-[11px] font-medium text-base-content/50">
                                    {{ $t("more.count", { count: quickNav.length }) }}
                                </span>
                            </div>
                            <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
                                <RouterLink
                                    v-for="(item, index) in quickNav"
                                    :key="item.path"
                                    :to="item.path"
                                    class="group relative flex aspect-square flex-col items-center justify-center rounded-xs border border-base-content/10 bg-base-100 px-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 md:aspect-video md:items-stretch @container-size motion-reduce:animate-none motion-reduce:transition-none animate-ef-rise"
                                    :style="{ animationDelay: `calc(0.1s + ${index} * 40ms)` }"
                                >
                                    <!-- 图标 + 文字：宽屏时内容左对齐、左边距固定，保证各卡片图标纵向对齐；窄屏保持居中 -->
                                    <span
                                        class="flex flex-col items-center gap-2 md:flex-row md:justify-start md:gap-2.5 md:pl-4"
                                    >
                                        <span
                                            class="flex h-[50cqh] w-[50cqh] shrink-0 items-center justify-center rounded-xs bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-content"
                                        >
                                            <Icon :icon="item.icon" class="h-[55%] w-[55%]" />
                                        </span>
                                        <span class="text-[16cqh] font-medium leading-snug text-base-content">{{ $t(item.titleKey) }}</span>
                                    </span>
                                    <span
                                        class="absolute right-2 hidden h-[26cqh] w-[26cqh] translate-x-1 items-center justify-center rounded-xs bg-primary text-primary-content opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 md:flex"
                                        aria-hidden="true"
                                    >
                                        <Icon icon="ri:arrow-right-line" class="h-[55%] w-[55%]" />
                                    </span>
                                </RouterLink>
                            </div>
                        </section>

                        <!-- 03 最近构筑 -->
                        <RecentBuilds class="order-3" />

                        <!-- 04 活动日历 -->
                        <section class="order-4">
                            <div class="mb-4 flex items-center gap-3.5 animate-ef-rise motion-reduce:animate-none">
                                <span
                                    class="inline-flex h-9 min-w-9 items-center justify-center rounded-xs bg-primary px-2 font-orbitron text-sm font-semibold tracking-wide text-primary-content tabular-nums"
                                >
                                    04
                                </span>
                                <span class="text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">SCHEDULE</span>
                                <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />
                            </div>
                            <ActivityCalendar />
                        </section>
                    </div>

                    <!-- 右列（分栏时独立高度，不撑开左列） -->
                    <div class="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-6 xl:[grid-area:right]">
                        <!-- 02 待办 -->
                        <aside class="order-2">
                            <TodoList />
                        </aside>

                        <!-- 05 更新日志 -->
                        <Changelog class="order-5" />
                    </div>
                </div>

                <footer v-if="!env.isApp" class="flex justify-center pt-6 pb-2 text-[13px] text-base-content/50">
                    <a class="link" href="https://beian.miit.gov.cn" target="_blank" one-link-mark="yes">浙ICP备2024097919号</a>
                </footer>
            </div>
        </ScrollArea>
    </div>
</template>
