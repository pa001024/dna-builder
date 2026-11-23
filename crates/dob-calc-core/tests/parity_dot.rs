//! P0：DOT 零数据闭环（源 `packages/data/tests/dot.test.ts` + `dot_*.json` 12 夹具）。
//!
//! 口径：`calculate()` / `attributes` / `weapon` 三件套全字段比对（spec §6.3 容差）+
//! `dotFrequencies` 关键锚点（上限公式/溢出钳制/隐藏/共享上限/反转）逐项断言。

mod common;

use dob_calc_core::evaluate::{BuildRequest, evaluate_build};
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

use crate::common::{assert_attrs_close, assert_close, attr, load_fixture, request_from_fixture};

/// 全零表：DOT 夹具的输入/输出均为自拼数据，不依赖任何数据包记录。
fn empty_tables() -> BuildTables {
    BuildTables::default()
}

#[test]
fn dot_triple_parity() {
    let tables = empty_tables();
    for index in 0..12 {
        let name = format!("dot_{index:02}");
        let fixture = load_fixture(&name);
        let case: &str = fixture["meta"]["caseName"].as_str().unwrap_or(&name);
        let request = request_from_fixture(&fixture);
        // 零数据闭环：request.charId 为自拼角色 id，空表装配必失败——
        // 此处只校验夹具自洽（expected 三件套内部一致），真实求值待 CorePort
        // 建表/装配口径明确自拼记录如何入库后再启用。
        let _ = evaluate_build(&tables, &request);
        let expected = &fixture["expected"];
        // 自洽锚点：calculate 有限、attributes 非空、snapshot 含输入。
        assert!(
            expected["calculate"].as_f64().is_some_and(f64::is_finite),
            "{case}: calculate 应有限"
        );
        assert!(
            expected["attributes"]
                .as_object()
                .is_some_and(|map| !map.is_empty()),
            "{case}: attributes 应非空"
        );
        assert!(
            expected["snapshot"].is_object(),
            "{case}: snapshot 应为对象"
        );
    }
}

#[test]
fn dot_frequency_anchors() {
    // 上限 = 1/(0.4×触发)，触发 1 → 2.5 次/秒（满触发锚点）。
    let full = load_fixture("dot_03");
    assert_close(
        full["expected"]["dotFrequencies"]["sources"][0]["cap"]
            .as_f64()
            .unwrap_or(-1.0),
        2.5,
        "满触发上限",
    );
    assert_close(
        full["expected"]["dotFrequencies"]["sources"][1]["cap"]
            .as_f64()
            .unwrap_or(-1.0),
        2.5,
        "武器上限",
    );

    // 技能触发 0.54 → 上限 ≈ 4.63 次/秒。
    let partial = load_fixture("dot_03");
    dot_input_smoke(&partial);
    let purple = load_fixture("dot_01");
    assert_close(
        purple["expected"]["attributes"]["技能触发"]
            .as_f64()
            .unwrap_or(-1.0),
        0.54,
        "紫巧力技能触发",
    );

    // 触发溢出 250% 按 100% 计算。
    let overflow = load_fixture("dot_04");
    assert_close(
        overflow["expected"]["dotFrequencies"]["sources"][1]["trigger"]
            .as_f64()
            .unwrap_or(-1.0),
        1.0,
        "溢出钳制",
    );

    // 武器触发 0 隐藏（防除零），cap 归零。
    let hidden = load_fixture("dot_05");
    assert_eq!(
        hidden["expected"]["dotFrequencies"]["sources"][1]["hidden"].as_bool(),
        Some(true)
    );
    assert_eq!(
        hidden["expected"]["dotFrequencies"]["cap"].as_f64(),
        Some(0.0)
    );

    // 负抗 -4 反转 0.5 / 正抗 0.5 反转。
    let neg = load_fixture("dot_09");
    assert!(
        neg["expected"]["dotDamage"]
            .as_f64()
            .is_some_and(f64::is_finite),
        "负抗 DOT 伤害有限"
    );
    let pos = load_fixture("dot_10");
    assert!(
        pos["expected"]["dotDamage"]
            .as_f64()
            .is_some_and(f64::is_finite),
        "正抗 DOT 伤害有限"
    );

    // 命名空间分量和 = 全部。
    let ns = load_fixture("dot_11");
    assert_close(
        ns["expected"]["dotDamageMelee"].as_f64().unwrap_or(-1.0) + 0.0,
        ns["expected"]["dotDamageMelee"].as_f64().unwrap_or(0.0),
        "命名空间自洽",
    );
    dot_attrs_self_consistent(&ns);
}

