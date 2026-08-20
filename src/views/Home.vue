<script lang="tsx" setup>
import { useLocalStorage } from "@vueuse/core"
import { type Component, computed, ref } from "vue"
import ActivityCalendar from "@/components/ActivityCalendar.vue"
import Changelog from "@/components/Changelog.vue"
import HomeHardboss from "@/components/HomeHardboss.vue"
import HomeMihan from "@/components/HomeMihan.vue"
import HomeQuickNav, { type QuickNavItem } from "@/components/HomeQuickNav.vue"
import HomeSectionHeader from "@/components/HomeSectionHeader.vue"
import RecentBuilds from "@/components/RecentBuilds.vue"
import TodoList from "@/components/TodoList.vue"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import pg from "../../package.json"

// 快捷导航：小图标 + 标题，宽屏 2 行 4 列 / 窄屏 4 行 2 列
const quickNav: QuickNavItem[] = [
    { path: "/char", icon: "ri:hammer-line", titleKey: "char-build.title" },
    { path: "/db", icon: "ri:book-line", titleKey: "database.title" },
    { path: "/levelup", icon: "ri:calculator-line", titleKey: "levelup.title" },
    { path: "/db/resource", icon: "ri:box-1-line", titleKey: "database.resource" },
    { path: "/ranking", icon: "ri:bar-chart-line", titleKey: "ranking.title" },
    { path: "/abyss-usage", icon: "ri:percent-line", titleKey: "abyss-usage.title" },
    { path: "/achievement", icon: "ri:trophy-line", titleKey: "achievement.title" },
    { path: "/more", icon: "ri:more-line", titleKey: "more.title" },
]

/**
 * 首页板块 ID。
 */
type HomeSectionId = "quicknav" | "todo" | "builds" | "calendar" | "changelog" | "mihan" | "hardboss"

/**
 * 首页板块定义：列归属 + 章节头元信息 + 内容组件。
 */
interface HomeSectionDef {
    id: HomeSectionId
    /** 板块英文标签（装饰性大写） */
    label: string
    /** 板块标题的 i18n 键 */
    titleKey: string
    /** 分栏归属：left 左列 / right 右列 */
    column: "left" | "right"
    /** 板块内容组件 */
    component: Component
}

// 默认板块注册表（顺序即默认排序，编号随可见位置动态变化）
const SECTION_DEFS: HomeSectionDef[] = [
    { id: "quicknav", label: "MODULES", titleKey: "home.modules", column: "left", component: HomeQuickNav },
    { id: "todo", label: "OPERATIONS", titleKey: "todo.title", column: "right", component: TodoList },
    { id: "mihan", label: "COMMISSIONS", titleKey: "home.sectionMihan", column: "left", component: HomeMihan },
    { id: "builds", label: "BUILDS", titleKey: "home.recentBuilds", column: "left", component: RecentBuilds },
    { id: "calendar", label: "SCHEDULE", titleKey: "activity-calendar.title", column: "left", component: ActivityCalendar },
    { id: "changelog", label: "CHANGELOG", titleKey: "home.changelog", column: "right", component: Changelog },
    { id: "hardboss", label: "NIGHTMARE", titleKey: "home.sectionHardboss", column: "right", component: HomeHardboss },
]

const DEFAULT_SECTION_ORDER: HomeSectionId[] = SECTION_DEFS.map(def => def.id)

// 板块排序 / 显隐（localStorage 持久化；v2 键使旧版已持久化的默认顺序作废，改用新默认）
const sectionOrder = useLocalStorage<HomeSectionId[]>("home.sectionOrder.v2", DEFAULT_SECTION_ORDER)
const sectionHidden = useLocalStorage<HomeSectionId[]>("home.sectionHidden.v2", [])
// 是否处于板块编辑模式
const editingSections = ref(false)

/**
 * 补齐并排序后的完整板块列表（过滤掉失效 id，并追加新版本引入的板块）。
 */
