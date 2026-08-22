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
    <div class="stagger-rise space-y-3">
        <!-- 副本档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                <div class="min-w-0">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Dungeon File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h2 class="truncate text-xl font-bold leading-tight tracking-tight">{{ dungeon.name }}</h2>
                        <CopyID :id="dungeon.id" />
                    </div>
                </div>
                <span
                    class="shrink-0 rounded-xs border px-2 py-0.5 text-[10px] text-base-content/55"
                    :class="isStoryDungeon ? 'border-primary/40 text-primary' : 'border-base-content/20'"
                >
                    {{ isStoryDungeon ? "剧情副本" : "常驻副本" }}
                </span>
            </div>
            <p class="mt-2 text-sm leading-relaxed text-base-content/70">{{ dungeon.desc }}</p>
        </header>

        <!-- 模式切换 -->
        <section v-if="!isStoryDungeon" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="MODE" title="模式" />
            <div class="flex items-center justify-end">
                <label class="label cursor-pointer gap-2 p-0">
                    <span class="text-xs text-base-content/70">普通模式</span>
                    <input v-model="hardModeEnabled" :disabled="!canToggleMode" type="checkbox" class="toggle toggle-primary toggle-sm" />
                    <span class="text-xs text-base-content/70">挑战模式</span>
                </label>
            </div>
            <div
                class="mt-2 flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <span class="text-xs text-base-content/60">禁用协战</span>
                <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                    {{ banPhantomEnabled ? "是" : "否" }}
                </span>
            </div>
        </section>

        <!-- 报名费用 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="FEE" title="报名费用" />
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
        </section>

        <!-- 提取玩法 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="GAMEPLAY" title="提取玩法" />
            <div v-if="soloTreasure" class="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
                <div
                    v-for="stat in [
                        { label: '撤离时间', value: soloTreasure.etime },
                        { label: '总时间', value: soloTreasure.gtime },
                        { label: '下雨时间', value: soloTreasure.rtime },
                        { label: '警告时间', value: soloTreasure.wtime },
                    ]"
                    :key="stat.label"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ stat.label }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ stat.value }}s</span>
                </div>
            </div>
            <div v-else class="text-sm text-base-content/70">暂无提取玩法数据</div>

            <div v-if="gamePlayList.length" class="mt-3 space-y-2">
                <!-- 玩法切换方章 -->
                <div class="flex flex-wrap gap-1.5">
                    <button
                        v-for="gamePlay in gamePlayList"
                        :key="gamePlay.id"
                        type="button"
                        class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                        :class="
                            gamePlayTab === gamePlay.id
                                ? 'border-primary bg-primary font-semibold text-primary-content'
                                : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                        "
                        @click="gamePlayTab = gamePlay.id"
                    >
                        {{ gamePlay.name || `玩法 ${gamePlay.id}` }}
                    </button>
                </div>
                <!-- 内层小卡：当前玩法详情 -->
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <DBSoloTreasureGamePlayItem
                        v-for="gamePlay in gamePlayList"
                        v-show="gamePlayTab === gamePlay.id"
                        :key="gamePlay.id"
                        :game-play="gamePlay"
                    />
                </div>
            </div>
        </section>

        <!-- 限定角色 -->
        <section v-if="limitCharacterRuleIds.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LIMITED" title="限定角色" />
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem
                    v-for="ruleId in limitCharacterRuleIds"
                    :key="`limit-char-${ruleId}`"
                    :name="getCharName(ruleId)"
                    :value="[1, getCharId(ruleId) || ruleId, 'Char']"
                />
            </div>
        </section>

        <!-- 试用角色 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="TRIAL CHAR" title="试用角色" />
            <div v-if="trialCharacterRuleIds.length" class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem
                    v-for="ruleId in trialCharacterRuleIds"
                    :key="`trial-char-${ruleId}`"
                    :name="getCharName(ruleId)"
                    :value="[1, getCharId(ruleId) || ruleId, 'Char']"
                />
            </div>
            <div v-else class="text-sm text-base-content/70">暂无试用角色</div>
        </section>

        <!-- 试用武器 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="TRIAL WEAPON" title="试用武器" />
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem
                    v-for="ruleId in trialWeaponRuleIds"
                    :key="`trial-weapon-${ruleId}`"
                    :name="getWeaponName(ruleId)"
                    :value="[1, getWeaponId(ruleId) || ruleId, 'Weapon']"
                />
            </div>
        </section>
    </div>
</template>
