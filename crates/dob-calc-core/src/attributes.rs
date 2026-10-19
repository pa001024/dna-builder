//! 属性汇总：`calculateAttributes` 与 `calculateWeaponAttributes` 的移植。
//!
//! 这是整个构筑求值里最容易出的地方——数值全部由这一段决定，因此每个乘区、
//! 每次取整、每处 `Math.min` 上限都逐条对齐上游 `CharBuild.ts` L1089-1589。
//!
//! 三处「看起来多余但必须保留」的细节：
//! 1. `Math.round(x * 100) / 100`：攻击力两位小数截断，链式乘算后会显出差异；
//! 2. `技能效益` 上限 1.75、`技能范围` 上限 2.8、`技能耐久` 上限 4；
//! 3. `有效生命 = (生命 / (1 - 防御/(300+防御)) + 护盾) / (1 - 减伤)`。

use std::borrow::Cow;
use std::collections::HashMap;

use super::context::{BuildContext, WeaponRef, base_map, prefix_scope, run_dynamic_buff};
use super::models::{
    AttrMap, BuffFieldConditional, EffectCodeBuff, is_multiplicative_attr, round2, round3,
};

/// 武器属性汇总结果；对应上游 `CharAttr & { weapon?: WeaponAttr }`。
///
/// 上游把武器面板塞在同一个对象的 `weapon` 键上，这里拆成两个表：
/// 角色侧属性按名字取，武器面板单独一张，避免「键名撞车」与拼前缀取值。
#[derive(Debug, Clone, Default)]
pub struct WeaponAttributes {
    /// 角色属性（含 `充盈威力` 等经武器转化后的最终值）。
    pub char: AttrMap,
    /// 当前武器面板；无武器时为 `None`。
    pub panel: Option<AttrMap>,
    /// 本结果对应的武器引用。
    pub weapon: Option<WeaponRef>,
}

/// 「金色系」MOD 系列（`属性MOD属性` 词条只作用于这些系列）。
const ELEMENT_SERIES: &[&str] = &["狮鹫", "百首", "契约者", "换生灵"];
/// 拼接前缀属性键（如 `近战攻击`、`暗MOD属性`）；命中静态表时零分配，未命中则回退到拼接。
///
/// 覆盖本文件实际用到的全部 `(前缀, 基名)` 组合：武器前缀（`近战`/`远程`/
/// `同律近战`/`同律远程`）× 12 种武器基名，以及 6 种元素 × `MOD属性`；
/// 其余组合走 `format!` 回退分支，行为与原来逐处拼接完全一致。
fn prefixed<'a>(prefix: &'a str, base: &'static str) -> Cow<'a, str> {
    match (prefix, base) {
        ("近战", "攻击") => Cow::Borrowed("近战攻击"),
        ("近战", "暴击") => Cow::Borrowed("近战暴击"),
        ("近战", "暴伤") => Cow::Borrowed("近战暴伤"),
        ("近战", "触发") => Cow::Borrowed("近战触发"),
        ("近战", "攻速") => Cow::Borrowed("近战攻速"),
        ("近战", "多重") => Cow::Borrowed("近战多重"),
        ("近战", "增伤") => Cow::Borrowed("近战增伤"),
        ("近战", "装填") => Cow::Borrowed("近战装填"),
        ("近战", "弹匣") => Cow::Borrowed("近战弹匣"),
        ("近战", "弹药") => Cow::Borrowed("近战弹药"),
        ("近战", "武器倍率") => Cow::Borrowed("近战武器倍率"),
        ("近战", "独立增伤") => Cow::Borrowed("近战独立增伤"),
        ("远程", "攻击") => Cow::Borrowed("远程攻击"),
        ("远程", "暴击") => Cow::Borrowed("远程暴击"),
        ("远程", "暴伤") => Cow::Borrowed("远程暴伤"),
        ("远程", "触发") => Cow::Borrowed("远程触发"),
        ("远程", "攻速") => Cow::Borrowed("远程攻速"),
        ("远程", "多重") => Cow::Borrowed("远程多重"),
        ("远程", "增伤") => Cow::Borrowed("远程增伤"),
        ("远程", "装填") => Cow::Borrowed("远程装填"),
        ("远程", "弹匣") => Cow::Borrowed("远程弹匣"),
        ("远程", "弹药") => Cow::Borrowed("远程弹药"),
        ("远程", "武器倍率") => Cow::Borrowed("远程武器倍率"),
        ("远程", "独立增伤") => Cow::Borrowed("远程独立增伤"),
        ("同律近战", "攻击") => Cow::Borrowed("同律近战攻击"),
        ("同律近战", "暴击") => Cow::Borrowed("同律近战暴击"),
        ("同律近战", "暴伤") => Cow::Borrowed("同律近战暴伤"),
        ("同律近战", "触发") => Cow::Borrowed("同律近战触发"),
        ("同律近战", "攻速") => Cow::Borrowed("同律近战攻速"),
        ("同律近战", "多重") => Cow::Borrowed("同律近战多重"),
        ("同律近战", "增伤") => Cow::Borrowed("同律近战增伤"),
        ("同律近战", "装填") => Cow::Borrowed("同律近战装填"),
        ("同律近战", "弹匣") => Cow::Borrowed("同律近战弹匣"),
        ("同律近战", "弹药") => Cow::Borrowed("同律近战弹药"),
        ("同律近战", "武器倍率") => Cow::Borrowed("同律近战武器倍率"),
        ("同律近战", "独立增伤") => Cow::Borrowed("同律近战独立增伤"),
        ("同律远程", "攻击") => Cow::Borrowed("同律远程攻击"),
        ("同律远程", "暴击") => Cow::Borrowed("同律远程暴击"),
        ("同律远程", "暴伤") => Cow::Borrowed("同律远程暴伤"),
        ("同律远程", "触发") => Cow::Borrowed("同律远程触发"),
        ("同律远程", "攻速") => Cow::Borrowed("同律远程攻速"),
        ("同律远程", "多重") => Cow::Borrowed("同律远程多重"),
        ("同律远程", "增伤") => Cow::Borrowed("同律远程增伤"),
        ("同律远程", "装填") => Cow::Borrowed("同律远程装填"),
        ("同律远程", "弹匣") => Cow::Borrowed("同律远程弹匣"),
        ("同律远程", "弹药") => Cow::Borrowed("同律远程弹药"),
        ("同律远程", "武器倍率") => Cow::Borrowed("同律远程武器倍率"),
        ("同律远程", "独立增伤") => Cow::Borrowed("同律远程独立增伤"),
        ("暗", "MOD属性") => Cow::Borrowed("暗MOD属性"),
        ("光", "MOD属性") => Cow::Borrowed("光MOD属性"),
        ("水", "MOD属性") => Cow::Borrowed("水MOD属性"),
        ("火", "MOD属性") => Cow::Borrowed("火MOD属性"),
        ("雷", "MOD属性") => Cow::Borrowed("雷MOD属性"),
        ("风", "MOD属性") => Cow::Borrowed("风MOD属性"),
        (prefix, base) => Cow::Owned(format!("{prefix}{base}")),
    }
}

