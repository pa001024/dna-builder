<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core"
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useAttrI18n } from "@/composables/useAttrI18n"
import type { CharBuild } from "@/data/CharBuild"
import { formatWeaponProp } from "@/util"
import { CHAR_ATTR_OUTPUT_KEYS, PORT_META, PortType, WEAPON_ATTR_OUTPUT_KEYS } from "@/utils/nodeEditorPorts"

const props = defineProps<{
    /** char = 角色属性面板；weapon = 武器面板 */
    kind: "char" | "weapon"
    /** 首个构筑的属性面板（向量构筑时作为行的展示基准） */
    values?: Record<string, number> | null
    /** 向量构筑的逐项数值：有值时每项输出向量，否则输出数值 */
    vectors?: Record<string, number[]> | null
    charBuild?: CharBuild | null
    weaponSlot?: string
}>()

const { t } = useTranslation()
const { getAttrName } = useAttrI18n()

const keys = computed(() => (props.kind === "char" ? CHAR_ATTR_OUTPUT_KEYS : WEAPON_ATTR_OUTPUT_KEYS))

/** 角色基础属性：始终显示，不参与「为 0 则隐藏」；技能四维同属基础属性（原版固定显示） */
const CHAR_BASE_KEYS = new Set(["攻击", "生命", "护盾", "防御", "神智", "技能威力", "技能耐久", "技能效益", "技能范围"])

const EPSILON = 1e-9

/**
 * 行是否显示：基础属性始终显示；武器面板隐藏近战的多重；其余属性数值为 0 则隐藏
 * （对齐 CharAttrShow / WeaponTab 的真值过滤，近战没有的装填 / 弹匣 / 弹药也因数值为 0 而隐藏）。
 * @param key 属性键名
 * @returns 是否显示
 */
function isVisible(key: string): boolean {
    if (props.kind === "char" && CHAR_BASE_KEYS.has(key)) return true
    if (props.kind === "weapon" && key === "多重" && baseWeapon.value?.类型.includes("近战")) return false
    const vector = props.vectors?.[key]
    if (vector && vector.length > 0) return vector.some(value => Math.abs(value) > EPSILON)
    const value = props.values?.[key]
    return typeof value === "number" && Math.abs(value) > EPSILON
}

const visibleKeys = computed(() => keys.value.filter(isVisible))

/** 逐项输出端口的类型：向量构筑输出向量，单个构筑输出数值 */
const portType = computed(() => (props.vectors ? PortType.VECTOR : PortType.NUMBER))
const portColor = computed(() => PORT_META[portType.value].color)

/** 生效武器槽：手选优先，未选时跟随构筑默认武器 */
const effectiveSlot = computed<"melee" | "ranged" | "skill">(() => {
    const slot = props.weaponSlot
    if (slot === "melee" || slot === "ranged" || slot === "skill") return slot
    const auto = props.charBuild?.selectedSkillType
    return auto === "远程" ? "ranged" : auto === "同律" ? "skill" : "melee"
})

/** 当前面板武器：按钮槽位对应的武器 */
const weapon = computed(() => {
    const build = props.charBuild
    if (!build) return null
    const slot = effectiveSlot.value
    return slot === "ranged" ? build.rangedWeapon : slot === "skill" ? build.skillWeapon : build.meleeWeapon
})

/** 结算武器：inherit 型同律按被继承武器结算（与 calculateWeaponAttributes / WeaponTab 一致） */
const baseWeapon = computed(() => {
    const build = props.charBuild
    const slotWeapon = weapon.value
    if (!build || !slotWeapon) return null
    const inherit = (slotWeapon as { inherit?: "melee" | "ranged" }).inherit
    if (effectiveSlot.value !== "skill" || !inherit) return slotWeapon
    return inherit === "melee" ? build.meleeWeapon : build.rangedWeapon
})

/**
 * 属性行的展示名：攻击行带角色元素 / 武器伤害类型前缀，其余原样。
 * @param key 属性键名
 * @returns 展示名（同时是翻译键）
 */
function attrLabel(key: string): string {
    const build = props.charBuild
    if (props.kind === "char") return getAttrName(key, build ? `${build.char.属性}属性` : "")
    if (key !== "攻击" || !weapon.value || !build) return key
    const inheritedAttack = effectiveSlot.value === "skill" && build.skillWeapon?.inherit && build.skillWeapon?.atk === "all"
    return `${inheritedAttack ? `${build.char.属性}属性` : weapon.value.伤害类型}攻击`
}

/** 角色属性中按绝对值展示的键（其余按百分比） */
const CHAR_NUMERIC_KEYS = new Set(["攻击", "生命", "护盾", "防御", "神智", "有效生命", "神智回复"])

/** 武器属性中按绝对数值展示的键：与 WeaponTab 一致按「基础攻击」格式（攻速 / 多重等不是百分比） */
const WEAPON_NUMERIC_KEYS = new Set(["攻速", "多重", "弹匣", "装填", "弹药"])

/**
 * 属性值展示：角色属性对齐 CharAttrShow，武器属性对齐 WeaponTab。
 * @param key 属性键名
 * @param value 数值
 * @returns 展示字符串
 */
function formatValue(key: string, value: number): string {
    if (props.kind === "weapon") return formatWeaponProp(WEAPON_NUMERIC_KEYS.has(key) ? "基础攻击" : key, value)
    if (key === "魔灵CD") return `${+value.toFixed(1)}s`
    if (CHAR_NUMERIC_KEYS.has(key)) return `${+value.toFixed(key === "攻击" ? 2 : 0)}`
    return `${+(value * 100).toFixed(2)}%`
}

/**
 * 行内展示值：向量构筑按组合顺序拼接，单个构筑取面板值。
 * @param key 属性键名
 * @returns 展示字符串
 */
function displayValue(key: string): string {
    const vector = props.vectors?.[key]
    if (vector && vector.length > 0) return vector.map(value => formatValue(key, value)).join(" / ")
    const value = props.values?.[key]
    return typeof value === "number" ? formatValue(key, value) : "–"
}
</script>

<template>
    <div class="space-y-px">
        <div v-for="key in visibleKeys" :key="key" class="relative flex h-5 items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-[10px] text-base-content/60">{{ t(attrLabel(key)) }}</span>
            <span class="max-w-36 shrink-0 truncate font-mono text-[10px] text-primary tabular-nums" :title="displayValue(key)">
                {{ displayValue(key) }}
            </span>
            <Handle
                :id="key"
                type="source"
                :position="Position.Right"
                class="border! border-base-100!"
                :style="{ right: '-12px', left: 'auto', top: '50%', transform: 'translateY(-50%)', background: portColor }"
            />
        </div>
    </div>
</template>
