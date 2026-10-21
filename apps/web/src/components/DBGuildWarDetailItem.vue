<script lang="ts" setup>
import { t } from "i18next"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import { useGameText } from "@/composables/useGameText"
import { LeveledMonsterHelper } from "@/data"
import { dungeonMap, guildWarBossMap, monsterMap } from "@/data/d"
import type { GuildWarBoss, GuildWarTest } from "@/data/d/guildwar.data"
import { guildWarBuffs, guildWarPointRewards, guildWarTests, guildWarWeekRewards } from "@/data/d/guildwar.data"
import { Faction } from "@/data/game-const"
import { type LeveledMonster } from "@/data/leveled/LeveledMonster"
import { formatBigNumber } from "@/util"
import {
    GUILD_CONSTRUCTION_POINT_RESOURCE_ID,
    type GuildWarSlotState,
    getGuildWarBossState,
    getGuildWarCurrentPeriod,
    getGuildWarCycleWeekIndex,
    getGuildWarCycleWeeks,
    getGuildWarSlotState,
} from "@/utils/guildwar"
import { getMonsterType } from "@/utils/monster-utils"
import { getRewardDetails } from "@/utils/reward-utils"

const props = defineProps<{
    boss: GuildWarBoss
}>()

const { gt } = useGameText()

const fallbackTimestamp = Math.floor(Date.now() / 1000)

/** 当前查看的时间点：默认当前时刻，可用日期时间选择器查看任意时间 */
const viewTimestamp = ref(fallbackTimestamp)

/**
 * 应用日期时间选择器的取值；清空时回退到当前时刻。
 * @param value 秒级时间戳
 */
function handleTimeSelect(value: number | undefined) {
    viewTimestamp.value = value ?? Math.floor(Date.now() / 1000)
}

/** 已点按展开的试炼（触屏无 hover，点按切换；对齐 SkillFields 的触摸展开） */
const expandedTestIds = ref<Set<number>>(new Set())
let touchMediaQuery: MediaQueryList | null = null
const touchExpand = ref(false)

function syncTouchExpandMode() {
    if (typeof window === "undefined") {
        return
    }
    touchExpand.value = Boolean(touchMediaQuery?.matches || navigator.maxTouchPoints > 0)
}

/**
 * 触摸切换试炼附加行展开；有 hover 能力的终端走 CSS group-hover，不拦截。
 * @param id 试炼 ID
 */
function toggleTestExpand(id: number) {
    if (!touchExpand.value) {
        return
    }
    const next = new Set(expandedTestIds.value)
    if (next.has(id)) {
        next.delete(id)
    } else {
        next.add(id)
    }
    expandedTestIds.value = next
}

onMounted(() => {
    if (typeof window === "undefined") {
        return
    }
    touchMediaQuery = window.matchMedia("(hover: none), (pointer: coarse)")
    syncTouchExpandMode()
    touchMediaQuery.addEventListener("change", syncTouchExpandMode)
})

onBeforeUnmount(() => {
    touchMediaQuery?.removeEventListener("change", syncTouchExpandMode)
})

const SLOT_STATE_KEYS: Record<GuildWarSlotState, string> = {
    Active: "db-guildwar-detail.state_active",
    NotStarted: "db-guildwar-detail.state_not_started",
    Ended: "db-guildwar-detail.state_ended",
    Unopened: "db-guildwar-detail.state_unopened",
}

const SLOT_STATE_CLASSES: Record<GuildWarSlotState, string> = {
    Active: "text-success",
    NotStarted: "text-warning",
    Ended: "text-base-content/45",
    Unopened: "text-base-content/45",
}

const bossState = computed<GuildWarSlotState>(() => getGuildWarBossState(props.boss.id, viewTimestamp.value))
const currentPeriod = computed(() => getGuildWarCurrentPeriod(viewTimestamp.value))

