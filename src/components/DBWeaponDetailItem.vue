<script lang="ts" setup>
import { t } from "i18next"
import { computed, ref, watch } from "vue"
import modData from "../data/d/mod.data"
import type { Mod, Skill, SkillField, Weapon, WeaponSkill } from "../data/data-types"
import { LeveledMod } from "../data/leveled/LeveledMod"
import { LeveledSkill } from "../data/leveled/LeveledSkill"
import { LeveledWeapon } from "../data/leveled/LeveledWeapon"
import { formatProp } from "../util"

const props = defineProps<{
    weapon: Weapon
}>()

const currentLevel = ref(80)
const currentRefine = ref(5)
const replaceModLevels = ref<Record<number, number>>({})

const leveledWeapon = computed(() => {
    return new LeveledWeapon(props.weapon, currentRefine.value, currentLevel.value)
})

interface MeleeSkillComboSummary {
    comboTime: number
    totalMultiplier: number
    multiplierPerSecond: number
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
 * 获取 MOD 品质渐变色样式
 * @param quality MOD品质
 * @returns 渐变色 class
 */
function getQualityColor(quality: string): string {
    const colorMap: Record<string, string> = {
        金: "from-yellow-900/80 to-yellow-100/80",
        紫: "from-purple-900/80 to-purple-100/80",
        蓝: "from-blue-900/80 to-blue-100/80",
        绿: "from-green-900/80 to-green-100/80",
        白: "from-gray-900/80 to-gray-100/80",
    }
    return colorMap[quality] || "from-gray-900/80 to-gray-100/80"
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
 * 计算单个近战技能（如普通攻击一套）的连段时间、总倍率与秒均倍率（基于取消时间）
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
        result[skill.名称] = {
            comboTime,
            totalMultiplier,
            multiplierPerSecond: totalMultiplier / comboTime,
        }
    }

    return result
})

watch(
    () => props.weapon,
    () => {
        currentLevel.value = 80
        currentRefine.value = 5
        ensureReplaceModLevels()
    },
    { immediate: true }
)
</script>

