<script lang="ts" setup>
import { resourceMap } from "@/data"
import type { ShopItem } from "@/data/d/shop.data"

// 定义带有子项的商品类型
interface ShopItemWithChildren extends ShopItem {
    children?: ShopItemWithChildren[]
}

// 定义组件接收的Props
interface Props {
    item: ShopItemWithChildren
}

defineProps<Props>()

function getResourceIcon(name: string) {
    const res = resourceMap.get(name)
    return res?.icon ? `/imgs/res/${res.icon}.webp` : `/imgs/webp/T_Head_Empty.webp`
}
</script>

<template>
    <div class="space-y-3">
        <!-- 商品项内容 -->
        <div class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
            <div class="flex justify-between items-center mb-2">
                <div class="flex items-center gap-2">
                    <div class="w-6 h-6">
                        <img :src="getResourceIcon(item.typeName)" class="w-full h-full object-cover rounded" :alt="item.typeName" />
                    </div>
                    <div>
                        <span class="font-medium">{{ item.typeName }}</span>
                        <span class="ml-1 text-xs text-base-content/70">({{ item.itemType }})</span>
                        <span class="text-xs px-1.5 py-0.5 rounded bg-base-300">x{{ item.num }}</span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1">
                        <img :src="getResourceIcon(item.priceName)" class="w-4 h-4 object-cover rounded" :alt="item.priceName" />
                        <span class="text-sm font-medium">{{ item.price }}</span>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-4 gap-2 text-xs">
                <div><span class="text-base-content/70">ID:</span> {{ item.id }}</div>
                <div><span class="text-base-content/70">物品ID:</span> {{ item.typeId }}</div>
                <div><span class="text-base-content/70">限购:</span> {{ item.limit || "∞" }}</div>
            </div>
            <div v-if="item.startTime" class="mt-1 text-xs text-base-content/70">
                <span>开始时间:</span> {{ new Date(item.startTime * 1000).toLocaleString() }}
                <span v-if="item.endTime" class="ml-2">结束时间:</span>
                {{ item.endTime ? new Date(item.endTime * 1000).toLocaleString() : "" }}
            </div>
        </div>

        <!-- 递归渲染子项 -->
        <div v-if="item.children && item.children.length" class="ml-6 pl-3 border-l-2 border-base-300">
            <ShopItem v-for="child in item.children" :key="child.id" :item="child" />
        </div>
    </div>
</template>
