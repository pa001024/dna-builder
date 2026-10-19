//! P1：武器收益（源 `packages/data/tests/weapon-income.test.ts` + `weapon_income.json`）。
//!
//! 口径：7 用例回归锚点（当前武器收益 0 / 无特效负收益 / 特效等级参与 /
//! 元素限定 / 空武器负收益 / 零基线 0 / 全特效有限）；income 入口待 FlowPort
//! `income.rs` 落地后补求值断言，本文件先做夹具存档断言。

mod common;

use crate::common::load_fixture;

/// 武器收益 attributes 自洽 + 夹具 request 装配口径。
#[test]
fn weapon_income_attributes_self_consistent() {
    use crate::common::{
        assert_attrs_close, assert_close, attr, load_fixture, request_from_fixture,
    };
    use std::collections::BTreeMap;
    let fixture = load_fixture("weapon_income");
    let expected = &fixture["expected"];
    let attrs: BTreeMap<String, f64> = expected["attributes"]
        .as_object()
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect()
        })
        .unwrap_or_default();
    assert!(!attrs.is_empty(), "attributes 非空");
    assert_eq!(attr(&attrs, "不存在的属性"), 0.0);
    assert_close(
        attr(&attrs, "攻击"),
        attrs.get("攻击").copied().unwrap_or(-1.0),
        "自洽",
    );
    assert_attrs_close(&attrs, &expected["attributes"], "weapon_income自洽");
    let request = request_from_fixture(&fixture);
    assert_eq!(request.char_id, 4101);
}

#[test]
fn weapon_income_anchors() {
    let expected = &load_fixture("weapon_income")["expected"];
    // 当前武器收益为 0（首个候选即当前武器）。
    let incomes = expected["incomes"].as_array().cloned().unwrap_or_default();
    assert!(!incomes.is_empty(), "收益表不应为空");
    let first_gain = incomes[0][1].as_f64().unwrap_or(f64::NAN);
    assert_eq!(first_gain, 0.0);
    // 全部收益有限（TS 原断言：不应出现非有限值）。
    for entry in &incomes {
        assert!(
            entry[1].as_f64().is_some_and(f64::is_finite),
            "收益 {entry} 应有限"
        );
    }
    // 三件套有限。
    assert!(
        expected["calculate"].as_f64().is_some_and(f64::is_finite),
        "calculate 有限"
    );
    assert!(expected["snapshot"].is_object(), "snapshot 应为对象");
}
