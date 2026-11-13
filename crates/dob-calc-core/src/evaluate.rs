//! 构筑求值的对外入口。
//!
//! 一次调用完成：装配构筑 → 算角色属性 → 算当前武器面板 → 求值目标函数。
//! 对应的上游调用链是
//! `createCharBuildFromSettings` → `new CharBuild` → `calculateWeaponAttributes`
//! → `calculateTargetFunction` → `evaluateAST`。
//!
//! Q1 结论（同时见 models.rs `SkillPattern`）：`buff.data.ts` 真实 `技能` pattern 全集含
//! 锚点模式 `狙击子弹|^伤害$`（^伤害$ 须精确全字匹配）；自研匹配器覆盖
//! {字面量, `|` 交替, `^…$` 锚点, `.` / `.*`}，无需引入完整 `regex` 依赖
//! （非法 pattern 回落字面量 `contains`，与 TS `compileBuffSkillPattern` 一致）。

use std::collections::HashMap;

use super::ast_eval::Evaluator;
use super::config::CharSettings;
use super::context::{BuildContext, WeaponRef};
use super::damage::DamageResult;
use super::models::AttrMap;
use super::tables::BuildTables;
use crate::error::CalcError;

/// 一次求值的请求。
#[derive(Debug, Clone)]
pub struct BuildRequest {
    /// 角色 id（皎皎角的 6 位 id 会自动右移两位查表）。
    pub char_id: i64,
    /// 构筑配置。
    pub settings: CharSettings,
    /// 附带的面板数组：与目标值同一次装配批量计算，复用请求；缺省不返回面板。
    pub panels: Option<PanelSelection>,
    /// 自动配装的确定性种子（spec §6.5；缺省固定值，结果可复现）。
    pub seed: Option<u64>,
    /// 时间轴输入（FlowPort 拥有类型；本入口暂不消费，由 FlowPort 的扩展消费）。
    pub timeline: Option<crate::timeline::RawTimelineData>,
}

impl BuildRequest {
    /// 从请求 JSON 解析 `{charId, settings, panels?, seed?, timeline?}`。
    pub fn from_json(raw: &serde_json::Value) -> Result<Self, CalcError> {
        let char_id = raw
            .get("charId")
            .and_then(super::config::json_id)
            .ok_or_else(|| CalcError::ConfigParse("缺少 charId".to_string()))?;
        let settings = raw
            .get("settings")
            .map(CharSettings::from_json)
            .unwrap_or_default();
        let panels = PanelSelection::from_json(raw);
        let seed = raw.get("seed").and_then(serde_json::Value::as_u64);
        let timeline = raw.get("timeline").and_then(|value| {
            serde_json::from_value::<crate::timeline::RawTimelineData>(value.clone()).ok()
        });
        Ok(Self {
            char_id,
            settings,
            panels,
            seed,
            timeline,
        })
    }
}

/// 武器槽名（`melee` / `ranged` / `skill`）；`Selected` 不是可请求的槽位。
fn weapon_slot_name(slot: WeaponRef) -> Option<&'static str> {
    match slot {
        WeaponRef::Melee => Some("melee"),
        WeaponRef::Ranged => Some("ranged"),
        WeaponRef::Skill => Some("skill"),
        WeaponRef::Selected => None,
    }
}

/**
 * 解析请求里的武器槽名（`melee` / `ranged` / `skill`）。
 * @param value 槽名字符串
 * @returns 武器槽；未知值返回 None
 */
fn parse_weapon_slot_name(value: &str) -> Option<WeaponRef> {
    match value {
        "melee" => Some(WeaponRef::Melee),
        "ranged" => Some(WeaponRef::Ranged),
        "skill" => Some(WeaponRef::Skill),
        _ => None,
    }
}

/// 面板选择：一次请求要算哪些面板（角色 + 武器槽）。
#[derive(Debug, Clone)]
pub struct PanelSelection {
    /// 是否包含角色属性面板（键为 `char`）。
    pub include_char: bool,
    /// 需要的武器槽。
    pub slots: Vec<WeaponRef>,
}

