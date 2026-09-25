<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useBuildIncomeWorker } from "@/composables/useBuildIncomeWorker"
import type { CharSettings } from "@/composables/useCharSettings"
import { useGameText } from "@/composables/useGameText"
import { type CharBuild, LeveledPet, LeveledPetHelper, petMap } from "@/data"
import type { Pet } from "@/data/d/pet.data"
import { PET_BREAKTHROUGH_MAX_LEVEL } from "@/data/leveled/LeveledPet"
import { getPetActiveDuration, getPetBuffData, PET_SKILL_LEVEL_OFFSET, resolvePetCoverage } from "@/data/petTrait"
import { format1, format100, format100r, formatProp } from "@/util"

/**
 * 魔灵面板——专业模式 BUFF 面板顶部的魔灵（活力魔灵）配置。
 *
 * 魔灵提供两样东西：被动效果与支援（主动）技能，二者在数据源里都是 BUFF（被动物用魔灵名登记、
 * 主动技用「魔灵名(主动)」登记），因此本面板负责：
 * 1. 选择魔灵（预览 + 卡片网格挑选器，与协战/额外精通选择同一套交互）；
 * 2. 展示并编辑魔灵的生效技能等级（突破等级 + 潜质加成，如「老道」+1）与主动技覆盖率；
 * 3. 展示主动/被动技能描述，并各自标注该效果的收益（在 worker 中按「移除该 BUFF」求边际收益）；
 * 4. 展示角色属性「魔灵CD」（所选魔灵主动技的实际冷却，单位秒，来源为潜质如「敏锐」的冷却缩减），
 *    该行与角色属性面板同源可拖拽（抓起字段拖到表达式/自定义变量输入框，或点击追加到目标函数）。
 */

/** 活力魔灵类型值（见 pet.data.ts：1 活力魔灵 / 2 失活魔灵 / 3 活动魔灵） */
const VITAL_PET_TYPE = 1
/** 可选的活力魔灵名称前缀：闪亮系列（闪亮你好箱 / 闪亮珍珠兔 / 闪亮好梦先生 等） */
const PET_NAME_PREFIX = "闪亮"
/** 可选的活力魔灵名称关键字：艾尔芙系列（黑曜 / 堇青 / 玛瑙 / 紫晶 / 碧玺 / 欧泊） */
const PET_NAME_KEYWORD = "艾尔芙"
/** 被动物 BUFF 的收益键 */
const PASSIVE_INCOME_KEY = "pet:passive"
/** 主动技 BUFF 的收益键 */
const ACTIVE_INCOME_KEY = "pet:active"

const props = defineProps<{
    /** 当前角色的本地配置：本组件直接读写其中的 petId / petLevel / petCoverage */
    charSettings: CharSettings
    charBuild: CharBuild
    /** 角色属性「魔灵CD」（秒）：所选魔灵主动技的实际冷却，由父级从属性表传入 */
    petCd: number
    /** 角色属性「魔灵CD缩减」（0 起始的比例）：用于展示冷却缩短幅度 */
    petCdReduce: number
    /** 魔灵生效技能等级（突破等级 + 潜质加成），由父级计算后传入 */
    petLevel: number
    /** 潜质带来的技能等级加成（如「老道」+1），用于在面板上标明等级来源 */
    petLevelBonus: number
}>()

const emit = defineEmits<{
    /** 魔灵或主动技覆盖率变更：父级据此刷新构筑 */
    petChange: []
}>()

/** 可选魔灵：活力魔灵中的闪亮系列与艾尔芙系列；按品质降序、同品质按 id 升序，便于优先挑到高品质魔灵 */
const petOptions = computed<Pet[]>(() =>
    [...petMap.values()]
        .filter(pet => pet.类型 === VITAL_PET_TYPE && (pet.名称.startsWith(PET_NAME_PREFIX) || pet.名称.includes(PET_NAME_KEYWORD)))
        .sort((a, b) => b.品质 - a.品质 || a.id - b.id)
)

/** 挑选器显隐 */
const picker = ref(false)

const { petSkillText } = useGameText()

