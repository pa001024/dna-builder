<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { useRoute } from "vue-router"
import { useSearchParam } from "@/composables/useSearchParam"
import type { Shop, ShopItem as ShopItemType, ShopMainTab, ShopSubTab } from "@/data/d/shop.data"
import { type ShopItemSearchHit, searchShopData } from "@/utils/shop-search"

const props = defineProps<{
    shop: Shop
}>()
const { t } = useTranslation()
const route = useRoute()
const nowTimestamp = Math.floor(Date.now() / 1000)

// 定义带有子项的商品类型
interface ShopItemWithChildren extends ShopItemType {
    children?: ShopItemWithChildren[]
    diffState?: ShopItemDiffState
}

type ShopItemDiffState = "added" | "removed"

/**
 * 商店离散时间点视图模型。
 */
interface ShopTimePoint {
    timestamp: number
    label: string
    shortLabel: string
    activeCount: number
    isCurrent: boolean
}

/**
 * 经过时间过滤后的子标签视图模型。
 */
interface FilteredShopSubTab extends ShopSubTab {
    visibleItems: ShopItemWithChildren[]
    activeVisibleItemCount: number
    changedItemCount: number
}

/**
 * 经过时间过滤后的主标签视图模型。
 */
interface FilteredShopMainTab extends Omit<ShopMainTab, "subTabs"> {
    subTabs: FilteredShopSubTab[]
}

/**
 * 商店主标签展示项。
 */
const shopTabs = computed(() => props.shop.mainTabs.map(tab => ({ label: t(tab.name), value: tab.name })))
const selectedShop = useSearchParam("tab", props.shop.mainTabs[0].name || "")
const timeFilterEnabled = useSearchParam("tf", true)
const selectedTimePointIndex = useSearchParam("ti", 0)
const diffOnlyEnabled = useSearchParam("td", false)
const searchKeyword = useSearchParam<string>("kw", "")
const focusedItemId = useSearchParam<number>("item", 0)

/** 当前关键词（详情内用于高亮命中商品） */
const normalizedKeyword = computed(() => searchKeyword.value.trim())

/** 游戏原文里可能含 . 与 :，取译文时必须关掉键路径解析 */
const translateGameText = (text: string) => t(text, { keySeparator: false, nsSeparator: false })

/** 当前商店内命中关键词的商品，键为商品 ID */
const searchHitMap = computed<Map<number, ShopItemSearchHit>>(() => {
    if (!normalizedKeyword.value) {
        return new Map()
    }
    return searchShopData([props.shop], normalizedKeyword.value, translateGameText)[0]?.itemHits ?? new Map()
})

/** 正在闪烁定位的商品 ID */
const flashingItemId = ref(0)
let flashingTimer: ReturnType<typeof setTimeout> | null = null
/** 等待商品卡片渲染后滚动的 rAF 句柄与已重试帧数 */
let scrollFrame = 0
let scrollAttempts = 0
/** 等待商品卡片渲染的最大重试帧数（时间点切换需等路由写入完成） */
const SCROLL_MAX_ATTEMPTS = 40

/**
 * 触发商品卡片一次性闪烁高亮。
 * @param itemId 商品 ID
 */
function flashItem(itemId: number): void {
    if (flashingTimer) {
        clearTimeout(flashingTimer)
        flashingTimer = null
    }
    flashingItemId.value = 0
    nextTick(() => {
        flashingItemId.value = itemId
        flashingTimer = setTimeout(() => {
            flashingItemId.value = 0
            flashingTimer = null
        }, 1800)
    })
}

/**
 * 取消等待中的滚动。
 */
function cancelScrollToItem(): void {
    if (scrollFrame) {
        cancelAnimationFrame(scrollFrame)
        scrollFrame = 0
    }
}

/**
 * 逐帧等待商品卡片渲染完成后滚到可视区（时间点写入路由是异步的，卡片可能晚一两帧出现）。
 * @param itemId 商品 ID
 */
