<script lang="ts" setup>
import { computed, markRaw, onMounted, onUnmounted, ref, shallowRef } from "vue"
import UMapWebSceneViewer from "@/components/UMapWebSceneViewer.vue"
import { env } from "@/env"
import { parseSceneBundleFile, type SceneBundleData, type SceneManifest } from "@/utils/umap-scene"

const manifest = ref<SceneManifest | null>(null)
const bundleData = shallowRef<SceneBundleData | null>(null)
const importError = ref("")
const defaultBundlePath = computed(() => {
    const searchParams = new URLSearchParams(window.location.search)
    return searchParams.get("map") || new URL("/maps/region-1017-full-cache.scene.umapscene", env.endpoint).toString()
})

const directorySummary = computed(() => {
    if (!manifest.value) return ""
    return `${manifest.value.regionId} ${manifest.value.regionName} · ${manifest.value.meshes.length} 个网格 · ${manifest.value.instances.length} 个实例`
})

/**
 * 释放旧的 object URL，避免多次导入后堆积。
 */
function revokeFileUrls() {
    bundleData.value = null
}

/**
 * 导入单文件场景包。
 */
async function handleBundleImport(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    revokeFileUrls()
    importError.value = ""
    manifest.value = null

    try {
        const { nextManifest, nextBundleData } = await parseSceneBundleFile(file)
        manifest.value = nextManifest
        bundleData.value = markRaw(nextBundleData)
    } catch (error) {
        console.error("读取单文件场景包失败", error)
        importError.value = error instanceof Error ? error.message : "无法解析 scene.umapscene"
    } finally {
        input.value = ""
    }
}

/**
 * 从远程地址加载默认场景包，避免把大地图文件纳入前端构建输入。
 */
async function loadBundleFromPublic(bundlePath: string) {
    revokeFileUrls()
    importError.value = ""
    manifest.value = null

    try {
        const response = await fetch(bundlePath)
        if (!response.ok) {
            throw new Error(`读取场景包失败: ${bundlePath}`)
        }

        const file = new File([await response.arrayBuffer()], bundlePath.split("/").at(-1) || "scene.umapscene", {
            type: "application/octet-stream",
        })
        const { nextManifest, nextBundleData } = await parseSceneBundleFile(file)
        manifest.value = nextManifest
        bundleData.value = markRaw(nextBundleData)
    } catch (error) {
        console.error("读取公开场景包失败", error)
        importError.value = error instanceof Error ? error.message : "无法加载默认 scene.umapscene"
    }
}

/**
 * 页面卸载时释放单文件包缓存。
 */
onUnmounted(() => {
    revokeFileUrls()
})

/**
 * 页面加载时自动读取 `public/maps` 下的默认单文件场景。
 */
onMounted(() => {
    void loadBundleFromPublic(defaultBundlePath.value)
})
</script>

<template>
    <div class="h-full min-h-0 bg-base-100">
        <div class="grid h-full min-h-0 gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside class="flex min-h-0 flex-col border-r border-base-300 bg-base-200/50">
                <div class="space-y-4 border-b border-base-300 px-4 py-4">
                    <div>
                        <div class="text-lg font-semibold">UMap Web 场景</div>
                        <div class="mt-1 text-sm text-base-content/70">默认读取远程 `scene.umapscene`，也可手动导入本地文件覆盖</div>
                    </div>

                    <label
                        class="flex cursor-pointer flex-col gap-2 rounded-2xl border border-success/35 bg-success/5 px-4 py-4 transition-colors hover:border-success hover:bg-success/10"
                    >
                        <span class="text-sm font-medium">导入单文件包</span>
                        <span class="text-xs text-base-content/65">推荐生产环境使用 `scene.umapscene`，不依赖目录结构。</span>
                        <input type="file" class="hidden" accept=".umapscene" @change="handleBundleImport" />
                        <span class="btn btn-sm btn-success w-fit">选择单文件</span>
                    </label>

                    <div class="rounded-2xl bg-base-100 px-4 py-3 text-xs leading-5 text-base-content/75">
                        页面默认读取：
                        <br />
                        <span class="font-mono">{{ defaultBundlePath }}</span>
                        <br />
                        可用 `?map=https://example.com/xxx.umapscene` 切换场景文件
                    </div>

                    <div v-if="directorySummary" class="rounded-2xl border border-success/25 bg-success/10 px-4 py-3 text-xs text-success">
                        {{ directorySummary }}
                    </div>

                    <div v-if="importError" class="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-xs text-error">
                        {{ importError }}
                    </div>
                </div>
            </aside>

            <section class="min-h-0">
                <UMapWebSceneViewer :manifest="manifest" :bundle-data="bundleData" />
            </section>
        </div>
    </div>
</template>
