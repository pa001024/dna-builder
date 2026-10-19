//! 构筑求值的内部状态：把数据表 + 配置装配成一份可反复查询的构筑对象。
//!
//! 对应上游 `CharBuild` 实例化后的状态部分（构造函数 + `set char` + `mods` 派生列表 +
//! `bonusSourceTable`）。上游把这一切揉在一个可变类里，并用「版本号」做缓存失效；
//! 这里是**一次性构建、只读查询**，因此不需要缓存层——直接算好各张展开表即可。
//!
//! 顺序敏感迭代路径清单（全 crate 统一放在这里）：
//! - 顺序**敏感**（保序：Vec 键值对 / 数组原序 / 记录 `keys()` 原序，不引新依赖）：
//!   1. `run_dynamic_buff_codes` 全局 code 按 `dynamic_buffs` 装配序逐条施加
//!      （code 有副作用——写 attrs/面板——必须保装配序；见 attributes.rs）；
//!   2. `conditional_buff_props_list` 同条件条目按 buffs 装配序聚合（Vec 插入序）；
//!   3. `LeveledBuff.base_keys` 由 `Record.keys()` 原序收集，武器 `update_properties`
//!      按该原序写 props（models.rs）；
//!   4. 技能字段表 `fields_with_attr` 按 `self.字段` 数组原序生成，
//!      AST 求值 `field_of` 取首个命中（models.rs / ast_eval.rs）；
//!   5. 同律武器聚合 `aggregate_skill_weapon_fields` 按角色技能数组原序收集伤害字段；
//!   6. `CHARACTER_BONUS_ATTRIBUTES` 40 项顺序即上游 `characterBonusAttributes` 原序
//!      （仅用于遍历求和，顺序本身不影响数值，保序为对齐可读性）。
//! - 顺序**不敏感**（保留 `BTreeMap`/`HashMap`，求和/查表语义与顺序无关）：
//!   `AttrMap`（BTreeMap，有序快照利于断言）、`BonusSourceTable` 各池的加和、
//!   `weapons_by_base` / `weapon_panels` / `damage_cache` / `conditional_buff_cache` 查表。
//!   TS 侧 `Map` 插入序 vs Rust `BTreeMap` 键序：数值求和可交换故无差异；
//!   唯一曾被怀疑的 `baseValue`（`evaluate_format` `{}`/`{%}` 交替计数）走出现序计数，
//!   与 map 顺序无关（见 ast_eval.rs `evaluate_format`）。

use std::collections::HashMap;

use serde_json::Value;

use super::config::{CharSettings, ModSlot, resolve_skill_level};
use super::dynamic::{self, CodeEnv};
use super::models::{
    AttrMap, BuffFieldConditional, LeveledBuff, LeveledChar, LeveledMod, LeveledMonster,
    LeveledSkill, LeveledSkillWeapon, LeveledWeapon, is_multiplicative_attr,
};
use super::record::Record;
use super::tables::BuildTables;

/// 条件属性条目（`apply_conditional_attrs` 内收集的待应用属性）：
/// 属性名 + 标量值 + `[倍率, 上限]` 对。
type ConditionalProp = (String, Option<f64>, Option<(f64, f64)>);

/// 默认怪物（id130 未知怪）记录模板：装配占位随后即被替换，进程级只建一次。
fn default_enemy_record() -> Record {
    static RECORD: std::sync::LazyLock<Record> = std::sync::LazyLock::new(|| {
        Record::from_value(&serde_json::json!({"id": 130, "n": "未知", "atk": 0, "def": 0, "hp": 0}))
    });
    RECORD.clone()
}

pub fn prefix_scope(prefix: &str) -> &str {
    if prefix.starts_with("同律近战") {
        "同律近战"
    } else if prefix.starts_with("同律远程") {
        "同律远程"
    } else if prefix.starts_with("近战") {
        "近战"
    } else if prefix.starts_with("远程") {
        "远程"
    } else {
        prefix
    }
}

/// MOD 作用域桶下标（`mods_by_scope` 数组索引）；未知作用域返回 `None`（查不到，等价于旧哈希表的 miss）。
fn scope_bucket_index(scope: &str) -> Option<usize> {
    match scope {
        "角色" => Some(0),
        "近战" => Some(1),
        "远程" => Some(2),
        "同律近战" => Some(3),
        "同律远程" => Some(4),
        _ => None,
    }
}

/// 「来源 → 属性」汇总表；对应上游 `buildBonusSourceTable`。
///
/// 字段名与上游一致，便于对照阅读。
#[derive(Debug, Clone, Default)]
pub struct BonusSourceTable {
    /// 角色自带的 `加成`。
    pub char: AttrMap,
    /// 近战武器的 `加成` + 效果层。
    pub melee: AttrMap,
    /// 远程武器的 `加成` + 效果层。
    pub ranged: AttrMap,
    /// 武器效果层（两把武器合并，按 BUFF 口径汇总）。
    pub weapon_buff_props: AttrMap,
    /// 全部 MOD 的词条（按作用域分桶；下标见 `scope_bucket_index`）。
    pub mods_by_scope: [AttrMap; 5],
    /// 角色槽 MOD 的词条（可穿透到武器的属性用）。
    pub mods_char: AttrMap,
    /// 全部 MOD 的词条（作用域为空时用）。
    pub mods_all: AttrMap,
    /// 全部 MOD 的 BUFF 层属性（`@` 前缀）。
    pub mods_buff_props: AttrMap,
    /// 全部 BUFF 的属性。
    pub buffs: AttrMap,
}

/// 构筑实例：一次性装配完成的只读快照。
///
/// `Clone` 供时间轴/收益/自动配装的 `clone().applyBuffs` 等价路径（见 `timeline.rs`）；
/// 热循环应避免克隆。
#[derive(Debug, Clone)]
pub struct BuildContext<'a> {
    pub tables: &'a BuildTables,
    /// 构筑配置的**拥有式**快照：自动配装需要在同一上下文中增量改配置
    /// （追加一个候选 MOD），借用调用方的 `settings` 会让状态无法原地更新。
    pub settings: CharSettings,
    pub char: LeveledChar,
    pub aura_mod: Option<LeveledMod>,
    pub char_mods: Vec<LeveledMod>,
    pub melee_mods: Vec<LeveledMod>,
    pub ranged_mods: Vec<LeveledMod>,
    pub skill_mods: Vec<LeveledMod>,
    pub melee_weapon: LeveledWeapon,
    pub ranged_weapon: LeveledWeapon,
    pub skill_weapon: Option<LeveledSkillWeapon>,
    /// 全部 BUFF 实例（装配序，唯一存身处；纯 `code` 也在内，聚合循环按槽位语义过滤）。
    pub buffs: Vec<LeveledBuff>,
    /// 与 `buffs` 下标对齐的生效标记：BUFF 数据 `禁用` 命中任一已装备 MOD id 时为 false，
    /// 不参与属性汇总 / 减伤 / 乘法 / 条件 / code 施加。MOD 增删后由
    /// [`Self::refresh_buff_activation`] 重算。
    pub buff_active: Vec<bool>,
    /// 动态槽位：`buffs` 的下标（装配序），取代整表深拷贝。
    pub dynamic_buffs: Vec<usize>,
    pub enemy: LeveledMonster,
    /// 全部 MOD（四槽 + 中枢），顺序与上游 `mods` 一致。
    pub mods: Vec<usize>,
    /// 基础加成表。
    pub source_table: BonusSourceTable,
    /// 条件BUFF字段级增量缓存；对应上游 `scopedCodeConditionalsCache`。
    /// 一次性构建的上下文里只需防同一次求值内重复差分。
    pub(crate) conditional_props_cache: Option<Vec<BuffFieldConditional>>,
    /// 技能字段表缓存（`Evaluator::new` 输入三元组的版本键缓存）。
    /// 输入（收敛属性/条件增量/远程多重）全部是上下文状态的纯函数，
    /// 同一 `memo.version` 下逐位一致；状态变更经 `invalidate_derived` 清空。
    /// 上游 `createAstEvalContext` 每次重建，本移植为批量复用同一会话而缓存
    /// （单次求值仍是冷构建，行为一致）。

    /// 条件 code 差分基线是否正在计算中（重入保护标志，对应上游 `scopedCodeComputing`）。
    /// 基线计算内部经 attr 型 BUFF 的表达式求值会再次进入差分函数，
    /// 此时直接返回空（基线本就不含条件 code），同时掐断无限递归。
    pub(crate) scoped_code_computing: bool,
    /// 召唤物继承比例等按字段上下文查询时需要原属性。
    pub custom_variables: HashMap<String, String>,
    /// 团队武器类别（协战武器）。
    pub team_weapon_categories: Vec<String>,
    /// 装配期缺失资源信息（下线 MOD/BUFF，TS 严格口径整份失败用）。
    /// `BuildContext::new` 在装配后检查：非空即返回 `None`。
    pub missing_resource: Option<String>,
    /// 求值记忆：状态版本号 + 属性 / 武器面板结果缓存（见 [`EvalMemo`]）。
    pub(crate) memo: EvalMemo,
    /// DOT 频率分解缓存（版本键；同一状态下的多次 `DOT伤害` 查询共享一次计算）。
    pub(crate) dot_cache: Option<(u64, std::sync::Arc<Vec<super::damage::DotSourceFreq>>)>,
    /// `code` 沙盒的 MOD 槽位词条表（版本键）。
    pub(crate) mod_maps_cache: Option<(u64, std::sync::Arc<HashMap<String, AttrMap>>)>,
    /// `code` 沙盒的只读基础值子对象（与构筑武器绑定，上下文生命周期内不变）。
    pub(crate) code_bases_cache: Option<std::sync::Arc<HashMap<String, AttrMap>>>,
    /// 武器技能（含 MOD 技能替换）一次装配后不变，懒建一次。
    skill_lists: std::sync::OnceLock<std::sync::Arc<SkillLists>>,
    pub(crate) eval_statics: Option<EvalStatics>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct EvalStatics {
    variables: Vec<(String, String)>,
    skill_lists_addr: usize,
    pub variable_asts: HashMap<String, std::sync::Arc<crate::ast_parser::AstNode>>,
    pub skill_keys: HashMap<String, String>,
    pub functions: HashMap<String, (Vec<String>, String)>,
    pub function_asts: HashMap<String, std::sync::Arc<crate::ast_parser::AstNode>>,
}

/// 装配后不变的技能列表快照。
#[derive(Debug, Default)]
pub struct SkillLists {
    pub melee: Vec<LeveledSkill>,
    pub ranged: Vec<LeveledSkill>,
    pub skill: Vec<LeveledSkill>,
    pub by_base: HashMap<String, WeaponRef>,
}

/// 属性计算记忆化。
///
/// `version` 在任何会影响属性结果的状态变更（条件 MOD 改写、BUFF attr 刷新、
/// BUFF 入列、字段表 / 条件缓存重建）时递增；结果只在「计算期间版本未变」时入表，
/// 命中即与重算逐位一致。
#[derive(Debug, Clone)]
pub(crate) struct EvalMemo {
    pub version: u64,
    /// 来源表对应的状态版本（`None` 表示尚未建表）。
    pub source_version: Option<u64>,
    pub attrs: [Option<(u64, AttrMap)>; 8],
    /// `code` 之前的属性基座（`nocode`/`code` 两个变体共用同一份）。
    pub base_attrs: [Option<(u64, AttrMap)>; 8],
    pub weapon: [Option<(
        u64,
        super::attributes::WeaponAttributes,
    )>; 40],
}

impl Default for EvalMemo {
    fn default() -> Self {
        Self {
            version: 0,
            source_version: None,
            attrs: std::array::from_fn(|_| None),
            base_attrs: std::array::from_fn(|_| None),
            weapon: std::array::from_fn(|_| None),
        }
    }
}

