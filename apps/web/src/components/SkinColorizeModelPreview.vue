<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { formatFileSize } from "@/utils/app-download"
import type { SkinModelRenderer } from "@/utils/skin-model-renderer"
import { downloadModel, modelDownloadState, resetModelDownloadState } from "@/utils/skin-model-runtime"

const props = defineProps<{
    skinId?: number
    colorIds: number[]
    hairColorIds?: number[]
    /** 全屏预览的挂载容器（页面内容区域），由页面提供；缺省时不显示全屏入口。 */
    fullscreenTarget?: HTMLElement
    /** 右侧面板与主内容并排时才区分「主内容区域 / 全部区域」，堆叠布局下隐藏范围切换。 */
    fullscreenScopeToggle?: boolean
}>()

/** 全屏预览开关：打开后渲染层 Teleport 到页面提供的内容区域容器。 */
const fullscreen = defineModel<boolean>("fullscreen", { default: false })
/** 全屏覆盖范围：false = 主内容区域（不含右侧面板），true = 全部区域。 */
const fullscreenAll = defineModel<boolean>("fullscreenAll", { default: false })

const host = ref<HTMLElement>()
const loading = ref(false)
const error = ref("")
const ready = ref(false)
/** 是否展开：默认折叠，首次展开后才下载并解析模型（避免进页面就拉几十 MB 资源）。 */
const expanded = ref(false)
let viewer: SkinModelRenderer | undefined
let generation = 0
let mounted = false
let controller: AbortController | undefined
let visibilityObserver: IntersectionObserver | undefined
/** 渲染器上的装载是串行的：同一实例不能同时解析两个模型（互相清场景） */
let renderChain: Promise<unknown> = Promise.resolve()

/** 已下载 / 总大小，用于进度条 */
const download = modelDownloadState
const percent = computed(() => {
    const { total, loaded } = download.value
    if (!total) return 0
    return Math.min(100, Math.round((loaded / total) * 100))
})

const formatBytes = (bytes: number): string => (bytes > 0 ? formatFileSize(bytes) : "0 B")

/** 渲染区域右上角图标按钮的统一样式。 */
const controlClass = "btn btn-square btn-sm border-base-content/10 bg-base-100/70 backdrop-blur-sm"

/** 渲染层是否挂到页面的全屏容器：收起面板后回到行内。 */
const teleporting = computed(() => expanded.value && fullscreen.value && !!props.fullscreenTarget)
/** Teleport 在 disabled 时不会解析目标，这里给个占位值满足类型。 */
const teleportTarget = computed<HTMLElement | string>(() => props.fullscreenTarget ?? "body")

async function load(skinId: number) {
    const current = ++generation
    controller?.abort()
    controller = undefined
    ready.value = false
    error.value = ""
    loading.value = true
    resetModelDownloadState()
    try {
        const { SkinModelRenderer } = await import("@/utils/skin-model-renderer")
        if (current !== generation || !host.value) return
        controller = new AbortController()
        const source = await downloadModel(skinId, controller.signal)
        if (current !== generation) return
        // 复用同一个 WebGL 上下文：每换一个皮肤都新建渲染器要重建上下文、重新链接十几个
        // 着色器程序并重建 PMREM（实测比下载还慢），这里只换模型。
        if (!viewer) viewer = new SkinModelRenderer(host.value)
        const next = viewer
        next.setVisible(expanded.value)
        const pending = renderChain.then(() => next.load(source))
        renderChain = pending.catch(() => {})
        await pending
        if (current !== generation) return
        next.setColors(props.colorIds, props.hairColorIds)
        next.setVisible(expanded.value)
        ready.value = true
    } catch (cause) {
        if (current !== generation) return
        viewer?.dispose()
        viewer = undefined
        error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
        if (current === generation) loading.value = false
    }
}

/** 重置相机视角。 */
function resetCamera() {
    viewer?.resetCamera()
}

