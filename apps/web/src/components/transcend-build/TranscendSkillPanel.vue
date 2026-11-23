<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { CHAR_SKILL_LEVEL_MIN, type CharAttr, type CharBuild, type LeveledSkill, type TranscendSideLoadout } from "@/data"
import { SKILL_LEVEL_UI_MAX } from "@/utils/skill-level-ui"

/**
 * 左栏技能区：结构与老构筑页「角色」卡一致（`CharBuildView.vue:2581-2609`）：
 * SkillTabs → 当前技能等级滑条 → SkillFields 字段渲染。
 * 等级三元组随 SkillTabs 选中项切换显示与编辑，与计算侧 resolveCharSkillLevel 同口径。
 */

const props = defineProps<{
    loadout: TranscendSideLoadout
    /** 该位角色的技能（未选角色时为空） */
    charSkills: LeveledSkill[]
    /** 该位构筑实例：字段渲染与表达式高亮用 */
    charBuild?: CharBuild | null
    /** 该位武器面板属性：传给 SkillFields */
    attributes?: CharAttr
}>()

const emit = defineEmits<{
    (event: "update", patch: Partial<TranscendSideLoadout>): void
}>()

/** 当前选中技能在等级三元组中的下标：0→E，1→Q，2 及之后→被动 */
const selectedSkillLevelIndex = computed(() => {
    const index = props.charSkills.findIndex(skill => skill.名称 === props.loadout.baseName)
    if (index === -1) return -1
    if (index === 1) return 1
    if (index >= 2) return 2
    return 0
})

/** 当前选中技能（SkillFields 渲染对象） */
const selectedSkill = computed(() => props.charSkills.find(skill => skill.名称 === props.loadout.baseName) ?? null)

/** 当前选中技能的等级：与老构筑页一致，界面只保留一个滑条 */
const currentSkillLevel = computed({
    get: () => {
        if (selectedSkillLevelIndex.value === -1) return 10
        return props.loadout.charSkillLevel[selectedSkillLevelIndex.value as 0 | 1 | 2] ?? 10
    },
    set: value => {
        if (selectedSkillLevelIndex.value === -1) return
        const next = [...props.loadout.charSkillLevel] as [number, number, number]
        next[selectedSkillLevelIndex.value as 0 | 1 | 2] = Math.max(CHAR_SKILL_LEVEL_MIN, Math.min(SKILL_LEVEL_UI_MAX, Math.round(value)))
        emit("update", { charSkillLevel: next })
    },
})

/** 滑条草稿：拖动时只更新本地值，松手（change）才写回，避免每帧重算与写存档 */
const draftLevel = ref(currentSkillLevel.value)
watch(currentSkillLevel, value => {
    if (value !== draftLevel.value) draftLevel.value = value
})

/** 松手写回当前技能等级 */
function commitLevel(): void {
    currentSkillLevel.value = draftLevel.value
}
</script>

<template>
    <div class="space-y-3">
        <div data-tour="skill-select">
            <SkillTabs :skills="charSkills" :selected-skill-name="loadout.baseName" @select="emit('update', { baseName: $event })" />
        </div>
        <div v-if="selectedSkillLevelIndex !== -1" class="flex items-center gap-4 p-1 text-sm">
            <div class="flex-1">
                <input
                    v-model.number="draftLevel"
                    type="range"
                    class="range range-primary range-xs w-full"
                    :min="CHAR_SKILL_LEVEL_MIN"
                    :max="SKILL_LEVEL_UI_MAX"
                    step="1"
                    @change="commitLevel"
                />
            </div>
            <div class="flex-none">Lv. {{ draftLevel }}</div>
        </div>
        <SkillFields
            :skill="selectedSkill"
            :selected-identifiers="charBuild?.getIdentifierNames(charBuild.targetFunction) ?? []"
            :char-build="charBuild ?? undefined"
            :attributes="attributes"
        />
    </div>
</template>