impl EvalMemo {
    pub fn bump(&mut self) {
        self.version += 1;
        self.attrs = std::array::from_fn(|_| None);
        self.base_attrs = std::array::from_fn(|_| None);
        self.weapon = std::array::from_fn(|_| None);
    }

    /// 来源表已按当前状态重建后调用：版本递增且来源表视为最新。
    pub fn bump_with_source(&mut self) {
        self.bump();
        self.source_version = Some(self.version);
    }
}

/// 属性记忆下标：`memo_key` 的低 2 位是参数、高 4 位是重入标志，压缩到 0-7。
pub(crate) fn memo_slot(key: u8) -> usize {
    ((key & 3) | ((key >> 4) << 2)) as usize
}

/// 武器记忆下标：槽位（`None`/近战/远程/同律/`Selected`）× 8 属性槽。
pub(crate) fn memo_weapon_slot(key: u8, weapon: Option<WeaponRef>) -> usize {
    let slot = match weapon {
        None => 0,
        Some(WeaponRef::Melee) => 1,
        Some(WeaponRef::Ranged) => 2,
        Some(WeaponRef::Skill) => 3,
        Some(WeaponRef::Selected) => 4,
    };
    slot * 8 + memo_slot(key)
}

impl<'a> BuildContext<'a> {
    /// 装配一份构筑；对应上游 `createCharBuildFromSettings` + `new CharBuild(...)`。
    ///
    /// 返回 `None` 表示关键数据缺失（角色记录/武器记录查不到），调用方应提示而不是崩。
    pub fn new(tables: &'a BuildTables, char_id: i64, settings: &CharSettings) -> Option<Self> {
        crate::prof!("context::new");
        // 角色：上游 `LeveledCharHelper.fromId` 支持「id > 9999 时右移两位」（皎皎角用的 6 位 id）
        let lookup_id = if char_id > 9999 {
            char_id / 100
        } else {
            char_id
        };
        let char_raw = tables
            .chars
            .get(&lookup_id)
            .or_else(|| tables.chars.get(&char_id))?;
        let char_skill_levels = settings.char_skill_level;
        let char_level = settings.char_level;
        let char = tables.templates.char_cached(
            lookup_id,
            Some(char_level),
            &char_skill_levels,
            || {
                LeveledChar::new(
                    char_raw.clone(),
                    Some(char_level),
                    &char_skill_levels,
                    &crate::const_tables::COMMON_LEVEL_UP,
                )
            },
        );

        let mut context = Self {
            tables,
            settings: settings.clone(),
            char,
            aura_mod: None,
            char_mods: Vec::new(),
            melee_mods: Vec::new(),
            ranged_mods: Vec::new(),
            skill_mods: Vec::new(),
            melee_weapon: LeveledWeapon::empty(),
            ranged_weapon: LeveledWeapon::empty(),
            skill_weapon: None,
            buffs: Vec::new(),
            buff_active: Vec::new(),
            dynamic_buffs: Vec::new(),
            enemy: LeveledMonster::build(
                default_enemy_record(),
                80.0,
                false,
                1.0,
                &crate::const_tables::MOB_LEVEL_UP,
            ),
            mods: Vec::new(),
            source_table: BonusSourceTable::default(),
            conditional_props_cache: None,
            scoped_code_computing: false,
            custom_variables: settings.custom_variables.iter().cloned().collect(),
            team_weapon_categories: Vec::new(),
            missing_resource: None,
            memo: EvalMemo::default(),
            dot_cache: None,
            mod_maps_cache: None,
            code_bases_cache: None,
            skill_lists: std::sync::OnceLock::new(),
            eval_statics: None,
        };

        // MOD 特效等级：上游 `getModBuffLvFromSetting`（无配置时取特效 `mx`，无特效时 1）
        // TS 严格口径：下线 MOD 整份失败（spec §6.4(2)），`?` 转为 `None`。
        let char_mods = build_mods(tables, settings.char_slots(), settings, false).ok()?;
        let melee_mods = build_mods(tables, settings.melee_slots(), settings, false).ok()?;
        let ranged_mods = build_mods(tables, settings.ranged_slots(), settings, false).ok()?;
        let skill_mods = build_mods(tables, settings.skill_slots(), settings, false).ok()?;
        context.aura_mod = {
            // 中枢 0/缺省 = 无中枢（TS `auraMod=0` 不装配）；只有正数 id 才查表。
            let aura = settings.variant_aura();
            if aura > 0 {
                build_mods(tables, &[Some((aura, 10.0))], settings, true)
                    .ok()?
                    .pop()
            } else {
                None
            }
        };

        // 武器（TS 严格口径：未知武器整份失败，spec §6.4(2) 查表入口一致性）
        context.melee_weapon = build_weapon(
            tables,
            settings.melee_weapon,
            settings.melee_weapon_refine,
            settings.melee_weapon_level,
            settings,
            &context.char,
        )?;
        context.ranged_weapon = build_weapon(
            tables,
            settings.ranged_weapon,
            settings.ranged_weapon_refine,
            settings.ranged_weapon_level,
            settings,
            &context.char,
        )?;

        // 同律武器：从角色记录的 `同律武器[0]` 取。
        //
        // 关键：数据包里同律武器**没有** `技能` 字段——它的技能是上游在运行时
        // 从角色技能里筛出来拼的（`CharBuild.set char`）：
        // 取 `同律武器.skill`（默认 `[1]`，即下标 1 的角色技能）作为来源技能，
        // 把其中名称匹配 `同律武器.filter`（默认 `伤害`）且以「伤害」结尾的字段
        // 汇成一条 `同律武器伤害` 技能。少这一步，同律武器的伤害字段会整体取不到。
        if let Some(raw) = char_raw.objs("同律武器").into_iter().next() {
            let mut raw = raw;
            // 同律技能等级取来源技能的最终等级（无来源时退回被动等级，
            // 与 Python SDK 口径一致；上游 `resolveCharSkillLevel(this.skillLevel, syncSourceIndex)`）。
            // 注意：必须在聚合技能写回前读取原始 `skill` 下标（上游同顺序）。
            let sync_index = skill_sync_source_index(&raw);
            if raw.value("技能").is_none() {
                let aggregated = aggregate_skill_weapon_fields(&raw, &context.char);
                if let Some(skill) = aggregated {
                    raw.insert("技能", serde_json::json!([skill]));
                }
            }
            context.skill_weapon = Some(LeveledSkillWeapon::build(
                &raw,
                Some(resolve_skill_level(&settings.char_skill_level, sync_index)),
                Some(settings.char_level),
                &crate::const_tables::COMMON_LEVEL_UP,
            ));
        }

        // MOD 顺序：四槽（角色/近战/远程/同律）→ 中枢；与上游 `mods` 一致
        let mut mods = Vec::new();
        mods.extend(0..char_mods.len());
        let melee_base = char_mods.len();
        mods.extend(melee_base..melee_base + melee_mods.len());
        let ranged_base = melee_base + melee_mods.len();
        mods.extend(ranged_base..ranged_base + ranged_mods.len());
        let skill_base = ranged_base + ranged_mods.len();
        mods.extend(skill_base..skill_base + skill_mods.len());
        let aura_index = skill_base + skill_mods.len();
        if context.aura_mod.is_some() {
            mods.push(aura_index);
        }
        context.mods = mods;
        context.char_mods = char_mods;
        context.melee_mods = melee_mods;
        context.ranged_mods = ranged_mods;
        context.skill_mods = skill_mods;

        // 武器精通 → 熔炼潜能生效；同律继承时同步伤害类型
        let melee_mastered = context.is_weapon_category_mastered(&context.melee_weapon.category);
        context.melee_weapon.set_forge_effective(melee_mastered);
        let ranged_mastered = context.is_weapon_category_mastered(&context.ranged_weapon.category);
        context.ranged_weapon.set_forge_effective(ranged_mastered);
        context.sync_inherited_skill_weapon();

        // BUFF：配置里的 BUFF + 自定义 BUFF（下线 BUFF 整份失败，spec §6.4(2)）
        context.build_buffs();
        if context.missing_resource.is_some() {
            return None;
        }
        // BUFF 生效标记：MOD 数据先装配，`禁用` 互斥可一次性定下初始状态
        context.refresh_buff_activation();
        // 怪物（TS 严格口径：未知怪物整份失败，见 spec §6.4(1)）
        context.enemy = build_enemy(tables, settings).ok()?;

        // 协战武器类别
        context.team_weapon_categories = [settings.team1_weapon, settings.team2_weapon]
            .into_iter()
            .flatten()
            .map(|id| {
                tables
                    .weapons
                    .get(&id)
                    .map(|source| {
                        let types = source.data.texts("类型");
                        types.get(1).cloned().unwrap_or_default()
                    })
                    .unwrap_or_default()
            })
            .filter(|value| !value.is_empty())
            .collect();

        // 技能字段表与条件BUFF增量均由求值会话按需构建，装配期不做预热。
        Some(context)
    }

    /// 判断角色是否精通该武器类别（自带精通 / 全部类型 / 额外精通）。
    pub fn is_weapon_category_mastered(&self, category: &str) -> bool {
        self.char.mastery.iter().any(|item| item == category)
            || self.char.mastery.iter().any(|item| item == "全部类型")
            || category == self.settings.extra_mastery
    }

    /// 魔灵生效技能等级；对应上游 `getEffectivePetLevel`。
    ///
    /// = 突破等级 + 潜质加成（如「老道」+1），钳制到 0-4。该值同时是魔灵技能 BUFF 的等级。
    pub fn effective_pet_level(&self) -> f64 {
        let base = if self.settings.pet_level.is_finite() {
            self.settings.pet_level
        } else {
            3.0
        };
        (base + self.trait_pet_level_bonus()).clamp(0.0, 4.0)
    }

    /// 潜质带来的魔灵技能等级加成；对应上游 `getTraitPetLevelBonus`。
    ///
    /// 只有「老道」（基础潜质 id 1030）提供 +1——这类效果无法用属性表达。
    fn trait_pet_level_bonus(&self) -> f64 {
        self.settings
            .traits
            .iter()
            .flatten()
            .filter(|(bid, _)| *bid == 1030)
            .count() as f64
    }

    /// 魔灵主动技的原始冷却（秒）；对应上游 `getPetBaseCd`。
    pub fn pet_base_cd(&self) -> f64 {
        if self.settings.pet_id == 0 {
            return 0.0;
        }
        self.tables
            .pets
            .get(&self.settings.pet_id)
            .map(|pet| pet.obj("主动").num_or("cd", 0.0))
            .unwrap_or(0.0)
    }