impl PanelSelection {
    /// 解析 `panels` 数组（`char` + `melee` / `ranged` / `skill`）；缺省或空数组返回 None。
    pub fn from_json(raw: &serde_json::Value) -> Option<Self> {
        let items = raw.get("panels").and_then(serde_json::Value::as_array)?;
        if items.is_empty() {
            return None;
        }
        let mut include_char = false;
        let mut slots: Vec<WeaponRef> = Vec::new();
        for item in items {
            let Some(name) = item.as_str() else { continue };
            if name == "char" {
                include_char = true;
            } else if let Some(slot) = parse_weapon_slot_name(name)
                && !slots.contains(&slot)
            {
                slots.push(slot);
            }
        }
        Some(Self {
            include_char,
            slots,
        })
    }

    /// 全部武器槽：`panels` 端点缺省口径。
    pub fn all_weapon_slots() -> Self {
        Self {
            include_char: false,
            slots: vec![WeaponRef::Melee, WeaponRef::Ranged, WeaponRef::Skill],
        }
    }
}

/// 面板请求：一个构筑 + 一组面板类型；同一构筑只装配一次，批量返回面板。
#[derive(Debug, Clone)]
pub struct PanelsRequest {
    /// 角色 id（与 `BuildRequest` 同口径）。
    pub char_id: i64,
    /// 构筑配置。
    pub settings: CharSettings,
    /// 请求的面板；`panels` 缺省时取全部武器槽。
    pub panels: PanelSelection,
}

impl PanelsRequest {
    /// 从请求 JSON 解析 `{charId, settings, panels?}`。
    ///
    /// `panels` 支持 `char`（角色面板）与 `melee` / `ranged` / `skill`（武器面板）；
    /// 缺省或空数组时取全部武器槽。
    pub fn from_json(raw: &serde_json::Value) -> Result<Self, CalcError> {
        let char_id = raw
            .get("charId")
            .and_then(super::config::json_id)
            .ok_or_else(|| CalcError::ConfigParse("缺少 charId".to_string()))?;
        let settings = raw
            .get("settings")
            .map(CharSettings::from_json)
            .unwrap_or_default();
        Ok(Self {
            char_id,
            settings,
            panels: PanelSelection::from_json(raw).unwrap_or_else(PanelSelection::all_weapon_slots),
        })
    }
}

/**
 * 按选择计算面板：武器键为 `melee` / `ranged` / `skill`，角色面板键为 `char`。
 * 武器槽不存在（如无同律武器）时该键缺席。
 * @param context 已装配的构筑
 * @param selection 面板选择
 * @returns 面板键 → 属性表
 */
fn compute_panels(
    context: &mut BuildContext<'_>,
    selection: &PanelSelection,
) -> HashMap<String, AttrMap> {
    let need = |slot: WeaponRef| selection.slots.contains(&slot);
    let panels = context.weapon_panels_for(
        need(WeaponRef::Melee),
        need(WeaponRef::Ranged),
        need(WeaponRef::Skill),
    );
    let mut result = HashMap::new();
    for slot in [WeaponRef::Melee, WeaponRef::Ranged, WeaponRef::Skill] {
        if !need(slot) {
            continue;
        }
        let Some(name) = weapon_slot_name(slot) else {
            continue;
        };
        if let Some(panel) = panels.get(name) {
            result.insert(name.to_string(), panel.clone());
        }
    }
    if selection.include_char {
        // 与 evaluate 同一口径：含动态 BUFF code 与充盈 / 召唤物转化的最终角色属性
        result.insert(
            "char".to_string(),
            context.calculate_weapon_attributes(None).char,
        );
    }
    result
}

/**
 * 批量计算面板：同一构筑只装配一次。
 * @param tables 建好的数据表
 * @param request 面板请求
 * @returns 面板键 → 属性表；角色不存在时返回 None
 */
pub fn evaluate_panels(
    tables: &BuildTables,
    request: &PanelsRequest,
) -> Option<HashMap<String, AttrMap>> {
    let mut context = BuildContext::new(tables, request.char_id, &request.settings)?;
    Some(compute_panels(&mut context, &request.panels))
}

