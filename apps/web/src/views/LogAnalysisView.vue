<script lang="ts" setup>
import { computed, onMounted, ref } from "vue"
import { fmtBytes, fmtClock, fmtInt } from "@/components/log-analysis/format"
import { env } from "@/env"
import { useGameStore } from "@/store/game"
import { useLogAnalysisStore } from "@/store/logAnalysis"

const store = useLogAnalysisStore()
const game = useGameStore()

const sessions = computed(() => store.sessions)
const session = computed(() => store.selectedSession)
const hasSessions = computed(() => sessions.value.length > 0)
const status = computed(() => store.status)
const activeSessionIndex = computed(() => store.effectiveSessionIndex)
const pathText = computed(() => store.logPath || status.value?.path || "—")
const settingsOpen = ref(false)

async function handleStart() {
    await store.start()
}

async function handleStop() {
    await store.stop()
}

function handleClear() {
    store.reset()
}

function selectSession(index: number) {
    store.selectSession(index)
}

onMounted(async () => {
    if (!env.isApp) return
    try {
        await store.initListeners()
    } catch (error) {
        console.error("初始化日志分析监听失败", error)
    }
})
</script>

<template>
    <div class="h-full w-full overflow-y-auto">
        <div class="stagger-rise flex w-full flex-col gap-3 p-4">
            <!-- 工具栏：监听控制、对局切换与设置入口 -->
            <div class="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2 backdrop-blur-sm">
                <button class="btn btn-xs btn-primary" type="button" :disabled="store.running" @click="handleStart">
                    <Icon icon="ri:play-fill" class="size-3.5" />
                    {{ $t("log-analysis.start") }}
                </button>
                <button class="btn btn-xs" type="button" :disabled="!store.running" @click="handleStop">
                    <Icon icon="ri:stop-line" class="size-3.5" />
                    {{ $t("log-analysis.stop") }}
                </button>
                <button class="btn btn-xs" type="button" :disabled="!store.hasData" @click="handleClear">
                    <Icon icon="ri:delete-bin-line" class="size-3.5" />
                    {{ $t("log-analysis.clear") }}
                </button>
                <span class="h-3 w-px bg-base-content/15" aria-hidden="true" />
                <span
                    class="border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.2em]"
                    :class="
                        store.running
                            ? 'border-success/50 bg-success/10 text-success'
                            : 'border-base-content/20 bg-base-content/5 text-base-content/50'
                    "
                >
                    {{ store.running ? $t("log-analysis.status_live") : $t("log-analysis.status_idle") }}
                </span>
                <span
                    v-if="status"
                    class="hidden shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums text-base-content/45 md:inline-flex"
                    :title="`${$t('log-analysis.lines_read')} / ${$t('log-analysis.events_title')}`"
                >
                    <Icon icon="ri:file-list-line" class="size-3" />
                    {{ fmtInt(status.linesRead) }}
                    <span class="text-base-content/20">/</span>
                    <Icon icon="ri:node-tree" class="size-3" />
                    {{ fmtInt(store.eventCount) }}
                </span>

                <!-- 对局切换放在工具栏中间，避免占用独立卡片 -->
                <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                    <span v-if="hasSessions" class="shrink-0 text-[11px] tracking-wide text-base-content/50">
                        {{ $t("log-analysis.sessions") }}
                    </span>
                    <button
                        v-for="option in store.sessionOptions"
                        :key="option.index"
                        type="button"
                        class="btn btn-xs whitespace-nowrap"
                        :class="option.index === activeSessionIndex ? 'btn-primary' : ''"
                        @click="selectSession(option.index)"
                    >
                        <span v-if="option.time > 0" class="font-orbitron text-[10px] tabular-nums">{{ fmtClock(option.time) }}</span>
                        <span class="max-w-48 truncate">{{ option.label }}</span>
                    </button>
                </div>

                <!-- 配置入口：点开才展示 -->
                <Popover v-model="settingsOpen" as-child side="bottom" :title="$t('log-analysis.settings')" noconfirm>
                    <button
                        type="button"
                        class="btn btn-xs btn-square shrink-0"
                        :class="settingsOpen ? 'border-primary bg-primary/10 text-primary' : 'border-base-content/15'"
                        :title="$t('log-analysis.settings')"
                    >
                        <Icon icon="ri:settings-3-line" class="size-3.5" />
                    </button>
                    <template #content>
                        <div class="flex flex-col gap-2">
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span class="text-[11px] tracking-wide text-base-content/50">{{ $t("log-analysis.log_path") }}</span>
                                <span class="min-w-0 flex-1 truncate text-xs text-base-content/75" :title="pathText">{{ pathText }}</span>
                            </div>
                            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-base-content/10 pt-2">
                                <label class="label cursor-pointer items-center gap-1.5 px-0 py-0.5">
                                    <input v-model="store.fromStart" type="checkbox" class="checkbox checkbox-primary checkbox-xs" />
                                    <span class="label-text text-xs">{{ $t("log-analysis.from_start") }}</span>
                                </label>
                                <label
                                    class="label tooltip cursor-pointer items-center gap-1.5 px-0 py-0.5"
                                    :data-tip="$t('log-analysis.launch_param_tip')"
                                >
                                    <input v-model="game.logAnalysisEnable" type="checkbox" class="checkbox checkbox-primary checkbox-xs" />
                                    <span class="label-text text-xs">{{ $t("log-analysis.launch_param") }}</span>
                                </label>
                                <label
                                    class="label tooltip cursor-pointer items-center gap-1.5 px-0 py-0.5"
                                    :data-tip="$t('log-analysis.feed_ledger_tip')"
                                >
                                    <input v-model="store.feedLedger" type="checkbox" class="checkbox checkbox-primary checkbox-xs" />
                                    <span class="label-text text-xs">{{ $t("log-analysis.feed_ledger") }}</span>
                                </label>
                            </div>
                            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-base-content/10 pt-2">
                                <span class="inline-flex items-center gap-1.5">
                                    <span class="text-[11px] text-base-content/50">{{ $t("log-analysis.lines_read") }}</span>
                                    <span class="font-orbitron text-[13px] font-semibold text-primary">{{ status ? fmtInt(status.linesRead) : "—" }}</span>
                                </span>
                                <span class="inline-flex items-center gap-1.5">
                                    <span class="text-[11px] text-base-content/50">{{ $t("log-analysis.bytes_read") }}</span>
                                    <span class="font-orbitron text-[13px] font-semibold text-primary">{{ status ? fmtBytes(status.bytesRead) : "—" }}</span>
                                </span>
                                <span class="inline-flex items-center gap-1.5">
                                    <span class="text-[11px] text-base-content/50">{{ $t("log-analysis.file_size") }}</span>
                                    <span class="font-orbitron text-[13px] font-semibold text-primary">{{ status ? fmtBytes(status.fileSize) : "—" }}</span>
                                </span>
                            </div>
                        </div>
                    </template>
                </Popover>
            </div>

            <!-- 错误提示条 -->
            <div
                v-if="store.lastError || store.analysisError"
                class="flex items-start gap-2 rounded-xs border border-error/40 bg-error/5 px-3 py-2 text-xs text-error"
            >
                <Icon icon="ri:error-warning-line" class="mt-px size-4 shrink-0" />
                <span class="min-w-0 break-all">{{ store.lastError || store.analysisError }}</span>
            </div>

            <!-- 未开始监听 -->
            <section v-if="!store.hasData && !store.running" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <div class="flex flex-col items-center py-6 text-center">
                    <Icon icon="ri:file-list-line" class="mb-3 size-10 text-base-content/25" />
                    <p class="text-sm font-semibold">{{ $t("log-analysis.empty_title") }}</p>
                    <p class="mt-1 max-w-md text-xs text-base-content/55">{{ $t("log-analysis.empty_intro") }}</p>
                    <ol class="mt-3 list-decimal space-y-1 pl-5 text-left text-xs text-base-content/65">
                        <li>{{ $t("log-analysis.empty_step_1") }}</li>
                        <li>{{ $t("log-analysis.empty_step_2") }}</li>
                        <li>{{ $t("log-analysis.empty_step_3") }}</li>
                    </ol>
                </div>
            </section>

            <!-- 已监听但尚未识别到对局 -->
            <section v-else-if="!hasSessions" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <div class="flex flex-col items-center py-6 text-center">
                    <Icon icon="ri:time-line" class="mb-3 size-10 text-primary/40" />
                    <p class="text-sm font-semibold">{{ store.hasData ? $t("log-analysis.waiting_no_session", { count: store.eventCount }) : $t("log-analysis.waiting_title") }}</p>
                    <p class="mt-1 max-w-md text-xs text-base-content/55">{{ $t("log-analysis.waiting_hint") }}</p>
                </div>
            </section>

            <div v-else-if="session" class="grid gap-3 xl:grid-cols-2">
                <LogAnalysisKpi :session="session" class="xl:col-span-2" />
                <LogOverviewCard :session="session" class="xl:col-span-2" />
                <LogRhythmCard :session="session" class="xl:col-span-2" />
                <LogCompositionCard :session="session" />
                <LogSupplyCard :session="session" />
                <LogSpaceCard :session="session" class="xl:col-span-2" />
                <LogBossTimelineCard :session="session" class="xl:col-span-2" />
                <LogDamageBoardCard :session="session" />
                <LogCombatStatsCard :session="session" />
                <LogSkillsCard :session="session" />
                <LogEventsCard :session="session" />
            </div>
        </div>
    </div>
</template>
