<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { type DBLatestItem } from "@/components/DBLatestItemCard.vue"
import { useDBChat } from "@/composables/useDBChat"
import charData from "@/data/d/char.data"
import modData from "@/data/d/mod.data"
import weaponData from "@/data/d/weapon.data"
import { DNA_SAFE_VERSION_LIMIT } from "@/data/versionGate"
import type { Conversation } from "@/store/db"
import { useUIStore } from "@/store/ui"
import { type DBGlobalSearchOption, GlobalSearchService } from "@/utils/global-search"

const router = useRouter()
const { t } = useTranslation()
const ui = useUIStore()

/** 结果面板内直接展示的结果条数，超出的部分只提示数量 */
const MAX_VISIBLE_RESULTS = 6

/** “本期新增”一行内的总格数（桌面端） */
const LATEST_ROW_COLUMNS = 8
/** 窄屏时每个模块内部展示的卡片列数（模块之间纵向堆叠） */
const LATEST_STACK_COLUMNS = 4
/** 每个模块至少分到的格数：条目数暴涨时，后面的模块不会被挤成单列 */
const LATEST_ROW_MIN_SPAN = 2
/** 窄屏断点（px）：低于该宽度时“本期新增”改为堆叠并通过容器内部滚动查看 */
const LATEST_STACK_WIDTH = 768

/**
 * 跳转到指定资料库页面。
 * @param path 目标路由路径
 */
function navigateTo(path: string) {
    router.push(path)
}

const searchKeyword = ref("")
/** 对话模式：进入后上段展示消息流、左栏展示会话记录，直到用户返回资料库 */
const chatMode = ref(false)
/** “本期新增”是否处于宽屏单行布局 */
const isWideLatestRow = ref(true)

/**
 * 资料库对话状态（会话列表 + 消息流 + 资料检索 Agent）。
 * 这里解构使用，便于模板直接读写（会话与消息持久化在 Dexie）。
 */
const {
    conversations: chatConversations,
    activeConversationId,
    messages: chatMessages,
    isBusy: chatBusy,
    liveReasoning,
    startNewConversation,
    selectConversation,
    removeConversation,
    send: sendChat,
    interrupt: interruptChat,
} = useDBChat()

/** 是否处于输入态：输入非空即进入提问/检索态 */
const isComposing = computed(() => searchKeyword.value.trim().length > 0)
/** 检索范围条是否展示：输入态（本地检索）与对话态（资料检索）都需要 */
const showScopeChips = computed(() => chatMode.value || isComposing.value)

