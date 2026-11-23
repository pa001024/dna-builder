<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import { type DnaSeasonAffix, getSkillLevelName, resolveAffixValue, TRANSCEND_MASTERWORK_MAX, type TranscendGearEntry } from "@/data"
import { getAffixSkillLevelInfo } from "@/utils/transcend-gear/display"
import { cleanGameMarkup } from "@/utils/transcendence-display"
import {
    formatAffixValue,
    formatModeledAffixValue,
    getAffixAttrs,
    getAffixCapabilities,
    getAffixModeledSummary,
    getAffixModeledValues,
    getAffixModeling,
    getAffixNote,
    getAffixSummaryParts,
    getMappingLabelKey,
    getMappingPartialLabelKey,
    getPlanLabelKey,
    resolveCoverageTokenLabel,
} from "@/utils/transcendence-gear"
import TranscendAffixTypeBadge from "./TranscendAffixTypeBadge.vue"

/**
 * 单条升华装备词缀：类型徽章 + 按数据能力显示的养成控件（档位 / 精造 / 太古 / 最终精造）。
 * 数值结算复用数据层 `resolveAffixValue`，不在 UI 重写公式。
 */

const props = withDefaults(
    defineProps<{
        affix: DnaSeasonAffix
        entry: TranscendGearEntry
        /** 父级显式只读（宝石 / 专属条目也会自动只读） */
        readonly?: boolean
        /** 是否允许移除（只读条目恒不可移除） */
        removable?: boolean
    }>(),
    { removable: true }
)

const emit = defineEmits<{
    (event: "update", patch: Partial<Omit<TranscendGearEntry, "slotId" | "affixId">>): void
    (event: "remove"): void
}>()

const { t } = useTranslation()
const { gt } = useGameText()

const totalLevel = computed(() => Math.max(1, Math.round(props.affix.totalValueLevel || 1)))
const attrs = computed(() => getAffixAttrs(props.affix))
/** 技能等级目标：Plan 3 `skillTypes`，Plan 4 `skillIds` 统一解析为展示用技能类型 */
const skillInfo = computed(() => getAffixSkillLevelInfo(props.affix))
const skillTypes = computed(() => skillInfo.value.skillTypes)
const hasSkillLevel = computed(() => skillInfo.value.isSkillLevel)
/** 手写建模数值：无数据属性时作为词条数值展示 */
const modeledValues = computed(() => getAffixModeledValues(props.affix.id))
const modeledText = computed(() => modeledValues.value.map(formatModeledAffixValue).join(" · "))
const hasValue = computed(() => attrs.value.length > 0 || hasSkillLevel.value || modeledValues.value.length > 0)

/** 词缀分类文案：plan 4 已由类型徽章（专属 / 宝石）表达，不重复展示 */
const planLabel = computed(() => (props.affix.plan === 4 ? "" : t(getPlanLabelKey(props.affix.plan))))
/** 词缀类型与数据实际支持的养成项（普通 / 暗金专属 / 宝石 / 未知） */
const capabilities = computed(() => getAffixCapabilities(props.entry, props.affix))

/** 手写建模口径（仅 Plan 4 词条登记）：partial / included / excluded */
const modeling = computed(() => getAffixModeling(props.affix.id))
/** 只有建模登记或词条数据显式标注时才展示映射徽章；宝石词缀没有映射语义 */
const mappingStatus = computed(() => modeling.value?.status ?? props.affix.mappingStatus ?? "")
const mappingLabel = computed(() => {
    if (capabilities.value.type === "gem") return ""
    if (mappingStatus.value !== "exact") return ""
    const key = getMappingLabelKey(mappingStatus.value)
    return key ? t(key) : ""
})
const partialLabel = computed(() => (modeling.value?.partial ? t(getMappingPartialLabelKey()) : ""))

/** 宝石与暗金专属条目由物品数据驱动，界面只读；孔位编辑留 U22b */
const isReadonly = computed(() => props.readonly === true || capabilities.value.type === "gem" || capabilities.value.type === "unique")
const canRemove = computed(() => props.removable !== false && !isReadonly.value)

