<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import { type DBLatestItem } from "@/components/DBLatestItemCard.vue"
import { useDBChat } from "@/composables/useDBChat"
import { useSearchParam } from "@/composables/useSearchParam"
import charData from "@/data/d/char.data"
import modData from "@/data/d/mod.data"
import weaponData from "@/data/d/weapon.data"
import { DNA_SAFE_VERSION_LIMIT } from "@/data/versionGate"
import type { Conversation } from "@/store/db"
import { useUIStore } from "@/store/ui"
import { copyText } from "@/util"
import type { AskUserResponse } from "@/utils/db-ask-user"
import { type DBGlobalSearchOption, getGlobalSearchService, warmUpGlobalSearchService } from "@/utils/global-search"

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
/** 参与检索的关键词：输入停顿后才同步，避免逐字触发全库模糊检索 */
const debouncedKeyword = ref("")
/** 检索防抖延迟（ms）：取值需同时满足「打字时不卡」与「停顿后尽快出结果」 */
const SEARCH_DEBOUNCE_MS = 150
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 取消尚未触发的检索防抖任务。
 */
function cancelSearchDebounce() {
    if (searchDebounceTimer !== null) {
        clearTimeout(searchDebounceTimer)
        searchDebounceTimer = null
    }
}

/**
 * 输入变化时重置防抖计时器：连续输入期间不做检索，停顿后一次性同步关键词。
 */
watch(searchKeyword, () => {
    cancelSearchDebounce()
    searchDebounceTimer = setTimeout(() => {
        searchDebounceTimer = null
        debouncedKeyword.value = searchKeyword.value
    }, SEARCH_DEBOUNCE_MS)
})

/** 对话模式：进入后上段展示消息流、左栏展示会话记录，直到用户返回资料库 */
const chatMode = ref(false)
/** “本期新增”是否处于宽屏单行布局 */
const isWideLatestRow = ref(true)

/**
 * 对话模式在 URL 中的标记（`?chat=1`）。
 *
 * 与 `chatSessionId` 一起构成对话态的完整 URL 状态：跳转到资料详情页后
 * 「浏览器后退」回到的是同一个 URL，组件据此恢复到原来的对话，
 * 而不是退回资料库浏览态。
 */
const chatModeParam = useSearchParam<boolean>("dbchat", false, {
    // 序列化刻意写成 `1` / 缺省：useSearchParam 对布尔默认走 String(value)，
    // 会产出 `dbchat=true` 这种冗长写法
    serialize: value => (value ? "1" : undefined),
})

/**
 * 当前对话会话 id 的 URL 同步。
 *
 * `0` 表示尚未建立会话（新对话），作为默认值会被自动从 URL 中移除。
 * 会话 id 在首条提问落库后才确定，由下面的 watch 写回。
 */
const chatSessionId = useSearchParam<number>("chat", 0)

/**
 * 资料库对话状态（会话列表 + 消息流 + 资料检索 Agent）。
 * 这里解构使用，便于模板直接读写（会话与消息持久化在 Dexie）。
 */
const {
    conversations: chatConversations,
    isConversationLoading,
    activeConversationId,
    messages: chatMessages,
    isBusy: chatBusy,
    liveReasoning,
    pendingAsk: chatPendingAsk,
    startNewConversation,
    selectConversation,
    removeConversation,
    exportConversationText,
    send: sendChat,
    answerAsk: answerChatAsk,
    skipAsk: skipChatAsk,
    interrupt: interruptChat,
} = useDBChat()

/** 是否处于输入态：输入非空即进入提问/检索态 */
const isComposing = computed(() => searchKeyword.value.trim().length > 0)
/** 模块过滤条是否展示：仅在浏览模块列表时展示（对话态与输入态都不需要） */
const showModuleFilter = computed(() => !chatMode.value && !isComposing.value)

/**
 * 会话恢复守卫：URL 里的会话 id 只在恢复后生效，
 * 避免「会话列表还没加载完就先建一个新会话」这类时序问题。
 */
