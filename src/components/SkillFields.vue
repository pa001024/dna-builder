<script setup lang="ts">
import { computed } from "vue"
import type { CharAttr, CharBuild, LeveledSkill } from "../data"
import { formatSkillProp } from "../util"

// 组件属性
const props = defineProps<{
    skill: LeveledSkill | null | undefined
    selectedIdentifiers: string[]
    charBuild: CharBuild
    attributes: CharAttr
}>()

// 组件事件
const emit = defineEmits<{
    addSkill: [fieldName: string]
}>()

// 计算技能字段列表
const skillFields = computed(() => {
    if (!props.skill) return []
    return props.skill.getFieldsWithAttr(
        props.skill?.召唤物 ? props.charBuild.calculateWeaponAttributes(props.charBuild.meleeWeapon) : props.attributes
    )
})

// 判断字段是否在目标函数中被使用
const isIdentifierUsed = (fieldName: string) => {
    return props.selectedIdentifiers.includes(fieldName)
}
</script>

<template>
    <div v-if="skill && skillFields.length > 0" class="text-sm">
        <div
            v-for="(field, index) in skillFields"
            :key="index"
            class="flex flex-col group hover:bg-base-200/50 rounded-md p-2 cursor-pointer"
            :class="{
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
        </div>
    </div>
</template>
