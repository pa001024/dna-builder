//! U89d2：协战 peer 重建与 `角色名::属性` 求值 parity。
//!
//! 基准值来自真实的 TS `normalizeCharSettings` + `createCharBuildFromSettings` 实跑
//! （`.tmp/u89d2-baseline.ts`，TS 1.5.5）；`SETTINGS` 是 TS 归一化后原样落盘的配置，
//! 不是手写期望值。覆盖：角色名 / 槽位别名 / 括号伪字段 / DOT / 未配置 / 无武器 /
//! 停用协战 / 重名消歧 / 会话指纹回归。

mod common;

use serde_json::Value;

use dob_calc_core::config::AssistSettings;
use dob_calc_core::context::BuildContext;
use dob_calc_core::evaluate::{BuildRequest, CalcSession, evaluate_build, evaluate_expressions};
use dob_calc_core::record::Record;
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;
use dob_calc_core::Evaluator;

/// TS `normalizeCharSettings` 产出的完整配置（1 号协战 = 扶疏，1 号武器 = 铸铁者）。
const SETTINGS: &str = r#"{"charLevel":80,"baseName":"涡旋电场","hpPercent":1,"resonanceGain":3,"enemyId":130,"enemyLevel":80,"enemyResistance":0,"isRouge":false,"targetFunction":"","mainTargetEnabled":true,"customVariables":[],"charSkillLevel":[10,10,10],"extraMastery":"","meleeWeapon":10302,"meleeWeaponLevel":80,"meleeWeaponRefine":5,"rangedWeapon":20601,"rangedWeaponLevel":80,"rangedWeaponRefine":5,"auraMod":31524,"imbalance":false,"charMods":[null,null,null,null,null,null,null,null],"meleeMods":[null,null,null,null,null,null,null,null],"rangedMods":[null,null,null,null,null,null,null,null],"skillWeaponMods":[null,null,null,null],"modVariantIndex":0,"modVariants":[],"buffs":[],"customBuff":[],"petId":0,"petLevel":3,"petCoverage":1,"petAutoCoverage":true,"traits":[null,null,null,null],"team1":2401,"team1Weapon":10302,"team1Build":"-","team1BuildVariant":"A","team2":"-","team2Weapon":"-","team2Build":"-","team2BuildVariant":"A","assist1":{"charLevel":80,"charSkillLevel":[10,10,10],"baseName":"提挈浮沉","extraMastery":"","weaponLevel":80,"weaponRefine":5,"targetFunction":"","customVariables":[],"dotSettings":{"skill":0,"melee":0,"ranged":0,"skillweapon":0,"forceOwnAdditionalDamage":false},"enabled":true,"auraMod":0,"charMods":[[41001,10],null,null,null,null,null,null,null],"meleeMods":[null,null,null,null,null,null,null,null],"rangedMods":[null,null,null,null,null,null,null,null],"skillWeaponMods":[null,null,null,null],"modVariantIndex":0,"modVariants":[],"buffs":[["菲娜4溯",10]],"customBuff":[],"useGlobal":false,"effectConfig":{}},"assist2":{"charLevel":80,"charSkillLevel":[10,10,10],"baseName":"","extraMastery":"","weaponLevel":80,"weaponRefine":5,"targetFunction":"","customVariables":[],"dotSettings":{"skill":0,"melee":0,"ranged":0,"skillweapon":0,"forceOwnAdditionalDamage":false},"enabled":true,"auraMod":0,"charMods":[null,null,null,null,null,null,null,null],"meleeMods":[null,null,null,null,null,null,null,null],"rangedMods":[null,null,null,null,null,null,null,null],"skillWeaponMods":[null,null,null,null],"modVariantIndex":0,"modVariants":[],"buffs":[],"customBuff":[],"useGlobal":false,"effectConfig":{}},"timelineDPS":false,"useGlobal":false,"effectConfig":{},"dotSettings":{"skill":0,"melee":0,"ranged":0,"skillweapon":0,"forceOwnAdditionalDamage":false},"actions":{"enable":false,"i":[],"b":[],"hp":[],"bgs":[]}}"#;

const MAIN_ID: i64 = 4101;
const ASSIST_ID: i64 = 2401;
const ASSIST_NAME: &str = "扶疏";
const MAIN_NAME: &str = "黎瑟";

