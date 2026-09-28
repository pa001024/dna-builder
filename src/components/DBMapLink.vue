<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import type { RouteLocationRaw } from "vue-router"
import { buildDBMapRoute, type DBMapGroup, resolveDBMapGroups } from "@/utils/db-map-utils"

/**
 * AI 地图跳转：资料库条目位置列表的中间层。
 *
 * 资料检索 Agent 在回复里写 `<DBMapLink kind="resource" :id="99" />` 这类标签时，
 * 渲染层会把参数原样交给本组件。**模型只知道「条目类型 + id / 名称」，不知道坐标**，
 * 因此这里负责补齐地图跳转需要的一切（区域 / 子区域 / 世界坐标，见 `resolveDBMapGroups`），
 * 再一行一个位置地给出跳转入口——相当于 `MapPosLink` 的批量形态。
 *
 * 与 `MapPosLink` 的分工：那个组件要求调用方把区域、子区域、坐标、图标全部算好，
 * 因此只在数据现成的资料库详情页里用；本组件面向模型，参数收窄成 kind / id / name / part。
 *
 * 查不到条目或没有点位时渲染一段可读的降级提示而不是空白：模型写错名称时用户能看出
 * 哪个名字没对上，页面上也不会留下一串没人认识的标签文本。
 */
const props = defineProps<{
    /** 条目类型：book / npc / resource（也接受「读物 / NPC / 资源 / 道具」这类写法） */
    kind?: string
    /** 条目 id（优先用它定位，取自工具返回结果） */
    id?: number | string
    /** 条目名称：id 缺失或查不到时用它定位（支持别名与拼音；同名 NPC 会全部列出） */
    name?: string
    /** 可选，只取某一类位置：book 的 page（书页）/ treasure（藏宝点） */
    part?: string
}>()

const { t } = useTranslation()

/** 最多展示的位置行数：同名资源可能有数十个子区域，全列出来会刷屏 */
const MAX_ROWS = 12

/** 补齐后的位置分组 */
const groups = computed(() => {
    const filtered = resolveDBMapGroups({ kind: props.kind, id: props.id, name: props.name, part: props.part })

    // part 是严格筛选：模型指定的那类位置不存在时退回不筛选，避免整张卡片落空
    if (filtered.length || !props.part) {
        return filtered
    }

    return resolveDBMapGroups({ kind: props.kind, id: props.id, name: props.name })
})

/** 全部位置分组里的点位总数（用于标题上的「共 N 处」） */
const totalPoints = computed(() => groups.value.reduce((total, group) => total + group.points.length, 0))

/** 一行的渲染数据 */
interface MapRow {
    key: string
    /** 位置标题原文（读物为页名，资源为子区域名），交给模板过 $t */
    title: string
    /** 区域名原文；与标题重复时为空串 */
    subtitle: string
    /** 坐标文本 */
    coordinate: string
    /** 该位置包含的坐标数量 */
    count: number
    /** 跳转路由；区域没有本地地图时为 null */
    to: RouteLocationRaw | null
}

/**
 * 取位置标题原文。
 * @param group 位置分组
 * @returns 展示标题
 */
function rowTitle(group: DBMapGroup): string {
    if (group.pointType === "treasure") {
        return `${group.label} ${t("book-detail.treasurePointSuffix")}`
    }

    return group.pointType === "source" ? group.subRegionName : group.label
}

/** 截断后的位置行 */
const rows = computed<MapRow[]>(() =>
    groups.value.slice(0, MAX_ROWS).map(group => {
        const title = rowTitle(group)
        const [x, y] = group.points[0] ?? []

        return {
            key: `${group.pointType}-${group.subRegionId}-${group.label}`,
            title,
            // 子区域常与区域同名，重复时不再占一行
            subtitle: group.regionName === title ? "" : group.regionName,
            coordinate: x === undefined || y === undefined ? "" : `(${x.toFixed(0)}, ${y.toFixed(0)})`,
            count: group.points.length,
            to: buildDBMapRoute(group, title),
        }
    })
)

/** 未展示的位置行数 */
const hiddenRows = computed(() => Math.max(0, groups.value.length - MAX_ROWS))

/** 降级提示里回显的原始参数，便于对照模型写了什么 */
const requested = computed(() => {
    const name = `${props.name ?? ""}`.trim()

    if (name) {
        return name
    }

    const id = `${props.id ?? ""}`.trim()

    return id ? `${props.kind ?? ""} #${id}`.trim() : ""
})
</script>

<template>
    <span v-if="rows.length" class="mr-2 mb-2 inline-block w-full max-w-md align-top">
        <span class="flex flex-col overflow-hidden rounded-xs border border-base-content/15 bg-base-content/3 text-[11px] leading-5">
            <!-- 条目头：位置归属的条目名与点位总数 -->
            <span class="flex items-center justify-between gap-2 border-b border-base-content/10 px-2.5 py-1.5">
                <span class="min-w-0 truncate font-medium text-base-content/85">{{ $t(groups[0].entryName) }}</span>
                <span class="shrink-0 text-[10px] tracking-wide text-base-content/45">{{
                    $t("dbAgent.map.points", { count: totalPoints })
                }}</span>
            </span>

            <!-- 位置行：一行一个子区域（或读物的一页） -->
            <span
                v-for="row in rows"
                :key="row.key"
                class="flex items-center justify-between gap-2 border-b border-base-content/8 px-2.5 py-1 last:border-b-0"
            >
                <span class="min-w-0 flex-1 truncate">
                    <span class="text-base-content/80">{{ $t(row.title) }}</span>
                    <span v-if="row.subtitle" class="text-base-content/45"> · {{ $t(row.subtitle) }}</span>
                </span>
                <span class="shrink-0 font-orbitron text-[10px] tabular-nums text-base-content/50">
                    {{ row.coordinate }}<template v-if="row.count > 1"> ×{{ row.count }}</template>
                </span>
                <SRouterLink v-if="row.to" :to="row.to" class="link link-primary shrink-0">{{ $t("map-pos-link.jump") }}</SRouterLink>
            </span>

            <!-- 超出展示上限的剩余位置只报数量，避免刷屏 -->
            <span v-if="hiddenRows" class="border-t border-base-content/10 px-2.5 py-1 text-[10px] text-base-content/45">
                {{ $t("dbAgent.map.more", { count: hiddenRows }) }}
            </span>
        </span>
    </span>
    <span
        v-else
        class="mr-2 mb-2 inline-flex w-64 flex-col gap-1 rounded-xs border border-dashed border-base-content/20 p-2.5 align-top text-[11px] leading-5 text-base-content/45"
    >
        <span>{{ $t("dbAgent.map.empty") }}</span>
        <span v-if="requested" class="truncate text-[10px] text-base-content/35">{{ requested }}</span>
    </span>
</template>
