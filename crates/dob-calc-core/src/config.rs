//! 构筑配置（`charSettings`）模型。
//!
//! 与上游 `src/composables/useCharSettings.ts` 的 `CharSettings` 对齐：
//! 服务器上用 `JSON.stringify` 存进 `Build.charSettings`，因此这份结构就是
//! 「构筑分享」的交换格式。字段名保持上游原样（驼峰），这样从 GraphQL 拿到的 JSON
//! 可以零转换直接解析。
//!
//! 归一化规则（上游 `normalizeCharSettings`）：
//! - 只覆盖**确实存在**的键，且类型必须与默认值一致（数组整体替换、对象浅合并）；
//! - `modVariantIndex` 决定读哪一份 MOD 配置：0 用 `charMods` 等旧字段，
//!   1/2 从 `modVariants[i-1]` 取（缺失时回落配置 A，保证老存档不丢配置）。

use serde_json::Value;

use super::models::AttrMap;

/// MOD 槽位：`[魔之楔 id, 等级]`；`None` 表示空槽。
pub type ModSlot = Option<(i64, f64)>;

/// 潜质槽位：`[基础潜质 id, 等级]`；`None` 表示空槽。
pub type TraitSlot = Option<(i64, f64)>;
/// 一份 MOD 变体（配置 A/B/C 中的 B/C）。
#[derive(Debug, Clone, Default)]
pub struct ModVariant {
    /// 中枢魔之楔（光环）id；`None` / 0 表示沿用配置 A。
    pub aura: Option<i64>,
    pub char_mods: Vec<ModSlot>,
    pub melee_mods: Vec<ModSlot>,
    pub ranged_mods: Vec<ModSlot>,
    pub skill_mods: Vec<ModSlot>,
}

/// DOT 频率设置。
#[derive(Debug, Clone, Default)]
pub struct DotSettings {
    pub skill: f64,
    pub melee: f64,
    pub ranged: f64,
    pub skillweapon: f64,
    pub force_own_additional_damage: bool,
}

/// 构筑配置；字段命名与上游一致。
#[derive(Debug, Clone)]
pub struct CharSettings {
    pub char_level: f64,
    pub base_name: String,
    pub hp_percent: f64,
    pub resonance_gain: f64,
    pub enemy_id: i64,
    pub enemy_level: f64,
    pub enemy_resistance: f64,
    pub is_rouge: bool,
    pub target_function: String,
    pub custom_variables: Vec<(String, String)>,
    /// 技能等级 `[E, Q, 被动]`；对应上游 `CharSkillLevels`（老格式单个数字
    /// 解析时已展开为三项相同，见 `normalize_skill_levels`）。
    pub char_skill_level: [f64; 3],
    pub extra_mastery: String,
    pub melee_weapon: i64,
    pub melee_weapon_level: f64,
    pub melee_weapon_refine: f64,
    pub ranged_weapon: i64,
    pub ranged_weapon_level: f64,
    pub ranged_weapon_refine: f64,
    pub aura_mod: i64,
    pub imbalance: bool,
    pub char_mods: Vec<ModSlot>,
    pub melee_mods: Vec<ModSlot>,
    pub ranged_mods: Vec<ModSlot>,
    pub skill_mods: Vec<ModSlot>,
    pub mod_variant_index: usize,
    pub mod_variants: Vec<ModVariant>,
    /// BUFF 列表：`[名称, 等级, 覆盖率?]`。
    pub buffs: Vec<(String, f64, Option<f64>)>,
    pub custom_buff: Vec<(String, f64)>,
    pub pet_id: i64,
    pub pet_level: f64,
    pub pet_coverage: f64,
    pub pet_auto_coverage: bool,
    /// 魔灵潜质槽位：`[潜质 id, 等级]`。
    pub traits: Vec<TraitSlot>,
    pub team1: Option<i64>,
    pub team1_weapon: Option<i64>,
    pub team2: Option<i64>,
    pub team2_weapon: Option<i64>,
    pub timeline_dps: bool,
    pub use_global: bool,
    /// 特效等级配置（`m:<id>` / `w:<id>` → 等级）。
    pub effect_config: Vec<(String, f64)>,
    pub dot_settings: DotSettings,
}

