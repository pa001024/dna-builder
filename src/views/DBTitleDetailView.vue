<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import titleData from "@/data/d/title.data"

const route = useRoute()

const titleId = computed(() => Number(route.params.id))
const title = computed(() => titleData.find(item => item.id === titleId.value))
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea v-if="title" class="flex-1">
            <!-- 居中容器：与首页一致的纸面排版宽度 -->
            <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
                <div>
                    <DBTitleDetailItem :title="title" />
                </div>
            </div>
        </ScrollArea>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">未找到称号</div>
        </div>
    </div>
</template>
