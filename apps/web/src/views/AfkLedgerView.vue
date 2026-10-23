<script setup lang="ts">

/**
 * 狩月账本：把「小小狩月人」奖励管道落库后的场次与掉落，按时间/副本/品质/物品筛选展示。
 *
 * 数据来自 Dexie（主窗口写入），页面只做查询与聚合；时间范围与副本走查询，
 * 时段/品质/物品在已取回的数据上过滤，这样各种筛选组合总能看到完整的可选项。
 */

import * as dialog from "@tauri-apps/plugin-dialog"
import type { EChartsOption } from "echarts"
import { useTranslation } from "i18next-vue"
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { getAfkWidgetWindow, setAfkWidgetIgnoreCursorEvents } from "@/api/afk-widget-window"
import { readTextFile, writeTextFile } from "@/api/app"
import AfkLedgerChart from "@/components/AfkLedgerChart.vue"
import AfkLedgerHero from "@/components/AfkLedgerHero.vue"
import FilterSelect from "@/components/FilterSelect.vue"
import ScrollSpyLayout from "@/components/ScrollSpyLayout.vue"
import { useAfkWidget } from "@/composables/useAfkWidget"
import { dungeonMap } from "@/data/d"
import { env } from "@/env"
import { useAfkLedgerStore } from "@/store/afkLedger"
import { useAfkSupportStore } from "@/store/afkSupport"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { patchAfkAnimState, useAfkAnimState } from "@/utils/afk-anim-state"
import {
    AFK_DUNGEON_ALIASES,
    type AfkDrop,
    type AfkItemRow,
    type AfkRun,
    afkDungeonName,
    groupDropsByItem,
    groupStatsByDungeon,
    isDungeonDrop,
    resolveCraftItem,
    runDuration,
    startOfDay,
    trendBuckets,
} from "@/utils/afk-ledger"
import { readAfkWidgetClickThrough, writeAfkWidgetClickThrough } from "@/utils/afk-widget"
import { dungeonDisplayName } from "@/utils/dungeon-utils"
import { getRarityColor, getRaritySwatchClass } from "@/utils/rarity-utils"

type RangeKey = "today" | "7d" | "30d" | "all"

/** 选中的时间桶（点击趋势图柱子或「时段」筛选产生）。 */
type Period = { from: number; to: number }

/** 品质分布卡片可切换的分组维度。 */
type MixDimension = "rarity" | "dungeon" | "item" | "craft"

/** 多维度共用的调色板：图表系列色，避免自造颜色。 */
const mixPalette = ["#60a5fa", "#f2c14e", "#a78bfa", "#34d399", "#f472b6", "#38bdf8", "#fb923c", "#94a3b8"]

const MIX_DIMENSIONS: { key: MixDimension; labelKey: string }[] = [
    { key: "item", labelKey: "afk-ledger.mix_item" },
    { key: "dungeon", labelKey: "afk-ledger.mix_dungeon" },
    { key: "craft", labelKey: "afk-ledger.mix_craft" },
    { key: "rarity", labelKey: "afk-ledger.mix_rarity" },
]

const { t, i18next } = useTranslation()
const ledger = useAfkLedgerStore()
const setting = useSettingStore()
const {
    busy: afkWidgetBusy,
    setEnabled: setAfkWidgetEnabled,
    syncWindowWithSetting: syncAfkWidgetWindow,
} = useAfkWidget()
const afkSupport = useAfkSupportStore()
const ui = useUIStore()
const afkAnimState = useAfkAnimState()

/** 当前是否 BAD APPLE 剪影风格。 */
const afkSilhouette = computed(() => afkAnimState.value.style === "badapple")

/** 蘑菇图标按钮：在普通 / BAD APPLE 两种画面风格之间切换。 */
function cycleAfkStyle() {
    patchAfkAnimState({ style: afkSilhouette.value ? "normal" : "badapple" })
}

const RANGE_OPTIONS: { key: RangeKey; labelKey: string }[] = [
    { key: "today", labelKey: "afk-ledger.range_today" },
    { key: "7d", labelKey: "afk-ledger.range_7d" },
    { key: "30d", labelKey: "afk-ledger.range_30d" },
    { key: "all", labelKey: "afk-ledger.range_all" },
]

/** 接收端状态文案：未启用 / 等待游戏连接 / 已连接。 */
const supportStatusKey = computed(() => {
    if (!afkSupport.running) return "afk-support.status_stopped"
    return afkSupport.connected ? "afk-support.status_connected" : "afk-support.status_waiting"
})

/** 清空前的二次确认状态（Tauri webview 里 window.confirm 不可靠）。 */
const confirmingClear = ref(false)
let clearTimer: number | null = null

const range = ref<RangeKey>("today")
const dungeon = ref("")
const rarity = ref<number | null>(null)
/** 品质分布卡片的分组维度。 */
const mixDimension = ref<MixDimension>("item")
const itemKey = ref("")
const period = ref<Period | null>(null)
const runs = ref<AfkRun[]>([])
const drops = ref<AfkDrop[]>([])
const loading = ref(false)
const loaded = ref(false)
const loadError = ref("")
let requestToken = 0
let reloadTimer: number | null = null

/**
 * 当前筛选的起始时刻（趋势图与查询共用）。
 * @param key 时间范围
 * @returns 起始时间戳（含）
 */
function rangeFrom(key: RangeKey) {
    const day = startOfDay(Date.now())
    if (key === "7d") return day - 6 * 86400000
    if (key === "30d") return day - 29 * 86400000
    if (key === "all") return 0
    return day
}

/**
 * 重新查询当前时间范围与副本下的数据。
 */
async function reload() {
    const token = ++requestToken
    loading.value = true
    loadError.value = ""
    try {
        const to = Date.now()
        // 「全部」从最早一条记录开始，避免空桶把横轴拉得很长
        const from = range.value === "all" ? 0 : rangeFrom(range.value)
        const data = await ledger.loadRange(from, to, dungeon.value)
        if (token !== requestToken) return
        runs.value = data.runs
        // 掉落的副本字段以所属场次为准：历史数据或跨时段查询可能只留了 runId
        drops.value = data.drops.map(drop => {
            if (drop.dungeonId || drop.runId === null) return drop
            const run = data.runIndex.get(drop.runId)
            return run ? { ...drop, dungeonId: run.dungeonId, dungeonName: run.dungeonName } : drop
        })
        loaded.value = true
    } catch (error) {
        if (token !== requestToken) return
        loadError.value = String(error)
        runs.value = []
        drops.value = []
        loaded.value = true
    } finally {
        if (token === requestToken) loading.value = false
    }
}

watch([range, dungeon], () => {
    period.value = null
    void reload()
})
watch(
    () => ledger.version,
    () => {
        if (reloadTimer !== null) window.clearTimeout(reloadTimer)
        reloadTimer = window.setTimeout(() => {
            reloadTimer = null
            void reload()
        }, 300)
    }
)

onMounted(async () => {
    await ledger.init()
    await reload()
    // 窗口不可持久化：把实际窗口拉回与开关一致（上一版程序可能留下孤儿窗口）
    void syncAfkWidgetWindow()
})

onBeforeUnmount(() => {
    if (reloadTimer !== null) window.clearTimeout(reloadTimer)
    if (clearTimer !== null) window.clearTimeout(clearTimer)
})

/**
 * 时段过滤后的场次：按时间区间相交判断，跨桶的场次在它覆盖的每个时段里都算数。
 */
