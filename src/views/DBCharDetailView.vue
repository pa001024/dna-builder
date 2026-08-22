<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import charData from "@/data/d/char.data"

const route = useRoute()

const char = computed(() => {
    const id = Number(route.params.id)
    const foundChar = charData.find(c => c.id === id)
    if (!foundChar) {
        throw new Error(`角色 ID ${id} 未找到`)
    }
    return foundChar
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与首页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <div>
                <DBCharDetailItem :char="char" />
            </div>
        </div>
    </ScrollArea>
</template>
