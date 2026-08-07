<script lang="ts" setup>
import { computed } from "vue"
import { defenceData, dungeonMap, ironSurvivalData, LeveledMonsterHelper } from "@/data"
import { IronSurvivalMonsterLevelLimit } from "@/data/d/const.data"
import { ironSurvivalMonsterSpawnData } from "@/data/d/ironsurvival.data"

const props = defineProps<{
    dungeonId: number
    wave?: number
}>()

const dungeon = computed(() => ironSurvivalData[props.dungeonId] || null)
const defence = computed(() => defenceData[props.dungeonId] || null)
const dungeonBase = computed(() => dungeonMap.get(props.dungeonId) || null)
const IRON_SURVIVAL_LEVEL_STEP = 5
const IRON_SURVIVAL_MONSTER_HP_MULTIPLIER = 8
const dungeonMonsterSpawnMap = computed(() => new Map(ironSurvivalMonsterSpawnData.map(spawn => [spawn.id, spawn])))
const strongKillCount = computed(() => dungeon.value?.StrongKillCount?.[0] || 50)
const selectedWave = computed(() => Math.max(1, props.wave ?? 1))

/**
 * 副本刷怪组；深境探险取 MonsterSpawnId，扼守灾厄副本取 Defence 表的 MonsterSpawnId。
 * @returns 刷怪组列表
 */
const spawnGroups = computed(() => dungeon.value?.MonsterSpawnId || defence.value?.MonsterSpawnId || [])

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
    <div v-if="dungeon || defence" class="space-y-3">
        <div class="p-3 rounded bg-base-200">
            <div class="text-xs text-base-content/70 mb-2">普通刷怪</div>
            <div class="space-y-2">
                <div
                    v-for="(spawnGroup, index) in spawnGroups"
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
                                    :monster="LeveledMonsterHelper.fromId(monsterId, ironSurvivalMonsterLevel, false, IRON_SURVIVAL_MONSTER_HP_MULTIPLIER)"
                                    :clickable="false"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="dungeon?.StrongLoopSpawnId?.length" class="p-3 rounded bg-base-200">
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
                                    :monster="LeveledMonsterHelper.fromId(monsterId, ironSurvivalMonsterLevel, false, IRON_SURVIVAL_MONSTER_HP_MULTIPLIER)"
                                    :clickable="false"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="defence" class="p-3 rounded bg-base-200">
            <div class="mb-2 flex items-center justify-between gap-2">
                <div class="text-xs text-base-content/70">屠夫刷怪</div>
                <div class="text-xs text-base-content/70">{{ defence.MonsterTotalBaseNum }} 总怪 / 每 {{ defence.WavesPerStage }} 波</div>
            </div>
            <div class="space-y-2">
                <div class="p-3 rounded bg-base-100 border border-base-200">
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="font-medium">屠夫 ({{ defence.ButcherMonsterId }})</div>
                        <span class="text-xs px-2 py-0.5 rounded bg-primary text-primary-content">第 {{ defence.ButcherMonsterSpawnMinWave }} 波起，概率 {{ defence.ButcherMonsterSpawnProbability.join(" / ") }}</span>
                    </div>
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                        <DBMonsterCompactCard
                            :monster="LeveledMonsterHelper.fromId(defence.ButcherMonsterId, ironSurvivalMonsterLevel, false, IRON_SURVIVAL_MONSTER_HP_MULTIPLIER)"
                            :clickable="false"
                        />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