/** 模块入口：icon 为 Icon.vue 中登记的字形名（as const 保留字面量类型，供 Icon 组件校验） */
const databaseItems = [
    { name: "database.char", path: "/db/char", desc: "database.char_desc", icon: "ri:user-line" },
    { name: "database.weapon", path: "/db/weapon", desc: "database.weapon_desc", icon: "ri:sword-line" },
    { name: "database.resource", path: "/db/resource", desc: "database.resource_desc", icon: "ri:stack-line" },
    { name: "database.ironTicket", path: "/db/iron-ticket", desc: "database.ironTicket_desc", icon: "ri:compass-3-line" },
    { name: "database.mod", path: "/db/mod", desc: "database.mod_desc", icon: "ri:puzzle-line" },
    { name: "database.forge", path: "/db/forge", desc: "database.forge_desc", icon: "ri:hammer-line" },
    { name: "database.damage", path: "/db/damage", desc: "database.damage_desc", icon: "ri:bar-chart-grouped-line" },
    { name: "database.draft", path: "/db/draft", desc: "database.draft_desc", icon: "ri:clipboard-line" },
    { name: "database.pet", path: "/db/pet", desc: "database.pet_desc", icon: "ri:sparkling-line" },
    { name: "database.dungeon", path: "/db/dungeon", desc: "database.dungeon_desc", icon: "ri:gamepad-line" },
    { name: "database.appearance", path: "/db/accessory", desc: "database.appearance_desc", icon: "ri:palette-line" },
    { name: "database.abyss_dungeon", path: "/db/abyss", desc: "database.abyss_dungeon_desc", icon: "ri:skull-line" },
    { name: "database.reputation", path: "/db/reputation", desc: "database.reputation_desc", icon: "ri:medal-line" },
    { name: "database.rank", path: "/db/rank", desc: "database.rank_desc", icon: "ri:trophy-line" },
    { name: "database.monster", path: "/db/monster", desc: "database.monster_desc", icon: "ri:crosshair-line" },
    { name: "database.map", path: "/db/map", desc: "database.map_desc", icon: "ri:map-2-line" },
    { name: "database.event", path: "/db/event", desc: "database.event_desc", icon: "ri:calendar-event-line" },
    { name: "database.solotreasure", path: "/db/solotreasure", desc: "database.solotreasure_desc", icon: "ri:gift-line" },
    { name: "database.mapLocal", path: "/db/map-local", desc: "database.mapLocal_desc", icon: "ri:focus-3-line" },
    { name: "database.walnut", path: "/db/walnut", desc: "database.walnut_desc", icon: "ri:mail-line" },
    { name: "database.title_data", path: "/db/title", desc: "database.title_data_desc", icon: "ri:bookmark-line" },
    { name: "database.book", path: "/db/book", desc: "database.book_desc", icon: "ri:book-open-line" },
    { name: "database.music", path: "/db/music", desc: "database.music_desc", icon: "ri:music-2-line" },
    { name: "database.fish", path: "/db/fish", desc: "database.fish_desc", icon: "ri:anchor-line" },
    { name: "database.shop", path: "/db/shop", desc: "database.shop_desc", icon: "ri:shopping-bag-4-line" },
    { name: "database.dynquest", path: "/db/dynquest", desc: "database.dynquest_desc", icon: "ri:task-line" },
    { name: "database.rouge", path: "/db/rouge", desc: "database.rouge_desc", icon: "ri:dice-5-line" },
    { name: "database.hardboss", path: "/db/hardboss", desc: "database.hardboss_desc", icon: "ri:ghost-2-line" },
    { name: "database.questchain", path: "/db/questchain", desc: "database.questchain_desc", icon: "ri:quill-pen-line" },
    { name: "database.partytopic", path: "/db/partytopic", desc: "database.partytopic_desc", icon: "ri:chat-thread-line" },
    { name: "database.achievement", path: "/db/achievement", desc: "database.achievement_desc", icon: "ri:award-line" },
    { name: "database.npc", path: "/db/npc", desc: "database.npc_desc", icon: "ri:group-line" },
    { name: "database.impr", path: "/db/impr", desc: "database.impr_desc", icon: "ri:image-2-line" },
] as const

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

/** 推荐模块：平铺时排在最前 */
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

/**
 * 平铺的模块卡片顺序：推荐模块在前，其余保持原有顺序。
 */
const moduleCards = computed<DatabaseItem[]>(() => {
    const featuredSet = new Set(featuredPaths)
    const featured = featuredPaths.map(path => databaseItemMap.get(path)).filter((item): item is DatabaseItem => item !== undefined)

    return [...featured, ...databaseItems.filter(item => !featuredSet.has(item.path))]
})

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

/** 结果面板中实际渲染的结果 */
const visibleSearchOptions = computed(() => searchOptions.value.slice(0, MAX_VISIBLE_RESULTS))

/** 结果面板中未渲染、仅做数量提示的结果数 */
const hiddenResultCount = computed(() => Math.max(searchOptions.value.length - MAX_VISIBLE_RESULTS, 0))

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
 * 单行模块条数据：全部 + 各分区，以及该分区覆盖的入口数量。
 */
const moduleChips = computed(() => {
    return searchScopeOptions.value.map(scope => ({
        ...scope,
        count:
            scope.id === "all"
                ? databaseItems.length
                : (databaseSectionConfigs.find(section => section.id === scope.id)?.paths.length ?? 0),
    }))
})