    /// 魔灵主动技的效果持续时间（秒）；对应上游 `getPetActiveDuration`。
    ///
    /// 数据里没有独立的持续字段，时长写在描述里（形如「持续{}秒」）：
    /// 数出该占位符在描述中的序号，再取 `主动.值[序号][档位]`。
    fn pet_active_duration(&self, level_index: f64) -> f64 {
        let Some(pet) = self.tables.pets.get(&self.settings.pet_id) else {
            return 0.0;
        };
        let active = pet.obj("主动");
        let description = active.str_or_empty("描述");
        if description.is_empty() {
            return 0.0;
        }
        // 逐个扫描 `{}` / `{%}`，找到后面紧跟「秒」的那个
        let chars: Vec<char> = description.chars().collect();
        let mut placeholder_index: Option<usize> = None;
        let mut seen = 0usize;
        let mut index = 0;
        while index < chars.len() {
            if chars[index] == '{' {
                let percent = chars.get(index + 1) == Some(&'%');
                let close = if percent { index + 2 } else { index + 1 };
                if chars.get(close) == Some(&'}') {
                    // 紧跟「秒」的 `{}`（非 `{%}`）即时长占位符
                    if !percent && chars.get(close + 1) == Some(&'秒') {
                        placeholder_index = Some(seen);
                        break;
                    }
                    seen += 1;
                    index = close + 1;
                    continue;
                }
            }
            index += 1;
        }
        let Some(position) = placeholder_index else {
            return 0.0;
        };
        // `主动.值` 是「一行一个占位符」的二维数组：`[[档位值…], …]`，
        // 因此第 `position` 行即该占位符的各档位取值。
        let Some(serde_json::Value::Array(rows)) = active.value("值") else {
            return 0.0;
        };
        let Some(serde_json::Value::Array(slots)) = rows.get(position) else {
            return 0.0;
        };
        if slots.is_empty() {
            return 0.0;
        }
        let pick = level_index.max(0.0).min((slots.len() - 1) as f64) as usize;
        slots[pick].as_f64().unwrap_or(0.0)
    }

    /// 潜质提供的魔灵CD缩减总和；对应上游 `getTraitCdReduce`。
    pub fn trait_cd_reduce(&self) -> f64 {
        let mut reduce = 0.0;
        for (bid, level) in self.settings.traits.iter().flatten() {
            let Some(trait_record) = self
                .tables
                .pet_traits
                .get(bid)
                .and_then(|levels| levels.get(&(*level as u32)))
            else {
                continue;
            };
            let buff_name = format!(
                "魔灵潜质:{}",
                trait_record.str_ref("name").unwrap_or("")
            );
            if let Some(raw) = self.tables.buffs.get(&buff_name).cloned() {
                let trait_level = *level;
                let buff = self.tables.templates.buff_cached(
                    &buff_name,
                    Some(trait_level),
                    None,
                    None,
                    || LeveledBuff::new(raw, Some(trait_level)),
                );
                if let Some(value) = buff.property("魔灵CD缩减") {
                    reduce += value;
                }
            }
        }
        reduce.clamp(0.0, 1.0)
    }

    /// 魔灵主动技的生效覆盖率；对应上游 `resolvePetCoverage`。
    ///
    /// 自动模式按「效果持续时间 / 实际冷却（原始冷却 × (1 - 缩减)）」；
    /// 无法自动计算（无主动技 / 无时长占位符 / 冷却为 0）时退回手动值。
    fn resolve_pet_coverage(&self, _pet: &Record, level_index: f64) -> f64 {
        let clamp = |value: f64| {
            // 非有限值回落满覆盖（上游 `getCoverageFromCdReduce` 口径）：
            // `.clamp()` 在 NaN 输入时返回 NaN，会改变该回落语义，故保留旧链。
            #[allow(clippy::manual_clamp)]
            if value.is_finite() {
                value.max(0.0).min(1.0)
            } else {
                1.0
            }
        };
        if !self.settings.pet_auto_coverage {
            return clamp(self.settings.pet_coverage);
        }
        let duration = self.pet_active_duration(level_index);
        let cooldown = self.pet_base_cd() * (1.0 - self.trait_cd_reduce());
        if duration == 0.0 || cooldown <= 0.0 {
            return clamp(self.settings.pet_coverage);
        }
        clamp(duration / cooldown)
    }

    /// 同律武器继承近战/远程时同步伤害类型；对应上游 `syncInheritedSkillWeapon`。
    fn sync_inherited_skill_weapon(&mut self) {
        let Some(skill_weapon) = self.skill_weapon.as_mut() else {
            return;
        };
        let Some(inherit) = skill_weapon.inherit.clone() else {
            return;
        };
        let source = if inherit == "melee" {
            &self.melee_weapon
        } else {
            &self.ranged_weapon
        };
        if source.is_empty() {
            return;
        }
        skill_weapon.damage_type = source.damage_type.clone();
    }

    /// 装配 BUFF 列表；对应上游构造函数里的 `buffs` / `dynamicBuffs` 划分。
    ///
    /// 上游口径：有 `code` **且**没有普通属性的 BUFF 只进 `dynamicBuffs`；
    /// 有 `code` 但同时有普通属性的复合 BUFF 两边都进（普通属性先汇总，code 后施加）。
    /// TS 严格口径（spec §6.4(2)）：配置点名的 BUFF 查不到即整份失败
    /// （记入 `missing_resource`，由 [`BuildContext::new`] 转为 `None`）；
    /// 唯二例外是**玩法潜质**（无对应 BUFF 的 trait，如拾取范围）与
    /// **无 BUFF 的魔灵**（未实装被动/主动），这两类不产生属性，跳过。
    fn build_buffs(&mut self) {
        crate::prof!("context::build_buffs");
        let mut buffs: Vec<LeveledBuff> = Vec::new();
        for (name, level, coverage) in &self.settings.buffs {
            let coverage_value = *coverage;
            let level_value = *level;
            let instance = if name == "自定义BUFF" {
                // 自定义 BUFF：从配置里现拼一条新格式记录（数值进 `attr` 表）
                let mut attr = serde_json::Map::new();
                for (property, value) in &self.settings.custom_buff {
                    attr.insert(property.clone(), serde_json::json!(value));
                }
                let mut map = serde_json::Map::new();
                map.insert("名称".to_string(), serde_json::json!("自定义BUFF"));
                map.insert("描述".to_string(), serde_json::json!("自行填写"));
                map.insert("attr".to_string(), serde_json::Value::Object(attr));
                let mut custom = LeveledBuff::new(Record::from_map(map), Some(level_value));
                if let Some(value) = coverage_value {
                    custom.coverage = value;
                    custom.update_properties();
                }
                custom
            } else {
                let Some(raw) = self.tables.buffs.get(name).cloned() else {
                    // TS 严格口径：下线 BUFF 直接报错（spec §6.4(2)）
                    self.missing_resource = Some(format!("未知 BUFF：{name}"));
                    return;
                };
                let buff_name = name.clone();
                self.tables.templates.buff_cached(
                    &buff_name,
                    Some(level_value),
                    None,
                    coverage_value,
                    || {
                        let mut built = LeveledBuff::new(raw, Some(level_value));
                        if let Some(value) = coverage_value {
                            built.coverage = value;
                            built.update_properties();
                        }
                        built
                    },
                )
            };
            buffs.push(instance);
        }

        // 魔灵潜质：`[基础潜质 id, 等级]` → 名称 `魔灵潜质:<潜质名>` 的 BUFF。
        // 无对应 BUFF 的潜质（如「拾取范围」这类玩法潜质）不产生属性，跳过。
        for slot in &self.settings.traits {
            let Some((bid, level)) = slot else { continue };
            let Some(trait_record) = self
                .tables
                .pet_traits
                .get(bid)
                .and_then(|levels| levels.get(&(*level as u32)))
            else {
                continue;
            };
            let buff_name = format!(
                "魔灵潜质:{}",
                trait_record.str_ref("name").unwrap_or("")
            );
            let trait_level = *level;
            let Some(raw) = self.tables.buffs.get(&buff_name).cloned() else {
                continue;
            };
            buffs.push(self.tables.templates.buff_cached(
                &buff_name,
                Some(trait_level),
                None,
                None,
                || LeveledBuff::new(raw, Some(trait_level)),
            ));
        }

        // 魔灵自身：被动物按魔灵名，主动技按 `魔灵名(主动)`，等级取「生效技能等级」。
        let pet_level = self.effective_pet_level();
        if let Some(pet) = self.tables.pets.get(&self.settings.pet_id) {
            let pet_name = pet.text("名称");
            if let Some(raw) = self.tables.buffs.get(&pet_name).cloned() {
                let passive_name = pet_name.clone();
                buffs.push(self.tables.templates.buff_cached(
                    &passive_name,
                    Some(pet_level),
                    None,
                    None,
                    || LeveledBuff::new(raw, Some(pet_level)),
                ));
            }
            let active_name = format!("{}(主动)", pet_name);
            let active_coverage = self.resolve_pet_coverage(pet, pet_level);
            if let Some(raw) = self.tables.buffs.get(&active_name).cloned() {
                buffs.push(self.tables.templates.buff_cached(
                    &active_name,
                    Some(pet_level),
                    None,
                    Some(active_coverage),
                    || {
                        // 主动技按覆盖率缩放（自动模式按「时长 / 实际冷却」折算）
                        let mut active = LeveledBuff::new(raw, Some(pet_level));
                        active.coverage = active_coverage;
                        active.update_properties();
                        active
                    },
                ));
            }
        }

        // 双槽位语义（上游「同一实例同时位于两个槽位」）：`buffs` 存全部实例，
        // `dynamic_buffs` 只记下标。无深拷贝，复合 BUFF 两槽天然同一份。
        self.buffs = buffs;
        self.dynamic_buffs = self
            .buffs
            .iter()
            .enumerate()
            .filter(|(_, buff)| buff.code.is_some())
            .map(|(index, _)| index)
            .collect();
    }

    /// 命中率：取某属性的总加成（加法）；对应上游 `getTotalBonus`。
    pub fn total_bonus(&self, attribute: &str, prefix: &str, include_mods: bool) -> f64 {
        crate::prof!("context::total_bonus");
        let scope = prefix_scope(prefix);
        let mut bonus = 0.0;

        // 角色自带加成
        if prefix == "角色" || attribute != "攻击" {
            bonus += self
                .source_table
                .char
                .get(attribute)
                .copied()
                .unwrap_or(0.0);
        }
        // 近战武器
        if (scope == "角色" || (scope == "近战" && attribute != "攻击"))
            && self.melee_weapon.forge_effective
        {
            bonus += self
                .source_table
                .melee
                .get(attribute)
                .copied()
                .unwrap_or(0.0);
        }
        // 远程武器
        if (scope == "角色" || (scope == "远程" && attribute != "攻击"))
            && self.ranged_weapon.forge_effective
        {
            bonus += self
                .source_table
                .ranged
                .get(attribute)
                .copied()
                .unwrap_or(0.0);
        }

        // MOD 词条
        bonus += self.sum_mods(attribute, scope, include_mods);

        let buff_in_scope = is_buff_in_scope(attribute, scope);
        // 近战/远程作用域下 攻击 / 增伤 只取该作用域自身的加成，不叠加通用池
        let shared_pool = scope == "角色" || (attribute != "攻击" && attribute != "增伤");
        if buff_in_scope && shared_pool {
            bonus += self
                .source_table
                .buffs
                .get(attribute)
                .copied()
                .unwrap_or(0.0);
            bonus += self
                .source_table
                .mods_buff_props
                .get(attribute)
                .copied()
                .unwrap_or(0.0);
        }
        if shared_pool {
            bonus += self
                .source_table
                .weapon_buff_props
                .get(attribute)
                .copied()
                .unwrap_or(0.0);
        }
        bonus
    }

    /// MOD 词条合计；对应上游 `sumModsFromTable`。
    fn sum_mods(&self, attribute: &str, scope: &str, include_mods: bool) -> f64 {
        crate::prof!("context::sum_mods");
        if !include_mods {
            return 0.0;
        }
        // 这些属性可以从角色槽穿透到武器槽（`match` 按长度分派，比线性 `contains` 快）。
        let penetrates = matches!(
            attribute,
            "暴击" | "暴伤" | "触发" | "攻速" | "充盈转化" | "召唤物攻击速度转化" | "召唤物范围转化"
        );
        if penetrates {
            let mut bonus = self
                .source_table
                .mods_char
                .get(attribute)
                .copied()
                .unwrap_or(0.0);
            if scope != "角色" {
                bonus += scope_bucket_index(scope)
                    .and_then(|index| self.source_table.mods_by_scope[index].get(attribute))
                    .copied()
                    .unwrap_or(0.0);
            }
            return bonus;
        }
        if scope.is_empty() {
            self.source_table
                .mods_all
                .get(attribute)
                .copied()
                .unwrap_or(0.0)
        } else {
            scope_bucket_index(scope)
                .and_then(|index| self.source_table.mods_by_scope[index].get(attribute))
                .copied()
                .unwrap_or(0.0)
        }
    }

