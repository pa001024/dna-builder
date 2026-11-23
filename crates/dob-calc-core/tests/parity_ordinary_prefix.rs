//! U17：`普通近战/普通远程` 前缀语义（作用域 + 面板）与同律面板隔离。
//!
//! 夹具由 `bun tools/extract-calc-fixtures.ts` 产出：
//! - `ordinary_prefix`：贝蕾妮卡（近战 10302 / 远程 20601，同律武器非继承）；
//! - `ordinary_ranged`：赛琪（同律远程武器，`普通远程攻击` 只抬升远程面板）；
//! - `ordinary_inherit` / `ordinary_inherit_circle` / `ordinary_inherit_sword`：
//!   疑星落 / 圆舞 / 剑非剑（继承型同律）。
//!
//! 另有 `ordinary_all_bases`（12 类 base）、`ordinary_mixed_independent`（混合独立因子）、
//! `ordinary_attack_type`（4 类攻击细分 × 增伤/独立增伤）、`ordinary_inherit_code`
//! （继承槽 code 读取不泄漏）。期望值取自 TS（`getAllWeaponSkillsAttrs` / `evaluateAST`）。
//!
//! U43-fix：`attack_type_samelaw_specificity_counts_once` 用莉兹贝尔 · 萨麦尔同律近战面板
//! 锁定「裸键降级只计一次 + 精确度短路」，不依赖夹具（旧镜像双计会得到 3 倍而失败）。

mod common;

use std::collections::HashMap;
use std::path::PathBuf;

use serde_json::json;

use dob_calc_core::attrmap::AttrMap;
use dob_calc_core::context::{is_buff_in_scope, prefix_scope};
use dob_calc_core::evaluate::{BuildRequest, PanelsRequest, evaluate_build, evaluate_panels};
use dob_calc_core::record::Record;
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::{BuildTables, ModSource};

use crate::common::{assert_attrs_close, assert_close, load_fixture, request_from_fixture};

fn full_tables() -> Option<BuildTables> {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).ok()?;
    BuildPayload::from_json(&text)
        .map(|payload| payload.tables)
        .ok()
}

/// 按夹具 case 求面板（键 `melee` / `ranged` / `skill`）。
fn panels_of(tables: &BuildTables, case: &serde_json::Value) -> HashMap<String, AttrMap> {
    let raw = serde_json::json!({
        "charId": case["request"]["charId"],
        "settings": case["request"]["settings"],
        "panels": ["melee", "ranged", "skill"],
    });
    let request = PanelsRequest::from_json(&raw).expect("面板请求形状非法");
    evaluate_panels(tables, &request).expect("构筑装配失败")
}

#[test]
fn ordinary_prefix_scope_and_shared_pool() {
    // `普通近战/远程*` 归入近战/远程作用域，因此不会进入同律共享池。
    assert_eq!(prefix_scope("普通近战攻击"), "近战");
    assert_eq!(prefix_scope("普通近战武器倍率"), "近战");
    assert_eq!(prefix_scope("普通远程暴击"), "远程");
    assert!(is_buff_in_scope("普通近战攻击", "近战"));
    assert!(is_buff_in_scope("普通远程触发", "远程"));
    assert!(!is_buff_in_scope("普通近战攻击", "同律近战"));
    assert!(!is_buff_in_scope("普通近战攻击", "同律远程"));
    assert!(!is_buff_in_scope("普通近战攻击", "角色"));
}