/**
 * “本期新增”分组：角色/武器/魔之楔各自展示最后版本（versionGate 定义的
 * DNA_SAFE_VERSION_LIMIT）新增的物品；占位版本（9.9 / 99.9）与预发布版本天然被排除。
 */
const latestGroups = computed(() => {
    const definitions = [
        { kind: "char", label: t("database.char"), source: charData, path: "/db/char" },
        { kind: "weapon", label: t("database.weapon"), source: weaponData, path: "/db/weapon" },
        { kind: "mod", label: t("database.mod"), source: modData, path: "/db/mod" },
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
                path: def.path,
                version: String(DNA_SAFE_VERSION_LIMIT),
                entries: items.map(item => ({ kind: def.kind, item })) as DBLatestItem[],
            },
        ]
    })
})

/**
 * 本期新增的行内布局：每个模块按自身条目数占格，先到先得，剩余格子留给后面的模块。
 * 例：共 8 格时，角色 2 格 + 武器 3 格 + 魔之楔 3 格，而不是各占 4 格留空位。
 */
const latestRowGroups = computed(() => {
    // 窄屏：各模块独占一行（会换行），卡片内部保持固定列数，由容器内部滚动承载
    if (!isWideLatestRow.value) {
        return latestGroups.value.map(group => ({ ...group, span: 1, cardColumns: LATEST_STACK_COLUMNS }))
    }

    const groups = latestGroups.value
    let remaining = LATEST_ROW_COLUMNS

    return groups.map((group, index) => {
        // 先给后面的模块留出最低格数，避免前面的模块把整行吃光
        const reserved = (groups.length - index - 1) * LATEST_ROW_MIN_SPAN
        const available = Math.max(remaining - reserved, 1)
        const span = Math.max(Math.min(group.entries.length, available), 1)
        remaining = Math.max(remaining - span, 0)

        return { ...group, span, cardColumns: span }
    })
})

/** 本期新增容器的总格数：窄屏退化为单列，各模块纵向堆叠 */
const latestRowColumns = computed(() => (isWideLatestRow.value ? LATEST_ROW_COLUMNS : 1))

/** 当前展开中的“本期新增”分组：展开态由该分组独占整行，同一时刻最多一个 */
const expandedLatestKind = ref<string | null>(null)

/**
 * 行内布局最终结果：展开中的分组独占整行，其余分组维持按条目数分好的格数。
 * 展开态同时把分组内部网格列数放大到整行格数，超出上限的卡片自然换到下一行。
 * 展开的分组会被排到首位：三组都从同一行起排，所以它的位置原地不动（只是横向铺满），
 * 不会因为换行下移而脱离鼠标，从而避免“展开→离开→收起→再展开”的抖动。
 */
const latestRowLayout = computed(() => {
    const groups = latestRowGroups.value

    if (!expandedLatestKind.value) {
        return groups
    }

    const expandedGroup = groups.find(group => group.kind === expandedLatestKind.value)

    if (!expandedGroup) {
        return groups
    }

    return [
        {
            ...expandedGroup,
            span: latestRowColumns.value,
            // 窄屏容器的总格数是 1，展开时不能拿它当列数（会退化成每行一张卡），取两者较大值
            cardColumns: Math.max(latestRowColumns.value, LATEST_STACK_COLUMNS),
        },
        ...groups.filter(group => group.kind !== expandedLatestKind.value),
    ]
})

/**
 * 同步分组的展开状态：展开时让本分组独占整行，收起时释放。
 * @param kind 分组标识
 * @param expanded 是否展开
 */
function handleLatestExpandedChange(kind: string, expanded: boolean) {
    if (expanded) {
        expandedLatestKind.value = kind
        return
    }

    if (expandedLatestKind.value === kind) {
        expandedLatestKind.value = null
    }
}

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

/**
 * 提交提问：交给资料检索 Agent，并把界面切到对话态。
 * @param query 输入框内容
 */