const isConversationRestoring = ref(false)

/**
 * 标记 URL 中的会话已失效（被删除，或详情尚未加载完成）。
 *
 * 只清 URL、不清 chatMode：本次会话仍要继续，用户不该被踢回资料库。
 */
function clearSessionParam() {
    isConversationRestoring.value = true
    chatSessionId.value = 0
    void nextTick(() => {
        isConversationRestoring.value = false
    })
}

/**
 * 依据 URL 恢复对话态：`?dbchat=1` 决定是否进入对话模式，
 * `?chat=<id>` 决定展示哪个会话。
 *
 * 在会话列表加载完成后调用一次即可——组件重新挂载（后退/刷新）时
 * Dexie 里已有全部会话，直接查表切换，回到的就是用户离开前那条对话。
 */
async function restoreChatFromUrl() {
    if (!chatModeParam.value) {
        return
    }

    chatMode.value = true

    const targetId = chatSessionId.value

    if (!targetId) {
        return
    }

    const conversation = chatConversations.value.find(item => item.id === targetId)

    if (!conversation) {
        clearSessionParam()
        return
    }

    isConversationRestoring.value = true
    try {
        await selectConversation(conversation)
    } finally {
        isConversationRestoring.value = false
    }
}

/**
 * URL 状态 → 组件状态：`dbchat` 被外部改动（前进/后退）时同步对话模式。
 *
 * 从「对话态」后退到「浏览态」时，浏览器恢复的是更早的那条历史记录，
 * 此时 `dbchat` 会变回 false，这里把 chatMode 一并退回。
 */
watch(chatModeParam, value => {
    if (!value && chatMode.value) {
        chatMode.value = false
        resetSearchKeyword()
        return
    }

    if (value) {
        void restoreChatFromUrl()
    }
})

/**
 * 组件状态 → URL 状态：切换会话时把 id 写进 query。
 *
 * 会话在首条提问后才真正落库（`activeConversationId` 由 0 变为新 id），
 * 因此新建对话时也会在这里被自动带上，无需在 send 里额外处理。
 * 恢复过程中（`isConversationRestoring`）跳过，避免把 URL 又改回去。
 */
watch(activeConversationId, id => {
    if (isConversationRestoring.value) {
        return
    }

    chatSessionId.value = id
})

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
    { name: "database.mapLocal", path: "/map-tool", desc: "database.mapLocal_desc", icon: "ri:focus-3-line" },
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

/**
 * 全库检索索引是否已就绪。
 *
 * 索引构建集中在全库条目的拼音预计算上，是同步 CPU 开销；
 * 若放在组件初始化阶段会把首帧一起拖住，因此改由空闲期预热，
 * 就绪前检索结果区展示占位而不是「无结果」。
 */
const isSearchIndexReady = ref(false)

/** 推荐模块：平铺时排在最前 */
const featuredPaths = ["/db/char", "/db/weapon", "/db/mod", "/map-tool", "/db/questchain", "/db/dungeon", "/db/resource"]

/** 分区静态结构：只有 id 与路径，文案由 databaseSectionConfigs 按当前语言实时翻译 */
const databaseSectionMeta = [
    { id: "build", paths: ["/db/char", "/db/weapon", "/db/mod", "/db/forge", "/db/damage", "/db/pet", "/db/draft", "/db/resource"] },
    { id: "explore", paths: ["/db/event", "/map-tool", "/db/rouge", "/db/fish", "/db/dungeon", "/db/abyss", "/db/map"] },
    { id: "world", paths: ["/db/questchain", "/db/partytopic", "/db/shop", "/db/impr", "/db/npc", "/db/reputation", "/db/dynquest"] },
    { id: "challenge", paths: ["/db/rank", "/db/monster", "/db/hardboss", "/db/solotreasure", "/db/iron-ticket"] },
    { id: "collect", paths: ["/db/achievement", "/db/title", "/db/music", "/db/book", "/db/walnut", "/db/accessory"] },
] as const

