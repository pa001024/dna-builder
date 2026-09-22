/**
 * 伤害机制索引。
 *
 * 把资料库「伤害公式」页面（`/db/damage`）的三种结算模式（技能伤害 / 武器伤害 / DOT 伤害）
 * 抽成可检索的结构化数据，供资料检索 Agent 回答「伤害怎么算」「某个乘区是什么」这类提问。
 *
 * 约束：
 * - 每个步骤的 `title` 与 `formula` 是该页面步骤定义里的原文，**逐字一致**；
 *   页面改动后必须同步本文件，`src/data/tests/damage-mechanics.test.ts` 会比对页面源码拦截漂移。
 * - 本文件只描述机制与公式，不做具体数值结算；实际结算逻辑在 `src/data/CharBuild.ts`，
 *   页面是它的逐步拆解视图，两者口径一致。
 */

/** 结算模式标识，与页面 URL 的 `?mode=` 取值一致 */
export type DamageModeId = "weapon" | "skill" | "dot"

/** 页面上的一个输入参数 */
export interface DamageFieldDoc {
    /** 参数键（页面内部字段名） */
    key: string
    /** 页面展示名 */
    label: string
    /** 该参数在结算中的作用；无补充说明时省略 */
    note?: string
}

/** 页面上的一个开关参数 */
export interface DamageToggleDoc {
    key: string
    label: string
}

/** 输入参数分组（对应页面上的一张参数卡） */
export interface DamageGroupDoc {
    title: string
    fields: DamageFieldDoc[]
    toggles?: DamageToggleDoc[]
}

/** 一个结算步骤 */
export interface DamageStepDoc {
    id: string
    title: string
    /** 公式原文，与页面步骤定义逐字一致 */
    formula: string
    /** 所属输入分组，便于回答时指认参数位置 */
    group: string
}

/** 一种结算模式的完整机制 */
export interface DamageModeDoc {
    id: DamageModeId
    label: string
    /** 结算顺序概览 */
    summary: string
    /** 核心结果步骤 id */
    resultStepId: string
    groups: DamageGroupDoc[]
    steps: DamageStepDoc[]
}

/** 机制术语解释（页面参数之外的玩家常用说法） */
export interface DamageTermDoc {
    term: string
    /** 同义写法或英文缩写，检索时一并匹配 */
    aliases?: string[]
    description: string
}

/** 攻击力入口参数，三种模式共用同一口径 */
const ATTACK_FIELDS: DamageFieldDoc[] = [
    { key: "charBaseAttack", label: "角色基础攻击" },
    { key: "charAttackBonus", label: "角色攻击加成", note: "与和鸣增益同池加算，乘在基础攻击之后" },
    { key: "resonanceGain", label: "和鸣增益", note: "与角色攻击加成同池加算，不乘属性攻击" },
    { key: "elementalDamageBonus", label: "属性攻击", note: "攻击力乘区，乘在攻击加成池之后、固定攻击之前" },
    { key: "fixedAttackAdd", label: "固定攻击", note: "不吃任何攻击加成，直接加在攻击力之后" },
]

/** 生命比例相关参数，昂扬与背水共用 */
const HP_FIELDS: DamageFieldDoc[] = [
    { key: "boostBonus", label: "昂扬", note: "生命比例越高收益越高，生命比例按 0~1 钳制" },
    {
        key: "desperateBonus",
        label: "背水",
        note: "生命比例越低收益越高，生命比例按 0.25~1 钳制，50% 血量附近收益最高",
    },
    { key: "hpPercent", label: "生命比例", note: "当前血量占最大生命的比例" },
]

/** 防御相关参数 */
const DEFENSE_FIELDS: DamageFieldDoc[] = [
    { key: "enemyDefense", label: "怪物防御" },
    { key: "ignoreDefense", label: "无视防御", note: "按比例削减怪物防御，需先经过防御减伤率换算才作用到伤害" },
    { key: "attackerLevel", label: "角色等级" },
    { key: "enemyLevel", label: "怪物等级", note: "超过 200 级会额外触发高等级减伤乘区" },
]

/** 抗性相关参数 */
const RESISTANCE_FIELDS: DamageFieldDoc[] = [
    { key: "enemyResistance", label: "敌人抗性", note: "抗性为负（弱点）时 (1 - 抗性) 大于 1，反过来放大伤害" },
    { key: "penetrationBonus", label: "属性穿透", note: "与抗性同一个乘区，按 (1 + 属性穿透) 放大抗性因子" },
]

/** 失衡参数 */
const IMBALANCE_FIELDS: DamageFieldDoc[] = [
    { key: "imbalanceBonus", label: "失衡易伤", note: "仅在敌人处于失衡状态时生效，与固定值 1.5 加算后作为独立乘区" },
]

