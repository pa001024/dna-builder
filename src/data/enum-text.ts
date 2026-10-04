/**
 * 数据枚举值的中文展示名映射。
 *
 * 归属说明：这些键值是数据包里的原始枚举（如奖励条目 `t` 字段、掉落模式），映射目标是条目的
 * 展示名，与数据本身同源；MCP 服务端也要用（不能依赖 i18n 运行时），故放在数据层。
 */

const REWARD_TYPE_TEXT: Record<string, string> = {
    Char: "角色",
    CharAccessory: "角色饰品",
    Drop: "掉落物",
    HeadFrame: "头像框",
    HeadSculpture: "头像",
    Hair: "发型",
    Mod: "魔之楔",
    Mount: "载具",
    Draft: "设计稿",
    Pet: "魔灵",
    Resource: "资源",
    Reward: "奖励组",
    Skin: "角色皮肤",
    Title: "称号",
    TitleFrame: "称号框",
    IronTicket: "深境罗盘",
    Walnut: "密函",
    Weapon: "武器",
    WeaponAccessory: "武器饰品",
    WeaponSkin: "武器皮肤",
}

const DROP_MODE_TEXT: Record<string, string> = {
    Independent: "独立",
    Weight: "权重",
    Fixed: "固定",
    Gender: "性别",
    Level: "等级",
    Once: "一次",
    Sequence: "序列",
}

/** 奖励类型枚举值 → 中文展示名（未收录时原样返回） */
export function getRewardTypeText(type: string): string {
    return REWARD_TYPE_TEXT[type] || type
}

/** 掉落模式枚举值 → 中文展示名（未收录时原样返回） */
export function getDropModeText(mode: string): string {
    return DROP_MODE_TEXT[mode] || mode
}
