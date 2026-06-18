<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { type RankingList, rankingListQuery, rankingListsQuery } from "@/api/graphql"
import { normalizeCharSettings } from "@/composables/useCharSettings"
import { charMap, LeveledChar } from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { useInvStore } from "@/store/inv"
import { formatDateTime } from "@/utils/time"

type RankedItem = {
    id: string
    charId: number
    buildId: string
    title: string
    charName: string
    charIcon: string
    authorName: string
    authorQq: string | number | undefined | null
    baseName: string
    targetFunction: string
    dps: number
    updateAt: number
}

const route = useRoute()
const router = useRouter()
const inv = useInvStore()
const rankingOptions = ref<RankingList[]>([])
const ranking = ref<RankingList | null>(null)
const loading = ref(false)
const switching = ref(false)
const rankedItems = ref<RankedItem[]>([])

const rankingId = computed(() => String(route.params.id || ""))

function getCharName(charId: number) {
    return charMap.get(charId)?.名称 || `角色${charId}`
}

function getCharIcon(charId: number) {
    return LeveledChar.url(charMap.get(charId)?.icon)
}

function calcBuildDps(build: RankingList["items"][number]["build"]) {
    if (!build) return
    try {
        const settings = normalizeCharSettings(JSON.parse(build.charSettings))
        const charName = charMap.get(build.charId)?.名称 || build.charId.toString()
        const charBuild = createCharBuildFromSettings(charName, settings, inv)
        const result = charBuild.calculate()
        return {
            baseName: settings.baseName,
            targetFunction: settings.targetFunction,
            dps: Number.isFinite(result) ? Math.round(result) : 0,
        }
    } catch (error) {
        console.error("计算榜单 DPS 失败", error)
        return
    }
}

function mapRanking(result: RankingList | null) {
    ranking.value = result || null
    rankedItems.value = (result?.items || [])
        .map(item => {
            const r = calcBuildDps(item.build)
            return {
                id: item.id,
                charId: item.charId,
                buildId: item.buildId,
                title: item.build?.title || item.buildId,
                charName: getCharName(item.charId),
                charIcon: getCharIcon(item.charId),
                authorName: item.build?.user?.name || "匿名",
                authorQq: item.build?.user?.qq || 0,
                baseName: r?.baseName || "-",
                targetFunction: r?.targetFunction || "-",
                dps: r?.dps || 0,
                updateAt: item.build?.updateAt || item.updateAt,
            } satisfies RankedItem
        })
        .sort((a, b) => b.dps - a.dps)
}

async function loadRankingList() {
    const result = await rankingListsQuery({}, { requestPolicy: "network-only" }).catch(() => [])
    rankingOptions.value = result || []
}

async function loadRanking() {
    loading.value = true
    try {
        if (!rankingId.value) {
            if (!rankingOptions.value.length) {
                await loadRankingList()
            }
            const first = rankingOptions.value[0]
            if (first) {
                await router.replace(`/ranking/${first.id}`)
                return
            }
            mapRanking(null)
            return
        }
        const result = await rankingListQuery({ id: rankingId.value }, { requestPolicy: "network-only" })
        mapRanking(result || null)
    } finally {
        loading.value = false
    }
}

async function switchRanking(id: string) {
    if (!id || id === rankingId.value) return
    switching.value = true
    try {
        await router.push(`/ranking/${id}`)
    } finally {
        switching.value = false
    }
}

watch(
    () => route.params.id,
    () => {
        if (rankingOptions.value.length) {
            loadRanking()
        }
    }
)

onMounted(async () => {
    await loadRankingList()
    await loadRanking()
})
</script>