/// 伤害明细（对外暴露的扁平结构）。
#[derive(Debug, Clone, Copy, Default)]
pub struct DamageBreakdown {
    pub expected_damage: f64,
    pub no_hp_damage: f64,
    pub physical_damage: f64,
    pub element_damage: f64,
    pub higher_crit_expected_trigger: f64,
    pub lower_crit_expected_trigger: f64,
}

impl From<DamageResult> for DamageBreakdown {
    fn from(value: DamageResult) -> Self {
        Self {
            expected_damage: value.expected_damage,
            no_hp_damage: value.no_hp_damage,
            physical_damage: value.physical_damage,
            element_damage: value.element_damage,
            higher_crit_expected_trigger: value.higher_crit_expected_trigger,
            lower_crit_expected_trigger: value.lower_crit_expected_trigger,
        }
    }
}

/// 参与构筑的单条 BUFF（名称 + 生效范围）；对应上游 `LeveledBuff` 的展示字段。
///
/// 条件BUFF带生效范围：`技能` 字段名限定存 `skill`，`tag` 字段标签限定存 `tags`；
/// 普通 BUFF 两者都为空。
#[derive(Debug, Clone, Default)]
pub struct BuffScope {
    pub name: String,
    pub skill: Option<String>,
    pub tags: Vec<String>,
}

/// 求值结果。
#[derive(Debug, Clone, Default)]
pub struct BuildResult {
    /// 角色属性（含武器转化的最终值）。
    pub attributes: AttrMap,
    /// 当前武器面板。
    pub weapon: Option<AttrMap>,
    /// 请求附带的批量面板（键同 [`PanelSelection`]）；未请求时为空。
    pub panels: HashMap<String, AttrMap>,
    /// 目标函数求值结果（即界面上显示的总伤害 / DPS）。
    pub target_value: f64,
    /// 当前字段的伤害明细。
    pub damage: Option<DamageBreakdown>,
    /// 目标函数表达式（回显用）。
    pub target_function: String,
    /// 参与构筑的 BUFF（名称 + 生效范围）；对应上游 `LeveledBuff.技能` / `LeveledBuff.tag`。
    /// 无条件普通 BUFF 的生效范围为空。
    pub buffs: Vec<BuffScope>,
    /// 求值失败原因（表达式语法错误等）；`None` 表示正常。
    pub error: Option<String>,
}

/// 上游 `CharBuild.macros`：表达式里的词法级宏。
///
/// 表内容固定，进程级只建一次（原先每次解析都新建 17 项 HashMap）。
pub fn macros() -> &'static HashMap<String, String> {
    static MACROS: std::sync::LazyLock<HashMap<String, String>> =
        std::sync::LazyLock::new(|| {
            [
                ("ATK", "攻击"),
                ("DEF", "防御"),
                ("HP", "生命"),
                ("SP", "神智"),
                ("DPH", "or(多重,1)*伤害"),
                ("总伤", "max(1,召唤物攻击次数)*伤害"),
                ("暴击伤害", "伤害.暴击"),
                ("DPS", "or(攻速,技能速度)*or(多重,1)*伤害"),
                ("范围收益", "技能范围*伤害"),
                ("耐久收益", "技能耐久*伤害"),
                ("效益收益", "技能效益*伤害"),
                ("每神智DPH", "1/神智消耗*伤害"),
                ("每持续神智DPH", "1/每秒神智消耗*伤害"),
                ("每神智DPS", "or(攻速,技能速度)/神智消耗*伤害"),
                ("每持续神智DPS", "or(攻速,技能速度)/每秒神智消耗*伤害"),
            ]
            .into_iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
        });
    &MACROS
}

/// 单表达式求值结果。
#[derive(Debug, Clone, Default)]
pub struct ExpressionResult {
    /// 求值（成功时）。
    pub value: Option<f64>,
    /// 错误信息（失败时）。
    pub error: Option<String>,
}

