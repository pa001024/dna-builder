<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { petMap } from "@/data/d"
import petData, { type Pet, type PetEntry, petEntrys } from "@/data/d/pet.data"
import { LeveledPet } from "@/data/leveled/LeveledPet"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedPetId = useSearchParam<number>("id", 0)
const selectedType = useSearchParam<number>("tp", 0)
const selectedQuality = useSearchParam<number>("ql", 0)
// 根据 ID 获取选中的魔灵
const selectedPet = computed<Pet | null>(() => {
    if (!selectedPetId.value || selectedType.value === 999) {
        return null
    }

    return petMap.get(selectedPetId.value) || null
})

const selectedPetEntry = computed<PetEntry | null>(() => {
    if (!selectedPetId.value || selectedType.value !== 999) {
        return null
    }

    return petEntrys.find(entry => entry.id === selectedPetId.value) || null
})

const types = computed(() => {
    const typeSet = new Set<number>()
    petData.forEach(p => {
        typeSet.add(p.类型)
    })
    // 添加潜质类型（使用一个特殊值，比如 999）
    typeSet.add(999)
    return Array.from(typeSet).sort()
})

const qualities = computed(() => {
    const qualitySet = new Set<number>()
    // 添加普通魔灵的品质值
    petData.forEach(p => {
        qualitySet.add(p.品质)
    })
    // 添加潜质的品质值（r值）
    petEntrys.forEach(entry => {
        qualitySet.add(entry.r)
    })
    return Array.from(qualitySet).sort()
})

const filteredPets = computed(() => {
    // 当选择潜质类型时，返回 petEntrys 信息
    if (selectedType.value === 999) {
        return petEntrys.filter(entry => {
            // 搜索筛选
            let matchKeyword = false
            if (searchKeyword.value === "") {
                matchKeyword = true
            } else {
                const q = searchKeyword.value
                // 直接中文匹配
                if (entry.name.includes(q)) {
                    matchKeyword = true
                } else {
                    // 拼音匹配（全拼/首字母）
                    matchKeyword = matchPinyin(entry.name, q).match
                }
            }

            // 品质筛选
            const matchQuality = selectedQuality.value === 0 || entry.r === selectedQuality.value
            return matchKeyword && matchQuality
        })
    }

    // 否则返回普通魔灵数据
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
        3: "活动魔灵",
        999: "魔灵潜质",
    }
    return typeMap[type] || type.toString()
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

/**
 * 获取魔灵列表图标的稀有度背景。
 * @param item 魔灵或潜质条目
 * @returns 稀有度背景类名
 */
function getPetIconGradientClass(item: Pet | PetEntry): string {
    if ("名称" in item) {
        return getRarityGradientClass(item.品质)
    }

    return getRarityGradientClass(item.r)
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbp-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <div
                class="flex-1 flex flex-col overflow-hidden min-w-0"
                :class="{ 'sm:border-r border-base-content/10': selectedPet || selectedPetEntry }"
            >
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索魔灵名称（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredPets.length }}
                        </span>
                    </div>
                </div>

                <!-- 筛选条件 -->
                <div class="flex-none space-y-3 border-b border-base-content/15 px-4 py-3 stagger-rise" style="animation-delay: 0.05s">
                    <!-- 类型筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">类型</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === 0
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = 0"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="type in types"
                            :key="type"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedType === type
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedType = type"
                        >
                            {{ $t(getTypeName(type)) }}
                        </button>
                    </div>

                    <!-- 品质筛选 -->
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="mr-1 shrink-0 text-[10px] text-base-content/40">品质</span>
                        <button
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedQuality === 0
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedQuality = 0"
                        >
                            {{ $t("全部") }}
                        </button>
                        <button
                            v-for="quality in qualities"
                            :key="quality"
                            class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                            :class="
                                selectedQuality === quality
                                    ? 'border-primary bg-primary font-semibold text-primary-content'
                                    : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                            "
                            @click="selectedQuality = quality"
                        >
                            {{ $t(getQualityName(quality)) }}
                        </button>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <!-- 空状态 -->
                        <div v-if="filteredPets.length === 0" class="flex flex-col items-center justify-center py-20 text-base-content/45">
                            <p class="text-sm">未找到匹配的魔灵</p>
                        </div>

                        <div v-else class="space-y-2">
                            <article
                                v-for="(item, index) in filteredPets"
                                :key="item.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedPetId === item.id
                                        ? 'dbp-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectedPetId = (item as Pet | PetEntry).id"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedPetId === item.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <!-- 图标（稀有度渐变底） -->
                                    <div
                                        class="size-12 shrink-0 overflow-hidden rounded-xs bg-linear-15"
                                        :class="getPetIconGradientClass(item as Pet | PetEntry)"
                                    >
                                        <!-- 显示潜质图标 -->
                                        <template v-if="selectedType === 999 && 'icon' in item">
                                            <img :src="`/imgs/webp/T_Armory_Pet_Attr_${item.icon}.webp`" class="h-full w-full object-cover" />
                                        </template>
                                        <!-- 显示普通魔灵图标 -->
                                        <template v-else-if="'icon' in item && '名称' in item">
                                            <img :src="LeveledPet.url(item.icon)" class="h-full w-full object-cover" />
                                        </template>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <!-- 潜质信息显示 -->
                                        <template v-if="selectedType === 999 && 'name' in item">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedPetId === item.id }"
                                            >
                                                {{ $t(item.name) }}
                                            </h3>
                                            <div class="mt-0.5 truncate text-[11px] text-base-content/45">
                                                {{ item.desc }}
                                            </div>
                                        </template>
                                        <!-- 普通魔灵信息显示 -->
                                        <template v-else-if="'名称' in item">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedPetId === item.id }"
                                            >
                                                {{ $t(item.名称) }}
                                            </h3>
                                            <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                                                <span>{{ $t(getTypeName(item.类型)) }}</span>
                                                <span>最大等级: {{ item.最大等级 }}</span>
                                                <span>捕获经验: {{ item.捕获经验 }}</span>
                                            </div>
                                        </template>
                                    </div>
                                </div>
                                <!-- 普通魔灵技能显示 -->
                                <template v-if="selectedType !== 999 && '主动' in item">
                                    <div v-if="item.主动" class="mt-2 px-3 pb-3 text-[11px] leading-relaxed text-base-content/55">
                                        <div>主动: {{ formatSkillDescription(item, "主动") }}</div>
                                    </div>
                                    <div v-if="item.被动" class="-mt-1.5 px-3 pb-3 text-[11px] leading-relaxed text-base-content/55">
                                        <div>被动: {{ formatSkillDescription(item, "被动") }}</div>
                                    </div>
                                </template>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-[11px] tracking-wide text-base-content/50">
                        共 <b class="font-orbitron text-sm font-semibold text-primary tabular-nums">{{ filteredPets.length }}</b>
                        {{ selectedType === 999 ? "个潜质" : "个魔灵" }}
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedPet || selectedPetEntry"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectedPetId = 0"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedPet" class="min-w-0 flex-1">
                <DBPetDetailItem :key="selectedPetId" :pet="selectedPet" />
            </ScrollArea>

            <ScrollArea v-else-if="selectedPetEntry" class="min-w-0 flex-1">
                <DBPetEntryDetailItem :key="selectedPetEntry?.id" :entry="selectedPetEntry" />
            </ScrollArea>
        </div>
    </div>
</template>
