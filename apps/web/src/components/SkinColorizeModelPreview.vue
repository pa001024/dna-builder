<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { formatFileSize } from "@/utils/app-download"
import type { SkinModelRenderer } from "@/utils/skin-model-renderer"
import { downloadModel, markModelParsing, modelDownloadState, resetModelDownloadState } from "@/utils/skin-model-runtime"

const props = defineProps<{
    skinId?: number
    colorIds: number[]
    hairColorIds?: number[]
}>()
const host = ref<HTMLElement>()
const fileInput = ref<HTMLInputElement>()
const loading = ref(false)
const error = ref("")
const ready = ref(false)
let viewer: SkinModelRenderer | undefined
let objectUrl = ""
let generation = 0
let mounted = false
let controller: AbortController | undefined
let visibilityObserver: IntersectionObserver | undefined

/** 已下载 / 总大小，用于进度条 */
const download = modelDownloadState
const percent = computed(() => {
    const { total, loaded } = download.value
    if (!total) return 0
    return Math.min(100, Math.round((loaded / total) * 100))
})

const formatBytes = (bytes: number): string => (bytes > 0 ? formatFileSize(bytes) : "0 B")

async function load(skinId: number, url?: string) {
    const current = ++generation
    controller?.abort()
    controller = undefined
    viewer?.dispose()
    viewer = undefined
    ready.value = false
    error.value = ""
    loading.value = true
    resetModelDownloadState()
    try {
        const { SkinModelRenderer } = await import("@/utils/skin-model-renderer")
        if (current !== generation || !host.value) return
        let source = url
        if (!source) {
            controller = new AbortController()
            source = await downloadModel(skinId, controller.signal)
            if (current !== generation) return
        } else markModelParsing()
        const next = new SkinModelRenderer(host.value)
        viewer = next
        await next.load(source)
        if (current !== generation) return
        next.setColors(props.colorIds, props.hairColorIds)
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

function selectFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = URL.createObjectURL(file)
    void load(0, objectUrl)
}

watch(() => [props.colorIds, props.hairColorIds], () => viewer?.setColors(props.colorIds, props.hairColorIds), { deep: true })
watch(
    () => props.skinId,
    id => {
        if (!mounted) return
        if (id) void load(id)
        else {
            generation++
            controller?.abort()
            viewer?.dispose()
            viewer = undefined
            loading.value = false
            ready.value = false
            resetModelDownloadState()
        }
    }
)
onMounted(() => {
    mounted = true
    // 预览列独立滚动，滚出视野后暂停渲染循环（动画 rAF 每帧都跑 renderer.render）
    visibilityObserver = new IntersectionObserver(entries => {
        for (const entry of entries) viewer?.setVisible(entry.isIntersecting)
    })
    if (host.value) visibilityObserver.observe(host.value)
    if (props.skinId) void load(props.skinId)
})
onBeforeUnmount(() => {
    mounted = false
    generation++
    controller?.abort()
    visibilityObserver?.disconnect()
    viewer?.dispose()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
})
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="3D" :title="$t('skin-colorize.model_title')">
            <template #trailing>
                <div v-if="skinId" class="ml-auto flex gap-2">
                    <button class="btn btn-xs btn-ghost" type="button" :disabled="!ready" @click="viewer?.resetCamera()">
                        {{ $t("skin-colorize.model_reset") }}
                    </button>
                    <button class="btn btn-xs btn-outline" type="button" @click="fileInput?.click()">
                        {{ $t("skin-colorize.model_open") }}
                    </button>
                </div>
            </template>
        </SectionHeader>
        <input ref="fileInput" type="file" accept=".glb" class="hidden" @change="selectFile" />
        <div v-if="!skinId" class="py-8 text-center text-sm text-base-content/50">
            {{ $t("skin-colorize.model_unsupported") }}
        </div>
        <div v-else>
            <div class="relative">
                <div
                    ref="host"
                    class="h-110 w-full overflow-hidden rounded-xs bg-[radial-gradient(ellipse_at_50%_35%,var(--color-base-200),var(--color-base-300))] sm:h-140"
                    :aria-label="$t('skin-colorize.model_title')"
                    :aria-busy="loading"
                />
                <div
                    v-if="loading && !error"
                    class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-linear-to-t from-base-100/90 to-transparent p-4 text-xs text-base-content/70"
                >
                    <div class="flex items-baseline justify-between gap-3">
                        <span class="font-medium">
                            {{ download.stage === "ready" ? $t("skin-colorize.model_parsing") : $t("skin-colorize.model_downloading") }}
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
                <div v-if="error" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-base-content/60">
                    <p>{{ $t("skin-colorize.model_error") }}</p>
                    <p class="break-all font-mono text-xs">{{ error }}</p>
                    <button class="btn btn-sm btn-outline" type="button" @click="fileInput?.click()">{{ $t("skin-colorize.model_open") }}</button>
                </div>
            </div>
            <p class="mt-2 text-[11px] leading-relaxed text-base-content/50">{{ $t("skin-colorize.model_notice") }}</p>
        </div>
    </section>
</template>