impl<'a> BuildContext<'a> {
    /// 角色属性汇总；对应上游 `calculateAttributes(nocode, attrApplied)`。
    ///
    /// 递归语义逐字对照（spec §6.4(3)）：
    /// ```ts
    /// if (this.applyCondition(attrs, condMods)) return this.calculateAttributes(nocode)
    /// if (!attrApplied && this.applyBuffAttr(attrs)) return this.calculateAttributes(nocode, true)
    /// if (nocode) return attrs
    /// // …全局 code 施加…
    /// return attrs
    /// ```
    /// 终止条件（上游隐含）：`applyCondition`/`applyBuffAttr` 返回 false 即停；
    /// 每次重算都从「回到入口重算整份」开始，而不是在已算表上增量打补丁；
    /// `attrApplied=true` 的那一轮不再刷新 attr（掐断 `attr→属性→attr` 互触发），
    /// 但条件变更仍可再触发整份重算。有限状态（MOD 条件开/关 × attr 值收敛）
    /// 保证终止；病态 code 循环由 `dynamic` 解释器侧的步数上限兜底。
    ///
    /// `nocode` 为 true 时跳过 `code` 动态 BUFF（武器侧复用角色属性时用）。
    /// `attr_applied` 用于避免 `attr` 刷新与条件重算的无限递归（上游同款参数）。
    pub fn calculate_attributes(&mut self, nocode: bool, attr_applied: bool) -> AttrMap {
        let key = self.memo_key(nocode as u8 | (attr_applied as u8) << 1);
        let version = self.memo.version;
        let slot = super::context::memo_slot(key);
        if let Some((v, hit)) = self.memo.attrs[slot].as_ref()
            && *v == version
        {
            return hit.clone();
        }
        let result = self.calculate_attributes_uncached(nocode, attr_applied);
        if self.memo.version == version {
            self.memo.attrs[slot] = Some((version, result.clone()));
        }
        result
    }

    /// 记忆键：调用参数 + 会影响嵌套求值的上下文标志。
    pub(crate) fn memo_key(&self, args: u8) -> u8 {
        // 条件BUFF缓存是否已建不影响属性结果本身；把它编进键会让「先算属性、
        // 后建条件缓存」的常规顺序白算一整份。只保留会改变嵌套求值的重入标志。
        args | (self.scoped_code_computing as u8) << 4
    }

    fn calculate_attributes_uncached(&mut self, nocode: bool, attr_applied: bool) -> AttrMap {
        let attrs = self.base_attributes_cached(attr_applied);
        if nocode {
            return attrs;
        }
        self.apply_dynamic_buffs(attrs)
    }

    /// `code` 之前的属性基座（条件 MOD / BUFF attr 收敛后）。
    ///
    /// `nocode` 变体在旧实现里各算一遍基座，两边逐位相同；这里按
    /// `attr_applied + 重入标志` 单独记忆，`code` 施加放在外层。
    fn base_attributes_cached(&mut self, attr_applied: bool) -> AttrMap {
        crate::prof!("attributes::calculate_attributes");
        let key = self.memo_key(attr_applied as u8);
        let version = self.memo.version;
        let slot = super::context::memo_slot(key);
        if let Some((v, hit)) = self.memo.base_attrs[slot].as_ref()
            && *v == version
        {
            return hit.clone();
        }
        let attrs = self.base_attributes();
        // 条件 MOD：命中则整体重算（`applyCondition` 内部已改写 MOD 属性并重建来源表）
        if self.apply_conditions(&attrs) {
            return self.base_attributes_cached(attr_applied);
        }
        // BUFF 动态 attr：首轮命中则整体重算且不再刷新 attr
        if !attr_applied && self.apply_buff_attr(&attrs) {
            return self.base_attributes_cached(true);
        }
        if self.memo.version == version {
            self.memo.base_attrs[slot] = Some((version, attrs.clone()));
        }
        attrs
    }