    /// 该作用域的 MOD 列表；对应上游 `getScopedMods`。
    pub fn scoped_mods(&self, scope: &str) -> Vec<&LeveledMod> {
        self.iter_mods()
            .filter(|mod_| mod_.in_scope(scope))
            .collect()
    }

    /// 遍历全部 MOD（含中枢）。
    pub fn iter_mods(&self) -> impl DoubleEndedIterator<Item = &LeveledMod> {
        self.char_mods
            .iter()
            .chain(self.melee_mods.iter())
            .chain(self.ranged_mods.iter())
            .chain(self.skill_mods.iter())
            .chain(self.aura_mod.iter())
    }

    /// 可变遍历全部 MOD（含中枢，与 [`Self::iter_mods`] 同序）。
    fn iter_mods_mut(&mut self) -> impl DoubleEndedIterator<Item = &mut LeveledMod> {
        self.char_mods
            .iter_mut()
            .chain(self.melee_mods.iter_mut())
            .chain(self.ranged_mods.iter_mut())
            .chain(self.skill_mods.iter_mut())
            .chain(self.aura_mod.iter_mut())
    }

    /// MOD 乘法聚合 `Π(1+v)`；对应上游 `getScopedModsMulBonus`。
    pub fn scoped_mods_mul_bonus(&self, attribute: &str, scope: &str) -> f64 {
        crate::prof!("context::scoped_mods_mul_bonus");
        let mut product = 1.0;
        for mod_ in self.scoped_mods(scope) {
            if let Some(value) = mod_.add_attr_value(attribute) {
                product *= 1.0 + value;
            }
        }
        product
    }

    /// 指定作用域的 MOD 词条合计（只含 MOD，不含 BUFF / 武器效果）；
    /// 对应上游 `getModsScopeBonus`。
    pub fn scoped_mods_bonus(&self, attribute: &str, scope: &str) -> f64 {
        if scope.is_empty() {
            self.source_table
                .mods_all
                .get(attribute)
                .copied()
                .unwrap_or(0.0)
        } else {
            scope_bucket_index(scope)
                .and_then(|index| self.source_table.mods_by_scope[index].get(attribute))
                .copied()
                .unwrap_or(0.0)
        }
    }

    /// 普通槽位成员判定：无 `code` 的全部参与；有 `code` 的仅含普通属性的复合 BUFF 参与。
    fn in_plain_slot(buff: &LeveledBuff) -> bool {
        buff.code.is_none() || !buff.props.is_empty()
    }

    /// 该 BUFF 是否被已装备 MOD 禁用（数据 `禁用` 命中任一 MOD id）。
    pub(crate) fn buff_disabled_by_mods(&self, buff: &LeveledBuff) -> bool {
        if buff.disabled_by.is_empty() {
            return false;
        }
        self.iter_mods()
            .any(|mod_| buff.disabled_by.contains(&mod_.id))
    }

    /// 重算全部 BUFF 的生效标记；返回是否有变化。
    ///
    /// 生效状态只由「已装备 MOD id」与 BUFF 数据的 `禁用` 决定，MOD 增删后必须重算；
    /// 状态变化会使来源表失效（调用方据此走全量重建）。
    pub fn refresh_buff_activation(&mut self) -> bool {
        let mut changed = self.buff_active.len() != self.buffs.len();
        self.buff_active.resize(self.buffs.len(), true);
        for index in 0..self.buffs.len() {
            let active = !self.buff_disabled_by_mods(&self.buffs[index]);
            if self.buff_active[index] != active {
                self.buff_active[index] = active;
                changed = true;
            }
        }
        changed
    }

    /// BUFF 下标对应的生效标记（越界按 true，兼容时间轴等追加路径）。
    fn is_buff_active(&self, index: usize) -> bool {
        self.buff_active.get(index).copied().unwrap_or(true)
    }

    /// 动态槽位实例迭代（装配序）。
    pub fn dynamic_buff_iter(&self) -> impl Iterator<Item = &LeveledBuff> {
        self.dynamic_buffs
            .iter()
            .filter(|index| self.is_buff_active(**index))
            .filter_map(|index| self.buffs.get(*index))
    }

    /// 全部 BUFF 的乘法聚合 `Π(1+v)`；对应上游 `getBuffsMulBonus`。
    pub fn buffs_mul_bonus(&self, attribute: &str) -> f64 {
        let mut product = 1.0;
        for (index, buff) in self.buffs.iter().enumerate() {
            // 被已装备 MOD 禁用的 BUFF 不参与乘法聚合
            if !self.is_buff_active(index) {
                continue;
            }
            if !Self::in_plain_slot(buff) {
                continue;
            }
            // 条件BUFF（技能/tag限定）只对命中条件的字段生效，不参与全局乘法聚合
            if buff.is_field_conditional() {
                continue;
            }
            if let Some(value) = buff.property(attribute) {
                product *= 1.0 + value;
            }
        }
        product
    }

    /// 减伤（独立递减）；对应上游 `getTotalBonusReduce`。
    pub fn total_bonus_reduce(&self, attribute: &str, prefix: Option<&str>) -> f64 {
        crate::prof!("context::total_bonus_reduce");
        let mut bonus = 0.0;
        for mod_ in self.iter_mods() {
            if let Some(scope) = prefix
                && !scope.is_empty()
                && mod_.kind != scope
            {
                continue;
            }
            if let Some(value) = mod_.props.get(attribute).copied() {
                bonus = 1.0 - (1.0 - bonus) * (1.0 - value);
            }
        }
        for (index, buff) in self.buffs.iter().enumerate() {
            // 被已装备 MOD 禁用的 BUFF 不参与减伤聚合
            if !self.is_buff_active(index) {
                continue;
            }
            if !Self::in_plain_slot(buff) {
                continue;
            }
            // 条件BUFF（技能/tag限定）只对命中条件的字段生效，不参与全局减伤聚合
            if buff.is_field_conditional() {
                continue;
            }
            if let Some(value) = buff.property(attribute) {
                bonus = 1.0 - (1.0 - bonus) * (1.0 - value);
            }
        }
        bonus
    }

    /// 乘法加成净增量；对应上游 `getTotalBonusMul`。
    pub fn total_bonus_mul(&self, attribute: &str, prefix: &str, include_mods: bool) -> f64 {
        crate::prof!("context::total_bonus_mul");
        let scope = prefix_scope(prefix);
        let mut bonus = 1.0;
        if let Some(value) = self.char.bonus.num(attribute) {
            bonus *= 1.0 + value;
        }
        if include_mods {
            bonus *= self.scoped_mods_mul_bonus(attribute, scope);
        }
        let buff_in_scope = is_buff_in_scope(attribute, scope);
        let shared_pool = scope == "角色" || attribute != "独立增伤";
        if buff_in_scope && shared_pool {
            bonus *= self.buffs_mul_bonus(attribute);
        }
        bonus - 1.0
    }

    /// 清掉属性派生缓存（条件增量 + 技能字段表）。
    ///
    /// 每个 `memo.bump*` 同步点必须同步调用：派生缓存的键是 `memo.version`，
    /// 状态变更（条件 MOD 改写、BUFF attr 刷新、BUFF 入列/等级变更）不清空就会静默读旧值。
    /// 调用方自查清单：`apply_conditions` / `apply_buff_attr`（条件改写分支）、
    /// `push_buff_to_slots`（BUFF 入列）、`refresh_skill_fields`（重算前）。
    pub(crate) fn invalidate_derived(&mut self) {
        self.conditional_props_cache = None;
    }

    /// 取当前构筑全部条件BUFF的字段级属性增量列表；对应上游 `getConditionalBuffPropsList`。
    ///
    /// 静态条件BUFF按 `技能` + `tag` 聚合同条件的数值（乘法池属性按 Π(1+v) 合并，其余加算），
    /// 再并上条件codeBUFF的差分增量（见 `scoped_code_buff_conditionals`）。
    /// 供 `fields_with_attr` 在字段值计算处（如 技能倍率乘数）应用条件BUFF。
    pub fn conditional_buff_props_list(&mut self) -> Vec<BuffFieldConditional> {
        crate::prof!("context::conditional_buff_props_list");
        if let Some(cached) = self.conditional_props_cache.as_ref() {
            return cached.clone();
        }
        let mut list: Vec<BuffFieldConditional> = Vec::new();
        for (index, buff) in self.buffs.iter().enumerate() {
            // 被已装备 MOD 禁用的 BUFF 不参与字段条件聚合
            if !self.is_buff_active(index) {
                continue;
            }
            if !Self::in_plain_slot(buff) {
                continue;
            }
            if !buff.is_field_conditional() {
                continue;
            }
            let skill = buff.skill.clone();
            let tag = buff.tag.clone();
            let entry = match list
                .iter_mut()
                .find(|item| item.skill == skill && item.tag == tag)
            {
                Some(entry) => entry,
                None => {
                    list.push(BuffFieldConditional {
                        pattern: buff.skill_pattern.clone(),
                        skill,
                        tag,
                        props: AttrMap::new(),
                    });
                    list.last_mut().expect("上一步刚 push")
                }
            };
            for (prop, value) in &buff.props {
                if *value == 0.0 {
                    continue;
                }
                if is_multiplicative_attr(prop) {
                    let current = entry.props.get(prop).copied().unwrap_or(0.0);
                    entry
                        .props
                        .insert(prop, (1.0 + current) * (1.0 + value) - 1.0);
                } else {
                    *entry.props.entry(prop).or_insert(0.0) += value;
                }
            }
        }
        list.extend(self.scoped_code_buff_conditionals());
        self.conditional_props_cache = Some(list.clone());
        list
    }

    /// 汇总命中字段的条件BUFF属性增量；对应上游 `getConditionalBuffProps`。
    ///
    /// 条件BUFF只在求值字段命中条件（字段名匹配 `技能`，支持 `|` 交替多技能；
    /// 或字段标签命中 `tag`）时，把其数值属性叠加进该字段的属性上下文；
    /// 乘法池属性按 Π(1+v) 聚合后以净增量形式返回，与 minusAttr 的乘法逆元口径一致。
    pub fn conditional_buff_props(
        &mut self,
        field_name: &str,
        field_tag: Option<&[String]>,
    ) -> Option<AttrMap> {
        let empty: &[String] = &[];
        let tags = field_tag.unwrap_or(empty);
        let mut result: Option<AttrMap> = None;
        for entry in self.conditional_buff_props_list() {
            if !entry.matches(field_name, tags) {
                continue;
            }
            let props = result.get_or_insert_with(AttrMap::new);
            for (prop, value) in &entry.props {
                if is_multiplicative_attr(prop) {
                    let current = props.get(prop).copied().unwrap_or(0.0);
                    props.insert(prop, (1.0 + current) * (1.0 + value) - 1.0);
                } else {
                    *props.entry(prop).or_insert(0.0) += value;
                }
            }
        }
        result
    }

    /// 推进装配期状态（对应上游 `getFieldsWithAttr(attrs)` 的副作用）：
    /// 属性收敛（条件 MOD / BUFF attr）+ 条件BUFF增量缓存定格。
    /// 技能字段表由求值会话按需（用到的技能）现建，装配期不预热。
    pub fn refresh_skill_fields(&mut self) {
        crate::prof!("context::refresh_skill_fields");
        self.invalidate_derived();
        self.calculate_attributes(true, false);
        self.conditional_buff_props_list();
        self.ranged_multi(None);
    }