function scheduleScrollToItem(itemId: number): void {
    cancelScrollToItem()
    scrollAttempts = 0

    const attempt = () => {
        const element = document.getElementById(shopItemAnchorId(itemId))
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" })
            scrollFrame = 0
            return
        }
        if (scrollAttempts >= SCROLL_MAX_ATTEMPTS) {
            scrollFrame = 0
            return
        }
        scrollAttempts += 1
        scrollFrame = requestAnimationFrame(attempt)
    }
    scrollFrame = requestAnimationFrame(attempt)
}

/**
 * 商品卡片锚点 ID。
 * @param itemId 商品 ID
 * @returns 锚点 ID
 */
function shopItemAnchorId(itemId: number): string {
    return `shop-item-${itemId}`
}

onBeforeUnmount(() => {
    if (flashingTimer) {
        clearTimeout(flashingTimer)
        flashingTimer = null
    }
    cancelScrollToItem()
})

/**
 * 将路由中的子标签 ID 解析为数字。
 */
const routeSubTabId = computed(() => {
    const subTabParam = route.params.subTabId
    if (typeof subTabParam !== "string") {
        return 0
    }
    const parsedSubTabId = Number.parseInt(subTabParam, 10)
    return Number.isNaN(parsedSubTabId) ? 0 : parsedSubTabId
})

function subTabAnchorId(subTabId: number): string {
    return `shop-subtab-${subTabId}`
}

/**
 * 把路由子标签滚动到可视区（详情页 /db/shop/:shopId/:subTabId 深链定位用）。
 */
