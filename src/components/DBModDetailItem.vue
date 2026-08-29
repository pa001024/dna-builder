<script lang="ts" setup>
import { computed, nextTick, ref, watch } from "vue"
import { LeveledSkill } from "@/data"
import { modConvertData } from "@/data/d/convert.data"
import { modDraftMap, modDungeonMap } from "@/data/d/index"
import shopData from "@/data/d/shop.data"
import { walnutMap } from "@/data/d/walnut.data"
import weaponData from "@/data/d/weapon.data"
import type { Draft, Mod, WeaponSkill } from "@/data/data-types"
import { LeveledMod } from "@/data/leveled/LeveledMod"
import { formatProp } from "@/util"
import { formatModLimit } from "@/utils/mod-limit"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import { collectModCharBreakthroughSources, collectModPackSources, collectModQuestSources } from "@/utils/resource-source"
import { getModDropInfo } from "@/utils/reward-utils"
import type { ShopSourceInfo } from "@/utils/weapon-source"

const props = defineProps<{
    mod: Mod
}>()

interface SkillReplaceCompareGroup {
    skillId: number
    sourceSkillId: number
    replaceSkillId: number
    sourceSkill: LeveledSkill | null
    replaceSkill: LeveledSkill
}

// 当前等级
const currentLevel = ref(LeveledMod.modQualityMaxLevel[props.mod.品质] || 1)
const buffLv = ref(0)
const crimsonPearlCosts = [300, 600, 900, 1200, 1500, 3000, 4500, 6000, 7500, 9000] // 1→2, 2→3, 3→4, 4→5
const goldCosts = [1500, 3000, 4500, 6000, 7500, 15000, 22500, 30000, 37500, 45000] // 1→2, 2→3, 3→4, 4→5
const modCost = [1, 1, 2, 2, 3]

// 创建LeveledMod实例
const leveledMod = computed(() => {
    return new LeveledMod(props.mod, currentLevel.value, buffLv.value)
})

// 监听mod变化，重置等级为新mod的等级上限
watch(
    () => props.mod,
    async newMod => {
        currentLevel.value = LeveledMod.modQualityMaxLevel[newMod.品质] || 1
        await nextTick()
        buffLv.value = leveledMod.value.buff?.mx ?? 0
    }
)

// 处理效果描述中的极性
const formatEffDesc = (desc: string) => {
    const po = desc.match(/([DVOA])趋向/)
    if (!po) {
        return desc
    }
    const parts = desc.split(po[0])
    return [parts[0], po[1], parts[1]]
}

// 获取当前mod的设计稿信息
const modDraft = computed<Draft | undefined>(() => {
    return modDraftMap.get(props.mod.id)
})

/**
 * 组装当前魔之楔的副本来源信息，交给独立组件渲染。
 * @returns 副本来源列表
 */
const modDungeonSources = computed(() => {
    return (modDungeonMap.get(props.mod.id) || []).map(dungeon => {
        const dropInfo = getModDropInfo(dungeon, props.mod.id)

        return {
            key: `mod-dungeon-${props.mod.id}-${dungeon.id}`,
            dungeonId: dungeon.id,
            dungeonName: dungeon.n,
            dungeonType: dungeon.t,
            dungeonLv: dungeon.lv,
            rewardId: props.mod.id,
            pp: dropInfo.pp,
            times: dropInfo.times,
        }
    })
})
const modQuestSources = computed(() => collectModQuestSources(props.mod.id))
const modCharBreakthroughSources = computed(() => collectModCharBreakthroughSources(props.mod.id))
const modPackSources = computed(() => collectModPackSources(props.mod.id))

/**
 * 收集当前魔之楔的商店来源信息。
 * @param mod 魔之楔数据
 * @returns 商店来源列表
 */
function collectModShopSources(mod: Mod): ShopSourceInfo[] {
    const result: ShopSourceInfo[] = []
    const sourceKeySet = new Set<string>()

    shopData.forEach(shop => {
        shop.mainTabs.forEach(mainTab => {
            mainTab.subTabs.forEach(subTab => {
                subTab.items.forEach(item => {
                    const matched =
                        (item.itemType === "Mod" && item.typeId === mod.id) ||
                        (item.itemType === "Walnut" &&
                            walnutMap.get(item.typeId)?.奖励?.some(reward => reward.type === "Mod" && reward.id === mod.id))

                    if (!matched) {
                        return
                    }

                    const key = `shop-${shop.id}-${mainTab.id}-${subTab.id}-${item.id}-${mod.id}`
                    if (sourceKeySet.has(key)) {
                        return
                    }

                    sourceKeySet.add(key)
                    result.push({
                        key,
                        timeStart: item.startTime,
                        timeEnd: item.endTime,
                        detail: `${mainTab.name} -> ${subTab.name}`,
                        itemId: item.id,
                        shopId: shop.id,
                        shopName: shop.name,
                        subTabId: subTab.id,
                        price: item.price,
                        priceName: item.priceName,
                        num: item.num,
                        limit: item.limit,
                    })
                })
            })
        })
    })

    return result
}

