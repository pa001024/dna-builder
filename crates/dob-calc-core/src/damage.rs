//! 伤害结算：统一结算 `calculateDamage` + 技能/武器两个薄包装。
//!
//! 对齐上游 `CharBuild.ts` 的 `calculateDamage`（`DamageCalcOptions`）：
//! - 双爆（暴击/触发期望）按伤害来源（字段归属）结算：有武器面板走武器双爆，
//!   无武器（角色技能）不结算双爆；
//! - 乘区与分量按字段 tag 结算：tag 含「技能」用技能伤害池 + 技能追伤 + 纯元素分量，
//!   含「武器」用武器伤害池（角色增伤 + 武器增伤 + 武器伤害）+ 武器追加伤害 + 武器攻分量；
//! - 无 tag 时按归属回退（有武器→武器池，无武器→技能池）。
//!
//! 两处**不在**这里的乘区需要特别注意：
//! - **防御乘区**由字段层施加（`evaluateSkill` 里 `baseDamage * getDef(...)`），
//!   见 [`crate::ast`]；这里只算到抗性为止；
//! - **充盈乘区**同样由字段层统一施加（覆盖技能与武器两条分支）。
//!
//! 转换池（转属克 / 转属逆 / 转切割 / 转贯穿 / 转震荡 / 转灾厄）是这里最绕的一段：
//! 六者共享同一个比例池，合计超过 100% 时等比重压缩，剩余部分按原始物理/元素比例结算。

use super::attributes::WeaponAttributes;
use super::context::{BuildContext, WeaponRef};
use super::models::AttrMap;

/// 伤害明细；对应上游 `DamageResult`。
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct DamageResult {
    pub lower_crit_no_trigger: f64,
    pub higher_crit_no_trigger: f64,
    pub lower_crit_trigger: f64,
    pub higher_crit_trigger: f64,
    pub lower_crit_expected_trigger: f64,
    pub higher_crit_expected_trigger: f64,
    pub expected_crit_trigger: f64,
    pub expected_crit_no_trigger: f64,
    /// 期望伤害（默认伤害系数）。
    pub expected_damage: f64,
    /// 不含昂扬/背水的伤害。
    pub no_hp_damage: f64,
    /// 物理分量期望伤害。
    pub physical_damage: f64,
    /// 元素分量期望伤害。
    pub element_damage: f64,
}

/// 统一结算选项；对应上游 `DamageCalcOptions`。
#[derive(Debug, Clone, Default)]
pub struct DamageCalcOptions<'a> {
    /// 伤害类型；缺省取武器的伤害类型，无武器时忽略（纯元素结算）。
    pub damage_type: Option<&'a str>,
    /// 字段 tag（用于判定技能/武器乘区与分量）；缺省时按归属回退。
    pub field_tag: Option<&'a [String]>,
    /// 是否按技能乘区结算；缺省按 tag/归属判定。
    pub is_skill_pool: Option<bool>,
    /// 是否召唤物伤害；缺省按 tag 含召唤物判定。
    pub is_summon: Option<bool>,
    /// 技能触发覆盖率（仅技能池 + 有武器时）；缺省 1。
    pub skill_trigger_coverage: Option<f64>,
    /// 攻击细分增伤加成（普攻/蓄力/下落/滑行），调用方经攻击类型加成算好传入。
    pub attack_type_damage_bonus: Option<f64>,
    /// 攻击细分独立增伤加成。
    pub attack_type_independent_bonus: Option<f64>,
    /// 武器独立增伤惩罚因子（仅武器池，如箭雨 -0.6）；缺省 0。
    pub weapon_independent_penalty: Option<f64>,
}

/// 转物理类型关键词（顺序与上游 `physicalConvertKeywords` 一致）。
const PHYSICAL_CONVERT_KEYWORDS: &[&str] = &["转切割", "转贯穿", "转震荡", "转灾厄"];

/// 敌方当前血量类型对应的伤害类型（上游 `hpTypeDMG`）：木桩类怪物无护盾/战姿状态，
/// `currentHPType` 恒为「生命」，故恒为「贯穿」。
const HP_TYPE_DAMAGE: &str = "贯穿";

/// 敌方当前血量类型的触发系数（上游 `hpTypeCoefficients`）。
const HP_TYPE_COEFFICIENT: f64 = 0.5;

/// DOT 来源类型；对应上游 `DotSourceType`。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DotSource {
    Skill,
    Melee,
    Ranged,
    SkillWeapon,
}

/// 单个 DOT 来源的频率分解（求值用字段）；对应上游 `DotSourceConfig`。
#[derive(Debug, Clone)]
pub struct DotSourceFreq {
    pub source: DotSource,
    pub own_freq: f64,
    pub other_freq: f64,
    pub weapon_attack: f64,
    cap: f64,
    effective_freq: f64,
    other_elements: f64,
}

