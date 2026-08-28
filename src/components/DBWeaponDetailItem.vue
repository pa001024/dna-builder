<script lang="ts" setup>
import { t } from "i18next"
import { computed, ref, watch } from "vue"
import charData from "@/data/d/char.data"
import { weaponDraftMap } from "@/data/d/index"
import modData from "@/data/d/mod.data"
import type { Char, Draft, Mod, Skill, SkillField, Weapon, WeaponSkill } from "@/data/data-types"
import { LeveledMod } from "@/data/leveled/LeveledMod"
import { LeveledSkill } from "@/data/leveled/LeveledSkill"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"
import { formatProp } from "@/util"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { collectWeaponSources, type WeaponSourceInfo } from "@/utils/weapon-source"
import SkillCreatureCards from "./SkillCreatureCards.vue"

const props = defineProps<{
    weapon: Weapon
}>()

const currentLevel = ref(80)
const currentRefine = ref(5)
const replaceModLevels = ref<Record<number, number>>({})
const weaponInfoTab = ref<"breakthrough" | "manufacture">("breakthrough")

const leveledWeapon = computed(() => {
    return new LeveledWeapon(props.weapon, props.weapon.熔炉 && props.weapon.熔炉.length > 0 ? 0 : currentRefine.value, currentLevel.value)
})

interface MeleeSkillComboSummary {
    comboTime: number
    totalMultiplier: number
    multiplierPerSecond: number
    totalBossStagger: number
}

interface WeaponSkillReplaceInfo {
    mod: LeveledMod
    replaceSkill: LeveledSkill
    showLevelControl: boolean
}

interface WeaponSkillReplaceGroup {
    skillId: number
    skillName: string
    items: WeaponSkillReplaceInfo[]
}

/**
 * 将武器技能替换数据转换为可展示的 LeveledSkill
 * @param replaceSkill 武器技能替换数据
 * @returns 替换技能实例
 */
function toReplaceLeveledSkill(replaceSkill: WeaponSkill) {
    const skillData: Skill = {
        id: replaceSkill.id,
        名称: replaceSkill.名称,
        类型: replaceSkill.类型,
        描述: replaceSkill.描述,
        字段: replaceSkill.字段,
        实体: replaceSkill.实体,
    }
    return new LeveledSkill(skillData, 10, leveledWeapon.value.名称)
}

/**
 * 获取技能替换 MOD 的当前等级（未设置时使用默认等级）
 * @param mod MOD 数据
 * @returns 当前等级
 */
function getReplaceModLevel(mod: Mod) {
    if (replaceModLevels.value[mod.id] !== undefined) return replaceModLevels.value[mod.id]
    const defaultLevel = new LeveledMod(mod).等级
    replaceModLevels.value[mod.id] = defaultLevel
    return defaultLevel
}

/**
 * 初始化当前武器相关技能替换 MOD 的等级缓存
 */
function ensureReplaceModLevels() {
    const weaponSkillIdSet = new Set((props.weapon.技能 || []).map(skill => `${skill.id || 0}`))
    modData.forEach(mod => {
        if (!mod.技能替换) return
        const hasReplaceSkill = Object.keys(mod.技能替换).some(skillId => weaponSkillIdSet.has(skillId))
        if (!hasReplaceSkill) return
        if (replaceModLevels.value[mod.id] === undefined) {
            replaceModLevels.value[mod.id] = new LeveledMod(mod).等级
        }
    })
}

/**
 * 获取 MOD 属性摘要文本（基于 getProperties）
 * @param mod MOD 实例
 * @returns 属性摘要文本
 */
function getModPropertiesText(mod: LeveledMod) {
    const entries = Object.entries(mod.getProperties()).filter(([_, value]) => value)
    if (!entries.length) return "-"
    return entries.map(([key, value]) => `${t(key)} ${formatProp(key, value)}`).join(" / ")
}

/**
 * 收集当前武器的来源信息。
 */
const weaponSources = computed<WeaponSourceInfo[]>(() => collectWeaponSources(props.weapon))

