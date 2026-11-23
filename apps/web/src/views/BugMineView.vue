<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core"
import { useTranslation } from "i18next-vue"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import {
    environmentLabelKey,
    fetchBugAssetBlobUrl,
    getBug,
    getMyBugs,
    getSubmission,
    listReceiptSubmissions,
    publicationPolicyLabelKey,
    submissionStateLabelKey,
} from "@/api/bugs"
import type * as Types from "@/api/gen/api-types"
import { useAuthStore } from "@/store/auth"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { formatDateTime } from "@/utils/time"

const router = useRouter()
const auth = useAuthStore()
const user = useUserStore()
const ui = useUIStore()
const { t } = useTranslation()

const loading = ref(true)
const page = ref<Types.MyBugPage | null>(null)
/** 投票 / 订阅只返回 id，这里补一次标题，失败就回退展示 id。 */
const bugTitles = ref<Record<string, string>>({})
/** 本机保存过回执的匿名反馈（不依赖登录）。 */
const receiptSubmissions = ref<string[]>([])

/** 桌面端主从布局：左侧列表，右侧渲染选中反馈的主要内容。 */
const isDesktop = useMediaQuery("(min-width: 1024px)")
const selectedId = ref("")
const detail = ref<Types.SubmissionDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref("")
/** 私有原图的 blob URL（`<img>` 带不了鉴权头）。 */
const assetUrls = ref<Record<string, string>>({})
/** 只采纳最后一次详情请求的结果。 */
let detailSeq = 0

const submissions = computed(() => page.value?.submissions ?? [])
const voted = computed(() => Array.from(new Set(page.value?.votedBugIds ?? [])))
const subscribed = computed(() => Array.from(new Set(page.value?.subscribedBugIds ?? [])))
const versions = computed(() => (detail.value?.versions ?? []).slice().sort((a, b) => b.revision - a.revision))

/**
 * @description 拉取“我的提交 / 投票 / 订阅”；未登录时弹登录框并停在这里。
 */
async function load() {
    receiptSubmissions.value = listReceiptSubmissions()
    if (!user.jwtToken) {
        loading.value = false
        auth.requireLogin(t("bug-mine.login_hint"))
        return
    }
    loading.value = true
    try {
        const result = await getMyBugs()
        page.value = result ?? null
        const ids = Array.from(new Set([...voted.value, ...subscribed.value])).slice(0, 20)
        const details = await Promise.all(ids.map(id => getBug(id)))
        const titles: Record<string, string> = {}
        details.forEach((item, index) => {
            if (item.data?.bug?.title) titles[ids[index]] = item.data.bug.title
        })
        bugTitles.value = titles
    } catch (error) {
        ui.showErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
        loading.value = false
    }
}

/**
 * @description 释放已加载的原图 blob URL。
 */
function releaseAssets() {
    for (const url of Object.values(assetUrls.value)) URL.revokeObjectURL(url)
    assetUrls.value = {}
}

/**
 * @description 预取私有原图并转 blob URL；单张失败不阻塞，界面显示占位。
 */
async function loadAssets(data: Types.SubmissionDetail, seq: number) {
    for (const asset of data.assets ?? []) {
        try {
            const url = await fetchBugAssetBlobUrl(asset.assetId, { token: user.jwtToken ?? undefined })
            if (seq !== detailSeq) {
                URL.revokeObjectURL(url)
                return
            }
            assetUrls.value = { ...assetUrls.value, [asset.assetId]: url }
        } catch {
            // 单张失败保持占位
        }
    }
}

/**
 * @description 拉取选中反馈的详情与图片。
 */
async function loadDetail(submissionId: string) {
    if (!submissionId) return
    const seq = ++detailSeq
    detailLoading.value = true
    detailError.value = ""
    detail.value = null
    releaseAssets()
    try {
        const result = await getSubmission(submissionId, { token: user.jwtToken ?? undefined })
        if (seq !== detailSeq) return
        if (result.error) {
            detailError.value = result.error.message
            return
        }
        detail.value = result.data
        if (result.data) await loadAssets(result.data, seq)
    } finally {
        if (seq === detailSeq) detailLoading.value = false
    }
}

/**
 * @description 打开一条反馈：桌面端在右侧渲染，移动端走回执页。
 */
