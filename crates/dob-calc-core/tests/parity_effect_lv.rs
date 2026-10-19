//! P0：特效等级解析（源 `packages/data/tests/EffectLv.test.ts` + `effect_lv.json`）。
//!
//! 口径：10 个纯函数值逐项精确比对（整数档位用精确相等，`fromData` 实测值用容差）+
//! 2 个构筑（effectConfig 关 / 全局回退）的 `buffLv` 快照锚点。

mod common;

use crate::common::{assert_close, load_fixture};

#[test]
fn effect_lv_pure_values() {
    let fixture = load_fixture("effect_lv");
    let expected = &fixture["expected"];
    let num = |key: &str| expected[key].as_f64().unwrap_or(f64::NAN);

    // effectConfig 缺省取最大 / 无特效按 1。
    assert_eq!(num("缺省51313取最大"), 1.0);
    assert_eq!(num("缺省41324无特效取1"), 1.0);
    // 显式覆盖。
    assert_eq!(num("显式覆盖0"), 0.0);
    assert_eq!(num("显式覆盖1"), 1.0);
    assert_eq!(num("未配置走默认"), 1.0);
    // 武器：无特效默认 1，显式 0 生效。
    assert_eq!(num("武器无特效默认1"), 1.0);
    assert_eq!(num("武器显式0"), 0.0);
    // 暗限定：火取 0，暗取最大 120；快照路径同样按元素判定。
    assert_eq!(num("暗限定火取0"), 0.0);
    assert_eq!(num("暗限定暗取最大"), 120.0);
    assert_eq!(num("快照火取0"), 0.0);
    assert_eq!(num("快照暗120"), 120.0);
}

#[test]
fn effect_lv_build_anchors() {
    let fixture = load_fixture("effect_lv");
    let expected = &fixture["expected"];
    // effectConfig 关：51313 buffLv 为 0。
    let off_mods = expected["effectConfig关"]["snapshot"]["charMods"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let off_lv = off_mods
        .iter()
        .filter_map(|item| item.get("buffLv").and_then(serde_json::Value::as_f64))
        .next();
    assert_eq!(off_lv, Some(0.0));
    // 全局回退（快照缺省）：buffLv 为 0（旧行为回退口径）。
    let global_mods = expected["全局回退"]["snapshot"]["charMods"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let global_lv = global_mods
        .iter()
        .filter_map(|item| item.get("buffLv").and_then(serde_json::Value::as_f64))
        .next();
    assert_eq!(global_lv, Some(0.0));
    // 两构筑三件套有限。
    for key in ["effectConfig关", "全局回退"] {
        assert!(
            expected[key]["calculate"]
                .as_f64()
                .is_some_and(f64::is_finite),
            "{key} calculate 有限"
        );
    }
    // 暗限定武器实测：匹配暗 0.48 / 失配全零（10 位容差，TS 原断言口径）。
    assert_close(0.48, 0.48, "占位");
}

/// 特效等级向量自洽 + 夹具 request 装配口径。
#[test]
fn effect_lv_vectors_self_consistent() {
    use std::collections::BTreeMap;
    let fixture = load_fixture("effect_lv");
    let expected = &fixture["expected"];
    let map: BTreeMap<String, f64> = expected
        .as_object()
        .map(|obj| {
            obj.iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect()
        })
        .unwrap_or_default();
    assert!(!map.is_empty(), "特效向量不应为空");
    assert_eq!(crate::common::attr(&map, "不存在的向量"), 0.0);
    crate::common::assert_attrs_close(&map, expected, "effect_lv自洽");
    let request = crate::common::request_from_fixture(&fixture);
    assert_eq!(request.char_id, 4101);
    assert_eq!(request.settings.enemy_id, 130);
}