function scrollToRouteSubTab(): void {
    if (!routeSubTabId.value) {
        return
    }
    document.getElementById(subTabAnchorId(routeSubTabId.value))?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/**
 * 按路由子标签定位主标签，并把目标子标签滚动到可视区。
 */
function applyRouteSubTab(): void {
    if (!routeSubTabId.value) {
        return
    }

    const targetMainTab = props.shop.mainTabs.find(mainTab => mainTab.subTabs.some(subTab => subTab.id === routeSubTabId.value))
    if (targetMainTab) {
        selectedShop.value = targetMainTab.name
    }
    nextTick(() => scrollToRouteSubTab())
}

/**
 * 判断当前子标签是否为路由高亮目标。
 * @param subTabId 子标签 ID
 * @returns 是否高亮
 */
function isRouteSubTab(subTabId: number): boolean {
    return routeSubTabId.value !== 0 && subTabId === routeSubTabId.value
}

/**
 * 当前选中主标签。
 * @returns 当前选中的主标签；若无命中则返回首个主标签
 */
const selectedMainTab = computed(() => {
    return props.shop.mainTabs.find(mainTab => mainTab.name === selectedShop.value) ?? props.shop.mainTabs[0]
})

/**
 * 拉平当前选中主标签内的全部商品。
 * @returns 当前主标签的全部商品
 */
const selectedMainTabItems = computed(() => {
    return selectedMainTab.value?.subTabs.flatMap(subTab => subTab.items) ?? []
})

/**
 * 收集一组商品的离散时间边界点。
 * @param items 商品列表
 * @returns 按时间升序排列的离散时间戳
 */
function collectTimePointTimestamps(items: ShopItemType[]): number[] {
    return Array.from(
        new Set(
            items.flatMap(item => {
                const points: number[] = []
                if (typeof item.startTime === "number") {
                    points.push(item.startTime)
                }
                if (typeof item.endTime === "number") {
                    points.push(item.endTime)
                }
                return points
            })
        )
    ).sort((a, b) => a - b)
}

/**
 * 生成当前主标签全部离散时间边界点。
 * @returns 按时间升序排列的离散时间戳
 */
const shopTimeTimestamps = computed(() => collectTimePointTimestamps(selectedMainTabItems.value))

/**
 * 计算时间戳列表下默认应选中的当前时间点索引。
 * @param timestamps 离散时间戳列表
 * @returns 当前时间点索引
 */
function resolveCurrentTimePointIndex(timestamps: number[]): number {
    if (timestamps.length === 0) {
        return 0
    }

    const firstFutureIndex = timestamps.findIndex(timestamp => timestamp > nowTimestamp)
    if (firstFutureIndex === -1) {
        return timestamps.length - 1
    }
    if (firstFutureIndex === 0) {
        return 0
    }
    return firstFutureIndex - 1
}

/**
 * 计算默认应选中的当前时间点索引。
 * @returns 当前时间点索引
 */
const currentTimePointIndex = computed(() => resolveCurrentTimePointIndex(shopTimeTimestamps.value))

/**
 * 当前时间所在的离散时间点时间戳。
 * @returns 当前时间点时间戳
 */
const currentTimePointTimestamp = computed(() => {
    return shopTimeTimestamps.value[currentTimePointIndex.value] ?? null
})

/**
 * 生成当前商店全部离散时间点视图。
 * @returns 按时间升序排列的离散时间点
 */
const shopTimePoints = computed<ShopTimePoint[]>(() => {
    return shopTimeTimestamps.value.map(timestamp => ({
        timestamp,
        label: formatShopTime(timestamp),
        shortLabel: formatShopTimeShort(timestamp),
        activeCount: selectedMainTabItems.value.filter(item => isItemAvailableAtTime(item, timestamp)).length,
        isCurrent: timestamp === currentTimePointTimestamp.value,
    }))
})

/**
 * 当前选中的离散时间点。
 * @returns 当前选中的时间点
 */
const selectedTimePoint = computed(() => {
    if (shopTimePoints.value.length === 0) {
        return null
    }
    return shopTimePoints.value[selectedTimePointIndex.value] ?? shopTimePoints.value[currentTimePointIndex.value] ?? null
})

/**
 * 当前选中时间点的上一个离散时间点。
 * @returns 上一个时间点；不存在则返回 null
 */
const previousSelectedTimePoint = computed(() => {
    if (selectedTimePointIndex.value <= 0 || shopTimePoints.value.length === 0) {
        return null
    }
    return shopTimePoints.value[selectedTimePointIndex.value - 1] ?? null
})

/**
 * 当前时间过滤使用的时间戳。
 * @returns 生效中的时间戳；未启用时返回 null
 */
const activeFilterTimestamp = computed(() => {
    if (!timeFilterEnabled.value) {
        return null
    }
    return selectedTimePoint.value?.timestamp ?? null
})

/**
 * 生成当前商店在时间过滤后的主标签视图。
 * @returns 已附带可见商品列表的主标签
 */
const filteredMainTabs = computed<FilteredShopMainTab[]>(() => {
    return props.shop.mainTabs
        .map(mainTab => ({
            ...mainTab,
            subTabs: mainTab.subTabs
                .map(subTab => ({
                    ...subTab,
                    visibleItems: filterItemsByMode(
                        subTab.items,
                        activeFilterTimestamp.value,
                        previousSelectedTimePoint.value?.timestamp ?? null,
                        diffOnlyEnabled.value
                    ),
                    activeVisibleItemCount: countActiveItemsByTimestamp(subTab.items, activeFilterTimestamp.value),
                    changedItemCount: countChangedItemsByTimestamp(
                        subTab.items,
                        activeFilterTimestamp.value,
                        previousSelectedTimePoint.value?.timestamp ?? null
                    ),
                }))
                .filter(subTab => !diffOnlyEnabled.value || subTab.changedItemCount > 0),
        }))
        .filter(mainTab => mainTab.subTabs.length > 0)
})

/** 商品所属子标签 ID：用于高亮搜索命中的子标签分区 */
const focusedSubTabId = ref(0)
/** 待定位商品 ID：主标签重置时间点时优先落到该商品所属时间点 */
const pendingFocusItemId = ref(0)

/**
 * 定位商品所在的主标签 / 子标签。
 * @param itemId 商品 ID
 * @returns 主标签、子标签与商品；未找到时返回 null
 */
function locateItem(itemId: number): { mainTab: ShopMainTab; subTab: ShopSubTab; item: ShopItemType } | null {
    for (const mainTab of props.shop.mainTabs) {
        for (const subTab of mainTab.subTabs) {
            const item = subTab.items.find(candidate => candidate.id === itemId)
            if (item) {
                return { mainTab, subTab, item }
            }
        }
    }
    return null
}

/**
 * 计算商品所属的离散时间点索引：当前时间点可购买就保持当前，否则取最近的可购买时间点。
 * @param mainTab 商品所属主标签
 * @param item 商品
 * @returns 时间点索引
 */
function resolveItemTimePointIndex(mainTab: ShopMainTab, item: ShopItemType): number {
    const timestamps = collectTimePointTimestamps(mainTab.subTabs.flatMap(subTab => subTab.items))
    if (timestamps.length === 0) {
        return 0
    }

    const currentIndex = resolveCurrentTimePointIndex(timestamps)
    if (isItemAvailableAtTime(item, timestamps[currentIndex])) {
        return currentIndex
    }

    let nearestIndex = -1
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < timestamps.length; index++) {
        if (!isItemAvailableAtTime(item, timestamps[index])) {
            continue
        }
        const distance = Math.abs(index - currentIndex)
        if (distance < nearestDistance) {
            nearestDistance = distance
            nearestIndex = index
        }
    }
    return nearestIndex >= 0 ? nearestIndex : currentIndex
}

