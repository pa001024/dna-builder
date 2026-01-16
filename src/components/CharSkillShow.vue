<script setup lang="ts">
import { ref, watchEffect } from "vue"
import type { LeveledChar, LeveledSkill } from "@/data"
import { formatSkillProp } from "@/util"

const detailTab = ref("溯源")
const selectedSkill = ref<LeveledSkill | null>(null)
const selectedSkillLevel = ref(12)
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
    <h2 v-if="char.溯源" class="text-lg font-bold p-2 mt-2">
        {{ $t("溯源") }}
    </h2>
    <div v-if="char.溯源" class="flex flex-col gap-2 p-2">
        <div v-for="(grade, i) in char.溯源" :key="i" class="font-medium flex text-sm justify-between items-center gap-8">
            <div class="font-medium whitespace-nowrap opacity-70">
                {{ $t("第" + ["一", "二", "三", "四", "五", "六"][i] + "根源") }}
            </div>
            <div>{{ $t(grade) }}</div>
        </div>
    </div>
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
            {{ $t(selectedSkill.类型) }}
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
        <div
            v-for="(val, index) in selectedSkill!.getFieldsWithAttr()"
            :key="index"
            class="flex flex-col group hover:bg-base-200/50 rounded-md p-2"
        >
            <div class="flex justify-between items-center gap-4">
                <div>{{ $t(val.名称) }}</div>
                <div class="font-medium text-primary">
                    {{ formatSkillProp(val.名称, val) }}
                </div>
            </div>
            <div
                v-if="val.影响"
                class="opacity-0 group-hover:opacity-80 justify-between items-center gap-4 flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
            >
                <div>{{ $t("属性影响") }}</div>
                <div class="ml-auto font-medium">
                    {{
                        val.影响
                            .split(",")
                            .map(item => $t(item))
                            .join(",")
                    }}
                </div>
            </div>
        </div>
        <div class="collapse p-2">
            <input type="checkbox" />
            <div class="collapse-title font-semibold p-0">底层数据</div>
            <div class="collapse-content p-0">
                <SkillDetails :skill="selectedSkill.skillData" :lv="selectedSkillLevel" />
            </div>
        </div>
    </div>
</template>
