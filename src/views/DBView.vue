<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref } from "vue"
import { useRouter } from "vue-router"
import { type DBLatestItem } from "@/components/DBLatestItemCard.vue"
import charData from "@/data/d/char.data"
import modData from "@/data/d/mod.data"
import weaponData from "@/data/d/weapon.data"
import { DNA_SAFE_VERSION_LIMIT } from "@/data/versionGate"
import { type DBGlobalSearchOption, GlobalSearchService } from "@/utils/global-search"

const router = useRouter()
const { t } = useTranslation()

/**
 * 跳转到指定资料库页面。
 * @param path 目标路由路径
 */
function navigateTo(path: string) {
    router.push(path)
}

/**
 * 将章节下标格式化为两位数字（0 → "01"），用作索引序号。
 * @param index 章节下标
 * @returns 两位补零的序号字符串
 */
function formatIndex(index: number) {
    return String(index + 1).padStart(2, "0")
}

const searchKeyword = ref("")

const databaseItems = [
    {
        name: "database.char",
        path: "/db/char",
        desc: "database.char_desc",
    },
    {
        name: "database.weapon",
        path: "/db/weapon",
        desc: "database.weapon_desc",
    },
    {
        name: "database.resource",
        path: "/db/resource",
        desc: "database.resource_desc",
    },
    {
        name: "database.ironTicket",
        path: "/db/iron-ticket",
        desc: "database.ironTicket_desc",
    },
    {
        name: "database.mod",
        path: "/db/mod",
        desc: "database.mod_desc",
    },
    {
        name: "database.forge",
        path: "/db/forge",
        desc: "database.forge_desc",
    },
    {
        name: "database.damage",
        path: "/db/damage",
        desc: "database.damage_desc",
    },
    {
        name: "database.draft",
        path: "/db/draft",
        desc: "database.draft_desc",
    },
    {
        name: "database.pet",
        path: "/db/pet",
        desc: "database.pet_desc",
    },
    {
        name: "database.dungeon",
        path: "/db/dungeon",
        desc: "database.dungeon_desc",
    },
    {
        name: "database.appearance",
        path: "/db/accessory",
        desc: "database.appearance_desc",
    },
    {
        name: "database.abyss_dungeon",
        path: "/db/abyss",
        desc: "database.abyss_dungeon_desc",
    },
    {
        name: "database.reputation",
        path: "/db/reputation",
        desc: "database.reputation_desc",
    },
    {
        name: "database.rank",
        path: "/db/rank",
        desc: "database.rank_desc",
    },
    {
        name: "database.monster",
        path: "/db/monster",
        desc: "database.monster_desc",
    },
    {
        name: "database.map",
        path: "/db/map",
        desc: "database.map_desc",
    },
    {
        name: "database.event",
        path: "/db/event",
        desc: "database.event_desc",
    },
    {
        name: "database.solotreasure",
        path: "/db/solotreasure",
        desc: "database.solotreasure_desc",
    },
    {
        name: "database.mapLocal",
        path: "/db/map-local",
        desc: "database.mapLocal_desc",
    },
    {
        name: "database.walnut",
        path: "/db/walnut",
        desc: "database.walnut_desc",
    },
    {
        name: "database.title_data",
        path: "/db/title",
        desc: "database.title_data_desc",
    },
    {
        name: "database.book",
        path: "/db/book",
        desc: "database.book_desc",
    },
    {
        name: "database.music",
        path: "/db/music",
        desc: "database.music_desc",
    },
    {
        name: "database.fish",
        path: "/db/fish",
        desc: "database.fish_desc",
    },
    {
        name: "database.shop",
        path: "/db/shop",
        desc: "database.shop_desc",
    },
    {
        name: "database.dynquest",
        path: "/db/dynquest",
        desc: "database.dynquest_desc",
    },
    {
        name: "database.rouge",
        path: "/db/rouge",
        desc: "database.rouge_desc",
    },
    {
        name: "database.hardboss",
        path: "/db/hardboss",
        desc: "database.hardboss_desc",
    },
    {
        name: "database.questchain",
        path: "/db/questchain",
        desc: "database.questchain_desc",
    },
    {
        name: "database.partytopic",
        path: "/db/partytopic",
        desc: "database.partytopic_desc",
    },
    {
        name: "database.achievement",
        path: "/db/achievement",
        desc: "database.achievement_desc",
    },
    {
        name: "database.npc",
        path: "/db/npc",
        desc: "database.npc_desc",
    },
    {
        name: "database.impr",
        path: "/db/impr",
        desc: "database.impr_desc",
    },
]

