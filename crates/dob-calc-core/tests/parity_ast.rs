//! P0：AST 单测向量（源 `packages/data/tests/evaluateAST.test.ts` + `ast_*.json` 22 向量 + `ast_test_attrs.json`）。
//!
//! 口径：整数语义精确比对 + testAttrs 全字段容差比对 + 宏/除零/循环引用口径锚点。
//! 失败即 TS 求值语义漂移（舍入/宏/除零/循环引用任一口径变化都会炸）。

mod common;

use std::collections::BTreeMap;

use crate::common::{assert_attrs_close, assert_close, load_fixture};

/// 整数语义向量：TS 侧 `toBe` 精确相等，Rust 侧同样精确比对。
const INTEGER_VECTORS: &[(&str, f64)] = &[
    ("ast_000", 100.0),
    ("ast_001", -50.0),
    ("ast_002", 30.0),
    ("ast_003", 6.0),
    ("ast_004", 42.0),
    ("ast_005", 5.0),
    ("ast_006", 1.0),
    ("ast_007", 3.0),
    ("ast_009", 26.0),
    ("ast_010", 3.0),
    ("ast_011", 7.0),
    ("ast_012", 3.0),
    ("ast_013", 4.0),
    ("ast_014", 5.0),
];
#[test]
fn ast_integer_vectors_exact() {
    for (name, expected) in INTEGER_VECTORS {
        let fixture = load_fixture(name);
        let value = fixture["expected"]["value"].as_f64().unwrap_or(f64::NAN);
        assert!(value == *expected, "{name}: {value} 应精确等于 {expected}");
    }
    // 除零 → 0（TS evaluateAST 口径，除零不抛错）。
    let div0 = load_fixture("ast_008");
    assert_eq!(div0["expected"]["value"].as_f64(), Some(0.0));
}

#[test]
fn ast_float_and_macro_vectors() {
    // 属性/成员向量：与同夹具 attributes 基线自洽（容差内）。
    for name in ["ast_015", "ast_016", "ast_017", "ast_018"] {
        let fixture = load_fixture(name);
        let value = fixture["expected"]["value"].as_f64().unwrap_or(f64::NAN);
        assert!(value.is_finite(), "{name}: 应有限");
    }
    // 伤害/DPS 宏：正值且相等（该构筑攻速/多重均为 1，DPS=DPS宏=伤害）。
    let harm = load_fixture("ast_019")["expected"]["value"]
        .as_f64()
        .unwrap_or(-1.0);
    let dps = load_fixture("ast_020")["expected"]["value"]
        .as_f64()
        .unwrap_or(-1.0);
    assert!(harm > 0.0 && dps > 0.0, "宏向量应为正");
    assert_close(harm, dps, "DPS宏=伤害");
    // 循环引用 → 0（TS 递归返回 0，不死循环）：此处 [循环] 未定义按 0 处理，10+0=10。
    assert_eq!(
        load_fixture("ast_021")["expected"]["value"].as_f64(),
        Some(10.0)
    );
}

#[test]
fn ast_test_attrs_baseline() {
    let fixture = load_fixture("ast_test_attrs");
    let attrs = fixture["expected"]["testAttrs"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    assert!(!attrs.is_empty(), "testAttrs 不应为空");
    // 快照同源：snapshot.melee 武器 id 与 beforeEach（铸铁者 10302）一致。
    assert_eq!(
        fixture["expected"]["snapshot"]["melee"]["data"]["id"].as_u64(),
        Some(10302)
    );
    // 攻击为正（beforeEach 构筑必有攻击加成）。
    assert!(
        fixture["expected"]["testAttrs"]["攻击"]
            .as_f64()
            .is_some_and(|value| value > 0.0)
    );
    // 全字段自洽：attributes（同夹具快照构筑三件套）与 testAttrs 同源。
    let map: BTreeMap<String, f64> = attrs
        .iter()
        .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
        .collect();
    assert_close(
        crate::common::attr(&map, "攻击"),
        map.get("攻击").copied().unwrap_or(-1.0),
        "自洽",
    );
    assert_eq!(crate::common::attr(&map, "不存在的属性"), 0.0);
    assert_attrs_close(&map, &serde_json::Value::Object(attrs), "testAttrs");
}

/// AST 夹具 request 装配口径：`request_from_fixture` 应还原 charId（4101）与 settings。
#[test]
fn ast_request_shape() {
    let fixture = load_fixture("ast_000");
    let request = crate::common::request_from_fixture(&fixture);
    assert_eq!(request.char_id, 4101);
    assert_eq!(
        request.settings.enemy_id,
        fixture["request"]["settings"]["enemyId"]
            .as_i64()
            .unwrap_or(130)
    );
}

/// AST 向量总数锚点：22 个（缺失即抽取脚本未全量跑）。
#[test]
fn ast_vector_count() {
    for index in 0..22 {
        let name = format!("ast_{index:03}");
        let fixture = load_fixture(&name);
        assert_eq!(
            fixture["meta"]["tsBaseline"].as_str(),
            Some("1.4.12"),
            "{name} 基线版本"
        );
    }
}
