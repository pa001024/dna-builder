<script setup lang="ts">
import { ref, watchEffect } from "vue"
import type { LeveledChar } from "@/data"
import { LeveledSkill } from "@/data/leveled/LeveledSkill"

const detailTab = ref("溯源")
const selectedSkill = ref<LeveledSkill | null>(null)
const selectedSkillLevel = defineModel<number>({
    default: 12,
})
const props = defineProps<{
    char: LeveledChar
}>()
watchEffect(() => {
    let skill = props.char.技能.find(s => s.名称 === detailTab.value)
    if (!skill) {
        detailTab.value = props.char.技能[0].名称
        skill = props.char.技能[0]
    }
    selectedSkill.value = skill.clone(selectedSkillLevel.value)
})
</script>
<template>
    <h2 class="text-lg font-bold p-2 flex gap-4 justify-between items-center">
        {{ $t("技能") }}
        <span class="text-base-content/50 text-sm">Lv. {{ selectedSkillLevel }}</span>

        <input
            v-model.number="selectedSkillLevel"
            type="range"
            class="range range-primary range-xs ml-auto max-w-64"
            min="1"
            max="12"
            step="1"
        />
    </h2>

    <div class="flex gap-2 p-2">
        <button
            v-for="skill in char.技能"
            :key="skill.名称"
            class="btn btn-sm rounded-full whitespace-nowrap transition-all duration-200"
            :class="detailTab === skill.名称 ? 'btn-primary shadow-lg scale-105' : 'btn-ghost hover:bg-base-200'"
            @click="detailTab = skill.名称"
        >
            {{ $t(skill.名称) }}
        </button>
    </div>
    <div v-if="selectedSkill" class="text-sm">
        <div class="p-2 text-sm font-medium flex items-center gap-2">
            <div
                alt="技能图标"
                class="size-8 rounded-full bg-base-content"
                :style="{ mask: `url(${selectedSkill.url}) no-repeat center/contain` }"
            />
            <div class="flex items-center gap-2">
                {{ $t(selectedSkill.类型) }}
                <span v-if="selectedSkill.skillData.cd" class="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                    CD: {{ selectedSkill.skillData.cd }}s
                </span>
            </div>
        </div>
        <div class="p-2 text-sm">
            {{ $t(selectedSkill.描述 || "") }}
        </div>
        <div v-for="(value, key) in selectedSkill.术语解释" :key="key" class="p-2">
            <div class="text-xs font-medium underline">
                {{ $t(key) }}
            </div>
            <div class="text-xs">
                {{ $t(value) }}
            </div>
        </div>
        <SkillFields :skill="selectedSkill" />
        <!-- 子技能区域 -->
        <div v-if="selectedSkill.skillData.子技能 && selectedSkill.skillData.子技能.length > 0" class="mt-4 p-2">
            <h3 class="text-base font-semibold mb-2">{{ $t("子技能") }}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div v-for="(subSkill, subIndex) in selectedSkill.skillData.子技能" :key="subIndex" class="p-3">
                    <div class="flex items-center gap-2">
                        <div
                            alt="子技能图标"
                            class="size-6 rounded-full bg-base-content"
                            :style="{ mask: `url(${LeveledSkill.url(subSkill.icon)}) no-repeat center/contain` }"
                        />
                        <div class="font-medium text-sm">{{ subSkill.名称 ? $t(subSkill.名称) : "" }} ({{ $t(subSkill.类型) }})</div>
                        <span v-if="subSkill.cd" class="text-xs bg-primary/30 text-primary px-2 py-0.5 rounded-full">
                            CD: {{ subSkill.cd }}s
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <div class="collapse p-2">
            <input type="checkbox" />
            <div class="collapse-title font-semibold p-0">底层数据(点击展开)</div>
            <div class="collapse-content p-0">
                <SkillDetails :skill="selectedSkill.skillData" :lv="selectedSkillLevel" />
            </div>
        </div>
    </div>
</template>
