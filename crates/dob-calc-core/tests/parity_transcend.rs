//! U91e 升华效果 parity：请求携带 TS 生成的逐侧载荷，Rust 装配后与 TS 逐值对比。
//!
//! 夹具 `transcend_parity.json` 由 TS 侧生成（`.tmp/gen-transcend-parity.ts`）：
//! `settings.transcendEffects` 是 `collectTranscendEffects` 的真实输出，
//! `expected.calculate` / `expected.attributes` 是 `createCharBuildFromSettings(...)` 的实跑值。
//! 覆盖主控（天赋 + 装备 + 技能等级 + 技能替换）、协战两侧、关闭基线与协战命名空间探针。

mod common;

use dob_calc_core::config::{CharSettings, TranscendEffectSet, TranscendPayload, TranscendSide};
use dob_calc_core::context::BuildContext;
use dob_calc_core::evaluate::{
    BuildRequest, CalcSession, PanelSelection, PanelsRequest, evaluate_build, evaluate_panels,
    fingerprint_settings,
};
use dob_calc_core::income::{build_value, calc_equipped_buff_income};
use dob_calc_core::models::LeveledBuff;
use dob_calc_core::record::Record;
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;
use serde_json::{Value, json};

use crate::common::{assert_attrs_close, assert_close, load_fixture};

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

/// 从用例段解析求值请求（`{request: {charId, settings}}`）。
fn request_of(section: &Value) -> BuildRequest {
    BuildRequest::from_json(&json!({
        "charId": section["request"]["charId"],
        "settings": section["request"]["settings"],
    }))
    .expect("用例请求形状非法")
}

/// 单个效果集的技能等级三键合计（第 `slot` 槽）。
fn skill_level_attr_sum(effects: &TranscendEffectSet, slot: usize) -> f64 {
    let key = ["E技能等级", "Q技能等级", "P技能等级"][slot];
    effects
        .buffs
        .iter()
        .map(|buff| buff.data.obj("attr").num(key).unwrap_or(0.0))
        .sum()
}

/// 期望的技能等级加成（U126b）：本侧载荷 BUFF 三键 attr 的数值合计，
/// 与 TS `CharBuild.calculateAttributes()` 的三键同源。
fn expected_skill_level_bonus(settings: &CharSettings) -> [f64; 3] {
    let Some(effects) = settings
        .transcend_effects
        .as_ref()
        .and_then(|payload| payload.for_side(settings.transcend_side))
    else {
        return [0.0; 3];
    };
    [0, 1, 2].map(|slot| skill_level_attr_sum(effects, slot))
}

/// 断言一次求值与夹具期望一致（目标值 + 全属性表 + U99b 技能等级加成属性）。
fn assert_case(tables: &BuildTables, label: &str, section: &Value) -> f64 {
    let request = request_of(section);
    let result = evaluate_build(tables, &request);
    assert!(result.error.is_none(), "{label} 求值不应失败：{:?}", result.error);
    let expected = &section["expected"];
    assert_close(
        result.target_value,
        expected["calculate"].as_f64().unwrap_or(f64::NAN),
        &format!("{label} target_value"),
    );
    let attrs = result.attributes.to_btree();
    assert_attrs_close(&attrs, &expected["attributes"], label);
    // U99b：E/Q/P 属性 = 技能等级加成（不是最终等级），主控 / 协战各自一面
    let bonus = expected_skill_level_bonus(&request.settings);
    for (key, value) in [
        ("E技能等级", bonus[0]),
        ("Q技能等级", bonus[1]),
        ("P技能等级", bonus[2]),
    ] {
        assert_close(
            attrs.get(key).copied().unwrap_or(f64::NAN),
            value,
            &format!("{label} {key}"),
        );
    }
    result.target_value
}

