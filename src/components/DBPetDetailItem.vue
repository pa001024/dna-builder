<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { petMap } from "@/data"
import { regionMap } from "@/data/d/region.data"
import { subRegionData } from "@/data/d/subregion.data"
import type { Pet } from "../data/data-types"
import { LeveledPet } from "../data/leveled/LeveledPet"

const props = defineProps<{
    pet: Pet
}>()

interface PetSpawnLocation {
    subRegionId: number
    subRegionName: string
    regionName: string
    totalWeight: number
    rcWeights: { rcId: number; petWeight: number; totalWeight: number; ratio: number }[]
}

const currentLevel = ref(props.pet.最大等级 > 1 ? 3 : 0)

const leveledPet = computed(() => {
    return new LeveledPet(props.pet, currentLevel.value)
})

/**
 * 基于子区域 rc 配置，解析当前魔灵的出现子区域及权重信息。
 */
const petSpawnLocations = computed<PetSpawnLocation[]>(() => {
    const spawnLocations: PetSpawnLocation[] = []

    for (const subRegion of subRegionData) {
        if (!subRegion.rc?.length) {
            continue
        }

        const rcWeights: { rcId: number; petWeight: number; totalWeight: number; ratio: number }[] = []
        let totalWeight = 0

        for (const randomCreator of subRegion.rc) {
            const rcTotalWeight = randomCreator.info.reduce((sum, randomInfo) => sum + randomInfo.w, 0)
            let petWeight = 0
            for (const randomInfo of randomCreator.info) {
                if (randomInfo.id === props.pet.id) {
                    petWeight += randomInfo.w
                }
            }

            if (petWeight > 0 && rcTotalWeight > 0) {
                rcWeights.push({
                    rcId: randomCreator.id,
                    petWeight,
                    totalWeight: rcTotalWeight,
                    ratio: petWeight / rcTotalWeight,
                })
                totalWeight += petWeight
            }
        }

        if (totalWeight <= 0) {
            continue
        }

        spawnLocations.push({
            subRegionId: subRegion.id,
            subRegionName: subRegion.name,
            regionName: regionMap.get(subRegion.rid)?.name || `区域${subRegion.rid}`,
            totalWeight,
            rcWeights,
        })
    }

    return spawnLocations.sort((a, b) => b.totalWeight - a.totalWeight || a.subRegionId - b.subRegionId)
})

/**
 * 将比值格式化为百分比文本。
 * @param ratio 占比值（0-1）
 * @returns 百分比字符串
 */
function formatPercent(ratio: number): string {
    return `${(ratio * 100).toFixed(2)}%`
}

watch(
    () => props.pet,
    () => {
        currentLevel.value = props.pet.最大等级 > 1 ? 3 : 0
    }
)

/**
 * 根据品质值获取标签颜色样式。
 * @param quality 品质值
 * @returns 颜色样式类名
 */
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

/**
 * 根据品质值获取品质名称。
 * @param quality 品质值
 * @returns 品质名称
 */
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

/**
 * 根据类型值获取魔灵类型名称。
 * @param type 类型值
 * @returns 类型名称
 */
function getTypeName(type: number): string {
    const typeMap: Record<number, string> = {
        1: "活力魔灵",
        2: "失活魔灵",
        3: "活动魔灵",
    }
    return typeMap[type] || type.toString()
}

/**
 * 通过魔灵 id 获取名称。
 * @param id 魔灵 id
 * @returns 魔灵名称
 */
function getPrmName(id: number): string {
    return petMap.get(id)?.名称 || id.toString()
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-3">
            <SRouterLink :to="`/db/pet/${pet.id}`" class="text-lg font-bold link link-primary">
                {{ $t(pet.名称) }}
            </SRouterLink>
            <span class="text-xs text-base-content/70">ID: {{ pet.id }}</span>
            <div class="text-sm text-base-content/70 flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded" :class="getQualityColor(pet.品质)">
                    {{ $t(getQualityName(pet.品质)) }}
                </span>
                <span class="px-1.5 py-0.5 rounded bg-base-300">{{ $t(getTypeName(pet.类型)) }}</span>
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

        <div v-if="pet.描述" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">描述</div>
            <div class="text-sm">
                <span>{{ pet.描述 }}</span>
            </div>
        </div>

        <div v-if="pet.异化 && pet.异化 !== pet.id" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">异化</div>
            <div class="text-sm">
                <span>{{ $t(getPrmName(pet.异化)) }}</span>
            </div>
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
                    :max="pet.最大等级 > 1 ? 3 : 0"
                    step="1"
                />
            </div>
            <div class="text-xs text-base-content/50 mt-1">突破等级 (0-3)</div>
        </div>

        <div v-if="leveledPet.主动" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">
                主动技能
                <span class="text-xs text-base-content/70">CD: {{ leveledPet.主动.cd }}</span>
            </div>
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

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">刷新区域</div>
            <div v-if="petSpawnLocations.length" class="space-y-2">
                <div
                    v-for="location in petSpawnLocations"
                    :key="location.subRegionId"
                    class="p-2 rounded bg-base-100 border border-base-300/60"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-sm font-medium">{{ location.subRegionName }}</span>
                        <span class="text-xs text-base-content/70">点位: {{ location.rcWeights.length }}</span>
                    </div>
                    <div class="text-xs text-base-content/60 mt-1">
                        <span>{{ location.regionName }}</span>
                        <span class="mx-1">·</span>
                        <span>ID: {{ location.subRegionId }}</span>
                    </div>
                    <div class="flex flex-wrap gap-1 mt-2">
                        <span
                            v-for="rcWeight in location.rcWeights"
                            :key="`${location.subRegionId}-${rcWeight.rcId}`"
                            class="px-1.5 py-0.5 rounded bg-base-300 text-xs"
                        >
                            RC {{ rcWeight.rcId }}: {{ rcWeight.petWeight }}/{{ rcWeight.totalWeight }} ({{
                                formatPercent(rcWeight.ratio)
                            }})
                        </span>
                    </div>
                </div>
            </div>
            <div v-else class="text-sm text-base-content/70">大世界不刷新该魔灵。</div>
        </div>
    </div>
</template>
