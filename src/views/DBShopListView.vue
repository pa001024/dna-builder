<script lang="ts" setup>
import { useSessionStorage } from "@vueuse/core"
import { computed } from "vue"
import shopData from "../data/d/shop.data"

const searchKeyword = useSessionStorage<string>("shop.searchKeyword", "")
const selectedShopId = useSessionStorage<string>("shop.selectedShop", "")

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
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedShop }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索商店ID/名称/商品..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <!-- 商店列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="shop in filteredShops"
                            :key="shop.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedShopId === shop.id }"
                            @click="selectShop(shop)"
                        >
                            <div class="flex items-start justify-between">
                                <div>
                                    <div class="font-medium">{{ shop.name }}</div>
                                    <div class="text-xs opacity-70 mt-1">{{ shop.mainTabs.length }}个主标签</div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs px-2 py-0.5 rounded bg-primary text-white">
                                        {{ shop.id }}
                                    </span>
                                    <span class="text-xs opacity-70"
                                        >{{ shop.mainTabs.reduce((total, tab) => total + tab.subTabs.length, 0) }}个子标签</span
                                    >
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span
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
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredShops.length }} 个商店
                </div>
            </div>
            <div
                v-if="selectedShop"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectShop(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedShop" class="flex-1" :key="selectedShopId">
                <DBShopDetailItem :shop="selectedShop" />
            </ScrollArea>
        </div>
    </div>
</template>
