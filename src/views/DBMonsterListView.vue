<script lang="ts" setup>
import { ref, computed } from "vue"
import monsterData from "../data/d/monster.data"
import type { Monster } from "../data/data-types"
import { Faction } from "../data/data-types"
import { getMonsterType } from "../utils/monster-utils"
import { matchPinyin } from "../utils/pinyin-utils"
import { LeveledMonster } from "@/data"

const searchKeyword = ref("")
const selectedMonster = ref<Monster | null>(null)
const selectedFaction = ref<number | "">("")

// 获取所有可用阵营
const factions = computed(() => {
    const factionSet = new Set<number>()
    monsterData.forEach(m => {
        if (m.f !== undefined) {
            factionSet.add(m.f)
        }
    })
    return Array.from(factionSet).sort((a, b) => a - b)
})

// 过滤怪物列表
const filteredMonsters = computed(() => {
    return monsterData.filter(m => {
        if (m.id < 2000000) return false

        // 搜索筛选
        let matchKeyword = false
        if (searchKeyword.value === "") {
            matchKeyword = true
        } else {
            const q = searchKeyword.value
            // 直接中文匹配
            if (m.n.includes(q)) {
                matchKeyword = true
            } else {
                // 拼音匹配（全拼/首字母）
                matchKeyword = matchPinyin(m.n, q).match
            }
        }

        const matchFaction = selectedFaction.value === "" || m.f === selectedFaction.value
        return matchKeyword && matchFaction
    })
})

// 根据阵营ID获取阵营名称
function getFactionName(faction: number | undefined): string {
    if (faction === undefined) return "其他"
    return Faction[faction] || `阵营${faction}`
}
</script>

<template>
    <div class="h-full flex flex-col bg-base-100">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden" :class="{ 'border-r border-base-200': selectedMonster }">
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索怪物名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <!-- 类型筛选Tab -->
                <div class="p-2 border-b border-base-200">
                    <div class="flex flex-wrap gap-1 pb-1">
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="selectedFaction === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'"
                            @click="selectedFaction = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="faction in factions"
                            :key="faction"
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all cursor-pointer"
                            :class="
                                selectedFaction === faction ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedFaction = faction"
                        >
                            {{ $t(getFactionName(faction)) }}
                        </button>
                    </div>
                </div>

                <!-- 副本列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <div
                            v-for="monster in filteredMonsters"
                            :key="monster.id"
                            class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                            :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedMonster?.id === monster.id }"
                            @click="selectedMonster = monster"
                        >
                            <div class="flex items-start justify-between">
                                <div class="flex items-center gap-2">
                                    <img :src="LeveledMonster.url(monster.icon)" alt="怪物图标" class="w-8 h-8 rounded" />
                                    <div>
                                        <div class="font-medium flex gap-2 items-center">
                                            {{ monster.n }}
                                        </div>
                                        <div class="text-xs opacity-70 mt-1">
                                            {{ $t(getFactionName(monster.f)) }}
                                        </div>
                                    </div>
                                </div>
                                <div v-if="monster.t" class="flex flex-col items-end gap-1">
                                    <span class="text-xs px-2 py-0.5 rounded" :class="getMonsterType(monster.t).color + ' text-white'">
                                        {{ getMonsterType(monster.t).label }}
                                    </span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2 mt-2 text-xs opacity-70">
                                <span>HP: {{ monster.hp }}</span>
                                <span>ATK: {{ monster.atk }}</span>
                                <span>DEF: {{ monster.def }}</span>
                                <span v-if="monster.es">ES: {{ monster.es }}</span>
                                <span class="ml-auto">ID: {{ monster.id }}</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    共 {{ filteredMonsters.length }} 个怪物
                </div>
            </div>
            <div
                v-if="selectedMonster"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="selectedMonster = null"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <div v-if="selectedMonster" class="flex-1 overflow-hidden">
                <DBMonsterDetailItem :monster="selectedMonster" />
            </div>
        </div>
    </div>
</template>
