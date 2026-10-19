//! 构筑求值所需的数据表。
//!
//! 与上游 `src/data/d/` 的分工一致：本模块只负责「把数据包里的一批原始记录建成可查的索引」,
//! 等级化与求值交给 [`super::models`]。
//!
//! 上游靠模块级 `Map` + `setLeveledXxxResolver` 全局注册（`LeveledHelpers.ts`);
//! 这里改成显式的 [`BuildTables`] 结构由调用方持有，因为同一个进程可能同时需要
//! 多份数据包版本（列表懒加载 + 已激活包），全局单例会让它们互相覆盖。

use std::collections::HashMap;

use serde_json::Value;

use super::record::Record;
use crate::error::CalcError;
use crate::session::ModulesJson;

/// MOD 的静态表项：记录本身 + 按 id 精确匹配的特效条目。
///
/// 上游 `LeveledModHelper.fromId` 里 `modMap` 与 `modEffectMap` 是两个独立索引，
/// 这里合成一项，避免调用方每次都要同时查两张表。
#[derive(Debug, Clone)]
pub struct ModSource {
    pub data: Record,
    pub effect: Option<Record>,
}

/// 武器 / 同律武器的静态表项。
#[derive(Debug, Clone)]
pub struct WeaponSource {
    pub data: Record,
    pub effect: Option<Record>,
}

/// 同律武器来源：角色记录里的 `同律武器` 条目本身没有独立表。
#[derive(Debug, Clone)]
pub struct SkillWeaponSource {
    pub data: Record,
}

/// 全部构筑求值所需的表（不可变，换数据包时整体重建）。
///
/// 等级表（`CommonLevelUp` / `MOB_LEVEL_UP`）不由调用方喂，见 `const_tables`：
/// 上游 TS 里它们本就在 `leveled/` 代码中而非 `d/` 数据包。
#[derive(Debug, Clone, Default)]
pub struct BuildTables {
    /// 角色：id → 记录。
    pub chars: HashMap<i64, Record>,
    /// MOD：id → 记录 + 特效。
    pub mods: HashMap<i64, ModSource>,
    /// 武器：id → 记录 + 特效。
    pub weapons: HashMap<i64, WeaponSource>,
    /// BUFF / 特效：名称 → 记录（上游 `buffMap`）。
    pub buffs: HashMap<String, Record>,
    /// 怪物：id → 记录。
    pub monsters: HashMap<i64, Record>,
    /// 魔灵：id → 记录（`pet.data`，被动物与主动技的 BUFF 名称由这里拼）。
    pub pets: HashMap<i64, Record>,
    /// 魔灵潜质条目：`基础潜质 id` → `等级(1..3)` → 潜质记录。
    ///
    /// 上游 `petEntrys` 每条是一个稀有度档位（`r` = 3/4/5，对应等级 1/2/3）；
    /// 与 BUFF 的关联靠**名称**：`魔灵潜质:<潜质名>`。
    pub pet_traits: HashMap<i64, HashMap<u32, Record>>,
    /// 5 级精炼基准（上游把精炼加成写成 `v / 5 * (refine + 5)`）。
    pub refine_base: f64,
    /// 等级档模板缓存（懒展开；Clone 时共享同源模板）。
    pub(crate) templates: crate::templates::Templates,
}

/// 从数据包模块记录构建表。
///
/// 主入口 [`TableBuilder::build`]；魔灵与潜质表由 build 内部一次性补齐。
/// 等级表走 `const_tables` 内嵌常量，不由调用方喂。
pub struct TableBuilder;

impl TableBuilder {
    /// 建表（纯构造，无 IO）。`modules` 形态见 [`ModulesJson`]。
    pub fn build(modules: &ModulesJson) -> Result<BuildTables, CalcError> {
        let mut tables = BuildTables {
            refine_base: 5.0,
            ..Default::default()
        };

        for value in &modules.char_data {
            let record = Record::from_value(value);
            if let Some(id) = record.id("id") {
                tables.chars.insert(id, record);
            }
        }
        for value in &modules.mod_data {
            let record = Record::from_value(value);
            if let Some(id) = record.id("id") {
                tables.mods.insert(
                    id,
                    ModSource {
                        data: record,
                        effect: None,
                    },
                );
            }
        }
        for value in &modules.weapon_data {
            let record = Record::from_value(value);
            if let Some(id) = record.id("id") {
                tables.weapons.insert(
                    id,
                    WeaponSource {
                        data: record,
                        effect: None,
                    },
                );
            }
        }
        for value in &modules.buff_data {
            let record = Record::from_value(value);
            let name = record.text("名称");
            if !name.is_empty() {
                tables.buffs.insert(name, record);
            }
        }
        for value in &modules.monster_data {
            let record = Record::from_value(value);
            if let Some(id) = record.id("id") {
                tables.monsters.insert(id, record);
            }
        }

        // 特效按 id 精确挂到 MOD / 武器上（上游 `modEffectMap` / `weaponEffectMap`）。
        // 顺序与上游一致：先把两张目标表建好，再逐条挂，避免「特效先到、目标未建」时丢失。
        for value in &modules.effect_data {
            let record = Record::from_value(value);
            let Some(id) = record.id("id") else { continue };
            if let Some(source) = tables.mods.get_mut(&id) {
                source.effect = Some(record);
            } else if let Some(source) = tables.weapons.get_mut(&id) {
                source.effect = Some(record);
            }
        }

        tables = Self::with_pets(tables, &modules.pet_data, &modules.pet_traits);
        Ok(tables)
    }

    /// 补充魔灵与潜质表。
    ///
    /// 两者都来自 `pet.data` 模块：`default` 导出是魔灵列表，`petEntrys` 是潜质档位列表。
    /// 潜质按「基础潜质 id + 等级」建索引，等级 = 稀有度 - 2（r3/r4/r5 → 1/2/3），
    /// 与上游 `toTrait` 的换算一致。
    pub fn with_pets(
        mut tables: BuildTables,
        pet_records: &[Value],
        trait_records: &[Value],
    ) -> BuildTables {
        for value in pet_records {
            let record = Record::from_value(value);
            if let Some(id) = record.id("id") {
                tables.pets.insert(id, record);
            }
        }
        for value in trait_records {
            let record = Record::from_value(value);
            let Some(bid) = record.id("bid") else {
                continue;
            };
            let Some(rarity) = record.num("r") else {
                continue;
            };
            // 稀有度 3/4/5 → 等级 1/2/3
            let level = (rarity - 2.0) as u32;
            tables
                .pet_traits
                .entry(bid)
                .or_default()
                .insert(level, record);
        }
        tables
    }
}

/// 从角色记录里取同律武器来源（上游 `char.同律武器[0]`）。
///
/// 上游只在 `CharBuild.set char` 里取**第一条**，这里保持同一口径。
pub fn build_skill_weapons(char_record: &Record) -> Vec<SkillWeaponSource> {
    char_record
        .objs("同律武器")
        .into_iter()
        .map(|data| SkillWeaponSource { data })
        .collect()
}
