<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import ReaderModeOverlay from "@/components/ReaderModeOverlay.vue"
import StoryArticleBody from "@/components/StoryArticleBody.vue"
import { useGameText } from "@/composables/useGameText"
import { useReaderArticle } from "@/composables/useReaderArticle"
import { regionMap, subRegionMap } from "@/data/d"
import type { Book, BookResource } from "@/data/d/book.data"
import { convertRegionMapIdToDBMapId } from "@/data/d/map.data"
import { stripStoryTextTags } from "@/utils/story-text"

interface BookLocationInfo {
    subRegionName: string
    regionName: string
    mapId: number | null
}

const { gt } = useGameText()
const props = withDefaults(
    defineProps<{
        book: Book
        initialResourceId?: number
    }>(),
    {
        initialResourceId: 0,
    }
)

const { t } = useTranslation()
const selectedResourceId = ref(0)
const readerOpen = ref(false)

/**
 * 当前选中的读物条目。
 */
const selectedResource = computed(() => {
    if (!selectedResourceId.value) {
        return props.book.res[0]
    }

    return props.book.res.find(resource => resource.id === selectedResourceId.value) || props.book.res[0]
})

/**
 * 当前条目的位置信息。
 */
const selectedResourceLocation = computed<BookLocationInfo | null>(() => {
    if (!selectedResource.value) {
        return null
    }

    return getBookLocationInfo(selectedResource.value)
})

/**
 * 当切换读物或路由参数时，重置选中的条目。
 */
watch(
    () => [props.book.id, props.initialResourceId],
    () => {
        if (props.initialResourceId && props.book.res.some(resource => resource.id === props.initialResourceId)) {
            selectedResourceId.value = props.initialResourceId
            return
        }

        selectedResourceId.value = props.book.res[0]?.id || 0
    },
    { immediate: true }
)

/**
 * 生成读物封面图地址。
 * @param icon 图标资源名
 * @returns 图片 URL
 */
