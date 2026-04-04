<script lang="ts" setup>
import { computed, nextTick, ref, watch } from "vue"
import { LeveledSkill } from "@/data"
import { modConvertData } from "@/data/d/convert.data"
import shopData from "@/data/d/shop.data"
import weaponData from "@/data/d/weapon.data"
import { collectModCharBreakthroughSources, collectModQuestSources } from "@/utils/resource-source"
import { getModDropInfo } from "@/utils/reward-utils"
import type { ShopSourceInfo } from "@/utils/weapon-source"
import { modDraftMap, modDungeonMap } from "../data/d/index"
import { walnutMap } from "../data/d/walnut.data"
import type { Draft, Mod, WeaponSkill } from "../data/data-types"
import { LeveledMod } from "../data/leveled/LeveledMod"
import { formatProp } from "../util"

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

// 根据品质获取颜色
function getQualityColor(quality: string): string {
    const colorMap: Record<string, string> = {
        白: "bg-gray-200 text-gray-800",
        绿: "bg-green-200 text-green-800",
        蓝: "bg-blue-200 text-blue-800",
        紫: "bg-purple-200 text-purple-800",
        金: "bg-yellow-200 text-yellow-800",
    }
    return colorMap[quality] || "bg-base-200 text-base-content"
}

// 处理效果描述中的极性
const formatEffDesc = (desc: string) => {
    const po = desc.match(/([DVOA])趋向/)
    if (!po) {
        return desc
    }
    const parts = desc.split(po[0])
    return [parts[0], po[1], parts[1]]
}

// 获取当前mod的图纸信息
const modDraft = computed<Draft | undefined>(() => {
    return modDraftMap.get(props.mod.id)
})

/**
 * 组装当前魔之楔的副本来源信息，交给独立组件渲染。
 * @returns 副本来源列表
 */
