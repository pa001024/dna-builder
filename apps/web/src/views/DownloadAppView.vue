<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import Icon from "@/components/Icon.vue"
import QrCodeStyled from "@/components/QrCodeStyled.vue"
import { env } from "@/env"
import {
    type ApkReleaseInfo,
    AUTO_DOWNLOAD_SECONDS,
    canInstallApk,
    DESKTOP_DOWNLOAD_URL,
    DOWNLOAD_PAGE_URL,
    detectClientPlatform,
    fetchApkRelease,
    formatFileSize,
    formatReleaseDate,
    isWeChatBrowser,
    triggerApkDownload,
} from "@/utils/app-download"

// 预渲染（SSG）时没有 navigator，按桌面端渲染「Windows 下载 + 二维码」的版本，
// 也正是想让搜索引擎与首次到访的访客先看到的内容。
const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent
const maxTouchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints || 0

// 桌面端（Tauri）为了兼容游戏内页面把 UA 伪装成 Android，这里按运行环境优先判定
const platform = env.isApp ? "desktop" : detectClientPlatform(userAgent, maxTouchPoints)
/** 是否桌面端：展示二维码，不自动下载 */
const isDesktop = platform === "desktop"
/** 是否可安装 APK 的移动端：直接下载，不展示二维码 */
const canInstall = canInstallApk(platform)
/** 二维码内容：下载页自身地址，扫码后在手机上继续走本页的下载流程 */
const pageUrl = DOWNLOAD_PAGE_URL

const release = ref<ApkReleaseInfo | null>(null)
const loading = ref(true)
const loadFailed = ref(false)
/** 距离自动下载开始还有几秒 */
const countdown = ref(AUTO_DOWNLOAD_SECONDS)
/** 是否已触发过下载 */
const started = ref(false)
/** 微信内置浏览器的「用浏览器打开」引导层 */
const showWechatGuide = ref(isWeChatBrowser(userAgent))

let countdownTimer: ReturnType<typeof setInterval> | null = null

/** 倒计时进度（0–100） */
const countdownProgress = computed(() => ((AUTO_DOWNLOAD_SECONDS - countdown.value) / AUTO_DOWNLOAD_SECONDS) * 100)
const sizeText = computed(() => formatFileSize(release.value?.size ?? 0))
const versionText = computed(() => (release.value ? `v${release.value.version}` : "-"))
const dateText = computed(() => (release.value?.builtAt ? formatReleaseDate(release.value.builtAt) : "-"))
/** 应用信息行（应用商店式「标签 - 值」列表，值为 download.* 键时走 i18n） */
const infoRows = computed(() => [
    { label: "download.version", value: versionText.value },
    { label: "download.size", value: sizeText.value },
    { label: "download.publishedAt", value: dateText.value },
    { label: "download.platformLabel", value: "Android" },
    { label: "download.priceLabel", value: "download.priceValue" },
    { label: "download.developerLabel", value: "download.developerValue" },
])

/**
 * 停止倒计时计时器。
 */
function clearCountdownTimer(): void {
    if (countdownTimer !== null) {
        clearInterval(countdownTimer)
        countdownTimer = null
    }
}

/**
 * 立即触发一次下载（同时终止倒计时）。
 */
function startDownload(): void {
    clearCountdownTimer()
    if (!release.value) {
        return
    }
    triggerApkDownload(release.value.url)
    started.value = true
}

/**
 * 启动自动下载倒计时：移动端拿到安装包地址后 3 秒自动开始下载。
 */
function startCountdown(): void {
    clearCountdownTimer()
    countdown.value = AUTO_DOWNLOAD_SECONDS
    countdownTimer = setInterval(() => {
        countdown.value -= 1
        if (countdown.value <= 0) {
            startDownload()
        }
    }, 1000)
}

/**
 * 拉取最新安装包信息。
 * 移动端在拿到地址后自动倒计时下载；桌面端只展示信息与二维码，不自动下载。
 */
async function loadRelease(): Promise<void> {
    loading.value = true
    loadFailed.value = false
    clearCountdownTimer()
    try {
        release.value = await fetchApkRelease()
        if (canInstall && !showWechatGuide.value) {
            startCountdown()
        }
    } catch (error) {
        console.error("获取安装包信息失败", error)
        release.value = null
        loadFailed.value = true
    } finally {
        loading.value = false
    }
}

/**
 * 重试拉取安装包信息。
 */
function retry(): void {
    void loadRelease()
}

/**
 * 关闭微信引导层：关掉后按普通移动端流程走（继续自动下载）。
 */
function dismissWechatGuide(): void {
    showWechatGuide.value = false
    if (!release.value && !loading.value) {
        void loadRelease()
        return
    }
    if (release.value && canInstall && !started.value) {
        startCountdown()
    }
}

onMounted(() => {
    void loadRelease()
})

onBeforeUnmount(() => {
    clearCountdownTimer()
})
</script>