function handleSubmit(query: string) {
    const text = query.trim()

    if (!text || chatBusy.value) {
        return
    }

    chatMode.value = true
    searchKeyword.value = ""
    void sendChat(text)
}

/**
 * 新建对话。
 */
function handleNewChat() {
    chatMode.value = true
    void startNewConversation()
}

/**
 * 切换到历史对话。
 * @param conversation 目标会话
 */
function handleSelectConversation(conversation: Conversation) {
    chatMode.value = true
    void selectConversation(conversation)
}

/**
 * 删除对话（先确认，避免误删历史检索记录）。
 * @param conversation 目标会话
 */
async function handleRemoveConversation(conversation: Conversation) {
    const confirmed = await ui.showDialog("删除对话", `确定删除「${conversation.name}」？该对话的消息记录会一并删除。`)

    if (confirmed) {
        await removeConversation(conversation)
    }
}

/**
 * 退出对话，回到资料库浏览态。
 */
function handleExitChat() {
    if (chatBusy.value) {
        return
    }

    chatMode.value = false
    searchKeyword.value = ""
}

/**
 * 订阅媒体查询（兼容新旧 MediaQueryList API），并立即回调一次当前状态。
 * @param mediaQuery 媒体查询字符串
 * @param handler 状态回调
 * @returns 取消订阅函数
 */
function bindMediaQuery(mediaQuery: string, handler: (matches: boolean) => void) {
    const query = window.matchMedia(mediaQuery)
    handler(query.matches)

    const handleMediaChange = (event: MediaQueryListEvent) => {
        handler(event.matches)
    }

    if (typeof query.addEventListener === "function") {
        query.addEventListener("change", handleMediaChange)
    } else {
        query.addListener(handleMediaChange)
    }

    return () => {
        if (typeof query.removeEventListener === "function") {
            query.removeEventListener("change", handleMediaChange)
        } else {
            query.removeListener(handleMediaChange)
        }
    }
}

const unbindMediaQueries: Array<() => void> = []

onMounted(() => {
    unbindMediaQueries.push(
        bindMediaQuery(`(min-width: ${LATEST_STACK_WIDTH}px)`, matches => {
            isWideLatestRow.value = matches
        })
    )
})

onBeforeUnmount(() => {
    unbindMediaQueries.forEach(unbind => unbind())
    unbindMediaQueries.length = 0
})
</script>

