<script lang="ts" setup>
import { computed } from "vue"
import { dungeonMap, LeveledMonster } from "@/data"
import { IronSurvivalMonsterLevelLimit } from "@/data/d/const.data"
import type { IronSurvival } from "@/data/d/ironsurvival.data"
import { ironSurvivalMonsterSpawnData } from "@/data/d/ironsurvival.data"

const props = defineProps<{
    dungeon: IronSurvival
    wave?: number
}>()

const dungeonBase = computed(() => dungeonMap.get(props.dungeon.DungeonId) || null)
const IRON_SURVIVAL_LEVEL_STEP = 5
const dungeonMonsterSpawnMap = computed(() => new Map(ironSurvivalMonsterSpawnData.map(spawn => [spawn.id, spawn])))
const strongKillCount = computed(() => props.dungeon.StrongKillCount?.[0] || 50)
const selectedWave = computed(() => Math.max(1, props.wave ?? 1))

/**
 * 计算深境探险怪物展示等级。
 * @returns 当前波次对应的怪物等级
 */
const ironSurvivalMonsterLevel = computed(() => {
    const baseLevel = dungeonBase.value?.lv || 1
    const level = baseLevel + (selectedWave.value - 1) * IRON_SURVIVAL_LEVEL_STEP
    return Math.min(IronSurvivalMonsterLevelLimit, level)
})

/**
 * 根据生成器ID获取真正的怪物ID列表。
 * @param spawnId 生成器ID
 * @returns 怪物ID列表
 */
function getSpawnMonsterIds(spawnId: number): number[] {
    return dungeonMonsterSpawnMap.value.get(spawnId)?.m?.map(monster => monster.id) || []
}
</script>

<template>
    <div class="space-y-3">
        <div class="p-3 rounded bg-base-200">
            <div class="text-xs text-base-content/70 mb-2">普通刷怪</div>
            <div class="space-y-2">
                <div
                    v-for="(spawnGroup, index) in dungeon.MonsterSpawnId"
                    :key="index"
                    class="p-3 rounded bg-base-100 border border-base-200"
                >
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="font-medium">第 {{ index + 1 }} 组</div>
                        <span class="text-xs px-2 py-0.5 rounded bg-primary text-primary-content">怪物 ID 组</span>
                    </div>
                    <div class="space-y-2">
                        <div v-for="spawnId in spawnGroup" :key="spawnId" class="rounded border border-base-200 bg-base-200/60 p-2">
                            <div class="mb-2 flex items-center justify-between text-xs text-base-content/70">
                                <span>生成器</span>
                                <CopyID :id="spawnId" />
                            </div>
                            <div class="mb-2 text-xs text-base-content/70">{{ strongKillCount }} 小怪后生成 1 个精英</div>
                            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                                <DBMonsterCompactCard
                                    v-for="monsterId in getSpawnMonsterIds(spawnId)"
                                    :key="`${spawnId}-${monsterId}`"
                                    :monster="new LeveledMonster(monsterId, ironSurvivalMonsterLevel)"
                                    :clickable="false"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="p-3 rounded bg-base-200">
            <div class="text-xs text-base-content/70 mb-2">强敌刷怪</div>
            <div class="space-y-2">
                <div
                    v-for="(spawnGroup, index) in dungeon.StrongLoopSpawnId"
                    :key="index"
                    class="p-3 rounded bg-base-100 border border-base-200"
                >
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="font-medium">阶段 {{ index + 1 }}</div>
                        <span class="text-xs px-2 py-0.5 rounded bg-primary text-primary-content">强敌 ID 组</span>
                    </div>
                    <div class="space-y-2">
                        <div v-for="spawnId in spawnGroup" :key="spawnId" class="rounded border border-base-200 bg-base-200/60 p-2">
                            <div class="mb-2 flex items-center justify-between text-xs text-base-content/70">
                                <span>生成器</span>
                                <CopyID :id="spawnId" />
                            </div>
                            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                                <DBMonsterCompactCard
                                    v-for="monsterId in getSpawnMonsterIds(spawnId)"
                                    :key="`${spawnId}-${monsterId}`"
                                    :monster="new LeveledMonster(monsterId, ironSurvivalMonsterLevel)"
                                    :clickable="false"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
