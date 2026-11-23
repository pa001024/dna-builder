<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onUnmounted, ref, watch } from "vue"
import { type OcrLineDto, recognizeOcrLines } from "@/api/ocr"
import { useGameText } from "@/composables/useGameText"
import type { TranscendBuildSettings, TranscendGearItemConfig } from "@/data"
import { env } from "@/env"
import { useUIStore } from "@/store/ui"
import { type ChatImage, chatImageDataUrl, fileToChatImage, isImageFile } from "@/utils/chat-image"
import { getGearDisplayName } from "@/utils/transcend-gear/catalog"
import {
    type GearOcrParseResult,
    type GearOcrWarning,
    type GearOcrWarningCode,
    parseGearOcrCards,
} from "@/utils/transcend-gear/ocr-import"
import type { TranscendGearStockRow } from "@/utils/transcend-gear/repo"
import { transcendGearStock } from "@/utils/transcend-gear/stock"
import TranscendGearCreate from "./TranscendGearCreate.vue"

/**
 * 升华装备截图导入：粘贴 / 拖入 / 选择详情截图 → 桌面端本地 OCR → 按卡分列解析 →
 * 列表逐件核对（每卡独立编辑器）→ 逐件写入库存。浏览器端没有本地 OCR，只提示桌面端可用。
 */

const props = defineProps<{
    open: boolean
    settings: TranscendBuildSettings
    dataReady: boolean
}>()

const emit = defineEmits<{
    (event: "update:open", value: boolean): void
    (event: "added", row: TranscendGearStockRow): void
}>()

const { t, i18next } = useTranslation()
const { gt } = useGameText()
const ui = useUIStore()
const stock = transcendGearStock

/** 一张识别到的装备卡；`added` 标记已入库，防止重复提交 */
interface GearOcrCard {
    result: GearOcrParseResult
    added: boolean
}

/** 警告 code → 六语言文案键（detail 只作参数） */
const WARNING_KEYS: Record<GearOcrWarningCode, string> = {
    slot_missing: "transcend-build.gear_ocr_warn_slot_missing",
    strength_missing: "transcend-build.gear_ocr_warn_strength_missing",
    name_missing: "transcend-build.gear_ocr_warn_name_missing",
    base_affix_missing: "transcend-build.gear_ocr_warn_base_affix_missing",
    unique_affix_missing: "transcend-build.gear_ocr_warn_unique_affix_missing",
    affix_unmatched: "transcend-build.gear_ocr_warn_affix_unmatched",
    affix_duplicate: "transcend-build.gear_ocr_warn_affix_duplicate",
    affix_out_of_pool: "transcend-build.gear_ocr_warn_affix_out_of_pool",
    affix_value_uncertain: "transcend-build.gear_ocr_warn_affix_value_uncertain",
    ancient_inferred: "transcend-build.gear_ocr_warn_ancient_inferred",
    rarity_inferred: "transcend-build.gear_ocr_warn_rarity_inferred",
    text_unparsed: "transcend-build.gear_ocr_warn_text_unparsed",
}

const image = ref<ChatImage | null>(null)
const recognizing = ref(false)
const saving = ref(false)
const error = ref("")
const cards = ref<GearOcrCard[]>([])
const activeIndex = ref(0)
/** 是否已完成过一次识别（用于「识别成功但 0 张卡」的空结果提示） */
const hasRun = ref(false)
const uploadZone = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const trigger = ref<HTMLElement | null>(null)

const imageUrl = computed(() => (image.value ? chatImageDataUrl(image.value) : ""))
const charId = computed(() => props.settings.main?.charId ?? 0)
const canRun = computed(() => Boolean(image.value) && !recognizing.value && !saving.value && env.isApp)
const activeCard = computed(() => cards.value[activeIndex.value] ?? null)
const activeResult = computed(() => activeCard.value?.result ?? null)
/** 当前卡含池外词缀时放宽提交校验（仅放宽槽位池，其余规则不变） */
const allowOutOfPool = computed(() => activeResult.value?.warnings.some(warning => warning.code === "affix_out_of_pool") === true)