/** 挂载位置变化后重新取景：等 ResizeObserver 按新画布尺寸更新宽高比再算距离。 */
function refitAfterResize() {
    requestAnimationFrame(() => requestAnimationFrame(() => viewer?.resetCamera()))
}

/** 全屏 / 退出全屏：只切换渲染层的挂载位置，模型与 WebGL 上下文保持不变。 */
function toggleFullscreen() {
    if (!props.fullscreenTarget) return
    fullscreen.value = !fullscreen.value
    if (!fullscreen.value) fullscreenAll.value = false
    refitAfterResize()
}

/** 全屏覆盖范围：主内容区域 ↔ 全部区域。 */
function toggleFullscreenScope() {
    fullscreenAll.value = !fullscreenAll.value
    refitAfterResize()
}

/** 展开 / 收起：首次展开时才下载并解析模型；收起只暂停渲染，已加载的模型保留。 */
function toggleExpanded() {
    expanded.value = !expanded.value
    if (!expanded.value) {
        fullscreen.value = false
        fullscreenAll.value = false
        viewer?.setVisible(false)
        return
    }
    if (props.skinId && !ready.value && !loading.value) void load(props.skinId)
    else viewer?.setVisible(true)
}

/** 全屏时 Esc 退出：与渲染区域右上角的退出按钮同一路径。 */
function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !fullscreen.value) return
    fullscreen.value = false
    fullscreenAll.value = false
}

/** 容器出现 / 更换时重新挂观察（宿主节点随 skinId 有无而创建，不能只在 mounted 里观察一次）。 */
function observeHost() {
    if (!visibilityObserver) return
    visibilityObserver.disconnect()
    if (host.value) visibilityObserver.observe(host.value)
}

