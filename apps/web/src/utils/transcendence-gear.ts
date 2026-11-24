import i18next from "i18next"
import type {
    DnaSeasonAffix,
    DnaSeasonAffixAttr,
    DnaSeasonAffixUpdateFunc,
    DnaSeasonInlay,
    DnaSeasonUniqueEquip,
} from "@/data/d/dnaseasonequip.data"
import { affixes, craftTypes, inlays, slots, uniqueEquips } from "@/data/d/dnaseasonequip.data"
import type {
    TranscendAffixEffectMeta,
    TranscendAffixMapping,
    TranscendAffixTarget,
    TranscendAffixTrigger,
    TranscendAffixValueScope,
    TranscendAffixValueUnit,
    TranscendTeammateMeta,
} from "@/data/transcendBuffs"
import { TRANSCEND_BUFF_MAP, UNIQUE_AFFIX_MAP } from "@/data/transcendBuffs"
import type { TranscendGearEntry } from "@/data/transcendGear"
import { cleanGameMarkup } from "@/utils/transcendence-display"

/** 词缀分类 id → 界面文案键；上游 planName 是本地派生的中文字面值，不能直接渲染 */
const PLAN_LABEL_KEYS: Record<number, string> = {
    1: "db-transcendence.gear.plan_1",
    2: "db-transcendence.gear.plan_2",
    3: "db-transcendence.gear.plan_3",
    4: "db-transcendence.gear.plan_4",
}

/** 建模状态 → 徽章文案键：只有 exact（自动映射）与 handwritten（手写建模）两档 */
const MAPPING_LABEL_KEYS: Record<string, string> = {
    exact: "db-transcendence.gear.mapping_exact",
    handwritten: "db-transcendence.gear.mapping_handwritten",
}

/** 手写词条只覆盖部分效果时的独立徽章与说明 */
const MAPPING_PARTIAL_KEY = "db-transcendence.gear.mapping_partial"
const MAPPING_PARTIAL_HINT_KEY = "db-transcendence.gear.mapping_partial_hint"

/** 词缀池 id → 界面文案键；池名按上游 `UI_EquipCraft_TemperTab*` 官方值（211 KO 缺译，保留本地译名） */
const POOL_LABEL_KEYS: Record<number, string> = {
    201: "db-transcendence.gear.pool_1",
    202: "db-transcendence.gear.pool_2",
    203: "db-transcendence.gear.pool_3",
    204: "db-transcendence.gear.pool_4",
    205: "db-transcendence.gear.pool_5",
    211: "db-transcendence.gear.pool_6",
}

/** 打造类型 id → 界面文案键：上游只有英文枚举，键名由枚举转 snake_case 得到 */
export const CRAFT_LABEL_KEYS: Record<number, string> = Object.fromEntries(
    Object.entries(craftTypes).map(([id, name]) => [
        Number(id),
        `db-transcendence.craft.${name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()}`,
    ])
)

/** 技能类型 → 界面文案键 */
const SKILL_TYPE_KEYS: Record<string, string> = {
    Skill1: "db-transcendence.gear.skill_type_skill1",
    Skill2: "db-transcendence.gear.skill_type_skill2",
    Passive: "db-transcendence.gear.skill_type_passive",
}

/**
 * 槽型 → 装备位。上游 `CommonConst.DNASeasonEquipSlotIndex` 固定 16 位：
 * 主控 1–8（戒指占 7/8），协战 1 为 9–12，协战 2 为 13–16；槽型 8–11 由两组协战共用。
 */
const EQUIP_POSITIONS_BY_SLOT: Record<number, number[]> = {
    1: [1],
    2: [2],
    3: [3],
    4: [4],
    5: [5],
    6: [6],
    7: [7, 8],
    8: [9, 13],
    9: [10, 14],
    10: [11, 15],
    11: [12, 16],
}

/** 协战升华装备（槽型 8–11） */
export const ASSIST_SLOT_IDS = new Set([8, 9, 10, 11])

/**
 * 取词缀分类的界面文案键。
 * @param plan 词缀分类 id（1–4）
 * @returns i18n 键
 */
export function getPlanLabelKey(plan: number): string {
    return PLAN_LABEL_KEYS[plan] ?? PLAN_LABEL_KEYS[1]
}

/**
 * 取建模状态的徽章文案键。
 * @param status 建模状态（exact / handwritten）
 * @returns i18n 键；未标注时返回空串由调用方决定是否展示
 */
export function getMappingLabelKey(status: string | undefined): string {
    return status ? (MAPPING_LABEL_KEYS[status] ?? "") : ""
}

/**
 * 取「手写·部分覆盖」徽章文案键。
 * @returns i18n 键
 */
export function getMappingPartialLabelKey(): string {
    return MAPPING_PARTIAL_KEY
}

/**
 * 取「手写·部分覆盖」说明文案键。
 * @returns i18n 键
 */
export function getMappingPartialHintKey(): string {
    return MAPPING_PARTIAL_HINT_KEY
}

/**
 * 读取词缀的本地建模口径（partial / included / excluded）。
 * @param affixId 词缀 id
 * @returns 手写建模条目；自动映射词缀返回 undefined
 */
export function getAffixModeling(affixId: number): TranscendAffixMapping | undefined {
    return UNIQUE_AFFIX_MAP[affixId]
}

/**
 * 读取词缀的本地建模说明（`UNIQUE_AFFIX_MAP.note`），只作只读展示，不参与计算。
 * @param affixId 词缀 id
 * @returns 说明文本；未登记或为空时返回空串
 */
export function getAffixNote(affixId: number): string {
    return UNIQUE_AFFIX_MAP[affixId]?.note?.trim() ?? ""
}

/**
 * 读取词缀的效果事件参数（目标 / 触发 / 概率 / 持续 / 层数）。
 * @param affixId 词缀 id
 * @returns 未登记时为 undefined
 */
export function getAffixEffectMeta(affixId: number): TranscendAffixEffectMeta | undefined {
    return UNIQUE_AFFIX_MAP[affixId]?.effect
}