#[test]
fn transcend_parity_all_sides_and_disabled_baseline() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let main = assert_case(&tables, "main", &fixture);
    assert_case(&tables, "skillLevel", &fixture["skillLevel"]);
    assert_case(&tables, "assist1", &fixture["assist1"]);
    assert_case(&tables, "assist2", &fixture["assist2"]);
    assert_case(&tables, "peerProbe", &fixture["peerProbe"]);
    // U99b：协战 E/Q/P 加成属性可被主控表达式读取，各侧取自己的载荷增量（与最终等级区分）
    let mut peer_levels_request = request_of(&fixture["peerProbe"]);
    peer_levels_request.settings.target_function =
        "角色::Q技能等级+协战1::P技能等级+协战2::P技能等级".to_string();
    let (main_q, a1_p, a2_p) = {
        let payload = peer_levels_request
            .settings
            .transcend_effects
            .as_ref()
            .expect("载荷");
        (
            skill_level_attr_sum(&payload.main, 1),
            payload
                .assist1
                .as_ref()
                .map(|effects| skill_level_attr_sum(effects, 2))
                .unwrap_or(0.0),
            payload
                .assist2
                .as_ref()
                .map(|effects| skill_level_attr_sum(effects, 2))
                .unwrap_or(0.0),
        )
    };
    let peer_levels = evaluate_build(&tables, &peer_levels_request);
    assert!(peer_levels.error.is_none(), "协战等级加成属性表达式求值失败");
    assert_close(
        peer_levels.target_value,
        main_q + a1_p + a2_p,
        "协战等级加成属性表达式",
    );
    // 远程武器技能替换（保留源字段 + 身份替换）
    let ranged = assert_case(&tables, "rangedSkill", &fixture["rangedSkill"]);
    let disabled = assert_case(&tables, "disabled", &fixture["disabled"]);
    // U95：火属性弱点（2008）与敌人抗性同区加算；抗性 0.5 + 弱点 0.54 → ×2.08
    let weakness = assert_case(&tables, "weakness", &fixture["weakness"]);
    let weakness_base = assert_case(&tables, "weaknessBase", &fixture["weaknessBase"]);
    let weakness_dot = assert_case(&tables, "weaknessDot", &fixture["weaknessDot"]);
    let weakness_dot_base = assert_case(&tables, "weaknessDotBase", &fixture["weaknessDotBase"]);
    let weakness_flipped = assert_case(&tables, "weaknessFlipped", &fixture["weaknessFlipped"]);
    let weakness_flipped_base = assert_case(&tables, "weaknessFlippedBase", &fixture["weaknessFlippedBase"]);
    assert!(
        (weakness / weakness_base - 2.08).abs() < 1e-9,
        "火属性弱点应让抗性区 ×2.08（{weakness} / {weakness_base}）"
    );
    assert!(
        (weakness_flipped / weakness_flipped_base - 1.108).abs() < 1e-9,
        "转属克翻转抗性 -4 同样叠加弱点（{weakness_flipped} / {weakness_flipped_base}）"
    );
    assert!(
        (weakness_dot / weakness_dot_base - 2.08).abs() < 1e-9,
        "DOT ownZone 应吃角色元素弱点（{weakness_dot} / {weakness_dot_base}）"
    );
    // U95-fix：全属性弱点只作用于六元素分量（物理不变）、非匹配元素弱点不生效
    let all_weak_element = assert_case(&tables, "allWeakElement", &fixture["allWeakElement"]);
    let all_weak_element_base = assert_case(&tables, "allWeakElementBase", &fixture["allWeakElementBase"]);
    let all_weak_physical = assert_case(&tables, "allWeakPhysical", &fixture["allWeakPhysical"]);
    let all_weak_physical_base = assert_case(&tables, "allWeakPhysicalBase", &fixture["allWeakPhysicalBase"]);
    let non_match = assert_case(&tables, "nonMatchWeak", &fixture["nonMatchWeak"]);
    let non_match_base = assert_case(&tables, "nonMatchWeakBase", &fixture["nonMatchWeakBase"]);
    assert!(
        (all_weak_element / all_weak_element_base - 2.08).abs() < 1e-9,
        "全属性弱点应作用于六元素分量（{all_weak_element} / {all_weak_element_base}）"
    );
    assert_close(all_weak_physical, all_weak_physical_base, "全属性弱点不得影响物理分量");
    assert!(
        (non_match / non_match_base - 1.0).abs() < 1e-9,
        "非匹配元素弱点不得生效（{non_match} / {non_match_base}）"
    );
    // U95-fix + U101b：DOT ownFreq/otherFreq 同时非零，otherZone 只吃全属性弱点。
    // §123 后其余属性种数由「六元素追伤非零项 ∪ 角色元素」推导，夹具已改为注入一条
    // 非自身元素（水）追伤使 otherCount = 1，否则 otherFreq 恒 0、全属性弱点无从体现。
    let dot_zone_base = assert_case(&tables, "dotZoneBase", &fixture["dotZoneBase"]);
    let dot_zone_element = assert_case(&tables, "dotZoneElement", &fixture["dotZoneElement"]);
    let dot_zone_all = assert_case(&tables, "dotZoneAll", &fixture["dotZoneAll"]);
    assert!(
        dot_zone_element > dot_zone_base,
        "角色元素弱点应提高 DOT ownZone（{dot_zone_element} / {dot_zone_base}）"
    );
    assert!(
        dot_zone_all > dot_zone_element,
        "全属性弱点应同时提高 otherZone（{dot_zone_all} / {dot_zone_element}）"
    );
    // 元素弱点七键必须全部进入属性表（零值也不得缺失），与 TS `CharAttr` 逐键一致
    let weakness_request = request_of(&fixture["weakness"]);
    let weakness_attrs = evaluate_build(&tables, &weakness_request).attributes.to_btree();
    for key in ["火属性弱点", "水属性弱点", "雷属性弱点", "风属性弱点", "光属性弱点", "暗属性弱点", "全属性弱点"] {
        assert!(weakness_attrs.contains_key(key), "元素弱点键缺失：{key}");
    }
    assert_close(
        weakness_attrs.get("火属性弱点").copied().unwrap_or(0.0),
        0.54,
        "火属性弱点",
    );

    // 载荷确实是差异来源：剥离载荷后主控数值不等于期望
    let mut bare = request_of(&fixture);
    bare.settings.transcend_effects = None;
    let bare_value = evaluate_build(&tables, &bare).target_value;
    assert!(
        (bare_value - main).abs() > 1e-6,
        "剥离升华载荷后数值不应相同（bare {bare_value} vs {main}）"
    );
    let mut bare_ranged = request_of(&fixture["rangedSkill"]);
    bare_ranged.settings.transcend_effects = None;
    let bare_ranged_value = evaluate_build(&tables, &bare_ranged).target_value;
    assert!(
        (bare_ranged_value - ranged).abs() > 1e-6,
        "武器技能替换必须改变数值（bare {bare_ranged_value} vs {ranged}）"
    );
    assert!(disabled > 0.0);
}

