<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, onUnmounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
    addBugRevision,
    type BugCredential,
    fetchBugAssetBlobUrl,
    getReceiptToken,
    getSubmission,
    isSubmissionTerminal,
    publicationPolicyLabelKey,
    setReceiptToken,
    submissionStateLabelKey,
} from "@/api/bugs"
import type * as Types from "@/api/gen/api-types"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { formatDateTime } from "@/utils/time"

const route = useRoute()
const router = useRouter()
const ui = useUIStore()
const user = useUserStore()
const { t } = useTranslation()

const submissionId = computed(() => String(route.params.submissionId ?? ""))
const detail = ref<Types.SubmissionDetail | null>(null)
const loading = ref(true)
const errorMessage = ref("")
const assetUrls = ref<Record<string, string>>({})
const tokenInput = ref("")
const revisionText = ref("")
const submittingRevision = ref(false)
/** 本机回执：服务端不返回回执本身，只能从 localStorage 或手输恢复。 */
const receiptToken = ref<string | null>(getReceiptToken(submissionId.value))

const versions = computed(() => (detail.value?.versions ?? []).slice().sort((a, b) => b.revision - a.revision))
const associatedBugIds = computed(() => Array.from(new Set(detail.value?.bugIds ?? [])))
/** 没有可展示详情且没有错误时（无凭据 / 非本人），先去解锁。 */
const needsUnlock = computed(() => !detail.value && !errorMessage.value)

let pollTimer: ReturnType<typeof setTimeout> | undefined
let pollDelay = 5_000

/**
 * @description 当前身份：登录优先，匿名用回执；供 REST 图片请求使用。
 */
function credential(): BugCredential | undefined {
    if (user.jwtToken) return { token: user.jwtToken }
    if (receiptToken.value) return { receiptToken: receiptToken.value }
    return undefined
}

/**
 * @description 拉取反馈详情；静默刷新不闪 loading。
 */
async function load(silent = false) {
    if (!silent) loading.value = true
    try {
        const result = await getSubmission(submissionId.value, credential())
        if (result.error) {
            errorMessage.value = result.error.message
            detail.value = null
            return
        }
        errorMessage.value = ""
        detail.value = result.data
        if (result.data) {
            await loadAssets(result.data)
            schedulePoll(result.data.submission.state)
        }
    } finally {
        loading.value = false
    }
}

/**
 * @description 预取私有原图并转 blob URL：`<img>` 带不了鉴权头。
 */
async function loadAssets(data: Types.SubmissionDetail) {
    for (const asset of data.assets ?? []) {
        if (assetUrls.value[asset.assetId]) continue
        try {
            assetUrls.value[asset.assetId] = await fetchBugAssetBlobUrl(asset.assetId, credential())
        } catch {
            // 单张失败不阻塞页面，界面显示占位
        }
    }
}

/**
 * @description 未结束的反馈按 5s 起、逐步退避到 30s 的节奏轮询；页面隐藏时暂停。
 */
function schedulePoll(state: string) {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = undefined
    if (isSubmissionTerminal(state)) return
    pollTimer = setTimeout(
        () => {
            if (document.visibilityState === "hidden") {
                schedulePoll(state)
                return
            }
            void load(true)
        },
        Math.max(5_000, pollDelay)
    )
    pollDelay = Math.min(30_000, Math.round(pollDelay * 1.6))
}

/**
 * @description 手输回执解锁；成功后落盘并重新拉取。
 */
async function unlock() {
    const token = tokenInput.value.trim()
    if (!token) return
    const result = await getSubmission(submissionId.value, { receiptToken: token })
    if (result.error) {
        ui.showErrorMessage(result.error.message)
        return
    }
    if (!result.data) {
        ui.showErrorMessage(t("bug.receipt_invalid"))
        return
    }
    setReceiptToken(submissionId.value, token)
    receiptToken.value = token
    tokenInput.value = ""
    pollDelay = 5_000
    await load()
}

/**
 * @description 追加一条版本（补充文字证据），匿名用回执、登录用 JWT。
 */