<template>
    <ScrollArea
        class="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_26%),linear-gradient(180deg,rgba(5,10,20,0.98)_0%,rgba(11,16,29,0.94)_45%,rgba(6,10,18,0.98)_100%)] text-slate-100 sm:px-6 lg:px-8"
    >
        <div class="p-5">
            <div
                class="pointer-events-none absolute inset-0 opacity-45 bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-size-[72px_72px]"
            ></div>
            <div class="relative mx-auto flex max-w-7xl flex-col gap-6">
                <section
                    class="overflow-hidden rounded-lg border border-white/10 bg-white/6 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.36)] backdrop-blur-xl sm:p-6"
                >
                    <div class="flex flex-col gap-5">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="min-w-0">
                                <h1 class="truncate text-2xl font-semibold tracking-tight text-white">榜单 - {{ ranking?.name }}</h1>
                                <div class="mt-2 flex flex-wrap gap-3 text-xs text-slate-400">
                                    <span>条目 {{ rankedItems.length }}</span>
                                    <span>更新时间 {{ ranking ? formatDateTime(ranking.updateAt) : "-" }}</span>
                                </div>
                            </div>

                            <div class="flex items-center gap-2">
                                <div class="rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs text-slate-300">
                                    {{ loading ? "计算中" : switching ? "切换中" : "就绪" }}
                                </div>
                            </div>
                        </div>

                        <ScrollArea :vertical="false" horizontal>
                            <div class="flex gap-2 pb-1 items-center">
                                <button
                                    v-for="item in rankingOptions"
                                    :key="item.id"
                                    class="flex shrink-0 items-center gap-3 rounded-full border px-3 py-2 text-left transition-all duration-300"
                                    :class="
                                        rankingId === item.id
                                            ? 'border-cyan-300/30 bg-cyan-300/10 text-white text-sm '
                                            : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 text-sm'
                                    "
                                    @click="switchRanking(item.id)"
                                >
                                    <span class="max-w-40 truncate font-medium">{{ item.name }}</span>
                                </button>
                            </div>
                        </ScrollArea>
                    </div>
                </section>

                <section
                    class="flex-1 rounded-lg border border-white/10 bg-slate-950/40 p-4 shadow-[0_24px_80px_rgba(2,6,23,0.28)] backdrop-blur-xl sm:p-6"
                >
                    <div v-if="loading && rankedItems.length === 0" class="grid gap-4">
                        <div v-for="index in 5" :key="index" class="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/5"></div>
                    </div>

                    <div
                        v-else-if="rankedItems.length === 0"
                        class="flex min-h-96 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/4 px-6 py-12 text-center"
                    >
                        <div class="text-slate-400">暂无条目</div>
                    </div>

                    <div v-else class="grid gap-4">
                        <article
                            v-for="(item, index) in rankedItems"
                            :key="item.id"
                            class="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/6 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-white/10 hover:shadow-[0_20px_60px_rgba(8,145,178,0.14)]"
                        >
                            <div
                                class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.1),transparent_30%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                            ></div>

                            <div class="relative flex gap-4 items-center">
                                <div class="flex items-center gap-4">
                                    <div
                                        class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-slate-950/50"
                                    >
                                        <ImageFallback
                                            :src="item.charIcon"
                                            :alt="item.charName"
                                            class="h-full w-full object-cover object-top"
                                        >
                                            <img
                                                src="/imgs/webp/T_Head_Empty.webp"
                                                :alt="item.charName"
                                                class="h-full w-full object-cover object-top"
                                            />
                                        </ImageFallback>
                                    </div>
                                </div>

                                <div class="flex-1">
                                    <div class="flex flex-wrap items-center gap-3">
                                        <span
                                            class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-slate-300"
                                        >
                                            {{ $t(item.charName) }}
                                        </span>
                                        <SRouterLink
                                            :to="`/char/${item.charId}/${item.buildId}`"
                                            class="truncate text-xl font-semibold text-white hover:text-cyan-200 hover:underline"
                                        >
                                            {{ item.title }}
                                        </SRouterLink>
                                    </div>
                                    <div class="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-400">
                                        <div class="flex items-center gap-2">
                                            <div
                                                class="bg-neutral text-neutral-content rounded-full w-6 h-6 inline-flex justify-center items-center text-xs"
                                            >
                                                <QQAvatar :qq="item.authorQq" :name="item.authorName" />
                                            </div>
                                            <span class="text-slate-300">{{ item.authorName }}</span>
                                        </div>
                                        <span>{{ formatDateTime(item.updateAt) }}</span>
                                    </div>
                                </div>

                                <div class="flex gap-3">
                                    <div class="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                                        <div
                                            class="text-[11px] uppercase tracking-[0.22em] text-slate-400 max-w-40 truncate"
                                            :title="`${item.baseName} - ${item.targetFunction}`"
                                        >
                                            {{ item.targetFunction }}
                                        </div>
                                        <div class="mt-1 text-2xl font-black text-white">{{ Math.round(item.dps).toLocaleString() }}</div>
                                    </div>
                                    <div class="rounded-2xl border border-white/10 bg-cyan-300/10 px-4 py-3 w-30">
                                        <div class="text-[11px] uppercase tracking-[0.22em] text-cyan-100/70">排名</div>
                                        <div class="mt-1 text-2xl font-black text-white">#{{ index + 1 }}</div>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>
                </section>
            </div>
        </div>
    </ScrollArea>
</template>
