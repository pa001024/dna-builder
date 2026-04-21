<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { charMap, weaponMap } from "@/data"
import {
    type SoloTreasureGamePlay,
    soloTreasureData,
    soloTreasureGamePlayData,
    type TreasureHuntRepeatDungeon,
    type TreasureHuntStoryDungeon,
} from "@/data/d/solotreasure.data"
import { charTemplateData, weaponTemplateData } from "@/data/d/template.data"

const props = defineProps<{
    dungeon: TreasureHuntRepeatDungeon | TreasureHuntStoryDungeon
}>()

type SoloTreasureEntry = (typeof soloTreasureData)[number]

const isStoryDungeon = computed(() => "did" in props.dungeon)
const storyDungeon = computed(() => ("banPhantom" in props.dungeon ? props.dungeon : null))
const repeatDungeon = computed(() => ("banHardPhantom" in props.dungeon ? props.dungeon : null))
const dungeonId = computed(() => ("did" in props.dungeon ? props.dungeon.did : props.dungeon.id))
const gamePlayList = computed<SoloTreasureGamePlay[]>(() => {
    const entry = getSoloTreasureEntry()
    if (!entry) {
        return []
    }

    return entry.gamePlayId
        .map(id => soloTreasureGamePlayData.find(gamePlay => gamePlay.id === id))
        .filter((gamePlay): gamePlay is SoloTreasureGamePlay => !!gamePlay)
})
const gamePlayTab = ref<number | null>(null)
const trialCharacterRuleIds = computed(() => ("trialCharacter" in props.dungeon ? props.dungeon.trialCharacter : []) as number[])
const limitCharacterRuleIds = computed(
    () => ("limitCharacter" in props.dungeon ? props.dungeon.limitCharacter?.filter(v => v !== 160101) || [] : []) as number[]
)
const trialWeaponRuleIds = computed(() => props.dungeon.trialWeapon)
const hardModeEnabled = ref(!isStoryDungeon.value)
const canToggleMode = computed(() => !isStoryDungeon.value && !!repeatDungeon.value?.easyDungeonId)
const banPhantomEnabled = computed(() => {
    if (storyDungeon.value) {
        return storyDungeon.value.banPhantom
    }

    if (!repeatDungeon.value) {
        return false
    }

    return hardModeEnabled.value ? repeatDungeon.value.banHardPhantom : repeatDungeon.value.banEasyPhantom
})

/**
 * 根据当前副本和模式查找提取玩法数据。
 * @returns 提取玩法数据
 */
function getSoloTreasureEntry(): SoloTreasureEntry | null {
    if (storyDungeon.value) {
        return soloTreasureData.find(item => item.id === storyDungeon.value!.did) || null
    }

    if (!repeatDungeon.value) {
        return null
    }

    const targetDungeonId = hardModeEnabled.value ? repeatDungeon.value.hardDungeonId : repeatDungeon.value.easyDungeonId
    if (targetDungeonId) {
        const matched = soloTreasureData.find(item => item.id === targetDungeonId)
        if (matched) {
            return matched
        }
    }

    return soloTreasureData.find(item => item.id === dungeonId.value) || null
}

const soloTreasure = computed<SoloTreasureEntry | null>(() => getSoloTreasureEntry())

watch(
    canToggleMode,
    enabled => {
        if (!enabled) {
            hardModeEnabled.value = true
        }
    },
    { immediate: true }
)

/**
 * 获取角色模板对应的真实角色ID。
 * @param ruleId 规则ID
 * @returns 角色ID
 */
function getCharId(ruleId: number): number | null {
    return charTemplateData[ruleId]?.CharId || null
}

/**
 * 获取武器模板对应的真实武器ID。
 * @param ruleId 规则ID
 * @returns 武器ID
 */
function getWeaponId(ruleId: number): number | null {
    return weaponTemplateData[ruleId]?.WeaponId || null
}

/**
 * 获取角色名称。
 * @param ruleId 规则ID
 * @returns 角色名称
 */
function getCharName(ruleId: number): string {
    const id = getCharId(ruleId)
    return id ? charMap.get(id)?.名称 || String(id) : String(ruleId)
}

/**
 * 获取武器名称。
 * @param ruleId 规则ID
 * @returns 武器名称
 */
function getWeaponName(ruleId: number): string {
    const id = getWeaponId(ruleId)
    return id ? weaponMap.get(id)?.名称 || String(id) : String(ruleId)
}

/**
 * 构造资源展示值。
 * @param amount 数量
 * @param id 资源ID
 * @returns ResourceCostItem 的 value
 */
function getResourceValue(amount: number, id: number): number | [number, number, "Resource"] {
    return [amount, id, "Resource"]
}

