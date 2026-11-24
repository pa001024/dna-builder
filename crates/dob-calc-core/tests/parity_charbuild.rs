//! P1/P2：CharBuild 固定值 + shardBuild1 端到端（源 `CharBuild.test.ts` + `shardBuild1.ts`）。
//!
//! 口径：`charbuild_fixed.json`（面板/宏/三件套）+ `e2e_shard.json`
//! （byBasename/dotDamage/oneTime 全链路）存档断言；真实求值待建表落地后补。

mod common;

use crate::common::{assert_attrs_close, assert_close, load_fixture};
use dob_calc_core::evaluate::{BuildRequest, evaluate_build};
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;
use std::collections::BTreeMap;
use std::path::PathBuf;

fn tables() -> BuildTables {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).expect("modules.json");
    BuildPayload::from_json(&text).expect("tables").tables
}

#[test]
fn charbuild_fixed_anchors() {
    let fixture = load_fixture("charbuild_fixed");
    let expected = &fixture["expected"];
    assert!(
        expected["calculate"]
            .as_f64()
            .is_some_and(|value| value > 0.0),
        "calculate 应为正"
    );
    assert!(
        expected["攻击"].as_f64().is_some_and(|value| value > 0.0),
        "攻击应为正"
    );
    // 宏关系：DPS ≥ 伤害（攻速/多重 ≥1 的构筑）。
    let harm = expected["目标函数伤害"].as_f64().unwrap_or(-1.0);
    let dps = expected["DPS宏"].as_f64().unwrap_or(-1.0);
    let dph = expected["DPH宏"].as_f64().unwrap_or(-1.0);
    assert!(harm > 0.0 && dps > 0.0 && dph > 0.0, "宏应为正");
    assert!(dps >= harm, "DPS {dps} 应 ≥ 伤害 {harm}");
    // attributes 自洽。
    let attrs: BTreeMap<String, f64> = expected["attributes"]
        .as_object()
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                .collect()
        })
        .unwrap_or_default();
    assert_attrs_close(&attrs, &expected["attributes"], "fixed自洽");
    assert_close(
        crate::common::attr(&attrs, "攻击"),
        expected["攻击"].as_f64().unwrap_or(-1.0),
        "攻击一致",
    );
    assert_eq!(crate::common::attr(&attrs, "不存在的属性"), 0.0);
}

/// 夹具 request 装配口径：`request_from_fixture` 应还原 charId（1501 莉兹贝尔）。
#[test]
fn charbuild_request_shape() {
    let fixture = load_fixture("charbuild_fixed");
    let request = crate::common::request_from_fixture(&fixture);
    assert_eq!(request.char_id, 1501);
    assert_eq!(request.settings.enemy_id, 130);
}

#[test]
fn e2e_shard_anchors() {
    let fixture = load_fixture("e2e_shard");
    let expected = &fixture["expected"];
    // 黄金构筑总量：U112 追伤分池后 `菲娜Q` 四元素追伤只进武器池 Σ 因子
    // （旧逐元素结算 10472063943.883034 → 5634866373.328682）。
    // U114 溯源 / 2026-11-24 基础等级 10 + 溯源 +2：当前 TS 重算 5823675267.58358。
    assert_close(
        expected["calculate"].as_f64().unwrap_or(-1.0),
        5823675267.58358,
        "shard总量",
    );
    // 全链路输出有限。
    assert!(
        expected["targetByBasename"].is_object(),
        "byBasename 应为对象"
    );
    assert!(
        expected["dotDamage"].as_f64().is_some_and(f64::is_finite),
        "dot 有限"
    );
    assert!(
        expected["oneTime"].as_f64().is_some_and(f64::is_finite),
        "oneTime 有限"
    );
    // 快照 charId = 莉兹贝尔 1501。
    assert_eq!(fixture["request"]["charId"].as_u64(), Some(1501));
}

/// 以 `dobapp_OkdnBN3OlC` 的 settings 为底，叠加角色 / 自定义 BUFF / 目标函数 / DOT 配置。
/// `extra_custom_buffs` 追加同名的「自定义BUFF」实例（多个来源共享同一份 customBuff 属性表）。
/// 夹具按「基础 12 + 无溯源载荷」录制；基础上限修正为 10 后注入一条三键 +2 的合成 BUFF，
/// 保持有效等级 12 与原有 TS 锚点不变。用载荷而不是 `customBuff`：后者会被多份
/// `自定义BUFF` 重复应用，把等级加成也叠多次。
fn inject_skill_level_payload(settings: &mut serde_json::Value) {
    let object = settings.as_object_mut().expect("settings 对象");
    if object.contains_key("transcendEffects") {
        return;
    }
    object.insert(
        "transcendEffects".to_string(),
        serde_json::json!({
            "main": {
                "buffs": [{
                    "data": {
                        "名称": "测试技能等级",
                        "attr": {"E技能等级": 2, "Q技能等级": 2, "P技能等级": 2}
                    },
                    "level": 1
                }],
                "skillReplacements": {}
            }
        }),
    );
    object.insert(
        "transcendSide".to_string(),
        serde_json::Value::String("main".to_string()),
    );
}

