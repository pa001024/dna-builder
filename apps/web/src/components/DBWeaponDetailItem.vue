<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import { forgeLevelData } from "@/data"
import charData from "@/data/d/char.data"
import { weaponDraftMap } from "@/data/d/index"
import modData from "@/data/d/mod.data"
import type { Char, Draft, Mod, Skill, Weapon, WeaponSkill } from "@/data/data-types"
import { LeveledChar } from "@/data/leveled/LeveledChar"
import { formatModName, LeveledMod } from "@/data/leveled/LeveledMod"
import { LeveledSkill } from "@/data/leveled/LeveledSkill"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"
import { formatProp } from "@/util"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { collectWeaponSources, type WeaponSourceInfo } from "@/utils/weapon-source"

const props = defineProps<{
    weapon: Weapon
}>()

const { gt, gpt } = useGameText()

const currentLevel = ref(80)
const currentRefine = ref(5)
const replaceModLevels = ref<Record<number, number>>({})
const weaponInfoTab = ref<"applicable" | "breakthrough" | "manufacture" | "calamity">("breakthrough")

const leveledWeapon = computed(() => {
    return new LeveledWeapon(props.weapon, props.weapon.熔炉 && props.weapon.熔炉.length > 0 ? 0 : currentRefine.value, currentLevel.value)
})

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
    return entries.map(([key, value]) => `${gt(key)} ${formatProp(key, value)}`).join(" / ")
}

/**
 * 加成属性（weapon.加成）。
 * 取 LeveledWeapon 上的值而非原始值，这样会随精炼等级缩放（带熔炉的武器视为 0 级熔炼，不缩放）。
 */
const bonusAttributes = computed<{ name: string; value: number }[]>(() => {
    return leveledWeapon.value.baseProperties
        .filter(prop => leveledWeapon.value[prop] !== undefined)
        .map(prop => ({ name: prop, value: leveledWeapon.value[prop] as number }))
})

/**
 * 收集当前武器的来源信息。
 */
const weaponSources = computed<WeaponSourceInfo[]>(() => collectWeaponSources(props.weapon))

/**
 * 是否为灾厄武器（带熔炉）。只有灾厄武器才展示「适用角色」页签。
 */
const isCalamityWeapon = computed(() => (props.weapon.熔炉?.length ?? 0) > 0)

/**
 * 武器类型归一化：弓的长短弓变体统一视为「弓」，其余原样返回。
 * @param type 武器类型原文
 * @returns 归一化后的武器类型
 */
function normalizeWeaponType(type: string) {
    if (type.startsWith("弓")) return "弓"
    return type
}

/**
 * 当前武器的可用类型（去掉近战 / 远程，只留单手剑、长柄等具体类型）。
 */
const weaponCategories = computed(() =>
    (props.weapon.类型 || []).filter(type => type !== "近战" && type !== "远程").map(normalizeWeaponType)
)

/**
 * 精通该武器的角色：精通包含武器类型，或精通为全部类型。
 */
const masteryChars = computed<Char[]>(() => {
    const categories = weaponCategories.value
    if (categories.length === 0) return []
    return charData.filter(
        char => char.精通.includes("全部类型") || char.精通.map(normalizeWeaponType).some(type => categories.includes(type))
    )
})

/**
 * 额外精通该武器的角色：不在精通组，且额外精通包含武器类型。
 */
const extraMasteryChars = computed<Char[]>(() => {
    const categories = weaponCategories.value
    if (categories.length === 0) return []
    const masteryIds = new Set(masteryChars.value.map(char => char.id))
    return charData.filter(
        char => !masteryIds.has(char.id) && (char.额外精通 || []).map(normalizeWeaponType).some(type => categories.includes(type))
    )
})

/**
 * 该角色命中当前武器类型的精通说明：精通含全部类型时返回全部类型，否则返回命中的类型原文。
 * @param char 角色数据
 * @param group 分组：mastery 取精通，extra 取额外精通
 * @returns 命中的精通类型原文列表（模板内逐项 $t 翻译）
 */
function matchedProficiencyTypes(char: Char, group: "mastery" | "extra"): string[] {
    if (group === "mastery" && char.精通.includes("全部类型")) return ["全部类型"]
    const list = group === "mastery" ? char.精通 : char.额外精通 || []
    const categories = weaponCategories.value
    return list.filter(type => categories.includes(normalizeWeaponType(type)))
}

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
 * 熔炼效果正文（去掉首句属性摘要）。
 * 熔炼只有一句属性摘要时去首句后为空串，此时整个区块不展示，避免空盒子。
 */
const refineEffectText = computed(() => gpt(props.weapon.熔炼, currentRefine.value, { stripFirstSentence: true }))