const periodRuns = computed(() => {
    const current = period.value
    if (!current) return runs.value
    const now = Date.now()
    return runs.value.filter(run => run.startedAt < current.to && (run.endedAt ?? now) >= current.from)
})

const periodDrops = computed(() => {
    const current = period.value
    if (!current) return drops.value
    return drops.value.filter(drop => drop.at >= current.from && drop.at < current.to)
})

/** 物品过滤后的掉落：品质分布按它算，避免选了品质后分布只剩一种颜色。 */
const itemDrops = computed(() =>
    itemKey.value ? periodDrops.value.filter(drop => dropKey(drop) === itemKey.value) : periodDrops.value
)

/** 品质 + 物品过滤后的掉落：所有统计与列表都用它。 */
const visibleDrops = computed(() =>
    rarity.value === null ? itemDrops.value : itemDrops.value.filter(drop => drop.rarity === rarity.value)
)

/** 副本掉落：铸造产物不属于副本，单独统计。 */
const lootDrops = computed(() => visibleDrops.value.filter(isDungeonDrop))

/** 铸造产物：与副本无关，走独立维度；选了副本筛选时为空。 */
const craftDrops = computed(() => (dungeon.value ? [] : periodDrops.value.filter(drop => drop.kind === "craft")))
/**
 * 展示用铸造行：历史库里的武器成品存的是 `Resource` + 空 id（解析 bug 时代），
 * 在分组前按名纠正回 `Weapon` + 数字 id，老数据与新数据合并为一行，图标与详情链恢复正常。
 */
const displayCraftDrops = computed(() =>
    craftDrops.value.map(drop => (drop.itemId === null ? { ...drop, ...resolveCraftItem(drop.itemName) } : drop))
)
const craftRows = computed(() => groupDropsByItem(displayCraftDrops.value))
const craftTotal = computed(() => craftDrops.value.reduce((sum, drop) => sum + drop.count, 0))
const craftGold = computed(() => craftDrops.value.reduce((sum, drop) => sum + (drop.rarity >= 5 ? drop.count : 0), 0))

/** 物品筛选时，场次收敛为「掉出过这件物品的那些场」。 */
const visibleRuns = computed(() => {
    if (!itemKey.value) return periodRuns.value
    const ids = new Set(visibleDrops.value.map(drop => drop.runId).filter((id): id is number => id !== null))
    return periodRuns.value.filter(run => run.id !== undefined && ids.has(run.id))
})

/**
 * 掉落的物品键：与 `groupDropsByItem` 的分组口径一致。
 * @param drop 掉落
 * @returns 物品键
 */
function dropKey(drop: AfkDrop) {
    return `${drop.itemType}|${drop.itemId ?? "craft"}|${drop.itemName}`
}

const completedRuns = computed(() => visibleRuns.value.filter(run => run.status === "done"))
const totalRuns = computed(() => completedRuns.value.length)
const totalDrops = computed(() => lootDrops.value.reduce((sum, drop) => sum + drop.count, 0))
const goldDrops = computed(() => lootDrops.value.reduce((sum, drop) => sum + (drop.rarity >= 5 ? drop.count : 0), 0))
const totalDuration = computed(() => completedRuns.value.reduce((sum, run) => sum + runDuration(run), 0))

/** 已收尾场次里的掉落：场均只按这些算，进行中的场次不参与。 */
const settledDrops = computed(() => {
    const done = new Set(completedRuns.value.map(run => run.id))
    return lootDrops.value.filter(drop => drop.runId === null || done.has(drop.runId))
})
const avgDrops = computed(() =>
    totalRuns.value > 0 ? settledDrops.value.reduce((sum, drop) => sum + drop.count, 0) / totalRuns.value : 0
)

const hasFilters = computed(() => Boolean(dungeon.value) || rarity.value !== null || Boolean(itemKey.value) || period.value !== null)
const isFilteredEmpty = computed(() => hasFilters.value && visibleRuns.value.length === 0 && visibleDrops.value.length === 0)
const isEmpty = computed(
    () => loaded.value && !loadError.value && runs.value.length === 0 && drops.value.filter(isDungeonDrop).length === 0
)

const itemRows = computed(() => groupDropsByItem(lootDrops.value).slice(0, 10))
const dungeonRows = computed(() => groupStatsByDungeon(visibleRuns.value, visibleDrops.value).filter(row => row.runs > 0 || row.drops > 0))

/** 每个场次掉了哪些物品（最近场次里按 inline 图标 + 数量展示；不受品质/物品筛选影响，保留上下文）。 */
const runItems = computed(() => {
    const byRun = new Map<number, AfkDrop[]>()
    for (const drop of periodDrops.value) {
        if (drop.runId === null) continue
        const list = byRun.get(drop.runId)
        if (list) list.push(drop)
        else byRun.set(drop.runId, [drop])
    }
    const map = new Map<number, AfkItemRow[]>()
    for (const [runId, list] of byRun) map.set(runId, groupDropsByItem(list))
    return map
})

/** 最近场次每页条数。 */
const RUN_PAGE_SIZE = 20
/** 当前页码（0 基）。 */
const runPage = ref(0)

/** 全部场次（倒序）：最近场次表不截断，靠翻页浏览。 */
const sortedRuns = computed(() => [...visibleRuns.value].sort((a, b) => b.startedAt - a.startedAt))

/** 总页数，至少 1 页。 */
const runPageCount = computed(() => Math.max(1, Math.ceil(sortedRuns.value.length / RUN_PAGE_SIZE)))

/** 当前页的场次。 */
const pagedRuns = computed(() =>
    sortedRuns.value.slice(runPage.value * RUN_PAGE_SIZE, (runPage.value + 1) * RUN_PAGE_SIZE).map(run => ({
        run,
        items: run.id === undefined ? [] : (runItems.value.get(run.id) ?? []),
    }))
)

/**
 * 翻页：页码夹在合法范围内。
 * @param page 目标页（0 基）
 */
function gotoRunPage(page: number) {
    runPage.value = Math.min(Math.max(0, page), runPageCount.value - 1)
}

// 筛选或数据变化后回到第一页，避免停在越界页码上
watch([sortedRuns, () => runPageCount.value], () => {
    if (runPage.value > runPageCount.value - 1) runPage.value = 0
})

/** 物品排行展示来源。 */
type ItemSource = "loot" | "craft"

const ITEM_SOURCES: { key: ItemSource; labelKey: string }[] = [
    { key: "loot", labelKey: "afk-ledger.item_source_loot" },
    { key: "craft", labelKey: "afk-ledger.item_source_craft" },
]

/** 物品排行当前来源：默认副本掉落。 */
const itemSource = ref<ItemSource>("loot")
/** 当前来源下的排行行。 */
const itemSourceRows = computed(() => (itemSource.value === "craft" ? craftRows.value.slice(0, 10) : itemRows.value))
/** 当前来源下的总件数。 */
const itemSourceTotal = computed(() =>
    itemSource.value === "craft" ? craftTotal.value : lootDrops.value.reduce((sum, drop) => sum + drop.count, 0)
)
/** 当前来源下的金色件数。 */
const itemSourceGold = computed(() =>
    itemSource.value === "craft" ? craftGold.value : lootDrops.value.reduce((sum, drop) => sum + (drop.rarity >= 5 ? drop.count : 0), 0)
)