/**
 * 读取词缀的队友限定增益范式（跨侧注入由构筑层消费）。
 * @param affixId 词缀 id
 * @returns 未登记时为 undefined
 */
export function getAffixTeammateMeta(affixId: number): TranscendTeammateMeta | undefined {
    return UNIQUE_AFFIX_MAP[affixId]?.team
}

/** 效果目标 → 界面文案键 */
const AFFIX_TARGET_LABEL_KEYS: Record<TranscendAffixTarget, string> = {
    self: "db-transcendence.gear.target_self",
    summon: "db-transcendence.gear.target_summon",
    "other-teammates": "db-transcendence.gear.target_other_teammates",
    "all-teammates": "db-transcendence.gear.target_all_teammates",
    "heal-target": "db-transcendence.gear.target_heal_target",
    enemy: "db-transcendence.gear.target_enemy",
}

/** 效果触发 → 界面文案键 */
const AFFIX_TRIGGER_LABEL_KEYS: Record<TranscendAffixTrigger, string> = {
    ultimate: "db-transcendence.gear.trigger_ultimate",
    "spiral-leap": "db-transcendence.gear.trigger_spiral_leap",
    dodge: "db-transcendence.gear.trigger_dodge",
    "skill-hit": "db-transcendence.gear.trigger_skill_hit",
    "weapon-hit": "db-transcendence.gear.trigger_weapon_hit",
    heal: "db-transcendence.gear.trigger_heal",
    disorder: "db-transcendence.gear.trigger_disorder",
    combo: "db-transcendence.gear.trigger_combo",
    passive: "db-transcendence.gear.trigger_passive",
    none: "db-transcendence.gear.trigger_none",
}

/**
 * 取效果目标的界面文案键。
 * @param target 效果目标
 * @returns i18n 键
 */
export function getAffixTargetLabelKey(target: TranscendAffixTarget): string {
    return AFFIX_TARGET_LABEL_KEYS[target]
}

/**
 * 取效果触发的界面文案键。
 * @param trigger 效果触发
 * @returns i18n 键
 */
export function getAffixTriggerLabelKey(trigger: TranscendAffixTrigger): string {
    return AFFIX_TRIGGER_LABEL_KEYS[trigger]
}

/** 界面文案翻译函数（i18next 可选插值参数） */
export type TranscendTranslate = (key: string, options?: Record<string, unknown>) => string

/** 手写建模数值行：优先取 `UNIQUE_AFFIX_MAP.values`，与普通属性同一区块展示 */
export interface TranscendAffixModeledValue {
    /** 属性规范名（调用方过 `gt`） */
    name: string
    /** 原始建模值：number 为固定值，string 为随构筑属性求值的表达式；未折算 coverage */
    value: number | string
    /** 数值单位；percent 时 value 为比例（0.175 = 17.5%） */
    unit?: TranscendAffixValueUnit
    /** 预格式化展示文本（优先于 value） */
    display?: string
    /** 界面文案键；存在时优先于 name */
    labelKey?: string
    /** 生效范围标注（只作展示，不参与计算） */
    scope?: TranscendAffixValueScope
}

/** 手写 BUFF 的最小查询形状（测试可注入） */
export interface ModeledBuffLike {
    attr?: Record<string, number | number[] | string>
    lx?: number
    mx?: number
    dx?: number
}

/**
 * 按 `LeveledBuff` 的默认等级从等级数组中取值：
 * 默认等级为 `dx || mx || 1`，下标按 `lx` 起算并封顶到数组末位。
 * @param buff BUFF 数据
 * @param values 等级数组
 * @returns 默认等级对应的值；越界时 undefined
 */
function pickDefaultLevelValue(buff: ModeledBuffLike, values: number[]): number | undefined {
    const level = buff.dx || buff.mx || 1

    return values[Math.min(level, values.length) - (buff.lx ?? 1)]
}

/**
 * 展开手写 BUFF 的属性表：剥 `@` 前缀、按属性名去重、数组取默认等级值。
 * 返回的是原始建模值，未折算 coverage。
 * @param buffNames 手写 BUFF 名称（按映射顺序）
 * @param lookup BUFF 查询函数
 * @returns 建模数值行
 * @internal
 */
export function collectModeledValues(
    buffNames: string[],
    lookup: (name: string) => ModeledBuffLike | undefined
): TranscendAffixModeledValue[] {
    const seen = new Set<string>()
    const rows: TranscendAffixModeledValue[] = []

    for (const buffName of buffNames) {
        const buff = lookup(buffName)

        if (!buff?.attr) {
            continue
        }

        for (const [key, raw] of Object.entries(buff.attr)) {
            const name = key.startsWith("@") ? key.slice(1) : key

            if (seen.has(name)) {
                continue
            }

            const value = Array.isArray(raw) ? pickDefaultLevelValue(buff, raw) : raw

            if (value === undefined) {
                continue
            }

            seen.add(name)
            rows.push({ name, value })
        }
    }

    return rows
}

/**
 * 读取词缀的手写建模数值行：优先取 `UNIQUE_AFFIX_MAP.values`（权威展示数值），
 * 无 `values` 时回退按 `buffs` 展开手写 BUFF 属性表。
 * @param affixId 词缀 id
 * @returns 建模数值行（未折算 coverage）；无映射或无数值时为空数组
 */
export function getAffixModeledValues(affixId: number): TranscendAffixModeledValue[] {
    const mapping = UNIQUE_AFFIX_MAP[affixId]

    if (!mapping) {
        return []
    }

    if (mapping.values) {
        return mapping.values.map(item => ({ ...item, unit: item.unit ?? "percent" }))
    }
    return collectModeledValues(mapping.buffs, name => TRANSCEND_BUFF_MAP.get(name)).map(row => ({ ...row, unit: "percent" }))
}

/**
 * 建模数值展示文本：绝对值为 `+12`，比例为 `+430%` / `+17.5%`，表达式原样返回。
 * @param item 建模数值行
 * @returns 展示文本
 */
