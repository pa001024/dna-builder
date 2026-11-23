//! U105：协战技能字段求值 parity（TS `teamResolver.skillFieldOf` ↔ Rust peer 求值）。
//!
//! 基准值全部来自 TS `normalizeCharSettings` + `createCharBuildFromSettings` 实跑
//! （`.tmp/u105-print.ts`）；`SETTINGS` 是 TS 归一化后落盘的完整配置：
//! 主控黎瑟（4101）+ 协战 1 号菲娜（1801）+ 自定义 BUFF `U105菲娜Q`
//! （`attr: {"火属性追伤": "下午茶开始了::追加伤害倍率"}`）。
//!
//! 覆盖：Q 等级 10 / 12 / 30 逐级取值、三种命名空间写法、未知命名空间、自身同名优先、
//! 缺武器、peer 内团队命名空间隔离、`/` 技能名走 safeName / 表达式标识符。

mod common;

use serde_json::Value;

use dob_calc_core::evaluate::{BuildRequest, evaluate_build, evaluate_expressions};
use dob_calc_core::models::to_expr_identifier;
use dob_calc_core::record::Record;
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

/// TS `normalizeCharSettings` 产出的完整配置（Q=10；其余等级由用例改写 assist1）。
const SETTINGS: &str = r#"{"charLevel":80,"baseName":"涡旋电场","hpPercent":1,"resonanceGain":3,"enemyId":130,"enemyLevel":80,"enemyResistance":0,"isRouge":false,"targetFunction":"","mainTargetEnabled":true,"customVariables":[],"charSkillLevel":[10,10,10],"extraMastery":"","meleeWeapon":10302,"meleeWeaponLevel":80,"meleeWeaponRefine":5,"rangedWeapon":20601,"rangedWeaponLevel":80,"rangedWeaponRefine":5,"auraMod":31524,"imbalance":false,"charMods":[null,null,null,null,null,null,null,null],"meleeMods":[null,null,null,null,null,null,null,null],"rangedMods":[null,null,null,null,null,null,null,null],"skillWeaponMods":[null,null,null,null],"modVariantIndex":0,"modVariants":[],"buffs":[["U105菲娜Q",10]],"customBuff":[],"petId":0,"petLevel":3,"petCoverage":1,"petAutoCoverage":true,"traits":[null,null,null,null],"team1":1801,"team1Weapon":20601,"team1Build":"-","team1BuildVariant":"A","team2":"-","team2Weapon":"-","team2Build":"-","team2BuildVariant":"A","assist1":{"charLevel":80,"charSkillLevel":[10,10,10],"baseName":"“下午茶开始了！”","extraMastery":"","weaponLevel":80,"weaponRefine":5,"targetFunction":"","customVariables":[],"dotSettings":{"skill":0,"melee":0,"ranged":0,"skillweapon":0,"forceOwnAdditionalDamage":false},"enabled":true,"auraMod":0,"charMods":[null,null,null,null,null,null,null,null],"meleeMods":[null,null,null,null,null,null,null,null],"rangedMods":[null,null,null,null,null,null,null,null],"skillWeaponMods":[null,null,null,null],"modVariantIndex":0,"modVariants":[],"buffs":[],"customBuff":[],"useGlobal":false,"effectConfig":{}},"assist2":{"charLevel":80,"charSkillLevel":[10,10,10],"baseName":"","extraMastery":"","weaponLevel":80,"weaponRefine":5,"targetFunction":"","customVariables":[],"dotSettings":{"skill":0,"melee":0,"ranged":0,"skillweapon":0,"forceOwnAdditionalDamage":false},"enabled":true,"auraMod":0,"charMods":[null,null,null,null,null,null,null,null],"meleeMods":[null,null,null,null,null,null,null,null],"rangedMods":[null,null,null,null,null,null,null,null],"skillWeaponMods":[null,null,null,null],"modVariantIndex":0,"modVariants":[],"buffs":[],"customBuff":[],"useGlobal":false,"effectConfig":{}},"timelineDPS":false,"transcend":{"enabled":false,"talentLevels":[],"mainGear":[],"assist1Gear":[],"assist2Gear":[],"gearVariants":[{"id":"A","mainGear":[],"assist1Gear":[],"assist2Gear":[]}],"activeGearVariant":"A"},"useGlobal":false,"effectConfig":{},"dotSettings":{"skill":0,"melee":0,"ranged":0,"skillweapon":0,"forceOwnAdditionalDamage":false},"actions":{"enable":false,"i":[],"b":[],"hp":[],"bgs":[]}}"#;