const currentWeekIndex = computed(() => getGuildWarCycleWeekIndex(viewTimestamp.value))

const cycleWeeks = computed(() => getGuildWarCycleWeeks())

const showWeekProgress = computed(() => currentWeekIndex.value >= 1 && currentWeekIndex.value <= cycleWeeks.value)

const rotationSlots = computed(() => {
    const period = currentPeriod.value
    if (!period) {
        return []
    }
    return period.bossIds.map((bossId, index) => ({
        bossId,
        name: guildWarBossMap.get(bossId)?.name ?? String(bossId),
        state: getGuildWarSlotState(period, index + 1, viewTimestamp.value),
    }))
})

const buffs = computed(() => {
    const ids = new Set(props.boss.buffs)
    return guildWarBuffs.filter(buff => ids.has(buff.id))
})

/** 副本及其怪物等级（2900x 副本自带 m 与 lv） */
const guildWarDungeon = computed(() => dungeonMap.get(props.boss.dungeonId))

/** 防御增益勾选（默认开启，与实战一致） */
const defBuffEnabled = ref(true)

/** 防御增益档：Boss 自带增益 1，按其描述里的数值解析加成 */
const defBuffBonus = computed(() => {
    const buff = props.boss.buffs.includes(1) ? guildWarBuffs.find(item => item.id === 1) : undefined
    const amount = Number(buff?.desc.match(/(\d+)/)?.[1] ?? Number.NaN)
    return buff && Number.isFinite(amount) ? { buff, amount } : undefined
})

interface GuildWarMonsterRow {
    leveled: LeveledMonster
    level: number
    def: number
    effectiveHealth: number
}

/** 副本怪物行：防御按增益勾选实时加成，有效生命随之重算 */
const guildWarMonsters = computed<GuildWarMonsterRow[]>(() => {
    const dungeon = guildWarDungeon.value
    const level = dungeon?.lv ?? 100
    const ids = dungeon?.m?.length ? dungeon.m : [props.boss.id]
    const bonus = defBuffEnabled.value ? (defBuffBonus.value?.amount ?? 0) : 0
    const rows: GuildWarMonsterRow[] = []
    for (const id of ids) {
        if (!monsterMap.get(id)) {
            continue
        }
        const leveled = LeveledMonsterHelper.fromId(id, level)
        const def = leveled.def + bonus
        const multiplier = Math.max(1 - def / (300 + def), 0.000001)
        rows.push({ leveled, level, def, effectiveHealth: leveled.hp / multiplier + (leveled.es || 0) })
    }
    return rows
})

/**
 * 阵营展示名（与 DBMonsterCompactCard 同口径）。
 * @param faction 阵营 ID
 */
function getFactionName(faction: number | undefined): string {
    if (faction === undefined) {
        return t("other", { keySeparator: false, nsSeparator: false })
    }
    return Faction[faction] || t("monster.faction", { faction })
}

const tests = computed(() => {
    const types = new Set(props.boss.testTypes)
    return guildWarTests.filter(test => types.has(test.type))
})

/** 当前选中的点数档位（6 档内容相同，用下拉切换 Lv，不展示 id） */
const selectedPointTierId = ref(guildWarPointRewards[0]?.id ?? 0)

const selectedPointTier = computed(
    () => guildWarPointRewards.find(tier => tier.id === selectedPointTierId.value) ?? guildWarPointRewards[0]
)

