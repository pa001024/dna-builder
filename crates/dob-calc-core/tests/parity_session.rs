//! CalcSession 复用回归：三档命中与冷路径逐位一致。

mod common;

use std::path::PathBuf;

use dob_calc_core::evaluate::{BuildRequest, CalcSession, evaluate_build};
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

fn tables() -> BuildTables {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).expect("modules.json");
    BuildPayload::from_json(&text).expect("tables").tables
}

fn assert_same(left: &dob_calc_core::evaluate::BuildResult, right: &dob_calc_core::evaluate::BuildResult, label: &str) {
    assert_eq!(
        left.target_value.to_bits(),
        right.target_value.to_bits(),
        "{label}: target 位漂移"
    );
    assert_eq!(left.attributes, right.attributes, "{label}: attributes 漂移");
    assert_eq!(left.weapon, right.weapon, "{label}: weapon 漂移");
    assert_eq!(left.target_function, right.target_function, "{label}: target_function 漂移");
    assert_eq!(left.error, right.error, "{label}: error 漂移");
    assert_eq!(left.buffs.len(), right.buffs.len(), "{label}: buffs 长度漂移");
}

#[test]
fn session_reuse_matches_cold() {
    let tables = tables();
    let fixture = common::load_fixture("dobapp_shardBuild1");
    let request = BuildRequest::from_json(&fixture["request"]).expect("request");
    let cold = evaluate_build(&tables, &request);

    let mut session = CalcSession::new(&tables);
    // 冷装配档。
    let first = session.evaluate(&request);
    assert_same(&first, &cold, "冷装配");
    // 全命中档：同请求再求值。
    let second = session.evaluate(&request);
    assert_same(&second, &cold, "全命中");
    // 装配命中档：只换目标函数。
    let mut changed = request.clone();
    changed.settings.target_function = "伤害".to_string();
    let expect_changed = evaluate_build(&tables, &changed);
    let got_changed = session.evaluate(&changed);
    assert_same(&got_changed, &expect_changed, "换目标函数");
    // 再换回来：仍命中装配档。
    let back = session.evaluate(&request);
    assert_same(&back, &cold, "换回原目标");
    // 改装配：换一个 MOD，冷重建。
    let mut mod_changed = request.clone();
    if let Some(slot) = mod_changed.settings.char_mods.first_mut() {
        *slot = match slot {
            Some((id, level)) => Some((*id, *level)),
            None => Some((11001, 10.0)),
        };
        if slot.map(|(id, _)| id) == Some(11001) {
            *slot = Some((11002, 10.0));
        }
    }
    let expect_mod = evaluate_build(&tables, &mod_changed);
    let got_mod = session.evaluate(&mod_changed);
    assert_same(&got_mod, &expect_mod, "换MOD重建");
}

#[test]
fn session_reuse_all_golden_fixtures() {
    let tables = tables();
    let mut session = CalcSession::new(&tables);
    for name in [
        "dobapp_shardBuild1",
        "lise_fire",
        "dobapp_vy",
        "dobapp_lieseBathfire1",
        "dobapp_OkdnBN3OlC",
    ] {
        let fixture = common::load_fixture(name);
        let request = BuildRequest::from_json(&fixture["request"]).expect("request");
        let cold = evaluate_build(&tables, &request);
        // 每个构筑求值两次：冷 + 全命中。
        let first = session.evaluate(&request);
        assert_same(&first, &cold, &format!("{name} 冷"));
        let second = session.evaluate(&request);
        assert_same(&second, &cold, &format!("{name} 热"));
        // 换目标函数走装配命中。
        let mut changed = request.clone();
        changed.settings.target_function = "1".to_string();
        let expect_changed = evaluate_build(&tables, &changed);
        let got_changed = session.evaluate(&changed);
        assert_same(&got_changed, &expect_changed, &format!("{name} 换目标"));
    }
}