/// 构建单个 DOT 来源配置；对应上游 `calculateDotFrequencies` 内的 `buildSource`。
///
/// 上限 = 1/(0.4×触发)；满足追加伤害条件时频率翻倍（不能超过上限）。
fn build_dot_source(
    source: DotSource,
    trigger: f64,
    freq_setting: f64,
    other_elements: f64,
    has_additional_damage: bool,
    weapon_attack: f64,
) -> DotSourceFreq {
    let hidden = trigger <= 0.0;
    let cap = if hidden { 0.0 } else { 1.0 / (0.4 * trigger) };
    let freq = freq_setting.max(0.0);
    let doubled = !hidden && has_additional_damage;
    DotSourceFreq {
        source,
        own_freq: 0.0,
        other_freq: 0.0,
        weapon_attack,
        cap,
        effective_freq: (freq * if doubled { 2.0 } else { 1.0 }).min(cap),
        other_elements,
    }
}

impl<'a> BuildContext<'a> {
    /// 昂扬乘区；对应上游 `calculateBoostMultiplier`。
    pub fn boost_multiplier(&self, attrs: &AttrMap, hp_percent: Option<f64>) -> f64 {
        let boost = attrs.get("昂扬").copied().unwrap_or(0.0);
        let hp = hp_percent
            .unwrap_or(self.settings.hp_percent)
            .clamp(0.0, 1.0);
        1.0 + boost * hp
    }

    /// 背水乘区；对应上游 `calculateDesperateMultiplier`。
    ///
    /// 公式 `1 + 4 × 背水 × (1 - hp) × (1.5 - hp)`，血量下限钳制到 0.25。
    pub fn desperate_multiplier(&self, attrs: &AttrMap, hp_percent: Option<f64>) -> f64 {
        let desperate = attrs.get("背水").copied().unwrap_or(0.0);
        let hp = hp_percent
            .unwrap_or(self.settings.hp_percent)
            .clamp(0.25, 1.0);
        1.0 + 4.0 * desperate * (1.0 - hp) * (1.5 - hp)
    }

    /// 高等级减伤乘区（怪物等级 ≥ 200 时生效）；对应上游 `calculateLevelReduceRate`。
    fn level_reduce_rate(&self, enemy_level: f64) -> f64 {
        if enemy_level < 200.0 {
            return 1.0;
        }
        1.0 / (1.0 + (enemy_level - 190.0) * 0.05)
    }

    /// 防御乘区；对应上游 `calculateDefenseMultiplier`。
    ///
    /// `is_skill` 为 true 时把「技能无视防御」也算进去。
    pub fn defense_multiplier(
        &self,
        attrs: &AttrMap,
        final_def: Option<f64>,
        is_skill: bool,
    ) -> f64 {
        let enemy_level = if self.enemy.level == 0.0 {
            80.0
        } else {
            self.enemy.level
        };
        let char_level = if self.char.level == 0.0 {
            80.0
        } else {
            self.char.level
        };
        let level_diff = (enemy_level.min(80.0) - char_level).clamp(0.0, 20.0);
        let def = match final_def {
            Some(value) => value,
            None => {
                let ignore = if is_skill {
                    attrs.get("技能无视防御").copied().unwrap_or(0.0)
                        + attrs.get("无视防御").copied().unwrap_or(0.0)
                } else {
                    attrs.get("无视防御").copied().unwrap_or(0.0)
                };
                self.enemy.defense * (1.0 - ignore)
            }
        };
        let damage_reduce = def / (300.0 + def - level_diff * 10.0);
        let multiplier = (1.0 - damage_reduce) * self.level_reduce_rate(enemy_level);
        multiplier.clamp(0.0, 1.0)
    }

    /// 统一伤害结算；对应上游 `calculateDamage`。
    ///
    /// - 双爆（暴击/触发期望）按伤害来源（字段归属）结算：有武器实例 + 武器面板
    ///   才结算双爆（暴击/触发期望），无武器（角色技能）不结算双爆；
    /// - 乘区与分量按字段 tag 结算：tag 含「技能」用技能伤害池 + 技能追伤 + 纯元素分量，
    ///   含「武器」用武器伤害池（角色增伤 + 武器增伤 + 武器伤害）+ 武器追加伤害 + 武器攻分量；
    /// - 无 tag 时按归属回退（有武器→武器池，无武器→技能池）。
    pub fn calculate_damage(
        &self,
        attrs: &WeaponAttributes,
        weapon: Option<WeaponRef>,
        weapon_attr: Option<AttrMap>,
        options: &DamageCalcOptions<'_>,
    ) -> DamageResult {
        crate::prof!("damage::calculate_damage");
        let char_attrs = &attrs.char;
        let panel = weapon_attr.as_ref().or(attrs.panel.as_ref());
        // 归属：有武器实例 + 武器面板才结算双爆（暴击/触发期望）
        let has_weapon = weapon.is_some() && panel.is_some();
        let tag = options.field_tag.as_ref();
        // 乘区、分量口径：显式参数优先，其次按 tag（技能/武器互斥），无 tag 按归属回退
        let is_skill_pool = match options.is_skill_pool {
            Some(value) => value,
            None => match tag {
                Some(tags) if tags.iter().any(|item| item == "技能") => true,
                Some(tags) if tags.iter().any(|item| item == "武器") => false,
                _ => !has_weapon,
            },
        };
        let is_summon = options.is_summon.unwrap_or_else(|| {
            tag.map(|tags| tags.iter().any(|item| item == "召唤物"))
                .unwrap_or(false)
        });
        let damage_type: std::borrow::Cow<'_, str> = match options.damage_type {
            Some(value) => std::borrow::Cow::Borrowed(value),
            None => std::borrow::Cow::Borrowed(
                weapon
                    .map(|item| self.weapon_damage_type(item))
                    .unwrap_or(""),
            ),
        };
        let attack_type_damage_bonus = options.attack_type_damage_bonus.unwrap_or(0.0);
        let attack_type_independent_bonus = options.attack_type_independent_bonus.unwrap_or(0.0);
        let weapon_independent_penalty = options.weapon_independent_penalty.unwrap_or(0.0);
        // 技能池 + 有武器：覆盖率直接作为触发率参与期望（bonus 模型，
        // 调用方按 min(1, 技能触发 + 武器触发) 传入）
        let skill_trigger_coverage = options.skill_trigger_coverage.unwrap_or(1.0);