    /// 属性汇总主体（不含条件 / attr / code）；对应上游 `calculateAttributes` 的 ①②③④⑤ 阶段。
    fn base_attributes(&mut self) -> AttrMap {
        crate::prof!("attributes::base_attributes");
        // 来源表随状态版本重建（MOD 属性可能被条件改写）
        self.ensure_source_table();

        let char = &self.char;
        let mut attack_bonus = self.total_bonus("攻击", "角色", true);
        let attack_add = self.total_bonus("固定攻击", "角色", true);
        let health_add = self.total_bonus("固定生命", "角色", true);
        let mut health_bonus = self.total_bonus("生命", "角色", true);
        let mut shield_bonus = self.total_bonus("护盾", "角色", true);
        let mut defense_bonus = self.total_bonus("防御", "角色", true);
        let sanity_bonus = self.total_bonus("神智", "角色", true);
        let mut elem_damage_bonus = self.total_bonus("属性攻击", "角色", true);

        // 基础值为 1 的属性
        let mut power = 1.0 + self.total_bonus("技能威力", "角色", true);
        let mut durability = 1.0 + self.total_bonus("技能耐久", "角色", true);
        let mut efficiency = 1.0 + self.total_bonus("技能效益", "角色", true);
        let mut range = 1.0 + self.total_bonus("技能范围", "角色", true);

        // 基础值为 0 的属性
        let mut boost = self.total_bonus("昂扬", "角色", true);
        let desperate = self.total_bonus("背水", "角色", true);
        let mut damage_increase = self.total_bonus("增伤", "角色", true);
        let mut element_damage_increase = self.total_bonus("元素增伤", "角色", true);
        let mut physical_damage_increase = self.total_bonus("物理增伤", "角色", true);
        let mut weapon_damage = self.total_bonus("武器伤害", "角色", true);
        let mut skill_damage = self.total_bonus("技能伤害", "角色", true);
        // 技能追伤（0 起始）：技能伤害的独立乘区，效果与武器的追加伤害类似
        let mut skill_additional_damage = self.total_bonus("技能追伤", "角色", true);
        // 技能速度（1 起始的倍率）：直接作为攻速/伤害公式的乘区使用
        let skill_speed = 1.0 + self.total_bonus("技能速度", "角色", true);
        let mut penetration = self.total_bonus("属性穿透", "角色", true);
        let mut imbalance_damage = self.total_bonus("失衡易伤", "角色", true);
        let mut skill_add = self.total_bonus("技能倍率加数", "角色", true);
        let mut summon_inherit = 1.0 + self.total_bonus("召唤物属性继承比例", "角色", true);
        let mut summon_attack_speed = self.total_bonus("召唤物攻击速度", "角色", true);
        let mut summon_range = self.total_bonus("召唤物范围", "角色", true);
        let mut summon_damage = self.total_bonus("召唤物伤害", "角色", true);
        let mut summon_independent = self.total_bonus("召唤物独立增伤", "角色", true);

        // 乘法 / 独立递减类
        // 无视防御是加算比例（多条来源直接相加后一起削防御），不走乘法聚合；对齐上游把
        // `getTotalBonusMul` 改回 `getTotalBonus` 的调整。
        let ignore_defense = self.total_bonus("无视防御", "角色", true);
        let skill_ignore_defense = self.total_bonus("技能无视防御", "角色", true);
        let independent = self.total_bonus_mul("独立增伤", "角色", true);
        // 技能独立增伤（0 起始）：只作用于技能伤害池的独立乘区（武器伤害池不吃）
        let skill_independent = self.total_bonus_mul("技能独立增伤", "角色", true);
        let damage_reduce = self.total_bonus_reduce("减伤", None);
        let skill_multiplier_set = self.total_bonus("技能倍率赋值", "角色", true);
        let skill_multiplier = self.total_bonus_mul("技能倍率乘数", "角色", true);

        // 转 xx 系列
        let convert_cut = self.total_bonus("转切割", "角色", true);
        let convert_pierce = self.total_bonus("转贯穿", "角色", true);
        let convert_impact = self.total_bonus("转震荡", "角色", true);
        let convert_calamity = self.total_bonus("转灾厄", "角色", true);
        let convert_fullness = self.total_bonus("转充盈", "角色", true);
        let convert_restraint = self.total_bonus("转属克", "角色", true);
        let convert_reverse = self.total_bonus("转属逆", "角色", true);
        let fullness_bonus = self.total_bonus("充盈威力", "角色", true);
        let skill_trigger = self.total_bonus("技能触发", "角色", true);
        let anomaly_bonus = self.total_bonus("异常数量", "角色", true);
        let pet_cd_reduce = self.total_bonus("魔灵CD缩减", "角色", true);
        // 神智回复（0 起始，每 3 秒额外回复量，`CharBuild.ts:1392`）
        let mut sanity_regen_bonus = self.total_bonus("神智回复", "角色", true);

        // `属性MOD属性`：按元素系列加权（上游「狮鹫百首契约者」机制）
        let mod_attribute_bonus =
            self.total_bonus(&prefixed(&char.element, "MOD属性"), "角色", true);
        if mod_attribute_bonus > 0.0 {
            let series_mods: Vec<usize> = self
                .char_mods
                .iter()
                .enumerate()
                .filter(|(_, mod_)| ELEMENT_SERIES.contains(&mod_.series.as_str()))
                .map(|(index, _)| index)
                .collect();
            let weighted = |attribute: &str| -> f64 {
                series_mods
                    .iter()
                    .filter_map(|index| self.char_mods.get(*index))
                    .filter_map(|mod_| mod_.props.get(attribute).copied())
                    .sum::<f64>()
            };
            attack_bonus += mod_attribute_bonus * weighted("攻击");
            health_bonus += mod_attribute_bonus * weighted("生命");
            shield_bonus += mod_attribute_bonus * weighted("护盾");
            defense_bonus += mod_attribute_bonus * weighted("防御");
            elem_damage_bonus += mod_attribute_bonus * weighted("属性攻击");
            power += mod_attribute_bonus * weighted("技能威力");
            durability += mod_attribute_bonus * weighted("技能耐久");
            efficiency += mod_attribute_bonus * weighted("技能效益");
            range += mod_attribute_bonus * weighted("技能范围");
            boost += mod_attribute_bonus * weighted("昂扬");
            damage_increase += mod_attribute_bonus * weighted("增伤");
            element_damage_increase += mod_attribute_bonus * weighted("元素增伤");
            physical_damage_increase += mod_attribute_bonus * weighted("物理增伤");
            weapon_damage += mod_attribute_bonus * weighted("武器伤害");
            skill_damage += mod_attribute_bonus * weighted("技能伤害");
            skill_additional_damage += mod_attribute_bonus * weighted("技能追伤");
            penetration += mod_attribute_bonus * weighted("属性穿透");
            imbalance_damage += mod_attribute_bonus * weighted("失衡易伤");
            skill_add += mod_attribute_bonus * weighted("技能倍率加数");
            summon_inherit += mod_attribute_bonus * weighted("召唤物属性继承比例");
            summon_attack_speed += mod_attribute_bonus * weighted("召唤物攻击速度");
            summon_range += mod_attribute_bonus * weighted("召唤物范围");
            summon_damage += mod_attribute_bonus * weighted("召唤物伤害");
            summon_independent += mod_attribute_bonus * weighted("召唤物独立增伤");
            sanity_regen_bonus += mod_attribute_bonus * weighted("神智回复");
        }

        // 基础属性合成
        let resonance = self.settings.resonance_gain;
        let mut attack = char.base_attack * (1.0 + attack_bonus + resonance);
        let mut health = char.base_hp * (1.0 + health_bonus + resonance);
        let shield = char.base_shield * (1.0 + shield_bonus + resonance);
        let defense = char.base_defense * (1.0 + defense_bonus + resonance);
        let sanity = char.base_sanity * (1.0 + sanity_bonus);

        attack = attack * (1.0 + elem_damage_bonus) + attack_add;

        health = (health + health_add).round();
        let shield = shield.round();
        let defense = defense.round();
        let sanity = sanity.round();
        attack = round2(attack);

        // 属性上限
        efficiency = efficiency.min(1.75);
        range = range.min(2.8);
        durability = durability.min(4.0);

        let damage_reduce = damage_reduce.clamp(0.0, 1.0);
        let ignore_defense = ignore_defense.clamp(0.0, 1.0);
        let skill_ignore_defense = skill_ignore_defense.clamp(0.0, 1.0);
        let skill_multiplier_set = if skill_multiplier_set > 0.0 {
            skill_multiplier_set
        } else {
            0.0
        };

        let mut attrs = AttrMap::new();
        attrs.insert("攻击", attack);
        attrs.insert("生命", health);
        attrs.insert("护盾", shield);
        attrs.insert("防御", defense);
        attrs.insert("神智", sanity);
        attrs.insert("技能威力", power);
        attrs.insert("技能耐久", durability);
        attrs.insert("技能效益", efficiency);
        attrs.insert("技能范围", range);
        attrs.insert("昂扬", boost);
        attrs.insert("背水", desperate);
        attrs.insert("增伤", damage_increase);
        attrs.insert("元素增伤", element_damage_increase);
        attrs.insert("物理增伤", physical_damage_increase);
        attrs.insert("属性攻击", elem_damage_bonus);
        attrs.insert("武器伤害", weapon_damage);
        attrs.insert("技能伤害", skill_damage);
        attrs.insert("技能追伤", skill_additional_damage);
        attrs.insert("独立增伤", independent);
        attrs.insert("技能独立增伤", skill_independent);
        attrs.insert("属性穿透", penetration);
        attrs.insert("无视防御", ignore_defense);
        attrs.insert("技能无视防御", skill_ignore_defense);
        attrs.insert("技能速度", skill_speed);
        attrs.insert("失衡易伤", imbalance_damage);
        attrs.insert("技能倍率加数", skill_add);
        attrs.insert("技能倍率乘数", skill_multiplier);
        attrs.insert("召唤物属性继承比例", summon_inherit);
        attrs.insert("召唤物攻击速度", summon_attack_speed);
        attrs.insert("召唤物范围", summon_range);
        attrs.insert("召唤物伤害", summon_damage);
        attrs.insert("召唤物独立增伤", summon_independent);
        attrs.insert("减伤", damage_reduce);
        attrs.insert("技能倍率赋值", skill_multiplier_set);
        // 有效生命 = (生命 / (1 - 防御/(300+防御)) + 护盾) / (1 - 减伤)
        let effective_hp =
            (health / (1.0 - defense / (300.0 + defense)) + shield) / (1.0 - damage_reduce);
        attrs.insert("有效生命", effective_hp);
        attrs.insert("转切割", convert_cut);
        attrs.insert("转贯穿", convert_pierce);
        attrs.insert("转震荡", convert_impact);
        attrs.insert("转灾厄", convert_calamity);
        attrs.insert("转充盈", convert_fullness);
        attrs.insert("转属克", convert_restraint);
        attrs.insert("转属逆", convert_reverse);
        attrs.insert("充盈威力", fullness_bonus);
        attrs.insert("技能触发", skill_trigger);
        // 异常数量：光暗角色 1 + 追加；其他角色 max(1, 追加)
        let anomaly = if char.element == "光" || char.element == "暗" {
            1.0 + anomaly_bonus
        } else {
            anomaly_bonus.max(1.0)
        };
        attrs.insert("异常数量", anomaly);
        // 魔灵CD：所选魔灵主动技原始冷却 × (1 - 缩减)；未选魔灵时为 0
        let pet_cd_reduce_clamped = pet_cd_reduce.clamp(0.0, 1.0);
        attrs.insert(
            "魔灵CD",
            (self.pet_base_cd() * (1.0 - pet_cd_reduce_clamped)).max(0.0),
        );
        attrs.insert("魔灵CD缩减", pet_cd_reduce_clamped);
        // 神智回复总量（每 3 秒）：自然回复 + BUFF/MOD 持续性额外回复（`CharBuild.ts:1508`）
        attrs.insert(
            "神智回复",
            sanity_regen_bonus + 2.0 + (sanity / 200.0).floor(),
        );
        attrs
    }

    /// 施加 `code` 动态 BUFF（只需角色属性时用）。
    fn apply_dynamic_buffs(&mut self, attrs: AttrMap) -> AttrMap {
        crate::prof!("attributes::apply_dynamic_buffs");
        self.run_dynamic_buff_codes(attrs, None).0
    }

