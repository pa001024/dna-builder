//! BUFF 与 MOD 互斥（数据 `禁用`）的引擎行为。
//!
//! 上游 `packages/data/tests/buffDisable.test.ts` 覆盖数据标注与 TS 引擎；
//! 这里验证 Rust 端口同一口径：装备 `禁用` 列出的 MOD 后 BUFF 不参与计算，
//! 且自动配装/收益路径（`calc_income_buff`）得到 0 收益。
//!
//! `modules.json` 是按旧数据生成的夹具（不含 `禁用`），因此在测试内注入字段，
//! 避免为单个特性重写整份夹具。

mod common;

use std::collections::BTreeMap;

use dob_calc_core::evaluate::{BuildRequest, evaluate_build};
use dob_calc_core::income::calc_income_buff;
use dob_calc_core::models::LeveledBuff;
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;
use serde_json::json;

/// 全量建表（`modules.json` 缺失时返回 `None`，调用方跳过真实求值）。
fn full_tables() -> Option<BuildTables> {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).ok()?;
    BuildPayload::from_json(&text)
        .map(|payload| payload.tables)
        .ok()
}

/// 在旧夹具上补 `禁用` 字段（与 `buff.data.ts` 当前标注一致）。
fn patched_tables() -> Option<BuildTables> {
    let mut tables = full_tables()?;
    tables
        .buffs
        .get_mut("全盛·振奋")
        .expect("夹具缺少 全盛·振奋")
        .insert("禁用", json!([41415, 51445]));
    tables
        .buffs
        .get_mut("羽翼·鼓舞·昂扬(雷)")
        .expect("夹具缺少 羽翼·鼓舞·昂扬(雷)")
        .insert("禁用", json!([56143, 56144]));
    Some(tables)
}

fn settings(buffs: serde_json::Value, char_mods: serde_json::Value) -> serde_json::Value {
    json!({
        "charLevel": 80,
        "charSkillLevel": [10, 10, 10],
        "baseName": "快速出击",
        "meleeWeapon": 0,
        "rangedWeapon": 0,
        "auraMod": 0,
        "buffs": buffs,
        "charMods": char_mods,
        "targetFunction": "伤害",
    })
}

fn attributes(tables: &BuildTables, buffs: serde_json::Value, char_mods: serde_json::Value) -> BTreeMap<String, f64> {
    let request = BuildRequest::from_json(&json!({
        "charId": 4101,
        "settings": settings(buffs, char_mods),
    }))
    .expect("request 形状非法");
    let result = evaluate_build(tables, &request);
    assert!(result.error.is_none(), "求值不应失败：{:?}", result.error);
    result
        .attributes
        .iter()
        .map(|(key, value)| (key.to_string(), *value))
        .collect()
}

#[test]
fn buff_disabled_by_mod_matches_mod_only() {
    let Some(tables) = patched_tables() else {
        eprintln!("modules.json 缺失，跳过");
        return;
    };

    // 全盛·振奋：BUFF 与 百首「全盛·振奋」同增益（增伤 20%），装备后 BUFF 失效
    let mod_only = attributes(&tables, json!([]), json!([[51445, 10]]));
    let both = attributes(&tables, json!([["全盛·振奋", 10]]), json!([[51445, 10]]));
    assert!(
        (common::attr(&mod_only, "增伤") - common::attr(&both, "增伤")).abs() < 1e-9,
        "带 BUFF + MOD 应与仅 MOD 一致：{:?} vs {:?}",
        mod_only.get("增伤"),
        both.get("增伤")
    );

    // 海妖「羽翼·鼓舞·昂扬」与 换生灵「昂扬」都会禁用同名 BUFF
    for mod_id in [56143, 56144] {
        let mod_only = attributes(&tables, json!([]), json!([[mod_id, 10]]));
        let both = attributes(
            &tables,
            json!([["羽翼·鼓舞·昂扬(雷)", 10]]),
            json!([[mod_id, 10]]),
        );
        for key in ["昂扬", "神智", "技能效益", "减伤"] {
            assert!(
                (common::attr(&mod_only, key) - common::attr(&both, key)).abs() < 1e-9,
                "MOD {mod_id} {key}: {:?} vs {:?}",
                mod_only.get(key),
                both.get(key)
            );
        }
    }
}

#[test]
fn disabled_buff_income_is_zero() {
    let Some(tables) = patched_tables() else {
        eprintln!("modules.json 缺失，跳过");
        return;
    };
    let raw = tables
        .buffs
        .get("全盛·振奋")
        .expect("夹具缺少 全盛·振奋")
        .clone();
    let buff = LeveledBuff::new(raw, Some(10.0));

    let request = BuildRequest::from_json(&json!({
        "charId": 4101,
        "settings": settings(json!([["全盛·振奋", 10]]), json!([[51445, 10]])),
    }))
    .expect("request 形状非法");
    let income = calc_income_buff(
        &tables,
        request.char_id,
        &request.settings,
        &buff,
        None,
        None,
    );
    assert!(
        income.abs() < 1e-12,
        "被禁用的 BUFF 收益应为 0，实际 {income}"
    );

    // 未装备互斥 MOD 时同一 BUFF 有正收益，确认上面的 0 来自禁用而非其他原因
    let enabled = BuildRequest::from_json(&json!({
        "charId": 4101,
        "settings": settings(json!([["全盛·振奋", 10]]), json!([])),
    }))
    .expect("request 形状非法");
    let enabled_income = calc_income_buff(
        &tables,
        enabled.char_id,
        &enabled.settings,
        &buff,
        None,
        None,
    );
    assert!(enabled_income > 0.0, "未禁用时应为正收益");
}
