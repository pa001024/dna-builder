<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import type { AbyssDungeon, Char } from "@/data"
import { AbyssMonsterLevelLimit, charMap, LeveledChar, LeveledMonsterHelper } from "@/data"
import { getAbyssCumulativeRewardItems, getAbyssStarCountByActCount, getImmortalMonsterLevelByActCount } from "@/utils/abyss-utils"
import { ABYSS_DUNGEON_ELEMENT_KEYS, formatAbyssDungeonMbValue, getAbyssDungeonGroup, getAbyssDungeonLevel } from "@/utils/dungeon-utils"
import { getDropModeText } from "@/utils/i18n-utils"
import { getRewardDetails, type RewardItem } from "@/utils/reward-utils"

const props = defineProps<{
    dungeon: AbyssDungeon
}>()

const currentMonsterLevel = ref(AbyssMonsterLevelLimit)
const currentActMode = ref<"12" | "36" | "50" | "custom">("12")
const currentActCount = ref(12)

const isImmortalPlay = computed(() => getAbyssDungeonGroup(props.dungeon) === "不朽剧目")
const currentStarCount = computed(() => getAbyssStarCountByActCount(currentActCount.value))

const monsterDisplayLevel = computed(() => {
    if (isImmortalPlay.value) {
        return getImmortalMonsterLevelByActCount(currentActCount.value, props.dungeon.sid)
    }

    return currentMonsterLevel.value
})

/**
 * 根据幕数值归一化 tab。
 * @param actCount 幕数
 * @returns 对应的 tab
 */
function getActModeByCount(actCount: number): "12" | "36" | "50" | "custom" {
    if (actCount === 12) {
        return "12"
    }
    if (actCount === 36) {
        return "36"
    }
    if (actCount === 50) {
        return "50"
    }

    return "custom"
}

/**
 * 切换累计奖励幕数预设。
 * @param mode 预设模式
 */
function setActMode(mode: "12" | "36" | "50" | "custom"): void {
    currentActMode.value = mode
    if (mode === "12") {
        currentActCount.value = 12
        return
    }
    if (mode === "36") {
        currentActCount.value = 36
        return
    }
    if (mode === "50") {
        currentActCount.value = 50
    }
}

watch(
    currentActCount,
    value => {
        if (!isImmortalPlay.value) {
            return
        }

        currentActMode.value = getActModeByCount(value)
    },
    { immediate: true }
)

/**
 * 计算当前幕数下的累计奖励叶子项。
 * @returns 累计奖励叶子项
 */
const cumulativeRewardItems = computed(() => {
    if (!isImmortalPlay.value) {
        return []
    }

    return getAbyssCumulativeRewardItems(props.dungeon, currentActCount.value)
})

watch(
    () => props.dungeon.id,
    () => {
        currentMonsterLevel.value = AbyssMonsterLevelLimit
        currentActMode.value = "12"
        currentActCount.value = 12
    },
    { immediate: true }
)

function getCharName(charId: number): string {
    const char = charMap.get(charId)
    return char?.名称 || `ID: ${charId}`
}

function getChar(charId: number): Char | undefined {
    return charMap.get(charId)
}

type ResourceCostValueType =
    | "Mod"
    | "Draft"
    | "Weapon"
    | "Char"
    | "CharAccessory"
    | "WeaponAccessory"
    | "Walnut"
    | "Resource"
    | "Skin"
    | "HeadSculpture"
    | "HeadFrame"
    | "Hair"
    | "WeaponSkin"

/**
 * 将累计奖励项转换为 ResourceCostItem 需要的 value。
 * @param item 累计奖励项
 * @returns 组件入参
 */
