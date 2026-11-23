<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { nanoid } from "nanoid"
import { computed, onUnmounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import {
    clearIdempotencyKey,
    DEFAULT_GAME_ID,
    ENVIRONMENT_OPTIONS,
    type EnvironmentOption,
    getOrCreateIdempotencyKey,
    listBugs,
    PUBLICATION_POLICIES,
    severityBadgeClass,
    severityLabelKey,
    statusLabelKey,
    submitBug,
    uploadBugAsset,
} from "@/api/bugs"
import type * as Types from "@/api/gen/api-types"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"

const router = useRouter()
const ui = useUIStore()
const user = useUserStore()
const { t } = useTranslation()

/** 单次最多 8 张图（spec §10）。 */
const MAX_IMAGES = 8
/** 单图 10 MiB 上限，与服务端一致。 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** 允许的图片类型；GIF / HEIC 等由服务端魔数校验拒绝。 */
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])

interface DraftImage {
    id: string
    file: File
    preview: string
    state: "uploading" | "done" | "error"
    assetId?: string
    error?: string
}

const text = ref("")
const platform = ref("")
const region = ref("")
const gameVersion = ref("")
const frequency = ref("")
/** 默认选「含隐私 · 脱敏后公开」：公开原文需要用户显式选择。 */
const policy = ref<Types.PublicationPolicy>("CATALOG_SAFE")
const images = ref<DraftImage[]>([])
const isDragging = ref(false)
const submitting = ref(false)
const receipt = ref<Types.SubmissionReceipt | null>(null)
const fileInputRef = ref<HTMLInputElement>()

/** 幂等键按草稿作用域保存：网络失败重试复用，成功后换新 key。 */
const submitKey = ref(getOrCreateIdempotencyKey("submit"))

const uploading = computed(() => images.value.some(image => image.state === "uploading"))
const hasUploadError = computed(() => images.value.some(image => image.state === "error"))
const canSubmit = computed(() => !submitting.value && !uploading.value && (Boolean(text.value.trim()) || images.value.length > 0))

const similar = ref<Types.Bug[]>([])
const loadingSimilar = ref(false)
let similarTimer: ReturnType<typeof setTimeout> | undefined

/**
 * @description 图片合规检查：类型与体积在客户端先拦一次，服务端仍会做魔数与像素校验。
 */
function validateImage(file: File): string | null {
    if (!ALLOWED_MIME.has(file.type)) return t("bug.image_type_invalid")
    if (file.size > MAX_IMAGE_BYTES) return t("bug.image_too_large", { size: 10 })
    return null
}

/**
 * @description 上传单张图片；失败保留在列表里供用户移除，不阻塞其他图片。
 * 结果写回响应式数组里的代理对象，保证状态刷新。
 */
async function uploadOne(entry: DraftImage) {
    const target = () => images.value.find(image => image.id === entry.id)
    try {
        const uploaded = await uploadBugAsset(entry.file, policy.value)
        const image = target()
        if (!image) return
        image.assetId = uploaded.assetId
        image.state = "done"
    } catch (error) {
        const image = target()
        if (!image) return
        image.state = "error"
        image.error = error instanceof Error ? error.message : String(error)
    }
}

/**
 * @description 批量加入草稿图片并立即上传。
 */
function addFiles(files: Iterable<File>) {
    for (const file of files) {
        if (images.value.length >= MAX_IMAGES) {
            ui.showErrorMessage(t("bug.image_limit", { count: MAX_IMAGES }))
            break
        }
        const invalid = validateImage(file)
        if (invalid) {
            ui.showErrorMessage(invalid)
            continue
        }
        const entry: DraftImage = {
            id: nanoid(),
            file,
            preview: URL.createObjectURL(file),
            state: "uploading",
        }
        images.value.push(entry)
        void uploadOne(entry)
    }
}

/**
 * @description 移除草稿图片并释放预览地址。
 */
function removeImage(id: string) {
    const index = images.value.findIndex(image => image.id === id)
    if (index < 0) return
    URL.revokeObjectURL(images.value[index].preview)
    images.value.splice(index, 1)
}

/**
 * @description 文件选择 / 拖拽 / 粘贴共用入口。
 */
function handleFileInput(event: Event) {
    const input = event.target as HTMLInputElement
    if (input.files?.length) addFiles(Array.from(input.files))
    input.value = ""
}

function handleDrop(event: DragEvent) {
    event.preventDefault()
    isDragging.value = false
    if (event.dataTransfer?.files?.length) addFiles(Array.from(event.dataTransfer.files))
}