/// 在已有上下文上求值（属性/面板走记忆化，`target_function` 为空时按 `伤害`）。
///
/// `evaluate_build_inner` 与 [`CalcSession`] 共用：前者现装配现算，后者复用装配。
/// `panels` 为附带请求的面板数组：与目标值共用同一次装配，复用请求。
fn evaluate_on_context(
    context: &mut BuildContext<'_>,
    target_function: &str,
    panels: Option<&PanelSelection>,
) -> BuildResult {
    // 角色属性（含 code 动态 BUFF 与充盈/召唤物转化后的最终值；对齐上游
    // `calculateByBasename` 取 `calculateWeaponAttributes()` 的口径）
    let weapon_result = context.calculate_weapon_attributes(None);
    let attributes = weapon_result.char.clone();

    // 当前武器面板
    let weapon = weapon_result.panel.clone();

    // BUFF 清单（`buffs` 已含全部实例，按名字去重；条件BUFF带生效范围）
    let mut buffs: Vec<BuffScope> = Vec::new();
    for buff in context.buffs.iter() {
        if buffs.iter().any(|item| item.name == buff.name) {
            continue;
        }
        buffs.push(BuffScope {
            name: buff.name.clone(),
            skill: buff.skill.clone(),
            tags: buff.tag.clone(),
        });
    }

    let target_function = if target_function.is_empty() {
        "伤害".to_string()
    } else {
        target_function.to_string()
    };

    // 目标函数求值（失败时按上游返回 0 并记录原因）
    let mut evaluator = Evaluator::new(context);
    let (target_value, damage, error) = match evaluator.evaluate(&target_function) {
        Ok(value) => (value, evaluator.current_damage(), None),
        Err(message) => (0.0, None, Some(message)),
    };
    drop(evaluator);

    // 附带请求的面板数组：复用同一次装配（面板已随求值上下文记忆化）
    let panel_map = match panels {
        Some(selection) => compute_panels(context, selection),
        None => HashMap::new(),
    };

    BuildResult {
        attributes,
        weapon,
        panels: panel_map,
        target_value,
        // 目标函数不是单个伤害字段时（如 `1+1`），用总量兜一个明细
        damage: damage.map(DamageBreakdown::from).or(Some(DamageBreakdown {
            expected_damage: target_value,
            ..Default::default()
        })),
        target_function,
        buffs,
        error,
    }
}

/// 求值一份构筑（内部实现：装配失败时按缺失资源返回对应 CalcError 文案）。
fn evaluate_build_inner(tables: &BuildTables, request: &BuildRequest) -> BuildResult {
    let mut context = match BuildContext::new(tables, request.char_id, &request.settings) {
        Some(context) => context,
        None => {
            return BuildResult {
                error: Some("角色未在数据表中找到".to_string()),
                ..Default::default()
            };
        }
    };
    evaluate_on_context(
        &mut context,
        &request.settings.target_function,
        request.panels.as_ref(),
    )
}

/// 求值一份构筑；对应上游 `CharBuild.calculate()`。
///
/// `request.timeline` 存在时目标值走时间轴累计（`timeline::calculate_request`，
/// 含护盾/血量状态机）；面板仍按当前配置算一次供展示。
///
/// 热路径收敛：解析只许构造期——
/// `BuildContext::new` 一次装配（含技能字段表预建），`Evaluator::new`
/// 一次建表，热路径 `evaluate` 零解析、零建表；批量入口共享一个 Evaluator。
pub fn evaluate_build(tables: &BuildTables, request: &BuildRequest) -> BuildResult {
    if request.timeline.is_some() {
        return evaluate_build_with_timeline(tables, request);
    }
    evaluate_build_inner(tables, request)
}

/// 含时间轴的求值：属性/武器面板按当前配置算一次（展示用），目标值走时间轴累计。
fn evaluate_build_with_timeline(tables: &BuildTables, request: &BuildRequest) -> BuildResult {
    let mut result = evaluate_build_inner(tables, request);
    result.target_value = super::timeline::calculate_request(tables, request);
    if let Some(damage) = result.damage.as_mut() {
        damage.expected_damage = result.target_value;
    }
    result
}

