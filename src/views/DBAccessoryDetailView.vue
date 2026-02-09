<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { charAccessoryData, weaponAccessoryData, weaponSkinData } from "@/data/d/accessory.data"

type AccessoryType = "char" | "weapon" | "skin"

const route = useRoute()

/**
 * 从路由参数读取饰品类型。
 */
const accessoryType = computed(() => {
    const value = route.params.accessoryType as string
    if (value === "weapon") {
        return "weapon"
    }
    return value === "skin" ? "skin" : "char"
})

/**
 * 从路由参数读取饰品 ID。
 */
const accessoryId = computed(() => Number(route.params.accessoryId))

/**
 * 根据类型和 ID 获取饰品详情。
 */
const accessory = computed(() => {
    const sourceMap = {
        char: charAccessoryData,
        weapon: weaponAccessoryData,
        skin: weaponSkinData,
    }
    const source = sourceMap[accessoryType.value]
    const item = source.find(v => v.id === accessoryId.value)
    return item ? { ...item, accessoryType: accessoryType.value as AccessoryType } : null
})
</script>

<template>
    <div class="h-full flex flex-col bg-base-300">
        <ScrollArea v-if="accessory" class="flex-1">
            <DBAccessoryDetailItem :accessory="accessory" />
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">{{ $t("accessory.notFound") }}</div>
        </div>
    </div>
</template>
