//! 收益试算（`CharBuild.calcIncome/calcEquippedModIncome/calcReplacementModIncome`，
//! `CharBuild.ts:4319-4496`；武器整槽替换 `CharBuildHelper.calcWeaponReplacementIncomes:132-162`）。
//!
//! 口径（注释标 TS 行号锚点）：
//! - 附加口径 `calcIncome`（`4319-4392`）：动态 BUFF 先 `prepareBuff`（`4320-4322`，
//!   刷新 `attr` 表达式再算）+ 零基线→`0` 保护（`4345/4388-4390`，`|mval|<EPS → 0`）。
//!   本移植经“改写后 `CharSettings` 克隆体重建”求值：动态 `attr` 在新上下文装配期
//!   自然刷新（`apply_buff_attr`），等价于 `prepareBuff`；`minusAttr` 的静态值取反
//!   与“移除重算”数学等价（加法池直接抵消；乘法池 `getMinusAttrValue`
//!   `minusAttr.ts:19-28` 的乘法逆元同样恰好抵消），故移除口径统一走重建移除。
//!   唯一已知差异：`minusAttr` 把 `极性` 置空（`LeveledMod.ts:635-643`），不参与极性计数；
//!   真实移除会减少极性计数——`趋向`条件 MOD 的移除收益以真实移除为准（更准）。
//! - 已装槽 `calcEquippedModIncome`（`4417-4452`）：克隆移除指定槽位后重算
//!   （`4424-4446`），`!removedValue → 0`（`4447-4449`）；同律按 `inherit` 重定向
//!   到近战/远程（`4419-4421`）。
//! - 替换 `calcReplacementModIncome`（`4464-4496`）：替换后/当前 `- 1`（`4495`），
//!   当前基线 `|base|<EPS → 0`（`4471`）；槽位越界退化附加口径（`4490`）。
//! - 武器整槽替换（`CharBuildHelper.ts:132-162`）：候选默认等级/精炼（`149` 附近，
//!   `fromData(weapon, undefined, undefined, …)` 即满级/满精）、熔炼判定同步
//!   （`151`，`setForgeEffective(isWeaponCategoryMastered)`——本移植在
//!   `BuildContext::new` 内自动完成）、目标 `0 → 收益 0`（`143-146`）、克隆上执行
//!   （`141`，本移植为重建求值，不碰原配置）。
//!
//! 实现口径：内部走 `clone + 重算`（重建 `BuildContext`），不做 delta；
//! API 形状定死为单次调用携全部候选。

use super::config::{CharSettings, ModSlot};
use super::context::BuildContext;
use super::models::{LeveledBuff, LeveledMod};
use super::tables::BuildTables;
use super::timeline::{RawTimelineData, calculate_request};

/// 浮点零基线阈值（TS `Number.EPSILON`，`CharBuild.ts:4345/4388`）。
const EPS: f64 = f64::EPSILON;

/// MOD 槽位键（`CharBuild.ts:5535 ModTypeKey`）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModSlotKey {
    Char,
    Melee,
    Ranged,
    Skill,
}

impl ModSlotKey {
    /// 同律按 `inherit` 重定向到近战/远程（`CharBuild.ts:4419-4421/4466-4468`）。
    pub fn resolve(self, skill_inherit: Option<&str>) -> Self {
        match (self, skill_inherit) {
            (Self::Skill, Some("melee")) => Self::Melee,
            (Self::Skill, Some("ranged")) => Self::Ranged,
            _ => self,
        }
    }

    /// 从 TS 槽位键名解析（`charMods/meleeMods/rangedMods/skillMods` 及其 `Mods` 后缀缺省形态）。
    pub fn from_json_value(value: &serde_json::Value) -> Option<Self> {
        match value.as_str()? {
            "charMods" | "char" | "角色" => Some(Self::Char),
            "meleeMods" | "melee" | "近战" => Some(Self::Melee),
            "rangedMods" | "ranged" | "远程" => Some(Self::Ranged),
            "skillMods" | "skill" | "同律" | "skillWeaponMods" => Some(Self::Skill),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Char => "charMods",
            Self::Melee => "meleeMods",
            Self::Ranged => "rangedMods",
            Self::Skill => "skillMods",
        }
    }
}
/// 特效等级键的 id 部分（`m:<id>` / `w:<id>` 的 id 格式化；autobuild 复用）。
pub fn income_effect_key(id: i64) -> String {
    id.to_string()
}

/// 槽位数组可变引用。
fn slot_vec_mut(settings: &mut CharSettings, key: ModSlotKey) -> &mut Vec<ModSlot> {
    match key {
        ModSlotKey::Char => &mut settings.char_mods,
        ModSlotKey::Melee => &mut settings.melee_mods,
        ModSlotKey::Ranged => &mut settings.ranged_mods,
        ModSlotKey::Skill => &mut settings.skill_mods,
    }
}