function openSubmission(submissionId: string) {
    if (isDesktop.value) {
        selectedId.value = submissionId
        return
    }
    void router.push({ name: "bug-submission", params: { submissionId } })
}

/**
 * @description 环境字段展示：字典内走译名，自由文本原样展示。
 */
function envText(value: string | null | undefined): string {
    const key = environmentLabelKey(value)
    return key ? t(key) : (value ?? "")
}

/**
 * @description 反馈状态徽章配色。
 */
function stateBadgeClass(state: string): string {
    switch (state) {
        case "processed":
            return "badge-success"
        case "failed":
        case "privacy_blocked":
            return "badge-error"
        case "needs_info":
        case "retry_wait":
            return "badge-warning"
        default:
            return "badge-ghost"
    }
}

/** 桌面端进入页面时自动选中第一条反馈。 */
watch(
    [isDesktop, submissions],
    () => {
        if (!isDesktop.value) return
        if (!selectedId.value && submissions.value.length) {
            selectedId.value = submissions.value[0]!.submissionId
        }
    },
    { immediate: true }
)

watch(selectedId, id => {
    void loadDetail(id)
})

onMounted(() => {
    void load()
})

onUnmounted(() => {
    detailSeq += 1
    releaseAssets()
})

watch(
    () => user.jwtToken,
    () => {
        void load()
    }
)
</script>