/**
 * 分区配置（响应式）：title/description/badge 走 t()，i18next-vue 的 t 在 computed 内
 * 会追踪语言变化，切换语言时无需刷新页面即可更新。
 */
const databaseSectionConfigs = computed<DatabaseSectionConfig[]>(() => {
    return databaseSectionMeta.map(section => ({
        id: section.id,
        title: t(`view.section.${section.id}.title`),
        description: t(`view.section.${section.id}.description`),
        badge: t(`view.section.${section.id}.badge`),
        paths: [...section.paths],
    }))
})

const databaseItemMap = new Map<string, DatabaseItem>(databaseItems.map(item => [item.path, item]))

const selectedSearchSectionIds = ref<string[]>(databaseSectionMeta.map(section => section.id))

/**
 * 平铺的模块卡片顺序：推荐模块在前，其余保持原有顺序。
 * 再按选中的分区做**实时过滤**（过滤条就在列表顶部，改选立刻生效）。
 */
const moduleCards = computed<DatabaseItem[]>(() => {
    const featuredSet = new Set(featuredPaths)
    const featured = featuredPaths.map(path => databaseItemMap.get(path)).filter((item): item is DatabaseItem => item !== undefined)
    const ordered = [...featured, ...databaseItems.filter(item => !featuredSet.has(item.path))]

    if (!selectedSearchPaths.value) {
        return ordered
    }

    return ordered.filter(item => selectedSearchPaths.value?.has(item.path))
})

/**
 * 当前过滤命中的模块数量提示：过滤条右上角展示，让用户知道筛掉了多少。
 */
const moduleFilterStatus = computed(() => {
    if (isAllSearchSectionsSelected.value) {
        return t("view.allModules")
    }

    return t("view.moduleCount", { count: selectedSearchSectionIds.value.length })
})

const searchScopeOptions = computed<SearchScopeOption[]>(() => {
    return [
        { id: "all", label: t("view.all") },
        ...databaseSectionConfigs.value.map(section => ({
            id: section.id,
            label: section.title,
        })),
    ]
})

const isAllSearchSectionsSelected = computed(() => {
    return selectedSearchSectionIds.value.length === databaseSectionConfigs.value.length
})

