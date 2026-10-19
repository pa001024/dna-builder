//! 自动配装（`CharBuild.autoBuild`，`CharBuild.ts:5109-5532`）。
//!
//! 有界启发式搜索：保留槽压紧 → 追加收益评分 → 条件 MOD 组合 → 武器轮换，
//! 20 轮 / 状态重复终止，只接受真实总目标提升。
//!
//! 候选评估走**增量上下文**：基础构筑只装配一次，每个候选克隆上下文并追加一个
//! MOD（`BuildContext::with_extra_mod`，记录/武器/BUFF 全部共享，来源表增量累加），
//! 不再逐候选重建 `BuildContext`。
//! 同分随机已移除（确定性选择：同收益同属性数取输入序第一个），结果可复现。
//!
//! # 候选筛查职责边界
//!
//! 在内核内的（本文件实现）：
//! - 类型筛查（`isModSlotCompatible` 类型分支：同律槽兼容「同律近战/远程」，
//!   其余精确匹配；`CharBuild.ts:5021-5028`）；
//! - 极性过滤（`filterEquipableMods` 的 `polarity` 参数，`5097-5098`）；
//! - 元素属性（`isModSlotCompatible` 的 `属性` 分支：`mod.属性` 须等于角色属性，`5030`）；
//! - 限定（`isModSlotCompatible` 的 `限定` 分支：角色槽按角色 id/名/属性，
//!   武器槽按类别/伤害类型，`5031-5041`）；
//! - 互斥（`isModEquipable`：`modExclusionGroup` 系列组 + 非契约者名称互斥，
//!   `5073-5075`；组展开 `换生灵↔海妖`、`榛子↔黄衣`、`囚狼(id>1e5)→囚狼1` 自互斥）；
//! - 契约者（同系列允许同名共存，`5075`）；
//! - 数量上限（`counts < availableCount`，`5076`）。
//!
//! 留调用方的（不在内核内）：耐受/极化上限（`getModCost*`，纯展示层约束）、
//! 库存可用数（`getAvailableCount` 回调的业务侧实现；内核只收 `count` 上限，
//! `ModCandidate.count`，`5094-5099` 的调用方侧）、中枢（光环）槽装配、
//! 变体 A/B/C 选择（`modVariantIndex` 由 `settings` 携带，见 `config.rs`）、
//! 技能替换 MOD 的替换表改写（装配期 `replace_weapon_skills` 已处理，
//! 候选侧无需重复筛查）。

use super::config::CharSettings;
use super::context::BuildContext;
use super::evaluate::BuildRequest;
use super::income::{ModSlotKey, income_effect_key};
use super::tables::BuildTables;
use super::timeline::{EnemyState, RawTimelineData};
use std::collections::HashSet;

/// MOD 候选（含库存上限；`LeveledModWithCount.count`，`CharBuild.ts:646-652`）。
#[derive(Debug, Clone)]
pub struct ModCandidate {
    pub id: i64,
    pub level: f64,
    pub buff_level: Option<f64>,
    /// 可用总数（含已装备；缺省不限量，`getAvailableCount ?? ∞`，`5099`）。
    pub count: f64,
}

impl ModCandidate {
    pub fn new(id: i64, level: f64) -> Self {
        Self {
            id,
            level,
            buff_level: None,
            count: f64::INFINITY,
        }
    }
}
impl ModCandidate {
    fn from_json_value(value: &serde_json::Value) -> Self {
        let num = |key: &str, fallback: f64| {
            value
                .get(key)
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(fallback)
        };
        Self {
            id: value
                .get("id")
                .and_then(super::config::json_id)
                .unwrap_or(0),
            level: num("level", 0.0),
            buff_level: value.get("buffLevel").and_then(serde_json::Value::as_f64),
            count: num("count", f64::INFINITY),
        }
    }
}

impl AutobuildWeaponCandidate {
    fn from_json_value(value: &serde_json::Value) -> Self {
        let num = |key: &str, fallback: f64| {
            value
                .get(key)
                .and_then(serde_json::Value::as_f64)
                .unwrap_or(fallback)
        };
        Self {
            id: value
                .get("id")
                .and_then(super::config::json_id)
                .unwrap_or(0),
            level: num("level", 80.0),
            refine: num("refine", 5.0),
            effect_level: value.get("effectLevel").and_then(serde_json::Value::as_f64),
        }
    }
}

impl AutobuildOptions {
    fn from_json_value(value: &serde_json::Value) -> Self {
        let types = |key: &str| {
            value
                .get(key)
                .and_then(serde_json::Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(ModSlotKey::from_json_value)
                        .collect()
                })
                .unwrap_or_default()
        };
        Self {
            include_types: types("includeTypes"),
            preserve_types: types("preserveTypes"),
            fixed_melee: value
                .get("fixedMelee")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false),
            fixed_ranged: value
                .get("fixedRanged")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false),
        }
    }
}

