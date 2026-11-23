<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import { getSkillLevelName } from "@/data"
import type { DnaSeasonAffix } from "@/data/d/dnaseasonequip.data"
import { getAffixSkillLevelInfo } from "@/utils/transcend-gear/display"
import { calculateAffixValue, formatCalcValue, getAffixAttrs } from "@/utils/transcendence-gear"

const props = defineProps<{
    /** 当前词条；外层按 id 重挂载，切换词条时自动回到默认档位 */
    affix: DnaSeasonAffix
}>()

const { t } = useTranslation()
const { gt } = useGameText()

/** 精造次数上限（上游 craft 1 maxCount = 10） */
const MAX_MASTERWORK = 10

const totalLevel = computed(() => Math.max(props.affix.totalValueLevel, 1))
const attrs = computed(() => getAffixAttrs(props.affix))
/** 技能等级目标：Plan 3 `skillTypes`，Plan 4 `skillIds` 统一解析为展示用技能类型 */
const skillInfo = computed(() => getAffixSkillLevelInfo(props.affix))
const skillTypes = computed(() => skillInfo.value.skillTypes)
const hasSkillLevel = computed(() => skillInfo.value.isSkillLevel)
const hasNumericValue = computed(() => attrs.value.length > 0)
const canCalculate = computed(() => hasNumericValue.value || hasSkillLevel.value)

const rollLevel = ref(totalLevel.value)
const masterworkLevel = ref(0)
const ancient = ref(false)
const finalMasterwork = ref(false)

/** 输入钳制到数据范围，避免手输越界后公式出现外推 */
watch([rollLevel, masterworkLevel], () => {
    const nextRoll = Math.min(Math.max(Math.round(rollLevel.value || 1), 1), totalLevel.value)
    if (nextRoll !== rollLevel.value) {
        rollLevel.value = nextRoll
    }

    const nextMasterwork = Math.min(Math.max(Math.round(masterworkLevel.value || 0), 0), MAX_MASTERWORK)
    if (nextMasterwork !== masterworkLevel.value) {
        masterworkLevel.value = nextMasterwork
    }
})

const result = computed(() =>
    calculateAffixValue(props.affix, {
        rollLevel: rollLevel.value,
        masterworkLevel: masterworkLevel.value,
        ancient: ancient.value,
        finalMasterwork: finalMasterwork.value,
    })
)

/** 公式逐步输出；没有属性块时只用「技能等级 +N」表达 */
const steps = computed(() => {
    const attr = attrs.value[0]
    const format = (value: number) => (attr ? formatCalcValue(attr, value) : `${+value.toFixed(4)}`)

    return [
        { key: "roll", label: t("db-transcendence.gear.calc_step_roll"), value: format(result.value.rolled) },
        {
            key: "ancient",
            label: t("db-transcendence.gear.calc_step_ancient"),
            value: format(result.value.afterAncient),
            muted: !result.value.ancientApplied,
        },
        {
            key: "masterwork",
            label: t("db-transcendence.gear.calc_step_masterwork", { count: result.value.masterworkLevel }),
            value: format(result.value.afterMasterwork),
        },
        {
            key: "final",
            label: t("db-transcendence.gear.calc_step_final"),
            value: format(result.value.final),
            muted: !result.value.finalApplied,
        },
    ]
})

/** 技能等级增量：太古取上限、最终精造再加，按整数展示 */
const skillDelta = computed(() => Math.round(result.value.final))

const finalText = computed(() => {
    if (hasSkillLevel.value) {
        return `+${skillDelta.value}`
    }

    const attr = attrs.value[0]

    if (!attr) {
        return `${+result.value.final.toFixed(4)}`
    }

    return formatCalcValue(attr, result.value.final)
})

/**
 * 重置计算器到默认档位（满 roll、无精造/太古/最终精造）。
 */
function reset(): void {
    rollLevel.value = totalLevel.value
    masterworkLevel.value = 0
    ancient.value = false
    finalMasterwork.value = false
}
</script>

