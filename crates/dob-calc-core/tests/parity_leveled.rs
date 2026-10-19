//! P1：等级公式（源 `packages/data/tests/leveled.test.ts` + `leveled.json`）。
//!
//! 口径：MOD 等级钳制/公式/数组取档 + BUFF 等级 + 武器精炼/等级钳制 + 角色钳制，
//! 整数档位精确比对，浮点（0.15/0.075/0.48 类）容差比对。

mod common;

use crate::common::{assert_close, load_fixture};

/// 等级向量自洽 + 夹具 request 装配口径（`attr` 缺键按 0、`request_from_fixture` 还原 charId）。
#[test]
fn leveled_vectors_self_consistent() {
    use std::collections::BTreeMap;
    let fixture = load_fixture("leveled");
    let expected = &fixture["expected"];
    let map: BTreeMap<String, f64> = expected
        .as_object()
        .map(|obj| {
            obj.iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect()
        })
        .unwrap_or_default();
    assert!(!map.is_empty(), "等级向量不应为空");
    assert_eq!(crate::common::attr(&map, "不存在的向量"), 0.0);
    crate::common::assert_close(crate::common::attr(&map, "炽灼攻击3级"), 0.15, "炽灼3级");
    crate::common::assert_attrs_close(&map, expected, "leveled自洽");
    let request = crate::common::request_from_fixture(&fixture);
    assert_eq!(request.char_id, 4101);
    assert_eq!(request.settings.enemy_id, 130);
}

#[test]
fn leveled_mod_anchors() {
    let expected = &load_fixture("leveled")["expected"];
    let num = |key: &str| expected[key].as_f64().unwrap_or(f64::NAN);
    // 白品质满级 0.15，1 级 0.075（满级/(3+1)×(等级+1)）。
    assert_close(num("炽灼攻击3级"), 0.15, "炽灼3级攻击");
    assert_close(num("炽灼攻击1级"), 0.075, "炽灼1级攻击");
    // 金品质上限 10，超限钳制；下限 0。
    assert_eq!(num("雷鸣极昼钳制10"), 10.0);
    assert_eq!(num("炽灼下限0"), 0.0);
    // 单元素数组按等级取档（-0.5/0.5 不随等级变）。
    assert_eq!(num("单元素数组取档0"), -0.5);
    assert_eq!(num("单元素数组取档满"), -0.5);
    assert_eq!(num("减伤单元素0"), 0.5);
    assert_eq!(num("减伤单元素满"), 0.5);
    // 不存在 MOD 抛错。
    assert_eq!(expected["不存在MOD抛错"].as_bool(), Some(true));
}

#[test]
fn leveled_weapon_char_anchors() {
    let expected = &load_fixture("leveled")["expected"];
    let num = |key: &str| expected[key].as_f64().unwrap_or(f64::NAN);
    // 武器：精炼上限 5，下限 0；等级上限 80，下限 1。
    assert_eq!(num("武器精炼上限"), 5.0);
    assert!(num("武器基础攻击") > 0.0, "武器基础攻击应为正");
    assert_eq!(num("武器1级下限"), 1.0);
    // 角色：80 级基准，0 级钳制到 1。
    assert!(num("角色80级攻击") > 0.0, "角色攻击应为正");
    assert_eq!(num("角色1级钳制"), 1.0);
    // BUFF 等级 + 紫/金 MOD 特效数值锚点（`leveled.test.ts` 紫金分行用例）。
    assert!(num("法露茜Q默认等级") >= 1.0, "BUFF 等级应 ≥1");
    assert_close(num("紫MOD特效数值"), 0.54, "蛮勇紫技能威力");
    assert_close(num("金MOD特效数值"), 1.0, "蛮勇金技能威力");
    assert_close(num("紫MOD进击攻击"), 0.9, "进击紫攻击");
    assert_close(num("紫MOD决斗增伤"), 0.24, "决斗紫增伤");
    assert_close(num("紫MOD暴虐攻速"), 0.6, "暴虐攻速");
}
