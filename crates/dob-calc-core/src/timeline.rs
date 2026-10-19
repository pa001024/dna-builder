//! 时间轴执行（`CharBuild.calculate`/`calculateOneTime`，`CharBuild.ts:4069-4200`）+ 输入形状。
//!
//! 输入形状对齐 TS `RawTimelineData`（`packages/data/timeline-data.ts`）；
//! 执行语义逐条对齐 `CharBuild.calculate` / `calculateOneTime` / `applyBuffs` /
//! `hydrateCharBuildTimeline`（`CharBuildHelper.ts:207-216`）。
//!
//! 移植约束：`BuildContext` 虽已派生 `Clone`（供自动配装增量探查），但时间轴事件语义是
//! 「从 base 配置出发、每事件独立叠加 BUFF 后求值」，增量 `apply_buffs` 需回滚语义且缺
//! 回归抓手（`parity_timeline` 不跑求值），故仍按“改写后 `CharSettings` 克隆体重建
//! `BuildContext`”求值（`clone().applyBuffs` 的等价实现）；敌人当前血量状态
//! （`currentHP/currentShield`）由 [`EnemyState`] 在本文件内显式携带，不进 `BuildContext`。

use std::collections::HashSet;

use serde::Deserialize;

use crate::context::{BuildContext, WeaponRef};
use crate::evaluate::BuildRequest;
use crate::models::LeveledBuff;
use crate::tables::BuildTables;

/// 时间轴单个条目；字段名照抄 TS 短键（`i/n/t/d/l`，见 `timeline-data.ts`）。
#[derive(Debug, Clone, Default, Deserialize)]
pub struct TimelineItem {
    /// 轨道号（对应 `CharBuildTimelineItem.track`）。
    pub i: f64,
    /// 条目名：技能事件为技能/武器名，BUFF 事件为 BUFF 名。
    pub n: String,
    /// 开始时间（秒）。
    pub t: f64,
    /// 持续时间（秒）。
    #[serde(default)]
    pub d: f64,
    /// BUFF 等级（有值即 BUFF 事件，无值即技能事件，对应 `CharBuildTimelineItem.lv?`）。
    pub l: Option<f64>,
}

/// 时间轴输入；对应 TS `RawTimelineData`（`timeline-data.ts`）。
#[derive(Debug, Clone, Default, Deserialize)]
pub struct RawTimelineData {
    pub name: String,
    #[serde(default)]
    pub tracks: Vec<String>,
    #[serde(default)]
    pub items: Vec<TimelineItem>,
    /// 血量曲线 `[时间, 血量值][]`。
    pub hp: Option<Vec<(f64, f64)>>,
}

/// 敌人当前血量状态（`LeveledMonster.currentHP/currentShield` 的显式携带版）。
#[derive(Debug, Clone, Copy)]
pub struct EnemyState {
    pub hp: f64,
    pub shield: f64,
}

impl EnemyState {
    /// 满血（`LeveledMonster.resetHP:335-338`：`currentHP = hp; currentShield = es || 0`）。
    pub fn fresh(enemy: &super::models::LeveledMonster) -> Self {
        Self {
            hp: enemy.hp,
            shield: enemy.shield.unwrap_or(0.0),
        }
    }
}

/// 按当前配置构造 BUFF 实例（`CharBuildHelper.ts: createBuffFromSettings:192-198`）。
///
/// `自定义BUFF` 从配置的 `custom_buff` 现拼；其余按名查表，查不到返回 `None`
/// （时间轴水合时调用方转错误，见 `hydrate_timeline_buffs`）。
fn buff_from_settings(
    context: &BuildContext<'_>,
    name: &str,
    level: f64,
    coverage: f64,
) -> Option<LeveledBuff> {
    if name == "自定义BUFF" {
        let mut attr = serde_json::Map::new();
        for (property, value) in &context.settings.custom_buff {
            attr.insert(property.clone(), serde_json::json!(*value));
        }
        let mut map = serde_json::Map::new();
        map.insert("名称".to_string(), serde_json::json!("自定义BUFF"));
        map.insert("描述".to_string(), serde_json::json!("自行填写"));
        map.insert("attr".to_string(), serde_json::Value::Object(attr));
        let mut buff = LeveledBuff::new(super::record::Record::from_map(map), Some(level));
        if coverage != 1.0 {
            buff.coverage = coverage;
            buff.update_properties();
        }
        return Some(buff);
    }
    let raw = context.tables.buffs.get(name)?.clone();
    let templates = &context.tables.templates;
    let buff_name = name.to_string();
    Some(templates.buff_cached(
        &buff_name,
        Some(level),
        None,
        Some(coverage),
        || {
            let mut buff = LeveledBuff::new(raw, Some(level));
            if coverage != 1.0 {
                buff.coverage = coverage;
                buff.update_properties();
            }
            buff
        },
    ))
}

