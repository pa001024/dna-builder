import { MIHAN_MISSIONS, MIHAN_TYPE_META } from "./mihan-meta"

/**
 * 屏幕信息条(顶部通用浮窗)的共享类型与纯逻辑。
 *
 * 浮窗是一个**条目列表**:每条是一个独立组件(时钟 / 自定义倒计时 / 委托信息 / 定时刷新),
 * 用户可以自由增删、排序。新增条目类型时四处同步:本文件的 `ScreenBarItemType` 联合类型,
 * `createScreenBarItem` 与 `normalizeScreenBarItem`、`resolveScreenBarItem` 的三个分支,
 * `ScreenBarContent.vue` 的渲染分支,以及各语言 `public/i18n/*` 里 `screenBar.item<类型名>` 与展示名文案。
 *
 * 渲染用 Tauri 独立 WebviewWindow(label 见 `SCREEN_BAR_WINDOW_LABEL`),页面路由 `/screen-bar`;
 * 该页面只读 localStorage 里的配置与密函数据,不加载游戏数据包,因此可以秒开。
 * 本模块不依赖 Tauri 运行时与 Pinia,便于单测。
 */

/** 信息条窗口的 Tauri 窗口 label(capabilities 按此授权)。 */
export const SCREEN_BAR_WINDOW_LABEL = "screen-bar"

/** 信息条整组配置在 localStorage 中的唯一键:所有字段放在一个对象里。 */
export const SCREEN_BAR_STORAGE_KEY = "setting_screen_bar"

/** 条目类型。 */
export type ScreenBarItemType = "clock" | "countdown" | "mihan" | "mihanRefresh" | "moling" | "zhouben"

/** 三种游戏定时刷新倒计时,渲染与解析共用同一套分支。 */
export type ScreenBarRefreshType = "mihanRefresh" | "moling" | "zhouben"

/** 条目类型的展示顺序(设置页"添加条目"下拉)。 */
export const SCREEN_BAR_ITEM_TYPES: ScreenBarItemType[] = ["clock", "countdown", "mihan", "mihanRefresh", "moling", "zhouben"]

/** 时钟模板预设(模板语法见 `formatClock`)。 */
export const SCREEN_BAR_CLOCK_PRESETS = ["HH:mm:ss", "HH:mm", "MM-DD ddd HH:mm", "M月D日 dddd", "YYYY-MM-DD HH:mm:ss"] as const

/** 信息条默认数值。 */
export const SCREEN_BAR_DEFAULTS = {
    clockFormat: "HH:mm:ss",
    opacity: 0.88,
    offsetY: 0,
    scale: 1,
} as const

/** 缩放系数区间。 */
export const SCREEN_BAR_MIN_SCALE = 0.7
export const SCREEN_BAR_MAX_SCALE = 2

/** 不透明度区间。 */
export const SCREEN_BAR_MIN_OPACITY = 0.2
export const SCREEN_BAR_MAX_OPACITY = 1

/** 距屏幕顶部偏移区间(逻辑像素)。 */
export const SCREEN_BAR_MIN_OFFSET_Y = 0
export const SCREEN_BAR_MAX_OFFSET_Y = 400

/** 时钟模板长度上限,避免超长模板把窗口撑出屏幕。 */
export const SCREEN_BAR_MAX_FORMAT_LENGTH = 40

/** 自定义倒计时标题长度上限。 */
export const SCREEN_BAR_MAX_TITLE_LENGTH = 16

/** 条目数量上限。 */
export const SCREEN_BAR_MAX_ITEMS = 12

/** 窗口未测量出内容尺寸前使用的初始尺寸(逻辑像素)。 */
export const SCREEN_BAR_INITIAL_SIZE = { width: 420, height: 36 } as const

/** 全部密函类型下标,作为委托条目的默认选择。 */
export const SCREEN_BAR_ALL_MIHAN_TYPES: number[] = MIHAN_TYPE_META.map((_, index) => index)

/** 条目公共字段。 */
type ScreenBarItemBase = {
    /** 稳定标识:列表增删改与渲染 key 都靠它 */
    id: string
}