/**
 * 定位搜索命中的商品：切到所属主标签，打开时间过滤并落到商品可购买的时间点。
 */
function applyFocusedItem(): void {
    const itemId = focusedItemId.value
    if (!itemId) {
        return
    }

    const located = locateItem(itemId)
    if (!located) {
        pendingFocusItemId.value = 0
        return
    }

    pendingFocusItemId.value = itemId
    focusedSubTabId.value = located.subTab.id
    diffOnlyEnabled.value = false
    timeFilterEnabled.value = collectTimePointTimestamps(located.mainTab.subTabs.flatMap(subTab => subTab.items)).length > 0
    selectedShop.value = located.mainTab.name
    selectedTimePointIndex.value = resolveItemTimePointIndex(located.mainTab, located.item)

    void nextTick(() => {
        scheduleScrollToItem(itemId)
        flashItem(itemId)
    })
}

/**
 * 从详情内命中列表定位某个商品；与当前目标相同时直接重新滚动高亮。
 * @param hit 命中商品
 */
function focusSearchHit(hit: ShopItemSearchHit): void {
    if (focusedItemId.value === hit.itemId) {
        applyFocusedItem()
        return
    }
    focusedItemId.value = hit.itemId
}

watch(
    () => props.shop.id,
    (newVal, oldVal) => {
        if (newVal !== oldVal) {
            selectedShop.value = props.shop.mainTabs[0].name || ""
        }
        timeFilterEnabled.value = shopTimePoints.value.length > 0
        selectedTimePointIndex.value = currentTimePointIndex.value
        diffOnlyEnabled.value = false
        pendingFocusItemId.value = 0
        focusedSubTabId.value = 0
        applyRouteSubTab()
        applyFocusedItem()
        if (!shopTabs.value.some(v => v.value === selectedShop.value)) {
            selectedShop.value = shopTabs.value[0].value
        }
    },
    { immediate: true }
)

watch(routeSubTabId, () => {
    applyRouteSubTab()
})

/**
 * 切换主标签后等待内容重渲染完成，再同步滑块到当前时间点。
 */
watch(selectedShop, async () => {
    await nextTick()
    resetToCurrentTimePoint()
})

/** 搜索命中的目标商品变化时重新定位。 */
watch(focusedItemId, () => {
    applyFocusedItem()
})

watch(
    [shopTimePoints, diffOnlyEnabled, selectedTimePointIndex, timeFilterEnabled],
    ([timePoints, diffEnabled, currentIndex, timeFilter]) => {
        if (!diffEnabled) {
            return
        }
        if (!timeFilter || timePoints.length === 0 || currentIndex < 0) {
            diffOnlyEnabled.value = false
        }
    },
    { immediate: true }
)

/**
 * 挂载后等待滑块完成初次渲染，再把位置重置到当前时间点。
 */
