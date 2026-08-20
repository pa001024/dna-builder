<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { MIHAN_MISSIONS, MIHAN_TYPES, useMihanNotify } from "@/store/mihan"
import { timeStr, useGameTimer } from "@/util"

// 三种密函类型的主题色（角色金 / 武器蓝 / 魔之楔红）
const TYPE_COLORS = ["#ba9011", "#1171ba", "#ba1111"] as const
// 密函图标后缀（与 T_Walnut_<后缀>.webp 对应）
const TYPE_ICON_SUFFIX = ["Avatar", "Weapon", "Mod"] as const

const mihanNotify = useMihanNotify()
// 从 store 单例解构顶层 ref，便于模板直接 v-model
const mihanEnableNotify = mihanNotify.mihanEnableNotify
const mihanNotifyOnce = mihanNotify.mihanNotifyOnce
const mihanNotifyTypes = mihanNotify.mihanNotifyTypes
const mihanNotifyMissions = mihanNotify.mihanNotifyMissions
const mihanData = mihanNotify.mihanData
const { mihan } = useGameTimer()

// 推送设置面板展开状态
const settingsOpen = ref(false)
// 手动刷新中标记
const refreshing = ref(false)
// 首次拉取是否完成（区分加载中与空数据）
const initialLoading = ref(true)

/**
 * 当前密函数据（保留缓存数据，即使过期也展示并提示）。
 */
const missions = computed(() => mihanData.value ?? [])

/**
 * 是否已有密函数据。
 */
const hasData = computed(() => missions.value.length > 0)

/**
 * 数据是否已过期（超过整点刷新窗口）。
 * 依赖每秒跳动的倒计时 ref，使过期判断随时间推进自动更新。
 */
const stale = computed(() => {
    void mihan.value
    return mihanNotify.isOutdated()
})

/**
 * 计算某个类型分组内命中的任务数。
 * @param list 该类型的任务数组
 * @returns 命中数量
 */
function matchedInType(list: string[]) {
    return list.filter(mission => mihanNotifyMissions.value.includes(mission)).length
}

/**
 * 手动刷新密函数据（强制覆盖缓存）。
 */
async function refreshData() {
    refreshing.value = true
    try {
        await mihanNotify.updateMihanData(true)
    } finally {
        refreshing.value = false
        initialLoading.value = false
    }
}

/**
 * 页面重新可见时刷新密函数据。
 */
const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
        void mihanNotify.updateMihanData()
    }
}

onMounted(() => {
    void mihanNotify.updateMihanData().finally(() => {
        initialLoading.value = false
    })
    document.addEventListener("visibilitychange", handleVisibilityChange)
})
onUnmounted(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange)
})
</script>

