//! 魔灵 / 潜质（`petTrait.ts`）。只收纯函数，不碰 `BuildContext::new` 装配链：
//! - `normalize_trait_slots`（`normalizeTraitSlots`：压紧/去重/剔除非法，`TRAIT_SLOT_COUNT=4`）；
//! - `collect_pet_buffs` / `collect_trait_buffs`（`collectPetBuffs`/`collectTraitBuffs` 的
//!   数据层形态，供调用方在装配前组装 `LeveledBuff`）；
//! - `coverage_from_cd_reduce`（`getCoverageFromCdReduce` 的纯函数核）。

use super::config::TraitSlot;
use super::context::BuildContext;
use super::models::LeveledBuff;

/// 潜质槽位数（`petTrait.ts: TRAIT_SLOT_COUNT`，槽间互不相同）。
pub const TRAIT_SLOT_COUNT: usize = 4;
/// 魔灵技能索引上限（突破 `0-3` + 潜质加成后钳 `0-4`；`Lv.5` 对应索引 4）。
pub const PET_SKILL_LEVEL_INDEX_MAX: f64 = 4.0;
/// 魔灵主动技 BUFF 名称后缀（与 `buff.data.ts` 的艾尔芙条目一致，`petTrait.ts: PET_ACTIVE_BUFF_SUFFIX`）。
pub const PET_ACTIVE_BUFF_SUFFIX: &str = "(主动)";
/// 潜质关联 BUFF 的名称前缀（与 `buff.data.ts` 中潜质条目的命名一致）。
pub const TRAIT_BUFF_NAME_PREFIX: &str = "魔灵潜质:";

/// 归一化潜质槽位（`petTrait.ts: normalizeTraitSlots`，行号见 TS 锚点 236-259）。
///
/// 固定 `TRAIT_SLOT_COUNT` 槽、剔除非法/重复槽位（同一基础潜质只保留第一个），
/// 有效槽位压紧到前列、空槽补 `None`。入参做形状校验（脏数据丢弃不抛错）。
pub fn normalize_trait_slots(
    slots: &[TraitSlot],
    tables: &super::tables::BuildTables,
) -> Vec<TraitSlot> {
    let mut used: Vec<i64> = Vec::new();
    let mut picked: Vec<(i64, f64)> = Vec::new();
    for slot in slots {
        let Some((bid, level)) = slot else { continue };
        if !level.is_finite() {
            continue;
        }
        if used.contains(bid) {
            continue;
        }
        // 档位必须存在（`bid → level` 查 `pet_traits` 表；`r3/r4/r5 → 1/2/3` 已在建表时换算）
        let Some(levels) = tables.pet_traits.get(bid) else {
            continue;
        };
        if !levels.contains_key(&(*level as u32)) {
            continue;
        }
        used.push(*bid);
        picked.push((*bid, *level));
    }
    let mut out = vec![None; TRAIT_SLOT_COUNT];
    for (index, slot) in picked.into_iter().take(TRAIT_SLOT_COUNT).enumerate() {
        out[index] = Some(slot);
    }
    out
}

/// 取某潜质档位的魔灵技能等级加成（`petSkillLevelBonus`；只有「老道」`bid 1030` 为 +1）。
///
/// `dob-app` 把它内化为 `trait_pet_level_bonus` 的硬编码计数；这里按表查
/// `pet_traits[bid][level]` 记录的玩法效果，还原 `petTrait.ts: TRAIT_PET_LEVEL_BONUS` 表驱动口径。
pub fn trait_pet_level_bonus_of(tables: &super::tables::BuildTables, bid: i64, level: f64) -> f64 {
    let Some(levels) = tables.pet_traits.get(&bid) else {
        return 0.0;
    };
    let Some(record) = levels.get(&(level as u32)) else {
        return 0.0;
    };
    // 「老道」档位：记录名含「老道」即 +1（与 `context.rs: trait_pet_level_bonus` 的 `bid == 1030` 同效，
    // 但不硬编码 id，改名/换 id 时随表走；双重保险：bid 1030 也直接认 +1）。
    if bid == 1030 {
        return 1.0;
    }
    let contains = record.str_ref("name").is_some_and(|name| name.contains("老道"));
    if contains { 1.0 } else { 0.0 }
}

/// 魔灵生效技能等级（`petTrait.ts: getEffectivePetLevel`：突破 + 潜质加成，钳 `0-4`）。
pub fn effective_pet_level(
    tables: &super::tables::BuildTables,
    pet_level: f64,
    slots: &[TraitSlot],
) -> f64 {
    let base = if pet_level.is_finite() {
        pet_level
    } else {
        3.0
    };
    let mut bonus = 0.0;
    for slot in slots.iter().flatten() {
        bonus += trait_pet_level_bonus_of(tables, slot.0, slot.1);
    }
    (base + bonus).clamp(0.0, PET_SKILL_LEVEL_INDEX_MAX)
}