/** 摘要逐段翻译：建模数值优先走 labelKey，其余每段都是游戏原文，不能整体套 `gt` */
const summary = computed(() => {
    const modeled = getAffixModeledSummary(props.affix, t, gt)
    return modeled || getAffixSummaryParts(props.affix).map(part => gt(part)).join(" · ")
})

/** 覆盖项 token：界面文案键优先，未登记时走游戏原文（数据包对照表） */
function tokenLabel(token: string): string {
    return resolveCoverageTokenLabel(token, key => t(key), gt)
}

const includedTokens = computed(() => (modeling.value?.included ?? []).map(token => ({ token, label: tokenLabel(token) })))
const excludedTokens = computed(() => (modeling.value?.excluded ?? []).map(token => ({ token, label: tokenLabel(token) })))
/** 本地建模说明：只读展示，不参与计算 */
const noteText = computed(() => getAffixNote(props.affix.id))

/** 结算值：技能等级词条显示 `+N`，属性词条按百分比/绝对值格式化 */
const resolvedValue = computed(() => resolveAffixValue(props.affix, props.entry).final)
const skillLevelValue = computed(() => Math.round(resolvedValue.value))
const valueText = computed(() => {
    if (hasSkillLevel.value) return `+${skillLevelValue.value}`
    const attr = attrs.value[0]
    if (attr) return formatAffixValue(attr, resolvedValue.value)
    if (modeledText.value) return modeledText.value
    return `${+resolvedValue.value.toFixed(2)}`
})
</script>