fn assert_fixture(name: &str) {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture(name);
    let cases = fixture["cases"].as_array().expect("cases 数组");
    let mut panels_by_case: HashMap<String, HashMap<String, AttrMap>> = HashMap::new();
    for case in cases {
        let case_name = case["name"].as_str().unwrap_or("?");
        let panels = panels_of(&tables, case);
        for slot in ["melee", "ranged", "skill"] {
            let expected = &case["expected"][slot];
            if expected.is_null() {
                continue;
            }
            let actual = panels.get(slot).unwrap_or_else(|| panic!("{name}/{case_name}: 缺少 {slot} 面板"));
            assert_attrs_close(&actual.to_btree(), expected, &format!("{name}/{case_name} {slot}"));
        }
        panels_by_case.insert(case_name.to_string(), panels);
    }

    // 语义断言：ordinary 只抬升普通近战/远程面板（恰有一个槽位变化）；bare 同时抬升同律面板。
    let attack = |case: &str, slot: &str| {
        panels_by_case[case][slot]
            .get("攻击")
            .copied()
            .unwrap_or(f64::NAN)
    };
    let base_melee = attack("baseline", "melee");
    let base_ranged = attack("baseline", "ranged");
    let base_skill = attack("baseline", "skill");
    let ordinary_melee = attack("ordinary", "melee");
    let ordinary_ranged = attack("ordinary", "ranged");
    assert!(
        ordinary_melee > base_melee || ordinary_ranged > base_ranged,
        "{name}: 普通前缀应抬升对应的普通面板"
    );
    assert!(
        !(ordinary_melee > base_melee && ordinary_ranged > base_ranged),
        "{name}: 普通前缀不应同时抬升近战与远程面板"
    );
    assert_close(
        attack("ordinary", "skill"),
        base_skill,
        &format!("{name} 普通前缀不得进入同律面板"),
    );
    assert!(
        attack("bare", "melee") > base_melee || attack("bare", "ranged") > base_ranged,
        "{name}: 裸前缀应抬升普通面板"
    );
    assert!(
        attack("bare", "skill") > base_skill,
        "{name}: 裸前缀应进入同律面板"
    );
}

#[test]
fn ordinary_prefix_non_inherited_skill_panel() {
    assert_fixture("ordinary_prefix");
}

#[test]
fn ordinary_ranged_only_affects_ranged_panel() {
    assert_fixture("ordinary_ranged");
}

#[test]
fn ordinary_prefix_inherited_skill_panel() {
    assert_fixture("ordinary_inherit");
}

#[test]
fn ordinary_prefix_inherited_circle() {
    assert_fixture("ordinary_inherit_circle");
}

#[test]
fn ordinary_prefix_inherited_sword() {
    assert_fixture("ordinary_inherit_sword");
}

/// 读取面板夹具的 cases，逐槽比对 TS 期望并返回「case → 槽位 → 面板」。
fn panels_cases(tables: &BuildTables, fixture_name: &str) -> HashMap<String, HashMap<String, AttrMap>> {
    let fixture = load_fixture(fixture_name);
    let cases = fixture["cases"].as_array().expect("cases 数组");
    let mut by_case = HashMap::new();
    for case in cases {
        let name = case["name"].as_str().unwrap_or("?").to_string();
        let panels = panels_of(tables, case);
        for slot in ["melee", "ranged", "skill"] {
            let expected = &case["expected"][slot];
            if expected.is_null() {
                continue;
            }
            assert_attrs_close(
                &panels
                    .get(slot)
                    .unwrap_or_else(|| panic!("{fixture_name}/{name}: 缺少 {slot} 面板"))
                    .to_btree(),
                expected,
                &format!("{fixture_name}/{name} {slot}"),
            );
        }
        by_case.insert(name, panels);
    }
    by_case
}

