<script lang="ts" setup>
import { ref, computed } from "vue"
import { useRouter } from "vue-router"
import monsterData from "../data/d/monster.data"
import type { Monster } from "../data/data-types"
import { Faction } from "../data/data-types"

const router = useRouter()

const searchKeyword = ref("")
const selectedFaction = ref<number | "all">("all")

// 获取所有可用阵营
const factions = computed(() => {
    const factionSet = new Set<number>()
    monsterData.forEach((m) => {
        if (m.阵营 !== undefined) {
            factionSet.add(m.阵营)
        }
    })
    return Array.from(factionSet).sort((a, b) => a - b)
})

// 过滤怪物列表
const filteredMonsters = computed(() => {
    return monsterData.filter((m) => {
        if (m.id < 2000000) return false
        const matchKeyword = searchKeyword.value === "" || m.名称.includes(searchKeyword.value)
        const matchFaction = selectedFaction.value === "all" || m.阵营 === selectedFaction.value
        return matchKeyword && matchFaction
    })
})

// 根据阵营ID获取阵营名称
function getFactionName(faction: number | undefined): string {
    if (faction === undefined) return "其他"
    return Faction[faction] || `阵营${faction}`
}

// 跳转到怪物详情页
function navigateToMonsterDetail(monster: Monster) {
    router.push(`/db/monster/${monster.id}`)
}
</script>

<template>
    <div class="monster-list h-screen flex flex-col bg-base-100 text-base-content">
        <!-- 筛选和搜索区域 -->
        <div class="p-6 border-b border-base-200 bg-base-100">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <!-- 搜索框 -->
                <div class="relative lg:col-span-2">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索怪物名称..."
                        class="w-full px-4 py-3 pl-12 bg-base-200 border border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder-base-content/50"
                    />
                    <svg
                        class="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        ></path>
                    </svg>
                </div>

                <!-- 阵营筛选 -->
                <Select
                    v-model="selectedFaction"
                    class="w-full px-4 py-3 bg-base-200 border border-base-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                >
                    <SelectItem value="all">全部阵营</SelectItem>
                    <SelectItem v-for="faction in factions" :key="faction" :value="faction">
                        {{ getFactionName(faction) }}
                    </SelectItem>
                </Select>
            </div>
        </div>

        <!-- 结果统计 -->
        <div class="px-6 py-3 text-sm text-base-content/70 bg-base-100 border-b border-base-200">
            <span class="font-semibold text-primary">{{ filteredMonsters.length }}</span> 个怪物
        </div>

        <!-- 怪物列表 -->
        <div class="flex-1 overflow-hidden">
            <ScrollArea class="h-full">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                    <!-- 怪物卡片 -->
                    <div
                        v-for="monster in filteredMonsters"
                        :key="monster.id"
                        class="group relative bg-base-100 border border-base-200 rounded-xl overflow-hidden shadow-md hover:shadow-lg hover:shadow-primary/20 transition-all duration-300 hover:-translate-y-1 cursor-pointer"
                        @click="navigateToMonsterDetail(monster)"
                    >
                        <!-- 卡片背景渐变 -->
                        <div
                            class="absolute inset-0 bg-linear-to-br from-base-200/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        ></div>

                        <!-- 卡片内容 -->
                        <div class="p-5 relative z-10">
                            <!-- 怪物名称和阵营 -->
                            <div class="flex items-start justify-between mb-4">
                                <h3 class="text-xl font-bold text-base-content group-hover:text-primary transition-colors duration-300">
                                    {{ monster.名称 }}
                                </h3>
                                <div class="px-3 py-1 bg-primary/20 text-primary rounded-full text-xs font-semibold">
                                    {{ getFactionName(monster.阵营) }}
                                </div>
                            </div>

                            <!-- 怪物属性 -->
                            <div class="grid grid-cols-2 gap-3">
                                <!-- 攻击 -->
                                <div class="bg-base-200 p-3 rounded-lg">
                                    <div class="flex items-center justify-between">
                                        <span class="text-xs text-base-content/50">攻击</span>
                                        <span class="text-sm font-semibold text-error">{{ monster.攻击 }}</span>
                                    </div>
                                </div>

                                <!-- 防御 -->
                                <div class="bg-base-200 p-3 rounded-lg">
                                    <div class="flex items-center justify-between">
                                        <span class="text-xs text-base-content/50">防御</span>
                                        <span class="text-sm font-semibold text-success">{{ monster.防御 }}</span>
                                    </div>
                                </div>

                                <!-- 生命 -->
                                <div class="bg-base-200 p-3 rounded-lg">
                                    <div class="flex items-center justify-between">
                                        <span class="text-xs text-base-content/50">生命</span>
                                        <span class="text-sm font-semibold text-warning">{{ monster.生命 }}</span>
                                    </div>
                                </div>

                                <!-- 战姿 -->
                                <div class="bg-base-200 p-3 rounded-lg">
                                    <div class="flex items-center justify-between">
                                        <span class="text-xs text-base-content/50">战姿</span>
                                        <span class="text-sm font-semibold text-info">{{ monster.战姿 || 0 }}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- 护盾（如果有） -->
                            <div v-if="monster.护盾 !== undefined" class="mt-3 bg-base-200 p-3 rounded-lg">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs text-base-content/50">护盾</span>
                                    <span class="text-sm font-semibold text-cyan-500">{{ monster.护盾 }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 空状态 -->
                <div v-if="filteredMonsters.length === 0" class="flex flex-col items-center justify-center h-64 text-center">
                    <div class="text-6xl mb-4 text-base-content/30">🐉</div>
                    <h3 class="text-xl font-bold text-base-content/50 mb-2">未找到怪物</h3>
                    <p class="text-base-content/50">请尝试调整搜索条件或筛选选项</p>
                </div>
            </ScrollArea>
        </div>
    </div>
</template>
