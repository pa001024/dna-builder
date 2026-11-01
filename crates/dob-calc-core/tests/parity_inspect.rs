//! `dobcc_skill_fields` / `dobcc_panels` 端口测试（spec §4.1 扩展）。
//!
//! 口径：
//! - panels 键集含 近战/远程/melee/ranged（e2e_shard 无同律武器，同律键缺席合法）；
//! - 任取一个武器技能名调 skill_fields，字段非空且全有限；未知技能返回空表。

mod common;

use dob_calc_core::evaluate::BuildRequest;

fn tables() -> dob_calc_core::tables::BuildTables {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).expect("modules.json 缺失");
    dob_calc_core::session::BuildPayload::from_json(&text)
        .expect("建表")
        .tables
}

fn request() -> BuildRequest {
    let fixture = common::load_fixture("e2e_shard");
    common::request_from_fixture(&fixture)
}

#[test]
fn panels_keys_cover_slots() {
    let tables = tables();
    let req = request();
    let panels = dob_calc_core::evaluate::panels_for(&tables, &req).expect("panels 不应为空");
    for key in ["近战", "远程", "melee", "ranged"] {
        assert!(panels.contains_key(key), "缺面板键 {key}");
        assert!(
            panels[key].get("攻击").copied().unwrap_or(0.0) > 0.0,
            "{key} 攻击应为正"
        );
    }
}

#[test]
fn panels_batch_by_slot() {
    let tables = tables();
    let fixture = common::load_fixture("dobapp_shardBuild1");
    let mut raw = serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": fixture["request"]["settings"],
        "panels": ["char", "melee", "ranged"],
    });
    // 一次请求批量算角色面板与多个武器槽：同一构筑只装配一次。
    let request = dob_calc_core::evaluate::PanelsRequest::from_json(&raw).expect("面板请求");
    let panels = dob_calc_core::evaluate::evaluate_panels(&tables, &request).expect("面板");
    for key in ["char", "melee", "ranged"] {
        assert!(panels.contains_key(key), "缺面板 {key}");
        assert!(panels[key].get("攻击").copied().unwrap_or(0.0) > 0.0, "{key} 攻击应为正");
    }
    assert!(!panels.contains_key("skill"), "未请求的槽位不应返回");
    assert_ne!(
        panels["melee"].get("攻击"),
        panels["ranged"].get("攻击"),
        "不同槽位应是不同武器面板"
    );
    // 角色面板与完整求值结果同一口径（面板请求不跑目标函数 / 伤害明细）。
    let evaluation = dob_calc_core::evaluate::evaluate_build(
        &tables,
        &BuildRequest::from_json(&raw).expect("求值请求"),
    );
    assert_eq!(panels["char"], evaluation.attributes, "角色面板应与求值属性一致");

    // 缺省 panels 时取全部武器槽（该构筑有同律武器）。
    raw.as_object_mut().expect("对象").remove("panels");
    let request = dob_calc_core::evaluate::PanelsRequest::from_json(&raw).expect("面板请求");
    let all = dob_calc_core::evaluate::evaluate_panels(&tables, &request).expect("面板");
    for key in ["melee", "ranged", "skill"] {
        assert!(all.contains_key(key), "缺省应包含槽 {key}");
    }
    assert!(!all.contains_key("char"), "缺省不包含角色面板");
}

#[test]
fn evaluate_returns_requested_panels() {
    let tables = tables();
    let fixture = common::load_fixture("dobapp_shardBuild1");
    let mut raw = serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": fixture["request"]["settings"],
        "panels": ["char", "melee"],
    });
    // evaluate 附带面板数组：与目标值同一次装配返回
    let evaluation = dob_calc_core::evaluate::evaluate_build(
        &tables,
        &BuildRequest::from_json(&raw).expect("求值请求"),
    );
    for key in ["char", "melee"] {
        assert!(evaluation.panels.contains_key(key), "附带面板缺 {key}");
    }
    assert!(!evaluation.panels.contains_key("ranged"), "未请求的面板不应返回");

    // 与独立面板请求结果一致
    let panel_request = dob_calc_core::evaluate::PanelsRequest::from_json(&raw).expect("面板请求");
    let panels = dob_calc_core::evaluate::evaluate_panels(&tables, &panel_request).expect("面板");
    assert_eq!(evaluation.panels, panels, "附带面板应与独立面板请求一致");

    // 会话复用：同构筑先带面板、再不带面板，不能命中带面板的缓存
    let mut session = dob_calc_core::evaluate::CalcSession::new(&tables);
    let with_panels = session.evaluate(&BuildRequest::from_json(&raw).expect("求值请求"));
    assert_eq!(with_panels.panels, panels);
    raw.as_object_mut().expect("对象").remove("panels");
    let plain = session.evaluate(&BuildRequest::from_json(&raw).expect("求值请求"));
    assert!(plain.panels.is_empty(), "不带面板的请求不应命中带面板缓存");
    assert_eq!(
        plain.target_value.to_bits(),
        with_panels.target_value.to_bits(),
        "附带面板不应改变目标值"
    );
}

#[test]
fn skill_fields_roundtrip() {
    let tables = tables();
    let req = request();
    let panels = dob_calc_core::evaluate::panels_for(&tables, &req).expect("panels 不应为空");
    // 任取一个武器技能名（非槽位别名即技能名）。
    let skill = panels
        .keys()
        .find(|k| !["近战", "远程", "同律", "melee", "ranged", "skill"].contains(&k.as_str()))
        .cloned()
        .expect("应有武器技能键");
    let fields = dob_calc_core::evaluate::skill_fields_for(&tables, &req, &skill).expect("字段表不应缺失");
    assert!(!fields.is_empty(), "{skill} 字段表不应为空");
    for field in &fields {
        assert!(!field.name.is_empty(), "字段名不应为空");
        assert!(field.value.is_finite(), "{} 值应有限", field.name);
        assert!(field.value2.is_finite(), "{} 值2 应有限", field.name);
    }
    // 未知技能返回 None（调用方记空表）。
    assert!(
        dob_calc_core::evaluate::skill_fields_for(&tables, &req, "不存在的技能").is_none(),
        "未知技能应返回 None"
    );
}
