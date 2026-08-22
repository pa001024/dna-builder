<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { petMap, resourceMap } from "@/data"
import { petEntrys, petToEntey } from "@/data/d/pet.data"
import { regionMap } from "@/data/d/region.data"
import shopData from "@/data/d/shop.data"
import { subRegionData } from "@/data/d/subregion.data"
import type { Pet } from "@/data/data-types"
import { LeveledPet } from "@/data/leveled/LeveledPet"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const props = defineProps<{
    pet: Pet
}>()

const { t } = useTranslation()

interface PetSpawnLocation {
    subRegionId: number
    subRegionName: string
    regionId: number
    regionName: string
    totalWeight: number
    spotCount: number
    refreshCount: number
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

interface PetEntrySource {
    entryId: number
    entryName: string
    entryIcon: string
    entryDesc: string
    weight: number
}

const groupPetSourcesByWeight = ref(true)

/**
 * 将权重格式化为百分比文本。
 * @param weight 原始权重
 * @returns 格式化文本
 */
function formatWeight(weight: number): string {
    return `${weight.toFixed(3)}%`
}

const currentLevel = ref(props.pet.最大等级 > 1 ? 5 : 0)

/**
 * 经验仅随滑块等级变化，不受“老道”开关影响。
 */
const displayedExperience = computed(() => Math.floor(50 * currentLevel.value))

const leveledPet = computed(() => {
    return new LeveledPet(props.pet, currentLevel.value - 1)
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
        let spotCount = 0
        let refreshCount = 0

        for (const [rcIndex, randomCreator] of subRegion.rc.entries()) {
            const rcTotalWeight = randomCreator.info.reduce((sum, randomInfo) => sum + randomInfo.w, 0)
            const rcSpotCount = randomCreator.pos?.length || 0
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
                spotCount += rcSpotCount
                refreshCount += randomCreator.count
            }
        }

        if (totalWeight <= 0) {
            continue
        }

        spawnLocations.push({
            subRegionId: subRegion.id,
            subRegionName: subRegion.name,
            regionId: subRegion.rid,
            regionName: regionMap.get(subRegion.rid)?.name || t("pet_detail.region_fallback", { id: subRegion.rid }),
            totalWeight,
            spotCount,
            refreshCount,
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

    return `${formatTime(start)}~${end ? formatTime(end) : t("pet_detail.until_now")}`
}

watch(
    () => props.pet,
    () => {
        currentLevel.value = props.pet.最大等级 > 1 ? 5 : 0
    }
)

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

/**
 * 收集当前失活魔灵对应的魔灵潜质来源。
 */
const petToEnteySources = computed<PetEntrySource[]>(() => {
    if (props.pet.类型 !== 2) {
        return []
    }

    const sources: PetEntrySource[] = []
    const entryWeightMap = petToEntey[String(props.pet.id)]
    if (!entryWeightMap) {
        return sources
    }

    for (const [entryIdText, weight] of Object.entries(entryWeightMap)) {
        const entryId = Number(entryIdText)
        const entry = petEntrys.find(item => item.id === entryId)
        if (!entry) {
            continue
        }

        sources.push({
            entryId,
            entryName: entry.name,
            entryIcon: entry.icon,
            entryDesc: entry.desc,
            weight,
        })
    }

    return sources.sort((a, b) => b.weight - a.weight || a.entryId - b.entryId)
})

interface PetSourceGroup {
    weight: number
    sources: PetEntrySource[]
}

const groupedPetToEnteySources = computed<PetSourceGroup[]>(() => {
    if (!groupPetSourcesByWeight.value) {
        return []
    }

    const groupMap = new Map<string, PetEntrySource[]>()
    for (const source of petToEnteySources.value) {
        const key = source.weight.toFixed(6)
        if (!groupMap.has(key)) {
            groupMap.set(key, [])
        }
        groupMap.get(key)!.push(source)
    }

    return Array.from(groupMap.entries())
        .map(([key, sources]) => ({
            weight: Number(key),
            sources: [...sources].sort((a, b) => a.entryId - b.entryId),
        }))
        .sort((a, b) => b.weight - a.weight)
})
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 详情头部：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <div class="flex items-start gap-3.5">
                <div class="size-20 shrink-0 overflow-hidden rounded-xs bg-linear-15 sm:size-24" :class="getRarityGradientClass(pet.品质)">
                    <ImageFallback :src="leveledPet.url" :alt="pet.名称" class="h-full w-full object-cover">
                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="pet.名称" class="h-full w-full object-cover" />
                    </ImageFallback>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Pet File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/pet/${pet.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(pet.名称) }}
                        </SRouterLink>
                        <CopyID :id="pet.id" />
                        <span
                            class="ml-auto shrink-0 rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] tracking-wide text-base-content/55"
                        >
                            {{ $t(getTypeName(pet.类型)) }}
                        </span>
                    </div>
                    <!-- 元信息行：最大等级 / 捕获经验 / 当前经验 -->
                    <div class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                        <span>{{ $t("pet_detail.max_level") }}: {{ pet.最大等级 }}</span>
                        <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                        <span>{{ $t("pet_detail.capture_exp") }}: {{ pet.捕获经验 }}</span>
                        <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                        <span>
                            {{ $t("pet_detail.exp") }}:
                            <b class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ displayedExperience }}</b>
                        </span>
                    </div>
                </div>
            </div>
        </header>

        <!-- 描述 -->
        <section v-if="pet.描述" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="PROFILE" :title="$t('pet_detail.description')" />
            <div
                class="mt-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-relaxed whitespace-pre-line text-base-content/85"
            >
                {{ pet.描述 }}
            </div>
        </section>

        <!-- 异化形态 -->
        <section
            v-if="pet.异化 && pet.异化 !== pet.id"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="VARIANT" :title="$t('pet_detail.alternative_form')" />
            <div class="mt-2 flex items-center gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <img
                    :src="getPrmIconUrl(pet.异化)"
                    :alt="getPrmName(pet.异化)"
                    class="size-10 shrink-0 rounded-xs object-cover bg-base-content/3"
                />
                <SRouterLink
                    :to="`/db/pet/${pet.异化}`"
                    class="truncate text-sm font-medium transition-colors duration-150 hover:text-primary"
                >
                    {{ $t(getPrmName(pet.异化)) }}
                </SRouterLink>
            </div>
        </section>

        <!-- 等级调整 -->
        <section v-if="pet.最大等级 > 1" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVEL" />
            <LevelSlider v-model="currentLevel" :max="5" :step="1" />
        </section>

        <!-- 主动技能 -->
        <section v-if="leveledPet.主动" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ACTIVE" :title="$t('pet_detail.active_skill')">
                <template #trailing>
                    <span class="font-mono text-[11px] tabular-nums text-base-content/45">CD: {{ leveledPet.主动.cd }}</span>
                </template>
            </SectionHeader>
            <div
                class="mt-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-relaxed whitespace-pre-wrap text-base-content/85"
            >
                {{ leveledPet.主动.描述 }}
            </div>
        </section>

        <!-- 被动技能 -->
        <section v-if="leveledPet.被动" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="PASSIVE" :title="$t('pet_detail.passive_skill')" />
            <div
                class="mt-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-relaxed whitespace-pre-wrap text-base-content/85"
            >
                {{ leveledPet.被动.描述 }}
            </div>
        </section>

        <!-- 出现区域 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SPAWN" :title="$t('pet_detail.spawn_area')" />
            <div v-if="petSpawnLocations.length" class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(500px,1fr))] gap-2">
                <div
                    v-for="location in petSpawnLocations"
                    :key="location.subRegionId"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <SubRegionLink :sub-region-id="location.subRegionId" />
                        <div class="text-[11px] text-base-content/55">
                            <span>{{ location.regionName }}</span>
                        </div>
                        <div class="flex-1"></div>
                        <span class="text-[11px] tabular-nums text-base-content/50">
                            {{ $t("pet_detail.spot_count") }}: {{ location.spotCount }} | {{ $t("pet_detail.refresh_count") }}:
                            {{ location.refreshCount }}
                        </span>
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1">
                        <SRouterLink
                            v-for="rcWeight in location.rcWeights"
                            :key="`${location.subRegionId}-${rcWeight.rcId}-${rcWeight.rcIndex}`"
                            class="cursor-pointer rounded-xs border border-base-content/15 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
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
                            {{ $t("pet_detail.rc_label") }} {{ rcWeight.rcId }}: {{ rcWeight.petWeight }}/{{ rcWeight.totalWeight }} ({{
                                formatPercent(rcWeight.ratio)
                            }})
                        </SRouterLink>
                    </div>
                </div>
            </div>
            <div v-else class="mt-2 text-sm text-base-content/70">{{ $t("pet_detail.no_spawn") }}</div>
        </section>

        <!-- 商店购买 -->
        <section v-if="petShopSources.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SHOP" :title="$t('pet_detail.shop_purchase')" />
            <div class="mt-2 space-y-2">
                <div
                    v-for="source in petShopSources"
                    :key="source.key"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40 hover:bg-base-content/5"
                >
                    <div class="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <div class="flex min-w-0 items-center gap-2">
                            <SRouterLink
                                :to="`/db/shop/${source.shopId}/${source.subTabId}`"
                                class="min-w-0 truncate text-sm font-medium transition-colors duration-150 hover:text-primary"
                            >
                                {{ source.mainTabName }} / {{ source.subTabName }}
                            </SRouterLink>
                            <span class="shrink-0 text-[11px] text-base-content/55">({{ source.shopName }})</span>
                        </div>
                        <div class="flex shrink-0 items-center gap-1">
                            <img :src="getPriceIcon(source.priceName)" class="size-4 rounded-xs object-cover" :alt="source.priceName" />
                            <span class="text-[11px] text-base-content/55">{{ source.priceName }}</span>
                            <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ source.price }}</span>
                        </div>
                    </div>
                    <div v-if="source.timeStart" class="text-[11px] tabular-nums text-base-content/50">
                        {{ formatTimeRange(source.timeStart, source.timeEnd) }}
                    </div>
                </div>
            </div>
        </section>

        <!-- 魔灵潜质来源 -->
        <section v-if="pet.类型 === 2" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ENTRY" :title="$t('pet_detail.pet_entry')" />
            <div v-if="petToEnteySources.length" class="mt-2 space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] tracking-wide text-base-content/55">{{ $t("pet_detail.group_by_weight") }}</span>
                    <input v-model="groupPetSourcesByWeight" type="checkbox" class="toggle toggle-primary toggle-sm" />
                </div>

                <template v-if="groupPetSourcesByWeight">
                    <div v-for="group in groupedPetToEnteySources" :key="group.weight" class="space-y-1">
                        <div class="px-1 text-[11px] tabular-nums text-base-content/45">
                            {{ formatWeight(group.weight) }} · {{ group.sources.length }} {{ $t("pet_detail.count_suffix") }}
                        </div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1.5">
                            <div
                                v-for="source in group.sources"
                                :key="source.entryId"
                                class="rounded-xs border border-base-content/10 bg-base-content/3 p-2"
                            >
                                <div class="flex items-center justify-between gap-2">
                                    <div class="flex min-w-0 items-center gap-2">
                                        <img
                                            :src="`/imgs/webp/T_Armory_Pet_Attr_${source.entryIcon}.webp`"
                                            class="size-6 shrink-0 rounded-xs object-cover bg-base-content/3"
                                            alt=""
                                        />
                                        <SRouterLink
                                            :to="`/db/pet/${source.entryId}`"
                                            class="truncate text-sm font-medium transition-colors duration-150 hover:text-primary"
                                        >
                                            {{ $t(source.entryName) }}
                                        </SRouterLink>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <div
                        v-for="source in petToEnteySources"
                        :key="source.entryId"
                        class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex min-w-0 items-center gap-2">
                                <img
                                    :src="`/imgs/webp/T_Armory_Pet_Attr_${source.entryIcon}.webp`"
                                    class="size-6 shrink-0 rounded-xs object-cover bg-base-content/3"
                                    alt=""
                                />
                                <SRouterLink
                                    :to="`/db/pet/${source.entryId}`"
                                    class="truncate text-sm font-medium transition-colors duration-150 hover:text-primary"
                                >
                                    {{ $t(source.entryName) }}
                                </SRouterLink>
                            </div>
                            <span class="shrink-0 font-mono text-[11px] tabular-nums text-base-content/55">{{
                                formatWeight(source.weight)
                            }}</span>
                        </div>
                        <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                            <span>ID: {{ source.entryId }}</span>
                            <span class="truncate">{{ source.entryDesc }}</span>
                        </div>
                    </div>
                </template>
            </div>
            <div v-else class="mt-2 text-sm text-base-content/70">{{ $t("pet_detail.no_pet_entry_sources") }}</div>
        </section>
    </div>
</template>
