<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import { type RankingList, type RankingListItem, rankingListQuery, rankingListsQuery } from "@/api/graphql"
import { normalizeCharSettings } from "@/composables/useCharSettings"
import { charMap, LeveledChar } from "@/data"
import { createCharBuildFromSettings } from "@/data/CharBuildHelper"
import { useInvStore } from "@/store/inv"
import { format100 } from "@/util"
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
/** 敌人抗性可选值（与构筑页保持一致）：0 = 无抗，0.5 = 正抗（强抗），-4 = 负抗（弱抗） */
const enemyResistanceOptions = [0, 0.5, -4]
/** 敌人抗性覆盖：null = 沿用构筑自身的敌人抗性，其余值 = 覆盖到榜单全部构筑的敌人抗性 */
const resistanceOverride = ref<number | null>(null)
/** 是否正在按覆盖后的抗性重算榜单 DPS */
const computing = ref(false)
/** 榜单条目的服务端原始数据：抗性覆盖后基于它重新计算，无需重复请求 */
const rawItems = ref<RankingListItem[]>([])
/** 重算任务令牌：覆盖值被再次修改时用于丢弃过期的重算任务 */
let recomputeToken = 0

const rankingId = computed(() => String(route.params.id || ""))

/**
 * 计算构筑 DPS；传入抗性覆盖值时，先将构筑中的敌人抗性字段替换为所选值再计算。
 * @param build 榜单条目关联的构筑
 * @param resistanceValue 抗性覆盖值（null 表示沿用构筑自身敌人抗性）
 * @returns 基础信息与计算出的 DPS
 */