        let boost = self.boost_multiplier(char_attrs, None);
        let desperate = self.desperate_multiplier(char_attrs, None);
        let imbalance = if self.settings.imbalance {
            char_attrs.get("失衡易伤").copied().unwrap_or(0.0) + 1.5
        } else {
            1.0
        };
        let hp_more = boost * desperate;
        // 属性穿透对所有结算类型整体生效（与原两条路径一致）
        let resistance_penetration =
            (1.0 + char_attrs.get("属性穿透").copied().unwrap_or(0.0)).max(0.0);

        // 增伤池（tag）：技能池吃技能伤害，武器池吃武器增伤 + 武器伤害；
        // 召唤物伤害按 tag 含召唤物叠进基座
        let damage_increase_base = (if is_skill_pool {
            1.0 + char_attrs.get("增伤").copied().unwrap_or(0.0)
                + char_attrs.get("技能伤害").copied().unwrap_or(0.0)
                + if is_summon {
                    char_attrs.get("召唤物伤害").copied().unwrap_or(0.0)
                } else {
                    0.0
                }
        } else {
            1.0 + char_attrs.get("增伤").copied().unwrap_or(0.0)
                + panel
                    .and_then(|item| item.get("增伤").copied())
                    .unwrap_or(0.0)
                + char_attrs.get("武器伤害").copied().unwrap_or(0.0)
        }) + attack_type_damage_bonus;
        let element_increase = char_attrs.get("元素增伤").copied().unwrap_or(0.0);
        let physical_increase = char_attrs.get("物理增伤").copied().unwrap_or(0.0);
        // 独立增伤：技能池吃角色侧 × 技能独立增伤；武器池为角色侧 × 武器侧
        //（除惩罚因子，如箭雨降伤只作用于武器自身攻击）
        let independent = (if is_skill_pool {
            (1.0 + char_attrs.get("独立增伤").copied().unwrap_or(0.0))
                * (1.0 + char_attrs.get("技能独立增伤").copied().unwrap_or(0.0))
        } else {
            ((1.0 + char_attrs.get("独立增伤").copied().unwrap_or(0.0))
                * (1.0
                    + panel
                        .and_then(|item| item.get("独立增伤").copied())
                        .unwrap_or(0.0)))
                / (1.0 + weapon_independent_penalty)
        }) * (1.0 + attack_type_independent_bonus);
        // 追加伤害（tag）：技能池吃技能追伤，武器池吃武器追加伤害
        let additional_damage = if is_skill_pool {
            1.0 + char_attrs.get("技能追伤").copied().unwrap_or(0.0)
        } else {
            1.0 + panel
                .and_then(|item| item.get("追加伤害").copied())
                .unwrap_or(0.0)
        };
        // 召唤物独立增伤：字段 tag 含召唤物时生效
        let summon_independent = if is_summon {
            1.0 + char_attrs.get("召唤物独立增伤").copied().unwrap_or(0.0)
        } else {
            1.0
        };
        let other_more = independent
            * additional_damage
            * summon_independent
            * imbalance
            * resistance_penetration;
        let common_more = hp_more * other_more;
        // per-part 有效增伤：元素分量取元素池，物理分量取物理池，均与增伤基座同池加算
        let part_increase = |settles_element: bool| {
            if settles_element {
                damage_increase_base + element_increase
            } else {
                damage_increase_base + physical_increase
            }
        };