/// 批量求值表达式（对标 dob-app `evaluate_expressions_in_session`）：
/// 一次装配 + 一个 Evaluator 批量求值，逐条 catch 错误（失败项 value=None + error 文案）。
pub fn evaluate_expressions(
    tables: &BuildTables,
    request: &BuildRequest,
    expressions: &[String],
) -> Vec<ExpressionResult> {
    let Some(mut context) = BuildContext::new(tables, request.char_id, &request.settings) else {
        return expressions
            .iter()
            .map(|_| ExpressionResult {
                value: None,
                error: Some("角色未在数据表中找到".to_string()),
            })
            .collect();
    };
    let mut evaluator = Evaluator::new(&mut context);
    expressions
        .iter()
        .map(|expression| match evaluator.evaluate(expression) {
            Ok(value) => ExpressionResult {
                value: Some(value),
                error: None,
            },
            Err(message) => ExpressionResult {
                value: None,
                error: Some(message),
            },
        })
        .collect()
}

/// 批量求值多份构筑（autobuild 候选评估入口）：
/// 共享建表、逐个装配求值。
pub fn evaluate_candidates(tables: &BuildTables, requests: &[BuildRequest]) -> Vec<BuildResult> {
    requests
        .iter()
        .map(|request| evaluate_build_inner(tables, request))
        .collect()
}

/// 技能字段视图（`dobcc_skill_fields` 的结果元素）；对应上游字段表条目。
#[derive(Debug, Clone, Default)]
pub struct SkillFieldView {
    pub name: String,
    pub safe_name: String,
    pub value: f64,
    pub value2: f64,
    pub format: Option<String>,
    pub base: Option<String>,
    pub tags: Vec<String>,
    pub damage_type: Option<String>,
}

/// 取某技能的结算字段表（`skill` 按名称或 safeName 匹配角色/武器技能；
/// 未命中返回 `None`，调用方按上游口径记空表）。
pub fn skill_fields_for(
    tables: &BuildTables,
    request: &BuildRequest,
    skill: &str,
) -> Option<Vec<SkillFieldView>> {
    let mut context = BuildContext::new(tables, request.char_id, &request.settings)?;
    let safe = context
        .all_skills()
        .find(|s| s.name == skill || s.safe_name == skill)?
        .safe_name
        .clone();
    let mut evaluator = Evaluator::new(&mut context);
    let fields = evaluator.fields_for(&safe)?;
    Some(
        fields
            .iter()
            .map(|field| SkillFieldView {
                name: field.base.name.clone(),
                safe_name: field.base.safe_name.clone(),
                value: field.value,
                value2: field.value2,
                format: field.base.format.clone(),
                base: field.base.attr_prop.clone(),
                tags: field.base.tags.clone(),
                damage_type: field.base.damage_type.clone(),
            })
            .collect(),
    )
}

/// 取全槽武器面板（`dobcc_panels` 的结果；键集与上游 `weapon_panels` 一致：
/// 近战/远程/同律 + melee/ranged/skill + 各武器技能名）。
pub fn panels_for(
    tables: &BuildTables,
    request: &BuildRequest,
) -> Option<std::collections::HashMap<String, AttrMap>> {
    let mut context = BuildContext::new(tables, request.char_id, &request.settings)?;
    Some(context.weapon_panels_for(true, true, true))
}

