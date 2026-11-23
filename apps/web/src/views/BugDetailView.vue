<script setup lang="ts">
import DOMPurify from "dompurify"
import { useTranslation } from "i18next-vue"
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import {
    addBugComment,
    addFeedback,
    bugAssetContentUrl,
    categoryLabelKey,
    environmentLabelKey,
    fixStageLabelKey,
    getBug,
    getBugDiscussion,
    getBugRawSubmissions,
    getBugRelations,
    getBugTagRegistry,
    getMyBugs,
    relationLabelKey,
    setVote,
    severityBadgeClass,
    severityLabelKey,
    statusBadgeClass,
    statusLabelKey,
} from "@/api/bugs"
import type * as Types from "@/api/gen/api-types"
import { useAuthStore } from "@/store/auth"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { renderMarkdown } from "@/utils/markdown"
import { formatDateTime, formatRelativeTime } from "@/utils/time"

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUIStore()
const user = useUserStore()
const { t } = useTranslation()

const bugId = computed(() => String(route.params.bugId ?? ""))
const loading = ref(true)
const errorMessage = ref("")
const detail = ref<Types.PublicBugDetail | null>(null)
const discussion = ref<Types.DiscussionPage | null>(null)
const relations = ref<Types.BugRelation[]>([])
const registry = ref<Types.TagRegistry | null>(null)

const bug = computed(() => detail.value?.bug ?? null)
const evidence = computed(() => detail.value?.evidence ?? [])
const timeline = computed(() => (detail.value?.timeline ?? []).slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 12))

const voting = ref(false)
const voted = ref(false)
const submittingFeedback = ref(false)
const submittingComment = ref(false)
const feedbackText = ref("")
const feedbackResult = ref<Types.ReproductionResult | "">("")
const commentText = ref("")
/** 一次性回执弹窗：提交反馈后展示，凭据同时已在 localStorage 落盘。 */
const receiptInfo = ref<{ token: string; submissionId: string } | null>(null)

/**
 * @description 用户内容统一走 markdown-it（html:false）+ DOMPurify，禁止 v-html 直出原文。
 */
function render(text: string | null | undefined): string {
    if (!text) return ""
    return DOMPurify.sanitize(renderMarkdown(text))
}

/**
 * @description 标签译名：优先用注册表的 displayI18nKey，回退按命名空间推导。
 */
function tagLabel(tagKey: string): string {
    const definition = registry.value?.tags?.find(item => item.tagKey === tagKey)
    if (definition?.displayI18nKey) return t(definition.displayI18nKey)
    if (tagKey.startsWith("category.")) return t(categoryLabelKey(tagKey.slice("category.".length)))
    if (tagKey.startsWith("severity.")) return t(severityLabelKey(tagKey.slice("severity.".length)))
    return t(fixStageLabelKey(tagKey))
}

/**
 * @description 环境字段展示：字典内的值走译名，AI 抽取的自由文本原样展示。
 */
function envText(value: string | null | undefined): string {
    const key = environmentLabelKey(value)
    return key ? t(key) : (value ?? "")
}

/** 原始提交：默认折叠，展开时才单独请求（只有 `github_safe` 版本会返回）。 */
const rawOpen = ref(false)
const rawLoading = ref(false)
const rawError = ref("")
const rawSubmissions = ref<Types.RawSubmission[] | null>(null)

/**
 * @description 切换原始提交区块：首次展开时拉取，收起不重复请求。
 */
async function toggleRawSubmissions() {
    if (rawOpen.value) {
        rawOpen.value = false
        return
    }
    rawOpen.value = true
    if (rawSubmissions.value || rawLoading.value) return
    rawLoading.value = true
    rawError.value = ""
    const result = await getBugRawSubmissions(bugId.value)
    if (result.error) rawError.value = result.error.message
    else rawSubmissions.value = result.data ?? []
    rawLoading.value = false
}