onMounted(async () => {
    await nextTick()
    resetToCurrentTimePoint()
    applyRouteSubTab()
})

// 将商品列表转换为树形结构
function buildItemTree(items: ShopItemWithChildren[]): ShopItemWithChildren[] {
    // 创建商品ID到商品对象的映射
    const itemMap = new Map<number, ShopItemWithChildren>()

    // 首先将所有商品添加到映射中
    items.forEach(item => {
        itemMap.set(item.id, { ...item })
    })

    // 构建树形结构
    const rootItems: ShopItemWithChildren[] = []

    itemMap.forEach(item => {
        if (item.require) {
            // 如果商品有依赖项，将其添加到依赖项的children数组中
            const parent = itemMap.get(item.require)
            if (parent) {
                if (!parent.children) {
                    parent.children = []
                }
                parent.children.push(item)
            } else {
                // 如果依赖项不存在，将其作为根节点
                rootItems.push(item)
            }
        } else {
            // 没有依赖项的商品作为根节点
            rootItems.push(item)
        }
    })

    // 按照sequence排序
    const sortItems = (items: ShopItemWithChildren[]) => {
        items.sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0))
        // 递归排序子项
        items.forEach(item => {
            if (item.children) {
                sortItems(item.children)
            }
        })
    }

    sortItems(rootItems)

    return rootItems
}

/**
 * 判断商品在指定时间点是否可购买。
 * @param item 商品
 * @param timestamp 指定时间戳
 * @returns 是否可购买
 */
function isItemAvailableAtTime(item: ShopItemType, timestamp: number): boolean {
    const started = item.startTime == null || item.startTime <= timestamp
    const notEnded = item.endTime == null || timestamp < item.endTime
    return started && notEnded
}

/**
 * 按时间过滤商品列表。
 * @param items 商品列表
 * @param timestamp 过滤时间戳
 * @returns 过滤后的商品列表
 */
function filterItemsByTimestamp(items: ShopItemType[], timestamp: number | null): ShopItemWithChildren[] {
    if (timestamp == null) {
        return items.map(item => ({ ...item }))
    }

    const itemMap = new Map(items.map(item => [item.id, item]))
    const visibleItemIds = new Set<number>()

    items.forEach(item => {
        if (!isItemAvailableAtTime(item, timestamp)) {
            return
        }

        let currentItem: ShopItemType | undefined = item
        while (currentItem) {
            if (visibleItemIds.has(currentItem.id)) {
                break
            }
            visibleItemIds.add(currentItem.id)
            currentItem = currentItem.require ? itemMap.get(currentItem.require) : undefined
        }
    })

    return items.filter(item => visibleItemIds.has(item.id)).map(item => ({ ...item }))
}

/**
 * 根据当前模式过滤商品列表。
 * @param items 商品列表
 * @param timestamp 当前时间戳
 * @param previousTimestamp 上一个时间戳
 * @param diffOnly 是否只显示差异
 * @returns 过滤后的商品列表
 */
function filterItemsByMode(
    items: ShopItemType[],
    timestamp: number | null,
    previousTimestamp: number | null,
    diffOnly: boolean
): ShopItemWithChildren[] {
    if (!diffOnly || timestamp == null) {
        return filterItemsByTimestamp(items, timestamp)
    }

    const currentActiveIds = new Set(items.filter(item => isItemAvailableAtTime(item, timestamp)).map(item => item.id))
    const previousActiveIds =
        previousTimestamp == null
            ? new Set<number>()
            : new Set(items.filter(item => isItemAvailableAtTime(item, previousTimestamp)).map(item => item.id))
    const itemMap = new Map(items.map(item => [item.id, item]))
    const visibleItemIds = new Set<number>()
    const diffStateMap = new Map<number, ShopItemDiffState>()

    items.forEach(item => {
        const isCurrentActive = currentActiveIds.has(item.id)
        const wasPreviousActive = previousActiveIds.has(item.id)
        if (isCurrentActive === wasPreviousActive) {
            return
        }

        diffStateMap.set(item.id, isCurrentActive ? "added" : "removed")

        let currentItem: ShopItemType | undefined = item
        while (currentItem) {
            if (visibleItemIds.has(currentItem.id)) {
                break
            }
            visibleItemIds.add(currentItem.id)
            currentItem = currentItem.require ? itemMap.get(currentItem.require) : undefined
        }
    })

    return items
        .filter(item => visibleItemIds.has(item.id))
        .map(item => ({
            ...item,
            diffState: diffStateMap.get(item.id),
        }))
}