fn custom_request(
    fixture: &serde_json::Value,
    char_id: serde_json::Value,
    custom_buff: serde_json::Value,
    target: &str,
    extra_custom_buffs: usize,
    dot_settings: Option<&str>,
) -> BuildRequest {
    let mut settings = fixture["request"]["originalSettings"]
        .as_object()
        .map(|_| fixture["request"]["originalSettings"].clone())
        .unwrap_or_else(|| fixture["request"]["settings"].clone());
    inject_skill_level_payload(&mut settings);
    let object = settings.as_object_mut().expect("settings 对象");
    object.insert("customBuff".to_string(), custom_buff);
    object.insert(
        "targetFunction".to_string(),
        serde_json::Value::String(target.to_string()),
    );
    if let Some(dot) = dot_settings {
        object.insert(
            "dotSettings".to_string(),
            serde_json::from_str(dot).expect("dotSettings"),
        );
    }
    // 自定义 BUFF 必须同时在 buffs 里点名才参与装配
    let mut buffs = object
        .get("buffs")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    if !buffs
        .iter()
        .any(|item| item[0].as_str() == Some("自定义BUFF"))
    {
        buffs.push(serde_json::json!(["自定义BUFF", 1]));
    }
    for _ in 0..extra_custom_buffs {
        buffs.push(serde_json::json!(["自定义BUFF", 1]));
    }
    object.insert("buffs".to_string(), serde_json::Value::Array(buffs));
    BuildRequest::from_json(&serde_json::json!({
        "charId": char_id,
        "settings": settings,
    }))
    .expect("request")
}

/// 固定角色（`dobapp_OkdnBN3OlC` 原角色苏乙 1504 / 光）。
fn season_request(
    fixture: &serde_json::Value,
    custom_buff: serde_json::Value,
    target: &str,
    extra_custom_buffs: usize,
    dot_settings: Option<&str>,
) -> BuildRequest {
    custom_request(
        fixture,
        fixture["request"]["charId"].clone(),
        custom_buff,
        target,
        extra_custom_buffs,
        dot_settings,
    )
}

/// U44/U44-fix：`赛季增伤` 独立乘区（自身累加后 ×(1+Σ)），与普通增伤分池。
/// 断言固化为 TS 黄金锚点（2026-11-20，`bun .tmp/u44fix-anchors.ts` 实跑，fixture 同源）。
#[test]
fn season_damage_zone() {
    const TS_DAMAGE_BASE: f64 = 253_470_358.584_691_52;
    const TS_DAMAGE_SEASON_03: f64 = 329_511_466.160_099;
    const TS_DAMAGE_NORMAL_03: f64 = 278_120_613.893_109_4;
    const TS_DAMAGE_TWO_SOURCES: f64 = 304_164_430.301_629_84;
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    // 单次伤害口径：DPS 宏含整数除法，不适合断言线性
    let evaluate = |custom: serde_json::Value, extra: usize| {
        let request = season_request(&fixture, custom, "伤害", extra, None);
        evaluate_build(&tables(), &request)
    };
    let baseline = evaluate(serde_json::json!([]), 0);
    assert!(baseline.error.is_none(), "{:?}", baseline.error);
    assert_close(baseline.target_value, TS_DAMAGE_BASE, "TS 锚点：基线伤害");
    assert_close(
        baseline.attributes.get("赛季增伤").copied().unwrap_or(0.0),
        0.0,
        "基线赛季增伤为 0",
    );

    let season = evaluate(serde_json::json!([["赛季增伤", 0.3]]), 0);
    assert!(season.error.is_none(), "{:?}", season.error);
    // 属性汇总写入新键（自身累加）
    assert_close(
        season.attributes.get("赛季增伤").copied().unwrap_or(0.0),
        0.3,
        "赛季增伤汇总",
    );
    assert_close(season.target_value, TS_DAMAGE_SEASON_03, "TS 锚点：赛季增伤 0.3");
    assert_close(
        season.target_value / baseline.target_value,
        1.3,
        "赛季增伤独立相乘",
    );

    // 多来源先累加：两个自定义 BUFF 各 0.1 → 0.2；若各自成因子会得 1.21
    let multi = evaluate(serde_json::json!([["赛季增伤", 0.1]]), 1);
    assert!(multi.error.is_none(), "{:?}", multi.error);
    assert_close(
        multi.attributes.get("赛季增伤").copied().unwrap_or(0.0),
        0.2,
        "多来源累加",
    );
    assert_close(multi.target_value, TS_DAMAGE_TWO_SOURCES, "TS 锚点：两来源");
    assert_close(
        multi.target_value / baseline.target_value,
        1.2,
        "多来源先累加再相乘",
    );

    // 分池：同数值并入普通增伤只按增伤池稀释。两个方向都断言，
    // 增伤完全失效（ratio=1）或错误同池（ratio=1.3）都会失败。
    let normal = evaluate(serde_json::json!([["增伤", 0.3]]), 0);
    assert_close(normal.target_value, TS_DAMAGE_NORMAL_03, "TS 锚点：普通增伤 0.3");
    let normal_ratio = normal.target_value / baseline.target_value;
    assert!(
        normal_ratio > 1.0 + 1e-9,
        "普通增伤必须生效（{normal_ratio}）"
    );
    assert!(
        normal_ratio < 1.3 - 1e-9,
        "普通增伤不得与赛季增伤同池（{normal_ratio}）"
    );

    // 非负钳制：自定义 BUFF 负值不得产生负伤害（与属性穿透同口径）
    let negative = evaluate(serde_json::json!([["赛季增伤", -1.5]]), 0);
    assert_close(
        negative.attributes.get("赛季增伤").copied().unwrap_or(0.0),
        -1.5,
        "负值原样汇总",
    );
    assert_close(negative.target_value, 0.0, "负值钳制为 0");
}

