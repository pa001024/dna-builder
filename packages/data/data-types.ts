/**
 * 跨域共享基础类型 + 各域类型的转出口。
 *
 * 各域类型已归位到所属文件（`d/*.data.ts` 数据表、`leveled/LeveledSkill.ts` 技能域），
 * 此处仅保留真正的共享 primitives，并逐项转出各域类型以保持既有引用方零改动。
 * 新增类型请直接定义在所属文件，并在下方补一行转出。
 */
export interface AbstractMod {
    readonly attrType: "角色" | "近战" | "远程" | "同律近战" | "同律远程"
    readonly addAttr: Record<string, number>
    readonly minusAttr: AbstractMod
    isMinus?: boolean
}

export interface CommonAttr {
    技能威力?: number
    技能耐久?: number
    技能效益?: number
    技能范围?: number
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
    [key: string]: number | undefined
}

/**
 * 参数化文本：一条模板 + 各占位符的逐档取值。
 *
 * 上游把「按等级/精炼变化的数值文案」导出成 `[模板, #1 的取值, #2 的取值, ...]`
 * 形式（如 `["角色攻击+#1。", ["60.0%", "72.0%", ...]]`），避免为每一档重复导出整句。
 * 模板里的 `#N` 对应其后第 N 个数组，数组下标即档位（武器为精炼等级，MOD 为 `等级 - 1`）。
 *
 * 翻译对照表里只收录**模板**这一项（参数是数字与百分号，各语言共用），
 * 因此展示时必须先翻译模板、再代入数值，顺序反了就查不到译文。
 */
export type ParamText = string | Array<string | string[]>

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

export type { AbyssBuff, AbyssDungeon, MonsterBuff } from "./d/abyss.data"
export type { Achievement } from "./d/achievement.data"
export type { Buff, BuffAttrValue } from "./d/buff.data"
export type { Char, CharTrait } from "./d/char.data"
export { Elem } from "./d/char.data"
export type { Draft } from "./d/draft.data"
export type { Dungeon } from "./d/dungeon.data"
export type { Mod, ModConditional } from "./d/mod.data"
export type { Pet } from "./d/pet.data"
export type { OptReward, Reward, RewardChild, RewardItem } from "./d/reward.data"
export type { ForgeData, ForgeSkill, Weapon } from "./d/weapon.data"
export { WeaponCategory } from "./d/weapon.data"
export type {
    AttrRates,
    BuffAttr,
    BuffAura,
    BuffBody,
    BuffDot,
    EffectAttr,
    PassiveEffect,
    ShapeInfo,
    Skill,
    SkillBuff,
    SkillCreature,
    SkillCreatureShape,
    SkillEffect,
    SkillField,
    SkillPassive,
    SkillSummon,
    SkillWeapon,
    SubSkill,
    WeaponSkill,
} from "./leveled/LeveledSkill"
export { BulletType, DmgType, HpType, SkillType, WeaponSkillType } from "./leveled/LeveledSkill"