/// 写入特效等级覆盖（`m:<id>` / `w:<id>`，`config.rs: effect_config`）。
fn set_effect_level(settings: &mut CharSettings, prefix: &str, id: i64, level: f64) {
    let key = format!("{prefix}:{id}");
    if let Some(entry) = settings
        .effect_config
        .iter_mut()
        .find(|(name, _)| *name == key)
    {
        entry.1 = level;
    } else {
        settings.effect_config.push((key, level));
    }
}

/// 按 `类型` 把候选 MOD 追加到对应槽位（首个空槽，无空槽则追加到末尾；
/// TS `calcIncome` 的 `tempMod` 不占槽位但照样生效——重建口径下追加等价）。
fn push_mod_to_slot(
    settings: &mut CharSettings,
    kind: &str,
    id: i64,
    level: f64,
    buff_level: Option<f64>,
) {
    let key = if kind == "角色" {
        ModSlotKey::Char
    } else if kind == "近战" {
        ModSlotKey::Melee
    } else if kind == "远程" {
        ModSlotKey::Ranged
    } else if kind.starts_with("同律") {
        ModSlotKey::Skill
    } else {
        // 未知类型：落角色槽（TS `tempMod` 同样全局生效，见文件头注释）。
        ModSlotKey::Char
    };
    if let Some(buff_level) = buff_level {
        set_effect_level(settings, "m", id, buff_level);
    }
    let slots = slot_vec_mut(settings, key);
    if let Some(slot) = slots.iter_mut().find(|slot| slot.is_none()) {
        *slot = Some((id, level));
    } else {
        slots.push(Some((id, level)));
    }
}

/// 顶层求值（`calculate`，含时间轴分发；`timeline` 来自调用方 `BuildRequest.timeline`）。
pub fn build_value(
    tables: &BuildTables,
    char_id: i64,
    settings: &CharSettings,
    timeline: Option<&RawTimelineData>,
) -> f64 {
    calculate_request(
        tables,
        &super::evaluate::BuildRequest {
            char_id,
            settings: settings.clone(),
            seed: None,
            timeline: timeline.cloned(),
        },
    )
}

/// 附加口径：候选 MOD 追加后的收益（`CharBuild.ts:4319-4392 calcIncome` 附加分支）。
///
/// `base` 缺省现算；当前总伤害 `|base|<EPS → 0`（`4388-4390`）。
pub fn calc_income_mod(
    tables: &BuildTables,
    char_id: i64,
    settings: &CharSettings,
    candidate: &LeveledMod,
    timeline: Option<&RawTimelineData>,
    base: Option<f64>,
) -> f64 {
    let base = base.unwrap_or_else(|| build_value(tables, char_id, settings, timeline));
    if base.abs() < EPS {
        return 0.0;
    }
    let mut owned = settings.clone();
    push_mod_to_slot(
        &mut owned,
        &candidate.kind,
        candidate.id,
        candidate.level,
        candidate.buff.as_ref().map(|buff| buff.level),
    );
    let value = build_value(tables, char_id, &owned, timeline);
    value / base - 1.0
}

/// 附加口径：候选 BUFF 追加后的收益（`calcIncome` BUFF 分支，`4371-4381`）。
///
/// 动态 `attr` BUFF 在新上下文装配期自然刷新，等价于 `prepareBuff`（`4320-4322`）。
pub fn calc_income_buff(
    tables: &BuildTables,
    char_id: i64,
    settings: &CharSettings,
    buff: &LeveledBuff,
    timeline: Option<&RawTimelineData>,
    base: Option<f64>,
) -> f64 {
    let base = base.unwrap_or_else(|| build_value(tables, char_id, settings, timeline));
    if base.abs() < EPS {
        return 0.0;
    }
    let mut owned = settings.clone();
    owned
        .buffs
        .push((buff.name.clone(), buff.level, Some(buff.coverage)));
    let value = build_value(tables, char_id, &owned, timeline);
    value / base - 1.0
}

/// 已装备 BUFF 的边际收益：移除同名 BUFF 后重算（`calcEquippedBuffIncome:4399-4407`）。
///
/// 覆盖动态 `attr` BUFF 的移除路径（`4432-433` 分流到此）与 `code` 复合 BUFF
/// 双槽移除（`4428-4429`，重建口径下 `settings.buffs` 即双槽之源）。
/// `|without|<EPS → 0`（`4405`）。
pub fn calc_equipped_buff_income(
    tables: &BuildTables,
    char_id: i64,
    settings: &CharSettings,
    buff_name: &str,
    timeline: Option<&RawTimelineData>,
    base: Option<f64>,
) -> f64 {
    let base = base.unwrap_or_else(|| build_value(tables, char_id, settings, timeline));
    let mut owned = settings.clone();
    owned.buffs.retain(|(name, _, _)| name != buff_name);
    let without = build_value(tables, char_id, &owned, timeline);
    if without.abs() < EPS {
        return 0.0;
    }
    base / without - 1.0
}