#[test]
fn transcend_skill_level_bonus_changes_value() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let with_bonus = assert_case(&tables, "skillLevel", &fixture["skillLevel"]);
    let without_bonus = assert_case(&tables, "skillLevelBase", &fixture["skillLevelBase"]);
    assert!(
        (with_bonus - without_bonus).abs() > 1e-6,
        "技能等级增量必须改变 E 技能伤害（{with_bonus} vs {without_bonus}）"
    );
    // U99b：属性 = 技能等级加成（载荷 E+1 → 1/0/0；基线无加成 → 0）
    let attrs_with = evaluate_build(&tables, &request_of(&fixture["skillLevel"]))
        .attributes
        .to_btree();
    assert_close(
        attrs_with.get("E技能等级").copied().unwrap_or(f64::NAN),
        1.0,
        "E技能等级 with bonus",
    );
    assert_close(
        attrs_with.get("Q技能等级").copied().unwrap_or(f64::NAN),
        0.0,
        "Q技能等级 with bonus",
    );
    assert_close(
        attrs_with.get("P技能等级").copied().unwrap_or(f64::NAN),
        0.0,
        "P技能等级 with bonus",
    );
    let attrs_base = evaluate_build(&tables, &request_of(&fixture["skillLevelBase"]))
        .attributes
        .to_btree();
    assert_close(
        attrs_base.get("E技能等级").copied().unwrap_or(f64::NAN),
        0.0,
        "E技能等级 base",
    );
}

#[test]
fn transcend_skill_level_bonus_is_attribute_not_final_level() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    // 协战一：1506（技能威力）+ 1512 满词条（被动技能等级 +8）
    let request = request_of(&fixture["assist1"]);
    let mut context = BuildContext::new(&tables, request.char_id, &request.settings).expect("协战装配");
    assert_eq!(context.skill_level_bonus(), [0.0, 0.0, 8.0]);
    // 技能装配仍用最终等级：基础 10 + 8 = 18
    assert_eq!(context.char_skill_levels, [10.0, 10.0, 18.0]);
    assert_eq!(context.char.skills[2].level, 18.0, "被动技能应按最终等级装配");
    let attrs = context.calculate_attributes(false, false).to_btree();
    assert_close(
        attrs.get("P技能等级").copied().unwrap_or(f64::NAN),
        8.0,
        "assist1 P技能等级 属性 = 加成",
    );
}