/** 当前魔灵（未选择时为 null），技能数值取生效技能等级 */
const selectedPet = computed<LeveledPet | null>(() =>
    props.charSettings.petId ? LeveledPetHelper.fromId(props.charSettings.petId, props.petLevel) : null
)

/** 当前魔灵登记的被动/主动 BUFF 原始数据（闪亮系列等没有 BUFF，只有面板展示） */
const petBuffData = computed(() => getPetBuffData(props.charSettings.petId))

/** 魔灵主动技原始冷却（秒）；无主动技的魔灵为 0 */
const baseCd = computed(() => selectedPet.value?.主动?.cd ?? 0)

/** 游戏内展示的技能等级 = 值索引 + 1（突破 0 → Lv.1，突破 3 → Lv.4，突破 3+「老道」→ Lv.5） */
const skillLevelLabel = computed(() => props.petLevel + PET_SKILL_LEVEL_OFFSET)

/** 主动技效果持续时间（秒）：用于自动覆盖率折算与提示 */
const activeDuration = computed(() => getPetActiveDuration(props.charSettings.petId, props.petLevel))

/** 生效覆盖率：自动 = 持续时间 / 实际冷却，手动 = 设置值 */
const effectiveCoverage = computed(() =>
    resolvePetCoverage(
        props.charSettings.petId,
        props.petLevel,
        props.charSettings.traits,
        props.charSettings.petCoverage,
        props.charSettings.petAutoCoverage
    )
)

/**
 * 切换覆盖率的自动/手动模式；切到手动时把当前自动值写回手动值，避免数值跳变。
 */
function toggleAutoCoverage() {
    const next = !props.charSettings.petAutoCoverage
    if (!next) props.charSettings.petCoverage = Number(effectiveCoverage.value.toFixed(4))
    props.charSettings.petAutoCoverage = next
    emit("petChange")
}

const { incomes, refresh } = useBuildIncomeWorker()

/** 被动效果的收益（移除被动物后的伤害变化） */
const passiveIncome = computed(() => incomes.value[PASSIVE_INCOME_KEY] ?? 0)
/** 主动技能的收益（移除主动技后的伤害变化） */
const activeIncome = computed(() => incomes.value[ACTIVE_INCOME_KEY] ?? 0)

/**
 * 刷新魔灵收益：被动/主动 BUFF 都按「移除该 BUFF 后重算」的边际收益计算。
 */
function refreshIncomes() {
    const { passive, active } = petBuffData.value
    refresh(
        props.charBuild,
        {
            equippedBuffs: [
                ...(passive ? [{ key: PASSIVE_INCOME_KEY, data: passive, level: props.petLevel }] : []),
                ...(active
                    ? [
                          {
                              key: ACTIVE_INCOME_KEY,
                              data: active,
                              level: props.petLevel,
                              coverage: props.charSettings.petCoverage,
                          },
                      ]
                    : []),
            ],
        },
        "魔灵收益"
    )
}

watch(
    () => [props.charBuild, props.charSettings.petId, props.petLevel, props.charSettings.petCoverage],
    () => refreshIncomes(),
    { immediate: true, deep: true }
)

/**
 * 按品质返回卡片边框色（与魔灵详情/魔之楔卡片同一套稀有度配色）。
 * @param quality 品质 1-5
 * @returns 边框色类名
 */
function qualityBorder(quality: number): string {
    switch (quality) {
        case 5:
            return "border-yellow-400/70"
        case 4:
            return "border-purple-500/70"
        case 3:
            return "border-blue-500/70"
        case 2:
            return "border-green-500/70"
        default:
            return "border-gray-300/70"
    }
}

/**
 * 写入魔灵（清空时同步把突破等级恢复默认值，避免沿用旧魔灵的档位）。
 * @param id 魔灵 id（0 表示不选择）
 */
function selectPet(id: number) {
    picker.value = false
    if (props.charSettings.petId === id) return
    props.charSettings.petId = id
    if (!id) props.charSettings.petLevel = 3
    emit("petChange")
}

/**
 * 读取当前构筑里生效的魔灵技能 BUFF（按名称从构筑取，用于主动/被动描述的 tooltip 词条）。
 * @param active 是否取主动技（否则取被动）
 * @returns 生效的 BUFF；未选择魔灵或该技能未登记 BUFF 时为 undefined
 */
