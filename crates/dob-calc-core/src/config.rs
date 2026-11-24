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

use std::collections::BTreeMap;

use serde_json::Value;

use super::models::AttrMap;
use super::record::Record;

/// MOD 槽位：`[魔之楔 id, 等级]`；`None` 表示空槽。
pub type ModSlot = Option<(i64, f64)>;

/// 潜质槽位：`[基础潜质 id, 等级]`；`None` 表示空槽。
pub type TraitSlot = Option<(i64, f64)>;
/// 一份 MOD 变体（配置 A/B/C 中的 B/C）。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ModVariant {
    /// 中枢魔之楔（光环）id；`None` / 0 表示沿用配置 A。
    pub aura: Option<i64>,
    pub char_mods: Vec<ModSlot>,
    pub melee_mods: Vec<ModSlot>,
    pub ranged_mods: Vec<ModSlot>,
    pub skill_mods: Vec<ModSlot>,
}

/// DOT 频率设置。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct DotSettings {
    pub skill: f64,
    pub melee: f64,
    pub ranged: f64,
    pub skillweapon: f64,
    pub force_own_additional_damage: bool,
}

/// 协战位完整 loadout；与 TS `AssistCharSettings` 逐字段对齐（驼峰 JSON）。
///
/// **纯 JSON 原始解析**：本结构拿不到 `BuildTables`，因此 TS `normalizeAssistSideSettings`
/// 中依赖角色表的两项归一化——`baseName` 回退首个技能、`enabled` 的角色存在性——由
/// peer 构建期统一完成（U89d2：`BuildContext::build_peer_attributes` / `peer_base_name`）。
/// 本层只保证类型 / 数值钳制与交换格式一致。
///
/// 角色 id / 武器 id 不在本结构内：`team1` / `team1Weapon`（或 2）仍是唯一真源。
#[derive(Debug, Clone, PartialEq)]
pub struct AssistSettings {
    /// 角色等级 1-80。
    pub char_level: f64,
    /// 技能等级 `[E, Q, 被动]`。
    pub char_skill_level: [f64; 3],
    /// 计算技能（`baseName`）；这里只做 trim，技能表回退在 peer 构建期。
    pub base_name: String,
    /// 额外精通武器类型（空字符串表示未解锁）。
    pub extra_mastery: String,
    /// 单武器槽（`teamNWeapon`）的等级 1-80。
    pub weapon_level: f64,
    /// 单武器槽的精炼等级 0-5。
    pub weapon_refine: f64,
    pub target_function: String,
    pub custom_variables: Vec<(String, String)>,
    pub dot_settings: DotSettings,
    /// 是否参与合计；缺失时按 `teamN` 是否为非零数字推断（角色存在性由 peer 构建校验）。
    pub enabled: bool,
    pub aura_mod: i64,
    pub char_mods: Vec<ModSlot>,
    pub melee_mods: Vec<ModSlot>,
    pub ranged_mods: Vec<ModSlot>,
    pub skill_mods: Vec<ModSlot>,
    pub mod_variant_index: usize,
    pub mod_variants: Vec<ModVariant>,
    pub buffs: Vec<(String, f64, Option<f64>)>,
    pub custom_buff: Vec<(String, f64)>,
    pub use_global: bool,
    pub effect_config: Vec<(String, f64)>,
}

impl Default for AssistSettings {
    /// 与上游 `createDefaultAssistSideSettings()` 一致。
    fn default() -> Self {
        Self {
            char_level: 80.0,
            char_skill_level: [CHAR_SKILL_LEVEL_DEFAULT; 3],
            base_name: String::new(),
            extra_mastery: String::new(),
            weapon_level: 80.0,
            weapon_refine: 5.0,
            target_function: String::new(),
            custom_variables: Vec::new(),
            dot_settings: DotSettings::default(),
            enabled: true,
            aura_mod: 0,
            char_mods: vec![None; 8],
            melee_mods: vec![None; 8],
            ranged_mods: vec![None; 8],
            skill_mods: vec![None; 4],
            mod_variant_index: 0,
            mod_variants: Vec::new(),
            buffs: Vec::new(),
            custom_buff: Vec::new(),
            use_global: false,
            effect_config: Vec::new(),
        }
    }
}