#[test]
fn transcend_negative_skill_level_bonus_clamps_to_one() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let section = &fixture["negativeSkillLevel"];
    // 目标值 / 全属性表与 TS 逐值一致（属性 Q = -20，E/P = 0）
    assert_case(&tables, "negativeSkillLevel", section);
    let request = request_of(section);
    let mut context = BuildContext::new(&tables, request.char_id, &request.settings).expect("负加成装配");
    assert_eq!(context.skill_level_bonus(), [0.0, -20.0, 0.0]);
    // 最终技能等级 = 10 - 20 → 钳 1；技能按钳后等级装配
    assert_eq!(context.char_skill_levels, [10.0, 1.0, 10.0]);
    assert_eq!(context.char.skills[1].level, 1.0, "Q 技能等级应钳制到 1");
    let attrs = context.calculate_attributes(false, false).to_btree();
    assert_close(
        attrs.get("Q技能等级").copied().unwrap_or(f64::NAN),
        -20.0,
        "negativeSkillLevel Q技能等级",
    );
}

#[test]
fn transcend_fingerprint_tracks_payload() {
    let fixture = load_fixture("transcend_parity");
    let with_payload = request_of(&fixture).settings;
    let fp = |settings: &dob_calc_core::config::CharSettings, assembly_only: bool| {
        fingerprint_settings(settings, assembly_only, None)
    };
    let mut without = with_payload.clone();
    without.transcend_effects = None;

    // 非空载荷进入指纹（求值 / 装配两档都要敏感）
    assert_ne!(fp(&with_payload, false), fp(&without, false));
    assert_ne!(fp(&with_payload, true), fp(&without, true));

    // 空载荷与未携带逐位一致
    let mut empty = with_payload.clone();
    empty.transcend_effects = Some(TranscendPayload::default());
    assert_eq!(fp(&empty, false), fp(&without, false));

    // 切侧：同一载荷下主控与协战一侧的装配结果不同，侧别必须进指纹
    let mut assist_side = with_payload.clone();
    assist_side.transcend_side = dob_calc_core::config::TranscendSide::Assist1;
    assert_ne!(fp(&assist_side, true), fp(&without, true));
    assert_ne!(fp(&assist_side, true), fp(&with_payload, true));
}

#[test]
fn transcend_fingerprint_tracks_assist_payload_changes() {
    // P1 回归：主控载荷完全不变、只改 assist1/assist2 载荷也必须换指纹
    let fixture = load_fixture("transcend_parity");
    let base = request_of(&fixture).settings;
    let fp = |settings: &CharSettings| (
        fingerprint_settings(settings, false, None),
        fingerprint_settings(settings, true, None),
    );

    let mut changed_assist1 = base.clone();
    let payload = changed_assist1.transcend_effects.as_mut().expect("载荷");
    let buff = payload
        .assist1
        .as_mut()
        .expect("assist1")
        .buffs
        .first_mut()
        .expect("assist1 至少一条 BUFF");
    buff.data.insert("attr", json!({"技能威力": 2.0}));
    let (eval_fp, assembly_fp) = fp(&changed_assist1);
    assert_ne!(eval_fp, fp(&base).0, "assist1 载荷变化必须改变求值指纹");
    assert_ne!(assembly_fp, fp(&base).1, "assist1 载荷变化必须改变装配指纹");

    let mut changed_assist2 = base.clone();
    let payload = changed_assist2.transcend_effects.as_mut().expect("载荷");
    let buff = payload
        .assist2
        .as_mut()
        .expect("assist2")
        .buffs
        .first_mut()
        .expect("assist2 至少一条 BUFF");
    buff.data.insert("attr", json!({"技能威力": 2.0}));
    let (eval_fp, assembly_fp) = fp(&changed_assist2);
    assert_ne!(eval_fp, fp(&base).0, "assist2 载荷变化必须改变求值指纹");
    assert_ne!(assembly_fp, fp(&base).1, "assist2 载荷变化必须改变装配指纹");

    // 主控侧载荷变化同样敏感（既有行为不回退）
    let mut changed_main = base.clone();
    let payload = changed_main.transcend_effects.as_mut().expect("载荷");
    payload.main.buffs.first_mut().expect("main BUFF").data.insert("attr", json!({"攻击": 9.9}));
    assert_ne!(fp(&changed_main).0, fp(&base).0);
}

