<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
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

/** 已下载 / 总大小，用于进度条 */
const download = modelDownloadState
const percent = computed(() => {
    const { total, loaded } = download.value
    if (!total) return 0
    return Math.min(100, Math.round((loaded / total) * 100))
})

function formatBytes(bytes: number): string {
    if (!bytes) return "0 B"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
    if (props.skinId) void load(props.skinId)
})
onBeforeUnmount(() => {
    mounted = false
    generation++
    controller?.abort()
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
                    class="h-[440px] w-full overflow-hidden rounded-xs bg-[radial-gradient(ellipse_at_50%_35%,var(--color-base-200),var(--color-base-300))] sm:h-[560px]"
                    :aria-label="$t('skin-colorize.model_title')"
                    :aria-busy="loading"
                    data-skin-model
                    :data-ready="ready"
                />
                <div
                    v-if="loading && !error"
                    class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-base-100/90 to-transparent p-4 text-xs text-base-content/70"
                    data-model-progress
                    :data-stage="download.stage"
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
                        :data-percent="percent"
                        :data-loaded="download.loaded"
                        :data-total="download.total"
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
