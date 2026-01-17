<script setup lang="ts">
import DOMPurify from "dompurify"
import MarkdownIt from "markdown-it"
import { computed, nextTick, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { Guide, guideQuery, likeGuideMutation, unlikeGuideMutation } from "@/api/graphql"
import { charMap } from "../data"

const md = MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: true,
})

function renderMarkdown(text: string): string {
    return DOMPurify.sanitize(md.render(text))
}

const router = useRouter()
const { id } = router.currentRoute.value.params

const loading = ref(false)
const guide = ref<Guide | null>(null)
const scrollAreaRef = ref<HTMLElement | null>(null)
const isUserAtBottom = ref<boolean>(true)

async function fetchGuide() {
    loading.value = true
    try {
        const result = await guideQuery({
            id: id as string,
        })

        if (result) {
            guide.value = result
        }
    } finally {
        loading.value = false
    }
}

const canShowBuild = computed(() => {
    return guide.value?.charId && guide.value?.buildId
})

const charName = computed(() => {
    if (!guide.value?.charId) return ""
    const char = charMap.get(guide.value.charId)
    return char?.名称 || ""
})

const renderedContent = computed(() => {
    if (!guide.value?.content) return ""
    return renderMarkdown(guide.value.content)
})

function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleString("zh-CN")
}

async function handleLike() {
    if (!guide.value) return

    try {
        if (guide.value.isLiked) {
            await unlikeGuideMutation({
                id: id as string,
            })
        } else {
            await likeGuideMutation({
                id: id as string,
            })
        }
        await fetchGuide()
    } catch (error) {
        console.error(error)
    }
}

function goToBuild() {
    if (!guide.value?.charId || !guide.value?.buildId) return

    const char = charMap.get(guide.value.charId)
    if (!char) return

    const buildId = guide.value.buildId

    router.push({ name: "char-build-code", params: { charId: guide.value.charId, buildId } })
}

function goToEdit() {
    if (!guide.value) return
    router.push({ name: "guide-edit", params: { id: id as string } })
}

function handleScroll(e: Event) {
    const target = e.target as HTMLElement
    const { scrollTop, scrollHeight, clientHeight } = target
    isUserAtBottom.value = scrollTop + clientHeight >= scrollHeight - 20
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        if (scrollAreaRef.value) {
            scrollAreaRef.value.scrollTop = scrollAreaRef.value.scrollHeight
        }
    })
}

function handleImageClick(index: number | string) {
    const idx = typeof index === "string" ? parseInt(index) : index
    const images = guide.value?.images || []
    if (images.length > idx) {
        const img = images[idx]
        window.open(img, "_blank")
    }
}

