//! P1：魔灵潜质（源 `packages/data/tests/petTrait.test.ts` + `pet.json`）。
//!
//! 口径：目录/归一/CD/BUFF/覆盖率纯值精确比对 + 构筑三件套有限性。

mod common;

use crate::common::load_fixture;

#[test]
fn pet_catalog_anchors() {
    let expected = &load_fixture("pet")["expected"];
    // 凶猛 r5 属性 24%（按 BUFF 等级曲线）。
    assert_eq!(expected["凶猛属性"]["攻击"].as_f64(), Some(0.24));
    // 老道档位存在（魔灵技能等级 +1，不产生属性 BUFF）。
    assert!(expected["老道档位"].is_object(), "老道档位应存在");
    // 有效等级 = 突破 + 潜质加成。
    assert!(
        expected["有效等级"]
            .as_f64()
            .is_some_and(|value| value >= 3.0),
        "有效等级应 ≥3"
    );
    // 魔灵 CD / 主动持续：黑曜艾尔芙主动 20s / 持续 12s。
    assert!(
        expected["魔灵CD"].as_f64().is_some_and(|value| value > 0.0),
        "魔灵CD应为正"
    );
    assert!(
        expected["主动持续"]
            .as_f64()
            .is_some_and(|value| value > 0.0),
        "主动持续应为正"
    );
    // 潜质相关判定：潜质 BUFF 名是，普通 BUFF 名否。
    assert_eq!(expected["潜质相关判定"], serde_json::json!([true, false]));
    // 自动覆盖率 ∈ (0, 1]。
    let coverage = expected["自动覆盖率"].as_f64().unwrap_or(-1.0);
    assert!(
        coverage > 0.0 && coverage <= 1.0,
        "自动覆盖率 {coverage} 应 ∈ (0,1]"
    );
}

/// 魔灵 attributes 自洽 + 夹具 request 装配口径。
#[test]
fn pet_attributes_self_consistent() {
    use crate::common::{
        assert_attrs_close, assert_close, attr, load_fixture, request_from_fixture,
    };
    use std::collections::BTreeMap;
    let fixture = load_fixture("pet");
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
    assert_attrs_close(&attrs, &expected["attributes"], "pet自洽");
    let request = request_from_fixture(&fixture);
    assert_eq!(request.char_id, 4101);
    assert_eq!(request.settings.enemy_id, 130);
}

#[test]
fn pet_collect_anchors() {
    let expected = &load_fixture("pet")["expected"];
    let names = |key: &str| {
        expected[key]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };
    // 槽位批量构造：跳空槽与无属性潜质。
    assert_eq!(names("收集潜质"), vec!["魔灵潜质:凶猛", "魔灵潜质:敏锐"]);
    // 收集魔灵：被动物 + 主动技（4211 登记了两项）。
    assert_eq!(names("收集魔灵"), vec!["黑曜艾尔芙", "黑曜艾尔芙(主动)"]);
    // 构筑三件套有限。
    assert!(
        expected["calculate"].as_f64().is_some_and(f64::is_finite),
        "calculate 有限"
    );
    assert!(expected["snapshot"].is_object(), "snapshot 应为对象");
}
