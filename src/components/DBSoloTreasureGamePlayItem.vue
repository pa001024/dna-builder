<script lang="ts" setup>
import { computed } from "vue"
import { monsterMap } from "@/data"
import {
    extractionTreasureGuardData,
    extractionTreasureMechanismData,
    type SoloTreasureDropEntry,
    type SoloTreasureGamePlay,
    soloTreasureDropData,
} from "@/data/d/solotreasure.data"

const props = defineProps<{
    gamePlay: SoloTreasureGamePlay
}>()

const spawnMonsters = computed(() =>
    (props.gamePlay.spawn?.m || [])
        .map(monster => ({
            config: monster,
            monster: monsterMap.get(monster.id) || null,
        }))
        .filter(
            (item): item is { config: NonNullable<typeof props.gamePlay.spawn>["m"][number]; monster: NonNullable<typeof item.monster> } =>
                !!item.monster
        )
)

const typeTwoMonsterIds = computed(() => [props.gamePlay.m1, props.gamePlay.m2].filter((id): id is number => !!id))
const typeTwoTargetIds = computed(() =>
    [props.gamePlay.g1, props.gamePlay.g2, props.gamePlay.g3, props.gamePlay.g4].filter((id): id is number => !!id)
)
const typeTwoExtraMonsterIds = computed(() => [props.gamePlay.m3, props.gamePlay.m4].filter((id): id is number => !!id))

const typeTwoMonsters = computed(() => {
    return typeTwoMonsterIds.value
        .map((id, index) => ({
            id,
            monster: monsterMap.get(id) || null,
            order: index + 1,
        }))
        .filter((item): item is { id: number; monster: NonNullable<typeof item.monster>; order: number } => !!item.monster)
})

const typeTwoExtraMonsters = computed(() => {
    return typeTwoExtraMonsterIds.value
        .map((id, index) => ({
            id,
            monster: monsterMap.get(id) || null,
            order: index + 3,
        }))
        .filter((item): item is { id: number; monster: NonNullable<typeof item.monster>; order: number } => !!item.monster)
})

const mechanismMap = computed(() => {
    return new Map(extractionTreasureMechanismData.map(mechanism => [mechanism.id, mechanism]))
})

const guardMap = computed(() => {
    return new Map(Object.values(extractionTreasureGuardData).map(guard => [guard.MechanismID, guard]))
})

const mechanisms = computed(() => {
    return (props.gamePlay.dom || [])
        .filter(item => item.type === "Mechanism")
        .map(item => ({
            ...item,
            mechanism: mechanismMap.value.get(item.uid) || null,
            guard: guardMap.value.get(item.uid) || null,
        }))
})

/**
 * 计算怪物对应的提取宝藏奖励。
 * @param monster 怪物数据
 * @returns 奖励列表
 */
function getSoloTreasureRewards(monster: NonNullable<(typeof spawnMonsters.value)[number]>["monster"]): SoloTreasureDropEntry[] {
    return (monster.tags || [])
        .filter(tag => tag.startsWith("Mon.SoloTreasure."))
        .map(tag => soloTreasureDropData[tag])
        .filter((entry): entry is SoloTreasureDropEntry => !!entry)
}
</script>