#[test]
fn ordinary_prefix_all_bases_melee_and_ranged() {
    let Some(tables) = full_tables() else { return };
    let by_case = panels_cases(&tables, "ordinary_all_bases");

    // 近战面板：攻击/暴击/暴伤/触发/攻速/多重/增伤/武器倍率/独立增伤 均随普通键上升。
    let melee_base = &by_case["baseline"]["melee"];
    let melee_all = &by_case["all_bases"]["melee"];
    for key in ["攻击", "暴击", "暴伤", "触发", "攻速", "多重", "增伤", "武器倍率"] {
        assert!(
            melee_all.get(key).copied().unwrap_or(0.0) > melee_base.get(key).copied().unwrap_or(0.0),
            "近战 {key} 应随普通近战{key}上升"
        );
    }
    // 独立增伤单独一个因子：0.1 → 净增量 +0.1。
    assert_close(
        melee_all.get("独立增伤").copied().unwrap_or(0.0),
        melee_base.get("独立增伤").copied().unwrap_or(0.0) + 0.1,
        "近战独立增伤",
    );

    // 远程面板：12 类 base 全部可观测（含 装填/弹匣/弹药）。
    let ranged_base = &by_case["ranged-baseline"]["ranged"];
    let ranged_all = &by_case["ranged-all_bases"]["ranged"];
    for key in ["攻击", "暴击", "暴伤", "触发", "攻速", "多重", "增伤", "武器倍率"] {
        assert!(
            ranged_all.get(key).copied().unwrap_or(0.0) > ranged_base.get(key).copied().unwrap_or(0.0),
            "远程 {key} 应随普通远程{key}上升"
        );
    }
    for key in ["弹匣", "弹药"] {
        assert!(
            ranged_all.get(key).copied().unwrap_or(0.0) > ranged_base.get(key).copied().unwrap_or(0.0),
            "远程 {key} 应随普通远程{key}上升"
        );
    }
    // 装填是时间（base/(1+bonus)）：加成后应下降。
    assert!(
        ranged_all.get("装填").copied().unwrap_or(0.0) < ranged_base.get("装填").copied().unwrap_or(0.0),
        "远程装填应随普通远程装填下降"
    );
    assert_close(
        ranged_all.get("独立增伤").copied().unwrap_or(0.0),
        ranged_base.get("独立增伤").copied().unwrap_or(0.0) + 0.1,
        "远程独立增伤",
    );

    // 同律面板逐字段不变。
    for pair in [("baseline", "all_bases"), ("ranged-baseline", "ranged-all_bases")] {
        let base = &by_case[pair.0]["skill"];
        let all = &by_case[pair.1]["skill"];
        assert_eq!(
            base.to_btree(),
            all.to_btree(),
            "{} 同律面板不得读取普通前缀",
            pair.1
        );
    }
}

#[test]
fn ordinary_prefix_mixed_independent_factors() {
    let Some(tables) = full_tables() else { return };
    let by_case = panels_cases(&tables, "ordinary_mixed_independent");
    let independent = |case: &str| {
        by_case[case]["melee"]
            .get("独立增伤")
            .copied()
            .unwrap_or(f64::NAN)
    };
    let prefix = independent("prefix");
    let ordinary = independent("ordinary");
    let mixed = independent("mixed");
    assert_close(
        mixed,
        (1.0 + prefix) * (1.0 + ordinary) - 1.0,
        "混合独立因子应为 (1+前缀)(1+普通)-1",
    );
    assert!(mixed > prefix + ordinary, "不得加性合并为 1+a+b");
}

#[test]
fn ordinary_attack_type_keys() {
    let Some(tables) = full_tables() else { return };
    let fixture = load_fixture("ordinary_attack_type");
    let cases = fixture["cases"].as_array().expect("cases 数组");
    let mut values: HashMap<String, f64> = HashMap::new();
    for case in cases {
        let name = case["name"].as_str().unwrap_or("?").to_string();
        let request = request_from_fixture(case);
        let result = evaluate_build(&tables, &request);
        assert!(result.error.is_none(), "{name}: 求值失败 {:?}", result.error);
        assert_close(
            result.target_value,
            case["expected"]["value"].as_f64().unwrap_or(f64::NAN),
            &format!("{name} target"),
        );
        values.insert(name, result.target_value);
    }
    for ty in ["普攻", "蓄力", "下落", "滑行"] {
        let base = values[&format!("{ty}-baseline")];
        assert!(values[&format!("{ty}-add")] > base, "{ty}: 普通细分增伤应抬升伤害");
        assert!(
            values[&format!("{ty}-indep")] > base,
            "{ty}: 普通细分独立增伤应抬升伤害"
        );
    }
    // 继承型同律：普通细分键不追加；裸键仍按降级口径生效。
    assert_close(
        values["inherit-ordinary"],
        values["inherit-baseline"],
        "继承型同律不得读取普通细分键",
    );
    assert!(
        values["inherit-bare"] > values["inherit-baseline"],
        "裸细分键仍应进入继承型同律面板"
    );
}