function handleDragOver(event: DragEvent) {
    event.preventDefault()
    isDragging.value = true
}

function handleDragLeave() {
    isDragging.value = false
}

/**
 * @description 粘贴截图：只取剪贴板里的图片文件，文字仍交给 textarea。
 */
function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith("image/"))
    if (files.length === 0) return
    event.preventDefault()
    addFiles(files)
}

/**
 * @description 关键词去抖查相似 BUG；建议只是辅助，不拦截提交。
 */
async function loadSimilar() {
    const query = text.value.trim()
    if (query.length < 6) {
        similar.value = []
        return
    }
    loadingSimilar.value = true
    try {
        const result = await listBugs({ filter: { q: query.slice(0, 80) }, limit: 5 })
        similar.value = result?.items ?? []
    } finally {
        loadingSimilar.value = false
    }
}

watch(text, () => {
    if (similarTimer) clearTimeout(similarTimer)
    similarTimer = setTimeout(() => void loadSimilar(), 600)
})

/**
 * @description 提交反馈：匿名用户拿到一次性回执，凭据由 API 层落盘。
 */
async function handleSubmit() {
    if (!canSubmit.value) {
        if (hasUploadError.value) ui.showErrorMessage(t("bug.fix_failed_images"))
        return
    }
    submitting.value = true
    try {
        const result = await submitBug(
            {
                text: text.value.trim() || undefined,
                assetIds: images.value.filter(image => image.state === "done" && image.assetId).map(image => image.assetId!),
                context: {
                    gameId: DEFAULT_GAME_ID,
                    platform: platform.value.trim() || undefined,
                    region: region.value.trim() || undefined,
                    gameVersion: gameVersion.value.trim() || undefined,
                    frequency: frequency.value.trim() || undefined,
                },
                publicationPolicy: policy.value,
            },
            { idempotencyKey: submitKey.value }
        )
        if (result.error) {
            if (result.error.code === "RATE_LIMITED") {
                ui.showErrorMessage(t("bug.rate_limited"))
            } else if (result.error.code === "PAYLOAD_TOO_LARGE") {
                ui.showErrorMessage(t("bug.payload_too_large"))
            } else {
                ui.showErrorMessage(result.error.message)
            }
            return
        }
        receipt.value = result.data
        clearIdempotencyKey("submit")
        submitKey.value = getOrCreateIdempotencyKey("submit")
    } finally {
        submitting.value = false
    }
}

/**
 * @description 提交成功后继续反馈：清空草稿并换新幂等键。
 */
function resetDraft() {
    receipt.value = null
    text.value = ""
    platform.value = ""
    region.value = ""
    gameVersion.value = ""
    frequency.value = ""
    for (const image of images.value) URL.revokeObjectURL(image.preview)
    images.value = []
    similar.value = []
}

onUnmounted(() => {
    if (similarTimer) clearTimeout(similarTimer)
    for (const image of images.value) URL.revokeObjectURL(image.preview)
})

const inputClass =
    "w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
const selectClass =
    "w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] outline-none focus:border-primary disabled:opacity-50"

/**
 * @description 环境信息选项文案：登记过译名的走 i18n，未登记的原样展示。
 */
function optionLabel(option: EnvironmentOption): string {
    return option.labelKey ? t(option.labelKey) : option.value
}
</script>

