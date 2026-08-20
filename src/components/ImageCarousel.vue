<script setup lang="ts">
import { computed, ref, watch } from "vue"

/**
 * 图片轮播组件：左右按钮切换 + 底部指示点 + 右上角计数，支持键盘方向键。
 * 样式对齐首页设计语言：圆角小、纸面底、主色强调，用于 MOD 详情弹窗的预览图展示。
 * 图片区域高度限制为宽度的 3/4（4:3），更高的图片等比缩小并居中；点击图片可放大预览。
 */
const props = withDefaults(
    defineProps<{
        /** 待轮播的图片地址列表。 */
        images: string[]
        /** 图片的通用 alt 文本（缺省按序号生成）。 */
        alt?: string
    }>(),
    { alt: "" }
)

/** 当前展示的图片下标。 */
const current = ref(0)

/** 大图预览实例（点击放大）。 */
const previewRef = ref<InstanceType<typeof ImagePreview> | null>(null)

// 图片列表变化时重置回第一张，避免残留越界下标
watch(
    () => props.images,
    () => {
        current.value = 0
    }
)

/** 是否可切换到上一张。 */
const hasPrev = computed(() => current.value > 0)
/** 是否可切换到下一张。 */
const hasNext = computed(() => current.value < props.images.length - 1)

/**
 * 切换到上一张。
 */
function prev() {
    if (hasPrev.value) current.value--
}

/**
 * 切换到下一张。
 */
function next() {
    if (hasNext.value) current.value++
}

/**
 * 打开指定图片的大图预览（点击放大）。
 * @param image 图片地址
 */
function openPreview(image: string) {
    previewRef.value?.openFromUrls(image, image)
}
</script>

<template>
    <div
        class="group relative overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60 backdrop-blur-sm focus:outline-none"
        tabindex="0"
        @keydown.left.prevent="prev"
        @keydown.right.prevent="next"
    >
        <!-- 滑动轨道（高度自适应：每张图按自身比例，最高不超过宽度的 3/4） -->
        <div class="flex items-start transition-transform duration-300 ease-out" :style="{ transform: `translateX(-${current * 100}%)` }">
            <div v-for="(image, index) in images" :key="index" class="relative @container w-full shrink-0">
                <button type="button" class="block w-full cursor-zoom-in" @click="openPreview(image)">
                    <img
                        :src="image"
                        :alt="alt || `preview-${index + 1}`"
                        :loading="index === 0 ? 'eager' : 'lazy'"
                        draggable="false"
                        class="h-auto max-h-[75cqw] w-full object-contain"
                    />
                </button>
                <!-- 放大提示 -->
                <span
                    class="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-base-100/80 px-2 py-1 text-[11px] text-base-content/70 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
                >
                    <Icon icon="ri:zoom-in-line" class="size-3.5" />
                </span>
            </div>
        </div>

        <!-- 左右切换按钮（hover / 聚焦时显示） -->
        <button
            type="button"
            class="btn btn-circle btn-ghost absolute left-2 top-1/2 -translate-y-1/2 bg-base-100/80 backdrop-blur-sm opacity-0 transition-opacity duration-200 hover:bg-primary hover:text-primary-content focus-visible:opacity-100 group-hover:opacity-100"
            :class="{ 'pointer-events-none opacity-0': !hasPrev }"
            :disabled="!hasPrev"
            aria-label="上一张"
            @click="prev"
        >
            <Icon icon="ri:arrow-left-line" class="size-5" />
        </button>
        <button
            type="button"
            class="btn btn-circle btn-ghost absolute right-2 top-1/2 -translate-y-1/2 bg-base-100/80 backdrop-blur-sm opacity-0 transition-opacity duration-200 hover:bg-primary hover:text-primary-content focus-visible:opacity-100 group-hover:opacity-100"
            :class="{ 'pointer-events-none opacity-0': !hasNext }"
            :disabled="!hasNext"
            aria-label="下一张"
            @click="next"
        >
            <Icon icon="ri:arrow-right-line" class="size-5" />
        </button>

        <!-- 计数 -->
        <span
            v-if="images.length > 1"
            class="absolute right-2 top-2 rounded-xs bg-base-100/80 px-1.5 py-0.5 font-orbitron text-[11px] tabular-nums text-base-content/70 backdrop-blur-sm"
        >
            {{ current + 1 }} / {{ images.length }}
        </span>

        <!-- 指示点 -->
        <div v-if="images.length > 1" class="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            <button
                v-for="(_, index) in images"
                :key="index"
                type="button"
                class="h-1.5 rounded-full transition-all duration-200"
                :class="index === current ? 'w-4 bg-primary' : 'w-1.5 bg-base-content/30 hover:bg-base-content/50'"
                :aria-label="`第 ${index + 1} 张`"
                @click="current = index"
            />
        </div>

        <!-- 大图预览（点击放大，manual 模式仅提供 openFromUrls） -->
        <ImagePreview ref="previewRef" manual thumb-url="" full-url="" />
    </div>
</template>
