<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { booksData } from "@/data/d/book.data"

const route = useRoute()

/**
 * 路由中的读物 ID。
 */
const bookId = computed(() => Number(route.params.id))

/**
 * 路由 query 中的读物条目 ID。
 */
const resourceId = computed(() => {
    const rawValue = route.query.resId
    const normalizedValue = Array.isArray(rawValue) ? rawValue[0] : rawValue
    const parsedValue = Number(normalizedValue)
    return Number.isFinite(parsedValue) ? parsedValue : 0
})

/**
 * 当前读物详情数据。
 */
const book = computed(() => booksData.find(item => item.id === bookId.value))
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea v-if="book" class="flex-1">
            <!-- 居中容器：与首页一致的纸面排版宽度 -->
            <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
                <div>
                    <DBBookDetailItem :book="book" :initial-resource-id="resourceId" />
                </div>
            </div>
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">{{ $t("book-detail.notFound") }}</div>
        </div>
    </div>
</template>