impl AutobuildRequest {
    /// 从请求 JSON 解析 `{base, modCandidates?, meleeCandidates?, rangedCandidates?, options?, seed?}`。
    pub fn from_json(raw: &serde_json::Value) -> Result<Self, super::error::CalcError> {
        let base = raw
            .get("base")
            .map(BuildRequest::from_json)
            .transpose()?
            .ok_or_else(|| super::error::CalcError::ConfigParse("缺少 base".to_string()))?;
        let mod_candidates = raw
            .get("modCandidates")
            .or(raw.get("candidates"))
            .and_then(serde_json::Value::as_array)
            .map(|items| items.iter().map(ModCandidate::from_json_value).collect())
            .unwrap_or_default();
        let weapons = |key: &str| {
            raw.get(key)
                .and_then(serde_json::Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(AutobuildWeaponCandidate::from_json_value)
                        .collect()
                })
                .unwrap_or_default()
        };
        let options = raw
            .get("options")
            .map(AutobuildOptions::from_json_value)
            .unwrap_or_default();
        let seed = raw
            .get("seed")
            .and_then(serde_json::Value::as_u64)
            .or(base.seed);
        Ok(Self {
            base,
            mod_candidates,
            melee_candidates: weapons("meleeCandidates"),
            ranged_candidates: weapons("rangedCandidates"),
            options,
            seed,
        })
    }

    /// 搜索结果 → JSON（`{settings, log, iters, targetValue}`；`settings` 可回填）。
    pub fn result_json(result: &AutobuildResult, target_value: f64) -> serde_json::Value {
        serde_json::json!({
            "settings": result.settings.to_json_value(),
            "log": result.log,
            "iters": result.iters,
            "targetValue": target_value,
        })
    }
}

/// 武器候选（等级/精炼缺省最大值；`CharBuildHelper.ts:126` 与 `income::WeaponCandidate` 同口径）。
#[derive(Debug, Clone)]
pub struct AutobuildWeaponCandidate {
    pub id: i64,
    pub level: f64,
    pub refine: f64,
    pub effect_level: Option<f64>,
}

/// 搜索选项（`CharBuild.ts:5626-5645 BuildOption` 的子集；日志回调不进内核）。
#[derive(Debug, Clone, Default)]
pub struct AutobuildOptions {
    /// 参与搜索的槽位类型（`includeTypes`）。
    pub include_types: Vec<ModSlotKey>,
    /// 保留已装（压紧而非清空；`preserveTypes`，`5122`）。
    pub preserve_types: Vec<ModSlotKey>,
    /// 固定近战/远程武器（`fixedMelee/fixedRanged`，跳过武器轮换）。
    pub fixed_melee: bool,
    pub fixed_ranged: bool,
}

/// 批量单调用形状（spec §4.1；热循环禁逐候选 JSON/FFI 往返，spec §12.2）。
///
/// `seed` 保留字段形状：同分随机已移除（确定性选择），该字段不再影响结果。
#[derive(Debug, Clone)]
pub struct AutobuildRequest {
    pub base: BuildRequest,
    pub mod_candidates: Vec<ModCandidate>,
    pub melee_candidates: Vec<AutobuildWeaponCandidate>,
    pub ranged_candidates: Vec<AutobuildWeaponCandidate>,
    pub options: AutobuildOptions,
    pub seed: Option<u64>,
}

/// 搜索结果（新构筑设置 + 日志行；调用方经 `BuildRequest{settings}` 落盘）。
#[derive(Debug, Clone)]
pub struct AutobuildResult {
    pub settings: CharSettings,
    pub log: Vec<String>,
    pub iters: usize,
}

/// 在已有上下文上求顶层值（无时间轴走单次伤害状态机，与 `calculate_with_settings` 同口径）。
fn context_value(context: &mut BuildContext<'_>, timeline: Option<&RawTimelineData>) -> f64 {
    match timeline {
        Some(timeline) => context.calculate_with_timeline(timeline),
        None => {
            let mut state = EnemyState::fresh(&context.enemy);
            context.calculate_one_time(&mut state)
        }
    }
}

fn fmt_pct(income: f64) -> String {
    let text = format!("{:.2}", income * 100.0);
    let trimmed = text.trim_end_matches('0').trim_end_matches('.');
    if trimmed.is_empty() || trimmed == "-0" {
        "0".to_string()
    } else {
        trimmed.to_string()
    }
}

fn mod_display_name(tables: &BuildTables, id: i64) -> String {
    let name = tables
        .mods
        .get(&id)
        .map(|source| source.data.str_or_empty("名称"))
        .unwrap_or("");
    if name.is_empty() {
        id.to_string()
    } else {
        name.to_string()
    }
}

fn equipped_mod_name(context: &BuildContext<'_>, key: ModSlotKey, index: usize) -> String {
    let instance = match key {
        ModSlotKey::Char => context.char_mods.get(index),
        ModSlotKey::Melee => context.melee_mods.get(index),
        ModSlotKey::Ranged => context.ranged_mods.get(index),
        ModSlotKey::Skill => context.skill_mods.get(index),
    };
    instance.map(|item| item.name.clone()).unwrap_or_default()
}
fn slot_capacity(key: ModSlotKey) -> usize {
    match key {
        ModSlotKey::Skill => 4,
        _ => 8,
    }
}


/// 候选特效等级（`getModBuffLvFromSetting` 口径：显式 > 配置 > 特效 `mx` > 1）。
fn candidate_buff_level(
    tables: &BuildTables,
    settings: &CharSettings,
    candidate: &ModCandidate,
) -> Option<f64> {
    if let Some(level) = candidate.buff_level {
        return Some(level);
    }
    if let Some(level) = settings.mod_effect_level(candidate.id) {
        return Some(level);
    }
    let effect = tables
        .mods
        .get(&candidate.id)
        .and_then(|source| source.effect.as_ref());
    match effect {
        Some(record) => Some(record.num("mx").unwrap_or(1.0)),
        None => Some(1.0),
    }
}