function getAppliedPetBuff(active: boolean) {
    const pet = selectedPet.value
    if (!pet) return undefined
    const name = active ? `${pet.名称}(主动)` : pet.名称
    return (props.charBuild?.buffs ?? []).find(buff => buff.名称 === name)
}

/** 主动技生效 BUFF（tooltip 展示该 BUFF 的词条） */
const activeBuff = computed(() => getAppliedPetBuff(true))
/** 被动生效 BUFF（tooltip 展示该 BUFF 的词条） */
const passiveBuff = computed(() => getAppliedPetBuff(false))

/**
 * 设置魔灵突破等级（0-3；与潜质加成叠加后为技能数值索引，上限 4）。
 * @param level 突破等级
 */
function setPetLevel(level: number) {
    props.charSettings.petLevel = Math.max(0, Math.min(PET_BREAKTHROUGH_MAX_LEVEL, level))
    emit("petChange")
}

/**
 * 设置主动技覆盖率。
 * @param coverage 覆盖率（0-1）
 */
function setPetCoverage(coverage: number) {
    props.charSettings.petCoverage = coverage
    emit("petChange")
}
</script>

<template>
    <div class="flex flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-200/40 p-2.5">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <!-- 预览格：36px 图标框 + 名称 + 交换图标；未选择时保持空位虚线框 + 「—」 -->
            <button
                type="button"
                class="group grid w-56 shrink-0 grid-cols-[36px_minmax(0,1fr)_14px] items-center gap-2 rounded-xs border border-transparent px-1.5 py-1 text-left transition-[border-color,background-color] duration-150 ease-[ease] hover:border-primary/55 hover:bg-primary/8 focus-visible:border-primary/55 focus-visible:bg-primary/8"
                :title="$t('char-build.pet_pick')"
                @click="picker = true"
            >
                <span
                    class="grid size-9 place-items-center overflow-hidden border bg-base-content/6 data-[empty=1]:border-dashed data-[empty=1]:border-base-content/28 data-[empty=1]:opacity-60"
                    :class="selectedPet ? qualityBorder(selectedPet.品质) : ''"
                >
                    <img v-if="selectedPet" class="size-full object-cover object-top" :src="selectedPet.url" :alt="$t(selectedPet.名称)" />
                    <Icon v-else icon="ri:magic-line" class="size-4 opacity-45" />
                </span>
                <span class="truncate text-xs font-semibold">{{ selectedPet ? $t(selectedPet.名称) : "—" }}</span>
                <Icon
                    icon="ri:exchange-line"
                    class="size-3.5 opacity-25 transition-opacity duration-150 ease-[ease] group-hover:text-primary group-hover:opacity-85 group-focus-visible:text-primary group-focus-visible:opacity-85"
                />
            </button>

            <!-- 突破等级 / 主动技覆盖率 / 冷却：无魔灵时整块置灰 -->
            <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5" :class="selectedPet ? '' : 'opacity-45'">
                <span class="flex items-center gap-1 text-[11px] text-base-content/70">
                    {{ $t("char-build.pet_breakthrough") }}
                    <NumberInput
                        :model-value="charSettings.petLevel"
                        :min="0"
                        :max="PET_BREAKTHROUGH_MAX_LEVEL"
                        :step="1"
                        @update:model-value="setPetLevel($event)"
                    />
                </span>
                <span v-if="petBuffData.active" class="flex items-center gap-1 text-[11px] text-base-content/70">
                    {{ $t("char-build.pet_coverage") }}
                    <!-- 自动：按「持续时间 / 实际冷却」折算（只读）；取消勾选后改用覆盖率弹窗手动设置 -->
                    <button
                        v-if="charSettings.petAutoCoverage"
                        type="button"
                        class="btn btn-ghost btn-xs gap-1 border border-base-content/10"
                        :title="$t('char-build.pet_coverage_auto_hint', { duration: format1(activeDuration), cd: format1(petCd) })"
                        @click.stop="toggleAutoCoverage"
                    >
                        <Icon icon="ri:magic-line" class="size-3" />
                        {{ format100(effectiveCoverage) }}
                    </button>
                    <CoverageDialog
                        v-else
                        :coverage="charSettings.petCoverage"
                        :title="$t('char-build.pet_coverage')"
                        @update-coverage="setPetCoverage"
                    />
                    <label
                        class="flex cursor-pointer items-center gap-1"
                        :title="$t('char-build.pet_coverage_auto_hint', { duration: format1(activeDuration), cd: format1(petCd) })"
                    >
                        <input
                            type="checkbox"
                            class="checkbox checkbox-xs"
                            :checked="charSettings.petAutoCoverage"
                            @change="toggleAutoCoverage"
                        />
                        {{ $t("char-build.pet_coverage_auto") }}
                    </label>
                </span>
                <span v-if="baseCd" class="font-mono text-[11px] tabular-nums text-base-content/60">
                    CD: {{ format1(baseCd) }}s
                    <template v-if="petCdReduce > 0">
                        <span class="text-base-content/40">→</span>
                        <span class="text-primary">{{ format1(petCd) }}s</span>
                    </template>
                </span>
            </div>
        </div>

        <!-- 主动/被动技能：等级取生效技能等级，潜质加成（如「老道」）在等级旁标注 -->
        <div v-if="selectedPet" class="flex flex-col gap-1.5">
            <div v-if="selectedPet.主动" class="flex flex-col gap-0.5">
                <div class="flex items-baseline gap-1.5">
                    <span class="text-[11px] font-semibold text-base-content/45 uppercase">
                        {{ $t("pet_detail.active_skill") }}
                    </span>
                    <span class="font-orbitron text-[11px] font-bold text-base-content/80 tabular-nums">
                        Lv.{{ skillLevelLabel }}
                        <span v-if="petLevelBonus" class="text-primary"
                            >（{{ $t("char-build.trait_level_bonus", { count: petLevelBonus }) }}）</span
                        >
                    </span>
                    <span v-if="activeIncome" class="ml-auto font-orbitron text-xs tabular-nums text-primary">
                        {{ format100r(activeIncome, 1) }}
                    </span>
                </div>
                <FullTooltip side="bottom">
                    <template #tooltip>
                        <div class="flex flex-col gap-2">
                            <div class="text-sm font-bold">{{ $t(selectedPet.名称) }}</div>
                            <div v-if="activeBuff?.等级 !== undefined" class="text-xs text-base-content/50">
                                Lv.{{ activeBuff.等级 + PET_SKILL_LEVEL_OFFSET }}
                            </div>
                            <ul class="space-y-1">
                                <li
                                    v-for="[prop, value] in Object.entries(activeBuff?.getProperties() ?? {})"
                                    :key="prop"
                                    class="flex justify-between gap-8 text-sm text-primary"
                                >
                                    <div class="text-base-content/80">{{ $t(prop) }}</div>
                                    {{ formatProp(prop, value) }}
                                </li>
                            </ul>
                        </div>
                    </template>
                    <p class="text-xs whitespace-pre-line text-base-content/70">{{ petSkillText(selectedPet.主动模板, selectedPet.主动值) }}</p>
                </FullTooltip>
            </div>
            <div v-if="selectedPet.被动" class="flex flex-col gap-0.5">
                <div class="flex items-baseline gap-1.5">
                    <span class="text-[11px] font-semibold text-base-content/45 uppercase">
                        {{ $t("pet_detail.passive_skill") }}
                    </span>
                    <span class="font-orbitron text-[11px] font-bold text-base-content/80 tabular-nums">
                        Lv.{{ skillLevelLabel }}
                        <span v-if="petLevelBonus" class="text-primary"
                            >（{{ $t("char-build.trait_level_bonus", { count: petLevelBonus }) }}）</span
                        >
                    </span>
                    <span v-if="passiveIncome" class="ml-auto font-orbitron text-xs tabular-nums text-primary">
                        {{ format100r(passiveIncome, 1) }}
                    </span>
                </div>
                <FullTooltip side="bottom">
                    <template #tooltip>
                        <div class="flex flex-col gap-2">
                            <div class="text-sm font-bold">{{ $t(selectedPet.名称) }}</div>
                            <div v-if="passiveBuff?.等级 !== undefined" class="text-xs text-base-content/50">
                                Lv.{{ passiveBuff.等级 + PET_SKILL_LEVEL_OFFSET }}
                            </div>
                            <ul class="space-y-1">
                                <li
                                    v-for="[prop, value] in Object.entries(passiveBuff?.getProperties() ?? {})"
                                    :key="prop"
                                    class="flex justify-between gap-8 text-sm text-primary"
                                >
                                    <div class="text-base-content/80">{{ $t(prop) }}</div>
                                    {{ formatProp(prop, value) }}
                                </li>
                            </ul>
                        </div>
                    </template>
                    <p class="text-xs whitespace-pre-line text-base-content/70">{{ petSkillText(selectedPet.被动模板, selectedPet.被动值) }}</p>
                </FullTooltip>
            </div>
        </div>

        <!-- 挑选器：卡片网格，选中即写入并关闭 -->
        <!-- teleport 到 body：面板外壳带 backdrop-blur，会给 fixed 弹窗造出一个错误的包含块 -->
        <Teleport to="body">
            <dialog class="modal" :class="{ 'modal-open': picker }">
                <div class="modal-box bg-base-300 w-11/12 max-w-3xl">
                    <button type="button" class="btn btn-circle btn-ghost btn-sm absolute top-3 right-3" @click="picker = false">
                        <Icon icon="ri:close-line" class="size-4" />
                    </button>
                    <h3 class="mb-4 text-lg font-bold">{{ $t("char-build.pet_pick") }}</h3>

                    <!-- ScrollArea 必须给定高度才会滚动，与魔之楔挑选器保持同一档高度 -->
                    <ScrollArea class="h-[calc(110vh/1.2-10.5rem)] w-full">
                        <div class="grid gap-2 grid-cols-[repeat(auto-fill,minmax(96px,1fr))]">
                            <!-- 不选择：清空魔灵 -->
                            <button
                                type="button"
                                class="flex flex-col items-center gap-1.5 rounded-xs border px-1.5 py-2 transition-[border-color,color,transform,scale] duration-150 ease-[ease] active:scale-[0.97]"
                                :class="
                                    !charSettings.petId
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-base-content/20 text-base-content/70 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectPet(0)"
                            >
                                <span
                                    class="grid size-9 place-items-center overflow-hidden rounded-xs border border-dashed border-base-content/28 bg-base-content/6"
                                >
                                    <Icon icon="ri:close-line" class="size-4 opacity-45" />
                                </span>
                                <span class="w-full truncate text-center text-xs font-semibold">{{ $t("char-build.pet_none") }}</span>
                            </button>
                            <button
                                v-for="pet in petOptions"
                                :key="pet.id"
                                type="button"
                                class="flex flex-col items-center gap-1.5 rounded-xs border px-1.5 py-2 transition-[border-color,color,transform,scale] duration-150 ease-[ease] active:scale-[0.97]"
                                :class="
                                    charSettings.petId === pet.id
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-base-content/20 text-base-content/70 hover:border-primary/60 hover:text-primary'
                                "
                                @click="selectPet(pet.id)"
                            >
                                <span
                                    class="grid size-9 place-items-center overflow-hidden rounded-xs border bg-base-content/6"
                                    :class="qualityBorder(pet.品质)"
                                >
                                    <img class="size-full object-cover object-top" :src="LeveledPet.url(pet.icon)" :alt="pet.名称" />
                                </span>
                                <span class="w-full truncate text-center text-xs font-semibold">{{ $t(pet.名称) }}</span>
                                <span v-if="pet.主动?.cd" class="font-mono text-[10px] tabular-nums text-base-content/50">
                                    CD {{ format1(pet.主动.cd) }}s
                                </span>
                            </button>
                        </div>
                    </ScrollArea>
                    <p v-if="!petOptions.length" class="py-4 text-center text-sm text-base-content/45">
                        {{ $t("char-build.pet_empty") }}
                    </p>
                </div>
                <div class="modal-backdrop" @click="picker = false" />
            </dialog>
        </Teleport>
    </div>
</template>