#[test]
fn transcend_fingerprint_is_insertion_order_stable() {
    // 同一载荷、不同 JSON 插入顺序（技能替换键 / 字段改写键）必须得到同一指纹
    let payload = |replacements: Value| {
        json!({
            "transcendEffects": {
                "main": {
                    "buffs": [
                        {"data": {"名称": "顺序测试", "attr": {"攻击": 0.1, "技能威力": 0.2}}, "level": 1},
                        {"data": {"名称": "等级测试", "attr": {"E技能等级": 1}}, "level": 1}
                    ],
                    "skillReplacements": replacements
                }
            }
        })
    };
    let forward: Value = serde_json::from_str(
        r#"{"310201": {"id": 1, "字段改写": {"伤害": {"值": 1}, "范围": {"值": 2}}},
            "2040601": {"id": 2, "移除字段": ["x"]}}"#,
    )
    .expect("合法 JSON");
    let reverse: Value = serde_json::from_str(
        r#"{"2040601": {"移除字段": ["x"], "id": 2},
            "310201": {"字段改写": {"范围": {"值": 2}, "伤害": {"值": 1}}, "id": 1}}"#,
    )
    .expect("合法 JSON");
    let first = CharSettings::from_json(&payload(forward));
    let second = CharSettings::from_json(&payload(reverse));
    assert_eq!(
        fingerprint_settings(&first, false, None),
        fingerprint_settings(&second, false, None),
        "技能替换 / 字段改写的插入顺序不得影响指纹"
    );

    // BUFF 顺序是语义顺序（装配按载荷顺序追加），顺序变化必须换指纹
    let two_buffs = |buffs: Value| {
        CharSettings::from_json(&json!({
            "transcendEffects": {"main": {"buffs": buffs}}
        }))
    };
    let ordered = two_buffs(json!([
        {"data": {"名称": "A", "attr": {"攻击": 0.1}}, "level": 1},
        {"data": {"名称": "B", "attr": {"攻击": 0.2}}, "level": 1}
    ]));
    let swapped = two_buffs(json!([
        {"data": {"名称": "B", "attr": {"攻击": 0.2}}, "level": 1},
        {"data": {"名称": "A", "attr": {"攻击": 0.1}}, "level": 1}
    ]));
    assert_ne!(
        fingerprint_settings(&ordered, false, None),
        fingerprint_settings(&swapped, false, None),
        "BUFF 载荷顺序必须进入指纹"
    );
}

#[test]
fn transcend_income_and_panels_parity() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let section = &fixture["income"];
    let request = request_of(section);
    let buff_name = section["buffName"].as_str().expect("buffName");

    // 基线 = 含升华效果的构筑伤害
    let base = build_value(&tables, request.char_id, &request.settings, None);
    assert_close(
        base,
        section["base"].as_f64().unwrap_or(f64::NAN),
        "income base",
    );
    // 合成 BUFF 的移除收益：与 TS `calcEquippedBuffIncome`（clone 后按名过滤）同值
    let income = calc_equipped_buff_income(
        &tables,
        request.char_id,
        &request.settings,
        buff_name,
        None,
        Some(base),
    );
    assert_close(
        income,
        section["expectedIncome"].as_f64().unwrap_or(f64::NAN),
        "talent buff income",
    );
    assert!(income.abs() > 1e-9, "升华天赋收益不应为 0");

    // 面板走同一装配：角色面板与期望属性逐值一致
    let panels = evaluate_panels(
        &tables,
        &PanelsRequest {
            char_id: request.char_id,
            settings: request.settings.clone(),
            panels: PanelSelection {
                include_char: true,
                slots: Vec::new(),
            },
        },
    )
    .expect("面板求值");
    assert_attrs_close(
        &panels["char"].to_btree(),
        &fixture["expected"]["attributes"],
        "panels char",
    );
}