/// 槽位静态兼容（`isModSlotCompatible:5021-5041`，不含已装互斥与数量）。
/// 参数按 TS `isModSlotCompatible` 调用形逐项展开（13 项对齐 `5021-5041` 判定所需上下文，
/// 打包成 struct 反而与上游签名失配）；`too_many_arguments` 系对签需要，允许保留。
#[allow(clippy::too_many_arguments)]
fn slot_compatible(
    tables: &BuildTables,
    char_element: &str,
    char_id: i64,
    char_name: &str,
    melee_category: &str,
    melee_damage_type: &str,
    ranged_category: &str,
    ranged_damage_type: &str,
    skill_category: &str,
    skill_damage_type: &str,
    has_skill_weapon: bool,
    candidate: &ModCandidate,
    key: ModSlotKey,
) -> bool {
    let Some(source) = tables.mods.get(&candidate.id) else {
        return false;
    };
    let record = &source.data;
    // 光环（羽蛇）系列不占普通槽（`5023`；中枢槽由调用方装配）。
    if record.text_eq("系列", "羽蛇") {
        return false;
    }
    let kind = record.str_or_empty("类型");
    match key {
        ModSlotKey::Skill => {
            if !kind.starts_with("同律") {
                return false;
            }
        }
        ModSlotKey::Char => {
            if kind != "角色" {
                return false;
            }
        }
        ModSlotKey::Melee => {
            if kind != "近战" {
                return false;
            }
        }
        ModSlotKey::Ranged => {
            if kind != "远程" {
                return false;
            }
        }
    }
    // 元素属性：仅限同属性角色（`5030`）。
    let element = record.str_or_empty("属性");
    if !element.is_empty() && element != char_element {
        return false;
    }
    // 限定（`5031-5041`）。
    let Some(limit) = record.value("限定") else {
        return true;
    };
    if limit.is_null() {
        return true;
    }
    match key {
        ModSlotKey::Char => {
            if let Some(id) = limit.as_i64().or_else(|| {
                limit.as_f64().and_then(|number| {
                    (number.is_finite() && number.fract() == 0.0).then_some(number as i64)
                })
            }) {
                id == char_id
            } else if let Some(text) = limit.as_str() {
                text == char_name || text == char_element
            } else {
                true
            }
        }
        ModSlotKey::Melee => limit
            .as_str()
            .is_some_and(|text| text == melee_category || text == melee_damage_type),
        ModSlotKey::Ranged => limit
            .as_str()
            .is_some_and(|text| text == ranged_category || text == ranged_damage_type),
        ModSlotKey::Skill => {
            has_skill_weapon
                && limit
                    .as_str()
                    .is_some_and(|text| text == skill_category || text == skill_damage_type)
        }
    }
}

/// 互斥组展开（`LeveledMod.exclusionGroupOf:210-216` + `normalizeExclusiveSeries:198-201`）。
fn exclusion_group(series: &str, id: i64) -> Vec<String> {
    let key = if series == "囚狼" && id > 100_000 {
        "囚狼1".to_string()
    } else {
        series.to_string()
    };
    if key == "换生灵" || key == "海妖" {
        return vec!["换生灵".to_string(), "海妖".to_string()];
    }
    if key == "榛子" || key == "黄衣" {
        return vec!["榛子".to_string(), "黄衣".to_string()];
    }
    vec![key]
}

/// 占用快照（`collectModOccupancy:4999-5013`；只统计**同时生效**的单槽位组）。
#[derive(Debug, Default)]
struct Occupancy {
    series: HashSet<String>,
    names: HashSet<String>,
    counts: std::collections::HashMap<i64, f64>,
}

fn collect_occupancy(slots: &[Option<(i64, f64)>], tables: &BuildTables) -> Occupancy {
    // 互斥系列名录（`exclusiveSeries:4985`）。
    const EXCLUSIVE: &[&str] = &[
        "百首",
        "狮鹫",
        "中庭蛇",
        "囚狼1",
        "换生灵",
        "海妖",
        "审判者",
        "巨鲸",
        "金乌",
        "焰灵",
        "黄衣",
        "夜使",
    ];
    let mut occupancy = Occupancy::default();
    for slot in slots.iter().flatten() {
        let Some(record) = tables.mods.get(&slot.0).map(|source| &source.data) else {
            continue;
        };
        let series = record.str_or_empty("系列");
        let name = record.str_or_empty("名称");
        let normalized = if series == "囚狼" && slot.0 > 100_000 {
            "囚狼1".to_string()
        } else {
            series.to_string()
        };
        if EXCLUSIVE.contains(&series) || normalized != series {
            for group in exclusion_group(series, slot.0) {
                occupancy.series.insert(group);
            }
        }
        if series != "契约者" {
            occupancy.names.insert(name.to_string());
        }
        *occupancy.counts.entry(slot.0).or_insert(0.0) += 1.0;
    }
    occupancy
}

/// 单槽可装备判定（`isModEquipable:5066-5077`）。
fn is_equipable(
    _tables: &BuildTables,
    record_series: &str,
    record_name: &str,
    candidate: &ModCandidate,
    occupancy: &Occupancy,
) -> bool {
    for group in exclusion_group(record_series, candidate.id) {
        if occupancy.series.contains(&group) {
            return false;
        }
    }
    if record_series != "契约者" && occupancy.names.contains(record_name) {
        return false;
    }
    occupancy.counts.get(&candidate.id).copied().unwrap_or(0.0) < candidate.count
}

/// 槽位读写。
fn slots_of(settings: &CharSettings, key: ModSlotKey) -> &[Option<(i64, f64)>] {
    match key {
        ModSlotKey::Char => &settings.char_mods,
        ModSlotKey::Melee => &settings.melee_mods,
        ModSlotKey::Ranged => &settings.ranged_mods,
        ModSlotKey::Skill => &settings.skill_mods,
    }
}

fn slots_of_mut(settings: &mut CharSettings, key: ModSlotKey) -> &mut Vec<Option<(i64, f64)>> {
    match key {
        ModSlotKey::Char => &mut settings.char_mods,
        ModSlotKey::Melee => &mut settings.melee_mods,
        ModSlotKey::Ranged => &mut settings.ranged_mods,
        ModSlotKey::Skill => &mut settings.skill_mods,
    }
}

