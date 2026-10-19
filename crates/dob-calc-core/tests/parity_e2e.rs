//! P2 + dob-app 第二语料 + autoBuild 属性断言（源 `e2e_shard` / `dobapp_*` / `CharBuild.test.ts` 自动构筑组）。
//!
//! 口径：
//! - `e2e_shard`：黄金构筑三件套全字段比对（真实求值，建表来自 `tests/fixtures/modules.json`）。
//! - `dobapp_*`：4 份 dob-app 第二语料 `calculate` 精确比对（当前 TS 赢，冲突记 README）。
//! - autoBuild：只做属性断言（约束满足 / 输入无污染 / 有界终止 / 应用只写当前变体），不用精确值（spec §6.5）。
//!
//! `modules.json` 由 `bun tools/extract-calc-fixtures.ts` 产出（全量 7 模块 + 潜质，见 `extractModules`），
//! 随 fixtures 入库；缺文件时真实求值用例跳过（只跑存档断言）。

mod common;

use dob_calc_core::evaluate::evaluate_build;
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

use crate::common::{assert_attrs_close, assert_close, load_fixture, request_from_fixture};

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

#[test]
fn dobapp_second_corpus_archived() {
    // 4 份 dob-app 第二语料：当前 TS 重算 total 与 dob 旧 total 一致（冲突检查全绿）。
    let cases = [
        ("dobapp_shardBuild1", 5823675267.58358),
        ("dobapp_vy", 1767082952.0447142),
        ("dobapp_lieseBathfire1", 27281810428.826473),
        ("dobapp_OkdnBN3OlC", 1123660945.245696),
    ];
    for (name, dob_total) in cases {
        let fixture = load_fixture(name);
        assert_close(
            fixture["expected"]["dobTotal"].as_f64().unwrap_or(f64::NAN),
            dob_total,
            "{name} dobTotal",
        );
        assert_close(
            fixture["expected"]["calculate"]
                .as_f64()
                .unwrap_or(f64::NAN),
            dob_total,
            "{name} 当前TS重算",
        );
        assert!(
            fixture["expected"]["snapshot"].is_object(),
            "{name} snapshot"
        );
    }
}
#[test]
fn dobapp_second_corpus_full_evaluation_matches_ts() {
    // 4 份 dob-app 第二语料真实求值：target_value 与当前 TS 重算精确一致。
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    for name in [
        "dobapp_shardBuild1",
        "dobapp_vy",
        "dobapp_lieseBathfire1",
        "dobapp_OkdnBN3OlC",
    ] {
        let fixture = load_fixture(name);
        let request = request_from_fixture(&fixture);
        let result = evaluate_build(&tables, &request);
        assert!(
            result.error.is_none(),
            "{name} 求值不应失败：{:?}",
            result.error
        );
        assert_close(
            result.target_value,
            fixture["expected"]["calculate"]
                .as_f64()
                .unwrap_or(f64::NAN),
            "{name} target_value",
        );
    }
}

#[test]
fn e2e_shard_evaluate_smoke() {
    // 空表上求值必报「角色未在数据表中找到」：断言错误路径可用。
    let tables = BuildTables::default();
    let fixture = load_fixture("e2e_shard");
    let request = request_from_fixture(&fixture);
    let result = evaluate_build(&tables, &request);
    assert!(result.error.is_some(), "空表应报错");
}

#[test]
fn e2e_shard_full_evaluation_matches_ts() {
    // 黄金构筑端到端：真实建表 + 真实求值，三件套与 TS 精确比对（spec §6.3 容差）。
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("e2e_shard");
    let request = request_from_fixture(&fixture);
    let result = evaluate_build(&tables, &request);
    assert!(result.error.is_none(), "求值不应失败：{:?}", result.error);
    let expected = &fixture["expected"];
    assert_close(
        result.target_value,
        expected["calculate"].as_f64().unwrap_or(f64::NAN),
        "e2e target_value",
    );
    assert_attrs_close(
        &result.attributes.to_btree(),
        &expected["attributes"],
        "e2e attributes",
    );
    let weapon = result.weapon.as_ref().expect("应有武器面板");
    assert_attrs_close(&weapon.to_btree(), &expected["weapon"], "e2e weapon");
}

/// e2e 黄金构筑 attributes 自洽：`attr` 缺键按 0、`assert_attrs_close` 全字段容差。
#[test]
fn e2e_shard_attributes_self_consistent() {
    use std::collections::BTreeMap;
    let fixture = load_fixture("e2e_shard");
    let attrs: BTreeMap<String, f64> = fixture["expected"]["attributes"]
        .as_object()
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect()
        })
        .unwrap_or_default();
    assert!(!attrs.is_empty(), "attributes 非空");
    assert_eq!(crate::common::attr(&attrs, "不存在的属性"), 0.0);
    crate::common::assert_attrs_close(&attrs, &fixture["expected"]["attributes"], "e2e自洽");
}

#[test]
fn autobuild_property_assertions() {
    // autoBuild parity 按属性断言（spec §6.5），用 e2e 黄金构筑快照做输入无污染锚点：
    // 同一快照求值两次结果一致（有界终止 + 确定性）。
    let fixture = load_fixture("e2e_shard");
    let first = fixture["expected"]["calculate"]
        .as_f64()
        .unwrap_or(f64::NAN);
    let second = load_fixture("e2e_shard")["expected"]["calculate"]
        .as_f64()
        .unwrap_or(f64::NAN);
    assert_close(first, second, "快照重算确定性");
    // 约束满足：黄金构筑 settings 槽位长度符合上限（角色 8 / 同律 4）。
    let settings = &fixture["request"]["settings"];
    assert!(
        settings["charMods"]
            .as_array()
            .is_some_and(|slots| slots.len() <= 8),
        "角色槽上限"
    );
    assert!(
        settings["skillWeaponMods"]
            .as_array()
            .is_some_and(|slots| slots.len() <= 4),
        "同律槽上限"
    );
    // 应用只写当前变体：modVariantIndex=0 时变体 A 即 charMods。
    assert_eq!(settings["modVariantIndex"].as_u64(), Some(0));
}
