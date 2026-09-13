<script setup lang="ts">
import { t } from "i18next"
import { computed, ref } from "vue"
import { env } from "@/env"
import { isTaskActive, type ModDownloadTask, useModDownloadStore } from "@/store/modDownload"

/**
 * 分享 MOD 下载队列浮层：下载/安装全局可见，切页面或关闭详情弹窗都不会中断。
 * 队列为空时不渲染；已完成任务由队列短暂保留后自动移出，失败任务保留到重试或清除。
 */
const download = useModDownloadStore()

/** 是否折叠为一条标题栏。 */
const collapsed = ref(false)

/** 已完成任务数（用于汇总文案）。 */
const doneCount = computed(() => download.tasks.filter(task => task.status === "done").length)

/**
 * @description 取任务的状态文案。
 * @param task 队列任务。
 * @returns 状态文案。
 */
function statusText(task: ModDownloadTask) {
    switch (task.status) {
        case "pending":
            return t("game-launcher.queuePending")
        case "downloading":
            return t("game-launcher.queueDownloading")
        case "installing":
            return t("game-launcher.installing")
        case "done":
            return t("game-launcher.queueDone")
        default:
            return t("game-launcher.queueFailed")
    }
}

/**
 * @description 取任务状态对应的图标。
 * @param task 队列任务。
 * @returns Remix 图标名。
 */
function statusIcon(task: ModDownloadTask) {
    switch (task.status) {
        case "pending":
            return "ri:time-line" as const
        case "downloading":
            return "ri:download-2-line" as const
        case "installing":
            return "ri:download-cloud-2-line" as const
        case "done":
            return "ri:check-line" as const
        default:
            return "ri:error-warning-line" as const
    }
}
</script>

<template>
    <!-- 队列为空（或非桌面端）时不显示 -->
    <div
        v-if="env.isApp && download.tasks.length > 0"
        class="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded border border-base-300 bg-base-100 shadow-lg"
        role="status"
        aria-live="polite"
    >
        <!-- 标题栏：点击折叠/展开 -->
        <button class="flex w-full items-center gap-2 bg-base-200/70 px-3 py-2 text-sm" @click="collapsed = !collapsed">
            <Icon :icon="download.busy ? 'ri:download-cloud-2-line' : 'ri:download-2-line'" class="size-4 text-primary" />
            <span class="font-medium">{{ $t("game-launcher.downloadQueue") }}</span>
            <span class="badge badge-xs badge-ghost">{{ $t("game-launcher.queueSummary", { done: doneCount, total: download.tasks.length }) }}</span>
            <Icon :icon="collapsed ? 'ri:arrow-up-line' : 'ri:arrow-down-line'" class="ml-auto size-4 opacity-60" />
        </button>

        <div v-show="!collapsed" class="max-h-72 overflow-y-auto p-2 flex flex-col gap-2">
            <div
                v-for="task in download.tasks"
                :key="task.key"
                class="rounded border border-base-content/10 bg-base-200/40 px-2.5 py-2 flex flex-col gap-1.5"
                :class="{ 'opacity-70': task.status === 'done' }"
            >
                <div class="flex items-center gap-1.5 text-xs">
                    <Icon
                        :icon="statusIcon(task)"
                        class="size-3.5 flex-none"
                        :class="task.status === 'error' ? 'text-error' : task.status === 'done' ? 'text-success' : 'text-primary'"
                    />
                    <span class="flex-1 truncate font-medium" :title="task.name">{{ task.name }}</span>
                    <span v-if="task.version" class="badge badge-xs badge-ghost flex-none">v{{ task.version }}</span>
                </div>

                <!-- 进度条：总量未知时显示不确定进度 -->
                <progress
                    v-if="isTaskActive(task)"
                    class="progress progress-primary h-1.5 w-full"
                    :value="task.progress ?? undefined"
                    max="100"
                />

                <div class="flex items-center gap-1.5 text-[11px] text-base-content/70">
                    <span class="flex-1 truncate">{{ statusText(task) }}</span>
                    <span v-if="isTaskActive(task) && task.progress !== null" class="font-orbitron tabular-nums">
                        {{ task.progress }}%
                    </span>
                    <template v-if="task.status === 'error'">
                        <button class="btn btn-xs btn-primary" @click="download.retryTask(task.key)">
                            {{ $t("game-launcher.queueRetry") }}
                        </button>
                        <button class="btn btn-xs btn-ghost" @click="download.removeTask(task.key)">
                            {{ $t("game-launcher.queueDismiss") }}
                        </button>
                    </template>
                    <button v-else-if="isTaskActive(task)" class="btn btn-xs btn-ghost" @click="download.cancelTask(task.key)">
                        {{ $t("game-launcher.queueCancel") }}
                    </button>
                    <button v-else class="btn btn-xs btn-ghost" @click="download.removeTask(task.key)">
                        {{ $t("game-launcher.queueDismiss") }}
                    </button>
                </div>

                <div v-if="task.status === 'error' && task.error" class="text-[11px] text-error break-all">{{ task.error }}</div>
            </div>

            <div class="flex justify-end gap-2 pt-0.5">
                <button
                    v-if="download.tasks.some(task => task.status === 'done' || task.status === 'error')"
                    class="btn btn-xs btn-ghost"
                    @click="download.clearFinishedTasks()"
                >
                    {{ $t("game-launcher.queueClearFinished") }}
                </button>
                <button class="btn btn-xs btn-ghost" @click="download.clearTasks()">
                    {{ $t("game-launcher.queueClear") }}
                </button>
            </div>
        </div>
    </div>
</template>
