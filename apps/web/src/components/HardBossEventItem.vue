<script lang="ts" setup>
import { computed, ref } from "vue"
import { useGameText } from "@/composables/useGameText"
import { dungeonMap, monsterMap } from "@/data/d"
import type { EventHardBossEntry, EventHardBossMode, EventItem } from "@/data/d/event.data"
import { RaidBuff } from "@/data/d/raid.data"
import { getRewardDetails } from "@/utils/reward-utils"

const props = defineProps<{
    event: EventItem
}>()

const { gt } = useGameText()

/** 内联配置；仅活动 103036 存在 */
const hardBoss = computed(() => props.event.hardBossEvent)

/** 当前选中的 Boss（按 bosses 数组顺序，默认首项） */
const activeBossId = ref<number>(props.event.hardBossEvent?.bosses[0]?.id ?? 0)

/** 每个 Boss 的模式 Tab（以 mode 字段为 key，不按下标猜） */
const activeModes = ref<Record<number, string>>({})

/**
 * 当前选中的 Boss 项。
 * @returns Boss 项；id 对不上时回退首项
 */
const activeBoss = computed<EventHardBossEntry | undefined>(() => {
    const bosses = hardBoss.value?.bosses ?? []
    return bosses.find(boss => boss.id === activeBossId.value) ?? bosses[0]
})

/**
 * 当前 Boss 当前 Tab 的模式。
 * @returns 模式；缺失时回退 modes 首项
 */
const activeMode = computed<EventHardBossMode | undefined>(() => {
    const boss = activeBoss.value
    if (!boss) {
        return undefined
    }
    const key = activeModes.value[boss.id] ?? boss.modes[0]?.mode
    return boss.modes.find(item => item.mode === key) ?? boss.modes[0]
})

/**
 * 副本完整名取 Dungeon.json 的 n，不用 Boss 短名。
 * @param dungeonId 副本数字 id
 * @returns 完整副本名
 */
function getDungeonName(dungeonId: number): string {
    return dungeonMap.get(dungeonId)?.n ?? String(dungeonId)
}

/**
 * Boss 贴图地址（贴图短名）。
 * @param boss Boss 项
 * @returns 贴图路径
 */
