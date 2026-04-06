<script lang="ts" setup>
import { computed, ref } from "vue"
import { petMap } from "@/data"
import { type PetEntry, petToEntey } from "../data/d/pet.data"

const props = defineProps<{
    entry: PetEntry
}>()

interface EntryPetSource {
    petId: number
    petName: string
    petType: number
    petIcon: string
    petDesc: string
    weight: number
}

const groupSourcePetsByWeight = ref(true)

/**
 * 根据魔灵类型获取名称。
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
 * 将权重格式化为百分比文本。
 * @param weight 原始权重
 * @returns 格式化文本
 */
function formatWeight(weight: number): string {
    return `${weight.toFixed(3)}%`
}

/**
 * 收集会产出当前魔灵潜质的失活魔灵来源。
 */
const entryPetSources = computed<EntryPetSource[]>(() => {
    const sources: EntryPetSource[] = []

    for (const [petIdText, entryWeightMap] of Object.entries(petToEntey)) {
        const weight = entryWeightMap[props.entry.id]
        if (!weight) {
            continue
        }

        const petId = Number(petIdText)
        const pet = petMap.get(petId)
        if (!pet || pet.类型 !== 2) {
            continue
        }

        sources.push({
            petId,
            petName: pet.名称,
            petType: pet.类型,
            petIcon: pet.icon,
            petDesc: pet.描述,
            weight,
        })
    }

    return sources.sort((a, b) => b.weight - a.weight || a.petId - b.petId)
})

interface EntryPetSourceGroup {
    weight: number
    sources: EntryPetSource[]
}

const groupedEntryPetSources = computed<EntryPetSourceGroup[]>(() => {
    if (!groupSourcePetsByWeight.value) {
        return []
    }

    const groupMap = new Map<string, EntryPetSource[]>()
    for (const source of entryPetSources.value) {
        const key = source.weight.toFixed(6)
        if (!groupMap.has(key)) {
            groupMap.set(key, [])
        }
        groupMap.get(key)!.push(source)
    }

    return Array.from(groupMap.entries())
        .map(([key, sources]) => ({
            weight: Number(key),
            sources: [...sources].sort((a, b) => a.petId - b.petId),
        }))
        .sort((a, b) => b.weight - a.weight)
})
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-3">
            <span class="text-lg font-bold">{{ $t(entry.name) }}</span>
            <CopyID :id="entry.id" />
            <span class="text-xs text-base-content/70">{{ $t("pet_detail.base_id") }}: {{ entry.bid }}</span>
            <span class="text-xs px-2 py-0.5 rounded" :class="getQualityColor(entry.r)">
                {{ $t(getQualityName(entry.r)) }}
            </span>
        </div>

        <div class="flex justify-center items-center">
            <img :src="`/imgs/webp/T_Armory_Pet_Attr_${entry.icon}.webp`" class="w-24 object-cover rounded" />
        </div>

        <div class="flex flex-wrap gap-2 text-sm opacity-70">
            <span>{{ $t("pet_detail.name") }}: {{ $t(entry.name) }}</span>
            <span>{{ $t("pet_detail.rarity") }}: {{ $t(getQualityName(entry.r)) }}</span>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">{{ $t("pet_detail.effect") }}</div>
            <div class="text-sm">
                <span>{{ entry.desc }}</span>
            </div>
        </div>

        <div v-if="entry.upid" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">{{ $t("pet_detail.next_level") }}</div>
            <div class="text-sm flex items-center gap-2">
                <SRouterLink :to="`/db/pet/${entry.upid}`" class="hover:underline">
                    {{ $t(entry.name) }}
                </SRouterLink>
                <CopyID :id="entry.upid" />
            </div>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">{{ $t("pet_detail.corresponding_inactive") }}</div>
            <div v-if="entryPetSources.length" class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs text-base-content/60">{{ $t("pet_detail.group_by_weight") }}</span>
                    <input v-model="groupSourcePetsByWeight" type="checkbox" class="toggle toggle-primary toggle-sm" />
                </div>

                <template v-if="groupSourcePetsByWeight">
                    <div v-for="group in groupedEntryPetSources" :key="group.weight" class="space-y-1">
                        <div class="text-xs text-base-content/60 px-1">
                            {{ formatWeight(group.weight) }} · {{ group.sources.length }} {{ $t("pet_detail.count_suffix") }}
                        </div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1">
                            <div
                                v-for="source in group.sources"
                                :key="source.petId"
                                class="p-2 rounded bg-base-100 border border-base-300/60"
                            >
                                <div class="flex items-center justify-between gap-2">
                                    <div class="flex items-center gap-2 min-w-0">
                                        <img
                                            :src="`/imgs/webp/T_Head_Pet_${source.petIcon}.webp`"
                                            class="w-6 h-6 rounded object-cover bg-base-300"
                                        />
                                        <SRouterLink :to="`/db/pet/${source.petId}`" class="font-medium hover:underline truncate">
                                            {{ $t(source.petName) }}
                                        </SRouterLink>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <div v-for="source in entryPetSources" :key="source.petId" class="p-2 rounded bg-base-100 border border-base-300/60">
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2 min-w-0">
                                <img
                                    :src="`/imgs/webp/T_Head_Pet_${source.petIcon}.webp`"
                                    class="w-6 h-6 rounded object-cover bg-base-300"
                                />
                                <SRouterLink :to="`/db/pet/${source.petId}`" class="font-medium hover:underline truncate">
                                    {{ $t(source.petName) }}
                                </SRouterLink>
                            </div>
                            <span class="text-xs text-base-content/70">{{ formatWeight(source.weight) }}</span>
                        </div>
                        <div class="text-xs text-base-content/60 mt-1 flex flex-wrap gap-2">
                            <span>ID: {{ source.petId }}</span>
                            <span>{{ $t(getTypeName(source.petType)) }}</span>
                            <span class="truncate">{{ source.petDesc }}</span>
                        </div>
                    </div>
                </template>
            </div>
            <div v-else class="text-sm text-base-content/70">{{ $t("pet_detail.no_sources") }}</div>
        </div>
    </div>
</template>
