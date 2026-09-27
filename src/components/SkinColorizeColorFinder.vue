<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { skinColorizeSwatches } from "@/data/d/skin-colorize.data"
import { formatSkinColorizeRgb, type SkinColorizeSwatch } from "@/data/skin-colorize"
import { useUIStore } from "@/store/ui"
import { deltaEOk, hexToRgb, type Rgb, rgbToHex, rgbToOklab } from "@/utils/color"
import { extractImagePalette } from "@/utils/image-palette"

const ui = useUIStore()

/** 色板与其 OKLab 值的对照表（模块级预计算，换色时只换算目标色）。 */
const swatchOklabList = skinColorizeSwatches.map(swatch => ({ swatch, oklab: rgbToOklab(swatch.rgb) }))

/** 弹窗开关（双向绑定）。 */
const open = defineModel<boolean>({ default: false })

const props = defineProps<{
    /** 匹配目标：皮肤染剂按 resourceId 展示，发型染剂按 hairResourceId 展示。 */
    variant?: "skin" | "hair"
    /** 当前编辑部位标签（如「部位 3」「发型色位 2」）。 */
    partLabel?: string
    /** 当前已应用的色板 ID，用于高亮对应结果行。 */
    currentColorId?: number
    /** 当前部位允许使用的色板 ID，为空表示全部可用。 */
    validIds?: number[]
}>()

const emit = defineEmits<{
    /** 选中一个相似色板。 */
    select: [swatch: SkinColorizeSwatch]
}>()

/** 目标颜色（十六进制）。 */
const targetHex = ref("#ffffff")
/** 色差上限：只展示 ΔE 不超过该值的结果。 */
const threshold = ref(20)

/** 参考图预览地址（blob URL）。 */
const refImageUrl = ref("")
/** 参考图提取出的主色。 */
const paletteColors = ref<Rgb[]>([])
const fileInputRef = ref<HTMLInputElement>()
const dragging = ref(false)

/** 目标颜色的 sRGB 值与 OKLab 值。 */
const targetRgb = computed<Rgb>(() => hexToRgb(targetHex.value) ?? [255, 255, 255])
const targetOklab = computed(() => rgbToOklab(targetRgb.value))

/** 相似色板结果：按色差升序排列。 */
const results = computed(() =>
    swatchOklabList
        .map(({ swatch, oklab }) => ({ swatch, deltaE: deltaEOk(targetOklab.value, oklab) }))
        .filter(item => item.deltaE <= threshold.value)
        .sort((left, right) => left.deltaE - right.deltaE)
)

/** 结果行展示的染剂名称（皮肤用色板名，发型用发色染剂名）。 */
function dyeName(swatch: SkinColorizeSwatch): string {
    return props.variant === "hair" ? swatch.hairResourceName : swatch.name
}

/** 结果行展示的染剂资源 ID。 */
function dyeResourceId(swatch: SkinColorizeSwatch): number {
    return props.variant === "hair" ? swatch.hairResourceId : swatch.resourceId
}

/** 色板是否可用于当前部位。 */
function isUsable(swatch: SkinColorizeSwatch): boolean {
    if (!props.validIds?.length) return true
    return props.validIds.includes(swatch.id)
}

/** 载入参考图并提取主色，默认选中出现最多的主色作为目标色。 */
function loadReferenceImage(file: File) {
    if (!file.type.startsWith("image/")) {
        ui.showErrorMessage("只支持图片格式")
        return
    }
    if (refImageUrl.value.startsWith("blob:")) URL.revokeObjectURL(refImageUrl.value)
    refImageUrl.value = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
        const palette = extractImagePalette(image, 8)
        paletteColors.value = palette
        if (palette.length) targetHex.value = rgbToHex(palette[0])
    }
    image.onerror = () => ui.showErrorMessage("参考图读取失败")
    image.src = refImageUrl.value
}

/** 移除参考图，仅清空提取结果，已选目标色保留。 */
function clearReferenceImage() {
    if (refImageUrl.value.startsWith("blob:")) URL.revokeObjectURL(refImageUrl.value)
    refImageUrl.value = ""
    paletteColors.value = []
}

/** 文件选择框变更处理。 */
function handleFileInput(event: Event) {
    const target = event.target as HTMLInputElement
    if (target.files?.[0]) loadReferenceImage(target.files[0])
    target.value = ""
}

/** 拖拽松手处理。 */
function handleDrop(event: DragEvent) {
    dragging.value = false
    const file = event.dataTransfer?.files?.[0]
    if (file) loadReferenceImage(file)
}

/** 弹窗打开时接管图片粘贴（参考图优先于页面预览图），仅管图片文件。 */
function onWindowPaste(event: ClipboardEvent) {
    if (!open.value) return
    const file = event.clipboardData?.files?.[0]
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    loadReferenceImage(file)
}

// 打开弹窗时，以当前部位已应用的色板颜色作为初始目标色
watch(open, isOpen => {
    if (!isOpen) return
    const current = skinColorizeSwatches.find(swatch => swatch.id === props.currentColorId)
    if (current) targetHex.value = rgbToHex(current.rgb)
})

onMounted(() => window.addEventListener("paste", onWindowPaste, true))