/**
 * 三种结算模式的机制定义。
 * 步骤顺序与页面上「步骤拆解」区的展示顺序一致。
 */
export const DAMAGE_MODES: DamageModeDoc[] = [
    {
        id: "weapon",
        label: "武器伤害",
        summary:
            "以角色攻击与武器攻击之和为基数，先算抗性与暴击/触发档位，再乘血量、增伤、充盈乘区，最后过防御乘区；" +
            "物理分量按触发规则单独结算，元素分量不吃触发。核心结果取「最终期望伤害」，乘上防御乘区得到防御后最终伤害。",
        resultStepId: "expectedDamage",
        groups: [
            {
                title: "攻击",
                fields: [
                    ...ATTACK_FIELDS,
                    { key: "weaponBaseAttack", label: "武器基础攻击" },
                    { key: "weaponAttackBonus", label: "武器攻击加成" },
                    { key: "physicalDamageBonus", label: "物理", note: "只作用于武器攻击部分" },
                ],
                toggles: [{ key: "weaponMasteryEnabled", label: "武器精通" }],
            },
            {
                title: "技能",
                fields: [
                    { key: "skillRate", label: "技能倍率" },
                    { key: "skillFlatDamage", label: "技能固定值" },
                    { key: "skillPowerMultiplier", label: "技能威力" },
                ],
                toggles: [{ key: "skillWeaponEnabled", label: "同律武器(技能威力生效)" }],
            },
            {
                title: "增伤",
                fields: [
                    { key: "baseDamageBonus", label: "增伤" },
                    { key: "weaponDamageBonus", label: "武器伤害", note: "与增伤同池加算" },
                    { key: "independentBonus", label: "独立增伤", note: "与增伤不同池，独立相乘" },
                    { key: "weaponIndependentBonus", label: "武器独立增伤" },
                    { key: "additionalDamageBonus", label: "追加伤害", note: "独立乘区，按 (1 + 追加伤害) 相乘" },
                ],
            },
            {
                title: "暴击",
                fields: [
                    { key: "baseCritRate", label: "基础暴击" },
                    { key: "critRateBonus", label: "暴击加成" },
                    { key: "baseCritDamage", label: "基础暴伤" },
                    { key: "critDamageBonus", label: "暴伤加成" },
                ],
            },
            {
                title: "触发",
                fields: [
                    { key: "baseTriggerRate", label: "基础触发" },
                    { key: "triggerRateBonus", label: "触发加成" },
                    { key: "triggerBonus", label: "触发倍率加成" },
                    { key: "hpTypeCoefficient", label: "生命类型系数", note: "命中敌方当前生命类型时才计入触发倍率" },
                ],
                toggles: [{ key: "sameDamageType", label: "伤害类型匹配(触发生效)" }],
            },
            {
                title: "充盈",
                fields: [
                    { key: "fullnessConversion", label: "充盈转化", note: "把该武器溢出的触发率转换成充盈威力" },
                    { key: "fullnessModBonus", label: "充盈威力基础(角色MOD+其他武器)" },
                ],
                toggles: [{ key: "fullnessFieldEnabled", label: "视为充盈伤害" }],
            },
            { title: "血量", fields: HP_FIELDS },
            { title: "防御", fields: DEFENSE_FIELDS },
            {
                title: "环境",
                fields: [...RESISTANCE_FIELDS, ...IMBALANCE_FIELDS],
                toggles: [{ key: "imbalanceEnabled", label: "处于失衡状态" }],
            },
        ],
        steps: [
            {
                id: "weaponMasteryRatio",
                title: "武器精通倍率",
                formula: "武器精通倍率 = 命中武器精通时为 1.2（同律武器 1.4），否则为 1",
                group: "攻击",
            },
            {
                id: "charAttack",
                title: "角色攻击",
                formula: "角色攻击 = (角色基础攻击 * (1 + 角色攻击加成 + 和鸣增益) * (1 + 属性攻击) + 固定攻击)保留2位",
                group: "攻击",
            },
            {
                id: "weaponAttack",
                title: "武器攻击",
                formula: "武器攻击 = (武器基础攻击 * (1 + 武器攻击加成) * 武器精通倍率 * (1 + 物理))保留2位",
                group: "攻击",
            },
            { id: "totalWeaponDamage", title: "总攻击", formula: "总攻击 = 角色攻击 + 武器攻击", group: "攻击" },
            {
                id: "triggerDamageMultiplier",
                title: "触发倍率",
                formula: "触发倍率 = 伤害类型匹配时(1 + 生命类型系数 + 触发倍率加成)，否则为 1",
                group: "触发",
            },
            { id: "finalTriggerRate", title: "最终触发率", formula: "最终触发率 = 基础触发 * (1 + 触发加成)", group: "触发" },
            {
                id: "triggerExpectedDamageAdd",
                title: "触发期望倍率",
                formula: "触发期望倍率 = 1 + (触发倍率 - 1) * 最终触发率",
                group: "触发",
            },
            { id: "finalCritRate", title: "最终暴击率", formula: "最终暴击率 = 基础暴击 * (1 + 暴击加成)", group: "暴击" },
            { id: "finalCritDamage", title: "最终暴伤", formula: "最终暴伤 = 基础暴伤 * (1 + 暴伤加成)", group: "暴击" },
            {
                id: "lowerCritDamage",
                title: "低暴击倍率",
                formula: "低暴击倍率 = (最终暴伤 - 1) * 最终暴击向下取整 + 1",
                group: "暴击",
            },
            {
                id: "higherCritDamage",
                title: "高暴击倍率",
                formula: "高暴击倍率 = (最终暴伤 - 1) * 最终暴击向上取整 + 1",
                group: "暴击",
            },
            {
                id: "critExpectedDamage",
                title: "暴击期望倍率",
                formula: "暴击期望倍率 = 1 + 最终暴击 * (最终暴伤 - 1)",
                group: "暴击",
            },
            {
                id: "resistance",
                title: "抗性乘区",
                formula: "抗性乘区 = (1 - 敌人抗性) * (1 + 属性穿透)，最小为 0",
                group: "环境",
            },
            {
                id: "boostMultiplier",
                title: "昂扬乘区",
                formula: "昂扬乘区 = 1 + 昂扬 * 生命比例(限制在 0~1)",
                group: "血量",
            },
            {
                id: "desperateMultiplier",
                title: "背水乘区",
                formula: "背水乘区 = 1 + 4 * 背水 * (1 - 生命比例(限制在 0.25~1)) * (1.5 - 生命比例(限制在 0.25~1))",
                group: "血量",
            },
            { id: "damageIncrease", title: "增伤乘区", formula: "增伤乘区 = 1 + 增伤 + 武器伤害", group: "增伤" },
            {
                id: "independentDamageIncrease",
                title: "独立增伤乘区",
                formula: "独立增伤乘区 = (1 + 独立增伤) * (1 + 武器独立增伤)",
                group: "增伤",
            },
            {
                id: "additionalDamage",
                title: "追加伤害乘区",
                formula: "追加伤害乘区 = 1 + 追加伤害",
                group: "增伤",
            },
            {
                id: "imbalanceDamageMultiplier",
                title: "失衡乘区",
                formula: "失衡乘区 = 处于失衡状态时(失衡易伤 + 1.5)，否则为 1",
                group: "环境",
            },
            {
                id: "hpMore",
                title: "血量相关乘区",
                formula: "血量相关乘区 = 昂扬乘区 * 背水乘区",
                group: "血量",
            },
            {
                id: "otherMore",
                title: "通用乘区",
                formula: "通用乘区 = 增伤乘区 * 独立增伤乘区 * 追加伤害乘区 * 失衡乘区",
                group: "增伤",
            },
            { id: "commonMore", title: "总乘区", formula: "总乘区 = 血量相关乘区 * 通用乘区", group: "增伤" },
            {
                id: "elementalPart",
                title: "属性部分(含抗性)",
                formula: "属性部分(含抗性) = 角色攻击 * 抗性乘区",
                group: "环境",
            },
            {
                id: "lowerCritNoTrigger",
                title: "未触发低暴击",
                formula: "未触发低暴击 = (武器攻击 + 属性部分(含抗性)) * 低暴击倍率 * 总乘区",
                group: "暴击",
            },
            {
                id: "higherCritNoTrigger",
                title: "未触发高暴击",
                formula: "未触发高暴击 = (武器攻击 + 属性部分(含抗性)) * 高暴击倍率 * 总乘区",
                group: "暴击",
            },
            {
                id: "lowerCritTrigger",
                title: "触发低暴击",
                formula: "触发低暴击 = (武器攻击 * (低暴击倍率 + 触发倍率 - 1) + 属性部分(含抗性) * 低暴击倍率) * 总乘区",
                group: "暴击",
            },
            {
                id: "higherCritTrigger",
                title: "触发高暴击",
                formula: "触发高暴击 = (武器攻击 * (高暴击倍率 + 触发倍率 - 1) + 属性部分(含抗性) * 高暴击倍率) * 总乘区",
                group: "暴击",
            },
            {
                id: "lowerCritExpectedTrigger",
                title: "期望触发低暴击",
                formula: "期望触发低暴击 = (武器攻击 * (低暴击倍率 + 触发期望倍率 - 1) + 属性部分(含抗性) * 低暴击倍率) * 总乘区",
                group: "暴击",
            },
            {
                id: "higherCritExpectedTrigger",
                title: "期望触发高暴击",
                formula: "期望触发高暴击 = (武器攻击 * (高暴击倍率 + 触发期望倍率 - 1) + 属性部分(含抗性) * 高暴击倍率) * 总乘区",
                group: "暴击",
            },
            {
                id: "expectedCritTrigger",
                title: "触发期望暴击",
                formula: "触发期望暴击 = (武器攻击 + 属性部分(含抗性)) * 暴击期望倍率 * 总乘区",
                group: "暴击",
            },
            {
                id: "expectedCritNoTrigger",
                title: "未触发期望暴击",
                formula: "未触发期望暴击 = (武器攻击 * (暴击期望倍率 + 触发倍率 - 1) + 属性部分(含抗性) * 暴击期望倍率) * 总乘区",
                group: "暴击",
            },
            {
                id: "expectedDamage",
                title: "最终期望伤害",
                formula: "最终期望伤害 = (武器攻击 * (暴击期望倍率 + 触发期望倍率 - 1) + 属性部分(含抗性) * 暴击期望倍率) * 总乘区",
                group: "暴击",
            },
            {
                id: "skillRawDamage",
                title: "技能原始倍率伤害",
                formula: "技能原始倍率伤害 = 技能倍率 * 总攻击 + 技能固定值",
                group: "技能",
            },
            {
                id: "skillBaseDamage",
                title: "技能倍率伤害",
                formula: "技能倍率伤害 = 技能原始倍率伤害 * (同律武器时技能威力，否则 1)",
                group: "技能",
            },
            {
                id: "skillDamageMultiplier",
                title: "技能倍率系数",
                formula: "技能倍率系数 = 技能倍率伤害 / 总攻击",
                group: "技能",
            },
            {
                id: "calculateExpectedDamage",
                title: "最终伤害(期望)",
                formula: "最终伤害(期望) = 最终期望伤害 * 技能倍率系数",
                group: "技能",
            },
            {
                id: "fullnessOverflowTrigger",
                title: "触发溢出率",
                formula: "触发溢出率 = max(0, 最终触发率 - 1)",
                group: "触发",
            },
            {
                id: "weaponFullnessPower",
                title: "武器转化充盈威力",
                formula: "武器转化充盈威力 = 触发溢出率 * 充盈转化",
                group: "充盈",
            },
            {
                id: "fullnessPower",
                title: "总充盈威力",
                formula: "总充盈威力 = 充盈威力基础(角色MOD+其他武器) + 武器转化充盈威力",
                group: "充盈",
            },
            {
                id: "fullnessMultiplier",
                title: "充盈乘区",
                formula: "充盈乘区 = 视为充盈伤害时(1 + 总充盈威力)，否则为 1",
                group: "充盈",
            },
            {
                id: "fullnessDamage",
                title: "充盈后最终伤害",
                formula: "充盈后最终伤害 = 最终伤害(期望) * 充盈乘区",
                group: "充盈",
            },
            {
                id: "levelDiff",
                title: "等级差修正",
                formula: "等级差修正 = min(20, max(0, min(80, 怪物等级) - 角色等级))",
                group: "防御",
            },
            {
                id: "finalEnemyDefense",
                title: "最终怪物防御",
                formula: "最终怪物防御 = 怪物防御 * (1 - 无视防御)",
                group: "防御",
            },
            {
                id: "defenseDamageReduction",
                title: "防御减伤率",
                formula: "防御减伤率 = 最终怪物防御 / (300 + 最终怪物防御 - 等级差修正 * 10)",
                group: "防御",
            },
            {
                id: "levelReduceRate",
                title: "高等级减伤乘区",
                formula: "高等级减伤乘区 = 1 / (1 + (怪物等级 - 190) * 0.05)，仅在怪物等级大于等于 200 时生效",
                group: "防御",
            },
            {
                id: "defenseMultiplier",
                title: "防御乘区",
                formula: "防御乘区 = (1 - 防御减伤率) * 高等级减伤乘区，并限制在 0~1",
                group: "防御",
            },
            {
                id: "finalDamageAfterDefense",
                title: "防御后最终伤害",
                formula: "防御后最终伤害 = 充盈后最终伤害 * 防御乘区",
                group: "防御",
            },
        ],
    },
    {
        id: "skill",
        label: "技能伤害",
        summary:
            "以角色攻击为基数（不含武器攻击），乘技能倍率得到技能倍率伤害，再依次乘抗性、增伤、独立增伤、失衡、血量、充盈乘区，最后过防御乘区。" +
            "技能模式没有暴击与触发档位，暴击/触发收益已在上游属性里体现。",
        resultStepId: "expectedDamage",
        groups: [
            { title: "攻击", fields: ATTACK_FIELDS },
            {
                title: "技能",
                fields: [
                    { key: "skillRate", label: "技能倍率" },
                    { key: "skillFlatDamage", label: "技能固定值" },
                    { key: "skillPowerMultiplier", label: "技能威力" },
                ],
            },
            {
                title: "增伤",
                fields: [
                    { key: "baseDamageBonus", label: "增伤" },
                    { key: "skillDamageBonus", label: "技能伤害", note: "与增伤同池加算" },
                    { key: "independentBonus", label: "独立增伤", note: "与增伤不同池，独立相乘" },
                ],
            },
            { title: "血量", fields: HP_FIELDS },
            {
                title: "充盈",
                fields: [{ key: "fullnessPower", label: "充盈威力", note: "角色属性汇总后的充盈威力" }],
                toggles: [{ key: "fullnessFieldEnabled", label: "视为充盈伤害" }],
            },
            {
                title: "防御",
                fields: [...DEFENSE_FIELDS, { key: "skillIgnoreDefense", label: "技能无视防御", note: "与无视防御加算后一起削减怪物防御" }],
            },
            {
                title: "环境",
                fields: [...RESISTANCE_FIELDS, ...IMBALANCE_FIELDS],
                toggles: [{ key: "imbalanceEnabled", label: "处于失衡状态" }],
            },
        ],
        steps: [
            {
                id: "resistancePenetration",
                title: "抗性乘区",
                formula: "抗性乘区 = (1 - 敌人抗性) * (1 + 属性穿透)，最小为 0",
                group: "环境",
            },
            {
                id: "boostMultiplier",
                title: "昂扬乘区",
                formula: "昂扬乘区 = 1 + 昂扬 * 生命比例(限制在 0~1)",
                group: "血量",
            },
            {
                id: "desperateMultiplier",
                title: "背水乘区",
                formula: "背水乘区 = 1 + 4 * 背水 * (1 - 生命比例(限制在 0.25~1)) * (1.5 - 生命比例(限制在 0.25~1))",
                group: "血量",
            },
            { id: "damageIncrease", title: "增伤乘区", formula: "增伤乘区 = 1 + 增伤 + 技能伤害", group: "增伤" },
            {
                id: "independentDamageIncrease",
                title: "独立增伤乘区",
                formula: "独立增伤乘区 = 1 + 独立增伤",
                group: "增伤",
            },
            {
                id: "imbalanceDamageMultiplier",
                title: "失衡乘区",
                formula: "失衡乘区 = 处于失衡状态时(失衡易伤 + 1.5)，否则为 1",
                group: "环境",
            },
            {
                id: "hpMore",
                title: "血量相关乘区",
                formula: "血量相关乘区 = 昂扬乘区 * 背水乘区",
                group: "血量",
            },
            {
                id: "charAttack",
                title: "角色攻击",
                formula: "角色攻击 = (角色基础攻击 * (1 + 角色攻击加成 + 和鸣增益) * (1 + 属性攻击) + 固定攻击)保留2位",
                group: "攻击",
            },
            { id: "skillAttackPool", title: "总攻击", formula: "总攻击 = 角色攻击", group: "攻击" },
            {
                id: "skillRawDamage",
                title: "技能原始倍率伤害",
                formula: "技能原始倍率伤害 = 技能倍率 * 总攻击 + 技能固定值",
                group: "技能",
            },
            {
                id: "skillBaseDamage",
                title: "技能倍率伤害",
                formula: "技能倍率伤害 = 技能原始倍率伤害 * 技能威力",
                group: "技能",
            },
            {
                id: "finalDamage",
                title: "技能基础伤害",
                formula: "技能基础伤害 = 技能倍率伤害 * 抗性乘区 * 增伤乘区 * 独立增伤乘区 * 失衡乘区",
                group: "技能",
            },
            {
                id: "expectedDamage",
                title: "最终期望伤害",
                formula: "最终期望伤害 = 技能基础伤害 * 血量相关乘区",
                group: "血量",
            },
            {
                id: "calculateExpectedDamage",
                title: "最终伤害(期望)",
                formula: "最终伤害(期望) = 最终期望伤害",
                group: "技能",
            },
            {
                id: "fullnessPower",
                title: "总充盈威力",
                formula: "总充盈威力 = 充盈威力(角色属性汇总)",
                group: "充盈",
            },
            {
                id: "fullnessMultiplier",
                title: "充盈乘区",
                formula: "充盈乘区 = 视为充盈伤害时(1 + 总充盈威力)，否则为 1",
                group: "充盈",
            },
            {
                id: "fullnessDamage",
                title: "充盈后最终伤害",
                formula: "充盈后最终伤害 = 最终伤害(期望) * 充盈乘区",
                group: "充盈",
            },
            {
                id: "levelDiff",
                title: "等级差修正",
                formula: "等级差修正 = min(20, max(0, min(80, 怪物等级) - 角色等级))",
                group: "防御",
            },
            {
                id: "totalIgnoreDefense",
                title: "总无视防御",
                formula: "总无视防御 = 无视防御 + 技能无视防御",
                group: "防御",
            },
            {
                id: "finalEnemyDefense",
                title: "最终怪物防御",
                formula: "最终怪物防御 = 怪物防御 * (1 - 总无视防御)",
                group: "防御",
            },
            {
                id: "defenseDamageReduction",
                title: "防御减伤率",
                formula: "防御减伤率 = 最终怪物防御 / (300 + 最终怪物防御 - 等级差修正 * 10)",
                group: "防御",
            },
            {
                id: "levelReduceRate",
                title: "高等级减伤乘区",
                formula: "高等级减伤乘区 = 1 / (1 + (怪物等级 - 190) * 0.05)，仅在怪物等级大于等于 200 时生效",
                group: "防御",
            },
            {
                id: "defenseMultiplier",
                title: "防御乘区",
                formula: "防御乘区 = (1 - 防御减伤率) * 高等级减伤乘区，并限制在 0~1",
                group: "防御",
            },
            {
                id: "finalDamageAfterDefense",
                title: "防御后最终伤害",
                formula: "防御后最终伤害 = 充盈后最终伤害 * 防御乘区",
                group: "防御",
            },
        ],
    },
    {
        id: "dot",
        label: "DOT 伤害",
        summary:
            "先按来源拆单跳基础伤害（技能来源只吃角色攻击，武器来源吃角色攻击 + 武器攻击），按各来源频率加权求和，" +
            "再乘充盈、增伤、血量、抗性乘区，得到每秒 DOT 伤害。DOT 不吃暴击、触发与防御乘区。",
        resultStepId: "dotDamage",
        groups: [
            {
                title: "攻击",
                fields: [
                    { key: "charAttack", label: "角色攻击", note: "所有来源共用" },
                    { key: "weaponAttack", label: "武器攻击(来源加权)", note: "仅武器来源享受，多武器时按频率加权平均" },
                ],
            },
            {
                title: "充盈与增伤",
                fields: [
                    { key: "fullnessPower", label: "充盈威力" },
                    { key: "baseDamageBonus", label: "增伤" },
                ],
            },
            {
                title: "DOT频率",
                fields: [
                    { key: "skillFreq", label: "技能来源频率", note: "次/秒，仅角色攻击" },
                    { key: "weaponOwnFreq", label: "武器来源自身属性频率", note: "次/秒，角色攻击 + 武器攻击" },
                    { key: "otherFreq", label: "其余属性频率", note: "次/秒，角色攻击 + 武器攻击" },
                ],
            },
            { title: "血量", fields: HP_FIELDS },
            { title: "环境", fields: RESISTANCE_FIELDS },
        ],
        steps: [
            {
                id: "dotBaseDamage",
                title: "单跳基础伤害(角色攻击)",
                formula: "单跳基础伤害(角色攻击) = 角色攻击 * 0.2 * 6 * 4（技能来源按此结算）",
                group: "攻击",
            },
            {
                id: "weaponBaseDamage",
                title: "单跳基础伤害(武器来源)",
                formula: "单跳基础伤害(武器来源) = (角色攻击 + 武器攻击) * 0.2 * 6 * 4（武器来源按此结算）",
                group: "攻击",
            },
            { id: "fullnessMultiplier", title: "充盈乘区", formula: "充盈乘区 = 1 + 充盈威力", group: "充盈与增伤" },
            { id: "damageIncrease", title: "增伤乘区", formula: "增伤乘区 = 1 + 增伤", group: "充盈与增伤" },
            {
                id: "boostMultiplier",
                title: "昂扬乘区",
                formula: "昂扬乘区 = 1 + 昂扬 * 生命比例(限制在 0~1)",
                group: "血量",
            },
            {
                id: "desperateMultiplier",
                title: "背水乘区",
                formula: "背水乘区 = 1 + 4 * 背水 * (1 - 生命比例(限制在 0.25~1)) * (1.5 - 生命比例(限制在 0.25~1))",
                group: "血量",
            },
            {
                id: "hpMore",
                title: "血量相关乘区",
                formula: "血量相关乘区 = 昂扬乘区 * 背水乘区",
                group: "血量",
            },
            {
                id: "totalFrequency",
                title: "DOT频率合计",
                formula: "DOT频率合计 = 技能来源频率 + 武器来源自身属性频率 + 其余属性频率",
                group: "DOT频率",
            },
            {
                id: "weaponFrequency",
                title: "武器来源频率",
                formula: "武器来源频率 = 武器来源自身属性频率 + 其余属性频率（该部分频率吃武器攻击）",
                group: "DOT频率",
            },
            {
                id: "weightedBaseDamage",
                title: "频率加权基础伤害",
                formula: "频率加权基础伤害 = 单跳基础伤害(角色攻击) * (DOT频率合计 - 武器来源频率) + 单跳基础伤害(武器来源) * 武器来源频率",
                group: "DOT频率",
            },
            {
                id: "resistancePenetration",
                title: "抗性乘区",
                formula: "抗性乘区 = (1 - 敌人抗性) * (1 + 属性穿透)，最小为 0",
                group: "环境",
            },
            {
                id: "dotDamage",
                title: "每秒DOT伤害",
                formula: "每秒DOT伤害 = 频率加权基础伤害 * 充盈乘区 * 增伤乘区 * 血量相关乘区 * 抗性乘区",
                group: "DOT频率",
            },
        ],
    },
]

