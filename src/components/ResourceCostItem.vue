<script setup lang="ts">
import { LeveledMod, resourceMap } from "@/data"

defineOptions({ inheritAttrs: false })
defineProps<{
    name: string
    value: number | [number, number, "Mod" | "Draft"]
}>()

defineEmits<{
    click: []
}>()

function getIcon(name: string) {
    const res = resourceMap.get(name)
    return res?.icon ? `/imgs/res/${res?.icon}.webp` : `/imgs/webp/T_Head_Empty.webp`
}

function getRarityColor(name: string): string {
    const res = resourceMap.get(name)
    return getQualityColor(res?.rarity || 1)
}
function getQualityColor(quality: string | number): string {
    if (typeof quality === "number") {
        quality = ["白", "绿", "蓝", "紫", "金"][quality - 1]
    }
    const colorMap: Record<string, string> = {
        金: "from-yellow-900/80 to-yellow-100/80",
        紫: "from-purple-900/80 to-purple-100/80",
        蓝: "from-blue-900/80 to-blue-100/80",
        绿: "from-green-900/80 to-green-100/80",
        白: "from-gray-900/80 to-gray-100/80",
    }
    return colorMap[quality] || "from-gray-900/80 to-gray-100/80"
}
</script>
<template>
    <ShowProps
        v-if="Array.isArray(value)"
        v-for="mod in [new LeveledMod(value[1])]"
        :key="mod.id"
        :props="mod.getProperties()"
        :title="`${$t(mod.系列)}${$t(mod.名称)}`"
        :rarity="mod.品质"
        :polarity="mod.极性"
        :cost="mod.耐受"
        :type="`${$t(mod.类型)}${mod.属性 ? `,${$t(mod.属性 + '属性')}` : ''}${mod.限定 ? `,${$t(mod.限定)}` : ''}`"
        :effdesc="mod.效果"
        :link="`/db/mod/${mod.id}`"
    >
        <div class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200" v-bind="$attrs" @click="$emit('click')">
            <span class="font-medium truncate">
                <img
                    :src="mod.url"
                    :alt="mod.名称"
                    class="size-8 inline-block mr-2 bg-linear-45 rounded"
                    :class="getQualityColor(mod.品质)"
                />
                {{ value[2] === "Mod" ? $t(mod.名称) : `图纸: ${mod.名称}` }}
            </span>
            <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
        </div>
    </ShowProps>
    <div v-else class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200" v-bind="$attrs" @click="$emit('click')">
        <span class="font-medium truncate">
            <img :src="getIcon(name)" alt="" class="size-8 inline-block mr-2 bg-linear-15 rounded" :class="getRarityColor(name)" />
            {{ $t(name) }}</span
        >
        <span class="font-bold text-primary ml-auto">{{ value }}</span>
    </div>
</template>
