<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import type { LanSyncPairRequestPayload } from "@/api/lanSync"

/**
 * 局域网同步配对确认弹窗（Teleport 到 body 顶层，任意页面可弹出）。
 * 待确认请求按队列逐条展示；单条请求 60 秒无响应自动按拒绝处理，
 * 与 Rust 侧 PAIR_CONFIRM_TIMEOUT 对齐。
 */
const props = defineProps<{ requests: LanSyncPairRequestPayload[] }>()
const emit = defineEmits<{ resolve: [payload: LanSyncPairRequestPayload, approved: boolean] }>()
useTranslation()

/** 确认窗口时长（秒），与桌面端 Rust 侧等待上限一致 */
const CONFIRM_SECONDS = 60
/** 当前展示的请求（队列首项） */
const current = computed(() => props.requests[0] ?? null)
/** 剩余确认秒数 */
const remain = ref(CONFIRM_SECONDS)
let timer: number | null = null

/**
 * 停止倒计时。
 */
function stopCountdown() {
    if (timer !== null) {
        window.clearInterval(timer)
        timer = null
    }
}

/**
 * 用户做出决定（或倒计时归零）：停止倒计时并上抛结果。
 */
function decide(approved: boolean) {
    stopCountdown()
    if (current.value) {
        emit("resolve", current.value, approved)
    }
}

// 请求切换（含队列推进）时重置并启动倒计时
watch(
    () => current.value?.requestId,
    () => {
        stopCountdown()
        if (!current.value) return
        remain.value = CONFIRM_SECONDS
        timer = window.setInterval(() => {
            remain.value -= 1
            if (remain.value <= 0) {
                // 超时按拒绝处理；Rust 侧此时也已超时，过期的应答会被忽略
                decide(false)
            }
        }, 1000)
    },
    { immediate: true }
)

onBeforeUnmount(stopCountdown)
</script>

<template>
    <Teleport to="body">
        <dialog class="modal" :class="{ 'modal-open': !!current }">
            <div
                v-if="current"
                class="modal-box w-96 rounded-xs border border-base-content/15 bg-base-100/85 p-0 shadow-lg backdrop-blur-md"
            >
                <!-- 设备图标 + 标题 -->
                <div class="flex flex-col items-center gap-2 px-5 pt-5">
                    <div class="flex size-14 items-center justify-center rounded-full bg-primary/15">
                        <Icon icon="ri:login-box-line" class="size-7 text-primary" />
                    </div>
                    <h3 class="text-sm font-semibold">{{ $t("setting.lanSyncPairRequest") }}</h3>
                </div>

                <!-- 请求设备与说明 -->
                <div class="px-5 py-3 text-center">
                    <p class="truncate font-mono text-base font-semibold text-primary">
                        {{ current.deviceName }}
                    </p>
                    <p class="mt-1 text-xs leading-relaxed text-base-content/60">
                        {{ $t("setting.lanSyncPairRequestBody", { name: current.deviceName }) }}
                    </p>
                </div>

                <!-- 倒计时进度条：60s 内未决定自动按拒绝处理 -->
                <div class="mx-5 h-1 overflow-hidden rounded-full bg-base-content/10">
                    <div
                        class="h-full bg-primary transition-all duration-1000 ease-linear"
                        :style="{ width: `${(remain / CONFIRM_SECONDS) * 100}%` }"
                    />
                </div>

                <!-- 决定按钮：点击遮罩不关闭，必须显式选择 -->
                <div class="flex items-center justify-between gap-2 p-4">
                    <span class="text-xs tabular-nums text-base-content/40">{{ remain }}s</span>
                    <div class="flex gap-2">
                        <button type="button" class="btn btn-ghost btn-sm" @click="decide(false)">
                            {{ $t("setting.lanSyncPairDeny") }}
                        </button>
                        <button type="button" class="btn btn-primary btn-sm" @click="decide(true)">
                            {{ $t("setting.lanSyncPairAllow") }}
                        </button>
                    </div>
                </div>
            </div>
            <div class="modal-backdrop" />
        </dialog>
    </Teleport>
</template>