/** 识别 / 读图请求令牌：换图、关闭、重置、卸载都会使其失效，迟到的异步结果不得写回 */
let runToken = 0
/** 组件是否已卸载（卸载后任何异步回调都不得再改状态） */
let disposed = false

onUnmounted(() => {
    disposed = true
    runToken++
})

/** 异常转可展示文本 */
function errorText(cause: unknown): string {
    return cause instanceof Error ? cause.message : String(cause)
}

/** 清空图片 / 识别结果 / 错误（关闭或重新选图时），并使在途请求失效 */
function resetState(): void {
    runToken++
    image.value = null
    cards.value = []
    activeIndex.value = 0
    hasRun.value = false
    error.value = ""
    recognizing.value = false
    saving.value = false
}

/**
 * 读取图片文件：归一化后作为 OCR 输入与预览；识别 / 保存期间拒绝换图。
 * @param file 图片文件
 */
async function applyFile(file: File | null | undefined): Promise<void> {
    if (!file || !isImageFile(file) || recognizing.value || saving.value) return
    const token = ++runToken
    error.value = ""
    cards.value = []
    activeIndex.value = 0
    hasRun.value = false
    try {
        const next = await fileToChatImage(file)
        if (token !== runToken || disposed) return
        image.value = next
    } catch (cause) {
        console.error("读取截图失败:", cause)
        if (token !== runToken || disposed) return
        image.value = null
        error.value = t("transcend-build.gear_ocr_read_failed")
    }
}

/**
 * 粘贴图片（截图默认走剪贴板）。
 * @param event 粘贴事件
 */
function onPaste(event: ClipboardEvent): void {
    const file = [...(event.clipboardData?.files ?? [])].find(isImageFile)
    if (!file) return
    event.preventDefault()
    void applyFile(file)
}

/**
 * 拖入图片。
 * @param event 拖放事件
 */
function onDrop(event: DragEvent): void {
    const file = [...(event.dataTransfer?.files ?? [])].find(isImageFile)
    if (!file) return
    void applyFile(file)
}

/** 打开系统文件选择 */
function pickImage(): void {
    fileInput.value?.click()
}

/**
 * 文件选择变化：只取第一张图片。
 * @param event 输入事件
 */
function onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    void applyFile(file)
}

/** 识别并解析当前截图（按 x 分列，一张截图可含多件装备；迟到结果按令牌 / 图片引用 / 弹窗状态丢弃） */
async function run(): Promise<void> {
    if (!canRun.value || !image.value) return
    const token = ++runToken
    const source = image.value
    recognizing.value = true
    error.value = ""
    cards.value = []
    activeIndex.value = 0
    hasRun.value = false
    /** 结果是否仍属于当前请求 */
    const isCurrent = (): boolean => token === runToken && image.value === source && props.open && !disposed
    try {
        const lines: OcrLineDto[] = await recognizeOcrLines(source.data)
        if (!isCurrent()) return
        const parsed = parseGearOcrCards(lines, { charId: charId.value, translate: gt })
        cards.value = parsed.map(result => ({ result, added: false }))
        activeIndex.value = 0
        hasRun.value = true
    } catch (cause) {
        console.error("OCR 识别失败:", cause)
        if (!isCurrent()) return
        error.value = t("transcend-build.gear_ocr_failed", { message: errorText(cause) })
    } finally {
        if (token === runToken) recognizing.value = false
    }
}

/**
 * 卡片列表标题：装备显示名；无法解析的卡显示短文案。
 * @param card 识别卡
 * @returns 展示名称
 */
function cardName(card: GearOcrCard): string {
    return card.result.item
        ? getGearDisplayName(card.result.item, gt, i18next.language)
        : t("transcend-build.gear_ocr_parse_failed")
}