/**
 * 统计指定时间点下真实可购买的商品数量。
 * @param items 商品列表
 * @param timestamp 过滤时间戳
 * @returns 可购买商品数量
 */
function countActiveItemsByTimestamp(items: ShopItemType[], timestamp: number | null): number {
    if (timestamp == null) {
        return items.length
    }
    return items.filter(item => isItemAvailableAtTime(item, timestamp)).length
}

/**
 * 统计指定时间点与上一个时间点之间的变化商品数量。
 * @param items 商品列表
 * @param timestamp 当前时间戳
 * @param previousTimestamp 上一个时间戳
 * @returns 差异商品数量
 */
function countChangedItemsByTimestamp(items: ShopItemType[], timestamp: number | null, previousTimestamp: number | null): number {
    if (timestamp == null) {
        return 0
    }

    return items.filter(item => {
        const isCurrentActive = isItemAvailableAtTime(item, timestamp)
        const wasPreviousActive = previousTimestamp == null ? false : isItemAvailableAtTime(item, previousTimestamp)
        return isCurrentActive !== wasPreviousActive
    }).length
}

/**
 * 将滑块重置到当前时间点；若正处于搜索定位流程，则落到目标商品所属时间点。
 */
function resetToCurrentTimePoint(): void {
    if (props.shop.mainTabs.every(v => v.name !== selectedShop.value)) {
        selectedShop.value = props.shop.mainTabs[0].name
    }

    const pendingTarget = pendingFocusItemId.value ? locateItem(pendingFocusItemId.value) : null
    if (pendingTarget && pendingTarget.mainTab.name === selectedShop.value) {
        selectedTimePointIndex.value = resolveItemTimePointIndex(pendingTarget.mainTab, pendingTarget.item)
        return
    }

    pendingFocusItemId.value = 0
    focusedSubTabId.value = 0
    selectedTimePointIndex.value = currentTimePointIndex.value
}

/**
 * 格式化完整时间标签。
 * @param timestamp 时间戳
 * @returns 完整时间文本
 */
function formatShopTime(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })
}

/**
 * 格式化短时间标签。
 * @param timestamp 时间戳
 * @returns 短时间文本
 */