watch(
    gamePlayList,
    list => {
        if (!gamePlayTab.value || !list.some(gamePlay => gamePlay.id === gamePlayTab.value)) {
            gamePlayTab.value = list[0]?.id || null
        }
    },
    { immediate: true }
)
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="p-2 space-y-2">
            <div class="flex items-center gap-3">
                <div class="flex gap-2">
                    <div class="text-lg font-bold">
                        {{ dungeon.name }}
                    </div>
                    <CopyID :id="dungeon.id" />
                </div>
                <div class="flex-1"></div>
                <span class="text-xs px-2 py-1 rounded bg-base-300 text-base-content">
                    {{ isStoryDungeon ? "剧情副本" : "常驻副本" }}
                </span>
            </div>
            <div class="text-sm text-base-content/70">
                {{ dungeon.desc }}
            </div>
        </div>

        <div v-if="!isStoryDungeon" class="card bg-base-200 rounded p-3">
            <div class="flex items-center justify-between">
                <div class="text-xs text-base-content/70">模式</div>
                <label class="label cursor-pointer gap-2 p-0">
                    <span class="text-xs text-base-content/70">普通模式</span>
                    <input v-model="hardModeEnabled" :disabled="!canToggleMode" type="checkbox" class="toggle toggle-primary toggle-sm" />
                    <span class="text-xs text-base-content/70">困难模式</span>
                </label>
            </div>
            <div class="mt-2 text-xs text-base-content/70">禁用协战: {{ banPhantomEnabled ? "是" : "否" }}</div>
        </div>

        <div class="card bg-base-200 rounded p-3">
            <div class="mb-2 text-xs text-base-content/70">入场费</div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem
                    v-if="hardModeEnabled && 'hardModeFee' in dungeon"
                    name="-"
                    :value="getResourceValue(dungeon.hardModeFee, 6000004)"
                />
                <ResourceCostItem
                    v-else-if="!hardModeEnabled && 'easyModeFee' in dungeon"
                    name="-"
                    :value="getResourceValue(dungeon.easyModeFee || 0, 6000004)"
                />
                <ResourceCostItem
                    v-else-if="'fee' in dungeon && dungeon.fee !== undefined"
                    name="-"
                    :value="getResourceValue(dungeon.fee, 'feeResource' in dungeon && dungeon.feeResource ? dungeon.feeResource : 6000004)"
                />
            </div>
        </div>

        <div class="card bg-base-200 rounded-lg p-3">
            <div class="text-xs text-base-content/70 mb-2">提取玩法</div>
            <div v-if="soloTreasure" class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex items-center justify-between rounded bg-base-200 p-2">
                    <span>撤离时间</span>
                    <span class="text-primary">{{ soloTreasure.etime }}s</span>
                </div>
                <div class="flex items-center justify-between rounded bg-base-200 p-2">
                    <span>总时间</span>
                    <span class="text-primary">{{ soloTreasure.gtime }}s</span>
                </div>
                <div class="flex items-center justify-between rounded bg-base-200 p-2">
                    <span>下雨时间</span>
                    <span class="text-primary">{{ soloTreasure.rtime }}s</span>
                </div>
                <div class="flex items-center justify-between rounded bg-base-200 p-2">
                    <span>警告时间</span>
                    <span class="text-primary">{{ soloTreasure.wtime }}s</span>
                </div>
            </div>
            <div v-else class="text-sm text-base-content/70">暂无提取玩法数据</div>
            <div v-if="gamePlayList.length" class="mt-3">
                <div class="tabs tabs-box bg-base-200/60 p-1 overflow-x-auto">
                    <button
                        v-for="gamePlay in gamePlayList"
                        :key="gamePlay.id"
                        type="button"
                        class="tab whitespace-nowrap"
                        :class="{ 'tab-active': gamePlayTab === gamePlay.id }"
                        @click="gamePlayTab = gamePlay.id"
                    >
                        {{ gamePlay.name || `玩法 ${gamePlay.id}` }}
                    </button>
                </div>
                <div class="mt-3 p-3 bg-base-100 rounded">
                    <DBSoloTreasureGamePlayItem
                        v-for="gamePlay in gamePlayList"
                        v-show="gamePlayTab === gamePlay.id"
                        :key="gamePlay.id"
                        :game-play="gamePlay"
                    />
                </div>
            </div>
        </div>

        <div class="card bg-base-200 rounded p-3" v-if="limitCharacterRuleIds.length">
            <div class="text-xs text-base-content/70 mb-2">限定角色</div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem
                    v-for="ruleId in limitCharacterRuleIds"
                    :key="`limit-char-${ruleId}`"
                    :name="getCharName(ruleId)"
                    :value="[1, getCharId(ruleId) || ruleId, 'Char']"
                />
            </div>
        </div>

        <div class="card bg-base-200 rounded p-3">
            <div class="text-xs text-base-content/70 mb-2">试用角色</div>
            <div v-if="trialCharacterRuleIds.length" class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem
                    v-for="ruleId in trialCharacterRuleIds"
                    :key="`trial-char-${ruleId}`"
                    :name="getCharName(ruleId)"
                    :value="[1, getCharId(ruleId) || ruleId, 'Char']"
                />
            </div>
        </div>

        <div class="card bg-base-200 rounded p-3">
            <div class="text-xs text-base-content/70 mb-2">试用武器</div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem
                    v-for="ruleId in trialWeaponRuleIds"
                    :key="`trial-weapon-${ruleId}`"
                    :name="getWeaponName(ruleId)"
                    :value="[1, getWeaponId(ruleId) || ruleId, 'Weapon']"
                />
            </div>
        </div>
    </div>
</template>