/// 已装备 MOD 的边际收益：移除指定槽位后重算（`calcEquippedModIncome:4417-4452`）。
///
/// 同律按 `inherit` 重定向（`4419-4421`）；未知槽位键返回 `0`（`4442-4443`）；
/// `!removedValue → 0`（`4447-4449`）。槽位越界返回 `0`
/// （TS 对越界数组写 `null` 等价无操作，收益为 `0`）。
/// 参数按 TS `calcEquippedModIncome:4417-4452` 调用形逐项展开（8 项对齐上游签名，
/// 打包反而失配）；`too_many_arguments` 系对签需要。
#[allow(clippy::too_many_arguments)]
pub fn calc_equipped_mod_income(
    tables: &BuildTables,
    char_id: i64,
    settings: &CharSettings,
    skill_inherit: Option<&str>,
    key: ModSlotKey,
    index: usize,
    timeline: Option<&RawTimelineData>,
    base: Option<f64>,
) -> f64 {
    let key = key.resolve(skill_inherit);
    let base = base.unwrap_or_else(|| build_value(tables, char_id, settings, timeline));
    let mut owned = settings.clone();
    let slots = slot_vec_mut(&mut owned, key);
    let Some(slot) = slots.get_mut(index) else {
        return 0.0;
    };
    if slot.is_none() {
        return 0.0;
    }
    *slot = None;
    let removed = build_value(tables, char_id, &owned, timeline);
    if removed == 0.0 {
        return 0.0;
    }
    base / removed - 1.0
}

/// 候选 MOD 替换指定槽位后的收益（`calcReplacementModIncome:4464-4496`）。
///
/// `|base|<EPS → 0`（`4471`）；槽位越界退化附加口径（`4490`）。
/// 参数按 TS `calcReplacementModIncome:4464-4496` 调用形逐项展开（9 项对齐上游签名，
/// 打包反而失配）；`too_many_arguments` 系对签需要。
#[allow(clippy::too_many_arguments)]
pub fn calc_replacement_mod_income(
    tables: &BuildTables,
    char_id: i64,
    settings: &CharSettings,
    skill_inherit: Option<&str>,
    key: ModSlotKey,
    index: usize,
    candidate: &LeveledMod,
    timeline: Option<&RawTimelineData>,
    base: Option<f64>,
) -> f64 {
    let base = base.unwrap_or_else(|| build_value(tables, char_id, settings, timeline));
    if base.abs() < EPS {
        return 0.0;
    }
    let key = key.resolve(skill_inherit);
    let mut owned = settings.clone();
    {
        let slots = slot_vec_mut(&mut owned, key);
        if index >= slots.len() {
            // 越界退化附加口径（`4490`）。
            return calc_income_mod(tables, char_id, settings, candidate, timeline, Some(base));
        }
        slots[index] = Some((candidate.id, candidate.level));
    }
    if let Some(buff_level) = candidate.buff.as_ref().map(|buff| buff.level) {
        set_effect_level(&mut owned, "m", candidate.id, buff_level);
    }
    let value = build_value(tables, char_id, &owned, timeline);
    value / base - 1.0
}

/// 武器候选（整槽替换收益的输入；等级/精炼缺省最大值，见 `CharBuildHelper.ts:126`）。
#[derive(Debug, Clone)]
pub struct WeaponCandidate {
    pub id: i64,
    pub level: f64,
    pub refine: f64,
    pub effect_level: Option<f64>,
}

impl WeaponCandidate {
    /// 默认满级/满精（候选列表既有语义：默认最大值）。
    pub fn maxed(id: i64) -> Self {
        Self {
            id,
            level: 80.0,
            refine: 5.0,
            effect_level: None,
        }
    }
}

