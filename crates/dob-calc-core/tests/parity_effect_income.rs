//! 特效等级收益（`income::calc_effect_income`）口径回归。
//!
//! 特效属性挂在 MOD / 武器实例上，不在 `settings.buffs` 里，按名 `buff_add` / `buff_remove`
//! 覆盖不到；收益只能按 `m:<id>` / `w:<id>` 改写特效等级后重建求值。
//!
//! 基线值取自 TS：同一份 `dobapp_lieseBathfire1` 配置下改写 `effectConfig` 后
//! `CharBuild.calculate()` 的 `base / without - 1`（移除）与 `value / base - 1`（附加）。

mod common;

use dob_calc_core::evaluate::BuildRequest;
use dob_calc_core::income::{build_value, calc_effect_income};
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

use crate::common::{assert_close, load_fixture};

/// 全量建表（`modules.json` 缺失时返回 `None`，调用方跳过真实求值）。
fn full_tables() -> Option<BuildTables> {
    let path = common::fixture_dir().join("modules.json");
    let text = std::fs::read_to_string(&path).ok()?;
    BuildPayload::from_json(&text)
        .map(|payload| payload.tables)
        .ok()
}

fn fixture_request() -> BuildRequest {
    let fixture = load_fixture("dobapp_lieseBathfire1");
    BuildRequest::from_json(&serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": fixture["request"]["settings"],
    }))
    .expect("夹具 request 形状非法")
}

#[test]
fn effect_removal_income_matches_ts() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let request = fixture_request();
    let base = build_value(&tables, request.char_id, &request.settings, None);
    let cases = [
        ("m", 51942, 0.2866230033406101, "不动万钧"),
        ("w", 10199, 0.5540305666584648, "无解谜题"),
        ("w", 20306, 0.23435778338690794, "活着的重量"),
    ];
    for (prefix, id, expected, name) in cases {
        let income = calc_effect_income(
            &tables,
            request.char_id,
            &request.settings,
            prefix,
            id,
            0.0,
            None,
            Some(base),
        );
        assert_close(income, expected, name);
    }
}

#[test]
fn effect_add_income_respects_level() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let mut request = fixture_request();
    // 关掉「不动万钧」后作为附加口径的基线
    request
        .settings
        .effect_config
        .push(("m:51942".to_string(), 0.0));
    let base = build_value(&tables, request.char_id, &request.settings, None);
    // 附加到 5 级 → 5607721739.337771 / 4904806547.599011 - 1
    let income = calc_effect_income(
        &tables,
        request.char_id,
        &request.settings,
        "m",
        51942,
        5.0,
        None,
        Some(base),
    );
    assert_close(income, 0.14331150167030526, "不动万钧@5");
    // 附加到满级即还原当前构筑：与移除口径同值（比值只差分子分母互换）
    let income_max = calc_effect_income(
        &tables,
        request.char_id,
        &request.settings,
        "m",
        51942,
        10.0,
        None,
        Some(base),
    );
    assert_close(income_max, 0.2866230033406101, "不动万钧@max");
}
