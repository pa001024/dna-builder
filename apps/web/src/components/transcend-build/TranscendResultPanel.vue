<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { TranscendTeamSnapshot } from "@/utils/transcend-build"
import { getModeResult, getSingleParticipatingSkillName } from "@/utils/transcend-build"

/**
 * 升华伤害结果：与原构筑页目标函数卡一致的单条结果行（合计），不做卡片包装。
 * 表达式错误时用错误行替代结果行；不可用（失败 / 未启用）显示原因而不是 0。
 */

const props = defineProps<{
    snapshot: TranscendTeamSnapshot
}>()

const { t } = useTranslation()
const { gt } = useGameText()

/** 合计结果（failed / invalid / empty 由 getModeResult 统一判定） */
const result = computed(() => getModeResult(props.snapshot, "total"))

/** 结果行左标签：唯一参与段显示该段所选技能名（同原版），否则「合计」 */
const resultLabel = computed(() => {
    const skillName = getSingleParticipatingSkillName(props.snapshot)
    return skillName ? gt(skillName) : t("transcend-build.mode_total")
})

/** 合计不可用时显示的文案键 */
const unavailableKey = computed(() => {
    if (result.value.state === "invalid") return "transcend-build.expression_invalid"
    if (result.value.state === "failed") return "transcend-build.state_failed"
    return "transcend-build.side_unavailable"
})
</script>

<template>
    <!-- 表达式错误：与原版一致，错误行替代结果行 -->
    <div v-if="result.error" class="flex items-center text-xs text-red-500" data-transcend-result-total>
        {{ result.error }}
    </div>
    <div v-else class="flex items-center justify-between p-1" data-agent="transcend-damage-result">
        <div class="text-sm text-base-content/80">{{ resultLabel }}</div>
        <span v-if="result.damage !== null" data-transcend-result-total>
            <DamageShow :value="result.damage" />
        </span>
        <span v-else class="text-sm text-base-content/50" data-transcend-result-total>{{ t(unavailableKey) }}</span>
    </div>
</template>