        // 转物理（转切割/转贯穿/转震荡/转灾厄）与转属克/转属逆共享同一转换比例池
        //（原两条路径一致）：合计超过 100% 时等比重压缩，不足时剩余按原始分量结算
        let enemy_resistance = self.settings.enemy_resistance;
        let resistance_factor_of = |resistance: f64| (1.0 - resistance).max(0.0);
        let flipped_resistance: f64 = if enemy_resistance > 0.0 { -4.0 } else { 0.5 };
        let flipped_factor = (1.0 - flipped_resistance).max(0.0);
        let active_element_key = if enemy_resistance > 0.0 {
            Some("转属克")
        } else if enemy_resistance < 0.0 {
            Some("转属逆")
        } else {
            None
        };
        let raw_element_convert = active_element_key
            .and_then(|key| char_attrs.get(key).copied())
            .unwrap_or(0.0)
            .max(0.0);
        let raw_physical_convert: f64 = PHYSICAL_CONVERT_KEYWORDS
            .iter()
            .map(|key| char_attrs.get(key).copied().unwrap_or(0.0).max(0.0))
            .sum();
        let pool_total = raw_element_convert + raw_physical_convert;
        let convert_scale = if pool_total > 1.0 {
            1.0 / pool_total
        } else {
            1.0
        };
        let unconverted = (1.0 - pool_total.min(1.0)).max(0.0);

        // 双爆（归属）：仅有武器面板时结算暴击档位与触发率；
        // 技能池的触发按 bonus 模型结算：未触发部分按 1 倍，触发部分按 (1 + bonus)，
        // 期望 = base × (1 + bonus × 覆盖率)，
        // 覆盖率 = min(1, 技能触发 + 武器触发)，不再重写面板触发区
        // 双爆初值（无武器归属时即最终值）；有武器面板时按面板重算
        let (lower_crit_damage, higher_crit_damage, crit_expected_damage, trigger_rate) =
            if has_weapon {
                let crit_panel = panel.expect("has_weapon 蕴含 panel 存在");
                let rate = crit_panel.get("暴击").copied().unwrap_or(0.0);
                let damage = crit_panel.get("暴伤").copied().unwrap_or(0.0);
                let lower = (damage - 1.0) * rate.floor() + 1.0;
                let higher = (damage - 1.0) * rate.ceil() + 1.0;
                let expected = 1.0 + rate * (damage - 1.0);
                // 触发率数值允许溢出但触发效果按 100% 封顶；负值钳制为 0，
                // 避免触发期望溢出为负导致伤害归零；
                // 技能池的触发率即调用方传入的覆盖率（武器面板触发 + 技能触发后封顶），
                // 按 bonus 模型进入期望
                let trigger = if is_skill_pool {
                    skill_trigger_coverage
                } else {
                    crit_panel
                        .get("触发")
                        .copied()
                        .unwrap_or(0.0)
                        .clamp(0.0, 1.0)
                };
                (lower, higher, expected, trigger)
            } else {
                // 无武器归属：仅转灾厄转换分量结算触发（灾厄触发只需敌方存在抗性，
                // 不依赖武器面板），按技能触发率；其余分量的 triggerAdd 均为 0，
                // 该值不影响它们（上游同口径）。
                (
                    1.0,
                    1.0,
                    1.0,
                    char_attrs
                        .get("技能触发")
                        .copied()
                        .unwrap_or(0.0)
                        .clamp(0.0, 1.0),
                )
            };

        // 触发倍率：物理伤害类型按敌方当前血量类型结算，灾厄类型需敌方存在抗性才可触发
        let trigger_multiplier = |kind: &str| -> f64 {
            if kind == "灾厄" {
                return if self.settings.enemy_resistance != 0.0 {
                    1.0 + self.total_bonus("触发倍率", "角色", true)
                } else {
                    0.0
                };
            }
            let hp_type = HP_TYPE_DAMAGE;
            if kind == hp_type {
                HP_TYPE_COEFFICIENT + self.total_bonus("触发倍率", "角色", true)
            } else {
                0.0
            }
        };