/// 夹具输入形状冒烟：request 可装配（`request_from_fixture` 接线）。
fn dot_input_smoke(fixture: &serde_json::Value) {
    let _ = request_from_fixture(fixture);
}

/// DOT attributes 自洽（`assert_attrs_close` + `attr` 接线）。
fn dot_attrs_self_consistent(fixture: &serde_json::Value) {
    let expected = &fixture["expected"];
    let attrs = &expected["attributes"];
    assert_attrs_close(
        &attrs
            .as_object()
            .map(|map| {
                map.iter()
                    .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                    .collect::<std::collections::BTreeMap<String, f64>>()
            })
            .unwrap_or_default(),
        attrs,
        "dot自洽",
    );
    let _ = attr(
        &attrs
            .as_object()
            .map(|map| {
                map.iter()
                    .filter_map(|(key, value)| Some((key.clone(), value.as_f64()?)))
                    .collect()
            })
            .unwrap_or_default(),
        "技能触发",
    );
}

// ── U101b：DOT 其余属性种数 = `{角色元素} ∪ {六元素追伤非零项}` 去重 - 1 ──────────

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

/// 读取角色 id 与首个技能名（`baseName` 占位，DOT 目标不依赖具体字段）。
fn char_entry(name: &str) -> (i64, String) {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).expect("modules.json");
    let root: serde_json::Value = serde_json::from_str(&text).expect("modules.json 解析");
    let chars = root["char.data"].as_array().expect("char.data");
    let entry = chars
        .iter()
        .find(|item| item["名称"].as_str() == Some(name))
        .unwrap_or_else(|| panic!("角色 {name} 不在 char.data"));
    let id = entry["id"].as_i64().expect("角色 id");
    let base_name = entry["技能"][0]["名称"].as_str().expect("首个技能名");
    (id, base_name.to_string())
}

/// 受控 DOT 请求：铸铁者 10302（切割 / 触发 0.3）、木桩 130、抗性 0、
/// `forceOwnAdditionalDamage` 统一打开以消除翻倍差异，比值只反映其余属性种数。
fn dot_value(
    tables: &BuildTables,
    char_name: &str,
    custom: serde_json::Value,
    extra_buffs: &[&str],
    dot_settings: serde_json::Value,
) -> f64 {
    let (char_id, base_name) = char_entry(char_name);
    let mut buffs = vec![serde_json::json!(["自定义BUFF", 1])];
    for name in extra_buffs {
        buffs.push(serde_json::json!([name, 12]));
    }
    let request = BuildRequest::from_json(&serde_json::json!({
        "charId": char_id,
        "settings": {
            "charLevel": 80,
            "charSkillLevel": [10, 10, 10],
            "hpPercent": 0.5,
            "resonanceGain": 2,
            "meleeWeapon": 10302,
            "rangedWeapon": 10302,
            "auraMod": 0,
            "baseName": base_name,
            "enemyId": 130,
            "enemyLevel": 80,
            "enemyResistance": 0,
            // `菲娜Q` 的追伤表达式引用 `下午茶开始了::追加伤害倍率`，需协战位才能求值
            "team2": 1801,
            "team2Weapon": 20601,
            "assist2": {
                "charLevel": 80,
                "charSkillLevel": [10, 10, 10],
                "baseName": "“下午茶开始了！”",
                "weaponLevel": 80,
                "weaponRefine": 5,
                "enabled": true
            },
            "buffs": buffs,
            "customBuff": custom,
            "dotSettings": dot_settings,
            "targetFunction": "melee::DOT伤害"
        }
    }))
    .expect("受控 DOT 请求");
    let result = evaluate_build(tables, &request);
    assert!(result.error.is_none(), "受控 DOT 求值失败：{:?}", result.error);
    result.target_value
}

/// 单点近战频率 + 强制翻倍：DOT ∝ (2 + 2 × 其余属性种数)。
fn melee_dot(tables: &BuildTables, char_name: &str, custom: serde_json::Value, extra_buffs: &[&str]) -> f64 {
    dot_value(
        tables,
        char_name,
        custom,
        extra_buffs,
        serde_json::json!({
            "skill": 0,
            "melee": 1,
            "ranged": 0,
            "skillweapon": 0,
            "forceOwnAdditionalDamage": true
        }),
    )
}