/** 时钟条目:按自定义模板展示当前时间。 */
export type ScreenBarClockItem = ScreenBarItemBase & {
    type: "clock"
    /** 时间模板,语法见 `formatClock` */
    format: string
}

/** 自定义倒计时条目:倒计时到指定时刻。 */
export type ScreenBarCountdownItem = ScreenBarItemBase & {
    type: "countdown"
    /** 条目前缀文字,可留空 */
    title: string
    /** 目标时刻(`datetime-local` 的 `YYYY-MM-DDTHH:mm` 形式,按本地时间解析) */
    target: string
}

/** 委托信息条目:展示所选密函类型下的任务,并高亮关注的任务。 */
export type ScreenBarMihanItem = ScreenBarItemBase & {
    type: "mihan"
    /** 参与展示的密函类型下标 */
    types: number[]
    /** 本条关注的任务名(取自 `MIHAN_MISSIONS`);为空时不区分关注与未关注 */
    missions: string[]
    /** 只显示关注的任务 */
    onlyMatched: boolean
}

/** 定时刷新条目:距下一次刷新的倒计时(委托按整点,魔灵按 3 天,周本按 7 天)。 */
export type ScreenBarRefreshItem = ScreenBarItemBase & {
    type: ScreenBarRefreshType
}

/** 信息条条目。 */
export type ScreenBarItem = ScreenBarClockItem | ScreenBarCountdownItem | ScreenBarMihanItem | ScreenBarRefreshItem

/** 信息条配置载荷。 */
export type ScreenBarConfig = {
    /** 总开关 */
    enabled: boolean
    /** 条目列表,按数组顺序从左到右渲染 */
    items: ScreenBarItem[]
    /** 鼠标穿透:开启后整条不接收任何指针事件 */
    ignoreCursorEvents: boolean
    /** 整条不透明度 */
    opacity: number
    /** 距屏幕顶部的偏移(逻辑像素) */
    offsetY: number
    /** 内容缩放系数 */
    scale: number
}

/** 委托条目内单条任务。 */
export type ScreenBarMission = {
    /** 任务展示名(取自密函数据) */
    name: string
    /** 是否在用户的关注列表中 */
    matched: boolean
}

/** 委托条目内一个密函类型分组。 */
export type ScreenBarMihanEntry = {
    /** 密函类型下标 */
    typeIndex: number
    /** 该类型要展示的任务 */
    missions: ScreenBarMission[]
    /** 该类型下命中关注的任务数 */
    matchedCount: number
}

/** 自定义倒计时的展示状态。未设置目标时刻与已结束时文案不同。 */
export type ScreenBarCountdownStatus = "unset" | "running" | "expired"

/**
 * 委托条目没有内容可展示的原因。
 *
 * `noTypeSelection` 是类型全被取消勾选,`noSelection` 是"只看关注"但一条任务都没选,
 * `noData` 才是真的没数据——前两种都是筛选条件造成的,必须与"暂无数据"区分开。
 */
export type ScreenBarMihanEmptyReason = "noData" | "noSelection" | "noTypeSelection"

/** 渲染就绪的条目:文本已算好,组件只负责画。 */
export type ResolvedScreenBarItem =
    | { id: string; type: "clock"; text: string }
    | { id: string; type: "countdown"; title: string; text: string; status: ScreenBarCountdownStatus }
    | { id: string; type: "mihan"; entries: ScreenBarMihanEntry[]; emptyReason: ScreenBarMihanEmptyReason }
    | { id: string; type: ScreenBarRefreshType; text: string }

const WEEKDAY_SHORT = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const
const WEEKDAY_FULL = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const

/** 时钟模板占位符,长 token 必须排在短 token 之前,否则 `MM` 会被 `M` 抢先匹配。 */
const CLOCK_TOKEN_PATTERN = /YYYY|YY|MM|M|DD|D|dddd|ddd|HH|H|mm|ss|A/g

