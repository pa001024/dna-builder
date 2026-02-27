<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import type { Book, BookResource } from "@/data/d/book.data"
import { convertRegionMapIdToDBMapId } from "@/data/d/map.data"
import { regionMap } from "@/data/d/region.data"
import { subRegionMap } from "@/data/d/subregion.data"
import { useSettingStore } from "@/store/setting"
import { DEFAULT_STORY_TEXT_CONFIG, parseStoryTextSegments, type StoryTextConfig } from "@/utils/story-text"

interface BookLocationInfo {
    subRegionName: string
    regionName: string
    mapId: number | null
}

const props = withDefaults(
    defineProps<{
        book: Book
        initialResourceId?: number
    }>(),
    {
        initialResourceId: 0,
    }
)

const settingStore = useSettingStore()
const selectedResourceId = ref(0)

/**
 * 获取当前剧情文本替换配置。
 */
const storyTextConfig = computed<StoryTextConfig>(() => {
    return {
        nickname: settingStore.protagonistName1?.trim() || DEFAULT_STORY_TEXT_CONFIG.nickname,
        nickname2: settingStore.protagonistName2?.trim() || DEFAULT_STORY_TEXT_CONFIG.nickname2,
        gender: settingStore.protagonistGender,
        gender2: settingStore.protagonistGender2,
    }
})

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
 * 当前条目的显示描述。
 */
const selectedResourceDescription = computed(() => {
    return selectedResource.value?.desc || props.book.desc
})

/**
 * 当前条目的位置信息。
 */
const selectedResourceLocation = computed(() => {
    if (!selectedResource.value) {
        return {
            subRegionName: "未知区域",
            regionName: "未知地区",
            mapId: null,
        } satisfies BookLocationInfo
    }

    return getBookLocationInfo(selectedResource.value)
})

/**
 * 当前条目文本对应的可渲染片段。
 */
const selectedResourceTextSegments = computed(() => {
    return parseBookTextSegments(selectedResource.value?.text)
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
        return "探索拾取"
    }
    if (type === "TreasureChest") {
        return "宝箱获取"
    }
    return type || "未知类型"
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
function getBookLocationInfo(resource: BookResource): BookLocationInfo {
    const subRegion = subRegionMap.get(resource.srId)
    const region = subRegion ? regionMap.get(subRegion.rid) : undefined
    const dbMapId = convertRegionMapIdToDBMapId(region?.mapId)

    return {
        subRegionName: subRegion?.name || `子区域 ${resource.srId}`,
        regionName: region?.name || (subRegion ? `地区 ${subRegion.rid}` : "未知地区"),
        mapId: dbMapId,
    }
}

/**
 * 解析剧情文本并应用占位符替换与标记色。
 * @param text 原始文本
 * @returns 可渲染片段
 */
function parseBookTextSegments(text: string | undefined) {
    return parseStoryTextSegments(text || "", storyTextConfig.value)
}

/**
 * 选中指定读物条目。
 * @param resourceId 条目 ID
 */
function selectResource(resourceId: number): void {
    selectedResourceId.value = resourceId
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="flex items-start gap-3">
            <img :src="getBookIcon(book.icon)" :alt="book.name" class="size-14 rounded-lg bg-base-200 object-cover shrink-0" loading="lazy" />
            <div class="min-w-0">
                <SRouterLink :to="`/db/book/${book.id}`" class="text-lg font-bold link link-primary wrap-break-word">
                    {{ book.name }}
                </SRouterLink>
                <div class="text-sm text-base-content/70 mt-1">ID: {{ book.id }}</div>
                <div class="text-xs text-base-content/70 mt-1">条目数: {{ book.res.length }}</div>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <div class="text-xs text-base-content/70 mb-1">读物简介</div>
            <div class="text-sm leading-6 whitespace-pre-wrap wrap-break-word">{{ book.desc }}</div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
            <div class="card bg-base-100 border border-base-200 rounded p-2 space-y-2">
                <div class="text-xs text-base-content/70 px-1">条目列表</div>
                <button
                    v-for="resource in book.res"
                    :key="resource.id"
                    type="button"
                    class="w-full text-left rounded p-2 transition-colors bg-base-200 hover:bg-base-300"
                    :class="{
                        'bg-primary/90 text-primary-content hover:bg-primary': selectedResource?.id === resource.id,
                    }"
                    @click="selectResource(resource.id)"
                >
                    <div class="font-medium text-sm wrap-break-word">
                        {{ getResourceDisplayName(resource) }}
                    </div>
                    <div class="text-xs opacity-75 mt-1">ID: {{ resource.id }} | {{ getResourceTypeLabel(resource.type) }}</div>
                    <div class="text-xs opacity-70 mt-1">
                        {{ getBookLocationInfo(resource).regionName }} · {{ getBookLocationInfo(resource).subRegionName }}
                    </div>
                </button>
            </div>

            <div v-if="selectedResource" class="card bg-base-100 border border-base-200 rounded p-3">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="text-base font-semibold wrap-break-word">{{ getResourceDisplayName(selectedResource) }}</div>
                        <div class="text-xs text-base-content/70 mt-1">条目 ID: {{ selectedResource.id }}</div>
                    </div>
                    <span class="text-xs px-2 py-0.5 rounded bg-primary text-primary-content shrink-0">
                        {{ getResourceTypeLabel(selectedResource.type) }}
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mt-3">
                    <div class="flex items-start justify-between gap-2">
                        <span class="text-base-content/70">子区域</span>
                        <span class="text-right wrap-break-word">{{ selectedResourceLocation.subRegionName }} ({{ selectedResource.srId }})</span>
                    </div>

                    <div class="flex items-start justify-between gap-2">
                        <span class="text-base-content/70">所属地区</span>
                        <span class="text-right wrap-break-word">{{ selectedResourceLocation.regionName }}</span>
                    </div>

                    <div v-if="selectedResourceLocation.mapId" class="flex items-start justify-between gap-2">
                        <span class="text-base-content/70">地图</span>
                        <SRouterLink :to="`/db/map/${selectedResourceLocation.mapId}`" class="text-right link link-primary">
                            地图 {{ selectedResourceLocation.mapId }}
                        </SRouterLink>
                    </div>

                    <div v-if="selectedResource.mId" class="flex items-start justify-between gap-2">
                        <span class="text-base-content/70">机制 ID</span>
                        <span>{{ selectedResource.mId }}</span>
                    </div>
                </div>

                <div v-if="selectedResourceDescription" class="mt-3 p-2 rounded bg-base-200/70 text-sm leading-6 whitespace-pre-wrap wrap-break-word">
                    {{ selectedResourceDescription }}
                </div>

                <div class="mt-3 rounded-lg bg-base-200 p-3 text-sm leading-7 whitespace-pre-wrap wrap-break-word">
                    <template v-for="(segment, index) in selectedResourceTextSegments" :key="`${selectedResource.id}-${index}-${segment.tone}`">
                        <span
                            :class="{
                                'text-primary font-semibold': segment.tone === 'highlight',
                                'text-error font-semibold': segment.tone === 'warning',
                            }"
                        >
                            {{ segment.text }}
                        </span>
                    </template>
                </div>
            </div>
        </div>
    </div>
</template>
