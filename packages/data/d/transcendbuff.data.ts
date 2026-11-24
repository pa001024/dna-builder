import type { Buff } from "../data-types"
import type { TranscendAffixMapping } from "../transcendBuffs"

/**
 * 升华（DNASeason）手写数值词条与专属词条口径表。
 *
 * 纯数据模块：`TRANSCEND_BUFFS`（手写 BUFF）与 `UNIQUE_AFFIX_MAP`（专属词条映射），
 * 由数据包收录（`tools/data-pack.ts` 扫描 `d` 下的 `*.data.ts`，module key `transcendbuff.data`）。
 * 类型与派生索引留在 `packages/data/transcendBuffs.ts`；BUFF 形状复用既有 `Buff`，
 * 由 `transcend.ts` 直接构造 `LeveledBuff` 注入构筑，不写进 `buff.data.ts`。
 *
 * 口径：每条专属词条要么自动映射引擎属性（exact），要么在手写表里登记（handwritten）；
 * 手写表必须显式给出 `partial` 与 `included` / `excluded`，不允许用覆盖率假设含糊带过。
 */

/** Plan 4 手写词条：属性值支持表达式（随构筑属性求值，见 LeveledBuff.applyAttr） */
export const TRANSCEND_BUFFS: Buff[] = [
    {
        名称: "升华·螺旋跃击",
        描述: "螺旋飞跃后的下一次下落攻击伤害提高。",
        attr: {
            下落增伤: 9,
        },
    },
    {
        名称: "升华·连击暴击",
        描述: "普通攻击连击点数满且生命值高于 80% 时，有 32% 概率使本次伤害翻倍（按期望折算）。",
        attr: {
            近战普攻独立增伤: 0.32,
        },
    },
    {
        名称: "升华·弹药补给箱",
        描述: "每累计消耗 50 点神智掉落 1 个弹药补给箱（补给机制，无战斗属性）。",
    },
    {
        名称: "升华·耐久转化",
        描述: "技能耐久超过 100% 的部分按 2.373% 转化为独立增伤。",
        attr: {
            独立增伤: "0.02373*max(0,技能耐久-1)",
        },
    },
    {
        名称: "升华·范围转化",
        描述: "技能范围超过 100% 的部分按 4.858% 转化为独立增伤。",
        attr: {
            独立增伤: "0.04858*max(0,技能范围-1)",
        },
    },
    {
        名称: "升华·效益转化",
        描述: "技能效益超过 100% 的部分按 5.6417% 转化为独立增伤。",
        attr: {
            独立增伤: "0.056417*max(0,技能效益-1)",
        },
    },
    {
        名称: "升华·召唤破防",
        描述: "水属性角色的召唤物造成伤害时无视目标部分防御。",
        限定: "水",
        // 条件 BUFF：官方只作用于召唤物伤害字段，按字段标签「召唤物」限定
        tag: ["召唤物"],
        attr: {
            技能无视防御: 0.175,
        },
    },
    {
        名称: "升华·火属性弱点",
        描述: "技能伤害命中时概率为目标附加火属性弱点（与敌人抗性同区加算），按高频技能满覆盖的上界计入。",
        限定: "火",
        attr: {
            火属性弱点: 0.54,
        },
    },
    {
        名称: "升华·充盈转武伤",
        描述: "风属性角色充盈威力超过 100% 的部分按 11.1% 转化为武器伤害。",
        限定: "风",
        attr: {
            // 上游 LuaPassive S1_C07_WindWeaponOverload：Bonus=(HyperTriggerRate-BaseSubtract 1)×BonusCoefficient 0.111，
            // 仅 Weapon tag 命中时 AddGlobalDamageRate(1+Bonus, RateZone="Normal") —— Normal 区即普通增伤池，非独立倍率
            武器伤害: "0.111*max(0,充盈威力-1)",
        },
    },
    {
        名称: "升华·雷鸣重复",
        描述: "雷属性角色技能伤害有 33.3% 概率重复结算，按重复概率折算计入。",
        限定: "雷",
        attr: {
            技能独立增伤: 0.333,
        },
    },
    {
        名称: "升华·光耀紊乱",
        描述: "触发紊乱后的技能伤害提高，按 10 秒持续期内全覆盖计入。",
        限定: "光",
        attr: {
            技能伤害: 5.15,
        },
    },
    {
        名称: "升华·暗属性追伤",
        描述: "暗属性角色武器伤害命中时叠随机属性追伤，按每种属性满 10 层计入。",
        限定: "暗",
        attr: {
            暗属性追伤: 0.64,
        },
    },
    {
        名称: "升华·闪避移速",
        描述: "闪避后移动速度提高 30%，持续 5 秒（移速只作展示，不参与伤害）。",
        attr: {
            移动速度: 0.3,
        },
    },
    {
        名称: "升华·净疗穿透",
        描述: "造成治疗效果时使目标获得全属性穿透（按自身计入）。",
        attr: {
            属性穿透: 0.75,
        },
    },
    {
        名称: "升华·激昂号令",
        描述: "释放终结技后使其他构筑位获得昂扬与技能速度（自身不获得）。",
        attr: {
            昂扬: 4.3,
            技能速度: 0.8,
        },
    },
    {
        名称: "升华·芙罗拉重奏",
        描述: "芙罗拉[重奏]超高时自动叠[交响]，[交响]命中少目标时额外获得连击点，根源改为消耗[交响]叠[花刺]。",
    },
    {
        名称: "升华·妮弗尔送葬",
        描述: "妮弗尔夫人[啼鸣交织]触发的[月猎]/[日食]可被雾海安魂提升，并按概率增加[送葬]次数与持续时间。",
    },
    {
        名称: "升华·妮弗尔固化",
        描述: "妮弗尔夫人释放[日食]后不再切换至[月猎]。",
    },
    {
        名称: "升华·月猎强化",
        描述: "妮弗尔夫人[月猎]伤害提升 150%，且释放后不再切换至[日食]。",
        // 条件 BUFF：官方只提升 [月猎] 字段，按字段名限定，不参与全局属性汇总
        技能: "月猎",
        attr: {
            技能伤害: 1.5,
        },
    },
    {
        名称: "升华·遨游永续",
        描述: "遨游层数达 10 层时获得技能速度提高 120%。",
        attr: {
            技能速度: 1.2,
        },
    },
    {
        名称: "升华·午后独立",
        描述: "菲娜[在一个暖和的午后]多次命中后叠加技能独立增伤，按 10 层满层计入；仅作用于战技字段。",
        // 条件 BUFF：官方只提升此次战技（Skill1）造成的伤害，按字段标签「战技」限定，不参与全局属性汇总
        tag: ["战技"],
        attr: {
            技能独立增伤: 0.3,
        },
    },
    {
        名称: "升华·下午茶追伤",
        描述: "菲娜[喧闹下午茶]为自身与队友附加四属性 20% 追加伤害（单一增益）。",
        attr: {
            水属性追伤: 0.2,
            火属性追伤: 0.2,
            雷属性追伤: 0.2,
            风属性追伤: 0.2,
        },
    },
    {
        名称: "升华·切割齿轮",
        描述: "[切割齿轮]子弹攻击倍率提升 120%，多重射击转为延长主弹片持续时间。",
        // 条件 BUFF：官方只提升子弹字段倍率，按字段名限定，不参与全局属性汇总
        技能: "子弹伤害",
        attr: {
            武器伤害: 1.2,
        },
    },
    {
        名称: "升华·海月水母追击",
        描述: "丽蓓卡[海月水母]攻击时概率追加一次高倍率水属性伤害（触发依赖攻击频率）。",
    },
    {
        名称: "升华·九针无上限",
        描述: "扶疏[九针治未]提供的技能威力提高移除上限（实际收益取决于叠层）。",
    },
    {
        名称: "升华·形神穿透",
        描述: "扶疏释放[形与神俱]时按自身技能威力的 3.36% 获得全属性穿透。",
        attr: {
            属性穿透: "0.0336*技能威力",
        },
    },
    {
        名称: "升华·四属追伤",
        描述: "扶疏[形与神俱]攻速提高期间获得水、火、风、雷四属性追加伤害，每种 100%。",
        attr: {
            水属性追伤: 1.0,
            火属性追伤: 1.0,
            风属性追伤: 1.0,
            雷属性追伤: 1.0,
        },
    },
    {
        名称: "升华·高温清扫",
        描述: "希尔妲[高温清扫]改为[清扫机]自动射击，间隔 0.2，伤害倍率 903.6%。",
    },
    {
        名称: "升华·优雅怒意",
        描述: "优雅怒意持续期间造成的伤害提高 200%，弹夹清空时自动装填。",
        attr: {
            增伤: 2,
        },
    },
    {
        名称: "升华·猫猫头模式",
        描述: "卡嘉[猫猫头出击！]改为自身操控[猫猫头炮台]，速射/贯穿/轰炸模式伤害倍率分别提高。",
    },
    {
        名称: "升华·火紊乱追击",
        描述: "卡嘉[毁灭灵感]高于 300 时，[猫猫头炮台]消耗目标火属性紊乱追加一次火属性充盈伤害。",
    },
    {
        名称: "升华·星河破防",
        描述: "煜明连击等级 S 释放[星河寥落]时，伤害无视目标 100% 防御并消耗全部连击点数。",
        // 条件 BUFF：官方只作用于 [星河寥落] 下落攻击字段，字段名 + 字段标签同时限定
        技能: "星河寥落",
        tag: ["下落攻击"],
        attr: {
            无视防御: 1.0,
        },
    },
    {
        名称: "升华·花宴独立",
        描述: "每轮射击仅消耗 1 枚子弹，并按技能威力属性值获得独立增伤。",
        // 条件 BUFF：官方只提升武器伤害字段，按字段标签「武器」限定，不参与全局属性汇总
        tag: ["武器"],
        attr: {
            独立增伤: "0.0584488560441114*技能威力",
        },
    },
]