/**
 * 机制术语解释。
 * 收录玩家提问里出现的口语说法与页面参数之外的概念，避免 Agent 只认页面字段名。
 */
export const DAMAGE_TERMS: DamageTermDoc[] = [
    {
        term: "乘区",
        aliases: ["乘算", "乘法区"],
        description: "伤害由一个基础值乘以若干互不干扰的因子得到，每个因子称为一个乘区；同一个乘区内的属性相加，跨乘区之间相乘。",
    },
    {
        term: "增伤池",
        aliases: ["增伤", "同池加算"],
        description: "「增伤」「武器伤害」「技能伤害」在同一个乘区内相加，因此这几项彼此之间是加算而非相乘，堆同一种收益递减。",
    },
    {
        term: "独立增伤",
        description: "与增伤池分开的独立乘区，按 (1 + 独立增伤) 与增伤池相乘，收益不会被同池稀释。",
    },
    {
        term: "暴击档位",
        aliases: ["低暴击", "高暴击", "暴击溢出"],
        description:
            "暴击率可以超过 100%，超出部分转为更高档位：低暴击倍率按暴击率向下取整计算，高暴击倍率按向上取整计算，期望值则按 1 + 暴击率 × (暴伤 - 1) 连续计算。",
    },
    {
        term: "触发",
        aliases: ["触发率", "触发倍率"],
        description:
            "只有伤害类型与敌方当前生命类型匹配时才生效的额外倍率：触发倍率按 (1 + 生命类型系数 + 触发倍率加成)，实际收益按触发率折算成触发期望倍率。",
    },
    {
        term: "触发溢出",
        description: "触发率超过 100% 的部分不重复计入触发期望，而是按武器的充盈转化转为角色的充盈威力。",
    },
    {
        term: "充盈",
        aliases: ["充盈威力", "充盈乘区", "充盈伤害"],
        description:
            "充盈伤害的独立乘区，按 (1 + 总充盈威力) 相乘。总充盈威力 = 充盈威力基础（角色 MOD 与其他武器转化）+ 该武器由触发溢出转化来的部分。",
    },
    {
        term: "昂扬",
        description: "按当前生命比例线性加成的乘区：生命比例越高加成越大，公式为 1 + 昂扬 × 生命比例(0~1)。",
    },
    {
        term: "背水",
        description:
            "生命比例越低加成越大的乘区，公式为 1 + 4 × 背水 × (1 - 生命比例) × (1.5 - 生命比例)，生命比例钳制在 0.25~1，50% 血量附近收益最高。",
    },
    {
        term: "失衡",
        aliases: ["失衡易伤", "失衡乘区"],
        description: "敌人处于失衡状态时生效的乘区：失衡易伤与固定值 1.5 加算后作为独立乘区，不处于失衡时为 1。",
    },
    {
        term: "抗性乘区",
        aliases: ["敌人抗性", "属性穿透", "抗性穿透"],
        description: "按 (1 - 敌人抗性) × (1 + 属性穿透) 计算并下限为 0；抗性为负（弱点）时该因子大于 1，穿透与抗性同乘区。",
    },
    {
        term: "防御乘区",
        aliases: ["防御减伤", "无视防御"],
        description:
            "先算防御减伤率 = 最终防御 / (300 + 最终防御 - 等级差 × 10)，防御乘区 = (1 - 减伤率) × 高等级减伤乘区，并限制在 0~1。无视防御按比例削减最终防御，收益要经过这一步换算才作用到伤害。",
    },
    {
        term: "等级差修正",
        description: "怪物等级（上限 80）减角色等级，钳制在 0~20 后进入防御减伤率的分母。",
    },
    {
        term: "高等级减伤乘区",
        description: "怪物等级达到 200 及以上时额外生效的乘区，公式为 1 / (1 + (怪物等级 - 190) × 0.05)，等级越高伤害越低。",
    },
    {
        term: "期望伤害",
        aliases: ["期望值"],
        description:
            "把暴击、触发按概率折算后的平均伤害：暴击期望倍率 = 1 + 暴击率 × (暴伤 - 1)，触发期望倍率 = 1 + (触发倍率 - 1) × 触发率，二者都与最终期望伤害公式相乘。",
    },
    {
        term: "同律武器",
        description: "武器伤害模式下的开关：开启后技能倍率伤害额外乘技能威力；触发率溢出的部分按该武器的充盈转化计入充盈威力。",
    },
    {
        term: "武器精通",
        description: "命中武器精通时乘 1.2（同律武器 1.4）的倍率，只作用于武器攻击部分。",
    },
    {
        term: "生命类型系数",
        description: "按敌方当前生命类型取值的系数，只有伤害类型与该生命类型匹配时才计入触发倍率。",
    },
]