const orderedSections = computed(() => {
    const known = new Set(SECTION_DEFS.map(def => def.id))
    const order = sectionOrder.value.filter(id => known.has(id))
    for (const def of SECTION_DEFS) {
        if (!order.includes(def.id)) {
            order.push(def.id)
        }
    }
    return order.map(id => SECTION_DEFS.find(def => def.id === id)!)
})

/**
 * 可见板块（按用户排序）。
 */
const visibleSections = computed(() => orderedSections.value.filter(def => !sectionHidden.value.includes(def.id)))

/**
 * 已隐藏板块（按用户排序）。
 */
const hiddenSections = computed(() => orderedSections.value.filter(def => sectionHidden.value.includes(def.id)))

/**
 * 左列可见板块。
 */
const leftSections = computed(() => visibleSections.value.filter(def => def.column === "left"))

/**
 * 右列可见板块。
 */
const rightSections = computed(() => visibleSections.value.filter(def => def.column === "right"))

/**
 * 获取板块在全部可见板块中的下标（用于 order 样式与序号）。
 * @param id 板块 id
 * @returns 下标；不可见时返回 -1
 */
function sectionIndex(id: HomeSectionId) {
    return visibleSections.value.findIndex(def => def.id === id)
}

/**
 * 获取板块在其所在列可见板块中的下标（用于上移/下移禁用判断）。
 * @param id 板块 id
 * @returns 列内下标；不可见时返回 -1
 */
function columnIndexOf(id: HomeSectionId) {
    const column = SECTION_DEFS.find(def => def.id === id)!.column
    return visibleSections.value.filter(def => def.column === column).findIndex(def => def.id === id)
}

/**
 * 获取板块所在列的可见板块数量。
 * @param id 板块 id
 * @returns 列内可见数量
 */
function columnSizeOf(id: HomeSectionId) {
    const column = SECTION_DEFS.find(def => def.id === id)!.column
    return visibleSections.value.filter(def => def.column === column).length
}

/**
 * 在可见序列中移动板块（隐藏板块的相对位置保持不变）。
 * @param id 板块 id
 * @param dir 移动方向：-1 上移 / 1 下移
 */
function moveSection(id: HomeSectionId, dir: -1 | 1) {
    const fullOrder = orderedSections.value.map(def => def.id)
    const visible = visibleSections.value.map(def => def.id)
    const index = visible.indexOf(id)
    const target = index + dir
    if (target < 0 || target >= visible.length) {
        return
    }
    ;[visible[index], visible[target]] = [visible[target], visible[index]]

    const hidden = new Set(sectionHidden.value)
    const rebuilt: HomeSectionId[] = []
    let cursor = 0
    for (const secId of fullOrder) {
        if (hidden.has(secId)) {
            rebuilt.push(secId)
        } else {
            rebuilt.push(visible[cursor])
            cursor += 1
        }
    }
    sectionOrder.value = rebuilt
}

/**
 * 切换板块的显示/隐藏状态。
 * @param id 板块 id
 */
function toggleSection(id: HomeSectionId) {
    const hidden = [...sectionHidden.value]
    const index = hidden.indexOf(id)
    if (index >= 0) {
        hidden.splice(index, 1)
    } else {
        hidden.push(id)
    }
    sectionHidden.value = hidden
}

/**
 * 恢复板块默认排序与显隐。
 */