/// U44-fix：DOT 与单次伤害同口径（TS 黄金锚点 + ×1.3 + 多来源累加）。
#[test]
fn season_damage_dot_zone() {
    const TS_DOT_BASE: f64 = 26_046_437.577_933_17;
    const TS_DOT_SEASON_03: f64 = 33_860_368.851_313_12;
    const TS_DOT_TWO_SOURCES: f64 = 31_255_725.093_519_803;
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let dot = r#"{"skill":0,"melee":1,"ranged":0,"skillweapon":0}"#;
    let evaluate = |custom: serde_json::Value, extra: usize| {
        let request = season_request(&fixture, custom, "melee::DOT伤害", extra, Some(dot));
        evaluate_build(&tables(), &request)
    };
    let baseline = evaluate(serde_json::json!([]), 0);
    assert!(baseline.error.is_none(), "{:?}", baseline.error);
    assert_close(baseline.target_value, TS_DOT_BASE, "TS 锚点：DOT 基线");

    let season = evaluate(serde_json::json!([["赛季增伤", 0.3]]), 0);
    assert!(season.error.is_none(), "{:?}", season.error);
    assert_close(season.target_value, TS_DOT_SEASON_03, "TS 锚点：DOT 赛季 0.3");
    assert_close(
        season.target_value / baseline.target_value,
        1.3,
        "DOT 按赛季增伤独立相乘",
    );

    let multi = evaluate(serde_json::json!([["赛季增伤", 0.1]]), 1);
    assert_close(multi.target_value, TS_DOT_TWO_SOURCES, "TS 锚点：DOT 两来源");
    assert_close(
        multi.target_value / baseline.target_value,
        1.2,
        "DOT 多来源先累加",
    );
}

/// U61：parity 用紧容差（相对 1e-9；既有 `assert_close` 的相对 1e-6 不放宽也不收窄）。
fn assert_parity(actual: f64, expected: f64, label: &str) {
    let tolerance = expected.abs().max(1.0) * 1e-9;
    assert!(
        (actual - expected).abs() <= tolerance,
        "{label}: wasm {actual} vs TS {expected}（差 {}，容差 {tolerance}）",
        actual - expected
    );
}