    /// 已装备 MOD / 武器的特效 code 列表；对应上游 `getEffectCodeBuffs`。
    ///
    /// 用户勾选 BUFF 的 code 走 `dynamic_buffs`；特效 code 挂在装备实例上，
    /// 随装备更换与特效等级（含武器熔炼生效状态）动态变化，因此每次计算时现取：
    /// 只收已生效（特效等级 > 0，武器还需熔炼生效）的条目；
    /// `技能`/`tag` 限定的改由字段级条件合并应用（调用方按是否有条件分流）。
    /// 返回顺序与上游一致（四槽 + 中枢 MOD 在前，近战/远程武器在后）。
    fn effect_code_buffs(&self) -> Vec<EffectCodeBuff> {
        let mut out = Vec::new();
        for holder in self
            .char_mods
            .iter()
            .chain(self.melee_mods.iter())
            .chain(self.ranged_mods.iter())
            .chain(self.skill_mods.iter())
            .chain(self.aura_mod.iter())
        {
            if let Some(buff) = holder.buff.as_ref()
                && buff.code.is_some()
                && buff.level > 0.0
            {
                out.push(EffectCodeBuff {
                    skill: buff.skill.clone(),
                    pattern: buff.skill_pattern.clone(),
                    tag: buff.tag.clone(),
                    code: buff.code.clone().unwrap_or_default(),
                });
            }
        }
        for weapon in [&self.melee_weapon, &self.ranged_weapon] {
            if let Some(buff) = weapon.buff.as_ref()
                && buff.code.is_some()
                && buff.level > 0.0
                && weapon.forge_effective
            {
                out.push(EffectCodeBuff {
                    skill: buff.skill.clone(),
                    pattern: buff.skill_pattern.clone(),
                    tag: buff.tag.clone(),
                    code: buff.code.clone().unwrap_or_default(),
                });
            }
        }
        out
    }

    /// 跑一遍全部动态 BUFF 的 `code`；对应上游 `calculateAttributes` 末尾的 dynamicBuffs 循环。
    ///
    /// 关键语义（JS 的对象别名）：上游 `getAllWeaponsAttrs` 对「名称与被选武器相同」的槽位
    /// **复用同一个面板对象**，因此 `weaponAttr` 与 `skillWeaponAttr` 常常是同一份数据
    /// （被选武器是同律武器时），`code` 写其中一个、另一个也变。
    /// 这里把被选武器槽位统一用 `weaponAttr` 一个键，跑完再把它镜像回对应的槽位键。
    fn run_dynamic_buff_codes(
        &mut self,
        mut attrs: AttrMap,
        mut selected_panel: Option<AttrMap>,
    ) -> (AttrMap, Option<AttrMap>) {
        crate::prof!("attributes::run_dynamic_buff_codes");
        if self.dynamic_buffs.is_empty() {
            return (attrs, selected_panel);
        }
        let codes: Vec<String> = self
            .dynamic_buff_iter()
            .filter_map(|buff| {
                if buff.is_field_conditional() {
                    None
                } else {
                    buff.code.clone()
                }
            })
            // 特效 code 同口径并入全局属性（条件限定的改由字段级条件合并应用）
            .chain(self.effect_code_buffs().into_iter().filter_map(|effect| {
                if !effect.is_field_conditional() && !effect.code.is_empty() {
                    Some(effect.code)
                } else {
                    None
                }
            }))
            .collect();
        // 动态 BUFF 全被字段条件收走时没有任何全局 code：省掉面板/基础表/沙盒的整轮构建。
        if codes.is_empty() {
            return (attrs, selected_panel);
        }
        let mod_maps = self.mod_slot_maps_cached();
        let bases = self.code_bases();
        // 面板只在 code 真的引用 `…WeaponAttr` 时才需要参与沙盒：数据里绝大多数
        // code 只写裸属性，跳过可省掉 3 个武器面板的整轮重算。
        let touches_panels = codes.iter().any(|code| code.contains("eaponAttr"));
        let (selected_slot, mut field_attrs): (
            Option<usize>,
            std::sync::Arc<HashMap<String, AttrMap>>,
        ) = if touches_panels {
            let selected_ref = self.resolve_weapon_ref(None);
            let panels = self.all_weapon_attrs();
            // 被选武器所在槽位（`panels`: 0 未用 / 1 近战 / 2 远程 / 3 同律）
            let selected_slot = match selected_ref {
                Some(WeaponRef::Melee) => Some(1usize),
                Some(WeaponRef::Ranged) => Some(2),
                Some(WeaponRef::Skill) => Some(3),
                _ => None,
            };
            (selected_slot, code_field_attrs(&panels, selected_slot))
        } else {
            (None, std::sync::Arc::new(HashMap::new()))
        };
        // 别名组：`weaponAttr` 与被选武器那一槽是同一对象
        let alias: Vec<String> = match selected_slot {
            Some(1) => vec!["weaponAttr".to_string(), "meleeWeaponAttr".to_string()],
            Some(2) => vec!["weaponAttr".to_string(), "rangedWeaponAttr".to_string()],
            Some(3) => vec!["weaponAttr".to_string(), "skillWeaponAttr".to_string()],
            _ => Vec::new(),
        };

        for code in codes {
            let before = field_attrs.clone();
            let (next_fields, _outcome) = run_dynamic_buff(
                &code,
                &mut attrs,
                field_attrs.clone(),
                bases.clone(),
                mod_maps.clone(),
                self.enemy.level,
            );
            field_attrs = next_fields;
            // 同步别名：把组内各键相对本条 code 之前的**增量**累加到基准上，
            // 再写回全组。这样「写 weaponAttr」与「写 skillWeaponAttr」都等价于
            // 写同一个对象（上游 JS 的引用语义）。
            sync_alias_group(&mut field_attrs, &before, &alias);
        }

        // 回写：被选武器槽位的最终值就是 `weaponAttr`
        if selected_panel.is_some()
            && let Some(current) = field_attrs.get("weaponAttr")
        {
            selected_panel = Some(current.clone());
        }
        (attrs, selected_panel)
    }

