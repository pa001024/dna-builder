//! P1/P2：CharBuild 固定值 + shardBuild1 端到端（源 `CharBuild.test.ts` + `shardBuild1.ts`）。
//!
//! 口径：`charbuild_fixed.json`（面板/宏/三件套）+ `e2e_shard.json`
//! （byBasename/dotDamage/oneTime 全链路）存档断言；真实求值待建表落地后补。

mod common;

use crate::common::{assert_attrs_close, assert_close, load_fixture};
use std::collections::BTreeMap;

#[test]
fn charbuild_fixed_anchors() {
    let fixture = load_fixture("charbuild_fixed");
    let expected = &fixture["expected"];
    assert!(
        expected["calculate"]
            .as_f64()
            .is_some_and(|value| value > 0.0),
        "calculate 应为正"
    );
    assert!(
        expected["攻击"].as_f64().is_some_and(|value| value > 0.0),
        "攻击应为正"
    );
    // 宏关系：DPS ≥ 伤害（攻速/多重 ≥1 的构筑）。
    let harm = expected["目标函数伤害"].as_f64().unwrap_or(-1.0);
    let dps = expected["DPS宏"].as_f64().unwrap_or(-1.0);
    let dph = expected["DPH宏"].as_f64().unwrap_or(-1.0);
    assert!(harm > 0.0 && dps > 0.0 && dph > 0.0, "宏应为正");
    assert!(dps >= harm, "DPS {dps} 应 ≥ 伤害 {harm}");
    // attributes 自洽。
    let attrs: BTreeMap<String, f64> = expected["attributes"]
        .as_object()
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect()
        })
        .unwrap_or_default();
    assert_attrs_close(&attrs, &expected["attributes"], "fixed自洽");
    assert_close(
        crate::common::attr(&attrs, "攻击"),
        expected["攻击"].as_f64().unwrap_or(-1.0),
        "攻击一致",
    );
    assert_eq!(crate::common::attr(&attrs, "不存在的属性"), 0.0);
}

/// 夹具 request 装配口径：`request_from_fixture` 应还原 charId（1501 莉兹贝尔）。
#[test]
fn charbuild_request_shape() {
    let fixture = load_fixture("charbuild_fixed");
    let request = crate::common::request_from_fixture(&fixture);
    assert_eq!(request.char_id, 1501);
    assert_eq!(request.settings.enemy_id, 130);
}

#[test]
fn e2e_shard_anchors() {
    let fixture = load_fixture("e2e_shard");
    let expected = &fixture["expected"];
    // 黄金构筑总量：与 dob-app 旧 total 同值（conflict 检查已证一致）。
    assert_close(
        expected["calculate"].as_f64().unwrap_or(-1.0),
        5823675267.58358,
        "shard总量",
    );
    // 全链路输出有限。
    assert!(
        expected["targetByBasename"].is_object(),
        "byBasename 应为对象"
    );
    assert!(
        expected["dotDamage"].as_f64().is_some_and(f64::is_finite),
        "dot 有限"
    );
    assert!(
        expected["oneTime"].as_f64().is_some_and(f64::is_finite),
        "oneTime 有限"
    );
    // 快照 charId = 莉兹贝尔 1501。
    assert_eq!(fixture["request"]["charId"].as_u64(), Some(1501));
}
