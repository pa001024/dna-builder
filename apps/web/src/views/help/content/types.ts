import type { IconTypes } from "@/components/Icon.vue"

export const HELP_LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko", "fr"] as const

export type HelpLocale = (typeof HELP_LOCALES)[number]

/** 帮助内容自带的六语言文案：教程脚本不走 i18n JSON，避免几百条旁白污染通用翻译表 */
export type LocalizedText = Record<HelpLocale, string>

/** 可本地化文案或原样显示的短技术串（ID、版本号、代码等） */
export type HelpText = LocalizedText | string

/**
 * 生成一条六语言文案。
 * @param zhCN 简体中文
 * @param zhTW 繁体中文
 * @param en 英文
 * @param ja 日文
 * @param ko 韩文
 * @param fr 法文
 */
export function L(zhCN: string, zhTW: string, en: string, ja: string, ko: string, fr: string): LocalizedText {
    return { "zh-CN": zhCN, "zh-TW": zhTW, en, ja, ko, fr }
}

export type TutorialCategoryId = "start" | "build" | "plan" | "data" | "desktop" | "community"

export interface TutorialCategory {
    id: TutorialCategoryId
    title: LocalizedText
    desc: LocalizedText
    icon: IconTypes
    accent: string
}

/** 平台 / 账号前置标记，目录卡与播放器共用 */
export type PlatformTag = "web" | "app" | "login" | "dna"

export interface Tutorial {
    id: string
    /** 目录里的集数，如 "01" */
    number: string
    category: TutorialCategoryId
    title: LocalizedText
    subtitle: LocalizedText
    summary: LocalizedText
    icon: IconTypes
    /** 单色强调色，直接写 hex，避免 Tailwind 动态类名失效 */
    accent: string
    /** 结尾「去试试」跳转的真实路由 */
    route?: string
    routeLabel?: LocalizedText
    platforms: PlatformTag[]
    /** 分镜脚本 */
    scenes: Scene[]
}

export interface CaptionCue {
    /** 相对当前场景开始的秒数 */
    at: number
    text: LocalizedText
}

export interface CalloutSpec {
    at: number
    text: LocalizedText
    /** 相对 1280×720 舞台的百分比坐标 */
    x: number
    y: number
    align?: "left" | "right"
}

export interface CursorSpec {
    at: number
    /** 相对舞台的百分比路径点 */
    path: [number, number][]
    clickAt?: number
}

export interface FocusSpec {
    at?: number
    /** 相对 1280×720 舞台的百分比矩形 */
    x: number
    y: number
    w: number
    h: number
    label?: LocalizedText
}

export interface Scene {
    id: string
    /** 章节名，用于播放器目录与进度分段 */
    chapter: LocalizedText
    duration: number
    captions?: CaptionCue[]
    callouts?: CalloutSpec[]
    cursor?: CursorSpec
    focus?: FocusSpec
    /** 角落提示，如「桌面端」「需登录」 */
    note?: LocalizedText
    shot: Shot
}

export type Shot =
    | TitleShot
    | StepsShot
    | CardsShot
    | BuildShot
    | TimelineShot
    | DatabaseShot
    | MapShot
    | GraphShot
    | LauncherShot
    | DashboardShot
    | CommunityShot
    | ModalShot
    | SettingsShot
    | PaletteShot
    | CodeShot
    | CompareShot
    | CalloutShot
    | RecapShot

export type ShotType = Shot["type"]

export interface TitleShot {
    type: "title"
    variant?: "intro" | "chapter" | "outro"
    kicker?: HelpText
    title: LocalizedText
    subtitle?: LocalizedText
    icon?: IconTypes
    index?: string
}

export interface StepsShot {
    type: "steps"
    kicker?: HelpText
    title: LocalizedText
    steps: { icon: IconTypes; title: LocalizedText; desc: LocalizedText }[]
    layout?: "vertical" | "horizontal"
}