/**
 * 收集当前魔之楔的商店来源信息。
 * @returns 商店来源列表
 */
const modShopSources = computed<ShopSourceInfo[]>(() => collectModShopSources(props.mod))

const modConvertPoolLabels = ["紫色魔之楔转换", "蓝色魔之楔转换"] as const
const modConvertTotalWeights = modConvertData.map(pool => pool.Weight.reduce((total, weight) => total + weight, 0))

/**
 * 根据转换池索引返回展示名称
 * @param poolIndex 转换池索引
 * @returns 转换池展示名称
 */
function getModConvertPoolLabel(poolIndex: number): string {
    return modConvertPoolLabels[poolIndex] ?? `转换池${poolIndex + 1}`
}

/**
 * 计算当前魔之楔在转换池中的概率信息
 * 规则：若魔之楔存在于 ModId 中，则概率=对应权重/该池总权重
 */
const modConvertRates = computed(() => {
    return modConvertData.flatMap((pool, poolIndex) => {
        const modIndex = pool.ModId.indexOf(props.mod.id)
        if (modIndex < 0) {
            return []
        }

        const weight = pool.Weight[modIndex]
        const totalWeight = modConvertTotalWeights[poolIndex] ?? 0
        if (weight === undefined || totalWeight <= 0) {
            return []
        }

        return [
            {
                key: `${poolIndex}-${props.mod.id}`,
                label: getModConvertPoolLabel(poolIndex),
                weight,
                totalWeight,
                probability: weight / totalWeight,
            },
        ]
    })
})

/**
 * 计算从0级升到当前等级的总消耗（深红凝珠）
 */
const totalCrimsonPearlCost = computed(() => {
    if (currentLevel.value <= 0) return 0
    // crimsonPearlCosts[i] 表示从 (i+1) 级升到 (i+2) 级的消耗
    // 所以从 0 级升到 n 级，需要求和 crimsonPearlCosts[0] 到 crimsonPearlCosts[n-1]
    const endIndex = Math.min(currentLevel.value - 1, crimsonPearlCosts.length - 1)
    let total = 0
    for (let i = 0; i <= endIndex; i++) {
        total += crimsonPearlCosts[i]
    }
    return total
})

/**
 * 计算从0级升到当前等级的总消耗（铜币）
 */
const totalGoldCost = computed(() => {
    if (currentLevel.value <= 0) return 0
    // goldCosts[i] 表示从 (i+1) 级升到 (i+2) 级的消耗
    const endIndex = Math.min(currentLevel.value - 1, goldCosts.length - 1)
    let total = 0
    for (let i = 0; i <= endIndex; i++) {
        total += goldCosts[i]
    }
    return total
})

/**
 * 计算金色魔之楔消耗（仅金色魔之楔且等级大于5时）
 */
const totalModCost = computed(() => {
    // 只有金色魔之楔且等级大于5才计算
    if (leveledMod.value.品质 !== "金" || currentLevel.value <= 5) return 0
    // modCost[i] 表示从 (5+i) 级升到 (5+i+1) 级需要的金色魔之楔数
    // 所以从 5 级升到 n 级，需要求和 modCost[0] 到 modCost[n-6]
    const endIndex = Math.min(currentLevel.value - 6, modCost.length - 1)
    let total = 0
    for (let i = 0; i <= endIndex; i++) {
        total += modCost[i]
    }
    return total
})

/**
 * 获取技能替换条目，避免模板中 Object.entries 的 unknown 类型问题
 */
const skillReplaceEntries = computed(() => {
    const skillReplace = leveledMod.value.技能替换 as Record<string, WeaponSkill> | undefined
    return skillReplace ? Object.entries(skillReplace) : []
})

/**
 * 按技能 ID 查找被替换的原始武器技能。
 * @param skillId 技能 ID
 * @returns 原始技能及其来源武器名
 */
