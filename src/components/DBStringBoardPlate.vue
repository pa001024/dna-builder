<script lang="ts" setup>
import { computed, ref } from "vue"
import { useGameText } from "@/composables/useGameText"

const { gt } = useGameText()

const props = defineProps<{
    /** 贴图名（pic1 / pic2 去重后、已剔除空值），不含目录与扩展名 */
    pics: string[]
    /** 绶带标题（游戏原文） */
    title: string
}>()

/** 当前展示的配图下标：多图时靠左右按钮与指示点切换 */
const currentIndex = ref(0)

/** 贴图地址：数据层的 pic 已是完整 T_StringBoard_* 名，统一落在 /imgs/webp/ 下 */
const urls = computed(() => props.pics.map(pic => `/imgs/webp/${pic}.webp`))

/** 当前展示的贴图地址 */
const currentUrl = computed(() => urls.value[currentIndex.value] ?? urls.value[0] ?? "")

/**
 * 循环切换配图。
 * @param delta 步进（-1 上一张，1 下一张）
 */
function step(delta: number): void {
    const total = urls.value.length
    if (total < 2) {
        return
    }

    currentIndex.value = (currentIndex.value + delta + total) % total
}
</script>

<template>
    <!-- 调查墙（线索板 / 剧情回顾）的「画框 + 名牌」呈现，对齐游戏内的展示方式 -->
    <figure class="mx-auto w-full max-w-120 space-y-3">
        <!-- 画框：外层框体 + 内层衬边 + 四角饰件 -->
        <div class="relative rounded-xs border border-base-content/15 bg-base-100/60 p-2 backdrop-blur-sm sm:p-2.5">
            <span class="pointer-events-none absolute top-0.5 left-0.5 h-3 w-3 border-t-2 border-l-2 border-primary/45" aria-hidden="true" />
            <span class="pointer-events-none absolute top-0.5 right-0.5 h-3 w-3 border-t-2 border-r-2 border-primary/45" aria-hidden="true" />
            <span class="pointer-events-none absolute bottom-0.5 left-0.5 h-3 w-3 border-b-2 border-l-2 border-primary/45" aria-hidden="true" />
            <span class="pointer-events-none absolute bottom-0.5 right-0.5 h-3 w-3 border-b-2 border-r-2 border-primary/45" aria-hidden="true" />

            <div class="relative rounded-xs border border-primary/25 bg-base-content/5 p-1">
                <!--
                    贴图本身是 1:1（16:9 画面被拉伸后的产物），必须按 16:9 拉回去才与游戏内一致：
                    容器锁 16:9、图片 object-fill 铺满，宽度由外层 max-w 约束、整体居中。
                -->
                <img :src="currentUrl" :alt="gt(title)" loading="lazy" decoding="async" class="block aspect-video w-full object-fill" />

                <!-- 多图：画面两侧的切换按钮 -->
                <template v-if="urls.length > 1">
                    <button
                        type="button"
                        class="absolute top-1/2 left-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-xs border border-base-content/15 bg-base-100/75 text-base-content/70 backdrop-blur-sm transition-colors duration-200 hover:border-primary/50 hover:text-primary"
                        :aria-label="$t('string-board.prev')"
                        :title="$t('string-board.prev')"
                        @click="step(-1)"
                    >
                        <Icon icon="ri:arrow-left-s-line" class="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        class="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-xs border border-base-content/15 bg-base-100/75 text-base-content/70 backdrop-blur-sm transition-colors duration-200 hover:border-primary/50 hover:text-primary"
                        :aria-label="$t('string-board.next')"
                        :title="$t('string-board.next')"
                        @click="step(1)"
                    >
                        <Icon icon="ri:arrow-right-s-line" class="h-4 w-4" />
                    </button>
                </template>
            </div>
        </div>

        <!-- 名牌：游戏内画框下方的标题绶带 -->
        <figcaption class="flex items-center justify-center gap-2.5">
            <span class="h-px w-6 bg-primary/35 sm:w-10" aria-hidden="true" />
            <span
                class="max-w-[70%] truncate rounded-xs border border-primary/40 bg-primary/12 px-4 py-1.5 text-center text-sm font-semibold tracking-wide text-primary"
                :title="gt(title)"
            >
                {{ gt(title) }}
            </span>
            <span class="h-px w-6 bg-primary/35 sm:w-10" aria-hidden="true" />
        </figcaption>

        <!-- 多图：页码指示（方点，点击直达） -->
        <div v-if="urls.length > 1" class="flex items-center justify-center gap-1.5">
            <button
                v-for="(url, index) in urls"
                :key="url"
                type="button"
                class="h-1.5 w-4 rounded-xs transition-colors duration-200"
                :class="index === currentIndex ? 'bg-primary' : 'bg-base-content/25 hover:bg-base-content/40'"
                :aria-label="`${$t('string-board.picture')} ${index + 1}`"
                :aria-current="index === currentIndex"
                @click="currentIndex = index"
            />
        </div>
    </figure>
</template>