type DatabaseItem = (typeof databaseItems)[number]

type DatabaseSectionConfig = {
    id: string
    title: string
    description: string
    badge: string
    paths: string[]
}

type SearchScopeOption = {
    id: string
    label: string
}

const globalSearchService = new GlobalSearchService()

const featuredPaths = ["/db/char", "/db/weapon", "/db/mod", "/db/map-local", "/db/questchain", "/db/dungeon", "/db/resource"]

const databaseSectionConfigs: DatabaseSectionConfig[] = [
    {
        id: "build",
        title: t("view.section.build.title"),
        description: t("view.section.build.description"),
        badge: t("view.section.build.badge"),
        paths: ["/db/char", "/db/weapon", "/db/mod", "/db/forge", "/db/damage", "/db/pet", "/db/draft", "/db/resource"],
    },
    {
        id: "explore",
        title: t("view.section.explore.title"),
        description: t("view.section.explore.description"),
        badge: t("view.section.explore.badge"),
        paths: ["/db/event", "/db/map-local", "/db/rouge", "/db/fish", "/db/dungeon", "/db/abyss", "/db/map"],
    },
    {
        id: "world",
        title: t("view.section.world.title"),
        description: t("view.section.world.description"),
        badge: t("view.section.world.badge"),
        paths: ["/db/questchain", "/db/partytopic", "/db/shop", "/db/impr", "/db/npc", "/db/reputation", "/db/dynquest"],
    },
    {
        id: "challenge",
        title: t("view.section.challenge.title"),
        description: t("view.section.challenge.description"),
        badge: t("view.section.challenge.badge"),
        paths: ["/db/rank", "/db/monster", "/db/hardboss", "/db/solotreasure", "/db/iron-ticket"],
    },
    {
        id: "collect",
        title: t("view.section.collect.title"),
        description: t("view.section.collect.description"),
        badge: t("view.section.collect.badge"),
        paths: ["/db/achievement", "/db/title", "/db/music", "/db/book", "/db/walnut", "/db/accessory"],
    },
]

const databaseItemMap = new Map<string, DatabaseItem>(databaseItems.map(item => [item.path, item]))

const selectedSearchSectionIds = ref(databaseSectionConfigs.map(section => section.id))

const searchScopeOptions = computed<SearchScopeOption[]>(() => {
    return [
        { id: "all", label: t("view.all") },
        ...databaseSectionConfigs.map(section => ({
            id: section.id,
            label: section.title,
        })),
    ]
})

const isAllSearchSectionsSelected = computed(() => {
    return selectedSearchSectionIds.value.length === databaseSectionConfigs.length
})

const selectedSearchPaths = computed(() => {
    if (isAllSearchSectionsSelected.value) {
        return null
    }

    const pathSet = new Set<string>()

    for (const section of databaseSectionConfigs) {
        if (!selectedSearchSectionIds.value.includes(section.id)) {
            continue
        }

        for (const path of section.paths) {
            pathSet.add(path)
        }
    }

    return pathSet
})

/**
 * 实时计算搜索候选，按融合评分返回前若干条。
 */
const searchOptions = computed<DBGlobalSearchOption[]>(() => {
    const options = globalSearchService.search(searchKeyword.value)

    if (!selectedSearchPaths.value) {
        return options
    }

    return options.filter(option => selectedSearchPaths.value?.has(option.path))
})

/**
 * 生成搜索状态提示文案，兼顾空状态、命中状态与无结果状态。
 */
