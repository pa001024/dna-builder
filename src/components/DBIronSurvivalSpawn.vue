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
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SPAWN" title="普通刷怪" />
            <div class="space-y-2">
                <div
                    v-for="(spawnGroup, index) in spawnGroups"
                    :key="index"
                    class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="text-sm font-medium">第 {{ index + 1 }} 组</div>
                        <span class="rounded-xs bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">怪物 ID 组</span>
                    </div>
                    <div class="space-y-2">
                        <div
                            v-for="spawnId in spawnGroup"
                            :key="spawnId"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2"
                        >
                            <div class="mb-2 flex items-center justify-between text-xs text-base-content/70">
                                <span>生成器</span>
                                <CopyID :id="spawnId" />
                            </div>
                            <p class="mb-2 text-xs text-base-content/55">{{ strongKillCount }} 小怪后生成 1 个精英</p>
                            <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
                                <DBMonsterCompactCard
                                    v-for="monsterId in getSpawnMonsterIds(spawnId)"
                                    :key="`${spawnId}-${monsterId}`"
                                    :monster="
                                        LeveledMonsterHelper.fromId(
                                            monsterId,
                                            ironSurvivalMonsterLevel,
                                            false,
                                            IRON_SURVIVAL_MONSTER_HP_MULTIPLIER
                                        )
                                    "
                                    :clickable="false"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section
            v-if="dungeon?.StrongLoopSpawnId?.length"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="STRONG SPAWN" title="强敌刷怪" />
            <div class="space-y-2">
                <div
                    v-for="(spawnGroup, index) in dungeon.StrongLoopSpawnId"
                    :key="index"
                    class="space-y-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="text-sm font-medium">阶段 {{ index + 1 }}</div>
                        <span class="rounded-xs bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">强敌 ID 组</span>
                    </div>
                    <div class="space-y-2">
                        <div
                            v-for="spawnId in spawnGroup"
                            :key="spawnId"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2"
                        >
                            <div class="mb-2 flex items-center justify-between text-xs text-base-content/70">
                                <span>生成器</span>
                                <CopyID :id="spawnId" />
                            </div>
                            <div class="grid grid-cols-[repeat(auto-fill,minmax(2840px,1fr))] gap-2">
                                <DBMonsterCompactCard
                                    v-for="monsterId in getSpawnMonsterIds(spawnId)"
                                    :key="`${spawnId}-${monsterId}`"
                                    :monster="
                                        LeveledMonsterHelper.fromId(
                                            monsterId,
                                            ironSurvivalMonsterLevel,
                                            false,
                                            IRON_SURVIVAL_MONSTER_HP_MULTIPLIER
                                        )
                                    "
                                    :clickable="false"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section v-if="defence" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader
                no-animate
                compact
                kicker="BUTCHER"
                title="屠夫刷怪"
                :count="`${defence.MonsterTotalBaseNum} 总怪 / 每 ${defence.WavesPerStage} 波`"
            />
            <div class="space-y-2">
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="text-sm font-medium">屠夫 ({{ defence.ButcherMonsterId }})</div>
                        <span class="rounded-xs bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            第 {{ defence.ButcherMonsterSpawnMinWave }} 波起，概率 {{ defence.ButcherMonsterSpawnProbability.join(" / ") }}
                        </span>
                    </div>
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
                        <DBMonsterCompactCard
                            :monster="
                                LeveledMonsterHelper.fromId(
                                    defence.ButcherMonsterId,
                                    ironSurvivalMonsterLevel,
                                    false,
                                    IRON_SURVIVAL_MONSTER_HP_MULTIPLIER
                                )
                            "
                            :clickable="false"
                        />
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>
