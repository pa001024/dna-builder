<script setup lang="ts">
import { computed } from "vue"
import type { AfkEvent } from "@/api/afkSupport"
import { useAfkWidget } from "@/composables/useAfkWidget"
import { dungeonMap } from "@/data/d"
import { env } from "@/env"
import { formatAfkEvent, useAfkSupportStore } from "@/store/afkSupport"
import { useSettingStore } from "@/store/setting"
import { AFK_DUNGEON_ALIASES, afkDungeonName } from "@/utils/afk-ledger"
import { dungeonDisplayName } from "@/utils/dungeon-utils"
import { getRaritySwatchClass } from "@/utils/rarity-utils"

/**
 * 「小小狩月人」奖励管道接收端的设置卡片。
 *
 * 官方工具与被本应用二选一：两者都当服务端会抢同一个管道名，事件流会被随机瓜分。
 * 所以这里把互斥说明与实时状态放在一起，让用户能一眼看出当前是谁在收数据。
 */
const afk = useAfkSupportStore()
const setting = useSettingStore()
/** 独立小窗开关：与账本页的开关同一来源，窗口只是投影 */
const { busy: afkWidgetBusy, setEnabled: setAfkWidgetEnabled } = useAfkWidget()
/** 最近事件倒序展示，列表长度受设置页空间限制。 */
const recent = computed(() => afk.events.slice(-8).reverse())
/** 状态文案的 i18n 键。 */
const statusKey = computed(() => {
    if (!afk.running) return "afk-support.status_stopped"
    return afk.connected ? "afk-support.status_connected" : "afk-support.status_waiting"
})

/**
 * 副本事件跳转到资料库详情页；数据包里没有该副本时返回空串。
 * @param event 协议事件
 * @returns 路由
 */
function eventLink(event: AfkEvent) {
    if (event.kind !== "dungeon") return ""
    if (event.id in AFK_DUNGEON_ALIASES) return "/db/rouge"
    const numericId = Number(event.id)
    return Number.isFinite(numericId) && dungeonMap.has(numericId) ? `/db/dungeon/${numericId}` : ""
}

/**
 * 副本事件用带括号的完整副本名，其余事件沿用摘要。
 * @param event 协议事件
 * @returns 展示文本
 */
function eventText(event: AfkEvent) {
    if (event.kind !== "dungeon") return formatAfkEvent(event)
    const label = dungeonDisplayName(event.id, afkDungeonName(event.id, event.name))
    return formatAfkEvent(event).replace(afkDungeonName(event.id, event.name), label)
}

/**
 * 事件时刻格式化为 `HH:MM:SS`。
 * @param ms Unix 毫秒
 * @returns 时间文本
 */
function timeLabel(ms: number) {
    return new Date(ms).toLocaleTimeString(undefined, { hour12: false })
}
</script>