function findSourceWeaponSkill(skillId: number) {
    for (const weapon of weaponData) {
        const sourceSkill = weapon.技能?.find(skill => skill.id === skillId)
        if (sourceSkill) {
            return { sourceSkill }
        }
    }
    return { sourceSkill: undefined }
}

/**
 * 将技能替换数据整理成左右对照展示所需的条目。
 */
const skillReplaceCompareGroups = computed<SkillReplaceCompareGroup[]>(() => {
    return skillReplaceEntries.value.map(([skillIdKey, replaceSkill]) => {
        const skillId = Number(skillIdKey)
        const { sourceSkill } = findSourceWeaponSkill(skillId)
        return {
            skillId,
            sourceSkillId: sourceSkill?.id || skillId,
            replaceSkillId: replaceSkill.id || skillId,
            sourceSkill: sourceSkill ? new LeveledSkill(sourceSkill) : null,
            replaceSkill: new LeveledSkill(replaceSkill),
        }
    })
})
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 魔之楔档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
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
                <img
                    :src="leveledMod.url"
                    alt="魔之楔图标"
                    class="size-20 shrink-0 overflow-hidden rounded-xs bg-linear-15 object-cover sm:size-24"
                    :class="getRarityGradientClass(mod.品质)"
                />
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Mod File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/mod/${mod.id}`"
                            class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(mod.系列) }}{{ $t(mod.名称) }}
                        </SRouterLink>
                        <CopyID :id="mod.id" />
                        <!-- 极性 / 耐受方章 -->
                        <div
                            v-if="mod.极性 || mod.耐受"
                            class="ml-auto inline-flex shrink-0 items-center gap-1 rounded-xs border border-base-content/15 bg-base-content/3 px-2 py-0.5 font-mono text-xs tabular-nums text-base-content/70"
                        >
                            {{ leveledMod.耐受 }}
                            <Icon v-if="mod.极性" :icon="`po-${mod.极性}`" />
                        </div>
                    </div>

                    <!-- 元信息行：类型 / 属性 / 限定 / 版本 -->
                    <div class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                        <span>{{ $t(leveledMod.类型) }}</span>
                        <template v-if="leveledMod.属性">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span>{{ $t(`${leveledMod.属性}属性`) }}</span>
                        </template>
                        <template v-if="leveledMod.限定">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span>{{ $t(formatModLimit(leveledMod.限定)) }}</span>
                        </template>
                        <template v-if="mod.版本">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span class="font-mono tabular-nums">v{{ mod.版本 }}</span>
                        </template>
                    </div>
                </div>
            </div>
        </header>

        <!-- 等级调整 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LEVEL" />
            <LevelSlider v-model="currentLevel" :step="1" :min="0" :max="leveledMod.maxLevel" />
        </section>

        <!-- 效果 -->
        <section v-if="leveledMod.效果" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="EFFECT" title="效果" />
            <div class="text-sm leading-relaxed text-base-content/85">
                <span v-if="/(?:[DVOA])趋向/.test(leveledMod.效果)">
                    <template v-for="(part, index) in formatEffDesc(leveledMod.效果)" :key="index">
                        <span v-if="index !== 1">{{ part }}</span>
                        <span v-else>
                            <Icon class="mx-1 inline-block" :icon="`po-${part as 'A' | 'D' | 'V' | 'O'}`" />
                            趋向
                        </span>
                    </template>
                </span>
                <span v-else>{{ leveledMod.效果 }}</span>
            </div>
        </section>

        <!-- Buff -->
        <section v-if="leveledMod.buff" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BUFF" title="Buff" />
            <div class="space-y-2">
                <!-- Buff 等级滑杆 / 启用开关 -->
                <div v-if="leveledMod.buff.mx" class="flex items-center gap-4">
                    <span class="min-w-12 shrink-0 font-mono text-[11px] tabular-nums text-base-content/55">Lv. {{ buffLv }}</span>
                    <input
                        v-model.number="buffLv"
                        type="range"
                        class="range range-primary range-xs grow"
                        :min="leveledMod.buff.lx ?? 1"
                        :max="leveledMod.buff.mx ?? 1"
                        step="1"
                    />
                </div>
                <label v-else class="flex items-center gap-2 text-sm text-base-content/70">
                    <input v-model="buffLv" type="checkbox" class="toggle toggle-primary toggle-sm" />
                    启用
                </label>
            </div>
        </section>

        <!-- 属性 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ATTRIBUTES" title="属性" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div
                    v-for="[key, attr] in Object.entries(leveledMod.getProperties()).filter(([_, v]) => v)"
                    :key="key"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t(key) }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatProp(key, attr)
                    }}</span>
                </div>
            </div>
        </section>

        <!-- 条件属性 -->
        <section v-if="leveledMod.生效" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="CONDITIONAL" title="条件属性" />
            <div class="grid grid-cols-2 gap-1.5 md:grid-cols-3">
                <div
                    v-for="[key, attr] in Object.entries(leveledMod.生效).filter(([k, v]) => k !== '条件' && v)"
                    :key="key"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t(key) }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatProp(key, attr)
                    }}</span>
                </div>
            </div>
        </section>

        <!-- 技能替换 -->
        <section
            v-if="skillReplaceCompareGroups.length"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="SKILL REPLACE" title="技能替换" />
            <div class="space-y-3">
                <div
                    v-for="group in skillReplaceCompareGroups"
                    :key="group.skillId"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                        <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <div class="mb-2 flex flex-wrap items-center gap-2">
                                <div class="text-sm font-medium">
                                    {{ group.sourceSkill ? $t(group.sourceSkill.名称) : `ID: ${group.sourceSkillId}` }}
                                </div>
                                <CopyID :id="group.sourceSkillId" />
                            </div>
                            <SkillFields v-if="group.sourceSkill" :skill="group.sourceSkill" />
                        </div>
                        <div class="flex items-center justify-center text-base-content/40">
                            <Icon icon="ri:arrow-right-line" class="h-4 w-4 rotate-90 md:rotate-0" />
                        </div>
                        <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                            <div class="mb-2 flex flex-wrap items-center gap-2">
                                <div class="text-sm font-medium">
                                    {{ $t(group.replaceSkill.名称) }}
                                </div>
                                <CopyID :id="group.replaceSkillId" />
                            </div>
                            <SkillFields :skill="group.replaceSkill" />
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 转换概率 -->
        <section v-if="modConvertRates.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="CONVERT" title="转换概率" />
            <div class="space-y-2 text-sm">
                <div
                    v-for="rate in modConvertRates"
                    :key="rate.key"
                    class="space-y-1 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-medium">{{ rate.label }}</span>
                        <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary"
                            >{{ +(rate.probability * 100).toFixed(2) }}%</span
                        >
                    </div>
                    <div class="flex justify-between gap-2 text-[11px] tabular-nums text-base-content/50">
                        <span>由3个同品质魔之楔转换</span>
                        <span>权重 {{ rate.weight }}/{{ rate.totalWeight }}</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- 升级消耗 -->
        <section v-if="currentLevel > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="COST" title="升级消耗" />
            <div class="space-y-2">
                <!-- 深红凝珠 -->
                <ResourceCostItem name="深红凝珠" :value="totalCrimsonPearlCost" />
                <!-- 铜币 -->
                <ResourceCostItem name="铜币" :value="totalGoldCost" />
                <!-- 金色魔之楔消耗（仅金色魔之楔且等级大于5时） -->
                <div
                    v-if="leveledMod.品质 === '金' && currentLevel > 5 && mod.消耗 && mod.消耗.length > 0"
                    class="flex flex-wrap items-center gap-2"
                >
                    <template v-for="(modId, index) in mod.消耗" :key="modId">
                        <ResourceCostItem class="flex-1" :name="modId.toString()" :value="[totalModCost, modId, 'Mod']" />
                        <span v-if="index < mod.消耗.length - 1" class="text-base-content/60">或</span>
                    </template>
                </div>
            </div>
        </section>

        <!-- 设计稿信息 -->
        <section v-if="modDraft" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BLUEPRINT" title="设计稿信息" />
            <DBDraftDetailItem :draft="modDraft" />
        </section>

        <!-- 来源 -->
        <section
            v-if="
                modDungeonSources.length > 0 ||
                modShopSources.length > 0 ||
                modQuestSources.length > 0 ||
                modCharBreakthroughSources.length > 0 ||
                modPackSources.length > 0
            "
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="SOURCE" title="来源" />
            <div class="space-y-3 text-sm">
                <QuestSource :quest-sources="modQuestSources" :mod-id="mod.id" />
                <ModCustomSource :custom-sources="modCharBreakthroughSources" />
                <DungeonSource :dungeon-sources="modDungeonSources" />
                <ShopSource :shop-sources="modShopSources" />
                <PackSource :pack-sources="modPackSources" source-title="道具箱" />
            </div>
        </section>
    </div>
</template>