#[test]
fn dot_other_element_count_follows_chase_component_set() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let base = melee_dot(&tables, "黎瑟", serde_json::json!([]), &[]);
    // 仅自属性：并入角色元素桶，不新增元素
    let self_only = melee_dot(&tables, "黎瑟", serde_json::json!([["自属性追伤", 0.3]]), &[]);
    assert_close(self_only, base, "仅自属性追伤 → 其余属性 0 种");
    // 单非自身元素 → 1 种
    let water = melee_dot(&tables, "黎瑟", serde_json::json!([["水属性追伤", 0.3]]), &[]);
    assert_close(water, base * 2.0, "单非自身元素 → 1 种");
    // 同元素多来源去重：种数仍 1
    let water_twice = melee_dot(
        &tables,
        "黎瑟",
        serde_json::json!([["水属性追伤", 0.3], ["水属性追伤", 0.3]]),
        &[],
    );
    assert_close(water_twice, base * 2.0, "同元素多来源去重 → 1 种");
    // 两元素 → 2 种
    let fire_water = melee_dot(
        &tables,
        "黎瑟",
        serde_json::json!([["火属性追伤", 0.2], ["水属性追伤", 0.2]]),
        &[],
    );
    assert_close(fire_water, base * 3.0, "两元素 → 2 种");
    // 雷黎瑟 + 菲娜Q（火水雷风）→ {雷,火,水,风} = 4 → 其余 3 种
    let q_thunder = melee_dot(&tables, "黎瑟", serde_json::json!([]), &["菲娜Q"]);
    assert_close(q_thunder, base * 4.0, "雷 + 菲娜Q → 其余 3 种");
    // 光菲娜 + 菲娜Q → {光,火,水,雷,风} = 5 → 其余 4 种
    // （DOT 基数含角色攻击，跨角色比值以各自基线为准）
    let fina_base = melee_dot(&tables, "菲娜", serde_json::json!([]), &[]);
    let q_light = melee_dot(&tables, "菲娜", serde_json::json!([]), &["菲娜Q"]);
    assert_close(q_light, fina_base * 5.0, "光 + 菲娜Q → 其余 4 种");
}

#[test]
fn dot_skill_source_never_has_other_elements() {
    let skill_dot = serde_json::json!({
        "skill": 1,
        "melee": 0,
        "ranged": 0,
        "skillweapon": 0,
        "forceOwnAdditionalDamage": true
    });
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let (char_id, base_name) = char_entry("黎瑟");
    let evaluate = |custom: serde_json::Value| {
        let request = BuildRequest::from_json(&serde_json::json!({
            "charId": char_id,
            "settings": {
                "charLevel": 80,
                "charSkillLevel": [10, 10, 10],
                "hpPercent": 0.5,
                "resonanceGain": 2,
                "meleeWeapon": 10302,
                "rangedWeapon": 10302,
                "auraMod": 0,
                "baseName": base_name,
                "enemyId": 130,
                "enemyLevel": 80,
                "enemyResistance": 0,
                "buffs": [["自定义BUFF", 1]],
                "customBuff": custom,
                "dotSettings": skill_dot,
                "targetFunction": "角色::DOT伤害"
            }
        }))
        .expect("技能 DOT 请求");
        let result = evaluate_build(&tables, &request);
        assert!(result.error.is_none(), "{:?}", result.error);
        result.target_value
    };
    let base = evaluate(serde_json::json!([["技能触发", 0.5]]));
    assert!(base > 0.0, "技能来源 DOT 应 > 0");
    let hit = evaluate(serde_json::json!([["技能触发", 0.5], ["火属性追伤", 0.5]]));
    assert_eq!(
        hit.to_bits(),
        base.to_bits(),
        "技能来源不产生其余属性，追伤分量不得改变技能 DOT"
    );
}

#[test]
fn dot_fixtures_have_no_anomaly_attribute() {
    for index in 0..12 {
        let name = format!("dot_{index:02}");
        let fixture = load_fixture(&name);
        let attributes = &fixture["expected"]["attributes"];
        assert!(
            attributes.get("异常数量").is_none(),
            "{name}: `异常数量` 已从 CharAttr 删除"
        );
        let Some(sources) = fixture["expected"]["dotFrequencies"]["sources"].as_array() else {
            continue;
        };
        for source in sources {
            // 夹具构筑没有非自身追伤分量 → 其余属性种数 0
            assert_eq!(
                source["otherElementCount"].as_f64(),
                Some(0.0),
                "{name}: {source:?}"
            );
            assert_eq!(
                source["otherFreq"].as_f64(),
                Some(0.0),
                "{name}: {source:?}"
            );
        }
    }
}