/// 按给定的魔灵 CD 缩减解析主动技生效覆盖率（`petTrait.ts: getCoverageFromCdReduce`）。
///
/// 自动模式按 `持续 / (原始冷却 × (1 - 缩减))`；无法自动计算（无主动技/无时长/冷却为 0）
/// 时退回手动值；结果钳 `0-1`。`duration`/`base_cd` 由调用方按 `BuildContext` 的
/// `pet_active_duration`/`pet_base_cd` 取（本函数只做纯口径换算，便于单测）。
pub fn coverage_from_cd_reduce(
    duration: f64,
    base_cd: f64,
    cd_reduce: f64,
    manual_coverage: f64,
    auto: bool,
) -> f64 {
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
    if !auto {
        return clamp(manual_coverage);
    }
    let reduce = cd_reduce.clamp(0.0, 1.0);
    let cooldown = base_cd * (1.0 - reduce);
    if duration == 0.0 || cooldown <= 0.0 {
        return clamp(manual_coverage);
    }
    clamp(duration / cooldown)
}

/// 潜质槽位批量构造为构筑 BUFF（`petTrait.ts: collectTraitBuffs`）。
///
/// 空槽 / 无对应 BUFF 的潜质（如「拾取范围」玩法潜质）跳过；等级取槽位等级。
pub fn collect_trait_buffs(
    tables: &super::tables::BuildTables,
    slots: &[TraitSlot],
) -> Vec<LeveledBuff> {
    let mut buffs = Vec::new();
    for slot in slots.iter().flatten() {
        let (bid, level) = *slot;
        let Some(levels) = tables.pet_traits.get(&bid) else {
            continue;
        };
        let Some(trait_record) = levels.get(&(level as u32)) else {
            continue;
        };
        let Some(name) = trait_record.str_ref("name") else {
            continue;
        };
        if name.is_empty() {
            continue;
        }
        let buff_name = format!("{TRAIT_BUFF_NAME_PREFIX}{name}");
        let Some(raw) = tables.buffs.get(&buff_name).cloned() else {
            continue;
        };
        buffs.push(tables.templates.buff_cached(
            &buff_name,
            Some(level),
            None,
            None,
            || LeveledBuff::new(raw, Some(level)),
        ));
    }
    buffs
}

/// 组装所选魔灵在构筑中生效的 BUFF（`petTrait.ts: collectPetBuffs`）。
///
/// 被动按魔灵名、主动技按 `魔灵名(主动)`；等级取生效技能等级，主动技按覆盖率缩放。
/// 未登记对应 BUFF 的魔灵（如闪亮系列）自然返回空。
pub fn collect_pet_buffs(
    tables: &super::tables::BuildTables,
    pet_id: i64,
    level: f64,
    coverage: f64,
) -> Vec<LeveledBuff> {
    if pet_id == 0 {
        return Vec::new();
    }
    let Some(pet) = tables.pets.get(&pet_id) else {
        return Vec::new();
    };
    let pet_name = pet.text("名称");
    if pet_name.is_empty() {
        return Vec::new();
    }
    let mut buffs = Vec::new();
    if let Some(raw) = tables.buffs.get(&pet_name).cloned() {
        let passive_name = pet_name.clone();
        buffs.push(tables.templates.buff_cached(
            &passive_name,
            Some(level),
            None,
            None,
            || LeveledBuff::new(raw, Some(level)),
        ));
    }
    // 主动技按覆盖率缩放（`collectPetBuffs` 口径，行号见 TS 锚点 478-488）。
    let active_name = format!("{pet_name}{PET_ACTIVE_BUFF_SUFFIX}");
    if let Some(raw) = tables.buffs.get(&active_name).cloned() {
        let clamped = coverage.clamp(0.0, 1.0);
        buffs.push(tables.templates.buff_cached(
            &active_name,
            Some(level),
            None,
            Some(clamped),
            || {
                let mut active = LeveledBuff::new(raw, Some(level));
                active.coverage = clamped;
                active.update_properties();
                active
            },
        ));
    }
    buffs
}

impl<'a> BuildContext<'a> {
    /// 取潜质槽位归一化结果（当前配置的 `traits` 经 `normalize_trait_slots`）。
    pub fn normalized_trait_slots(&self) -> Vec<TraitSlot> {
        normalize_trait_slots(&self.settings.traits, self.tables)
    }

    /// 当前配置的潜质 BUFF 表（`collect_trait_buffs` 在当前槽位上的投影）。
    pub fn trait_buffs(&self) -> Vec<LeveledBuff> {
        collect_trait_buffs(self.tables, &self.settings.traits)
    }

    /// 当前所选魔灵的生效 BUFF 表（`collect_pet_buffs` 在当前配置上的投影）。
    pub fn pet_buffs(&self) -> Vec<LeveledBuff> {
        let slots = self.normalized_trait_slots();
        let level = effective_pet_level(self.tables, self.settings.pet_level, &slots);
        // 覆盖率走装配期已算好的主动 BUFF（`build_buffs` 内 `resolve_pet_coverage` 口径）；
        // 未装配主动 BUFF 时退回手动值经纯函数钳制。
        let coverage = self
            .buffs
            .iter()
            .find(|buff| buff.name.ends_with(PET_ACTIVE_BUFF_SUFFIX))
            .map(|buff| buff.coverage)
            .unwrap_or_else(|| {
                coverage_from_cd_reduce(
                    0.0,
                    0.0,
                    0.0,
                    self.settings.pet_coverage,
                    self.settings.pet_auto_coverage,
                )
            });
        collect_pet_buffs(self.tables, self.settings.pet_id, level, coverage)
    }
}
