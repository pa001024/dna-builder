//! 等级档模板缓存：装配期零 JSON 解析、零等级重算。
//!
//! 同一数据包内，`Leveled*` 实例是其 `(业务键, 等级, …)` 的纯函数（`update_properties`
//! 只读 record + 等级/精炼/覆盖率/熔炼标）。首次构造后按档缓存，后续 `clone()` 取用。
//!
//! 缓存挂在 [`crate::tables::BuildTables`] 上（`Arc<Mutex<..>>`，Clone 共享同源模板），
//! 原因：多版本数据包可共存，全局缓存会被不同表互相污染。
//!
//! 浮点安全：缓存只复用**同一输入逐位相同的计算结果**，不改变任何算术顺序；
//! 所有权标记（`owner_id/kind`）与熔炼生效标（`forge_effective`）不进缓存，命中后重打。

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::models::{
    LeveledBuff, LeveledChar, LeveledMod, LeveledMonster, LeveledWeapon,
};

/// MOD 模板键：`(id, 等级位, 特效等级位)`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ModKey {
    id: i64,
    level: u64,
    buff_lv: u64,
}

/// BUFF 完整键（含等级/精炼比/覆盖率位）。
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct BuffFullKey {
    name: String,
    level: u64,
    ratio: u64,
    coverage: u64,
}

/// 角色模板键：`(id, 等级位, 三技能等级位)`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct CharKey {
    id: i64,
    level: u64,
    skills: [u64; 3],
}

/// 武器模板键：`(id, 精炼位, 等级位, 特效等级位)`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct WeaponKey {
    id: i64,
    refine: u64,
    level: u64,
    effect_lv: u64,
}

/// 怪物模板键：`(id, 等级位, rouge, 血量倍率位)`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct MonsterKey {
    id: i64,
    level: u64,
    rouge: bool,
    hp_mult: u64,
}

#[derive(Debug, Default)]
struct TemplatesCache {
    mods: HashMap<ModKey, LeveledMod>,
    buffs: HashMap<BuffFullKey, LeveledBuff>,
    weapons: HashMap<WeaponKey, LeveledWeapon>,
    chars: HashMap<CharKey, LeveledChar>,
    monsters: HashMap<MonsterKey, LeveledMonster>,
}

/// 等级档模板缓存（`BuildTables` 持有，见模块文档）。
#[derive(Debug, Clone, Default)]
pub struct Templates {
    inner: Arc<Mutex<TemplatesCache>>,
}

fn bits(value: f64) -> u64 {
    value.to_bits()
}

fn opt_bits(value: Option<f64>) -> u64 {
    value.map(bits).unwrap_or(u64::MAX)
}

impl Templates {
    fn cached<K, V>(
        &self,
        field: fn(&mut TemplatesCache) -> &mut HashMap<K, V>,
        key: K,
        build: impl FnOnce() -> V,
    ) -> V
    where
        K: Eq + std::hash::Hash,
        V: Clone,
    {
        if let Some(hit) = field(&mut self.inner.lock().expect("模板锁")).get(&key) {
            return hit.clone();
        }
        let value = build();
        field(&mut self.inner.lock().expect("模板锁")).insert(key, value.clone());
        value
    }

    pub fn mod_cached(
        &self,
        id: i64,
        level: Option<f64>,
        buff_lv: Option<f64>,
        build: impl FnOnce() -> LeveledMod,
    ) -> LeveledMod {
        let key = ModKey {
            id,
            level: opt_bits(level),
            buff_lv: opt_bits(buff_lv),
        };
        self.cached(|cache| &mut cache.mods, key, build)
    }

    /// `ratio` 为武器特效精炼比位；表 BUFF／宠物／时间轴 BUFF 传 `None`（此时位为 [`u64::MAX`]）。
    pub fn buff_cached(
        &self,
        name: &str,
        level: Option<f64>,
        ratio: Option<f64>,
        coverage: Option<f64>,
        build: impl FnOnce() -> LeveledBuff,
    ) -> LeveledBuff {
        let key = BuffFullKey {
            name: name.to_string(),
            level: opt_bits(level),
            ratio: opt_bits(ratio),
            coverage: opt_bits(coverage),
        };
        self.cached(|cache| &mut cache.buffs, key, build)
    }

    /// 缓存存的是构造默认值（`forge_effective=true`）；命中与否调用方都必须重打
    /// `set_forge_effective`，故熔炼标不进键。
    pub fn weapon_cached(
        &self,
        id: i64,
        refine: Option<f64>,
        level: Option<f64>,
        effect_lv: Option<f64>,
        build: impl FnOnce() -> LeveledWeapon,
    ) -> LeveledWeapon {
        let key = WeaponKey {
            id,
            refine: opt_bits(refine),
            level: opt_bits(level),
            effect_lv: opt_bits(effect_lv),
        };
        self.cached(|cache| &mut cache.weapons, key, build)
    }

    pub fn char_cached(
        &self,
        id: i64,
        level: Option<f64>,
        skill_levels: &[f64; 3],
        build: impl FnOnce() -> LeveledChar,
    ) -> LeveledChar {
        let key = CharKey {
            id,
            level: opt_bits(level),
            skills: [
                bits(skill_levels[0]),
                bits(skill_levels[1]),
                bits(skill_levels[2]),
            ],
        };
        self.cached(|cache| &mut cache.chars, key, build)
    }

    pub fn monster_cached(
        &self,
        id: i64,
        level: f64,
        rouge: bool,
        hp_mult: f64,
        build: impl FnOnce() -> LeveledMonster,
    ) -> LeveledMonster {
        let key = MonsterKey {
            id,
            level: bits(level),
            rouge,
            hp_mult: bits(hp_mult),
        };
        self.cached(|cache| &mut cache.monsters, key, build)
    }
}
