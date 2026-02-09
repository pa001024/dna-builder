<script setup lang="ts">
import { computed } from "vue"
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
            @click="emit('addSkill', field.名称)"
        >
            <div class="flex justify-between items-center gap-4">
                <div>{{ $t(field.名称) }}</div>
                <div class="font-medium text-primary">
                    {{ formatSkillProp(field.名称, field) }}
                </div>
            </div>
            <div
                v-if="field.影响"
                class="opacity-0 group-hover:opacity-80 justify-between items-center gap-4 flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
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
                class="opacity-0 group-hover:opacity-80 justify-between items-center gap-4 flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300 text-xs"
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