export interface CardItem {
    title: LocalizedText
    subtitle?: LocalizedText
    icon?: IconTypes
    tag?: LocalizedText
    meta?: HelpText
    /** 覆盖卡片强调色 */
    accent?: string
}

export interface CardsShot {
    type: "cards"
    kicker?: HelpText
    title: LocalizedText
    variant?: "default" | "tiles" | "checklist" | "gallery"
    sidebar?: { items: { label: LocalizedText; icon?: IconTypes }[]; active?: number }
    toolbar?: { tabs?: LocalizedText[]; activeTab?: number; search?: LocalizedText; actions?: LocalizedText[] }
    items: CardItem[]
    columns?: number
    /** 被聚焦/点击的卡片下标 */
    highlight?: number
    highlightAt?: number
    highlightLabel?: LocalizedText
    footnote?: LocalizedText
}

export interface BuildShot {
    type: "build"
    mode: "simple" | "pro" | "mods" | "target" | "drag" | "auto"
    character: LocalizedText
    element?: LocalizedText
    level?: string
    weapon?: LocalizedText
    skill?: LocalizedText
    damage?: string
    expression?: string
    dragExpr?: string
    ast?: string[]
    activeVariant?: "A" | "B" | "C"
    tolerance?: [number, number]
    mods?: { name: LocalizedText; level?: number; accent?: boolean; empty?: boolean }[]
    before?: string
    after?: string
    percent?: string
    logs?: { at: number; text: LocalizedText }[]
    stats?: { label: LocalizedText; value: HelpText }[]
}

export interface TimelineBlock {
    start: number
    dur: number
    label: LocalizedText
    kind?: "skill" | "buff"
}

export interface TimelineTrack {
    label: LocalizedText
    kind: "skill" | "buff"
    blocks: TimelineBlock[]
}

export interface TimelineSlot {
    character: LocalizedText
    weapon?: LocalizedText
    tracks: TimelineTrack[]
}

export interface TimelineShot {
    type: "timeline"
    title?: LocalizedText
    slots: TimelineSlot[]
    phase?: "drag" | "resize" | "buff" | "hp" | "save"
    dragLabel?: LocalizedText
    hp?: number[]
    showHp?: boolean
}

export interface DatabaseShot {
    type: "database"
    title: LocalizedText
    search?: LocalizedText
    filters?: LocalizedText[]
    list: { title: LocalizedText; meta?: LocalizedText; icon?: IconTypes; active?: boolean }[]
    detail: {
        title: LocalizedText
        subtitle?: LocalizedText
        icon?: IconTypes
        stats?: { label: LocalizedText; value: string }[]
        tabs?: LocalizedText[]
        activeTab?: number
        paragraphs?: LocalizedText[]
    }
}

export interface MapShot {
    type: "map"
    region: LocalizedText
    layers: { label: LocalizedText; on?: boolean }[]
    points: { x: number; y: number; kind: "tp" | "pet" | "resource"; label?: LocalizedText; at?: number }[]
    path?: { x1: number; y1: number; x2: number; y2: number; kind: "walk" | "teleport" }[]
    showPathAt?: number
    hover?: [number, number]
    coordinate?: string
}

/** 节点卡片上的一个类型化端口：颜色取自 PORT_META，标签是端口名 */
export interface GraphPort {
    label: LocalizedText
    color: string
}

export interface GraphNode {
    x: number
    y: number
    title: LocalizedText
    kind: "input" | "calc" | "output"
    color: string
    at?: number
    icon?: IconTypes
    kindLabel?: LocalizedText
    subtitle?: LocalizedText
    inputs?: GraphPort[]
    outputs?: GraphPort[]
}

export interface GraphEdge {
    from: number
    to: number
    at?: number
    dashed?: boolean
    color?: string
    label?: LocalizedText
    /** 源节点输出端口下标；省略时取第 0 个输出 */
    fromPort?: number
    /** 目标节点输入端口下标；省略时取第 0 个输入 */
    toPort?: number
}

/** 左侧节点库分组：六类 + 组内真实节点名 */
export interface GraphPaletteGroup {
    label: LocalizedText
    color: string
    icon?: IconTypes
    items?: LocalizedText[]
}