impl AssistSettings {
    /// 解析 `assist1` / `assist2`；缺失或非对象返回 `None`（未配置协战 loadout）。
    ///
    /// 纯原始解析：`team` 只用于推断缺失的启用位（`Some(id > 0)`）；角色是否存在、
    /// `baseName` 是否属于该角色技能表由 peer 构建期校验（U89d2）。
    pub fn from_json(value: Option<&Value>, team: Option<i64>) -> Option<Self> {
        let object = value?.as_object()?;
        let mut settings = Self::default();

        settings.char_level = clamp_integer(object.get("charLevel"), 1.0, 80.0, settings.char_level);
        settings.char_skill_level =
            normalize_skill_levels(object.get("charSkillLevel").unwrap_or(&Value::Null));
        settings.base_name = object
            .get("baseName")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        settings.extra_mastery = object
            .get("extraMastery")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        settings.weapon_level =
            clamp_integer(object.get("weaponLevel"), 1.0, 80.0, settings.weapon_level);
        settings.weapon_refine =
            clamp_integer(object.get("weaponRefine"), 0.0, 5.0, settings.weapon_refine);
        settings.target_function = object
            .get("targetFunction")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        settings.enabled = object
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or_else(|| team.is_some_and(|id| id > 0));
        settings.use_global = object
            .get("useGlobal")
            .and_then(Value::as_bool)
            .unwrap_or(settings.use_global);

        // 自定义变量：`[[名称, 表达式], …]`，只保留两个元素都是字符串的条目
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

        settings.dot_settings = parse_assist_dot_settings(
            object.get("dotSettings"),
            &settings.dot_settings,
        );

        // 中枢只接受非负 id（`0` 表示未设置）
        settings.aura_mod = object
            .get("auraMod")
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite() && *value >= 0.0)
            .map(|value| value.round() as i64)
            .unwrap_or(0);

        // MOD 槽位固定长度，缺失 / 非法条目补空槽（协战按 TS 口径接受分数并取整）
        settings.char_mods = parse_assist_slots(object.get("charMods"), 8);
        settings.melee_mods = parse_assist_slots(object.get("meleeMods"), 8);
        settings.ranged_mods = parse_assist_slots(object.get("rangedMods"), 8);
        settings.skill_mods = parse_assist_slots(object.get("skillWeaponMods"), 4);

        // MOD 变体：上游只保留 B/C 两份，非法条目补空变体
        settings.mod_variants = parse_assist_mod_variants(object.get("modVariants"));
        settings.mod_variant_index = clamp_integer(
            object.get("modVariantIndex"),
            0.0,
            settings.mod_variants.len() as f64,
            0.0,
        ) as usize;

        // BUFF：覆盖率 >= 1 时按上游口径省略第三项
        if let Some(items) = object.get("buffs").and_then(Value::as_array) {
            settings.buffs = items
                .iter()
                .filter_map(|item| {
                    let tuple = item.as_array()?;
                    let name = tuple.first()?.as_str()?.to_string();
                    let level = tuple.get(1)?.as_f64()?;
                    let coverage = tuple
                        .get(2)
                        .and_then(Value::as_f64)
                        .filter(|value| value.is_finite() && *value < 1.0)
                        .map(round_buff_value);
                    Some((name, level, coverage))
                })
                .collect();
        }

        if let Some(items) = object.get("customBuff").and_then(Value::as_array) {
            settings.custom_buff = items
                .iter()
                .filter_map(|item| {
                    let tuple = item.as_array()?;
                    let property = tuple.first()?.as_str()?.to_string();
                    let value = round_buff_value(tuple.get(1)?.as_f64()?);
                    Some((property, value))
                })
                .collect();
        }

        if let Some(map) = object.get("effectConfig").and_then(Value::as_object) {
            settings.effect_config = map
                .iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect();
        }

        Some(settings)
    }

    /// 序列化回 TS `AssistCharSettings` 交换格式（键名与 `from_json` 一一对应）。
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
        serde_json::json!({
            "charLevel": self.char_level,
            "charSkillLevel": [self.char_skill_level[0], self.char_skill_level[1], self.char_skill_level[2]],
            "baseName": self.base_name,
            "extraMastery": self.extra_mastery,
            "weaponLevel": self.weapon_level,
            "weaponRefine": self.weapon_refine,
            "targetFunction": self.target_function,
            "customVariables": self.custom_variables.iter().map(|(name, expr)| serde_json::json!([name, expr])).collect::<Vec<_>>(),
            "dotSettings": {
                "skill": self.dot_settings.skill,
                "melee": self.dot_settings.melee,
                "ranged": self.dot_settings.ranged,
                "skillweapon": self.dot_settings.skillweapon,
                "forceOwnAdditionalDamage": self.dot_settings.force_own_additional_damage,
            },
            "enabled": self.enabled,
            "auraMod": self.aura_mod,
            "charMods": slots(&self.char_mods),
            "meleeMods": slots(&self.melee_mods),
            "rangedMods": slots(&self.ranged_mods),
            "skillWeaponMods": slots(&self.skill_mods),
            "modVariantIndex": self.mod_variant_index,
            "modVariants": self.mod_variants.iter().map(|variant| serde_json::json!({
                "中枢": variant.aura.unwrap_or(0),
                "角色": slots(&variant.char_mods),
                "近战": slots(&variant.melee_mods),
                "远程": slots(&variant.ranged_mods),
                "同律": slots(&variant.skill_mods),
            })).collect::<Vec<_>>(),
            "buffs": self.buffs.iter().map(|(name, level, coverage)| match coverage {
                Some(coverage) => serde_json::json!([name, level, coverage]),
                None => serde_json::json!([name, level]),
            }).collect::<Vec<_>>(),
            "customBuff": self.custom_buff.iter().map(|(property, value)| serde_json::json!([property, value])).collect::<Vec<_>>(),
            "useGlobal": self.use_global,
            "effectConfig": self.effect_config.iter().cloned().collect::<std::collections::BTreeMap<_, _>>(),
        })
    }
}