/// 预构建时间线 BUFF 实例（`CharBuildHelper.ts: hydrateCharBuildTimeline:207-216`）。
///
/// 有 `lv` 的条目按 `(name, lv)` 查 BUFF 表补实例；查不到返回 `Err(缺少名)`
/// （对应 TS `throw 时间线 BUFF … 缺少预构建实例`，`CharBuild.ts:4111-4113`）。
/// 无 `lv` 的技能事件不补实例。调用方在装配后、对 `calculate` 前执行一次。
pub fn hydrate_timeline_buffs(
    context: &BuildContext<'_>,
    raw: &RawTimelineData,
) -> Result<Vec<Option<LeveledBuff>>, String> {
    raw.items
        .iter()
        .map(|item| match item.l {
            Some(level) => buff_from_settings(context, &item.n, level, 1.0)
                .map(Some)
                .ok_or_else(|| format!("时间线 BUFF \"{}\" 缺少预构建实例", item.n)),
            None => Ok(None),
        })
        .collect()
}

/// 按时间在 HP 曲线上线性插值（`CharBuild.ts:4129-4155 getHpPercentAtTime`）。
///
/// 空曲线返回 `0`；早于首点取首值，晚于末点取末值，区间内线性插值。
fn hp_percent_at_time(time: f64, hp_data: &[(f64, f64)]) -> f64 {
    if hp_data.is_empty() {
        return 0.0;
    }
    if time <= hp_data[0].0 {
        return hp_data[0].1;
    }
    if time >= hp_data[hp_data.len() - 1].0 {
        return hp_data[hp_data.len() - 1].1;
    }
    for window in hp_data.windows(2) {
        let (time1, hp1) = window[0];
        let (time2, hp2) = window[1];
        if time >= time1 && time <= time2 {
            if time2 == time1 {
                return hp1;
            }
            let ratio = (time - time1) / (time2 - time1);
            return hp1 + (hp2 - hp1) * ratio;
        }
    }
    0.0
}

/// 求一次目标函数（无状态；`calculateTargetFunction` 的取值部分）。
fn target_value_of(context: &mut BuildContext<'_>) -> f64 {
    let target_function = if context.settings.target_function.is_empty() {
        "伤害".to_string()
    } else {
        context.settings.target_function.clone()
    };
    let mut evaluator = super::ast_eval::Evaluator::new(context);
    evaluator.evaluate(&target_function).unwrap_or(0.0)
}

impl<'a> BuildContext<'a> {
    /// 把 BUFF 加入对应生效槽位（`CharBuild.ts:4295-4298 pushBuffToSlots`）。
    ///
    /// 实例只存一份进 `buffs` 尾部；含 `code` 的追加下标进 `dynamic_buffs`。
    /// 普通槽位成员判定见 `in_plain_slot`（无 `code` 或含普通属性）。
    pub fn push_buff_to_slots(&mut self, buff: LeveledBuff) {
        self.memo.bump();
        self.invalidate_derived();
        let has_code = buff.code.is_some();
        // 新增 BUFF 的生效标记：`禁用` 命中任一已装备 MOD 时失效
        let active = !self.buff_disabled_by_mods(&buff);
        self.buffs.push(buff);
        self.buff_active.push(active);
        if has_code {
            self.dynamic_buffs.push(self.buffs.len() - 1);
        }
    }

    /// 时间轴 BUFF 附加（`CharBuild.ts:4263-4280 applyBuffs`）。
    ///
    /// 已在场的同名 BUFF 等级 `+1`（时间线 BUFF 与技能自带 BUFF 同名时按等级相加，
    /// `set_level` 钳 `lx..mx` 与 TS setter 一致）；新 BUFF 按槽位入列后重建来源表与技能字段。
    /// 派生缓存（条件增量 + 技能字段表）经 `invalidate_derived` 失效，
    /// 末尾 `refresh_skill_fields` 按新状态重填（`calculate_with_timeline` 逐事件重建上下文即此口径）。
    pub fn apply_buffs(&mut self, buffs: &[LeveledBuff]) {
        let incoming: HashSet<&str> = buffs.iter().map(|buff| buff.name.as_str()).collect();
        for buff in self.buffs.iter_mut() {
            if incoming.contains(buff.name.as_str()) {
                buff.set_level(buff.level + 1.0);
            }
        }
        for buff in buffs {
            if self.buffs.iter().any(|item| item.name == buff.name) {
                continue;
            }
            self.push_buff_to_slots(buff.clone());
        }
        self.source_table = self.build_source_table();
        self.memo.bump_with_source();
        self.refresh_skill_fields();
    }