        // 分量（tag）：武器池 + 有面板走武器攻分量（角色攻击/武器攻击占比）；
        // 其余（技能池、无面板回退）走纯元素基座；
        // 灾厄转化（原武器路径口径，武器归属时生效）：转为纯物理分量，不吃抗性，
        // 按物理类型触发规则结算；
        // inherit + atk=all 的同律武器保持纯元素结算；无武器归属（角色技能）
        // 沿用原技能路径的纯元素结算。
        let inherit_all_skill_weapon = weapon == Some(WeaponRef::Skill)
            && self
                .skill_weapon
                .as_ref()
                .map(|item| item.inherit.is_some() && item.atk.as_deref() == Some("all"))
                .unwrap_or(false);
        let calamity_physical = has_weapon && damage_type == "灾厄" && !inherit_all_skill_weapon;
        // 分量：(结算前系数, 抗性因子, 触发加成, 是否元素结算)。
        // 上限 = 武器分流 2 + 属克属逆 2 + 转物理 4×2 = 12，栈数组零分配。
        let mut parts: [(f64, f64, f64, bool); 12] = [(0.0, 0.0, 0.0, false); 12];
        let mut part_count = 0usize;
        macro_rules! push_part {
            ($entry:expr) => {{
                debug_assert!(part_count < parts.len(), "伤害分量超过 12 上限");
                if part_count < parts.len() {
                    parts[part_count] = $entry;
                    part_count += 1;
                }
            }};
        }
        let use_weapon_split = !is_skill_pool && has_weapon;
        if use_weapon_split {
            let split_panel = panel.expect("use_weapon_split 蕴含 panel 存在");
            let char_attack = char_attrs.get("攻击").copied().unwrap_or(0.0);
            let weapon_attack = split_panel.get("攻击").copied().unwrap_or(0.0);
            let total_attack = char_attack + weapon_attack;
            // inherit + atk=all 的同律武器保持纯元素结算，不能被继承的灾厄类型转为物理分量
            let convert_elemental_to_physical = damage_type == "灾厄" && !inherit_all_skill_weapon;
            let weapon_damage_physical = if convert_elemental_to_physical {
                1.0
            } else if inherit_all_skill_weapon || total_attack == 0.0 {
                0.0
            } else {
                weapon_attack / total_attack
            };
            let weapon_damage_elemental = if convert_elemental_to_physical {
                0.0
            } else if inherit_all_skill_weapon {
                1.0
            } else if total_attack == 0.0 {
                0.0
            } else {
                char_attack / total_attack
            };
            // 元素转换的有效比例（经统一池压缩后）决定属克/属逆元素的抗性翻转程度，
            // 保证压缩前后抗性一致
            let element_convert_ratio = raw_element_convert.min(1.0) * convert_scale;
            let resistance = {
                let resistance = enemy_resistance;
                if resistance == 0.0 {
                    resistance_factor_of(0.0)
                } else if resistance < 0.0 {
                    (1.0 - element_convert_ratio) * resistance_factor_of(resistance)
                        + element_convert_ratio * resistance_factor_of(0.5)
                } else {
                    (1.0 - element_convert_ratio) * resistance_factor_of(resistance)
                        + element_convert_ratio * resistance_factor_of(-4.0)
                }
            };
            let elemental_part = weapon_damage_elemental * resistance;
            let physical_base = weapon_damage_physical;
            if inherit_all_skill_weapon {
                // 同律 inherit+atk=all：纯元素伤害，无物理分量、不吃触发加成
                //（触发倍率仅按物理伤害类型结算）
                if unconverted > 0.0 {
                    push_part!((elemental_part * unconverted, 1.0, 0.0, true));
                }
            } else {
                // 未转换的物理部分（原物理类型，按原始伤害类型触发）；
                // 未转换的元素部分（原元素类型，无触发）
                if physical_base > 0.0 && unconverted > 0.0 {
                    push_part!((
                        physical_base * unconverted,
                        1.0,
                        trigger_multiplier(damage_type.as_ref()),
                        false
                    ));
                }
                if unconverted > 0.0 {
                    push_part!((elemental_part * unconverted, 1.0, 0.0, true));
                }
            }
            if let Some(key) = active_element_key {
                let ratio = char_attrs.get(key).copied().unwrap_or(0.0).max(0.0) * convert_scale;
                if ratio > 0.0 {
                    // 转属克/转属逆：物理→属克/属逆元素（翻转抗性结算、无触发）；
                    // 元素分量已实现翻转，直接计入元素
                    if !inherit_all_skill_weapon && physical_base > 0.0 {
                        push_part!((physical_base * ratio, flipped_factor, 0.0, true));
                    }
                    push_part!((elemental_part * ratio, 1.0, 0.0, true));
                }
            }
            for key in PHYSICAL_CONVERT_KEYWORDS {
                let ratio = char_attrs.get(key).copied().unwrap_or(0.0).max(0.0) * convert_scale;
                if ratio <= 0.0 {
                    continue;
                }
                // 转切割/转贯穿/转震荡/转灾厄：物理 + 元素一并转为对应物理子类，
                // 按物理类型触发规则结算
                let trigger_add = trigger_multiplier(&key[3..]);
                if inherit_all_skill_weapon {
                    push_part!((elemental_part * ratio, 1.0, trigger_add, false));
                } else {
                    if physical_base > 0.0 {
                        push_part!((physical_base * ratio, 1.0, trigger_add, false));
                    }
                    push_part!((elemental_part * ratio, 1.0, trigger_add, false));
                }
            }
        } else {
            // 技能分量：纯元素基座（技能伤害默认按纯元素结算，元素分量吃元素增伤）；
            // 经转物理转换出的分量按对应物理子类结算（吃物理增伤，不受敌人元素抗性影响）。
            // 触发（归属）：有武器面板时按武器规则结算触发 bonus
            //（如灾厄伤害抗性存在时全额触发），rate = 1 全额结算后再由
            // skillTriggerCoverage 显式折算；无武器归属（角色技能）不结算触发。
            let skill_trigger_add = if has_weapon {
                trigger_multiplier(damage_type.as_ref())
            } else {
                0.0
            };
            if calamity_physical {
                // 灾厄转化：纯物理基座，不吃抗性（原武器路径口径）；
                // 转属克/转属逆部分按翻转抗性计入元素
                if unconverted > 0.0 {
                    push_part!((unconverted, 1.0, skill_trigger_add, false));
                }
                if let Some(key) = active_element_key {
                    let ratio =
                        char_attrs.get(key).copied().unwrap_or(0.0).max(0.0) * convert_scale;
                    if ratio > 0.0 {
                        push_part!((ratio, flipped_factor, 0.0, true));
                    }
                }
            } else {
                if unconverted > 0.0 {
                    push_part!((
                        unconverted,
                        resistance_factor_of(enemy_resistance),
                        skill_trigger_add,
                        true
                    ));
                }
                if let Some(key) = active_element_key {
                    let ratio =
                        char_attrs.get(key).copied().unwrap_or(0.0).max(0.0) * convert_scale;
                    if ratio > 0.0 {
                        push_part!((ratio, flipped_factor, skill_trigger_add, true));
                    }
                }
            }
            for key in PHYSICAL_CONVERT_KEYWORDS {
                let ratio = char_attrs.get(key).copied().unwrap_or(0.0).max(0.0) * convert_scale;
                if ratio <= 0.0 {
                    continue;
                }
                // 转灾厄无武器归属时也结算灾厄触发（只需敌方存在抗性）；
                // 其余物理子类仍需武器归属（上游同口径）。
                let trigger_add = if has_weapon {
                    trigger_multiplier(&key[3..])
                } else if *key == "转灾厄" {
                    trigger_multiplier("灾厄")
                } else {
                    0.0
                };
                push_part!((ratio, 1.0, trigger_add, false));
            }
        }