export function formatModeledAffixValue(item: TranscendAffixModeledValue): string {
    if (item.display) {
        return item.display
    }

    if (typeof item.value === "string") {
        return item.value
    }

    const flat = item.unit === "flat"
    const value = flat ? +item.value.toFixed(2) : +(item.value * 100).toFixed(3)

    return `${value >= 0 ? "+" : ""}${value}${flat ? "" : "%"}`
}

/**
 * 建模数值行的作用域标注：field → 字段名限定，tag → 字段标签限定；两者并存时组合展示。
 * @param item 建模数值行
 * @param translate 界面文案翻译函数（`$t`）
 * @param gameText 游戏原文翻译函数（`gt`）
 * @returns 标注文本；无 scope 时为空串
 */
export function getModeledValueScopeText(
    item: TranscendAffixModeledValue,
    translate: TranscendTranslate,
    gameText: (text: string) => string
): string {
    if (!item.scope) {
        return ""
    }

    const parts: string[] = []

    if (item.scope.field) {
        parts.push(translate("db-transcendence.gear.modeled_scope_field", { value: gameText(item.scope.field) }))
    }

    if (item.scope.tag) {
        parts.push(translate("db-transcendence.gear.modeled_scope_tag", { value: gameText(item.scope.tag) }))
    }

    return parts.join(" + ")
}

/**
 * 建模数值行的展示名：有界面文案键时走 `$t`，否则走游戏原文翻译；带 scope 时追加限定范围。
 * @param item 建模数值行
 * @param translate 界面文案翻译函数（`$t`）
 * @param gameText 游戏原文翻译函数（`gt`）
 * @returns 展示名
 */
export function getModeledValueName(
    item: TranscendAffixModeledValue,
    translate: TranscendTranslate,
    gameText: (text: string) => string
): string {
    const name = item.labelKey ? translate(item.labelKey) : gameText(item.name)
    const scope = getModeledValueScopeText(item, translate, gameText)

    return scope ? `${name}（${scope}）` : name
}

/**
 * 词缀的建模数值摘要（仅无数据属性的词条）：名称按 labelKey / 游戏原文本地化。
 * @param affix 词缀
 * @param translate 界面文案翻译函数（`$t`）
 * @param gameText 游戏原文翻译函数（`gt`）
 * @returns 展示文本；有数据属性或无建模数值时为空串
 */
export function getAffixModeledSummary(
    affix: DnaSeasonAffix,
    translate: (key: string) => string,
    gameText: (text: string) => string
): string {
    if (getAffixAttrs(affix).length) {
        return ""
    }

    return getAffixModeledValues(affix.id)
        .map(item => getModeledValueName(item, translate, gameText))
        .join(" · ")
}

/** 建模徽章口径：partial 显示「推算/部分」，exact 显示「精确数值」，无建模值不显示 */
export type TranscendAffixModeledBadge = "partial" | "exact"

/**
 * 读取词缀的建模徽章口径。
 * @param affixId 词缀 id
 * @returns 有建模数值时为 partial / exact；无建模数值时 null
 */
export function getAffixModeledBadge(affixId: number): TranscendAffixModeledBadge | null {
    if (!getAffixModeledValues(affixId).length) {
        return null
    }

    return UNIQUE_AFFIX_MAP[affixId]?.partial ? "partial" : "exact"
}

/**
 * 手写建模覆盖项（`included` / `excluded` token）→ i18n 文案键。
 * token 是数据侧的本地建模键，不带译文；展示时必须走这张表，不能直接渲染中文。
 */
