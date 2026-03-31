<script lang="ts" setup>
import { computed } from "vue"
import type { Monster } from "@/data/d/monster.data"
import { LeveledMonster } from "@/data/leveled/LeveledMonster"
import { formatBigNumber } from "@/util"

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
 * 获取怪物等级显示文本。
 * @returns 等级文本
 */
const monsterLevelText = computed(() => {
    return `Lv.${props.level}`
})
</script>

<template>
    <div class="flex items-center gap-3 rounded-lg bg-base-200 p-2 transition-colors hover:bg-base-300">
        <div class="shrink-0 rounded-lg bg-linear-45 from-base-300 to-base-100 p-1.5">
            <img :src="monsterIcon" :alt="displayMonster.n" class="size-6 rounded-md object-cover" />
        </div>
        <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 min-w-0">
                <SRouterLink :to="monsterLink" class="min-w-0 truncate font-medium hover:underline">
                    {{ $t(displayMonster.n) }}
                </SRouterLink>
                <span class="shrink-0 rounded bg-base-300 px-1.5 py-0.5 text-[10px] text-base-content/70">{{ monsterLevelText }}</span>
                <span class="shrink-0 text-xs text-base-content/60">ID: {{ displayMonster.id }}</span>
            </div>
            <div class="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
                <span>攻击 {{ formatBigNumber(displayMonster.atk) }}</span>
                <span>防御 {{ formatBigNumber(displayMonster.def) }}</span>
                <span>生命 {{ formatBigNumber(displayMonster.hp) }}</span>
                <span>战姿 {{ formatBigNumber(displayMonster.tn || 0) }}</span>
            </div>
        </div>
    </div>
</template>