impl Default for CharSettings {
    /// 与上游 `createDefaultCharSettings()` 一致。
    fn default() -> Self {
        Self {
            char_level: 80.0,
            base_name: String::new(),
            hp_percent: 1.0,
            resonance_gain: 3.0,
            enemy_id: 130,
            enemy_level: 80.0,
            enemy_resistance: 0.0,
            is_rouge: false,
            target_function: String::new(),
            custom_variables: Vec::new(),
            char_skill_level: [CHAR_SKILL_LEVEL_DEFAULT; 3],
            extra_mastery: String::new(),
            melee_weapon: 10206,
            melee_weapon_level: 80.0,
            melee_weapon_refine: 5.0,
            ranged_weapon: 20102,
            ranged_weapon_level: 80.0,
            ranged_weapon_refine: 5.0,
            aura_mod: 31524,
            imbalance: false,
            char_mods: vec![None; 8],
            melee_mods: vec![None; 8],
            ranged_mods: vec![None; 8],
            skill_mods: vec![None; 4],
            mod_variant_index: 0,
            mod_variants: Vec::new(),
            buffs: Vec::new(),
            custom_buff: Vec::new(),
            pet_id: 0,
            pet_level: 3.0,
            pet_coverage: 1.0,
            pet_auto_coverage: true,
            traits: vec![None; 4],
            team1: None,
            team1_weapon: None,
            team2: None,
            team2_weapon: None,
            timeline_dps: false,
            use_global: false,
            effect_config: Vec::new(),
            dot_settings: DotSettings::default(),
        }
    }
}

