//! P1：时间轴（源 `packages/data/tests/timeline.test.ts` + `timeline_*.json` 5 夹具）。
//!
//! 口径：多事件累计 / 线性累加 / BUFF 附加 / DPS 折算 / 总时长 0 五锚点；
//! `request.timeline` 由 FlowPort 拥有类型消费，本文件只做夹具自洽 + 口径锚点
//! （evaluate_build 的 timeline 接线待 FlowPort 落地后补求值断言）。

mod common;

use crate::common::{assert_close, load_fixture};

#[test]
fn timeline_anchors() {
    let multi = load_fixture("timeline_00");
    let linear = load_fixture("timeline_01");
    let buff = load_fixture("timeline_02");
    let dps = load_fixture("timeline_03");
    let zero = load_fixture("timeline_04");

    // 多事件/线性/DPS：calculate 有限且为正（真实伤害值）。
    for (name, fixture) in [("多事件", &multi), ("线性", &linear), ("DPS", &dps)] {
        assert!(
            fixture["expected"]["calculate"]
                .as_f64()
                .is_some_and(|value| value > 0.0),
            "{name} calculate 应为正"
        );
    }
    // 零时长 → 0（TS 口径：timelineDPS 下总时长 0 返回 0）。
    assert_eq!(zero["expected"]["calculate"].as_f64(), Some(0.0));
    // BUFF 附加（TS 用例语义：`{name: 技能名, lv: 1}` 的条目被判为 BUFF 事件，
    // 时间线内无技能事件 → 总量 0，与无 BUFF 总量不等，`timeline.test.ts:86-95`）。
    assert_eq!(buff["expected"]["calculate"].as_f64(), Some(0.0));
    assert_ne!(
        buff["expected"]["calculate"].as_f64(),
        linear["expected"]["calculate"].as_f64(),
        "BUFF时间线与无BUFF总量不等（TS 原断言）"
    );
    crate::common::assert_attrs_close(
        &timeline_attrs(&linear),
        &linear["expected"]["attributes"],
        "线性自洽",
    );
    assert_eq!(
        crate::common::attr(&timeline_attrs(&linear), "不存在的属性"),
        0.0
    );
    assert!(
        buff["expected"]["snapshot"].is_object(),
        "时间线快照应为对象"
    );
}

/// 时间轴夹具 request 装配口径（timeline 缺省时按无时间轴处理，见 `request_from_fixture`）。
#[test]
fn timeline_fixture_request_shape() {
    let fixture = load_fixture("timeline_00");
    let request = crate::common::request_from_fixture(&fixture);
    assert_eq!(request.char_id, 2101);
    assert!(request.timeline.is_none(), "无 timeline 字段时按缺省处理");
}

/// 时间轴 attributes 转 HashMap（`attr`/`assert_attrs_close` 接线用）。
fn timeline_attrs(fixture: &serde_json::Value) -> std::collections::BTreeMap<String, f64> {
    fixture["expected"]["attributes"]
        .as_object()
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect()
        })
        .unwrap_or_default()
}
#[test]
fn timeline_request_shape() {
    // request 侧 timeline 输入形状锚点（FlowPort 消费，见 spec §4.1）。
    for index in 0..5 {
        let fixture = load_fixture(&format!("timeline_{index:02}"));
        assert_eq!(fixture["meta"]["kind"].as_str(), Some("timeline+triple"));
        assert_eq!(fixture["meta"]["tsBaseline"].as_str(), Some("1.4.12"));
    }
    // DPS 折算关系：timeline_03（DPS）与 timeline_01（同事件总量）的比值应为 1/2。
    let total = load_fixture("timeline_01")["expected"]["calculate"]
        .as_f64()
        .unwrap_or(-1.0);
    let dps = load_fixture("timeline_03")["expected"]["calculate"]
        .as_f64()
        .unwrap_or(-1.0);
    assert_close(dps, total / 2.0, "DPS=总量/2");
}
