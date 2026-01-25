<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import DBShopDetailItem from "@/components/DBShopDetailItem.vue"
import shopData from "../data/d/shop.data"

const route = useRoute()

const shopId = computed(() => route.params.shopId as string)
const shop = computed(() => shopData.find(s => s.id === shopId.value))
</script>

<template>
    <div class="h-full flex flex-col bg-base-300">
        <template v-if="shop">
            <!-- 使用 ShopDetailItem 组件显示商店详情 -->
            <DBShopDetailItem :shop="shop" class="flex-1" />
        </template>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到商店</div>
        </div>
    </div>
</template>