function getBossIcon(boss: EventHardBossEntry): string {
    return boss.icon ? `/imgs/webp/${boss.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 选中 Boss 时同步默认 Tab。
 * @param boss Boss 项
 */
function selectBoss(boss: EventHardBossEntry): void {
    activeBossId.value = boss.id
    if (!activeModes.value[boss.id]) {
        activeModes.value[boss.id] = boss.modes[0]?.mode ?? "eternal"
    }
}
</script>

<template>
    <section
        v-if="hardBoss && activeBoss && activeMode"
        class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
    >
        <SectionHeader no-animate compact kicker="HARD BOSS" :title="$t('event.hard_boss')" :count="`${hardBoss.bosses.length}`" />

        <!-- Boss 列表：按 bosses 数组顺序 -->
        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <button
                v-for="boss in hardBoss.bosses"
                :key="boss.id"
                type="button"
                class="flex items-center gap-2 rounded-xs border p-2 text-left transition-all duration-200 active:scale-[0.98]"
                :class="
                    boss.id === activeBoss.id
                        ? 'border-primary bg-primary/10'
                        : 'border-base-content/15 bg-base-content/3 hover:border-primary/50'
                "
                @click="selectBoss(boss)"
            >
                <div class="size-11 shrink-0 overflow-hidden rounded-xs border border-base-content/10">
                    <img :src="getBossIcon(boss)" :alt="boss.name" class="h-full w-full object-cover" loading="lazy" />
                </div>
                <span class="min-w-0 truncate text-[13px] font-semibold text-base-content/85">{{ $t(boss.name) }}</span>
            </button>
        </div>

        <!-- 当前 Boss：短名 + desc + icon -->
        <div class="mt-3 flex items-start gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
            <div class="size-14 shrink-0 overflow-hidden rounded-xs border border-base-content/10">
                <img :src="getBossIcon(activeBoss)" :alt="activeBoss.name" class="h-full w-full object-cover" />
            </div>
            <div class="min-w-0 flex-1">
                <div class="text-sm font-semibold text-base-content">{{ $t(activeBoss.name) }}</div>
                <p class="mt-0.5 text-[13px] leading-relaxed whitespace-pre-wrap break-all text-base-content/70">
                    {{ gt(activeBoss.desc) }}
                </p>
            </div>
        </div>

        <!-- 双模式 Tab：以 mode 字段区分 -->
        <div class="mt-3">
            <AniTabs
                v-model="activeModes[activeBoss.id]"
                :tabs="
                    activeBoss.modes.map(item => ({
                        label:
                            item.mode === 'eternal'
                                ? `${$t('event.hard_boss_eternal')} Lv.${item.lv}`
                                : `${$t('event.hard_boss_challenge')} Lv.${item.lv}`,
                        value: item.mode,
                    }))
                "
            />
        </div>

        <!-- 副本头：完整名取 Dungeon.json 的 n -->
        <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <SRouterLink :to="`/db/dungeon/${activeMode.dungeonId}`" class="link link-primary text-sm font-semibold">
                {{ $t(getDungeonName(activeMode.dungeonId)) }}
            </SRouterLink>
            <span class="rounded-xs bg-primary/10 px-1.5 py-0.5 font-orbitron text-xs font-semibold tabular-nums text-primary">
                Lv.{{ activeMode.lv }}
            </span>
            <CopyID :id="activeMode.dungeonId" />
        </div>

        <!-- 解锁条件：有 unlock 即需先通关所列副本，无即直接可打 -->
        <p v-if="activeMode.unlock?.length" class="mt-1 text-xs leading-relaxed text-warning">
            {{
                $t("event.hard_boss_unlock", {
                    names: (activeMode.unlock ?? []).map(id => $t(getDungeonName(id))).join("、"),
                })
            }}
        </p>

        <!-- 周次数：只在永恒 Tab 显示 -->
        <p v-if="activeMode.mode === 'eternal'" class="mt-2 text-[13px] leading-relaxed text-base-content/75">
            <span class="font-semibold text-base-content/85">{{ $t("event.hard_boss_weekly", { total: hardBoss.weeklyRewards }) }}</span>
            <span class="text-base-content/50">（{{ $t("event.hard_boss_weekly_note") }}）</span>
        </p>

        <!-- 报酬区：firstReward（角标"首次"）+ reward（固定掉落） -->
        <div class="mt-2 space-y-2">
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <div class="mb-1.5 flex items-center gap-2">
                    <span class="rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {{ $t("event.hard_boss_first") }}
                    </span>
                </div>
                <RewardItem :reward="getRewardDetails(activeMode.firstReward)" header />
            </div>
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <div class="mb-1.5 flex flex-wrap items-center gap-2">
                    <span class="rounded-xs bg-base-content/10 px-1.5 py-0.5 text-[10px] font-semibold text-base-content/70">
                        {{ $t("event.hard_boss_fixed") }}
                    </span>
                </div>
                <RewardItem :reward="getRewardDetails(activeMode.reward)" header />
            </div>
        </div>

        <!-- 强力增益：直接展示 RaidBuffDes 全文 -->
        <div class="mt-2 rounded-xs border border-primary/25 bg-primary/5 p-2.5">
            <div class="mb-1 text-[11px] font-semibold tracking-wide text-primary">{{ $t("event.hard_boss_buff") }}</div>
            <p class="text-[13px] leading-relaxed whitespace-pre-wrap break-all text-base-content/85">
                {{ $t(RaidBuff[activeMode.buff]?.RaidBuffDes ?? "") }}
            </p>
        </div>

        <!-- 敌人区：monster[] 转 Monster.json 展示 -->
        <div class="mt-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
            <div class="mb-2 text-[11px] tracking-wide text-base-content/55">{{ $t("event.hard_boss_enemies") }}</div>
            <div class="grid gap-2">
                <template v-for="monsterId in activeBoss.monster" :key="monsterId">
                    <MonsterItem v-if="monsterMap.get(monsterId)" :monster="monsterMap.get(monsterId)!" :level="activeMode.lv" />
                </template>
            </div>
        </div>
    </section>
</template>
