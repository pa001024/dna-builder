//! parity 测试公共桩：容差 helper + 夹具加载 + `evaluate_build` 薄封装。
//!
//! 口径见 spec §6.3（抄 dob-app `fixture_tests::assert_close`）：
//! 期望绝对值 < 1e-9 时退化为绝对误差 1e-9，否则取 `max(|exp|×1e-6, 1e-9)`。
//! 只调 spec §4.1 的公开 API（`evaluate_build` / `TableBuilder::build` /
//! CorePort 广播的 `BuildRequest`）；`evaluate_expressions` 落地后补批量探针。
//!
//! 夹具形态（`tools/extract-calc-fixtures.ts` 产出，见 `tests/fixtures/README.md`）：
//! `{meta, request: {charId, settings}, expected}`；settings 即 TS `CharSettings`
//! JSON（`CharSettings::from_json` 容错解析），expected 键随 kind 而异。

#![allow(dead_code)]

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde_json::Value;

use dob_calc_core::evaluate::BuildRequest;

/// spec §6.3 容差：`|exp|<1e-9 → 1e-9 else max(|exp|×1e-6, 1e-9)`。
pub fn assert_close(actual: f64, expected: f64, label: &str) {
    let tolerance = if expected.abs() < 1e-9 {
        1e-9
    } else {
        (expected.abs() * 1e-6).max(1e-9)
    };
    assert!(
        (actual - expected).abs() <= tolerance,
        "{label}: 本地 {actual} vs 上游 {expected}（差 {}）",
        actual - expected
    );
}

/// 缺失字段按 0 处理的属性取值（上游面板只记录非零项，缺键即零）。
pub fn attr(map: &BTreeMap<String, f64>, key: &str) -> f64 {
    map.get(key).copied().unwrap_or(0.0)
}

/// 夹具目录（相对 crate 根，即 `crates/dob-calc-core/tests/fixtures`）。
pub fn fixture_dir() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path
}

/// 读取单个夹具 JSON。
pub fn load_fixture(name: &str) -> Value {
    let path = fixture_dir().join(format!("{name}.json"));
    let text =
        std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("缺少夹具 {}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|_| panic!("夹具 {name} 不是合法 JSON"))
}

/// 按夹具 `request` 装配 `BuildRequest`（settings 走 `CharSettings::from_json` 容错口径）。
/// timeline 由 FlowPort 拥有类型反序列化；失败（形状不符）时按缺省（无时间轴）处理。
pub fn request_from_fixture(fixture: &Value) -> BuildRequest {
    let raw = serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": fixture["request"]["settings"],
        "seed": fixture["request"].get("seed"),
        "timeline": fixture["request"].get("timeline"),
    });
    BuildRequest::from_json(&raw).expect("夹具 request 形状非法")
}

/// 断言两个属性映射在容差内一致（期望侧缺键按 0，实际侧多余键忽略：
///
/// 上游面板只记录非零项，零值键可能缺失；反向（实际多余非零键）由单测逐键覆盖）。
pub fn assert_attrs_close(
    actual: &std::collections::BTreeMap<String, f64>,
    expected: &Value,
    label: &str,
) {
    let Some(map) = expected.as_object() else {
        panic!("{label}: expected 不是对象");
    };
    for (key, value) in map {
        let Some(number) = value.as_f64() else {
            continue;
        };
        assert_close(
            actual.get(key).copied().unwrap_or(0.0),
            number,
            &format!("{label} {key}"),
        );
    }
}