/// U61：六元素独立增伤键 `*属性增伤`（TS↔wasm 逐元素 parity）。
///
/// 口径：元素池 = 通用 `元素增伤` + 角色属性对应的 `<元素>属性增伤`，其余元素键不生效；
/// 旧 `元素增伤` 路径保留；DOT 不吃元素池（与 TS `calculateDotDamage` 一致）。
/// 黄金锚点为 TS 实跑（2026-11-23 U112 后重跑 `.tmp/u61-anchors.ts`；settings 同
/// `dobapp_OkdnBN3OlC`，仅替换 charId / customBuff / targetFunction）。`[远程]` 为武器池
/// （元素/物理分量分离；追伤整段进 Σ 因子、不再按元素拆分），`伤害` 为技能池（纯元素基座），
/// 两条结算路径各覆盖一遍。
#[test]
fn element_damage_zone() {
    // (元素, 代表角色)：modules.json 中六元素各一
    const ELEMENTS: [(&str, i64); 6] = [
        ("火", 3101),
        ("水", 2101),
        ("雷", 4101),
        ("风", 5101),
        ("光", 1504),
        ("暗", 1101),
    ];
    // TS 锚点：[远程] 武器池（U112：`菲娜Q` 追伤只进 Σ 因子）
    const TS_REMOTE_BASE: [f64; 6] = [
        394_196.711_301_585_54,
        488_584.440_650_645_53,
        378_470.389_527_479_36,
        246_555.450_373_741_97,
        826_821.317_518_307_59,
        347_005.552_850_915_47,
    ];
    const TS_REMOTE_HIT: [f64; 6] = [
        460_635.004_234_398_25,
        571_111.732_199_601_71,
        442_212.741_584_730_86,
        287_346.063_548_374_51,
        967_286.521_254_681_98,
        405_353.932_906_470_32,
    ];
    // TS 锚点：1504/光
    const TS_REMOTE_LEGACY: f64 = 967_286.521_254_681_98;
    const TS_REMOTE_STACK: f64 = 1_060_929.990_412_264_8;
    const TS_REMOTE_MULTI: f64 = 967_286.521_254_681_98;
    // TS 锚点：技能池 `伤害`
    const TS_DAMAGE_BASE: f64 = 253_470_358.584_691_52;
    const TS_DAMAGE_HIT: f64 = 278_120_613.893_109_4;
    const TS_DAMAGE_STACK: f64 = 294_554_117.432_054_7;
    // TS 锚点：AST 字段临时属性 + DOT
    const TS_DOT_BASE: f64 = 26_046_437.577_933_17;

    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let evaluate = |char_id: i64, custom: serde_json::Value, target: &str, extra: usize| {
        let request = custom_request(
            &fixture,
            serde_json::json!(char_id),
            custom,
            target,
            extra,
            None,
        );
        let result = evaluate_build(&tables(), &request);
        assert!(result.error.is_none(), "{:?}", result.error);
        result
    };

    // 1) 逐元素：匹配生效、相邻元素不生效；属性表六个独立桶
    for (index, (element, char_id)) in ELEMENTS.iter().enumerate() {
        let base = evaluate(*char_id, serde_json::json!([]), "[远程]", 0);
        assert_parity(
            base.target_value,
            TS_REMOTE_BASE[index],
            &format!("{element} 基线"),
        );
        assert_parity(
            base.attributes
                .get(element_key(element))
                .copied()
                .unwrap_or(0.0),
            0.0,
            &format!("{element} 基线专属键为 0"),
        );

        let own: String = format!("{element}属性增伤");
        let hit = evaluate(*char_id, serde_json::json!([[own, 0.3]]), "[远程]", 0);
        assert_parity(
            hit.target_value,
            TS_REMOTE_HIT[index],
            &format!("{element} 匹配元素生效"),
        );
        assert_parity(
            hit.attributes
                .get(element_key(element))
                .copied()
                .unwrap_or(0.0),
            0.3,
            &format!("{element} 专属桶汇总"),
        );
        // 独立桶不并入通用桶（与 TS 属性输出同口径；合池只发生在伤害结算）
        assert_parity(
            hit.attributes.get("元素增伤").copied().unwrap_or(0.0),
            0.0,
            &format!("{element} 专属键不进通用桶"),
        );

        // 相邻元素键：U112 追伤不再按元素拆分，错配键对目标值无影响（与基线逐位一致）
        let other = ELEMENTS[(index + 1) % ELEMENTS.len()].0;
        let miss_key: String = format!("{other}属性增伤");
        let miss = evaluate(*char_id, serde_json::json!([[miss_key, 0.3]]), "[远程]", 0);
        assert_parity(
            miss.target_value,
            TS_REMOTE_BASE[index],
            &format!("{element} 角色吃 {other} 键：追伤不拆元素，目标不变"),
        );
        // 不匹配键仍汇总进属性表（只是不进元素池）
        assert_parity(
            miss.attributes
                .get(element_key(&other))
                .copied()
                .unwrap_or(0.0),
            0.3,
            &format!("{other} 键照常汇总"),
        );
    }

    // 2) 旧路径保留：仅 `元素增伤` 与专属键同池等价（0.3 同值同结果）
    let legacy = evaluate(1504, serde_json::json!([["元素增伤", 0.3]]), "[远程]", 0);
    assert_parity(legacy.target_value, TS_REMOTE_LEGACY, "旧元素增伤路径");
    assert_parity(
        legacy.attributes.get("元素增伤").copied().unwrap_or(0.0),
        0.3,
        "通用桶汇总",
    );

    // 3) 叠加：通用 + 专属同池加算（0.2+0.3）
    let stack = evaluate(
        1504,
        serde_json::json!([["元素增伤", 0.2], ["光属性增伤", 0.3]]),
        "[远程]",
        0,
    );
    assert_parity(stack.target_value, TS_REMOTE_STACK, "通用+专属叠加");
    assert!(
        stack.target_value > legacy.target_value,
        "叠加必高于单键 0.3（{} vs {}）",
        stack.target_value,
        legacy.target_value
    );

    // 4) 多来源先累加：两个 自定义BUFF 各 0.15 → 0.3（与单来源 0.3 同位）
    let multi = evaluate(1504, serde_json::json!([["光属性增伤", 0.15]]), "[远程]", 1);
    assert_parity(multi.target_value, TS_REMOTE_MULTI, "多来源累加");
    assert_parity(
        multi.attributes.get("光属性增伤").copied().unwrap_or(0.0),
        0.3,
        "多来源专属桶累加",
    );

    // 5) 技能池（纯元素基座）同口径
    let damage_base = evaluate(1504, serde_json::json!([]), "伤害", 0);
    assert_parity(damage_base.target_value, TS_DAMAGE_BASE, "技能池基线");
    let damage_hit = evaluate(1504, serde_json::json!([["光属性增伤", 0.3]]), "伤害", 0);
    assert_parity(damage_hit.target_value, TS_DAMAGE_HIT, "技能池匹配元素");
    let damage_miss = evaluate(1504, serde_json::json!([["火属性增伤", 0.3]]), "伤害", 0);
    assert_parity(
        damage_miss.target_value,
        TS_DAMAGE_BASE,
        "技能池不匹配不生效",
    );
    let damage_stack = evaluate(
        1504,
        serde_json::json!([["元素增伤", 0.2], ["光属性增伤", 0.3]]),
        "伤害",
        0,
    );
    assert_parity(
        damage_stack.target_value,
        TS_DAMAGE_STACK,
        "技能池通用+专属叠加",
    );

    // 6) AST 字段临时属性：元素键经属性合并进入元素池
    let ast_hit = evaluate(1504, serde_json::json!([]), "[远程]{光属性增伤:0.3}", 0);
    assert_parity(ast_hit.target_value, TS_REMOTE_MULTI, "AST 专属键生效");
    // U112：追伤不按元素拆分，错配键对目标值无影响（= 对应基线）
    let ast_miss = evaluate(1504, serde_json::json!([]), "[远程]{火属性增伤:0.3}", 0);
    assert_parity(ast_miss.target_value, TS_REMOTE_BASE[4], "AST 错配键不影响目标");
    let ast_stack = evaluate(
        1504,
        serde_json::json!([]),
        "[远程]{元素增伤:0.2,光属性增伤:0.3}",
        0,
    );
    assert_parity(ast_stack.target_value, TS_REMOTE_STACK, "AST 通用+专属叠加");

    // 7) DOT 不吃元素池：与基线逐位一致（TS 同口径）
    let dot = r#"{"skill":0,"melee":1,"ranged":0,"skillweapon":0}"#;
    let dot_base = evaluate_build(
        &tables(),
        &custom_request(
            &fixture,
            serde_json::json!(1504),
            serde_json::json!([]),
            "melee::DOT伤害",
            0,
            Some(dot),
        ),
    );
    let dot_elem = evaluate_build(
        &tables(),
        &custom_request(
            &fixture,
            serde_json::json!(1504),
            serde_json::json!([["光属性增伤", 0.3]]),
            "melee::DOT伤害",
            0,
            Some(dot),
        ),
    );
    assert_parity(dot_base.target_value, TS_DOT_BASE, "DOT 基线");
    assert_parity(dot_elem.target_value, TS_DOT_BASE, "DOT 不吃元素增伤");
    assert_eq!(
        dot_elem.target_value.to_bits(),
        dot_base.target_value.to_bits(),
        "DOT 元素键必须逐位不影响"
    );
}