/// 升华合成 BUFF 载荷：原始记录 + 等级 / 覆盖率（TS `new LeveledBuff(data, 1)` 的入参）。
#[derive(Debug, Clone, PartialEq)]
pub struct TranscendBuff {
    pub data: Record,
    pub level: f64,
    pub coverage: Option<f64>,
}

impl TranscendBuff {
    /// 解析 `{data, level, coverage?}`；`data` 非对象时视为无效条目。
    pub fn from_json(value: &Value) -> Option<Self> {
        let object = value.as_object()?;
        let data = object.get("data")?.as_object()?;
        Some(Self {
            data: Record::from_map(data.clone()),
            level: object.get("level").and_then(Value::as_f64).unwrap_or(1.0),
            coverage: object
                .get("coverage")
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite()),
        })
    }
}

/// 升华技能替换载荷：字段语义对齐 TS `TranscendSkillReplacement`。
///
/// `保留源字段` 只参与 TS 载荷合并（合并后不含字段改写），应用侧不读取。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TranscendSkillReplacement {
    pub id: Option<i64>,
    pub name: Option<String>,
    pub kind: Option<String>,
    pub description: Option<String>,
    /// `字段`：整表替换；`None` 时按 `字段改写` / `移除字段` 处理源字段。
    pub fields: Option<Vec<Value>>,
    /// `字段改写`：按字段名覆盖；源技能不存在的名字带 `值` 时按新增字段处理。
    pub field_edits: Vec<(String, serde_json::Map<String, Value>)>,
    /// `移除字段`：按字段名移除。
    pub removed_fields: Vec<String>,
}

impl TranscendSkillReplacement {
    /// 解析替换载荷；非对象返回 `None`。
    pub fn from_json(value: &Value) -> Option<Self> {
        let object = value.as_object()?;
        let text = |key: &str| object.get(key).and_then(Value::as_str).map(str::to_string);
        Some(Self {
            id: object.get("id").and_then(json_id),
            name: text("名称"),
            kind: text("类型"),
            description: text("描述"),
            fields: object.get("字段").and_then(Value::as_array).cloned(),
            field_edits: object
                .get("字段改写")
                .and_then(Value::as_object)
                .map(|map| {
                    map.iter()
                        .filter_map(|(key, value)| Some((key.clone(), value.as_object()?.clone())))
                        .collect()
                })
                .unwrap_or_default(),
            removed_fields: object
                .get("移除字段")
                .and_then(Value::as_array)
                .map(|items| items.iter().filter_map(Value::as_str).map(str::to_string).collect())
                .unwrap_or_default(),
        })
    }

    /// 指纹用的规范化 JSON（键集固定，不依赖载荷原始字段顺序）。
    pub fn to_canonical_value(&self) -> Value {
        let edits: serde_json::Map<String, Value> = self
            .field_edits
            .iter()
            .map(|(key, patch)| (key.clone(), Value::Object(patch.clone())))
            .collect();
        serde_json::json!({
            "id": self.id,
            "名称": self.name,
            "类型": self.kind,
            "描述": self.description,
            "字段": self.fields,
            "字段改写": edits,
            "移除字段": self.removed_fields,
        })
    }
}

/// 旧版 `skillLevelBonus` 兼容转换出的合成 BUFF 名（新载荷不再携带该字段）。
pub const LEGACY_SKILL_LEVEL_BUFF_NAME: &str = "旧载荷技能等级加成";

/// 单个构筑位的升华效果集（主控 = 天赋 + 装备；协战 = 本组装备）。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TranscendEffectSet {
    pub buffs: Vec<TranscendBuff>,
    /// 技能替换（源技能 id → 载荷）；`BTreeMap` 保证遍历顺序确定，指纹稳定。
    pub skill_replacements: BTreeMap<i64, TranscendSkillReplacement>,
}

