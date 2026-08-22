<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import shopData from "@/data/d/shop.data"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedShopId = useSearchParam<string>("id", "")

// 根据 ID 获取选中的商店
const selectedShop = computed(() => {
    return selectedShopId.value ? shopData.find(shop => shop.id === selectedShopId.value) || null : null
})

// 按关键词筛选商店
const filteredShops = computed(() => {
    return shopData.filter(shop => {
        if (searchKeyword.value === "") {
            return true
        } else {
            const q = searchKeyword.value.toLowerCase()
            return (
                shop.id.toLowerCase().includes(q) ||
                shop.name.toLowerCase().includes(q) ||
                shop.mainTabs.some(
                    mainTab =>
                        mainTab.name.toLowerCase().includes(q) ||
                        mainTab.subTabs.some(
                            subTab =>
                                subTab.name.toLowerCase().includes(q) ||
                                subTab.items.some(
                                    item =>
                                        item.typeName.toLowerCase().includes(q) ||
                                        item.itemType.toLowerCase().includes(q) ||
                                        item.priceName.toLowerCase().includes(q)
                                )
                        )
                )
            )
        }
    })
})

function selectShop(shop: (typeof shopData)[0] | null) {
    selectedShopId.value = shop?.id || ""
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbs-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedShop }"
            >
                <!-- 检索带：下划线搜索 + 计数 -->
                <div
                    class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise"
                >
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索商店ID/名称/商品..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredShops.length }}
                        </span>
                    </div>
                </div>

                <!-- 商店列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3 space-y-2">
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
                                        {{ shop.name }}
                                    </h3>
                                    <CopyID :id="shop.id" class="ml-auto shrink-0" />
                                </div>
                                <!-- 元信息行：主标签 / 子标签 / 商品总数 -->
                                <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                    <span class="tabular-nums">{{ shop.mainTabs.length }}个主标签</span>
                                    <span class="tabular-nums">{{
                                        shop.mainTabs.reduce((total, tab) => total + tab.subTabs.length, 0)
                                    }}个子标签</span>
                                    <span class="tabular-nums"
                                        >商品总数:
                                        {{
                                            shop.mainTabs.reduce(
                                                (total, tab) =>
                                                    total + tab.subTabs.reduce((subTotal, subTab) => subTotal + subTab.items.length, 0),
                                                0
                                            )
                                        }}</span
                                    >
                                </div>
                            </div>
                        </article>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredShops.length }}</b> 个商店
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedShop"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectShop(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedShop" class="min-w-0 flex-2" :key="selectedShopId">
                <DBShopDetailItem :shop="selectedShop" :key="selectedShopId" />
            </ScrollArea>
        </div>
    </div>
</template>