/// 候选武器逐把替换进对应槽位后的收益（`CharBuildHelper.calcWeaponReplacementIncomes:132-162`）。
///
/// 按武器记录 `类型[0]` 定槽位（近战/远程）；未知武器 id 的收益为 `0`；
/// 当前总伤害为 `0` 时全部返回 `0`（`143-146`）；全程重建求值，不改原配置（`141`）。
/// 熔炼判定同步由 `BuildContext::new` 按精通自动完成（`151`）。
pub fn calc_weapon_replacement_incomes(
    tables: &BuildTables,
    char_id: i64,
    settings: &CharSettings,
    candidates: &[WeaponCandidate],
    timeline: Option<&RawTimelineData>,
) -> Vec<(i64, f64)> {
    if candidates.is_empty() {
        return Vec::new();
    }
    let current = build_value(tables, char_id, settings, timeline);
    if current == 0.0 {
        return candidates.iter().map(|item| (item.id, 0.0)).collect();
    }
    candidates
        .iter()
        .map(|candidate| {
            let Some(source) = tables.weapons.get(&candidate.id) else {
                return (candidate.id, 0.0);
            };
            let is_melee = source.data.text_eq("类型", "近战");
            let mut owned = settings.clone();
            if is_melee {
                owned.melee_weapon = candidate.id;
                owned.melee_weapon_level = candidate.level;
                owned.melee_weapon_refine = candidate.refine;
            } else {
                owned.ranged_weapon = candidate.id;
                owned.ranged_weapon_level = candidate.level;
                owned.ranged_weapon_refine = candidate.refine;
            }
            if let Some(effect_level) = candidate.effect_level {
                set_effect_level(&mut owned, "w", candidate.id, effect_level);
            }
            let value = build_value(tables, char_id, &owned, timeline);
            (candidate.id, value / current - 1.0)
        })
        .collect()
}

impl<'a> BuildContext<'a> {
    /// 当前 `BuildRequest.timeline` 对应的顶层值（含时间轴分发，供收益基线用）。
    fn income_base(&self, timeline: Option<&RawTimelineData>) -> f64 {
        build_value(self.tables, self.char.id, &self.settings, timeline)
    }

    /// 当前同律继承槽位（`melee` / `ranged`），供槽位重定向用。
    fn income_inherit(&self) -> Option<&str> {
        self.skill_weapon
            .as_ref()
            .and_then(|weapon| weapon.inherit.as_deref())
    }

    /// 附加口径：候选 MOD 追加收益（`calcIncome` MOD 分支）。
    pub fn calc_income_mod(
        &self,
        candidate: &LeveledMod,
        timeline: Option<&RawTimelineData>,
        base: Option<f64>,
    ) -> f64 {
        let base = base.unwrap_or_else(|| self.income_base(timeline));
        calc_income_mod(
            self.tables,
            self.char.id,
            &self.settings,
            candidate,
            timeline,
            Some(base),
        )
    }

    /// 附加口径：候选 BUFF 追加收益（`calcIncome` BUFF 分支）。
    pub fn calc_income_buff(
        &self,
        buff: &LeveledBuff,
        timeline: Option<&RawTimelineData>,
        base: Option<f64>,
    ) -> f64 {
        let base = base.unwrap_or_else(|| self.income_base(timeline));
        calc_income_buff(
            self.tables,
            self.char.id,
            &self.settings,
            buff,
            timeline,
            Some(base),
        )
    }

    /// 已装备 BUFF 边际收益（`calcEquippedBuffIncome`）。
    pub fn calc_equipped_buff_income(
        &self,
        buff_name: &str,
        timeline: Option<&RawTimelineData>,
        base: Option<f64>,
    ) -> f64 {
        let base = base.unwrap_or_else(|| self.income_base(timeline));
        calc_equipped_buff_income(
            self.tables,
            self.char.id,
            &self.settings,
            buff_name,
            timeline,
            Some(base),
        )
    }

    /// 已装备 MOD 边际收益（`calcEquippedModIncome`）。
    pub fn calc_equipped_mod_income(
        &self,
        key: ModSlotKey,
        index: usize,
        timeline: Option<&RawTimelineData>,
        base: Option<f64>,
    ) -> f64 {
        let inherit = self.income_inherit().map(str::to_string);
        let base = base.unwrap_or_else(|| self.income_base(timeline));
        calc_equipped_mod_income(
            self.tables,
            self.char.id,
            &self.settings,
            inherit.as_deref(),
            key,
            index,
            timeline,
            Some(base),
        )
    }

    /// 替换口径收益（`calcReplacementModIncome`）。
    pub fn calc_replacement_mod_income(
        &self,
        key: ModSlotKey,
        index: usize,
        candidate: &LeveledMod,
        timeline: Option<&RawTimelineData>,
        base: Option<f64>,
    ) -> f64 {
        let inherit = self.income_inherit().map(str::to_string);
        let base = base.unwrap_or_else(|| self.income_base(timeline));
        calc_replacement_mod_income(
            self.tables,
            self.char.id,
            &self.settings,
            inherit.as_deref(),
            key,
            index,
            candidate,
            timeline,
            Some(base),
        )
    }

    /// 武器整槽替换收益（`calcWeaponReplacementIncomes`）。
    pub fn calc_weapon_replacement_incomes(
        &self,
        candidates: &[WeaponCandidate],
        timeline: Option<&RawTimelineData>,
    ) -> Vec<(i64, f64)> {
        calc_weapon_replacement_incomes(
            self.tables,
            self.char.id,
            &self.settings,
            candidates,
            timeline,
        )
    }
}