<template>
    <ScrollArea class="h-full">
        <div class="p-3 space-y-4">
            <div class="p-3">
                <div class="flex items-center gap-3 mb-3">
                    <SRouterLink :to="`/db/weapon/${weapon.id}`" class="text-lg font-bold link link-primary">
                        {{ $t(weapon.名称) }}
                    </SRouterLink>
                    <span class="text-xs text-base-content/70">ID: {{ weapon.id }}</span>
                </div>

                <div class="flex justify-center items-center mb-3">
                    <img :src="leveledWeapon.url" class="w-24 object-cover rounded" />
                </div>

                <div class="flex flex-wrap gap-2 text-sm opacity-70 mb-3">
                    <span>{{ weapon.类型.map(t => $t(t)).join(", ") }}</span>
                    <span>
                        {{ $t(weapon.伤害类型) }}
                    </span>
                    <span v-if="weapon.版本">v{{ weapon.版本 }}</span>
                </div>

                <div v-if="weapon.描述" class="text-sm text-base-content/70 mb-3">
                    {{ weapon.描述 }}
                </div>
            </div>

            <div class="mb-3">
                <div class="flex items-center gap-4 mb-3">
                    <span class="text-sm min-w-20 flex-none grid grid-cols-2">
                        <span> Lv. </span>
                        <span> {{ currentLevel }} </span>
                    </span>
                    <input
                        :key="leveledWeapon.id"
                        v-model.number="currentLevel"
                        type="range"
                        class="range range-primary range-xs grow"
                        :min="1"
                        :max="80"
                        step="1"
                    />
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-sm min-w-20 flex-none grid grid-cols-2">
                        <span> 熔炼: </span>
                        <span> {{ ["0", "I", "II", "III", "IV", "V"][currentRefine] }} </span>
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
            </div>

            <div class="p-3 bg-base-200 rounded mb-3">
                <div class="text-xs text-base-content/70 mb-2">{{ $t("char-build.base_attr") }}</div>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("攻击") }}</span>
                        <span class="font-medium text-primary">{{ leveledWeapon.基础攻击 }}</span>
                    </div>
                    <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("暴击") }}</span>
                        <span class="font-medium text-primary">{{ formatProp("基础暴击", weapon.暴击) }}</span>
                    </div>
                    <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("暴伤") }}</span>
                        <span class="font-medium text-primary">{{ formatProp("基础暴伤", weapon.暴伤) }}</span>
                    </div>
                    <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("触发") }}</span>
                        <span class="font-medium text-primary">{{ formatProp("基础触发", weapon.触发) }}</span>
                    </div>
                    <div v-if="weapon.弹匣" class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("弹匣") }}</span>
                        <span class="font-medium text-primary">{{ weapon.弹匣 }}</span>
                    </div>
                    <div v-if="weapon.最大弹药" class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("最大弹药") }}</span>
                        <span class="font-medium text-primary">{{ weapon.最大弹药 }}</span>
                    </div>
                    <div v-if="weapon.最大射程" class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("最大射程") }}</span>
                        <span class="font-medium text-primary">{{ weapon.最大射程 }}</span>
                    </div>
                    <div v-if="weapon.装填" class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("装填") }}</span>
                        <span class="font-medium text-primary">{{ formatProp("基础装填", weapon.装填) }}</span>
                    </div>
                    <div v-if="weapon.射击间隔" class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("射击间隔") }}</span>
                        <span class="font-medium text-primary">{{ formatProp("基础装填", weapon.射击间隔) }}</span>
                    </div>
                    <div v-if="leveledWeapon.射速" class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("射速") }}</span>
                        <span class="font-medium text-primary">{{ formatProp("基础弹匣", leveledWeapon.射速) }}</span>
                    </div>
                </div>
            </div>

            <div v-if="weapon.熔炼 && weapon.熔炼.length > 0" class="p-3 bg-base-200 rounded mb-3">
                <div class="text-xs text-base-content/70 mb-2">
                    {{ $t("属性") }}
                </div>
                <div class="space-y-1">
                    {{ weapon.熔炼[currentRefine] }}
                </div>
            </div>

            <div v-if="leveledWeapon.技能 && leveledWeapon.技能.length > 0" class="p-3 bg-base-200 rounded">
                <div class="text-xs text-base-content/70 mb-2">
                    {{ $t("技能") }}
                </div>
                <div class="space-y-3">
                    <div v-for="skill in leveledWeapon.技能" :key="skill.名称">
                        <div class="text-sm font-medium text-primary mb-2 px-2">
                            {{ $t(skill.名称) }}
                        </div>
                        <div
                            v-if="singleSkillComboSummaryByName[skill.名称]"
                            class="text-xs text-base-content/70 mb-2 px-2 flex flex-wrap gap-x-4 gap-y-1"
                        >
                            <span> {{ $t("连段总时长") }}: {{ +singleSkillComboSummaryByName[skill.名称].comboTime.toFixed(4) }}秒 </span>
                            <span>
                                {{ $t("秒均倍率") }}:
                                {{ +(singleSkillComboSummaryByName[skill.名称].multiplierPerSecond * 100).toFixed(1) }}%/s
                            </span>
                            <span>
                                {{ $t("总倍率") }}: {{ +(singleSkillComboSummaryByName[skill.名称].totalMultiplier * 100).toFixed(1) }}%
                            </span>
                        </div>
                        <SkillFields :skill="skill" />
                    </div>
                </div>
            </div>

            <div v-if="weaponSkillReplaceGroups.length > 0" class="p-3 bg-base-200 rounded">
                <div class="text-xs text-base-content/70 mb-2">招式魔之楔</div>
                <div class="space-y-3">
                    <div v-for="group in weaponSkillReplaceGroups" :key="group.skillId" class="p-2 bg-base-300 rounded">
                        <div class="text-sm font-medium mb-2">
                            {{ $t(group.skillName) }}
                            <span class="text-xs opacity-70">({{ group.skillId }})</span>
                        </div>
                        <div class="space-y-2">
                            <div v-for="item in group.items" :key="item.mod.id" class="p-2 bg-base-100 rounded">
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
                                    <div class="flex items-center p-2 rounded bg-base-300 transition-colors duration-200 mb-2">
                                        <img
                                            :src="item.mod.url"
                                            :alt="item.mod.名称"
                                            class="size-8 inline-block mr-2 bg-linear-45 rounded"
                                            :class="getQualityColor(item.mod.品质)"
                                        />
                                        <div class="flex flex-col min-w-0">
                                            <div class="text-sm font-medium truncate">{{ $t(item.mod.系列) }}{{ $t(item.mod.名称) }}</div>
                                            <div class="text-xs opacity-70 flex flex-wrap gap-x-3 gap-y-1">
                                                <span>ID: {{ item.mod.id }}</span>
                                                <span v-if="item.mod.版本">v{{ item.mod.版本 }}</span>
                                                <span v-if="item.mod.耐受" class="inline-flex items-center gap-1">
                                                    {{ $t("耐受") }}
                                                    <Icon v-if="item.mod.极性" :icon="`po-${item.mod.极性}`" />
                                                    <span>{{ item.mod.耐受 }}~{{ item.mod.耐受 - (item.mod.品质 === "金" ? 10 : 5) }}</span>
                                                </span>
                                                <span class="truncate max-w-full">{{ getModPropertiesText(item.mod) }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </ShowProps>
                                <div v-if="item.showLevelControl" class="mb-2">
                                    <div class="flex items-center gap-4">
                                        <span class="text-xs min-w-16">Lv. {{ item.mod.等级 }}</span>
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
                                <div v-if="item.mod.效果" class="text-xs text-base-content/70 mb-2">
                                    {{ item.mod.效果 }}
                                </div>
                                <SkillFields :skill="item.replaceSkill" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="weapon.突破 && weapon.突破.length > 0" class="p-3 bg-base-200 rounded mb-3">
                <div class="text-xs text-base-content/70 mb-2">突破消耗</div>
                <div class="space-y-3">
                    <div v-for="(cost, index) in weapon.突破" :key="index" class="p-2">
                        <div class="text-sm font-medium mb-2 text-primary">突破 {{ ["I", "II", "III", "IV", "V", "VI"][index] }}</div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                            <ResourceCostItem v-for="(value, key) in cost" :key="key" :name="key" :value="value" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