        // 单趟累加 5 个池：每池的元素加法顺序与原 5 趟完全一致，浮点逐位不变。
        let mut no_trigger_part = 0.0f64;
        let mut expected_trigger_part = 0.0f64;
        let mut full_trigger_part = 0.0f64;
        let mut physical_expected = 0.0f64;
        let mut element_expected = 0.0f64;
        for (ratio, resistance, trigger, settles) in parts.iter().take(part_count) {
            let base = ratio * resistance;
            let increase = part_increase(*settles);
            no_trigger_part += base * increase;
            let expected = base * (1.0 + trigger * trigger_rate) * increase;
            expected_trigger_part += expected;
            full_trigger_part += base * (1.0 + trigger) * increase;
            if *settles {
                element_expected += expected;
            } else {
                physical_expected += expected;
            }
        }

        let expected_crit_no_trigger_base = crit_expected_damage * common_more;
        DamageResult {
            lower_crit_no_trigger: no_trigger_part * lower_crit_damage * common_more,
            higher_crit_no_trigger: no_trigger_part * higher_crit_damage * common_more,
            lower_crit_trigger: full_trigger_part * lower_crit_damage * common_more,
            higher_crit_trigger: full_trigger_part * higher_crit_damage * common_more,
            lower_crit_expected_trigger: expected_trigger_part * lower_crit_damage * common_more,
            higher_crit_expected_trigger: expected_trigger_part * higher_crit_damage * common_more,
            expected_crit_trigger: expected_trigger_part * expected_crit_no_trigger_base,
            expected_crit_no_trigger: no_trigger_part * expected_crit_no_trigger_base,
            expected_damage: expected_trigger_part * expected_crit_no_trigger_base,
            no_hp_damage: expected_trigger_part * crit_expected_damage * other_more,
            // 物理/元素分量期望伤害（按结算类型拆分；
            // 转属克/转属逆转换到元素的部分计入元素）
            physical_damage: physical_expected * expected_crit_no_trigger_base,
            element_damage: element_expected * expected_crit_no_trigger_base,
        }
    }

    /// 计算技能伤害（统一结算的角色技能口径：无武器归属，
    /// 乘区/分量按字段 tag 回退为技能池）；对应上游 `calculateSkillDamage`。
    ///
    /// 召唤物伤害按字段 tag 判断：字段 tag 含「召唤物」即视为召唤物伤害，
    /// 不再依赖字段名或技能声明。
    pub fn calculate_skill_damage(
        &self,
        attrs: &AttrMap,
        base_name: &str,
        field_name: Option<&str>,
        skill_context: Option<&super::models::LeveledSkill>,
    ) -> DamageResult {
        let skill = match skill_context {
            Some(skill) => Some(skill),
            None => self
                .all_skills()
                .find(|skill| skill.name == base_name),
        };
        let field_tag = skill
            .and_then(|skill| field_name.and_then(|name| skill.field(name)))
            .map(|field| field.tags.as_slice());
        let is_summon = field_tag
            .map(|tags| tags.iter().any(|tag| tag == "召唤物"))
            .unwrap_or(false);
        let wrapped = WeaponAttributes {
            char: attrs.clone(),
            panel: None,
            weapon: None,
        };
        self.calculate_damage(
            &wrapped,
            None,
            None,
            &DamageCalcOptions {
                field_tag,
                is_summon: Some(is_summon),
                ..Default::default()
            },
        )
    }

    /// 计算武器伤害（统一结算的武器口径：武器归属双爆，武器池乘区分量）；
    /// 对应上游 `calculateWeaponDamage`。
    ///
    /// `damage_type` 为 `None` 时取武器自身伤害类型。
    pub fn calculate_weapon_damage(
        &self,
        attrs: &WeaponAttributes,
        weapon: WeaponRef,
        damage_type: Option<&str>,
    ) -> DamageResult {
        self.calculate_damage(
            attrs,
            Some(weapon),
            None,
            &DamageCalcOptions {
                damage_type,
                is_skill_pool: Some(false),
                is_summon: Some(false),
                ..Default::default()
            },
        )
    }

    /// 武器伤害类型（借用版本，无分配）。
    fn weapon_damage_type(&self, weapon: WeaponRef) -> &str {
        match weapon {
            WeaponRef::Skill => self
                .skill_weapon
                .as_ref()
                .map(|item| item.damage_type.as_str())
                .unwrap_or(""),
            WeaponRef::Ranged => &self.ranged_weapon.damage_type,
            _ => &self.melee_weapon.damage_type,
        }
    }

    /// DOT 频率分解（技能 / 近战 / 远程 / 同律四来源）；
    /// 对应上游 `calculateDotFrequencies`。
    ///
    /// 返回按「技能 → 近战 → 远程 → 同律」顺序的来源表（含上限共享后的
    /// 自身频率 / 其余属性频率 / 结算用武器攻击）。
    pub fn dot_frequencies(&mut self) -> Vec<DotSourceFreq> {
        crate::prof!("damage::dot_frequencies");
        if let Some((version, cached)) = &self.dot_cache
            && *version == self.memo.version
        {
            return (**cached).clone();
        }
        // 状态在计算过程中可能继续收敛（nocode 属性首次计算会触发条件/attr 收敛），
        // 收敛前的结果不落缓存：整段重算直到版本不再变化（兜底 4 轮）。
        let mut last: Vec<DotSourceFreq> = Vec::new();
        for _ in 0..4 {
            let start_version = self.memo.version;
            let attrs = self.attrs();
            let melee_panel = self
                .calculate_weapon_attributes(Some(super::context::WeaponRef::Melee))
                .panel
                .unwrap_or_default();
            let ranged_panel = self
                .calculate_weapon_attributes(Some(super::context::WeaponRef::Ranged))
                .panel
                .unwrap_or_default();
            let skill_panel = self
                .calculate_weapon_attributes(Some(super::context::WeaponRef::Skill))
                .panel
                .unwrap_or_default();
            // 异常数量属性（去重后元素种数）；无 buff 时为 1。
            let anomaly_count = attrs.get("异常数量").copied().unwrap_or(1.0).max(1.0);
            // 其余属性元素种数 = n-1（n 为去重后异常数量）；异常数量为 1 时无其余属性。
            let other_elements = if anomaly_count <= 1.0 {
                0.0
            } else {
                anomaly_count - 1.0
            };
            let is_light_or_dark = self.char.element == "光" || self.char.element == "暗";
            let mod_additional: f64 = self
                .iter_mods()
                .filter_map(|item| item.add_attr_value("追加伤害"))
                .sum();
            let total_additional = self.total_bonus("追加伤害", "角色", true);
            let has_additional = self.settings.dot_settings.force_own_additional_damage
                || (if is_light_or_dark {
                    mod_additional > 0.0
                } else {
                    total_additional > 0.0
                });
            let dot = &self.settings.dot_settings;
            let mut sources = vec![
                build_dot_source(
                    DotSource::Skill,
                    attrs.get("技能触发").copied().unwrap_or(0.0).max(0.0),
                    dot.skill,
                    0.0,
                    has_additional,
                    0.0,
                ),
                build_dot_source(
                    DotSource::Melee,
                    melee_panel
                        .get("触发")
                        .copied()
                        .unwrap_or(0.0)
                        .clamp(0.0, 1.0),
                    dot.melee,
                    other_elements,
                    has_additional,
                    melee_panel.get("攻击").copied().unwrap_or(0.0),
                ),
                build_dot_source(
                    DotSource::Ranged,
                    ranged_panel
                        .get("触发")
                        .copied()
                        .unwrap_or(0.0)
                        .clamp(0.0, 1.0),
                    dot.ranged,
                    other_elements,
                    has_additional,
                    ranged_panel.get("攻击").copied().unwrap_or(0.0),
                ),
                build_dot_source(
                    DotSource::SkillWeapon,
                    skill_panel
                        .get("触发")
                        .copied()
                        .unwrap_or(0.0)
                        .clamp(0.0, 1.0),
                    dot.skillweapon,
                    other_elements,
                    has_additional,
                    skill_panel.get("攻击").copied().unwrap_or(0.0),
                ),
            ];
            // 角色自身属性 DOT 共享上限 = 各来源上限最大值；技能→近战→远程→同律依次填充。
            let cap = sources.iter().map(|source| source.cap).fold(0.0, f64::max);
            let mut remaining = cap;
            for source in sources.iter_mut() {
                source.own_freq = source.effective_freq.min(remaining);
                remaining -= source.own_freq;
                // 其余属性 DOT：仅武器来源，技能来源不产生其余属性。
                source.other_freq = if source.source == DotSource::Skill {
                    0.0
                } else {
                    source.effective_freq * source.other_elements
                };
            }
            if self.memo.version == start_version {
                self.dot_cache = Some((start_version, std::sync::Arc::new(sources.clone())));
                return sources;
            }
            last = sources;
        }
        // 兜底：极端状态震荡（4 轮仍未收敛）时返回最后一次结果，不落缓存。
        last
    }

    /// DOT 抗性区（含转属克/转属逆）；对应上游 `getResistanceFactor`。
    fn dot_resistance_factor(&self, attrs: &AttrMap) -> f64 {
        let factor = |resistance: f64| (1.0 - resistance).max(0.0);
        let enemy_resistance = self.settings.enemy_resistance;
        if enemy_resistance == 0.0 {
            return factor(0.0);
        }
        if enemy_resistance < 0.0 {
            // 负抗：只有转属逆生效（负抗 → 等效正抗 0.5）。
            let convert = attrs.get("转属逆").copied().unwrap_or(0.0).clamp(0.0, 1.0);
            return (1.0 - convert) * factor(enemy_resistance) + convert * factor(0.5);
        }
        // 正抗：只有转属克生效（正抗 → 等效负抗 -4）。
        let convert = attrs.get("转属克").copied().unwrap_or(0.0).clamp(0.0, 1.0);
        (1.0 - convert) * factor(enemy_resistance) + convert * factor(-4.0)
    }

    /// 其余属性 DOT 的抗性反转等效因子；对应上游 `getOtherDotResistanceFactor`。
    fn other_dot_resistance_factor(&self, attrs: &AttrMap, sources: &[DotSourceFreq]) -> f64 {
        // 其余属性种数取武器来源（技能来源不参与其余属性）。
        let other_count = sources
            .iter()
            .filter(|source| source.source != DotSource::Skill)
            .map(|source| source.other_elements)
            .fold(0.0, f64::max);
        let normal = self.dot_resistance_factor(attrs).max(0.0);
        let enemy_resistance = self.settings.enemy_resistance;
        if enemy_resistance == 0.0 || other_count <= 0.0 {
            return normal;
        }
        if enemy_resistance < 0.0 {
            // 负抗：全部其余属性按翻转抗性 0.5。
            return (1.0f64 - 0.5).max(0.0);
        }
        // 正抗：其中一种其余属性做 -4，其余保持原抗性。
        ((1.0f64 - -4.0).max(0.0) + normal * (other_count - 1.0)) / other_count
    }

    /// 每秒 DOT 伤害；对应上游 `calculateDotDamage`。
    ///
    /// `namespace`：空为全部来源；`角色` 取技能分量，`近战` / `远程` / `同律`
    ///（及英文别名）取对应武器分量；未命中时为 0。
    pub fn dot_damage(&mut self, namespace: Option<&str>) -> f64 {
        crate::prof!("damage::dot_damage");
        let sources = self.dot_frequencies();
        let attrs = self.attrs();
        let selected: Vec<&DotSourceFreq> = match namespace {
            None => sources.iter().collect(),
            Some("角色") | Some("char") | Some("character") => sources
                .iter()
                .filter(|source| source.source == DotSource::Skill)
                .collect(),
            Some("melee") | Some("近战") => sources
                .iter()
                .filter(|source| source.source == DotSource::Melee)
                .collect(),
            Some("ranged") | Some("远程") => sources
                .iter()
                .filter(|source| source.source == DotSource::Ranged)
                .collect(),
            Some("skillweapon") | Some("同律") => sources
                .iter()
                .filter(|source| source.source == DotSource::SkillWeapon)
                .collect(),
            _ => Vec::new(),
        };
        // 抗性区含属性穿透（与技能伤害结算一致）。
        let penetration = 1.0 + attrs.get("属性穿透").copied().unwrap_or(0.0);
        let own_zone = (self.dot_resistance_factor(&attrs) * penetration).max(0.0);
        let other_zone = self.other_dot_resistance_factor(&attrs, &sources) * penetration;
        // 昂扬/背水乘区与技能伤害共用同一结算。
        let hp_more = self.boost_multiplier(&attrs, None) * self.desperate_multiplier(&attrs, None);
        let fullness_multiplier = 1.0 + attrs.get("充盈威力").copied().unwrap_or(0.0);
        let damage_increase = 1.0 + attrs.get("增伤").copied().unwrap_or(0.0);
        let attack = attrs.get("攻击").copied().unwrap_or(0.0);
        let mut total = 0.0;
        for source in selected {
            let base = (attack + source.weapon_attack)
                * 0.2
                * 6.0
                * 4.0
                * fullness_multiplier
                * damage_increase
                * hp_more;
            total += base * (source.own_freq * own_zone + source.other_freq * other_zone);
        }
        total
    }
}