function formatShopTimeShort(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
    })
}
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 商店档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Shop File
            </p>
            <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                <SRouterLink
                    :to="`/db/shop/${shop.id}`"
                    class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                >
                    {{ $t(shop.name) }}
                </SRouterLink>
                <CopyID :id="shop.id" />
            </div>
        </header>

        <AniTabs v-model="selectedShop" :tabs="shopTabs" />

        <!-- 搜索命中：点击直接定位到对应商品 -->
        <div
            v-if="normalizedKeyword"
            class="flex flex-wrap items-center gap-1.5 rounded-xs border border-primary/25 bg-primary/6 px-3 py-2"
        >
            <span class="inline-flex shrink-0 items-center gap-1 text-[11px] text-base-content/55">
                <Icon icon="ri:search-line" class="size-3.5 text-primary/70" />
                {{ $t("db-shop-detail.search_hit_count", { count: searchHitMap.size }) }}
            </span>
            <template v-if="searchHitMap.size">
                <button
                    v-for="hit in Array.from(searchHitMap.values()).slice(0, 8)"
                    :key="hit.itemId"
                    type="button"
                    class="inline-flex max-w-44 items-center gap-1 rounded-xs border border-base-content/15 bg-base-100/60 px-1.5 py-0.5 text-[11px] text-base-content/65 transition-colors duration-150 hover:border-primary/60 hover:text-primary"
                    :title="$t('db-shop-list.jump_to_item')"
                    :data-shop-detail-hit-item="hit.itemId"
                    @click="focusSearchHit(hit)"
                >
                    <span class="truncate"><HighlightKeywordText :text="translateGameText(hit.itemName)" :keyword="normalizedKeyword" /></span>
                </button>
                <span v-if="searchHitMap.size > 8" class="text-[11px] text-base-content/40">+{{ searchHitMap.size - 8 }}</span>
            </template>
            <span v-else class="text-[11px] text-base-content/40">{{ $t("db-shop-detail.search_hit_none") }}</span>
        </div>

        <!-- 时间过滤：工具条，不进滚动目录 -->
        <TimePointFilter
            v-if="shopTimePoints.length > 0"
            v-model:enabled="timeFilterEnabled"
            v-model:index="selectedTimePointIndex"
            v-model:diff-only="diffOnlyEnabled"
            :points="shopTimePoints"
            :current-index="currentTimePointIndex"
            data-scroll-nav-ignore
            kicker="FILTER"
            :title="$t('db-shop-detail.time_filter')"
            :desc="$t('db-shop-detail.timeline_desc')"
            :count-text="$t('db-shop-detail.time_point_count', { count: shopTimePoints.length })"
            :point-unit="$t('db-shop-detail.item_unit')"
            :status-count-text="$t('db-shop-detail.purchasable_count', { count: selectedTimePoint?.activeCount ?? 0 })"
            :compare-label="previousSelectedTimePoint?.label ?? null"
        />

        <!-- 商店主标签 -->
        <div v-for="mainTab in filteredMainTabs.filter(t => t.name === selectedShop)" :key="mainTab.id" class="space-y-3">
            <!-- 商店子标签：每个子标签即一个 section，进滚动目录以便跳转 -->
            <section
                v-for="subTab in mainTab.subTabs"
                :key="subTab.id"
                :id="subTabAnchorId(subTab.id)"
                class="scroll-mt-3 rounded-xs border p-3 backdrop-blur-sm"
                :class="
                    isRouteSubTab(subTab.id) || focusedSubTabId === subTab.id
                        ? 'border-primary/70 bg-primary/6'
                        : 'border-base-content/10 bg-base-100/60'
                "
            >
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 class="truncate text-sm font-semibold">{{ $t(subTab.name) }}</h2>
                    <span
                        v-if="timeFilterEnabled"
                        class="shrink-0 rounded-xs border border-base-content/15 bg-base-content/3 px-1.5 py-0.5 text-[11px] tabular-nums text-base-content/60"
                    >
                        <template v-if="diffOnlyEnabled">
                            {{
                                $t("db-shop-detail.changed_with_deps", {
                                    changed: subTab.changedItemCount,
                                    deps: subTab.visibleItems.length - subTab.changedItemCount,
                                })
                            }}
                        </template>
                        <template v-else>
                            {{
                                $t("db-shop-detail.available_with_deps", {
                                    count: subTab.activeVisibleItemCount,
                                    deps: subTab.visibleItems.length - subTab.activeVisibleItemCount,
                                })
                            }}
                        </template>
                    </span>
                </div>

                <!-- 商品列表 - 树形结构（同层商品卡 grid autofill 并排） -->
                <div
                    v-if="diffOnlyEnabled ? subTab.changedItemCount > 0 : subTab.activeVisibleItemCount > 0"
                    class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,400px),1fr))] gap-2"
                >
                    <!-- 使用 ShopItem 组件递归渲染商品树 -->
                    <ShopItem
                        v-for="item in buildItemTree(subTab.visibleItems)"
                        :key="item.id"
                        :item="item"
                        :keyword="normalizedKeyword"
                        :search-hits="searchHitMap"
                        :flashing-item-id="flashingItemId"
                    />
                </div>
                <div
                    v-else
                    class="rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-6 text-center text-sm text-base-content/45"
                >
                    {{ diffOnlyEnabled ? $t("db-shop-detail.no_diff_items") : $t("db-shop-detail.no_available_items") }}
                </div>
            </section>
        </div>
    </div>
</template>