    /// 求一次目标函数（无状态；供 `calculate_one_time` / 事件伤害共用）。
    pub fn target_value(&mut self) -> f64 {
        target_value_of(self)
    }

    /// 单次目标函数求值 + 护盾/血量状态机（`CharBuild.ts:4069-4094 calculateOneTime`）。
    ///
    /// `final <= 0` 返回 `0`；护盾 `> 0` 时先扣护盾，溢出部分按二次求值
    /// `radio = after / final` 折算生命伤害（`radio` 口径照 TS `4080-4083`；
    /// `final == 0` 不会进此分支，无除零）。每次调用推进 `state`。
    pub fn calculate_one_time(&mut self, state: &mut EnemyState) -> f64 {
        let final_value = self.target_value();
        if final_value <= 0.0 {
            return 0.0;
        }
        if state.shield > 0.0 {
            if final_value >= state.shield {
                let over = final_value - state.shield;
                state.shield = 0.0;
                let after = self.target_value();
                let radio = after / final_value;
                let hp_damage = over * radio;
                state.hp -= hp_damage;
                state.shield + hp_damage
            } else {
                state.shield -= final_value;
                final_value
            }
        } else {
            state.hp -= final_value;
            final_value
        }
    }

    /// 时间轴主计算（`CharBuild.ts:4100-4200 calculate`）。
    ///
    /// 事件顺序 = 数组序；BUFF 采样按 `(time, track)` 轨道区间
    /// （`track <= buff.track < 下一技能轨道`，起止含端点，`4120-4126`）；
    /// HP 按曲线线性插值（无曲线不改 `hpPercent`，`4161-4163`）；
    /// 每事件重建上下文（`clone().applyBuffs` 等价，`4166`）后走
    /// `event_damage`（目标函数 + 召唤次数 + 弹匣装填折算）累加；
    /// `timelineDPS` 为真时按总时长折算（总时长 `0 → 0`，除零保护，`4196-4198`）。
    /// 入口先满血（`enemy.resetHP`，`4101`）。
    pub fn calculate_with_timeline(&mut self, timeline: &RawTimelineData) -> f64 {
        let hydrated = match hydrate_timeline_buffs(self, timeline) {
            Ok(buffs) => buffs,
            Err(_) => return 0.0,
        };
        let mut buff_items: Vec<(&TimelineItem, LeveledBuff)> = Vec::new();
        let mut skill_indices: Vec<usize> = Vec::new();
        for (index, item) in timeline.items.iter().enumerate() {
            if item.l.is_some() {
                if let Some(Some(buff)) = hydrated.get(index).map(|slot| slot.as_ref()) {
                    buff_items.push((item, buff.clone()));
                }
            } else {
                skill_indices.push(index);
            }
        }
        // 技能轨道键（升序，供 BUFF 采样定上界，`4117-4118`；`f64` 无 `Hash/Eq`，排序去重）。
        let skill_layer_keys: Vec<f64> = {
            let mut keys: Vec<f64> = skill_indices
                .iter()
                .map(|index| timeline.items[*index].i)
                .collect();
            keys.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            keys.dedup_by(|a, b| *a == *b);
            keys
        };

        let mut state = EnemyState::fresh(&self.enemy);
        let mut total = 0.0;
        let hp_curve: Vec<(f64, f64)> = timeline.hp.clone().unwrap_or_default();
        // 事件间只差 3 个字段：复用一份 working 配置，每事件重置后改写，
        // 省掉每事件一次全量 `CharSettings` 克隆。
        let mut owned_settings = self.settings.clone();
        let base_buffs = self.settings.buffs.clone();
        let base_name = self.settings.base_name.clone();
        let base_hp = self.settings.hp_percent;
        for index in skill_indices {
            let item = &timeline.items[index];
            // BUFF 采样（`4120-4126 getBuffsAtTime`，起止含端点）。
            let max_track = skill_layer_keys
                .iter()
                .copied()
                .find(|key| *key > item.i)
                .unwrap_or(f64::INFINITY);
            let active: Vec<LeveledBuff> = buff_items
                .iter()
                .filter(|(buff_item, _)| {
                    buff_item.t <= item.t
                        && item.t <= buff_item.t + buff_item.d
                        && buff_item.i >= item.i
                        && buff_item.i < max_track
                })
                .map(|(_, buff)| buff.clone())
                .collect();
            // 每事件重建上下文（`4166 clone().applyBuffs` 等价实现，见文件头注释）。
            owned_settings.buffs.clone_from(&base_buffs);
            owned_settings.base_name.clone_from(&base_name);
            owned_settings.hp_percent = base_hp;
            if !hp_curve.is_empty() {
                owned_settings.hp_percent = hp_percent_at_time(item.t, &hp_curve);
            }
            owned_settings.base_name = item.n.clone();
            for buff in &active {
                if let Some(entry) = owned_settings
                    .buffs
                    .iter_mut()
                    .find(|entry| entry.0 == buff.name)
                {
                    // 同名 BUFF 等级 +1（`applyBuffs:4266-4270`），`LeveledBuff::new` 内钳 `lx..mx`。
                    entry.1 += 1.0;
                } else {
                    owned_settings
                        .buffs
                        .push((buff.name.clone(), buff.level, Some(buff.coverage)));
                }
            }
            let Some(mut owned) = BuildContext::new(self.tables, self.char.id, &owned_settings)
            else {
                continue;
            };
            total += owned.event_damage(item, &mut state);
        }
        if self.settings.timeline_dps {
            let total_time: f64 = timeline
                .items
                .iter()
                .map(|item| item.t + item.d)
                .fold(0.0, f64::max);
            if total_time > 0.0 {
                total / total_time
            } else {
                0.0
            }
        } else {
            total
        }
    }

