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
        <!-- 玩法头部：名称 + 类型 + ID -->
        <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
                <div class="truncate text-sm font-medium">{{ gamePlay.name || `玩法 ${gamePlay.id}` }}</div>
                <div class="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-base-content/45">TYPE: {{ gamePlay.type }}</div>
            </div>
            <CopyID :id="gamePlay.id" />
        </div>

        <!-- 基础数值 -->
        <div class="grid grid-cols-2 gap-1.5">
            <div
                v-if="gamePlay.cd !== undefined"
                class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <span class="text-xs text-base-content/60">CD</span>
                <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ gamePlay.cd }}</span>
            </div>
            <div
                v-if="gamePlay.gain !== undefined"
                class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <span class="text-xs text-base-content/60">收益</span>
                <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ gamePlay.gain }}</span>
            </div>
        </div>

        <!-- 刷怪 -->
        <div v-if="gamePlay.spawn" class="space-y-2.5 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
            <div class="text-[11px] tracking-wide text-base-content/55">刷怪</div>
            <div class="grid grid-cols-2 gap-1.5">
                <div
                    v-for="spawnAttr in [
                        { label: '生成器ID', value: String(gamePlay.spawn.id) },
                        { label: '时间', value: String(gamePlay.spawn.time) },
                        { label: '间隔', value: String(gamePlay.spawn.th) },
                        { label: '范围', value: gamePlay.spawn.radius.join(' / ') },
                    ]"
                    :key="spawnAttr.label"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ spawnAttr.label }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ spawnAttr.value }}</span>
                </div>
            </div>

            <!-- 普通怪物 -->
            <div v-if="spawnMonsters.length" class="space-y-2">
                <div class="text-[11px] tracking-wide text-base-content/55">普通怪物 ({{ spawnMonsters.length }}种)</div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
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

            <!-- 目标值 -->
            <div v-if="gamePlay.type === 2 && typeTwoTargetIds.length" class="space-y-2">
                <div class="text-[11px] tracking-wide text-base-content/55">目标值</div>
                <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    <div
                        v-for="(value, index) in typeTwoTargetIds"
                        :key="`type2-target-${index}`"
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="font-mono text-xs uppercase tracking-wider text-base-content/60">G{{ index + 1 }}</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ value }}</span>
                    </div>
                </div>
            </div>

            <!-- 怪物 -->
            <div v-if="gamePlay.type === 2 && typeTwoMonsters.length" class="space-y-2">
                <div class="text-[11px] tracking-wide text-base-content/55">怪物</div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
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

        <!-- 机关 -->
        <div v-if="gamePlay.dom.length" class="space-y-2.5 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
            <div class="text-[11px] tracking-wide text-base-content/55">机关</div>
            <div class="space-y-2">
                <div v-for="item in mechanisms" :key="item.id" class="space-y-2">
                    <DBSoloTreasureMechanismItem v-if="item.mechanism" :mechanism="item.mechanism" />
                    <div v-if="item.mechanism" class="font-mono text-[10px] tabular-nums text-base-content/40">
                        UID: {{ item.uid }} · {{ item.pos.join(", ") }}
                    </div>
                    <div v-if="item.guard" class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 text-sm">
                        <div class="flex items-center justify-between gap-2">
                            <span>{{ item.guard.MechanismName }}</span>
                            <CopyID :id="item.guard.MechanismID" />
                        </div>
                        <div class="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-base-content/60">
                            <span>机关盒: {{ item.guard.MechanismItemBox }}</span>
                            <span>修复速度: {{ item.guard.RepairSpeed }}</span>
                            <span>{{ item.pos.join(", ") }}</span>
                        </div>
                    </div>
                    <div v-else class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 text-sm">
                        <div class="flex items-center justify-between gap-2">
                            <span>{{ item.type }}</span>
                            <CopyID :id="item.id" />
                        </div>
                        <div class="mt-1 font-mono text-[10px] tabular-nums text-base-content/40">{{ item.pos.join(", ") }}</div>
                    </div>
                </div>
                <div
                    v-for="item in gamePlay.dom.filter(dom => dom.type !== 'Mechanism')"
                    :key="item.id"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 text-sm"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span>{{ item.type }}</span>
                        <CopyID :id="item.id" />
                    </div>
                    <div class="mt-1 font-mono text-[10px] tabular-nums text-base-content/40">
                        UID: {{ item.uid }} · {{ item.pos.join(", ") }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
