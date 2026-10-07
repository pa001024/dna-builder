<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { reviewData } from "@/data/d/review.data"
import type { ReviewEntry } from "@/views/DBReviewListView.vue"

const route = useRoute()

/** 路由里的回顾 id（`/db/review/:id`） */
const reviewId = computed(() => Number(route.params.id))

/** 按 id 定位回顾条目，并补上它所属的页与时间轴列 */
const entry = computed<ReviewEntry | null>(() => {
    for (const page of reviewData) {
        for (const chain of page.chains) {
            const main = chain.main.find(review => review.id === reviewId.value)

            if (main) {
                return { pageId: page.id, episodeName: page.episodeName || "", chainId: chain.id, column: chain.column, isMain: true, review: main }
            }

            const side = chain.side.find(review => review.id === reviewId.value)

            if (side) {
                return { pageId: page.id, episodeName: page.episodeName || "", chainId: chain.id, column: chain.column, isMain: false, review: side }
            }
        }
    }

    return null
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与迷津 / NPC 详情页一致的纸面排版宽度 -->
        <div v-if="entry" class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBReviewDetailItem :entry="entry" />
        </div>
        <div v-else class="p-4">
            <div class="text-base-content/70">{{ $t("review-detail.notFound") }}</div>
        </div>
    </ScrollArea>
</template>