/**
 * 提交当前卡的编辑器结果：写入库存并标记已入库；
 * 还有未入库且可解析的卡则自动切到下一张，全部处理完（或剩余均无法解析）后关闭并通知父层刷新。
 * @param item 核对后的物品
 */
async function addItem(item: TranscendGearItemConfig): Promise<void> {
    const card = activeCard.value
    if (saving.value || !card || card.added) return
    saving.value = true
    try {
        const saved = await stock.add(item)
        card.added = true
        ui.showSuccessMessage(t("transcend-build.gear_ocr_added"))
        const next = cards.value.findIndex(entry => !entry.added && entry.result.item !== null)
        if (next >= 0) {
            activeIndex.value = next
            return
        }
        emit("added", saved)
        // 先释放 saving 再关闭：close() 在写入期间会拒绝（写入本身不可取消）
        saving.value = false
        close()
    } catch (cause) {
        ui.showErrorMessage(t("transcend-build.gear_stock_write_failed", { message: errorText(cause) }))
    } finally {
        saving.value = false
    }
}

/**
 * 警告文案：按 code 映射 i18n，detail 只作参数；无 detail 时去掉模板尾部的冒号。
 * @param warning 结构化警告
 * @returns 当前语言文案
 */
function warningText(warning: GearOcrWarning): string {
    const key = WARNING_KEYS[warning.code] ?? "transcend-build.gear_ocr_warnings"
    const text = t(key, { detail: warning.detail ?? "" })
    return warning.detail ? text : text.replace(/[\s:：]+$/, "")
}

/** 关闭并归还焦点；写入库存期间禁止关闭（写入不可取消，避免关闭后仍 emit / toast） */
function close(): void {
    if (saving.value) return
    emit("update:open", false)
}

watch(
    () => props.open,
    value => {
        if (value) {
            trigger.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
            resetState()
            void nextTick(() => uploadZone.value?.focus())
        } else {
            resetState()
            void nextTick(() => trigger.value?.focus())
        }
    }
)
</script>

