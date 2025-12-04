export interface GameDatabase {
    char: Char[]
    mod: Mod[]
    weapon: Weapon[]
    meleeBase: MeleeBase[]
    rangedBase: RangedBase[]
    skillWeaponBase: SkillWeaponBase[]
    skill: Skill[]
    buff: Buff[]
    mob: Mob[]
}

export interface Buff {
    名称: string
    描述: string
    a?: number
    b?: number
    dx?: number
    lx?: number
    mx?: number
    攻击?: number
    增伤?: number
    武器伤害?: number
    威力?: number
    范围?: number
    暴击?: number
    追加伤害?: number
    属性穿透?: number
    异常数量?: number
    技能伤害?: number
    背水?: number
    固定攻击?: number
    防御?: number
    效益?: number
    昂扬?: number
    生命?: number
    属性伤?: number
    MOD属性?: number
    多重?: number
    失衡易伤?: number
    神智回复?: number
    独立增伤?: number
    暴伤?: number
    护盾?: number
    神智?: number
    耐久?: number
    攻速?: number
    近战增伤?: number
    无视防御?: number
}

export interface Char {
    名称: string
    属性: Elem
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
}

export enum Elem {
    光 = "光",
    暗 = "暗",
    水 = "水",
    火 = "火",
    雷 = "雷",
    风 = "风",
}

export enum MeleeType {
    单手剑 = "单手剑",
    双刀 = "双刀",
    太刀 = "太刀",
    重剑 = "重剑",
    长柄 = "长柄",
    鞭刃 = "鞭刃",
}

export interface Weapon {
    id?: number
    名称: string
    类别: string
    类型: string
    伤害类型: string
    基础攻击: number
    基础暴击: number
    基础暴伤: number
    基础触发: number
    耐久?: number
    生命?: number
    暴击?: number
    攻速?: number
    暴伤?: number
    范围?: number
    攻击?: number
    背水?: number
    威力?: number
    防御?: number
    触发?: number
    攻击范围?: number
    弹道类型?: string
    技能伤害?: number
    武器伤害?: number
    多重?: number
    角色?: string
    攻击倍率?: number
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


export interface Mob {
    名称: string
    阵营: string
    类型: string
    生命: number
    护盾: number
    战姿: number
}

export enum MobType {
    小型 = "小型",
    大型 = "大型",
    首领 = "首领",
}

export enum Faction {
    其他 = "其他",
    海伯利亚帝国 = "海伯利亚帝国",
    神弃者同盟 = "神弃者同盟",
    秽兽 = "秽兽",
    艾利西安传颂会 = "艾利西安传颂会",
}

export interface Mod {
    id?: number
    名称: string
    系列?: string
    品质: string
    耐受: number
    攻击?: number
    类型: string
    生命?: number
    护盾?: number
    神智?: number
    防御?: number
    属性?: string
    极性?: string
    威力?: number
    耐久?: number
    属性伤?: number
    范围?: number
    昂扬?: number
    背水?: number
    技能伤害?: number
    追加伤害?: number
    神智回复?: number
    效果?: string
    增伤?: number
    效益?: number
    减伤?: number
    失衡易伤?: number
    攻速?: number
    限定?: string
    物理?: number
    暴击?: number
    暴伤?: number
    触发?: number
    多重?: number
    独立增伤?: number
    弹药?: number
    装填?: number
    弹匣?: number
    滑行伤害?: number
    下落伤害?: number
    下落速度?: number
    蓄力速度?: number
    滑行速度?: number
    弹转?: number
    触发倍率?: number
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
    近战武器 = "近战武器",
    远程武器 = "远程武器",
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

export interface RangedBase {
    武器类型: string
    武器名称: string
    名称: string
    倍率: number
    弹片数: number
    射速: number
}

export interface SkillWeaponBase {
    武器名称: string
    名称: string
    等级: number
    攻击倍率: number
    攻击段数: number
    弹片数?: number
    射速?: number
    弹道类型?: string
}

export interface MeleeBase {
    武器类型: string
    名称: string
    倍率: number
    段数: number
}

export interface Skill {
    名称: string
    角色: string
    等级: number
    伤害类型: string
    攻击倍率?: number
    固定范围?: number
    技能持续?: number
    神智消耗?: number
    持续消耗?: number
    技能范围?: number
    生命倍率?: number
    固定伤害?: number
    固定持续?: number
    防御倍率?: number
}

export enum SkillDmgType {
    技能伤害 = "技能伤害",
    武器伤害 = "武器伤害",
}