/** 模式 id → 机制定义 */
const MODE_MAP = new Map(DAMAGE_MODES.map(mode => [mode.id, mode]))

/**
 * 列出三种结算模式的概览。
 * @returns 模式概览列表
 */
export function listDamageModes(): Array<{
    id: DamageModeId
    label: string
    summary: string
    resultStepId: string
    stepCount: number
}> {
    return DAMAGE_MODES.map(mode => ({
        id: mode.id,
        label: mode.label,
        summary: mode.summary,
        resultStepId: mode.resultStepId,
        stepCount: mode.steps.length,
    }))
}

/**
 * 取某个模式的完整机制定义。
 * @param modeId 模式 id
 * @returns 机制定义；id 非法时返回 undefined
 */
export function getDamageMode(modeId: string): DamageModeDoc | undefined {
    return MODE_MAP.get(modeId as DamageModeId)
}

/**
 * 在步骤标题、公式与所属分组里按关键词检索步骤。
 * @param keyword 关键词
 * @param options 限定模式与返回条数上限
 * @returns 命中的步骤（含所属模式）
 */
export function searchDamageSteps(
    keyword: string,
    options: { mode?: string; limit?: number } = {}
): Array<{ mode: DamageModeId; modeLabel: string; step: DamageStepDoc }> {
    const word = keyword.trim().toLowerCase()
    const modes = options.mode ? [getDamageMode(options.mode)].filter(Boolean) : DAMAGE_MODES
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 60)
    const hits: Array<{ mode: DamageModeId; modeLabel: string; step: DamageStepDoc }> = []

    for (const mode of modes as DamageModeDoc[]) {
        for (const step of mode.steps) {
            if (!word || `${step.id} ${step.title} ${step.formula} ${step.group}`.toLowerCase().includes(word)) {
                hits.push({ mode: mode.id, modeLabel: mode.label, step })
            }
        }
    }

    return hits.slice(0, limit)
}