    /// 全部技能（角色技能 + 武器技能，含 MOD 技能替换）；顺序与上游 `allSkills` 一致。
    ///
    /// 惰性链式迭代（角色 → 近战 → 远程 → 同律），零拷贝。
    pub fn all_skills(&self) -> impl DoubleEndedIterator<Item = &LeveledSkill> + '_ {
        let lists = self.lists();
        self.char
            .skills
            .iter()
            .chain(lists.melee.iter())
            .chain(lists.ranged.iter())
            .chain(lists.skill.iter())
    }

    /// 装配后不变的技能列表（共享句柄，便于与 `&mut self` 调用交错使用）。
    pub fn skill_lists(&self) -> std::sync::Arc<SkillLists> {
        self.lists();
        self.skill_lists.get().expect("lists 已初始化").clone()
    }

    pub(crate) fn eval_statics(&mut self) -> EvalStatics {
        let lists = self.skill_lists();
        let addr = std::sync::Arc::as_ptr(&lists) as *const () as usize;
        if let Some(cached) = self.eval_statics.as_ref()
            && cached.variables == self.settings.custom_variables
            && cached.skill_lists_addr == addr
        {
            return cached.clone();
        }
        let mut statics = EvalStatics {
            variables: self.settings.custom_variables.clone(),
            skill_lists_addr: addr,
            variable_asts: crate::ast_eval::compiled_variables(self),
            skill_keys: crate::ast_eval::build_skill_keys(self),
            functions: self.valid_custom_functions(),
            function_asts: HashMap::new(),
        };
        statics.function_asts = statics
            .functions
            .iter()
            .filter_map(|(name, (_, body))| {
                crate::ast_eval::parse_cached(body)
                    .ok()
                    .map(|ast| (name.clone(), ast))
            })
            .collect();
        self.eval_statics = Some(statics.clone());
        statics
    }

    fn lists(&self) -> &SkillLists {
        self.skill_lists.get_or_init(|| {
            crate::prof!("context::skill_lists");
            let melee = replace_weapon_skills(&self.melee_weapon.skills, &self.melee_mods);
            let ranged = replace_weapon_skills(&self.ranged_weapon.skills, &self.ranged_mods);
            let skill = match self.skill_weapon.as_ref() {
                Some(weapon) => replace_weapon_skills(&weapon.skills, &self.skill_mods),
                None => Vec::new(),
            };
            let mut by_base: HashMap<String, WeaponRef> = HashMap::new();
            by_base.insert("近战".to_string(), WeaponRef::Melee);
            by_base.insert("远程".to_string(), WeaponRef::Ranged);
            by_base.insert("melee".to_string(), WeaponRef::Melee);
            by_base.insert("ranged".to_string(), WeaponRef::Ranged);
            if self.skill_weapon.is_some() {
                by_base.insert("同律".to_string(), WeaponRef::Skill);
                by_base.insert("skill".to_string(), WeaponRef::Skill);
            }
            for item in &melee {
                by_base.insert(item.name.clone(), WeaponRef::Melee);
            }
            for item in &ranged {
                by_base.insert(item.name.clone(), WeaponRef::Ranged);
            }
            for item in &skill {
                by_base.insert(item.name.clone(), WeaponRef::Skill);
            }
            if let Some(weapon) = self.skill_weapon.as_ref() {
                by_base.insert(weapon.name.clone(), WeaponRef::Skill);
            }
            std::sync::Arc::new(SkillLists {
                melee,
                ranged,
                skill,
                by_base,
            })
        })
    }

    /// 近战武器技能（含 MOD 技能替换）。
    pub fn melee_weapon_skills(&self) -> &[LeveledSkill] {
        &self.lists().melee
    }

    /// 远程武器技能（含 MOD 技能替换）。
    pub fn ranged_weapon_skills(&self) -> &[LeveledSkill] {
        &self.lists().ranged
    }

    /// 同律武器技能（含 MOD 技能替换）。
    pub fn skill_weapon_skills(&self) -> &[LeveledSkill] {
        &self.lists().skill
    }

    /// 武器面板键 → 武器；对应上游 `getAllWeaponsByBase`。
    pub fn weapons_by_base(&self) -> &HashMap<String, WeaponRef> {
        &self.lists().by_base
    }

    /// 解析命名空间为技能引用；对应上游 `resolveSkillContext`（不克隆技能）。
    pub fn resolve_skill_ref(&self, namespace: &str) -> Option<&LeveledSkill> {
        let alias = match namespace {
            "E" | "e" => Some(0usize),
            "Q" | "q" => Some(1),
            "P" | "p" => Some(2),
            _ => None,
        };
        if let Some(index) = alias {
            return self.char.skills.get(index);
        }
        self.all_skills()
            .find(|skill| skill.name == namespace || skill.safe_name == namespace)
    }

    /// 命名空间对应的技能字段表键（`safeName`）；解析不到时用原文。
    pub fn skill_field_key<'s>(&'s self, namespace: &'s str) -> &'s str {
        self.resolve_skill_ref(namespace)
            .map(|skill| skill.safe_name.as_str())
            .unwrap_or(namespace)
    }

    /// 解析命名空间为技能上下文；对应上游 `resolveSkillContext`。
    pub fn resolve_skill_context(&self, namespace: &str) -> Option<LeveledSkill> {
        let alias = match namespace {
            "E" | "e" => Some(0usize),
            "Q" | "q" => Some(1),
            "P" | "p" => Some(2),
            _ => None,
        };
        if let Some(index) = alias {
            return self.char.skills.get(index).cloned();
        }
        self.all_skills()
            .find(|skill| skill.name == namespace || skill.safe_name == namespace)
            .cloned()
    }

    /// 取（或计算）角色属性；对应上游 `calculateAttributes()`。
    pub fn attrs(&mut self) -> AttrMap {
        self.calculate_attributes(false, false)
    }

    /// 取（或计算）武器属性；对应上游 `calculateWeaponAttributes()`。
    pub fn weapon_attrs(
        &mut self,
        weapon: Option<WeaponRef>,
    ) -> super::attributes::WeaponAttributes {
        self.calculate_weapon_attributes(weapon)
    }

    /// BUFF 的 `attr` 声明刷新（依赖角色属性）；对应上游 `applyBuffAttr`。
    ///
    /// 返回是否发生变更。`attr` 里的表达式按**完整构筑上下文**求值
    /// （上游即 `this.evaluateAST(expression, {...attrs})`）。
    pub fn apply_buff_attr(&mut self, attrs: &AttrMap) -> bool {
        crate::prof!("context::apply_buff_attr");
        if self
            .buffs
            .iter()
            .filter(|buff| Self::in_plain_slot(buff))
            .all(|buff| buff.attr_expressions.is_empty())
        {
            return false;
        }
        // 一次会话算完全部 `attr` 表达式：面板只取一次，避免每条表达式重建求值器。
        let expressions: Vec<(usize, Vec<(String, String)>)> = self
            .buffs
            .iter()
            .enumerate()
            .filter(|(_, buff)| Self::in_plain_slot(buff) && !buff.attr_expressions.is_empty())
            .map(|(index, buff)| (index, buff.attr_expressions.clone()))
            .collect();
        let mut namespaces: Vec<&str> = Vec::new();
        for (_, list) in &expressions {
            for (_, expression) in list {
                let mut rest = expression.as_str();
                while let Some(pos) = rest.find("::") {
                    let head = rest[..pos]
                        .rsplit(|c: char| !c.is_alphanumeric() && c != '_')
                        .next()
                        .unwrap_or("")
                        .trim();
                    if !head.is_empty() {
                        namespaces.push(head);
                    }
                    rest = &rest[pos + 2..];
                }
            }
        }
        let panels = if namespaces.is_empty() {
            std::collections::HashMap::new()
        } else {
            let by_base = self.weapons_by_base();
            let (mut melee, mut ranged, mut skill, mut fallback) = (false, false, false, false);
            for ns in namespaces {
                match by_base.get(ns) {
                    Some(WeaponRef::Melee) => melee = true,
                    Some(WeaponRef::Ranged) => ranged = true,
                    Some(WeaponRef::Skill) => skill = true,
                    Some(WeaponRef::Selected) => fallback = true,
                    None => {}
                }
            }
            if fallback {
                self.all_weapon_panels()
            } else {
                self.weapon_panels_for(melee, ranged, skill)
            }
        };
        let attrs_owned = attrs.clone();
        let mut evaluator = crate::ast_eval::Evaluator::with_panels(self, attrs_owned, panels);
        let mut computed: Vec<(usize, String, f64)> = Vec::new();
        for (index, list) in &expressions {
            for (key, expression) in list {
                let value = evaluator.evaluate(expression).unwrap_or(0.0);
                computed.push((*index, key.clone(), value));
            }
        }
        drop(evaluator);
        let mut changed = false;
        for (index, key, value) in computed {
            let coverage = self.buffs[index].coverage;
            let next = if value.is_finite() { value } else { 0.0 } * coverage;
            if self.buffs[index].props.get(&key).copied() != Some(next) {
                self.buffs[index].props.insert(key, next);
                changed = true;
            }
        }
        if changed {
            // 属性表含 BUFF，需重建
            self.source_table = self.build_source_table();
            self.memo.bump_with_source();
            self.invalidate_derived();
        }
        changed
    }

    /// MOD 条件属性的判定与应用；对应上游 `applyCondition` + `getConditionValues`。
    ///
    /// 返回是否有 MOD 的属性发生变化（需要重算一遍属性）。
    pub fn apply_conditions(&mut self, attrs: &AttrMap) -> bool {
        crate::prof!("context::apply_conditions");
        // 无条件 MOD 是常态：先做零成本判定，省掉条件值表与整轮遍历。
        if !self.iter_mods().any(|mod_| mod_.has_condition) {
            return false;
        }
        let condition_values = self.condition_values();
        let tables = self.condition_tables(&condition_values);
        let mut changed = false;
        for index in 0..self.char_mods.len() {
            changed |= self.apply_mod_condition(index, Section::Char, attrs, &tables);
        }
        for index in 0..self.melee_mods.len() {
            changed |= self.apply_mod_condition(index, Section::Melee, attrs, &tables);
        }
        for index in 0..self.ranged_mods.len() {
            changed |= self.apply_mod_condition(index, Section::Ranged, attrs, &tables);
        }
        for index in 0..self.skill_mods.len() {
            changed |= self.apply_mod_condition(index, Section::Skill, attrs, &tables);
        }
        if self.aura_mod.is_some() {
            changed |= self.apply_mod_condition(0, Section::Aura, attrs, &tables);
        }
        if changed {
            self.source_table = self.build_source_table();
            self.memo.bump_with_source();
            self.invalidate_derived();
        }
        changed
    }

    /// 统计「近战 + 远程 + 同律（非继承）+ 队友」的武器类别数量；对应上游 `getConditionValues`。
    pub(crate) fn condition_values(&self) -> HashMap<String, f64> {
        let mut values: HashMap<String, f64> = HashMap::new();
        if !self.melee_weapon.is_empty() {
            *values
                .entry(self.melee_weapon.category.clone())
                .or_insert(0.0) += 1.0;
        }
        if !self.ranged_weapon.is_empty() {
            *values
                .entry(self.ranged_weapon.category.clone())
                .or_insert(0.0) += 1.0;
        }
        // 同律武器有继承关系时不再单独算一类
        if let Some(weapon) = self.skill_weapon.as_ref()
            && weapon.inherit.is_none()
        {
            *values.entry(weapon.category.clone()).or_insert(0.0) += 1.0;
        }
        for category in &self.team_weapon_categories {
            *values.entry(category.clone()).or_insert(0.0) += 1.0;
        }
        values
    }

    /// 条件判定公共表（极性统计与同 id 计数只统计角色槽 + 中枢）。
    pub(crate) fn condition_tables(&self, condition_values: &HashMap<String, f64>) -> ConditionTables {
        let mut polarity_table: HashMap<String, f64> = HashMap::new();
        let mut id_table: HashMap<i64, f64> = HashMap::new();
        for item in self.char_mods.iter().chain(self.aura_mod.iter()) {
            if let Some(polarity) = item.polarity.as_ref() {
                *polarity_table.entry(polarity.clone()).or_insert(0.0) += 1.0;
            }
            *id_table.entry(item.id).or_insert(0.0) += 1.0;
        }
        ConditionTables {
            values: condition_values.clone(),
            polarity: polarity_table,
            max_id_count: id_table.values().copied().fold(0.0, f64::max),
        }
    }

    /// 条件是否生效（纯判定，不写回）；对应上游 `LeveledMod.checkCondition`。
    ///
    /// `apply_mod_condition` 与自动配装的条件预热共用。
    pub(crate) fn check_mod_condition(
        conditions: &[(String, String, f64)],
        attrs: &AttrMap,
        tables: &ConditionTables,
    ) -> bool {
        let polarity_table = &tables.polarity;
        let condition_values = &tables.values;
        let max_id_count = tables.max_id_count;
        conditions.iter().all(|item| {
            let attr = item.0.as_str();
            let op = item.1.as_str();
            let target = item.2;
            if attr == "*id" {
                return match op {
                    "*" => true,
                    "=" => max_id_count == target,
                    ">" => max_id_count > target,
                    ">=" => max_id_count >= target,
                    "<" => max_id_count < target,
                    "<=" => max_id_count <= target,
                    "!=" => max_id_count != target,
                    _ => false,
                };
            }
            // 上游口径：`poTable[attr.slice(0, 1)]`——极性表按属性名的**首字**查
            // （`A趋向` 的首字是 `A`）；查不到再退到条件值表，最后才查属性表
            let polarity_key: String = attr.chars().take(1).collect();
            let attr_value = polarity_table
                .get(&polarity_key)
                .copied()
                .or_else(|| condition_values.get(attr).copied())
                .or_else(|| attrs.get(attr).copied())
                .unwrap_or(0.0);
            match op {
                "*" => true,
                "=" => attr_value == target,
                ">" => attr_value > target,
                ">=" => attr_value >= target,
                "<" => attr_value < target,
                "<=" => attr_value <= target,
                "!=" => attr_value != target,
                _ => false,
            }
        })
    }

    fn apply_mod_condition(
        &mut self,
        index: usize,
        section: Section,
        attrs: &AttrMap,
        tables: &ConditionTables,
    ) -> bool {
        let Some(mod_) = self.mod_at(section, index) else {
            return false;
        };
        if !mod_.has_condition {
            return false;
        }
        let raw_conditions = mod_.condition_conditions.clone();
        let effective = Self::check_mod_condition(&raw_conditions, attrs, tables);
        // 应用条件属性（生效则写入，失效则移除）
        let props: Vec<ConditionalProp> = self
            .mod_at(section, index)
            .map(|mod_| mod_.condition_props.clone())
            .unwrap_or_default();
        let mod_ = self.mod_at_mut(section, index).unwrap();

        let mut changed = false;
        for (key, scalar, pair) in props {
            if effective {
                let next = match (scalar, pair) {
                    // 数组形态：`[倍率, 上限]`，取 `min(基础值 × 倍率, 上限)`
                    (_, Some((ratio, cap))) => {
                        let cond_attr = raw_conditions
                            .first()
                            .map(|item| item.0.clone())
                            .unwrap_or_default();
                        let base_value = tables
                            .values
                            .get(&cond_attr)
                            .copied()
                            .or_else(|| attrs.get(&cond_attr).copied())
                            .unwrap_or(0.0);
                        Some((base_value * ratio).min(cap))
                    }
                    (Some(value), None) => Some(value),
                    _ => None,
                };
                if let Some(next) = next
                    && mod_.props.get(&key).copied() != Some(next)
                {
                    mod_.props.insert(key, next);
                    changed = true;
                }
            } else if mod_.props.remove(&key).is_some() {
                changed = true;
            }
        }
        changed
    }

    fn mod_at(&self, section: Section, index: usize) -> Option<&LeveledMod> {
        match section {
            Section::Char => self.char_mods.get(index),
            Section::Melee => self.melee_mods.get(index),
            Section::Ranged => self.ranged_mods.get(index),
            Section::Skill => self.skill_mods.get(index),
            Section::Aura => self.aura_mod.as_ref(),
        }
    }

    fn mod_at_mut(&mut self, section: Section, index: usize) -> Option<&mut LeveledMod> {
        match section {
            Section::Char => self.char_mods.get_mut(index),
            Section::Melee => self.melee_mods.get_mut(index),
            Section::Ranged => self.ranged_mods.get_mut(index),
            Section::Skill => self.skill_mods.get_mut(index),
            Section::Aura => self.aura_mod.as_mut(),
        }
    }

    /// 有效的自定义函数定义；对应上游 `getValidCustomFunctions`。
    ///
    /// 键形如 `f(x) = …` 的归为函数，其余归为变量；同名函数取**后出现**的那个
    /// （与上游 `Map` 的覆盖语义一致）。
    pub fn valid_custom_functions(&self) -> HashMap<String, (Vec<String>, String)> {
        let mut map = HashMap::new();
        for (key, expression) in &self.settings.custom_variables {
            if let Some((name, params)) = parse_custom_function(key) {
                map.insert(name, (params, expression.clone()));
            }
        }
        map
    }

    /// 有效的自定义变量（排除函数定义）；对应上游 `getValidCustomVariables`。
    pub fn valid_custom_variables(&self) -> Vec<(String, String)> {
        self.settings
            .custom_variables
            .iter()
            .filter(|(key, _)| parse_custom_function(key).is_none())
            .cloned()
            .collect()
    }

    /// 自定义变量有效名集合（供表达式校验用）。
    pub fn custom_variable_names(&self) -> Vec<String> {
        let mut names: Vec<String> = self
            .valid_custom_variables()
            .into_iter()
            .map(|(key, _)| key)
            .collect();
        names.extend(self.valid_custom_functions().keys().cloned());
        names
    }
}

