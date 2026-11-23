import { t } from "i18next"
import { ADDITIONAL_DAMAGE_KEYS, LEGACY_ADDITIONAL_DAMAGE_KEY, SELF_ADDITIONAL_DAMAGE_KEY } from "@/data/leveled/additionalDamage"

/** AST 属性修改区的一个可写分组（标题由组件按 key 取 i18n） */
export interface AstAttributeGroupItems {
    key: "basic" | "damage" | "weapon" | "convert"
    items: readonly string[]
}

/**
 * 可插入临时属性的分组。追伤只提供七分量（六元素 + 自属性），
 * 聚合「追加伤害」是只读 Σ，不提供插入入口。
 */
export const AST_ATTRIBUTE_GROUP_ITEMS: readonly AstAttributeGroupItems[] = [
    {
        key: "basic",
        items: ["攻击", "固定攻击", "生命", "固定生命", "防御", "护盾", "神智", "神智回复"],
    },
    {
        key: "damage",
        items: [
            "增伤",
            "独立增伤",
            "技能独立增伤",
            "武器伤害",
            "技能伤害",
            "技能追伤",
            "属性穿透",
            "无视防御",
            "技能无视防御",
            "技能威力",
            "技能速度",
            "技能范围",
            "技能倍率加数",
            "技能倍率乘数",
            "技能倍率赋值",
            "失衡易伤",
            "昂扬",
            "背水",
            "减伤",
            "魔灵CD缩减",
        ],
    },
    {
        key: "weapon",
        items: [
            "暴击",
            "暴伤",
            "触发",
            "攻速",
            "多重",
            "武器倍率",
            "装填",
            "弹匣",
            "弹药",
            "召唤物属性继承比例",
            "召唤物攻击速度",
            "召唤物范围",
            "召唤物伤害",
            "有效生命",
        ],
    },
    {
        key: "convert",
        items: ["转切割", "转贯穿", "转震荡", "转灾厄", "转充盈", "转属克", "转属逆"],
    },
]

/** 只读属性：表达式仍可读取，但不提供临时属性插入入口（角色不持有追伤） */
export const AST_READONLY_ATTRIBUTES: readonly { name: string; note: string }[] = [
    {
        name: LEGACY_ADDITIONAL_DAMAGE_KEY,
        // 惰性取翻译：模块加载时 i18n 可能尚未初始化；未初始化（单测）时回落到中文兜底
        get note() {
            return t("ast-help.readonly_aggregate_note", { defaultValue: "Σ 七分量（只读聚合）" }) || "Σ 七分量（只读聚合）"
        },
    },
    ...ADDITIONAL_DAMAGE_KEYS.map(name => ({
        name,
        get note() {
            const element = name === SELF_ADDITIONAL_DAMAGE_KEY ? "自身" : name.slice(0, 1)
            return `额外造成一段可触发额外效果的${element}属性伤害。`
        },
    })),
]
