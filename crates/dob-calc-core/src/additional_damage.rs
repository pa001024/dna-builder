//! 追伤七分量：六元素 + 自属性（对齐 TS `packages/data/leveled/additionalDamage.ts`）。
//!
//! `追加伤害` 是**只读聚合**（Σ 七分量），仅供展示 / 表达式读取，不得作为属性输入；
//! 角色属性不持有追伤（仅 `技能追伤` 独立成技能池乘区），武器伤害池按
//! `max(0, 1 + Σ 面板七分量)` 整段结算（见 [`crate::damage`]），不吃弱点 / 元素增伤 / 转属；
//! DOT 元素种数由面板分量集合推导。
//! 旧数据 / 旧包 / 自定义输入的字面 `追加伤害` 在来源表构建处迁移为 `自属性追伤`；
//! `BonusDamage*` **不**走来源表（TS 只在升华词条解码 `transcend.ts` 处理），
//! 由 [`decode_transcend_key`] 单独解码。旧动态 code 的聚合写入按
//! [`AggregateWriteMode`] 在整段 code 执行前后统一迁移（见 [`crate::dynamic`]）。

use super::attrmap::AttrMap;

/// 六元素追伤分量键（顺序与元素增伤一致；聚合求和必须保持该顺序）。
pub const ELEMENT_KEYS: [&str; 6] = [
    "火属性追伤",
    "水属性追伤",
    "雷属性追伤",
    "风属性追伤",
    "光属性追伤",
    "暗属性追伤",
];

/// 自属性追伤：按角色自身元素结算，对任意元素角色的武器池生效。
pub const SELF_KEY: &str = "自属性追伤";

/// 七分量键（六元素 + 自属性）。
pub const KEYS: [&str; 7] = [
    "火属性追伤",
    "水属性追伤",
    "雷属性追伤",
    "风属性追伤",
    "光属性追伤",
    "暗属性追伤",
    "自属性追伤",
];

/// 旧聚合键：只读聚合，装载时迁移为 [`SELF_KEY`]。
pub const LEGACY_KEY: &str = "追加伤害";

/// 旧 code 对聚合字段的写入方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AggregateWriteMode {
    /// `*=` / `/=` 及展开写法：七分量同比例缩放。
    Scale,
    /// `+=` / `-=` 及展开写法：差值记入 `自属性追伤`。
    Add,
    /// 纯 `=`：覆盖为 `自属性追伤`，其余六分量清零。
    Assign,
}

/// 来源表 / AST 临时属性 / 自定义 BUFF 的旧键归一化；其余原样返回。
///
/// 与 TS `leveled/additionalDamage.ts#normalizeAdditionalDamageKey` 一致：
/// 这里**只**迁移字面 `追加伤害`；`BonusDamage*` 属升华词条解码，见
/// [`decode_transcend_key`]，不得在这些路径产生追伤语义。
pub fn normalize_source_key(key: &str) -> &str {
    if key == LEGACY_KEY { SELF_KEY } else { key }
}

/// 升华词条（`transcend.ts#mapTranscendAttr`）的旧追伤键解码。
///
/// 仅用于升华装备 / 旧词条解码，不用于来源表 / AST / 自定义 BUFF：
/// - `BonusDamage`（无元素信息）→ `自属性追伤`；
/// - `BonusDamage_<EnglishElement>` → `<元素>属性追伤`；
/// - 未知 / 非元素 `BonusDamage_<X>` → `自属性追伤`（不再空键丢弃）；
/// - 非 `BonusDamage*` 返回 `None`。
pub fn decode_transcend_key(key: &str) -> Option<&'static str> {
    if key == "BonusDamage" {
        return Some(SELF_KEY);
    }
    let suffix = key.strip_prefix("BonusDamage_")?;
    Some(match suffix {
        "Fire" => "火属性追伤",
        "Water" => "水属性追伤",
        "Thunder" => "雷属性追伤",
        "Wind" => "风属性追伤",
        "Light" => "光属性追伤",
        "Dark" => "暗属性追伤",
        _ => SELF_KEY,
    })
}

/// 求七分量之和（顺序固定，忽略缺失与非有限值；对齐 TS `sumAdditionalDamage`）。
pub fn sum(record: &AttrMap) -> f64 {
    let mut total = 0.0;
    for key in KEYS {
        if let Some(value) = record.get(key)
            && value.is_finite()
        {
            total += value;
        }
    }
    total
}

/// 把聚合值写成七分量之和（只读聚合语义）。
pub fn recompute(record: &mut AttrMap) {
    let total = sum(record);
    record.insert(LEGACY_KEY, total);
}