const modDungeonSources = computed(() => {
    return (modDungeonMap.get(props.mod.id) || []).map(
        dungeon => {
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
        }
    )
})
const modQuestSources = computed(() => collectModQuestSources(props.mod.id))
const modCharBreakthroughSources = computed(() => collectModCharBreakthroughSources(props.mod.id))

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
    <div class="p-3 space-y-4">
        <div class="flex items-center gap-3 p-3">
            <SRouterLink :to="`/db/mod/${mod.id}`" class="text-lg font-bold link link-primary">
                {{ $t(mod.系列) }}{{ $t(mod.名称) }}
            </SRouterLink>
            <span class="text-xs text-base-content/70">ID: {{ mod.id }}</span>
            <div class="text-sm text-base-content/70 flex items-center gap-2">
                <span class="px-1.5 py-0.5 rounded" :class="getQualityColor(leveledMod.品质)">
                    {{ $t(leveledMod.品质) }}
                </span>
                <div v-if="mod.极性 || mod.耐受" class="ml-auto badge badge-sm badge-soft gap-1 text-base-content/80">
                    {{ leveledMod.耐受 }}
                    <Icon v-if="mod.极性" :icon="`po-${mod.极性}`" />
                </div>
            </div>
        </div>

        <div class="flex justify-center items-center">
            <img :src="leveledMod.url" class="w-24 object-cover rounded" />
        </div>

        <div class="flex flex-wrap gap-2 text-sm opacity-70 p-3">
            <span>{{ $t(leveledMod.类型) }}</span>
            <span v-if="leveledMod.属性">{{ $t(`${leveledMod.属性}属性`) }}</span>
            <span v-if="leveledMod.限定">{{ $t(leveledMod.限定) }}</span>
            <span v-if="mod.版本">v{{ mod.版本 }}</span>
        </div>

        <!-- 等级调整 -->
        <div class="mb-3 p-3">
            <div class="flex items-center gap-4">
                <span class="text-sm min-w-12">Lv. <input v-model.number="currentLevel" type="text" class="w-12 text-center" /> </span>
                <input
                    :key="leveledMod.id"
                    v-model.number="currentLevel"
                    type="range"
                    class="range range-primary range-xs grow"
                    :min="0"
                    :max="leveledMod.maxLevel"
                    step="1"
                />
            </div>
        </div>

        <div v-if="leveledMod.效果" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">效果</div>
            <div class="text-sm">
                <span v-if="/(?:[DVOA])趋向/.test(leveledMod.效果)">
                    <template v-for="(part, index) in formatEffDesc(leveledMod.效果)" :key="index">
                        <span v-if="index !== 1">{{ part }}</span>
                        <span v-else>
                            <Icon class="inline-block mx-1" :icon="`po-${part as 'A' | 'D' | 'V' | 'O'}`" />
                            趋向
                        </span>
                    </template>
                </span>
                <span v-else>{{ leveledMod.效果 }}</span>
            </div>
        </div>

        <div v-if="leveledMod.buff" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">Buff</div>
            <div class="space-y-2">
                <!-- 等级调整 -->
                <div v-if="leveledMod.buff.mx" class="flex items-center gap-4">
                    <span class="text-sm min-w-12">Lv. {{ buffLv }}</span>
                    <input
                        v-model.number="buffLv"
                        type="range"
                        class="range range-primary range-xs grow"
                        :min="leveledMod.buff.lx ?? 1"
                        :max="leveledMod.buff.mx ?? 1"
                        step="1"
                    />
                </div>
                <label v-else class="text-sm min-w-12">
                    <input v-model="buffLv" type="checkbox" class="toggle toggle-primary toggle-sm" />
                    启用
                </label>
            </div>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">属性</div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div
                    v-for="[key, attr] in Object.entries(leveledMod.getProperties()).filter(([_, v]) => v)"
                    :key="key"
                    class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                >
                    <span class="text-base-content/70">{{ key }}</span>
                    <span class="font-medium text-primary">{{ formatProp(key, attr) }}</span>
                </div>
            </div>
        </div>

        <div v-if="leveledMod.生效" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">条件属性</div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div
                    v-for="[key, attr] in Object.entries(leveledMod.生效).filter(([k, v]) => k !== '条件' && v)"
                    :key="key"
                    class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                >
                    <span class="text-base-content/70">{{ key }}</span>
                    <span class="font-medium text-primary">{{ formatProp(key, attr) }}</span>
                </div>
            </div>
        </div>

        <div v-if="skillReplaceCompareGroups.length" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">技能替换</div>
            <div class="space-y-4">
                <div v-for="group in skillReplaceCompareGroups" :key="group.skillId" class="p-2 bg-base-300 rounded space-y-3">
                    <div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
                        <div class="p-2 bg-base-200 rounded">
                            <div class="flex flex-wrap items-center gap-2 mb-2">
                                <div class="font-medium">
                                    {{ group.sourceSkill ? $t(group.sourceSkill.名称) : `ID: ${group.sourceSkillId}` }}
                                </div>
                                <span class="text-xs opacity-70">ID: {{ group.sourceSkillId }}</span>
                            </div>
                            <SkillFields v-if="group.sourceSkill" :skill="group.sourceSkill" />
                        </div>
                        <div class="flex justify-center items-center text-base-content/50">
                            <Icon icon="ri:arrow-right-line" class="w-4 h-4 rotate-90 md:rotate-0" />
                        </div>
                        <div class="p-2 bg-base-200 rounded">
                            <div class="flex flex-wrap items-center gap-2 mb-2">
                                <div class="font-medium">
                                    {{ $t(group.replaceSkill.名称) }}
                                </div>
                                <span class="text-xs opacity-70">ID: {{ group.replaceSkillId }}</span>
                            </div>
                            <SkillFields :skill="group.replaceSkill" />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 转换概率 -->
        <div v-if="modConvertRates.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">转换概率</div>
            <div class="space-y-2 text-sm">
                <div v-for="rate in modConvertRates" :key="rate.key" class="p-2 bg-base-300 rounded space-y-1">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-medium">{{ rate.label }}</span>
                        <span class="text-primary font-medium">{{ +(rate.probability * 100).toFixed(2) }}%</span>
                    </div>
                    <div class="text-xs text-base-content/70 flex justify-between gap-2">
                        <span>由3个同品质魔之楔转换</span>
                        <span>权重 {{ rate.weight }}/{{ rate.totalWeight }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 升级消耗 -->
        <div v-if="currentLevel > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">升级消耗</div>
            <div class="space-y-2">
                <!-- 深红凝珠 -->
                <ResourceCostItem name="深红凝珠" :value="totalCrimsonPearlCost" />
                <!-- 铜币 -->
                <ResourceCostItem name="铜币" :value="totalGoldCost" />
                <!-- 金色魔之楔消耗（仅金色魔之楔且等级大于5时） -->
                <div
                    v-if="leveledMod.品质 === '金' && currentLevel > 5 && mod.消耗 && mod.消耗.length > 0"
                    class="flex flex-wrap gap-2 items-center"
                >
                    <template v-for="(modId, index) in mod.消耗" :key="modId">
                        <ResourceCostItem class="flex-1" :name="modId.toString()" :value="[totalModCost, modId, 'Mod']" />
                        <span v-if="index < mod.消耗.length - 1" class="text-base-content/70">或</span>
                    </template>
                </div>
            </div>
        </div>

        <!-- 图纸信息 -->
        <div v-if="modDraft" class="bg-base-200 rounded">
            <DBDraftDetailItem :draft="modDraft" />
        </div>

        <div
            v-if="modDungeonSources.length > 0 || modShopSources.length > 0 || modQuestSources.length > 0 || modCharBreakthroughSources.length > 0"
            class="p-3 bg-base-200 rounded"
        >
            <div class="text-xs text-base-content/70 mb-2">来源</div>
            <div class="space-y-3 text-sm">
                <QuestSource :quest-sources="modQuestSources" :mod-id="mod.id" />
                <ModCustomSource :custom-sources="modCharBreakthroughSources" />
                <DungeonSource :dungeon-sources="modDungeonSources" />
                <ShopSource :shop-sources="modShopSources" />
            </div>
        </div>
    </div>
</template>
