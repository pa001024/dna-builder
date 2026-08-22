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
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 资源档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative flex items-start gap-3.5">
                <div
                    class="size-20 shrink-0 overflow-hidden rounded-xs bg-linear-15 sm:size-24"
                    :class="getRarityGradientClass(resource.rarity)"
                >
                    <ImageFallback :src="getResourceIconUrl(resource.icon)" :alt="resource.name" class="w-full h-full object-cover">
                        <img src="/imgs/webp/T_Head_Empty.webp" :alt="resource.name" class="w-full h-full object-cover" />
                    </ImageFallback>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Resource File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/resource/${resource.id}`"
                            class="truncate font-orbitron text-xl leading-none font-bold tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ $t(resource.name) }}
                        </SRouterLink>
                        <CopyID :id="resource.id" />
                    </div>
                    <!-- 计数行：获取途径 / 地图点位 -->
                    <div class="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                        <span v-if="sourceCounts" class="inline-flex items-center gap-1.5">
                            {{ $t("resource.source") }}
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                                sourceCounts
                            }}</span>
                        </span>
                        <template v-if="resource.source?.length">
                            <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                            <span class="inline-flex items-center gap-1.5">
                                {{ $t("resource.mapPoints") }}
                                <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                                    resource.source.length
                                }}</span>
                            </span>
                        </template>
                    </div>
                </div>
            </div>
        </header>

        <!-- 资源描述 -->
        <section v-if="resource.desc" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('resource.description')" />
            <div class="text-sm leading-6 whitespace-pre-wrap text-base-content/90">{{ resource.desc }}</div>
        </section>

        <!-- 背景故事 -->
        <section v-if="resource.desc2" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LORE" :title="$t('resource.background')" />
            <div class="text-sm leading-6 whitespace-pre-wrap text-base-content/90">{{ resource.desc2 }}</div>
        </section>

        <!-- 礼包奖励 -->
        <section v-if="packReward" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="PACK" :title="$t('resource.packReward')" />
            <RewardItem :reward="packReward" header />
        </section>

        <!-- 自选奖励 -->
        <section v-if="optReward" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SELECT" :title="$t('resource.selectReward')" />
            <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/70">
                <span>{{ $t("resource.optionGroup") }} {{ optReward.id }}</span>
                <span class="rounded-xs bg-warning px-1.5 py-0.5 text-warning-content">{{ $t("resource.selectRewardTag") }}</span>
            </div>
            <RewardItem v-if="optRewardRoot" :reward="optRewardRoot" />
        </section>

        <!-- 关联书籍 -->
        <section v-if="bookLink && bookTarget" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="BOOK" :title="$t('resource.book')" />
            <div class="flex items-center gap-2">
                <SRouterLink :to="bookLink" class="wrap-break-word text-sm font-semibold transition-colors duration-150 hover:text-primary">
                    {{ $t(bookTarget.name) }}
                </SRouterLink>
                <CopyID :id="bookTarget.id" />
            </div>
        </section>

        <!-- 关联鱼类 -->
        <section v-if="fishLink && fishTarget" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="FISHING" :title="$t('resource.fish')" />
            <div class="flex items-center gap-2">
                <SRouterLink :to="fishLink" class="wrap-break-word text-sm font-semibold transition-colors duration-150 hover:text-primary">
                    {{ $t(fishTarget.name) }}
                </SRouterLink>
                <CopyID :id="fishTarget.id" />
            </div>
        </section>

        <!-- 关联乐谱 -->
        <section v-if="musicTarget && musicLink" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="MUSIC" :title="$t('resource.music')" />
            <div class="flex items-center gap-3">
                <img
                    v-if="musicAlbum"
                    :src="`/imgs/music/${musicAlbum.icon}.webp`"
                    :alt="musicAlbum.name"
                    class="size-12 shrink-0 rounded-xs bg-base-content/6 object-cover"
                />
                <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex min-w-0 items-center gap-2">
                        <span class="shrink-0 text-xs text-base-content/50">{{ $t("resource.musicAlbum") }}</span>
                        <SRouterLink
                            v-if="musicAlbum"
                            :to="musicAlbumLink"
                            class="wrap-break-word truncate text-sm font-semibold transition-colors duration-150 hover:text-primary"
                        >
                            {{ $t(musicAlbum.name) }}
                        </SRouterLink>
                        <CopyID v-if="musicAlbum" :id="musicAlbum.id" />
                    </div>
                    <div class="flex min-w-0 items-center gap-2">
                        <span class="shrink-0 text-xs text-base-content/50">{{ $t("resource.musicScore") }}</span>
                        <SRouterLink
                            :to="musicLink"
                            class="wrap-break-word truncate text-sm font-semibold transition-colors duration-150 hover:text-primary"
                        >
                            {{ $t(musicTarget.name) }}
                        </SRouterLink>
                        <CopyID :id="musicTarget.id" />
                    </div>
                </div>
            </div>
        </section>

        <!-- 获取途径 -->
        <section
            class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
            v-if="
                draftSources.length ||
                dungeonSources.length ||
                hardbossSources.length ||
                questSources.length ||
                shopSources.length ||
                resource.source?.length
            "
        >
            <SectionHeader no-animate compact kicker="SOURCE" :title="$t('resource.source')" />
            <div class="space-y-3">
                <DraftSource :draft-sources="draftSources" />
                <DungeonSource :dungeon-sources="dungeonSources" />
                <BossSource :boss-sources="hardbossSources" />
                <QuestSource :quest-sources="questSources" :resource-id="resource.id" />
                <ShopSource :shop-sources="shopSources" />
                <MapSource :resource="resource" />
            </div>
        </section>
    </div>
</template>