<template>
    <div
        class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
        :style="{ animationDelay: '0.03s' }"
    >
        <div class="flex flex-col gap-2">
            <!-- 总开关 + 互斥说明 -->
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="label-text">
                    {{ $t("afk-support.enable") }}
                    <div class="text-xs text-base-content/50">{{ $t("afk-support.enable_hint") }}</div>
                    <div v-if="afk.lastError" class="mt-0.5 text-xs text-error">{{ afk.lastError }}</div>
                    <div v-if="!env.isApp" class="mt-0.5 text-xs text-warning">{{ $t("afk-support.app_only") }}</div>
                </span>
                <div class="flex shrink-0 items-center gap-2">
                    <span v-if="afk.busy" class="loading loading-spinner loading-xs" />
                    <input
                        type="checkbox"
                        class="toggle toggle-secondary"
                        :checked="afk.running"
                        :disabled="afk.busy || !env.isApp"
                        @change="afk.setEnabled(($event.target as HTMLInputElement).checked)"
                    />
                </div>
            </div>

            <!-- 独立动画小窗：开关存在设置里，窗口只是投影；与账本页的开关同一来源 -->
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="label-text">
                    {{ $t("afk-widget.open") }}
                    <div class="text-xs text-base-content/50">{{ $t("afk-widget.open_hint") }}</div>
                </span>
                <div class="flex shrink-0 items-center gap-2">
                    <span v-if="afkWidgetBusy" class="loading loading-spinner loading-xs" />
                    <input
                        type="checkbox"
                        class="toggle toggle-secondary"
                        :checked="setting.afkWidgetEnabled"
                        :disabled="afkWidgetBusy || !env.isApp"
                        @change="setAfkWidgetEnabled(($event.target as HTMLInputElement).checked)"
                    />
                </div>
            </div>

            <!-- 副本完成桌面通知：与接收端总开关独立，关掉只静音系统通知 -->
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="label-text">
                    {{ $t("afk-support.notify_dungeon") }}
                    <div class="text-xs text-base-content/50">{{ $t("afk-support.notify_dungeon_hint") }}</div>
                </span>
                <input
                    type="checkbox"
                    class="toggle toggle-secondary"
                    :checked="afk.notifyDungeon"
                    :disabled="!env.isApp"
                    @change="afk.setNotifyDungeon(($event.target as HTMLInputElement).checked)"
                />
            </div>

            <!-- 铸造完成桌面通知：与接收端总开关独立 -->
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="label-text">
                    {{ $t("afk-support.notify_craft") }}
                    <div class="text-xs text-base-content/50">{{ $t("afk-support.notify_craft_hint") }}</div>
                </span>
                <input
                    type="checkbox"
                    class="toggle toggle-secondary"
                    :checked="afk.notifyCraft"
                    :disabled="!env.isApp"
                    @change="afk.setNotifyCraft(($event.target as HTMLInputElement).checked)"
                />
            </div>

            <!-- 状态与计数 -->
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div class="flex items-center gap-2">
                    <span
                        class="inline-flex h-1.5 w-1.5 shrink-0 rounded-full"
                        :class="afk.connected ? 'bg-success' : afk.running ? 'bg-warning' : 'bg-base-content/25'"
                    />
                    <span class="text-xs">{{ $t(statusKey) }}</span>
                    <RouterLink class="ml-auto btn btn-xs btn-square" to="/afk">
                        <Icon icon="ri:external-link-line" class="h-3.5 w-3.5" />
                    </RouterLink>
                </div>
                <div class="mt-1 flex gap-3 text-[10px] text-base-content/45">
                    <span>{{ $t("afk-support.received") }} {{ afk.status?.received ?? 0 }}</span>
                    <span>{{ $t("afk-support.dropped") }} {{ afk.status?.dropped ?? 0 }}</span>
                </div>
            </div>

            <!-- 最近事件 -->
            <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <div class="mb-1.5 flex items-center gap-2">
                    <span class="text-[11px] font-medium text-base-content/55">{{ $t("afk-support.events") }}</span>
                    <button
                        v-if="afk.events.length"
                        type="button"
                        class="ml-auto inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-xs text-base-content/50 transition-colors duration-150 hover:bg-error/10 hover:text-error"
                        :title="$t('afk-support.clear')"
                        @click="afk.clearEvents()"
                    >
                        <Icon icon="ri:delete-bin-line" class="h-3.5 w-3.5" />
                    </button>
                </div>
                <div v-if="recent.length === 0" class="py-2 text-center text-xs text-base-content/45">
                    {{ $t("afk-support.empty") }}
                </div>
                <div v-else class="flex flex-col gap-1">
                    <div
                        v-for="(event, index) in recent"
                        :key="`${event.receivedAt}-${index}`"
                        class="flex items-center gap-2 rounded-xs bg-base-100/60 px-1.5 py-1"
                    >
                        <span class="font-mono text-[10px] text-base-content/35">{{ timeLabel(event.receivedAt) }}</span>
                        <span class="inline-flex h-4 items-center rounded-xs bg-secondary/15 px-1 text-[9px] font-semibold text-secondary">
                            {{ event.kind }}
                        </span>
                        <!-- 品质只用色块表示，不写数字 -->
                        <span
                            v-if="event.kind === 'reward' || event.kind === 'craft'"
                            :class="getRaritySwatchClass(event.rarity)"
                        />
                        <SRouterLink
                            v-if="eventLink(event)"
                            :to="eventLink(event)"
                            class="truncate text-[11px] text-base-content/75 hover:text-primary hover:underline"
                        >
                            {{ eventText(event) }}
                        </SRouterLink>
                        <span v-else class="truncate text-[11px] text-base-content/75">{{ eventText(event) }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