<template>
    <div class="space-y-3">
        <div class="flex items-start justify-between gap-3">
            <div>
                <div class="font-medium">{{ gamePlay.name || `玩法 ${gamePlay.id}` }}</div>
                <div class="text-xs text-base-content/70">类型: {{ gamePlay.type }}</div>
            </div>
            <CopyID :id="gamePlay.id" />
        </div>

        <div class="grid grid-cols-2 gap-2 text-sm">
            <div v-if="gamePlay.cd !== undefined" class="flex items-center justify-between rounded bg-base-200 p-2">
                <span>CD</span>
                <span class="text-primary">{{ gamePlay.cd }}</span>
            </div>
            <div v-if="gamePlay.gain !== undefined" class="flex items-center justify-between rounded bg-base-200 p-2">
                <span>收益</span>
                <span class="text-primary">{{ gamePlay.gain }}</span>
            </div>
        </div>

        <div v-if="gamePlay.spawn" class="rounded bg-base-200/60 p-3 space-y-2">
            <div class="text-xs text-base-content/70">刷怪</div>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex items-center justify-between rounded bg-base-200 p-2">
                    <span>生成器ID</span>
                    <span class="text-primary">{{ gamePlay.spawn.id }}</span>
                </div>
                <div class="flex items-center justify-between rounded bg-base-200 p-2">
                    <span>时间</span>
                    <span class="text-primary">{{ gamePlay.spawn.time }}</span>
                </div>
                <div class="flex items-center justify-between rounded bg-base-200 p-2">
                    <span>间隔</span>
                    <span class="text-primary">{{ gamePlay.spawn.th }}</span>
                </div>
                <div class="flex items-center justify-between rounded bg-base-200 p-2">
                    <span>范围</span>
                    <span class="text-primary">{{ gamePlay.spawn.radius.join(" / ") }}</span>
                </div>
            </div>
            <div v-if="spawnMonsters.length" class="space-y-2">
                <div class="text-xs text-base-content/70">普通怪物 ({{ spawnMonsters.length }}种)</div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                    <DBMonsterCompactCard
                        v-for="monster in spawnMonsters"
                        :key="monster.config.id"
                        :monster="monster.monster"
                        :level="monster.config.lv"
                        :quantity="monster.config.num"
                        :reward="getSoloTreasureRewards(monster.monster)"
                    />
                </div>
            </div>

            <div v-if="gamePlay.type === 2 && typeTwoTargetIds.length" class="space-y-2">
                <div class="text-xs text-base-content/70">目标值</div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div
                        v-for="(value, index) in typeTwoTargetIds"
                        :key="`type2-target-${index}`"
                        class="flex items-center justify-between rounded bg-base-200 p-2"
                    >
                        <span>G{{ index + 1 }}</span>
                        <span class="text-primary">{{ value }}</span>
                    </div>
                </div>
            </div>

            <div v-if="gamePlay.type === 2 && typeTwoMonsters.length" class="space-y-2">
                <div class="text-xs text-base-content/70">怪物</div>
                <div class="space-y-2">
                    <DBMonsterCompactCard
                        v-for="monster in typeTwoMonsters"
                        :key="monster.id"
                        :monster="monster.monster"
                        :level="gamePlay.type"
                        :quantity="monster.order"
                        :reward="getSoloTreasureRewards(monster.monster)"
                    />
                    <DBMonsterCompactCard
                        v-for="monster in typeTwoExtraMonsters"
                        :key="monster.id"
                        :monster="monster.monster"
                        :level="gamePlay.type"
                        :quantity="monster.order"
                        :reward="getSoloTreasureRewards(monster.monster)"
                    />
                </div>
            </div>
        </div>

        <div v-if="gamePlay.dom.length" class="rounded bg-base-200/60 p-3 space-y-2">
            <div class="text-xs text-base-content/70">机关</div>
            <div class="space-y-2">
                <div v-for="item in mechanisms" :key="item.id" class="space-y-2">
                    <DBSoloTreasureMechanismItem v-if="item.mechanism" :mechanism="item.mechanism" />
                    <div v-if="item.mechanism" class="text-xs text-base-content/70">UID: {{ item.uid }} · {{ item.pos.join(", ") }}</div>
                    <div v-if="item.guard" class="rounded bg-base-200 px-2 py-1 text-sm">
                        <div class="flex items-center justify-between gap-2">
                            <span>{{ item.guard.MechanismName }}</span>
                            <CopyID :id="item.guard.MechanismID" />
                        </div>
                        <div class="text-xs text-base-content/70 mt-1">
                            机关盒: {{ item.guard.MechanismItemBox }} · 修复速度: {{ item.guard.RepairSpeed }}
                        </div>
                        <div class="text-xs text-base-content/70 mt-1">{{ item.pos.join(", ") }}</div>
                    </div>
                    <div v-else class="rounded bg-base-200 px-2 py-1 text-sm">
                        <div class="flex items-center justify-between gap-2">
                            <span>{{ item.type }}</span>
                            <CopyID :id="item.id" />
                        </div>
                        <div class="text-xs text-base-content/70 mt-1">{{ item.pos.join(", ") }}</div>
                    </div>
                </div>
                <div
                    v-for="item in gamePlay.dom.filter(dom => dom.type !== 'Mechanism')"
                    :key="item.id"
                    class="rounded bg-base-200 px-2 py-1 text-sm"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span>{{ item.type }}</span>
                        <CopyID :id="item.id" />
                    </div>
                    <div class="text-xs text-base-content/70 mt-1">UID: {{ item.uid }} · {{ item.pos.join(", ") }}</div>
                </div>
            </div>
        </div>
    </div>
</template>