impl CharSettings {
    /// 从服务器下发的 `charSettings` JSON 解析；对应上游 `normalizeCharSettings`。
    ///
    /// 缺失或类型不符的键保持默认值，因此脏存档不会让整份配置失效。
    pub fn from_json(value: &Value) -> Self {
        let mut settings = Self::default();
        let Some(object) = value.as_object() else {
            return settings;
        };

        macro_rules! set_num {
            ($key:literal, $field:ident) => {
                if let Some(number) = object.get($key).and_then(Value::as_f64) {
                    settings.$field = number;
                }
            };
        }
        macro_rules! set_text {
            ($key:literal, $field:ident) => {
                if let Some(text) = object.get($key).and_then(Value::as_str) {
                    settings.$field = text.to_string();
                }
            };
        }
        macro_rules! set_bool {
            ($key:literal, $field:ident) => {
                if let Some(flag) = object.get($key).and_then(Value::as_bool) {
                    settings.$field = flag;
                }
            };
        }
        macro_rules! set_id {
            ($key:literal, $field:ident) => {
                if let Some(id) = object.get($key).and_then(json_id) {
                    settings.$field = id;
                }
            };
        }

        set_num!("charLevel", char_level);
        set_text!("baseName", base_name);
        set_num!("hpPercent", hp_percent);
        set_num!("resonanceGain", resonance_gain);
        set_id!("enemyId", enemy_id);
        set_num!("enemyLevel", enemy_level);
        set_num!("enemyResistance", enemy_resistance);
        set_bool!("isRouge", is_rouge);
        set_text!("targetFunction", target_function);
        // 技能等级归一化：兼容老格式单个数字（如 `12` → `[12, 12, 12]`）
        settings.char_skill_level =
            normalize_skill_levels(object.get("charSkillLevel").unwrap_or(&Value::Null));
        set_text!("extraMastery", extra_mastery);
        set_id!("meleeWeapon", melee_weapon);
        set_num!("meleeWeaponLevel", melee_weapon_level);
        set_num!("meleeWeaponRefine", melee_weapon_refine);
        set_id!("rangedWeapon", ranged_weapon);
        set_num!("rangedWeaponLevel", ranged_weapon_level);
        set_num!("rangedWeaponRefine", ranged_weapon_refine);
        set_id!("auraMod", aura_mod);
        set_bool!("imbalance", imbalance);
        set_bool!("timelineDPS", timeline_dps);
        set_bool!("useGlobal", use_global);
        set_id!("petId", pet_id);
        set_num!("petLevel", pet_level);
        set_num!("petCoverage", pet_coverage);
        set_bool!("petAutoCoverage", pet_auto_coverage);
        if let Some(index) = object.get("modVariantIndex").and_then(Value::as_u64) {
            settings.mod_variant_index = index as usize;
        }

        // 自定义变量：`[[名称, 表达式], …]`
        if let Some(items) = object.get("customVariables").and_then(Value::as_array) {
            settings.custom_variables = items
                .iter()
                .filter_map(|item| {
                    let pair = item.as_array()?;
                    Some((
                        pair.first()?.as_str()?.to_string(),
                        pair.get(1)?.as_str()?.to_string(),
                    ))
                })
                .collect();
        }

        // MOD 槽位
        settings.char_mods = parse_slots(object.get("charMods"), 8);
        settings.melee_mods = parse_slots(object.get("meleeMods"), 8);
        settings.ranged_mods = parse_slots(object.get("rangedMods"), 8);
        settings.skill_mods = parse_slots(object.get("skillWeaponMods"), 4);

        // MOD 变体（B/C）
        if let Some(items) = object.get("modVariants").and_then(Value::as_array) {
            settings.mod_variants = items
                .iter()
                .map(|item| {
                    let Some(map) = item.as_object() else {
                        return ModVariant::default();
                    };
                    ModVariant {
                        aura: map.get("中枢").and_then(json_id).filter(|value| *value > 0),
                        char_mods: parse_slots(map.get("角色"), 8),
                        melee_mods: parse_slots(map.get("近战"), 8),
                        ranged_mods: parse_slots(map.get("远程"), 8),
                        skill_mods: parse_slots(map.get("同律"), 4),
                    }
                })
                .collect();
        }

        // BUFF：`[[名称, 等级, 覆盖率?], …]`
        if let Some(items) = object.get("buffs").and_then(Value::as_array) {
            settings.buffs = items
                .iter()
                .filter_map(|item| {
                    let tuple = item.as_array()?;
                    Some((
                        tuple.first()?.as_str()?.to_string(),
                        tuple.get(1)?.as_f64()?,
                        tuple.get(2).and_then(Value::as_f64),
                    ))
                })
                .collect();
        }

        // 自定义 BUFF：`[[属性, 数值], …]`
        if let Some(items) = object.get("customBuff").and_then(Value::as_array) {
            settings.custom_buff = items
                .iter()
                .filter_map(|item| {
                    let tuple = item.as_array()?;
                    Some((
                        tuple.first()?.as_str()?.to_string(),
                        tuple.get(1)?.as_f64()?,
                    ))
                })
                .collect();
        }

        // 潜质槽位：`[[id, 等级], …]`
        if let Some(items) = object.get("traits").and_then(Value::as_array) {
            let mut traits: Vec<TraitSlot> = Vec::new();
            for item in items {
                match item.as_array() {
                    Some(tuple) => {
                        let id = tuple.first().and_then(json_id);
                        let level = tuple.get(1).and_then(Value::as_f64);
                        traits.push(match (id, level) {
                            (Some(id), Some(level)) => Some((id, level)),
                            _ => None,
                        });
                    }
                    None => traits.push(None),
                }
            }
            settings.traits = traits;
        }

        // 协战：数字或 `"-"`（未配置）
        settings.team1 = optional_id(object.get("team1"));
        settings.team1_weapon = optional_id(object.get("team1Weapon"));
        settings.team2 = optional_id(object.get("team2"));
        settings.team2_weapon = optional_id(object.get("team2Weapon"));

        // 特效等级配置
        if let Some(map) = object.get("effectConfig").and_then(Value::as_object) {
            settings.effect_config = map
                .iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect();
        }

        // DOT 频率
        if let Some(map) = object.get("dotSettings").and_then(Value::as_object) {
            settings.dot_settings = DotSettings {
                skill: map.get("skill").and_then(Value::as_f64).unwrap_or(0.0),
                melee: map.get("melee").and_then(Value::as_f64).unwrap_or(0.0),
                ranged: map.get("ranged").and_then(Value::as_f64).unwrap_or(0.0),
                skillweapon: map
                    .get("skillweapon")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
                force_own_additional_damage: map
                    .get("forceOwnAdditionalDamage")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            };
        }

        // hpPercent 钳制（上游构造时也做一次；`set_num!` 不滤 NaN，
        // NaN 经 `.clamp()` 传播为 NaN——非法输入的诚实口径，有限值与旧链一致）。
        settings.hp_percent = settings.hp_percent.clamp(0.0, 1.0);
        settings
    }

