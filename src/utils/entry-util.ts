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
        { name: "game-launcher", path: "/game-launcher", icon: "ri:rocket-2-line" },
        { name: "mod-manager", path: "/mods", icon: "ri:puzzle-line" },
        { name: "chat", path: "/chat", icon: "ri:chat-3-line" },
        { name: "flow", path: "/flow", icon: "ri:node-tree" },
        { name: "inventory", path: "/inventory", icon: "ri:box-1-line" },
        { name: "timeline", path: "/timeline", icon: "ri:timeline-view" },
        { name: "map-tool", path: "/db/map-local", icon: "ri:map-2-line" },
        { name: "help", path: "/help", icon: "ri:question-line" },
        { name: "game-accounts", path: "/game-accounts", icon: "ri:user-line", show: isApp },
        { name: "unpack", path: "/unpack", icon: "ri:file-zip-line", show: isApp && !envs.safeMode },
        { name: "skin-colorize", path: "/skin-colorize", icon: "ri:palette-line" },
        { name: "race-lottery", path: "/race-lottery", icon: "ri:run-line" },
        { name: "skin-gacha", path: "/skin-gacha", icon: "ri:sparkling-line" },
        { name: "script-list", path: "/scripts", icon: "ri:code-s-slash-line", show: envs.scriptUnlocked },
    ]
}
