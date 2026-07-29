<script lang="ts" setup>
import { t } from "i18next"
import { computed } from "vue"
import type { Monster } from "@/data/d/monster.data"
import { Faction } from "@/data/game-const"
import { LeveledMonster } from "@/data/leveled/LeveledMonster"
import { formatBigNumber } from "@/util"
import { getMonsterType } from "@/utils/monster-utils"

const props = withDefaults(
    defineProps<{
        monster: Monster
        level?: number
    }>(),
    {
        level: 80,
    }
)

/**
 * 获取用于展示的怪物等级化对象。
 * @returns 带等级属性的怪物对象
 */
const displayMonster = computed(() => {
    return new LeveledMonster(props.monster, props.level)
})

/**
 * 获取怪物头像地址。
 * @returns 怪物图标路径
 */
const monsterIcon = computed(() => {
    return displayMonster.value.url
})

/**
 * 获取怪物详情链接。
 * @returns 怪物详情页地址
 */
const monsterLink = computed(() => {
    return `/db/monster/${displayMonster.value.id}`
})

/**
 * 根据阵营ID获取阵营名称。
 * @param faction 阵营ID
 * @returns 阵营名称
 */
function getFactionName(faction: number | undefined): string {
    if (faction === undefined) {
        return t("other")
    }

    return Faction[faction] || t("monster.faction", { faction })
}

/**
 * 计算当前卡片展示的等级减伤乘区。
 * 怪物等级大于等于 200 时生效。
 */
const levelReduceRate = computed(() => {
    const level = props.level || 1

    if (level < 200) {
        return 1
    }

    return 1 / (1 + (level - 190) * 0.05)
})

/**
 * 计算有效生命。
 */
const effectiveHealth = computed(() => {
    const monster = displayMonster.value
    const defenseMultiplier = Math.max(1 - monster.def / (300 + monster.def), 0.000001)
    return (monster.hp / defenseMultiplier + (monster.es || 0)) / Math.max(levelReduceRate.value, 0.000001)
})
</script>

<template>
    <div
        class="group rounded-lg border border-base-300 bg-base-200/70 p-2.5 transition-all duration-200 hover:border-primary/40 hover:bg-base-200"
    >
        <div class="flex items-center gap-2.5">
            <img :src="monsterIcon" :alt="displayMonster.n" class="size-11 shrink-0 rounded-lg object-cover ring-1 ring-base-300" />

            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 min-w-0">
                    <SRouterLink
                        :to="monsterLink"
                        class="min-w-0 truncate text-sm font-semibold text-base-content hover:text-primary"
                        :title="`${displayMonster.n} ${displayMonster.id}`"
                    >
                        {{ $t(displayMonster.n) }}
                    </SRouterLink>
                    <CopyID :id="displayMonster.id" compact class="ml-auto shrink-0" />
                </div>

                <div class="mt-1 flex flex-wrap items-center gap-1">
                    <span class="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" :class="getMonsterType(displayMonster.t).color">
                        {{ getMonsterType(displayMonster.t).label }}
                    </span>
                    <span class="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">Lv.{{ level }}</span>
                    <span class="rounded bg-base-300 px-1.5 py-0.5 text-[10px] text-base-content/70">{{
                        $t(getFactionName(displayMonster.f))
                    }}</span>
                </div>
            </div>
        </div>

        <div class="mt-2 grid grid-cols-3 gap-1.5 text-[11px] sm:grid-cols-6">
            <div class="rounded bg-base-300/80 px-1.5 py-1" :title="$t('攻击')">
                <div class="text-[10px] text-base-content/60">{{ $t("攻击") }}</div>
                <div class="font-semibold text-warning">{{ formatBigNumber(displayMonster.atk) }}</div>
            </div>
            <div class="rounded bg-base-300/80 px-1.5 py-1" :title="$t('生命')">
                <div class="text-[10px] text-base-content/60">{{ $t("生命") }}</div>
                <div class="font-semibold text-error">{{ formatBigNumber(displayMonster.hp) }}</div>
            </div>
            <div class="rounded bg-base-300/80 px-1.5 py-1" :title="$t('护盾')">
                <div class="text-[10px] text-base-content/60">{{ $t("护盾") }}</div>
                <div class="font-semibold text-info">{{ formatBigNumber(displayMonster.es || 0) }}</div>
            </div>
            <div class="rounded bg-base-300/80 px-1.5 py-1" :title="$t('防御')">
                <div class="text-[10px] text-base-content/60">{{ $t("防御") }}</div>
                <div class="font-semibold text-success">{{ formatBigNumber(displayMonster.def) }}</div>
            </div>
            <div class="rounded bg-base-300/80 px-1.5 py-1" :title="$t('战姿')">
                <div class="text-[10px] text-base-content/60">{{ $t("战姿") }}</div>
                <div class="font-semibold text-secondary">{{ formatBigNumber(displayMonster.tn || 0) }}</div>
            </div>
            <div class="rounded bg-base-300/80 px-1.5 py-1" :title="$t('有效生命')">
                <div class="text-[10px] text-base-content/60">{{ $t("有效生命") }}</div>
                <div class="font-semibold text-accent">{{ formatBigNumber(effectiveHealth) }}</div>
            </div>
        </div>
    </div>
</template>