watch(() => [props.colorIds, props.hairColorIds], () => viewer?.setColors(props.colorIds, props.hairColorIds), { deep: true })
watch(
    () => props.skinId,
    id => {
        if (!mounted) return
        // 换皮肤：丢弃旧模型；展开状态下立即加载新模型，折叠时等下次展开再加载
        generation++
        controller?.abort()
        controller = undefined
        viewer?.dispose()
        viewer = undefined
        loading.value = false
        ready.value = false
        error.value = ""
        fullscreen.value = false
        fullscreenAll.value = false
        resetModelDownloadState()
        if (id && expanded.value) void load(id)
    }
)
watch(host, () => observeHost(), { flush: "post" })
onMounted(() => {
    mounted = true
    window.addEventListener("keydown", onKeydown)
    // 预览列独立滚动，滚出视野后暂停渲染循环（动画 rAF 每帧都跑 renderer.render）
    visibilityObserver = new IntersectionObserver(entries => {
        for (const entry of entries) viewer?.setVisible(entry.isIntersecting && expanded.value)
    })
    observeHost()
})
onBeforeUnmount(() => {
    mounted = false
    generation++
    controller?.abort()
    window.removeEventListener("keydown", onKeydown)
    visibilityObserver?.disconnect()
    viewer?.dispose()
    viewer = undefined
})
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <div
            class="cursor-pointer select-none"
            role="button"
            tabindex="0"
            :aria-expanded="expanded"
            @click="toggleExpanded"
            @keydown.enter.prevent="toggleExpanded"
            @keydown.space.prevent="toggleExpanded"
        >
            <SectionHeader no-animate compact kicker="3D" :title="$t('skin-colorize.model_title')">
                <template #trailing>
                    <span class="flex shrink-0 items-center gap-1 text-[11px] text-base-content/45">
                        {{ expanded ? $t("skin-colorize.model_collapse") : $t("skin-colorize.model_expand") }}
                        <Icon icon="ri:arrow-down-s-line" class="size-4 transition-transform duration-200" :class="{ 'rotate-180': expanded }" />
                    </span>
                </template>
            </SectionHeader>
        </div>
        <div v-show="expanded">
            <div v-if="!skinId" class="py-8 text-center text-sm text-base-content/50">
                {{ $t("skin-colorize.model_unsupported") }}
            </div>
            <template v-else>
                <Teleport :to="teleportTarget" :disabled="!teleporting">
                    <div class="relative" :class="fullscreen ? 'pointer-events-auto h-full w-full' : ''">
                        <div
                            ref="host"
                            class="w-full overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,var(--color-base-200),var(--color-base-300))]"
                            :class="fullscreen ? 'h-full' : 'h-110 rounded-xs sm:h-140'"
                            :aria-label="$t('skin-colorize.model_title')"
                            :aria-busy="loading"
                        />
                        <!-- 渲染区域右上角：重置视角 / 全屏范围 / 全屏 / 收起 -->
                        <div class="absolute top-2 right-2 z-10 flex items-center gap-1.5">
                            <button
                                :class="controlClass"
                                type="button"
                                :title="$t('skin-colorize.model_reset')"
                                :disabled="!ready"
                                @click.stop="resetCamera"
                            >
                                <Icon icon="ri:restart-line" class="size-4" />
                            </button>
                            <button
                                v-if="fullscreen && fullscreenScopeToggle"
                                :class="controlClass"
                                type="button"
                                :title="fullscreenAll ? $t('skin-colorize.model_scope_main') : $t('skin-colorize.model_scope_all')"
                                @click.stop="toggleFullscreenScope"
                            >
                                <Icon :icon="fullscreenAll ? 'ri:contract-right-line' : 'ri:expand-right-line'" class="size-4" />
                            </button>
                            <button
                                v-if="fullscreenTarget"
                                :class="controlClass"
                                type="button"
                                :title="fullscreen ? $t('skin-colorize.model_fullscreen_exit') : $t('skin-colorize.model_fullscreen')"
                                @click.stop="toggleFullscreen"
                            >
                                <Icon :icon="fullscreen ? 'ri:fullscreen-exit-line' : 'ri:fullscreen-line'" class="size-4" />
                            </button>
                            <button
                                :class="controlClass"
                                type="button"
                                :title="$t('skin-colorize.model_collapse')"
                                @click.stop="toggleExpanded"
                            >
                                <Icon icon="ri:arrow-up-s-line" class="size-4" />
                            </button>
                        </div>
                        <div
                            v-if="loading && !error"
                            class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-linear-to-t from-base-100/90 to-transparent p-4 text-xs text-base-content/70"
                        >
                            <div class="flex items-baseline justify-between gap-3">
                                <span class="font-medium">
                                    {{
                                        download.stage === "ready"
                                            ? $t("skin-colorize.model_parsing")
                                            : $t("skin-colorize.model_downloading")
                                    }}
                                </span>
                                <span class="tabular-nums">
                                    <template v-if="download.total">
                                        {{ formatBytes(download.loaded) }} / {{ formatBytes(download.total) }} · {{ percent }}%
                                    </template>
                                </span>
                            </div>
                            <progress
                                class="progress progress-primary h-1 w-full"
                                :value="download.total ? percent : undefined"
                                max="100"
                            />
                            <div class="flex items-baseline justify-between gap-3 text-[11px] text-base-content/50">
                                <span>{{ $t("skin-colorize.model_size") }}：{{ formatBytes(download.total) }}</span>
                                <span v-if="download.speedBps" class="tabular-nums">{{ formatBytes(download.speedBps) }}/s</span>
                            </div>
                        </div>
                        <div
                            v-if="error"
                            class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-base-content/60"
                        >
                            <p>{{ $t("skin-colorize.model_error") }}</p>
                            <p class="break-all font-mono text-xs">{{ error }}</p>
                        </div>
                    </div>
                </Teleport>
                <p v-if="!fullscreen" class="mt-2 text-[11px] leading-relaxed text-base-content/50">
                    {{ $t("skin-colorize.model_notice") }}
                </p>
            </template>
        </div>
    </section>
</template>