async function submitRevision() {
    if (!revisionText.value.trim()) return
    submittingRevision.value = true
    try {
        const result = await addBugRevision(
            submissionId.value,
            {
                text: revisionText.value.trim(),
                publicationPolicy: "INTERNAL_ONLY",
                context: { gameId: detail.value?.submission.gameId ?? "" },
            },
            { credential: credential() }
        )
        if (result.error) {
            ui.showErrorMessage(result.error.message)
            return
        }
        revisionText.value = ""
        ui.showSuccessMessage(t("bug.revision_success"))
        await load(true)
    } finally {
        submittingRevision.value = false
    }
}

function handleVisibilityChange() {
    if (document.visibilityState !== "visible" || !detail.value) return
    if (isSubmissionTerminal(detail.value.submission.state)) return
    pollDelay = 5_000
    void load(true)
}

onMounted(() => {
    void load()
    document.addEventListener("visibilitychange", handleVisibilityChange)
})

onUnmounted(() => {
    if (pollTimer) clearTimeout(pollTimer)
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    for (const url of Object.values(assetUrls.value)) URL.revokeObjectURL(url)
})
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="border-b border-base-200 bg-base-300/50 p-4 backdrop-blur-sm">
            <div class="flex items-center gap-2">
                <button class="btn btn-ghost btn-xs" @click="router.back()">
                    <Icon icon="ri:arrow-left-s-line" class="h-4 w-4" />
                    {{ $t("bug.back") }}
                </button>
                <div class="min-w-0">
                    <div class="text-base font-bold">{{ $t("bug-submission.title") }}</div>
                    <div class="truncate font-orbitron text-[11px] text-base-content/40">{{ submissionId }}</div>
                </div>
                <span v-if="detail" class="badge badge-sm badge-outline ml-auto">{{ $t(submissionStateLabelKey(detail.submission.state)) }}</span>
            </div>
        </div>

        <ScrollArea class="flex-1">
            <div v-if="loading" class="flex h-40 items-center justify-center">
                <span class="loading loading-spinner" />
            </div>
            <div v-else-if="needsUnlock" class="mx-auto mt-10 w-full max-w-md">
                <div class="card bg-base-100 shadow-lg">
                    <div class="card-body gap-3 p-5">
                        <h2 class="card-title text-sm">{{ $t("bug-submission.unlock_title") }}</h2>
                        <p class="text-[12px] text-base-content/55">{{ $t("bug-submission.unlock_hint") }}</p>
                        <input
                            v-model="tokenInput"
                            type="text"
                            :placeholder="$t('bug-submission.receipt_placeholder')"
                            class="input input-bordered w-full font-mono text-[12px]"
                            @keyup.enter="unlock"
                        />
                        <p v-if="errorMessage" class="text-[11.5px] text-error">{{ errorMessage }}</p>
                        <div class="flex justify-end gap-2">
                            <LoginButton variant="outline" size="sm" />
                            <button class="btn btn-primary btn-sm" @click="unlock">{{ $t("bug-submission.unlock") }}</button>
                        </div>
                    </div>
                </div>
            </div>
            <div v-else-if="!detail" class="flex h-40 flex-col items-center justify-center gap-2 text-base-content/45">
                <Icon icon="ri:error-warning-line" class="h-7 w-7 opacity-50" />
                <p class="text-[12.5px]">{{ errorMessage || $t("bug.submission_not_found") }}</p>
            </div>
            <div v-else class="space-y-4 p-4">
                <section class="card bg-base-100 shadow-lg">
                    <div class="card-body gap-2 p-4">
                        <div class="flex flex-wrap items-center gap-2">
                            <h2 class="card-title text-sm">{{ $t("bug-submission.processing") }}</h2>
                            <span class="badge badge-sm" :class="isSubmissionTerminal(detail.submission.state) ? 'badge-ghost' : 'badge-primary'">
                                {{ $t(submissionStateLabelKey(detail.submission.state)) }}
                            </span>
                            <span class="ml-auto text-[11px] text-base-content/35">{{ formatDateTime(detail.submission.createdAt) }}</span>
                        </div>
                        <p class="text-[12px] text-base-content/55">{{ $t(`bug.submission_state_hint.${detail.submission.state}`, "") }}</p>
                        <div class="flex flex-wrap items-center gap-3 text-[11px] text-base-content/45">
                            <span>{{ $t("bug.game_id") }}: {{ detail.submission.gameId }}</span>
                            <span>{{ $t("bug.revision") }}: {{ detail.submission.currentRevision }}</span>
                            <span v-if="detail.submission.retentionUntil">{{ $t("bug.retention_until") }}: {{ formatDateTime(detail.submission.retentionUntil) }}</span>
                        </div>
                        <div v-if="associatedBugIds.length" class="mt-1">
                            <div class="text-[11px] text-base-content/45">{{ $t("bug.related_bugs") }}</div>
                            <div class="mt-1 flex flex-wrap gap-1.5">
                                <RouterLink
                                    v-for="bugId in associatedBugIds"
                                    :key="bugId"
                                    :to="{ name: 'bug-detail', params: { bugId } }"
                                    class="badge badge-outline badge-sm font-orbitron"
                                >
                                    {{ bugId }}
                                </RouterLink>
                            </div>
                        </div>
                        <p v-if="!isSubmissionTerminal(detail.submission.state)" class="text-[10.5px] text-base-content/35">
                            {{ $t("bug.polling_hint") }}
                        </p>
                    </div>
                </section>

                <section class="card bg-base-100 shadow-lg">
                    <div class="card-body gap-3 p-4">
                        <h2 class="card-title text-sm">{{ $t("bug-submission.original") }}</h2>
                        <div v-for="version in versions" :key="version.revision" class="rounded-lg border border-base-content/10 p-3">
                            <div class="flex flex-wrap items-center gap-2 text-[11px] text-base-content/45">
                                <span class="font-orbitron">rev.{{ version.revision }}</span>
                                <span>{{ $t(publicationPolicyLabelKey(version.publicationPolicy)) }}</span>
                                <span v-if="version.context?.platform">· {{ version.context.platform }}</span>
                                <span v-if="version.context?.gameVersion">· v{{ version.context.gameVersion }}</span>
                                <span class="ml-auto">{{ formatDateTime(version.createdAt) }}</span>
                            </div>
                            <pre class="mt-2 whitespace-pre-wrap wrap-break-word font-sans text-[12.5px] leading-relaxed text-base-content/80">{{ version.text || $t("bug.text_empty") }}</pre>
                        </div>

                        <div v-if="detail.assets?.length" class="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <div v-for="asset in detail.assets" :key="asset.assetId" class="overflow-hidden rounded-lg border border-base-content/10">
                                <img
                                    v-if="assetUrls[asset.assetId]"
                                    :src="assetUrls[asset.assetId]"
                                    :alt="$t('bug.evidence_image')"
                                    class="h-32 w-full object-cover"
                                />
                                <div v-else class="flex h-32 items-center justify-center text-[11px] text-base-content/35">
                                    {{ $t("bug.image_pending") }}
                                </div>
                                <div class="flex items-center gap-1.5 px-2 py-1 text-[10px] text-base-content/40">
                                    <span>{{ asset.mime }}</span>
                                    <span v-if="asset.width && asset.height">{{ asset.width }}×{{ asset.height }}</span>
                                    <span class="ml-auto">{{ asset.scanState }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="card bg-base-100 shadow-lg">
                    <div class="card-body gap-3 p-4">
                        <h2 class="card-title text-sm">{{ $t("bug-submission.add_revision") }}</h2>
                        <p class="text-[11.5px] text-base-content/45">{{ $t("bug-submission.add_revision_hint") }}</p>
                        <textarea
                            v-model="revisionText"
                            rows="3"
                            :placeholder="$t('bug-submission.add_revision_placeholder')"
                            class="textarea textarea-bordered w-full text-[12.5px]"
                        />
                        <div class="flex justify-end">
                            <button class="btn btn-primary btn-sm" :disabled="submittingRevision || !revisionText.trim()" @click="submitRevision">
                                {{ $t("bug.submit") }}
                            </button>
                        </div>
                    </div>
                </section>
            </div>
        </ScrollArea>
    </div>
</template>