const COVERAGE_TOKEN_KEYS: Record<string, string> = {
    下落攻击增伤: "db-transcendence.gear.coverage.plunge_dmg",
    元素增伤: "db-transcendence.gear.coverage.element_dmg",
    火属性增伤: "db-transcendence.gear.coverage.fire_dmg",
    火属性弱点: "db-transcendence.gear.coverage.fire_weakness",
    增伤: "db-transcendence.gear.coverage.dmg_boost",
    属性穿透: "db-transcendence.gear.coverage.pen",
    技能伤害: "db-transcendence.gear.coverage.skill_dmg",
    技能无视防御: "db-transcendence.gear.coverage.skill_def_ignore",
    无视防御: "db-transcendence.gear.coverage.def_ignore",
    技能独立增伤: "db-transcendence.gear.coverage.skill_indep_dmg",
    技能追伤: "db-transcendence.gear.coverage.skill_bonus_dmg",
    技能速度: "db-transcendence.gear.coverage.skill_speed",
    昂扬: "db-transcendence.gear.coverage.morale",
    普攻独立增伤: "db-transcendence.gear.coverage.normal_indep_dmg",
    近战独立增伤: "db-transcendence.gear.coverage.melee_indep_dmg",
    远程独立增伤: "db-transcendence.gear.coverage.ranged_indep_dmg",
    暴击: "db-transcendence.gear.coverage.crit",
    武器伤害: "db-transcendence.gear.coverage.weapon_dmg",
    独立增伤: "db-transcendence.gear.coverage.indep_dmg",
    生命回复: "db-transcendence.gear.coverage.hp_recover",
    移动速度: "db-transcendence.gear.coverage.move_speed",
    追加伤害: "db-transcendence.gear.coverage.bonus_dmg",
    "0.2 射击间隔": "db-transcendence.gear.coverage.fire_interval",
    "12 秒持续": "db-transcendence.gear.coverage.duration_12s",
    "12000% 水属性伤害": "db-transcendence.gear.coverage.water_dmg_12000",
    "500% 追加伤害": "db-transcendence.gear.coverage.bonus_dmg_500",
    "700% 追加伤害": "db-transcendence.gear.coverage.bonus_dmg_700",
    "8 秒弱点持续": "db-transcendence.gear.coverage.weakness_8s",
    "903.6% 倍率": "db-transcendence.gear.coverage.multiplier_903_6",
    主弹片持续时间: "db-transcendence.gear.coverage.main_pellet_duration",
    "主弹片最多 3 枚": "db-transcendence.gear.coverage.main_pellet_max_3",
    九针层数上限: "db-transcendence.gear.coverage.nine_needle_cap",
    交响: "db-transcendence.gear.coverage.symphony",
    剑如虹弹药: "db-transcendence.gear.coverage.sword_ammo",
    召唤物限定: "db-transcendence.gear.coverage.summon_only",
    四属性领域伤害: "db-transcendence.gear.coverage.four_element_field",
    四属性追伤: "db-transcendence.gear.coverage.four_element_chase",
    多重射击机制: "db-transcendence.gear.coverage.multishot_mechanic",
    夜莺重复: "db-transcendence.gear.coverage.nightingale_repeat",
    弹药消耗: "db-transcendence.gear.coverage.ammo_consumption",
    弹药补给箱: "db-transcendence.gear.coverage.ammo_supply",
    形与神俱攻速条件: "db-transcendence.gear.coverage.form_spirit_atk_speed",
    技能替换: "db-transcendence.gear.coverage.skill_replacement",
    "日食/月猎切换": "db-transcendence.gear.coverage.eclipse_moonhunt_switch",
    "月猎/日食": "db-transcendence.gear.coverage.moonhunt_eclipse",
    "月猎/日食切换": "db-transcendence.gear.coverage.moonhunt_eclipse_switch",
    概率触发: "db-transcendence.gear.coverage.chance_trigger",
    "每属性 10 层上限": "db-transcendence.gear.coverage.stacks_per_element_10",
    治疗目标范围: "db-transcendence.gear.coverage.heal_target_range",
    火属性紊乱层数: "db-transcendence.gear.coverage.fire_disorder_stacks",
    "生命值高于 80% 条件": "db-transcendence.gear.coverage.hp80_condition",
    生存属性不计入伤害: "db-transcendence.gear.coverage.survival_not_damage",
    目标减益: "db-transcendence.gear.coverage.target_debuff",
    神智消耗: "db-transcendence.gear.coverage.sanity_cost",
    紊乱触发覆盖率: "db-transcendence.gear.coverage.disorder_uptime",
    自动装填: "db-transcendence.gear.coverage.auto_reload",
    花刺: "db-transcendence.gear.coverage.floral_thorn",
    覆盖率: "db-transcendence.gear.coverage.uptime",
    连击点数: "db-transcendence.gear.coverage.combo_points",
    连击点数满层条件: "db-transcendence.gear.coverage.combo_full_condition",
    送葬: "db-transcendence.gear.coverage.funeral",
    "速射/贯穿/轰炸模式倍率": "db-transcendence.gear.coverage.rapid_pierce_bombard",
    遨游永续: "db-transcendence.gear.coverage.soar_permanent",
    重复触发次数上限: "db-transcendence.gear.coverage.repeat_trigger_cap",
    重奏: "db-transcendence.gear.coverage.ensemble",
    闪避触发: "db-transcendence.gear.coverage.dodge_trigger",
    队友九针移除: "db-transcendence.gear.coverage.ally_nine_needle_removal",
    队友限定: "db-transcendence.gear.coverage.party_only",
    随机属性: "db-transcendence.gear.coverage.random_element",
    随机属性仅暗: "db-transcendence.gear.coverage.random_element_dark",
    武器命中覆盖率: "db-transcendence.gear.coverage.weapon_hit_uptime",
    召唤物攻击频率覆盖率: "db-transcendence.gear.coverage.summon_attack_uptime",
    "Skill1 限定": "db-transcendence.gear.coverage.skill1_only",
    "螺旋飞跃后 20s": "db-transcendence.gear.coverage.plunge_after_spiral_20s",
    下落攻击限定: "db-transcendence.gear.coverage.plunge_only",
    "连击等级 S": "db-transcendence.gear.coverage.combo_grade_s",
    单次命中暴击率: "db-transcendence.gear.coverage.single_hit_crit",
    技能效果替换: "db-transcendence.gear.coverage.skill_effect_replacement",
    雾海安魂: "db-transcendence.gear.coverage.sea_requiem",
    "60% 概率": "db-transcendence.gear.coverage.chance_60",
    武器限定: "db-transcendence.gear.coverage.weapon_exclusive",
    "每轮 1 弹": "db-transcendence.gear.coverage.one_bullet_per_round",
    技能系数改写未建模: "db-transcendence.gear.coverage.skill_coeff_not_additive",
    炮台形态改动: "db-transcendence.gear.coverage.turret_form_changes",
}

/**
 * 取覆盖项的 i18n 文案键。
 * @param token 数据侧 token
 * @returns i18n 键；未登记的 token 返回 undefined（调用方改走游戏原文翻译，见 `resolveCoverageTokenLabel`）
 */
export function getCoverageTokenKey(token: string): string | undefined {
    return COVERAGE_TOKEN_KEYS[token]
}

/**
 * 覆盖 token 的展示文案：先查界面文案表，未登记时回退到游戏原文（数据包对照表）。
 * 追伤分量（如「暗属性追伤」）是属性名，走游戏原文翻译；两者都未收录时原样返回 token。
 * @param token 数据侧 token
 * @param translate 界面文案翻译函数（`$t`）
 * @param gameText 游戏原文翻译函数（`gt`）
 * @returns 展示文案
 */
export function resolveCoverageTokenLabel(token: string, translate: (key: string) => string, gameText: (text: string) => string): string {
    const key = COVERAGE_TOKEN_KEYS[token]
    return key ? translate(key) : gameText(token) || token
}

/**
 * 取词缀池的界面文案键。
 * @param poolId 词缀池 id（201–205 / 211）
 * @returns i18n 键；未知池回退空串由调用方决定展示
 */
export function getPoolLabelKey(poolId: number | undefined): string {
    return poolId === undefined ? "" : (POOL_LABEL_KEYS[poolId] ?? "")
}

/**
 * 取打造类型的界面文案键。
 * @param craftId 打造类型 id（1–7）
 * @returns i18n 键；未知 id 回退空串
 */
export function getCraftLabelKey(craftId: number): string {
    return CRAFT_LABEL_KEYS[craftId] ?? ""
}

