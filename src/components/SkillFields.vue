<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import type { CharAttr, CharBuild, LeveledSkill, SkillField } from "../data"
import { formatSkillProp } from "../util"

// 组件属性
const props = defineProps<{
    skill: LeveledSkill | null | undefined
    selectedIdentifiers?: string[]
    charBuild?: CharBuild
    attributes?: CharAttr
}>()

// 组件事件
const emit = defineEmits<{
    addSkill: [fieldName: string]
}>()

// 计算技能字段列表
const skillFields = computed(() => {
    if (!props.skill) return []
    if (!props.charBuild) return props.skill.getFieldsWithAttr()
    return props.skill.getFieldsWithAttr(
        props.skill?.召唤物 ? props.charBuild.calculateWeaponAttributes(props.charBuild.meleeWeapon) : props.attributes
    )
})

// 判断字段是否在目标函数中被使用
const isIdentifierUsed = (fieldName: string) => {
    if (!props.selectedIdentifiers) return false
    return props.selectedIdentifiers.includes(fieldName)
}

const skillFieldExtraKeys = ["削韧", "延迟", "卡肉", "取消", "连段"] as const

interface SkillFieldExtraItem {
    key: "削韧" | "延迟" | "卡肉" | "取消" | "连段"
    value: number
}

const expandedFieldKeys = ref<Record<string, boolean>>({})
const shouldUseTouchToExpand = ref(false)
let touchMediaQuery: MediaQueryList | null = null

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
 * 生成技能字段的稳定展开键。
 * @param field 技能字段。
 * @param index 字段索引。
 * @returns 当前字段对应的展开状态键。
 */
function getFieldExpandKey(field: SkillField, index: number) {
    return `${field.名称}-${index}`
}

/**
 * 获取技能字段的额外信息（削韧/延迟/卡肉/取消/连段/段数）
 * @param field 技能字段
 * @returns 可展示的额外字段列表
 */
function getSkillFieldExtraItems(field: SkillField): SkillFieldExtraItem[] {
    return skillFieldExtraKeys
        .map(key => {
            const value = pickFieldValue(field[key])
            return value === undefined ? undefined : { key, value }
        })
        .filter((item): item is SkillFieldExtraItem => item !== undefined)
}
/**
 * 格式化技能字段额外信息
 * @param item 额外字段项
 * @returns 格式化字符串
 */
function formatSkillFieldExtra(item: SkillFieldExtraItem) {
    if (["延迟", "卡肉", "取消", "连段"].includes(item.key)) return `${+item.value.toFixed(4)}秒`
    return `${+item.value.toFixed(2)}`
}

/**
 * 判断当前字段是否存在可展开的附加信息。
 * @param field 技能字段。
 * @returns 是否展示额外展开区域。
 */
function hasExpandableContent(field: SkillField) {
    return Boolean(field.影响 || getSkillFieldExtraItems(field).length)
}

/**
 * 判断技能字段是否处于展开状态。
 * @param field 技能字段。
 * @param index 字段索引。
 * @returns 当前字段是否展开。
 */
function isFieldExpanded(field: SkillField, index: number) {
    return Boolean(expandedFieldKeys.value[getFieldExpandKey(field, index)])
}

/**
 * 根据当前终端能力同步移动端触摸展开模式。
 * 无 hover 能力或存在触控点时，使用 touchstart 展开。
 */
function syncTouchExpandMode() {
    if (typeof window === "undefined") return
    const hasTouchPoints = navigator.maxTouchPoints > 0
    shouldUseTouchToExpand.value = Boolean(touchMediaQuery?.matches || hasTouchPoints)
}

/**
 * 处理字段点击事件。
 * 保留原有 addSkill 行为。
 * @param field 技能字段。
 */
function handleFieldClick(field: SkillField) {
    emit("addSkill", field.名称)
}

/**
 * 处理字段触摸开始事件。
 * 移动端触摸时展开/收起附加信息。
 * @param field 技能字段。
 * @param index 字段索引。
 */
function handleFieldTouchStart(field: SkillField, index: number) {
    if (!shouldUseTouchToExpand.value || !hasExpandableContent(field)) return

    const fieldKey = getFieldExpandKey(field, index)
    expandedFieldKeys.value[fieldKey] = !expandedFieldKeys.value[fieldKey]
}

onMounted(() => {
    if (typeof window === "undefined") return

    touchMediaQuery = window.matchMedia("(hover: none), (pointer: coarse)")
    syncTouchExpandMode()
    touchMediaQuery.addEventListener("change", syncTouchExpandMode)
})

onBeforeUnmount(() => {
    touchMediaQuery?.removeEventListener("change", syncTouchExpandMode)
})
</script>

<template>
    <div v-if="skill && skillFields.length > 0" class="text-sm">
        <div
            v-for="(field, index) in skillFields"
            :key="index"
            class="flex flex-col group hover:bg-base-200/50 rounded-md p-2"
            :class="{
                'cursor-pointer': selectedIdentifiers,
                'shadow-md shadow-primary/50 outline-2 outline-primary/60': isIdentifierUsed(field.名称),
            }"
            @click="handleFieldClick(field)"
            @touchstart="handleFieldTouchStart(field, index)"
        >
            <div class="flex justify-between items-center gap-4">
                <div>{{ $t(field.名称) }}</div>
                <div class="font-medium text-primary">
                    {{ formatSkillProp(field.名称, field) }}
                </div>
            </div>
            <div
                v-if="field.影响"
                class="justify-between items-center gap-4 flex overflow-hidden transition-all duration-300"
                :class="
                    isFieldExpanded(field, index) ? 'opacity-80 max-h-32' : 'opacity-0 max-h-0 group-hover:opacity-80 group-hover:max-h-32'
                "
            >
                <div>{{ $t("属性影响") }}</div>
                <div class="ml-auto font-medium">
                    {{
                        field.影响
                            .split(",")
                            .map(item => $t(item))
                            .join(",")
                    }}
                </div>
            </div>
            <div
                v-if="getSkillFieldExtraItems(field).length"
                class="justify-between items-center gap-4 flex overflow-hidden transition-all duration-300 text-xs"
                :class="
                    isFieldExpanded(field, index) ? 'opacity-80 max-h-32' : 'opacity-0 max-h-0 group-hover:opacity-80 group-hover:max-h-32'
                "
            >
                <span>{{ $t("额外字段") }}</span>
                <span class="ml-auto font-medium">
                    {{
                        getSkillFieldExtraItems(field)
                            .map(item => `${$t(item.key)}: ${formatSkillFieldExtra(item)}`)
                            .join(" | ")
                    }}
                </span>
            </div>
        </div>
    </div>
</template>