/**
 * @description 事件类型译名，未登记的事件原样展示 kind。
 */
function eventLabel(kind: string): string {
    return t(`bug.event.${kind}`, kind)
}

/**
 * @description 关联里的“另一端” BUG id。
 */
function relationOther(relation: Types.BugRelation): string {
    return relation.sourceBugId === bugId.value ? relation.targetBugId : relation.sourceBugId
}

/**
 * @description 关联方向：当前 BUG 是 source 则出向，否则入向。
 */
function relationDirection(relation: Types.BugRelation): string {
    return relation.sourceBugId === bugId.value ? t("bug.relation.outgoing") : t("bug.relation.incoming")
}

/**
 * @description 拉取详情、讨论、关联与标签字典；标签字典失败不阻塞主内容。
 */
async function load() {
    loading.value = true
    errorMessage.value = ""
    const [detailResult, discussionResult, relationResult, registryResult] = await Promise.all([
        getBug(bugId.value),
        getBugDiscussion(bugId.value, 0, 50),
        getBugRelations(bugId.value),
        getBugTagRegistry(),
    ])
    loading.value = false
    if (detailResult.error || !detailResult.data) {
        errorMessage.value = detailResult.error?.message || t("bug.not_found")
        return
    }
    detail.value = detailResult.data
    discussion.value = discussionResult ?? null
    relations.value = relationResult ?? []
    registry.value = registryResult ?? null
    await loadMyVote()
}

/**
 * @description 登录用户才需要知道是否已投票；未登录直接视为未投票。
 */
async function loadMyVote() {
    if (!user.jwtToken) {
        voted.value = false
        return
    }
    const page = await getMyBugs()
    voted.value = Boolean(page?.votedBugIds?.includes(bugId.value))
}

/**
 * @description 切换投票；未登录先弹登录框。
 */
async function toggleVote() {
    if (!auth.requireLogin(t("bug.login_to_vote"))) return
    voting.value = true
    try {
        const result = await setVote(bugId.value, !voted.value)
        if (result.error) {
            ui.showErrorMessage(result.error.message)
            return
        }
        voted.value = Boolean(result.data.active)
        if (detail.value) {
            detail.value.bug.votes = result.data.votes
            detail.value.stats.votes = result.data.votes
            detail.value.stats.reporters = result.data.reporters
        }
    } finally {
        voting.value = false
    }
}

/**
 * @description 提交“我也遇到 / 此版本未遇到”反馈；匿名回执一次性展示后落盘。
 */
async function submitFeedback() {
    if (!feedbackText.value.trim() && !feedbackResult.value) {
        ui.showErrorMessage(t("bug.feedback_required"))
        return
    }
    submittingFeedback.value = true
    try {
        const result = await addFeedback(bugId.value, {
            text: feedbackText.value.trim() || undefined,
            reproductionResult: feedbackResult.value || undefined,
        })
        if (result.error) {
            ui.showErrorMessage(result.error.message)
            return
        }
        ui.showSuccessMessage(t("bug.feedback_success"))
        if (result.data.receiptToken) {
            receiptInfo.value = { token: result.data.receiptToken, submissionId: result.data.submissionId }
        }
        feedbackText.value = ""
        feedbackResult.value = ""
        discussion.value = (await getBugDiscussion(bugId.value, 0, 50, true)) ?? discussion.value
    } finally {
        submittingFeedback.value = false
    }
}

/**
 * @description 发表公开评论；匿名回执持有者请到回执页追加。
 */
async function submitComment() {
    if (!auth.requireLogin(t("bug.login_to_comment"))) return
    if (!commentText.value.trim()) return
    submittingComment.value = true
    try {
        const result = await addBugComment(bugId.value, commentText.value.trim())
        if (result.error) {
            ui.showErrorMessage(result.error.message)
            return
        }
        commentText.value = ""
        discussion.value = (await getBugDiscussion(bugId.value, 0, 50, true)) ?? discussion.value
    } finally {
        submittingComment.value = false
    }
}