function calcBuildDps(build: RankingListItem["build"], resistanceValue: number | null) {
    if (!build) return
    try {
        const settings = normalizeCharSettings(JSON.parse(build.charSettings))
        // 抗性覆盖：覆盖构筑中的敌人抗性字段后重新计算 DPS
        if (resistanceValue !== null) {
            settings.enemyResistance = resistanceValue
        }
        const charBuild = createCharBuildFromSettings(build.charId, settings, inv)
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

/**
 * 按当前抗性覆盖值重算全部条目 DPS 并重新排序。
 * 分批让出主线程执行，避免条目较多时重算长时间阻塞界面。
 */
async function rebuildRankedItems() {
    const token = ++recomputeToken
    computing.value = true
    try {
        const next: RankedItem[] = []
        const source = rawItems.value
        for (let index = 0; index < source.length; index++) {
            // 覆盖值在重算过程中被再次修改时，丢弃本次过期结果
            if (token !== recomputeToken) return
            const item = source[index]
            const r = calcBuildDps(item.build, resistanceOverride.value)
            const char = charMap.get(item.charId)
            next.push({
                id: item.id,
                charId: item.charId,
                buildId: item.buildId,
                title: item.build?.title || item.buildId,
                charName: char?.名称 || "-",
                charIcon: LeveledChar.url(char?.icon),
                authorName: item.build?.user?.name || "匿名",
                authorQq: item.build?.user?.qq || 0,
                baseName: r?.baseName || "-",
                targetFunction: r?.targetFunction || "-",
                dps: r?.dps || 0,
                updateAt: item.build?.updateAt || item.updateAt,
            } satisfies RankedItem)
            // 每处理三条让出主线程，保证界面能刷新“计算中”状态并及时响应后续点击
            if ((index + 1) % 3 === 0) {
                await new Promise<void>(resolve => setTimeout(resolve))
            }
        }
        if (token !== recomputeToken) return
        next.sort((a, b) => b.dps - a.dps)
        rankedItems.value = next
    } finally {
        if (token === recomputeToken) {
            computing.value = false
        }
    }
}

async function mapRanking(result: RankingList | null) {
    ranking.value = result || null
    rawItems.value = result?.items || []
    await rebuildRankedItems()
}

/**
 * 切换抗性覆盖值；null 表示恢复为各构筑默认的敌人抗性，切换后立即按新抗性重算榜单。
 * @param value 抗性覆盖值
 */
function setResistanceOverride(value: number | null) {
    if (resistanceOverride.value === value) return
    resistanceOverride.value = value
    if (rawItems.value.length > 0) {
        void rebuildRankedItems()
    }
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
            await mapRanking(null)
            return
        }
        const result = await rankingListQuery({ id: rankingId.value }, { requestPolicy: "network-only" })
        await mapRanking(result || null)
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
    <ScrollArea class="h-full">
        <div class="mx-auto flex max-w-7xl flex-col gap-4 p-4 sm:p-5">
            <div class="stagger-rise flex flex-col gap-4">
                <!-- 榜单信息卡：外层区块卡 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm sm:p-4">
                    <div class="flex flex-col gap-4">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="min-w-0">
                                <p
                                    class="mb-1.5 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase"
                                >
                                    <span class="h-px w-5 bg-primary" aria-hidden="true" />
                                    Ranking
                                </p>
                                <h1
                                    class="truncate font-orbitron text-xl leading-none font-bold tracking-tight text-base-content sm:text-2xl"
                                >
                                    {{ ranking?.name }}
                                </h1>
                                <div class="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/55">
                                    <span v-if="ranking?.desc">{{ ranking?.desc }}</span>
                                    <span>条目 {{ rankedItems.length }}</span>
                                    <span class="tabular-nums">更新时间 {{ ranking ? formatDateTime(ranking.updateAt) : "-" }}</span>
                                </div>
                            </div>

                            <!-- 状态方章 -->
                            <span
                                class="inline-flex h-6 shrink-0 items-center rounded-xs border px-2 text-[11px] transition-colors duration-150"
                                :class="
                                    loading || switching || computing
                                        ? 'border-primary/40 bg-primary/10 font-semibold text-primary'
                                        : 'border-base-content/15 text-base-content/50'
                                "
                            >
                                {{ loading || computing ? "计算中" : switching ? "切换中" : "就绪" }}
                            </span>
                        </div>

                        <!-- 榜单切换方章 -->
                        <ScrollArea :vertical="false" horizontal>
                            <div class="flex items-center gap-1.5 pb-1">
                                <button
                                    v-for="item in rankingOptions"
                                    :key="item.id"
                                    type="button"
                                    class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-3 py-1.5 text-xs transition-colors duration-150 active:scale-[0.97]"
                                    :class="
                                        rankingId === item.id
                                            ? 'border-primary bg-primary font-semibold text-primary-content'
                                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                    "
                                    @click="switchRanking(item.id)"
                                >
                                    {{ item.name }}
                                </button>
                            </div>
                        </ScrollArea>

                        <!-- 敌人抗性覆盖：选择抗性后覆盖榜单构筑中的敌人抗性字段并重算 DPS -->
                        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-base-content/8 pt-3">
                            <span class="mr-1 shrink-0 text-xs text-base-content/55">敌人抗性覆盖:</span>
                            <button
                                type="button"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-3 py-1.5 text-xs transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    resistanceOverride === null
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="setResistanceOverride(null)"
                            >
                                默认
                            </button>
                            <button
                                v-for="res in enemyResistanceOptions"
                                :key="res"
                                type="button"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-3 py-1.5 font-mono text-xs tabular-nums transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    resistanceOverride === res
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="setResistanceOverride(res)"
                            >
                                {{ format100(res) }}
                            </button>
                            <span class="text-[11px] tabular-nums text-base-content/40">
                                {{ resistanceOverride === null ? "使用默认抗性" : `抗性统一为 ${format100(resistanceOverride)}` }}
                            </span>
                        </div>
                    </div>
                </section>

                <!-- 榜单条目：外层区块卡 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm sm:p-4">
                    <!-- 加载骨架 -->
                    <div v-if="loading && rankedItems.length === 0" class="grid gap-2.5">
                        <div
                            v-for="index in 5"
                            :key="index"
                            class="h-24 animate-pulse rounded-xs border border-base-content/10 bg-base-content/3"
                        ></div>
                    </div>

                    <!-- 空状态 -->
                    <div
                        v-else-if="rankedItems.length === 0"
                        class="flex min-h-96 flex-col items-center justify-center rounded-xs border border-dashed border-base-content/15 px-6 py-12 text-center text-sm text-base-content/45"
                    >
                        <Icon icon="ri:trophy-line" class="mb-4 h-12 w-12 opacity-40" />
                        暂无条目
                    </div>

                    <!-- 条目列表 -->
                    <div v-else class="grid gap-2.5">
                        <article
                            v-for="(item, index) in rankedItems"
                            :key="item.id"
                            class="group relative overflow-hidden rounded-xs border bg-base-content/3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50"
                            :class="index < 3 ? 'border-primary/40' : 'border-base-content/12'"
                        >
                            <!-- 前三名左侧主色强调条 -->
                            <span
                                class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                :class="index < 3 ? 'opacity-100' : 'opacity-0'"
                                aria-hidden="true"
                            />

                            <div class="relative flex items-center gap-4 flex-wrap">
                                <!-- 角色头像 -->
                                <div class="size-14 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/5">
                                    <ImageFallback :src="item.charIcon" :alt="item.charName" class="h-full w-full object-cover object-top">
                                        <img
                                            src="/imgs/webp/T_Head_Empty.webp"
                                            :alt="item.charName"
                                            class="h-full w-full object-cover object-top"
                                        />
                                    </ImageFallback>
                                </div>

                                <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-2.5 min-w-24">
                                        <!-- 角色名方章 -->
                                        <span
                                            class="shrink-0 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                                        >
                                            {{ $t(item.charName) }}
                                        </span>
                                        <SRouterLink
                                            :to="`/char/${item.charId}/${item.buildId}`"
                                            class="truncate text-base font-semibold text-base-content transition-colors duration-150 hover:text-primary"
                                        >
                                            {{ item.title }}
                                        </SRouterLink>
                                    </div>
                                    <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-base-content/55">
                                        <div class="flex items-center gap-2">
                                            <QQAvatar class="size-6" :qq="item.authorQq" :name="item.authorName" />
                                            <span class="whitespace-nowrap">{{ item.authorName }}</span>
                                        </div>
                                        <span class="tabular-nums">{{ formatDateTime(item.updateAt) }}</span>
                                    </div>
                                </div>

                                <!-- DPS / 排名属性格 -->
                                <div class="flex shrink-0 gap-2">
                                    <div class="rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-2">
                                        <div
                                            class="max-w-40 truncate text-[11px] text-base-content/55"
                                            :title="`${item.baseName} - ${item.targetFunction}`"
                                        >
                                            {{ item.targetFunction }}
                                        </div>
                                        <div class="mt-1 font-orbitron text-xl font-bold tabular-nums text-primary">
                                            {{ Math.round(item.dps).toLocaleString() }}
                                        </div>
                                    </div>
                                    <div class="w-28 rounded-xs border border-primary/30 bg-primary/10 px-3 py-2">
                                        <div class="text-[11px] text-base-content/55">排名</div>
                                        <div class="mt-1 font-orbitron text-xl font-bold tabular-nums text-primary">#{{ index + 1 }}</div>
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