<template>
    <div class="space-y-3">
        <div v-if="!canCalculate" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-[11px] leading-relaxed text-base-content/55">
            {{ $t("db-transcendence.gear.calc_plan4_note") }}
        </div>
        <template v-else>
            <div class="grid gap-3 sm:grid-cols-2">
                <label class="space-y-1">
                    <span class="flex items-center justify-between text-[11px] text-base-content/55">
                        {{ $t("db-transcendence.gear.calc_roll_level") }}
                        <b class="font-orbitron text-[11px] font-semibold text-primary">1–{{ totalLevel }}</b>
                    </span>
                    <input v-model.number="rollLevel" type="range" min="1" :max="totalLevel" step="1" class="range range-primary range-xs w-full" />
                    <input
                        v-model.number="rollLevel"
                        type="number"
                        min="1"
                        :max="totalLevel"
                        step="1"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] outline-none focus:border-primary"
                    />
                </label>
                <label class="space-y-1">
                    <span class="flex items-center justify-between text-[11px] text-base-content/55">
                        {{ $t("db-transcendence.gear.calc_masterwork_level") }}
                        <b class="font-orbitron text-[11px] font-semibold text-primary">0–{{ MAX_MASTERWORK }}</b>
                    </span>
                    <input v-model.number="masterworkLevel" type="range" min="0" :max="MAX_MASTERWORK" step="1" class="range range-primary range-xs w-full" />
                    <input
                        v-model.number="masterworkLevel"
                        type="number"
                        min="0"
                        :max="MAX_MASTERWORK"
                        step="1"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] outline-none focus:border-primary"
                    />
                </label>
            </div>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label class="inline-flex cursor-pointer items-center gap-1.5 text-[12px]" :class="affix.ancientFunc ? '' : 'cursor-not-allowed opacity-45'">
                    <input v-model="ancient" type="checkbox" class="checkbox checkbox-primary checkbox-xs" :disabled="!affix.ancientFunc" />
                    {{ $t("db-transcendence.gear.calc_ancient") }}
                </label>
                <label
                    class="inline-flex cursor-pointer items-center gap-1.5 text-[12px]"
                    :class="affix.maxAffixUpdateFunc ? '' : 'cursor-not-allowed opacity-45'"
                >
                    <input
                        v-model="finalMasterwork"
                        type="checkbox"
                        class="checkbox checkbox-primary checkbox-xs"
                        :disabled="!affix.maxAffixUpdateFunc"
                    />
                    {{ $t("db-transcendence.gear.calc_final") }}
                </label>
                <button type="button" class="btn btn-xs ml-auto whitespace-nowrap" @click="reset">
                    {{ $t("db-transcendence.gear.calc_reset") }}
                </button>
            </div>

            <div class="space-y-1">
                <div
                    v-for="step in steps"
                    :key="step.key"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-1.5"
                    :class="step.muted ? 'opacity-45' : ''"
                >
                    <span class="text-[11px] text-base-content/60">{{ step.label }}</span>
                    <span class="font-orbitron text-[12px] font-semibold text-base-content/80">{{ step.value }}</span>
                </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-primary/40 bg-primary/10 px-2.5 py-2">
                <span class="text-[11px] font-medium text-primary">{{ $t("db-transcendence.gear.calc_final_value") }}</span>
                <span class="font-orbitron text-lg font-bold text-primary">{{ finalText }}</span>
            </div>

            <p v-if="hasSkillLevel" class="text-[11px] leading-relaxed text-base-content/50" data-skill-level-note>
                {{ $t("db-transcendence.gear.calc_skill_level", { value: skillDelta }) }}
                <template v-if="skillTypes.length"> · {{ skillTypes.map(type => gt(getSkillLevelName(type) || type)).join(" / ") }}</template>
            </p>
            <p v-if="hasSkillLevel" class="text-[11px] leading-relaxed text-base-content/40">
                {{ $t("db-transcendence.gear.calc_skill_clamp") }}
            </p>
            <p v-if="hasSkillLevel && !hasNumericValue" class="text-[11px] leading-relaxed text-base-content/40">
                {{ $t("db-transcendence.gear.calc_plan3_note") }}
            </p>
            <p v-if="attrs.length" class="text-[11px] leading-relaxed text-base-content/40">
                {{ attrs.map(attr => gt(attr.attr)).join(" · ") }}
            </p>
        </template>
    </div>
</template>