    /// 差分条件codeBUFF（带 `技能`/`tag` 的动态属性 BUFF）在全局属性上产生的顶层属性增量；
    /// 对应上游 `getScopedCodeBuffConditionals`。
    ///
    /// 以当前全局属性（不含条件codeBUFF，应用点已跳过）为基线逐条跑 code，
    /// 把数值差转成可合并的增量：乘法池属性（独立增伤系列等）存乘法因子对应的净增量，
    /// 其余属性存平值差。code 对武器面板等嵌套对象的修改不参与差分（沿用全局 code 的现有口径）。
    pub(super) fn scoped_code_buff_conditionals(&mut self) -> Vec<BuffFieldConditional> {
        crate::prof!("attributes::scoped_code_buff_conditionals");
        let mut scoped: Vec<EffectCodeBuff> = self
            .dynamic_buff_iter()
            .filter_map(|buff| {
                if !buff.is_field_conditional() {
                    return None;
                }
                Some(EffectCodeBuff {
                    skill: buff.skill.clone(),
                    pattern: buff.skill_pattern.clone(),
                    tag: buff.tag.clone(),
                    code: buff.code.clone()?,
                })
            })
            .collect();
        scoped.extend(
            self.effect_code_buffs()
                .into_iter()
                .filter(|effect| effect.is_field_conditional() && !effect.code.is_empty()),
        );
        if scoped.is_empty() {
            return Vec::new();
        }
        // 可重入保护：基线计算内部经 attr 型 BUFF 的表达式求值会再次进入本函数，
        // 此时外层基线尚未算出，直接返回空（基线本就不含条件 code）。
        if self.scoped_code_computing {
            return Vec::new();
        }
        self.scoped_code_computing = true;
        let base_attrs = self.calculate_weapon_attributes(None).char;
        let mod_maps = self.mod_slot_maps_cached();
        let bases = self.code_bases();
        let selected_slot = match self.resolve_weapon_ref(None) {
            Some(WeaponRef::Melee) => Some(1usize),
            Some(WeaponRef::Ranged) => Some(2),
            Some(WeaponRef::Skill) => Some(3),
            _ => None,
        };
        let enemy_level = self.enemy.level;
        let mut entries = Vec::new();
        for effect in scoped {
            // 每条 code 都拿「同一份基线 + 全新面板」跑（上游逐条 applyDynamicAttr 的口径）
            let code = effect.code;
            let panels = self.all_weapon_attrs();
            let mut snapshot = base_attrs.clone();
            let (_next_fields, _outcome) = run_dynamic_buff(
                &code,
                &mut snapshot,
                code_field_attrs(&panels, selected_slot),
                bases.clone(),
                mod_maps.clone(),
                enemy_level,
            );
            let mut props = AttrMap::new();
            for (key, value) in &snapshot {
                let Some(before) = base_attrs.get(key) else {
                    continue;
                };
                if value == before {
                    continue;
                }
                if is_multiplicative_attr(key) {
                    if (1.0 + before).abs() < f64::EPSILON {
                        continue;
                    }
                    props.insert(key, (1.0 + value) / (1.0 + before) - 1.0);
                } else {
                    props.insert(key, value - before);
                }
            }
            let mut entry = BuffFieldConditional {
                props,
                ..Default::default()
            };
            if let Some(skill) = effect.skill {
                entry.pattern = effect.pattern.clone();
                entry.skill = Some(skill);
            }
            if !effect.tag.is_empty() {
                entry.tag = effect.tag;
            }
            entries.push(entry);
        }
        self.scoped_code_computing = false;
        entries
    }

    /// 「同律武器继承时与被继承武器共享面板」的别名组；对应上游 `getAllWeaponsAttrs` 的引用复用。
    fn all_weapon_attrs(&mut self) -> [Option<AttrMap>; 4] {
        let melee = self
            .calculate_weapon_attributes_raw(Some(WeaponRef::Melee), true, true)
            .panel;
        let ranged = self
            .calculate_weapon_attributes_raw(Some(WeaponRef::Ranged), true, true)
            .panel;
        let skill = if self.skill_weapon.is_some() {
            // 继承型同律武器复用被继承武器的面板（上游同样直接复用）
            match self
                .skill_weapon
                .as_ref()
                .and_then(|weapon| weapon.inherit.clone())
                .as_deref()
            {
                Some("melee") => melee.clone(),
                Some("ranged") => ranged.clone(),
                _ => {
                    self.calculate_weapon_attributes_raw(Some(WeaponRef::Skill), true, true)
                        .panel
                }
            }
        } else {
            None
        };
        [None, melee, ranged, skill]
    }
}

/// `code` 沙盒的武器面板初始键表。
///
/// 四个沙盒键**全部**登记：上游那四个名字指向的对象都在 sandbox 里
/// （`weaponAttr` 与「被选武器那一槽」是同一对象），少了任何一个都会让
/// 形如 `if(skillWeaponAttr){…}` 的 `code` 整段跳过——数据里确实有这种写法。
fn code_field_attrs(
    panels: &[Option<AttrMap>; 4],
    selected_slot: Option<usize>,
) -> std::sync::Arc<HashMap<String, AttrMap>> {
    let slot_keys: [(&str, usize); 3] = [
        ("meleeWeaponAttr", 1),
        ("rangedWeaponAttr", 2),
        ("skillWeaponAttr", 3),
    ];
    let mut field_attrs: HashMap<String, AttrMap> = HashMap::new();
    for (key, index) in slot_keys {
        if let Some(panel) = panels[index].clone() {
            field_attrs.insert(key.to_string(), panel);
        }
    }
    if let Some(slot) = selected_slot
        && let Some(panel) = panels[slot].clone()
    {
        field_attrs.insert("weaponAttr".to_string(), panel);
    }
    std::sync::Arc::new(field_attrs)
}

/// 同步别名组：组内各键在上游是**同一个对象**，任一写入对其它键都可见。
///
/// 用「增量求和」模拟引用语义：先算出组内各键相对 [before] 的逐属性增量，
/// 累加到基准值上，再写回组内所有键。数据里的 `code` 都是 `+=` / `*=` 这类增量写法，
/// 该模型与共享对象的行为一致。
fn sync_alias_group(
    field_attrs: &mut std::sync::Arc<HashMap<String, AttrMap>>,
    before: &HashMap<String, AttrMap>,
    alias: &[String],
) {
    if alias.len() < 2 {
        return;
    }
    let field_attrs = std::sync::Arc::make_mut(field_attrs);
    // 以第一个键为基准
    let base_key = &alias[0];
    let Some(base) = field_attrs.get(base_key).cloned() else {
        return;
    };
    let before_base = before.get(base_key).cloned().unwrap_or_default();
    let mut merged = base.clone();
    for key in alias.iter().skip(1) {
        let Some(current) = field_attrs.get(key).cloned() else {
            continue;
        };
        let previous = before.get(key).cloned().unwrap_or_default();
        // 逐属性累加增量
        for (attribute, value) in current {
            let delta = value - previous.get(&attribute).copied().unwrap_or(0.0);
            if delta == 0.0 {
                continue;
            }
            *merged.entry(attribute).or_insert(0.0) += delta;
        }
    }
    // 基准键自身的增量已经包含在 `merged` 里，其余键直接对齐
    for key in alias {
        field_attrs.insert(key.clone(), merged.clone());
    }
    let _ = before_base;
}

impl<'a> BuildContext<'a> {
    /// `code` 环境的只读基础值子对象（`char` / `weapon` / `meleeWeapon` / …）。
    ///
    /// 内容只依赖角色与武器的基础值（装备更换会整体重建上下文），建立一次即缓存。
    fn code_bases(&mut self) -> std::sync::Arc<HashMap<String, AttrMap>> {
        crate::prof!("attributes::code_bases");
        if let Some(cached) = &self.code_bases_cache {
            return cached.clone();
        }
        let mut map = HashMap::new();
        map.insert(
            "char".to_string(),
            base_map(&[
                ("基础攻击", self.char.base_attack),
                ("基础生命", self.char.base_hp),
                ("基础护盾", self.char.base_shield),
                ("基础防御", self.char.base_defense),
                ("基础神智", self.char.base_sanity),
            ]),
        );
        let weapon_map = |weapon: &super::models::LeveledWeapon| {
            base_map(&[
                ("基础攻击", weapon.base_attack),
                ("基础暴击", weapon.base_crit),
                ("基础暴伤", weapon.base_crit_damage),
                ("基础触发", weapon.base_trigger),
            ])
        };
        map.insert("weapon".to_string(), weapon_map(&self.melee_weapon));
        map.insert("meleeWeapon".to_string(), weapon_map(&self.melee_weapon));
        map.insert("rangedWeapon".to_string(), weapon_map(&self.ranged_weapon));
        if let Some(weapon) = self.skill_weapon.as_ref() {
            map.insert(
                "skillWeapon".to_string(),
                base_map(&[
                    ("基础攻击", weapon.base_attack),
                    ("基础暴击", weapon.base_crit),
                    ("基础暴伤", weapon.base_crit_damage),
                    ("基础触发", weapon.base_trigger),
                ]),
            );
        }
        let map = std::sync::Arc::new(map);
        self.code_bases_cache = Some(map.clone());
        map
    }

    /// 武器属性汇总；对应上游 `calculateWeaponAttributes(weapon, nocode, nochar)`。
    pub fn calculate_weapon_attributes(&mut self, weapon: Option<WeaponRef>) -> WeaponAttributes {
        self.calculate_weapon_attributes_raw(weapon, false, false)
    }