const CLOCK_TOKENS: Record<string, (date: Date) => string> = {
    YYYY: date => String(date.getFullYear()),
    YY: date => pad2(date.getFullYear() % 100),
    MM: date => pad2(date.getMonth() + 1),
    M: date => String(date.getMonth() + 1),
    DD: date => pad2(date.getDate()),
    D: date => String(date.getDate()),
    dddd: date => WEEKDAY_FULL[date.getDay()],
    ddd: date => WEEKDAY_SHORT[date.getDay()],
    HH: date => pad2(date.getHours()),
    H: date => String(date.getHours()),
    mm: date => pad2(date.getMinutes()),
    ss: date => pad2(date.getSeconds()),
    A: date => (date.getHours() < 12 ? "上午" : "下午"),
}

let itemSeed = 0

/**
 * 补零到两位。
 * @param value 非负整数
 * @returns 至少两位的字符串
 */
function pad2(value: number): string {
    return value < 10 ? `0${value}` : String(value)
}

/** 把数值钳制到区间;非法时取默认值。 */
function clampNumber(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback
    return Math.min(Math.max(value, min), max)
}

/**
 * 钳制缩放系数。
 * @param value 候选值
 * @returns 区间内的有限数;非法时返回默认值
 */
export function clampBarScale(value: number): number {
    return clampNumber(value, SCREEN_BAR_MIN_SCALE, SCREEN_BAR_MAX_SCALE, SCREEN_BAR_DEFAULTS.scale)
}

/**
 * 钳制整条不透明度。
 * @param value 候选值
 * @returns 区间内的有限数;非法时返回默认值
 */
export function clampBarOpacity(value: number): number {
    return clampNumber(value, SCREEN_BAR_MIN_OPACITY, SCREEN_BAR_MAX_OPACITY, SCREEN_BAR_DEFAULTS.opacity)
}

/**
 * 钳制顶部偏移。
 * @param value 候选值
 * @returns 区间内的整数;非法时返回默认值
 */
export function clampBarOffsetY(value: number): number {
    return Math.round(clampNumber(value, SCREEN_BAR_MIN_OFFSET_Y, SCREEN_BAR_MAX_OFFSET_Y, SCREEN_BAR_DEFAULTS.offsetY))
}

/**
 * 归一化时钟模板:去首尾空白、截断超长模板,空模板回退默认值。
 * @param value 候选模板
 * @returns 可直接渲染的模板
 */
export function normalizeClockFormat(value: unknown): string {
    if (typeof value !== "string") return SCREEN_BAR_DEFAULTS.clockFormat
    const trimmed = value.trim().slice(0, SCREEN_BAR_MAX_FORMAT_LENGTH)
    return trimmed || SCREEN_BAR_DEFAULTS.clockFormat
}

/**
 * 归一化条目前缀文字。
 * @param value 候选文字
 * @returns 去空白并截断后的文字;非字符串返回空串
 */
export function normalizeItemTitle(value: unknown): string {
    return typeof value === "string" ? value.trim().slice(0, SCREEN_BAR_MAX_TITLE_LENGTH) : ""
}

/**
 * 归一化 `datetime-local` 目标时刻。
 * @param value 候选值
 * @returns 合法时原样返回,否则返回空串(表示未设置目标)
 */
export function normalizeCountdownTarget(value: unknown): string {
    if (typeof value !== "string") return ""
    return Number.isFinite(new Date(value).getTime()) ? value : ""
}

/**
 * 按模板格式化时间。
 *
 * 支持的占位符:`YYYY` `YY` `MM` `M` `DD` `D` `dddd`(星期X) `ddd`(周X) `HH` `H` `mm` `ss` `A`(上午/下午)。
 * 未识别的字符原样保留,因此中文与分隔符可以直接写进模板。
 * @param date 目标时间
 * @param format 模板;空模板回退默认格式
 * @returns 格式化后的文本
 */
export function formatClock(date: Date, format: string): string {
    return normalizeClockFormat(format).replace(CLOCK_TOKEN_PATTERN, token => CLOCK_TOKENS[token](date))
}

/**
 * 把剩余毫秒格式化为紧凑倒计时文本。
 * @param ms 剩余毫秒(负数按 0 处理)
 * @returns 不足一小时为 `mm:ss`,否则为 `H:mm:ss`
 */
