<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { petMap, resourceMap } from "@/data"
import { regionMap } from "@/data/d/region.data"
import shopData from "@/data/d/shop.data"
import { subRegionData } from "@/data/d/subregion.data"
import type { Pet } from "../data/data-types"
import { LeveledPet } from "../data/leveled/LeveledPet"

const props = defineProps<{
    pet: Pet
}>()

interface PetSpawnLocation {
    subRegionId: number
    subRegionName: string
    regionId: number
    regionName: string
    totalWeight: number
    rcWeights: { rcId: number; rcIndex: number; petWeight: number; totalWeight: number; ratio: number }[]
}

interface PetShopSource {
    key: string
    shopId: string
    shopName: string
    mainTabName: string
    subTabName: string
    subTabId: number
    price: number
    priceName: string
    timeStart?: number
    timeEnd?: number
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

        const rcWeights: { rcId: number; rcIndex: number; petWeight: number; totalWeight: number; ratio: number }[] = []
        let totalWeight = 0

        for (const [rcIndex, randomCreator] of subRegion.rc.entries()) {
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
                    rcIndex,
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
            regionId: subRegion.rid,
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

/**
 * 将时间戳格式化为可读的时间区间。
 * @param start 开始时间戳
 * @param end 结束时间戳
 * @returns 时间区间文本
 */
function formatTimeRange(start: number, end?: number) {
    const formatTime = (timestamp: number) =>
        new Date(timestamp * 1000).toLocaleString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        })

    return `${formatTime(start)}~${end ? formatTime(end) : "至今"}`
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

/**
 * 通过魔灵 id 获取图标地址。
 * @param id 魔灵 id
 * @returns 图标 URL
 */
function getPrmIconUrl(id: number): string {
    const pet = petMap.get(id)
    return pet?.icon ? `/imgs/webp/T_Head_Pet_${pet.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 根据价格名称获取资源图标。
 * @param priceName 价格资源名称
 * @returns 资源图标 URL
 */
function getPriceIcon(priceName: string): string {
    const priceResource = resourceMap.get(priceName)
    return priceResource?.icon ? `/imgs/res/${priceResource.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 收集当前魔灵的商店来源信息。
 * @param pet 魔灵数据
 * @returns 商店来源列表
 */
function collectPetShopSources(pet: Pet): PetShopSource[] {
    const result: PetShopSource[] = []
    const sourceKeySet = new Set<string>()

    shopData.forEach(shop => {
        shop.mainTabs.forEach(mainTab => {
            mainTab.subTabs.forEach(subTab => {
                subTab.items.forEach(item => {
                    if (item.itemType !== "Pet" || item.typeId !== pet.id) {
                        return
                    }

                    const key = `shop-${shop.id}-${mainTab.id}-${subTab.id}-${item.id}-${pet.id}`
                    if (sourceKeySet.has(key)) {
                        return
                    }

                    sourceKeySet.add(key)
                    result.push({
                        key,
                        shopId: shop.id,
                        shopName: shop.name,
                        mainTabName: mainTab.name,
                        subTabName: subTab.name,
                        subTabId: subTab.id,
                        price: item.price,
                        priceName: item.priceName,
                        timeStart: item.startTime,
                        timeEnd: item.endTime,
                    })
                })
            })
        })
    })

    return result
}

/**
 * 当前魔灵的商店来源列表。
 */
const petShopSources = computed<PetShopSource[]>(() => collectPetShopSources(props.pet))
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
            <div class="flex items-center gap-2 text-sm">
                <img :src="getPrmIconUrl(pet.异化)" :alt="getPrmName(pet.异化)" class="w-6 h-6 rounded object-cover bg-base-300" />
                <SRouterLink :to="`/db/pet/${pet.异化}`" class="hover:underline">
                    {{ $t(getPrmName(pet.异化)) }}
                </SRouterLink>
            </div>
        </div>

        <div v-if="pet.最大等级 > 1">
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
                        <SRouterLink
                            v-for="rcWeight in location.rcWeights"
                            :key="`${location.subRegionId}-${rcWeight.rcId}-${rcWeight.rcIndex}`"
                            class="px-1.5 py-0.5 rounded bg-base-300 text-xs hover:bg-primary/20 transition-colors"
                            :to="{
                                name: 'map-local',
                                query: {
                                    regionId: location.regionId,
                                    subRegionId: location.subRegionId,
                                    rcId: rcWeight.rcId,
                                    rcIndex: rcWeight.rcIndex,
                                },
                            }"
                        >
                            RC {{ rcWeight.rcId }}: {{ rcWeight.petWeight }}/{{ rcWeight.totalWeight }} ({{
                                formatPercent(rcWeight.ratio)
                            }})
                        </SRouterLink>
                    </div>
                </div>
            </div>
            <div v-else class="text-sm text-base-content/70">大世界不刷新该魔灵。</div>
        </div>

        <div v-if="petShopSources.length > 0" class="space-y-2">
            <div class="text-xs text-base-content/60">商店购买</div>
            <div v-for="source in petShopSources" :key="source.key" class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                <div class="flex justify-between items-center gap-2 mb-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <SRouterLink :to="`/db/shop/${source.shopId}/${source.subTabId}`" class="hover:underline min-w-0 truncate">
                            {{ source.mainTabName }} / {{ source.subTabName }}
                        </SRouterLink>
                        <span class="text-xs text-base-content/70">({{ source.shopName }})</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <img :src="getPriceIcon(source.priceName)" class="w-4 h-4 object-cover rounded" :alt="source.priceName" />
                        <span class="text-xs text-base-content/70">{{ source.priceName }}</span>
                        <span class="text-sm font-medium">{{ source.price }}</span>
                    </div>
                </div>
                <div v-if="source.timeStart" class="text-xs text-base-content/70">{{ formatTimeRange(source.timeStart, source.timeEnd) }}</div>
            </div>
        </div>
    </div>
</template>