    /// 武器属性汇总主体。
    ///
    /// `nocode` 跳过动态 BUFF（`getAllWeaponsAttrs` 这类只取面板的调用用）；
    /// `nochar` 只算武器面板、不写角色侧汇总（同上）。
    pub fn calculate_weapon_attributes_raw(
        &mut self,
        weapon: Option<WeaponRef>,
        nocode: bool,
        nochar: bool,
    ) -> WeaponAttributes {
        let key = self.memo_key(nocode as u8 | (nochar as u8) << 1);
        let version = self.memo.version;
        let slot = super::context::memo_weapon_slot(key, weapon);
        if let Some((v, hit)) = self.memo.weapon[slot].as_ref()
            && *v == version
        {
            return hit.clone();
        }
        let result = self.calculate_weapon_attributes_uncached(weapon, nocode, nochar);
        if self.memo.version == version {
            self.memo.weapon[slot] = Some((version, result.clone()));
        }
        result
    }

    fn calculate_weapon_attributes_uncached(
        &mut self,
        weapon: Option<WeaponRef>,
        nocode: bool,
        nochar: bool,
    ) -> WeaponAttributes {
        crate::prof!("attributes::calculate_weapon_attributes_raw");
        let mut result = WeaponAttributes {
            // 角色侧属性：nocode 时只算到 code 之前（避免动态 BUFF 反复递归）
            char: if nochar {
                AttrMap::new()
            } else {
                self.calculate_attributes(true, false)
            },
            panel: None,
            weapon: None,
        };

        if let Some(target) = self.resolve_weapon_ref(weapon) {
            result.weapon = Some(target);
            let effective = self.inherited_target(target);
            let prefix = self.weapon_prefix_ref(effective);
            if !prefix.is_empty() {
                result.panel = Some(self.weapon_panel(effective, prefix));
            }
        }

        if nochar {
            return result;
        }

        // 充盈威力（角色属性）= 角色 MOD 加成 + Σ 各武器溢出触发 × 该武器充盈转化
        let mut total_fullness = 0.0;
        for target in self.fullness_weapons() {
            let (trigger_rate, conversion_rate) = self.weapon_fullness(target);
            total_fullness += (trigger_rate - 1.0).max(0.0) * conversion_rate;
        }
        let current = result.char.get("充盈威力").copied().unwrap_or(0.0);
        result.char.insert("充盈威力", current + total_fullness);

        // 召唤物攻速 / 范围转化（角色属性）
        if !self.melee_weapon.is_empty() {
            let (attack_speed, conversion_rate) = self.weapon_summon_speed(WeaponRef::Melee);
            let current = result.char.get("召唤物攻击速度").copied().unwrap_or(0.0);
            result.char.insert(
                "召唤物攻击速度",
                current + attack_speed.max(0.0) * conversion_rate,
            );
            let range = self.total_bonus("召唤物范围转化", "近战", true);
            let current = result.char.get("召唤物范围").copied().unwrap_or(0.0);
            result.char.insert("召唤物范围", current + range);
        }

        if nocode {
            return result;
        }
        // 动态 BUFF 会改写角色属性**同时**改写武器面板（如「权火将熄5熔」给同律武器加暴击/暴伤），
        // 因此把面板一起带进去跑。但**只有请求的就是被选武器**时才回写：
        // 上游 `applyDynamicAttr` 改的是「当前武器的面板对象」，
        // 查询其它武器（近战/远程面板）时不会被波及。
        let is_selected_request =
            result.weapon.is_none() || result.weapon == self.resolve_weapon_ref(None);
        let char = std::mem::take(&mut result.char);
        let (char, panel) = if is_selected_request {
            self.run_dynamic_buff_codes(char, result.panel.take())
        } else {
            (
                self.run_dynamic_buff_codes(char, None).0,
                result.panel.take(),
            )
        };
        result.char = char;
        result.panel = panel;
        result
    }

    /// 全部武器面板；对应上游 `getAllWeaponSkillsAttrs`（键为 `近战`/`远程`/`同律` + 英文别名）。
    pub fn all_weapon_panels(&mut self) -> HashMap<String, AttrMap> {
        self.weapon_panels_for(true, true, true)
    }

    pub fn weapon_panels_for(
        &mut self,
        need_melee: bool,
        need_ranged: bool,
        need_skill: bool,
    ) -> HashMap<String, AttrMap> {
        crate::prof!("attributes::all_weapon_panels");
        let inherit = if need_skill && self.skill_weapon.is_some() {
            self.skill_weapon
                .as_ref()
                .and_then(|weapon| weapon.inherit.clone())
        } else {
            None
        };
        let need_melee = need_melee || inherit.as_deref() == Some("melee");
        let need_ranged = need_ranged || inherit.as_deref() == Some("ranged");
        let mut map = HashMap::new();
        let melee = if need_melee {
            self.calculate_weapon_attributes_raw(Some(WeaponRef::Melee), true, true)
                .panel
        } else {
            None
        };
        let ranged = if need_ranged {
            self.calculate_weapon_attributes_raw(Some(WeaponRef::Ranged), true, true)
                .panel
        } else {
            None
        };
        if let Some(panel) = melee.clone() {
            map.insert("近战".to_string(), panel.clone());
            map.insert("melee".to_string(), panel);
        }
        if let Some(panel) = ranged.clone() {
            map.insert("远程".to_string(), panel.clone());
            map.insert("ranged".to_string(), panel);
        }
        if need_skill && self.skill_weapon.is_some() {
            // 继承型同律武器复用被继承武器的面板（被继承槽已在入口标需）
            let panel = match inherit.as_deref() {
                Some("melee") => melee,
                Some("ranged") => ranged,
                _ => {
                    self.calculate_weapon_attributes_raw(Some(WeaponRef::Skill), true, true)
                        .panel
                }
            };
            if let Some(panel) = panel {
                map.insert("同律".to_string(), panel.clone());
                map.insert("skill".to_string(), panel);
            }
        }
        // 武器技能名 → 该武器的面板
        for skill in self.melee_weapon_skills() {
            if let Some(panel) = map.get("近战").cloned() {
                map.entry(skill.name.clone()).or_insert(panel);
            }
        }
        for skill in self.ranged_weapon_skills() {
            if let Some(panel) = map.get("远程").cloned() {
                map.entry(skill.name.clone()).or_insert(panel);
            }
        }
        for skill in self.skill_weapon_skills() {
            if let Some(panel) = map.get("同律").cloned() {
                map.entry(skill.name.clone()).or_insert(panel);
            }
        }
        map
    }

    /// 取远程武器多重射击（1 开始）：供技能字段 影响:"多重" 读取。
    /// 直接读已算好的武器面板时传该面板，避免重复汇总；缺省时按当前构筑现算
    ///（nochar 口径，只取面板）。无远程武器时为 1；对应上游 `getRangedMulti`。
    pub fn ranged_multi(&mut self, ranged_panel: Option<f64>) -> f64 {
        if let Some(multi) = ranged_panel {
            return multi;
        }
        let computed = self.calculate_weapon_attributes_raw(Some(WeaponRef::Ranged), true, true);
        computed
            .panel
            .and_then(|panel| panel.get("多重").copied())
            .unwrap_or(1.0)
    }