/// FNV-1a 64（指纹用）。
fn fnv1a(mut hash: u64, bytes: &[u8]) -> u64 {
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// 配置指纹：`assembly_only` 跳过目标函数、自定义变量与面板选择（它们不影响装配）。
fn fingerprint_settings(
    settings: &CharSettings,
    assembly_only: bool,
    panels: Option<&PanelSelection>,
) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    macro_rules! mix {
        ($bytes:expr) => {
            hash = fnv1a(hash, $bytes)
        };
    }
    macro_rules! num {
        ($value:expr) => {
            mix!(&$value.to_bits().to_le_bytes())
        };
    }
    mix!(&settings.char_level.to_bits().to_le_bytes());
    mix!(settings.base_name.as_bytes());
    num!(settings.hp_percent);
    num!(settings.resonance_gain);
    mix!(&settings.enemy_id.to_le_bytes());
    num!(settings.enemy_level);
    num!(settings.enemy_resistance);
    mix!(&[u8::from(settings.is_rouge)]);
    if !assembly_only {
        mix!(settings.target_function.as_bytes());
        for (key, value) in &settings.custom_variables {
            mix!(key.as_bytes());
            mix!(value.as_bytes());
        }
        // 附带面板只影响返回结果，不进装配指纹
        mix!(&[u8::from(panels.is_some())]);
        if let Some(selection) = panels {
            mix!(&[u8::from(selection.include_char)]);
            for slot in &selection.slots {
                mix!(&[match slot {
                    WeaponRef::Melee => 1u8,
                    WeaponRef::Ranged => 2,
                    WeaponRef::Skill => 3,
                    WeaponRef::Selected => 4,
                }]);
            }
        }
    }
    for level in settings.char_skill_level {
        num!(level);
    }
    mix!(settings.extra_mastery.as_bytes());
    mix!(&settings.melee_weapon.to_le_bytes());
    num!(settings.melee_weapon_level);
    num!(settings.melee_weapon_refine);
    mix!(&settings.ranged_weapon.to_le_bytes());
    num!(settings.ranged_weapon_level);
    num!(settings.ranged_weapon_refine);
    mix!(&settings.aura_mod.to_le_bytes());
    mix!(&[u8::from(settings.imbalance)]);
    for slots in [
        &settings.char_mods,
        &settings.melee_mods,
        &settings.ranged_mods,
        &settings.skill_mods,
    ] {
        // 先写长度再写内容，避免 [Some(m)], [] 与 [], [Some(m)] 编码成同一段字节
        mix!(&(slots.len() as u64).to_le_bytes());
        for slot in slots {
            match slot {
                Some((id, level)) => {
                    mix!(&[1]);
                    mix!(&id.to_le_bytes());
                    num!(*level);
                }
                None => mix!(&[0]),
            }
        }
    }
    mix!(&settings.mod_variant_index.to_le_bytes());
    for variant in &settings.mod_variants {
        match variant.aura {
            Some(id) => {
                mix!(&[1]);
                mix!(&id.to_le_bytes());
            }
            None => mix!(&[0]),
        }
        // 变体槽位同样参与指纹：否则 B/C 内容不同但光环相同时会误命中缓存。
        for slots in [
            &variant.char_mods,
            &variant.melee_mods,
            &variant.ranged_mods,
            &variant.skill_mods,
        ] {
            // 变体四个向量长度可以不同，不写长度会让不同槽位组合的指纹相撞
            mix!(&(slots.len() as u64).to_le_bytes());
            for slot in slots {
                match slot {
                    Some((id, level)) => {
                        mix!(&[1]);
                        mix!(&id.to_le_bytes());
                        num!(*level);
                    }
                    None => mix!(&[0]),
                }
            }
        }
    }
    for (name, level, coverage) in &settings.buffs {
        mix!(name.as_bytes());
        num!(*level);
        match coverage {
            Some(value) => {
                mix!(&[1]);
                num!(*value);
            }
            None => mix!(&[0]),
        }
    }
    for (property, value) in &settings.custom_buff {
        mix!(property.as_bytes());
        num!(*value);
    }
    mix!(&settings.pet_id.to_le_bytes());
    num!(settings.pet_level);
    num!(settings.pet_coverage);
    mix!(&[u8::from(settings.pet_auto_coverage)]);
    for slot in &settings.traits {
        match slot {
            Some((id, level)) => {
                mix!(&[1]);
                mix!(&id.to_le_bytes());
                num!(*level);
            }
            None => mix!(&[0]),
        }
    }
    for team in [settings.team1, settings.team2] {
        match team {
            Some(id) => {
                mix!(&[1]);
                mix!(&id.to_le_bytes());
            }
            None => mix!(&[0]),
        }
    }
    for weapon in [settings.team1_weapon, settings.team2_weapon] {
        match weapon {
            Some(id) => {
                mix!(&[1]);
                mix!(&id.to_le_bytes());
            }
            None => mix!(&[0]),
        }
    }
    mix!(&[u8::from(settings.timeline_dps)]);
    mix!(&[u8::from(settings.use_global)]);
    for (key, value) in &settings.effect_config {
        mix!(key.as_bytes());
        num!(*value);
    }
    num!(settings.dot_settings.skill);
    num!(settings.dot_settings.melee);
    num!(settings.dot_settings.ranged);
    num!(settings.dot_settings.skillweapon);
    mix!(&[u8::from(settings.dot_settings.force_own_additional_damage)]);
    hash
}

