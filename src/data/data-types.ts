export interface Buff {
    名称: string
    描述: string
    限定?: string
    a?: number
    b?: number
    dx?: number
    lx?: number
    mx?: number
    code?: string
    [key: string]: string | number | number[] | undefined
}

export interface Char {
    id?: number
    名称: string
    属性: string
    近战: string
    远程: string
    同律武器?: string
    基础攻击: number
    基础生命: number
    基础护盾: number
    基础防御: number
    基础神智: number
    范围?: number
    攻击?: number
    耐久?: number
    生命?: number
    威力?: number
    背水?: number
    防御?: number
    效益?: number
    昂扬?: number
    暴击?: number
    多重?: number
    技能: Skill[]
}

export enum Elem {
    光 = "光",
    暗 = "暗",
    水 = "水",
    火 = "火",
    雷 = "雷",
    风 = "风",
}

export enum WeaponCategory {
    单手剑 = "单手剑",
    长柄 = "长柄",
    重剑 = "重剑",
    双刀 = "双刀",
    鞭刃 = "鞭刃",
    太刀 = "太刀",
    手枪 = "手枪",
    双枪 = "双枪",
    榴炮 = "榴炮",
    霰弹枪 = "霰弹枪",
    突击枪 = "突击枪",
    弓 = "弓",
}

export interface Weapon {
    id?: number
    名称: string
    类别: string
    类型: string
    伤害类型: string
    弹道类型?: string
    基础攻击: number
    基础暴击: number
    基础暴伤: number
    基础触发: number
    威力?: number
    耐久?: number
    效益?: number
    范围?: number
    生命?: number
    暴击?: number
    攻速?: number
    暴伤?: number
    攻击?: number
    防御?: number
    触发?: number
    背水?: number
    昂扬?: number
    多重?: number
    武器伤害?: number
    技能伤害?: number
    攻击范围?: number
    [key: string]: any
}

export interface Skill {
    名称: string
    类型: string
    字段: SkillField[]
    召唤物?: SkillSummon
}

export interface SkillSummon {
    名称: string
    攻击延迟: number
    攻击间隔: number
}

export interface SkillField {
    名称: string
    属性影响?: string
    值: number[] | number
    格式?: string
    基础?: string
    额外?: number[] | number
}

export enum DmgType {
    切割 = "切割",
    贯穿 = "贯穿",
    震荡 = "震荡",
}

export enum BulletType {
    弹道 = "弹道",
    非弹道 = "非弹道",
}

export enum SkillType {
    伤害 = "伤害",
    召唤 = "召唤",
    增益 = "增益",
    治疗 = "治疗",
    被动 = "被动",
    防御 = "防御",
}

export interface Monster {
    id: number
    名称: string
    阵营?: Faction
    攻击: number
    防御: number
    生命: number
    护盾?: number
    战姿?: number
}

export enum MobType {
    小型 = "小型",
    大型 = "大型",
    首领 = "首领",
}

export enum Faction {
    其他 = 0,
    秽兽 = 1,
    海伯利亚帝国 = 2,
    神弃者同盟 = 3,
    艾利西安传颂会 = 4,
    华胥 = 5,
}

export interface Mod {
    id: number
    名称: string
    系列: string
    品质: string
    极性?: string
    耐受: number
    类型: string
    属性?: string
    限定?: string
    效果?: string
    buff?: Buff

    威力?: number
    耐久?: number
    效益?: number
    范围?: number
    攻击?: number
    生命?: number
    护盾?: number
    防御?: number
    神智?: number
    属性伤?: number
    减伤?: number
    增伤?: number
    武器伤害?: number
    技能伤害?: number
    独立增伤?: number
    昂扬?: number
    背水?: number
    追加伤害?: number
    固定攻击?: number
    技能速度?: number
    召唤物范围?: number
    召唤物攻速?: number
    失衡易伤?: number
    神智回复?: number
    暴击?: number
    暴伤?: number
    触发?: number
    物理?: number
    攻速?: number
    多重?: number
    攻击范围?: number
    滑行伤害?: number
    滑行速度?: number
    下落伤害?: number
    下落速度?: number
    蓄力速度?: number
    弹药?: number
    弹匣?: number
    装填?: number
    弹转?: number
    触发倍率?: number
    [key: string]: any
}

export enum Quality {
    白 = "白",
    紫 = "紫",
    绿 = "绿",
    蓝 = "蓝",
    金 = "金",
}

export enum Polarity {
    A = "A",
    D = "D",
    O = "O",
    V = "V",
}

export enum ModType {
    同率近战 = "同率近战",
    同率远程 = "同率远程",
    角色 = "角色",
    近战 = "近战",
    远程 = "远程",
}
export enum ModSeries {
    不死鸟 = "不死鸟",
    中庭蛇 = "中庭蛇",
    人面狮 = "人面狮",
    冥犬 = "冥犬",
    囚狼 = "囚狼",
    夜使 = "夜使",
    夜魔 = "夜魔",
    契约者 = "契约者",
    审判者 = "审判者",
    巨鲸 = "巨鲸",
    异化冥犬 = "异化冥犬",
    异化夜魔 = "异化夜魔",
    海妖 = "海妖",
    焰灵 = "焰灵",
    牧神 = "牧神",
    狮鹫 = "狮鹫",
    百首 = "百首",
    羽蛇 = "羽蛇",
    邪龙 = "邪龙",
    金乌 = "金乌",
    黄衣 = "黄衣",
}

export interface WeaponBase {
    武器类型?: string
    武器名称?: string
    名称: string
    倍率: number
    弹片数?: number
    射速?: number
    段数?: number
    等级?: number
}