onMounted(() => {
    void load()
})
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="border-b border-base-200 bg-base-300/50 p-4 backdrop-blur-sm">
            <div class="flex items-start gap-3">
                <button class="btn btn-ghost btn-xs mt-1" @click="router.back()">
                    <Icon icon="ri:arrow-left-s-line" class="h-4 w-4" />
                    {{ $t("bug.back") }}
                </button>
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="font-orbitron text-[11px] text-base-content/40">{{ bug?.displayKey || bugId }}</span>
                        <span v-if="bug" class="badge badge-sm" :class="severityBadgeClass(bug.severity)">
                            {{ $t(severityLabelKey(bug.severity)) }}
                        </span>
                        <span v-if="bug" class="badge badge-sm" :class="statusBadgeClass(bug.status)">
                            {{ $t(statusLabelKey(bug.status)) }}
                        </span>
                        <span v-if="bug" class="badge badge-outline badge-sm">{{ $t(categoryLabelKey(bug.primaryCategory)) }}</span>
                    </div>
                    <h1 class="mt-1 text-lg font-bold leading-snug">{{ bug?.title || $t("bug-detail.title") }}</h1>
                    <div v-if="bug" class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-base-content/45">
                        <span>{{ $t("bug.votes") }}: <b class="text-base-content/75">{{ bug.votes }}</b></span>
                        <span>{{ $t("bug.reporters") }}: <b class="text-base-content/75">{{ bug.reporters }}</b></span>
                        <span>{{ $t("bug.occurrences") }}: <b class="text-base-content/75">{{ bug.occurrences }}</b></span>
                        <span>{{ $t("bug.created_at") }}: {{ formatDateTime(bug.createdAt) }}</span>
                        <span v-if="bug.lastActivityAt">{{ $t("bug.last_activity") }}: {{ formatRelativeTime(bug.lastActivityAt) }}</span>
                    </div>
                </div>
                <div v-if="bug" class="flex shrink-0 flex-col items-end gap-2">
                    <button class="btn btn-sm" :class="voted ? 'btn-primary' : 'btn-outline'" :disabled="voting" @click="toggleVote">
                        <Icon icon="ri:thumb-up-line" class="h-4 w-4" />
                        {{ voted ? $t("bug.voted") : $t("bug.vote") }}
                    </button>
                    <a
                        v-if="bug?.githubIssue?.htmlUrl"
                        :href="bug.githubIssue.htmlUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="link link-hover inline-flex items-center gap-1 text-[11px] text-base-content/55"
                    >
                        <Icon icon="ri:git-pull-request-line" class="h-3.5 w-3.5" />
                        {{ $t("bug.github_issue") }} #{{ bug.githubIssue.issueNumber }}
                    </a>
                </div>
            </div>
        </div>

        <ScrollArea class="flex-1">
            <div v-if="loading" class="flex h-40 items-center justify-center">
                <span class="loading loading-spinner" />
            </div>
            <div v-else-if="errorMessage" class="flex h-40 flex-col items-center justify-center gap-2 text-base-content/45">
                <Icon icon="ri:error-warning-line" class="h-7 w-7 opacity-50" />
                <p class="text-[12.5px]">{{ errorMessage }}</p>
                <RouterLink to="/bugs" class="btn btn-ghost btn-sm">{{ $t("bug-list.title") }}</RouterLink>
            </div>
            <div v-else-if="bug" class="grid grid-cols-1 gap-4 p-4 xl:grid-cols-3">
                <div class="space-y-4 xl:col-span-2">
                    <section class="card bg-base-100 shadow-lg">
                        <div class="card-body gap-3 p-4">
                            <h2 class="card-title text-sm">{{ $t("bug-detail.summary") }}</h2>
                            <div class="safe-html text-[13px] leading-relaxed text-base-content/85" v-html="render(bug.summary)" />
                            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div class="rounded-lg bg-base-200/50 p-3">
                                    <div class="text-[11px] font-bold text-base-content/50">{{ $t("bug.expected") }}</div>
                                    <div class="safe-html mt-1 text-[12.5px] text-base-content/80" v-html="render(bug.expected)" />
                                </div>
                                <div class="rounded-lg bg-base-200/50 p-3">
                                    <div class="text-[11px] font-bold text-base-content/50">{{ $t("bug.actual") }}</div>
                                    <div class="safe-html mt-1 text-[12.5px] text-base-content/80" v-html="render(bug.actual)" />
                                </div>
                            </div>
                            <div>
                                <div class="text-[11px] font-bold text-base-content/50">{{ $t("bug.steps") }}</div>
                                <ol v-if="bug.steps?.length" class="mt-1 list-decimal space-y-1 pl-5 text-[12.5px] text-base-content/80">
                                    <li v-for="(step, index) in bug.steps" :key="index">{{ step }}</li>
                                </ol>
                                <p v-else class="mt-1 text-[12px] text-base-content/40">{{ $t("bug.steps_missing") }}</p>
                            </div>
                            <div v-if="bug.environment" class="flex flex-wrap items-center gap-2 text-[11px]">
                                <span class="text-base-content/45">{{ $t("bug.environment") }}:</span>
                                <span v-if="bug.environment.platform" class="badge badge-ghost badge-sm">{{ bug.environment.platform }}</span>
                                <span v-if="bug.environment.region" class="badge badge-ghost badge-sm">{{ envText(bug.environment.region) }}</span>
                                <span v-if="bug.environment.gameVersion" class="badge badge-ghost badge-sm">v{{ bug.environment.gameVersion }}</span>
                                <span v-if="bug.environment.frequency" class="badge badge-ghost badge-sm">{{ envText(bug.environment.frequency) }}</span>
                            </div>
                            <div v-if="bug.tags?.length" class="flex flex-wrap items-center gap-1.5">
                                <span class="text-[11px] text-base-content/45">{{ $t("bug.tags") }}:</span>
                                <span v-for="tagKey in bug.tags" :key="tagKey" class="badge badge-outline badge-sm">{{ tagLabel(tagKey) }}</span>
                            </div>
                            <p class="text-[11px] text-base-content/35">{{ $t("bug.ai_disclaimer") }}</p>
                        </div>
                    </section>

                    <section class="card bg-base-100 shadow-lg">
                        <div class="card-body gap-3 p-4">
                            <h2 class="card-title text-sm">{{ $t("bug-detail.evidence") }}</h2>
                            <p v-if="evidence.length === 0" class="text-[12px] text-base-content/40">{{ $t("bug.evidence_none") }}</p>
                            <div v-for="item in evidence" :key="item.occurrenceId" class="rounded-lg border border-base-content/10 p-3">
                                <div class="flex flex-wrap items-center gap-2 text-[11px] text-base-content/45">
                                    <span>{{ formatDateTime(item.createdAt) }}</span>
                                    <span v-if="item.environment?.platform">· {{ item.environment.platform }}</span>
                                    <span v-if="item.environment?.gameVersion">· v{{ item.environment.gameVersion }}</span>
                                </div>
                                <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    <template v-for="(ref, index) in item.evidenceRefs" :key="index">
                                        <ImagePreview
                                            v-if="ref.type === 'image' && ref.assetId"
                                            :thumb-url="bugAssetContentUrl(ref.assetId)"
                                            :full-url="bugAssetContentUrl(ref.assetId)"
                                            class="h-28 w-full rounded-lg border border-base-content/10"
                                        />
                                        <div v-else-if="ref.type === 'text'" class="rounded-lg bg-base-200/60 p-2 text-[11.5px] text-base-content/70">
                                            {{ ref.quote }}
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section v-if="detail?.rawSubmissionCount" class="card bg-base-100 shadow-lg">
                        <div class="card-body gap-2 p-4">
                            <button class="flex w-full items-center gap-1.5 text-left" @click="toggleRawSubmissions">
                                <Icon :icon="rawOpen ? 'ri:arrow-down-s-line' : 'ri:arrow-right-s-line'" class="h-4 w-4 text-base-content/50" />
                                <span class="text-[12.5px] text-base-content/70">{{ $t("bug.raw_submission") }}</span>
                                <span class="ml-auto text-[10.5px] text-base-content/35">{{ $t("bug.raw_submission_hint") }}</span>
                            </button>
                            <template v-if="rawOpen">
                                <div v-if="rawLoading" class="flex justify-center py-2">
                                    <span class="loading loading-spinner loading-xs" />
                                </div>
                                <p v-else-if="rawError" class="text-[11.5px] text-error">{{ rawError }}</p>
                                <p v-else-if="!rawSubmissions?.length" class="text-[11.5px] text-base-content/40">
                                    {{ $t("bug.raw_submission_empty") }}
                                </p>
                                <div v-else class="space-y-2">
                                    <div
                                        v-for="item in rawSubmissions"
                                        :key="`${item.submissionId}:${item.revision}`"
                                        class="rounded-lg border border-base-content/10 p-3"
                                    >
                                        <div class="flex flex-wrap items-center gap-2 text-[10.5px] text-base-content/40">
                                            <span class="font-orbitron">rev.{{ item.revision }}</span>
                                            <span class="ml-auto">{{ item.createdAt ? formatDateTime(item.createdAt) : "" }}</span>
                                        </div>
                                        <pre class="mt-1.5 whitespace-pre-wrap wrap-break-word font-sans text-[12.5px] leading-relaxed text-base-content/80">{{ item.text }}</pre>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </section>

                    <section class="card bg-base-100 shadow-lg">
                        <div class="card-body gap-3 p-4">
                            <div class="flex items-center justify-between">
                                <h2 class="card-title text-sm">{{ $t("bug-detail.community") }}</h2>
                                <span class="text-[11px] text-base-content/40">{{ $t("bug.comment_count", { count: discussion?.total ?? 0 }) }}</span>
                            </div>

                            <div class="rounded-lg bg-base-200/40 p-3">
                                <div class="text-[12px] font-bold text-base-content/70">{{ $t("bug.also_affected") }}</div>
                                <div class="mt-2 flex flex-wrap items-center gap-2">
                                    <select
                                        v-model="feedbackResult"
                                        class="h-7 rounded-none border-b border-base-content/20 bg-transparent px-0.5 text-[12px] outline-none focus:border-primary"
                                    >
                                        <option value="">{{ $t("bug.reproduction.unspecified") }}</option>
                                        <option value="reproduced">{{ $t("bug.reproduction.reproduced") }}</option>
                                        <option value="not_reproduced">{{ $t("bug.reproduction.not_reproduced") }}</option>
                                        <option value="unknown">{{ $t("bug.reproduction.unknown") }}</option>
                                    </select>
                                    <input
                                        v-model="feedbackText"
                                        type="text"
                                        :placeholder="$t('bug.feedback_placeholder')"
                                        class="h-7 min-w-40 flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 text-[12.5px] outline-none placeholder:text-base-content/30 focus:border-primary"
                                    />
                                    <button class="btn btn-primary btn-sm" :disabled="submittingFeedback" @click="submitFeedback">
                                        {{ $t("bug.submit_feedback") }}
                                    </button>
                                </div>
                                <p class="mt-2 text-[10.5px] text-base-content/35">{{ $t("bug.feedback_receipt_hint") }}</p>
                            </div>

                            <div class="space-y-2">
                                <div v-for="entry in discussion?.items" :key="entry.id" class="rounded-lg border border-base-content/10 p-2.5">
                                    <div class="flex items-center gap-2 text-[11px] text-base-content/45">
                                        <span class="font-medium text-base-content/65">{{ entry.author || $t("bug.anonymous") }}</span>
                                        <span class="badge badge-ghost badge-xs">{{ entry.source }}</span>
                                        <span class="ml-auto">{{ formatRelativeTime(entry.createdAt) }}</span>
                                    </div>
                                    <div class="safe-html mt-1 text-[12.5px] text-base-content/80" v-html="render(entry.body)" />
                                </div>
                                <p v-if="!discussion?.items?.length" class="text-[12px] text-base-content/40">{{ $t("bug.no_comments") }}</p>
                            </div>

                            <div>
                                <textarea
                                    v-model="commentText"
                                    rows="3"
                                    :placeholder="$t('bug.comment_placeholder')"
                                    class="textarea textarea-bordered w-full text-[12.5px]"
                                />
                                <div class="mt-2 flex items-center justify-between">
                                    <span class="text-[10.5px] text-base-content/35">{{ $t("bug.comment_rule") }}</span>
                                    <button class="btn btn-primary btn-sm" :disabled="submittingComment" @click="submitComment">
                                        {{ $t("bug.submit_comment") }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div class="space-y-4">
                    <section class="card bg-base-100 shadow-lg">
                        <div class="card-body gap-2 p-4">
                            <h2 class="card-title text-sm">{{ $t("bug-detail.status") }}</h2>
                            <div class="flex items-center gap-2">
                                <span class="badge badge-sm" :class="statusBadgeClass(bug.status)">{{ $t(statusLabelKey(bug.status)) }}</span>
                                <span class="text-[11px] text-base-content/45">{{ $t("bug.severity_source") }}: {{ bug.severitySource || "-" }}</span>
                            </div>
                            <p v-if="bug.resolution" class="text-[11.5px] text-base-content/55">{{ $t("bug.resolution") }}: {{ bug.resolution }}</p>
                            <div class="divider my-1" />
                            <h3 class="text-[11px] font-bold text-base-content/50">{{ $t("bug-detail.timeline") }}</h3>
                            <div v-for="event in timeline" :key="event.eventId" class="flex items-start gap-2 text-[11px]">
                                <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                                <div class="min-w-0 flex-1">
                                    <div class="text-base-content/70">{{ eventLabel(event.kind) }}</div>
                                    <div class="text-[10px] text-base-content/35">{{ formatDateTime(event.createdAt) }}</div>
                                </div>
                            </div>
                            <p v-if="timeline.length === 0" class="text-[11px] text-base-content/35">{{ $t("bug.no_events") }}</p>
                        </div>
                    </section>

                    <section class="card bg-base-100 shadow-lg">
                        <div class="card-body gap-2 p-4">
                            <h2 class="card-title text-sm">{{ $t("bug-detail.relations") }}</h2>
                            <p v-if="relations.length === 0" class="text-[11.5px] text-base-content/40">{{ $t("bug.no_relations") }}</p>
                            <div v-for="relation in relations" :key="relation.id" class="rounded-lg bg-base-200/40 p-2">
                                <div class="flex items-center gap-1.5 text-[11px] text-base-content/45">
                                    <span class="badge badge-outline badge-xs">{{ $t(relationLabelKey(relation.relationType)) }}</span>
                                    <span>{{ relationDirection(relation) }}</span>
                                </div>
                                <RouterLink
                                    :to="{ name: 'bug-detail', params: { bugId: relationOther(relation) } }"
                                    class="link link-hover mt-1 block truncate font-orbitron text-[11.5px] text-primary"
                                >
                                    {{ relationOther(relation) }}
                                </RouterLink>
                            </div>
                            <RouterLink
                                v-if="bug.duplicateOf"
                                :to="{ name: 'bug-detail', params: { bugId: bug.duplicateOf } }"
                                class="link link-hover text-[11.5px] text-warning"
                            >
                                {{ $t("bug.duplicate_of") }}: {{ bug.duplicateOf }}
                            </RouterLink>
                        </div>
                    </section>

                    <section class="card bg-base-100 shadow-lg">
                        <div class="card-body gap-2 p-4">
                            <h2 class="card-title text-sm">{{ $t("bug-detail.fix_tracking") }}</h2>
                            <div class="flex items-center gap-2 text-[12px]">
                                <span class="badge badge-sm badge-outline">{{ t(fixStageLabelKey(bug.fixStage)) }}</span>
                                <span class="text-[11px] text-base-content/45">{{ bug.fixStageSource || "-" }}</span>
                            </div>
                            <p class="text-[11.5px] text-base-content/55">
                                {{ $t("bug.fixed_version") }}: {{ bug.fixedVersion || $t("bug.not_provided") }}
                            </p>
                            <p class="text-[11.5px] text-base-content/55">
                                {{ $t("bug.fix_evidence") }}: {{ bug.fixEvidenceStatus || $t("bug.not_provided") }}
                            </p>
                            <p class="text-[10.5px] text-base-content/35">{{ $t("bug.fix_tag_disclaimer") }}</p>
                        </div>
                    </section>

                    <section class="card bg-base-100 shadow-lg">
                        <div class="card-body gap-2 p-4">
                            <h2 class="card-title text-sm">{{ $t("bug-detail.sync") }}</h2>
                            <template v-if="bug.githubIssue">
                                <p class="text-[11.5px] text-base-content/60">
                                    {{ $t("bug.sync_state") }}: <b>{{ bug.githubIssue.syncState }}</b>
                                </p>
                                <p class="text-[11.5px] text-base-content/60">
                                    {{ $t("bug.remote_state") }}: {{ bug.githubIssue.remoteState || "-" }}
                                    <span v-if="bug.githubIssue.remoteStateReason">/ {{ bug.githubIssue.remoteStateReason }}</span>
                                </p>
                                <p v-if="bug.githubIssue.updatedAt" class="text-[11px] text-base-content/40">
                                    {{ $t("bug.last_reconcile") }}: {{ formatDateTime(bug.githubIssue.updatedAt) }}
                                </p>
                                <a
                                    :href="bug.githubIssue.htmlUrl"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="link link-hover text-[11.5px] text-primary"
                                >
                                    {{ $t("bug.open_on_github") }}
                                </a>
                                <p
                                    v-if="bug.githubIssue.remoteState === 'closed' && bug.githubIssue.remoteStateReason === 'completed'"
                                    class="text-[10.5px] text-warning"
                                >
                                    {{ $t("bug.issue_closed_pending_verify") }}
                                </p>
                            </template>
                            <p v-else class="text-[11.5px] text-base-content/40">{{ $t("bug.not_synced") }}</p>
                        </div>
                    </section>
                </div>
            </div>
        </ScrollArea>

        <div v-if="receiptInfo" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div class="card w-full max-w-md bg-base-100 shadow-2xl">
                <div class="card-body gap-3 p-5">
                    <h3 class="card-title text-base">{{ $t("bug.receipt_token_notice") }}</h3>
                    <p class="text-[12px] text-base-content/60">{{ $t("bug.receipt_token_hint") }}</p>
                    <code class="break-all rounded-lg bg-base-200 p-2 font-mono text-[11px]">{{ receiptInfo.token }}</code>
                    <div class="flex justify-end gap-2">
                        <button class="btn btn-ghost btn-sm" @click="receiptInfo = null">{{ $t("common.close") }}</button>
                        <RouterLink
                            :to="{ name: 'bug-submission', params: { submissionId: receiptInfo.submissionId } }"
                            class="btn btn-primary btn-sm"
                        >
                            {{ $t("bug.view_receipt") }}
                        </RouterLink>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