/**
 * 取技能类型的界面文案键。
 * @param skillType 上游技能类型（Skill1 / Skill2 / Passive）
 * @returns i18n 键
 */
export function getSkillTypeLabelKey(skillType: string): string {
    return SKILL_TYPE_KEYS[skillType] ?? skillType
}

/**
 * 取槽型展示名（游戏原文，调用方再过 `gt` 翻译）。
 * @param slotId 槽型 id（1–11）
 * @returns 槽型名；未知 id 回退空串
 */
export function getSlotName(slotId: number): string {
    return slots.find(slot => slot.id === slotId)?.name ?? ""
}

/**
 * 取槽型对应的装备位列表。
 * @param slotId 槽型 id
 * @returns 装备位编号（1–16）
 */
export function getEquipPositions(slotId: number): number[] {
    return EQUIP_POSITIONS_BY_SLOT[slotId] ?? []
}

/**
 * 词条属性是否按百分比展示。
 * @param attr 词条属性
 * @returns 百分比展示为 true
 */
export function isPercentAttr(attr: DnaSeasonAffixAttr): boolean {
    return attr.addType === "Rate" || Boolean(attr.isPercent)
}

/** 词条显示数值选项（上游 `FormatAffixAttrUnsignedValue`） */
export interface AffixDisplayOptions {
    /** 0.05 细精度：仅百分比，由区间格式在两端 coarse 文本相同时启用 */
    fine?: boolean
}

/** 与上游 `FormatAffixRoundedNumber` 一致的半格容差 */
const AFFIX_DISPLAY_EPSILON = 1e-6

/**
 * 上游 `FormatAffixRoundedNumber`：取绝对值后 floor + 半格（`[84.5,85) → 84.5`），保留符号。
 * @param value 显示数值（百分比已 ×100）
 * @returns 量化到整数或 .5 的数值
 */
function roundAffixDisplayNumber(value: number): number {
    const magnitude = Math.abs(value)
    const integer = Math.floor(magnitude)
    const rounded = integer + (magnitude - integer + AFFIX_DISPLAY_EPSILON >= 0.5 ? 0.5 : 0)

    return (value < 0 ? -rounded : rounded) || 0
}

/**
 * 上游 `FormatAffixFineNumber` 的量化：百分比 0.05 步进（`floor(abs*20+0.5+1e-8)/20`），保留符号。
 * @param value 显示数值（百分比已 ×100）
 * @returns 量化到 0.05 的数值
 */
function quantizeAffixFineNumber(value: number): number {
    const quantized = Math.floor(Math.abs(value) * 20 + 0.5 + 1e-8) / 20

    return (value < 0 ? -quantized : quantized) || 0
}

/**
 * 词条显示值量化：百分比 ×100 后按上游 0.5 步进（`fine` 时 0.05 步进），固定值保留 2 位小数。
 * @param attr 词条属性
 * @param value 原始数值
 * @param options 显示选项
 * @returns 量化后的显示数值（百分比为 ×100 后的数值，不含单位与正号）
 */
export function quantizeAffixDisplayValue(attr: DnaSeasonAffixAttr, value: number, options: AffixDisplayOptions = {}): number {
    if (!isPercentAttr(attr)) return +value.toFixed(2) || 0
    const scaled = value * 100

    return options.fine ? +quantizeAffixFineNumber(scaled).toFixed(2) || 0 : roundAffixDisplayNumber(scaled)
}

/**
 * 按属性类型格式化词条显示数值（上游 `FormatAffixAttrUnsignedValue`）：
 * 百分比 0.5 步进（`fine` 时 0.05），固定值 2 位小数；正数带 `+`。
 * @param attr 词条属性
 * @param value 原始数值
 * @param options 显示选项
 * @returns 展示文本
 */
export function formatAffixDisplayValue(attr: DnaSeasonAffixAttr, value: number, options: AffixDisplayOptions = {}): string {
    const shown = quantizeAffixDisplayValue(attr, value, options)

    return `${shown >= 0 ? "+" : ""}${shown}${isPercentAttr(attr) ? "%" : ""}`
}

/**
 * 按属性类型格式化数值（属性卡片与范围摘要用，上游 0.5 步进）。
 * @param attr 词条属性
 * @param value 数值
 * @returns 展示文本
 */
export function formatAffixValue(attr: DnaSeasonAffixAttr, value: number): string {
    return formatAffixDisplayValue(attr, value)
}

/**
 * 按属性类型格式化计算器的逐步数值（保留四位小数，便于核对公式）。
 * @param attr 词条属性
 * @param value 数值
 * @returns 展示文本
 */
export function formatCalcValue(attr: DnaSeasonAffixAttr, value: number): string {
    if (!isPercentAttr(attr)) {
        return `${value >= 0 ? "+" : ""}${+value.toFixed(4)}`
    }

    return `${value >= 0 ? "+" : ""}${+(value * 100).toFixed(4)}%`
}

/** 区间两端量化结果：百分比为 ×100 后的数值，`fine` 表示启用了 0.05 细精度 */
export interface AffixRangeValues {
    lower: number
    upper: number
    percent: boolean
    fine: boolean
}

/**
 * 上游 `FormatAffixAttrRangeValue`：两端先 coarse；仅百分比且两端 coarse 文本相同才切 0.05 细精度
 * （`NeedsFineAffixPrecision`），端点不同时 min 向下、max 向上量化。
 * @param attr 词条属性
 * @param minValue 下限
 * @param maxValue 上限
 * @returns 两端显示数值
 */
