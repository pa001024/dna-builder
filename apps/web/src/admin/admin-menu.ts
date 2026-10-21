import type { IconTypes } from "@/components/Icon.vue"

/** 后台菜单分组定义（编号由压平顺序生成，改顺序即改编号） */
export interface AdminMenuItem {
    name: string
    path: string
    icon: IconTypes
}

export interface AdminMenuGroup {
    name: string
    /** 分组英文小标（装饰性大写） */
    label: string
    items: AdminMenuItem[]
}

/**
 * 后台模块索引：外壳侧栏与首页模块总览共用同一份定义，
 * 保证「编号 = 位置」在两侧一致（改这里即可，不要在页面里另抄一份）。
 */
export const ADMIN_MENU_GROUPS: AdminMenuGroup[] = [
    {
        name: "总览",
        label: "Overview",
        items: [{ name: "首页", path: "/admin", icon: "ri:line-chart-line" }],
    },
    {
        name: "内容",
        label: "Content",
        items: [
            { name: "用户管理", path: "/admin/user", icon: "ri:team-line" },
            { name: "攻略管理", path: "/admin/guide", icon: "ri:book-line" },
            { name: "构筑管理", path: "/admin/build", icon: "ri:hammer-line" },
            { name: "时间线管理", path: "/admin/timeline", icon: "ri:timeline-view" },
            { name: "染色方案管理", path: "/admin/dyeplan", icon: "ri:palette-line" },
            { name: "MOD 分享管理", path: "/admin/game-mod", icon: "ri:puzzle-line" },
        ],
    },
    {
        name: "社区",
        label: "Community",
        items: [
            { name: "房间管理", path: "/admin/room", icon: "ri:home-line" },
            { name: "榜单管理", path: "/admin/ranking", icon: "ri:bar-chart-line" },
            { name: "待办管理", path: "/admin/todo", icon: "ri:checkbox-circle-line" },
        ],
    },
    {
        name: "运营",
        label: "Commerce",
        items: [
            { name: "商城商品", path: "/admin/shop-product", icon: "ri:shopping-bag-4-line" },
            { name: "兑换记录", path: "/admin/shop-redemption", icon: "ri:exchange-funds-line" },
            { name: "充值兑换码", path: "/admin/ai-recharge", icon: "ri:coupon-line" },
        ],
    },
    {
        name: "系统",
        label: "System",
        items: [
            { name: "AI 调用日志", path: "/admin/ai-log", icon: "ri:robot-2-line" },
            { name: "Agent 技能", path: "/admin/agent-skill", icon: "ri:magic-line" },
            { name: "脚本管理", path: "/admin/script", icon: "ri:code-s-slash-line" },
        ],
    },
]

/** 压平后的模块顺序（01…16） */
export const ADMIN_MENU_FLAT: AdminMenuItem[] = ADMIN_MENU_GROUPS.flatMap(group => group.items)

/**
 * 模块编号（两位数字，装饰性序号）
 * @param path 模块路由
 * @returns 两位编号；未收录时返回 --
 */
export function adminMenuNo(path: string): string {
    const index = ADMIN_MENU_FLAT.findIndex(item => item.path === path)
    return index < 0 ? "--" : String(index + 1).padStart(2, "0")
}