fn tables() -> BuildTables {
    let path = common::fixture_dir().join("modules.json");
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("缺少夹具 {}：{error}", path.display()));
    BuildPayload::from_json(&text)
        .unwrap_or_else(|error| panic!("夹具 {} 解析失败：{error:?}", path.display()))
        .tables
}

fn settings() -> Value {
    serde_json::from_str(SETTINGS).expect("SETTINGS 应为合法 JSON")
}

fn make_request(settings: &Value, target: &str) -> BuildRequest {
    let mut request = BuildRequest::from_json(&serde_json::json!({
        "charId": MAIN_ID,
        "settings": settings,
    }))
    .expect("请求形状合法");
    request.settings.target_function = target.to_string();
    request
}

fn assert_rel(actual: f64, expected: f64, label: &str) {
    let tolerance = expected.abs().max(1.0) * 1e-9;
    assert!(
        (actual - expected).abs() <= tolerance,
        "{label}: 本地 {actual} vs TS {expected}（差 {}）",
        actual - expected
    );
}

fn eval(tables: &BuildTables, request: &BuildRequest, expression: &str) -> f64 {
    let results = evaluate_expressions(tables, request, &[expression.to_string()]);
    results[0].value.unwrap_or(f64::NAN)
}

#[test]
fn peer_matches_ts_normalized_values() {
    let tables = tables();
    let request = make_request(&settings(), "");
    let values = evaluate_expressions(
        &tables,
        &request,
        &[
            format!("{ASSIST_NAME}::技能威力"),
            format!("{ASSIST_NAME}::技能范围"),
            "协战1::技能威力".to_string(),
            "assist1::技能威力".to_string(),
            format!("{ASSIST_NAME}::[攻击]"),
            format!("{ASSIST_NAME}::[近战]"),
            format!("{ASSIST_NAME}::[远程]"),
            format!("{ASSIST_NAME}::DOT伤害"),
            format!("{ASSIST_NAME}::不存在的属性"),
            "协战2::技能威力".to_string(),
            format!("{MAIN_NAME}::[攻击]"),
            format!("{MAIN_NAME}::技能威力"),
        ],
    );
    let value = |index: usize| values[index].value.unwrap_or(f64::NAN);

    // TS 实跑：assist 面板 技能威力 2.1 / 技能范围 1.45 / 攻击 1371.33。
    assert_rel(value(0), 2.1, "扶疏::技能威力");
    assert_rel(value(1), 1.45, "扶疏::技能范围");
    assert_rel(value(2), 2.1, "协战1::技能威力");
    assert_rel(value(3), 2.1, "assist1::技能威力");
    // 括号伪字段 / DOT伤害 / 未知属性 / 未配置侧别名：团队命名空间一律 0。
    for index in 4..10 {
        assert_eq!(value(index), 0.0, "第 {index} 条表达式应为 0");
    }
    // 自身角色名读当前面板：伪字段 0、普通属性 1。
    assert_eq!(value(10), 0.0, "黎瑟::[攻击]");
    assert_rel(value(11), 1.0, "黎瑟::技能威力");

    // 目标函数同口径：2.1 × 0.7 = 1.47。
    let target = evaluate_build(&tables, &make_request(&settings(), &format!("{ASSIST_NAME}::技能威力*0.7")));
    assert_rel(target.target_value, 1.47, "扶疏::技能威力*0.7");
    assert!(target.error.is_none(), "目标函数不应报错：{:?}", target.error);
}