const MAIN_ID: i64 = 4101;
const FEINA_ID: i64 = 1801;
const SKILL: &str = "下午茶开始了";
const FIELD: &str = "追加伤害倍率";
const BUFF: &str = "U105菲娜Q";
const ISOLATION_BUFF: &str = "U105隔离";

fn tables() -> BuildTables {
    let path = common::fixture_dir().join("modules.json");
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("缺少夹具 {}：{error}", path.display()));
    BuildPayload::from_json(&text)
        .unwrap_or_else(|error| panic!("夹具 {} 解析失败：{error:?}", path.display()))
        .tables
}

/// 注入 BUFF（注册表在夹具里没有自定义条目，与 TS 侧 `buffMap.set` 同口径）。
fn with_buff(mut tables: BuildTables, name: &str, attribute: &str, expression: &str) -> BuildTables {
    tables.buffs.insert(
        name.to_string(),
        Record::from_value(&serde_json::json!({
            "名称": name,
            "描述": "U105 协战技能字段",
            "attr": { attribute: expression },
        })),
    );
    tables
}

fn tables_with_skill_buff() -> BuildTables {
    with_buff(tables(), BUFF, "火属性追伤", &format!("{SKILL}::{FIELD}"))
}

fn settings(q: f64) -> Value {
    let mut value: Value = serde_json::from_str(SETTINGS).expect("SETTINGS 应为合法 JSON");
    value["assist1"]["charSkillLevel"] = serde_json::json!([10, q, 10]);
    value["buffs"] = serde_json::json!([[BUFF, 10]]);
    value
}

fn make_request(settings: &Value, target: &str) -> BuildRequest {
    let mut request = BuildRequest::from_json(&serde_json::json!({
        "charId": MAIN_ID,
        "settings": settings,
        "panels": ["melee", "char"],
    }))
    .expect("请求形状合法");
    request.settings.target_function = target.to_string();
    request
}

/// BUFF 提供的追伤只进武器面板（U112），角色属性不持有。
fn chase_of_panel(result: &dob_calc_core::evaluate::BuildResult, panel: &str) -> f64 {
    result
        .panels
        .get(panel)
        .and_then(|map| map.get("火属性追伤").copied())
        .unwrap_or(0.0)
}

fn assert_rel(actual: f64, expected: f64, label: &str) {
    let tolerance = expected.abs().max(1.0) * 1e-9;
    assert!(
        (actual - expected).abs() <= tolerance,
        "{label}: 本地 {actual} vs TS {expected}（差 {}）",
        actual - expected
    );
}

fn eval(tables: &BuildTables, request: &BuildRequest, expression: &str) -> (Option<f64>, Option<String>) {
    let results = evaluate_expressions(tables, request, &[expression.to_string()]);
    (results[0].value, results[0].error.clone())
}

#[test]
fn assist_skill_field_matches_ts_levels() {
    let tables = tables_with_skill_buff();

    // 数据锚点：菲娜 Q（技能索引 1）「追加伤害倍率」逐级数组（char.data.ts:5072）。
    let feina = tables.chars.get(&FEINA_ID).expect("夹具缺少菲娜");
    let q_skill = &feina.objs("技能")[1];
    let field = q_skill
        .objs("字段")
        .into_iter()
        .find(|item| item.text("名称") == FIELD)
        .expect("菲娜 Q 缺少追加伤害倍率");
    let values = field.nums("值");
    assert_rel(values[9], 0.15, "数组第 10 项");
    assert_rel(values[11], 0.172, "数组第 12 项");
    assert_rel(values[29], 0.37, "数组第 30 项");

    for (q, expected) in [(10.0, 0.15), (12.0, 0.172), (30.0, 0.37)] {
        let request = make_request(&settings(q), &format!("{SKILL}::{FIELD}"));
        let result = evaluate_build(&tables, &request);
        assert!(
            result.error.is_none(),
            "Q={q} 目标函数不应报错：{:?}",
            result.error
        );
        assert_rel(result.target_value, expected, &format!("Q={q} 目标函数"));
        // U112：追伤只在武器面板，角色属性不持有
        assert_eq!(result.attributes.get("火属性追伤"), None, "Q={q} 角色属性不应含追伤");
        assert_rel(chase_of_panel(&result, "melee"), expected, &format!("Q={q} 近战面板 火属性追伤"));
    }
}