impl TranscendEffectSet {
    /// 解析效果集；缺省字段按空处理。
    ///
    /// 旧载荷的 `skillLevelBonus` 在解析期转为一条带 `E/Q/P技能等级` attr 的合成 BUFF
    /// 进入标准属性管线（U126b 删除专用通道），不静默丢弃；全零视同未携带。
    pub fn from_json(value: Option<&Value>) -> Self {
        let Some(object) = value.and_then(Value::as_object) else {
            return Self::default();
        };
        let mut buffs: Vec<TranscendBuff> = object
            .get("buffs")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(TranscendBuff::from_json).collect())
            .unwrap_or_default();
        // 双计防御：新载荷已带三键 BUFF 时忽略旧字段（过渡版本手工混包不应叠加两次）
        if !buffs.iter().any(buff_has_skill_level_attr)
            && let Some(legacy) = legacy_skill_level_buff(object.get("skillLevelBonus"))
        {
            buffs.push(legacy);
        }
        let skill_replacements = object
            .get("skillReplacements")
            .and_then(Value::as_object)
            .map(|map| {
                map.iter()
                    .filter_map(|(key, value)| {
                        Some((key.parse::<i64>().ok()?, TranscendSkillReplacement::from_json(value)?))
                    })
                    .collect()
            })
            .unwrap_or_default();
        Self {
            buffs,
            skill_replacements,
        }
    }

    /// 是否为空效果（关闭 / 空配置时指纹必须与未携带载荷一致）。
    pub fn is_empty(&self) -> bool {
        self.buffs.is_empty() && self.skill_replacements.is_empty()
    }
}

/// 载荷 BUFF 是否已携带 `E/Q/P技能等级` 任一键（含字符串表达式键）。
fn buff_has_skill_level_attr(buff: &TranscendBuff) -> bool {
    let Some(attr) = buff.data.obj_ref("attr") else {
        return false;
    };
    ["E技能等级", "Q技能等级", "P技能等级"]
        .iter()
        .any(|key| attr.value(key).is_some())
}

/// 旧载荷 `skillLevelBonus` → 三键合成 BUFF；全零 / 非法 / 未携带时返回 `None`。
fn legacy_skill_level_buff(value: Option<&Value>) -> Option<TranscendBuff> {
    let items = value?.as_array()?;
    let mut attr = serde_json::Map::new();
    for (slot, key) in ["E技能等级", "Q技能等级", "P技能等级"].iter().enumerate() {
        let Some(number) = items.get(slot).and_then(Value::as_f64) else {
            continue;
        };
        if number.is_finite() && number != 0.0 {
            attr.insert((*key).to_string(), serde_json::json!(number));
        }
    }
    if attr.is_empty() {
        return None;
    }
    let mut data = serde_json::Map::new();
    data.insert(
        "名称".to_string(),
        Value::String(LEGACY_SKILL_LEVEL_BUFF_NAME.to_string()),
    );
    data.insert("描述".to_string(), Value::String(String::new()));
    data.insert("attr".to_string(), Value::Object(attr));
    Some(TranscendBuff {
        data: Record::from_map(data),
        level: 1.0,
        coverage: None,
    })
}

/// 与构筑位对应的升华载荷集合；请求始终带 `main`，协战侧可选。
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TranscendPayload {
    pub main: TranscendEffectSet,
    pub assist1: Option<TranscendEffectSet>,
    pub assist2: Option<TranscendEffectSet>,
}

impl TranscendPayload {
    /// 解析 `{main, assist1?, assist2?}`；非对象返回 `None`。
    pub fn from_json(value: &Value) -> Option<Self> {
        let object = value.as_object()?;
        Some(Self {
            main: TranscendEffectSet::from_json(object.get("main")),
            assist1: object
                .get("assist1")
                .and_then(Value::as_object)
                .map(|_| TranscendEffectSet::from_json(object.get("assist1"))),
            assist2: object
                .get("assist2")
                .and_then(Value::as_object)
                .map(|_| TranscendEffectSet::from_json(object.get("assist2"))),
        })
    }

    /// 当前构筑位对应的效果集；协战侧未携带时返回 `None`。
    pub fn for_side(&self, side: TranscendSide) -> Option<&TranscendEffectSet> {
        match side {
            TranscendSide::Main => Some(&self.main),
            TranscendSide::Assist1 => self.assist1.as_ref(),
            TranscendSide::Assist2 => self.assist2.as_ref(),
        }
    }
}