onMounted(async () => {
    await fetchGuide()
    await nextTick()
    scrollToBottom()
})
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="bg-base-300/50 backdrop-blur-sm p-4 border-b border-base-200">
            <div class="flex items-center gap-4">
                <h1 class="text-xl font-bold flex-1 line-clamp-1">
                    {{ guide?.title }}
                </h1>
                <div v-if="guide" class="badge badge-sm" :class="guide.type === 'text' ? 'badge-primary' : 'badge-secondary'">
                    {{ guide.type === "text" ? "图文" : "一图流" }}
                </div>
                <button v-if="guide?.user && guide?.userId === guide?.user?.id" class="btn btn-sm btn-ghost" @click="goToEdit">
                    <Icon icon="ri:edit-line" class="w-4 h-4" />
                </button>
            </div>
        </div>

        <ScrollArea ref="scrollAreaRef" class="flex-1" @scroll="handleScroll">
            <div v-if="loading" class="flex justify-center items-center h-full">
                <span class="loading loading-spinner" />
            </div>
            <div v-else-if="!guide" class="flex justify-center items-center h-full text-base-content/50">攻略不存在</div>
            <div v-else class="p-6 max-w-4xl mx-auto space-y-6">
                <div class="flex items-center gap-4 text-sm text-base-content/70">
                    <div class="flex items-center gap-2">
                        <div v-if="guide.user" class="avatar placeholder">
                            <div class="bg-neutral text-neutral-content rounded-full w-8 inline-flex justify-center items-center">
                                <QQAvatar :qq="guide.user.qq" :name="guide.user.name" />
                            </div>
                        </div>
                        <span>{{ guide.user?.name }}</span>
                    </div>
                    <span>{{ formatDate(guide.createdAt) }}</span>
                    <div class="flex items-center gap-4 ml-auto">
                        <div class="flex items-center gap-1">
                            <Icon icon="ri:eye-line" class="w-4 h-4" />
                            <span>{{ guide.views }}</span>
                        </div>
                        <button class="flex items-center gap-1 hover:scale-110 transition-transform" @click="handleLike">
                            <Icon
                                :icon="guide.isLiked ? 'ri:heart-fill' : 'ri:heart-line'"
                                class="w-4 h-4"
                                :class="guide.isLiked ? 'text-red-500' : ''"
                            />
                            <span>{{ guide.likes }}</span>
                        </button>
                    </div>
                </div>

                <div v-if="guide.charId" class="flex items-center gap-2 text-sm">
                    <span class="text-base-content/50">关联角色:</span>
                    <span class="badge badge-outline">{{ charName }}</span>
                </div>

                <div v-if="guide.type === 'image' && guide.images && guide.images.length > 0" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                            v-for="(image, index) in guide.images"
                            :key="index"
                            class="relative group cursor-pointer"
                            @click="handleImageClick(index)"
                        >
                            <img :src="image" class="w-full rounded-lg transition-transform group-hover:scale-105" />
                            <div
                                class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg flex items-center justify-center"
                            >
                                <div class="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Icon icon="ri:search-line" class="w-8 h-8" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="guide.content" class="markdown-content">
                    <div v-html="renderedContent" />
                </div>

                <div v-if="canShowBuild" class="card bg-base-200 border border-base-300">
                    <div class="card-body">
                        <h3 class="card-title text-lg">配装信息</h3>
                        <p class="text-sm text-base-content/70">此攻略包含配装信息，点击下方按钮可查看完整配装</p>
                        <div class="card-actions justify-end">
                            <button class="btn btn-primary" @click="goToBuild">
                                <Icon icon="ri:hammer-line" class="w-4 h-4" />
                                查看配装
                            </button>
                        </div>
                    </div>
                </div>

                <div v-if="guide.updateAt && guide.updateAt !== guide.createdAt" class="text-xs text-base-content/50 text-center">
                    最后更新: {{ formatDate(guide.updateAt) }}
                </div>
            </div>
        </ScrollArea>
    </div>
</template>

<style>
.markdown-content {
    line-height: 1.8;
    white-space: pre-wrap;
    word-wrap: break-word;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
    margin: 0.8em 0 0.4em 0;
    font-weight: 600;
}

.markdown-content h1 {
    font-size: 1.8em;
    border-bottom: 2px solid rgba(0, 0, 0, 0.1);
    padding-bottom: 0.3em;
}

.markdown-content h2 {
    font-size: 1.5em;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    padding-bottom: 0.2em;
}

.markdown-content h3 {
    font-size: 1.3em;
}

.markdown-content p {
    margin: 0.8em 0;
}

.markdown-content ul,
.markdown-content ol {
    margin: 0.8em 0;
    padding-left: 1.8em;
}

.markdown-content li {
    margin: 0.3em 0;
}

.markdown-content blockquote {
    margin: 1em 0;
    padding: 0.5em 1em;
    border-left: 4px solid rgba(0, 0, 0, 0.2);
    background-color: rgba(0, 0, 0, 0.05);
    color: rgba(0, 0, 0, 0.7);
}

.markdown-content pre {
    margin: 1em 0;
    padding: 1em;
    background-color: rgba(0, 0, 0, 0.05);
    border-radius: 8px;
    overflow-x: auto;
    border: 1px solid rgba(0, 0, 0, 0.1);
}

.markdown-content code {
    padding: 0.2em 0.5em;
    background-color: rgba(0, 0, 0, 0.08);
    border-radius: 4px;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    font-size: 0.9em;
}

.markdown-content pre code {
    background-color: transparent;
    padding: 0;
    border-radius: 0;
}

.markdown-content a {
    color: #3b82f6;
    text-decoration: underline;
}

.markdown-content a:hover {
    color: #2563eb;
}

.markdown-content img {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 1em 0;
    cursor: pointer;
}

.markdown-content table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
}

.markdown-content th,
.markdown-content td {
    border: 1px solid rgba(0, 0, 0, 0.15);
    padding: 0.6em 1em;
    text-align: left;
}

.markdown-content th {
    background-color: rgba(0, 0, 0, 0.05);
    font-weight: 600;
}

.markdown-content hr {
    margin: 2em 0;
    border: none;
    border-top: 2px solid rgba(0, 0, 0, 0.1);
}

.markdown-content strong {
    font-weight: 700;
}

.markdown-content em {
    font-style: italic;
}
</style>
