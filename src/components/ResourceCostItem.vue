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
            <span class="font-medium text-base-content">
                <img :src="mod.url" :alt="mod.名称" class="w-6 h-6 inline-block mr-2" />
                {{ value[2] === "Mod" ? $t(mod.名称) : `图纸: ${mod.名称}` }}
                <span class="ml-2 text-sm text-base-content/70">{{ mod.品质 }}</span>
            </span>
            <span class="font-bold text-primary ml-auto">{{ value[0] }}</span>
        </div>
    </ShowProps>
    <div v-else class="flex items-center p-3 rounded bg-base-300 transition-colors duration-200" v-bind="$attrs" @click="$emit('click')">
        <span class="font-medium text-base-content">
            <img :src="getIcon(name)" alt="" class="w-6 h-6 inline-block mr-2" />
            {{ $t(name) }}</span
        >
        <span class="font-bold text-primary ml-auto">{{ value }}</span>
    </div>
</template>