/// 元素键名（与 TS `CharAttr` 完全同名）。
fn element_key(element: &str) -> &'static str {
    match element {
        "火" => "火属性增伤",
        "水" => "水属性增伤",
        "雷" => "雷属性增伤",
        "风" => "风属性增伤",
        "光" => "光属性增伤",
        "暗" => "暗属性增伤",
        _ => panic!("未知元素 {element}"),
    }
}

/// U62：MOD属性加权用的合成 MOD（狮鹫系列 / 角色槽）。`加成` 用单元素数组，
/// 取值与等级无关（TS `calculateBonusValue` 与 Rust 同口径，数组按下标取绝对值），
/// 避免标量等级缩放的浮点误差污染 anchor。
fn u62_mod_record(id: i64, bonus: serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "名称": "U62测试",
        "系列": "狮鹫",
        "品质": "金",
        "耐受": 0,
        "类型": "角色",
        "加成": bonus,
    })
}

/// U62 合成 MOD 的 id 表：一条 MOD 一种 `加成`（避免每个场景重建整份表）。
const U62_MOD_IDS: [(i64, &str); 7] = [
    (990001, "empty"),
    (990002, "thunder"),
    (990003, "fire"),
    (990004, "element+thunder"),
    (990005, "element"),
    (990006, "light"),
    (990007, "element+light"),
];