    /// 全部武器面板，并把「被选武器的面板」换成带 `code` 改写的那一份。
    ///
    /// 上游 `getAllWeaponSkillsAttrs` 里被选武器那一项取自 `attrs.weapon`（已跑过 code）。
    pub fn all_weapon_panels_with_selected(
        &mut self,
        selected: Option<AttrMap>,
    ) -> HashMap<String, AttrMap> {
        crate::prof!("attributes::all_weapon_panels_with_selected");
        let mut map = self.all_weapon_panels();
        let Some(panel) = selected else { return map };
        let selected_ref = self.resolve_weapon_ref(None);
        let key = match selected_ref {
            Some(WeaponRef::Melee) => "近战",
            Some(WeaponRef::Ranged) => "远程",
            Some(WeaponRef::Skill) => "同律",
            _ => return map,
        };
        let alias = match selected_ref {
            Some(WeaponRef::Melee) => "melee",
            Some(WeaponRef::Ranged) => "ranged",
            Some(WeaponRef::Skill) => "skill",
            _ => return map,
        };
        map.insert(key.to_string(), panel.clone());
        map.insert(alias.to_string(), panel.clone());
        // 该武器的技能名也指向同一份面板
        let skills = match selected_ref {
            Some(WeaponRef::Melee) => self.melee_weapon_skills(),
            Some(WeaponRef::Ranged) => self.ranged_weapon_skills(),
            Some(WeaponRef::Skill) => self.skill_weapon_skills(),
            _ => &[],
        };
        for skill in skills {
            map.insert(skill.name.clone(), panel.clone());
        }
        map
    }

    /// 武器面板本体；对应上游 `calculateWeaponAttributes` 中 `if (weapon) { … }` 那一段。
    fn weapon_panel(&self, target: WeaponRef, prefix: &str) -> AttrMap {
        crate::prof!("attributes::weapon_panel");
        let scope = prefix_scope(prefix);
        let is_skill = prefix.starts_with("同律");
        let lower_prefix = if is_skill {
            prefix.chars().skip(2).collect::<String>()
        } else {
            String::new()
        };

        let mut attack_bonus = self.total_bonus(&prefixed(prefix, "攻击"), prefix, true)
            + self.total_bonus("攻击", prefix, true);
        let physical_bonus = self.total_bonus("物理", prefix, true);
        let mut crit_bonus = self.total_bonus(&prefixed(prefix, "暴击"), prefix, true)
            + self.total_bonus("暴击", prefix, true);
        let mut crit_damage_bonus = self.total_bonus(&prefixed(prefix, "暴伤"), prefix, true)
            + self.total_bonus("暴伤", prefix, true);
        let mut trigger_bonus = self.total_bonus(&prefixed(prefix, "触发"), prefix, true)
            + self.total_bonus("触发", prefix, true);
        let mut speed_bonus = self.total_bonus(&prefixed(prefix, "攻速"), prefix, true)
            + self.total_bonus("攻速", prefix, true);
        let mut multi_bonus = self.total_bonus(&prefixed(prefix, "多重"), prefix, true)
            + self.total_bonus("多重", prefix, true);
        let mut damage_increase = self.total_bonus(&prefixed(prefix, "增伤"), prefix, true)
            + self.total_bonus("增伤", prefix, true);
        let mut reload_bonus = self.total_bonus(&prefixed(prefix, "装填"), prefix, true)
            + self.total_bonus("装填", prefix, true);
        let mut magazine_bonus = self.total_bonus(&prefixed(prefix, "弹匣"), prefix, true)
            + self.total_bonus("弹匣", prefix, true);
        let mut ammo_bonus = self.total_bonus(&prefixed(prefix, "弹药"), prefix, true)
            + self.total_bonus("弹药", prefix, true);
        let mut additional_damage = self.total_bonus("追加伤害", "角色", true);
        let mut weapon_multiplier = self.total_bonus(&prefixed(prefix, "武器倍率"), prefix, true)
            + self.total_bonus("武器倍率", prefix, true);
        let mut independent = (1.0
            + self.total_bonus_mul(&prefixed(prefix, "独立增伤"), prefix, true))
            * (1.0 + self.total_bonus_mul("独立增伤", prefix, true))
            - 1.0;

        // `属性MOD属性` 对追加伤害的加权
        let mod_attribute_bonus =
            self.total_bonus(&prefixed(self.char.element.as_str(), "MOD属性"), "角色", true);
        if mod_attribute_bonus > 0.0 {
            let extra: f64 = self
                .char_mods
                .iter()
                .filter(|mod_| ELEMENT_SERIES.contains(&mod_.series.as_str()))
                .filter_map(|mod_| mod_.props.get("追加伤害").copied())
                .sum();
            additional_damage += mod_attribute_bonus * extra;
        }

        // 同律武器降级前缀（只对 BUFF / 武器效果生效，MOD 不穿透）
        if is_skill && !lower_prefix.is_empty() {
            attack_bonus +=
                self.total_bonus(&prefixed(&lower_prefix, "攻击"), &lower_prefix, false);
            crit_bonus += self.total_bonus(&prefixed(&lower_prefix, "暴击"), &lower_prefix, false);
            crit_damage_bonus +=
                self.total_bonus(&prefixed(&lower_prefix, "暴伤"), &lower_prefix, false);
            trigger_bonus +=
                self.total_bonus(&prefixed(&lower_prefix, "触发"), &lower_prefix, false);
            speed_bonus += self.total_bonus(&prefixed(&lower_prefix, "攻速"), &lower_prefix, false);
            damage_increase +=
                self.total_bonus(&prefixed(&lower_prefix, "增伤"), &lower_prefix, false);
            multi_bonus += self.total_bonus(&prefixed(&lower_prefix, "多重"), &lower_prefix, false);
            reload_bonus +=
                self.total_bonus(&prefixed(&lower_prefix, "装填"), &lower_prefix, false);
            magazine_bonus +=
                self.total_bonus(&prefixed(&lower_prefix, "弹匣"), &lower_prefix, false);
            ammo_bonus += self.total_bonus(&prefixed(&lower_prefix, "弹药"), &lower_prefix, false);
            weapon_multiplier +=
                self.total_bonus(&prefixed(&lower_prefix, "武器倍率"), &lower_prefix, false);
            independent = (1.0 + independent)
                * (1.0
                    + self.total_bonus_mul(
                        &prefixed(&lower_prefix, "独立增伤"),
                        &lower_prefix,
                        false,
                    ))
                - 1.0;
        }
        let _ = scope;

        // 攻速上限 200%
        speed_bonus = speed_bonus.min(2.0);
        let _ = is_skill;

        // 精通倍率：同律武器 1.4，普通武器 1.2
        let category = self.weapon_category_ref(target);
        let mastered = self.is_weapon_category_mastered(category);
        let atk_ratio = if mastered {
            if prefix.starts_with("同律") {
                1.4
            } else {
                1.2
            }
        } else {
            1.0
        };

        let (
            base_attack,
            base_crit,
            base_crit_damage,
            base_trigger,
            attack_speed_base,
            reload_base,
            magazine_base,
            ammo_base,
        ) = self.weapon_bases_of(target);

        let mut attack = base_attack * (1.0 + attack_bonus) * atk_ratio;
        let crit_rate = base_crit * (1.0 + crit_bonus);
        let crit_damage = base_crit_damage * (1.0 + crit_damage_bonus);
        let trigger_rate = base_trigger * (1.0 + trigger_bonus);
        let attack_speed = attack_speed_base * (1.0 + speed_bonus);
        let reload = if 1.0 + reload_bonus == 0.0 {
            0.0
        } else {
            reload_base / (1.0 + reload_bonus)
        };
        let magazine = magazine_base * (1.0 + magazine_bonus);
        let ammo = ammo_base * (1.0 + ammo_bonus);
        let multi_shot = 1.0 + multi_bonus;

        attack *= 1.0 + physical_bonus;

        let mut panel = AttrMap::new();
        panel.insert("攻击", round2(attack));
        panel.insert("暴击", round2(crit_rate));
        panel.insert("暴伤", round2(crit_damage));
        panel.insert("触发", round2(trigger_rate));
        panel.insert("攻速", round2(attack_speed));
        panel.insert("多重", round2(multi_shot));
        panel.insert("增伤", damage_increase);
        panel.insert("独立增伤", round3(independent));
        panel.insert("追加伤害", additional_damage);
        panel.insert("装填", reload);
        panel.insert("弹匣", magazine);
        panel.insert("弹药", ammo);
        panel.insert("武器倍率", weapon_multiplier);
        panel.insert("充盈转化", 1.0 + self.total_bonus("充盈转化", prefix, true));
        panel.insert(
            "召唤物攻击速度转化",
            self.total_bonus("召唤物攻击速度转化", prefix, true),
        );
        panel.insert(
            "召唤物范围转化",
            self.total_bonus("召唤物范围转化", prefix, true),
        );
        panel
    }