/** 物品筛选项：按当前时间范围/副本的副本掉落聚合，时段与品质筛选不影响可选范围。 */
const itemOptions = computed(() => {
    const seen = new Map<string, string>()
    for (const drop of drops.value) {
        if (!isDungeonDrop(drop)) continue
        seen.set(dropKey(drop), drop.itemName)
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
})

const dungeonOptions = computed(() =>
    Object.entries(ledger.snapshot.dungeons)
        .map(([id, entry]) => ({ value: id, label: afkDungeonLabel(id, entry.name) }))
        .sort((a, b) => a.label.localeCompare(b.label))
)

/**
 * 副本的展示名：与 /db/dungeon 列表同一套规则（带括号后缀）。
 * @param id 副本 ID
 * @param fallback 数据包里查不到时的名字
 * @returns 展示名
 */
function afkDungeonLabel(id: string, fallback: string) {
    return dungeonDisplayName(id, afkDungeonName(id, fallback))
}

/**
 * 副本详情页链接：数据包里有这个副本才给链接。
 * @param id 副本 ID
 * @returns 路由；查不到时为空串
 */
function dungeonLink(id: string) {
    // 迷津之类的玩法在副本表里没有条目，走资料库的对应页
    if (id in AFK_DUNGEON_ALIASES) return "/db/rouge"
    const numericId = Number(id)
    return Number.isFinite(numericId) && dungeonMap.has(numericId) ? `/db/dungeon/${numericId}` : ""
}

/** 品质筛选的受控值：FilterSelect 用空串表示未选择。 */
const rarityModel = computed<string | number>({
    get: () => rarity.value ?? "",
    set: value => {
        rarity.value = value === "" ? null : Number(value)
    },
})

/** 品质名称走本地化文案，不再用固定的中文色名。 */
function rarityName(n: number) {
    return t(`afk-ledger.rarity_${n}`)
}

const rarityOptions = computed(() => [5, 4, 3, 2, 1].map(n => ({ value: n, label: rarityName(n), swatch: n })))

/** 趋势分桶：今日按小时，其余按天。 */
const bucketMs = computed(() => (range.value === "today" ? 3600000 : 86400000))

const trend = computed(() => {
    const now = Date.now()
    let from = rangeFrom(range.value)
    if (range.value === "all") {
        const earliest = drops.value.reduce((min, drop) => Math.min(min, drop.at), now)
        from = startOfDay(earliest)
    }
    return trendBuckets(
        drops.value.filter(isDungeonDrop),
        runs.value,
        from,
        now,
        bucketMs.value
    )
})

/** 分布条的一行：键、展示名、件数、颜色。 */
type MixRow = { key: string; label: string; count: number; color: string; rarity?: number }

/** 品质维度的行：颜色即品质色。 */
const rarityMixRows = computed<MixRow[]>(() =>
    [5, 4, 3, 2, 1]
        .map(n => ({
            key: `rarity-${n}`,
            label: rarityName(n),
            count: itemDrops.value.reduce((sum, drop) => sum + (isDungeonDrop(drop) && drop.rarity === n ? drop.count : 0), 0),
            color: getRarityColor(n),
            rarity: n,
        }))
        .filter(row => row.count > 0)
)

/** 副本维度的行：按副本聚合件数，颜色走调色板。 */
const dungeonMixRows = computed<MixRow[]>(() => {
    const counts = new Map<string, { name: string; count: number }>()
    for (const drop of itemDrops.value) {
        if (!isDungeonDrop(drop)) continue
        const key = drop.dungeonId || "unknown"
        const row =
            counts.get(key) ??
            {
                name: drop.dungeonId
                    ? afkDungeonLabel(drop.dungeonId, drop.dungeonName)
                    : t("afk-ledger.mix_unassigned"),
                count: 0,
            }
        row.count += drop.count
        counts.set(key, row)
    }
    return [...counts.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([key, row], index) => ({
            key: `dungeon-${key}`,
            label: row.name,
            count: row.count,
            color: mixPalette[index % mixPalette.length],
        }))
})

/** 物品维度的行：按物品聚合件数。 */
const itemMixRows = computed<MixRow[]>(() =>
    groupDropsByItem(itemDrops.value.filter(isDungeonDrop))
        .slice(0, 8)
        .map((row, index) => ({
            key: `item-${row.key}`,
            label: row.name,
            count: row.count,
            color: mixPalette[index % mixPalette.length],
            rarity: row.rarity,
        }))
)

/** 铸造维度的行：独立的铸造成品统计。 */
const craftMixRows = computed<MixRow[]>(() => {
    const rows = groupDropsByItem(displayCraftDrops.value).slice(0, 8)
    return rows.map((row, index) => ({
        key: `craft-${row.key}`,
        label: row.name,
        count: row.count,
        color: mixPalette[index % mixPalette.length],
        rarity: row.rarity,
    }))
})

/** 当前维度下的行。 */
const mixRows = computed<MixRow[]>(() => {
    if (mixDimension.value === "dungeon") return dungeonMixRows.value
    if (mixDimension.value === "item") return itemMixRows.value
    if (mixDimension.value === "craft") return craftMixRows.value
    return rarityMixRows.value
})



/** 颜色归一化缓存：主题变量是 oklch，ECharts 的强调色计算解析不了。 */
const colorCache = new Map<string, string>()
/** 1×1 画布，只用来把任意 CSS 颜色换算成 sRGB。 */
let colorProbe: CanvasRenderingContext2D | null = null

/**
 * 把任意 CSS 颜色换算成 `rgb()` 字符串。
 * ECharts 做 hover 提亮时会解析颜色，遇到 oklch 解析失败就把填充设为空，
 * 表现为「鼠标一碰柱子就消失」；这里先经画布转成 sRGB 再交给图表。
 * @param value CSS 颜色
 * @returns sRGB 颜色
 */
function toChartColor(value: string) {
    const cached = colorCache.get(value)
    if (cached) return cached
    if (!colorProbe) {
        const canvas = document.createElement("canvas")
        canvas.width = 1
        canvas.height = 1
        colorProbe = canvas.getContext("2d", { willReadFrequently: true })
    }
    if (!colorProbe) return value
    colorProbe.fillStyle = value
    colorProbe.fillRect(0, 0, 1, 1)
    const [r, g, b] = colorProbe.getImageData(0, 0, 1, 1).data
    const normalized = `rgb(${r}, ${g}, ${b})`
    colorCache.set(value, normalized)
    return normalized
}

/**
 * 给 `rgb()` 颜色加透明度。
 * @param color `rgb(r, g, b)` 形式的颜色
 * @param alpha 0–1
 * @returns `rgba()` 颜色
 */
function withAlpha(color: string, alpha: number) {
    const match = color.match(/rgba?\(([^)]+)\)/)
    if (!match) return color
    const [r, g, b] = match[1].split(",").map(part => Number(part.trim()))
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 图表配色随主题重算。 */
const chartColors = computed(() => {
    void setting.theme
    void setting.customTheme
    const style = getComputedStyle(document.body)
    const read = (name: string, fallback: string) => toChartColor(style.getPropertyValue(name).trim() || fallback)
    return {
        text: read("--color-base-content", "#a1a1aa"),
        muted: read("--color-base-content", "#71717a"),
        border: read("--color-base-300", "#3f3f46"),
        primary: read("--color-primary", "#60a5fa"),
        secondary: read("--color-secondary", "#f472b6"),
    }
})

/**
 * 趋势图横轴标签。
 * @param at 桶起点
 * @returns 今日为小时，其余为月-日
 */
function trendLabel(at: number) {
    const date = new Date(at)
    const pad = (value: number) => String(value).padStart(2, "0")
    if (range.value === "today") return `${pad(date.getHours())}:00`
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 时段筛选项的显示文案：今日按小时，其余按日期。
 * @param value 时段
 * @returns 例如 `14:00–14:59` / `10-22`
 */
function periodLabel(value: Period) {
    const start = new Date(value.from)
    const pad = (input: number) => String(input).padStart(2, "0")
    if (bucketMs.value < 86400000) return `${pad(start.getHours())}:00–${pad(start.getHours())}:59`
    return `${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
}

/** 时段筛选的受控值：空串表示未选择。 */
const periodModel = computed<string | number>({
    // 选项值来自 trend 的数值时间戳，这里必须同为 number，否则 FilterSelect 匹配不到显示名
    get: () => period.value?.from ?? "",
    set: value => setPeriod(value === "" ? null : Number(value)),
})

/** 有数据的时段选项：给无法点柱子的键盘/读屏用户一条等价路径。 */
const periodOptions = computed(() =>
    trend.value
        .filter(point => point.drops > 0)
        .map(point => ({ value: point.at, label: periodLabel({ from: point.at, to: point.at + bucketMs.value }) }))
)

/**
 * 设定/清除时段筛选。
 * @param from 桶起点；null 表示清除
 */
function setPeriod(from: number | null) {
    if (from === null) {
        period.value = null
        return
    }
    if (period.value?.from === from) {
        period.value = null
        return
    }
    period.value = { from, to: from + bucketMs.value }
}

/**
 * 点击趋势图：按该桶的时段筛选，重复点击同一个桶取消。
 * @param index 类目下标
 */
function onBarClick(index: number) {
    const point = trend.value[index]
    // 空格子没有柱子可点，命中它不产生筛选
    if (!point || point.drops === 0) return
    setPeriod(point.at)
}

/** 点品质色块：切换该品质筛选。 */
function toggleRarity(n: number) {
    rarity.value = rarity.value === n ? null : n
}

/**
 * 一次清除时段/品质/物品筛选（保留时间范围与副本）。
 */
function resetFilters() {
    period.value = null
    rarity.value = null
    itemKey.value = ""
}

const trendOption = computed<EChartsOption>(() => {
    void i18next.language
    const color = chartColors.value
    const labels = trend.value.map(point => trendLabel(point.at))
    const selectedFrom = period.value?.from ?? null
    return {
        grid: { left: 40, right: 16, top: 32, bottom: 24 },
        tooltip: {
            trigger: "axis",
            // 阴影色自己定：默认的深色遮罩会把柱子和折线压暗
            axisPointer: { type: "shadow", shadowStyle: { color: withAlpha(toChartColor(color.primary), 0.08) } },
            valueFormatter: value => formatNumber(Number(value)),
        },
        legend: {
            top: 0,
            right: 0,
            textStyle: { color: color.muted, fontSize: 11 },
            data: [t("afk-ledger.series_drops"), t("afk-ledger.series_runs")],
        },
        xAxis: {
            type: "category",
            data: labels,
            axisLabel: { color: color.muted, fontSize: 10, hideOverlap: true },
            axisLine: { lineStyle: { color: color.border } },
            axisTick: { show: false },
        },
        yAxis: {
            type: "value",
            minInterval: 1,
            axisLabel: { color: color.muted, fontSize: 10 },
            splitLine: { lineStyle: { color: color.border, opacity: 0.5 } },
        },
        series: [
            {
                name: t("afk-ledger.series_drops"),
                type: "bar",
                // 选中的时段用描边强调，点击后能直接看出筛选落在哪一根
                data: trend.value.map(point =>
                    point.at === selectedFrom
                        ? {
                              value: point.drops,
                              itemStyle: { color: color.primary, borderColor: color.text, borderWidth: 1.5, borderRadius: [2, 2, 0, 0] },
                          }
                        : point.drops
                ),
                itemStyle: { color: color.primary, borderRadius: [2, 2, 0, 0] },
                // 显式给强调态配色：不让 ECharts 自己提亮（它对非 hex/rgb 的颜色不可靠）
                emphasis: { itemStyle: { color: color.primary, borderColor: color.text, borderWidth: 1 } },
                barMaxWidth: 18,
            },
            {
                name: t("afk-ledger.series_runs"),
                type: "line",
                data: trend.value.map(point => point.runs),
                smooth: true,
                symbol: "none",
                lineStyle: { color: color.secondary ?? color.primary, width: 2 },
                itemStyle: { color: color.secondary ?? color.primary },
                emphasis: { lineStyle: { width: 2.5 }, scale: false },
                // 场次与件数共用一个纵轴，量级差太大时按次轴读
            },
        ],
    }
})

/** 当前维度的总件数（堆叠条与占比共用）。 */
const mixTotal = computed(() => mixRows.value.reduce((sum, row) => sum + row.count, 0))

/**
 * 毫秒格式化为 `mm:ss` / `h:mm:ss`。
 * @param ms 时长
 * @returns 文本
 */
function formatDuration(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    const pad = (value: number) => String(value).padStart(2, "0")
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

/**
 * 时间戳格式化为 `MM-DD HH:mm:ss`。
 * @param ts 时间戳
 * @returns 文本
 */
function formatStamp(ts: number) {
    const date = new Date(ts)
    const pad = (value: number) => String(value).padStart(2, "0")
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 数字按当前语言分组（KPI 与表格共用一套格式）。 */
const numberFormat = computed(() => {
    try {
        return new Intl.NumberFormat(i18next.language || undefined)
    } catch {
        return new Intl.NumberFormat()
    }
})

/**
 * 千分位格式化。
 * @param value 数字
 * @returns 文本
 */
function formatNumber(value: number) {
    return numberFormat.value.format(value)
}

/**
 * 保留一位小数并本地化。
 * @param value 数字
 * @returns 文本
 */
function formatDecimal(value: number) {
    return new Intl.NumberFormat(i18next.language || undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(value)
}

/**
 * 单件物品占当前筛选总掉落的比例。
 * @param count 件数
 * @returns 百分比文本
 */
function shareOf(count: number) {
    if (mixTotal.value <= 0) return "0%"
    return `${((count / mixTotal.value) * 100).toFixed(1)}%`
}

/**
 * 点击分布条的一行：品质维度切换品质筛选，其余维度把该分组设为对应筛选。
 * @param row 行数据
 */
function pickMixRow(row: MixRow) {
    if (mixDimension.value === "rarity") {
        toggleRarity(row.rarity ?? 0)
        return
    }
    if (mixDimension.value === "dungeon") {
        const id = row.key.replace(/^dungeon-/, "")
        if (id === "unknown") return
        dungeon.value = dungeon.value === id ? "" : id
        return
    }
    if (mixDimension.value === "item") {
        const key = row.key.replace(/^item-/, "")
        itemKey.value = itemKey.value === key ? "" : key
    }
}

/**
 * 该行是否是当前生效的筛选。
 * @param row 行数据
 * @returns 选中时为 true
 */
function rowSelected(row: MixRow) {
    if (mixDimension.value === "rarity") return rarity.value === row.rarity
    if (mixDimension.value === "dungeon") return dungeon.value === row.key.replace(/^dungeon-/, "")
    if (mixDimension.value === "item") return itemKey.value === row.key.replace(/^item-/, "")
    return false
}

/**
 * 该行是否可点击筛选（铸造维度没有对应筛选，避免做成假按钮）。
 * @param row 行数据
 * @returns 可点击时为 true
 */
function mixRowClickable(row: MixRow) {
    if (mixDimension.value === "dungeon") return row.key !== "dungeon-unknown"
    return mixDimension.value !== "craft"
}

/** 小窗是否处于鼠标穿透状态（跨窗口读 localStorage）。 */
const widgetClickThrough = ref(readAfkWidgetClickThrough())

/**
 * 解除小窗的鼠标穿透：写回共享状态，小窗自己也会收到 storage 事件跟着恢复。
 */
async function unlockWidget() {
    writeAfkWidgetClickThrough(false)
    widgetClickThrough.value = false
    const widget = await getAfkWidgetWindow()
    if (widget) await setAfkWidgetIgnoreCursorEvents(widget, false)
}

// 穿透状态由小窗写入，主窗口这里跟着刷新按钮显隐
window.addEventListener("storage", event => {
    if (event.key?.startsWith("afk_widget_click_through")) widgetClickThrough.value = readAfkWidgetClickThrough()
})

/** 导入 / 导出进行中：按钮禁用，避免并发读写同一个库。 */
const transferBusy = ref(false)

/**
 * 导出账本备份（JSON）。
 */
async function exportBackup() {
    if (transferBusy.value) return
    transferBusy.value = true
    try {
        const payload = await ledger.exportBackup()
        const text = JSON.stringify(payload, null, 2)
        const stamp = new Date().toISOString().slice(0, 10)
        const fileName = `afk-ledger-${stamp}.json`
        if (env.isApp) {
            const path = await dialog.save({
                title: t("afk-ledger.export"),
                defaultPath: fileName,
                filters: [{ name: "JSON", extensions: ["json"] }],
            })
            if (!path) return
            await writeTextFile(path, text)
        } else {
            const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
            const anchor = document.createElement("a")
            anchor.href = url
            anchor.download = fileName
            document.body.appendChild(anchor)
            anchor.click()
            document.body.removeChild(anchor)
            URL.revokeObjectURL(url)
        }
        ui.showSuccessMessage(t("afk-ledger.export_done", { runs: payload.runs.length, drops: payload.drops.length }))
    } catch (error) {
        ui.showErrorMessage(t("afk-ledger.export_failed", { error: String(error) }))
    } finally {
        transferBusy.value = false
    }
}

/**
 * 导入账本备份：与现有数据合并，重复记录跳过。
 */
async function importBackup() {
    if (transferBusy.value) return
    transferBusy.value = true
    try {
        let text = ""
        if (env.isApp) {
            const path = await dialog.open({
                title: t("afk-ledger.import"),
                multiple: false,
                filters: [{ name: "JSON", extensions: ["json"] }],
            })
            if (!path || Array.isArray(path)) return
            text = await readTextFile(path)
        } else {
            text = await pickFileInBrowser()
            if (!text) return
        }
        const result = await ledger.importBackup(JSON.parse(text))
        await reload()
        ui.showSuccessMessage(
            t("afk-ledger.import_done", { runs: result.runs, drops: result.drops, skipped: result.skipped })
        )
    } catch (error) {
        ui.showErrorMessage(t("afk-ledger.import_failed", { error: String(error) }))
    } finally {
        transferBusy.value = false
    }
}

/**
 * 网页端选择本地 JSON 文件并读出文本。
 * @returns 文件内容；用户取消时为空串
 */
function pickFileInBrowser() {
    return new Promise<string>(resolve => {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "application/json,.json"
        input.onchange = async () => {
            const file = input.files?.[0]
            resolve(file ? await file.text() : "")
        }
        input.oncancel = () => resolve("")
        input.click()
    })
}

/**
 * 进入清空确认态；6 秒内不确认自动取消。
 */
function askClear() {
    confirmingClear.value = true
    if (clearTimer !== null) window.clearTimeout(clearTimer)
    clearTimer = window.setTimeout(() => {
        confirmingClear.value = false
        clearTimer = null
    }, 6000)
}

/**
 * 确认清空账本并重新加载。
 */
function clearAll() {
    confirmingClear.value = false
    if (clearTimer !== null) {
        window.clearTimeout(clearTimer)
        clearTimer = null
    }
    void ledger.clearAll().then(() => reload())
}
</script>

<template>
    <ScrollSpyLayout auto nav-kicker="AFK LEDGER" class="h-full">
        <div class="flex flex-col gap-3 p-4">
        <AfkLedgerHero
            kicker="AFK LEDGER"
            :title="$t('afk-ledger.title')"
            :subtitle="$t('afk-ledger.subtitle')"
        />

        <!-- 采集与筛选：没有接收端就没有新数据，开关直接放在这一页 -->
        <section :data-scroll-title="$t('afk-ledger.nav_capture')" class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2">
            <label class="flex cursor-pointer items-center gap-2 text-xs text-base-content/75">
                <input
                    type="checkbox"
                    class="toggle toggle-xs toggle-secondary"
                    :checked="afkSupport.running"
                    :disabled="afkSupport.busy || !env.isApp"
                    @change="afkSupport.setEnabled(($event.target as HTMLInputElement).checked)"
                />
                {{ $t("afk-support.enable") }}
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-base-content/75">
                <input
                    type="checkbox"
                    class="toggle toggle-xs toggle-secondary"
                    :checked="afkSupport.notifyDungeon"
                    :disabled="!env.isApp"
                    @change="afkSupport.setNotifyDungeon(($event.target as HTMLInputElement).checked)"
                />
                {{ $t("afk-support.notify_dungeon") }}
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-xs text-base-content/75">
                <input
                    type="checkbox"
                    class="toggle toggle-xs toggle-secondary"
                    :checked="afkSupport.notifyCraft"
                    :disabled="!env.isApp"
                    @change="afkSupport.setNotifyCraft(($event.target as HTMLInputElement).checked)"
                />
                {{ $t("afk-support.notify_craft") }}
            </label>
            <span class="inline-flex items-center gap-1.5 text-[11px] text-base-content/55">
                <span
                    class="inline-block size-1.5 rounded-full"
                    :class="afkSupport.connected ? 'bg-success' : afkSupport.running ? 'bg-warning' : 'bg-base-content/25'"
                />
                {{ $t(supportStatusKey) }}
            </span>
            <span class="font-mono text-[10px] text-base-content/35">
                {{ $t("afk-support.received") }} {{ formatNumber(afkSupport.status?.received ?? 0) }} ·
                {{ $t("afk-support.dropped") }} {{ formatNumber(afkSupport.status?.dropped ?? 0) }}
            </span>
            <span v-if="afkSupport.busy" class="loading loading-spinner loading-xs" />
            <span v-if="afkSupport.lastError" class="text-[11px] text-error">{{ afkSupport.lastError }}</span>
            <span v-else-if="!env.isApp" class="text-[11px] text-warning">{{ $t("afk-support.app_only") }}</span>
            <span v-else class="text-[11px] text-base-content/35">{{ $t("afk-support.enable_hint") }}</span>
            <label
                v-if="env.isApp"
                class="ml-auto flex cursor-pointer items-center gap-2 text-xs text-base-content/75"
                :title="$t('afk-widget.open_hint')"
            >
                <input
                    type="checkbox"
                    class="toggle toggle-xs toggle-secondary"
                    :checked="setting.afkWidgetEnabled"
                    :disabled="afkWidgetBusy"
                    @change="setAfkWidgetEnabled(($event.target as HTMLInputElement).checked)"
                />
                {{ $t("afk-widget.open") }}
            </label>
            <!-- 纯图标方块按钮：切换画面风格（普通 / BAD APPLE 黑白剪影） -->
            <button
                type="button"
                class="btn btn-xs btn-square h-6 min-h-0"
                :class="afkSilhouette ? 'border-base-content/40 bg-base-content text-base-100' : 'border-base-content/15'"
                :title="`${$t('afk-widget.style_toggle')} · ${$t(afkSilhouette ? 'afk-widget.style_badapple' : 'afk-widget.style_normal')}`"
                :aria-label="`${$t('afk-widget.style_toggle')} · ${$t(afkSilhouette ? 'afk-widget.style_badapple' : 'afk-widget.style_normal')}`"
                :aria-pressed="afkSilhouette"
                @click="cycleAfkStyle"
            >
                <svg viewBox="0 0 16 16" class="size-4" fill="currentColor" fill-rule="evenodd" aria-hidden="true">
                    <path
                        d="M8 1.4c-3.6 0-6.4 2.5-6.4 5.5 0 .6.5 1.1 1.1 1.1h10.6c.6 0 1.1-.5 1.1-1.1 0-3-2.8-5.5-6.4-5.5Zm-2.6 2.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm5.1.3a.85.85 0 1 0 0 1.7.85.85 0 0 0 0-1.7Z"
                    />
                    <path d="M6.1 9.4h3.8v3c0 .9-.7 1.6-1.6 1.6h-.6c-.9 0-1.6-.7-1.6-1.6v-3Z" opacity=".6" />
                </svg>
            </button>
            <!-- 小窗开了鼠标穿透后自己也点不到，恢复入口放在这里 -->
            <button
                v-if="env.isApp && widgetClickThrough"
                type="button"
                class="btn btn-xs border-warning/50 text-warning"
                :title="$t('afk-widget.unlock_hint')"
                @click="unlockWidget"
            >
                {{ $t("afk-widget.unlock") }}
            </button>
            <RouterLink
                :to="{ path: '/setting', query: { section: 'afk-support' } }"
                class="text-[11px] text-primary/80 hover:text-primary"
                :class="env.isApp ? '' : 'ml-auto'"
            >
                {{ $t("afk-ledger.more_settings") }}
            </RouterLink>
        </div>

        <!-- 筛选 -->
        <div class="flex flex-wrap items-center gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
                <button
                    v-for="option in RANGE_OPTIONS"
                    :key="option.key"
                    type="button"
                    class="btn btn-xs whitespace-nowrap"
                    :class="range === option.key ? 'border-primary bg-primary/10 text-primary' : ''"
                    :aria-pressed="range === option.key"
                    @click="range = option.key"
                >
                    {{ $t(option.labelKey) }}
                </button>
            </div>
            <!-- 标准筛选控件：与 /db 列表页同一套 FilterSelect 配方 -->
            <FilterSelect
                v-model="dungeon"
                :options="dungeonOptions"
                :label="$t('afk-ledger.filter_dungeon')"
                :clear-title="$t('common.clear')"
            />
            <FilterSelect
                v-model="rarityModel"
                :options="rarityOptions"
                :label="$t('afk-ledger.filter_rarity')"
                :clear-title="$t('common.clear')"
            />
            <FilterSelect
                v-model="itemKey"
                :options="itemOptions"
                :label="$t('afk-ledger.filter_item')"
                :clear-title="$t('common.clear')"
            />
            <FilterSelect
                v-if="periodOptions.length"
                v-model="periodModel"
                :options="periodOptions"
                :label="$t('afk-ledger.filter_time')"
                :clear-title="$t('common.clear')"
            />
            <span v-if="loading" class="loading loading-spinner loading-xs" />
            <div class="ml-auto flex items-center gap-1.5">
                <!-- 备份：导出 / 导入放在清空旁边，导入是合并而不是覆盖 -->
                <button
                    type="button"
                    class="btn btn-xs"
                    :disabled="transferBusy"
                    :title="$t('afk-ledger.export_hint')"
                    @click="exportBackup"
                >
                    {{ $t("afk-ledger.export") }}
                </button>
                <button
                    type="button"
                    class="btn btn-xs"
                    :disabled="transferBusy"
                    :title="$t('afk-ledger.import_hint')"
                    @click="importBackup"
                >
                    {{ $t("afk-ledger.import") }}
                </button>
                <button
                    v-if="!confirmingClear"
                    type="button"
                    class="btn btn-xs border-error/40 text-error/80 hover:border-error hover:bg-error/10 hover:text-error"
                    @click="askClear"
                >
                    {{ $t("afk-ledger.clear") }}
                </button>
                <template v-else>
                    <span class="text-[11px] text-error">{{ $t("afk-ledger.clear_confirm") }}</span>
                    <button type="button" class="btn btn-xs btn-primary" @click="clearAll">
                        {{ $t("common.confirm") }}
                    </button>
                    <button type="button" class="btn btn-xs" @click="confirmingClear = false">
                        {{ $t("afk-ledger.cancel") }}
                    </button>
                </template>
            </div>
        </div>
        </section>

        <!-- 数据库不可用：说清楚原因，不要只剩一个空列表 -->
        <div
            v-if="ledger.error || loadError"
            role="alert"
            class="flex flex-col gap-1 rounded-xs border border-error/40 bg-error/5 px-3 py-2"
        >
            <div class="flex items-center gap-2 text-xs text-error">
                <Icon icon="ri:error-warning-line" class="size-4 shrink-0" />
                {{ $t("afk-ledger.db_error") }}
            </div>
            <p class="font-mono text-[10px] break-all text-base-content/45">{{ ledger.error || loadError }}</p>
            <button type="button" class="btn btn-xs w-fit border-primary bg-primary/10 text-primary" @click="reload()">
                {{ $t("common.retry") }}
            </button>
        </div>

        <!-- 首屏加载 -->
        <div
            v-else-if="!loaded"
            class="flex flex-col items-center gap-2 rounded-xs border border-dashed border-base-content/15 px-4 py-10 text-center"
        >
            <span class="loading loading-spinner loading-sm text-base-content/40" />
            <p class="text-xs text-base-content/50">{{ $t("afk-ledger.loading") }}</p>
        </div>

        <!-- 空状态：完全没有记录 -->
        <div v-else-if="isEmpty" class="flex flex-col items-center gap-2 rounded-xs border border-dashed border-base-content/15 px-4 py-10 text-center">
            <Icon icon="ri:bar-chart-line" class="size-8 text-base-content/25" />
            <p class="text-sm text-base-content/70">{{ range === "all" ? $t("afk-ledger.empty") : $t("afk-ledger.empty_range") }}</p>
            <p class="max-w-md text-xs text-base-content/45">{{ $t("afk-ledger.empty_hint") }}</p>
            <div class="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                <button
                    v-if="range !== 'all'"
                    type="button"
                    class="btn btn-xs border-primary bg-primary/10 text-primary"
                    @click="range = 'all'"
                >
                    {{ $t("afk-ledger.view_all") }}
                </button>
                <button
                    v-if="env.isApp && !afkSupport.running"
                    type="button"
                    class="btn btn-xs btn-primary"
                    :disabled="afkSupport.busy"
                    @click="afkSupport.setEnabled(true)"
                >
                    {{ $t("afk-ledger.enable_now") }}
                </button>
                <button
                    v-if="hasFilters"
                    type="button"
                    class="btn btn-xs"
                    @click="resetFilters()"
                >
                    {{ $t("afk-ledger.filter_reset") }}
                </button>
            </div>
        </div>

        <!-- 空状态：筛选组合没有结果 -->
        <div
            v-else-if="isFilteredEmpty"
            class="flex flex-col items-center gap-2 rounded-xs border border-dashed border-base-content/15 px-4 py-10 text-center"
        >
            <Icon icon="ri:filter-line" class="size-8 text-base-content/25" />
            <p class="text-sm text-base-content/70">{{ $t("afk-ledger.no_match") }}</p>
            <button type="button" class="btn btn-xs border-primary bg-primary/10 text-primary" @click="resetFilters()">
                {{ $t("afk-ledger.filter_reset") }}
            </button>
        </div>

        <template v-else>
            <div class="flex flex-col gap-3 transition-opacity duration-150" :class="loading ? 'opacity-60' : ''">
            <!-- 概览 -->
            <section :data-scroll-title="$t('afk-ledger.nav_overview')">
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                <div class="rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2">
                    <div class="text-[11px] text-base-content/45">{{ $t("afk-ledger.kpi_runs") }}</div>
                    <div class="font-mono text-lg font-semibold tabular-nums">{{ formatNumber(totalRuns) }}</div>
                </div>
                <div class="rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2">
                    <div class="text-[11px] text-base-content/45">{{ $t("afk-ledger.kpi_drops") }}</div>
                    <div class="font-mono text-lg font-semibold tabular-nums">{{ formatNumber(totalDrops) }}</div>
                </div>
                <div class="rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2">
                    <div class="text-[11px] text-base-content/45">{{ $t("afk-ledger.kpi_gold") }}</div>
                    <div class="font-mono text-lg font-semibold tabular-nums" :style="{ color: getRarityColor(5) }">
                        {{ formatNumber(goldDrops) }}
                    </div>
                </div>
                <div class="rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2">
                    <div class="text-[11px] text-base-content/45">{{ $t("afk-ledger.kpi_avg") }}</div>
                    <div class="font-mono text-lg font-semibold tabular-nums">{{ formatDecimal(avgDrops) }}</div>
                </div>
                <div class="rounded-xs border border-base-content/10 bg-base-100/60 px-3 py-2">
                    <div class="text-[11px] text-base-content/45">{{ $t("afk-ledger.kpi_time") }}</div>
                    <div class="font-mono text-lg font-semibold tabular-nums">{{ formatDuration(totalDuration) }}</div>
                </div>
            </div>
            </section>

            <!-- 图表 -->
            <section :data-scroll-title="$t('afk-ledger.nav_charts')">
            <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div class="min-w-0 rounded-xs border border-base-content/10 bg-base-100/60 p-3 lg:col-span-2">
                    <div class="mb-1 flex flex-wrap items-baseline gap-x-2">
                        <span class="text-xs font-medium text-base-content/60">{{ $t("afk-ledger.chart_trend") }}</span>
                        <span class="text-[10px] text-base-content/35">{{ $t("afk-ledger.hint_click_bar") }}</span>
                    </div>
                    <AfkLedgerChart :option="trendOption" height="240px" @select="onBarClick" />
                </div>
                <div class="flex min-w-0 flex-col rounded-xs border border-base-content/10 bg-base-100/60 p-3">
                    <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="text-xs font-medium text-base-content/60">{{ $t("afk-ledger.chart_breakdown") }}</span>
                        <!-- 维度切换：品质 / 副本 / 物品 / 铸造 -->
                        <div class="flex flex-wrap items-center gap-1">
                            <button
                                v-for="option in MIX_DIMENSIONS"
                                :key="option.key"
                                type="button"
                                class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px] font-normal"
                                :class="
                                    mixDimension === option.key
                                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                                        : 'border-transparent'
                                "
                                :aria-pressed="mixDimension === option.key"
                                @click="mixDimension = option.key"
                            >
                                {{ $t(option.labelKey) }}
                            </button>
                        </div>
                    </div>
                    <!-- 只用颜色区分分组：色块可点击筛选，再次点击取消 -->
                    <div class="flex h-3 w-full gap-px overflow-hidden rounded-xs bg-base-content/5">
                        <button
                            v-for="row in mixRows"
                            :key="row.key"
                            type="button"
                            class="h-full cursor-pointer transition-opacity hover:opacity-80"
                            :style="{
                                width: `${(row.count / Math.max(1, mixTotal)) * 100}%`,
                                background: row.color,
                            }"
                            :title="`${row.label} · ${shareOf(row.count)}`"
                            :aria-label="`${row.label} · ${shareOf(row.count)}`"
                            @click="pickMixRow(row)"
                        />
                    </div>
                    <div class="mt-3 flex flex-col gap-1.5">
                        <component
                            :is="mixRowClickable(row) ? 'button' : 'div'"
                            v-for="row in mixRows"
                            :key="row.key"
                            :type="mixRowClickable(row) ? 'button' : undefined"
                            class="flex w-full items-center gap-2 rounded-xs px-1 py-0.5 text-left text-[11px]"
                            :class="[
                                mixRowClickable(row) ? 'cursor-pointer transition-colors hover:bg-base-content/5' : '',
                                rowSelected(row) ? 'bg-primary/10 font-semibold text-primary' : '',
                            ]"
                            @click="mixRowClickable(row) ? pickMixRow(row) : undefined"
                        >
                            <!-- 品质维度用统一的品质色块，其余维度用调色板小方块（与堆叠条同色） -->
                            <span v-if="mixDimension === 'rarity'" :class="getRaritySwatchClass(row.rarity ?? 1)" />
                            <span
                                v-else
                                class="inline-block size-2.5 shrink-0 rounded-xs"
                                :style="{ background: row.color }"
                            />
                            <!-- 标签吃掉剩余宽度（有空间就铺满，不再固定 128px 截断），数值不参与收缩 -->
                            <span class="min-w-0 flex-1 truncate text-base-content/55">{{ row.label }}</span>
                            <span class="shrink-0 font-mono tabular-nums text-base-content/40">{{ shareOf(row.count) }}</span>
                        </component>
                    </div>
                    <div v-if="mixRows.length === 0" class="py-4 text-center text-xs text-base-content/40">
                        {{ $t("afk-ledger.no_drops") }}
                    </div>
                </div>
            </div>
            </section>

            <!-- 排行 -->
            <section :data-scroll-title="$t('afk-ledger.nav_rank')">
            <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div class="min-w-0 rounded-xs border border-base-content/10 bg-base-100/60 p-3">
                    <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span class="text-xs font-medium text-base-content/60">{{ $t("afk-ledger.top_items") }}</span>
                        <!-- 来源切换：副本掉落 / 铸造产物；两边的统计口径互不混算 -->
                        <div class="flex flex-wrap items-center gap-1">
                            <button
                                v-for="option in ITEM_SOURCES"
                                :key="option.key"
                                type="button"
                                class="btn btn-xs h-5 min-h-0 px-1.5 text-[10px] font-normal"
                                :class="
                                    itemSource === option.key
                                        ? 'border-primary bg-primary/10 font-semibold text-primary'
                                        : 'border-transparent'
                                "
                                :aria-pressed="itemSource === option.key"
                                @click="itemSource = option.key"
                            >
                                {{ $t(option.labelKey) }}
                            </button>
                        </div>
                        <span class="text-[10px] text-base-content/35">
                            {{ itemSource === "loot" ? $t("afk-ledger.loot_only") : $t("afk-ledger.craft_hint") }}
                        </span>
                    </div>
                    <div class="mb-2 flex flex-wrap items-center gap-x-3 text-[11px] text-base-content/50">
                        <span>
                            {{ $t("afk-ledger.craft_total") }}
                            <span class="font-mono text-base-content/80">{{ formatNumber(itemSourceTotal) }}</span>
                        </span>
                        <span>
                            {{ $t("afk-ledger.craft_gold") }}
                            <span class="font-mono" :style="{ color: getRarityColor(5) }">{{ formatNumber(itemSourceGold) }}</span>
                        </span>
                    </div>
                    <!-- 物品列表统一用 inline：图标 + 名称 + 件数，品质由图标底色体现 -->
                    <div class="flex flex-wrap gap-x-4 gap-y-2">
                        <ResourceCostItem
                            v-for="row in itemSourceRows"
                            :key="row.key"
                            inline
                            :name="row.name"
                            :value="[row.count, row.itemId ?? row.name, row.type]"
                        />
                    </div>
                    <div v-if="itemSourceRows.length === 0" class="py-4 text-center text-xs text-base-content/40">
                        {{
                            itemSource === "loot"
                                ? $t("afk-ledger.no_drops")
                                : dungeon
                                  ? $t("afk-ledger.craft_dungeon_hint")
                                  : $t("afk-ledger.no_craft")
                        }}
                    </div>
                </div>

                <div class="min-w-0 rounded-xs border border-base-content/10 bg-base-100/60 p-3">
                    <div class="mb-2 text-xs font-medium text-base-content/60">{{ $t("afk-ledger.top_dungeons") }}</div>
                    <table class="table table-xs w-full">
                        <thead>
                            <tr>
                                <th>{{ $t("afk-ledger.col_dungeon") }}</th>
                                <th class="text-right">{{ $t("afk-ledger.col_runs") }}</th>
                                <th class="text-right">{{ $t("afk-ledger.col_drops") }}</th>
                                <th class="text-right">{{ $t("afk-ledger.col_per_run") }}</th>
                                <th class="text-right">{{ $t("afk-ledger.col_avg_time") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in dungeonRows" :key="row.id">
                                <td class="max-w-40 truncate">
                                    <RouterLink v-if="dungeonLink(row.id)" :to="dungeonLink(row.id)" class="hover:text-primary hover:underline">
                                        {{ afkDungeonLabel(row.id, row.name) }}
                                    </RouterLink>
                                    <span v-else>{{ afkDungeonLabel(row.id, row.name) }}</span>
                                </td>
                                <td class="text-right font-mono tabular-nums">{{ formatNumber(row.runs) }}</td>
                                <td class="text-right font-mono tabular-nums">{{ formatNumber(row.drops) }}</td>
                                <td class="text-right font-mono tabular-nums">
                                    {{ row.completedRuns > 0 ? formatDecimal(row.avgDrops) : "-" }}
                                </td>
                                <td class="text-right font-mono tabular-nums text-base-content/50">
                                    <span v-if="row.runs > row.completedRuns" class="text-primary">
                                        {{ $t("afk-ledger.running") }}
                                    </span>
                                    <span v-else-if="row.completedRuns > 0">{{ formatDuration(row.avgDurationMs) }}</span>
                                    <span v-else>-</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-if="dungeonRows.length === 0" class="py-4 text-center text-xs text-base-content/40">{{ $t("afk-ledger.no_runs") }}</div>
                </div>
            </div>
            </section>

            <!-- 最近场次 -->
            <section :data-scroll-title="$t('afk-ledger.nav_recent')">
            <div class="min-w-0 rounded-xs border border-base-content/10 bg-base-100/60 p-3">
                <div class="mb-2 text-xs font-medium text-base-content/60">{{ $t("afk-ledger.recent_runs") }}</div>
                <div class="overflow-x-auto">
                    <table class="table table-xs w-full">
                        <thead>
                            <tr>
                                <th>{{ $t("afk-ledger.col_time") }}</th>
                                <th>{{ $t("afk-ledger.col_dungeon") }}</th>
                                <th class="text-right">{{ $t("afk-ledger.col_duration") }}</th>
                                <th class="text-right">{{ $t("afk-ledger.col_drops") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="entry in pagedRuns" :key="entry.run.id">
                                <td class="font-mono whitespace-nowrap text-base-content/50">{{ formatStamp(entry.run.startedAt) }}</td>
                                <td class="max-w-48 truncate">
                                    <RouterLink
                                        v-if="dungeonLink(entry.run.dungeonId)"
                                        :to="dungeonLink(entry.run.dungeonId)"
                                        class="hover:text-primary hover:underline"
                                    >
                                        {{ afkDungeonLabel(entry.run.dungeonId, entry.run.dungeonName) }}
                                    </RouterLink>
                                    <span v-else>{{
                                        afkDungeonLabel(entry.run.dungeonId, entry.run.dungeonName)
                                    }}</span>
                                </td>
                                <td class="text-right font-mono tabular-nums">
                                    <span v-if="entry.run.status === 'running'" class="text-primary">{{ $t("afk-ledger.running") }}</span>
                                    <span v-else>{{ formatDuration(runDuration(entry.run)) }}</span>
                                </td>
                                <td class="text-right">
                                    <div v-if="entry.items.length" class="flex flex-wrap justify-end gap-x-3 gap-y-1">
                                        <ResourceCostItem
                                            v-for="row in entry.items"
                                            :key="row.key"
                                            inline
                                            :name="row.name"
                                            :value="[row.count, row.itemId ?? row.name, row.type]"
                                        />
                                    </div>
                                    <span v-else class="text-base-content/30">-</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-if="sortedRuns.length === 0" class="py-4 text-center text-xs text-base-content/40">{{ $t("afk-ledger.no_runs") }}</div>
                    <!-- 分页条常驻：条数不够一页时也显示，只是页码按钮禁用 -->
                    <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-base-content/10 pt-2 text-[11px] text-base-content/50">
                        <span>
                            <template v-if="sortedRuns.length > 0">
                                {{ runPage * RUN_PAGE_SIZE + 1 }}–{{
                                    Math.min(sortedRuns.length, (runPage + 1) * RUN_PAGE_SIZE)
                                }}
                                / {{ sortedRuns.length }}
                            </template>
                            <template v-else>0 / 0</template>
                        </span>
                        <div class="ml-auto flex items-center gap-1.5">
                            <button type="button" class="btn btn-xs" :disabled="runPage === 0" @click="gotoRunPage(runPage - 1)">
                                {{ $t("afk-ledger.prev_page") }}
                            </button>
                            <span class="font-mono">{{ runPage + 1 }} / {{ runPageCount }}</span>
                            <button
                                type="button"
                                class="btn btn-xs"
                                :disabled="runPage >= runPageCount - 1"
                                @click="gotoRunPage(runPage + 1)"
                            >
                                {{ $t("afk-ledger.next_page") }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            </section>
            </div>
        </template>

        <p class="text-[11px] leading-relaxed text-base-content/35">{{ $t("afk-ledger.note") }}</p>
        </div>
    </ScrollSpyLayout>
</template>
