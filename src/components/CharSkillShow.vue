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
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <!-- 章节头：标题 + 技能等级滑杆 -->
        <SectionHeader no-animate compact kicker="SKILLS" :title="$t('技能')">
            <template #trailing>
                <div class="flex items-center gap-2">
                    <span class="font-mono text-[11px] tabular-nums text-base-content/50">Lv.{{ selectedSkillLevel }}</span>
                    <input
                        v-model.number="selectedSkillLevel"
                        type="range"
                        class="range range-primary range-xs w-40 max-w-40"
                        min="1"
                        max="12"
                        step="1"
                    />
                </div>
            </template>
        </SectionHeader>

        <!-- 技能切换方章 -->
        <div class="mt-2 flex flex-wrap gap-1.5">
            <button
                v-for="skill in char.技能"
                :key="skill.名称"
                type="button"
                class="cursor-pointer whitespace-nowrap rounded-xs border px-2.5 py-1 text-xs transition-colors duration-150 active:scale-[0.97]"
                :class="
                    detailTab === skill.名称
                        ? 'border-primary bg-primary font-semibold text-primary-content'
                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                "
                @click="detailTab = skill.名称"
            >
                {{ $t(skill.名称) }}
            </button>
        </div>

        <div v-if="selectedSkill" class="mt-3 text-sm">
            <!-- 技能图标 + 类型 + CD -->
            <div class="flex items-center gap-2.5">
                <div
                    alt="技能图标"
                    class="size-8 shrink-0 rounded-xs bg-base-content"
                    :style="{ mask: `url(${selectedSkill.url}) no-repeat center/contain` }"
                />
                <span class="font-medium">{{ $t(selectedSkill.类型) }}</span>
                <span
                    v-if="selectedSkill.skillData.cd"
                    class="rounded-xs bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary"
                >
                    CD: {{ selectedSkill.skillData.cd }}s
                </span>
            </div>

            <!-- 技能描述 -->
            <p class="mt-2.5 leading-relaxed text-base-content/85">{{ $t(selectedSkill.描述 || "") }}</p>

            <!-- 术语解释 -->
            <div v-if="selectedSkill.术语解释" class="mt-3 space-y-2">
                <div
                    v-for="(value, key) in selectedSkill.术语解释"
                    :key="key"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="text-xs font-medium text-primary">{{ $t(key) }}</div>
                    <div class="mt-1 text-xs leading-relaxed text-base-content/70">{{ $t(value) }}</div>
                </div>
            </div>

            <SkillFields :skill="selectedSkill" />

            <!-- 子技能区域 -->
            <div v-if="selectedSkill.skillData.子技能 && selectedSkill.skillData.子技能.length > 0" class="mt-4">
                <div class="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-base-content/45">{{ $t("子技能") }}</div>
                <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div
                        v-for="(subSkill, subIndex) in selectedSkill.skillData.子技能"
                        :key="subIndex"
                        class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="flex items-center gap-2">
                            <div
                                alt="子技能图标"
                                class="size-6 shrink-0 rounded-xs bg-base-content"
                                :style="{ mask: `url(${LeveledSkill.url(subSkill.icon)}) no-repeat center/contain` }"
                            />
                            <div class="truncate text-sm font-medium">
                                {{ subSkill.名称 ? $t(subSkill.名称) : "" }} ({{ $t(subSkill.类型) }})
                            </div>
                            <span
                                v-if="subSkill.cd"
                                class="ml-auto shrink-0 rounded-xs bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-primary"
                            >
                                CD: {{ subSkill.cd }}s
                            </span>
                        </div>
                        <div v-if="subSkill.实体 && subSkill.实体.length > 0" class="mt-2">
                            <SkillCreatureCards :creatures="subSkill.实体" :titlePrefix="`${subSkill.名称 ? $t(subSkill.名称) : ''}->`" />
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="selectedSkill.skillData.实体 && selectedSkill.skillData.实体.length > 0" class="mt-3">
                <div class="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-base-content/45">{{ $t("实体") }}</div>
                <SkillCreatureCards :creatures="selectedSkill.skillData.实体" />
            </div>
        </div>
    </section>
</template>