/// 请求所处的构筑位（`peer_settings` 会把它切到协战侧）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum TranscendSide {
    #[default]
    Main,
    Assist1,
    Assist2,
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
    /// 协战一完整 loadout（`assist1`）；`None` 表示存档未携带。
    pub assist1: Option<AssistSettings>,
    /// 协战二完整 loadout（`assist2`）。
    pub assist2: Option<AssistSettings>,
    pub timeline_dps: bool,
    pub use_global: bool,
    /// 特效等级配置（`m:<id>` / `w:<id>` → 等级）。
    pub effect_config: Vec<(String, f64)>,
    pub dot_settings: DotSettings,
    /// 升华效果载荷（仅 wasm 请求携带；不写入 `to_json_value`，避免自动配装回填时重复叠加）。
    pub transcend_effects: Option<TranscendPayload>,
    /// 当前构筑位：主控请求恒 `Main`，`peer_settings` 切到协战侧。
    pub transcend_side: TranscendSide,
    /// 原始 `transcend` 配置（Rust 不解析语义，只在 `to_json_value` 原样回填）：
    /// 自动配装结果要带回用户的天赋 / 装备配置，否则前端预览会丢升华效果。
    pub transcend_raw: Option<Value>,
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
            assist1: None,
            assist2: None,
            timeline_dps: false,
            use_global: false,
            effect_config: Vec::new(),
            dot_settings: DotSettings::default(),
            transcend_effects: None,
            transcend_side: TranscendSide::Main,
            transcend_raw: None,
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
        settings.assist1 = AssistSettings::from_json(object.get("assist1"), settings.team1);
        settings.assist2 = AssistSettings::from_json(object.get("assist2"), settings.team2);

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

        // 升华载荷：仅请求期字段，缺省 = 未携带（空效果）/ 主控侧
        settings.transcend_side = match object.get("transcendSide").and_then(Value::as_str) {
            Some("assist1") => TranscendSide::Assist1,
            Some("assist2") => TranscendSide::Assist2,
            _ => TranscendSide::Main,
        };
        settings.transcend_effects = object
            .get("transcendEffects")
            .and_then(TranscendPayload::from_json);
        // 原样保留 `transcend`：Rust 不解析其语义，仅用于自动配装结果回填
        settings.transcend_raw = object.get("transcend").cloned();
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
        let mut value = serde_json::json!({
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
                "中枢": variant.aura.unwrap_or(0),
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
        });
        // 协战 loadout 单独插入：两个大对象会让 `json!` 触发递归上限。
        let object = value.as_object_mut().expect("JSON 对象字面量");
        object.insert(
            "assist1".to_string(),
            self.assist1
                .as_ref()
                .map(AssistSettings::to_json_value)
                .unwrap_or(Value::Null),
        );
        object.insert(
            "assist2".to_string(),
            self.assist2
                .as_ref()
                .map(AssistSettings::to_json_value)
                .unwrap_or(Value::Null),
        );
        // 升华配置原样回填（未携带时不写键，保持旧输出形状）；请求载荷 / 侧别一律不写
        if let Some(transcend) = &self.transcend_raw {
            object.insert("transcend".to_string(), transcend.clone());
        }
        value
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
        self.active_slots(slot)
    }

    /// 取指定槽位类型在激活变体下的数组（`slots_of` 的公开别名，供收益/配装复用）。
    ///
    /// 上游 `getModVariantSlots` 口径：变体存在即命中，哪怕其向量为空（自动配装清空待填的中间态）；
    /// 仅变体越界（序号超出已有变体数）时回落到配置 A。
    pub fn active_slots(&self, slot: usize) -> &Vec<ModSlot> {
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
        match slot {
            0 => &variant.char_mods,
            1 => &variant.melee_mods,
            2 => &variant.ranged_mods,
            _ => &variant.skill_mods,
        }
    }

    /// 取指定槽位类型在激活变体下的可变数组；仅变体越界时回落到配置 A。
    ///
    /// 上游 `getModVariantSlots` 口径：变体存在即命中，空向量是自动配装清空待填的中间态，
    /// 仍归属该 B/C 变体，不得回落配置 A（否则清空后读写会污染配置 A）。
    ///
    /// 与 `active_slots` 同口径：收益试算与自动配装的写操作必须落到读口径命中的那份数组，
    /// 否则变体 B/C 下的追加/移除/替换会改到配置 A，导致收益恒为 0。
    pub fn active_slots_mut(&mut self, slot: usize) -> &mut Vec<ModSlot> {
        let index = self.mod_variant_index;
        if index == 0 {
            return self.legacy_slots_mut(slot);
        }
        if self.mod_variants.get(index - 1).is_none() {
            return self.legacy_slots_mut(slot);
        }
        // 上方已确认变体存在，此处下标必合法。
        let variant = &mut self.mod_variants[index - 1];
        match slot {
            0 => &mut variant.char_mods,
            1 => &mut variant.melee_mods,
            2 => &mut variant.ranged_mods,
            _ => &mut variant.skill_mods,
        }
    }

    /// 配置 A 的可变槽位（变体回落目标）。
    fn legacy_slots_mut(&mut self, slot: usize) -> &mut Vec<ModSlot> {
        match slot {
            0 => &mut self.char_mods,
            1 => &mut self.melee_mods,
            2 => &mut self.ranged_mods,
            _ => &mut self.skill_mods,
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

/// 协战 MOD 槽解析：按 TS `normalizeModSlots` 口径接受有限数并取整 id / 等级。
///
/// 顶层 `parse_slots` 的 id 走共享 `json_id`（有限浮点按 `Math.round`，字符串不接受），
/// 等级保持原样；协战这里再对等级取整，保证分数 id / 等级都不再整槽丢弃。
fn parse_assist_slots(value: Option<&Value>, len: usize) -> Vec<ModSlot> {
    let mut slots = vec![None; len];
    let Some(items) = value.and_then(Value::as_array) else {
        return slots;
    };
    let round = |value: Option<&Value>| {
        value
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite() && value.abs() < 9.007_199_254_740_992e15)
            .map(f64::round)
    };
    for (index, item) in items.iter().enumerate() {
        if index >= len {
            break;
        }
        let Some(tuple) = item.as_array() else {
            continue;
        };
        let id = round(tuple.first());
        let level = round(tuple.get(1));
        if let (Some(id), Some(level)) = (id, level) {
            slots[index] = Some((id as i64, level));
        }
    }
    slots
}

/// 取整并钳制到区间；非有限数（含缺失）回退 `fallback`。
fn clamp_integer(value: Option<&Value>, min: f64, max: f64, fallback: f64) -> f64 {
    let Some(number) = value.and_then(Value::as_f64) else {
        return fallback;
    };
    if !number.is_finite() {
        return fallback;
    }
    number.round().clamp(min, max)
}

/// 浮点尾差归一化（保留 6 位）；对应上游 `roundBuffValue`。
fn round_buff_value(value: f64) -> f64 {
    let factor = 1_000_000.0;
    (value * factor).round() / factor
}

/// 协战 DOT 频率：负值归零，缺失键沿用默认值。
fn parse_assist_dot_settings(value: Option<&Value>, defaults: &DotSettings) -> DotSettings {
    let Some(map) = value.and_then(Value::as_object) else {
        return defaults.clone();
    };
    let frequency = |key: &str, fallback: f64| {
        map.get(key)
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite())
            .map(|value| value.max(0.0))
            .unwrap_or(fallback)
    };
    DotSettings {
        skill: frequency("skill", defaults.skill),
        melee: frequency("melee", defaults.melee),
        ranged: frequency("ranged", defaults.ranged),
        skillweapon: frequency("skillweapon", defaults.skillweapon),
        force_own_additional_damage: map
            .get("forceOwnAdditionalDamage")
            .and_then(Value::as_bool)
            .unwrap_or(defaults.force_own_additional_damage),
    }
}

