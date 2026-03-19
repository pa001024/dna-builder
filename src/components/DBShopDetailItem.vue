<script lang="ts" setup>
import { computed, watch } from "vue"
import { useRoute } from "vue-router"
import { useSearchParam } from "@/composables/useSearchParam"
import type { Shop, ShopItem as ShopItemType, ShopMainTab, ShopSubTab } from "@/data/d/shop.data"

const props = defineProps<{
    shop: Shop
}>()
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
    activeItemCount: number
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

const shopTabs = computed(() => props.shop.mainTabs.map(t => t.name))
const selectedShop = useSearchParam("tab", props.shop.mainTabs[0].name || "")
const timeFilterEnabled = useSearchParam("tf", false)
const selectedTimePointIndex = useSearchParam("ti", 0)
const diffOnlyEnabled = useSearchParam("td", false)

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

/**
 * 按路由子标签定位主标签。
 */
function applyRouteSubTab(): void {
    if (!routeSubTabId.value) {
        return
    }

    const targetMainTab = props.shop.mainTabs.find(mainTab => mainTab.subTabs.some(subTab => subTab.id === routeSubTabId.value))
    if (targetMainTab) {
        selectedShop.value = targetMainTab.name
    }
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
 * 生成当前主标签全部离散时间边界点。
 * @returns 按时间升序排列的离散时间戳
 */
const shopTimeTimestamps = computed(() => {
    return Array.from(
        new Set(
            selectedMainTabItems.value.flatMap(item => {
                const points = [] as number[]
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
})

/**
 * 计算默认应选中的当前时间点索引。
 * @returns 当前时间点索引
 */
const currentTimePointIndex = computed(() => {
    if (shopTimeTimestamps.value.length === 0) {
        return 0
    }

    const firstFutureIndex = shopTimeTimestamps.value.findIndex(timestamp => timestamp > nowTimestamp)
    if (firstFutureIndex === -1) {
        return shopTimeTimestamps.value.length - 1
    }
    if (firstFutureIndex === 0) {
        return 0
    }
    return firstFutureIndex - 1
})

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
        activeItemCount: selectedMainTabItems.value.filter(item => isItemAvailableAtTime(item, timestamp)).length,
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
    return props.shop.mainTabs.map(mainTab => ({
        ...mainTab,
        subTabs: mainTab.subTabs.map(subTab => ({
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
        })),
    }))
})

watch(
    () => props.shop.id,
    (newVal, oldVal) => {
        if (newVal !== oldVal) {
            selectedShop.value = props.shop.mainTabs[0].name || ""
        }
        timeFilterEnabled.value = shopTimePoints.value.length > 0
        selectedTimePointIndex.value = currentTimePointIndex.value
        diffOnlyEnabled.value = false
        applyRouteSubTab()
        if (!shopTabs.value.includes(selectedShop.value)) {
            selectedShop.value = shopTabs.value[0]
        }
    },
    { immediate: true }
)

watch(routeSubTabId, () => {
    applyRouteSubTab()
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
        items.sort((a, b) => (b.sequence || 0) - (a.sequence || 0))
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
    const previousActiveIds = previousTimestamp == null ? new Set<number>() : new Set(items.filter(item => isItemAvailableAtTime(item, previousTimestamp)).map(item => item.id))
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
 * 将滑块重置到当前时间点。
 */
function resetToCurrentTimePoint(): void {
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
    <div class="p-3 space-y-4">
        <!-- 商店头部 -->
        <div class="flex items-center justify-between">
            <span>
                <SRouterLink :to="`/db/shop/${shop.id}`" class="link link-primary">
                    <h2 class="text-lg font-bold">{{ shop.name }}</h2>
                </SRouterLink>
            </span>
            <span class="text-xs px-2 py-1 rounded bg-primary text-white">
                {{ shop.id }}
            </span>
        </div>

        <div class="flex flex-wrap gap-1 pb-1">
            <span
                v-for="tab in shopTabs"
                :key="tab"
                class="text-sm px-2 py-1 rounded cursor-pointer transition-colors duration-200 hover:bg-base-200"
                :class="{ 'bg-primary text-white hover:bg-primary': tab === selectedShop }"
                @click="selectedShop = tab"
                >{{ tab }}</span
            >
        </div>

        <div v-if="shopTimePoints.length > 0" class="rounded-lg border border-base-200 bg-base-100 p-3 space-y-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="space-y-1">
                    <div class="font-medium">时间过滤</div>
                    <div class="text-xs text-base-content/70">按离散时间点查看可购买商品，也可只看相对上一时间点的变化。</div>
                </div>
                <div class="flex flex-wrap items-center gap-4">
                    <button type="button" class="btn btn-xs btn-ghost" @click="resetToCurrentTimePoint">重置到当前</button>
                    <label class="label cursor-pointer gap-2 p-0">
                        <span class="text-sm">仅显示可购买</span>
                        <input v-model="timeFilterEnabled" type="checkbox" class="toggle toggle-primary toggle-sm" />
                    </label>
                    <label class="label cursor-pointer gap-2 p-0">
                        <span class="text-sm">仅显示差异</span>
                        <input v-model="diffOnlyEnabled" type="checkbox" class="toggle toggle-success toggle-sm" :disabled="!timeFilterEnabled" />
                    </label>
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-xs text-base-content/70">
                <span class="rounded bg-base-200 px-2 py-1">{{ shopTimePoints.length }} 个时间点</span>
                <span v-if="selectedTimePoint">当前时间点：{{ selectedTimePoint.label }}</span>
                <span v-if="selectedTimePoint">可购买 {{ selectedTimePoint.activeItemCount }} 件</span>
                <span v-if="diffOnlyEnabled && previousSelectedTimePoint">对比上一时间点：{{ previousSelectedTimePoint.label }}</span>
                <span v-if="selectedTimePoint?.isCurrent" class="rounded bg-primary px-2 py-1 text-primary-content">当前</span>
            </div>

            <div class="flex items-center gap-3">
                <span class="w-12 shrink-0 text-[11px] text-base-content/60">{{ shopTimePoints[0]?.shortLabel }}</span>
                <input
                    v-model.number="selectedTimePointIndex"
                    type="range"
                    class="range range-primary range-xs grow"
                    :min="0"
                    :max="Math.max(shopTimePoints.length - 1, 0)"
                    step="1"
                />
                <span class="w-12 shrink-0 text-right text-[11px] text-base-content/60">{{ shopTimePoints.at(-1)?.shortLabel }}</span>
            </div>
        </div>

        <!-- 商店主标签 -->
        <div v-for="mainTab in filteredMainTabs.filter(t => t.name === selectedShop)" :key="mainTab.id" class="card">
            <!-- 商店子标签 -->
            <div
                v-for="subTab in mainTab.subTabs"
                :key="subTab.id"
                class="mb-4 bg-base-100 border rounded-lg p-3"
                :class="isRouteSubTab(subTab.id) ? 'border-primary ring-1 ring-primary/30' : 'border-base-200'"
            >
                <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 class="font-medium">{{ subTab.name }}</h4>
                    <span v-if="timeFilterEnabled" class="text-xs text-base-content/60">
                        <template v-if="diffOnlyEnabled">
                            {{ subTab.changedItemCount }} 件发生变化，另保留 {{ subTab.visibleItems.length - subTab.changedItemCount }} 件依赖项
                        </template>
                        <template v-else>
                            {{ subTab.activeVisibleItemCount }} 件当前可购买，另保留 {{ subTab.visibleItems.length - subTab.activeVisibleItemCount }} 件依赖项
                        </template>
                    </span>
                </div>

                <!-- 商品列表 - 树形结构 -->
                <div v-if="diffOnlyEnabled ? subTab.changedItemCount > 0 : subTab.activeVisibleItemCount > 0" class="space-y-3">
                    <!-- 使用 ShopItem 组件递归渲染商品树 -->
                    <ShopItem v-for="item in buildItemTree(subTab.visibleItems)" :key="item.id" :item="item" />
                </div>
                <div v-else class="rounded bg-base-200 px-3 py-6 text-center text-sm text-base-content/60">
                    {{ diffOnlyEnabled ? "与上一时间点相比没有变化商品" : "当前时间点下没有可购买商品" }}
                </div>
            </div>
        </div>
    </div>
</template>
