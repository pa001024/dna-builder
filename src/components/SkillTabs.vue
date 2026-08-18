<script setup lang="ts">
import type { LeveledSkill } from "../data"

// 组件属性
const props = defineProps<{
    skills: LeveledSkill[]
    selectedSkillName: string
}>()

// 组件事件
const emit = defineEmits<{
    select: [skillName: string]
}>()

// 判断技能是否选中
const isSelected = (skillName: string) => skillName === props.selectedSkillName
</script>

<template>
    <div class="flex rounded-xs border border-base-content/10 bg-base-100/60 p-1" data-tour="skill-select">
        <button
            v-for="(skill, index) in skills"
            :key="index"
            class="flex-1 rounded-[3px] px-2 py-1.5 text-sm font-medium transition-colors duration-200"
            :class="isSelected(skill.名称) ? 'bg-primary text-primary-content' : 'text-base-content/70 hover:bg-base-content/10'"
            @click="emit('select', skill.名称)"
        >
            {{ $t(skill.名称) }}
        </button>
    </div>
</template>