/// 协战 MOD 变体：上游只保留 B/C 两份（`MOD_VARIANT_MAX_COUNT - 1`），非法条目补空变体。
///
/// 槽位与中枢都按 TS `normalizeModVariants` 取整（中枢保留 `> 0` 判定，序列化时写数字 0）。
fn parse_assist_mod_variants(value: Option<&Value>) -> Vec<ModVariant> {
    let Some(items) = value.and_then(Value::as_array) else {
        return Vec::new();
    };
    items
        .iter()
        .take(2)
        .map(|item| {
            let map = item.as_object();
            ModVariant {
                aura: map
                    .and_then(|map| map.get("中枢"))
                    .and_then(Value::as_f64)
                    .filter(|value| value.is_finite() && *value > 0.0)
                    .map(|value| value.round() as i64),
                char_mods: parse_assist_slots(map.and_then(|map| map.get("角色")), 8),
                melee_mods: parse_assist_slots(map.and_then(|map| map.get("近战")), 8),
                ranged_mods: parse_assist_slots(map.and_then(|map| map.get("远程")), 8),
                skill_mods: parse_assist_slots(map.and_then(|map| map.get("同律")), 4),
            }
        })
        .collect()
}

/// JSON 数值 → 整数 id；与 TS `Math.round` 口径一致（接受有限浮点并取整），字符串一律 `None`。
pub(crate) fn json_id(value: &Value) -> Option<i64> {
    let Value::Number(number) = value else {
        return None;
    };
    if let Some(integer) = number.as_i64() {
        return Some(integer);
    }
    if let Some(unsigned) = number.as_u64() {
        return i64::try_from(unsigned).ok();
    }
    let float = number.as_f64()?;
    if float.is_finite() && float.abs() < 9.007_199_254_740_992e15 {
        Some(float.round() as i64)
    } else {
        None
    }
}

/// 协战 id：JSON number（有限浮点按 `Math.round`）才算配置；字符串（含 `"-"` / 角色名）视为未配置。
fn optional_id(value: Option<&Value>) -> Option<i64> {
    value.and_then(json_id)
}

