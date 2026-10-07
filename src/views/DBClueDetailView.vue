<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { clueData } from "@/data/d/clue.data"
import type { ClueEntry } from "@/views/DBClueListView.vue"

const route = useRoute()

/** 路由里的线索 id（`/db/clue/:id`） */
const clueId = computed(() => Number(route.params.id))

/** 按 id 定位线索，并补上它所属的页类型与页 */
const entry = computed<ClueEntry | null>(() => {
    for (const tab of clueData) {
        for (const page of tab.pages) {
            for (const clue of page.clues) {
                if (clue.id === clueId.value) {
                    return { tabType: tab.type, tabName: tab.name, pageId: page.id, pageName: page.name, pageUnlock: page.unlock, clue }
                }
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
            <DBClueDetailItem :entry="entry" />
        </div>
        <div v-else class="p-4">
            <div class="text-base-content/70">{{ $t("clue-detail.notFound") }}</div>
        </div>
    </ScrollArea>
</template>