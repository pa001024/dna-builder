<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { useRouter } from "vue-router"
import {
    BUG_CATEGORIES,
    BUG_SEVERITIES,
    BUG_SORTS,
    BUG_STATUSES,
    categoryLabelKey,
    ENVIRONMENT_OPTIONS,
    type EnvironmentOption,
    environmentLabelKey,
    FIX_STAGES,
    fixStageLabelKey,
    listBugs,
    severityBadgeClass,
    severityLabelKey,
    statusBadgeClass,
    statusLabelKey,
} from "@/api/bugs"
import type * as Types from "@/api/gen/api-types"
import { useSearchParam } from "@/composables/useSearchParam"
import { formatRelativeTime } from "@/utils/time"

const router = useRouter()
const { t } = useTranslation()

/** 每页条数（服务端 limit，spec §18.2 默认 30）。 */
const PAGE_SIZE = 30

const q = useSearchParam<string>("q", "")
const category = useSearchParam<string>("category", "")
const severity = useSearchParam<string>("severity", "")
const status = useSearchParam<string>("status", "")
const fixStage = useSearchParam<string>("fixStage", "")
const platform = useSearchParam<string>("platform", "")
const region = useSearchParam<string>("region", "")
const gameVersion = useSearchParam<string>("gameVersion", "")
const sort = useSearchParam<string>("sort", "priority")
const page = useSearchParam<number>("page", 1)

/** 移动端筛选抽屉开关（桌面端侧栏常驻）。 */
const filtersOpen = ref(false)

const loading = ref(false)
const items = ref<Types.Bug[]>([])
const total = ref(0)
const errorMessage = ref("")
/** 只采纳最后一次请求的响应，避免筛选快速切换时旧结果覆盖新结果。 */
let requestSeq = 0