/// 槽位在 `init_counts` 数组中的下标。
fn key_index(key: ModSlotKey) -> usize {
    match key {
        ModSlotKey::Char => 0,
        ModSlotKey::Melee => 1,
        ModSlotKey::Ranged => 2,
        ModSlotKey::Skill => 3,
    }
}

/// 构筑状态签名（`getBuildSignature:5499-5515`；排序后拼 id，防循环）。
fn build_signature(settings: &CharSettings) -> String {
    fn ids(slots: &[Option<(i64, f64)>]) -> String {
        let mut list: Vec<i64> = slots.iter().flatten().map(|slot| slot.0).collect();
        list.sort_unstable();
        list.iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",")
    }
    format!(
        "{}|{}|{}|{}|{}|{}|{}",
        settings.melee_weapon,
        settings.ranged_weapon,
        settings.aura_mod,
        ids(&settings.char_mods),
        ids(&settings.melee_mods),
        ids(&settings.ranged_mods),
        ids(&settings.skill_mods),
    )
}

/// 自动配装主循环（`autoBuild:5109-5532`；`MAX_ITER = 20`，`5517`）。
///
/// 保留槽压紧（`5121-5128`）→ 条件预热（`prioritizeConditionMods:5321-5381` 的
/// 保持总目标口径的简化版：逐个试装条件候选，只保留真实总目标提升）→
/// 武器轮换（`findMaxMelee/findMaxRanged:5383-5401`，类别过滤 + 只接受提升）→
/// 逐槽追加（`next:5442-5490`：收益 `<= 0` 停、满槽停、替换只接受 `newTotal > oldTotal`）。
/// 同分随机经 `Rng`（`findMaxMod:5217-5225`；种子来自 `request.seed`，缺省固定值）。
pub fn autobuild(tables: &BuildTables, request: &AutobuildRequest) -> AutobuildResult {
    let timeline: Option<&RawTimelineData> = request.base.timeline.as_ref();
    let char_id = request.base.char_id;
    // 起始构筑总值（清空 include 槽位之前）：搜索走偏时保底回退，杜绝越搜越差。
    let start_total = BuildContext::new(tables, char_id, &request.base.settings)
        .map(|mut start| context_value(&mut start, timeline))
        .unwrap_or(f64::NEG_INFINITY);
    let mut settings = request.base.settings.clone();
    let mut log: Vec<String> = vec!["开始自动构筑".to_string()];

    // 保留槽压紧（`5121-5128`）：preserve → 过滤空槽；否则清空。
    for key in request.options.include_types.iter().copied() {
        let slots = slots_of_mut(&mut settings, key);
        if request.options.preserve_types.contains(&key) {
            slots.retain(|slot| slot.is_some());
        } else {
            slots.clear();
        }
    }
    let Some(mut context) = BuildContext::new(tables, char_id, &settings) else {
        return AutobuildResult {
            settings,
            log,
            iters: 0,
        };
    };
    // 初始总目标（空槽起点）。
    let mut best_total = context_value(&mut context, timeline);

    // 条件预热不在此做：上游 `prioritizeConditionMods:5321-5381` 是缺口驱动、
    // 每轮 `next()` 开头调用（见 `next_round`）；开头的简化试装会把槽位塞满条件 MOD。

    // preserve 槽数（`initBuild[key].length`，`sortByIcome` 只排其后部分）。
    let init_counts = [
        settings.char_mods.iter().flatten().count(),
        settings.melee_mods.iter().flatten().count(),
        settings.ranged_mods.iter().flatten().count(),
        settings.skill_mods.iter().flatten().count(),
    ];
    let mut visited: HashSet<String> = HashSet::new();
    let mut iters = 0usize;
    for index in 1..=20usize {
        iters = index;
        let signature = build_signature(&context.settings);
        if !visited.insert(signature) {
            log.push("检测到构筑状态循环，结束自动构筑".to_string());
            break;
        }
        if !next_round(
            tables,
            timeline,
            request,
            &mut context,
            &mut best_total,
            &mut log,
            index,
            &init_counts,
        ) {
            break;
        }
    }
    if best_total < start_total {
        log.push("搜索结果不如起始构筑，已回退".to_string());
        return AutobuildResult {
            settings: request.base.settings.clone(),
            log,
            iters,
        };
    }
    AutobuildResult {
        settings: context.settings,
        log,
        iters,
    }
}