/// 技能等级下限；对应上游 `CHAR_SKILL_LEVEL_MIN`。
pub const CHAR_SKILL_LEVEL_MIN: f64 = 1.0;
/// 基础技能等级上限（游戏内升级 1–10）；对应上游 `CHAR_SKILL_LEVEL_BASE_MAX`。
pub const CHAR_SKILL_LEVEL_BASE_MAX: f64 = 10.0;
/// 有效技能等级上限；对应上游 `CHAR_SKILL_LEVEL_MAX`（源数据 `DataConst.MaxSkillLevel`）。
pub const CHAR_SKILL_LEVEL_MAX: f64 = 30.0;
/// 技能等级默认值（E/Q/被动均为 10 级）；对应上游 `CHAR_SKILL_LEVEL_DEFAULT`。
pub const CHAR_SKILL_LEVEL_DEFAULT: f64 = 10.0;

/// 基础等级钳制到 1-10 并取整；对应上游 `normalizeCharSkillLevels` 内的 `clamp`。
fn clamp_skill_level(value: f64, fallback: f64) -> f64 {
    if !value.is_finite() {
        return fallback;
    }
    value
        .round()
        .clamp(CHAR_SKILL_LEVEL_MIN, CHAR_SKILL_LEVEL_BASE_MAX)
}