/// 同律近战面板（莉兹贝尔 · 萨麦尔：武器类型 `同律近战`，下落字段 tag 为 `下落攻击`）。
fn same_law_damage(tables: &BuildTables, char_id: i64, custom_buff: &[(&str, f64)]) -> f64 {
    let buffs: Vec<serde_json::Value> = if custom_buff.is_empty() {
        Vec::new()
    } else {
        vec![json!(["自定义BUFF", 1])]
    };
    let raw = json!({
        "charId": char_id,
        "settings": {
            "charLevel": 80,
            "baseName": "萨麦尔",
            "hpPercent": 0.5,
            "resonanceGain": 0,
            "enemyId": 130,
            "enemyLevel": 80,
            "enemyResistance": 0.5,
            "targetFunction": "[萨麦尔]下落攻击伤害",
            "meleeWeapon": 10302,
            "meleeWeaponLevel": 80,
            "meleeWeaponRefine": 5,
            "rangedWeapon": 20201,
            "rangedWeaponLevel": 80,
            "rangedWeaponRefine": 5,
            "auraMod": 0,
            "buffs": buffs,
            "customBuff": custom_buff.iter().map(|(key, value)| json!([key, value])).collect::<Vec<_>>(),
        },
    });
    let request = BuildRequest::from_json(&raw).expect("同律请求形状非法");
    let result = evaluate_build(tables, &request);
    assert!(result.error.is_none(), "同律面板求值失败: {:?}", result.error);
    result.target_value
}

/// U43-fix：同律近战面板的裸键降级只计一次（旧镜像双计 → 3 倍），并按精确度短路。
#[test]
fn attack_type_samelaw_specificity_counts_once() {
    let Some(tables) = full_tables() else { return };
    let char_id = tables
        .chars
        .iter()
        .find(|(_, record)| record.str_ref("名称") == Some("莉兹贝尔"))
        .map(|(id, _)| *id)
        .expect("缺少莉兹贝尔");
    let base = same_law_damage(&tables, char_id, &[]);
    assert!(base > 0.0, "同律基准伤害应为正");
    let ratio = |custom: &[(&str, f64)]| same_law_damage(&tables, char_id, custom) / base;
    // 单一来源：裸键 / 近战 / 同律近战 都只计一次（+100% → 2 倍）。
    for key in ["下落增伤", "近战下落增伤", "同律近战下落增伤"] {
        assert_close(ratio(&[(key, 1.0)]), 2.0, &format!("同律 {key} 只计一次"));
    }
    // 同一来源命中多层：取最精确一档，不累加。
    assert_close(
        ratio(&[("同律近战下落增伤", 1.0), ("近战下落增伤", 2.0), ("下落增伤", 3.0)]),
        2.0,
        "同律精确度短路",
    );
    assert_close(
        ratio(&[("近战下落增伤", 2.0), ("下落增伤", 3.0)]),
        3.0,
        "同律降级到近战档",
    );
    assert_close(
        ratio(&[("同律近战下落增伤", 1.0), ("下落增伤", 3.0)]),
        2.0,
        "同律专属档优先于裸键",
    );
}

#[test]
fn ordinary_inherit_code_does_not_leak() {
    let Some(tables) = full_tables() else { return };
    let fixture = load_fixture("ordinary_inherit_code");
    let cases = fixture["cases"].as_array().expect("cases 数组");
    let mut totals: HashMap<String, (f64, f64)> = HashMap::new();
    for case in cases {
        let name = case["name"].as_str().unwrap_or("?").to_string();
        let request = request_from_fixture(case);
        let result = evaluate_build(&tables, &request);
        assert!(result.error.is_none(), "{name}: 求值失败 {:?}", result.error);
        let expected = &case["expected"];
        assert_close(
            result.target_value,
            expected["calculate"].as_f64().unwrap_or(f64::NAN),
            &format!("{name} target"),
        );
        assert_attrs_close(&result.attributes.to_btree(), &expected["attributes"], &format!("{name} attributes"));
        let weapon = result.weapon.as_ref().expect("应有武器面板");
        assert_attrs_close(&weapon.to_btree(), &expected["weapon"], &format!("{name} weapon"));

        // 静态面板：近战抬升、同律不变。
        let panels = panels_of(&tables, case);
        for slot in ["melee", "ranged", "skill"] {
            let want = &expected["panels"][slot];
            if want.is_null() {
                continue;
            }
            assert_attrs_close(&panels[slot].to_btree(), want, &format!("{name} {slot}"));
        }
        let attack = result.attributes.get("攻击").copied().unwrap_or(f64::NAN);
        totals.insert(name, (result.target_value, attack));
    }
    // code BUFF 经 `skillWeaponAttr` 读取面板：不得因普通前缀抬升角色攻击/目标值。
    assert_close(totals["ordinary"].0, totals["baseline"].0, "code 路径目标值");
    assert_close(totals["ordinary"].1, totals["baseline"].1, "code 路径角色攻击");
}

