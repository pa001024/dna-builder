<script lang="ts" setup>
import { computed, ref } from "vue"
import type { MonsterTag } from "@/data/d/monstertag.data"
import { getMonsterTagGroupByTagId, getRelatedMonstersByMonsterTagId } from "@/utils/monster-tag-utils"

const props = defineProps<{
    monsterTag: MonsterTag
}>()

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
            return `${formatDecimalNumber(value / 10)}米`
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
    <div class="p-3 space-y-3">
        <div class="flex items-center gap-3">
            <SRouterLink :to="`/db/monstertag/${monsterTag.id}`" class="text-lg font-bold link link-primary">
                {{ monsterTag.name }}
            </SRouterLink>
            <span class="text-sm text-base-content/70">ID: {{ monsterTag.id }}</span>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-1">描述</div>
            <div class="text-sm whitespace-pre-line">
                {{ monsterTag.desc }}
            </div>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">参数</div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 text-sm">
                <div v-for="[key, value] in baseVars" :key="key" class="p-2 rounded bg-base-100">
                    <div class="text-xs text-base-content/70 mb-1">{{ key }}</div>
                    <div class="font-medium break-all">{{ formatVarValue(key, value) }}</div>
                </div>
            </div>

            <div v-if="bonusVars.length > 0" class="mt-3">
                <div class="text-xs text-base-content/70 mb-2">加成</div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 text-sm">
                    <div v-for="[name, value] in bonusVars" :key="name" class="p-2 rounded bg-base-100">
                        <div class="text-xs text-base-content/70 mb-1">{{ name }}</div>
                        <div class="font-medium text-success">{{ formatBonusValue(value) }}</div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="currentTags.length > 1" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">同类词条</div>
            <div class="flex flex-wrap gap-2">
                <SRouterLink
                    v-for="tag in currentTags"
                    :key="tag.id"
                    :to="`/db/monstertag/${tag.id}`"
                    class="text-xs px-2 py-1 rounded bg-base-300 hover:bg-base-100 transition-colors"
                    :class="{ 'bg-primary text-primary-content hover:bg-primary': tag.id === monsterTag.id }"
                >
                    {{ tag.id }}
                </SRouterLink>
            </div>
        </div>

        <div v-if="relatedMonsters.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">关联怪物</div>
            <div class="mb-3 flex items-center gap-4">
                <span class="text-sm min-w-12">Lv. {{ relatedMonsterLevel }}</span>
                <input
                    v-model.number="relatedMonsterLevel"
                    type="range"
                    class="range range-primary range-xs grow"
                    min="1"
                    max="180"
                    step="1"
                />
            </div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <DBMonsterCompactCard v-for="monster in relatedMonsters" :key="monster.id" :monster="monster" :level="relatedMonsterLevel" />
            </div>
        </div>
    </div>
</template>
