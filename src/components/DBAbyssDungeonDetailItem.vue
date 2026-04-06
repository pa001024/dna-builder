<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import type { AbyssDungeon, Char } from "@/data"
import { AbyssMonsterLevelLimit, charMap, LeveledChar, LeveledMonster } from "@/data"
import { getAbyssCumulativeRewardItems, getAbyssStarCountByActCount, getImmortalMonsterLevelByActCount } from "../utils/abyss-utils"
import { ABYSS_DUNGEON_ELEMENT_KEYS, formatAbyssDungeonMbValue, getAbyssDungeonGroup, getAbyssDungeonLevel } from "../utils/dungeon-utils"
import { getDropModeText, getRewardDetails, type RewardItem } from "../utils/reward-utils"

const props = defineProps<{
    dungeon: AbyssDungeon
}>()

const currentMonsterLevel = ref(AbyssMonsterLevelLimit)
const currentActMode = ref<"12" | "36" | "custom">("12")
const currentActCount = ref(12)

const isImmortalPlay = computed(() => getAbyssDungeonGroup(props.dungeon) === "不朽剧目")
const currentStarCount = computed(() => getAbyssStarCountByActCount(currentActCount.value))

const monsterDisplayLevel = computed(() => {
    if (isImmortalPlay.value) {
        return getImmortalMonsterLevelByActCount(currentActCount.value)
    }

    return currentMonsterLevel.value
})

/**
 * 根据幕数值归一化 tab。
 * @param actCount 幕数
 * @returns 对应的 tab
 */
function getActModeByCount(actCount: number): "12" | "36" | "custom" {
    if (actCount === 12) {
        return "12"
    }
    if (actCount === 36) {
        return "36"
    }

    return "custom"
}

/**
 * 切换累计奖励幕数预设。
 * @param mode 预设模式
 */
function setActMode(mode: "12" | "36" | "custom"): void {
    currentActMode.value = mode
    if (mode === "12") {
        currentActCount.value = 12
        return
    }
    if (mode === "36") {
        currentActCount.value = 36
    }
}

watch(
    currentActCount,
    value => {
        if (!isImmortalPlay.value) {
            return
        }

        currentActMode.value = getActModeByCount(value)
    },
    { immediate: true }
)

/**
 * 计算当前幕数下的累计奖励叶子项。
 * @returns 累计奖励叶子项
 */
const cumulativeRewardItems = computed(() => {
    if (!isImmortalPlay.value) {
        return []
    }

    return getAbyssCumulativeRewardItems(props.dungeon, currentActCount.value)
})

watch(
    () => props.dungeon.id,
    () => {
        currentMonsterLevel.value = AbyssMonsterLevelLimit
        currentActMode.value = "12"
        currentActCount.value = 12
    },
    { immediate: true }
)

function getCharName(charId: number): string {
    const char = charMap.get(charId)
    return char?.名称 || `ID: ${charId}`
}

function getChar(charId: number): Char | undefined {
    return charMap.get(charId)
}

type ResourceCostValueType =
    | "Mod"
    | "Draft"
    | "Weapon"
    | "Char"
    | "CharAccessory"
    | "WeaponAccessory"
    | "Walnut"
    | "Resource"
    | "Skin"
    | "HeadSculpture"
    | "HeadFrame"
    | "Hair"
    | "WeaponSkin"

/**
 * 将累计奖励项转换为 ResourceCostItem 需要的 value。
 * @param item 累计奖励项
 * @returns 组件入参
 */