export function quantizeAffixRangeValues(attr: DnaSeasonAffixAttr, minValue: number, maxValue: number): AffixRangeValues {
    if (!isPercentAttr(attr)) {
        return { lower: +minValue.toFixed(2), upper: +maxValue.toFixed(2), percent: false, fine: false }
    }
    const lowerScaled = minValue * 100
    const upperScaled = maxValue * 100
    const lowerCoarse = roundAffixDisplayNumber(lowerScaled)
    const upperCoarse = roundAffixDisplayNumber(upperScaled)
    if (lowerCoarse !== upperCoarse) return { lower: lowerCoarse, upper: upperCoarse, percent: true, fine: false }
    if (lowerScaled === upperScaled) {
        const value = +quantizeAffixFineNumber(lowerScaled).toFixed(2)

        return { lower: value, upper: value, percent: true, fine: true }
    }
    const lower = +(Math.floor(lowerScaled * 20 + 1e-8) / 20).toFixed(2)
    const upper = +(Math.ceil(upperScaled * 20 - 1e-8) / 20).toFixed(2)

    return { lower, upper, percent: true, fine: true }
}

/**
 * 词条属性数值区间：`min === max`（非随机属性）只显示单值，不写 `x ~ x`。
 * @param attr 词条属性
 * @param minValue 下限
 * @param maxValue 上限
 * @returns 展示文本
 */
export function formatAffixRange(attr: DnaSeasonAffixAttr, minValue: number, maxValue: number): string {
    if (minValue === maxValue) return formatAffixValue(attr, minValue)
    const range = quantizeAffixRangeValues(attr, minValue, maxValue)
    const format = (value: number) => `${value >= 0 ? "+" : ""}${value}${range.percent ? "%" : ""}`

    return `${format(range.lower)} ~ ${format(range.upper)}`
}

/**
 * 无属性类型信息时的原始数值区间（Plan 3 技能等级等），同样按非随机属性折叠为单值。
 * @param minValue 下限
 * @param maxValue 上限
 * @returns 展示文本
 */
export function formatPlainRange(minValue: number, maxValue: number): string {
    const lower = `${+minValue.toFixed(2)}`

    return minValue === maxValue ? lower : `${lower} ~ ${+maxValue.toFixed(2)}`
}

/**
 * 词缀的数值摘要：优先数据属性区间（exact 映射），无属性时回退权威建模数值；多行用 ` · ` 连接。
 * 传入翻译函数时，建模行输出「属性名（含 scope）+ 数值」，列表卡片可直接阅读；缺翻译函数时保持纯数值口径。
 * @param affix 词缀
 * @param translate 可选的界面文案翻译函数（`$t`）
 * @param gameText 可选的游戏原文翻译函数（`gt`）
 * @returns 展示文本；无数据属性且无建模数值时为空串
 */
export function getAffixValueHint(affix: DnaSeasonAffix, translate?: TranscendTranslate, gameText?: (text: string) => string): string {
    const attrs = getAffixAttrs(affix)

    if (attrs.length) {
        return attrs.map(attr => formatAffixRange(attr, affix.minValue, affix.maxValue)).join(" · ")
    }

    return getAffixModeledValues(affix.id)
        .map(item => {
            const value = formatModeledAffixValue(item)

            if (!translate || !gameText) {
                return value
            }

            return `${getModeledValueName(item, translate, gameText)} ${value}`
        })
        .join(" · ")
}

/**
 * Roll 插值：`min == max` 或只有 1 档时取下限，超出档位取上限，
 * 否则在 `[min, max]` 上按 `roll` 线性插值（上游 `DNASeasonAffixValueUtils`）。
 * @param min 下限
 * @param max 上限
 * @param total 档位总数
 * @param roll 当前 roll（1..total）
 * @returns 插值结果
 */
export function stepValue(min: number, max: number, total: number, roll: number): number {
    if (min === max || total <= 1) {
        return min
    }

    if (roll > total) {
        return max
    }

    return min + ((max - min) * (Math.max(roll, 1) - 1)) / (total - 1)
}

/**
 * 应用一次精锻/太古/最终精锻倍率：`value * Multi + Add`，缺省字段视为 ×1 + 0。
 * @param value 输入值
 * @param func 上游倍率函数
 * @returns 输出值
 */
export function applyUpdateFunc(value: number, func: DnaSeasonAffixUpdateFunc | undefined): number {
    return value * (func?.Multi ?? 1) + (func?.Add ?? 0)
}

/** 计算器输入 */
export interface AffixCalcOptions {
    /** roll 档位（1..totalValueLevel） */
    rollLevel: number
    /** 精锻次数（0..10） */
    masterworkLevel: number
    /** 是否太古 */
    ancient: boolean
    /** 是否最终精锻 */
    finalMasterwork: boolean
}

/** 计算器逐步结果 */
export interface AffixCalcResult {
    rollLevel: number
    masterworkLevel: number
    /** Roll 插值结果 */
    rolled: number
    /** 是否按太古取值（基数 = MaxValue × AncientFunc，缺公式时为 MaxValue） */
    ancientApplied: boolean
    /** 太古后的值 */
    afterAncient: number
    /** 精锻 N 次后的值 */
    afterMasterwork: number
    /** 最终精锻是否实际生效 */
    finalApplied: boolean
    /** 最终值 */
    final: number
}

/**
 * 按 R7 顺序计算词条数值：
 * `StepValue → 太古（取 max）→ 精锻 N 次（逐次以上次结果为输入）→ 最终精锻`。
 * 太古基数恒取 `MaxValue × AncientFunc`（缺公式时原样取 `MaxValue`，与 `resolveAffixValue` 同口径）；
 * 最终精锻只在词条自带对应倍率函数时生效。
 * @param affix 词条
 * @param options 计算器输入
 * @returns 逐步结果
 */
export function calculateAffixValue(affix: DnaSeasonAffix, options: AffixCalcOptions): AffixCalcResult {
    const total = Math.max(affix.totalValueLevel, 1)
    const rollLevel = Math.min(Math.max(Math.round(options.rollLevel || 1), 1), total)
    const masterworkLevel = Math.min(Math.max(Math.round(options.masterworkLevel || 0), 0), 10)
    const rolled = stepValue(affix.minValue, affix.maxValue, total, rollLevel)

    const ancientApplied = options.ancient
    const afterAncient = ancientApplied ? applyUpdateFunc(affix.maxValue, affix.ancientFunc) : rolled

    let afterMasterwork = afterAncient
    for (let index = 0; index < masterworkLevel; index++) {
        afterMasterwork = applyUpdateFunc(afterMasterwork, affix.affixUpdatePerLvFunc)
    }

    const finalApplied = options.finalMasterwork && Boolean(affix.maxAffixUpdateFunc)
    const final = finalApplied ? applyUpdateFunc(afterMasterwork, affix.maxAffixUpdateFunc) : afterMasterwork

    return { rollLevel, masterworkLevel, rolled, ancientApplied, afterAncient, afterMasterwork, finalApplied, final }
}