/// 单轮：武器轮换 + 逐槽追加/替换（`next:5402-5493`）。
#[allow(clippy::too_many_arguments)]
fn next_round<'a>(
    tables: &'a BuildTables,
    timeline: Option<&RawTimelineData>,
    request: &AutobuildRequest,
    context: &mut BuildContext<'a>,
    best_total: &mut f64,
    log: &mut Vec<String>,
    iter: usize,
    init_counts: &[usize; 4],
) -> bool {
    let mut changed = false;
    // 武器轮换（`5405-5438`；只在同类别内比，`5386-5388/5397-5399`）。
    if !request.options.fixed_melee && !request.melee_candidates.is_empty() {
        let current_category = weapon_category(tables, context.settings.melee_weapon);
        let mut best_value = *best_total;
        let mut best: Option<BuildContext<'_>> = None;
        for candidate in request.melee_candidates.iter() {
            let category = weapon_category(tables, candidate.id);
            if !current_category.is_empty() && category != current_category {
                continue;
            }
            let mut probe_settings = context.settings.clone();
            probe_settings.melee_weapon = candidate.id;
            probe_settings.melee_weapon_level = candidate.level;
            probe_settings.melee_weapon_refine = candidate.refine;
            let Some(mut probe) = BuildContext::new(tables, request.base.char_id, &probe_settings)
            else {
                continue;
            };
            crate::prof!("autobuild::weapon_probe");
            let value = context_value(&mut probe, timeline);
            if value > best_value {
                best_value = value;
                best = Some(probe);
            }
        }
        if let Some(probe) = best {
            let old_name = context.melee_weapon.name.clone();
            let new_name = probe.melee_weapon.name.clone();
            let base = *best_total;
            let old_income = if base.abs() < f64::EPSILON {
                0.0
            } else {
                context_value(context, timeline) / base - 1.0
            };
            let new_income = if base.abs() < f64::EPSILON {
                0.0
            } else {
                best_value / base - 1.0
            };
            *context = probe;
            *best_total = best_value;
            changed = true;
            log.push(format!(
                "第{iter}次迭代: 用近战 {new_name} 替换 {old_name} 收益: {}% -> {}%",
                fmt_pct(old_income),
                fmt_pct(new_income)
            ));
        }
    }
    if !request.options.fixed_ranged && !request.ranged_candidates.is_empty() {
        let current_category = weapon_category(tables, context.settings.ranged_weapon);
        let mut best_value = *best_total;
        let mut best: Option<BuildContext<'_>> = None;
        for candidate in request.ranged_candidates.iter() {
            let category = weapon_category(tables, candidate.id);
            if !current_category.is_empty() && category != current_category {
                continue;
            }
            let mut probe_settings = context.settings.clone();
            probe_settings.ranged_weapon = candidate.id;
            probe_settings.ranged_weapon_level = candidate.level;
            probe_settings.ranged_weapon_refine = candidate.refine;
            let Some(mut probe) = BuildContext::new(tables, request.base.char_id, &probe_settings)
            else {
                continue;
            };
            crate::prof!("autobuild::weapon_probe");
            let value = context_value(&mut probe, timeline);
            if value > best_value {
                best_value = value;
                best = Some(probe);
            }
        }
        if let Some(probe) = best {
            let old_name = context.ranged_weapon.name.clone();
            let new_name = probe.ranged_weapon.name.clone();
            let base = *best_total;
            let old_income = if base.abs() < f64::EPSILON {
                0.0
            } else {
                context_value(context, timeline) / base - 1.0
            };
            let new_income = if base.abs() < f64::EPSILON {
                0.0
            } else {
                best_value / base - 1.0
            };
            *context = probe;
            *best_total = best_value;
            changed = true;
            log.push(format!(
                "第{iter}次迭代: 用远程 {new_name} 替换 {old_name} 收益: {}% -> {}%",
                fmt_pct(old_income),
                fmt_pct(new_income)
            ));
        }
    }

    // 上下文快照（角色名/元素，供筛查用）。
    let char = tables.chars.get(&request.base.char_id);
    let char_name = char.map(|record| record.text("名称")).unwrap_or_default();
    let char_element = char.map(|record| record.text("属性")).unwrap_or_default();
    let env = ScanEnv {
        tables,
        timeline,
        candidates: &request.mod_candidates,
        char_name: &char_name,
        char_element: &char_element,
    };

    // 条件预热（`prioritizeConditionMods:5321-5381`）：武器轮换后、追加前。
    if prioritize_condition_mods(&env, context, request, log, iter) {
        changed = true;
        *best_total = context_value(context, timeline);
    }
    for key in request.options.include_types.iter().copied() {
        let mut pick = find_max_candidate(&env, context, key, *best_total);
        if pick.is_none() || init_counts[key_index(key)] >= slot_capacity(key) {
            continue;
        }
        if matches!(pick, Some((_, income)) if income == 0.0 || income.is_nan()) {
            log.push(format!("第{iter}次迭代: 当前选项MOD无收益, 直接退出"));
            continue;
        }
        let mut exhausted = false;
        loop {
            if slots_of(&context.settings, key).len() >= slot_capacity(key) {
                break;
            }
            let Some((candidate, income)) = pick.take() else {
                exhausted = true;
                break;
            };
            if income <= 0.0 {
                pick = Some((candidate, income));
                break;
            }
            let buff_level = candidate_buff_level(tables, &context.settings, &candidate);
            if !context.push_mod_candidate(key, candidate.id, candidate.level, buff_level) {
                pick = Some((candidate, income));
                break;
            }
            *best_total = context_value(context, timeline);
            changed = true;
            log.push(format!(
                "第{iter}次迭代: 添加{}({}/{})>>> {}(+{}%)",
                slot_name(key),
                slots_of(&context.settings, key).len(),
                slot_capacity(key),
                mod_display_name(tables, candidate.id),
                fmt_pct(income)
            ));
            pick = find_max_candidate(&env, context, key, *best_total);
        }
        if exhausted {
            continue;
        }
        // 最优一换：轮询每个非 preserve 槽位 × 可装备候选，取总目标最高的一换执行。
        // 旧逻辑只试边际最低的末位，条件联动下经常换错件/换不上，导致早停在局部最优。
        let init_len = init_counts[key_index(key)];
        let slot_len = slots_of(&context.settings, key).len();
        // 展平探查：每槽一次外层移除探查，内层候选打分共用移除态（旧代码每候选
        // 一次内外双层存取）；打分值即替换后总目标（同逻辑构筑），全量重建只物化
        // 全局唯一胜者。求值路径与旧代码一致，严格 `>` 口径与首个最优保留不变。
        let mut best_swap: Option<(usize, ModCandidate, f64)> = None;
        for index in init_len..slot_len {
            if slots_of(&context.settings, key).get(index).is_none_or(|slot| slot.is_none()) {
                continue;
            }
            // 移除该槽位后：可装备候选（移除后互斥/数量占用变化，需重筛）与各候选
            // 替换总目标，一次外层探查内算完。
            let slot_scored = context.with_mod_remove_probe(key, index, |probe| {
                crate::prof!("autobuild::replace_remove");
                let screened = equipable_candidates(&env, probe, key);
                let mut scored: Vec<(ModCandidate, f64)> = Vec::new();
                for candidate in screened {
                    let buff_level = candidate_buff_level(tables, &probe.settings, &candidate);
                    let Some(added) = probe.with_mod_probe(
                        key,
                        candidate.id,
                        candidate.level,
                        buff_level,
                        |inner| {
                            crate::prof!("autobuild::replace_score");
                            context_value(inner, timeline)
                        },
                    ) else {
                        continue;
                    };
                    scored.push((candidate, added));
                }
                scored
            });
            let Some(scored) = slot_scored else {
                continue;
            };
            // 槽内最优（严格大于才替换，首个最优保留，与旧 Top-N 内口径一致）。
            let mut slot_best: Option<(ModCandidate, f64)> = None;
            for (candidate, added) in scored {
                let better = slot_best.as_ref().is_none_or(|(_, best)| added > *best);
                if better {
                    slot_best = Some((candidate, added));
                }
            }
            if let Some((candidate, added)) = slot_best {
                let better =
                    best_swap.as_ref().is_none_or(|(_, _, best_value)| added > *best_value);
                if better {
                    best_swap = Some((index, candidate, added));
                }
            }
        }
        if let Some((index, candidate, value)) = best_swap {
            let removable_name = equipped_mod_name(context, key, index);
            let candidate_name = mod_display_name(tables, candidate.id);
            log.push(format!(
                "第{iter}次迭代: {}>>> {} vs {}({}%)",
                slot_name(key),
                removable_name,
                candidate_name,
                fmt_pct(if *best_total == 0.0 { 0.0 } else { value / *best_total - 1.0 })
            ));
            if value > *best_total {
                // 物化唯一胜者（与旧 Top-N 重建同路径：改槽位 + 全量重建 + 取重建值）。
                let mut probe_settings = context.settings.clone();
                let placed = slots_of_mut(&mut probe_settings, key)
                    .get_mut(index)
                    .is_some_and(|slot| {
                        *slot = Some((candidate.id, candidate.level));
                        true
                    });
                if placed {
                    if let Some(level) = candidate_buff_level(tables, &probe_settings, &candidate) {
                        let effect_key = format!("m:{}", income_effect_key(candidate.id));
                        if let Some(entry) = probe_settings.effect_config.iter_mut().find(|(name, _)| *name == effect_key) {
                            entry.1 = level;
                        } else {
                            probe_settings.effect_config.push((effect_key, level));
                        }
                    }
                    if let Some(mut probe) =
                        BuildContext::new(tables, request.base.char_id, &probe_settings)
                    {
                        crate::prof!("autobuild::replace_rebuild");
                        let rebuilt = context_value(&mut probe, timeline);
                        *context = probe;
                        *best_total = rebuilt;
                        changed = true;
                        log.push(format!(
                            "第{iter}次迭代: {}>>> {} 替换 {}",
                            slot_name(key),
                            candidate_name,
                            removable_name
                        ));
                    }
                }
            }
        }
    }
    if !changed {
        log.push("无可替换MOD 结束自动构筑".to_string());
    }
    changed
}