/**
 * 收集将当前武器作为专武的角色。
 */
const exclusiveRelatedChars = computed<Char[]>(() => charData.filter(char => char.专武 === props.weapon.id))
const weaponDraft = computed<Draft | undefined>(() => weaponDraftMap.get(props.weapon.id))

/**
 * hardboss来源列表。
 */
const hardbossSources = computed(() => weaponSources.value.filter(source => source.type === "hardboss"))

/**
 * 商店来源列表。
 */
const shopSources = computed(() => weaponSources.value.filter(source => source.type === "shop"))

/**
 * 获取当前武器每个技能对应的技能替换 MOD 信息
 */
const weaponSkillReplaceGroups = computed<WeaponSkillReplaceGroup[]>(() => {
    const weaponSkills = props.weapon.技能 || []
    return weaponSkills
        .map(skill => {
            const skillId = skill.id || 0
            const skillIdKey = `${skillId}`
            const items = modData
                .map(mod => {
                    if (!mod.技能替换?.[skillIdKey]) return undefined
                    const modLevel = getReplaceModLevel(mod)
                    const leveledMod = new LeveledMod(mod, modLevel)
                    const replaceSkill = leveledMod.技能替换?.[skillIdKey]
                    if (!replaceSkill) return undefined
                    return {
                        mod: leveledMod,
                        replaceSkill: toReplaceLeveledSkill(replaceSkill),
                        showLevelControl: leveledMod.id > 200000,
                    }
                })
                .filter((item): item is WeaponSkillReplaceInfo => item !== undefined)
            return {
                skillId,
                skillName: skill.名称,
                items,
            }
        })
        .filter(group => group.items.length > 0)
})

/**
 * 按格式表达式计算字段倍率（支持 {%}×2、{%}×2+{%} 等）
 * @param format 格式表达式
 * @param value1 第一个值
 * @param value2 第二个值
 * @returns 计算后的倍率
 */
function evaluateMultiplierByFormat(format: string, value1: number, value2: number = 0) {
    let count = 0
    let expr = format.replace(/\{%\}|\{\}/g, match => {
        count++
        const value = count % 2 === 1 ? value1 : value2
        return match === "{%}" ? value.toString() : value.toString()
    })
    expr = expr.replace(/×/g, "*")
    try {
        const safeExpr = expr.replace(/[^0-9+\-*/.()\s]/g, "")
        const result = new Function(`return ${safeExpr}`)()
        return Number.isNaN(result) ? value1 : result
    } catch {
        return value1
    }
}

/**
 * 兼容 number / number[] 的字段取值
 * @param value 原始字段值
 * @returns 当前展示值
 */
function pickFieldValue(value?: number | number[]) {
    if (value === undefined) return undefined
    return Array.isArray(value) ? value[0] : value
}

/**
 * 计算技能字段对应的倍率贡献（优先按格式表达式）
 * @param field 技能字段
 * @returns 当前字段的倍率贡献
 */
function getFieldMultiplier(field: SkillField) {
    const value = pickFieldValue(field.值) || 0
    const value2 = pickFieldValue(field.值2) || 0
    if (typeof field.格式 === "string") {
        return evaluateMultiplierByFormat(field.格式, value, value2)
    }
    return value
}

/**
 * 计算单个近战技能（如普通攻击一套）的连段时间、倍率与削韧汇总（基于取消时间）
 */
