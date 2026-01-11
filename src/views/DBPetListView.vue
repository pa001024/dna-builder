<script lang="ts" setup>
import { ref, computed } from "vue"
import petData from "../data/d/pet.data"
import type { Pet } from "../data/data-types"
import { LeveledPet } from "../data/leveled/LeveledPet"
import { matchPinyin } from "../utils/pinyin-utils"

const searchKeyword = ref("")
const selectedPet = ref<Pet | null>(null)
const selectedType = ref<number | 0>(0)
const selectedQuality = ref<number | 0>(0)

const types = computed(() => {
    const typeSet = new Set<number>()
    petData.forEach(p => {
        typeSet.add(p.类型)
    })
    return Array.from(typeSet).sort()
})

const qualities = computed(() => {
    const qualitySet = new Set<number>()
    petData.forEach(p => {
        qualitySet.add(p.品质)
    })
    return Array.from(qualitySet).sort()
})

const filteredPets = computed(() => {
    return petData.filter(p => {
        // 搜索筛选
        let matchKeyword = false
        if (searchKeyword.value === "") {
            matchKeyword = true
        } else {
            const q = searchKeyword.value
            // 直接中文匹配
            if (p.名称.includes(q)) {
                matchKeyword = true
            } else {
                // 拼音匹配（全拼/首字母）
                matchKeyword = matchPinyin(p.名称, q).match
            }
        }

        const matchType = selectedType.value === 0 || p.类型 === selectedType.value
        const matchQuality = selectedQuality.value === 0 || p.品质 === selectedQuality.value
        return matchKeyword && matchType && matchQuality
    })
})

function getTypeName(type: number): string {
    const typeMap: Record<number, string> = {
        1: "活力魔灵",
        2: "失活魔灵",
    }
    return typeMap[type] || type.toString()
}

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

function formatSkillDescription(pet: Pet, type: "主动" | "被动"): string {
    const leveledPet = new LeveledPet(pet, 0)
    const skill = type === "主动" ? leveledPet.主动 : leveledPet.被动
    if (!skill) return ""
    return skill.描述
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedPet }">
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索魔灵名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <div class="p-2 border-b border-base-200 space-y-2">
                    <div>
                        <div class="text-xs text-base-content/70 mb-1">类型</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="selectedType === 0 ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedType = 0"
                            >
                                全部
                            </button>
                            <button
                                v-for="type in types"
                                :key="type"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="selectedType === type ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedType = type"
                            >
                                {{ getTypeName(type) }}
                            </button>
                        </div>
                    </div>

                    <div>
                        <div class="text-xs text-base-content/70 mb-1">品质</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="selectedQuality === 0 ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedQuality = 0"
                            >
                                全部
                            </button>
                            <button
                                v-for="quality in qualities"
                                :key="quality"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="
                                    selectedQuality === quality
                                        ? 'bg-primary text-white'
                                        : 'bg-base-200 text-base-content hover:bg-base-300'
                                "
                                @click="selectedQuality = quality"
                            >
                                {{ getQualityName(quality) }}
                            </button>
                        </div>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="pet in filteredPets"
                            :key="pet.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedPet?.id === pet.id }"
                            @click="selectedPet = pet"
                        >
                            <div class="flex items-start justify-between">
                                <div>
                                    <div class="font-medium flex gap-2 items-center">
                                        {{ pet.名称 }}
                                        <span class="text-xs px-2 py-0.5 rounded" :class="getQualityColor(pet.品质)">
                                            {{ getQualityName(pet.品质) }}
                                        </span>
                                    </div>
                                    <div class="text-xs opacity-70 mt-1 flex gap-2">
                                        <span>{{ getTypeName(pet.类型) }}</span>
                                        <span>最大等级: {{ pet.最大等级 }}</span>
                                    </div>
                                </div>
                            </div>
                            <div v-if="pet.主动" class="mt-2 text-xs opacity-70">
                                <div>主动: {{ formatSkillDescription(pet, "主动") }}</div>
                            </div>
                            <div v-if="pet.被动" class="mt-1 text-xs opacity-70">
                                <div>被动: {{ formatSkillDescription(pet, "被动") }}</div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">共 {{ filteredPets.length }} 个魔灵</div>
            </div>
            <div
                v-if="selectedPet"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedPet = null"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <div v-if="selectedPet" class="flex-1 overflow-hidden">
                <DBPetDetailItem :pet="selectedPet" />
            </div>
        </div>
    </div>
</template>