#[test]
fn disabled_assist_missing_weapon_and_unconfigured_are_zero() {
    let tables = tables();

    // 停用协战仍可查询（enabled 只影响合计）。
    let mut disabled_settings = settings();
    disabled_settings["assist1"]["enabled"] = serde_json::Value::Bool(false);
    let disabled = make_request(&disabled_settings, "");
    assert_rel(eval(&tables, &disabled, &format!("{ASSIST_NAME}::技能威力")), 2.1, "停用协战");
    assert_rel(eval(&tables, &disabled, "协战1::技能威力"), 2.1, "停用协战别名");

    // 无武器：命名空间仍注册，查询恒 0。
    let mut no_weapon_settings = settings();
    no_weapon_settings["team1Weapon"] = serde_json::Value::String("-".to_string());
    let no_weapon = make_request(&no_weapon_settings, "");
    assert_eq!(eval(&tables, &no_weapon, &format!("{ASSIST_NAME}::技能威力")), 0.0);
    assert_eq!(eval(&tables, &no_weapon, "协战1::技能威力"), 0.0);

    // 完全未配置协战：角色名不是团队命名空间，整条表达式求值 0（既有无效命名空间路径）。
    let solo = make_request(&serde_json::json!({}), &format!("{ASSIST_NAME}::技能威力"));
    let solo_result = evaluate_build(&tables, &solo);
    assert_eq!(solo_result.target_value, 0.0);
    assert!(solo_result.error.is_some(), "未配置协战应记录无效命名空间错误");

    // 数字 id 但角色不存在：peer 不构建，查询 0。
    let mut missing_char_settings = settings();
    missing_char_settings["team1"] = serde_json::json!(1802);
    let missing_char = make_request(&missing_char_settings, &format!("{ASSIST_NAME}::技能威力"));
    assert_eq!(evaluate_build(&tables, &missing_char).target_value, 0.0);
    let missing_char_alias = make_request(&missing_char_settings, "协战1::技能威力");
    assert_eq!(eval(&tables, &missing_char_alias, "协战1::技能威力"), 0.0);
}

#[test]
fn assist_fingerprint_covers_target_dot_and_aura() {
    let base = make_request(&settings(), "").settings;
    let eval_fp = dob_calc_core::evaluate::fingerprint_settings(&base, false, None);
    let assembly_fp = dob_calc_core::evaluate::fingerprint_settings(&base, true, None);

    let mut target = base.clone();
    target.assist1.as_mut().unwrap().target_function = "扶疏::技能威力".to_string();
    assert_ne!(
        dob_calc_core::evaluate::fingerprint_settings(&target, false, None),
        eval_fp,
        "assist1.targetFunction 必须进入求值指纹"
    );

    let mut dot = base.clone();
    dot.assist1.as_mut().unwrap().dot_settings.melee = 1.0;
    assert_ne!(
        dob_calc_core::evaluate::fingerprint_settings(&dot, false, None),
        eval_fp,
        "assist1.dotSettings 必须进入求值指纹"
    );
    assert_ne!(
        dob_calc_core::evaluate::fingerprint_settings(&dot, true, None),
        assembly_fp,
        "assist1.dotSettings 必须进入装配指纹"
    );

    let mut aura = base.clone();
    aura.assist1.as_mut().unwrap().aura_mod = 31524;
    assert_ne!(
        dob_calc_core::evaluate::fingerprint_settings(&aura, false, None),
        eval_fp,
        "assist1.auraMod 必须进入求值指纹"
    );
    assert_ne!(
        dob_calc_core::evaluate::fingerprint_settings(&aura, true, None),
        assembly_fp,
        "assist1.auraMod 必须进入装配指纹"
    );
}

#[test]
fn assist2_and_same_name_disambiguation() {
    let tables = tables();
    let mut both_settings = settings();
    both_settings["team2"] = serde_json::json!(ASSIST_ID);
    both_settings["team2Weapon"] = serde_json::json!(10302);
    both_settings["assist2"]["baseName"] = serde_json::json!("提挈浮沉");
    both_settings["assist2"]["buffs"] = serde_json::json!([["自定义BUFF", 10]]);
    both_settings["assist2"]["customBuff"] = serde_json::json!([["技能威力", 1.1]]);
    let both = make_request(&both_settings, "");

    // TS 实跑：同名时角色名按 assist1 → assist2 取名；槽位别名可消歧。
    assert_rel(eval(&tables, &both, &format!("{ASSIST_NAME}::技能威力")), 2.1, "角色名取 assist1");
    assert_rel(eval(&tables, &both, "协战2::技能威力"), 2.3, "协战2");
    assert_rel(eval(&tables, &both, "assist2::技能威力"), 2.3, "assist2");
}