<template>
    <div>
        <!-- 加载中：首次拉取尚未完成 -->
        <div v-if="initialLoading" class="flex justify-center py-8">
            <span class="loading loading-spinner loading-lg" />
        </div>

        <!-- 空状态 -->
        <div
            v-else-if="!hasData"
            class="flex flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-base-content/15 py-8 text-base-content/45"
        >
            <Icon icon="ri:mail-send-line" class="h-7 w-7 opacity-50" />
            <span class="text-[13px]">{{ $t("home.mihanEmpty") }}</span>
            <button
                type="button"
                class="mt-1 inline-flex h-7 cursor-pointer items-center gap-1 rounded-xs border border-base-content/20 px-2.5 text-xs text-base-content/70 transition-colors hover:border-primary/50 hover:text-primary"
                :disabled="refreshing"
                @click="refreshData()"
            >
                <Icon icon="ri:refresh-line" class="h-3.5 w-3.5" :class="{ 'animate-spin': refreshing }" />
                {{ $t("home.mihanRefresh") }}
            </button>
        </div>

        <!-- 三种密函类型卡片 -->
        <div v-else class="grid gap-2 md:grid-cols-3">
            <div
                v-for="(list, typeIndex) in missions"
                :key="typeIndex"
                class="rounded-xs border border-base-content/10 bg-base-100/60 p-3"
            >
                <div class="mb-2 flex items-center gap-2">
                    <img
                        class="size-6 shrink-0"
                        :src="`/imgs/webp/T_Walnut_${TYPE_ICON_SUFFIX[typeIndex]}.webp`"
                        :alt="`${$t(MIHAN_TYPES[typeIndex])}密函`"
                    />
                    <span class="text-[13px] font-semibold" :style="{ color: TYPE_COLORS[typeIndex] }">
                        {{ $t(MIHAN_TYPES[typeIndex]) }}
                    </span>
                    <span
                        v-if="matchedInType(list) > 0"
                        class="ml-auto inline-flex h-4 items-center rounded-xs bg-secondary/15 px-1 text-[10px] font-semibold text-secondary tabular-nums"
                    >
                        {{ $t("home.mihanMatched", { count: matchedInType(list) }) }}
                    </span>
                </div>
                <div class="flex flex-wrap gap-1">
                    <span
                        v-for="mission in list"
                        :key="mission"
                        class="inline-flex items-center rounded-xs border px-1.5 py-0.5 text-[11px] leading-tight"
                        :class="
                            mihanNotifyMissions.includes(mission)
                                ? 'border-secondary/40 bg-secondary/10 font-medium text-secondary'
                                : 'border-base-content/10 bg-base-100 text-base-content/65'
                        "
                    >
                        {{ $t(mission) }}
                    </span>
                </div>
            </div>
        </div>

        <!-- 状态条：下次刷新倒计时 + 过期提示 + 刷新 / 推送设置 -->
        <div class="mt-3 flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2">
            <Icon icon="ri:time-line" class="h-4 w-4 shrink-0 text-primary" />
            <span class="text-xs whitespace-nowrap text-base-content/70">{{ $t("resizeableWindow.nextRefresh") }}</span>
            <span class="font-orbitron text-sm font-semibold text-base-content tabular-nums">{{ timeStr(mihan) }}</span>
            <span
                v-if="mihanEnableNotify"
                class="ml-1 inline-flex items-center gap-1 rounded-xs bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success"
            >
                <span class="relative flex h-1.5 w-1.5">
                    <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                    <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                {{ $t("home.mihanWatching") }}
            </span>
            <span
                v-if="stale"
                class="inline-flex items-center gap-1 rounded-xs bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"
            >
                <Icon icon="ri:error-warning-line" class="h-3 w-3" />
                {{ $t("home.mihanStale") }}
            </span>
            <button
                type="button"
                class="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs text-base-content/50 transition-colors duration-150 hover:bg-base-content/10 hover:text-base-content disabled:pointer-events-none disabled:opacity-40"
                :disabled="refreshing"
                :title="$t('home.mihanRefresh')"
                :aria-label="$t('home.mihanRefresh')"
                @click="refreshData()"
            >
                <Icon icon="ri:refresh-line" class="h-3.5 w-3.5" :class="{ 'animate-spin': refreshing }" />
            </button>
            <button
                type="button"
                class="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs text-base-content/50 transition-colors duration-150 hover:bg-base-content/10 hover:text-base-content"
                :class="{ 'bg-base-content/10 text-base-content': settingsOpen }"
                :title="$t('resizeableWindow.monitorSettings')"
                :aria-label="$t('resizeableWindow.monitorSettings')"
                @click="settingsOpen = !settingsOpen"
            >
                <Icon icon="ri:list-check-2" class="h-3.5 w-3.5" />
            </button>
        </div>

        <!-- 推送设置面板（可折叠） -->
        <div v-if="settingsOpen" class="mt-2 rounded-xs border border-base-content/10 bg-base-100/60 p-3">
            <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label class="flex cursor-pointer items-center gap-2 py-0">
                    <input v-model="mihanEnableNotify" type="checkbox" class="toggle toggle-sm toggle-primary rounded-xs" />
                    <span class="text-xs text-base-content/80">{{ $t("resizeableWindow.enableNotify") }}</span>
                </label>
                <label v-if="mihanEnableNotify" class="flex cursor-pointer items-center gap-2 py-0">
                    <input v-model="mihanNotifyOnce" type="checkbox" class="toggle toggle-sm toggle-primary rounded-xs" />
                    <span class="text-xs text-base-content/80">{{ $t("resizeableWindow.onlyOnce") }}</span>
                </label>
                <button
                    type="button"
                    class="inline-flex h-6 cursor-pointer items-center gap-1 rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/70 transition-colors hover:border-primary/50 hover:text-primary"
                    @click="mihanNotify.showMihanNotification()"
                >
                    <Icon icon="ri:notification-3-line" class="h-3 w-3" />
                    测试
                </button>
            </div>

            <template v-if="mihanEnableNotify">
                <div class="mt-3 border-t border-base-content/10 pt-3">
                    <div class="mb-1.5 text-[11px] font-medium text-base-content/55">{{ $t("home.mihanNotifyTypes") }}</div>
                    <div class="flex flex-wrap gap-1.5">
                        <label
                            v-for="(type, val) in MIHAN_TYPES"
                            :key="type"
                            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2 py-1 text-[11px] text-base-content/75 transition-colors has-checked:border-primary/50 has-checked:bg-primary/10 has-checked:text-primary"
                        >
                            <input v-model="mihanNotifyTypes" :value="val" name="mihanTypes" type="checkbox" class="checkbox checkbox-xs rounded-xs" />
                            {{ $t(type) }}
                        </label>
                    </div>
                </div>
                <div class="mt-3">
                    <div class="mb-1.5 text-[11px] font-medium text-base-content/55">{{ $t("home.mihanNotifyMissions") }}</div>
                    <div class="flex flex-wrap gap-1.5">
                        <label
                            v-for="mission in MIHAN_MISSIONS"
                            :key="mission"
                            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/15 px-2 py-1 text-[11px] text-base-content/75 transition-colors has-checked:border-secondary/40 has-checked:bg-secondary/10 has-checked:text-secondary"
                        >
                            <input v-model="mihanNotifyMissions" :value="mission" name="mihanMissions" type="checkbox" class="checkbox checkbox-xs rounded-xs" />
                            {{ $t(mission) }}
                        </label>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>
