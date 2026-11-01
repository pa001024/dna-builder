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