<template>
    <!-- 页面整屏不滚动，也不画背景与分隔线：上段 / 中段（输入框）/ 下段各自管理内部滚动 -->
    <div class="flex h-full min-h-0">
        <!-- 左栏：对话记录，仅在进入对话（提交提问）后出现，贯穿整页高度（窄屏隐藏，避免挤压输入区） -->
        <div v-if="chatMode" class="db-rise hidden h-full shrink-0 pt-6 pl-4 md:flex md:pl-6 lg:pl-8">
            <DBConversationList
                :conversations="chatConversations"
                :active-id="activeConversationId"
                :busy="chatBusy"
                @new-chat="handleNewChat"
                @select="handleSelectConversation"
                @remove="handleRemoveConversation"
                @exit="handleExitChat"
            />
        </div>

        <div class="flex min-w-0 flex-1 flex-col">
            <!-- 上段：内容贴住输入框（靠下显示），超出时内部滚动 -->
            <section class="flex min-h-0 flex-1 flex-col">
                <!-- 对话态：消息流 -->
                <DBChatMessages
                    v-if="chatMode"
                    :messages="chatMessages"
                    :busy="chatBusy"
                    :reasoning="liveReasoning"
                    class="px-4 md:px-6 lg:px-8"
                />

                <!-- 输入态（未进入对话）：本地检索结果，贴住输入框 -->
                <div v-else-if="isComposing" class="db-scroll min-h-0 flex-1 overflow-y-auto">
                    <div class="flex min-h-full flex-col justify-end">
                        <div class="mx-auto w-full max-w-7xl px-4 pb-4 md:px-6 lg:px-8">
                            <div class="db-ask-panel">
                                <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-1 pb-2">
                                    <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-base-content/45">Search Results</p>
                                    <p class="text-xs text-base-content/45">{{ searchStatusText }}</p>
                                </div>

                                <!-- 命中结果 -->
                                <ul v-if="visibleSearchOptions.length" class="db-scroll max-h-[min(40vh,18rem)] overflow-y-auto">
                                    <li v-for="option in visibleSearchOptions" :key="option.id">
                                        <button
                                            type="button"
                                            class="db-ask-result cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                                            @click="handleSelectSearchOption(option)"
                                        >
                                            <span class="min-w-0 flex-1">
                                                <span class="block truncate text-sm font-medium">{{ option.title }}</span>
                                                <span v-if="option.subtitle" class="mt-0.5 block truncate text-xs text-base-content/55">
                                                    {{ option.subtitle }}
                                                </span>
                                            </span>
                                            <span class="db-ask-result-path">{{ getItemPathLabel(option.path) }}</span>
                                            <span
                                                class="shrink-0 border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/55"
                                            >
                                                {{ option.typeLabel }}
                                            </span>
                                        </button>
                                    </li>
                                </ul>

                                <p v-else class="px-1 py-4 text-sm text-base-content/55">
                                    {{ $t("view.noResultEntries") }}
                                    <span class="mt-1.5 block text-xs text-base-content/40">Enter 转交资料检索 · Shift + Enter 换行</span>
                                </p>

                                <p v-if="hiddenResultCount" class="db-ask-more">还有 {{ hiddenResultCount }} 条，继续输入可缩小范围</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 浏览态：全部模块平铺小卡片（推荐模块排在最前） -->
                <div v-else class="db-scroll min-h-0 flex-1 overflow-y-auto">
                    <div class="flex min-h-full flex-col justify-end">
                        <div class="db-rise mx-auto w-full max-w-7xl px-4 pb-4 pt-6 md:px-6 lg:px-8">
                            <ul class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
                                <li v-for="item in moduleCards" :key="item.path">
                                    <button
                                        type="button"
                                        class="group flex w-full cursor-pointer items-center gap-2.5 border border-base-content/12 px-3 py-2.5 text-left text-sm text-base-content/80 transition-all duration-200 hover:-translate-y-px hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]"
                                        @click="navigateTo(item.path)"
                                    >
                                        <Icon
                                            :icon="item.icon"
                                            class="h-4.5 w-4.5 shrink-0 text-base-content/45 transition-colors duration-200 group-hover:text-primary"
                                        />
                                        <span class="min-w-0 flex-1 truncate">{{ $t(item.name) }}</span>
                                        <Icon
                                            icon="ri:arrow-right-line"
                                            class="h-3.5 w-3.5 shrink-0 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                                        />
                                    </button>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 中段：输入框（flex-none，始终位于页面正中） -->
            <section class="shrink-0 px-4 py-5 md:px-6 lg:px-8">
                <div class="mx-auto w-full max-w-7xl">
                    <DBAskBox
                        v-model="searchKeyword"
                        :busy="chatBusy"
                        placeholder="今天想查点什么？输入关键词检索资料库，或直接向 AI 提问"
                        hint="Enter 转交资料检索 · Shift + Enter 换行"
                        submit-label="转交资料检索"
                        @submit="handleSubmit"
                        @stop="interruptChat"
                    />
                </div>
            </section>

            <!-- 下段：内容贴住页面底部（靠下显示） -->
            <section class="flex min-h-0 flex-1 flex-col">
                <!-- 输入态 / 对话态：检索范围（单行不换行） -->
                <div v-if="showScopeChips" class="db-scroll min-h-0 flex-1 overflow-y-auto">
                    <div class="flex min-h-full flex-col justify-end">
                        <div class="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 pb-5 pt-3 md:px-6 lg:px-8">
                            <!-- 窄屏隐藏会话侧栏，这里保留退出对话的入口 -->
                            <button
                                v-if="chatMode"
                                type="button"
                                class="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-base-content/45 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
                                title="返回资料库"
                                @click="handleExitChat"
                            >
                                <Icon icon="ri:arrow-left-line" class="h-3.5 w-3.5" />
                                资料库
                            </button>

                            <p class="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.28em] text-base-content/40 sm:block">
                                Modules
                            </p>
                            <div class="db-chip-row flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
                                <button
                                    v-for="chip in moduleChips"
                                    :key="chip.id"
                                    type="button"
                                    class="shrink-0 cursor-pointer border px-3 py-1.5 text-xs transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
                                    :class="
                                        isSearchScopeSelected(chip.id)
                                            ? 'border-primary bg-primary font-semibold text-primary-content'
                                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                    "
                                    @click="toggleSearchScope(chip.id)"
                                >
                                    {{ chip.label }}
                                    <span class="ml-1.5 font-mono text-[10px] tabular-nums opacity-60">{{ chip.count }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 浏览态：本期新增（展开时高度在段内撑开，不影响输入框位置） -->
                <div v-else class="db-scroll db-latest-scroll min-h-0 flex-1 overflow-y-auto">
                    <div class="flex min-h-full flex-col justify-end">
                        <div class="db-rise mx-auto w-full max-w-7xl px-4 pb-5 pt-4 md:px-6 lg:px-8">
                            <div
                                class="grid gap-x-6 gap-y-5"
                                :style="{ gridTemplateColumns: `repeat(${latestRowColumns}, minmax(0, 1fr))` }"
                            >
                                <div v-for="group in latestRowLayout" :key="group.kind" :style="{ gridColumn: `span ${group.span}` }">
                                    <DBLatestGroup
                                        :label="group.label"
                                        :version="group.version"
                                        :entries="group.entries"
                                        :columns="group.cardColumns"
                                        @expanded-change="handleLatestExpandedChange(group.kind, $event)"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>
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

/* 结果区：无底色、无外框，仅用留白与 hairline 区分条目 */
.db-ask-panel {
    border-top: 1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent);
}

