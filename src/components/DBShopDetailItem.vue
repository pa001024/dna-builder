<script lang="ts" setup>
import type { Shop, ShopItem as ShopItemType } from "@/data/d/shop.data"
import ShopItem from "./ShopItem.vue"

const props = defineProps<{
    shop: Shop
}>()

// 定义带有子项的商品类型
interface ShopItemWithChildren extends ShopItemType {
    children?: ShopItemWithChildren[]
}

// 将商品列表转换为树形结构
function buildItemTree(items: ShopItemType[]): ShopItemWithChildren[] {
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
</script>

<template>
    <ScrollArea class="h-full">
        <div class="p-3 space-y-4">
            <!-- 商店头部 -->
            <div class="flex items-center justify-between">
                <SRouterLink :to="`/db/shop/${shop.id}`" class="link link-primary">
                    <h2 class="text-lg font-bold">{{ shop.name }}</h2>
                </SRouterLink>
                <span class="text-xs px-2 py-1 rounded bg-primary text-white">
                    {{ shop.id }}
                </span>
            </div>

            <!-- 商店主标签 -->
            <div v-for="mainTab in shop.mainTabs" :key="mainTab.id" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-3">{{ mainTab.name }}</h3>

                <!-- 商店子标签 -->
                <div v-for="subTab in mainTab.subTabs" :key="subTab.id" class="mb-4">
                    <h4 class="font-medium mb-2">{{ subTab.name }}</h4>

                    <!-- 商品列表 - 树形结构 -->
                    <div class="space-y-3">
                        <!-- 使用 ShopItem 组件递归渲染商品树 -->
                        <ShopItem v-for="item in buildItemTree(subTab.items)" :key="item.id" :item="item" />
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
