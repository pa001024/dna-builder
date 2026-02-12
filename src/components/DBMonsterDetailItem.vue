<script lang="ts" setup>
import { computed, ref } from "vue"
import { formatBigNumber } from "@/util"
import { abyssDungeonMap, Faction, Monster } from "../data"
import dungeonData from "../data/d/dungeon.data"
import { LeveledMonster } from "../data/leveled/LeveledMonster"
import { getAbyssDungeonGroup, getAbyssDungeonLevel } from "../utils/dungeon-utils"
import { getMonsterTagGroupByMonsterName } from "../utils/monster-tag-utils"

const props = defineProps<{
    monster: Monster
    defaultLevel?: number
}>()

const currentLevel = ref(props.defaultLevel || 180)
const showRougeStats = ref(false)

const leveledMonster = computed(() => {
    if (!props.monster) return null
    return new LeveledMonster(props.monster, currentLevel.value, showRougeStats.value)
})

const dungeons = computed(() => {
    if (!props.monster) return []
    return dungeonData.filter(d => {
        const normalMonsters = d.m || []
        const specialMonsters = d.sm || []
        return normalMonsters.includes(props.monster.id) || specialMonsters.includes(props.monster.id)
    })
})

const abyssDungeonsFiltered = computed(() => {
    if (!props.monster) return []
    return [...abyssDungeonMap.values()].filter(d => {
        const normalMonsters = d.m || []
        return normalMonsters.includes(props.monster.id)
    })
})
// 按照副本名称分组
const dungeonGroups = computed(() => {
    const groups: Record<string, typeof dungeons.value> = {}
    dungeons.value.forEach(dungeon => {
        const dn = dungeon.n.replace(/·.+/, "")
        if (!groups[dn]) {
            groups[dn] = []
        }
        groups[dn].push(dungeon)
    })

    // 对每个组内的副本按等级升序排列
    Object.keys(groups).forEach(groupName => {
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

/**
 * 当前怪物关联的号令者信息。
 */
const monsterTagGroup = computed(() => {
    if (!props.monster) {
        return null
    }

    return getMonsterTagGroupByMonsterName(props.monster.n)
})

function getFactionName(faction: number | undefined): string {
    if (faction === undefined) return "其他"
    return Faction[faction] || `阵营${faction}`
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-3">
            <SRouterLink :to="`/db/monster/${monster.id}`" class="text-lg font-bold link link-primary">
                {{ $t(monster.n) }}
            </SRouterLink>
            <span class="text-sm text-base-content/70">ID: {{ monster.id }}</span>
            <div class="text-sm text-base-content/70 flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded bg-base-200 text-xs">
                    {{ $t(getFactionName(monster.f)) }}
                </span>
            </div>
            <label class="ml-auto flex items-center gap-1 text-xs">
                <input v-model="showRougeStats" type="checkbox" class="toggle toggle-sm toggle-primary" />
                <span>迷津</span>
            </label>
        </div>

        <div v-if="monsterTagGroup" class="p-3 bg-base-200 rounded space-y-2">
            <div class="flex items-center justify-between gap-2">
                <div class="text-xs text-base-content/70">号令者信息</div>
                <SRouterLink :to="`/db/monstertag/${monsterTagGroup.primaryTag.id}`" class="text-xs link link-primary">
                    查看详情
                </SRouterLink>
            </div>
            <div class="text-sm font-medium">{{ monsterTagGroup.name }}</div>
            <div class="text-sm whitespace-pre-line">
                {{ monsterTagGroup.primaryTag.desc }}
            </div>
            <div v-if="monsterTagGroup.tags.length > 1" class="flex flex-wrap gap-2">
                <SRouterLink
                    v-for="tag in monsterTagGroup.tags"
                    :key="tag.id"
                    :to="`/db/monstertag/${tag.id}`"
                    class="text-xs px-2 py-1 rounded bg-base-300 hover:bg-base-100 transition-colors"
                >
                    {{ tag.id }}
                </SRouterLink>
            </div>
        </div>

        <div v-if="leveledMonster" class="flex justify-center items-center">
            <img :src="leveledMonster.url" class="w-24 object-cover rounded" />
        </div>

        <div class="flex items-center gap-4">
            <span class="text-sm min-w-12">Lv. {{ currentLevel }}</span>
            <input v-model.number="currentLevel" type="range" class="range range-primary range-xs grow" min="1" max="180" step="1" />
        </div>

        <div v-if="leveledMonster" class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
            <div class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">攻击</div>
                <div class="font-bold text-primary">
                    {{ formatBigNumber(leveledMonster.atk) }}
                </div>
            </div>
            <div class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">防御</div>
                <div class="font-bold text-success">
                    {{ formatBigNumber(leveledMonster.def) }}
                </div>
            </div>
            <div class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">生命</div>
                <div class="font-bold text-error">
                    {{ formatBigNumber(leveledMonster.hp) }}
                </div>
            </div>
            <div v-if="leveledMonster.es !== undefined" class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">护盾</div>
                <div class="font-bold text-info">
                    {{ formatBigNumber(leveledMonster.es) }}
                </div>
            </div>
            <div v-if="leveledMonster.tn !== undefined" class="bg-base-200 rounded p-2 text-center">
                <div class="text-xs text-base-content/70 mb-1">战姿</div>
                <div class="font-bold text-secondary">
                    {{ formatBigNumber(leveledMonster.tn) }}
                </div>
            </div>
        </div>

        <div v-if="leveledMonster">
            <div class="text-xs text-base-content/70 mb-1">等级成长预览</div>
            <div class="h-24 flex items-end gap-0.5">
                <div
                    v-for="level in [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180]"
                    :key="level"
                    class="h-full flex-1 flex flex-col items-center min-h-0"
                >
                    <div class="w-full relative flex-1 h-full flex flex-col justify-end">
                        <div
                            class="w-full bg-primary rounded-t"
                            :style="{
                                height: `${(leveledMonster.getHPByLevel(level) / leveledMonster.getHPByLevel(180)) * 100}%`,
                            }"
                        />
                    </div>
                    <span class="text-[10px] mt-1">Lv{{ level }}</span>
                </div>
            </div>
        </div>

        <div v-if="dungeons.length > 0">
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
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                <div
                    v-for="dungeon in selectedDungeons"
                    :key="dungeon.id"
                    class="p-2 bg-base-200 rounded cursor-pointer hover:bg-base-300 transition-colors"
                    @click="$router.push(`/db/dungeon/${dungeon.id}`)"
                >
                    <div class="flex items-center justify-between">
                        <span class="font-medium">{{ dungeon.n }}</span>
                        <div class="flex flex-col items-end">
                            <span class="text-xs text-base-content/70">Lv.{{ dungeon.lv }}</span>
                            <span class="text-xs text-base-content/70">ID: {{ dungeon.id }}</span>
                        </div>
                    </div>
                    <div class="text-xs text-base-content/70 mt-1">
                        {{ dungeon.desc }}
                    </div>
                </div>
            </div>
        </div>

        <div v-if="abyssDungeonsFiltered.length > 0">
            <h3 class="font-bold mb-2">出现深渊</h3>

            <!-- 深渊列表 -->
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                <div
                    v-for="dungeon in abyssDungeonsFiltered"
                    :key="dungeon.id"
                    class="p-2 bg-base-200 rounded cursor-pointer hover:bg-base-300 transition-colors"
                    @click="$router.push(`/db/abyss/${dungeon.id}`)"
                >
                    <div class="flex items-center justify-between">
                        <span class="font-medium">
                            {{ dungeon.cname }} {{ $t(getAbyssDungeonGroup(dungeon)) }} #{{ getAbyssDungeonLevel(dungeon) }}</span
                        >
                        <div class="flex flex-col items-end">
                            <span class="text-xs text-base-content/70">ID: {{ dungeon.id }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