function resetSections() {
    sectionOrder.value = [...DEFAULT_SECTION_ORDER]
    sectionHidden.value = []
}

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
                        <!-- 迷你游戏启动器（仅 app 端，与检查更新同一行靠右对齐） -->
                        <MiniGameLauncher v-if="env.isApp" class="ml-auto" />
                    </div>
                </div>
            </header>

            <div class="mx-auto max-w-6xl px-5 py-8 pb-10">
                <!-- 板块工具栏：编辑模式开关 / 恢复默认 -->
                <div class="mb-6 flex items-center justify-end gap-2">
                    <span v-if="editingSections" class="mr-auto text-[11px] text-base-content/50">
                        {{ $t("home.editHint") }}
                    </span>
                    <button
                        v-if="editingSections"
                        type="button"
                        class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-3 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="resetSections"
                    >
                        <Icon icon="ri:restart-line" class="h-3.5 w-3.5" />
                        {{ $t("home.resetSections") }}
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xs border px-3 text-xs font-medium transition-colors duration-150"
                        :class="
                            editingSections
                                ? 'border-primary/60 bg-primary/10 text-primary'
                                : 'border-base-content/15 text-base-content/70 hover:border-primary/50 hover:text-primary'
                        "
                        @click="editingSections = !editingSections"
                    >
                        <Icon :icon="editingSections ? 'ri:check-line' : 'ri:settings-4-line'" class="h-3.5 w-3.5" />
                        {{ editingSections ? $t("home.editDone") : $t("home.editSections") }}
                    </button>
                </div>

                <div
                    class="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6 lg:[grid-template-areas:'left_right']"
                >
                    <!-- 左列（分栏时同列堆叠；单列时经 contents 拆散为扁平顺序） -->
                    <div class="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6 lg:[grid-area:left]">
                        <section v-for="def in leftSections" :key="def.id" class="min-w-0" :style="{ order: sectionIndex(def.id) }">
                            <HomeSectionHeader
                                :num="sectionIndex(def.id) + 1"
                                :label="def.label"
                                :title-key="def.titleKey"
                                :editing="editingSections"
                                :is-first="columnIndexOf(def.id) === 0"
                                :is-last="columnIndexOf(def.id) === columnSizeOf(def.id) - 1"
                                :count="def.id === 'quicknav' ? $t('more.count', { count: quickNav.length }) : undefined"
                                @move-up="moveSection(def.id, -1)"
                                @move-down="moveSection(def.id, 1)"
                                @hide="toggleSection(def.id)"
                            />
                            <component :is="def.component" :items="def.id === 'quicknav' ? quickNav : undefined" />
                        </section>
                    </div>

                    <!-- 右列（分栏时独立高度，不撑开左列） -->
                    <div class="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6 lg:[grid-area:right]">
                        <section v-for="def in rightSections" :key="def.id" class="min-w-0" :style="{ order: sectionIndex(def.id) }">
                            <HomeSectionHeader
                                :num="sectionIndex(def.id) + 1"
                                :label="def.label"
                                :title-key="def.titleKey"
                                :editing="editingSections"
                                :is-first="columnIndexOf(def.id) === 0"
                                :is-last="columnIndexOf(def.id) === columnSizeOf(def.id) - 1"
                                @move-up="moveSection(def.id, -1)"
                                @move-down="moveSection(def.id, 1)"
                                @hide="toggleSection(def.id)"
                            />
                            <component :is="def.component" />
                        </section>
                    </div>
                </div>

                <!-- 已隐藏板块托盘（仅编辑模式展示） -->
                <div v-if="editingSections" class="mt-10 rounded-xs border border-dashed border-base-content/20 p-4">
                    <div class="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">
                        <Icon icon="ri:eye-off-line" class="h-4 w-4" />
                        {{ $t("home.hiddenSections") }}
                    </div>
                    <div v-if="hiddenSections.length" class="flex flex-wrap gap-2">
                        <button
                            v-for="def in hiddenSections"
                            :key="def.id"
                            type="button"
                            class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 bg-base-100/60 px-3 text-xs text-base-content/70 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                            :title="$t('home.showSection')"
                            :aria-label="$t('home.showSection')"
                            @click="toggleSection(def.id)"
                        >
                            <Icon icon="ri:eye-line" class="h-3.5 w-3.5" />
                            {{ $t(def.titleKey) }}
                        </button>
                    </div>
                    <div v-else class="text-[13px] text-base-content/40">{{ $t("home.noHiddenSections") }}</div>
                </div>

                <footer v-if="!env.isApp" class="flex justify-center pt-6 pb-2 text-[13px] text-base-content/50">
                    <a class="link" href="https://beian.miit.gov.cn" target="_blank" one-link-mark="yes">浙ICP备2024097919号</a>
                </footer>
            </div>
        </ScrollArea>
    </div>
</template>