/// 判断一个自定义变量键是否是函数定义（`f(x) = …`）；对应上游 `parseCustomFunctionDefinition`。
///
/// 形如 `名称(参数1, 参数2)`，参数名不能重复、不能为空；不匹配时返回 `None`
/// （此时该键按普通变量处理）。
pub fn parse_custom_function(key: &str) -> Option<(String, Vec<String>)> {
    let open = key.find('(')?;
    if !key.ends_with(')') {
        return None;
    }
    let name = key[..open].trim();
    if name.is_empty() {
        return None;
    }
    let params_text = &key[open + 1..key.len() - 1];
    let mut params: Vec<String> = Vec::new();
    if !params_text.trim().is_empty() {
        for param in params_text.split(',') {
            let trimmed = param.trim();
            if trimmed.is_empty() || params.iter().any(|item| item == trimmed) {
                return None;
            }
            params.push(trimmed.to_string());
        }
    }
    Some((name.to_string(), params))
}

impl<'a> BuildContext<'a> {
    /// 构建加成来源表；对应上游 `buildBonusSourceTable`。
    /// 来源表按状态版本惰性重建。
    pub fn ensure_source_table(&mut self) {
        if self.memo.source_version != Some(self.memo.version) {
            self.source_table = self.build_source_table();
            self.memo.source_version = Some(self.memo.version);
        }
    }

    pub fn build_source_table(&self) -> BonusSourceTable {
        crate::prof!("context::build_source_table");
        let mut table = BonusSourceTable::default();
        for (key, value) in self.char.bonus.numeric_iter() {
            *table.char.entry(key).or_insert(0.0) += value;
        }
        // 武器：只取 `加成` 缩放后的词条（效果层单独进 weaponBuffProps，与上游遍历
        // 武器实例自有数值键的口径一致，不能把效果层算两遍）
        if self.melee_weapon.forge_effective {
            for (key, value) in &self.melee_weapon.props {
                *table.melee.entry_static(key).or_insert(0.0) += value;
            }
        }
        if self.ranged_weapon.forge_effective {
            for (key, value) in &self.ranged_weapon.props {
                *table.ranged.entry_static(key).or_insert(0.0) += value;
            }
        }
        for (key, value) in &self.melee_weapon.buff_props {
            *table.weapon_buff_props.entry_static(key).or_insert(0.0) += value;
        }
        for (key, value) in &self.ranged_weapon.buff_props {
            *table.weapon_buff_props.entry_static(key).or_insert(0.0) += value;
        }
        // MOD
        for mod_ in self.iter_mods() {
            add_mod_to_source(&mut table, mod_);
        }
        // BUFF
        for (index, buff) in self.buffs.iter().enumerate() {
            // 被已装备 MOD 禁用的 BUFF 不进全局汇总表
            if !self.is_buff_active(index) {
                continue;
            }
            if !Self::in_plain_slot(buff) {
                continue;
            }
            // 条件BUFF（技能/tag限定）只对命中条件的字段生效，不进全局汇总表
            if buff.is_field_conditional() {
                continue;
            }
            for (key, value) in &buff.props {
                *table.buffs.entry_static(key).or_insert(0.0) += value;
            }
        }
        table
    }
}

impl<'a> BuildContext<'a> {
    /// 追加一个 MOD 候选并重建派生状态；返回新上下文（共享不可变数据，克隆廉价）。
    ///
    /// 自动配装的热循环用它替代「每次候选重跑 `BuildContext::new`」：
    /// 武器/角色/BUFF 装配结果和记录 `Arc` 全部复用，只重算来源表与失效缓存。
    pub fn with_extra_mod(
        &self,
        key: crate::income::ModSlotKey,
        id: i64,
        level: f64,
        buff_level: Option<f64>,
    ) -> Option<Self> {
        let mut next = self.clone();
        if !next.push_mod_candidate(key, id, level, buff_level) {
            return None;
        }
        Some(next)
    }