<template>
    <div class="flex h-full flex-col">
        <!-- 顶部标题行：kicker + 标题 + 入口按钮 -->
        <div class="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-content/15 px-4 py-3">
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">My Reports</p>
            <h1 class="text-[17px] font-semibold text-base-content">{{ $t("bug-mine.title") }}</h1>
            <span class="text-[11px] text-base-content/45">{{ $t("bug-mine.subtitle") }}</span>
            <div class="ml-auto flex items-center gap-2">
                <RouterLink to="/bugs" class="btn btn-xs">
                    <Icon icon="ri:bug-line" class="h-3.5 w-3.5" />
                    {{ $t("bug-list.title") }}
                </RouterLink>
                <RouterLink to="/bugs/new" class="btn btn-xs btn-primary">
                    <Icon icon="ri:add-line" class="h-3.5 w-3.5" />
                    {{ $t("bug.submit") }}
                </RouterLink>
            </div>
        </div>

        <div v-if="loading" class="flex flex-1 items-center justify-center">
            <span class="loading loading-spinner" />
        </div>
        <div v-else-if="!user.jwtToken" class="flex flex-1 flex-col items-center justify-center gap-3">
            <Icon icon="ri:user-line" class="h-8 w-8 text-base-content/25" />
            <p class="text-[12.5px] text-base-content/50">{{ $t("bug-mine.login_hint") }}</p>
            <LoginButton />
        </div>
        <div v-else class="flex min-h-0 flex-1">
            <!-- 左侧：我的提交 / 投票 / 关注 / 本机回执 -->
            <aside class="flex w-full shrink-0 flex-col border-r border-base-content/10 lg:w-80 xl:w-96">
                <ScrollArea class="min-h-0 flex-1">
                    <div class="space-y-4 p-3">
                        <section>
                            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/55">{{ $t("bug-mine.my_submissions") }}</p>
                            <p v-if="submissions.length === 0" class="text-[11.5px] text-base-content/35">{{ $t("bug-mine.no_submissions") }}</p>
                            <div class="space-y-1.5">
                                <button
                                    v-for="item in submissions"
                                    :key="item.submissionId"
                                    type="button"
                                    class="group relative w-full overflow-hidden rounded-xs border p-2.5 text-left transition-colors duration-150"
                                    :class="
                                        selectedId === item.submissionId
                                            ? 'dbm-item-active border-primary/70 bg-primary/10'
                                            : 'border-base-content/15 bg-base-100/60 backdrop-blur-sm hover:border-primary/50'
                                    "
                                    @click="openSubmission(item.submissionId)"
                                >
                                    <span
                                        class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-150"
                                        :class="selectedId === item.submissionId ? 'opacity-100' : 'opacity-0'"
                                        aria-hidden="true"
                                    />
                                    <div class="flex items-center gap-2">
                                        <span class="badge badge-xs" :class="stateBadgeClass(item.state)">
                                            {{ $t(submissionStateLabelKey(item.state)) }}
                                        </span>
                                        <span class="font-orbitron text-[10.5px] text-base-content/35">rev.{{ item.revision }}</span>
                                        <span class="ml-auto text-[10.5px] text-base-content/35">{{ formatDateTime(item.createdAt) }}</span>
                                    </div>
                                    <div class="mt-1 flex items-center gap-1.5 text-[11px] text-base-content/45">
                                        <span class="truncate font-mono">{{ item.submissionId }}</span>
                                        <span v-if="item.bugIds?.length" class="shrink-0">
                                            · {{ $t("bug.related_bugs") }} {{ item.bugIds.length }}
                                        </span>
                                    </div>
                                </button>
                            </div>
                        </section>

                        <section>
                            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/55">{{ $t("bug-mine.my_votes") }}</p>
                            <p v-if="voted.length === 0" class="text-[11.5px] text-base-content/35">{{ $t("bug-mine.no_votes") }}</p>
                            <div class="space-y-1">
                                <RouterLink
                                    v-for="bugId in voted"
                                    :key="bugId"
                                    :to="{ name: 'bug-detail', params: { bugId } }"
                                    class="flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5 text-[11.5px] transition-colors duration-150 hover:border-primary/40"
                                >
                                    <Icon icon="ri:thumb-up-line" class="h-3.5 w-3.5 shrink-0 text-primary/70" />
                                    <span class="truncate">{{ bugTitles[bugId] || bugId }}</span>
                                </RouterLink>
                            </div>
                        </section>

                        <section>
                            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/55">{{ $t("bug-mine.my_subscriptions") }}</p>
                            <p v-if="subscribed.length === 0" class="text-[11.5px] text-base-content/35">{{ $t("bug-mine.no_subscriptions") }}</p>
                            <div class="space-y-1">
                                <RouterLink
                                    v-for="bugId in subscribed"
                                    :key="bugId"
                                    :to="{ name: 'bug-detail', params: { bugId } }"
                                    class="flex items-center gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1.5 text-[11.5px] transition-colors duration-150 hover:border-primary/40"
                                >
                                    <Icon icon="ri:notification-3-line" class="h-3.5 w-3.5 shrink-0 text-base-content/50" />
                                    <span class="truncate">{{ bugTitles[bugId] || bugId }}</span>
                                </RouterLink>
                            </div>
                        </section>

                        <section>
                            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/55">{{ $t("bug-mine.local_receipts") }}</p>
                            <p class="mb-1.5 text-[10.5px] text-base-content/35">{{ $t("bug-mine.local_receipts_hint") }}</p>
                            <p v-if="receiptSubmissions.length === 0" class="text-[11.5px] text-base-content/35">
                                {{ $t("bug-mine.no_local_receipts") }}
                            </p>
                            <div class="flex flex-wrap gap-1.5">
                                <RouterLink
                                    v-for="submissionId in receiptSubmissions"
                                    :key="submissionId"
                                    :to="{ name: 'bug-submission', params: { submissionId } }"
                                    class="badge badge-outline badge-sm font-mono"
                                >
                                    {{ submissionId }}
                                </RouterLink>
                            </div>
                        </section>
                    </div>
                </ScrollArea>
            </aside>

            <!-- 右侧：选中反馈的主要内容（桌面端） -->
            <div class="hidden min-w-0 flex-1 flex-col lg:flex">
                <ScrollArea class="min-h-0 flex-1">
                    <div class="p-4">
                        <div v-if="detailLoading" class="flex h-40 items-center justify-center">
                            <span class="loading loading-spinner" />
                        </div>
                        <div v-else-if="detailError" class="flex h-40 items-center justify-center text-[12px] text-error">
                            {{ detailError }}
                        </div>
                        <div
                            v-else-if="!detail"
                            class="flex h-52 flex-col items-center justify-center gap-2 text-base-content/45"
                        >
                            <Icon icon="ri:file-list-line" class="h-8 w-8 opacity-40" />
                            <p class="text-[12.5px]">{{ $t("bug-mine.select_hint") }}</p>
                        </div>
                        <div v-else class="space-y-4">
                            <!-- 摘要头 -->
                            <header class="relative border-b-2 border-primary pb-3">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="badge badge-sm" :class="stateBadgeClass(detail.submission.state)">
                                        {{ $t(submissionStateLabelKey(detail.submission.state)) }}
                                    </span>
                                    <CopyID :id="detail.submission.submissionId" />
                                    <span class="font-orbitron text-[11px] text-base-content/40">
                                        rev.{{ detail.submission.currentRevision }}
                                    </span>
                                    <span class="ml-auto text-[11px] text-base-content/40">
                                        {{ formatDateTime(detail.submission.createdAt) }}
                                    </span>
                                </div>
                                <p v-if="detail.submission.anonymous" class="mt-1 text-[10.5px] text-base-content/35">
                                    {{ $t("bug.receipt_token_hint") }}
                                </p>
                            </header>

                            <!-- 原始反馈：按版本倒序，最新补充在最上面 -->
                            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                                <SectionHeader no-animate compact kicker="CONTENT" :title="$t('bug-submission.original')" />
                                <div class="space-y-2">
                                    <div
                                        v-for="version in versions"
                                        :key="version.revision"
                                        class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                                    >
                                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-base-content/40">
                                            <span class="font-orbitron">rev.{{ version.revision }}</span>
                                            <span>{{ $t(publicationPolicyLabelKey(version.publicationPolicy)) }}</span>
                                            <span v-if="version.context?.platform">· {{ version.context.platform }}</span>
                                            <span v-if="version.context?.region">· {{ envText(version.context.region) }}</span>
                                            <span v-if="version.context?.gameVersion">· v{{ version.context.gameVersion }}</span>
                                            <span v-if="version.context?.frequency">· {{ envText(version.context.frequency) }}</span>
                                            <span class="ml-auto">{{ formatDateTime(version.createdAt) }}</span>
                                        </div>
                                        <pre
                                            class="mt-1.5 whitespace-pre-wrap wrap-break-word font-sans text-[12.5px] leading-relaxed text-base-content/80"
                                        >{{ version.text || $t("bug.text_empty") }}</pre>
                                    </div>
                                </div>
                            </section>

                            <!-- 图片 -->
                            <section
                                v-if="detail.assets?.length"
                                class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                            >
                                <SectionHeader no-animate compact kicker="IMAGES" :title="$t('bug.evidence_image')" />
                                <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    <div
                                        v-for="asset in detail.assets"
                                        :key="asset.assetId"
                                        class="overflow-hidden rounded-xs border border-base-content/10"
                                    >
                                        <img
                                            v-if="assetUrls[asset.assetId]"
                                            :src="assetUrls[asset.assetId]"
                                            alt=""
                                            class="h-28 w-full object-cover"
                                        />
                                        <div
                                            v-else
                                            class="flex h-28 items-center justify-center bg-base-content/3 text-[10.5px] text-base-content/35"
                                        >
                                            {{ $t("bug.image_pending") }}
                                        </div>
                                        <div class="flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-base-content/40">
                                            <span v-if="asset.width">{{ asset.width }}×{{ asset.height }}</span>
                                            <span class="ml-auto font-mono">{{ Math.round(asset.bytes / 1024) }} KB</span>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <!-- 关联 BUG -->
                            <section
                                v-if="detail.bugIds?.length"
                                class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                            >
                                <SectionHeader no-animate compact kicker="BUGS" :title="$t('bug.related_bugs')" />
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <RouterLink
                                        v-for="bugId in detail.bugIds"
                                        :key="bugId"
                                        :to="{ name: 'bug-detail', params: { bugId } }"
                                        class="badge badge-outline badge-sm font-orbitron"
                                    >
                                        {{ bugId }}
                                    </RouterLink>
                                </div>
                            </section>

                            <div class="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    class="btn btn-xs"
                                    @click="router.push({ name: 'bug-submission', params: { submissionId: detail.submission.submissionId } })"
                                >
                                    <Icon icon="ri:arrow-right-up-line" class="h-3.5 w-3.5" />
                                    {{ $t("bug.view_receipt") }}
                                </button>
                                <span class="text-[10.5px] text-base-content/35">{{ $t("bug-submission.add_revision_hint") }}</span>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </div>
        </div>
    </div>
</template>