export function formatCountdown(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
    return `${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * 把剩余毫秒格式化为带天数的倒计时文本,用于跨天的自定义倒计时。
 * @param ms 剩余毫秒(负数按 0 处理)
 * @returns 有天数时为 `N天 HH:mm:ss`,否则与 `formatCountdown` 一致
 */
export function formatCountdownDays(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000))
    const days = Math.floor(total / 86400)
    if (days === 0) return formatCountdown(ms)
    const hours = Math.floor((total % 86400) / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = total % 60
    return `${days}天 ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

/**
 * 计算距下一个整点的剩余毫秒。密函数据按整点刷新,与 `store/mihan` 的 `getNextUpdateTime` 使用同一条规则。
 * @param now 参考时间戳,缺省取当前时间
 * @returns 剩余毫秒
 */
export function getMihanRefreshRemaining(now = Date.now()): number {
    const oneHour = 60 * 60 * 1000
    return Math.ceil(now / oneHour) * oneHour - now
}

/**
 * 按天刷新的两个计时器:刷新周期(天)与相对 UTC 零点的偏移(天)。
 *
 * 实际偏移还要再加 3 小时,口径与 `util.ts` 的 `useGameTimer` 完全一致 —— 那边算出的剩余毫秒
 * 必须和这里逐毫秒对得上,否则首页与浮窗会显示两个不同的时间。
 */
const SCREEN_BAR_DAY_REFRESH: Record<"moling" | "zhouben", { intervalDays: number; offsetDays: number }> = {
    moling: { intervalDays: 3, offsetDays: 1 },
    zhouben: { intervalDays: 7, offsetDays: 3 },
}

/**
 * 计算距下一次按天刷新的剩余毫秒。
 * @param timer 计时器种类
 * @param now 参考时间戳,缺省取当前时间
 * @returns 剩余毫秒
 */
export function getDayRefreshRemaining(timer: "moling" | "zhouben", now = Date.now()): number {
    const { intervalDays, offsetDays } = SCREEN_BAR_DAY_REFRESH[timer]
    const day = 24 * 60 * 60 * 1000
    const offset = offsetDays * day + 3 * 60 * 60 * 1000
    const cycle = intervalDays * day
    return Math.ceil((now + offset) / cycle) * cycle - offset - now
}

/**
 * 归一化密函类型下标:只接受合法范围内的整数,去重后升序。
 * @param raw 原始值
 * @returns 合法下标列表
 */
export function normalizeMihanTypes(raw: unknown): number[] {
    const list = Array.isArray(raw) ? raw : []
    const result = new Set<number>()
    for (const item of list) {
        const index = Number(item)
        if (!Number.isInteger(index) || index < 0 || index >= MIHAN_TYPE_META.length) continue
        result.add(index)
    }
    return [...result].sort((a, b) => a - b)
}

/**
 * 归一化关注任务名列表:只收已知任务名,去重后保持 `MIHAN_MISSIONS` 的顺序。
 * @param raw 原始值
 * @returns 合法任务名列表
 */
export function normalizeMihanMissions(raw: unknown): string[] {
    const list = Array.isArray(raw) ? raw : []
    const picked = new Set(list.filter((item): item is string => typeof item === "string"))
    return MIHAN_MISSIONS.filter(mission => picked.has(mission))
}

/**
 * 按所选类型与关注任务整理委托条目要展示的任务。
 *
 * `onlyMatched` 为真时只保留关注列表里的任务,某类型一条都没有就整组丢掉;为假时展示全部任务,
 * 只把关注中的任务标成命中。关注列表为空表示"还没选关注",此时不标任何命中——
 * 否则"只看关注"会退化成"什么都看",开关看起来完全失效。
 * `typeIndexes` 为空表示用户把类型全取消了,返回空数组(调用方据 `emptyReason` 给提示)。
 * @param data 密函数据(形状不可信)
 * @param typeIndexes 要展示的类型下标
 * @param missions 关注的任务名列表
 * @param onlyMatched 是否只保留关注的任务
 * @returns 待渲染的分组列表;无数据时为空数组
 */
export function collectMihanEntries(
    data: string[][] | undefined,
    typeIndexes: number[],
    missions: string[],
    onlyMatched: boolean
): ScreenBarMihanEntry[] {
    const groups = Array.isArray(data) ? data : []
    const watched = new Set(missions)
    const entries: ScreenBarMihanEntry[] = []
    for (const typeIndex of typeIndexes) {
        const group = groups[typeIndex]
        if (!Array.isArray(group) || group.length === 0) continue
        const all = group.map(name => ({ name, matched: watched.has(name) }))
        const matchedCount = all.filter(mission => mission.matched).length
        const shown = onlyMatched ? all.filter(mission => mission.matched) : all
        if (shown.length === 0) continue
        entries.push({ typeIndex, missions: shown, matchedCount })
    }
    return entries
}

/**
 * 判断委托条目"没有内容"的原因:先说清筛选条件,才轮到数据本身。
 * @param item 委托条目
 * @returns 空原因
 */
function getMihanEmptyReason(item: ScreenBarMihanItem): ScreenBarMihanEmptyReason {
    if (item.types.length === 0) return "noTypeSelection"
    if (item.onlyMatched && item.missions.length === 0) return "noSelection"
    return "noData"
}

/**
 * 把一个条目解析成渲染就绪的数据。
 *
 * 密函数据由调用方注入(本模块不依赖 Pinia),因此同一条解析逻辑可以服务于
 * 浮窗窗口与设置页预览。
 * @param item 条目配置
 * @param now 当前时间
 * @param mihanData 密函分组数据
 * @returns 渲染就绪的条目
 */
export function resolveScreenBarItem(item: ScreenBarItem, now: Date, mihanData: string[][] | undefined): ResolvedScreenBarItem {
    switch (item.type) {
        case "clock":
            return { id: item.id, type: "clock", text: formatClock(now, item.format) }
        case "countdown": {
            if (!item.target) {
                return { id: item.id, type: "countdown", title: item.title, text: "", status: "unset" }
            }
            const remaining = new Date(item.target).getTime() - now.getTime()
            if (!Number.isFinite(remaining) || remaining <= 0) {
                return { id: item.id, type: "countdown", title: item.title, text: "", status: "expired" }
            }
            return { id: item.id, type: "countdown", title: item.title, text: formatCountdownDays(remaining), status: "running" }
        }
        case "mihan":
            return {
                id: item.id,
                type: "mihan",
                entries: collectMihanEntries(mihanData, item.types, item.missions, item.onlyMatched),
                emptyReason: getMihanEmptyReason(item),
            }
        case "mihanRefresh":
            return { id: item.id, type: "mihanRefresh", text: formatCountdown(getMihanRefreshRemaining(now.getTime())) }
        case "moling":
            return { id: item.id, type: "moling", text: formatCountdownDays(getDayRefreshRemaining("moling", now.getTime())) }
        case "zhouben":
            return { id: item.id, type: "zhouben", text: formatCountdownDays(getDayRefreshRemaining("zhouben", now.getTime())) }
    }
}

/**
 * 创建一个条目。
 * @param type 条目类型
 * @returns 该类型的默认条目(带新 id)
 */
export function createScreenBarItem(type: ScreenBarItemType): ScreenBarItem {
    itemSeed += 1
    const id = `${type}-${Date.now().toString(36)}-${itemSeed}`
    switch (type) {
        case "clock":
            return { id, type, format: SCREEN_BAR_DEFAULTS.clockFormat }
        case "countdown":
            return { id, type, title: "", target: "" }
        case "mihan":
            return { id, type, types: [...SCREEN_BAR_ALL_MIHAN_TYPES], missions: [], onlyMatched: false }
        case "mihanRefresh":
        case "moling":
        case "zhouben":
            return { id, type }
    }
}

/**
 * 归一化单个条目(形状不可信)。
 * @param raw 原始数据
 * @returns 合法条目;类型无法识别时返回 null
 */
function normalizeScreenBarItem(raw: unknown): ScreenBarItem | null {
    if (!raw || typeof raw !== "object") return null
    const record = raw as Record<string, unknown>
    const id = typeof record.id === "string" && record.id ? record.id : ""
    if (!id) return null
    switch (record.type) {
        case "clock":
            return { id, type: "clock", format: normalizeClockFormat(record.format) }
        case "countdown":
            return { id, type: "countdown", title: normalizeItemTitle(record.title), target: normalizeCountdownTarget(record.target) }
        case "mihan": {
            // 字段整个缺失时兜底全选;显式空数组是用户把类型全取消了,必须原样保留,
            // 否则读一次存储就把"未选择"变回"全选",勾选框看起来会自己跳回选中。
            const types = Array.isArray(record.types) ? normalizeMihanTypes(record.types) : [...SCREEN_BAR_ALL_MIHAN_TYPES]
            return {
                id,
                type: "mihan",
                types,
                missions: normalizeMihanMissions(record.missions),
                onlyMatched: record.onlyMatched === true,
            }
        }
        case "mihanRefresh":
            return { id, type: "mihanRefresh" }
        case "moling":
            return { id, type: "moling" }
        case "zhouben":
            return { id, type: "zhouben" }
        default:
            return null
    }
}

/**
 * 归一化条目列表:丢弃无法识别的条目、按上限截断。
 * @param raw 原始数据
 * @returns 合法条目列表;全部非法时返回空数组(是否补默认条目由调用方决定)
 */
export function normalizeScreenBarItems(raw: unknown): ScreenBarItem[] {
    const list = Array.isArray(raw) ? raw : []
    const result: ScreenBarItem[] = []
    const usedIds = new Set<string>()
    for (const item of list) {
        if (result.length >= SCREEN_BAR_MAX_ITEMS) break
        const normalized = normalizeScreenBarItem(item)
        if (!normalized || usedIds.has(normalized.id)) continue
        usedIds.add(normalized.id)
        result.push(normalized)
    }
    return result
}

/**
 * 创建一份默认配置。
 *
 * 每次调用都返回**新对象**:`useLocalStorage` 会把默认值直接当作 ref 初值,复用同一个对象会让多个实例互相串改。
 * @returns 全新的默认配置
 */
export function createDefaultScreenBarConfig(): ScreenBarConfig {
    return {
        enabled: false,
        items: [createScreenBarItem("clock"), createScreenBarItem("mihan"), createScreenBarItem("mihanRefresh")],
        ignoreCursorEvents: false,
        opacity: SCREEN_BAR_DEFAULTS.opacity,
        offsetY: SCREEN_BAR_DEFAULTS.offsetY,
        scale: SCREEN_BAR_DEFAULTS.scale,
    }
}

/**
 * 归一化从本地存储读到的配置(形状不可信)。
 *
 * 条目列表为空时回退到默认条目:一条内容都没有的浮窗没有意义,而"不显示浮窗"应当由 `enabled` 表达。
 * @param raw 原始数据
 * @returns 字段齐全且取值合法的配置
 */
export function normalizeScreenBarConfig(raw: unknown): ScreenBarConfig {
    const fallback = createDefaultScreenBarConfig()
    if (!raw || typeof raw !== "object") return fallback
    const record = raw as Record<string, unknown>
    const items = normalizeScreenBarItems(record.items)
    return {
        enabled: record.enabled === true,
        items: items.length > 0 ? items : fallback.items,
        ignoreCursorEvents: record.ignoreCursorEvents === true,
        opacity: clampBarOpacity(Number(record.opacity)),
        offsetY: clampBarOffsetY(Number(record.offsetY)),
        scale: clampBarScale(Number(record.scale)),
    }
}

/**
 * 解析存储里的信息条配置字符串。
 *
 * 读取端统一走这里,不依赖调用方各自补字段:存储里的数据可能由旧版本写入,
 * 缺的是条目**内部**的新字段,而 `mergeDefaults` 这类浅合并只在对象这一层兜底,补不进数组元素。
 * @param raw localStorage 原始字符串
 * @returns 字段齐全的配置;字符串缺失或损坏时返回默认配置
 */
export function parseScreenBarConfig(raw: string | null | undefined): ScreenBarConfig {
    if (!raw) return createDefaultScreenBarConfig()
    try {
        return normalizeScreenBarConfig(JSON.parse(raw))
    } catch (cause) {
        console.error("解析屏幕信息条配置失败,回退默认配置", cause)
        return createDefaultScreenBarConfig()
    }
}