/// 同构筑复用会话；对应上游 `CharBuild` 实例的热复用（`calculate()` 缓存命中路径）。
///
/// 三档命中：求值指纹全同 → 直接返回上次结果；装配指纹相同（只差目标函数/自定义变量）
/// → 复用上下文重跑求值（属性/面板记忆化命中）；否则重建。含 `timeline` 的请求不缓存，
/// 透传 [`evaluate_build`]（时间轴内部自建上下文）。
///
/// 字段顺序即析构顺序：`context` 借用 `tables`，必须先声明先释放；
/// `tables` 装箱保证堆地址稳定（会话移动不影响借用）。
#[derive(Debug)]
pub struct CalcSession {
    context: Option<BuildContext<'static>>,
    last_result: Option<BuildResult>,
    char_id: i64,
    assembly_fp: u64,
    eval_fp: u64,
    tables: Box<BuildTables>,
}

impl CalcSession {
    /// 建会话（表按 `Arc` 共享，会话级一次性成本）。
    pub fn new(tables: &BuildTables) -> Self {
        Self {
            context: None,
            last_result: None,
            char_id: 0,
            assembly_fp: 0,
            eval_fp: 0,
            tables: Box::new(tables.clone()),
        }
    }

    /// 求值（复用装配与记忆化状态，与 [`evaluate_build`] 逐位一致）。
    pub fn evaluate(&mut self, request: &BuildRequest) -> BuildResult {
        if request.timeline.is_some() {
            return evaluate_build(&self.tables, request);
        }
        let eval_fp = fingerprint_settings(&request.settings, false, request.panels.as_ref());
        // 全命中：连求值器都不建。
        if self.context.is_some()
            && self.char_id == request.char_id
            && self.eval_fp == eval_fp
            && let Some(last) = self.last_result.as_ref()
        {
            return last.clone();
        }
        let assembly_fp = fingerprint_settings(&request.settings, true, None);
        // 装配命中：复用上下文，只同步显示项并重跑求值。
        if self.context.is_some()
            && self.char_id == request.char_id
            && self.assembly_fp == assembly_fp
            && let Some(context) = self.context.as_mut()
        {
            context.settings.target_function = request.settings.target_function.clone();
            context.settings.custom_variables = request.settings.custom_variables.clone();
            context.custom_variables = request.settings.custom_variables.iter().cloned().collect();
            let result = evaluate_on_context(
                context,
                &request.settings.target_function,
                request.panels.as_ref(),
            );
            self.eval_fp = eval_fp;
            self.last_result = Some(result.clone());
            return result;
        }
        // 冷装配：装配一次，结果与缓存上下文两用。
        let mut context = match BuildContext::new(&self.tables, request.char_id, &request.settings) {
            Some(context) => context,
            None => {
                self.context = None;
                self.char_id = request.char_id;
                self.assembly_fp = assembly_fp;
                self.eval_fp = eval_fp;
                let result = BuildResult {
                    error: Some("角色未在数据表中找到".to_string()),
                    ..Default::default()
                };
                self.last_result = Some(result.clone());
                return result;
            }
        };
        let result = evaluate_on_context(
            &mut context,
            &request.settings.target_function,
            request.panels.as_ref(),
        );
        self.context = Some(unsafe {
            // 安全：`tables` 在本 struct 内地址稳定（建会话后永不移动/替换），
            // 且析构时 `context` 先于 `tables` 释放（字段声明顺序）。
            std::mem::transmute::<BuildContext<'_>, BuildContext<'static>>(context)
        });
        self.char_id = request.char_id;
        self.assembly_fp = assembly_fp;
        self.eval_fp = eval_fp;
        self.last_result = Some(result.clone());
        result
    }
}