/// 按写入方式把一次聚合写入迁移到七分量。
///
/// `before` 为写入前的聚合值，`after` 为写入后的聚合值；`mode` 由调用方按 code 语法识别。
pub fn apply_write(
    record: &mut AttrMap,
    mode: AggregateWriteMode,
    before: f64,
    after: f64,
) {
    match mode {
        AggregateWriteMode::Scale => {
            let factor = if before != 0.0 { after / before } else { 1.0 };
            for key in KEYS {
                let value = record.get(key).copied().unwrap_or(0.0);
                record.insert(key, value * factor);
            }
        }
        AggregateWriteMode::Assign => {
            for key in ELEMENT_KEYS {
                record.insert(key, 0.0);
            }
            record.insert(SELF_KEY, after);
        }
        AggregateWriteMode::Add => {
            let self_value = record.get(SELF_KEY).copied().unwrap_or(0.0);
            record.insert(SELF_KEY, self_value + (after - before));
        }
    }
    recompute(record);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(entries: &[(&str, f64)]) -> AttrMap {
        entries.iter().copied().collect()
    }

    #[test]
    fn sum_uses_fixed_component_order() {
        let record = map(&[("火属性追伤", 0.1), ("自属性追伤", 0.2), ("暗属性追伤", 0.3)]);
        assert!((sum(&record) - 0.6).abs() < 1e-12);
    }

    #[test]
    fn source_normalization_only_moves_legacy_key() {
        assert_eq!(normalize_source_key("追加伤害"), SELF_KEY);
        // TS `normalizeAdditionalDamageKey` 只迁移字面 `追加伤害`；BonusDamage* 原样保留
        assert_eq!(normalize_source_key("BonusDamage"), "BonusDamage");
        assert_eq!(normalize_source_key("BonusDamage_Fire"), "BonusDamage_Fire");
        assert_eq!(normalize_source_key("BonusDamage_Foo"), "BonusDamage_Foo");
        assert_eq!(normalize_source_key("火属性追伤"), "火属性追伤");
        assert_eq!(normalize_source_key("技能追伤"), "技能追伤");
    }

    #[test]
    fn transcend_decode_handles_bonus_damage() {
        assert_eq!(decode_transcend_key("BonusDamage"), Some(SELF_KEY));
        assert_eq!(decode_transcend_key("BonusDamage_Fire"), Some("火属性追伤"));
        assert_eq!(decode_transcend_key("BonusDamage_Water"), Some("水属性追伤"));
        assert_eq!(decode_transcend_key("BonusDamage_Thunder"), Some("雷属性追伤"));
        assert_eq!(decode_transcend_key("BonusDamage_Wind"), Some("风属性追伤"));
        assert_eq!(decode_transcend_key("BonusDamage_Light"), Some("光属性追伤"));
        assert_eq!(decode_transcend_key("BonusDamage_Dark"), Some("暗属性追伤"));
        // 未知 / 非元素后缀统一落自属性，不再空键丢弃
        assert_eq!(decode_transcend_key("BonusDamage_Foo"), Some(SELF_KEY));
        assert_eq!(decode_transcend_key("BonusDamage_火"), Some(SELF_KEY));
        assert_eq!(decode_transcend_key("追加伤害"), None);
        assert_eq!(decode_transcend_key("技能追伤"), None);
    }

    #[test]
    fn sum_ignores_non_finite_components() {
        let mut record = map(&[
            ("火属性追伤", f64::NAN),
            ("水属性追伤", f64::INFINITY),
            ("雷属性追伤", 1.0),
            ("风属性追伤", f64::NEG_INFINITY),
            ("光属性追伤", 0.5),
            ("追加伤害", 99.0),
        ]);
        assert_eq!(sum(&record), 1.5);
        recompute(&mut record);
        assert_eq!(record.get(LEGACY_KEY), Some(&1.5));
    }

    #[test]
    fn scale_keeps_element_ratio() {
        let mut record = map(&[
            ("火属性追伤", 1.0),
            ("自属性追伤", 3.0),
            ("追加伤害", 4.0),
        ]);
        apply_write(&mut record, AggregateWriteMode::Scale, 4.0, 8.0);
        assert_eq!(record.get("火属性追伤"), Some(&2.0));
        assert_eq!(record.get(SELF_KEY), Some(&6.0));
        assert_eq!(record.get(LEGACY_KEY), Some(&8.0));
    }

    #[test]
    fn assign_zeroes_elements() {
        let mut record = map(&[
            ("火属性追伤", 1.0),
            ("自属性追伤", 3.0),
            ("追加伤害", 4.0),
        ]);
        apply_write(&mut record, AggregateWriteMode::Assign, 4.0, 1.0);
        assert_eq!(record.get("火属性追伤"), Some(&0.0));
        assert_eq!(record.get(SELF_KEY), Some(&1.0));
        assert_eq!(record.get(LEGACY_KEY), Some(&1.0));
    }

    #[test]
    fn add_lands_on_self_only() {
        let mut record = map(&[
            ("火属性追伤", 1.0),
            ("自属性追伤", 3.0),
            ("追加伤害", 4.0),
        ]);
        apply_write(&mut record, AggregateWriteMode::Add, 4.0, 4.5);
        assert_eq!(record.get("火属性追伤"), Some(&1.0));
        assert_eq!(record.get(SELF_KEY), Some(&3.5));
        assert_eq!(record.get(LEGACY_KEY), Some(&4.5));
    }
}