#[test]
fn namespace_spellings_and_rejections() {
    let tables = tables_with_skill_buff();
    let request = make_request(&settings(10.0), "");

    // 表达式标识符（引号 / 感叹号被剔除）可命中。
    let (value, error) = eval(&tables, &request, &format!("{SKILL}::{FIELD}"));
    assert_rel(value.unwrap_or(f64::NAN), 0.15, "表达式标识符");
    assert!(error.is_none(), "表达式标识符不应报错：{error:?}");

    // 含引号的全名不是合法词法单元：整条表达式解析失败。
    let (value, error) = eval(&tables, &request, &format!("“{SKILL}！”::{FIELD}"));
    assert!(value.is_none(), "含引号的全名应解析失败");
    assert!(error.is_some(), "含引号的全名应给出错误");

    // 字段不存在：peer 内按 0（不回落主控属性）。
    let (value, error) = eval(&tables, &request, &format!("{SKILL}::不存在字段"));
    assert_eq!(value, Some(0.0));
    assert!(error.is_none(), "未知字段不应报错：{error:?}");

    // forceAttr（`!`）：跳过技能字段，命名空间不可解析 → 0。
    let (value, error) = eval(&tables, &request, &format!("{SKILL}::{FIELD}!"));
    assert_eq!(value, Some(0.0));
    assert!(error.is_none(), "forceAttr 不应报错：{error:?}");

    // 技能命名空间没有函数语义（TS 抛 `技能命名空间不支持函数`）。
    let (value, error) = eval(&tables, &request, &format!("{SKILL}::min(1)"));
    assert!(value.is_none(), "技能命名空间函数应失败");
    assert!(
        error.as_deref().is_some_and(|message| message.contains("技能命名空间不支持函数")),
        "{error:?}"
    );

    // 槽位别名是团队属性命名空间，不是技能字段。
    let (value, error) = eval(&tables, &request, "协战1::追加伤害倍率");
    assert_eq!(value, Some(0.0));
    assert!(error.is_none(), "槽位别名不应报错：{error:?}");

    // 未知技能名 → 无效命名空间（TS 同路径）。
    let (value, error) = eval(&tables, &request, "不存在的技能::追加伤害倍率");
    assert!(value.is_none());
    assert!(
        error.as_deref().is_some_and(|message| message.contains("无效命名空间")),
        "{error:?}"
    );
}

#[test]
fn self_same_name_skill_wins() {
    let tables = tables_with_skill_buff();
    // 主控换成菲娜（Q=10），协战仍是菲娜（Q=30）：同名技能按主控自身技能解析。
    let mut value = settings(30.0);
    value["baseName"] = serde_json::json!("“下午茶开始了！”");
    let mut request = BuildRequest::from_json(&serde_json::json!({
        "charId": FEINA_ID,
        "settings": value,
        "panels": ["melee", "char"],
    }))
    .expect("请求形状合法");
    request.settings.target_function = format!("{SKILL}::{FIELD}");
    let result = evaluate_build(&tables, &request);
    assert_rel(result.target_value, 0.15, "主控自身技能优先");
    assert_eq!(result.attributes.get("火属性追伤"), None, "角色属性不应含追伤");
    assert_rel(chase_of_panel(&result, "melee"), 0.15, "主控自身技能优先（近战面板）");
    // 主控面板 0.15 而非协战 Q=30 的 0.37。
    let (peer, _) = eval(
        &tables,
        &make_request(&settings(30.0), "下午茶开始了::追加伤害倍率"),
        "下午茶开始了::追加伤害倍率",
    );
    assert_rel(peer.unwrap_or(f64::NAN), 0.37, "协战侧仍取 Q=30");
}