<template>
    <Teleport v-if="open" to="body">
        <dialog class="modal modal-open" data-transcend-gear-ocr>
            <div class="modal-box relative max-w-11/12" :class="imageUrl || cards.length ? 'h-11/12' : 'h-auto max-h-11/12'">
                <SectionHeader number="04" kicker="OCR IMPORT" :title="$t('transcend-build.gear_ocr_title')" no-animate compact>
                    <template #trailing>
                        <button class="btn btn-ghost btn-sm btn-square" :disabled="saving" data-gear-ocr-close @click="close">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </template>
                </SectionHeader>

                <div class="grid gap-3 pt-1" :class="activeResult?.item ? 'lg:grid-cols-[220px_minmax(0,1fr)]' : 'lg:grid-cols-2'">
                    <div
                        ref="uploadZone"
                        tabindex="0"
                        class="flex min-h-32 flex-col items-center justify-center gap-2 rounded-none border border-dashed border-base-content/25 bg-base-content/2 p-3 text-center outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/40"
                        :class="{ 'opacity-60': recognizing || saving }"
                        data-gear-ocr-upload
                        @paste="onPaste"
                        @dragover.prevent
                        @drop.prevent="onDrop"
                    >
                        <img v-if="imageUrl" :src="imageUrl" alt="" class="max-h-40 max-w-full object-contain" data-gear-ocr-preview />
                        <span class="text-[11px] leading-relaxed text-base-content/45">{{ $t("transcend-build.gear_ocr_hint") }}</span>
                        <button type="button" class="btn btn-xs btn-outline" :disabled="recognizing || saving" data-gear-ocr-pick @click="pickImage">
                            {{ $t("transcend-build.gear_ocr_pick") }}
                        </button>
                        <input
                            ref="fileInput"
                            type="file"
                            accept="image/*"
                            class="hidden"
                            :disabled="recognizing || saving"
                            data-gear-ocr-file
                            @change="onFileChange"
                        />
                    </div>

                    <div class="flex min-w-0 flex-col gap-2">
                        <p v-if="!env.isApp" class="border border-warning/30 bg-warning/5 px-2 py-1 text-[10px] text-warning/80" data-gear-ocr-not-desktop>
                            {{ $t("transcend-build.gear_ocr_not_desktop") }}
                        </p>
                        <p v-if="error" class="border border-error/30 bg-error/5 px-2 py-1 text-[10px] text-error/80" data-gear-ocr-error>
                            {{ error }}
                        </p>
                        <div class="flex flex-wrap items-center gap-2">
                            <button type="button" class="btn btn-sm btn-primary" :disabled="!canRun" data-gear-ocr-run @click="run">
                                <span v-if="recognizing" class="loading loading-spinner loading-xs" />
                                {{ recognizing ? $t("transcend-build.gear_ocr_recognizing") : $t("transcend-build.gear_ocr_run") }}
                            </button>
                            <p class="text-[10px] text-base-content/40">{{ $t("transcend-build.gear_ocr_limitations") }}</p>
                        </div>

                        <div v-if="cards.length > 1" class="flex flex-col gap-1" data-gear-ocr-card-list>
                            <p class="text-[10px] text-base-content/45">
                                {{ $t("transcend-build.gear_ocr_found_count", { count: cards.length }) }}
                            </p>
                            <div class="flex flex-wrap gap-1">
                                <button
                                    v-for="(card, index) in cards"
                                    :key="index"
                                    type="button"
                                    class="btn btn-xs"
                                    :class="index === activeIndex ? 'btn-primary' : 'btn-ghost'"
                                    :disabled="saving || card.added"
                                    :data-gear-ocr-card="index"
                                    :data-gear-ocr-card-active="index === activeIndex ? 'true' : undefined"
                                    :data-gear-ocr-card-added="card.added ? 'true' : undefined"
                                    @click="activeIndex = index"
                                >
                                    <span class="font-mono">#{{ index + 1 }}</span>
                                    <span class="max-w-40 truncate">{{ cardName(card) }}</span>
                                    <Icon v-if="card.added" icon="ri:check-line" class="size-3" />
                                </button>
                            </div>
                        </div>

                        <p v-if="(activeResult && !activeResult.item) || (hasRun && cards.length === 0)" class="border border-warning/30 bg-warning/5 px-2 py-1 text-[10px] text-warning/80" data-gear-ocr-parse-failed>
                            {{ $t("transcend-build.gear_ocr_parse_failed") }}
                        </p>
                        <details v-if="activeResult && activeResult.warnings.length" class="border border-base-content/10" open>
                            <summary class="cursor-pointer px-2 py-1 text-[10px] font-semibold text-base-content/60">
                                {{ $t("transcend-build.gear_ocr_warnings") }} ({{ activeResult.warnings.length }})
                            </summary>
                            <div class="max-h-28 overflow-auto px-2 py-1" data-gear-ocr-warnings>
                                <p
                                    v-for="(warning, index) in activeResult.warnings"
                                    :key="index"
                                    class="text-[10px] leading-relaxed text-base-content/55"
                                    :data-gear-ocr-warning="warning.code"
                                >
                                    {{ warningText(warning) }}
                                </p>
                            </div>
                        </details>
                        <p v-if="activeResult?.item" class="text-[10px] text-base-content/45" data-gear-ocr-review>
                            {{ $t("transcend-build.gear_ocr_review") }}
                        </p>
                    </div>
                </div>

                <div v-if="activeResult?.item" class="pt-2" data-gear-ocr-result>
                    <TranscendGearCreate
                        :key="activeIndex"
                        :slot-type="activeResult.item.slotType"
                        mode="create"
                        :initial="activeResult.item"
                        :char-id="charId"
                        :disabled="!dataReady || saving"
                        :allow-out-of-pool-affixes="allowOutOfPool"
                        @submit="addItem"
                    />
                </div>
            </div>
            <div class="modal-backdrop" @click="close" />
        </dialog>
    </Teleport>
</template>