function getCumulativeRewardValue(item: RewardItem): number | [number | string, number | string, ResourceCostValueType] {
    if (item.t === "Resource") {
        return item.c || 1
    }

    return [item.c || 1, item.id, item.t as ResourceCostValueType]
}
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 详情头部：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Abyss File
            </p>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <SRouterLink
                    :to="`/db/abyss/${dungeon.id}`"
                    class="truncate font-orbitron text-xl font-bold leading-none tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                >
                    <span v-if="dungeon.sn">{{ dungeon.sn }}</span
                    >&nbsp;
                    <span v-if="dungeon.cid">{{ $t(getCharName(dungeon.cid)) }}</span>
                    #{{ getAbyssDungeonLevel(dungeon) }}
                </SRouterLink>
                <CopyID :id="dungeon.id" />
            </div>
        </header>

        <!-- 副本信息 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="INFO" title="副本信息" />
            <div class="mt-2 grid grid-cols-2 gap-1.5 text-sm md:grid-cols-3">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">深渊ID</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ dungeon.id }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">副本ID</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ dungeon.did }}</span>
                </div>
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">类型</span>
                    <span class="shrink-0 text-xs text-base-content/85">{{ $t(getAbyssDungeonGroup(dungeon)) }}</span>
                </div>
                <div
                    v-if="dungeon.sid"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">赛季ID</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ dungeon.sid }}</span>
                </div>
                <div
                    v-if="dungeon.st"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">开始时间</span>
                    <span class="shrink-0 font-mono text-[11px] tabular-nums text-primary">{{
                        new Date(dungeon.st * 1000).toLocaleString()
                    }}</span>
                </div>
                <div
                    v-if="dungeon.et"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">结束时间</span>
                    <span class="shrink-0 font-mono text-[11px] tabular-nums text-primary">{{
                        new Date(dungeon.et * 1000).toLocaleString()
                    }}</span>
                </div>
            </div>
        </section>

        <!-- 关联角色 -->
        <section v-if="dungeon.cid" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="CHARACTER" title="关联角色" />
            <div v-for="char in [getChar(dungeon.cid)!]" :key="dungeon.cid" class="mt-2 space-y-2">
                <!-- 角色名片 -->
                <div class="flex items-center gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                    <img :src="LeveledChar.url(char.icon)" alt="角色头像" class="size-10 shrink-0 rounded-xs object-cover object-top" />
                    <div class="min-w-0">
                        <SRouterLink
                            :to="`/char/${char.id}`"
                            class="block truncate text-sm font-semibold transition-colors duration-150 hover:text-primary"
                        >
                            {{ $t(char.名称) }}
                        </SRouterLink>
                        <CopyID :id="char.id" />
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-1.5 text-sm md:grid-cols-3">
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">元素属性</span>
                        <span class="shrink-0 text-xs text-base-content/85">{{ $t(`${char.属性}属性`) }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">精通</span>
                        <span class="truncate text-xs text-base-content/85">{{ char.精通?.map(item => $t(item)).join("/") }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">标签</span>
                        <span class="truncate text-xs text-base-content/85">{{
                            char.标签?.map(item => $t(`tag.${item}`, $t(item))).join("/")
                        }}</span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">版本</span>
                        <span class="shrink-0 font-mono text-[11px] tabular-nums text-primary">{{ char.版本 }}</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- 怪物属性克制 -->
        <section v-if="dungeon.mb" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="COUNTER" title="怪物属性克制" />
            <div class="mt-2 grid grid-cols-3 gap-1.5 text-sm">
                <div
                    v-for="key in ABYSS_DUNGEON_ELEMENT_KEYS"
                    :key="key"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="text-xs text-base-content/60">{{ $t(`${key}属性`) }}</span>
                    <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                        formatAbyssDungeonMbValue(dungeon, key)
                    }}</span>
                </div>
            </div>
        </section>

        <!-- BUFF列表 -->
        <section v-if="dungeon.buff?.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BUFF" title="BUFF列表">
                <template #trailing>
                    <span class="text-[11px] tabular-nums text-base-content/40">{{ dungeon.buff.length }} 个</span>
                </template>
            </SectionHeader>
            <div class="mt-2 space-y-2">
                <div
                    v-for="buff in dungeon.buff"
                    :key="buff.id"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40 hover:bg-base-content/5"
                >
                    <div class="flex items-start gap-2.5">
                        <img :src="`/imgs/webp/T_Abyss_Buff_${buff.icon}.webp`" class="h-10 shrink-0 rounded-xs" alt="" />
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1 text-sm font-medium">
                                {{ buff.n }}
                                <CopyID :id="buff.id" />
                            </div>
                            <div class="mt-1 text-xs leading-relaxed text-base-content/70">
                                {{ buff.d }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- 奖励信息 -->
        <section
            v-if="dungeon.art || dungeon.arl?.length"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="REWARDS" title="奖励信息" />
            <div v-if="dungeon.art && !dungeon.arl?.length" class="mt-2 space-y-2 text-sm">
                <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                    <span class="text-xs text-base-content/60">奖励标题</span>
                    <span class="shrink-0 text-xs text-base-content/85">{{ dungeon.art }}</span>
                </div>
            </div>
            <div v-if="dungeon.arl?.length" class="mt-2 space-y-3">
                <div v-if="dungeon.art" class="text-[11px] tracking-wide text-base-content/55">
                    {{ dungeon.art }}
                </div>
                <div
                    v-for="item in dungeon.arl"
                    :key="item.lv"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-200 hover:border-primary/40 hover:bg-base-content/5"
                >
                    <div class="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span class="flex items-center gap-1.5 text-sm font-medium">
                            <img src="/imgs/res/T_Abyss_Star02.webp" alt="图标" class="h-5 w-5 inline-block align-middle" />
                            {{ item.lv }}</span
                        >
                        <div class="flex gap-1">
                            <span
                                v-if="item.w"
                                class="rounded-xs bg-secondary px-1.5 py-0.5 text-[10px] leading-4 tracking-wide text-secondary-content"
                                >密函奖励</span
                            >
                            <span
                                class="rounded-xs px-1.5 py-0.5 text-[10px] leading-4 tracking-wide"
                                :class="
                                    getDropModeText(getRewardDetails(item.r)?.m || '') === '独立'
                                        ? 'bg-success text-success-content'
                                        : 'bg-warning text-warning-content'
                                "
                            >
                                {{ getDropModeText(getRewardDetails(item.r)?.m || "") }}
                            </span>
                        </div>
                    </div>
                    <RewardItem :reward="getRewardDetails(item.r)" :type-filter="['Drop']" />
                    <RewardItem v-if="item.a" :reward="getRewardDetails(item.a)" :type-filter="['Drop']" />
                </div>
            </div>
        </section>

        <!-- 累计奖励 -->
        <section
            v-if="isImmortalPlay && dungeon.arl?.length"
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        >
            <SectionHeader no-animate compact kicker="CUMULATIVE" title="累计奖励" />
            <div class="mt-2 mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        currentActMode === '12'
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="setActMode('12')"
                >
                    12
                </button>
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        currentActMode === '36'
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="setActMode('36')"
                >
                    36
                </button>
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        currentActMode === '50'
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="setActMode('50')"
                >
                    50
                </button>
                <button
                    type="button"
                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2 py-0.5 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        currentActMode === 'custom'
                            ? 'border-primary bg-primary font-semibold text-primary-content'
                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                    "
                    @click="setActMode('custom')"
                >
                    自定义
                </button>
                <input
                    v-if="currentActMode === 'custom'"
                    v-model.number="currentActCount"
                    type="number"
                    min="1"
                    step="1"
                    class="w-20 rounded-none border-b border-base-content/25 bg-transparent px-1 py-1 text-center font-orbitron text-sm tabular-nums outline-none transition-colors duration-200 focus:border-primary"
                />
                <span class="flex items-center gap-1 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                    <img src="/imgs/res/T_Abyss_Star02.webp" alt="图标" class="h-5 w-5" />
                    {{ currentStarCount }}
                </span>
            </div>
            <div v-if="cumulativeRewardItems.length" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                <ResourceCostItem
                    v-for="item in cumulativeRewardItems"
                    :key="item.id"
                    :name="item.n || `${item.t} ${item.id}`"
                    :value="getCumulativeRewardValue(item)"
                />
            </div>
            <div v-else class="text-sm text-base-content/70">当前幕数暂无累计奖励</div>
        </section>

        <!-- 怪物列表 -->
        <section v-if="dungeon.m?.length" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="MONSTERS" title="怪物列表">
                <template #trailing>
                    <span class="text-[11px] tabular-nums text-base-content/40">{{ dungeon.m.length }} 种</span>
                </template>
            </SectionHeader>
            <!-- 等级控制 -->
            <div class="mt-2 flex flex-wrap items-center gap-4 mb-3">
                <template v-if="isImmortalPlay">
                    <span class="text-xs text-base-content/60">幕数</span>
                    <input
                        v-model.number="currentActCount"
                        type="number"
                        min="1"
                        step="1"
                        class="w-20 rounded-none border-b border-base-content/25 bg-transparent px-1 py-1 text-center font-orbitron text-sm tabular-nums outline-none transition-colors duration-200 focus:border-primary"
                    />
                    <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                        Lv.
                        {{ monsterDisplayLevel }}
                        <span class="font-mono text-[11px] font-normal text-base-content/55">/ {{ AbyssMonsterLevelLimit }}</span>
                    </span>
                </template>
                <template v-else>
                    <span class="min-w-12 shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary"
                        >Lv. {{ currentMonsterLevel }}</span
                    >
                    <input
                        v-model.number="currentMonsterLevel"
                        type="range"
                        class="range range-primary range-xs grow"
                        min="1"
                        :max="AbyssMonsterLevelLimit"
                        step="1"
                    />
                </template>
            </div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-2">
                <DBMonsterCompactCard
                    v-for="monsterId in dungeon.m"
                    :key="monsterId"
                    :monster="LeveledMonsterHelper.fromId(monsterId, monsterDisplayLevel, false)"
                />
            </div>
        </section>
    </div>
</template>