#[test]
fn transcend_skill_weapon_level_uses_boosted_levels() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    // 找一个同律武器来源技能为 Q（默认 `[1]`）的角色：技能等级增量必须作用到同律武器等级
    let mut target = None;
    for (char_id, raw) in &tables.chars {
        let Some(weapon) = raw.objs("同律武器").into_iter().next() else {
            continue;
        };
        let index = match weapon.value("skill") {
            Some(Value::Array(items)) => items
                .iter()
                .find_map(|item| {
                    let value = item.as_f64()?;
                    (value.is_finite() && value.fract() == 0.0 && value >= 0.0)
                        .then_some(value as i64)
                })
                .unwrap_or(2),
            _ => 1,
        };
        if index == 1 {
            target = Some(*char_id);
            break;
        }
    }
    let Some(char_id) = target else {
        eprintln!("无 Q 来源同律武器角色，跳过");
        return;
    };

    let mut settings = CharSettings::default();
    settings.char_skill_level = [10.0, 10.0, 10.0];
    let baseline = BuildContext::new(&tables, char_id, &settings).expect("基础装配");
    let base_level = baseline
        .skill_weapon
        .as_ref()
        .expect("同律武器")
        .skill_level;
    assert_eq!(base_level, 10.0);

    let bonus = TranscendEffectSet::from_json(Some(&json!({
        "buffs": [{"data": {"名称": "测试·Q技能等级", "attr": {"Q技能等级": 3}}, "level": 1}]
    })));
    settings.transcend_effects = Some(TranscendPayload {
        main: bonus,
        assist1: None,
        assist2: None,
    });
    let boosted = BuildContext::new(&tables, char_id, &settings).expect("升华装配");
    let boosted_level = boosted
        .skill_weapon
        .as_ref()
        .expect("同律武器")
        .skill_level;
    // Q 10 → 13，按同律武器技能等级上限 12 钳制（与 TS `_maxSkillLevel` 一致）
    assert_eq!(boosted_level, 12.0, "同律武器技能等级应使用叠加后的角色技能等级");
}

#[test]
fn calc_session_reassembles_when_assist_payload_changes() {
    // P1 实证回归：同一 `dobcc_calc_*` 会话内只改 assist1 载荷，第二次求值必须更新
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let mut request_a = request_of(&fixture);
    // 主控表达式读取协战面板：结果依赖 peer 装配时的协战载荷
    request_a.settings.target_function = "协战1::技能威力".to_string();
    let mut request_b = request_a.clone();
    let payload = request_b.settings.transcend_effects.as_mut().expect("载荷");
    let buff = payload
        .assist1
        .as_mut()
        .expect("assist1")
        .buffs
        .first_mut()
        .expect("assist1 至少一条 BUFF");
    buff.data.insert("attr", json!({"技能威力": 2.0}));

    let mut session = CalcSession::new(&tables);
    let first = session.evaluate(&request_a).target_value;
    let second = session.evaluate(&request_b).target_value;
    let fresh = evaluate_build(&tables, &request_b).target_value;
    assert!(
        (second - first).abs() > 1e-6,
        "协战载荷变化后会话必须重算（旧值 {first} vs 新值 {second}）"
    );
    assert_close(second, fresh, "calc session assist1 payload");
    // 切回 A：同样必须重算回 A 的值
    let third = session.evaluate(&request_a).target_value;
    assert_close(third, first, "calc session back to A");
}

/// 覆盖载荷的请求配置（装配侧固定主控）。
fn with_payload(settings: &CharSettings, main: TranscendEffectSet) -> CharSettings {
    let mut next = settings.clone();
    next.transcend_effects = Some(TranscendPayload {
        main,
        assist1: None,
        assist2: None,
    });
    next.transcend_side = TranscendSide::Main;
    next
}

/// 三键合成 BUFF 载荷（名称任意）。
fn skill_level_payload(json: Value) -> TranscendEffectSet {
    TranscendEffectSet::from_json(Some(&json))
}

