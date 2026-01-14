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
    <div class="join flex" data-tour="skill-select">
        <button
            v-for="(skill, index) in skills"
            :key="index"
            class="flex-1 btn btn-sm join-item p-0"
            :class="{
                'btn-primary': isSelected(skill.名称),
                'btn-ghost': !isSelected(skill.名称),
            }"
            @click="emit('select', skill.名称)"
        >
            {{ $t(skill.名称) }}
        </button>
    </div>
</template>