function getBuffIcon(icon: string): string {
    return icon ? `/imgs/webp/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 试炼规则门限（对齐 BuildGuildWarTestParameter 与 CalcTrialProgressPercent：Hit 计次与 Rate 伤害占比二选一）。
 * @param test 试炼数据
 * @returns 门限文本
 */
function testRuleText(test: GuildWarTest): string {
    const rule = test.rule ?? {}
    if (typeof rule.Rate === "number") {
        return `Rate ${Math.floor(rule.Rate * 100 + 0.5)}%`
    }
    if (typeof rule.Hit === "number") {
        return `Hit ${rule.Hit}`
    }
    return "—"
}

/**
 * 计分系数格式化（2000000 这类整万数缩写为 200w）。
 * @param rate 计分系数
 * @returns 缩写文本
 */
function formatScoreFactor(rate: number): string {
    return rate % 10000 === 0 ? `${rate / 10000}w` : String(rate)
}
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
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
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative min-w-0 flex-1">
                <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                    <span class="h-px w-6 bg-primary" aria-hidden="true" />
                    Guild War
                </p>
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <SRouterLink
                        :to="`/db/guildwar/${boss.id}`"
                        class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                    >
                        {{ gt(boss.name) }}
                    </SRouterLink>
                    <CopyID :id="boss.id" />
                </div>
                <p class="mt-2 text-sm leading-relaxed text-base-content/70">{{ gt(boss.desc) }}</p>
            </div>
        </header>

        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="INFO" :title="$t('db-guildwar-detail.info')" />
            <div class="mt-2 grid grid-cols-2 gap-1.5 text-sm md:grid-cols-3">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("db-guildwar-detail.time_limit") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ boss.timeLimit }}s</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("db-guildwar-detail.hp") }}</span>
                    <span class="shrink-0 text-xs text-base-content/85">
                        <span class="font-orbitron text-[13px] font-semibold text-primary">{{ Math.floor(boss.hp / 100000000) }}</span>
                        亿
                    </span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("db-guildwar-detail.base_rate") }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{ boss.baseRate }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">{{ $t("db-guildwar-detail.state") }}</span>
                    <span class="shrink-0 text-xs font-semibold" :class="SLOT_STATE_CLASSES[bossState]">
                        {{ $t(SLOT_STATE_KEYS[bossState]) }}
                    </span>
                </div>
            </div>
        </section>

        <section v-if="guildWarMonsters.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader
                no-animate
                compact
                kicker="MONSTERS"
                :title="$t('db-guildwar-detail.monsters')"
            >
                <template v-if="defBuffBonus" #trailing>
                    <label class="flex cursor-pointer items-center gap-1.5 text-xs text-base-content/60">
                        <input v-model="defBuffEnabled" type="checkbox" class="checkbox checkbox-xs checkbox-primary" />
                        {{ gt(defBuffBonus.buff.desc) }}
                    </label>
                </template>
            </SectionHeader>
            <div class="mt-2 grid gap-2">
                <div
                    v-for="row in guildWarMonsters"
                    :key="row.leveled.id"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex items-start gap-2.5">
                        <img
                            :src="row.leveled.url"
                            :alt="row.leveled.n"
                            class="size-11 shrink-0 rounded-xs object-cover"
                        />
                        <div class="min-w-0 flex-1">
                            <div class="flex min-w-0 items-center gap-1.5">
                                <SRouterLink
                                    :to="`/db/monster/${row.leveled.id}`"
                                    class="min-w-0 truncate text-sm font-semibold transition-colors duration-150 hover:text-primary"
                                >
                                    {{ $t(row.leveled.n) }}
                                </SRouterLink>
                                <CopyID :id="row.leveled.id" compact />
                            </div>
                            <div class="mt-1 flex flex-wrap items-center gap-1">
                                <span
                                    v-if="row.leveled.t"
                                    class="rounded-xs px-1.5 py-0.5 text-[10px] font-medium text-primary-content"
                                    :class="getMonsterType(row.leveled.t).color"
                                >
                                    {{ gt(getMonsterType(row.leveled.t).label) }}
                                </span>
                                <span class="rounded-xs border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                    Lv.{{ row.level }}
                                </span>
                                <span class="rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[10px] text-base-content/60">{{
                                    $t(getFactionName(row.leveled.f))
                                }}</span>
                            </div>
                        </div>
                    </div>
                    <div class="mt-2 grid grid-cols-2 gap-1.5">
                        <div
                            class="flex min-w-0 flex-col justify-between gap-0.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5"
                            :title="`${gt('生命')}: ${formatBigNumber(row.leveled.hp, 0)}`"
                        >
                            <div class="text-[10px] text-base-content/55">{{ gt("生命") }}</div>
                            <div class="truncate font-orbitron text-[13px] font-semibold text-error">
                                {{ formatBigNumber(row.leveled.hp, 0) }}
                            </div>
                        </div>
                        <div
                            class="flex min-w-0 flex-col justify-between gap-0.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5"
                            :title="`${gt('护盾')}: ${formatBigNumber(row.leveled.es || 0, 0)}`"
                        >
                            <div class="text-[10px] text-base-content/55">{{ gt("护盾") }}</div>
                            <div class="truncate font-orbitron text-[13px] font-semibold text-info">
                                {{ formatBigNumber(row.leveled.es || 0, 0) }}
                            </div>
                        </div>
                        <div
                            class="flex min-w-0 flex-col justify-between gap-0.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5"
                            :title="`${gt('防御')}: ${formatBigNumber(row.def)}`"
                        >
                            <div class="text-[10px] text-base-content/55">{{ gt("防御") }}</div>
                            <div class="truncate font-orbitron text-[13px] font-semibold text-success">
                                {{ formatBigNumber(row.def) }}
                            </div>
                        </div>
                        <div
                            class="flex min-w-0 flex-col justify-between gap-0.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5"
                            :title="`${gt('有效生命')}: ${formatBigNumber(row.effectiveHealth, 0)}`"
                        >
                            <div class="text-[10px] text-base-content/55">{{ gt("有效生命") }}</div>
                            <div class="truncate font-orbitron text-[13px] font-semibold text-accent">
                                {{ formatBigNumber(row.effectiveHealth, 0) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section
            v-if="currentPeriod"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader
                no-animate
                compact
                kicker="ROTATION"
                :title="$t('db-guildwar-detail.current_rotation')"
            >
                <template #trailing>
                    <DateTimePicker :model-value="viewTimestamp" @update:model-value="handleTimeSelect" />
                </template>
            </SectionHeader>
            <p v-if="showWeekProgress" class="mt-2 text-[11px] tracking-wide text-base-content/50">
                {{ $t("db-guildwar-detail.week_progress", { current: currentWeekIndex, total: cycleWeeks }) }}
            </p>
            <div class="mt-2 grid gap-1.5">
                <div
                    v-for="slot in rotationSlots"
                    :key="slot.bossId"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <SRouterLink
                        :to="`/db/guildwar/${slot.bossId}`"
                        class="min-w-0 truncate text-sm transition-colors duration-150 hover:text-primary"
                        :class="slot.bossId === boss.id ? 'font-semibold text-primary' : ''"
                    >
                        {{ gt(slot.name) }}
                    </SRouterLink>
                    <span class="shrink-0 text-[11px] font-semibold" :class="SLOT_STATE_CLASSES[slot.state]">
                        {{ $t(SLOT_STATE_KEYS[slot.state]) }}
                    </span>
                </div>
            </div>
            <p class="mt-2 text-[11px] leading-relaxed text-base-content/50">{{ $t("db-guildwar-detail.per_boss_note") }}</p>
        </section>

        <section v-if="buffs.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BUFFS" :title="$t('db-guildwar-detail.buffs')" />            <div class="mt-2 space-y-2">
                <div
                    v-for="buff in buffs"
                    :key="buff.id"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40 hover:bg-base-content/5"
                >
                    <div class="flex items-start gap-2.5">
                        <img :src="getBuffIcon(buff.icon)" class="h-10 shrink-0 rounded-xs" alt="" />
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1 text-sm font-medium">
                                <CopyID :id="buff.id" />
                            </div>
                            <div class="mt-1 text-xs leading-relaxed text-base-content/70">
                                {{ gt(buff.desc) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section v-if="tests.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="TESTS" :title="$t('db-guildwar-detail.tests')" :count="tests.length" />
            <div class="mt-2 space-y-2">
                <div
                    v-for="test in tests"
                    :key="test.id"
                    class="group rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40 hover:bg-base-content/5"
                    @touchstart="toggleTestExpand(test.id)"
                >
                    <div class="flex items-center gap-1 text-sm font-medium">
                        {{ gt(test.keyword) }}
                        <CopyID :id="test.id" />
                    </div>
                    <div class="mt-1 text-xs leading-relaxed text-base-content/70">
                        {{ gt(test.desc) }}
                    </div>
                    <div
                        class="overflow-hidden text-[11px] text-base-content/45 transition-all duration-300"
                        :class="
                            expandedTestIds.has(test.id)
                                ? 'opacity-80 max-h-32'
                                : 'opacity-0 max-h-0 group-hover:opacity-80 group-hover:max-h-32'
                        "
                    >
                        <div class="space-y-0.5 pt-1">
                            <p>
                                {{ $t("db-guildwar-detail.rule_threshold") }}
                                <span class="font-mono">{{ testRuleText(test) }}</span>
                            </p>
                            <p>
                                {{ $t("db-guildwar-detail.score_factor") }}
                                <span class="font-mono">×{{ test.rate }}</span>
                                <span>({{ $t("db-guildwar-detail.score_capped", { score: `+${formatScoreFactor(test.rate)}` }) }})</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section
            v-if="guildWarPointRewards.length"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader
                no-animate
                compact
                kicker="POINT REWARDS"
                :title="$t('db-guildwar-detail.point_rewards')"
                :count="guildWarPointRewards.length"
            >
                <template #trailing>
                    <Select
                        v-model.number="selectedPointTierId"
                        class="w-24 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                    >
                        <SelectItem v-for="tier in guildWarPointRewards" :key="tier.id" :value="tier.id">
                            Lv.{{ tier.lv }}
                        </SelectItem>
                    </Select>
                </template>
            </SectionHeader>
            <p class="mt-2 text-[11px] leading-relaxed text-base-content/50">{{ $t("db-guildwar-detail.weekly_points_note") }}</p>
            <div v-if="selectedPointTier" class="mt-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <div class="mb-2 text-[11px] text-base-content/50">
                    <span class="font-orbitron text-[13px] font-semibold text-primary">{{ selectedPointTier.eachPoints }}</span>
                    {{ $t("db-guildwar-detail.points_unit") }}
                </div>
                <div class="space-y-2">
                    <div v-for="rewardId in selectedPointTier.rewards" :key="rewardId">
                        <div v-for="reward in [getRewardDetails(rewardId)].filter(v => !!v)" :key="reward.id">
                            <RewardItem :reward="reward" header />
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <section
            v-if="guildWarWeekRewards.length"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader
                no-animate
                compact
                kicker="WEEK REWARDS"
                :title="$t('db-guildwar-detail.week_rewards')"
                :count="guildWarWeekRewards.length"
            />
            <div class="mt-2 space-y-3">
                <div
                    v-for="stage in guildWarWeekRewards"
                    :key="stage.stage"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                >
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-xs text-base-content/60">{{ $t("db-guildwar-detail.stage") }}</span>
                        <span class="text-sm text-base-content/85">{{ stage.stage }}%</span>
                        <ResourceCostItem
                            inline
                            :name="''"
                            :value="[stage.constructionPoint, GUILD_CONSTRUCTION_POINT_RESOURCE_ID, 'Resource']"
                            class="ml-auto"
                        />
                        <CopyID :id="stage.reward" />
                    </div>
                    <div v-for="reward in [getRewardDetails(stage.reward)].filter(v => !!v)" :key="reward.id" class="mt-2">
                        <RewardItem :reward="reward" header />
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>
