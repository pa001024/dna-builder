<script lang="ts" setup>
import { monsterMap, charMap } from "../data/d/index"
import type { AbyssDungeon } from "../data/d/abyss.data"
import type { Char } from "../data/data-types"
import { getAbyssDungeonGroup, getAbyssDungeonLevel } from "../utils/dungeon-utils"
import { getRewardDetails, getDropModeText } from "../utils/reward-utils"

defineProps<{
    dungeon: AbyssDungeon
}>()

function getMonsterName(monsterId: number): string {
    const monster = monsterMap.get(monsterId)
    return monster?.n || `ID: ${monsterId}`
}

function getCharName(charId: number): string {
    const char = charMap.get(charId)
    return char?.名称 || `ID: ${charId}`
}

function getChar(charId: number): Char | undefined {
    return charMap.get(charId)
}
</script>

<template>
    <ScrollArea class="h-full">
        <div class="p-3 space-y-4">
            <div class="flex items-center justify-between">
                <div>
                    <RouterLink :to="`/db/abyss/${dungeon.id}`" class="text-lg font-bold link link-primary">
                        <span v-if="dungeon.sn">{{ dungeon.sn }}</span
                        >&nbsp;
                        <span v-if="dungeon.cid">{{ $t(getCharName(dungeon.cid)) }}</span>
                        #{{ getAbyssDungeonLevel(dungeon) }}
                    </RouterLink>
                    <div class="text-sm text-base-content/70">ID: {{ dungeon.id }}</div>
                </div>
            </div>

            <div class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">副本信息</h3>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-base-content/70">深渊ID</span>
                        <span>{{ dungeon.id }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/70">副本ID</span>
                        <span>{{ dungeon.did }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/70">类型</span>
                        <span>{{ getAbyssDungeonGroup(dungeon) }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/70">怪物种类</span>
                        <span>{{ dungeon.m.length }}种</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/70">BUFF数量</span>
                        <span>{{ (dungeon.buff || []).length }}个</span>
                    </div>
                    <div v-if="dungeon.sid" class="flex justify-between">
                        <span class="text-base-content/70">赛季ID</span>
                        <span>{{ dungeon.sid }}</span>
                    </div>
                    <div v-if="dungeon.sn" class="flex justify-between">
                        <span class="text-base-content/70">赛季名称</span>
                        <span>{{ dungeon.sn }}</span>
                    </div>
                    <div v-if="dungeon.cid" class="flex justify-between">
                        <span class="text-base-content/70">关联角色</span>
                        <RouterLink :to="`/char/${dungeon.cid}`" class="link link-primary">
                            {{ getCharName(dungeon.cid) }}
                        </RouterLink>
                    </div>
                </div>
            </div>

            <div v-if="dungeon.st && dungeon.et" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">时间范围</h3>
                <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-base-content/70">开始时间</span>
                        <span>{{ new Date(dungeon.st * 1000).toLocaleString() }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/70">结束时间</span>
                        <span>{{ new Date(dungeon.et * 1000).toLocaleString() }}</span>
                    </div>
                </div>
            </div>

            <div v-if="dungeon.art || dungeon.arl?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">奖励信息</h3>
                <div v-if="dungeon.art && !dungeon.arl?.length" class="space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-base-content/70">奖励标题</span>
                        <span>{{ dungeon.art }}</span>
                    </div>
                </div>
                <div v-if="dungeon.arl?.length" class="space-y-3">
                    <div v-if="dungeon.art" class="text-sm font-medium mb-2">
                        {{ dungeon.art }}
                    </div>
                    <div v-for="item in dungeon.arl" :key="item.lv" class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-sm font-medium">等级 {{ item.lv }}</span>
                            <div class="flex gap-1">
                                <span v-if="item.w" class="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-content"
                                    >密函奖励</span
                                >
                                <span
                                    class="text-xs px-1.5 py-0.5 rounded"
                                    :class="
                                        getDropModeText(getRewardDetails(item.r)?.m || '') === '独立'
                                            ? 'bg-success text-success-content'
                                            : 'bg-warning text-warning-content'
                                    "
                                >
                                    {{ getDropModeText(getRewardDetails(item.r)?.m || "") }}
                                </span>
                            </div>
                        </div>
                        <RewardItem :reward="getRewardDetails(item.r)!" />
                        <RewardItem v-if="item.a" :reward="getRewardDetails(item.a)!" />
                    </div>
                </div>
            </div>

            <div v-if="dungeon.cid" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">关联角色</h3>
                <div v-if="getChar(dungeon.cid)" class="space-y-2">
                    <div class="flex items-center gap-2">
                        <RouterLink :to="`/char/${dungeon.cid}`" class="font-medium link link-primary">
                            {{ getChar(dungeon.cid)?.名称 }}
                        </RouterLink>
                        <span class="text-xs text-base-content/70">ID: {{ dungeon.cid }}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div class="flex justify-between">
                            <span class="text-base-content/70">元素属性</span>
                            <span>{{ getChar(dungeon.cid)?.属性 }}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-base-content/70">精通</span>
                            <span>{{ getChar(dungeon.cid)?.精通?.join(", ") }}</span>
                        </div>
                    </div>
                </div>
                <div v-else class="text-sm text-base-content/70">角色ID: {{ dungeon.cid }} (未找到角色数据)</div>
            </div>

            <div v-if="dungeon.mb" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">怪物属性加成</h3>
                <div class="grid grid-cols-3 gap-2 text-sm">
                    <div v-for="key in ['暗', '水', '火', '雷', '风', '光']" :key="key" class="flex justify-between">
                        <span class="text-base-content/70">{{ $t(`${key}属性`) }}</span>
                        <span>{{ (dungeon.mb[key] * 100).toFixed(0) }}%</span>
                    </div>
                </div>
            </div>

            <div v-if="dungeon.buff?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">BUFF列表 ({{ dungeon.buff.length }}个)</h3>
                <div class="space-y-2">
                    <div v-for="buff in dungeon.buff" :key="buff.id" class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                        <div class="flex items-start gap-2">
                            <!-- <img :src="`/imgs/${buff.icon}.png`" class="h-8 inline-block rounded" /> -->
                            <div class="flex-1">
                                <div class="font-medium text-sm">
                                    {{ buff.n }}

                                    <span class="text-xs text-base-content/70">ID: {{ buff.id }}</span>
                                </div>
                                <div class="text-xs text-base-content/70 mt-1">
                                    {{ buff.d }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="dungeon.m?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
                <h3 class="font-bold mb-2">怪物列表 ({{ dungeon.m.length }}种)</h3>
                <div class="flex flex-wrap gap-1">
                    <RouterLink
                        v-for="monsterId in dungeon.m"
                        :key="monsterId"
                        :to="`/db/monster/${monsterId}`"
                        class="px-2 py-1 bg-base-200 rounded text-xs hover:bg-base-300 transition-colors cursor-pointer"
                    >
                        {{ $t(getMonsterName(monsterId)) }}
                    </RouterLink>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
