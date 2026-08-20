<script lang="ts" setup>
import { computed } from "vue"
import type { RouteLocationRaw } from "vue-router"
import { fishMap } from "@/data"
import { optRewardMap } from "@/data/d"
import { booksData } from "@/data/d/book.data"
import { musicData, musicScoreData } from "@/data/d/music.data"
import type { Resource } from "@/data/d/resource.data"
import { collectResourceDraftSources } from "@/utils/draft-source"
import { getRarityGradientClass } from "@/utils/rarity-utils"
import {
    collectResourceDungeonSources,
    collectResourceHardbossSources,
    collectResourceQuestSources,
    collectResourceShopSources,
} from "@/utils/resource-source"
import { getRewardDetails, type RewardItem } from "@/utils/reward-utils"

const props = defineProps<{
    resource: Resource
}>()

const draftSources = computed(() => collectResourceDraftSources(props.resource))
const dungeonSources = computed(() => collectResourceDungeonSources(props.resource))
const hardbossSources = computed(() => collectResourceHardbossSources(props.resource))
const questSources = computed(() => collectResourceQuestSources(props.resource))
const shopSources = computed(() => collectResourceShopSources(props.resource))
const bookTarget = computed(() => {
    for (const book of booksData) {
        if (!book.res.some(resource => resource.id === props.resource.id)) {
            continue
        }

        return book
    }

    return null
})
const bookLink = computed<RouteLocationRaw | null>(() => {
    if (!bookTarget.value) {
        return null
    }

    return {
        name: "book-detail",
        params: {
            id: String(bookTarget.value.id),
        },
        query: {
            resId: String(props.resource.id),
        },
    }
})
const packReward = computed(() => (props.resource.pack !== undefined ? getRewardDetails(props.resource.pack) : null))
const optReward = computed(() => (props.resource.select !== undefined ? optRewardMap.get(props.resource.select) || null : null))
const optRewardRoot = computed<RewardItem | null>(() => {
    if (!optReward.value) {
        return null
    }

    return {
        id: optReward.value.id,
        t: "Reward",
        p: 10000,
        child: optReward.value.child.map(item => ({
            id: item.id,
            t: item.t,
            c: item.c,
            d: item.d,
            dp: item.dp,
            p: item.p ?? 0,
            n: item.n,
        })),
    }
})
const fishTarget = computed(() => {
    for (const fish of fishMap.values()) {
        if (fish.rid !== props.resource.id) {
            continue
        }

        return fish
    }

    return null
})
const fishLink = computed<RouteLocationRaw | null>(() => {
    if (!fishTarget.value) {
        return null
    }

    return {
        name: "fish-detail",
        params: {
            id: String(fishTarget.value.id),
        },
    }
})
/** 资源所属的乐谱（按乐谱条目中的资源 ID 反查）。 */
const musicTarget = computed(() => {
    for (const music of musicData) {
        if (music.rId !== props.resource.id) {
            continue
        }

        return music
    }

    return null
})
/** 乐谱所属的专辑。 */
const musicAlbum = computed(() => {
    if (!musicTarget.value) {
        return null
    }

    return musicScoreData.find(score => score.id === musicTarget.value!.scoreId) || null
})
/** 乐谱详情页路由。 */
const musicLink = computed<RouteLocationRaw | null>(() => {
    if (!musicTarget.value) {
        return null
    }

    return {
        name: "music-detail",
        params: {
            id: String(musicTarget.value.id),
        },
    }
})
/** 专辑列表页路由（按专辑浏览乐谱）。 */
const musicAlbumLink = computed<RouteLocationRaw>(() => ({
    name: "music-list",
}))
const sourceCounts = computed(
    () =>
        draftSources.value.length +
        dungeonSources.value.length +
        hardbossSources.value.length +
        questSources.value.length +
        shopSources.value.length
)
function getResourceIconUrl(icon: string): string {
    return icon ? `/imgs/res/${icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}
</script>

<template>
    <div class="p-3 space-y-4">
        <div class="flex items-center">
            <div class="size-24 shrink-0 overflow-hidden rounded bg-linear-15" :class="getRarityGradientClass(resource.rarity)">
                <ImageFallback :src="getResourceIconUrl(resource.icon)" :alt="resource.name" class="w-full h-full object-cover">
                    <img src="/imgs/webp/T_Head_Empty.webp" :alt="resource.name" class="w-full h-full object-cover" />
                </ImageFallback>
            </div>
            <div class="space-y-2 flex-1">
                <div class="flex items-center gap-3 p-3">
                    <SRouterLink :to="`/db/resource/${resource.id}`" class="text-lg font-bold link link-primary">
                        {{ $t(resource.name) }}
                    </SRouterLink>
                    <CopyID :id="resource.id" />
                </div>
                <div class="flex flex-wrap gap-3 text-sm opacity-70 p-3 h-12">
                    <span v-if="sourceCounts">
                        {{ $t("resource.source") }} <span class="text-primary">{{ sourceCounts }}</span>
                    </span>
                    <span v-if="resource.source?.length">
                        {{ $t("resource.mapPoints") }} <span class="text-primary">{{ resource.source.length }}</span>
                    </span>
                </div>
            </div>
        </div>

        <div v-if="resource.desc" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.description") }}</div>
            <div class="text-sm leading-6 whitespace-pre-wrap">{{ resource.desc }}</div>
        </div>

        <div v-if="resource.desc2" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.background") }}</div>
            <div class="text-sm leading-6 whitespace-pre-wrap">{{ resource.desc2 }}</div>
        </div>

        <div v-if="packReward" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.packReward") }}</div>
            <RewardItem :reward="packReward" header />
        </div>

        <div v-if="optReward" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.selectReward") }}</div>
            <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/70">
                <span>{{ $t("resource.optionGroup") }} {{ optReward.id }}</span>
                <span class="px-1.5 py-0.5 rounded bg-warning text-warning-content">{{ $t("resource.selectRewardTag") }}</span>
            </div>
            <RewardItem v-if="optRewardRoot" :reward="optRewardRoot" />
        </div>

        <div v-if="bookLink && bookTarget" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.book") }}</div>
            <div class="flex items-center gap-2">
                <SRouterLink :to="bookLink" class="link link-primary wrap-break-word">
                    {{ $t(bookTarget.name) }}
                </SRouterLink>
                <CopyID :id="bookTarget.id" />
            </div>
        </div>

        <div v-if="fishLink && fishTarget" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.fish") }}</div>
            <div class="flex items-center gap-2">
                <SRouterLink :to="fishLink" class="link link-primary wrap-break-word">
                    {{ $t(fishTarget.name) }}
                </SRouterLink>
                <CopyID :id="fishTarget.id" />
            </div>
        </div>

        <div v-if="musicTarget && musicLink" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.music") }}</div>
            <div class="flex items-center gap-3">
                <img
                    v-if="musicAlbum"
                    :src="`/imgs/music/${musicAlbum.icon}.webp`"
                    :alt="musicAlbum.name"
                    class="size-12 shrink-0 rounded bg-base-100 object-cover"
                />
                <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="shrink-0 text-xs text-base-content/50">{{ $t("resource.musicAlbum") }}</span>
                        <SRouterLink
                            v-if="musicAlbum"
                            :to="musicAlbumLink"
                            class="link link-primary wrap-break-word truncate"
                        >
                            {{ $t(musicAlbum.name) }}
                        </SRouterLink>
                        <CopyID v-if="musicAlbum" :id="musicAlbum.id" />
                    </div>
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="shrink-0 text-xs text-base-content/50">{{ $t("resource.musicScore") }}</span>
                        <SRouterLink :to="musicLink" class="link link-primary wrap-break-word truncate">
                            {{ $t(musicTarget.name) }}
                        </SRouterLink>
                        <CopyID :id="musicTarget.id" />
                    </div>
                </div>
            </div>
        </div>

        <div
            class="p-3 bg-base-200 rounded"
            v-if="draftSources.length || dungeonSources.length || hardbossSources.length || questSources.length || shopSources.length || resource.source?.length"
        >
            <div class="text-xs text-base-content/70 mb-2">{{ $t("resource.source") }}</div>
            <div class="space-y-3">
                <DraftSource :draft-sources="draftSources" />
                <DungeonSource :dungeon-sources="dungeonSources" />
                <BossSource :boss-sources="hardbossSources" />
                <QuestSource :quest-sources="questSources" :resource-id="resource.id" />
                <ShopSource :shop-sources="shopSources" />
                <MapSource :resource="resource" />
            </div>
        </div>
    </div>
</template>