fn u62_mod_id(key: &str) -> i64 {
    U62_MOD_IDS
        .iter()
        .find(|(_, name)| *name == key)
        .map(|(id, _)| *id)
        .expect("U62 合成 MOD")
}

fn u62_bonus(key: &str) -> serde_json::Value {
    match key {
        "empty" => serde_json::json!({}),
        "thunder" => serde_json::json!({ "雷属性增伤": [0.3] }),
        "fire" => serde_json::json!({ "火属性增伤": [0.3] }),
        "element+thunder" => serde_json::json!({ "元素增伤": [0.2], "雷属性增伤": [0.3] }),
        "element" => serde_json::json!({ "元素增伤": [0.2] }),
        "light" => serde_json::json!({ "光属性增伤": [0.3] }),
        "element+light" => serde_json::json!({ "元素增伤": [0.2], "光属性增伤": [0.3] }),
        _ => panic!("未知 U62 MOD {key}"),
    }
}

/// 在 `modules.json` 基础上追加 U62 合成 MOD 后建表。
fn u62_tables() -> BuildTables {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).expect("modules.json");
    let mut root: serde_json::Value = serde_json::from_str(&text).expect("modules.json 解析");
    let mods = root
        .get_mut("mod.data")
        .and_then(serde_json::Value::as_array_mut)
        .expect("mod.data");
    for (id, key) in U62_MOD_IDS {
        mods.push(u62_mod_record(id, u62_bonus(key)));
    }
    BuildPayload::from_json(&root.to_string())
        .expect("tables")
        .tables
}

/// U62 请求：夹具 settings + 自定义 BUFF + 单个合成角色槽 MOD。
fn u62_request(
    fixture: &serde_json::Value,
    char_id: i64,
    mod_key: &str,
    custom_buff: serde_json::Value,
    target: &str,
    dot_settings: Option<&str>,
) -> BuildRequest {
    let mut settings = fixture["request"]["originalSettings"]
        .as_object()
        .map(|_| fixture["request"]["originalSettings"].clone())
        .unwrap_or_else(|| fixture["request"]["settings"].clone());
    inject_skill_level_payload(&mut settings);
    let object = settings.as_object_mut().expect("settings 对象");
    object.insert(
        "charMods".to_string(),
        serde_json::json!([[u62_mod_id(mod_key), 10]]),
    );
    object.insert("customBuff".to_string(), custom_buff);
    object.insert(
        "targetFunction".to_string(),
        serde_json::Value::String(target.to_string()),
    );
    if let Some(dot) = dot_settings {
        object.insert(
            "dotSettings".to_string(),
            serde_json::from_str(dot).expect("dotSettings"),
        );
    }
    let mut buffs = object
        .get("buffs")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    if !buffs
        .iter()
        .any(|item| item[0].as_str() == Some("自定义BUFF"))
    {
        buffs.push(serde_json::json!(["自定义BUFF", 1]));
    }
    object.insert("buffs".to_string(), serde_json::Value::Array(buffs));
    BuildRequest::from_json(&serde_json::json!({
        "charId": char_id,
        "settings": settings,
    }))
    .expect("request")
}