#[test]
fn transcend_legacy_skill_level_payload_matches_buff_form() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let request = request_of(&fixture["skillLevelBase"]);
    // 旧载荷字段：解析期转成三键合成 BUFF，与等价三键 BUFF 载荷逐位一致
    let legacy = with_payload(
        &request.settings,
        skill_level_payload(json!({"skillLevelBonus": [1, 10, -2]})),
    );
    let modern = with_payload(
        &request.settings,
        skill_level_payload(json!({
            "buffs": [{
                "data": {"名称": "合成·技能等级", "attr": {"E技能等级": 1, "Q技能等级": 10, "P技能等级": -2}},
                "level": 1
            }]
        })),
    );
    let mut legacy_context =
        BuildContext::new(&tables, request.char_id, &legacy).expect("旧载荷装配");
    let mut modern_context =
        BuildContext::new(&tables, request.char_id, &modern).expect("新载荷装配");
    // 基础 [10,10,10] + [1,10,-2] = [11,20,8]（逐槽 round + 钳 1..30）
    assert_eq!(legacy_context.char_skill_levels, [11.0, 20.0, 8.0]);
    assert_eq!(modern_context.char_skill_levels, [11.0, 20.0, 8.0]);
    assert_eq!(legacy_context.char.skills[1].level, 20.0);
    let legacy_attrs = legacy_context.calculate_attributes(false, false).to_btree();
    let modern_attrs = modern_context.calculate_attributes(false, false).to_btree();
    for key in ["E技能等级", "Q技能等级", "P技能等级"] {
        assert_close(
            legacy_attrs.get(key).copied().unwrap_or(f64::NAN),
            modern_attrs.get(key).copied().unwrap_or(f64::NAN),
            &format!("旧载荷 vs 三键 BUFF {key}"),
        );
    }
    assert_close(
        legacy_attrs.get("Q技能等级").copied().unwrap_or(f64::NAN),
        10.0,
        "旧载荷 Q技能等级 面板",
    );
}

#[test]
fn transcend_skill_level_buffs_drive_levels_except_conditional() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let request = request_of(&fixture["skillLevelBase"]);
    let mut settings = request.settings.clone();
    settings.transcend_effects = None;

    // 普通三键 BUFF：驱动 Q 10 → 15
    let plain = with_payload(
        &settings,
        skill_level_payload(json!({
            "buffs": [{"data": {"名称": "普通等级", "attr": {"Q技能等级": 5}}, "level": 1}]
        })),
    );
    let context = BuildContext::new(&tables, request.char_id, &plain).expect("普通三键装配");
    assert_eq!(context.char_skill_levels, [10.0, 15.0, 10.0]);
    assert_eq!(context.char.skills[1].level, 15.0, "Q 技能按新等级装配");

    // 条件 BUFF（`技能` 限定）只作用于命中字段，不进全局来源表：等级不变（与 TS 同口径）
    let conditional = with_payload(
        &settings,
        skill_level_payload(json!({
            "buffs": [{"data": {"名称": "条件等级", "技能": "E", "attr": {"Q技能等级": 5}}, "level": 1}]
        })),
    );
    let mut context =
        BuildContext::new(&tables, request.char_id, &conditional).expect("条件三键装配");
    assert_eq!(context.char_skill_levels, [10.0, 10.0, 10.0]);
    assert_eq!(context.skill_level_bonus(), [0.0, 0.0, 0.0]);
    let attrs = context.calculate_attributes(false, false).to_btree();
    assert_close(
        attrs.get("Q技能等级").copied().unwrap_or(f64::NAN),
        0.0,
        "条件三键不进面板",
    );

    // 字符串表达式三键只展示、不驱动等级（求值回写 props 后仍从加成中扣除，TS 同口径）
    let expression = with_payload(
        &settings,
        skill_level_payload(json!({
            "buffs": [{"data": {"名称": "表达式等级", "attr": {"Q技能等级": "1+1"}}, "level": 1}]
        })),
    );
    let mut context =
        BuildContext::new(&tables, request.char_id, &expression).expect("表达式三键装配");
    assert_eq!(context.char_skill_levels, [10.0, 10.0, 10.0]);
    let attrs = context.calculate_attributes(false, false).to_btree();
    assert_close(
        attrs.get("Q技能等级").copied().unwrap_or(f64::NAN),
        2.0,
        "表达式三键面板按求值展示",
    );
    assert_eq!(context.skill_level_bonus(), [0.0, 0.0, 0.0]);
    assert_eq!(context.char_skill_levels, [10.0, 10.0, 10.0]);
}