/**
 * 在术语名、别称与解释里按关键词检索术语。
 * @param keyword 关键词
 * @param limit 返回条数上限
 * @returns 命中的术语
 */
export function searchDamageTerms(keyword: string, limit = 10): DamageTermDoc[] {
    const word = keyword.trim().toLowerCase()

    if (!word) {
        return DAMAGE_TERMS.slice(0, Math.min(Math.max(limit, 1), 40))
    }

    return DAMAGE_TERMS.filter(term => [term.term, ...(term.aliases ?? []), term.description].join(" ").toLowerCase().includes(word)).slice(
        0,
        Math.min(Math.max(limit, 1), 40)
    )
}

/**
 * 取某个模式里与给定关键词相关的输入参数（按分组返回）。
 * @param modeId 模式 id
 * @param keyword 关键词；为空时返回全部分组
 * @returns 分组参数列表
 */
export function getDamageFields(modeId: string, keyword = ""): DamageGroupDoc[] {
    const mode = getDamageMode(modeId)

    if (!mode) {
        return []
    }

    const word = keyword.trim().toLowerCase()

    if (!word) {
        return mode.groups
    }

    return mode.groups
        .map(group => ({
            ...group,
            fields: group.fields.filter(field =>
                `${field.key} ${field.label} ${field.note ?? ""} ${group.title}`.toLowerCase().includes(word)
            ),
            toggles: group.toggles?.filter(toggle => `${toggle.key} ${toggle.label}`.toLowerCase().includes(word)),
        }))
        .filter(group => group.fields.length > 0 || (group.toggles?.length ?? 0) > 0)
}
