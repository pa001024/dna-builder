<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import type { Shop } from "@/data/d/shop.data"
import shopData from "@/data/d/shop.data"
import { SHOP_MATCH_FIELD_LABEL_KEYS, type ShopItemSearchHit, searchShopData } from "@/utils/shop-search"

/** 每个商店卡片内最多展示的命中商品数 */
const MAX_VISIBLE_ITEM_HITS = 4
/** 商店卡片内最多展示的标签命中摘要数 */
const MAX_VISIBLE_TAB_SNIPPETS = 2

const { t } = useTranslation()
const searchKeyword = useSearchParam<string>("kw", "")
const selectedShopId = useSearchParam<string>("id", "")
const focusedItemId = useSearchParam<number>("item", 0)

// 游戏原文里可能含 . 与 :，取译文时必须关掉键路径解析，否则按嵌套路径查不到
const translateGameText = (text: string) => t(text, { keySeparator: false, nsSeparator: false })
const normalizedKeyword = computed(() => searchKeyword.value.trim())

/**
 * 当前关键词的商店检索结果。
 */
const searchResultMap = computed(
    () => new Map(searchShopData(shopData, normalizedKeyword.value, translateGameText).map(result => [result.shop.id, result]))
)

/**
 * 按关键词筛选商店；无关键词时展示全部。
 */
const filteredShops = computed(() => (normalizedKeyword.value ? shopData.filter(shop => searchResultMap.value.has(shop.id)) : shopData))

// 根据 ID 获取选中的商店
const selectedShop = computed(() => {
    return selectedShopId.value ? shopData.find(shop => shop.id === selectedShopId.value) || null : null
})

/**
 * 统计商店的子标签总数。
 * @param shop 商店数据
 * @returns 子标签总数
 */
function countSubTabs(shop: Shop): number {
    return shop.mainTabs.reduce((total, tab) => total + tab.subTabs.length, 0)
}

/**
 * 统计商店的商品总数。
 * @param shop 商店数据
 * @returns 商品总数
 */
function countItems(shop: Shop): number {
    return shop.mainTabs.reduce((total, tab) => total + tab.subTabs.reduce((subTotal, subTab) => subTotal + subTab.items.length, 0), 0)
}

/**
 * 获取商店在当前关键词下的命中商品（已按上限截断）。
 * @param shop 商店数据
 * @returns 命中商品列表
 */
function getVisibleItemHits(shop: Shop): ShopItemSearchHit[] {
    const hits = searchResultMap.value.get(shop.id)?.itemHits
    return hits ? Array.from(hits.values()).slice(0, MAX_VISIBLE_ITEM_HITS) : []
}

/**
 * 获取命中商品的字段展示文案。
 * @param hit 命中商品
 * @returns 展示文案
 */
function getMatchFieldLabel(hit: ShopItemSearchHit): string {
    return t(SHOP_MATCH_FIELD_LABEL_KEYS[hit.field])
}

/**
 * 选中商店（清空商品跳转目标，避免沿用上一个商品的定位）。
 * @param shop 商店数据
 */
function selectShop(shop: Shop | null) {
    selectedShopId.value = shop?.id || ""
    focusedItemId.value = 0
}

/**
 * 选中商店内某个命中商品，让详情自动切到对应标签页与时间点。
 * @param shop 商店数据
 * @param hit 命中商品
 */
