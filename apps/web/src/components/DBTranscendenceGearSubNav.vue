<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"

const route = useRoute()

/** 五个 gear 子页；详情页不属于子页高亮范围 */
const items = [
    { key: "affix", path: "/db/transcendence/gear/affix", label: "db-transcendence.gear.sub_affixes" },
    { key: "unique", path: "/db/transcendence/gear/unique", label: "db-transcendence.gear.sub_unique" },
    { key: "base", path: "/db/transcendence/gear/base", label: "db-transcendence.gear.sub_base" },
    { key: "inlay", path: "/db/transcendence/gear/inlay", label: "db-transcendence.gear.sub_inlay" },
    { key: "craft", path: "/db/transcendence/gear/craft", label: "db-transcendence.gear.sub_craft" },
] as const

const activeKey = computed(() => {
    const path = route.path
    const match = items.find(item => path === item.path || path.startsWith(`${item.path}/`))

    return match?.key ?? "affix"
})

/** 切子页时只保留搜索词，丢弃上一页的选中 id 与旧 gearsub */
const targetOf = (path: string) => {
    const query = { ...route.query }
    delete query.id
    delete query.gearsub

    return { path, query }
}
</script>

<template>
    <nav class="flex-none border-b border-base-content/15 px-4 pt-2.5 pb-2.5" :aria-label="$t('db-transcendence.tab.gear')">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <SRouterLink
                v-for="item in items"
                :key="item.key"
                :to="targetOf(item.path)"
                class="btn btn-xs whitespace-nowrap"
                :class="activeKey === item.key ? 'btn-primary' : ''"
                :aria-current="activeKey === item.key ? 'page' : undefined"
            >
                {{ $t(item.label) }}
            </SRouterLink>
        </div>
    </nav>
</template>
