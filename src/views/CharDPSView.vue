<script setup lang="ts">
import { computed, ref } from "vue"
import { type DPS, dpsListQuery } from "@/api/graphql"
import { charMap } from "../data"

// 状态管理
const searchQuery = ref("")
const sortBy = ref("dpsValue")
const selectedTier = ref<string | null>(null)
const pageSize = 20

// 定义Tier等级
interface Tier {
    level: string
    range: string
    min: number
    max: number
    count: number
}

// 查询变量
const variables = computed(() => ({
    sortBy: sortBy.value,
}))

// 计算Tier等级
const getTierLevel = (dpsValue: number): string => {
    if (dpsValue >= 100000000) return "S+"
    if (dpsValue >= 50000000) return "S"
    if (dpsValue >= 30000000) return "A+"
    if (dpsValue >= 20000000) return "A"
    if (dpsValue >= 10000000) return "B"
    return "C"
}

// 获取Tier颜色
const getTierColor = (tierLevel: string): string => {
    switch (tierLevel) {
        case "S+":
            return "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
        case "S":
            return "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
        case "A+":
            return "bg-gradient-to-r from-green-500 to-emerald-500 text-white"
        case "A":
            return "bg-gradient-to-r from-yellow-500 to-amber-500 text-white"
        case "B":
            return "bg-gradient-to-r from-orange-500 to-red-500 text-white"
        case "C":
            return "bg-gradient-to-r from-gray-500 to-slate-500 text-white"
        default:
            return "bg-white text-gray-800"
    }
}

// Tier列表
const tiers = computed<Tier[]>(() => {
    const tierRanges = [
        { level: "S+", min: 100000000, max: Infinity },
        { level: "S", min: 50000000, max: 100000000 - 1 },
        { level: "A+", min: 30000000, max: 50000000 - 1 },
        { level: "A", min: 20000000, max: 30000000 - 1 },
        { level: "B", min: 10000000, max: 20000000 - 1 },
        { level: "C", min: 0, max: 10000000 - 1 },
    ]

    return tierRanges.map(tier => {
        return {
            ...tier,
            count: 0,
            range:
                tier.max === Infinity ? `${tier.min.toLocaleString()}以上` : `${tier.min.toLocaleString()} - ${tier.max.toLocaleString()}`,
        }
    })
})

// Tier筛选
const filterByTier = (tierLevel: string) => {
    selectedTier.value = selectedTier.value === tierLevel ? null : tierLevel
}

// 筛选后的DPS列表
const filterDPSList = (dpsList: DPS[]) => {
    let filtered = [...dpsList]

    // 搜索筛选
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        filtered = filtered.filter(item => {
            const charName = charMap.get(item.charId)?.名称?.toLowerCase() || ""
            const faction = charMap.get(item.charId)?.阵营?.toLowerCase() || ""
            return charName.includes(query) || faction.includes(query)
        })
    }

    // Tier筛选
    if (selectedTier.value) {
        const tier = tiers.value.find((t: Tier) => t.level === selectedTier.value)
        if (tier) {
            filtered = filtered.filter(item => item.dpsValue >= tier.min && item.dpsValue <= tier.max)
        }
    }

    return filtered
}
</script>
<template>
    <div class="char-dps-view">
        <div class="container mx-auto px-4 py-6">
            <h1 class="text-3xl font-bold mb-6 text-center">角色DPS排行榜</h1>

            <!-- 筛选和搜索区域 -->
            <div class="bg-white rounded-lg shadow-md p-4 mb-6">
                <div class="flex flex-wrap gap-4 items-center">
                    <div class="flex-1 min-w-50">
                        <input
                            v-model="searchQuery"
                            type="text"
                            placeholder="搜索角色..."
                            class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <select v-model="sortBy" class="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="dpsValue">按DPS值排序</option>
                            <option value="createdAt">按创建时间排序</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- DPS列表和Tier List -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Tier List -->
                <div class="lg:col-span-1">
                    <div class="bg-white rounded-lg shadow-md p-4">
                        <h2 class="text-xl font-bold mb-4">Tier List</h2>
                        <div class="space-y-2">
                            <div
                                v-for="tier in tiers"
                                :key="tier.level"
                                class="p-3 rounded-lg cursor-pointer transition-all hover:shadow-lg"
                                :class="getTierColor(tier.level)"
                                @click="filterByTier(tier.level)"
                            >
                                <div class="flex items-center justify-between">
                                    <span class="font-bold">{{ tier.level }} Tier</span>
                                    <span class="bg-white text-gray-800 px-2 py-1 rounded-full text-sm">{{ tier.count }}个角色</span>
                                </div>
                                <div class="text-sm text-white mt-1">{{ tier.range }}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-2">
                    <div class="bg-white rounded-lg shadow-md p-4">
                        <h2 class="text-xl font-bold mb-4">角色DPS列表</h2>

                        <GQAutoPage
                            v-slot="{ data: dpsList }"
                            class="flex-1 overflow-hidden"
                            inner-class="flex w-full h-full flex-col gap-2"
                            :limit="pageSize"
                            :query="dpsListQuery"
                            :variables="variables"
                        >
                            <div v-if="dpsList && dpsList.length > 0" class="space-y-4">
                                <div
                                    v-for="(dpsItem, index) in filterDPSList(dpsList)"
                                    :key="dpsItem.id"
                                    class="border rounded-lg p-4 hover:shadow-md transition-shadow"
                                    :class="getTierColor(getTierLevel(dpsItem.dpsValue))"
                                >
                                    <div class="flex justify-between items-start">
                                        <div>
                                            <div class="flex items-center">
                                                <span class="text-lg font-bold">{{
                                                    charMap.get(dpsItem.charId)?.名称 || `角色${dpsItem.charId}`
                                                }}</span>
                                                <span class="ml-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">
                                                    #{{ index + 1 }}
                                                </span>
                                            </div>
                                            <p class="text-sm text-gray-600 mt-1">
                                                {{ charMap.get(dpsItem.charId)?.阵营 }} · {{ charMap.get(dpsItem.charId)?.属性 }}
                                            </p>
                                        </div>
                                        <div class="text-right">
                                            <div class="text-2xl font-bold text-green-600">{{ dpsItem.dpsValue.toLocaleString() }} DPS</div>
                                            <div class="text-sm text-gray-500 mt-1">
                                                {{ new Date(dpsItem.createdAt).toLocaleString() }}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 详细信息 -->
                                    <div class="mt-3 text-sm">
                                        <div v-if="dpsItem.buildId" class="mb-1">
                                            <span class="font-semibold">构建ID:</span> {{ dpsItem.buildId }}
                                        </div>
                                        <div v-if="dpsItem.timelineId" class="mb-1">
                                            <span class="font-semibold">时间线ID:</span> {{ dpsItem.timelineId }}
                                        </div>
                                        <div v-if="dpsItem.details" class="mt-2 p-2 bg-gray-50 rounded">
                                            <span class="font-semibold">详细信息:</span>
                                            <p class="mt-1">{{ dpsItem.details }}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 无数据状态 -->
                            <div v-else class="text-center py-10 text-gray-500">
                                <p>暂无DPS数据</p>
                            </div>
                        </GQAutoPage>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