#[test]
fn fingerprint_session_does_not_leak_peer_state() {
    let tables = tables();
    let base = make_request(&settings(), &format!("{ASSIST_NAME}::技能威力"));

    // 同一会话内换协战 BUFF 必须重建 peer：TS 实跑 2.1 → 1.8。
    let mut alt_settings = settings();
    alt_settings["assist1"]["buffs"] = serde_json::json!([["自定义BUFF", 10]]);
    alt_settings["assist1"]["customBuff"] = serde_json::json!([["技能威力", 0.6]]);
    let alt = make_request(&alt_settings, &format!("{ASSIST_NAME}::技能威力"));
    assert_ne!(
        dob_calc_core::evaluate::fingerprint_settings(&base.settings, false, None),
        dob_calc_core::evaluate::fingerprint_settings(&alt.settings, false, None),
        "协战 loadout 不同必须改变求值指纹"
    );

    let mut session = CalcSession::new(&tables);
    assert_rel(session.evaluate(&base).target_value, 2.1, "会话首次");
    assert_rel(session.evaluate(&alt).target_value, 1.8, "会话换协战 BUFF");
    assert_rel(session.evaluate(&base).target_value, 2.1, "会话切回");
}

#[test]
fn restricted_peer_team_references_are_zero() {
    let mut tables = tables();
    // 合成 BUFF：attr 表达式引用主控角色名；peer 内 restricted 解析器必须返回 0。
    tables.buffs.insert(
        "U89d2受限测试".to_string(),
        Record::from_value(&serde_json::json!({
            "名称": "U89d2受限测试",
            "描述": "U89d2 peer restricted",
            "attr": {"技能威力": format!("{MAIN_NAME}::技能威力")},
        })),
    );
    let mut restricted_settings = settings();
    restricted_settings["assist1"]["buffs"] =
        serde_json::json!([["菲娜4溯", 10], ["U89d2受限测试", 1]]);
    let request = make_request(&restricted_settings, "");
    assert_rel(
        eval(&tables, &request, &format!("{ASSIST_NAME}::技能威力")),
        2.1,
        "peer 内引用主控名应为 0",
    );
}

#[test]
fn peer_base_name_falls_back_to_first_skill() {
    let tables = tables();
    // 脏存档：baseName 为空 / 不在扶疏技能表 → peer 回退首个技能（TS normalizeAssistSideSettings）。
    let mut dirty = settings();
    dirty["assist1"]["baseName"] = serde_json::json!("不存在的技能");
    let request = make_request(&dirty, "");
    assert_rel(
        eval(&tables, &request, &format!("{ASSIST_NAME}::技能威力")),
        2.1,
        "非法 baseName 回退首个技能",
    );

    // 空 baseName 同样回退。
    dirty["assist1"]["baseName"] = serde_json::json!("");
    let request = make_request(&dirty, "");
    assert_rel(
        eval(&tables, &request, &format!("{ASSIST_NAME}::技能威力")),
        2.1,
        "空 baseName 回退首个技能",
    );
}

#[test]
fn assist_slot_levels_are_rounded() {
    let tables = tables();
    // TS `normalizeModSlots` 对等级 Math.round：5.6 → 6；TS 实跑 技能威力 2.52。
    let mut rounded = settings();
    rounded["assist1"]["charMods"] =
        serde_json::json!([[51718, 5.6], null, null, null, null, null, null, null]);
    let request = make_request(&rounded, "");
    assert_rel(
        eval(&tables, &request, &format!("{ASSIST_NAME}::技能威力")),
        2.52,
        "协战 MOD 等级取整",
    );
}

#[test]
fn numeric_string_team_ids_are_unconfigured() {
    let tables = tables();
    // TS `readSide` 只认 number：数字字符串原样保留 → 视作未配置。Rust 必须同口径。
    let mut legacy = settings();
    legacy["team1"] = serde_json::json!("2401");
    legacy["team1Weapon"] = serde_json::json!("10302");
    let request = make_request(&legacy, &format!("{ASSIST_NAME}::技能威力"));
    assert_eq!(request.settings.team1, None);
    assert_eq!(request.settings.team1_weapon, None);
    let result = evaluate_build(&tables, &request);
    assert_eq!(result.target_value, 0.0, "数字字符串 team1 必须按未配置处理");
    assert!(result.error.is_some(), "应走无效命名空间路径");

    let alias = make_request(&legacy, "协战1::技能威力");
    assert_eq!(evaluate_build(&tables, &alias).target_value, 0.0);
}