    /// 单事件伤害：目标函数（含护盾/血量状态机）+ 召唤次数 + 弹匣装填折算
    /// （`CharBuild.ts:4167-4192`）。
    ///
    /// 召唤次数 `floor((min(持续, 事件长) - 延迟) / 间隔)`（`4175-4178`，
    /// 间隔已在 `summon_map` 内除以 `(1+攻速)`）；弹匣装填
    /// `attackTimes = floor(事件长 × at × 攻速)`（`at = 攻击时间/(攻击时间+装填)`，
    /// `4186-4189`；面板缺失或武器无射速时不折算）。
    fn event_damage(&mut self, item: &TimelineItem, state: &mut EnemyState) -> f64 {
        let attrs = self.calculate_weapon_attributes(None);
        let panel = attrs.panel.clone();
        let mut event_damage = self.calculate_one_time(state);
        // 召唤物（`4171-4179`）：技能名按当前事件名解析。
        if let Some(skill) = self.all_skills().find(|skill| skill.name == item.n)
            && let Some(map) = skill.summon_map(&attrs.char)
        {
            let duration = map.duration.min(item.d);
            if map.interval != 0.0 {
                let attack_times = ((duration - map.delay) / map.interval).floor();
                event_damage *= attack_times;
            }
        }
        // 弹匣装填（`4182-4191`）：`attrs.weapon && selectedWeapon?.射速`。
        let has_rate = match self.weapons_by_base().get(&item.n).copied() {
            Some(WeaponRef::Melee) => self.melee_weapon.attack_speed.is_some(),
            Some(WeaponRef::Ranged) => self.ranged_weapon.attack_speed.is_some(),
            Some(WeaponRef::Skill) => self.skill_weapon.is_some(),
            _ => false,
        };
        if has_rate && let Some(panel) = panel {
            let reload = panel.get("装填").copied().unwrap_or(0.0);
            let magazine = panel.get("弹匣").copied().unwrap_or(1e11);
            let attack_speed = panel.get("攻速").copied().unwrap_or(1.0);
            let attack_time = magazine / attack_speed;
            let at = if attack_time + reload == 0.0 {
                0.0
            } else {
                attack_time / (attack_time + reload)
            };
            let attack_times = (item.d * at * attack_speed).floor();
            event_damage *= attack_times;
        }
        event_damage
    }
}

/// 顶层求值（含时间轴分发）：无时间轴走单次目标函数求值，
/// 有时间轴走 `calculate_with_timeline`（先满血，见 `calculate:4101`）。
///
/// 供 `income` / `autobuild` 复用（顶层复用 `calculate`，spec §6.1），
/// 也供 `evaluate_build_inner` 的 `target_value` 分支调用。
pub fn calculate_with_settings(
    tables: &BuildTables,
    char_id: i64,
    settings: &super::config::CharSettings,
    timeline: Option<&RawTimelineData>,
) -> f64 {
    let Some(mut context) = BuildContext::new(tables, char_id, settings) else {
        return 0.0;
    };
    match timeline {
        Some(timeline) => context.calculate_with_timeline(timeline),
        None => {
            let mut state = EnemyState::fresh(&context.enemy);
            context.calculate_one_time(&mut state)
        }
    }
}

/// 从 `BuildRequest` 顶层求值（`request.timeline` 自动分发）。
pub fn calculate_request(tables: &BuildTables, request: &BuildRequest) -> f64 {
    calculate_with_settings(
        tables,
        request.char_id,
        &request.settings,
        request.timeline.as_ref(),
    )
}
