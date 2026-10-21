<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { dungeonMap } from "@/data"
import type { EventItem } from "@/data/d/event.data"

const props = defineProps<{
    event: EventItem
}>()

/** 关联的异步战斗副本 id 列表 */
const asyncCombatDungeonIds = computed(() => props.event.asyncCombat?.dungeons ?? [])

/** id 转副本（过滤不存在的 id，避免坏数据炸版） */
const asyncCombatDungeons = computed(() =>
    asyncCombatDungeonIds.value
        .map(id => dungeonMap.get(id))
        .filter((dungeon): dungeon is NonNullable<typeof dungeon> => !!dungeon)
)

/** 当前选中的副本 id，默认首个；活动切换时重置 */
const activeDungeonId = ref<number>(asyncCombatDungeons.value[0]?.id ?? 0)

watch(asyncCombatDungeons, dungeons => {
    if (!dungeons.some(dungeon => dungeon.id === activeDungeonId.value)) {
        activeDungeonId.value = dungeons[0]?.id ?? 0
    }
})

/** 当前选中的副本（id 对不上时回退首个） */
const activeDungeon = computed(() => asyncCombatDungeons.value.find(dungeon => dungeon.id === activeDungeonId.value) ?? asyncCombatDungeons.value[0])
</script>

<template>
    <section v-if="activeDungeon" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="ASYNC COMBAT" :title="$t('event.async_combat')" :count="`${asyncCombatDungeons.length}`" />

        <!-- 副本切换：按 dungeons 数组顺序 -->
        <div v-if="asyncCombatDungeons.length > 1" class="mt-3">
            <AniTabs
                v-model="activeDungeonId"
                :tabs="
                    asyncCombatDungeons.map(dungeon => ({
                        label: `${$t(dungeon.n)} Lv.${dungeon.lv}`,
                        value: dungeon.id,
                    }))
                "
            />
        </div>

        <!-- 当前副本头：完整名 + 等级 + 跳转 -->
        <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <SRouterLink :to="`/db/dungeon/${activeDungeon.id}`" class="link link-primary text-sm font-semibold">
                {{ $t(activeDungeon.n) }}
            </SRouterLink>
            <span class="rounded-xs bg-primary/10 px-1.5 py-0.5 font-orbitron text-xs font-semibold tabular-nums text-primary">
                Lv.{{ activeDungeon.lv }}
            </span>
            <CopyID :id="activeDungeon.id" />
        </div>

        <!-- 复用副本详情（含异步战斗奖励计算器、怪物与波次） -->
        <DBDungeonDetailItem :key="activeDungeon.id" :dungeon="activeDungeon" />
    </section>
</template>