const selectedSearchPaths = computed(() => {
    if (isAllSearchSectionsSelected.value) {
        return null
    }

    const pathSet = new Set<string>()

    for (const section of databaseSectionConfigs.value) {
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
 * 使用防抖后的关键词：输入过程中不触发全库模糊检索。
 * 索引尚未预热完成时返回空列表，由结果区展示占位。
 */
const searchOptions = computed<DBGlobalSearchOption[]>(() => {
    if (!isSearchIndexReady.value) {
        return []
    }

    const options = getGlobalSearchService().search(debouncedKeyword.value)

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
 * 索引未就绪时只标注检索范围，不给出命中数或「无结果」，避免误报。
 */
const searchStatusText = computed(() => {
    const searchScopeText = isAllSearchSectionsSelected.value
        ? t("view.allModules")
        : t("view.moduleCount", { count: selectedSearchSectionIds.value.length })

    if (!isSearchIndexReady.value || !debouncedKeyword.value.trim()) {
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
                : (databaseSectionConfigs.value.find(section => section.id === scope.id)?.paths.length ?? 0),
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
    selectedSearchSectionIds.value = databaseSectionConfigs.value.map(section => section.id)
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
        selectedSearchSectionIds.value = nextSectionIds.length ? nextSectionIds : databaseSectionConfigs.value.map(section => section.id)
        return
    }

    selectedSearchSectionIds.value = [...selectedSearchSectionIds.value, scopeId]
}

/**
 * 清空输入并同步检索关键词，避免防抖延迟导致结果面板残留上一次的命中。
 */
function resetSearchKeyword() {
    cancelSearchDebounce()
    searchKeyword.value = ""
    debouncedKeyword.value = ""
}

/**
 * 选择搜索候选并跳转，同时重置输入内容。
 * @param option 选中的搜索候选项
 */
function handleSelectSearchOption(option: DBGlobalSearchOption) {
    resetSearchKeyword()
    navigateTo(option.path)
}

/**
 * 提交提问：交给资料检索 Agent，并把界面切到对话态。
 *
 * 有挂起提问时不发新提问——交给输入框的文案去回答那道题（由 useDBChat 路由）。
 * @param query 输入框内容
 */
function handleSubmit(query: string) {
    const text = query.trim()

    if (!text || chatBusy.value) {
        return
    }

    enterChatMode()
    resetSearchKeyword()
    void sendChat(text)
}

/**
 * 回答资料检索 Agent 的提问并继续检索。
 * @param response 用户回答
 */
function handleAnswerAsk(response: AskUserResponse) {
    if (chatBusy.value) {
        return
    }

    void answerChatAsk(response)
}

/**
 * 跳过 Agent 的提问，让它基于已有信息继续。
 */
function handleSkipAsk() {
    if (chatBusy.value) {
        return
    }

    void skipChatAsk()
}

/**
 * 进入对话模式（幂等）：同步 `chatMode` 与 URL 上的 `dbchat` 标记。
 *
 * 单独抽出来的原因是「提交提问」与「空输入点击发送按钮」都要走这一步，
 * 而 URL 写入必须与 chatMode 一起，否则后退时会落回浏览态。
 */
function enterChatMode() {
    chatMode.value = true
    chatModeParam.value = true
}

/**
 * 新建对话。
 */
function handleNewChat() {
    enterChatMode()
    // 新对话尚未落库，URL 里先不带 chat 参数（send 建立会话后由 watch 自动写回）
    isConversationRestoring.value = true
    chatSessionId.value = 0
    void nextTick(() => {
        isConversationRestoring.value = false
    })
    void startNewConversation()
}

/**
 * 切换到历史对话。
 * @param conversation 目标会话
 */
function handleSelectConversation(conversation: Conversation) {
    enterChatMode()
    void selectConversation(conversation)
}

/**
 * 删除对话（先确认，避免误删历史检索记录）。
 * @param conversation 目标会话
 */
async function handleRemoveConversation(conversation: Conversation) {
    const confirmed = await ui.showDialog(
        t("dbAgent.ui.dialogDeleteTitle"),
        t("dbAgent.ui.dialogDeleteBody", { name: conversation.name })
    )

    if (confirmed) {
        await removeConversation(conversation)
    }
}

/**
 * 复制整个对话的纯文本内容。
 * @param conversation 目标会话
 */
async function handleCopyConversation(conversation: Conversation) {
    try {
        const text = await exportConversationText(conversation)

        if (!text) {
            ui.showErrorMessage(t("dbAgent.ui.copyEmpty"))
            return
        }

        await copyText(text)
        ui.showSuccessMessage(t("dbAgent.ui.copySuccess"))
    } catch (error) {
        ui.showErrorMessage(t("dbAgent.ui.copyConversationFailed"), error instanceof Error ? error.message : "")
    }
}

/**
 * 空输入时点击发送按钮：进入对话模式。
 *
 * 对话模式本身不消耗额度（只是打开界面、列出历史会话），所以不拦未登录用户；
 * 真正的拦截在首次提问时由 useDBChat 给出「请先登录」的提示。
 */
function handleEnterChat() {
    if (chatBusy.value) {
        return
    }

    enterChatMode()
    resetSearchKeyword()
}

/**
 * 退出对话，回到资料库浏览态，并清掉 URL 上的对话标记。
 */
function handleExitChat() {
    if (chatBusy.value) {
        return
    }

    chatMode.value = false
    chatModeParam.value = false
    isConversationRestoring.value = true
    chatSessionId.value = 0
    void nextTick(() => {
        isConversationRestoring.value = false
    })
    resetSearchKeyword()
}

/**
 * 等待条件成立（带超时兜底）。
 *
 * 会话列表从 Dexie 异步加载，页面挂载时可能还没落地；
 * 用轮询等它完成比在 composable 里暴露 Promise 更简单，
 * 且 50ms 的间隔对本地 IndexedDB 足够（实际通常一轮就命中）。
 * @param predicate 条件判定
 * @param timeoutMs 超时时间（ms），超时后也继续后续流程，避免卡住页面
 */
function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    return new Promise(resolve => {
        const startedAt = Date.now()

        const tick = () => {
            if (predicate() || Date.now() - startedAt > timeoutMs) {
                resolve()
                return
            }

            window.setTimeout(tick, 50)
        }

        tick()
    })
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

    // 空闲期预热全库检索索引：模块网格与「本期新增」都不依赖它，
    // 放到首帧之后构建，用户开始输入时索引已就绪。
    void warmUpGlobalSearchService().then(() => {
        isSearchIndexReady.value = true
    })

    // URL 里带着对话标记时恢复对话态（浏览器后退 / 刷新回到原来的对话）。
    // 会话列表由 useDBChat 在创建时发起异步加载，这里等它落地再查表。
    void until(() => !isConversationLoading.value).then(() => restoreChatFromUrl())
})

onBeforeUnmount(() => {
    cancelSearchDebounce()
    unbindMediaQueries.forEach(unbind => unbind())
    unbindMediaQueries.length = 0
})
</script>

<template>
    <!--
      页面整屏不滚动，也不画背景与分隔线。布局分两种形态：
      - 对话态：两段式（消息区 flex-1 撑满 + 输入框贴底），对话内容自然沉底；
      - 浏览 / 输入态：三段式（上段内容 / 中段输入框恒居中 / 下段内容）。
    -->
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
                @copy="handleCopyConversation"
                @exit="handleExitChat"
            />
        </div>

        <div class="flex min-w-0 flex-1 flex-col">
            <!--
              对话态：两段式。消息区 flex-1 吃掉整屏高度（内容贴底），输入框固定在底部。
              上半部分不再保留空白的消息区——消息区本身就是滚动容器，
              内容少时靠 justify-end 贴住输入框，内容多时向上滚动。
            -->
            <template v-if="chatMode">
                <DBChatMessages
                    :messages="chatMessages"
                    :busy="chatBusy"
                    :reasoning="liveReasoning"
                    :pending-ask="chatPendingAsk"
                    class="px-4 md:px-6 lg:px-8"
                    @answer="handleAnswerAsk"
                    @skip="handleSkipAsk"
                />

                <!-- 窄屏隐藏会话侧栏，这里保留退出对话的入口 -->
                <div class="mx-auto flex w-full max-w-7xl shrink-0 items-center gap-3 px-4 pt-2 md:hidden md:px-6 lg:px-8">
                    <button
                        type="button"
                        class="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-base-content/45 transition-colors duration-200 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        :title="$t('dbAgent.ui.backToDatabase')"
                        @click="handleExitChat"
                    >
                        <Icon icon="ri:arrow-left-line" class="h-3.5 w-3.5" />
                        {{ $t("dbAgent.ui.database") }}
                    </button>
                </div>

                <!-- 输入框贴底：对话态下不再位于页面正中 -->
                <section class="shrink-0 px-4 pt-3 pb-5 md:px-6 lg:px-8">
                    <div class="mx-auto w-full max-w-7xl">
                        <DBAskBox
                            v-model="searchKeyword"
                            :busy="chatBusy"
                            :placeholder="chatPendingAsk ? $t('dbAgent.ui.chatPlaceholderAnswer') : $t('dbAgent.ui.chatPlaceholderIdle')"
                            :hint="$t('dbAgent.ui.chatHint')"
                            :submit-label="$t('dbAgent.ui.chatSubmit')"
                            @submit="handleSubmit"
                            @stop="interruptChat"
                        />
                    </div>
                </section>
            </template>

            <!-- 浏览 / 输入态：保持三段式，中段输入框恒居中 -->
            <template v-else>
                <!-- 上段：内容贴住输入框（靠下显示），超出时内部滚动 -->
                <section class="flex min-h-0 flex-1 flex-col">
                    <!-- 输入态：本地检索结果，贴住输入框 -->
                    <ScrollArea v-if="isComposing" class="min-h-0 flex-1">
                        <div class="flex min-h-full flex-col justify-end">
                            <div class="mx-auto w-full max-w-7xl px-4 pb-4 md:px-6 lg:px-8">
                                <div class="db-ask-panel">
                                    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-1 pb-2">
                                        <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-base-content/45">Search Results</p>
                                        <p class="text-xs text-base-content/45">{{ searchStatusText }}</p>
                                    </div>

                                    <!-- 索引预热中：只占位，不提前给出「无结果」 -->
                                    <ul v-if="!isSearchIndexReady" class="db-scroll max-h-[min(40vh,18rem)] overflow-y-auto">
                                        <li v-for="index in 3" :key="index" class="db-ask-result">
                                            <span class="min-w-0 flex-1">
                                                <span class="db-skeleton-bar block h-3.5 w-40" />
                                                <span class="db-skeleton-bar mt-1.5 block h-2.5 w-24" />
                                            </span>
                                        </li>
                                    </ul>

                                    <!-- 命中结果 -->
                                    <ul v-else-if="visibleSearchOptions.length" class="db-scroll max-h-[min(40vh,18rem)] overflow-y-auto">
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
                                        <span class="mt-1.5 block text-xs text-base-content/40">{{ $t("dbAgent.ui.browseHint") }}</span>
                                    </p>

                                    <p v-if="hiddenResultCount" class="db-ask-more">{{ $t("dbAgent.ui.browseMoreResults", { count: hiddenResultCount }) }}</p>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>

                    <!-- 浏览态：模块分类过滤条 + 模块卡片网格（过滤条在列表顶部，实时过滤） -->
                    <ScrollArea v-else class="min-h-0 flex-1">
                        <div class="flex min-h-full flex-col justify-end">
                            <div class="db-rise mx-auto w-full max-w-7xl px-4 pt-6 pb-4 md:px-6 lg:px-8">
                                <!-- 模块分类过滤条：改选立刻过滤下方模块列表 -->
                                <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                                    <p class="shrink-0 font-mono text-[10px] uppercase tracking-[0.28em] text-base-content/40">Modules</p>
                                    <div class="db-chip-row flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
                                    <p class="shrink-0 text-[11px] text-base-content/40">{{ moduleFilterStatus }}</p>
                                </div>

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

                                <!-- 过滤后没有命中任何模块时给出提示 -->
                                <p v-if="!moduleCards.length" class="px-1 py-4 text-sm text-base-content/55">
                                    {{ $t("view.noResultEntries") }}
                                </p>
                            </div>
                        </div>
                    </ScrollArea>
                </section>

                <!-- 中段：输入框（flex-none，始终位于页面正中） -->
                <section class="shrink-0 px-4 py-5 md:px-6 lg:px-8">
                    <div class="mx-auto w-full max-w-7xl">
                        <DBAskBox
                            v-model="searchKeyword"
                            :busy="chatBusy"
                            :placeholder="$t('dbAgent.ui.browsePlaceholder')"
                            :hint="$t('dbAgent.ui.browseHint')"
                            :submit-label="$t('dbAgent.ui.browseSubmit')"
                            @submit="handleSubmit"
                            @stop="interruptChat"
                            @enter-chat="handleEnterChat"
                        />
                    </div>
                </section>

                <!-- 下段：内容贴住页面底部（靠下显示） -->
                <section class="flex min-h-0 flex-1 flex-col">
                    <!-- 浏览态：本期新增（展开时高度在段内撑开，不影响输入框位置） -->
                    <ScrollArea v-if="showModuleFilter" class="min-h-0 flex-1">
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
                    </ScrollArea>

                    <!-- 输入态：留空（结果面板已经占据上段），保持输入框位置稳定 -->
                    <ScrollArea v-else class="min-h-0 flex-1" />
                </section>
            </template>
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
