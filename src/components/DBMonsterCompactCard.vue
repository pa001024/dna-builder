<script lang="ts" setup>
import { computed } from "vue"
import { useRouter } from "vue-router"
import { Faction } from "@/data"
import type { Monster } from "@/data/d/monster.data"
import { LeveledMonster } from "@/data/leveled/LeveledMonster"
import { formatBigNumber } from "@/util"
import { getMonsterType } from "@/utils/monster-utils"

type MonsterCardSource = Monster | LeveledMonster

const props = withDefaults(
    defineProps<{
        monster: MonsterCardSource
        level?: number
        clickable?: boolean
    }>(),
    {
        level: undefined,
        clickable: true,
    }
)

const router = useRouter()

/**
 * 判断传入数据是否为已计算等级的怪物对象。
 * @param monster 怪物数据
 * @returns 是否为 LeveledMonster
 */
function isLeveledMonster(monster: MonsterCardSource): monster is LeveledMonster {
    return monster instanceof LeveledMonster
}

/**
 * 获取用于展示的怪物数据；若指定等级则按等级重新计算属性。
 */
const displayMonster = computed(() => {
    if (props.level === undefined) {
        return props.monster
    }

    if (isLeveledMonster(props.monster)) {
        if (props.monster.等级 === props.level) {
            return props.monster
        }

        return new LeveledMonster(props.monster.id, props.level, props.monster.isRouge)
    }

    return new LeveledMonster(props.monster, props.level)
})

/**
 * 获取怪物等级显示值。
 */
const monsterLevel = computed(() => {
    if (isLeveledMonster(displayMonster.value)) {
        return displayMonster.value.等级
    }

    return props.level
})

/**
 * 获取怪物头像地址。
 */
const monsterAvatarUrl = computed(() => {
    if (isLeveledMonster(displayMonster.value)) {
        return displayMonster.value.url
    }

    return LeveledMonster.url(displayMonster.value.icon)
})

/**
 * 根据阵营ID获取阵营名称。
 * @param faction 阵营ID
 * @returns 阵营名称
 */
function getFactionName(faction: number | undefined): string {
    if (faction === undefined) {
        return "其他"
    }

    return Faction[faction] || `阵营${faction}`
}

/**
 * 点击卡片跳转怪物详情。
 */
function handleClickMonsterCard(): void {
    if (!props.clickable) {
        return
    }

    router.push(`/db/monster/${displayMonster.value.id}`)
}
</script>

<template>
    <div
        class="group rounded-xl border border-base-300 bg-base-200/70 p-2.5 transition-all hover:border-primary/40 hover:bg-base-200"
        :class="{ 'cursor-pointer': clickable }"
        @click="handleClickMonsterCard"
    >
        <div class="flex items-start gap-2.5">
            <img :src="monsterAvatarUrl" :alt="displayMonster.n" class="size-12 rounded-lg object-cover ring-1 ring-base-300" />

            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                    <SRouterLink
                        :to="`/db/monster/${displayMonster.id}`"
                        class="truncate text-sm font-semibold text-base-content hover:text-primary"
                        @click.stop
                    >
                        {{ $t(displayMonster.n) }}
                    </SRouterLink>
                    <span class="shrink-0 rounded bg-base-300 px-1.5 py-0.5 text-[10px] text-base-content/75">#{{ displayMonster.id }}</span>
                </div>

                <div class="mt-1 flex flex-wrap items-center gap-1.5">
                    <span class="rounded bg-base-300 px-1.5 py-0.5 text-[10px] text-base-content/80">{{ $t(getFactionName(displayMonster.f)) }}</span>
                    <span class="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">Lv.{{ monsterLevel ?? "--" }}</span>
                    <span
                        v-if="displayMonster.t"
                        class="rounded px-1.5 py-0.5 text-[10px] text-white"
                        :class="getMonsterType(displayMonster.t).color"
                    >
                        {{ getMonsterType(displayMonster.t).label }}
                    </span>
                </div>
            </div>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
            <div class="rounded bg-base-300/90 px-1.5 py-1">
                <div class="text-[10px] text-base-content/65">攻击</div>
                <div class="font-semibold text-primary">{{ formatBigNumber(displayMonster.atk) }}</div>
            </div>
            <div class="rounded bg-base-300/90 px-1.5 py-1">
                <div class="text-[10px] text-base-content/65">防御</div>
                <div class="font-semibold text-success">{{ formatBigNumber(displayMonster.def) }}</div>
            </div>
            <div class="rounded bg-base-300/90 px-1.5 py-1">
                <div class="text-[10px] text-base-content/65">生命</div>
                <div class="font-semibold text-error">{{ formatBigNumber(displayMonster.hp) }}</div>
            </div>
            <div class="rounded bg-base-300/90 px-1.5 py-1">
                <div class="text-[10px] text-base-content/65">护盾</div>
                <div class="font-semibold text-info">{{ formatBigNumber(displayMonster.es || 0) }}</div>
            </div>
        </div>
    </div>
</template>