function getBookIcon(icon: string): string {
    return icon ? `/imgs/res/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

/**
 * 解析读物条目的类型标签。
 * @param type 原始类型
 * @returns 展示标签
 */
function getResourceTypeLabel(type: string): string {
    if (type === "Drop") {
        return t("book-detail.type.drop")
    }
    if (type === "TreasureChest") {
        return t("book-detail.type.treasureChest")
    }
    if (type === "Read") {
        return t("book-detail.type.read")
    }
    return type || t("book-detail.type.unknown")
}

/**
 * 获取条目显示名称（优先使用条目名称）。
 * @param resource 读物条目
 * @returns 展示名称
 */
function getResourceDisplayName(resource: BookResource): string {
    return resource.name || props.book.name
}

/**
 * 获取读物条目所在位置的可读信息。
 * @param resource 读物条目
 * @returns 位置信息
 */
function getBookLocationInfo(resource: BookResource): BookLocationInfo | null {
    if (!resource.srId) {
        return null
    }

    const subRegion = subRegionMap.get(resource.srId)
    const region = subRegion ? regionMap.get(subRegion.rid) : undefined
    if (!subRegion || !region) return null
    const dbMapId = convertRegionMapIdToDBMapId(region.mapId)

    return {
        subRegionName: subRegion.name,
        regionName: region.name,
        mapId: dbMapId,
    }
}

/**
 * 读物条目切换标签。
 */
const bookTabItems = computed(() =>
    props.book.res.map(resource => ({
        label: t(getResourceDisplayName(resource)),
        value: resource.id,
    }))
)

const readerTitle = computed(() => {
    const resource = selectedResource.value
    return resource ? t(getResourceDisplayName(resource)) : t(props.book.name)
})

const readerSubtitle = computed(() => {
    const resource = selectedResource.value
    if (!resource) {
        return ""
    }

    const bookName = t(props.book.name)
    return t(getResourceDisplayName(resource)) === bookName ? "" : bookName
})

const readerMeta = computed(() => {
    const resource = selectedResource.value
    if (!resource) {
        return null
    }

    const entryName = t(getResourceDisplayName(resource))
    const bookName = t(props.book.name)
    return {
        title: entryName && entryName !== bookName ? `${entryName} - ${bookName}` : bookName,
        description:
            gt(props.book.desc) ||
            stripStoryTextTags(gt(resource.text))
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 120),
        url: typeof location === "undefined" ? undefined : `${location.origin}/db/book/${props.book.id}`,
    }
})

useReaderArticle(() => readerMeta.value)
</script>

<template>
    <article class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 读物档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative flex items-center gap-3.5">
                <div class="size-14 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                    <img :src="getBookIcon(book.icon)" :alt="book.name" class="h-full w-full object-cover" loading="lazy" />
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Book File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h1 class="min-w-0 max-w-full">
                            <SRouterLink
                                :to="`/db/book/${book.id}`"
                                class="block truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                            >
                                {{ $t(book.name) }}
                            </SRouterLink>
                        </h1>
                        <CopyID :id="book.id" />
                    </div>
                    <p class="mt-2 text-xs text-base-content/55">{{ $t("book-detail.countSuffix", { count: book.res.length }) }}</p>
                </div>
            </div>
        </header>

        <!-- 简介 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SUMMARY" :title="$t('book-detail.summary')" />
            <p class="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-base-content/85">{{ gt(book.desc) }}</p>
        </section>

        <!-- 条目阅读 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="ENTRIES">
                <template #trailing>
                    <button
                        type="button"
                        class="inline-flex h-7 shrink-0 items-center rounded-xs border border-base-content/15 px-2 text-[11px] font-medium text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                        @click="readerOpen = true"
                    >
                        {{ t("reader.enter") }}
                    </button>
                </template>
            </SectionHeader>
            <AniTabs v-model="selectedResourceId" :tabs="bookTabItems" />

            <div v-if="selectedResource" class="mt-2 space-y-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-2">
                        <div class="text-base font-semibold wrap-break-word">{{ $t(getResourceDisplayName(selectedResource)) }}</div>
                        <CopyID :id="selectedResource.id" />
                    </div>
                    <span
                        class="shrink-0 rounded-xs border border-base-content/20 px-1.5 py-0.5 text-[11px] tracking-wide text-base-content/60"
                    >
                        {{ gt(getResourceTypeLabel(selectedResource.type)) }}
                    </span>
                </div>

                <!-- 位置属性格 -->
                <div class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                    <div
                        v-if="selectedResourceLocation && selectedResource.srId"
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="shrink-0 text-xs text-base-content/60">{{ $t("book-detail.subRegion") }}</span>
                        <SubRegionLink :sub-region-id="selectedResource.srId" />
                    </div>

                    <div
                        v-if="selectedResourceLocation"
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="shrink-0 text-xs text-base-content/60">{{ $t("book-detail.region") }}</span>
                        <span class="text-right text-xs wrap-break-word">{{ $t(selectedResourceLocation.regionName) }}</span>
                    </div>

                    <div
                        v-if="selectedResource.mId"
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">{{ $t("book-detail.mechanismId") }}</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                            selectedResource.mId
                        }}</span>
                    </div>

                    <div
                        v-if="selectedResource.srId && selectedResource.pos"
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="shrink-0 text-xs text-base-content/60">{{ $t("book-detail.point") }}</span>
                        <MapPosLink
                            :sub-region-id="selectedResource.srId"
                            :point="selectedResource.pos"
                            :point-name="getResourceDisplayName(selectedResource)"
                            :point-icon="book.icon"
                        />
                    </div>

                    <div
                        v-if="selectedResource.srId && selectedResource.treasurePos"
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="shrink-0 text-xs text-base-content/60">{{ $t("book-detail.treasurePoint") }}</span>
                        <MapPosLink
                            :sub-region-id="selectedResource.srId"
                            :point="selectedResource.treasurePos"
                            :point-name="`${getResourceDisplayName(selectedResource)} ${$t('book-detail.treasurePointSuffix')}`"
                            :point-icon="book.icon"
                        />
                    </div>
                </div>

                <!-- 正文 -->
                <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-7 text-base-content/85">
                    <StoryArticleBody :text="selectedResource.text" />
                </div>
            </div>
        </section>

        <ReaderModeOverlay
            v-model="readerOpen"
            v-model:active="selectedResourceId"
            :title="readerTitle"
            :subtitle="readerSubtitle"
            :items="bookTabItems"
        >
            <StoryArticleBody :text="selectedResource?.text" paragraph-gap="space-y-9" unwrap-lines />
        </ReaderModeOverlay>
    </article>
</template>