#[test]
fn fractional_team_ids_round_like_ts() {
    let tables = tables();
    // TS `readSide` / `createAssistBuildFromSettings` 对 number 做 Math.round：2401.4 → 2401。
    let mut fractional = settings();
    fractional["team1"] = serde_json::json!(2401.4);
    fractional["team1Weapon"] = serde_json::json!(10302.4);
    let request = make_request(&fractional, &format!("{ASSIST_NAME}::技能威力"));
    assert_eq!(request.settings.team1, Some(ASSIST_ID));
    assert_eq!(request.settings.team1_weapon, Some(10302));
    // peer 口径与 TS `createAssistBuildFromSettings` 一致（2.1）。注：TS 主控构造的
    // `teamWeaponCategories` 未取整，分数 teamWeapon 会在 TS 侧抛错；该既有 TS 缺口不在本单元。
    assert_rel(evaluate_build(&tables, &request).target_value, 2.1, "分数协战 id");

    // team_weapon_categories 同源取整后的武器：铸铁者 类型[1] = 重剑。
    let context = BuildContext::new(&tables, MAIN_ID, &request.settings).expect("主控装配");
    assert_eq!(context.team_weapon_categories, vec!["重剑".to_string()]);
}

#[test]
fn character_name_team_ids_are_unconfigured_on_raw_parse() {
    let tables = tables();
    // TS normalizeCharSettings 会在进入 wasm 前把角色名解析成 id；Rust 收到裸名按未配置处理。
    let mut named = settings();
    named["team1"] = serde_json::json!(ASSIST_NAME);
    let request = make_request(&named, &format!("{ASSIST_NAME}::技能威力"));
    assert_eq!(request.settings.team1, None);
    assert_eq!(evaluate_build(&tables, &request).target_value, 0.0);
}

#[test]
fn missing_assist_loadout_makes_peer_unavailable() {
    let tables = tables();
    // team1 有效但 assist1 缺失：TS createAssistBuildFromSettings 返回 undefined → 查询 0。
    let mut missing = make_request(&settings(), "").settings;
    missing.assist1 = None;
    let request = BuildRequest {
        settings: missing,
        ..make_request(&settings(), "")
    };
    assert_eq!(eval(&tables, &request, &format!("{ASSIST_NAME}::技能威力")), 0.0);
    assert_eq!(eval(&tables, &request, "协战1::技能威力"), 0.0);
}

#[test]
fn assist2_fingerprint_and_peer() {
    let tables = tables();
    let mut both = settings();
    both["team2"] = serde_json::json!(ASSIST_ID);
    both["team2Weapon"] = serde_json::json!(10302);
    both["assist2"]["baseName"] = serde_json::json!("提挈浮沉");
    both["assist2"]["buffs"] = serde_json::json!([["自定义BUFF", 10]]);
    both["assist2"]["customBuff"] = serde_json::json!([["技能威力", 1.1]]);

    let mut changed = both.clone();
    changed["assist2"]["customBuff"] = serde_json::json!([["技能威力", 0.6]]);
    assert_ne!(
        dob_calc_core::evaluate::fingerprint_settings(
            &make_request(&both, "").settings,
            false,
            None
        ),
        dob_calc_core::evaluate::fingerprint_settings(
            &make_request(&changed, "").settings,
            false,
            None
        ),
        "assist2 loadout 变化必须改变指纹"
    );

    let mut session = CalcSession::new(&tables);
    let first = session.evaluate(&make_request(&both, "协战2::技能威力"));
    assert_rel(first.target_value, 2.3, "assist2 首次");
    let second = session.evaluate(&make_request(&changed, "协战2::技能威力"));
    assert_rel(second.target_value, 1.8, "assist2 换 BUFF");
}

#[test]
fn invalid_and_team_function_namespaces_zero_whole_expression() {
    let tables = tables();

    // 团队命名空间没有函数语义：TS 整条表达式失败 → 0。
    let team_function = make_request(&settings(), &format!("{ASSIST_NAME}::min(1)"));
    let result = evaluate_build(&tables, &team_function);
    assert_eq!(result.target_value, 0.0);
    assert!(
        result
            .error
            .as_deref()
            .is_some_and(|message| message.contains("团队命名空间不支持函数")),
        "错误文案应命中团队函数：{:?}",
        result.error
    );

    // 未知命名空间不是单个属性 0，而是整条表达式失败 → 0（1+0 不能留下 1）。
    let unknown = make_request(&serde_json::json!({}), &format!("1+{ASSIST_NAME}::技能威力"));
    let result = evaluate_build(&tables, &unknown);
    assert_eq!(result.target_value, 0.0);
    assert!(
        result
            .error
            .as_deref()
            .is_some_and(|message| message.contains("无效命名空间")),
        "错误文案应命中无效命名空间：{:?}",
        result.error
    );

    // 已配置协战时同一复合表达式正常参与运算。
    let compound = make_request(&settings(), &format!("1+{ASSIST_NAME}::技能威力"));
    assert_rel(evaluate_build(&tables, &compound).target_value, 3.1, "1+扶疏::技能威力");
}

