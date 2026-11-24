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
    // 收益锚点按旧夹具口径（基础 12 = 基础 10 + 三层 +2）录制；用合成载荷把有效等级补回 12，
    // 不引入溯源属性，保持锚点不变（夹具主设置已带溯源载荷，见 golden_bits 注释）。
    let mut settings = fixture["request"]["originalSettings"].clone();
    settings["transcendEffects"] = serde_json::json!({
        "main": {
            "buffs": [{
                "data": {
                    "名称": "测试技能等级",
                    "attr": {"E技能等级": 2, "Q技能等级": 2, "P技能等级": 2}
                },
                "level": 1
            }],
            "skillReplacements": {}
        }
    });
    settings["transcendSide"] = serde_json::Value::String("main".to_string());
    BuildRequest::from_json(&serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": settings,
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
        // `无解谜题` 移除后目标受条件 BUFF 命中影响：TS 首次 `calculate()` 冷缓存会漏条件池
        // （见 `CharBuild.ts` 的 `applyBuffAttr` 重入注释），热缓存 / 完整重建为 0.582874…
        ("w", 10199, 0.5828742768887012, "无解谜题"),
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