/**
 * 词条可出现的槽型：显式 `slotTypes`（导入期本地建模，技能等级 / 无池随机词条按已知部位映射）优先；
 * 其余按 Plan 1 槽位基础词条、Plan 2/3 淬炼池、Plan 4 唯一装与镶嵌物的引用推导。
 * @param affix 词条
 * @returns 升序槽型 id
 */
export function getAffixSlotIds(affix: DnaSeasonAffix): number[] {
    if (affix.slotTypes?.length) {
        return [...new Set(affix.slotTypes.map(item => Math.round(item)))].sort((left, right) => left - right)
    }

    const ids = new Set<number>()

    for (const slot of slots) {
        if (affix.plan === 1 && slot.baseAffixId === affix.id) {
            ids.add(slot.id)
        }

        if (affix.pool && slot.temperAffixPoolIds?.includes(affix.pool)) {
            ids.add(slot.id)
        }
    }

    for (const equip of uniqueEquips) {
        if (equip.affixId === affix.id) {
            ids.add(equip.slot)
        }
    }

    for (const inlay of inlays) {
        for (const [affixId, slotIds] of Object.entries(inlay.affixIdsBySlot)) {
            if (Number(affixId) === affix.id) {
                for (const slotId of slotIds) {
                    ids.add(slotId)
                }
            }
        }
    }

    return [...ids].sort((left, right) => left - right)
}

/**
 * 词条的界面分类：普通 / 暗金专属 / 宝石 / 数据缺失。
 * 宝石由展平条目的 `gemId` / `socketIndex` 判定；专属按数据表的 `plan === 4`，不维护 affixId 白名单。
 */
export type TranscendAffixUiType = "normal" | "unique" | "gem" | "unknown"

/** 词条实际支持的养成项（全部由数据字段推导） */
export interface TranscendAffixCapabilities {
    type: TranscendAffixUiType
    /** 词条数据是否存在 */
    known: boolean
    /** 是否存在档位区间（totalValueLevel > 1 且 min != max） */
    roll: boolean
    /** 是否有逐级精锻公式 */
    masterwork: boolean
    /** 是否有太古公式 */
    ancient: boolean
    /** 是否有最终精锻公式 */
    finalMasterwork: boolean
    /** 是否至少有一项可编辑 */
    editable: boolean
    /** 数据存在但没有养成项：固定值 */
    fixed: boolean
}

/** 词条数据缓存；数据包换入会替换数组，按引用校验后重建 */
let affixUiMapCache: { source: readonly DnaSeasonAffix[]; map: Map<number, DnaSeasonAffix> } | null = null

/**
 * 取词条 id → 数据的映射（数据包换入后自动重建）。
 * @returns 词条映射
 */
function getAffixUiMap(): Map<number, DnaSeasonAffix> {
    if (!affixUiMapCache || affixUiMapCache.source !== affixes) {
        affixUiMapCache = { source: affixes, map: new Map(affixes.map(affix => [affix.id, affix])) }
    }
    return affixUiMapCache.map
}

/**
 * 按 id 读取词条数据。
 * @param affixId 词条 id
 * @returns 词条数据；缺失时 undefined
 */
export function getAffixById(affixId: number): DnaSeasonAffix | undefined {
    return getAffixUiMap().get(Math.round(affixId))
}

/**
 * 判断词条的界面分类。
 * @param entry 展平条目（含宝石来源字段）
 * @param affix 已查到的词条数据；缺省时按 id 查表
 * @returns 普通 / 专属 / 宝石 / 未知
 */
export function getAffixUiType(
    entry: Pick<TranscendGearEntry, "affixId" | "gemId" | "socketIndex">,
    affix?: DnaSeasonAffix | null
): TranscendAffixUiType {
    if (entry.gemId !== undefined || entry.socketIndex !== undefined) return "gem"
    const data = affix === undefined ? getAffixUiMap().get(entry.affixId) : affix
    if (!data) return "unknown"
    return data.plan === 4 ? "unique" : "normal"
}

/**
 * 按词条数据字段推导可编辑的养成项。
 * 宝石条目的 roll / 精锻 / 太古 / 最终精锻在展平模型里恒为固定值，不提供控件。
 * @param entry 展平条目
 * @param affix 已查到的词条数据；缺省时按 id 查表
 * @returns 分类与能力标记
 */
export function getAffixCapabilities(
    entry: Pick<TranscendGearEntry, "affixId" | "gemId" | "socketIndex">,
    affix?: DnaSeasonAffix | null
): TranscendAffixCapabilities {
    const type = getAffixUiType(entry, affix)
    const data = affix === undefined ? getAffixUiMap().get(entry.affixId) : affix
    const known = Boolean(data)
    if (type === "gem" || !data) {
        return { type, known, roll: false, masterwork: false, ancient: false, finalMasterwork: false, editable: false, fixed: known }
    }
    const roll = data.totalValueLevel > 1 && data.minValue !== data.maxValue
    const masterwork = Boolean(data.affixUpdatePerLvFunc)
    const ancient = Boolean(data.ancientFunc)
    const finalMasterwork = Boolean(data.maxAffixUpdateFunc)
    const editable = roll || masterwork || ancient || finalMasterwork
    return { type, known, roll, masterwork, ancient, finalMasterwork, editable, fixed: !editable }
}

/**
 * 由 BUFF 的结构化来源推导装备词条类型（属性来源列表用）。
 * @param source 数据层写入的 BUFF 来源
 * @returns 装备词条类型；非装备来源返回 null
 */