/// 候选筛查/收益探查共用的一组只读输入（同一轮装配内不变）。
#[derive(Clone, Copy)]
struct ScanEnv<'a> {
    tables: &'a BuildTables,
    timeline: Option<&'a RawTimelineData>,
    candidates: &'a [ModCandidate],
    char_name: &'a str,
    char_element: &'a str,
}

/// 可装备候选（`getModCandidates` 的筛查部分：类型/极性/元素/限定/互斥/数量；不含收益）。
///
/// `find_max_candidate` 与条件预热共用。
fn equipable_candidates(
    env: &ScanEnv<'_>,
    context: &BuildContext<'_>,
    key: ModSlotKey,
) -> Vec<ModCandidate> {
    let ScanEnv {
        tables,
        candidates,
        char_name,
        char_element,
        ..
    } = *env;
    let settings = &context.settings;
    let melee_category = weapon_category(tables, settings.melee_weapon);
    let melee_damage = weapon_damage_type(tables, settings.melee_weapon);
    let ranged_category = weapon_category(tables, settings.ranged_weapon);
    let ranged_damage = weapon_damage_type(tables, settings.ranged_weapon);
    let occupancy = collect_occupancy(slots_of(settings, key), tables);
    let char_id = context.char.id;
    let mut out = Vec::new();
    for candidate in candidates.iter() {
        let Some(record) = tables.mods.get(&candidate.id).map(|source| &source.data) else {
            continue;
        };
        if !slot_compatible(
            tables,
            char_element,
            char_id,
            char_name,
            &melee_category,
            &melee_damage,
            &ranged_category,
            &ranged_damage,
            "",
            "",
            false,
            candidate,
            key,
        ) {
            continue;
        }
        let series = record.str_or_empty("系列");
        let name = record.str_or_empty("名称");
        if !is_equipable(tables, series, name, candidate, &occupancy) {
            continue;
        }
        out.push(candidate.clone());
    }
    out
}

/// 条件缺口（`getConditionDeficits:5277-5319`）：极性缺口 `attr` 为极性字母，属性缺口为属性名。
struct ConditionDeficit {
    attr: String,
    missing: f64,
}

