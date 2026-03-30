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
    <div class="h-full flex flex-col bg-base-300">
        <ScrollArea v-if="book" class="flex-1">
            <DBBookDetailItem :book="book" :initial-resource-id="resourceId" />
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到读物</div>
        </div>
    </div>
</template>
