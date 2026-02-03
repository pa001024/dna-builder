<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import type { Pet } from "../data/data-types"
import { LeveledPet } from "../data/leveled/LeveledPet"

const props = defineProps<{
    pet: Pet
}>()

const currentLevel = ref(0)

const leveledPet = computed(() => {
    return new LeveledPet(props.pet, currentLevel.value)
})

watch(
    () => props.pet,
    () => {
        currentLevel.value = 0
    }
)

function getQualityColor(quality: number): string {
    const colorMap: Record<number, string> = {
        1: "bg-gray-200 text-gray-800",
        2: "bg-green-200 text-green-800",
        3: "bg-blue-200 text-blue-800",
        4: "bg-purple-200 text-purple-800",
        5: "bg-yellow-200 text-yellow-800",
    }
    return colorMap[quality] || "bg-base-200 text-base-content"
}

function getQualityName(quality: number): string {
    const qualityMap: Record<number, string> = {
        1: "白",
        2: "绿",
        3: "蓝",
        4: "紫",
        5: "金",
    }
    return qualityMap[quality] || quality.toString()
}

function getTypeName(type: number): string {
    const typeMap: Record<number, string> = {
        1: "活力魔灵",
        2: "失活魔灵",
        3: "活动魔灵",
    }
    return typeMap[type] || type.toString()
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-3">
            <SRouterLink :to="`/db/pet/${pet.id}`" class="text-lg font-bold link link-primary">
                {{ pet.名称 }}
            </SRouterLink>
            <span class="text-xs text-base-content/70">ID: {{ pet.id }}</span>
            <div class="text-sm text-base-content/70 flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded" :class="getQualityColor(pet.品质)">
                    {{ getQualityName(pet.品质) }}
                </span>
                <span class="px-1.5 py-0.5 rounded bg-base-300">{{ getTypeName(pet.类型) }}</span>
            </div>
        </div>

        <div class="flex justify-center items-center">
            <img :src="leveledPet.url" class="w-24 object-cover rounded" />
        </div>

        <div class="flex flex-wrap gap-2 text-sm opacity-70">
            <span>最大等级: {{ pet.最大等级 }}</span>
            <span>捕获经验: {{ pet.捕获经验 }}</span>
            <span>经验: {{ leveledPet.经验 }}</span>
        </div>

        <div>
            <div class="flex items-center gap-4">
                <span class="text-sm min-w-12">Lv. {{ currentLevel }}</span>
                <input
                    :key="pet.id"
                    v-model.number="currentLevel"
                    type="range"
                    class="range range-primary range-xs grow"
                    :min="0"
                    :max="3"
                    step="1"
                />
            </div>
            <div class="text-xs text-base-content/50 mt-1">突破等级 (0-3)</div>
        </div>

        <div v-if="leveledPet.主动" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">主动技能</div>
            <div class="text-sm whitespace-pre-wrap">
                {{ leveledPet.主动.描述 }}
            </div>
        </div>

        <div v-if="leveledPet.被动" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">被动技能</div>
            <div class="text-sm whitespace-pre-wrap">
                {{ leveledPet.被动.描述 }}
            </div>
        </div>
    </div>
</template>
