<script lang="ts" setup>
import { useSessionStorage } from "@vueuse/core"
import { computed } from "vue"
import { LeveledMonster, monsterMap } from "@/data"
import { monsterTagData } from "@/data/d/monstertag.data"
import monsterData, { Faction } from "../data/d/monster.data"
import { monsterTagGroups } from "../utils/monster-tag-utils"
import { getMonsterType } from "../utils/monster-utils"
import { matchPinyin } from "../utils/pinyin-utils"

type MonsterListType = "monster" | "monsterTag"

const searchKeyword = useSessionStorage<string>("monster.searchKeyword", "")
const selectedMonsterId = useSessionStorage<number>("monster.selectedMonster", 0)
const selectedMonsterTagId = useSessionStorage<string>("monster.selectedMonsterTag", "")
const selectedType = useSessionStorage<MonsterListType>("monster.selectedType", "monster")
const selectedFaction = useSessionStorage<number | "">("monster.selectedFaction", "")

// 根据 ID 获取选中的怪物
const selectedMonster = computed(() => {
    return selectedMonsterId.value ? monsterMap.get(selectedMonsterId.value) || null : null
})

// 根据 ID 获取选中的号令者
const selectedMonsterTag = computed(() => {
    return selectedMonsterTagId.value ? monsterTagData.find(tag => tag.id === selectedMonsterTagId.value) || null : null
})

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

// 过滤号令者列表
const filteredMonsterTags = computed(() => {
    return monsterTagGroups.filter(group => {
        if (searchKeyword.value === "") {
            return true
        }

        const query = searchKeyword.value
        if (group.name.includes(query) || group.primaryTag.id.includes(query)) {
            return true
        }

        return matchPinyin(group.name, query).match
    })
})

/**
 * 选择怪物并清空号令者选中状态。
 * @param monsterId 怪物ID
 */
function selectMonster(monsterId: number): void {
    selectedMonsterId.value = monsterId
    selectedMonsterTagId.value = ""
}

/**
 * 选择号令者并清空怪物选中状态。
 * @param monsterTagId 号令者ID
 */
function selectMonsterTag(monsterTagId: string): void {
    selectedMonsterTagId.value = monsterTagId
    selectedMonsterId.value = 0
}

/**
 * 关闭右侧详情面板并重置当前选中。
 */
function clearSelection(): void {
    selectedMonsterId.value = 0
    selectedMonsterTagId.value = ""
}

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
            <div
                class="flex-1 flex flex-col overflow-hidden"
                :class="{ 'border-r border-base-200': selectedMonster || selectedMonsterTag }"
            >
                <!-- 搜索栏 -->
                <div class="p-3 border-b border-base-200">
                    <input
                        v-model="searchKeyword"
                        type="text"
                        placeholder="搜索怪物名称（支持拼音）..."
                        class="w-full px-3 py-1.5 rounded bg-base-200 text-base-content placeholder-base-content/70 outline-none focus:ring-1 focus:ring-primary transition-all"
                    />
                </div>

                <!-- 资料类型Tab -->
                <div class="p-2 border-b border-base-200">
                    <div class="flex flex-wrap gap-1 pb-2 border-b border-base-300">
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="
                                selectedType === 'monster' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedType = 'monster'"
                        >
                            怪物
                        </button>
                        <button
                            class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                            :class="
                                selectedType === 'monsterTag' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                            "
                            @click="selectedType = 'monsterTag'"
                        >
                            号令者
                        </button>
                    </div>

                    <div class="flex flex-wrap gap-1 pb-1">
                        <template v-if="selectedType === 'monster'">
                            <button
                                class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                                :class="
                                    selectedFaction === '' ? 'bg-primary text-white' : 'bg-base-200 text-base-content hover:bg-base-300'
                                "
                                @click="selectedFaction = ''"
                            >
                                全部
                            </button>
                            <button
                                v-for="faction in factions"
                                :key="faction"
                                class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all cursor-pointer"
                                :class="
                                    selectedFaction === faction
                                        ? 'bg-primary text-white'
                                        : 'bg-base-200 text-base-content hover:bg-base-300'
                                "
                                @click="selectedFaction = faction"
                            >
                                {{ $t(getFactionName(faction)) }}
                            </button>
                        </template>
                    </div>
                </div>

                <!-- 列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-2 space-y-2">
                        <template v-if="selectedType === 'monster'">
                            <div
                                v-for="monster in filteredMonsters"
                                :key="monster.id"
                                class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                                :class="{ 'bg-primary/90 text-primary-content hover:bg-primary': selectedMonsterId === monster.id }"
                                @click="selectMonster(monster.id)"
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
                        </template>

                        <template v-else>
                            <div
                                v-for="monsterTag in filteredMonsterTags"
                                :key="monsterTag.primaryTag.id"
                                class="p-3 rounded cursor-pointer transition-colors bg-base-200 hover:bg-base-300"
                                :class="{
                                    'bg-primary/90 text-primary-content hover:bg-primary': selectedMonsterTagId === monsterTag.primaryTag.id,
                                }"
                                @click="selectMonsterTag(monsterTag.primaryTag.id)"
                            >
                                <div class="flex items-start justify-between gap-2">
                                    <div>
                                        <div class="font-medium flex gap-2 items-center">
                                            {{ monsterTag.name }}
                                        </div>
                                        <div class="text-xs opacity-70 mt-1">
                                            {{ monsterTag.primaryTag.id }}
                                        </div>
                                    </div>
                                    <span class="text-xs px-2 py-0.5 rounded bg-base-300">{{ monsterTag.tags.length }} 词条</span>
                                </div>
                                <div class="text-xs opacity-70 mt-2 line-clamp-2">
                                    {{ monsterTag.primaryTag.desc }}
                                </div>
                            </div>
                        </template>
                    </div>
                </ScrollArea>

                <!-- 底部统计 -->
                <div class="p-2 border-t border-base-200 text-center text-sm text-base-content/70">
                    <span v-if="selectedType === 'monster'">共 {{ filteredMonsters.length }} 个怪物</span>
                    <span v-else>共 {{ filteredMonsterTags.length }} 个号令者</span>
                </div>
            </div>
            <div
                v-if="selectedMonster || selectedMonsterTag"
                class="flex-none flex justify-center items-center overflow-hidden cursor-pointer hover:bg-base-300"
                @click="clearSelection"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="rotate-90 sm:rotate-0" />
            </div>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedMonster" class="flex-1">
                <DBMonsterDetailItem :monster="selectedMonster" />
            </ScrollArea>

            <ScrollArea v-if="selectedMonsterTag" class="flex-1">
                <DBMonsterTagDetailItem :monster-tag="selectedMonsterTag" />
            </ScrollArea>
        </div>
    </div>
</template>