const filter = computed<Types.BugFilter | undefined>(() => {
    const result: Types.BugFilter = {}
    if (q.value.trim()) result.q = q.value.trim()
    if (category.value) result.category = [category.value]
    if (severity.value) result.severity = [severity.value as Types.Severity]
    if (status.value) result.status = [status.value as Types.BugStatus]
    if (fixStage.value) result.fixStage = [fixStage.value]
    if (platform.value.trim()) result.platform = [platform.value.trim()]
    if (region.value.trim()) result.region = [region.value.trim()]
    if (gameVersion.value.trim()) result.gameVersion = gameVersion.value.trim()
    return Object.keys(result).length > 0 ? result : undefined
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

/** 侧栏筛选项：空值表示「全部」。 */
const categoryOptions = computed(() => [
    { value: "", label: t("bug-list.all_categories") },
    ...BUG_CATEGORIES.map(key => ({ value: key as string, label: t(categoryLabelKey(key)) })),
])
const severityOptions = computed(() => [
    { value: "", label: t("bug-list.all_severities") },
    ...BUG_SEVERITIES.map(key => ({ value: key as string, label: t(severityLabelKey(key)) })),
])
const statusOptions = computed(() => [
    { value: "", label: t("bug-list.all_statuses") },
    ...BUG_STATUSES.map(key => ({ value: key as string, label: t(statusLabelKey(key)) })),
])
const fixStageOptions = computed(() => [
    { value: "", label: t("bug-list.all_fix_stages") },
    ...FIX_STAGES.map(key => ({ value: key as string, label: t(fixStageLabelKey(key)) })),
])

/** Select 不接受空值：用 `-` 表示「全部」，写回 URL 时还原为空串。 */
const platformModel = computed({
    get: () => platform.value || "-",
    set: (value: string) => {
        platform.value = value === "-" ? "" : value
    },
})
const regionModel = computed({
    get: () => region.value || "-",
    set: (value: string) => {
        region.value = value === "-" ? "" : value
    },
})

/**
 * @description 环境字段展示：字典内走译名，AI 抽取的自由文本原样展示。
 */
function envText(value: string | null | undefined): string {
    const key = environmentLabelKey(value)
    return key ? t(key) : (value ?? "")
}

/**
 * @description 环境筛选项文案。
 */
function envOptionLabel(option: EnvironmentOption): string {
    return envText(option.value)
}

/**
 * @description 按当前筛选与页码拉取列表；页码来自 URL，可直接分享。
 */
async function load() {
    const seq = ++requestSeq
    loading.value = true
    errorMessage.value = ""
    try {
        const result = await listBugs({
            filter: filter.value,
            sort: sort.value as Types.BugSort,
            offset: (page.value - 1) * PAGE_SIZE,
            limit: PAGE_SIZE,
        })
        if (seq !== requestSeq) return
        items.value = result?.items ?? []
        total.value = result?.total ?? 0
    } catch (error) {
        if (seq !== requestSeq) return
        errorMessage.value = error instanceof Error ? error.message : String(error)
        items.value = []
        total.value = 0
    } finally {
        if (seq === requestSeq) loading.value = false
    }
}

/**
 * @description 筛选去抖后拉取：输入关键词时不必每个按键都打一次接口。
 */
let loadTimer: ReturnType<typeof setTimeout> | undefined
function scheduleLoad() {
    if (loadTimer) clearTimeout(loadTimer)
    loadTimer = setTimeout(() => {
        void load()
    }, 250)
}

/**
 * @description 筛选变化时回到第一页，否则留在当前页刷新。
 */
watch([filter, sort], () => {
    if (page.value !== 1) {
        page.value = 1
        return
    }
    scheduleLoad()
})

watch(page, scheduleLoad)

onMounted(() => {
    void load()
})

onUnmounted(() => {
    if (loadTimer) clearTimeout(loadTimer)
})

/**
 * @description 打开 BUG 详情。
 */
function openBug(bug: Types.Bug) {
    void router.push({ name: "bug-detail", params: { bugId: bug.id } })
}

/**
 * @description 清空全部筛选，回到默认列表。
 */
function resetFilters() {
    q.value = ""
    category.value = ""
    severity.value = ""
    status.value = ""
    fixStage.value = ""
    platform.value = ""
    region.value = ""
    gameVersion.value = ""
    sort.value = "priority"
    page.value = 1
}
</script>

<template>
    <div class="flex h-full flex-col">
        <!-- 顶部标题行：kicker + 标题 + 入口按钮 -->
        <div class="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-base-content/15 px-4 py-3">
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">Bug Library</p>
            <h1 class="text-[17px] font-semibold text-base-content">{{ $t("bug-list.title") }}</h1>
            <span class="text-[11px] text-base-content/45">{{ $t("bug-list.public_hint") }}</span>
            <div class="ml-auto flex items-center gap-2">
                <RouterLink to="/bugs/mine" class="btn btn-xs">
                    <Icon icon="ri:user-line" class="h-3.5 w-3.5" />
                    {{ $t("bug-mine.title") }}
                </RouterLink>
                <RouterLink to="/bugs/new" class="btn btn-xs btn-primary">
                    <Icon icon="ri:add-line" class="h-3.5 w-3.5" />
                    {{ $t("bug.submit") }}
                </RouterLink>
            </div>
        </div>

        <div class="relative flex min-h-0 flex-1">
            <!-- 移动端遮罩 -->
            <div
                v-if="filtersOpen"
                class="absolute inset-0 z-20 bg-base-100/60 backdrop-blur-sm lg:hidden"
                aria-hidden="true"
                @click="filtersOpen = false"
            />

            <!-- 左侧筛选栏：桌面常驻，移动端抽屉 -->
            <aside
                class="absolute inset-y-0 left-0 z-30 flex w-60 shrink-0 flex-col border-r border-base-content/10 bg-base-100/85 backdrop-blur-md transition-transform duration-200 lg:static lg:z-auto lg:w-56 lg:translate-x-0 lg:bg-transparent lg:backdrop-blur-none"
                :class="filtersOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
            >
                <ScrollArea class="min-h-0 flex-1">
                    <div class="space-y-4 p-3">
                        <div class="flex items-center justify-between lg:hidden">
                            <span class="text-[12px] font-semibold text-base-content/70">{{ $t("bug-list.filters") }}</span>
                            <button class="btn btn-ghost btn-xs" :title="$t('取消')" @click="filtersOpen = false">
                                <Icon icon="ri:close-line" class="h-3.5 w-3.5" />
                            </button>
                        </div>

                        <section>
                            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/55">{{ $t("bug-list.col.category") }}</p>
                            <div class="space-y-0.5">
                                <button
                                    v-for="option in categoryOptions"
                                    :key="option.value || 'all'"
                                    type="button"
                                    class="btn btn-xs w-full justify-start whitespace-nowrap"
                                    :class="category === option.value ? 'btn-primary' : ''"
                                    @click="category = option.value"
                                >
                                    <span class="truncate">{{ option.label }}</span>
                                </button>
                            </div>
                        </section>

                        <section>
                            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/55">{{ $t("bug-list.col.status") }}</p>
                            <div class="space-y-0.5">
                                <button
                                    v-for="option in statusOptions"
                                    :key="option.value || 'all'"
                                    type="button"
                                    class="btn btn-xs w-full justify-start whitespace-nowrap"
                                    :class="status === option.value ? 'btn-primary' : ''"
                                    @click="status = option.value"
                                >
                                    <span class="truncate">{{ option.label }}</span>
                                </button>
                            </div>
                        </section>

                        <section>
                            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/55">{{ $t("bug-list.col.severity") }}</p>
                            <div class="space-y-0.5">
                                <button
                                    v-for="option in severityOptions"
                                    :key="option.value || 'all'"
                                    type="button"
                                    class="btn btn-xs w-full justify-start whitespace-nowrap"
                                    :class="severity === option.value ? 'btn-primary' : ''"
                                    @click="severity = option.value"
                                >
                                    <span class="truncate">{{ option.label }}</span>
                                </button>
                            </div>
                        </section>

                        <section>
                            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/55">{{ $t("bug-list.col.fix_stage") }}</p>
                            <div class="space-y-0.5">
                                <button
                                    v-for="option in fixStageOptions"
                                    :key="option.value || 'all'"
                                    type="button"
                                    class="btn btn-xs w-full justify-start whitespace-nowrap"
                                    :class="fixStage === option.value ? 'btn-primary' : ''"
                                    @click="fixStage = option.value"
                                >
                                    <span class="truncate">{{ option.label }}</span>
                                </button>
                            </div>
                        </section>

                        <section>
                            <p class="mb-1.5 text-[11px] tracking-wide text-base-content/55">{{ $t("bug.environment") }}</p>
                            <div class="space-y-2">
                                <div>
                                    <span class="text-[10.5px] text-base-content/40">{{ $t("bug.filter.platform") }}</span>
                                    <Select
                                        v-model="platformModel"
                                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[12px] outline-none focus:border-primary"
                                    >
                                        <SelectItem value="-">{{ $t("common.all") }}</SelectItem>
                                        <SelectItem
                                            v-for="option in ENVIRONMENT_OPTIONS.platform"
                                            :key="option.value"
                                            :value="option.value"
                                        >
                                            {{ envOptionLabel(option) }}
                                        </SelectItem>
                                    </Select>
                                </div>
                                <div>
                                    <span class="text-[10.5px] text-base-content/40">{{ $t("bug.filter.region") }}</span>
                                    <Select
                                        v-model="regionModel"
                                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[12px] outline-none focus:border-primary"
                                    >
                                        <SelectItem value="-">{{ $t("common.all") }}</SelectItem>
                                        <SelectItem
                                            v-for="option in ENVIRONMENT_OPTIONS.region"
                                            :key="option.value"
                                            :value="option.value"
                                        >
                                            {{ envOptionLabel(option) }}
                                        </SelectItem>
                                    </Select>
                                </div>
                                <div>
                                    <span class="text-[10.5px] text-base-content/40">{{ $t("bug.filter.game_version") }}</span>
                                    <input
                                        v-model="gameVersion"
                                        type="text"
                                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[12px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                    />
                                </div>
                            </div>
                        </section>

                        <button type="button" class="btn btn-xs w-full" @click="resetFilters">
                            <Icon icon="ri:refresh-line" class="h-3.5 w-3.5" />
                            {{ $t("bug.reset_filters") }}
                        </button>
                    </div>
                </ScrollArea>
            </aside>

            <!-- 右侧主区：检索带 + 列表 + 分页 -->
            <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex-none border-b border-base-content/15 px-4 pt-3 pb-2.5 stagger-rise">
                    <div class="flex items-center gap-2">
                        <button type="button" class="btn btn-xs lg:hidden" @click="filtersOpen = true">
                            <Icon icon="ri:filter-line" class="h-3.5 w-3.5" />
                            {{ $t("bug-list.filters") }}
                        </button>
                        <DbSearchBox v-model="q" :placeholder="$t('bug-list.search_placeholder')" :count="total" class="min-w-0 flex-1" />
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <button
                            v-for="key in BUG_SORTS"
                            :key="key"
                            type="button"
                            class="btn btn-xs whitespace-nowrap"
                            :class="sort === key ? 'btn-primary' : ''"
                            @click="sort = key"
                        >
                            {{ $t(`bug.sort.${key}`) }}
                        </button>
                        <span v-if="!loading" class="ml-auto text-[11px] text-base-content/45">
                            {{ $t("bug-list.total_count", { count: total }) }}
                        </span>
                    </div>
                </div>

                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <div v-if="loading && items.length === 0" class="flex h-40 items-center justify-center">
                            <span class="loading loading-spinner" />
                        </div>
                        <div
                            v-else-if="items.length === 0"
                            class="flex h-40 flex-col items-center justify-center gap-2 text-base-content/45"
                        >
                            <Icon icon="ri:bug-line" class="h-7 w-7 opacity-40" />
                            <p class="text-[12.5px]">{{ errorMessage || $t("bug.no_bugs") }}</p>
                            <RouterLink v-if="!errorMessage" to="/bugs/new" class="btn btn-xs btn-primary">
                                {{ $t("bug.submit") }}
                            </RouterLink>
                        </div>
                        <div v-else class="space-y-2">
                            <article
                                v-for="(bug, index) in items"
                                :key="bug.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border border-base-content/15 bg-base-100/60 backdrop-blur-sm transition-all duration-200 animate-ef-rise hover:-translate-y-0.5 hover:border-primary/50 active:scale-[0.99] motion-reduce:animate-none"
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="openBug(bug)"
                            >
                                <div class="flex items-start gap-3 p-3">
                                    <div class="min-w-0 flex-1">
                                        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                            <h3
                                                class="min-w-0 truncate text-[13px] font-semibold text-base-content/90 transition-colors duration-200 group-hover:text-primary"
                                            >
                                                {{ bug.title }}
                                            </h3>
                                            <span class="shrink-0 font-orbitron text-[10.5px] text-base-content/35">
                                                {{ bug.displayKey }}
                                            </span>
                                        </div>
                                        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                                            <span class="badge badge-sm" :class="severityBadgeClass(bug.severity)">
                                                {{ t(severityLabelKey(bug.severity)) }}
                                            </span>
                                            <span class="badge badge-sm" :class="statusBadgeClass(bug.status)">
                                                {{ t(statusLabelKey(bug.status)) }}
                                            </span>
                                            <span class="text-base-content/55">{{ t(categoryLabelKey(bug.primaryCategory)) }}</span>
                                            <span class="text-base-content/40">· {{ t(fixStageLabelKey(bug.fixStage)) }}</span>
                                            <span v-if="bug.environment?.platform" class="text-base-content/40">
                                                · {{ bug.environment.platform }}
                                            </span>
                                            <span v-if="bug.environment?.region" class="text-base-content/40">
                                                · {{ envText(bug.environment.region) }}
                                            </span>
                                            <span v-if="bug.environment?.gameVersion" class="font-mono text-[10px] text-base-content/40">
                                                v{{ bug.environment.gameVersion }}
                                            </span>
                                            <span
                                                v-if="bug.severitySource === 'ai' || bug.severitySource === 'provisional'"
                                                class="text-[10px] text-base-content/35"
                                            >
                                                {{ $t("bug.severity_suggested") }}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="hidden shrink-0 flex-col items-end gap-1 text-[10.5px] text-base-content/40 sm:flex">
                                        <span class="inline-flex items-center gap-1 text-base-content/70">
                                            <Icon icon="ri:arrow-up-line" class="h-3 w-3" />
                                            <b class="font-orbitron text-[12px]">{{ bug.votes }}</b>
                                        </span>
                                        <span class="inline-flex items-center gap-1">
                                            <Icon icon="ri:user-line" class="h-3 w-3" />
                                            {{ bug.reporters }}
                                        </span>
                                        <span>
                                            {{ bug.lastActivityAt ? formatRelativeTime(bug.lastActivityAt) : formatRelativeTime(bug.createdAt) }}
                                        </span>
                                        <a
                                            v-if="bug.githubIssue?.htmlUrl"
                                            :href="bug.githubIssue.htmlUrl"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="link link-hover inline-flex items-center gap-1 text-[10.5px] text-base-content/55"
                                            @click.stop
                                        >
                                            <Icon icon="ri:git-pull-request-line" class="h-3 w-3" />
                                            #{{ bug.githubIssue.issueNumber }}
                                        </a>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <div class="flex-none px-3">
                    <PageFoot
                        :page="page"
                        :page-size="PAGE_SIZE"
                        :total-pages="totalPages"
                        :count="total"
                        @update:page="value => (page = value)"
                    />
                </div>
            </div>
        </div>
    </div>
</template>
