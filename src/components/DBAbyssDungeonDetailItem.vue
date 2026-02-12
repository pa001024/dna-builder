<script lang="ts" setup>
import { ref } from "vue"
import type { AbyssDungeon, Char } from "@/data"
import { charMap, LeveledChar, LeveledMonster } from "@/data"
import { getAbyssDungeonGroup, getAbyssDungeonLevel } from "../utils/dungeon-utils"
import { getDropModeText, getRewardDetails } from "../utils/reward-utils"

const props = defineProps<{
    dungeon: AbyssDungeon
}>()

const currentLevel = ref(180)

function getCharName(charId: number): string {
    const char = charMap.get(charId)
    return char?.名称 || `ID: ${charId}`
}

function getChar(charId: number): Char | undefined {
    return charMap.get(charId)
}

</script>

<template>
    <div class="p-3 space-y-4">
        <div class="flex items-center justify-between">
            <div>
                <SRouterLink :to="`/db/abyss/${dungeon.id}`" class="text-lg font-bold link link-primary">
                    <span v-if="dungeon.sn">{{ dungeon.sn }}</span
                    >&nbsp;
                    <span v-if="dungeon.cid">{{ $t(getCharName(dungeon.cid)) }}</span>
                    #{{ getAbyssDungeonLevel(dungeon) }}
                </SRouterLink>
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
                    <SRouterLink :to="`/char/${dungeon.cid}`" class="link link-primary">
                        {{ getCharName(dungeon.cid) }}
                    </SRouterLink>
                </div>
            </div>
        </div>

        <div v-if="dungeon.cid" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">关联角色</h3>
            <div v-for="char in [getChar(dungeon.cid)!]" :key="dungeon.cid" class="space-y-2">
                <div class="flex items-center gap-2">
                    <img :src="LeveledChar.url(char.icon)" alt="角色头像" class="w-8 h-8 rounded-full" />
                    <SRouterLink :to="`/char/${char.id}`" class="font-medium link link-primary">
                        {{ char.名称 }}
                    </SRouterLink>
                    <span class="text-xs text-base-content/70">ID: {{ char.id }}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-base-content/70">元素属性</span>
                        <span>{{ char.属性 }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/70">精通</span>
                        <span>{{ char.精通?.join("/") }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/70">标签</span>
                        <span>{{ char.标签?.join("/") }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-base-content/70">版本</span>
                        <span>{{ char.版本 }}</span>
                    </div>
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
                        <img :src="`/imgs/webp/T_Abyss_Buff_${buff.icon}.webp`" class="h-10 inline-block rounded" />
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
                        <span class="text-sm font-medium">
                            <img src="/imgs/res/T_Abyss_Star02.webp" alt="图标" class="w-6 h-6 inline-block align-middle mr-1" />
                            {{ item.lv }}</span
                        >
                        <div class="flex gap-1">
                            <span v-if="item.w" class="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-content">密函奖励</span>
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

        <!-- 怪物列表 -->
        <div v-if="dungeon.m?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">怪物列表 ({{ dungeon.m.length }}种)</h3>
            <!-- 等级控制 -->
            <div class="flex items-center gap-4 mb-3">
                <span class="text-sm min-w-12">Lv. {{ currentLevel }}</span>
                <input v-model.number="currentLevel" type="range" class="range range-primary range-xs grow" min="1" max="180" step="1" />
            </div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <DBMonsterCompactCard
                    v-for="monsterId in dungeon.m"
                    :key="monsterId"
                    :monster="new LeveledMonster(monsterId, currentLevel, false)"
                />
            </div>
        </div>
    </div>
</template>