function selectShopItem(shop: Shop, hit: ShopItemSearchHit) {
    selectedShopId.value = shop.id
    focusedItemId.value = hit.itemId
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbs-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 3" :detail-open="Boolean(selectedShop)" @collapse="selectShop(null)">
            <template #master>
                <!-- 左侧列表面板 -->
                <div class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedShop }">
                    <!-- 检索带：下划线搜索 + 计数 -->
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="searchKeyword"
                            :placeholder="$t('db-shop-list.search_placeholder')"
                            :count="filteredShops.length"
                        />
                    </div>

                    <!-- 商店列表 -->
                    <ScrollArea class="flex-1">
                        <div class="p-3 space-y-2">
                            <div
                                v-if="!filteredShops.length"
                                class="rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-8 text-center text-sm text-base-content/45"
                            >
                                {{ $t("common.no_match") }}
                            </div>
                            <article
                                v-for="(shop, index) in filteredShops"
                                :key="shop.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedShopId === shop.id
                                        ? 'dbs-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectShop(shop)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedShopId === shop.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="p-3">
                                    <!-- 名称行：名称 + 幽灵 ID -->
                                    <div class="flex items-baseline gap-2">
                                        <h3
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedShopId === shop.id }"
                                        >
                                            <HighlightKeywordText :text="translateGameText(shop.name)" :keyword="normalizedKeyword" />
                                        </h3>
                                        <CopyID :id="shop.id" class="ml-auto shrink-0" />
                                    </div>
                                    <!-- 元信息行：主标签 / 子标签 / 商品总数 -->
                                    <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                        <span class="tabular-nums">{{
                                            $t("db-shop-list.main_tabs", { count: shop.mainTabs.length })
                                        }}</span>
                                        <span class="tabular-nums">{{ $t("db-shop-list.sub_tabs", { count: countSubTabs(shop) }) }}</span>
                                        <span class="tabular-nums">{{ $t("db-shop-list.item_count", { count: countItems(shop) }) }}</span>
                                        <span
                                            v-if="searchResultMap.get(shop.id)?.itemHits.size"
                                            class="tabular-nums text-primary"
                                        >
                                            {{ $t("db-shop-list.match_item_count", { count: searchResultMap.get(shop.id)?.itemHits.size }) }}
                                        </span>
                                    </div>

                                    <!-- 标签命中摘要 -->
                                    <div
                                        v-if="searchResultMap.get(shop.id)?.tabSnippets.length"
                                        class="mt-1.5 flex flex-wrap gap-1 text-[11px] leading-none"
                                    >
                                        <span
                                            v-for="(snippet, snippetIndex) in searchResultMap
                                                .get(shop.id)
                                                ?.tabSnippets.slice(0, MAX_VISIBLE_TAB_SNIPPETS)"
                                            :key="snippetIndex"
                                            class="rounded-xs border border-base-content/15 bg-base-content/3 px-1.5 py-0.5 text-base-content/55"
                                        >
                                            <HighlightKeywordText :snippet="snippet" />
                                        </span>
                                    </div>

                                    <!-- 命中商品：点击直接切到该商品所在标签页与时间点 -->
                                    <ul v-if="getVisibleItemHits(shop).length" class="mt-1.5 space-y-0.5">
                                        <li v-for="hit in getVisibleItemHits(shop)" :key="hit.itemId">
                                            <button
                                                type="button"
                                                class="group/hit flex w-full min-w-0 items-center gap-1.5 rounded-xs px-1 py-1 text-left text-[11px] text-base-content/60 transition-colors duration-150 hover:bg-primary/10 hover:text-base-content"
                                                :title="$t('db-shop-list.jump_to_item')"
                                                :data-shop-hit-item="hit.itemId"
                                                @click.stop="selectShopItem(shop, hit)"
                                            >
                                                <Icon icon="ri:arrow-right-up-line" class="size-3 shrink-0 text-primary/70" />
                                                <span class="shrink-0 text-base-content/40">{{ $t(hit.subTabName) }}</span>
                                                <span class="min-w-0 flex-1 truncate">
                                                    <HighlightKeywordText
                                                        :text="translateGameText(hit.itemName)"
                                                        :keyword="hit.field === 'name' ? normalizedKeyword : ''"
                                                    />
                                                    <template v-if="hit.field !== 'name'">
                                                        <span class="text-base-content/30"> · </span>
                                                        <span class="text-base-content/40">{{ getMatchFieldLabel(hit) }}</span>
                                                        <HighlightKeywordText :snippet="hit.snippet" />
                                                    </template>
                                                </span>
                                            </button>
                                        </li>
                                        <li
                                            v-if="(searchResultMap.get(shop.id)?.itemHits.size ?? 0) > MAX_VISIBLE_ITEM_HITS"
                                            class="px-1 text-[11px] text-base-content/40"
                                        >
                                            {{
                                                $t("db-shop-list.more_match_items", {
                                                    count: (searchResultMap.get(shop.id)?.itemHits.size ?? 0) - MAX_VISIBLE_ITEM_HITS,
                                                })
                                            }}
                                        </li>
                                    </ul>
                                </div>
                            </article>
                        </div>
                    </ScrollArea>

                    <!-- 底部统计条 -->
                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary">{{ filteredShops.length }}</b>
                            {{ $t("db-shop-list.shop_count") }}
                        </p>
                    </div>
                </div>
            </template>
            <template #detail>
                <!-- 右侧详情面板 -->
                <ScrollArea v-if="selectedShop" class="min-h-0 min-w-0 flex-2" :key="selectedShopId">
                    <DBShopDetailItem :shop="selectedShop" :key="selectedShopId" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