    /// 序列化回 TS `CharSettings` 交换格式（键名与 `from_json` 一一对应）。
    ///
    /// 供自动配装结果落盘：调用方把返回的 `settings` 经 `BuildRequest{settings}` 回填。
    pub fn to_json_value(&self) -> Value {
        let slots = |slots: &[ModSlot]| {
            slots
                .iter()
                .map(|slot| {
                    slot.map(|(id, level)| serde_json::json!([id, level]))
                        .unwrap_or(Value::Null)
                })
                .collect::<Vec<_>>()
        };
        let dot_settings = serde_json::json!({
            "skill": self.dot_settings.skill,
            "melee": self.dot_settings.melee,
            "ranged": self.dot_settings.ranged,
            "skillweapon": self.dot_settings.skillweapon,
            "forceOwnAdditionalDamage": self.dot_settings.force_own_additional_damage,
        });
        serde_json::json!({
            "charLevel": self.char_level,
            "baseName": self.base_name,
            "hpPercent": self.hp_percent,
            "resonanceGain": self.resonance_gain,
            "enemyId": self.enemy_id,
            "enemyLevel": self.enemy_level,
            "enemyResistance": self.enemy_resistance,
            "isRouge": self.is_rouge,
            "targetFunction": self.target_function,
            "customVariables": self.custom_variables.iter().map(|(name, expr)| serde_json::json!([name, expr])).collect::<Vec<_>>(),
            "charSkillLevel": [self.char_skill_level[0], self.char_skill_level[1], self.char_skill_level[2]],
            "extraMastery": self.extra_mastery,
            "meleeWeapon": self.melee_weapon,
            "meleeWeaponLevel": self.melee_weapon_level,
            "meleeWeaponRefine": self.melee_weapon_refine,
            "rangedWeapon": self.ranged_weapon,
            "rangedWeaponLevel": self.ranged_weapon_level,
            "rangedWeaponRefine": self.ranged_weapon_refine,
            "auraMod": self.aura_mod,
            "imbalance": self.imbalance,
            "timelineDPS": self.timeline_dps,
            "useGlobal": self.use_global,
            "petId": self.pet_id,
            "petLevel": self.pet_level,
            "petCoverage": self.pet_coverage,
            "petAutoCoverage": self.pet_auto_coverage,
            "modVariantIndex": self.mod_variant_index,
            "charMods": slots(&self.char_mods),
            "meleeMods": slots(&self.melee_mods),
            "rangedMods": slots(&self.ranged_mods),
            "skillWeaponMods": slots(&self.skill_mods),
            "modVariants": self.mod_variants.iter().map(|variant| serde_json::json!({
                "中枢": variant.aura,
                "角色": slots(&variant.char_mods),
                "近战": slots(&variant.melee_mods),
                "远程": slots(&variant.ranged_mods),
                "同律": slots(&variant.skill_mods),
            })).collect::<Vec<_>>(),
            "buffs": self.buffs.iter().map(|(name, level, coverage)| match coverage {
                Some(coverage) => serde_json::json!([name, level, coverage]),
                None => serde_json::json!([name, level]),
            }).collect::<Vec<_>>(),
            "customBuff": self.custom_buff.iter().map(|(prop, value)| serde_json::json!([prop, value])).collect::<Vec<_>>(),
            "traits": self.traits.iter().map(|slot| slot.map(|(id, level)| serde_json::json!([id, level])).unwrap_or(Value::Null)).collect::<Vec<_>>(),
            "team1": self.team1.map(|id| serde_json::json!(id)).unwrap_or(serde_json::json!("-")),
            "team1Weapon": self.team1_weapon.map(|id| serde_json::json!(id)).unwrap_or(serde_json::json!("-")),
            "team2": self.team2.map(|id| serde_json::json!(id)).unwrap_or(serde_json::json!("-")),
            "team2Weapon": self.team2_weapon.map(|id| serde_json::json!(id)).unwrap_or(serde_json::json!("-")),
            "effectConfig": self.effect_config.iter().cloned().collect::<std::collections::BTreeMap<_, _>>(),
            "dotSettings": dot_settings,
        })
    }