function getCumulativeRewardValue(item: RewardItem): number | [number | string, number | string, ResourceCostValueType] {
    if (item.t === "Resource") {
        return item.c || 1
    }

    return [item.c || 1, item.id, item.t as ResourceCostValueType]
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
                <CopyID :id="dungeon.id" />
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
                <div v-if="dungeon.sid" class="flex justify-between">
                    <span class="text-base-content/70">赛季ID</span>
                    <span>{{ dungeon.sid }}</span>
                </div>
                <div v-if="dungeon.st" class="flex justify-between">
                    <span class="text-base-content/70">开始时间</span>
                    <span>{{ new Date(dungeon.st * 1000).toLocaleString() }}</span>
                </div>
                <div v-if="dungeon.et" class="flex justify-between">
                    <span class="text-base-content/70">结束时间</span>
                    <span>{{ new Date(dungeon.et * 1000).toLocaleString() }}</span>
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
                    <CopyID :id="char.id" />
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

        <div v-if="dungeon.mb" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">怪物属性克制</h3>
            <div class="grid grid-cols-3 gap-2 text-sm">
                <div v-for="key in ABYSS_DUNGEON_ELEMENT_KEYS" :key="key" class="flex justify-between">
                    <span class="text-base-content/70">{{ $t(`${key}属性`) }}</span>
                    <span>{{ formatAbyssDungeonMbValue(dungeon, key) }}</span>
                </div>
            </div>
        </div>

        <div v-if="dungeon.buff?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">BUFF列表 ({{ dungeon.buff.length }}个)</h3>
            <div class="space-y-2">
                <div
                    v-for="buff in dungeon.buff"
                    :key="buff.id"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors duration-200"
                >
                    <div class="flex items-start gap-2">
                        <img :src="`/imgs/webp/T_Abyss_Buff_${buff.icon}.webp`" class="h-10 inline-block rounded" />
                        <div class="flex-1">
                            <div class="font-medium text-sm">
                                {{ buff.n }}
                                <CopyID :id="buff.id" />
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
                <div
                    v-for="item in dungeon.arl"
                    :key="item.lv"
                    class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors duration-200"
                >
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
                    <RewardItem :reward="getRewardDetails(item.r)" :type-filter="['Drop']" />
                    <RewardItem v-if="item.a" :reward="getRewardDetails(item.a)" :type-filter="['Drop']" />
                </div>
            </div>
        </div>

        <div v-if="isImmortalPlay && dungeon.arl?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">累计奖励</h3>
            <div class="mb-3 flex items-center gap-2 text-sm">
                <button
                    type="button"
                    class="rounded px-3 py-1 transition-colors duration-200"
                    :class="currentActMode === '12' ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content hover:bg-base-300'"
                    @click="setActMode('12')"
                >
                    12
                </button>
                <button
                    type="button"
                    class="rounded px-3 py-1 transition-colors duration-200"
                    :class="currentActMode === '36' ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content hover:bg-base-300'"
                    @click="setActMode('36')"
                >
                    36
                </button>
                <button
                    type="button"
                    class="rounded px-3 py-1 transition-colors duration-200"
                    :class="
                        currentActMode === 'custom' ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content hover:bg-base-300'
                    "
                    @click="setActMode('custom')"
                >
                    自定义
                </button>
                <input
                    v-if="currentActMode === 'custom'"
                    v-model.number="currentActCount"
                    type="number"
                    min="1"
                    step="1"
                    class="w-20 rounded bg-base-200 px-2 py-1 text-center outline-none ring-0"
                />
                <span class="flex items-center gap-1 text-base-content/70">
                    <img src="/imgs/res/T_Abyss_Star02.webp" alt="图标" class="h-5 w-5" />
                    {{ currentStarCount }}
                </span>
            </div>
            <div v-if="cumulativeRewardItems.length" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <ResourceCostItem
                    v-for="item in cumulativeRewardItems"
                    :key="item.id"
                    :name="item.n || `${item.t} ${item.id}`"
                    :value="getCumulativeRewardValue(item)"
                />
            </div>
            <div v-else class="text-sm text-base-content/70">当前幕数暂无累计奖励</div>
        </div>

        <!-- 怪物列表 -->
        <div v-if="dungeon.m?.length" class="card bg-base-100 border border-base-200 rounded-lg p-3">
            <h3 class="font-bold mb-2">怪物列表 ({{ dungeon.m.length }}种)</h3>
            <!-- 等级控制 -->
            <div class="flex items-center gap-4 mb-3">
                <template v-if="isImmortalPlay">
                    <span class="min-w-12">幕数</span>
                    <input
                        v-model.number="currentActCount"
                        type="number"
                        min="1"
                        step="1"
                        class="w-20 rounded bg-base-200 px-2 py-1 text-center outline-none"
                    />
                    Lv.
                    <span class="text-md">
                        {{ monsterDisplayLevel }}

                        <span class="text-xs text-base-content/80">/ {{ AbyssMonsterLevelLimit }}</span>
                    </span>
                </template>
                <template v-else>
                    <span class="text-sm min-w-12">Lv. {{ currentMonsterLevel }}</span>
                    <input
                        v-model.number="currentMonsterLevel"
                        type="range"
                        class="range range-primary range-xs grow"
                        min="1"
                        :max="AbyssMonsterLevelLimit"
                        step="1"
                    />
                </template>
            </div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <DBMonsterCompactCard
                    v-for="monsterId in dungeon.m"
                    :key="monsterId"
                    :monster="new LeveledMonster(monsterId, monsterDisplayLevel, false)"
                />
            </div>
        </div>
    </div>
</template>