export function getGearSourceAffixType(
    source: { kind: string; id: number; socketIndex?: number } | null | undefined
): TranscendAffixUiType | null {
    if (source?.kind !== "gear") return null
    if (source.socketIndex !== undefined) return "gem"
    const data = getAffixUiMap().get(source.id)
    if (!data) return "unknown"
    return data.plan === 4 ? "unique" : "normal"
}

/**
 * 词条的固定属性块（Plan 4 被动多为空）。
 * @param affix 词条
 * @returns 属性列表
 */
export function getAffixAttrs(affix: DnaSeasonAffix): DnaSeasonAffixAttr[] {
    return affix.addAttrs ?? []
}

/**
 * 引用该词条的唯一装。
 * @param affixId 词条 id
 * @returns 唯一装列表
 */
export function getAffixUniqueEquips(affixId: number): DnaSeasonUniqueEquip[] {
    return uniqueEquips.filter(equip => equip.affixId === affixId)
}

/**
 * 引用该词条的镶嵌物。
 * @param affixId 词条 id
 * @returns 镶嵌物列表
 */
export function getAffixInlays(affixId: number): DnaSeasonInlay[] {
    return inlays.filter(inlay => Object.keys(inlay.affixIdsBySlot).some(id => Number(id) === affixId))
}

/**
 * 专属 desc-only 词条：Plan 4 且只有描述、没有固定属性块，对应上游专属词缀的「效果」行。
 * attr-only Plan 4（有属性、无描述）不在此列，仍展示官方属性摘要。
 * @param affix 词条
 * @returns 是描述型专属词条为 true
 */
export function isEffectOnlyAffix(affix: Pick<DnaSeasonAffix, "plan" | "desc" | "addAttrs">): boolean {
    return affix.plan === 4 && Boolean(affix.desc) && !affix.addAttrs?.length
}

/**
 * 专属 desc-only 词条的效果文本。
 * 先翻译原文再剥样式标签（`<H>` / `<QuaN>` 等），与 DB 描述区口径一致；非 desc-only 词条返回空串。
 * @param affix 词条
 * @param translate 游戏原文翻译函数（缺省原文）
 * @returns 效果文本；非 desc-only 词条为空串
 */
export function getAffixEffectText(
    affix: Pick<DnaSeasonAffix, "plan" | "desc" | "addAttrs">,
    translate: (text: string | undefined | null) => string = text => text ?? ""
): string {
    if (!isEffectOnlyAffix(affix)) {
        return ""
    }
    return cleanGameMarkup(translate(affix.desc))
}

/**
 * 词条列表卡片摘要的分段：每段都是待翻译的游戏原文，调用方逐段过 `gt` 再拼接。
 * 有属性块时列属性名，手写建模词缀列建模属性名，否则回退描述。
 * @param affix 词条
 * @returns 摘要分段；无可展示内容时为空数组
 */
export function getAffixSummaryParts(affix: DnaSeasonAffix): string[] {
    const attrs = getAffixAttrs(affix)

    if (attrs.length) {
        return attrs.map(attr => attr.attr)
    }

    const modeled = getAffixModeledValues(affix.id)

    if (modeled.length) {
        return modeled.map(item => item.name)
    }

    return affix.desc ? [affix.desc] : []
}

/**
 * 词条列表卡片摘要（原始游戏文本，供搜索匹配）。
 * @param affix 词条
 * @returns 摘要文本
 */
export function getAffixSummary(affix: DnaSeasonAffix): string {
    return getAffixSummaryParts(affix).join(" · ")
}

/**
 * 界面文案键的检索译文：注入函数优先，否则走 i18next 单例（未初始化或缺键时返回 undefined）。
 * @param key 界面文案键
 * @param translateKey 注入的界面文案翻译函数
 * @returns 译文；无法解析时 undefined
 */
function resolveUiKeyText(key: string, translateKey?: (key: string) => string): string | undefined {
    const text = translateKey ? translateKey(key) : i18next.t(key)

    return typeof text === "string" && text.length > 0 && text !== key ? text : undefined
}

/**
 * 词条检索用的正文：描述（含效果原文与样式标签）+ 属性名 + 建模属性名 / 表达式。
 * 列表页的 `summary` 是卡片展示文本，desc-only 专属词条它只剩 desc 原文，
 * 这里补上属性 / 建模 / 数值表达式，让「按属性或效果搜」能命中。
 *
 * 传入 `translate` 时同时收译名与剥标签后的文本：界面展示的是官方译名
 * （如「同律近战暴伤」→「同律近战武器暴击伤害」），只匹配原文会让用户按看到的文字搜不到。
 * 建模数值带 `labelKey` 时（如 320301 三种模式名）额外收当前语言的界面译文，
 * 保证 en/fr 下按界面上看到的模式名能搜到。
 * @param affix 词条
 * @param translate 游戏原文翻译函数（界面里的 `gt`），缺省只收原文
 * @param translateKey 界面文案翻译函数（界面里的 `t`），缺省走 i18next 单例
 * @returns 参与关键词匹配的文本
 */
export function getAffixSearchText(
    affix: DnaSeasonAffix,
    translate?: (text: string) => string,
    translateKey?: (key: string) => string
): string {
    const parts = new Set<string>()

    /** 原文 / 剥标签原文 / 译名 / 剥标签译名都进检索正文 */
    const push = (text: string | undefined): void => {
        if (!text) {
            return
        }

        parts.add(text)
        parts.add(cleanGameMarkup(text))

        const translated = translate?.(text)

        if (translated && translated !== text) {
            parts.add(translated)
            parts.add(cleanGameMarkup(translated))
        }
    }

    push(affix.desc)

    for (const attr of getAffixAttrs(affix)) {
        push(attr.attr)
    }

    for (const item of getAffixModeledValues(affix.id)) {
        push(item.name)
        push(item.labelKey ? resolveUiKeyText(item.labelKey, translateKey) : undefined)
        push(typeof item.value === "string" ? item.value : undefined)
    }

    return [...parts].filter(Boolean).join(" ")
}