/* 结果条目：名称 + 路径 + 类型徽章，与目录条目同构 */
.db-ask-result {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.6rem 0.25rem;
    text-align: left;
    border-bottom: 1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent);
    transition: background-color 0.2s ease;
}

.db-ask-result:last-child {
    border-bottom: 0;
}

.db-ask-result:hover {
    background-color: color-mix(in srgb, var(--color-base-content) 5%, transparent);
}

.db-ask-result-path {
    flex-shrink: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.625rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--color-base-content) 35%, transparent);
    transition: color 0.2s ease;
}

.db-ask-result:hover .db-ask-result-path {
    color: color-mix(in srgb, var(--color-primary) 70%, transparent);
}

/* 结果截断提示：等宽小号大写 */
.db-ask-more {
    border-top: 1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent);
    padding: 0.5rem 0.25rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.625rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--color-base-content) 40%, transparent);
}

/* 单行模块条：横向滚动不换行，隐藏滚动条保持杂志式排布 */
.db-chip-row {
    scrollbar-width: none;
}

.db-chip-row::-webkit-scrollbar {
    display: none;
}

/* 段内滚动容器：细滚动条，贴近应用内 ScrollArea 的观感 */
.db-scroll,
.db-latest-scroll {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--color-base-content) 25%, transparent) transparent;
}

.db-scroll::-webkit-scrollbar,
.db-latest-scroll::-webkit-scrollbar {
    width: 8px;
}

.db-scroll::-webkit-scrollbar-thumb,
.db-latest-scroll::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--color-base-content) 22%, transparent);
}

.db-scroll::-webkit-scrollbar-track,
.db-latest-scroll::-webkit-scrollbar-track {
    background: transparent;
}

/* 减少动态偏好：关闭入场动画 */
@media (prefers-reduced-motion: reduce) {
    .db-rise {
        animation: none;
    }
}
</style>