const searchStatusText = computed(() => {
    const searchScopeText = isAllSearchSectionsSelected.value
        ? t("view.allModules")
        : t("view.moduleCount", { count: selectedSearchSectionIds.value.length })

    if (!searchKeyword.value.trim()) {
        return t("view.searchScope", { scope: searchScopeText })
    }

    if (searchOptions.value.length) {
        return `${searchScopeText} · ${t("view.matchCount", { count: searchOptions.value.length })}`
    }

    return t("view.noResult")
})

/**
 * 生成快速访问的推荐入口，优先展示高频使用的核心资料。
 */
const featuredItems = computed(() => {
    return featuredPaths.map(path => databaseItemMap.get(path)).filter((item): item is DatabaseItem => item !== undefined)
})

/**
 * 将扁平入口重组为页面分区，形成更清晰的信息架构。
 */
const databaseSections = computed(() => {
    return databaseSectionConfigs.map(section => ({
        ...section,
        items: section.paths.map(path => databaseItemMap.get(path)).filter((item): item is DatabaseItem => item !== undefined),
    }))
})

/**
 * “本期新增”分组：角色/武器/魔之楔各自展示最后版本（versionGate 定义的
 * DNA_SAFE_VERSION_LIMIT）新增的物品；占位版本（9.9 / 99.9）与预发布版本天然被排除。
 */
const latestGroups = computed(() => {
    const definitions = [
        { kind: "char", label: t("database.char"), source: charData },
        { kind: "weapon", label: t("database.weapon"), source: weaponData },
        { kind: "mod", label: t("database.mod"), source: modData },
    ] as const

    return definitions.flatMap(def => {
        const items = def.source.filter(item => item.版本 && Number(item.版本) === DNA_SAFE_VERSION_LIMIT)
        if (!items.length) {
            return []
        }

        return [
            {
                kind: def.kind,
                label: def.label,
                version: String(DNA_SAFE_VERSION_LIMIT),
                entries: items.map(item => ({ kind: def.kind, item })) as DBLatestItem[],
            },
        ]
    })
})

/**
 * 将路由片段转换为更适合展示的短标签。
 * @param path 路由路径
 * @returns 转换后的短标签
 */
