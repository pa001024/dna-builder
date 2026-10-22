import type { IconTypes } from "@/components/Icon.vue"
import { env } from "@/env"

/**
 * 功能入口定义（More 页磁贴与首页快捷导航共用）。
 */
export type MoreItem = {
    /** 功能标识（用于 i18n 键 `{name}.title` / `{name}.desc` 与磁贴主题表） */
    name: string
    /** 路由路径 */
    path: string
    /** 图标 */
    icon: IconTypes
    /** 是否显示：undefined = 总是显示；false = 当前环境不可用 */
    show?: boolean
}

/**
 * 运行期环境条件（由调用方传入以保持响应式）。
 */
export type MoreItemEnv = {
    /** 安全模式（禁用解包等高风险功能） */
    safeMode: boolean
    /** 脚本管理入口是否已解锁（More 页彩蛋解锁） */
    scriptUnlocked: boolean
}

/** 侧边栏锁定路径：主页与 More 本体，自定义布局中不可移除 */
export const SIDEBAR_LOCKED_PATHS = ["/", "/more"]

/** 侧边栏底部常驻路径：账号与设置已有底部按钮，不进入自定义列表，避免重复 */
export const SIDEBAR_DOCKED_PATHS = ["/game-accounts", "/setting"]

/** 侧边栏候选项形态：基础 tab 与 More 入口在此抽象上对齐 */
export type SidebarEntryLike = {
    name?: string
    path?: string
    icon?: IconTypes
    show?: boolean
}

/** 侧边栏解析项：路径必定存在，可直接渲染 */
export type SidebarEntry = {
    name?: string
    path: string
    icon?: IconTypes
    show?: boolean
}

/**
 * 合并侧边栏全目录：基础 tabs 在前，More 入口追加，同路径只保留前者
 * （如基础 map-local 与 More 的 map-tool 同为 /map-tool）。
 * @param baseTabs 基础 tabs（ui store 的 tabs 原样传入即可）
 * @param moreItems 当前环境可见的 More 入口
 * @returns 去重后的全目录
 */
export function mergeSidebarCatalog(baseTabs: SidebarEntryLike[], moreItems: MoreItem[]): SidebarEntry[] {
    const merged: SidebarEntry[] = []
    const seen = new Set<string>()
    for (const tab of baseTabs) {
        if (!tab.path || seen.has(tab.path)) {
            continue
        }
        seen.add(tab.path)
        merged.push({ name: tab.name, path: tab.path, icon: tab.icon, show: tab.show })
    }
    for (const item of moreItems) {
        if (seen.has(item.path)) {
            continue
        }
        seen.add(item.path)
        merged.push({ name: item.name, path: item.path, icon: item.icon, show: item.show })
    }
    return merged
}

/**
 * 按布局路径解析侧边栏展示项：未知/下架路径自动丢弃，锁定路径缺失时强制补回
 * （主页补首位、More 补末位），保证永远可导航。
 * 环境不可用（show === false）的项予以保留，由调用方过滤显示。
 * @param layout 布局路径数组，顺序即展示顺序
 * @param baseTabs 基础 tabs
 * @param moreItems 当前环境的 More 入口（含 show 标记）
 * @returns 解析后的展示项
 */
export function resolveSidebarEntries(layout: string[], baseTabs: SidebarEntryLike[], moreItems: MoreItem[]): SidebarEntry[] {
    const catalog = new Map(mergeSidebarCatalog(baseTabs, moreItems).map(entry => [entry.path, entry]))
    const paths = [...layout]
    for (const locked of SIDEBAR_LOCKED_PATHS) {
        if (!paths.includes(locked)) {
            if (locked === "/more") {
                paths.push(locked)
            } else {
                paths.unshift(locked)
            }
        }
    }
    return paths.map(path => catalog.get(path)).filter((entry): entry is SidebarEntry => !!entry)
}

/**
 * 全量功能入口列表：基础入口 + 按解锁状态追加的脚本管理入口。
 * @param envs 运行期环境条件（安全模式、脚本解锁）
 * @returns 完整入口列表（含 show 标记，需由调用方过滤 show !== false）
 */
export function getMoreItems(envs: MoreItemEnv): MoreItem[] {
    const isApp = env.isApp
    return [
        { name: "char-build", path: "/char", icon: "ri:hammer-line" },
        { name: "guides", path: "/guides", icon: "ri:book-line" },
        { name: "counter", path: "/counter", icon: "plus_one" },
        { name: "build-compare", path: "/char-build-compare", icon: "ri:table-view" },
        { name: "dna-home", path: "/dna", icon: "ri:chat-thread-line" },
        { name: "database", path: "/db", icon: "ri:book-line" },
        { name: "levelup", path: "/levelup", icon: "ri:calculator-line" },
        { name: "achievement", path: "/achievement", icon: "ri:trophy-line" },
        { name: "abyss-usage", path: "/abyss-usage", icon: "ri:bar-chart-line" },
        { name: "ranking", path: "/ranking", icon: "ri:sort-number-asc" },
        { name: "setting", path: "/setting", icon: "ri:settings-3-line" },
        // APP 下载页只服务网页端访客（Tauri 桌面端已经是完整客户端，不需要再装移动端）
        { name: "download", path: "/download", icon: "ri:download-2-line", show: !isApp },
        { name: "game-launcher", path: "/game-launcher", icon: "ri:rocket-2-line" },
        // 狩月账本只消费桌面端的奖励管道，网页端没有数据源
        { name: "afk-ledger", path: "/afk", icon: "ri:bar-chart-line", show: isApp },
        // 技能 CD 浮窗依赖 Tauri 后端（原生置顶浮窗），网页端不显示。
        { name: "skill-cd-overlay", path: "/skill-cd-overlay", icon: "ri:timer-flash-line", show: isApp },
        { name: "mod-manager", path: "/mods", icon: "ri:puzzle-line" },
        { name: "chat", path: "/chat", icon: "ri:chat-3-line" },
        { name: "flow", path: "/flow", icon: "ri:node-tree" },
        { name: "inventory", path: "/inventory", icon: "ri:box-1-line" },
        { name: "timeline", path: "/timeline", icon: "ri:timeline-view" },
        { name: "map-tool", path: "/map-tool", icon: "ri:map-2-line" },
        { name: "help", path: "/help", icon: "ri:question-line" },
        { name: "game-accounts", path: "/game-accounts", icon: "ri:user-line", show: isApp },
        { name: "unpack", path: "/unpack", icon: "ri:file-zip-line", show: isApp && !envs.safeMode },
        { name: "skin-colorize", path: "/skin-colorize", icon: "ri:palette-line" },
        { name: "race-lottery", path: "/race-lottery", icon: "ri:run-line" },
        { name: "skin-gacha", path: "/skin-gacha", icon: "ri:sparkling-line" },
        { name: "script-list", path: "/scripts", icon: "ri:code-s-slash-line", show: envs.scriptUnlocked },
    ]
}