#[test]
fn restricted_peer_namespace_flag_is_discriminating() {
    let tables = tables();
    let mut peer_settings = request_settings(&settings());
    // 构造与 `peer_settings` 同形的协战上下文：队伍 / 协战 / 魔灵 / 潜质全部清空。
    peer_settings.team1 = None;
    peer_settings.team1_weapon = None;
    peer_settings.team2 = None;
    peer_settings.team2_weapon = None;
    peer_settings.pet_id = 0;
    peer_settings.traits = Vec::new();
    peer_settings.assist1 = None;
    peer_settings.assist2 = None;
    let mut peer = BuildContext::new(&tables, ASSIST_ID, &peer_settings).expect("peer 装配");
    peer.restricted_namespaces = true;
    assert!(peer.is_team_namespace(MAIN_NAME));
    assert!(peer.is_team_namespace("煜明"), "另一协战的真实角色名");
    assert!(peer.is_team_namespace("协战2"));
    assert!(!peer.is_team_namespace("不存在的角色"));

    let mut evaluator = Evaluator::new(&mut peer);
    // 主控角色名在 peer 内是团队命名空间：属性恒不可解析 → 0（无 invalid namespace 错误）。
    assert_eq!(evaluator.evaluate(&format!("{MAIN_NAME}::技能威力")), Ok(0.0));
    assert_eq!(evaluator.evaluate("煜明::技能威力"), Ok(0.0));
    // 自身角色名仍读当前面板。
    assert!(evaluator.evaluate(&format!("{ASSIST_NAME}::技能威力")).unwrap_or(0.0) > 0.0);
}

/// 请求 settings 的独立克隆（避免测试间共享）。
fn request_settings(value: &Value) -> dob_calc_core::config::CharSettings {
    make_request(value, "").settings
}

#[test]
fn peer_ranged_weapon_variant_and_missing_buff() {
    let tables = tables();

    // 远程单武器落远程槽（TS 实跑 技能威力 2.1）。
    let mut ranged = settings();
    ranged["team1Weapon"] = serde_json::json!(20601);
    let ranged_request = make_request(&ranged, "");
    assert_rel(
        eval(&tables, &ranged_request, &format!("{ASSIST_NAME}::技能威力")),
        2.1,
        "远程协战武器",
    );

    // 激活 B 变体：TS 实跑 技能威力 2.52。
    let mut variant = settings();
    variant["assist1"]["modVariantIndex"] = serde_json::json!(1);
    variant["assist1"]["modVariants"] = serde_json::json!([{
        "中枢": 31524,
        "角色": [[51718, 6], null, null, null, null, null, null, null],
        "近战": [],
        "远程": [],
        "同律": []
    }]);
    let variant_request = make_request(&variant, "");
    assert_rel(
        eval(&tables, &variant_request, &format!("{ASSIST_NAME}::技能威力")),
        2.52,
        "协战 B 变体",
    );

    // 下线 BUFF 只跳过自身（TS createCharBuildFromSettings 逐条 catch），其余属性仍可查询。
    let mut missing_buff = settings();
    missing_buff["assist1"]["buffs"] = serde_json::json!([["不存在的BUFF", 1], ["菲娜4溯", 10]]);
    let missing_buff_request = make_request(&missing_buff, "");
    assert_rel(
        eval(&tables, &missing_buff_request, &format!("{ASSIST_NAME}::技能威力")),
        2.1,
        "下线 BUFF 跳过",
    );
}

#[test]
fn assist_settings_default_matches_ts_shape() {
    // U89d1 解析默认 loadout 的 TS 形状锚点（peer 构建依赖它补缺）。
    let assist = AssistSettings::default();
    assert_eq!(assist.char_level, 80.0);
    assert_eq!(assist.char_skill_level, [10.0; 3]);
    assert_eq!(assist.weapon_level, 80.0);
    assert_eq!(assist.weapon_refine, 5.0);
    assert_eq!(assist.char_mods.len(), 8);
    assert_eq!(assist.skill_mods.len(), 4);
}