watch(
    () => props.weapon,
    () => {
        currentLevel.value = 80
        currentRefine.value = props.weapon.熔炉 && props.weapon.熔炉.length > 0 ? 0 : 5
        weaponInfoTab.value = props.weapon.熔炉 && props.weapon.熔炉.length > 0 ? "applicable" : "breakthrough"
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
                            class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
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
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('common.description')" />
            <div class="text-sm leading-relaxed text-base-content/85">{{ $t(weapon.描述) }}</div>
        </section>

        <!-- 等级调整 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVEL" :title="$t('等级调整')" />
            <LevelSlider v-model="currentLevel" />
            <WeaponRefineTabs v-if="!weapon.熔炉 || weapon.熔炉.length === 0" v-model="currentRefine" />
        </section>

        <!-- 基础属性 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ATTRIBUTES" :title="$t('char-build.base_attr')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("攻击") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ leveledWeapon.基础攻击 }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("暴击") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        formatProp("基础暴击", weapon.暴击)
                    }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("暴伤") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        formatProp("基础暴伤", weapon.暴伤)
                    }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("触发") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        formatProp("基础触发", weapon.触发)
                    }}</span>
                </div>
                <div
                    v-if="weapon.弹匣"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("弹匣") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ weapon.弹匣 }}</span>
                </div>
                <div
                    v-if="weapon.最大弹药"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("最大弹药") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ weapon.最大弹药 }}</span>
                </div>
                <div
                    v-if="weapon.弹药转化率 !== undefined"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("弹药转化率") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        `${+(weapon.弹药转化率 * 100).toFixed(1)}%`
                    }}</span>
                </div>
                <div
                    v-if="weapon.最大射程"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("最大射程") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        `${+(weapon.最大射程 / 100).toFixed(1)}m`
                    }}</span>
                </div>
                <div
                    v-if="weapon.装填"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("装填") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        formatProp("基础装填", weapon.装填)
                    }}</span>
                </div>
                <div
                    v-if="weapon.射击间隔"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("射击间隔") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        formatProp("基础装填", weapon.射击间隔)
                    }}</span>
                </div>
                <div
                    v-if="leveledWeapon.射速"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t("射速") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        formatProp("攻击", leveledWeapon.射速)
                    }}</span>
                </div>
            </div>
        </section>

        <!-- 加成属性 -->
        <section v-if="bonusAttributes.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BONUS" :title="$t('char-build.bonus_attr')" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div
                    v-for="attr in bonusAttributes"
                    :key="attr.name"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t(attr.name) }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                        formatProp(attr.name, attr.value)
                    }}</span>
                </div>
            </div>
        </section>

        <!-- 熔炼效果 -->
        <section
            v-if="refineEffectText && (!weapon.熔炉 || weapon.熔炉.length === 0)"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="REFINE" :title="$t('属性')" />
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-relaxed text-base-content/85">
                {{ refineEffectText }}
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
                    <SkillDetailBlock :skill="skill" />
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
                                {{ gt(skill.描述) }}
                            </div>
                            <div v-if="skill.加成" class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1.5 text-sm">
                                <div
                                    v-for="(value, name) in skill.加成"
                                    :key="name"
                                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                                >
                                    <span class="text-xs text-base-content/60">{{ $t(name) }}</span>
                                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                                        formatProp(name, value)
                                    }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-if="forge.解锁" class="mb-1 text-[11px] tracking-wide text-base-content/45">
                        {{ $t("weapon-detail.unlock") }}
                    </div>
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                        <ResourceCostItem v-for="(value, name) in forge.解锁" :key="name" :name="name" :value="value" />
                    </div>
                    <template v-if="forge.技能 && forge.技能.length > 0 && forge.技能[0].解锁">
                        <div class="mt-2 mb-1 text-[11px] tracking-wide text-base-content/45">
                            {{ $t("weapon-detail.secondaryUnlock") }}
                        </div>
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
            <SectionHeader no-animate compact kicker="REPLACE" :title="$t('weapon-detail.moveDemonWedges')" />
            <div class="space-y-4">
                <div v-for="group in weaponSkillReplaceGroups" :key="group.skillId">
                    <!-- 技能分组标签行 -->
                    <div class="mb-2 flex items-center gap-2">
                        <span class="text-sm font-medium">{{ $t(group.skillName) }}</span>
                        <CopyID :id="group.skillId" />
                        <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />
                    </div>
                    <div class="space-y-2">
                        <div
                            v-for="item in group.items"
                            :key="item.mod.id"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                        >
                            <ShowProps :mod="item.mod">
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
                                            {{ formatModName(item.mod.系列, item.mod.名称, $t) }}
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
                                    <span class="min-w-16 text-[11px] text-base-content/55">Lv. {{ item.mod.等级 }}</span>
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
                                {{ gpt(item.mod.效果, item.mod.等级) }}
                            </div>
                            <SkillDetailBlock :skill="item.replaceSkill" />
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 突破 / 制造（灾厄武器首位加「适用角色」）：无 SectionHeader，靠注解进滚动目录 -->
        <section
            v-if="(weapon.突破 && weapon.突破.length > 0) || weaponDraft || isCalamityWeapon"
            data-scroll-section="craft"
            :data-scroll-title="`${$t('weapon-detail.ascension')} / ${$t('weapon-detail.crafting')}`"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <AniTabs
                v-model="weaponInfoTab"
                :tabs="
                    isCalamityWeapon
                        ? [
                              { label: $t('weapon-detail.applicable'), value: 'applicable' },
                              { label: $t('weapon-detail.ascension'), value: 'breakthrough' },
                              { label: $t('weapon-detail.crafting'), value: 'manufacture' },
                              { label: $t('database.forge'), value: 'calamity' },
                          ]
                        : [
                              { label: $t('weapon-detail.ascension'), value: 'breakthrough' },
                              { label: $t('weapon-detail.crafting'), value: 'manufacture' },
                          ]
                "
            />

            <div v-if="weaponInfoTab === 'applicable' && isCalamityWeapon" class="mt-2">
                <div class="mb-1 text-[11px] tracking-wide text-base-content/45">{{ $t("weapon-detail.mastery") }}</div>
                <div v-if="masteryChars.length > 0" class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                    <SRouterLink
                        v-for="char in masteryChars"
                        :key="char.id"
                        :to="`/db/char/${char.id}`"
                        class="flex min-w-0 items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40"
                    >
                        <img
                            :src="LeveledChar.url(char.icon)"
                            :alt="char.名称"
                            class="size-8 shrink-0 rounded-xs bg-base-200 object-cover object-top"
                        />
                        <span class="min-w-0 flex-1 truncate transition-colors duration-150 hover:text-primary">{{ $t(char.名称) }}</span>
                        <span class="shrink-0 text-xs whitespace-nowrap text-primary">{{
                            matchedProficiencyTypes(char, "mastery")
                                .map(type => $t(type))
                                .join("、")
                        }}</span>
                    </SRouterLink>
                </div>
                <div v-else class="text-sm text-base-content/60">-</div>
                <div class="mt-2 mb-1 text-[11px] tracking-wide text-base-content/45">{{ $t("weapon-detail.extraMastery") }}</div>
                <div v-if="extraMasteryChars.length > 0" class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                    <SRouterLink
                        v-for="char in extraMasteryChars"
                        :key="char.id"
                        :to="`/db/char/${char.id}`"
                        class="flex min-w-0 items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40"
                    >
                        <img
                            :src="LeveledChar.url(char.icon)"
                            :alt="char.名称"
                            class="size-8 shrink-0 rounded-xs bg-base-200 object-cover object-top"
                        />
                        <span class="min-w-0 flex-1 truncate transition-colors duration-150 hover:text-primary">{{ $t(char.名称) }}</span>
                        <span class="shrink-0 text-xs whitespace-nowrap text-primary">{{
                            matchedProficiencyTypes(char, "extra")
                                .map(type => $t(type))
                                .join("、")
                        }}</span>
                    </SRouterLink>
                </div>
                <div v-else class="text-sm text-base-content/60">-</div>
            </div>

            <div v-else-if="weaponInfoTab === 'breakthrough'" class="mt-2">
                <div v-if="weapon.突破 && weapon.突破.length > 0" class="space-y-3">
                    <div
                        v-for="(cost, index) in weapon.突破"
                        :key="index"
                        class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="mb-2 text-[11px] font-semibold tracking-wide text-primary">
                            {{ $t("weapon-detail.ascension") }} {{ ["I", "II", "III", "IV", "V", "VI"][index] }}
                        </div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                            <ResourceCostItem v-for="(value, key) in cost" :key="key" :name="key" :value="value" />
                        </div>
                    </div>
                </div>
                <div v-else class="text-sm text-base-content/60">{{ $t("weapon-detail.noAscensionData") }}</div>
            </div>

            <div v-else-if="weaponInfoTab === 'manufacture' && weaponDraft" class="mt-2">
                <DBDraftDetailItem embedded :draft="weaponDraft" />
            </div>

            <div v-else-if="weaponInfoTab === 'calamity' && isCalamityWeapon" class="mt-2 space-y-3">
                <DBForgeDetailItem v-for="forge in forgeLevelData" :key="forge.ForgeLevel" embedded :forge="forge" />
            </div>
        </section>

        <!-- 关联角色 -->
        <section
            v-if="exclusiveRelatedChars.length > 0"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="RELATED" :title="$t('weapon-detail.relatedCharacters')" />
            <div class="space-y-1.5 text-sm">
                <div
                    v-for="char in exclusiveRelatedChars"
                    :key="char.id"
                    class="flex min-w-0 items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2 transition-colors duration-200 hover:border-primary/40"
                >
                    <SRouterLink :to="`/db/char/${char.id}`" class="min-w-0 truncate transition-colors duration-150 hover:text-primary">
                        {{ $t(char.名称) }}
                    </SRouterLink>
                    <span class="shrink-0 rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 text-base-content/50">{{
                        $t("common.signature_weapon")
                    }}</span>
                </div>
            </div>
        </section>

        <!-- 来源 -->
        <section v-if="weaponSources.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" :title="$t('weapon-detail.source')" />
            <div class="space-y-3 text-sm">
                <BossSource :boss-sources="hardbossSources" />
                <ShopSource :shop-sources="shopSources" />
            </div>
        </section>
    </div>
</template>