    /// 当前激活变体的角色 MOD 槽位；对应上游 `getModVariantSlots(settings, "角色")`。
    pub fn char_slots(&self) -> &Vec<ModSlot> {
        self.slots_of(0)
    }

    /// 当前激活变体的近战 MOD 槽位。
    pub fn melee_slots(&self) -> &Vec<ModSlot> {
        self.slots_of(1)
    }

    /// 当前激活变体的远程 MOD 槽位。
    pub fn ranged_slots(&self) -> &Vec<ModSlot> {
        self.slots_of(2)
    }

    /// 当前激活变体的同律 MOD 槽位。
    pub fn skill_slots(&self) -> &Vec<ModSlot> {
        self.slots_of(3)
    }

    /// 取指定槽位类型在激活变体下的数组；变体越界时回落到配置 A。
    fn slots_of(&self, slot: usize) -> &Vec<ModSlot> {
        let legacy = match slot {
            0 => &self.char_mods,
            1 => &self.melee_mods,
            2 => &self.ranged_mods,
            _ => &self.skill_mods,
        };
        if self.mod_variant_index == 0 {
            return legacy;
        }
        let Some(variant) = self.mod_variants.get(self.mod_variant_index - 1) else {
            return legacy;
        };
        let candidate = match slot {
            0 => &variant.char_mods,
            1 => &variant.melee_mods,
            2 => &variant.ranged_mods,
            _ => &variant.skill_mods,
        };
        if candidate.is_empty() {
            legacy
        } else {
            candidate
        }
    }

    /// 当前激活变体的中枢魔之楔 id；变体未设置时沿用配置 A。
    pub fn variant_aura(&self) -> i64 {
        if self.mod_variant_index == 0 {
            return self.aura_mod;
        }
        let Some(variant) = self.mod_variants.get(self.mod_variant_index - 1) else {
            return self.aura_mod;
        };
        match variant.aura {
            Some(value) if value > 0 => value,
            _ => self.aura_mod,
        }
    }

    /// 读取 MOD 特效等级；对应上游 `getModBuffLvFromSetting`（无配置时返回 `None`）。
    pub fn mod_effect_level(&self, mod_id: i64) -> Option<f64> {
        let key = format!("m:{mod_id}");
        self.effect_config
            .iter()
            .find(|(name, _)| *name == key)
            .map(|(_, value)| *value)
    }

    /// 读取武器特效等级；对应上游 `getWBuffLvFromSetting`。
    pub fn weapon_effect_level(&self, weapon_id: i64) -> Option<f64> {
        let key = format!("w:{weapon_id}");
        self.effect_config
            .iter()
            .find(|(name, _)| *name == key)
            .map(|(_, value)| *value)
    }