/// 候选 MOD 在当前构筑下试装后条件是否生效（`checkModEffective:4025-4034`）。
///
/// 候选恒视为不在场：探查上下文追加后判定（与上游 `clone().applyMods()` 同口径）。
fn candidate_effective(
    tables: &BuildTables,
    context: &mut BuildContext<'_>,
    key: ModSlotKey,
    candidate: &ModCandidate,
) -> Option<bool> {
    crate::prof!("autobuild::condition_probe");
    let buff_level = candidate_buff_level(tables, &context.settings, candidate);
    let probed = context.with_mod_probe(key, candidate.id, candidate.level, buff_level, |probe| {
        let added = match key {
            ModSlotKey::Char => probe.char_mods.last(),
            ModSlotKey::Melee => probe.melee_mods.last(),
            ModSlotKey::Ranged => probe.ranged_mods.last(),
            ModSlotKey::Skill => probe.skill_mods.last(),
        }?;
        if !added.has_condition {
            return Some(true);
        }
        let conditions = added.condition_conditions.clone();
        let attrs = probe.attrs();
        let values = probe.condition_values();
        let tables = probe.condition_tables(&values);
        Some(BuildContext::check_mod_condition(&conditions, &attrs, &tables))
    });
    probed?
}

/// 条件缺口（`getConditionDeficits:5277-5319`）。
///
/// `attrs` 为当前构筑属性（不含候选）；`leveled` 为候选满级实例（自身值来源）。
/// `*id` 条件无缺口概念（上游 `attrs["*id"]` 非数字直接跳过）。
fn condition_deficits(
    context: &BuildContext<'_>,
    attrs: &super::models::AttrMap,
    leveled: &super::models::LeveledMod,
) -> Vec<ConditionDeficit> {
    let mut deficits = Vec::new();
    // `charModsWithAura`：角色槽 + 中枢（autobuild 无 tempMod）。
    let condition_mods: Vec<&super::models::LeveledMod> =
        context.char_mods.iter().chain(context.aura_mod.iter()).collect();
    for (attr, op, value) in &leveled.condition_conditions {
        // 趋向条件：`/^[DOVA]趋向$/` + `>=`/`>`/`=`。
        let is_polarity = matches!(attr.as_str(), "D趋向" | "O趋向" | "V趋向" | "A趋向")
            && matches!(op.as_str(), ">=" | ">" | "=");
        if is_polarity {
            let polarity = &attr[..1];
            let required = if op == ">" {
                value.floor() + 1.0
            } else {
                value.ceil()
            };
            let mut current =
                condition_mods.iter().filter(|item| item.polarity.as_deref() == Some(polarity)).count() as f64;
            let has_same_id = condition_mods.iter().any(|item| item.id == leveled.id);
            if leveled.polarity.as_deref() == Some(polarity) && !has_same_id {
                current += 1.0;
            }
            if required - current > 0.0 {
                deficits.push(ConditionDeficit { attr: polarity.to_string(), missing: required - current });
            }
            continue;
        }
        let Some(current_value) = attrs.get(attr).copied() else {
            continue;
        };
        let self_value = leveled.props.get(attr).copied().unwrap_or(0.0);
        let required = if op == ">" { value + f64::EPSILON } else { *value };
        if required - (current_value + self_value) > 0.0 {
            deficits.push(ConditionDeficit { attr: attr.clone(), missing: required - (current_value + self_value) });
        }
    }
    deficits
}

/// 槽位中文名（`ModTypeMap`，日志用）。
fn slot_name(key: ModSlotKey) -> &'static str {
    match key {
        ModSlotKey::Char => "角色",
        ModSlotKey::Melee => "近战",
        ModSlotKey::Ranged => "远程",
        ModSlotKey::Skill => "同律",
    }
}

