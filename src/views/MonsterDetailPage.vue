<script lang="ts" setup>
import { ref, computed, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { LeveledMonster } from "../data/leveled/LeveledMonster"
import dungeonData from "../data/d/dungeon.data"
import monsterData from "../data/d/monster.data"
import { Faction } from "../data/data-types"

const route = useRoute()
const router = useRouter()

const monsterId = computed(() => Number(route.params.monsterId))
const monster = computed(() => monsterData.find((m) => m.id === monsterId.value))

const currentLevel = ref(180)
const showRougeStats = ref(false)

const leveledMonster = computed(() => {
    if (!monster.value) return null
    return new LeveledMonster(monster.value, currentLevel.value, showRougeStats.value)
})

const dungeons = computed(() => {
    if (!monster.value) return []
    return dungeonData.filter((d) => {
        const normalMonsters = d.m || []
        const specialMonsters = d.sm || []
        return normalMonsters.includes(monster.value!.id) || specialMonsters.includes(monster.value!.id)
    })
})

// 按照副本名称分组
const dungeonGroups = computed(() => {
    const groups: Record<string, typeof dungeons.value> = {}
    dungeons.value.forEach((dungeon) => {
        const dn = dungeon.n.replace(/·.+/, "")
        if (!groups[dn]) {
            groups[dn] = []
        }
        groups[dn].push(dungeon)
    })

    // 对每个组内的副本按等级升序排列
    Object.keys(groups).forEach((groupName) => {
        groups[groupName].sort((a, b) => a.lv - b.lv)
    })

    return groups
})

// 所有副本名称（用于tab筛选）
const allDungeonNames = computed(() => Object.keys(dungeonGroups.value).sort())

// 当前选中的副本名称
const selectedDungeonName = ref<string>(allDungeonNames.value[0] || "")

// 当前选中的副本组
const selectedDungeons = computed(() => {
    return dungeonGroups.value[selectedDungeonName.value] || []
})

function getFactionName(faction: number | undefined): string {
    if (faction === undefined) return "其他"
    return Faction[faction] || `阵营${faction}`
}

function formatNumber(num: number): string {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + "万"
    }
    return num.toString()
}

function goBack() {
    router.push("/db/monster")
}

watch(
    () => route.params.monsterId,
    () => {
        currentLevel.value = 180
        showRougeStats.value = false
    },
)
</script>

<template>
    <div class="h-full flex flex-col bg-base-100 text-base-content">
        <template v-if="monster">
            <div class="p-3 border-b border-base-200 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <button class="btn btn-ghost btn-sm btn-circle" @click="goBack">
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h2 class="text-lg font-bold">{{ $t(monster.名称) }}</h2>
                        <div class="text-sm text-base-content/70 flex items-center gap-2">
                            <span class="px-1.5 py-0.5 rounded bg-base-200 text-xs">
                                {{ $t(getFactionName(monster.阵营)) }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <ScrollArea class="flex-1">
                <div class="p-3 space-y-4">
                    <div class="card bg-base-100 border border-base-200 rounded-lg p-3">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="font-bold">怪物属性</h3>
                            <label class="flex items-center gap-1 text-xs">
                                <input type="checkbox" v-model="showRougeStats" class="checkbox checkbox-xs" />
                                <span>迷津</span>
                            </label>
                        </div>

                        <div class="flex items-center gap-2 mb-3">
                            <span class="text-sm">Lv. {{ currentLevel }}:</span>
                            <input
                                v-model.number="currentLevel"
                                type="range"
                                class="range range-primary range-xs grow"
                                min="1"
                                max="180"
                                step="1"
                            />
                        </div>

                        <div v-if="leveledMonster" class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                            <div class="bg-base-200 rounded p-2 text-center">
                                <div class="text-xs text-base-content/70 mb-1">攻击</div>
                                <div class="font-bold text-primary">{{ formatNumber(leveledMonster.攻击) }}</div>
                            </div>
                            <div class="bg-base-200 rounded p-2 text-center">
                                <div class="text-xs text-base-content/70 mb-1">防御</div>
                                <div class="font-bold text-success">{{ formatNumber(leveledMonster.防御) }}</div>
                            </div>
                            <div class="bg-base-200 rounded p-2 text-center">
                                <div class="text-xs text-base-content/70 mb-1">生命</div>
                                <div class="font-bold text-error">{{ formatNumber(leveledMonster.生命) }}</div>
                            </div>
                            <div v-if="leveledMonster.护盾 !== undefined" class="bg-base-200 rounded p-2 text-center">
                                <div class="text-xs text-base-content/70 mb-1">护盾</div>
                                <div class="font-bold text-info">{{ formatNumber(leveledMonster.护盾) }}</div>
                            </div>
                            <div v-if="leveledMonster.战姿 !== undefined" class="bg-base-200 rounded p-2 text-center">
                                <div class="text-xs text-base-content/70 mb-1">战姿</div>
                                <div class="font-bold text-secondary">{{ formatNumber(leveledMonster.战姿) }}</div>
                            </div>
                        </div>

                        <div v-if="leveledMonster" class="mt-3">
                            <div class="text-xs text-base-content/70 mb-1">等级成长预览</div>
                            <div class="h-24 flex items-end gap-0.5">
                                <div v-for="level in [1, 30, 60, 90, 120, 150, 180]" :key="level" class="flex-1 flex flex-col items-center">
                                    <div
                                        class="w-full bg-primary rounded-t"
                                        :style="{
                                            height: `${(leveledMonster.getHPByLevel(level) / leveledMonster.getHPByLevel(180)) * 100}%`,
                                        }"
                                    ></div>
                                    <span class="text-[10px] mt-1">Lv{{ level }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="dungeons.length > 0" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                        <h3 class="font-bold mb-2">出现副本</h3>

                        <!-- 副本名称Tab筛选 -->
                        <div class="mb-3 overflow-x-auto">
                            <div class="flex space-x-2 pb-2">
                                <button
                                    v-for="dungeonName in allDungeonNames"
                                    :key="dungeonName"
                                    class="px-3 py-1 text-sm rounded-full whitespace-nowrap transition-all"
                                    :class="
                                        selectedDungeonName === dungeonName
                                            ? 'bg-primary text-white'
                                            : 'bg-base-200 text-base-content hover:bg-base-300'
                                    "
                                    @click="selectedDungeonName = dungeonName"
                                >
                                    {{ dungeonName }}
                                </button>
                            </div>
                        </div>

                        <!-- 副本列表 -->
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                            <div
                                v-for="dungeon in selectedDungeons"
                                :key="dungeon.id"
                                class="p-2 bg-base-200 rounded cursor-pointer hover:bg-base-300 transition-colors"
                                @click="router.push(`/db/dungeon/${dungeon.id}`)"
                            >
                                <div class="flex items-center justify-between">
                                    <span class="font-medium">{{ dungeon.ts || dungeon.n }}</span>
                                    <div class="flex flex-col items-end">
                                        <span class="text-xs text-base-content/70">Lv.{{ dungeon.lv }}</span>
                                        <span class="text-xs text-base-content/70">ID: {{ dungeon.id }}</span>
                                    </div>
                                </div>
                                <div class="text-xs text-base-content/70 mt-1">{{ dungeon.desc }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </template>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到怪物</div>
        </div>
    </div>
</template>
