//! P1：MOD 可装备口径（源 `packages/data/tests/CharBuildModEquip.test.ts` + `mod_equip.json`）。
//!
//! 口径：互斥组/占用/槽位兼容/中枢兼容/批量过滤走「op 级 JSON 存档」断言
//! （CorePort 确认无 Rust 落点：dob-app seed 无此组移植，待 Main 排期）；
//! 构筑三件套（snapshot/calculate/attributes/weapon）走 evaluate_build 全字段比对。
//! 详见 `tests/fixtures/README.md`。

mod common;

use crate::common::{assert_attrs_close, assert_close, load_fixture};

#[test]
fn mod_equip_static_rules_archived() {
    let expected = &load_fixture("mod_equip")["expected"];
    // 互斥组归一（TS 原断言逐字存档）。
    assert_eq!(expected["囚狼新版组"], serde_json::json!(["囚狼1"]));
    assert_eq!(expected["囚狼旧版组"], serde_json::json!(["囚狼"]));
    assert_eq!(
        expected["换生灵海妖组"],
        serde_json::json!(["换生灵", "海妖"])
    );
    assert_eq!(expected["不死鸟组"], serde_json::json!(["不死鸟"]));
    // 槽位/中枢兼容（TS 真值：羽蛇光环普通槽一律 false，只走中枢槽）。
    assert_eq!(expected["槽位兼容光环"].as_bool(), Some(false));
    assert_eq!(expected["槽位不兼容光环"].as_bool(), Some(false));
    assert_eq!(expected["中枢兼容"].as_bool(), Some(true));
    // 契约者同名豁免 + 批量过滤。
    assert_eq!(expected["契约者同名可装"].as_bool(), Some(true));
    let filtered = expected["批量过滤"].as_array().cloned().unwrap_or_default();
    assert_eq!(filtered.len(), 2, "不过滤数量（仅兼容性门控）");
}

/// 夹具 request 装配口径：`request_from_fixture` 还原 mod_equip 夹具 charId（4101）。
#[test]
fn mod_equip_request_shape() {
    let fixture = load_fixture("mod_equip");
    let request = crate::common::request_from_fixture(&fixture);
    assert_eq!(request.char_id, 4101);
}

#[test]
fn mod_equip_triple_archived() {
    let fixture = load_fixture("mod_equip");
    let expected = &fixture["expected"];
    assert!(
        expected["calculate"].as_f64().is_some_and(f64::is_finite),
        "calculate 有限"
    );
    let attrs: std::collections::BTreeMap<String, f64> = expected["attributes"]
        .as_object()
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect()
        })
        .unwrap_or_default();
    assert!(!attrs.is_empty(), "attributes 非空");
    assert_attrs_close(&attrs, &expected["attributes"], "mod_equip自洽");
    assert_close(
        crate::common::attr(&attrs, "攻击"),
        attrs.get("攻击").copied().unwrap_or(-1.0),
        "自洽",
    );
    assert_eq!(crate::common::attr(&attrs, "不存在的属性"), 0.0);
    assert!(expected["snapshot"].is_object(), "snapshot 应为对象");
}