/// 条件预热（`prioritizeConditionMods:5321-5381`）：缺口驱动，用普通 MOD 补齐条件。
///
/// 每轮 `next()` 开头调用（武器轮换后、追加前）。返回是否发生变化。
#[allow(clippy::too_many_arguments)]
fn prioritize_condition_mods(
    env: &ScanEnv<'_>,
    context: &mut BuildContext<'_>,
    request: &AutobuildRequest,
    log: &mut Vec<String>,
    iter: usize,
) -> bool {
    let ScanEnv { tables, .. } = *env;
    let mut changed = false;
    loop {
        // 同迭代内 context 不变：筛查一次，收集与打分两阶段共享。
        let mut screened: Vec<(ModSlotKey, ModCandidate)> = Vec::new();
        for key in request.options.include_types.iter().copied() {
            screened.extend(
                equipable_candidates(env, context, key)
                    .into_iter()
                    .map(|candidate| (key, candidate)),
            );
        }
        // 同迭代内 context 不变：生效判定缓存复用（收集与打分两阶段共享）。
        let mut effective_cache: std::collections::HashMap<(usize, i64), bool> =
            std::collections::HashMap::new();
        // 未生效的条件候选。
        let mut conditional: Vec<(ModSlotKey, ModCandidate)> = Vec::new();
        for (key, candidate) in &screened {
            let Some(source) = tables.mods.get(&candidate.id) else {
                continue;
            };
            if source.data.obj("生效").value("条件").is_none() {
                continue;
            }
            let cache_key = (key_index(*key), candidate.id);
            let effective = match effective_cache.get(&cache_key) {
                Some(hit) => *hit,
                None => {
                    let Some(result) = candidate_effective(tables, context, *key, candidate) else {
                        continue;
                    };
                    effective_cache.insert(cache_key, result);
                    result
                }
            };
            if effective {
                continue;
            }
            conditional.push((*key, candidate.clone()));
        }
        if conditional.is_empty() {
            break;
        }
        // 缺口表。
        let attrs = context.attrs();
        let mut need: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
        let mut has_need = false;
        for (_, candidate) in &conditional {
            let buff_level = candidate_buff_level(tables, &context.settings, candidate);
            let Some(source) = tables.mods.get(&candidate.id) else {
                continue;
            };
            let leveled = tables.templates.mod_cached(candidate.id, Some(candidate.level), buff_level, || {
                super::models::LeveledMod::from_source(source, Some(candidate.level), buff_level)
            });
            for deficit in condition_deficits(context, &attrs, &leveled) {
                *need.entry(deficit.attr).or_insert(0.0) += deficit.missing;
                has_need = true;
            }
        }
        if !has_need {
            break;
        }
        // 最高补缺口分。
        let mut best: Option<(ModSlotKey, ModCandidate, f64, String)> = None;
        for (key, candidate) in &screened {
            let buff_level = candidate_buff_level(tables, &context.settings, candidate);
            let Some(source) = tables.mods.get(&candidate.id) else {
                continue;
            };
            let leveled = tables.templates.mod_cached(candidate.id, Some(candidate.level), buff_level, || {
                super::models::LeveledMod::from_source(source, Some(candidate.level), buff_level)
            });
            if leveled.has_condition {
                let hit = effective_cache
                    .get(&(key_index(*key), candidate.id))
                    .copied()
                    .or_else(|| candidate_effective(tables, context, *key, candidate));
                if hit != Some(true) {
                    continue;
                }
            }
            let mut score = 0.0;
            for (attr, missing) in &need {
                if leveled.polarity.as_deref() == Some(attr.as_str()) {
                    score += missing;
                    continue;
                }
                if let Some(value) = leveled.props.get(attr).copied() {
                    score += value.min(*missing);
                }
            }
            if score == 0.0 && leveled.has_condition {
                score = condition_deficits(context, &attrs, &leveled).iter().map(|deficit| deficit.missing).sum();
            }
            if score <= 0.0 {
                continue;
            }
            let name = source.data.str_or_empty("名称").to_string();
            if best.as_ref().is_none_or(|(_, _, best_score, _)| score > *best_score) {
                best = Some((*key, candidate.clone(), score, name));
            }
        }
        let Some((key, candidate, _, name)) = best else {
            break;
        };
        // 体积上限：预热件不得超过半槽（8槽最多4件、4槽最多2件），给收益追加留空间；
        // 缺口再大也只能靠后续轮次的收益追加+替换解决，不能一把梭。
        let cap = slot_capacity(key) / 2;
        if slots_of(&context.settings, key).len() >= cap {
            break;
        }
        if slots_of(&context.settings, key).len() >= slot_capacity(key) {
            break;
        }
        let buff_level = candidate_buff_level(tables, &context.settings, &candidate);
        if !context.push_mod_candidate(key, candidate.id, candidate.level, buff_level) {
            break;
        }
        changed = true;
        log.push(format!("第{iter}次迭代: 条件优先添加{}>>> {name}", slot_name(key)));
    }
    changed
}

/// 最高收益可用候选（`getModCandidates:5189-5197` + `findMaxMod:5217-5225`）。
fn find_max_candidate(
    env: &ScanEnv<'_>,
    context: &mut BuildContext<'_>,
    key: ModSlotKey,
    base: f64,
) -> Option<(ModCandidate, f64)> {
    let ScanEnv {
        tables,
        timeline,
        ..
    } = *env;
    let mut scored: Vec<(ModCandidate, f64, usize)> = Vec::new();
    // 先筛查收集（`equipable_candidates` 借 context），再逐个原地探查。
    let screened = equipable_candidates(env, context, key);
    for candidate in screened {
        let buff_level = candidate_buff_level(tables, &context.settings, &candidate);
        crate::prof!("autobuild::candidate_probe");
        let Some(value) = context.with_mod_probe(key, candidate.id, candidate.level, buff_level, |probe| {
            context_value(probe, timeline)
        }) else {
            continue;
        };
        let income = if base.abs() < f64::EPSILON {
            0.0
        } else {
            value / base - 1.0
        };
        let bonus = tables
            .mods
            .get(&candidate.id)
            .map(|source| source.data.obj("加成"));
        let Some(bonus) = bonus else { continue };
        let prop_count = bonus
            .keys_ref()
            .filter(|prop| bonus.num(prop).is_some_and(|value| value != 0.0))
            .count();
        scored.push((candidate.clone(), income, prop_count));
    }
    if scored.is_empty() {
        return None;
    }
    let max_income = scored
        .iter()
        .map(|(_, income, _)| *income)
        .fold(f64::NEG_INFINITY, f64::max);
    let top: Vec<&(ModCandidate, f64, usize)> = scored
        .iter()
        .filter(|(_, income, _)| *income == max_income)
        .collect();
    let max_props = top.iter().map(|(_, _, count)| *count).max().unwrap_or(0);
    let top_props: Vec<&(ModCandidate, f64, usize)> = top
        .into_iter()
        .filter(|(_, _, count)| *count == max_props)
        .collect();
    // 稳定选择（不再掷随机数）：同收益同属性数取输入顺序第一个，结果可复现。
    let pick = top_props[0];
    Some((pick.0.clone(), pick.1))
}

fn weapon_category(tables: &BuildTables, id: i64) -> String {
    tables
        .weapons
        .get(&id)
        .map(|source| {
            source
                .data
                .texts("类型")
                .get(1)
                .cloned()
                .unwrap_or_default()
        })
        .unwrap_or_default()
}

fn weapon_damage_type(tables: &BuildTables, id: i64) -> String {
    tables
        .weapons
        .get(&id)
        .map(|source| source.data.text("伤害类型"))
        .unwrap_or_default()
}
