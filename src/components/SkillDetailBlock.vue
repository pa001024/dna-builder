<script setup lang="ts">
import { computed } from "vue"
import type { LeveledSkill } from "@/data"
import { getMeleeSkillComboSummary } from "@/utils/skill-combo"

const props = defineProps<{
    skill: LeveledSkill | null | undefined
}>()

/** 当前技能的连段汇总，不可汇总时为 undefined（模板不展示统计行） */
const comboSummary = computed(() => getMeleeSkillComboSummary(props.skill))
</script>

<template>
    <div v-if="skill">
        <!-- 连段汇总：时长 / 秒均倍率 / 总倍率 / Boss削韧，与 dbweapon 技能块一致 -->
        <div
            v-if="comboSummary"
            class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-base-content/55"
        >
            <span> {{ $t("连段总时长") }}: {{ +comboSummary.comboTime.toFixed(4) }}{{ $t("skill-fields.seconds") }} </span>
            <span> {{ $t("秒均倍率") }}: {{ +(comboSummary.multiplierPerSecond * 100).toFixed(1) }}%/s </span>
            <span> {{ $t("总倍率") }}: {{ +(comboSummary.totalMultiplier * 100).toFixed(1) }}% </span>
            <span>{{ $t("skill-fields.bossStagger") }}: {{ +comboSummary.totalBossStagger.toFixed(2) }}</span>
        </div>
        <SkillFields :skill="skill" />
        <div
            v-if="skill.skillData.实体 && skill.skillData.实体.length > 0"
            class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2"
        >
            <SkillCreatureCards :creatures="skill.skillData.实体" />
        </div>
        <div v-if="skill.skillData.子技能 && skill.skillData.子技能.length > 0" class="mt-2 space-y-2">
            <div v-for="subSkill in skill.skillData.子技能" :key="subSkill.名称 || subSkill.id || ''">
                <div
                    v-if="subSkill.实体 && subSkill.实体.length > 0"
                    class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2"
                >
                    <SkillCreatureCards
                        :creatures="subSkill.实体"
                        :titlePrefix="`${subSkill.名称 ? $t(subSkill.名称) : ''}->`"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