<template>
    <div
        class="space-y-2 rounded-xs border border-base-content/10 bg-base-100/50 p-2.5"
        :data-affix-type="capabilities.type"
        :data-readonly="isReadonly ? '1' : '0'"
    >
        <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-1.5">
                    <span class="truncate text-[12px] font-medium" :title="summary">{{ summary }}</span>
                    <TranscendAffixTypeBadge :type="capabilities.type" />
                    <span v-if="planLabel" class="border border-base-content/20 px-1 py-px text-[10px] leading-none text-base-content/55">{{ planLabel }}</span>
                    <span
                        v-if="mappingLabel"
                        class="border px-1 py-px text-[10px] leading-none"
                        :class="mappingStatus === 'exact' ? 'border-success/40 text-success/80' : 'border-warning/40 text-warning/80'"
                    >
                        {{ mappingLabel }}
                    </span>
                    <span v-if="partialLabel" class="border border-warning/40 px-1 py-px text-[10px] leading-none text-warning/80">
                        {{ partialLabel }}
                    </span>
                </div>
                <p v-if="skillTypes.length" class="text-[11px] text-base-content/50">
                    {{ skillTypes.map(type => gt(getSkillLevelName(type) || type)).join(" / ") }}
                </p>
                <p v-else-if="hasSkillLevel" class="text-[11px] text-base-content/50" data-skill-level>
                    {{ $t("db-transcendence.gear.calc_skill_level", { value: skillLevelValue }) }}
                </p>
                <p v-else-if="!attrs.length" class="line-clamp-2 text-[11px] leading-relaxed text-base-content/45">
                    {{ cleanGameMarkup(gt(affix.desc)) }}
                </p>
            </div>
            <button
                v-if="canRemove"
                type="button"
                class="btn btn-ghost btn-xs shrink-0"
                :title="$t('transcend-build.gear_remove')"
                @click="emit('remove')"
            >
                <Icon icon="codicon:chrome-close" />
            </button>
        </div>

        <template v-if="hasValue">
            <div v-if="!isReadonly && (capabilities.roll || capabilities.masterwork)" class="grid gap-x-3 gap-y-2 sm:grid-cols-2">
                <label v-if="capabilities.roll" class="space-y-1">
                    <span class="flex items-center justify-between text-[10px] text-base-content/50">
                        {{ $t("transcend-build.gear_roll") }}
                        <b class="font-orbitron text-[10px] font-semibold text-primary">1–{{ totalLevel }}</b>
                    </span>
                    <input
                        :value="entry.rollLevel"
                        type="range"
                        min="1"
                        :max="totalLevel"
                        step="1"
                        class="range range-primary range-xs w-full"
                        @input="emit('update', { rollLevel: Number(($event.target as HTMLInputElement).value) })"
                    />
                </label>
                <label v-if="capabilities.masterwork" class="space-y-1">
                    <span class="flex items-center justify-between text-[10px] text-base-content/50">
                        {{ $t("transcend-build.gear_masterwork") }}
                        <b class="font-orbitron text-[10px] font-semibold text-primary">0–{{ TRANSCEND_MASTERWORK_MAX }}</b>
                    </span>
                    <input
                        :value="entry.masterworkLevel"
                        type="range"
                        min="0"
                        :max="TRANSCEND_MASTERWORK_MAX"
                        step="1"
                        class="range range-primary range-xs w-full"
                        @input="emit('update', { masterworkLevel: Number(($event.target as HTMLInputElement).value) })"
                    />
                </label>
            </div>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <label v-if="!isReadonly && capabilities.ancient" class="inline-flex items-center gap-1 text-[11px]">
                    <input
                        type="checkbox"
                        class="checkbox checkbox-primary checkbox-xs"
                        :checked="entry.ancient"
                        @change="emit('update', { ancient: ($event.target as HTMLInputElement).checked })"
                    />
                    {{ $t("transcend-build.gear_ancient") }}
                </label>
                <label v-if="!isReadonly && capabilities.finalMasterwork" class="inline-flex items-center gap-1 text-[11px]">
                    <input
                        type="checkbox"
                        class="checkbox checkbox-primary checkbox-xs"
                        :checked="entry.finalMasterwork"
                        @change="emit('update', { finalMasterwork: ($event.target as HTMLInputElement).checked })"
                    />
                    {{ $t("transcend-build.gear_final") }}
                </label>
                <span v-if="capabilities.fixed" class="border border-base-content/20 px-1 py-px text-[10px] leading-none text-base-content/55">
                    {{ $t("transcend-build.gear_fixed_value") }}
                </span>
                <span class="ml-auto flex items-baseline gap-1.5">
                    <span class="text-[10px] tracking-wide text-base-content/45">{{ $t("transcend-build.gear_value") }}</span>
                    <span
                        class="font-orbitron text-[13px] font-semibold text-primary"
                        :data-modeled-values="modeledText || undefined"
                    >
                        {{ valueText }}
                    </span>
                </span>
            </div>

            <div v-if="includedTokens.length || excludedTokens.length" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] leading-relaxed">
                <span v-if="includedTokens.length" class="flex flex-wrap items-center gap-1">
                    <span class="tracking-wide text-base-content/40">{{ $t("db-transcendence.gear.included") }}</span>
                    <span
                        v-for="item in includedTokens"
                        :key="`in-${item.token}`"
                        class="border border-primary/30 bg-primary/5 px-1 py-px text-primary/80"
                    >
                        {{ item.label }}
                    </span>
                </span>
                <span v-if="excludedTokens.length" class="flex flex-wrap items-center gap-1">
                    <span class="tracking-wide text-base-content/40">{{ $t("db-transcendence.gear.excluded") }}</span>
                    <span v-for="item in excludedTokens" :key="`ex-${item.token}`" class="border border-base-content/20 px-1 py-px text-base-content/55">
                        {{ item.label }}
                    </span>
                </span>
            </div>
        </template>

        <p v-else-if="!capabilities.known" class="text-[10px] leading-relaxed text-base-content/40">
            {{ $t("transcend-build.gear_readonly") }}
        </p>

        <!-- 本地建模说明：只读，不参与计算 -->
        <p
            v-if="noteText"
            class="border border-base-content/20 bg-base-content/3 px-1.5 py-1 text-[10px] leading-relaxed text-base-content/55"
            data-affix-note
        >
            <span class="text-base-content/40">{{ $t("db-transcendence.gear.notes") }}：</span>{{ noteText }}
        </p>
    </div>
</template>