function getItemPathLabel(path: string) {
    return path.replace(/^\/db\//, "").replaceAll("-", " · ")
}

/**
 * 判断指定搜索模块是否处于选中状态。
 * @param scopeId 搜索模块 id
 */
function isSearchScopeSelected(scopeId: string) {
    if (scopeId === "all") {
        return isAllSearchSectionsSelected.value
    }

    return selectedSearchSectionIds.value.includes(scopeId)
}

/**
 * 一键切换为搜索全部模块。
 */
function selectAllSearchScopes() {
    selectedSearchSectionIds.value = databaseSectionConfigs.map(section => section.id)
}

/**
 * 切换单个搜索模块；若全部取消，则回退为全选。
 * @param scopeId 搜索模块 id
 */
function toggleSearchScope(scopeId: string) {
    if (scopeId === "all") {
        selectAllSearchScopes()
        return
    }

    const isSelected = selectedSearchSectionIds.value.includes(scopeId)

    if (isSelected) {
        const nextSectionIds = selectedSearchSectionIds.value.filter(id => id !== scopeId)
        selectedSearchSectionIds.value = nextSectionIds.length ? nextSectionIds : databaseSectionConfigs.map(section => section.id)
        return
    }

    selectedSearchSectionIds.value = [...selectedSearchSectionIds.value, scopeId]
}

/**
 * 选择搜索候选并跳转，同时重置输入内容。
 * @param option 选中的搜索候选项
 */
function handleSelectSearchOption(option: DBGlobalSearchOption) {
    searchKeyword.value = ""
    navigateTo(option.path)
}
</script>

<template>
    <ScrollArea class="h-full">
        <div class="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 md:px-6 lg:px-8">
            <!-- 检索带：下划线输入 + 搜索范围方章 -->
            <section class="db-rise relative z-40 border-b border-base-content/15 py-8" style="animation-delay: 0.06s">
                <div class="flex flex-col gap-4">
                    <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-10">
                        <DBGlobalSearchAutocomplete
                            v-model="searchKeyword"
                            :options="searchOptions"
                            :placeholder="$t('view.placeholder')"
                            :empty-text="$t('view.noResultEntries')"
                            :max-visible="14"
                            class="w-full flex-1"
                            input-class="db-search-input"
                            panel-class="db-search-panel"
                            option-class="db-search-option"
                            @select="handleSelectSearchOption"
                        />

                        <div class="flex flex-wrap gap-2">
                            <button
                                v-for="scope in searchScopeOptions"
                                :key="scope.id"
                                type="button"
                                class="cursor-pointer border px-3.5 py-1.5 text-xs transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
                                :class="
                                    isSearchScopeSelected(scope.id)
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="toggleSearchScope(scope.id)"
                            >
                                {{ scope.label }}
                            </button>
                        </div>
                    </div>

                    <p class="text-xs tracking-wide text-base-content/45">{{ searchStatusText }}</p>
                </div>
            </section>

            <!-- 快速访问：内联文字链接条 -->
            <div
                class="db-rise flex flex-wrap items-center gap-x-2 gap-y-2.5 border-b border-base-content/15 py-6"
                style="animation-delay: 0.12s"
            >
                <span class="mr-2 text-xs font-semibold text-base-content/45">{{ $t("view.featuredEntry") }}</span>
                <template v-for="(item, index) in featuredItems" :key="item.path">
                    <span v-if="index" class="select-none text-base-content/25">·</span>
                    <button
                        type="button"
                        class="group inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-base-content/80 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]"
                        @click="navigateTo(item.path)"
                    >
                        {{ $t(item.name) }}
                        <Icon
                            icon="ri:arrow-right-line"
                            class="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                        />
                    </button>
                </template>
            </div>

            <!-- 本期新增：最后版本新增的角色/武器/魔之楔 -->
            <section class="db-rise border-b border-base-content/15 py-9 md:py-11" style="animation-delay: 0.16s">
                <div class="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
                    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <h2 class="text-xl font-bold tracking-tight text-base-content md:text-2xl">{{ $t("view.latestItems") }}</h2>
                        <p class="font-mono text-[10px] uppercase tracking-[0.35em] text-base-content/45">
                            New In v{{ DNA_SAFE_VERSION_LIMIT }}
                        </p>
                    </div>
                </div>

                <div v-for="group in latestGroups" :key="group.kind" class="mt-8">
                    <DBLatestGroup :label="group.label" :version="group.version" :entries="group.entries" />
                </div>
            </section>

            <!-- 章节索引：01–04 幽灵序号横带 -->
            <main class="flex-1">
                <section
                    v-for="(section, index) in databaseSections"
                    :key="section.id"
                    class="db-rise border-b border-base-content/15"
                    :style="{ animationDelay: `${0.18 + 0.07 * index}s` }"
                >
                    <div class="grid gap-x-12 gap-y-6 py-9 md:py-11 xl:grid-cols-[7.5rem_minmax(0,1fr)]">
                        <div class="flex items-baseline gap-4 xl:block">
                            <span class="db-numeral">{{ formatIndex(index) }}</span>
                            <span class="db-badge xl:mt-3 xl:block">{{ section.badge }}</span>
                        </div>

                        <div class="min-w-0">
                            <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                                <h2 class="text-xl font-bold tracking-tight text-base-content md:text-2xl">{{ section.title }}</h2>
                                <span class="text-xs tabular-nums text-base-content/40">
                                    <span class="font-mono">{{ section.items.length }}</span> {{ $t("view.databaseEntryCount") }}
                                </span>
                            </div>

                            <p class="mt-2.5 max-w-2xl text-sm leading-6 text-base-content/55">{{ section.description }}</p>

                            <ul class="mt-5 grid grid-cols-1 gap-x-12 sm:grid-cols-2 lg:grid-cols-4">
                                <li v-for="item in section.items" :key="item.path">
                                    <button
                                        type="button"
                                        class="db-entry focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                        @click="navigateTo(item.path)"
                                    >
                                        <span class="truncate">{{ $t(item.name) }}</span>
                                        <span class="db-leader" aria-hidden="true" />
                                        <span class="db-entry-path">{{ getItemPathLabel(item.path) }}</span>
                                        <Icon icon="ri:arrow-right-line" class="db-entry-arrow" />
                                    </button>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>
            </main>

            <!-- 版权页：授权说明小字 -->
            <footer
                class="db-rise py-9 text-xs leading-6 text-base-content/45"
                :style="{ animationDelay: `${0.18 + 0.07 * databaseSections.length}s` }"
            >
                <p class="font-semibold text-base-content/70">{{ $t("view.contentAuthorizationTitle") }}</p>
                <p class="mt-2">{{ $t("view.contentAuthorizationDesc") }}</p>
                <p class="mt-1.5">{{ $t("view.contentAuthorizationDesc2") }}</p>
            </footer>
        </div>
    </ScrollArea>
</template>

<style scoped>
/* 页面级一次性入场动画：轻量上浮淡入，仅播放一次，不做循环装饰 */
/* backwards：结束后不保留动画值，避免后代 backdrop-filter 失效 */
.db-rise {
    animation: db-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

@keyframes db-rise {
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
.db-numeral {
    font-size: clamp(2.75rem, 5vw, 4.5rem);
    line-height: 0.95;
    font-weight: 900;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--color-base-content) 13%, transparent);
}

/* 章节英文徽记：等宽小号字距大写 */
.db-badge {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.625rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--color-base-content) 45%, transparent);
}

