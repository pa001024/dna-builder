<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref } from "vue"
import type { MonsterTag } from "@/data/d/monstertag.data"
import { getMonsterTagGroupByTagId, getRelatedMonstersByMonsterTagId } from "@/utils/monster-tag-utils"

const props = defineProps<{
    monsterTag: MonsterTag
}>()
const { t } = useTranslation()

/**
 * 当前号令者所在的分组信息。
 */
const currentGroup = computed(() => getMonsterTagGroupByTagId(props.monsterTag.id))

/**
 * 当前号令者分组下的全部词条。
 */
const currentTags = computed(() => currentGroup.value?.tags || [props.monsterTag])

/**
 * 当前号令者关联的怪物列表。
 */
const relatedMonsters = computed(() => getRelatedMonstersByMonsterTagId(props.monsterTag.id))

/**
 * 关联怪物属性展示等级。
 */
const relatedMonsterLevel = ref(180)

/**
 * 号令者基础参数（排除“加成”字段，避免与专用展示重复）。
 */
const baseVars = computed(() => Object.entries(props.monsterTag.vars).filter(([key]) => key !== "加成"))

/**
 * 号令者“加成”参数条目。
 */
const bonusVars = computed(() => {
    const bonus = props.monsterTag.vars.加成
    if (!bonus || typeof bonus !== "object") {
        return [] as Array<[string, number]>
    }

    return Object.entries(bonus).filter((entry): entry is [string, number] => typeof entry[1] === "number")
})

/**
 * 将词条值格式化为可读文本。
 * @param key 字段名
 * @param value 原始值
 * @returns 格式化后的文本
 */
function formatVarValue(key: string, value: unknown): string {
    if (typeof value === "number") {
        if (shouldFormatAsPercent(key)) {
            return formatPercentValue(value)
        }

        if (shouldFormatAsMeter(key)) {
            return `${formatDecimalNumber(value / 10)}${t("monster-tag-detail.meterSuffix")}`
        }

        return formatDecimalNumber(value)
    }

    if (typeof value === "string") {
        return value
    }

    if (Array.isArray(value)) {
        return value.map(item => formatVarValue(key, item)).join("、")
    }

    if (value && typeof value === "object") {
        return Object.entries(value)
            .map(([subKey, item]) => `${subKey}: ${formatVarValue(subKey, item)}`)
            .join("；")
    }

    return "-"
}

/**
 * 判断字段是否应按百分比格式化。
 * @param key 字段名
 * @returns 是否按百分比展示
 */
function shouldFormatAsPercent(key: string): boolean {
    return key === "DOT伤害" || key === "HOT回复" || key.includes("倍率") || key.includes("比例")
}

/**
 * 判断字段是否应按米单位格式化。
 * @param key 字段名
 * @returns 是否按米展示
 */
function shouldFormatAsMeter(key: string): boolean {
    return key.includes("半径") || key.includes("范围")
}

/**
 * 将小数格式化为精简数字字符串。
 * @param value 数值
 * @returns 格式化后的字符串
 */
function formatDecimalNumber(value: number): string {
    return Number.isInteger(value)
        ? `${value}`
        : value
              .toFixed(3)
              .replace(/\.0+$/, "")
              .replace(/(\.\d*[1-9])0+$/, "$1")
}

/**
 * 将倍率值格式化为百分比文本。
 * @param value 倍率值（如 0.65）
 * @returns 百分比文本（如 65%）
 */
function formatPercentValue(value: number): string {
    return `${formatDecimalNumber(value * 100)}%`
}

/**
 * 格式化“加成”数值展示。
 * @param value 加成值
 * @returns 格式化后的文本（百分比）
 */
function formatBonusValue(value: number): string {
    const percent = value * 100
    const formatted = Number.isInteger(percent)
        ? `${percent}`
        : percent
              .toFixed(2)
              .replace(/\.0+$/, "")
              .replace(/(\.\d*[1-9])0+$/, "$1")

    return `${value >= 0 ? "+" : ""}${formatted}%`
}
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 号令者档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative">
                <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                    <span class="h-px w-6 bg-primary" aria-hidden="true" />
                    Commander Tag
                </p>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <SRouterLink
                        :to="`/db/monstertag/${monsterTag.id}`"
                        class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                    >
                        {{ monsterTag.name }}
                    </SRouterLink>
                    <CopyID :id="monsterTag.id" />
                </div>
            </div>
        </header>

        <!-- 描述 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('monster-tag-detail.description')" />
            <div class="text-sm leading-relaxed whitespace-pre-line text-base-content/85">
                {{ monsterTag.desc }}
            </div>
        </section>

        <!-- 基础参数 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="PARAMS" :title="$t('monster-tag-detail.params')" />
            <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
                <div
                    v-for="[key, value] in baseVars"
                    :key="key"
                    class="flex items-start justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="shrink-0 pt-0.5 text-xs text-base-content/60">{{ $t(key) }}</span>
                    <span class="break-all text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatVarValue(key, value)
                    }}</span>
                </div>
            </div>

            <div v-if="bonusVars.length > 0" class="mt-3">
                <div class="mb-2 text-[10px] text-base-content/40">
                    {{ $t("monster-tag-detail.bonus") }}
                </div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1.5">
                    <div
                        v-for="[name, value] in bonusVars"
                        :key="name"
                        class="flex items-start justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="shrink-0 pt-0.5 text-xs text-base-content/60">{{ $t(name) }}</span>
                        <span class="break-all text-right font-orbitron text-[13px] font-semibold tabular-nums text-success">{{
                            formatBonusValue(value)
                        }}</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- 同组词条 -->
        <section v-if="currentTags.length > 1" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SIBLINGS" :title="$t('monster-tag-detail.sameTags')" />
            <div class="flex flex-wrap gap-1.5">
                <SRouterLink
                    v-for="tag in currentTags"
                    :key="tag.id"
                    :to="`/db/monstertag/${tag.id}`"
                    class="inline-flex cursor-pointer items-center whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        tag.id === monsterTag.id
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                >
                    {{ tag.id }}
                </SRouterLink>
            </div>
        </section>

        <!-- 关联怪物 -->
        <section v-if="relatedMonsters.length > 0" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="RELATED" :title="$t('monster-tag-detail.relatedMonsters')" />
            <div class="mb-3 flex items-center gap-4">
                <span class="w-12 shrink-0 font-mono text-[11px] tabular-nums text-base-content/60">Lv. {{ relatedMonsterLevel }}</span>
                <input
                    v-model.number="relatedMonsterLevel"
                    type="range"
                    class="range range-primary range-xs grow"
                    min="1"
                    max="240"
                    step="1"
                />
            </div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
                <DBMonsterCompactCard
                    v-for="monster in relatedMonsters"
                    :key="monster.id"
                    :monster="monster"
                    :level="relatedMonsterLevel"
                />
            </div>
        </section>
    </div>
</template>