const singleSkillComboSummaryByName = computed<Record<string, MeleeSkillComboSummary>>(() => {
    const result: Record<string, MeleeSkillComboSummary> = {}
    if (leveledWeapon.value.类型 !== "近战") return result

    for (const skill of leveledWeapon.value.技能 || []) {
        const fields = skill.getFieldsWithAttr()
        if (fields.length <= 1) continue

        const cancelValues = fields
            .map(field => pickFieldValue((field as SkillField).取消))
            .filter((value): value is number => value !== undefined)
        if (!cancelValues.length) continue

        const comboTime = cancelValues.reduce((sum, value) => sum + value, 0)
        if (comboTime <= 0) continue

        const totalMultiplier = fields.reduce((sum, field) => sum + getFieldMultiplier(field as SkillField), 0)
        // Boss削韧 字段缺失时回退到 削韧 字段，再求和
        const totalBossStagger = fields.reduce((sum, field) => {
            const fieldData = field as SkillField
            const bossStagger = pickFieldValue(fieldData.Boss削韧)
            const value = bossStagger !== undefined ? bossStagger : (pickFieldValue(fieldData.削韧) || 0)
            return sum + value
        }, 0)
        result[skill.名称] = {
            comboTime,
            totalMultiplier,
            multiplierPerSecond: totalMultiplier / comboTime,
            totalBossStagger,
        }
    }

    return result
})