/// 归一化基础技能等级为 `[E, Q, 被动]` 三元组；对应上游 `normalizeCharSkillLevels`。
///
/// 兼容老格式：单个数字视为三项相同；数组缺项用首项补齐，各项钳制到 1-10
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
    fn variant_falls_back_to_config_a_only_when_out_of_range() {
        let mut settings = CharSettings {
            char_mods: vec![Some((1, 10.0)); 8],
            mod_variant_index: 2,
            ..Default::default()
        };
        // 没有 B/C 变体（序号越界）时回落 A
        assert_eq!(settings.char_slots()[0], Some((1, 10.0)));
        settings.mod_variants.push(ModVariant {
            char_mods: vec![Some((2, 5.0)); 8],
            ..Default::default()
        });
        settings.mod_variants.push(ModVariant::default());
        // 变体 B 有效
        settings.mod_variant_index = 1;
        assert_eq!(settings.char_slots()[0], Some((2, 5.0)));
        // 变体 C 存在但槽位为空：仍属于 C，不回落 A
        settings.mod_variant_index = 2;
        assert!(settings.char_slots().is_empty());
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
    fn active_slots_mut_writes_to_active_variant() {
        let mut settings = CharSettings {
            char_mods: vec![Some((1, 10.0)); 8],
            mod_variant_index: 1,
            ..Default::default()
        };
        settings.mod_variants.push(ModVariant {
            char_mods: vec![Some((2, 5.0)); 8],
            ..Default::default()
        });
        // 读命中变体 B
        assert_eq!(settings.active_slots(0)[0], Some((2, 5.0)));
        // 写同样落到变体 B，配置 A 不受影响
        settings.active_slots_mut(0)[0] = Some((3, 7.0));
        assert_eq!(settings.mod_variants[0].char_mods[0], Some((3, 7.0)));
        assert_eq!(settings.char_mods[0], Some((1, 10.0)));
        // 空变体（存在但槽位为空）仍属于变体 B/C：读写都不回落到配置 A
        settings.mod_variant_index = 2;
        settings.mod_variants.push(ModVariant::default());
        assert!(settings.active_slots(0).is_empty());
        settings.active_slots_mut(0).push(Some((4, 1.0)));
        assert_eq!(settings.mod_variants[1].char_mods, vec![Some((4, 1.0))]);
        assert_eq!(settings.char_mods[0], Some((1, 10.0)));
        // 只有变体越界（序号超过已有变体数）才回落到配置 A
        settings.mod_variant_index = 9;
        assert_eq!(settings.active_slots(0)[0], Some((1, 10.0)));
        settings.active_slots_mut(0)[0] = Some((5, 2.0));
        assert_eq!(settings.char_mods[0], Some((5, 2.0)));
    }

    #[test]
    fn skill_levels_normalize_number_and_array() {
        // 老格式单个数字 → 三项相同；基础等级上限 10（旧档 12 = 10 基础 + 2 溯源）
        assert_eq!(normalize_skill_levels(&json!(12)), [10.0, 10.0, 10.0]);
        assert_eq!(normalize_skill_levels(&json!(10)), [10.0, 10.0, 10.0]);
        // 数组缺项用首项补齐
        assert_eq!(normalize_skill_levels(&json!([12])), [10.0, 10.0, 10.0]);
        assert_eq!(normalize_skill_levels(&json!([12, 10])), [10.0, 10.0, 10.0]);
        // 钳制到 1-10 并取整
        assert_eq!(
            normalize_skill_levels(&json!([0, 13.6, 5.4])),
            [1.0, 10.0, 5.0]
        );
        // 上限 10：31 / 29.4 截断到 10
        assert_eq!(
            normalize_skill_levels(&json!([0, 31, 29.4])),
            [1.0, 10.0, 10.0]
        );
        // 非法值回落（首项非法 → 默认值，其余 → 首项）
        assert_eq!(normalize_skill_levels(&json!(null)), [10.0, 10.0, 10.0]);
        assert_eq!(
            normalize_skill_levels(&json!([12, "x", null])),
            [10.0, 10.0, 10.0]
        );
        // JSON 解析入口同样归一化
        let settings = CharSettings::from_json(&json!({"charSkillLevel": [12, 10]}));
        assert_eq!(settings.char_skill_level, [10.0, 10.0, 10.0]);
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

    #[test]
    fn transcend_payload_missing_keeps_defaults() {
        let settings = CharSettings::from_json(&json!({}));
        assert!(settings.transcend_effects.is_none());
        assert_eq!(settings.transcend_side, TranscendSide::Main);
        // 脏数据：非对象 / 未知侧别都按缺省处理
        let settings = CharSettings::from_json(&json!({
            "transcendEffects": "nope",
            "transcendSide": "assist9"
        }));
        assert!(settings.transcend_effects.is_none());
        assert_eq!(settings.transcend_side, TranscendSide::Main);
    }

    #[test]
    fn transcend_payload_parses_sides_buffs_and_replacements() {
        let settings = CharSettings::from_json(&json!({
            "transcendSide": "assist2",
            "transcendEffects": {
                "main": {
                    "buffs": [
                        {"data": {"名称": "升华天赋·攻击", "attr": {"攻击": 0.3}}, "level": 1},
                        {"data": {"名称": "覆盖", "attr": {"攻击": 0.2}}, "level": 1, "coverage": 0.5}
                    ],
                    "skillLevelBonus": [1, 10, 0],
                    "skillReplacements": {
                        "310201": {"id": 310212, "名称": "高温清扫", "字段改写": {"伤害": {"值": 9.03552}}, "移除字段": ["范围"]}
                    }
                },
                "assist1": {"buffs": [{"data": {"名称": "协战一", "attr": {"技能威力": 0.1}}, "level": 1}]}
            }
        }));
        assert_eq!(settings.transcend_side, TranscendSide::Assist2);
        let payload = settings.transcend_effects.expect("载荷");
        // 旧字段 `skillLevelBonus` 转为三键合成 BUFF 追加在载荷 BUFF 之后
        assert_eq!(payload.main.buffs.len(), 3);
        assert_eq!(payload.main.buffs[1].coverage, Some(0.5));
        let legacy = &payload.main.buffs[2].data;
        assert_eq!(legacy.text("名称"), LEGACY_SKILL_LEVEL_BUFF_NAME);
        assert_eq!(
            legacy.obj("attr").num("E技能等级"),
            Some(1.0),
            "旧载荷 E 等级加成进入标准属性"
        );
        assert_eq!(legacy.obj("attr").num("Q技能等级"), Some(10.0));
        assert_eq!(legacy.obj("attr").num("P技能等级"), None, "零值不生成键");
        let replacement = &payload.main.skill_replacements[&310201];
        assert_eq!(replacement.id, Some(310212));
        assert_eq!(replacement.name.as_deref(), Some("高温清扫"));
        assert_eq!(replacement.removed_fields, vec!["范围".to_string()]);
        assert!(replacement.fields.is_none());
        assert_eq!(payload.assist1.as_ref().map(|set| set.buffs.len()), Some(1));
        // 未携带的协战二侧：for_side 返回 None（无效果）
        assert!(payload.for_side(TranscendSide::Assist2).is_none());
        // 效果集为空判定
        assert!(TranscendEffectSet::default().is_empty());
        assert!(!payload.main.is_empty());
        // 全零旧字段视同未携带（不产生合成 BUFF，指纹与空载荷一致）
        let zero = TranscendEffectSet::from_json(Some(&json!({"skillLevelBonus": [0, 0, 0]})));
        assert!(zero.is_empty());
        // 双计防御：载荷已带三键 BUFF 时忽略旧字段
        let mixed = TranscendEffectSet::from_json(Some(&json!({
            "buffs": [{"data": {"名称": "新载荷等级", "attr": {"Q技能等级": 10}}, "level": 1}],
            "skillLevelBonus": [1, 10, 0]
        })));
        assert_eq!(mixed.buffs.len(), 1, "三键 BUFF 已存在时不得再合成旧字段 BUFF");
    }

    #[test]
    fn transcend_payload_is_not_serialized() {
        let settings = CharSettings::from_json(&json!({
            "transcendSide": "assist1",
            "transcendEffects": {"main": {"skillLevelBonus": [1, 0, 0]}}
        }));
        let value = settings.to_json_value();
        assert!(value.get("transcendEffects").is_none());
        assert!(value.get("transcendSide").is_none());
    }
}
