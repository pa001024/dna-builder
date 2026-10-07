<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { wikiData } from "@/data/d/wiki.data"
import type { WikiListEntry } from "@/views/DBWikiListView.vue"

const route = useRoute()

/** 路由里的百科条目 id（`/db/wiki/:id`） */
const entryId = computed(() => Number(route.params.id))

/** 按 id 定位条目，并补上它所属的大类与子类 */
const entry = computed<WikiListEntry | null>(() => {
    for (const mainType of wikiData) {
        for (const subType of mainType.subTypes) {
            const found = subType.entries.find(item => item.id === entryId.value)

            if (found) {
                return {
                    mainTypeId: mainType.id,
                    mainTypeName: mainType.name,
                    mainTypeIcon: mainType.icon,
                    subTypeId: subType.id,
                    subTypeName: subType.name,
                    entry: found,
                }
            }
        }
    }

    return null
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与线索 / 剧情回顾详情页一致的纸面排版宽度 -->
        <div v-if="entry" class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <DBWikiDetailItem :entry="entry" />
        </div>
        <div v-else class="p-4">
            <div class="text-base-content/70">{{ $t("wiki-detail.notFound") }}</div>
        </div>
    </ScrollArea>
</template>