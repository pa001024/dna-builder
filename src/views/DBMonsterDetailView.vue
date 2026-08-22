<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { monsterMap } from "@/data"

const route = useRoute()

const monster = computed(() => monsterMap.get(Number(route.params.monsterId)))
if (!monster.value) {
    throw new Error("Monster not found")
}
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与首页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <div>
                <DBMonsterDetailItem :monster="monster!" />
            </div>
        </div>
    </ScrollArea>
</template>
