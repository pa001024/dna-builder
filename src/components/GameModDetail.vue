<script setup lang="ts">
import DOMPurify from "dompurify"
import { t } from "i18next"
import MarkdownIt from "markdown-it"
import { computed, onMounted, ref, watch } from "vue"
import { gameModQuery } from "@/api/gen/api-queries"
import type { GameMod } from "@/api/gen/api-types"
import { useModInstall } from "@/composables/useModInstall"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"

/**
 * MOD 详情页组件（弹窗与独立路由共用）：
 * 头部对齐首页设计语言（纸面 + 主色强调线 + 引导网格 + 斜切楔形），
 * 内容顺序：标题 + 基本信息 → 封面 → 描述 → 预览图轮播 → 版本列表 → 下载。
 * 自身包含 ScrollArea 滚动容器，由外部约束高度（flex-1 / h-full）。
 */
const props = withDefaults(
    defineProps<{
        /** MOD ID（用于拉取完整详情，含全部版本）。 */
        modId: string
        /** 已加载的 MOD（弹窗场景先展示列表项，再刷新完整数据）。 */
        initialMod?: GameMod | null
        /** 是否显示关闭按钮（弹窗场景）。 */
        closable?: boolean
    }>(),
    { initialMod: null, closable: false }
)

const emit = defineEmits<{
    close: []
    /** 安装成功后通知外部刷新本地列表。 */
    installed: []
}>()

const ui = useUIStore()
const user = useUserStore()

const mod = ref<GameMod | null>(props.initialMod)
const loading = ref(false)
/** 一键下载安装（详情页共用逻辑）。 */
const { installing, installSharedMod, installSharedVersion } = useModInstall(() => emit("installed"))

/** 封面大图预览实例（点击放大）。 */
const coverPreviewRef = ref<InstanceType<typeof ImagePreview> | null>(null)

const isLoggedIn = computed(() => !!user.jwtToken)

/** markdown 渲染器（与指南详情页一致：禁 HTML、允许链接化）。 */
const md = MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: true,
})

/**
 * @description 将 markdown 文本渲染为安全的 HTML。
 * @param text markdown 源文本。
 * @returns 净化后的 HTML。
 */
function renderMarkdown(text: string): string {
    return DOMPurify.sanitize(md.render(text))
}

/**
 * @description 将来源文本渲染为安全 HTML：先转义全部内容，再把其中的 http/https 链接替换为可点击的 <a> 标签。
 * @param text 来源文本（任意内容）。
 * @returns 安全 HTML。
 */
