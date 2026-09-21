<script setup lang="ts">
import { MIHAN_TYPES } from "@/store/mihan"
import { MIHAN_TYPE_META } from "@/utils/mihan-meta"
import type { ResolvedScreenBarItem, ScreenBarMihanEmptyReason } from "@/utils/screen-bar"

/**
 * 屏幕信息条的纯展示组件。
 *
 * 只负责把父级算好的条目渲染成一行胶囊;浮窗页与设置页预览共用同一个组件,
 * 保证"预览所见即浮窗所得"。新增条目类型时在这里加一个渲染分支。
 *
 * 外层容器不带背景与边框:浮窗窗口本身透明,只有条目胶囊有底,胶囊之间要能透出后面的画面。
 */
defineProps<{
    /** 渲染就绪的条目列表 */
    items: ResolvedScreenBarItem[]
    /** 整条不透明度 */
    opacity: number
    /** 内容缩放系数 */
    scale: number
}>()

/** 委托条目空状态的原因到文案 key:筛选条件造成的空与真的没数据必须说清楚。 */
const MIHAN_EMPTY_KEYS: Record<ScreenBarMihanEmptyReason, string> = {
    noTypeSelection: "screenBar.mihanNoType",
    noSelection: "screenBar.mihanNoSelection",
    noData: "screenBar.mihanEmpty",
}
</script>

<template>
    <!-- 外层容器不画背景也不画边框:整条只有每个条目的胶囊自己有底,胶囊之间直接透出窗口后面的画面 -->
    <div class="flex w-fit items-center gap-1.5 text-[11px] leading-none text-base-content" :style="{ opacity, zoom: scale }">
        <template v-for="item in items" :key="item.id">
            <!-- 时钟 -->
            <span
                v-if="item.type === 'clock'"
                class="inline-flex shrink-0 items-center gap-1 rounded-xs border border-base-content/10 bg-base-200/70 px-1.5 py-1 h-5"
            >
                <Icon icon="ri:time-line" class="size-3 shrink-0 opacity-70" />
                <span class="font-mono font-semibold tabular-nums">{{ item.text }}</span>
            </span>

            <!-- 自定义倒计时 -->
            <span
                v-else-if="item.type === 'countdown'"
                class="inline-flex shrink-0 items-center gap-1 rounded-xs border border-base-content/10 bg-base-200/70 px-1.5 py-1 h-5"
            >
                <Icon icon="ri:timer-flash-line" class="size-3 shrink-0 opacity-70" />
                <span v-if="item.title" class="text-base-content/60">{{ item.title }}</span>
                <span v-if="item.status === 'unset'" class="text-base-content/45">{{ $t("screenBar.countdownUnset") }}</span>
                <span v-else-if="item.status === 'expired'" class="text-base-content/45">{{ $t("screenBar.countdownExpired") }}</span>
                <span v-else class="font-mono font-semibold tabular-nums text-primary">{{ item.text }}</span>
            </span>

            <!-- 委托信息:按类型分组,关注中的任务高亮 -->
            <span
                v-else-if="item.type === 'mihan'"
                class="inline-flex shrink-0 items-center gap-1 rounded-xs border border-base-content/10 bg-base-200/70 px-1.5 py-1 h-5"
            >
                <template v-for="(entry, entryIndex) in item.entries" :key="entry.typeIndex">
                    <img class="size-3.5 shrink-0" :src="MIHAN_TYPE_META[entry.typeIndex].icon" :alt="$t(MIHAN_TYPES[entry.typeIndex])" />
                    <span class="shrink-0 font-medium" :style="{ color: MIHAN_TYPE_META[entry.typeIndex].color }">
                        {{ $t(MIHAN_TYPES[entry.typeIndex]) }}
                    </span>
                    <template v-for="(mission, missionIndex) in entry.missions" :key="mission.name">
                        <span :class="mission.matched ? 'font-medium text-secondary' : 'text-base-content/55'">{{ $t(mission.name) }}</span>
                        <span v-if="missionIndex < entry.missions.length - 1" class="text-base-content/25">·</span>
                    </template>
                    <span v-if="entryIndex < item.entries.length - 1" class="mx-0.5 text-base-content/20">|</span>
                </template>
                <span v-if="item.entries.length === 0" class="text-base-content/45">
                    {{ $t(MIHAN_EMPTY_KEYS[item.emptyReason]) }}
                </span>
            </span>

            <!-- 定时刷新倒计时:委托按整点、魔灵按 3 天、周本按 7 天,只有展示名不同 -->
            <span
                v-else-if="item.type === 'mihanRefresh' || item.type === 'moling' || item.type === 'zhouben'"
                class="inline-flex shrink-0 items-center gap-1 rounded-xs border border-base-content/10 bg-base-200/70 px-1.5 py-1 h-5"
            >
                <Icon icon="ri:refresh-line" class="size-3 shrink-0 text-primary" />
                <span class="text-base-content/60">{{ $t(`screenBar.${item.type}`) }}</span>
                <span class="font-mono font-semibold tabular-nums">{{ item.text }}</span>
            </span>
        </template>
    </div>
</template>