/// 近战槽 MOD 的裸键与普通键都只作用于近战面板，不穿透同律面板。
#[test]
fn melee_mod_ordinary_keys_do_not_penetrate() {
    let Some(mut tables) = full_tables() else { return };
    let char_id = tables
        .chars
        .iter()
        .find(|(_, record)| record.str_ref("名称") == Some("贝蕾妮卡"))
        .map(|(id, _)| *id)
        .expect("缺少贝蕾妮卡");
    let insert_mod = |tables: &mut BuildTables, id: i64, props: serde_json::Value| {
        tables.mods.insert(
            id,
            ModSource {
                data: Record::from_value(&json!({
                    "id": id,
                    "名称": format!("测试·普通近战{id}"),
                    "版本": "1.0",
                    "系列": "测试",
                    "品质": "金",
                    "极性": "A",
                    "耐受": 15,
                    "类型": "近战",
                    "加成": props,
                })),
                effect: None,
            },
        );
    };
    insert_mod(&mut tables, 999801, json!({ "近战攻击": 0.1 }));
    insert_mod(&mut tables, 999802, json!({ "普通近战攻击": 0.1 }));
    insert_mod(&mut tables, 999803, json!({ "近战攻击": 0.1, "普通近战攻击": 0.1 }));

    let panels_for = |tables: &BuildTables, slot: Option<i64>| {
        let melee_mods = match slot {
            Some(id) => json!([[id, 10]]),
            None => json!([]),
        };
        let raw = json!({
            "charId": char_id,
            "settings": {
                "baseName": "普通攻击",
                "auraMod": 0,
                "meleeWeapon": 10302,
                "meleeWeaponLevel": 80,
                "meleeWeaponRefine": 5,
                "rangedWeapon": 20601,
                "rangedWeaponLevel": 80,
                "rangedWeaponRefine": 5,
                "meleeMods": melee_mods,
            },
            "panels": ["melee", "skill"],
        });
        let request = PanelsRequest::from_json(&raw).expect("面板请求");
        evaluate_panels(tables, &request).expect("构筑装配")
    };
    let base = panels_for(&tables, None);
    let bare = panels_for(&tables, Some(999801));
    let ordinary = panels_for(&tables, Some(999802));
    let both = panels_for(&tables, Some(999803));
    let melee_atk = |panels: &HashMap<String, AttrMap>| panels["melee"].get("攻击").copied().unwrap_or(0.0);
    let skill_atk = |panels: &HashMap<String, AttrMap>| panels["skill"].get("攻击").copied().unwrap_or(0.0);

    assert!(melee_atk(&bare) > melee_atk(&base), "裸近战攻击 MOD 应计入近战面板");
    assert!(melee_atk(&ordinary) > melee_atk(&base), "普通近战攻击 MOD 应计入近战面板");
    assert!(melee_atk(&both) > melee_atk(&bare), "两类词条应叠加");
    assert!(melee_atk(&both) > melee_atk(&ordinary), "两类词条应叠加");
    for (label, panels) in [("bare", &bare), ("ordinary", &ordinary), ("both", &both)] {
        assert_close(
            skill_atk(panels),
            skill_atk(&base),
            &format!("近战槽 MOD（{label}）不得穿透同律面板"),
        );
    }
}
