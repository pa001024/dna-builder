<script lang="ts" setup>
import { computed, ref } from "vue"
import draftData from "../data/d/draft.data"
import type { Draft } from "../data/data-types"
import { matchPinyin } from "../utils/pinyin-utils"

const searchKeyword = ref("")
const selectedDraft = ref<Draft | null>(null)
const selectedType = ref<string | "">("")
const selectedRarity = ref<number | "">("")

// 获取所有可用类型
const types = computed(() => {
    const typeSet = new Set<string>()
    draftData.forEach(d => {
        typeSet.add(d.t)
    })
    return Array.from(typeSet).sort()
})

// 获取所有可用稀有度
const rarities = computed(() => {
    const raritySet = new Set<number>()
    draftData.forEach(d => {
        raritySet.add(d.r)
    })
    return Array.from(raritySet).sort((a, b) => b - a)
})

// 过滤图纸列表
const filteredDrafts = computed(() => {
    return draftData.filter(d => {
        // 搜索筛选
        let matchKeyword = false
        if (searchKeyword.value === "") {
            matchKeyword = true
        } else {
            const q = searchKeyword.value
            // 直接中文匹配
            if (d.n.includes(q)) {
                matchKeyword = true
            } else {
                // 拼音匹配（全拼/首字母）
                matchKeyword = matchPinyin(d.n, q).match
            }
        }

        const matchType = selectedType.value === "" || d.t === selectedType.value
        const matchRarity = selectedRarity.value === "" || d.r === selectedRarity.value
        return matchKeyword && matchType && matchRarity
    })
})

// 根据稀有度获取颜色
function getRarityColor(rarity: number): string {
    const colorMap: Record<number, string> = {
        1: "bg-gray-200 text-gray-800",
        2: "bg-green-200 text-green-800",
        3: "bg-blue-200 text-blue-800",
        4: "bg-purple-200 text-purple-800",
        5: "bg-yellow-200 text-yellow-800",
    }
    return colorMap[rarity] || "bg-base-200 text-base-content"
}

// 将分钟数转换为00:00格式
function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

// 获取类型名称
function getTypeName(type: string): string {
    const typeMap: Record<string, string> = {
        Mod: "魔之楔",
        Resource: "资源",
        CharAccessory: "角色配件",
        Weapon: "武器",
    }
    return typeMap[type] || type
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedDraft }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索图纸名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <!-- 筛选条件 -->
                <div class="p-2 border-b border-base-200 space-y-2">
                    <!-- 类型筛选 -->
                    <div>
                        <div class="text-xs text-base-content/70 mb-1">类型</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="selectedType === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedType = ''"
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

                    <!-- 稀有度筛选 -->
                    <div>
                        <div class="text-xs text-base-content/70 mb-1">稀有度</div>
                        <div class="flex flex-wrap gap-1 pb-1">
                            <button
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all"
                                :class="selectedRarity === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                                @click="selectedRarity = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="rarity in rarities"
                                :key="rarity"
                                class="px-3 py-0.5 text-xs rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="
                                    selectedRarity === rarity ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                "
                                @click="selectedRarity = rarity"
                            >
                                {{ ["", "白", "绿", "蓝", "紫", "金"][rarity] }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 图纸列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="draft in filteredDrafts"
                            :key="draft.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedDraft?.id === draft.id }"
                            @click="selectedDraft = draft"
                        >
                            <div class="flex items-start justify-between">
                                <div>
                                    <div class="font-medium flex gap-2 items-center">
                                        {{ draft.n }}
                                        <span class="text-xs px-2 py-0.5 rounded" :class="getRarityColor(draft.r)">
                                            {{ ["", "白", "绿", "蓝", "紫", "金"][draft.r] }}
                                        </span>
                                    </div>
                                    <div class="text-xs opacity-70 mt-1 flex gap-2">
                                        <span>{{ getTypeName(draft.t) }}</span>
                                        <span v-if="draft.v">{{ draft.v }}版本</span>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <span class="text-xs px-2 py-0.5 rounded bg-base-300 text-base-content">
                                        {{ formatDuration(draft.d) }}
                                    </span>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-2 mt-2 text-xs opacity-70">
                                <span>产物数量: {{ draft.c }}</span>
                                <span v-if="draft.b">批量制造</span>
                                <span v-if="draft.i">无限制造</span>
                                <span v-if="!draft.s">隐藏</span>
                                <span class="ml-auto">ID: {{ draft.id }}</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredDrafts.length }} 个图纸
                </div>
            </div>
            <div
                v-if="selectedDraft"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedDraft = null"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedDraft" class="flex-1">
                <DBDraftDetailItem :draft="selectedDraft" />
            </ScrollArea>
        </div>
    </div>
</template>