/**
 * Plan 4 手写词条（affixId）→ 本地建模口径。
 * 覆盖全部 38 条 handwritten 词条：属性词条（生命回复）只登记口径，其余引用手写 BUFF。
 */
export const UNIQUE_AFFIX_MAP: Record<number, TranscendAffixMapping> = {
    2001: {
        buffs: ["升华·螺旋跃击"],
        status: "handwritten",
        values: [{ name: "下落增伤", value: 9 }],
        effect: { target: "self", trigger: "spiral-leap", duration: 20 },
        included: ["下落攻击增伤"],
        note: "Zone Normal 仅 FallAttack tag",
    },
    2002: {
        buffs: ["升华·连击暴击"],
        status: "handwritten",
        values: [{ name: "近战普攻独立增伤", value: 0.32 }],
        effect: { target: "self", trigger: "combo", chance: 0.32 },
        partial: true,
        included: ["普攻独立增伤"],
        excluded: ["单次命中暴击率"],
        note: "0.32 已含 32% 概率 ×2 的期望（含生命值高于 80% 的翻倍概率）；官方 +100 个百分点暴击率只作用于单次命中，面板暴击无法表达",
    },
    2003: {
        buffs: ["升华·弹药补给箱"],
        status: "handwritten",
        values: [],
        effect: { target: "self", trigger: "passive" },
        partial: true,
        excluded: ["弹药补给箱"],
        note: "补给机制无战斗属性",
    },
    2004: {
        buffs: ["升华·耐久转化"],
        status: "handwritten",
        values: [{ name: "独立增伤", value: "0.02373*max(0,技能耐久-1)" }],
        effect: { target: "self", trigger: "passive" },
        included: ["独立增伤"],
    },
    2005: {
        buffs: ["升华·范围转化"],
        status: "handwritten",
        values: [{ name: "独立增伤", value: "0.04858*max(0,技能范围-1)" }],
        effect: { target: "self", trigger: "passive" },
        included: ["独立增伤"],
    },
    2006: {
        buffs: ["升华·效益转化"],
        status: "handwritten",
        values: [{ name: "独立增伤", value: "0.056417*max(0,技能效益-1)" }],
        effect: { target: "self", trigger: "passive" },
        included: ["独立增伤"],
    },
    2007: {
        buffs: ["升华·召唤破防"],
        status: "handwritten",
        values: [{ name: "技能无视防御", value: 0.175, scope: { tag: "召唤物" } }],
        effect: { target: "summon", trigger: "passive" },
        included: ["技能无视防御"],
        note: "水属性角色的召唤物伤害字段无视 17.5% 防御（技能无视防御按 tag 召唤物 限定）",
    },
    2008: {
        buffs: ["升华·火属性弱点"],
        status: "handwritten",
        values: [{ name: "火属性弱点", value: 0.54 }],
        effect: { target: "enemy", trigger: "skill-hit", chance: 0.25, duration: 8 },
        partial: true,
        included: ["火属性弱点"],
        excluded: ["目标减益", "覆盖率"],
        note: "官方为 25% 概率施加 8 秒目标火属性弱点（FireDamagedRate，与敌人抗性同区加算）；覆盖率缺口仍在，当前按 100% 覆盖上界计入",
    },
    2009: {
        buffs: ["升华·充盈转武伤"],
        status: "handwritten",
        values: [{ name: "武器伤害", value: "0.111*max(0,充盈威力-1)" }],
        effect: { target: "self", trigger: "passive" },
        included: ["武器伤害"],
    },
    2010: {
        buffs: ["升华·雷鸣重复"],
        status: "handwritten",
        values: [{ name: "技能独立增伤", value: 0.333 }],
        effect: { target: "self", trigger: "skill-hit", chance: 0.333 },
        included: ["技能独立增伤"],
        note: "按 33.3% 重复概率折算计入；MaxRepeat=1 已覆盖重复上限",
    },
    2011: {
        buffs: ["升华·光耀紊乱"],
        status: "handwritten",
        values: [{ name: "技能伤害", value: 5.15 }],
        effect: { target: "self", trigger: "disorder", duration: 10 },
        partial: true,
        included: ["技能伤害"],
        excluded: ["紊乱触发覆盖率"],
        note: "按 10 秒持续期内全覆盖计入（上界）",
    },
    2012: {
        buffs: ["升华·暗属性追伤"],
        status: "handwritten",
        values: [{ name: "暗属性追伤", value: 0.64 }],
        effect: { target: "self", trigger: "weapon-hit", chance: 0.25, duration: 12, maxLayers: 10 },
        partial: true,
        included: ["暗属性追伤"],
        excluded: ["随机属性仅暗", "武器命中覆盖率"],
        note: "按暗属性追伤满 10 层 × 6.4% 计入（上界）",
    },
    2013: {
        buffs: ["升华·闪避移速"],
        status: "handwritten",
        values: [{ name: "移动速度", value: 0.3 }],
        effect: { target: "self", trigger: "dodge", duration: 5 },
        included: ["移动速度"],
        note: "移动速度只作展示，不参与伤害",
    },
    2014: {
        buffs: ["升华·净疗穿透"],
        status: "handwritten",
        values: [{ name: "属性穿透", value: 0.75 }],
        effect: { target: "heal-target", trigger: "heal", duration: 8 },
        partial: true,
        included: ["属性穿透"],
        excluded: ["治疗目标范围", "覆盖率"],
        note: "官方在治疗时给治疗目标挂 8 秒全属性穿透；本地按自身满覆盖计入，偏高",
    },
    2015: {
        buffs: ["升华·激昂号令"],
        status: "handwritten",
        values: [
            { name: "昂扬", value: 4.3 },
            { name: "技能速度", value: 0.8 },
        ],
        effect: { target: "other-teammates", trigger: "ultimate", duration: -1 },
        team: { target: "other-teammates", trigger: "ultimate", duration: -1, stackScope: "per-source", maxStacksPerSource: 1 },
        included: ["昂扬", "技能速度"],
        note: "仅其他构筑位；每名装备者各提供一份，不同来源可叠加，自身不获得",
    },
    110201: {
        buffs: ["升华·芙罗拉重奏"],
        status: "handwritten",
        values: [],
        effect: { target: "self", trigger: "passive" },
        partial: true,
        excluded: ["连击点数", "技能效果替换"],
        note: "机制类效果，未建模",
    },
    150201: {
        buffs: ["升华·妮弗尔送葬"],
        status: "handwritten",
        values: [],
        effect: { target: "self", trigger: "passive", chance: 0.6 },
        partial: true,
        excluded: ["雾海安魂", "送葬"],
        note: "机制类效果，未建模",
    },
    150202: {
        buffs: ["升华·妮弗尔固化"],
        status: "handwritten",
        values: [],
        effect: { target: "self", trigger: "passive" },
        partial: true,
        excluded: ["技能效果替换"],
        note: "机制类效果，未建模",
    },
    150203: {
        buffs: ["升华·月猎强化"],
        status: "handwritten",
        values: [{ name: "技能伤害", value: 1.5, scope: { field: "月猎" } }],
        effect: { target: "self", trigger: "passive" },
        partial: true,
        included: ["技能伤害"],
        excluded: ["技能效果替换"],
        note: "[月猎]伤害按技能伤害计入，仅命中[月猎]字段（字段名限定）；替换参数未导出",
    },
    150401: {
        buffs: ["升华·遨游永续"],
        status: "handwritten",
        values: [{ name: "技能速度", value: 1.2 }],
        effect: { target: "self", trigger: "passive", maxLayers: 10 },
        partial: true,
        included: ["技能速度"],
        excluded: ["遨游永续", "剑如虹弹药"],
        note: "遨游 10 层技能速度 +120% 计入；永续与弹药 3 枚属蓝图逻辑，未建模",
    },
    180101: {
        buffs: ["升华·午后独立"],
        status: "handwritten",
        values: [{ name: "技能独立增伤", value: 0.3, scope: { tag: "战技" } }],
        effect: { target: "self", trigger: "skill-hit", maxLayers: 10 },
        partial: true,
        included: ["技能替换", "技能独立增伤"],
        excluded: ["弹药消耗", "夜莺重复"],
        note: "按 3% × 10 层、仅战技字段（tag 战技）计入；技能替换按上游目标技能应用",
    },
    180102: {
        buffs: ["升华·下午茶追伤"],
        status: "handwritten",
        values: [
            { name: "水属性追伤", value: 0.2 },
            { name: "火属性追伤", value: 0.2 },
            { name: "雷属性追伤", value: 0.2 },
            { name: "风属性追伤", value: 0.2 },
        ],
        effect: { target: "all-teammates", trigger: "passive" },
        team: { target: "all-teammates", trigger: "passive", duration: -1, stackScope: "per-source", maxStacksPerSource: 1 },
        partial: true,
        included: ["技能替换", "水属性追伤", "火属性追伤", "雷属性追伤", "风属性追伤", "四属性追伤"],
        excluded: ["四属性领域伤害"],
        note: "四属性各额外造成一段可触发额外效果的属性伤害；自身与队友各一份（每名装备者一份）",
    },
    2040601: {
        buffs: ["升华·切割齿轮"],
        status: "handwritten",
        values: [{ name: "武器伤害", value: 1.2, scope: { field: "子弹伤害" } }],
        effect: { target: "self", trigger: "weapon-hit" },
        partial: true,
        included: ["技能替换", "武器伤害"],
        excluded: ["多重射击机制", "主弹片持续时间", "主弹片最多 3 枚", "武器限定", "技能系数改写未建模"],
        note: "切割齿轮武器专属（上游无 charIds，本地无武器门槛）；子弹倍率 120% 按加算武器伤害计入，仅命中[子弹伤害]字段（字段名限定），加算语义与 SE 改写仍缺；技能系数改写与主弹片机制未建模；替换技能保留源字段",
    },
    210101: {
        buffs: ["升华·海月水母追击"],
        status: "handwritten",
        effect: { target: "summon", trigger: "weapon-hit", chance: 0.3 },
        partial: true,
        excluded: ["12000% 水属性伤害", "召唤物攻击频率覆盖率"],
        note: "30% 概率追加一次 12000% 水属性伤害的额外一击（非面板增伤）；触发依赖召唤物攻击频率，未建模",
    },
    240101: {
        buffs: ["升华·九针无上限"],
        status: "handwritten",
        values: [],
        effect: { target: "other-teammates", trigger: "passive" },
        partial: true,
        excluded: ["九针层数上限"],
        note: "收益取决于叠层，未建模",
    },
    240102: {
        buffs: ["升华·形神穿透"],
        status: "handwritten",
        values: [{ name: "属性穿透", value: "0.0336*技能威力" }],
        effect: { target: "self", trigger: "passive" },
        partial: true,
        included: ["属性穿透"],
        excluded: ["队友九针移除"],
        note: "上游 S0EquipRate=0.0336；队友九针移除未建模",
    },
    240103: {
        buffs: ["升华·四属追伤"],
        status: "handwritten",
        values: [
            { name: "水属性追伤", value: 1.0 },
            { name: "火属性追伤", value: 1.0 },
            { name: "风属性追伤", value: 1.0 },
            { name: "雷属性追伤", value: 1.0 },
        ],
        effect: { target: "self", trigger: "passive" },
        partial: true,
        included: ["水属性追伤", "火属性追伤", "风属性追伤", "雷属性追伤", "四属性追伤"],
        excluded: ["形与神俱攻速条件"],
        note: "对齐 Buff[240128] 四条元素追伤；四属性各额外造成一段可触发额外效果的属性伤害",
    },
    310201: {
        buffs: ["升华·高温清扫"],
        status: "handwritten",
        effect: { target: "self", trigger: "passive" },
        partial: true,
        included: ["技能替换"],
        excluded: ["0.2 射击间隔", "技能效果替换"],
        note: "技能替换：替换后技能伤害倍率 903.552%（上游 SkillEffects 310234）经技能替换结算，不计入属性数值；0.2 射击间隔与命中频率未建模",
    },
    310202: {
        buffs: ["升华·优雅怒意"],
        status: "handwritten",
        values: [{ name: "增伤", value: 2 }],
        effect: { target: "self", trigger: "passive" },
        partial: true,
        included: ["增伤"],
        excluded: ["覆盖率", "自动装填"],
        note: "增伤 200% 计入；持续期覆盖率与自动装填未建模",
    },
    3202: {
        buffs: [],
        status: "handwritten",
        values: [{ name: "生命回复", value: 12, unit: "flat" }],
        included: ["生命回复"],
        excluded: ["生存属性不计入伤害"],
        note: "生命回复由属性映射产出，只作展示",
    },
    3212: {
        buffs: [],
        status: "handwritten",
        values: [{ name: "生命回复", value: 24, unit: "flat" }],
        included: ["生命回复"],
        excluded: ["生存属性不计入伤害"],
        note: "生命回复由属性映射产出，只作展示",
    },
    3222: {
        buffs: [],
        status: "handwritten",
        values: [{ name: "生命回复", value: 36, unit: "flat" }],
        included: ["生命回复"],
        excluded: ["生存属性不计入伤害"],
        note: "生命回复由属性映射产出，只作展示",
    },
    3232: {
        buffs: [],
        status: "handwritten",
        values: [{ name: "生命回复", value: 48, unit: "flat" }],
        included: ["生命回复"],
        excluded: ["生存属性不计入伤害"],
        note: "生命回复由属性映射产出，只作展示",
    },
    3242: {
        buffs: [],
        status: "handwritten",
        values: [{ name: "生命回复", value: 60, unit: "flat" }],
        included: ["生命回复"],
        excluded: ["生存属性不计入伤害"],
        note: "生命回复由属性映射产出，只作展示",
    },
    320301: {
        buffs: ["升华·猫猫头模式"],
        status: "handwritten",
        values: [
            { name: "速射模式倍率", value: 3.193, labelKey: "db-transcendence.gear.mode_rapid" },
            { name: "贯穿模式倍率", value: 4.089, labelKey: "db-transcendence.gear.mode_pierce" },
            { name: "轰炸模式倍率", value: 5.082, labelKey: "db-transcendence.gear.mode_bombard" },
        ],
        effect: { target: "self", trigger: "passive" },
        partial: true,
        included: ["技能替换"],
        excluded: ["速射/贯穿/轰炸模式倍率", "炮台形态改动"],
        note: "技能替换按上游目标技能应用；三种模式倍率只作展示、未参与计算，炮台不再消耗毁灭灵感 / 生成小型炮台 / 提供增益",
    },
    320302: {
        buffs: ["升华·火紊乱追击"],
        status: "handwritten",
        effect: { target: "enemy", trigger: "disorder" },
        partial: true,
        excluded: ["700% 追加伤害", "火属性紊乱层数"],
        note: "消耗 1 层火属性紊乱追加一次 700% 火属性充盈伤害（非面板追伤）；紊乱层数未建模",
    },
    420101: {
        buffs: ["升华·星河破防"],
        status: "handwritten",
        values: [{ name: "无视防御", value: 1.0, scope: { field: "星河寥落", tag: "下落攻击" } }],
        effect: { target: "enemy", trigger: "combo" },
        partial: true,
        included: ["无视防御"],
        excluded: ["连击等级 S"],
        note: "官方 DamageIgnoreDefence 只作用于 [星河寥落] 下落攻击字段（字段名 + tag 下落攻击 限定）；连击等级 S 条件未建模，按始终生效计入",
    },
    2030301: {
        buffs: ["升华·花宴独立"],
        status: "handwritten",
        values: [{ name: "独立增伤", value: "0.0584488560441114*技能威力", scope: { tag: "武器" } }],
        effect: { target: "self", trigger: "weapon-hit" },
        partial: true,
        included: ["独立增伤"],
        excluded: ["武器限定", "每轮 1 弹"],
        note: "炽枪的花宴武器专属（本地无武器门槛）；公式精确，仅命中武器标签字段（tag 武器），每轮只耗 1 弹未建模",
    },
}
