<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()

/** 七个 section 的列表入口：详情页也按路径前缀保持对应 section 高亮 */
const items = [
    { key: "overview", path: "/db/transcendence", label: "db-transcendence.tab.overview" },
    { key: "talent", path: "/db/transcendence/talent", label: "db-transcendence.tab.talents" },
    { key: "gear", path: "/db/transcendence/gear", label: "db-transcendence.tab.gear" },
    { key: "rift", path: "/db/transcendence/rift", label: "db-transcendence.tab.rift" },
    { key: "nest", path: "/db/transcendence/nest", label: "db-transcendence.tab.nest" },
    { key: "commission", path: "/db/transcendence/commission", label: "db-transcendence.overview.commissions" },
    { key: "journey", path: "/db/transcendence/journey", label: "db-transcendence.tab.journey" },
] as const

/** 高亮按 section 前缀判断；总览仅在根路径生效，避免吞掉所有子页 */
const activeKey = computed(() => {
    const path = route.path
    const match = items
        .filter(item => item.key !== "overview")
        .find(item => path === item.path || path.startsWith(`${item.path}/`))

    return match?.key ?? "overview"
})
</script>

<template>
    <nav class="flex-none border-b border-base-content/15 px-4 pt-3 pb-2.5 stagger-rise" :aria-label="$t('db-transcendence.section_nav')">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <SRouterLink
                v-for="item in items"
                :key="item.key"
                :to="item.path"
                class="btn btn-xs whitespace-nowrap"
                :class="activeKey === item.key ? 'btn-primary' : ''"
                :aria-current="activeKey === item.key ? 'page' : undefined"
            >
                {{ $t(item.label) }}
            </SRouterLink>
        </div>
    </nav>
</template>