    /// 解析武器引用（`Selected` 按基底名定位）。
    fn resolve_weapon_ref(&self, weapon: Option<WeaponRef>) -> Option<WeaponRef> {
        crate::prof!("attributes::resolve_weapon_ref");
        match weapon {
            Some(WeaponRef::Melee) | Some(WeaponRef::Ranged) | Some(WeaponRef::Skill) => weapon,
            _ => {
                // `selectedWeapon`：基底名是哪个武器的技能名就用哪个
                let base = &self.settings.base_name;
                if self
                    .melee_weapon_skills()
                    .iter()
                    .any(|skill| &skill.name == base)
                {
                    Some(WeaponRef::Melee)
                } else if self
                    .ranged_weapon_skills()
                    .iter()
                    .any(|skill| &skill.name == base)
                {
                    Some(WeaponRef::Ranged)
                } else if self
                    .skill_weapon_skills()
                    .iter()
                    .any(|skill| &skill.name == base)
                    || self
                        .skill_weapon
                        .as_ref()
                        .map(|weapon| &weapon.name == base)
                        .unwrap_or(false)
                {
                    Some(WeaponRef::Skill)
                } else {
                    None
                }
            }
        }
    }

    /// 同律武器有继承关系时，取被继承武器。
    fn inherited_target(&self, target: WeaponRef) -> WeaponRef {
        if target != WeaponRef::Skill {
            return target;
        }
        match self
            .skill_weapon
            .as_ref()
            .and_then(|weapon| weapon.inherit.as_deref())
        {
            Some("melee") => WeaponRef::Melee,
            Some("ranged") => WeaponRef::Ranged,
            _ => WeaponRef::Skill,
        }
    }

    /// 武器类别的借用版本，避免面板计算逐次克隆；对应上游武器 `category`。
    pub fn weapon_category_ref(&self, target: WeaponRef) -> &str {
        match target {
            WeaponRef::Melee => &self.melee_weapon.category,
            WeaponRef::Ranged => &self.ranged_weapon.category,
            WeaponRef::Skill => self
                .skill_weapon
                .as_ref()
                .map(|weapon| weapon.category.as_str())
                .unwrap_or(""),
            WeaponRef::Selected => {
                self.weapon_category_ref(self.resolve_weapon_ref(None).unwrap_or(WeaponRef::Melee))
            }
        }
    }

    pub fn weapon_category(&self, target: WeaponRef) -> String {
        self.weapon_category_ref(target).to_string()
    }

    #[allow(clippy::type_complexity)]
    fn weapon_bases_of(&self, target: WeaponRef) -> (f64, f64, f64, f64, f64, f64, f64, f64) {
        match target {
            WeaponRef::Skill => match self.skill_weapon.as_ref() {
                Some(weapon) => (
                    weapon.base_attack,
                    weapon.base_crit,
                    weapon.base_crit_damage,
                    weapon.base_trigger,
                    weapon.attack_speed,
                    0.0,
                    0.0,
                    0.0,
                ),
                None => (0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0),
            },
            WeaponRef::Ranged => (
                self.ranged_weapon.base_attack,
                self.ranged_weapon.base_crit,
                self.ranged_weapon.base_crit_damage,
                self.ranged_weapon.base_trigger,
                self.ranged_weapon.attack_speed.unwrap_or(1.0),
                self.ranged_weapon.reload,
                self.ranged_weapon.magazine,
                self.ranged_weapon.ammo,
            ),
            _ => (
                self.melee_weapon.base_attack,
                self.melee_weapon.base_crit,
                self.melee_weapon.base_crit_damage,
                self.melee_weapon.base_trigger,
                self.melee_weapon.attack_speed.unwrap_or(1.0),
                self.melee_weapon.reload,
                self.melee_weapon.magazine,
                self.melee_weapon.ammo,
            ),
        }
    }

    /// 参与充盈威力汇总的武器；对应上游 `getAllFullnessWeapons`。
    pub fn fullness_weapons(&self) -> Vec<WeaponRef> {
        let mut result = Vec::new();
        if !self.melee_weapon.is_empty() {
            result.push(WeaponRef::Melee);
        }
        if !self.ranged_weapon.is_empty() {
            result.push(WeaponRef::Ranged);
        }
        if self
            .skill_weapon
            .as_ref()
            .map(|weapon| weapon.inherit.is_none())
            .unwrap_or(false)
        {
            result.push(WeaponRef::Skill);
        }
        result
    }

    /// 单把武器的触发率与充盈转化；对应上游 `getWeaponFullness`。
    pub fn weapon_fullness(&self, target: WeaponRef) -> (f64, f64) {
        let prefix: &str = self.weapon_prefix_ref(target);
        if prefix.is_empty() {
            return (0.0, 1.0);
        }
        let mut trigger_bonus = self.total_bonus(&prefixed(prefix, "触发"), prefix, true)
            + self.total_bonus("触发", prefix, true);
        if prefix.starts_with("同律") {
            let lower: String = prefix.chars().skip(2).collect();
            trigger_bonus += self.total_bonus(&prefixed(&lower, "触发"), &lower, false);
        }
        // 元组顺序是（攻击, 暴击, 暴伤, 触发, 攻速, 装填, 弹匣, 弹药）——触发在第 4 位
        let (_, _, _, base_trigger, _, _, _, _) = self.weapon_bases_of(target);
        let trigger_rate = round2(base_trigger * (1.0 + trigger_bonus));
        let conversion = 1.0 + self.total_bonus("充盈转化", prefix, true);
        (trigger_rate, conversion)
    }

    /// 单把武器的攻速与召唤物攻速转化；对应上游 `getWeaponSummonSpeed`。
    fn weapon_summon_speed(&self, target: WeaponRef) -> (f64, f64) {
        let prefix: &str = self.weapon_prefix_ref(target);
        if prefix.is_empty() {
            return (0.0, 0.0);
        }
        let mut speed_bonus = self.total_bonus(&prefixed(prefix, "攻速"), prefix, true)
            + self.total_bonus("攻速", prefix, true);
        if prefix.starts_with("同律") {
            let lower: String = prefix.chars().skip(2).collect();
            speed_bonus += self.total_bonus(&prefixed(&lower, "攻速"), &lower, false);
        }
        let (_, _, _, _, base_speed, _, _, _) = self.weapon_bases_of(target);
        let attack_speed = base_speed * (1.0 + speed_bonus.min(2.0));
        let conversion = self.total_bonus("召唤物攻击速度转化", prefix, true);
        (attack_speed, conversion)
    }

    /// 武器的属性前缀（`近战` / `远程` / `同律近战` / `同律远程`）。
    pub fn weapon_prefix(&self, target: WeaponRef) -> String {
        self.weapon_prefix_ref(target).to_string()
    }

    /// 武器属性前缀的借用版本，避免高频调用逐次分配；语义与 [`Self::weapon_prefix`] 一致。
    pub fn weapon_prefix_ref(&self, target: WeaponRef) -> &str {
        match target {
            WeaponRef::Melee => "近战",
            WeaponRef::Ranged => "远程",
            WeaponRef::Skill => self
                .skill_weapon
                .as_ref()
                .map(|weapon| weapon.kind.as_str())
                .unwrap_or(""),
            WeaponRef::Selected => "",
        }
    }
}