function renderSourceLinks(text: string): string {
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    return escaped.replace(/(https?:\/\/[^\s<>"'（）()，。；、,;:！!?？]+)/gi, link => {
        const clean = link.replace(/[，。；、,.;:！!?？]+$/, "")
        return `<a href="${clean}" target="_blank" rel="noopener noreferrer" class="link link-primary">${clean}</a>`
    })
}

/** 分类显示名 */
function categoryLabel(category: string) {
    return (
        {
            char: t("game-launcher.char"),
            weapon: t("game-launcher.weapon"),
            other: t("game-launcher.other"),
            standalone: t("game-launcher.standalone"),
        }[category] || category
    )
}

/**
 * @description 拉取 MOD 完整详情（network-only，含全部版本），失败时保留已有数据。
 */
async function loadDetail() {
    loading.value = true
    try {
        const full = await gameModQuery({ id: props.modId }, { requestPolicy: "network-only" })
        if (full) mod.value = full
    } catch (error) {
        console.error("加载 MOD 详情失败:", error)
        if (!mod.value) {
            ui.showErrorMessage(t("game-launcher.loadShareFailed", { error: error instanceof Error ? error.message : String(error) }))
        }
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    void loadDetail()
})

// 路由复用（同一组件实例切换不同 id）时重新加载
watch(
    () => props.modId,
    () => {
        void loadDetail()
    }
)
</script>

<template>
    <div class="flex min-h-0 flex-col">
        <!-- 加载中 -->
        <div v-if="!mod && loading" class="flex-1 flex items-center justify-center opacity-60">
            <span class="loading loading-spinner loading-md"></span>
        </div>
        <!-- 加载失败 / 未找到 -->
        <div v-else-if="!mod" class="flex-1 flex flex-col items-center justify-center gap-2 text-base-content/50">
            <Icon icon="ri:file-zip-line" class="size-12 opacity-40" />
            <span class="text-sm">{{ $t("mods-detail.loadFailed") }}</span>
        </div>
        <template v-else>
            <!-- 头部：标题 + 基本信息（首页设计语言：纸面 + 主色强调线 + 引导网格 + 斜切楔形） -->
            <header class="relative flex-none overflow-hidden border-b-2 border-primary bg-base-100">
                <!-- 引导线网格（装饰性，随主题明暗） -->
                <div
                    class="pointer-events-none absolute inset-0"
                    style="
                        background-image:
                            linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                            linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                        background-size: 52px 52px;
                        mask-image: linear-gradient(to bottom, black, transparent 85%);
                    "
                    aria-hidden="true"
                />
                <!-- 右上角斜切楔形 -->
                <span
                    class="pointer-events-none absolute top-0 right-0 h-10 w-10 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                    aria-hidden="true"
                />
                <div class="relative px-5 pt-4 pb-3">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        {{ categoryLabel(mod.category) }}
                    </p>
                    <div class="flex items-center gap-2 pr-10">
                        <h2 class="font-orbitron text-xl font-bold leading-none tracking-tight text-base-content truncate">
                            {{ mod.name }}
                        </h2>
                        <span v-if="mod.isRecommended" class="badge badge-warning badge-sm flex-none gap-1">
                            <Icon icon="ri:star-fill" class="size-3" />
                        </span>
                        <span v-if="mod.isPinned" class="badge badge-primary badge-sm flex-none gap-1">
                            <Icon icon="ri:pushpin-fill" class="size-3" />
                        </span>
                        <button
                            v-if="closable"
                            class="ml-auto btn btn-square btn-ghost btn-sm flex-none"
                            aria-label="关闭"
                            @click="emit('close')"
                        >
                            <Icon icon="ri:close-line" class="size-4" />
                        </button>
                    </div>
                    <!-- 基本信息 -->
                    <div class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-base-content/60">
                        <span class="flex items-center gap-1">
                            <Icon icon="ri:user-line" class="size-3.5" />
                            {{ mod.user?.name || "—" }}
                        </span>
                        <span class="h-3 w-px bg-base-content/40" aria-hidden="true" />
                        <span class="flex items-center gap-1 font-orbitron tabular-nums">
                            <Icon icon="ri:eye-line" class="size-3.5" />
                            {{ mod.views }}
                        </span>
                        <span class="h-3 w-px bg-base-content/40" aria-hidden="true" />
                        <span class="flex items-center gap-1 font-orbitron tabular-nums">
                            <Icon icon="ri:download-2-line" class="size-3.5" />
                            {{ mod.downloads }}
                        </span>
                        <span class="h-3 w-px bg-base-content/40" aria-hidden="true" />
                        <span class="flex items-center gap-1">
                            <Icon icon="ri:time-line" class="size-3.5" />
                            {{ new Date(mod.createdAt).toLocaleString() }}
                        </span>
                        <span v-if="mod.entity" class="badge badge-sm badge-primary gap-1 flex-none">
                            <Icon icon="ri:gamepad-line" class="size-3" />
                            {{ mod.entity }}
                        </span>
                        <span v-for="req in mod.requires" :key="req" class="badge badge-sm badge-warning flex-none">
                            {{ req }}
                        </span>
                        <span v-if="!mod.source" class="badge badge-sm badge-primary gap-1 flex-none">
                            <Icon icon="ri:pencil-fill" class="size-3" />
                            {{ $t("game-launcher.isOriginal") }}
                        </span>
                        <span v-else class="flex items-center gap-1.5 min-w-0">
                            <span class="badge badge-sm badge-ghost gap-1 flex-none">
                                <Icon icon="ri:external-link-line" class="size-3" />
                                {{ $t("game-launcher.reprint") }}
                            </span>
                            <span class="min-w-0 break-all leading-5" v-html="renderSourceLinks(mod.source || '')"></span>
                        </span>
                    </div>
                </div>
            </header>

            <!-- 滚动内容区 -->
            <ScrollArea class="flex-1 min-h-0">
                <div class="p-4 flex flex-col gap-4">
                    <!-- 封面（高度上限为宽度的 3/4：扁图按自身比例以更低高度显示，竖图等比缩小并居中；点击放大） -->
                    <div class="group relative @container overflow-hidden rounded-xs border border-base-content/10 bg-base-200/50">
                        <button
                            v-if="mod.coverUrl"
                            type="button"
                            class="block w-full cursor-zoom-in"
                            @click="coverPreviewRef?.openFromUrls(mod.coverUrl || '', mod.coverUrl || '')"
                        >
                            <img :src="mod.coverUrl" :alt="mod.name" draggable="false" class="h-auto max-h-[75cqw] w-full object-contain" />
                        </button>
                        <div v-else class="flex aspect-4/3 w-full items-center justify-center opacity-50">
                            <Icon icon="ri:image-line" class="size-12" />
                        </div>
                        <!-- 放大提示 -->
                        <span
                            v-if="mod.coverUrl"
                            class="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-base-100/80 px-2 py-1 text-[11px] text-base-content/70 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
                        >
                            <Icon icon="ri:zoom-in-line" class="size-3.5" />
                        </span>
                        <!-- 大图预览（点击放大，manual 模式仅提供 openFromUrls） -->
                        <ImagePreview ref="coverPreviewRef" manual thumb-url="" full-url="" />
                    </div>
                    <!-- 描述（markdown 渲染） -->
                    <div v-if="mod.description" class="mod-markdown text-sm" v-html="renderMarkdown(mod.description)"></div>

                    <!-- 预览图轮播（左右按钮切换） -->
                    <div class="space-y-2">
                        <div class="text-xs text-base-content/80">预览图</div>
                        <ImageCarousel v-if="(mod.images?.length ?? 0) > 0" :images="mod.images || []" :alt="mod.name" />
                    </div>

                    <!-- 版本列表 -->
                    <div v-if="mod.versions?.length" class="flex flex-col gap-1.5">
                        <div class="text-sm font-semibold flex items-center gap-1.5">
                            <Icon icon="ri:stack-line" class="size-4 text-primary" />
                            {{ $t("game-launcher.versionHistory") }}
                        </div>
                        <div
                            v-for="(version, index) in mod.versions"
                            :key="version.id"
                            class="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200/50 px-2.5 py-2"
                        >
                            <Icon icon="ri:file-zip-line" class="size-5 text-primary/70 flex-none" />
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="text-sm font-medium">{{ version.version }}</span>
                                    <span v-if="index === 0" class="badge badge-xs badge-primary">{{ $t("game-launcher.latest") }}</span>
                                    <span class="text-[11px] opacity-50">
                                        {{ new Date(version.createdAt).toLocaleString() }} ·
                                        {{ (version.fileSize / 1024 / 1024).toFixed(2) }} MB · {{ version.downloads }} 下载
                                    </span>
                                </div>
                                <div v-if="version.changelog" class="text-xs opacity-70 line-clamp-2">{{ version.changelog }}</div>
                            </div>
                            <button
                                v-if="isLoggedIn"
                                class="btn btn-sm btn-ghost btn-square"
                                :class="{ 'btn-disabled': installing === `${mod.id}:${version.id}` }"
                                :data-tip="$t('game-launcher.download')"
                                @click="installSharedVersion(mod, version)"
                            >
                                <span v-if="installing === `${mod.id}:${version.id}`" class="loading loading-spinner loading-xs"></span>
                                <Icon v-else icon="ri:download-2-line" class="size-4" />
                            </button>
                        </div>
                    </div>

                    <button
                        v-if="isLoggedIn"
                        class="btn btn-primary"
                        :class="{ 'btn-disabled': installing === mod.id }"
                        @click="installSharedMod(mod)"
                    >
                        <span v-if="installing === mod.id" class="loading loading-spinner loading-xs"></span>
                        <Icon v-else icon="ri:download-2-line" class="size-4" />
                        {{ installing === mod.id ? $t("game-launcher.installing") : $t("game-launcher.downloadLatest") }}
                    </button>
                    <button v-else class="btn btn-ghost" disabled>
                        <Icon icon="ri:lock-line" class="size-4" />
                        {{ $t("game-launcher.loginToDownload") }}
                    </button>
                </div>
            </ScrollArea>
        </template>
    </div>
</template>

<style>
/* MOD 详情的 markdown 渲染样式（v-html 内容不受 scoped 样式影响，使用普通样式块） */
.mod-markdown {
    color: var(--color-base-content);
    line-height: 1.65;
}
.mod-markdown h1,
.mod-markdown h2,
.mod-markdown h3,
.mod-markdown h4 {
    font-weight: 700;
    margin: 0.7em 0 0.35em;
    line-height: 1.3;
}
.mod-markdown h1 {
    font-size: 1.35em;
}
.mod-markdown h2 {
    font-size: 1.2em;
}
.mod-markdown h3 {
    font-size: 1.08em;
}
.mod-markdown p {
    margin: 0.4em 0;
}
.mod-markdown ul {
    list-style: disc;
    padding-left: 1.4em;
    margin: 0.4em 0;
}
.mod-markdown ol {
    list-style: decimal;
    padding-left: 1.4em;
    margin: 0.4em 0;
}
.mod-markdown li {
    margin: 0.15em 0;
}
.mod-markdown code {
    background: color-mix(in oklab, var(--color-base-content) 10%, transparent);
    padding: 0.1em 0.35em;
    border-radius: 4px;
    font-size: 0.9em;
}
.mod-markdown pre {
    background: color-mix(in oklab, var(--color-base-content) 8%, transparent);
    padding: 0.75em;
    border-radius: 8px;
    overflow-x: auto;
    margin: 0.5em 0;
}
.mod-markdown pre code {
    background: transparent;
    padding: 0;
}
.mod-markdown blockquote {
    border-left: 3px solid color-mix(in oklab, var(--color-primary) 60%, transparent);
    padding-left: 0.75em;
    margin: 0.5em 0;
    opacity: 0.85;
}
.mod-markdown a {
    color: var(--color-primary);
    text-decoration: underline;
}
.mod-markdown img {
    max-width: 100%;
    border-radius: 8px;
}
.mod-markdown hr {
    border-color: color-mix(in oklab, var(--color-base-content) 20%, transparent);
    margin: 0.75em 0;
}
.mod-markdown table {
    border-collapse: collapse;
    margin: 0.5em 0;
    font-size: 0.95em;
}
.mod-markdown th,
.mod-markdown td {
    border: 1px solid color-mix(in oklab, var(--color-base-content) 25%, transparent);
    padding: 0.3em 0.6em;
}
.mod-markdown th {
    background: color-mix(in oklab, var(--color-base-content) 8%, transparent);
    font-weight: 600;
}
</style>