<template>
    <div class="h-full overflow-y-auto">
        <div class="mx-auto w-full max-w-2xl pb-6">
            <!-- 应用头：图标 + 名称 + 简介 + 标签（应用商店式） -->
            <header class="flex items-start gap-4 px-4 pt-5 pb-4">
                <img
                    src="/app-icon.png"
                    alt="DNA Builder"
                    class="size-23 shrink-0 rounded-[22px] border border-base-content/10 object-cover shadow-lg"
                />
                <div class="flex min-w-0 flex-1 flex-col">
                    <h1 class="truncate text-[21px] leading-tight font-bold text-base-content">DOB Mobile</h1>
                    <p class="mt-1 text-[13px] leading-snug text-base-content/55">{{ $t("download.subtitle") }}</p>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span class="rounded-full bg-base-content/6 px-2 py-0.5 font-medium text-base-content/60">{{
                            $t("download.tagFree")
                        }}</span>
                        <span class="rounded-full bg-base-content/6 px-2 py-0.5 font-medium text-base-content/60">Android</span>
                    </div>
                </div>
            </header>

            <!-- 主操作：按访问端互斥。移动端页内直接下载（3 秒倒计时）；桌面端下载 APK / Windows 版并在下方展示二维码 -->
            <div class="px-4">
                <template v-if="canInstall">
                    <button
                        class="btn btn-primary h-11 w-full rounded-full text-[15px] font-semibold shadow-sm"
                        :disabled="loading || !release"
                        @click="startDownload"
                    >
                        <span v-if="loading" class="loading loading-spinner loading-sm" />
                        <Icon v-else icon="ri:download-2-line" class="text-base" />
                        {{ started ? $t("download.downloadAgain") : $t("download.getApp") }}
                        <span v-if="!started && sizeText !== '-'" class="font-normal opacity-80">· {{ sizeText }}</span>
                    </button>
                    <p class="mt-2 text-center text-[12px] text-base-content/55">
                        <template v-if="started">{{ $t("download.started") }}</template>
                        <!-- 微信引导层挡在前面时倒计时不会启动，这里不显示倒计时文案，避免"倒计时没动"的误会 -->
                        <template v-else-if="release && !showWechatGuide">
                            <span class="font-orbitron font-semibold text-primary tabular-nums">{{ Math.max(0, countdown) }}</span>
                            {{ $t("download.countdownUnit") }}
                        </template>
                        <template v-else>{{ $t("download.autoStartHint") }}</template>
                    </p>
                    <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-base-content/8">
                        <div
                            class="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
                            :style="{ width: `${Math.max(0, countdownProgress)}%` }"
                        />
                    </div>
                </template>

                <!-- 桌面端：强调色给"下载 APK"（手机版安装包直链），Windows 版用非强调色放在右侧 -->
                <div v-else-if="isDesktop" class="flex flex-wrap items-center gap-2">
                    <a v-if="release" class="btn btn-primary h-11 flex-1 rounded-full text-[15px] font-semibold shadow-sm" :href="release.url">
                        <Icon icon="ri:download-2-line" class="text-base" />
                        {{ $t("download.getApk") }}
                        <span class="font-normal opacity-80">· {{ sizeText }}</span>
                    </a>
                    <button v-else class="btn btn-primary h-11 flex-1 rounded-full text-[15px] font-semibold" disabled>
                        <span v-if="loading" class="loading loading-spinner loading-sm" />
                        {{ $t("download.getApk") }}
                    </button>
                    <a class="btn btn-outline h-11 flex-1 rounded-full text-[15px]" :href="DESKTOP_DOWNLOAD_URL">
                        <Icon icon="ri:windows-fill" class="text-base" />
                        {{ $t("download.getDesktop") }}
                    </a>
                </div>

                <p v-else class="rounded-2xl bg-base-content/5 px-3 py-2.5 text-[12px] leading-relaxed text-base-content/60">
                    {{ $t("download.iosHint") }}
                </p>

                <p v-if="loadFailed" class="mt-2 flex items-center justify-center gap-2 text-[12px] text-error">
                    {{ $t("download.loadFailed") }}
                    <button class="btn btn-ghost btn-xs rounded-full" @click="retry">
                        <Icon icon="ri:refresh-line" class="text-xs" />
                        {{ $t("download.retry") }}
                    </button>
                </p>
            </div>

            <hr class="mx-4 my-4 border-base-content/8" />

            <!-- 应用信息 -->
            <section class="px-4">
                <h2 class="mb-2 text-[15px] font-semibold text-base-content">{{ $t("download.infoTitle") }}</h2>
                <dl class="overflow-hidden rounded-2xl border border-base-content/8 bg-base-100/60">
                    <div
                        v-for="row in infoRows"
                        :key="row.label"
                        class="flex items-center justify-between gap-3 border-b border-base-content/8 px-3.5 py-2.5 last:border-b-0"
                    >
                        <dt class="text-[13px] text-base-content/55">{{ $t(row.label) }}</dt>
                        <dd class="truncate text-[13px] font-medium text-base-content">
                            {{ row.value.startsWith("download.") ? $t(row.value) : row.value }}
                        </dd>
                    </div>
                </dl>
            </section>

            <!-- 手机扫码安装：仅桌面端（移动端在页内直接下载，不展示二维码） -->
            <section v-if="isDesktop" class="px-4 pt-4">
                <h2 class="mb-2 text-[15px] font-semibold text-base-content">{{ $t("download.scanTitle") }}</h2>
                <div class="flex items-center gap-4 rounded-2xl border border-base-content/8 bg-base-100/60 p-4">
                    <QrCodeStyled :value="pageUrl" :size="136" :caption="$t('download.scanCaption')" />
                    <p class="min-w-0 flex-1 text-[12px] leading-relaxed text-base-content/60">{{ $t("download.scanDesc") }}</p>
                </div>
            </section>

            <!-- 关于此应用 -->
            <section class="px-4 pt-4">
                <h2 class="mb-2 text-[15px] font-semibold text-base-content">{{ $t("download.aboutTitle") }}</h2>
                <div class="flex flex-col gap-3 rounded-2xl border border-base-content/8 bg-base-100/60 p-4">
                    <p class="text-[13px] leading-relaxed text-base-content/70">{{ $t("download.intro") }}</p>
                    <ul class="flex flex-col gap-2">
                        <li v-for="key in ['download.feature1', 'download.feature2', 'download.feature3']" :key="key" class="flex gap-2.5">
                            <Icon icon="ri:checkbox-circle-fill" class="mt-0.5 shrink-0 text-primary" />
                            <span class="text-[12.5px] leading-relaxed text-base-content/70">{{ $t(key) }}</span>
                        </li>
                    </ul>
                </div>
            </section>

            <!-- 更新内容：仅在拿到发布清单后展示 -->
            <section v-if="release?.notes" class="px-4 pt-4">
                <h2 class="mb-2 text-[15px] font-semibold text-base-content">{{ $t("download.notesTitle") }}</h2>
                <p
                    class="rounded-2xl border border-base-content/8 bg-base-100/60 p-4 text-[12.5px] leading-relaxed whitespace-pre-line text-base-content/70"
                >
                    {{ release.notes }}
                </p>
            </section>

            <!-- 安装提示 -->
            <section class="px-4 pt-4">
                <h2 class="mb-2 text-[15px] font-semibold text-base-content">{{ $t("download.tipsTitle") }}</h2>
                <ul class="flex flex-col gap-2 rounded-2xl border border-base-content/8 bg-base-100/60 p-4">
                    <li v-for="key in ['download.tipUnknownSource', 'download.tipStorage', 'download.tipIos']" :key="key" class="flex gap-2.5">
                        <Icon icon="ri:information-line" class="mt-0.5 shrink-0 text-base-content/35" />
                        <span class="text-[12.5px] leading-relaxed text-base-content/70">{{ $t(key, { size: sizeText }) }}</span>
                    </li>
                </ul>
            </section>

            <!-- Windows 桌面版：移动端访客看不到上面的桌面按钮，这里补一个入口 -->
            <section v-if="!isDesktop" class="px-4 pt-4">
                <div class="flex flex-col gap-3 rounded-2xl border border-base-content/8 bg-base-100/60 p-4">
                    <div class="flex items-center gap-2">
                        <Icon icon="ri:windows-fill" class="text-lg text-base-content/60" />
                        <h2 class="text-[15px] font-semibold text-base-content">{{ $t("download.desktopCardTitle") }}</h2>
                    </div>
                    <p class="text-[12.5px] leading-relaxed text-base-content/60">{{ $t("download.desktopCardDesc") }}</p>
                    <a class="btn btn-outline h-10 self-start rounded-full px-5 text-[13px]" :href="DESKTOP_DOWNLOAD_URL">
                        {{ $t("download.desktopAction") }}
                    </a>
                </div>
            </section>
        </div>

        <!-- 微信内置浏览器引导：指向右上角的「···」 -->
        <div v-if="showWechatGuide" class="fixed inset-0 z-50 flex flex-col bg-black/75 p-5 backdrop-blur-sm">
            <div class="flex flex-col items-end gap-2 self-end text-right text-white">
                <Icon icon="ri:arrow-right-up-line" class="animate-bounce text-5xl" />
                <p class="text-sm font-semibold">{{ $t("download.wechatStep1") }}</p>
            </div>

            <div class="mt-auto flex flex-col gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-white">
                <p class="text-base font-semibold">{{ $t("download.wechatTitle") }}</p>
                <ol class="flex flex-col gap-1.5 text-[13px] leading-relaxed text-white/85">
                    <li>1. {{ $t("download.wechatStep1") }}</li>
                    <li>2. {{ $t("download.wechatStep2") }}</li>
                </ol>
                <p class="text-[12px] text-white/60">{{ $t("download.wechatNote") }}</p>
                <button class="btn btn-primary btn-sm self-start rounded-full px-5" @click="dismissWechatGuide">
                    {{ $t("download.wechatConfirm") }}
                </button>
            </div>
        </div>
    </div>
</template>