#[test]
fn missing_weapon_and_unconfigured_team_are_zero() {
    let tables = tables_with_skill_buff();

    // 缺武器：命名空间仍注册（不是无效命名空间），求值 0。
    let mut no_weapon = settings(10.0);
    no_weapon["team1Weapon"] = serde_json::json!("-");
    let request = make_request(&no_weapon, &format!("{SKILL}::{FIELD}"));
    let result = evaluate_build(&tables, &request);
    assert_eq!(result.target_value, 0.0, "缺武器应为 0");
    assert!(result.error.is_none(), "缺武器不应报错：{:?}", result.error);
    assert_eq!(chase_of_panel(&result, "melee"), 0.0);

    // 完全未配置协战：技能名不是命名空间 → 整条表达式失败（TS 同路径）。
    let mut solo = settings(10.0);
    solo["team1"] = serde_json::json!("-");
    solo["team1Weapon"] = serde_json::json!("-");
    let result = evaluate_build(&tables, &make_request(&solo, &format!("{SKILL}::{FIELD}")));
    assert_eq!(result.target_value, 0.0);
    assert!(
        result
            .error
            .as_deref()
            .is_some_and(|message| message.contains("无效命名空间")),
        "{:?}",
        result.error
    );
}

#[test]
fn peer_context_team_namespaces_stay_zero() {
    let tables = with_buff(
        tables_with_skill_buff(),
        ISOLATION_BUFF,
        "技能威力",
        "黎瑟::技能威力",
    );
    // TS 实跑：带隔离 BUFF 与不带时「持续伤害」同为 9386.531162790698（Q=12），
    // 说明 peer 内 `黎瑟::技能威力` 求值为 0。
    let mut with_isolation = settings(12.0);
    with_isolation["assist1"]["buffs"] = serde_json::json!([[ISOLATION_BUFF, 1]]);
    let mut without = settings(12.0);
    without["assist1"]["buffs"] = serde_json::json!([]);

    let expression = format!("{SKILL}::持续伤害");
    let (hit, error) = eval(&tables, &make_request(&with_isolation, ""), &expression);
    assert!(error.is_none(), "隔离用例不应报错：{error:?}");
    let (base, _) = eval(&tables, &make_request(&without, ""), &expression);
    assert_rel(hit.unwrap_or(f64::NAN), 9386.531162790698, "带隔离 BUFF");
    assert_rel(base.unwrap_or(f64::NAN), 9386.531162790698, "不带隔离 BUFF");
}

#[test]
fn slash_skill_name_uses_safe_name() {
    let mut tables = tables_with_skill_buff();
    // 合成协战角色：技能名含 `/`（safeName 与表达式标识符都是 `U105_测试技能`）。
    tables.chars.insert(
        9901,
        Record::from_value(&serde_json::json!({
            "id": 9901,
            "名称": "U105测试角色",
            "属性": "火",
            "精通": ["重剑"],
            "基础攻击": 100,
            "基础生命": 1000,
            "基础防御": 100,
            "基础护盾": 100,
            "基础神智": 100,
            "技能": [
                {"id": 990101, "名称": "U105/测试技能", "类型": "伤害", "字段": [
                    {"名称": "测试倍率", "值": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}
                ]},
                {"id": 990102, "名称": "U105/Q技能", "类型": "增益", "字段": [
                    {"名称": "Q倍率", "值": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]}
                ]},
                {"id": 990103, "名称": "U105/P技能", "类型": "被动", "字段": []}
            ]
        })),
    );

    assert_eq!(to_expr_identifier("U105/测试技能"), "U105_测试技能");
    assert_eq!(to_expr_identifier("“下午茶开始了！”"), "下午茶开始了");

    // TS 实跑：注册表不含该 BUFF（内容无关），只验证命名空间解析。
    let mut slash = settings(10.0);
    slash["team1"] = serde_json::json!(9901);
    slash["team1Weapon"] = serde_json::json!(10302);
    slash["assist1"]["baseName"] = serde_json::json!("U105/测试技能");
    slash["buffs"] = serde_json::json!([]);
    let request = make_request(&slash, "U105_测试技能::测试倍率");
    let result = evaluate_build(&tables, &request);
    assert!(result.error.is_none(), "斜杠技能名不应报错：{:?}", result.error);
    assert_rel(result.target_value, 10.0, "safeName / 表达式标识符写法");

    // 原始名称里的 `/` 是除号：整条表达式按 `U105 / (测试技能::测试倍率)` 解析 → 无效命名空间。
    let (value, error) = eval(&tables, &request, "U105/测试技能::测试倍率");
    assert!(value.is_none(), "{value:?}");
    assert!(error.is_some(), "斜杠原始名应解析失败");
}
