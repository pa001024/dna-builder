<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()

/** gear 大区的子导航只在 gear 子路由下出现；实体详情是顶层路由，不经过本 layout */
const showGearSubNav = computed(() => route.path === "/db/transcendence/gear" || route.path.startsWith("/db/transcendence/gear/"))
</script>

<template>
    <div class="h-full flex min-h-0 flex-col">
        <DBTranscendenceNav />
        <DBTranscendenceGearSubNav v-if="showGearSubNav" />
        <div class="min-h-0 flex-1">
            <router-view />
        </div>
    </div>
</template>