/* 索引条目行：名称 + 虚线引导线 + 路径标签 + 箭头，模仿目录条目 */
.db-entry {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0;
    cursor: pointer;
    text-align: left;
    color: color-mix(in srgb, var(--color-base-content) 82%, transparent);
    transition: color 0.2s ease;
}

.db-entry:hover {
    color: var(--color-primary);
}

/* 目录点线：悬停时跟随强调色 */
.db-leader {
    flex: 1 1 auto;
    min-width: 1.25rem;
    border-bottom: 1px dotted color-mix(in srgb, var(--color-base-content) 30%, transparent);
    transform: translateY(-0.28em);
    transition: border-color 0.2s ease;
}

.db-entry:hover .db-leader {
    border-color: color-mix(in srgb, var(--color-primary) 55%, transparent);
}

/* 条目路径标签：等宽小号大写 */
.db-entry-path {
    flex-shrink: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.625rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--color-base-content) 35%, transparent);
    transition: color 0.2s ease;
}

.db-entry:hover .db-entry-path {
    color: color-mix(in srgb, var(--color-primary) 70%, transparent);
}

/* 条目箭头：悬停时滑入显现 */
.db-entry-arrow {
    flex-shrink: 0;
    width: 0.875rem;
    height: 0.875rem;
    opacity: 0;
    transform: translateX(-0.4rem);
    transition:
        opacity 0.2s ease,
        transform 0.2s ease;
}

.db-entry:hover .db-entry-arrow {
    opacity: 1;
    transform: translateX(0);
}

.db-entry:active {
    transform: scale(0.985);
}

/* 检索框：下划线式输入，聚焦时以主题色强调 */
:deep(.db-search-input) {
    border: 0 !important;
    border-bottom: 1px solid color-mix(in srgb, var(--color-base-content) 25%, transparent) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    transition: border-color 0.2s ease;
}

:deep(.db-search-input:focus) {
    border-bottom-color: var(--color-primary) !important;
}

/* 检索面板：直角细边框，保持索引页的平面感 */
:deep(.db-search-panel) {
    border-radius: 0 !important;
    border: 1px solid color-mix(in srgb, var(--color-base-content) 18%, transparent) !important;
    box-shadow: 0 12px 32px color-mix(in srgb, var(--color-base-content) 14%, transparent) !important;
}

/* 面板内类型徽章改直角，统一造型语言 */
:deep(.db-search-option .badge) {
    border-radius: 0 !important;
}

/* 减少动态偏好：关闭入场动画 */
@media (prefers-reduced-motion: reduce) {
    .db-rise {
        animation: none;
    }
}
</style>