onBeforeUnmount(() => {
    window.removeEventListener("paste", onWindowPaste, true)
    if (refImageUrl.value.startsWith("blob:")) URL.revokeObjectURL(refImageUrl.value)
})
</script>

<template>
    <SourceDetailDialog v-model="open">
        <div class="space-y-3">
            <!-- 目标颜色：色轮取色 + 参考图主色 -->
            <section class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <SectionHeader no-animate compact kicker="TARGET" title="目标颜色" class="pr-7">
                    <template #trailing>
                        <span v-if="partLabel" class="shrink-0 text-[11px] text-base-content/45">{{ partLabel }}</span>
                    </template>
                </SectionHeader>
                <div class="grid gap-3 sm:grid-cols-[240px_minmax(0,1fr)]">
                    <ColorHsvPicker v-model="targetHex" />

                    <div class="min-w-0">
                        <div
                            class="relative overflow-hidden rounded-xs border border-dashed border-base-content/20 bg-base-content/3"
                            @dragover.prevent="dragging = true"
                            @dragleave.prevent="dragging = false"
                            @drop.prevent="handleDrop"
                        >
                            <img v-if="refImageUrl" :src="refImageUrl" alt="参考图" class="max-h-32 w-full object-contain" />
                            <div v-else class="flex flex-col items-center gap-1.5 px-3 py-6 text-center text-xs text-base-content/45">
                                <Icon icon="ri:image-add-line" class="size-5" />
                                <span>上传参考图提取主色</span>
                                <span class="text-[11px]">支持拖拽、粘贴（截图）或点击选择</span>
                            </div>
                            <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleFileInput" />
                            <div
                                v-if="dragging"
                                class="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10 text-xs"
                            >
                                松开以提取主色
                            </div>
                        </div>

                        <div class="mt-2 flex flex-wrap items-center gap-1.5">
                            <button
                                v-for="(color, index) in paletteColors"
                                :key="index"
                                class="size-6 shrink-0 cursor-pointer rounded-xs border transition-transform duration-150 hover:scale-110"
                                :class="
                                    rgbToHex(color) === targetHex.toLowerCase()
                                        ? 'border-primary ring-1 ring-primary'
                                        : 'border-base-content/20'
                                "
                                :style="{ backgroundColor: rgbToHex(color) }"
                                type="button"
                                :title="rgbToHex(color)"
                                @click="targetHex = rgbToHex(color)"
                            />
                            <button
                                class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                                type="button"
                                @click="fileInputRef?.click()"
                            >
                                {{ refImageUrl ? "更换参考图" : "选择图片" }}
                            </button>
                            <button
                                v-if="refImageUrl"
                                class="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-xs border border-base-content/20 px-2 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-error/60 hover:text-error active:scale-[0.97]"
                                type="button"
                                @click="clearReferenceImage"
                            >
                                移除
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 相似色结果：按 ΔE 升序 -->
            <section class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <SectionHeader no-animate compact kicker="MATCH" title="相似色板" :count="results.length" />

                <div class="mb-2 flex items-center gap-2">
                    <span class="shrink-0 text-[11px] tracking-wide text-base-content/55">色差上限 ΔE</span>
                    <input v-model.number="threshold" type="range" min="2" max="60" step="1" class="range range-primary range-xs flex-1" />
                    <span class="w-7 shrink-0 text-right font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ threshold }}</span>
                </div>

                <div v-if="results.length" class="flex max-h-80 flex-col gap-1.5 overflow-y-auto pr-0.5">
                    <button
                        v-for="item in results"
                        :key="item.swatch.id"
                        class="flex w-full items-center gap-2.5 rounded-xs border px-2.5 py-1.5 text-left transition-colors duration-150"
                        :class="[
                            item.swatch.id === currentColorId
                                ? 'border-primary/70 bg-primary/10'
                                : 'border-base-content/15 hover:border-primary/40 hover:bg-base-content/5',
                            isUsable(item.swatch) ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
                        ]"
                        type="button"
                        :title="isUsable(item.swatch) ? dyeName(item.swatch) : '该部位不能使用此染剂'"
                        @click="emit('select', item.swatch)"
                    >
                        <span
                            class="size-5 shrink-0 rounded-xs border border-base-content/20"
                            :style="{ backgroundColor: formatSkinColorizeRgb(item.swatch.rgb) }"
                            aria-hidden="true"
                        />
                        <span class="min-w-0 flex-1 truncate text-xs">{{ dyeName(item.swatch) }}</span>
                        <CopyID :id="item.swatch.id" class="shrink-0" />
                        <ResourceCostItem
                            mini
                            :name="dyeName(item.swatch)"
                            :value="[1, dyeResourceId(item.swatch), 'Resource']"
                            class="w-9 shrink-0"
                        />
                        <span class="flex shrink-0 items-center gap-1 text-[10px] text-base-content/45">
                            ΔE
                            <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                                item.deltaE.toFixed(1)
                            }}</span>
                        </span>
                    </button>
                </div>
                <div v-else class="py-3 text-center text-xs text-base-content/45">
                    没有 ΔE 不超过 {{ threshold }} 的色板，试试放宽上限
                </div>
            </section>
        </div>
    </SourceDetailDialog>
</template>