/// U62：元素限定键不得并入通用 `元素增伤`（MOD属性加权只落同名键）。
///
/// 黄金锚点为 TS 实跑（`.tmp/u62-anchors.ts`；U112 后重跑），settings 同 `dobapp_OkdnBN3OlC`，
/// 仅替换 charId / customBuff / targetFunction / charMods。A 组 = 黎瑟 4101 / 雷 /
/// 武器池 `[远程]`，`雷MOD属性 0.5`（U112：`菲娜Q` 追伤只进 Σ 因子，错配元素键不影响目标）；
/// B 组 = 苏乙 1504 / 光 / 技能池 `伤害`，`光MOD属性 0.5`。
#[test]
fn element_damage_mod_weight() {
    // A 组 TS 锚点（`[远程]`；U112 追伤分池）
    const TS_REMOTE_BASE: f64 = 125_130.090_401_489_87;
    const TS_REMOTE_HIT: f64 = 156_247.808_974_162_27;
    const TS_REMOTE_MISS: f64 = 125_130.090_401_489_87;
    const TS_REMOTE_STACK: f64 = 176_992.954_689_277_16;
    const TS_REMOTE_LEGACY_MOD: f64 = 145_875.236_116_604_76;
    const TS_REMOTE_BUFF_STACK: f64 = 159_705.333_260_014_71;
    const TS_DOT_BASE: f64 = 8_359_132.467_952_507;
    // B 组 TS 锚点（`伤害` 技能池）
    const TS_DAMAGE_BASE: f64 = 26_661_135.540_486_883;
    const TS_DAMAGE_HIT: f64 = 31_167_727.483_459_506;
    const TS_DAMAGE_STACK: f64 = 34_172_122.112_107_91;
    const TS_DAMAGE_LEGACY_MOD: f64 = 29_665_530.169_135_295;

    let tables = u62_tables();
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let dot = r#"{"skill":0,"melee":1,"ranged":0,"skillweapon":0}"#;
    let evaluate = |char_id: i64,
                    mod_key: &str,
                    custom: serde_json::Value,
                    target: &str,
                    dot_settings: Option<&str>| {
        let request = u62_request(&fixture, char_id, mod_key, custom, target, dot_settings);
        let result = evaluate_build(&tables, &request);
        assert!(result.error.is_none(), "{:?}", result.error);
        result
    };

    // ---- A 组：黎瑟 4101 / 雷，MOD属性 0.5，MOD 提供元素限定增伤 ----
    let mod_attr = serde_json::json!([["雷MOD属性", 0.5]]);
    let base = evaluate(4101, "empty", mod_attr.clone(), "[远程]", None);
    assert_parity(base.target_value, TS_REMOTE_BASE, "A 基线");

    let hit = evaluate(4101, "thunder", mod_attr.clone(), "[远程]", None);
    assert_parity(hit.target_value, TS_REMOTE_HIT, "A 匹配雷属性增伤");
    // 硬断言：元素限定键对通用桶贡献为 0（不是注释）
    assert_eq!(
        hit.attributes.get("元素增伤").copied().unwrap_or(0.0),
        0.0,
        "雷属性增伤不得计入通用元素增伤桶"
    );
    assert_eq!(
        hit.attributes
            .get("元素增伤")
            .copied()
            .unwrap_or(1.0)
            .to_bits(),
        0.0f64.to_bits(),
        "通用元素增伤桶必须逐位为 0"
    );
    // 加权下沉到同名键：0.3 + 0.5 × 0.3
    assert_parity(
        hit.attributes.get("雷属性增伤").copied().unwrap_or(0.0),
        0.3 + 0.5 * 0.3,
        "雷属性增伤桶含 MOD属性加权",
    );
    assert!(hit.attributes.get("雷属性增伤").copied().unwrap_or(0.0) > 0.0);

    // 同一构筑换成相邻元素键：U112 追伤整段只进 Σ 因子、不按元素拆分，目标值应逐位等于基线
    let miss = evaluate(4101, "fire", mod_attr.clone(), "[远程]", None);
    assert_parity(miss.target_value, TS_REMOTE_MISS, "A 相邻元素键不影响目标");
    assert_eq!(
        miss.target_value.to_bits(),
        base.target_value.to_bits(),
        "A 不匹配元素键必须逐位等于基线"
    );
    assert_eq!(
        miss.attributes.get("元素增伤").copied().unwrap_or(0.0),
        0.0,
        "A 不匹配键同样不得污染通用桶"
    );
    assert_parity(
        miss.attributes.get("火属性增伤").copied().unwrap_or(0.0),
        0.3 + 0.5 * 0.3,
        "A 不匹配键照常汇总（含加权）",
    );

    // 叠加：MOD 元素增伤 0.2 + 雷属性增伤 0.3（加权后 0.3 + 0.45）
    let stack = evaluate(4101, "element+thunder", mod_attr.clone(), "[远程]", None);
    assert_parity(stack.target_value, TS_REMOTE_STACK, "A 叠加");
    assert_parity(
        stack.attributes.get("元素增伤").copied().unwrap_or(0.0),
        0.2 + 0.5 * 0.2,
        "A 叠加时通用桶只含自身",
    );
    assert_parity(
        stack.attributes.get("雷属性增伤").copied().unwrap_or(0.0),
        0.3 + 0.5 * 0.3,
        "A 叠加时元素桶独立",
    );

    // 旧路径保留：MOD 仅 `元素增伤` 时仍按 MOD属性加权（不被移除）
    let legacy_mod = evaluate(4101, "element", mod_attr.clone(), "[远程]", None);
    assert_parity(
        legacy_mod.target_value,
        TS_REMOTE_LEGACY_MOD,
        "A 仅元素增伤的旧路径",
    );
    assert_parity(
        legacy_mod
            .attributes
            .get("元素增伤")
            .copied()
            .unwrap_or(0.0),
        0.2 + 0.5 * 0.2,
        "A 旧路径 MOD 加权保留",
    );
    assert_eq!(
        legacy_mod
            .attributes
            .get("雷属性增伤")
            .copied()
            .unwrap_or(0.0),
        0.0,
        "A 旧路径不得写入元素键"
    );

    // BUFF 来源的元素键不参与 MOD属性加权（加权只作用于 MOD 词条）
    let buff_stack = evaluate(
        4101,
        "empty",
        serde_json::json!([["雷MOD属性", 0.5], ["元素增伤", 0.2], ["雷属性增伤", 0.3]]),
        "[远程]",
        None,
    );
    assert_parity(buff_stack.target_value, TS_REMOTE_BUFF_STACK, "A BUFF 叠加");
    assert_parity(
        buff_stack
            .attributes
            .get("元素增伤")
            .copied()
            .unwrap_or(0.0),
        0.2,
        "A BUFF 通用桶不加权",
    );
    assert_parity(
        buff_stack
            .attributes
            .get("雷属性增伤")
            .copied()
            .unwrap_or(0.0),
        0.3,
        "A BUFF 元素键不参与 MOD 加权",
    );

    // DOT 只吃增伤池：元素键与通用元素增伤均不参与（逐位）
    let dot_base = evaluate(4101, "empty", mod_attr.clone(), "melee::DOT伤害", Some(dot));
    let dot_hit = evaluate(
        4101,
        "thunder",
        mod_attr.clone(),
        "melee::DOT伤害",
        Some(dot),
    );
    let dot_stack = evaluate(
        4101,
        "element+thunder",
        mod_attr,
        "melee::DOT伤害",
        Some(dot),
    );
    assert_parity(dot_base.target_value, TS_DOT_BASE, "A DOT 基线");
    assert_eq!(
        dot_hit.target_value.to_bits(),
        dot_base.target_value.to_bits(),
        "A DOT 不吃元素键"
    );
    assert_eq!(
        dot_stack.target_value.to_bits(),
        dot_base.target_value.to_bits(),
        "A DOT 不吃通用元素增伤"
    );

    // ---- B 组：苏乙 1504 / 光，MOD属性 0.572（0.5 自定义 + 0.072 夹具来源），技能池 ----
    let mod_attr = serde_json::json!([["光MOD属性", 0.5]]);
    let damage_base = evaluate(1504, "empty", mod_attr.clone(), "伤害", None);
    assert_parity(damage_base.target_value, TS_DAMAGE_BASE, "B 技能池基线");

    let damage_hit = evaluate(1504, "light", mod_attr.clone(), "伤害", None);
    assert_parity(damage_hit.target_value, TS_DAMAGE_HIT, "B 匹配光属性增伤");
    assert_eq!(
        damage_hit
            .attributes
            .get("元素增伤")
            .copied()
            .unwrap_or(0.0),
        0.0,
        "B 光属性增伤不得计入通用元素增伤桶"
    );
    assert_parity(
        damage_hit
            .attributes
            .get("光属性增伤")
            .copied()
            .unwrap_or(0.0),
        0.3 + 0.572 * 0.3,
        "B 光属性增伤桶含 MOD属性加权",
    );

    // 任务书要求的硬场景：光角色 + MOD 只提供 `雷属性增伤`
    let damage_miss = evaluate(1504, "thunder", mod_attr.clone(), "伤害", None);
    assert_eq!(
        damage_miss
            .attributes
            .get("元素增伤")
            .copied()
            .unwrap_or(-1.0),
        0.0,
        "B 雷属性增伤对通用桶贡献必须为 0"
    );
    assert!(
        damage_miss
            .attributes
            .get("雷属性增伤")
            .copied()
            .unwrap_or(0.0)
            > 0.0,
        "B 雷属性增伤桶必须 > 0"
    );
    assert_eq!(
        damage_miss.target_value.to_bits(),
        damage_base.target_value.to_bits(),
        "B 不匹配元素键必须逐位等于基线"
    );
    assert_parity(
        damage_miss.target_value,
        TS_DAMAGE_BASE,
        "B 不匹配 = TS 基线",
    );

    let damage_stack = evaluate(1504, "element+light", mod_attr.clone(), "伤害", None);
    assert_parity(damage_stack.target_value, TS_DAMAGE_STACK, "B 叠加");
    assert_parity(
        damage_stack
            .attributes
            .get("元素增伤")
            .copied()
            .unwrap_or(0.0),
        0.2 + 0.572 * 0.2,
        "B 叠加时通用桶只含自身",
    );

    let damage_legacy = evaluate(1504, "element", mod_attr, "伤害", None);
    assert_parity(
        damage_legacy.target_value,
        TS_DAMAGE_LEGACY_MOD,
        "B 仅元素增伤的旧路径",
    );
}