watch(
    () => props.weapon,
    () => {
        currentLevel.value = 80
        currentRefine.value = props.weapon.熔炉 && props.weapon.熔炉.length > 0 ? 0 : 5
        weaponInfoTab.value = "breakthrough"
        ensureReplaceModLevels()
    },
    { immediate: true }
)
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 武器档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative flex items-start gap-3.5">
                <div class="size-20 shrink-0 overflow-hidden rounded-xs bg-linear-15 sm:size-24" :class="getRarityGradientClass(5)">
                    <ImageFallback :src="leveledWeapon.url" :alt="weapon.名称" class="w-full h-full object-cover">
                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="weapon.名称" class="w-full h-full object-cover" />
                    </ImageFallback>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Weapon File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/weapon/${weapon.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(weapon.名称) }}
                        </SRouterLink>
                        <CopyID :id="weapon.id" />
                    </div>

                    <!-- 元信息行：类型 / 伤害类型 / 版本 -->
                    <div class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                        <span>{{ weapon.类型.map(t => $t(t)).join(", ") }}</span>
                        <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                        <span>{{ $t(weapon.伤害类型) }}</span>
                        <template v-if="weapon.版本">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span class="font-mono tabular-nums">v{{ weapon.版本 }}</span>
                        </template>
                    </div>
                </div>
            </div>
        </header>

        <!-- 描述 -->
        <section v-if="weapon.描述" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" />
            <div class="text-sm leading-relaxed text-base-content/85">{{ weapon.描述 }}</div>
        </section>

        <!-- 等级调整 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVEL" />
            <LevelSlider v-model="currentLevel" />
            <div v-if="!weapon.熔炉 || weapon.熔炉.length === 0" class="mt-2 flex items-center gap-4">
                <span class="flex-none text-[11px] tabular-nums text-base-content/55">
                    熔炼
                    <b class="ml-1 font-orbitron text-[13px] font-semibold text-primary">{{
                        ["0", "I", "II", "III", "IV", "V"][currentRefine]
                    }}</b>
                </span>
                <input
                    :key="leveledWeapon.id"
                    v-model.number="currentRefine"
                    type="range"
                    class="range range-primary range-xs grow"
                    :min="0"
                    :max="5"
                    step="1"
                />
            </div>
        </section>

        <!-- 基础属性 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ATTRIBUTES" :title="$t('char-build.base_attr')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("攻击") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        leveledWeapon.基础攻击
                    }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("暴击") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatProp("基础暴击", weapon.暴击)
                    }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("暴伤") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatProp("基础暴伤", weapon.暴伤)
                    }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("触发") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatProp("基础触发", weapon.触发)
                    }}</span>
                </div>
                <div
                    v-if="weapon.弹匣"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("弹匣") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ weapon.弹匣 }}</span>
                </div>
                <div
                    v-if="weapon.最大弹药"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("最大弹药") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ weapon.最大弹药 }}</span>
                </div>
                <div
                    v-if="weapon.弹药转化率 !== undefined"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("弹药转化率") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        `${+(weapon.弹药转化率 * 100).toFixed(1)}%`
                    }}</span>
                </div>
                <div
                    v-if="weapon.最大射程"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("最大射程") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        `${+(weapon.最大射程 / 100).toFixed(1)}m`
                    }}</span>
                </div>
                <div
                    v-if="weapon.装填"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("装填") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatProp("基础装填", weapon.装填)
                    }}</span>
                </div>
                <div
                    v-if="weapon.射击间隔"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("射击间隔") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatProp("基础装填", weapon.射击间隔)
                    }}</span>
                </div>
                <div
                    v-if="leveledWeapon.射速"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("射速") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatProp("攻击", leveledWeapon.射速)
                    }}</span>
                </div>
            </div>
        </section>

        <!-- 熔炼效果 -->
        <section
            v-if="weapon.熔炼 && weapon.熔炼.length > 0 && (!weapon.熔炉 || weapon.熔炉.length === 0)"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="REFINE" :title="$t('属性')" />
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-relaxed text-base-content/85">
                {{ weapon.熔炼[currentRefine] }}
            </div>
        </section>

        <!-- 技能 -->
        <section
            v-if="leveledWeapon.技能 && leveledWeapon.技能.length > 0"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="SKILLS" :title="$t('技能')" />
            <div class="space-y-3">
                <div
                    v-for="skill in leveledWeapon.技能"
                    :key="skill.名称"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="text-sm font-semibold text-primary">
                        {{ $t(skill.名称) }}
                    </div>
                    <!-- 连段汇总：时长 / 秒均倍率 / 总倍率 / Boss削韧 -->
                    <div
                        v-if="singleSkillComboSummaryByName[skill.名称]"
                        class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-base-content/55"
                    >
                        <span> {{ $t("连段总时长") }}: {{ +singleSkillComboSummaryByName[skill.名称].comboTime.toFixed(4) }}秒 </span>
                        <span>
                            {{ $t("秒均倍率") }}: {{ +(singleSkillComboSummaryByName[skill.名称].multiplierPerSecond * 100).toFixed(1) }}%/s
                        </span>
                        <span>
                            {{ $t("总倍率") }}: {{ +(singleSkillComboSummaryByName[skill.名称].totalMultiplier * 100).toFixed(1) }}%
                        </span>
                        <span>{{ $t("Boss削韧") }}: {{ +singleSkillComboSummaryByName[skill.名称].totalBossStagger.toFixed(2) }}</span>
                    </div>
                    <SkillFields :skill="skill" />
                    <div v-if="skill.skillData.实体 && skill.skillData.实体.length > 0" class="mt-2">
                        <SkillCreatureCards :creatures="skill.skillData.实体" />
                    </div>
                    <div v-if="skill.skillData.子技能 && skill.skillData.子技能.length > 0" class="mt-2 space-y-2">
                        <div v-for="subSkill in skill.skillData.子技能" :key="subSkill.名称 || subSkill.id || ''">
                            <div v-if="subSkill.实体 && subSkill.实体.length > 0">
                                <SkillCreatureCards
                                    :creatures="subSkill.实体"
                                    :titlePrefix="`${subSkill.名称 ? $t(subSkill.名称) : ''}->`"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 灾厄熔炼 -->
        <section
            v-if="weapon.熔炉 && weapon.熔炉.length > 0"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="FORGE" :title="$t('灾厄熔炼')" />
            <div class="space-y-3">
                <div v-for="forge in weapon.熔炉" :key="forge.lv" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <div class="border-l-2 border-l-primary pl-2 font-orbitron text-sm font-bold tabular-nums text-primary">
                        Lv. {{ forge.lv }}
                    </div>
                    <div
                        v-if="forge.技能 && forge.技能.length > 0"
                        class="mt-2 mb-2 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2"
                    >
                        <div
                            v-for="skill in forge.技能"
                            :key="skill.id"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2 transition-colors duration-300 hover:border-primary/40"
                        >
                            <div class="flex items-center gap-2">
                                <div
                                    alt="技能图标"
                                    class="size-10 shrink-0 bg-base-content"
                                    :style="{ mask: `url(${`/imgs/webp/${skill.icon}.webp`}) no-repeat center/contain` }"
                                />
                                <div class="text-sm font-medium text-primary">{{ $t(skill.名称) }}</div>
                                <CopyID :id="skill.id" />
                            </div>
                            <div v-if="skill.描述" class="mt-1 text-sm text-base-content/70">
                                {{ skill.描述 }}
                            </div>
                            <div v-if="skill.加成" class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1.5 text-sm">
                                <div
                                    v-for="(value, name) in skill.加成"
                                    :key="name"
                                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                                >
                                    <span class="text-xs text-base-content/60">{{ $t(name) }}</span>
                                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                                        formatProp(name, value)
                                    }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-if="forge.解锁" class="mb-1 text-[11px] tracking-wide text-base-content/45">解锁</div>
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                        <ResourceCostItem v-for="(value, name) in forge.解锁" :key="name" :name="name" :value="value" />
                    </div>
                    <template v-if="forge.技能 && forge.技能.length > 0 && forge.技能[0].解锁">
                        <div class="mt-2 mb-1 text-[11px] tracking-wide text-base-content/45">二次解锁</div>
                        <div v-if="forge.技能[0].解锁" class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                            <ResourceCostItem v-for="(value, name) in forge.技能[0].解锁" :key="name" :name="name" :value="value" />
                        </div>
                    </template>
                </div>
            </div>
        </section>

        <!-- 招式魔之楔 -->
        <section
            v-if="weaponSkillReplaceGroups.length > 0"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="MOD REPLACE" title="招式魔之楔" />
            <div class="space-y-4">
                <div v-for="group in weaponSkillReplaceGroups" :key="group.skillId">
                    <!-- 技能分组标签行 -->
                    <div class="mb-2 flex items-center gap-2">
                        <span class="text-sm font-medium">{{ $t(group.skillName) }}</span>
                        <span class="font-mono text-[11px] tabular-nums text-base-content/40">({{ group.skillId }})</span>
                        <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />
                    </div>
                    <div class="space-y-2">
                        <div
                            v-for="item in group.items"
                            :key="item.mod.id"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                        >
                            <ShowProps
                                :props="item.mod.getProperties()"
                                :title="`${$t(item.mod.系列)}${$t(item.mod.名称)}`"
                                :rarity="item.mod.品质"
                                :polarity="item.mod.极性"
                                :cost="item.mod.耐受"
                                :type="`${$t(item.mod.类型)}${item.mod.属性 ? `,${$t(item.mod.属性 + '属性')}` : ''}${item.mod.限定 ? `,${$t(item.mod.限定)}` : ''}`"
                                :effdesc="item.mod.效果"
                                :link="`/db/mod/${item.mod.id}`"
                            >
                                <div
                                    class="mb-2 flex items-center rounded-xs border border-base-content/10 bg-base-content/3 p-2 transition-colors duration-200"
                                >
                                    <img
                                        :src="item.mod.url"
                                        :alt="item.mod.名称"
                                        class="mr-2 size-8 inline-block shrink-0 rounded-xs bg-linear-45"
                                        :class="getRarityGradientClass(item.mod.品质)"
                                    />
                                    <div class="flex flex-col min-w-0">
                                        <SRouterLink
                                            :to="`/db/mod/${item.mod.id}`"
                                            class="truncate text-sm font-medium transition-colors duration-150 hover:text-primary"
                                        >
                                            {{ $t(item.mod.系列) }}{{ $t(item.mod.名称) }}
                                        </SRouterLink>
                                        <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-base-content/50">
                                            <CopyID :id="item.mod.id" />
                                            <span v-if="item.mod.版本" class="font-mono tabular-nums">v{{ item.mod.版本 }}</span>
                                            <span v-if="item.mod.耐受" class="inline-flex items-center gap-1">
                                                {{ $t("耐受") }}
                                                <Icon v-if="item.mod.极性" :icon="`po-${item.mod.极性}`" />
                                                <span class="font-mono tabular-nums"
                                                    >{{ item.mod.耐受 }}~{{ item.mod.耐受 - (item.mod.品质 === "金" ? 10 : 5) }}</span
                                                >
                                            </span>
                                            <span class="max-w-full truncate">{{ getModPropertiesText(item.mod) }}</span>
                                        </div>
                                    </div>
                                </div>
                            </ShowProps>
                            <div v-if="item.showLevelControl" class="mb-2">
                                <div class="flex items-center gap-4">
                                    <span class="min-w-16 font-mono text-[11px] tabular-nums text-base-content/55"
                                        >Lv. {{ item.mod.等级 }}</span
                                    >
                                    <input
                                        v-model.number="replaceModLevels[item.mod.id]"
                                        type="range"
                                        class="range range-primary range-xs grow"
                                        :min="0"
                                        :max="item.mod.maxLevel"
                                        step="1"
                                    />
                                </div>
                            </div>
                            <div v-if="item.mod.效果" class="mb-2 text-xs leading-relaxed text-base-content/70">
                                {{ item.mod.效果 }}
                            </div>
                            <SkillFields :skill="item.replaceSkill" />
                            <div v-if="item.replaceSkill.skillData.实体 && item.replaceSkill.skillData.实体.length > 0" class="mt-2">
                                <SkillCreatureCards :creatures="item.replaceSkill.skillData.实体" />
                            </div>
                            <div
                                v-if="item.replaceSkill.skillData.子技能 && item.replaceSkill.skillData.子技能.length > 0"
                                class="mt-2 space-y-2"
                            >
                                <div v-for="subSkill in item.replaceSkill.skillData.子技能" :key="subSkill.名称 || subSkill.id || ''">
                                    <div v-if="subSkill.实体 && subSkill.实体.length > 0">
                                        <SkillCreatureCards
                                            :creatures="subSkill.实体"
                                            :titlePrefix="`${subSkill.名称 ? $t(subSkill.名称) : ''}->`"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 突破 / 制造 -->
        <section
            v-if="(weapon.突破 && weapon.突破.length > 0) || weaponDraft"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <AniTabs
                v-model="weaponInfoTab"
                :tabs="[
                    { label: '突破', value: 'breakthrough' },
                    { label: '制造', value: 'manufacture' },
                ]"
            />

            <div v-if="weaponInfoTab === 'breakthrough'" class="mt-2">
                <div v-if="weapon.突破 && weapon.突破.length > 0" class="space-y-3">
                    <div
                        v-for="(cost, index) in weapon.突破"
                        :key="index"
                        class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="mb-2 text-[11px] font-semibold tracking-wide text-primary">
                            突破 {{ ["I", "II", "III", "IV", "V", "VI"][index] }}
                        </div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                            <ResourceCostItem v-for="(value, key) in cost" :key="key" :name="key" :value="value" />
                        </div>
                    </div>
                </div>
                <div v-else class="text-sm text-base-content/60">暂无突破数据</div>
            </div>

            <div v-else-if="weaponDraft" class="mt-2">
                <DBDraftDetailItem :draft="weaponDraft" />
            </div>
        </section>

        <!-- 关联角色 -->
        <section
            v-if="exclusiveRelatedChars.length > 0"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="RELATED" title="关联角色" />
            <div class="space-y-1.5 text-sm">
                <div
                    v-for="char in exclusiveRelatedChars"
                    :key="char.id"
                    class="flex min-w-0 items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 transition-colors duration-200 hover:border-primary/40"
                >
                    <SRouterLink :to="`/db/char/${char.id}`" class="min-w-0 truncate transition-colors duration-150 hover:text-primary">
                        {{ $t(char.名称) }}
                    </SRouterLink>
                    <span class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 text-base-content/50"
                        >专武</span
                    >
                </div>
            </div>
        </section>

        <!-- 来源 -->
        <section v-if="weaponSources.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" title="来源" />
            <div class="space-y-3 text-sm">
                <BossSource :boss-sources="hardbossSources" />
                <ShopSource :shop-sources="shopSources" />
            </div>
        </section>
    </div>
</template>