    /// 自定义 BUFF 的属性表。
    pub fn custom_buff_map(&self) -> AttrMap {
        self.custom_buff.iter().cloned().collect()
    }
}

/// `[[id, 等级], …]` → 槽位数组（长度固定为 `len`，缺失补空槽）。
fn parse_slots(value: Option<&Value>, len: usize) -> Vec<ModSlot> {
    let mut slots = vec![None; len];
    let Some(items) = value.and_then(Value::as_array) else {
        return slots;
    };
    for (index, item) in items.iter().enumerate() {
        if index >= len {
            break;
        }
        let Some(tuple) = item.as_array() else {
            continue;
        };
        let id = tuple.first().and_then(json_id);
        let level = tuple.get(1).and_then(Value::as_f64);
        if let (Some(id), Some(level)) = (id, level) {
            slots[index] = Some((id, level));
        }
    }
    slots
}

/// JSON 数值 → 整数 id；与 `Record::id` 同口径（`record.rs`）。
pub(crate) fn json_id(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => {
            if let Some(integer) = number.as_i64() {
                return Some(integer);
            }
            if let Some(unsigned) = number.as_u64() {
                return i64::try_from(unsigned).ok();
            }
            let float = number.as_f64()?;
            if float.is_finite() && float.fract() == 0.0 && float.abs() < 9.007_199_254_740_992e15 {
                Some(float as i64)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// 协战 id：数字才算配置，字符串（含 `"-"`）视为未配置。
fn optional_id(value: Option<&Value>) -> Option<i64> {
    value.and_then(json_id)
}

/// 技能等级下限；对应上游 `CHAR_SKILL_LEVEL_MIN`。
pub const CHAR_SKILL_LEVEL_MIN: f64 = 1.0;
/// 技能等级上限；对应上游 `CHAR_SKILL_LEVEL_MAX`。
pub const CHAR_SKILL_LEVEL_MAX: f64 = 12.0;
/// 技能等级默认值（E/Q/被动均为 10 级）；对应上游 `CHAR_SKILL_LEVEL_DEFAULT`。
pub const CHAR_SKILL_LEVEL_DEFAULT: f64 = 10.0;

/// 钳制到 1-12 并取整；对应上游 `normalizeCharSkillLevels` 内的 `clamp`。
fn clamp_skill_level(value: f64, fallback: f64) -> f64 {
    if !value.is_finite() {
        return fallback;
    }
    value
        .round()
        .clamp(CHAR_SKILL_LEVEL_MIN, CHAR_SKILL_LEVEL_MAX)
}

/// 归一化技能等级为 `[E, Q, 被动]` 三元组；对应上游 `normalizeCharSkillLevels`。
///
/// 兼容老格式：单个数字视为三项相同；数组缺项用首项补齐，各项钳制到 1-12
/// 并取整（非有限值同样回落首项，首项非法时回落默认值）。
pub fn normalize_skill_levels(value: &Value) -> [f64; 3] {
    if let Some(number) = value.as_f64() {
        let level = clamp_skill_level(number, CHAR_SKILL_LEVEL_DEFAULT);
        return [level, level, level];
    }
    if let Some(items) = value.as_array() {
        let first = items.first().and_then(Value::as_f64).unwrap_or(f64::NAN);
        let first = clamp_skill_level(first, CHAR_SKILL_LEVEL_DEFAULT);
        let mut levels = [first, first, first];
        for (slot, level) in levels.iter_mut().enumerate() {
            if let Some(number) = items.get(slot).and_then(Value::as_f64)
                && number.is_finite()
            {
                *level = clamp_skill_level(number, first);
            }
        }
        return levels;
    }
    [CHAR_SKILL_LEVEL_DEFAULT; 3]
}

/// 按角色技能索引取对应的技能等级（0→E，1→Q，2 及之后→被动）；
/// 对应上游 `resolveCharSkillLevel`。
pub fn resolve_skill_level(levels: &[f64; 3], index: i64) -> f64 {
    if index <= 0 {
        levels[0]
    } else if index == 1 {
        levels[1]
    } else {
        levels[2]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_full_settings() {
        // 用字符串解析而不是 `json!` 大对象字面量：后者会触发宏递归上限
        let raw: Value = serde_json::from_str(
            r#"{
            "charLevel": 80, "baseName": "萨麦尔", "hpPercent": 1, "resonanceGain": 3,
            "enemyId": 300, "enemyLevel": 80, "enemyResistance": -4, "isRouge": false,
            "targetFunction": "[若华纯蓄]DPS",
            "customVariables": [["[a]", "1+1"]],
            "charSkillLevel": 12, "extraMastery": "单手剑",
            "meleeWeapon": 10399, "meleeWeaponLevel": 80, "meleeWeaponRefine": 5,
            "rangedWeapon": 20510, "rangedWeaponLevel": 80, "rangedWeaponRefine": 5,
            "auraMod": 51765, "imbalance": false,
            "charMods": [[51463, 10], null],
            "meleeMods": [], "rangedMods": [], "skillWeaponMods": [[54003, 10]],
            "modVariantIndex": 0, "modVariants": [],
            "buffs": [["莉兹贝尔1溯", 1], ["菲娜Q", 12, 0.6]],
            "customBuff": [["近战触发", 2.32]],
            "petId": 4261, "petLevel": 3, "petCoverage": 0.6, "petAutoCoverage": true,
            "traits": [[1025, 3], null, null, null],
            "team1": 1801, "team1Weapon": 20509, "team2": "-", "team2Weapon": "-",
            "timelineDPS": false, "useGlobal": false,
            "effectConfig": {"m:43342": 6},
            "dotSettings": {"skill": 0, "melee": 0, "ranged": 0, "skillweapon": 0, "forceOwnAdditionalDamage": false}
        }"#,
        )
        .expect("测试夹具 JSON 应当合法");
        let settings = CharSettings::from_json(&raw);
        assert_eq!(settings.char_level, 80.0);
        assert_eq!(settings.base_name, "萨麦尔");
        assert_eq!(settings.enemy_resistance, -4.0);
        assert_eq!(settings.custom_variables.len(), 1);
        assert_eq!(settings.char_slots()[0], Some((51463, 10.0)));
        // 槽位数组固定长度，`null` 补空槽
        assert_eq!(settings.char_slots().len(), 8);
        assert_eq!(settings.char_slots()[1], None);
        assert_eq!(settings.skill_slots().len(), 4);
        assert_eq!(settings.skill_slots()[0], Some((54003, 10.0)));
        assert_eq!(settings.buffs[1], ("菲娜Q".to_string(), 12.0, Some(0.6)));
        assert_eq!(settings.custom_buff, vec![("近战触发".to_string(), 2.32)]);
        assert_eq!(settings.traits[0], Some((1025, 3.0)));
        assert_eq!(settings.team1, Some(1801));
        // 字符串 id 视为未配置
        assert_eq!(settings.team2, None);
        assert_eq!(settings.mod_effect_level(43342), Some(6.0));
        assert_eq!(settings.mod_effect_level(1), None);
    }

    #[test]
    fn missing_keys_keep_defaults() {
        let settings = CharSettings::from_json(&json!({}));
        assert_eq!(settings.char_level, 80.0);
        assert_eq!(settings.resonance_gain, 3.0);
        assert_eq!(settings.enemy_id, 130);
        assert_eq!(settings.char_skill_level, [10.0, 10.0, 10.0]);
        assert_eq!(settings.aura_mod, 31524);
        assert_eq!(settings.char_slots().len(), 8);
        assert!(settings.buffs.is_empty());
    }

    #[test]
    fn wrong_types_fall_back_to_defaults() {
        let settings = CharSettings::from_json(&json!({
            "charLevel": "80", "resonanceGain": null, "buffs": "nope", "charMods": 5
        }));
        assert_eq!(settings.char_level, 80.0);
        assert_eq!(settings.resonance_gain, 3.0);
        assert!(settings.buffs.is_empty());
        assert_eq!(settings.char_slots().len(), 8);
    }

    #[test]
    fn variant_falls_back_to_config_a() {
        let mut settings = CharSettings {
            char_mods: vec![Some((1, 10.0)); 8],
            mod_variant_index: 2,
            ..Default::default()
        };
        // 没有 B/C 变体时回落 A
        assert_eq!(settings.char_slots()[0], Some((1, 10.0)));
        settings.mod_variants.push(ModVariant {
            char_mods: vec![Some((2, 5.0)); 8],
            ..Default::default()
        });
        settings.mod_variants.push(ModVariant::default());
        // 变体 B 有效
        settings.mod_variant_index = 1;
        assert_eq!(settings.char_slots()[0], Some((2, 5.0)));
        // 变体 C 的空数组回落 A
        settings.mod_variant_index = 2;
        assert_eq!(settings.char_slots()[0], Some((1, 10.0)));
    }

    #[test]
    fn variant_aura_falls_back_to_config_a() {
        let mut settings = CharSettings {
            aura_mod: 51765,
            mod_variant_index: 1,
            ..Default::default()
        };
        // 变体未设置中枢 → 沿用配置 A
        settings.mod_variants.push(ModVariant::default());
        assert_eq!(settings.variant_aura(), 51765);
        // 变体设置了中枢 → 用它
        settings.mod_variants[0].aura = Some(12345);
        assert_eq!(settings.variant_aura(), 12345);
    }

    #[test]
    fn skill_levels_normalize_number_and_array() {
        // 老格式单个数字 → 三项相同
        assert_eq!(normalize_skill_levels(&json!(12)), [12.0, 12.0, 12.0]);
        assert_eq!(normalize_skill_levels(&json!(10)), [10.0, 10.0, 10.0]);
        // 数组缺项用首项补齐
        assert_eq!(normalize_skill_levels(&json!([12])), [12.0, 12.0, 12.0]);
        assert_eq!(normalize_skill_levels(&json!([12, 10])), [12.0, 10.0, 12.0]);
        // 钳制到 1-12 并取整
        assert_eq!(
            normalize_skill_levels(&json!([0, 13.6, 5.4])),
            [1.0, 12.0, 5.0]
        );
        // 非法值回落（首项非法 → 默认值，其余 → 首项）
        assert_eq!(normalize_skill_levels(&json!(null)), [10.0, 10.0, 10.0]);
        assert_eq!(
            normalize_skill_levels(&json!([12, "x", null])),
            [12.0, 12.0, 12.0]
        );
        // JSON 解析入口同样归一化
        let settings = CharSettings::from_json(&json!({"charSkillLevel": [12, 10]}));
        assert_eq!(settings.char_skill_level, [12.0, 10.0, 12.0]);
        let settings = CharSettings::from_json(&json!({"charSkillLevel": 9}));
        assert_eq!(settings.char_skill_level, [9.0, 9.0, 9.0]);
    }

    #[test]
    fn skill_level_resolves_by_index() {
        let levels = [12.0, 10.0, 8.0];
        assert_eq!(resolve_skill_level(&levels, -1), 12.0);
        assert_eq!(resolve_skill_level(&levels, 0), 12.0);
        assert_eq!(resolve_skill_level(&levels, 1), 10.0);
        assert_eq!(resolve_skill_level(&levels, 2), 8.0);
        // 越界（第二被动 / 协战）沿用被动等级
        assert_eq!(resolve_skill_level(&levels, 5), 8.0);
    }

    #[test]
    fn hp_percent_is_clamped() {
        let settings = CharSettings::from_json(&json!({"hpPercent": 1.7}));
        assert_eq!(settings.hp_percent, 1.0);
        let settings = CharSettings::from_json(&json!({"hpPercent": -0.5}));
        assert_eq!(settings.hp_percent, 0.0);
    }
}