<template>
    <div class="h-full flex flex-col">
        <!-- 顶部标题行：kicker + 标题 + 返回入口 -->
        <div class="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-content/15 px-4 py-3">
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">Bug Report</p>
            <h1 class="text-[17px] font-semibold text-base-content">{{ $t("bug-new.title") }}</h1>
            <span class="text-[11px] text-base-content/45">{{ $t("bug-new.free_form_hint") }}</span>
            <RouterLink to="/bugs" class="btn btn-xs ml-auto">
                <Icon icon="ri:arrow-left-s-line" class="h-3.5 w-3.5" />
                {{ $t("bug-list.title") }}
            </RouterLink>
        </div>

        <ScrollArea class="flex-1">
            <div class="grid grid-cols-1 gap-4 p-4 xl:grid-cols-3">
                <div class="space-y-4 xl:col-span-2">
                    <section
                        class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm transition-colors duration-150"
                        :class="isDragging ? 'border-primary/70 ring-2 ring-primary/40' : ''"
                        @drop="handleDrop"
                        @dragover="handleDragOver"
                        @dragleave="handleDragLeave"
                    >
                        <SectionHeader no-animate compact kicker="CONTENT" :title="$t('bug-new.content')">
                            <template #trailing>
                                <span class="text-[10.5px] text-base-content/35">{{ $t("bug-new.content_hint") }}</span>
                            </template>
                        </SectionHeader>
                        <textarea
                            v-model="text"
                            rows="8"
                            :placeholder="$t('bug-new.placeholder')"
                            class="w-full resize-none rounded-none border-b border-base-content/20 bg-transparent px-0.5 py-1 text-[13px] leading-relaxed outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                            @paste="handlePaste"
                        />

                        <div class="mt-2 flex flex-wrap items-center gap-2">
                            <button class="btn btn-xs" @click="fileInputRef?.click()">
                                <Icon icon="ri:image-add-line" class="h-3.5 w-3.5" />
                                {{ $t("bug-new.add_image") }}
                            </button>
                            <span class="text-[11px] text-base-content/35">{{ $t("bug-new.drop_hint") }}</span>
                            <input ref="fileInputRef" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="handleFileInput" />
                            <span class="ml-auto font-orbitron text-[11px] text-base-content/40">{{ images.length }} / {{ MAX_IMAGES }}</span>
                        </div>

                        <div v-if="images.length" class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div v-for="image in images" :key="image.id" class="relative overflow-hidden rounded-xs border border-base-content/10">
                                <img :src="image.preview" :alt="image.file.name" class="h-24 w-full object-cover" />
                                <div class="absolute inset-x-0 bottom-0 bg-base-content/65 px-1.5 py-0.5 text-[10px] text-base-100">
                                    <span v-if="image.state === 'uploading'">{{ $t("bug.image_uploading") }}</span>
                                    <span v-else-if="image.state === 'done'" class="text-success">{{ $t("bug.image_ready") }}</span>
                                    <span v-else class="text-warning" :title="image.error">{{ $t("bug.image_failed") }}</span>
                                </div>
                                <button
                                    class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-xs bg-base-content/65 text-base-100 transition-colors duration-150 hover:bg-base-content/80"
                                    @click="removeImage(image.id)"
                                >
                                    <Icon icon="ri:close-line" class="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    </section>

                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="ENVIRONMENT" :title="$t('bug-new.environment')" />
                        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div class="block">
                                <span class="text-[11px] text-base-content/55">{{ $t("bug.filter.platform") }}</span>
                                <Select v-model="platform" :class="selectClass" :placeholder="$t('bug-new.platform_placeholder')">
                                    <SelectItem v-for="option in ENVIRONMENT_OPTIONS.platform" :key="option.value" :value="option.value">
                                        {{ optionLabel(option) }}
                                    </SelectItem>
                                </Select>
                            </div>
                            <div class="block">
                                <span class="text-[11px] text-base-content/55">{{ $t("bug.filter.region") }}</span>
                                <Select v-model="region" :class="selectClass" :placeholder="$t('bug-new.region_placeholder')">
                                    <SelectItem v-for="option in ENVIRONMENT_OPTIONS.region" :key="option.value" :value="option.value">
                                        {{ optionLabel(option) }}
                                    </SelectItem>
                                </Select>
                            </div>
                            <label class="block">
                                <span class="text-[11px] text-base-content/55">{{ $t("bug.filter.game_version") }}</span>
                                <input v-model="gameVersion" type="text" :placeholder="$t('bug-new.version_placeholder')" :class="inputClass" />
                            </label>
                            <div class="block">
                                <span class="text-[11px] text-base-content/55">{{ $t("bug.frequency") }}</span>
                                <Select v-model="frequency" :class="selectClass" :placeholder="$t('bug-new.frequency_placeholder')">
                                    <SelectItem v-for="option in ENVIRONMENT_OPTIONS.frequency" :key="option.value" :value="option.value">
                                        {{ optionLabel(option) }}
                                    </SelectItem>
                                </Select>
                            </div>
                        </div>
                        <p class="mt-2 text-[10.5px] text-base-content/35">{{ $t("bug-new.optional_hint") }}</p>
                    </section>

                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="VISIBILITY" :title="$t('bug-new.publication')" />
                        <Select v-model="policy" :disabled="images.length > 0" :class="selectClass">
                            <SelectItem v-for="item in PUBLICATION_POLICIES" :key="item" :value="item">
                                {{ $t(`bug.publication.${item}`) }}
                            </SelectItem>
                        </Select>
                        <p class="mt-2 text-[11px] leading-relaxed text-base-content/55">{{ $t("bug-new.publication_hint") }}</p>
                        <p class="mt-1 text-[10.5px] text-base-content/35">{{ $t("bug-new.upload_policy_locked") }}</p>
                    </section>

                    <div class="flex flex-wrap items-center gap-3">
                        <button class="btn btn-xs btn-primary" :disabled="!canSubmit" @click="handleSubmit">
                            <span v-if="submitting" class="loading loading-spinner loading-xs" />
                            <Icon v-else icon="ri:send-plane-line" class="h-3.5 w-3.5" />
                            {{ $t("bug.submit") }}
                        </button>
                        <span class="text-[11px] text-base-content/40">{{ $t("bug-new.submit_hint") }}</span>
                    </div>
                </div>

                <div class="space-y-4">
                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="SIMILAR" :title="$t('bug.similar_bugs')" />
                        <p class="mb-2 text-[11px] text-base-content/40">{{ $t("bug.similar_hint") }}</p>
                        <div v-if="loadingSimilar" class="flex justify-center py-3">
                            <span class="loading loading-spinner loading-sm" />
                        </div>
                        <template v-else>
                            <div class="space-y-1.5">
                                <RouterLink
                                    v-for="item in similar"
                                    :key="item.id"
                                    :to="{ name: 'bug-detail', params: { bugId: item.id } }"
                                    class="block rounded-xs border border-base-content/10 bg-base-content/3 p-2 transition-colors duration-150 hover:border-primary/40"
                                >
                                    <div class="flex items-center gap-1.5">
                                        <span class="badge badge-xs" :class="severityBadgeClass(item.severity)">
                                            {{ $t(severityLabelKey(item.severity)) }}
                                        </span>
                                        <span class="text-[10px] text-base-content/40">{{ $t(statusLabelKey(item.status)) }}</span>
                                    </div>
                                    <div class="mt-1 line-clamp-2 text-[12px] text-base-content/80">{{ item.title }}</div>
                                </RouterLink>
                            </div>
                            <p v-if="similar.length === 0" class="text-[11.5px] text-base-content/35">{{ $t("bug.similar_empty") }}</p>
                        </template>
                    </section>

                    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                        <SectionHeader no-animate compact kicker="NOTICE" :title="$t('bug-new.privacy_notice_title')" />
                        <ul class="list-disc space-y-1 pl-4 text-[11.5px] leading-relaxed text-base-content/55">
                            <li>{{ $t("bug-new.privacy_notice_ai") }}</li>
                            <li>{{ $t("bug-new.privacy_notice_public") }}</li>
                            <li>{{ $t("bug-new.privacy_notice_github") }}</li>
                            <li>{{ $t("bug-new.privacy_notice_receipt") }}</li>
                        </ul>
                        <p v-if="user.jwtToken" class="mt-2 text-[10.5px] text-base-content/35">{{ $t("bug-new.logged_in_hint") }}</p>
                    </section>
                </div>
            </div>
        </ScrollArea>

        <div v-if="receipt" class="fixed inset-0 z-50 flex items-center justify-center bg-base-100/85 p-4 backdrop-blur-md">
            <div class="w-full max-w-md rounded-xs border border-base-content/15 bg-base-100/90 p-4 shadow-lg backdrop-blur-md">
                <SectionHeader no-animate compact kicker="SUBMITTED" :title="$t('bug.submit_success')" />
                <p v-if="receipt.receiptToken" class="text-[12px] text-base-content/60">{{ $t("bug.receipt_token_hint") }}</p>
                <code v-if="receipt.receiptToken" class="mt-2 block break-all rounded-xs border border-base-content/10 bg-base-content/5 p-2 font-mono text-[11px]">
                    {{ receipt.receiptToken }}
                </code>
                <p v-if="receipt.receiptToken" class="mt-2 text-[11px] text-warning">{{ $t("bug.receipt_token_notice") }}</p>
                <p class="mt-2 text-[11px] text-base-content/45">
                    {{ $t("bug.suggested_poll", { seconds: receipt.suggestedPollAfterSeconds }) }}
                </p>
                <div class="mt-3 flex flex-wrap justify-end gap-2">
                    <button class="btn btn-xs" @click="resetDraft">{{ $t("bug.submit_another") }}</button>
                    <button
                        class="btn btn-xs"
                        @click="router.push({ name: 'bug-submission', params: { submissionId: receipt.submissionId } })"
                    >
                        {{ $t("bug.view_receipt") }}
                    </button>
                    <button class="btn btn-xs btn-primary" @click="router.push('/bugs')">{{ $t("bug-list.title") }}</button>
                </div>
            </div>
        </div>
    </div>
</template>