    pub fn with_mod_probe<R>(
        &mut self,
        key: crate::income::ModSlotKey,
        id: i64,
        level: f64,
        buff_level: Option<f64>,
        evaluate: impl FnOnce(&mut Self) -> R,
    ) -> Option<R> {
        let mod_props: Vec<AttrMap> = self.iter_mods().map(|item| item.props.clone()).collect();
        let buff_props: Vec<AttrMap> = self.buffs.iter().map(|item| item.props.clone()).collect();
        let buff_active = self.buff_active.clone();
        let source_table = self.source_table.clone();
        let version = self.memo.version;
        let source_version = self.memo.source_version;
        let mods_len = self.mods.len();
        let skill_lists = self.skill_lists.get().cloned();
        let slots = match key {
            crate::income::ModSlotKey::Char => self.settings.char_mods.clone(),
            crate::income::ModSlotKey::Melee => self.settings.melee_mods.clone(),
            crate::income::ModSlotKey::Ranged => self.settings.ranged_mods.clone(),
            crate::income::ModSlotKey::Skill => self.settings.skill_mods.clone(),
        };
        let effect_len = self.settings.effect_config.len();
        let scoped_flag = self.scoped_code_computing;
        let vec_len = match key {
            crate::income::ModSlotKey::Char => self.char_mods.len(),
            crate::income::ModSlotKey::Melee => self.melee_mods.len(),
            crate::income::ModSlotKey::Ranged => self.ranged_mods.len(),
            crate::income::ModSlotKey::Skill => self.skill_mods.len(),
        };
        if !self.push_mod_candidate(key, id, level, buff_level) {
            return None;
        }
        let result = evaluate(self);
        match key {
            crate::income::ModSlotKey::Char => self.char_mods.truncate(vec_len),
            crate::income::ModSlotKey::Melee => self.melee_mods.truncate(vec_len),
            crate::income::ModSlotKey::Ranged => self.ranged_mods.truncate(vec_len),
            crate::income::ModSlotKey::Skill => self.skill_mods.truncate(vec_len),
        }
        for (item, props) in self.iter_mods_mut().zip(mod_props) {
            item.props = props;
        }
        for (item, props) in self.buffs.iter_mut().zip(buff_props) {
            item.props = props;
        }
        self.source_table = source_table;
        self.memo = EvalMemo::default();
        self.memo.version = version;
        self.memo.source_version = source_version;
        self.mods.truncate(mods_len);
        self.buff_active = buff_active;
        self.skill_lists = std::sync::OnceLock::new();
        if let Some(lists) = skill_lists {
            let _ = self.skill_lists.set(lists);
        }
        match key {
            crate::income::ModSlotKey::Char => self.settings.char_mods = slots,
            crate::income::ModSlotKey::Melee => self.settings.melee_mods = slots,
            crate::income::ModSlotKey::Ranged => self.settings.ranged_mods = slots,
            crate::income::ModSlotKey::Skill => self.settings.skill_mods = slots,
        }
        self.settings.effect_config.truncate(effect_len);
        self.conditional_props_cache = None;
        self.scoped_code_computing = scoped_flag;
        Some(result)
    }

    pub fn with_mod_remove_probe<R>(
        &mut self,
        key: crate::income::ModSlotKey,
        index: usize,
        evaluate: impl FnOnce(&mut Self) -> R,
    ) -> Option<R> {
        let mod_props: Vec<AttrMap> = self.iter_mods().map(|item| item.props.clone()).collect();
        let buff_props: Vec<AttrMap> = self.buffs.iter().map(|item| item.props.clone()).collect();
        let buff_active = self.buff_active.clone();
        let source_table = self.source_table.clone();
        let version = self.memo.version;
        let source_version = self.memo.source_version;
        let mods_index = self.mods.clone();
        let skill_lists = self.skill_lists.get().cloned();
        let slots = match key {
            crate::income::ModSlotKey::Char => self.settings.char_mods.clone(),
            crate::income::ModSlotKey::Melee => self.settings.melee_mods.clone(),
            crate::income::ModSlotKey::Ranged => self.settings.ranged_mods.clone(),
            crate::income::ModSlotKey::Skill => self.settings.skill_mods.clone(),
        };
        let scoped_flag = self.scoped_code_computing;
        let removed = match key {
            crate::income::ModSlotKey::Char => self.char_mods.get(index).cloned(),
            crate::income::ModSlotKey::Melee => self.melee_mods.get(index).cloned(),
            crate::income::ModSlotKey::Ranged => self.ranged_mods.get(index).cloned(),
            crate::income::ModSlotKey::Skill => self.skill_mods.get(index).cloned(),
        };
        let removed = removed?;
        if !self.remove_mod_candidate(key, index) {
            return None;
        }
        let result = evaluate(self);
        match key {
            crate::income::ModSlotKey::Char => self.char_mods.insert(index, removed),
            crate::income::ModSlotKey::Melee => self.melee_mods.insert(index, removed),
            crate::income::ModSlotKey::Ranged => self.ranged_mods.insert(index, removed),
            crate::income::ModSlotKey::Skill => self.skill_mods.insert(index, removed),
        }
        for (item, props) in self.iter_mods_mut().zip(mod_props) {
            item.props = props;
        }
        for (item, props) in self.buffs.iter_mut().zip(buff_props) {
            item.props = props;
        }
        self.source_table = source_table;
        self.memo = EvalMemo::default();
        self.memo.version = version;
        self.memo.source_version = source_version;
        self.mods = mods_index;
        self.buff_active = buff_active;
        self.skill_lists = std::sync::OnceLock::new();
        if let Some(lists) = skill_lists {
            let _ = self.skill_lists.set(lists);
        }
        match key {
            crate::income::ModSlotKey::Char => self.settings.char_mods = slots,
            crate::income::ModSlotKey::Melee => self.settings.melee_mods = slots,
            crate::income::ModSlotKey::Ranged => self.settings.ranged_mods = slots,
            crate::income::ModSlotKey::Skill => self.settings.skill_mods = slots,
        }
        self.conditional_props_cache = None;
        self.scoped_code_computing = scoped_flag;
        Some(result)
    }

    pub fn push_mod_candidate(
        &mut self,
        key: crate::income::ModSlotKey,
        id: i64,
        level: f64,
        buff_level: Option<f64>,
    ) -> bool {
        let Some(source) = self.tables.mods.get(&id) else {
            return false;
        };
        let instance = self
            .tables
            .templates
            .mod_cached(id, Some(level), buff_level, || {
                LeveledMod::from_source(source, Some(level), buff_level)
            });
        match key {
            crate::income::ModSlotKey::Char => {
                self.char_mods.push(instance.clone());
                self.settings.char_mods.push(Some((id, level)));
            }
            crate::income::ModSlotKey::Melee => {
                self.melee_mods.push(instance.clone());
                self.settings.melee_mods.push(Some((id, level)));
            }
            crate::income::ModSlotKey::Ranged => {
                self.ranged_mods.push(instance.clone());
                self.settings.ranged_mods.push(Some((id, level)));
            }
            crate::income::ModSlotKey::Skill => {
                self.skill_mods.push(instance.clone());
                self.settings.skill_mods.push(Some((id, level)));
            }
        }
        if let Some(level) = buff_level {
            let effect_key = format!("m:{}", crate::income::income_effect_key(id));
            if let Some(entry) = self
                .settings
                .effect_config
                .iter_mut()
                .find(|(name, _)| *name == effect_key)
            {
                entry.1 = level;
            } else {
                self.settings.effect_config.push((effect_key, level));
            }
        }
        self.rebuild_after_mod_change(&instance);
        true
    }

    pub fn remove_mod_candidate(&mut self, key: crate::income::ModSlotKey, index: usize) -> bool {
        let mods = match key {
            crate::income::ModSlotKey::Char => &mut self.char_mods,
            crate::income::ModSlotKey::Melee => &mut self.melee_mods,
            crate::income::ModSlotKey::Ranged => &mut self.ranged_mods,
            crate::income::ModSlotKey::Skill => &mut self.skill_mods,
        };
        if index >= mods.len() {
            return false;
        }
        mods.remove(index);
        let slots = match key {
            crate::income::ModSlotKey::Char => &mut self.settings.char_mods,
            crate::income::ModSlotKey::Melee => &mut self.settings.melee_mods,
            crate::income::ModSlotKey::Ranged => &mut self.settings.ranged_mods,
            crate::income::ModSlotKey::Skill => &mut self.settings.skill_mods,
        };
        if let Some(slot) = slots.iter_mut().filter(|slot| slot.is_some()).nth(index) {
            *slot = None;
        }
        self.rebuild_after_mod_remove();
        true
    }

    fn rebuild_after_mod_remove(&mut self) {
        let mut mods = Vec::new();
        mods.extend(0..self.char_mods.len());
        let melee_base = self.char_mods.len();
        mods.extend(melee_base..melee_base + self.melee_mods.len());
        let ranged_base = melee_base + self.melee_mods.len();
        mods.extend(ranged_base..ranged_base + self.ranged_mods.len());
        let skill_base = ranged_base + self.ranged_mods.len();
        mods.extend(skill_base..skill_base + self.skill_mods.len());
        if self.aura_mod.is_some() {
            mods.push(skill_base + self.skill_mods.len());
        }
        self.mods = mods;
        self.skill_lists = std::sync::OnceLock::new();
        // MOD 移除可能解除 BUFF 的 `禁用` 互斥，全量重建前先刷新生效标记
        self.refresh_buff_activation();
        self.source_table = self.build_source_table();
        self.memo.bump_with_source();
        self.invalidate_derived();
    }
    fn rebuild_after_mod_change(&mut self, added: &LeveledMod) {
        let mut mods = Vec::new();
        mods.extend(0..self.char_mods.len());
        let melee_base = self.char_mods.len();
        mods.extend(melee_base..melee_base + self.melee_mods.len());
        let ranged_base = melee_base + self.melee_mods.len();
        mods.extend(ranged_base..ranged_base + self.ranged_mods.len());
        let skill_base = ranged_base + self.ranged_mods.len();
        mods.extend(skill_base..skill_base + self.skill_mods.len());
        if self.aura_mod.is_some() {
            mods.push(skill_base + self.skill_mods.len());
        }
        self.mods = mods;
        // 技能替换只依赖带替换表的 MOD：新 MOD 无替换表时复用已有列表。
        if !added.raw.obj("技能替换").is_empty() {
            self.skill_lists = std::sync::OnceLock::new();
        }
        // BUFF 生效状态可能因新 MOD 的 `禁用` 互斥而改变：变化时来源表必须全量重建
        let activation_changed = self.refresh_buff_activation();
        // 增量路径：来源表已是最新，只需把新追加的 MOD 累加进去（全量重建是 O(全部词条)）。
        let incremental = if !activation_changed && self.memo.source_version == Some(self.memo.version) {
            let mut table = self.source_table.clone();
            add_mod_to_source(&mut table, added);
            Some(table)
        } else {
            None
        };
        match incremental {
            Some(table) => {
                self.source_table = table;
                self.memo.bump_with_source();
            }
            None => {
                self.source_table = self.build_source_table();
                self.memo.bump_with_source();
            }
        }
        self.invalidate_derived();
    }
}

/// 把单个 MOD 的词条累加进来源表（全量重建与增量追加共用）。
fn add_mod_to_source(table: &mut BonusSourceTable, mod_: &LeveledMod) {
    let scope = mod_.attr_type();
    let mut bucket = scope_bucket_index(scope).map(|index| &mut table.mods_by_scope[index]);
    for (key, value) in &mod_.props {
        *table.mods_all.entry_static(key).or_insert(0.0) += value;
        if let Some(bucket) = bucket.as_deref_mut() {
            *bucket.entry_static(key).or_insert(0.0) += value;
        }
        if scope == "角色" {
            *table.mods_char.entry_static(key).or_insert(0.0) += value;
        }
    }
    for (key, value) in &mod_.buff_props {
        *table.mods_buff_props.entry_static(key).or_insert(0.0) += value;
    }
}

/// 条件判定的公共表（每次 `apply_conditions` 只建一次）。
pub(crate) struct ConditionTables {
    pub values: HashMap<String, f64>,
    pub polarity: HashMap<String, f64>,
    pub max_id_count: f64,
}

/// MOD 所在槽位分组。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Section {
    Char,
    Melee,
    Ranged,
    Skill,
    Aura,
}

/// 武器面板引用。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum WeaponRef {
    /// 当前基底名对应的武器（`selectedWeapon`）。
    Selected,
    Melee,
    Ranged,
    Skill,
}