#[test]
fn transcend_skill_level_returns_to_base_after_last_source_removed() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let request = request_of(&fixture["skillLevelBase"]);
    let mut settings = request.settings.clone();
    settings.transcend_effects = None;
    let mut context = BuildContext::new(&tables, request.char_id, &settings).expect("基线装配");
    assert_eq!(context.char_skill_levels, [10.0, 10.0, 10.0]);
    // 注入唯一的三键来源并二次装配
    let buff = LeveledBuff::new(
        Record::from_value(&json!({"名称": "临时等级", "attr": {"Q技能等级": 5}})),
        Some(1.0),
    );
    context.push_buff_to_slots(buff);
    context.refresh_skill_levels();
    assert_eq!(context.char_skill_levels, [10.0, 15.0, 10.0]);
    assert_eq!(context.char.skills[1].level, 15.0);
    // 移除最后一个三键来源：等级必须回到基础值（零加成早退会让它停在 15）
    context.buffs.retain(|item| item.name != "临时等级");
    // 无属性 BUFF 推进 memo 版本，让来源表按新状态重建（等价 MOD 回滚后的重算）
    context.push_buff_to_slots(LeveledBuff::new(
        Record::from_value(&json!({"名称": "占位", "attr": {}})),
        Some(1.0),
    ));
    context.refresh_skill_levels();
    assert_eq!(context.char_skill_levels, [10.0, 10.0, 10.0]);
    assert_eq!(context.char.skills[1].level, 10.0);
    assert_eq!(context.skill_level_bonus(), [0.0, 0.0, 0.0]);
}

#[test]
fn transcend_mixed_legacy_and_buff_payload_does_not_double_count() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let request = request_of(&fixture["skillLevelBase"]);
    let mut settings = request.settings.clone();
    settings.transcend_effects = None;
    // 新旧混包：已带 Q 三键 BUFF 时旧字段被忽略，最终 Q = 10 + 10（不是 +20）
    let mixed = with_payload(
        &settings,
        skill_level_payload(json!({
            "buffs": [{"data": {"名称": "新载荷等级", "attr": {"Q技能等级": 10}}, "level": 1}],
            "skillLevelBonus": [0, 10, 0]
        })),
    );
    let mut context = BuildContext::new(&tables, request.char_id, &mixed).expect("混包装配");
    assert_eq!(context.char_skill_levels, [10.0, 20.0, 10.0]);
    assert_close(context.skill_level_bonus()[1], 10.0, "混包 Q 加成");
}

#[test]
fn transcend_skill_level_refresh_is_idempotent() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let fixture = load_fixture("transcend_parity");
    let request = request_of(&fixture["skillLevelBase"]);
    let mut settings = request.settings.clone();
    settings.transcend_effects = None;
    let boosted = with_payload(
        &settings,
        skill_level_payload(json!({
            "buffs": [{"data": {"名称": "普通等级", "attr": {"Q技能等级": 5}}, "level": 1}]
        })),
    );
    let mut context = BuildContext::new(&tables, request.char_id, &boosted).expect("三键装配");
    let levels = context.char_skill_levels;
    let weapon_level = context.skill_weapon.as_ref().map(|weapon| weapon.skill_level);
    let attrs = context.calculate_attributes(false, false).to_btree();
    // 二次装配幂等：属性池不变时不重建，结果逐位一致
    context.refresh_skill_levels();
    assert_eq!(context.char_skill_levels, levels);
    assert_eq!(
        context.skill_weapon.as_ref().map(|weapon| weapon.skill_level),
        weapon_level
    );
    assert_eq!(context.calculate_attributes(false, false).to_btree(), attrs);
}

#[test]
fn transcend_payload_does_not_leak_into_serialized_settings() {
    let fixture = load_fixture("transcend_parity");
    let settings = request_of(&fixture).settings;
    assert!(settings.transcend_effects.is_some(), "夹具应携带载荷");
    let value = settings.to_json_value();
    assert!(value.get("transcendEffects").is_none(), "载荷不得写入序列化配置");
    assert!(value.get("transcendSide").is_none(), "侧别不得写入序列化配置");
    // `transcend` 本体原样回填：自动配装结果需要带回用户的天赋 / 装备配置
    assert_eq!(value.get("transcend"), settings.transcend_raw.as_ref());
    // 往返后载荷丢失（自动配装回填不会重复叠加）
    let reparsed = dob_calc_core::config::CharSettings::from_json(&value);
    assert!(reparsed.transcend_effects.is_none());
    // 技能等级保持原值：回填后再次请求只叠加一次
    assert_eq!(reparsed.char_skill_level, settings.char_skill_level);
    assert_eq!(reparsed.transcend_side, dob_calc_core::config::TranscendSide::Main);
}