export interface GraphShot {
    type: "graph"
    /** 工具栏上显示的图名 */
    title?: LocalizedText
    palette?: GraphPaletteGroup[]
    nodes: GraphNode[]
    edges?: GraphEdge[]
    output?: { label: LocalizedText; value: string; node?: number; hint?: LocalizedText }
    phase?: "palette" | "connect" | "run" | "share" | "perf"
    /** 连接场景是否弹出「拖到空白」候选菜单 */
    menu?: boolean
}

export interface LauncherShot {
    type: "launcher"
    mode: "pack" | "game" | "update"
    title: LocalizedText
    subtitle?: LocalizedText
    versions?: { label: LocalizedText; value: string; active?: boolean }[]
    progress?: { label: LocalizedText; value: number }
    status?: LocalizedText
    actions?: LocalizedText[]
    steps?: { label: LocalizedText; done?: boolean }[]
}

export interface DashboardShot {
    type: "dashboard"
    kicker?: HelpText
    title: LocalizedText
    stats: { label: LocalizedText; value: string; unit?: string; accent?: boolean }[]
    chart?: { kind: "bars" | "line"; values: number[]; labels?: LocalizedText[] }
    rows?: { label: LocalizedText; value: HelpText; meta?: HelpText }[]
}

export interface CommunityShot {
    type: "community"
    mode: "dna" | "chat" | "forum" | "guides" | "ranking"
    title: LocalizedText
    nav?: { label: LocalizedText; icon?: IconTypes; active?: boolean }[]
    messages?: { from: "me" | "them"; text: LocalizedText; author?: LocalizedText; tag?: LocalizedText }[]
    posts?: { title: LocalizedText; author?: LocalizedText; meta?: LocalizedText; tag?: LocalizedText }[]
    stats?: { label: LocalizedText; value: string }[]
    checkIn?: boolean
}

export interface ModalShot {
    type: "modal"
    title: LocalizedText
    description?: LocalizedText
    fields?: { label: LocalizedText; value: LocalizedText }[]
    options?: { label: LocalizedText; desc?: LocalizedText; icon?: IconTypes; active?: boolean }[]
    actions?: LocalizedText[]
    result?: { title: LocalizedText; value: HelpText; hint?: LocalizedText }
    confirmAt?: number
    resultAt?: number
}

export interface SettingsShot {
    type: "settings"
    title: LocalizedText
    nav?: { label: LocalizedText; icon?: IconTypes }[]
    activeNav?: number
    sections: {
        title: LocalizedText
        rows: { label: LocalizedText; control: "toggle" | "select" | "slider"; value?: HelpText; on?: boolean; level?: number }[]
    }[]
}

export interface PaletteShot {
    type: "palette"
    character: LocalizedText
    parts: { label: LocalizedText; color: string; at?: number }[]
    swatches: { color: string; name?: LocalizedText; active?: boolean }[]
    code?: string
    codeAt?: number
}

export interface CodeShot {
    type: "code"
    title: LocalizedText
    language?: string
    lines: string[]
    highlight?: number[]
    copyAt?: number
    result?: LocalizedText
}

export interface CompareSide {
    title: LocalizedText
    subtitle?: LocalizedText
    stats: { label: LocalizedText; value: string }[]
    accent?: boolean
}

export interface CompareShot {
    type: "compare"
    kicker?: HelpText
    title: LocalizedText
    left: CompareSide
    right: CompareSide
    delta?: { label: LocalizedText; value: string; positive?: boolean }
}

export interface CalloutShot {
    type: "callout"
    kicker?: HelpText
    title: LocalizedText
    icon?: IconTypes
    points: { icon?: IconTypes; text: LocalizedText }[]
    note?: LocalizedText
}

export interface RecapShot {
    type: "recap"
    title: LocalizedText
    checklist: LocalizedText[]
    route?: string
    routeLabel?: LocalizedText
    hint?: LocalizedText
}