/// 按 MOD 技能替换表替换武器技能；对应上游 `replaceWeaponSkillsByMods`。
fn replace_weapon_skills(skills: &[LeveledSkill], mods: &[LeveledMod]) -> Vec<LeveledSkill> {
    let mut replace_map: HashMap<i64, Record> = HashMap::new();
    for mod_ in mods {
        let replace = mod_.raw.obj("技能替换");
        for key in replace.keys_ref() {
            if let Some(value) = replace.value(key)
                && let Ok(id) = key.parse::<i64>()
            {
                replace_map.insert(id, Record::from_value(value));
            }
        }
    }
    if replace_map.is_empty() {
        return skills.to_vec();
    }
    skills
        .iter()
        .map(|skill| match replace_map.get(&skill.id) {
            Some(replacement) => {
                // 替换数据补齐缺失字段（名称/类型/描述回落到原技能）
                let mut map = replacement.as_map().clone();
                map.entry("id".to_string())
                    .or_insert_with(|| serde_json::json!(skill.id));
                if !map.contains_key("名称") {
                    map.insert("名称".to_string(), serde_json::json!(skill.name));
                }
                LeveledSkill::new(
                    Record::from_map(map),
                    Some(skill.level),
                    None,
                    String::new(),
                )
            }
            None => skill.clone(),
        })
        .collect()
}

/// 属性是否落在当前作用域内；对应上游 `isBuffAttributeInScope`。
pub fn is_buff_in_scope(attribute: &str, scope: &str) -> bool {
    let attribute_scope = prefix_scope(attribute);
    if attribute_scope == "近战" || attribute_scope == "远程" || attribute_scope.starts_with("同律")
    {
        return scope == attribute_scope;
    }
    true
}

/// 同律技能的来源技能索引；对应上游 `skillIds.find(整数 && >= 0) ?? 2`。
///
/// `skill` 缺失时上游按 `[1]` 处理（即取 Q 等级）。
fn skill_sync_source_index(weapon: &Record) -> i64 {
    let Some(Value::Array(items)) = weapon.value("skill") else {
        return 1;
    };
    for item in items {
        if let Some(value) = item.as_f64()
            && value.is_finite()
            && value.fract() == 0.0
            && value >= 0.0
        {
            return value as i64;
        }
    }
    2
}

/// 把角色技能里属于同律武器的伤害字段汇成一条「同律武器伤害」技能；
/// 对应上游 `CharBuild.set char` 中 `uweaponData.技能 = [uweaponSkillData]` 那段。
///
/// 规则（逐条对齐上游）：
/// - 来源技能：`同律武器.skill`（下标数组，默认 `[1]`）指向的角色技能；
/// - 取字段条件：名称匹配 `同律武器.filter`（正则，默认 `伤害`）**且**以「伤害」结尾；
/// - 技能名取同律武器名，图标取第一个来源技能的图标。
///
/// 返回 `None` 表示没有可用的来源技能（此时上游会走 catch 分支、不建同律武器技能）。
fn aggregate_skill_weapon_fields(weapon: &Record, char: &LeveledChar) -> Option<serde_json::Value> {
    // 来源技能下标（默认 `[1]`，即第二个角色技能；`includes` 按 SameValueZero
    // 比对，非整数下标不命中任何技能）。
    let indices: Vec<usize> = match weapon.value("skill") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| {
                let value = item.as_f64()?;
                if !value.is_finite() || value.fract() != 0.0 || value < 0.0 {
                    return None;
                }
                Some(value as usize)
            })
            .collect(),
        _ => vec![1],
    };
    // `filter` 是**正则**源码；这里只需支持数据里出现的形态（如 `^\[萨麦尔\]`），
    // 所以退化成「子串包含」判定：数据里的 filter 都是「名称里出现这段文字」的意图。
    let filter = weapon.str_or_empty("filter");
    let source: Vec<&LeveledSkill> = indices
        .iter()
        .filter_map(|index| char.skills.get(*index))
        .collect();
    if source.is_empty() {
        return None;
    }

    let mut fields: Vec<Value> = Vec::new();
    for skill in &source {
        for field in &skill.raw_fields {
            let name = field.str_ref("名称").unwrap_or("");
            if !name.ends_with("伤害") {
                continue;
            }
            if !filter.is_empty() && !name.contains(filter) {
                continue;
            }
            fields.push(field.clone().into_value());
        }
    }

    Some(serde_json::json!({
        "名称": weapon.text("名称"),
        "类型": "同律武器伤害",
        "字段": fields,
    }))
}

/// 从配置构造 MOD 列表；对应上游 `LeveledModHelper.fromId(id, 等级, buffLv)`。
///
/// TS 严格口径（spec §6.4(2)）：下线 MOD 直接报错，由 [`BuildContext::new`] 转为 `None`。
fn build_mods(
    tables: &BuildTables,
    slots: &[ModSlot],
    settings: &CharSettings,
    is_aura: bool,
) -> Result<Vec<LeveledMod>, String> {
    crate::prof!("context::build_mods");
    let mut result = Vec::new();
    for slot in slots {
        let Some((id, level)) = slot else { continue };
        let Some(source) = tables.mods.get(id) else {
            return Err(format!("未知 MOD：{id}"));
        };
        let buff_level = effect_level_for_mod(tables, settings, *id, is_aura);
        result.push(tables.templates.mod_cached(*id, Some(*level), buff_level, || {
            LeveledMod::from_source(source, Some(*level), buff_level)
        }));
    }
    Ok(result)
}

/// MOD 特效等级；对应上游 `getModBuffLvFromSetting`。
fn effect_level_for_mod(
    tables: &BuildTables,
    settings: &CharSettings,
    mod_id: i64,
    is_aura: bool,
) -> Option<f64> {
    if is_aura {
        // 中枢 MOD 固定按满级（上游 `variant_aura` 走 `fromId(id)` 不带等级 → 等级取满级）
        return None;
    }
    if let Some(level) = settings.mod_effect_level(mod_id) {
        return Some(level);
    }
    // 无配置时取特效上限 `mx`，无特效按 1
    let effect = tables
        .mods
        .get(&mod_id)
        .and_then(|source| source.effect.as_ref());
    match effect {
        Some(record) => Some(record.num("mx").unwrap_or(1.0)),
        None => Some(1.0),
    }
}

/// 从配置构造武器；对应上游 `LeveledWeaponHelper.fromId(...)`。
///
/// TS 严格口径（spec §6.4(2) 的查表入口一致性）：配置点名的武器 id 查不到时整份失败，
/// 由 [`BuildContext::new`] 转为 `None`；`id == 0` 仍表示未装备，返回空武器。
fn build_weapon(
    tables: &BuildTables,
    weapon_id: i64,
    refine: f64,
    level: f64,
    settings: &CharSettings,
    char: &LeveledChar,
) -> Option<LeveledWeapon> {
    crate::prof!("context::build_weapon");
    // id 为 0 表示未装备
    if weapon_id == 0 {
        return Some(LeveledWeapon::empty());
    }
    let source = tables.weapons.get(&weapon_id)?;
    let effect_level = weapon_effect_level(tables, settings, weapon_id, &char.element);
    Some(tables.templates.weapon_cached(
        weapon_id,
        Some(refine),
        Some(level),
        effect_level,
        || {
            LeveledWeapon::from_source(
                source,
                Some(refine),
                Some(level),
                effect_level,
                &crate::const_tables::COMMON_LEVEL_UP,
            )
        },
    ))
}

/// 武器特效等级；对应上游 `getWBuffLvFromSetting`（限定元素不符时为 0）。
fn weapon_effect_level(
    tables: &BuildTables,
    settings: &CharSettings,
    weapon_id: i64,
    element: &str,
) -> Option<f64> {
    let effect = tables
        .weapons
        .get(&weapon_id)
        .and_then(|source| source.effect.as_ref());
    if let Some(limit) = effect.and_then(|record| {
        let text = record.str_or_empty("限定");
        if text.is_empty() { None } else { Some(text) }
    }) && limit != element
        && element != "any"
    {
        return Some(0.0);
    }
    if let Some(level) = settings.weapon_effect_level(weapon_id) {
        return Some(level);
    }
    match effect {
        Some(record) => Some(record.num("mx").unwrap_or(1.0)),
        None => Some(1.0),
    }
}

/// 目标怪物；对应上游 `new LeveledMonster(enemyId, enemyLevel)`。
///
/// TS 严格口径：查不到怪物时返回 [`crate::error::CalcError::UnknownMonster`]，
/// 由外层（[`BuildContext::new`]）转为 `None`（调用方决定回退策略，见 spec §6.4(1)）。
fn build_enemy(
    tables: &BuildTables,
    settings: &CharSettings,
) -> Result<LeveledMonster, crate::error::CalcError> {
    let Some(raw) = tables.monsters.get(&settings.enemy_id).cloned() else {
        return Err(crate::error::CalcError::UnknownMonster(format!(
            "怪物 {} 未在数据表中找到",
            settings.enemy_id
        )));
    };
    Ok(tables.templates.monster_cached(
        settings.enemy_id,
        settings.enemy_level,
        settings.is_rouge,
        1.0,
        || {
            LeveledMonster::build(
                raw,
                settings.enemy_level,
                settings.is_rouge,
                // 上游 `LeveledMonster` 的 hpMultiplier 默认 1（构筑里没有血量倍率配置）
                1.0,
                &crate::const_tables::MOB_LEVEL_UP,
            )
        },
    ))
}

/// 便于构造面板子对象（`char.x` / `weapon.x` 等只读基础值）。
pub fn base_map(entries: &[(&str, f64)]) -> AttrMap {
    entries
        .iter()
        .map(|(key, value)| ((*key).to_string(), *value))
        .collect()
}

impl<'a> BuildContext<'a> {
    /// `code` 沙盒的 MOD 槽位词条表（按状态版本缓存，逐条 code 共享同一份）。
    pub(crate) fn mod_slot_maps_cached(&mut self) -> std::sync::Arc<HashMap<String, AttrMap>> {
        if let Some((version, cached)) = &self.mod_maps_cache
            && *version == self.memo.version
        {
            return cached.clone();
        }
        let map = std::sync::Arc::new(mod_slot_maps(self));
        self.mod_maps_cache = Some((self.memo.version, map.clone()));
        map
    }
}

/// 构造 `code` 执行环境里用的 MOD 槽位词条表。
pub fn mod_slot_maps(context: &BuildContext<'_>) -> HashMap<String, AttrMap> {
    let mut map = HashMap::new();
    map.insert("charMods".to_string(), sum_mod_attrs(&context.char_mods));
    map.insert("meleeMods".to_string(), sum_mod_attrs(&context.melee_mods));
    map.insert(
        "rangedMods".to_string(),
        sum_mod_attrs(&context.ranged_mods),
    );
    map.insert("skillMods".to_string(), sum_mod_attrs(&context.skill_mods));
    map
}

fn sum_mod_attrs(mods: &[LeveledMod]) -> AttrMap {
    let mut result = AttrMap::new();
    for mod_ in mods {
        for (key, value) in mod_.add_attr() {
            *result.entry(key).or_insert(0.0) += value;
        }
    }
    result
}

/// 跑一段 `code`，把结果写回属性表。
pub fn run_dynamic_buff(
    code: &str,
    attrs: &mut AttrMap,
    field_attrs: std::sync::Arc<HashMap<String, AttrMap>>,
    bases: std::sync::Arc<HashMap<String, AttrMap>>,
    mod_attrs: std::sync::Arc<HashMap<String, AttrMap>>,
    enemy_level: f64,
) -> (std::sync::Arc<HashMap<String, AttrMap>>, dynamic::CodeOutcome) {
    let mut env = CodeEnv {
        attrs,
        field_attrs,
        bases,
        mod_attrs,
        enemy: dynamic::enemy_attr_map(enemy_level),
    };
    let outcome = dynamic::run_code(code, &mut env);
    (env.field_attrs, outcome)
}

#[cfg(test)]
mod send_tests {
    #[test]
    fn context_is_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<super::BuildContext<'static>>();
        assert_send_sync::<super::SkillLists>();
    }
}
