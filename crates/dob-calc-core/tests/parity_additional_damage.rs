//! U112 追伤分池：角色属性不持有追伤，武器面板保留七分量 + 只读聚合。
//!
//! 口径来源：`TASKS/u112.md` 与 `additional_damage.rs`：
//! - 武器池因子 `max(0, 1 + Σ panel 七分量)`，技能池只吃 `技能追伤`，两者不交叉；
//! - 追伤不吃弱点 / 元素增伤 / 转属拆分（整段因子，不再逐分量成 part）；
//! - DOT 元素种数仍由面板分量集合推导。
//! 夹具使用 `dobapp_OkdnBN3OlC`（苏乙 1504 / 光，目标 `[远程]` 武器池）：
//! 旧数据快照里的字面 `追加伤害` 迁移为 `自属性追伤`，因此本文件同时覆盖兼容路径。
//! 旧 code 用例在 `modules.json` 上注入合成 BUFF（仅测试内建表，不改夹具文件）。

mod common;

use dob_calc_core::additional_damage::{KEYS as ADDITIONAL_DAMAGE_KEYS, LEGACY_KEY, SELF_KEY};
use dob_calc_core::evaluate::{BuildRequest, BuildResult, DamageBreakdown, evaluate_build};
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;
use std::path::PathBuf;

use crate::common::{assert_close, load_fixture};

fn fixture_dir() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests/fixtures");
    path
}

fn tables() -> BuildTables {
    let text = std::fs::read_to_string(fixture_dir().join("modules.json")).expect("modules.json");
    BuildPayload::from_json(&text).expect("tables").tables
}

/// 在 `modules.json` 上追加合成 BUFF（名称 → code），建表后测试用完即弃。
fn tables_with_buffs(buffs: &[(&str, &str)]) -> BuildTables {
    let text = std::fs::read_to_string(fixture_dir().join("modules.json")).expect("modules.json");
    let mut root: serde_json::Value = serde_json::from_str(&text).expect("modules.json 解析");
    let list = root
        .get_mut("buff.data")
        .and_then(serde_json::Value::as_array_mut)
        .expect("buff.data");
    for (name, code) in buffs {
        list.push(serde_json::json!({
            "名称": name,
            "描述": "U71 合成 BUFF",
            "code": code,
        }));
    }
    BuildPayload::from_json(&root.to_string())
        .expect("tables")
        .tables
}

/// `dobapp_OkdnBN3OlC` 的 settings + 自定义 BUFF + 目标函数（+ 追加合成 BUFF 名）。
fn request(
    fixture: &serde_json::Value,
    custom: serde_json::Value,
    target: &str,
    extra_buffs: &[&str],
) -> BuildRequest {
    let mut settings = fixture["request"]["settings"].clone();
    let object = settings.as_object_mut().expect("settings 对象");
    object.insert("customBuff".to_string(), custom);
    object.insert(
        "targetFunction".to_string(),
        serde_json::Value::String(target.to_string()),
    );
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
    for name in extra_buffs {
        buffs.push(serde_json::json!([name, 1]));
    }
    object.insert("buffs".to_string(), serde_json::Value::Array(buffs));
    BuildRequest::from_json(&serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": settings,
        "panels": ["ranged"],
    }))
    .expect("request")
}

fn panel(result: &BuildResult, key: &str) -> f64 {
    result
        .weapon
        .as_ref()
        .or_else(|| result.panels.get("ranged"))
        .and_then(|panel| panel.get(key).copied())
        .unwrap_or(0.0)
}

fn sum_components(result: &BuildResult) -> f64 {
    ADDITIONAL_DAMAGE_KEYS
        .iter()
        .map(|key| panel(result, key))
        .sum()
}

/// 聚合 = Σ 七分量（面板）；角色属性不持有任何追伤键。
fn assert_aggregate(result: &BuildResult, label: &str) {
    let components = sum_components(result);
    assert_close(
        panel(result, LEGACY_KEY),
        components,
        &format!("{label} 面板聚合"),
    );
    for key in ADDITIONAL_DAMAGE_KEYS {
        assert_eq!(
            result.attributes.get(key),
            None,
            "{label} 角色属性不应持有 {key}"
        );
    }
    assert_eq!(
        result.attributes.get(LEGACY_KEY),
        None,
        "{label} 角色属性不应持有 {LEGACY_KEY}"
    );
}

#[test]
fn seven_components_and_readonly_aggregate() {
    let tables = tables();
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let base = evaluate_build(
        &tables,
        &request(&fixture, serde_json::json!([]), "[远程]", &[]),
    );
    assert!(base.error.is_none(), "{:?}", base.error);
    assert_aggregate(&base, "基线");
    // U101a 数据重建后 `菲娜Q` 为火水雷风四分量；基线追伤分量应非零
    assert!(sum_components(&base) > 0.0, "基线追伤分量应 > 0");

    let own = evaluate_build(
        &tables,
        &request(
            &fixture,
            serde_json::json!([["光属性追伤", 0.3]]),
            "[远程]",
            &[],
        ),
    );
    assert!(own.error.is_none(), "{:?}", own.error);
    assert_close(
        panel(&own, "光属性追伤"),
        panel(&base, "光属性追伤") + 0.3,
        "分量叠加到面板基线",
    );
    assert_close(
        panel(&own, LEGACY_KEY),
        panel(&base, LEGACY_KEY) + 0.3,
        "聚合随分量增加",
    );
    assert_aggregate(&own, "匹配元素");
    assert!(own.target_value > base.target_value, "追伤进入武器池");

    // 非匹配元素同样只进 Σ 因子（不再按元素结算）
    let miss = evaluate_build(
        &tables,
        &request(
            &fixture,
            serde_json::json!([["火属性追伤", 0.3]]),
            "[远程]",
            &[],
        ),
    );
    assert!(miss.error.is_none(), "{:?}", miss.error);
    assert_close(
        panel(&miss, "火属性追伤"),
        panel(&base, "火属性追伤") + 0.3,
        "非匹配分量叠加到面板基线",
    );
    assert_close(
        miss.target_value,
        own.target_value,
        "武器池只看 Σ，元素不参与",
    );

    // 自属性对任意元素生效；旧字面键迁移后与自属性写入逐位同结果
    let self_write = evaluate_build(
        &tables,
        &request(
            &fixture,
            serde_json::json!([["自属性追伤", 0.3]]),
            "[远程]",
            &[],
        ),
    );
    let legacy_write = evaluate_build(
        &tables,
        &request(
            &fixture,
            serde_json::json!([["追加伤害", 0.3]]),
            "[远程]",
            &[],
        ),
    );
    assert!(self_write.error.is_none(), "{:?}", self_write.error);
    assert!(legacy_write.error.is_none(), "{:?}", legacy_write.error);
    assert_close(
        panel(&legacy_write, SELF_KEY),
        panel(&self_write, SELF_KEY),
        "旧字面键迁移到自属性",
    );
    assert_eq!(
        legacy_write.target_value.to_bits(),
        self_write.target_value.to_bits(),
        "旧字面键与自属性写入必须逐位一致"
    );
    assert_aggregate(&self_write, "自属性");
    assert_aggregate(&legacy_write, "旧字面键");
}

#[test]
fn skill_pool_and_dot_ignore_components() {
    let tables = tables();
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let dot = r#"{"skill":0,"melee":1,"ranged":0,"skillweapon":0}"#;
    let evaluate = |custom: serde_json::Value, target: &str, dot_settings: Option<&str>| {
        let mut settings = fixture["request"]["settings"].clone();
        if let Some(dot) = dot_settings {
            settings.as_object_mut().expect("settings").insert(
                "dotSettings".to_string(),
                serde_json::from_str(dot).expect("dot"),
            );
        }
        let mut request = request(&fixture, custom, target, &[]);
        request.settings = dob_calc_core::config::CharSettings::from_json(&settings);
        let result = evaluate_build(&tables, &request);
        assert!(result.error.is_none(), "{:?}", result.error);
        result
    };

    let base = evaluate(serde_json::json!([]), "伤害", None);
    let hit = evaluate(serde_json::json!([["光属性追伤", 0.3]]), "伤害", None);
    assert_eq!(
        hit.target_value.to_bits(),
        base.target_value.to_bits(),
        "技能池只吃技能追伤"
    );

    let dot_base = evaluate(serde_json::json!([]), "melee::DOT伤害", Some(dot));
    let dot_hit = evaluate(
        serde_json::json!([["光属性追伤", 0.3], ["自属性追伤", 0.3]]),
        "melee::DOT伤害",
        Some(dot),
    );
    assert_eq!(
        dot_hit.target_value.to_bits(),
        dot_base.target_value.to_bits(),
        "DOT 伤害不吃追伤分量"
    );
}

#[test]
fn legacy_mod_weighting_matches_ts_semantics() {
    // `<元素>MOD属性` 加权只读分量键：`追加伤害` 迁移值不再加权（U70 getModsBonus 口径）。
    let text = std::fs::read_to_string(fixture_dir().join("modules.json")).expect("modules.json");
    let mut root: serde_json::Value = serde_json::from_str(&text).expect("modules.json 解析");
    let mods = root
        .get_mut("mod.data")
        .and_then(serde_json::Value::as_array_mut)
        .expect("mod.data");
    mods.push(serde_json::json!({
        "id": 990101,
        "名称": "U71分量",
        "系列": "狮鹫",
        "品质": "金",
        "耐受": 0,
        "类型": "角色",
        "加成": { "光属性追伤": [0.3] },
    }));
    mods.push(serde_json::json!({
        "id": 990102,
        "名称": "U71旧键",
        "系列": "狮鹫",
        "品质": "金",
        "耐受": 0,
        "类型": "角色",
        "加成": { "追加伤害": [0.3] },
    }));
    mods.push(serde_json::json!({
        "id": 990106,
        "名称": "U71空MOD",
        "系列": "狮鹫",
        "品质": "金",
        "耐受": 0,
        "类型": "角色",
        "加成": {},
    }));
    let tables = BuildPayload::from_json(&root.to_string())
        .expect("tables")
        .tables;
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let evaluate = |mod_id: i64| {
        let mut settings = fixture["request"]["settings"].clone();
        let object = settings.as_object_mut().expect("settings 对象");
        object.insert("charMods".to_string(), serde_json::json!([[mod_id, 10]]));
        object.insert(
            "customBuff".to_string(),
            serde_json::json!([["光MOD属性", 0.5]]),
        );
        object.insert(
            "targetFunction".to_string(),
            serde_json::Value::String("[远程]".to_string()),
        );
        let mut buffs = object
            .get("buffs")
            .and_then(serde_json::Value::as_array)
            .cloned()
            .unwrap_or_default();
        buffs.push(serde_json::json!(["自定义BUFF", 1]));
        object.insert("buffs".to_string(), serde_json::Value::Array(buffs));
        let request = BuildRequest::from_json(&serde_json::json!({
            "charId": fixture["request"]["charId"],
            "settings": settings,
            "panels": ["ranged"],
        }))
        .expect("request");
        let result = evaluate_build(&tables, &request);
        assert!(result.error.is_none(), "{:?}", result.error);
        result
    };

    // 数据重建后 `菲娜Q` 提供四元素追伤，基线分量不再为 0；权重相对空 MOD 基线测量
    let baseline = evaluate(990106);
    let component = evaluate(990101);
    let weighted = panel(&component, "光属性追伤") - panel(&baseline, "光属性追伤");
    assert!(
        weighted > 0.3,
        "分量吃 MOD属性 加权：{weighted} 应大于注入的 0.3"
    );
    assert_aggregate(&component, "分量加权");

    let legacy = evaluate(990102);
    assert_close(
        panel(&legacy, SELF_KEY),
        panel(&component, SELF_KEY) + 0.3,
        "旧键迁移到自属性且不加权",
    );
    assert_close(
        panel(&legacy, "光属性追伤"),
        panel(&baseline, "光属性追伤"),
        "旧键迁移后不参与 MOD属性 加权",
    );
    assert_aggregate(&legacy, "旧键不加权");
}

#[test]
fn legacy_code_writes_migrate_to_components() {
    let names = ["U71聚合缩放", "U71混合写入", "U71纯赋值"];
    let tables = tables_with_buffs(&[
        ("U71聚合缩放", "weaponAttr.追加伤害*=0.5"),
        (
            "U71混合写入",
            "weaponAttr.追加伤害*=0.5;weaponAttr.雷属性追伤+=0.2",
        ),
        ("U71纯赋值", "weaponAttr.追加伤害=1"),
    ]);
    // shardBuild1 的 `baseName` 能解析到近战武器（`weaponAttr` 沙盒存在）
    let fixture = load_fixture("dobapp_shardBuild1");
    let evaluate = |extra: &[&str]| {
        let result = evaluate_build(
            &tables,
            &request(&fixture, serde_json::json!([]), "[远程]", extra),
        );
        assert!(result.error.is_none(), "{:?}", result.error);
        result
    };
    let base = evaluate(&[]);
    let base_self = panel(&base, SELF_KEY);
    let base_legacy = panel(&base, LEGACY_KEY);
    let base_light = panel(&base, "光属性追伤");
    assert!(base_self > 0.0);
    assert!(base_legacy > base_self, "基线聚合含六元素分量");

    // 纯聚合复合写入：七分量同比例缩放
    let scaled = evaluate(&[names[0]]);
    assert_close(
        panel(&scaled, SELF_KEY),
        base_self * 0.5,
        "聚合缩放到自属性",
    );
    assert_close(
        panel(&scaled, LEGACY_KEY),
        base_legacy * 0.5,
        "聚合缩放后聚合值",
    );
    assert_close(
        panel(&scaled, "光属性追伤"),
        base_light * 0.5,
        "聚合缩放同时缩放元素分量",
    );

    // 混合写入：聚合差值落自属性（可为负），分量保留显式结果
    let mixed = evaluate(&[names[1]]);
    assert_close(
        panel(&mixed, SELF_KEY),
        base_self - base_legacy * 0.5,
        "混合：聚合差值落自属性",
    );
    assert_close(
        panel(&mixed, "雷属性追伤"),
        panel(&base, "雷属性追伤") + 0.2,
        "混合：分量显式结果",
    );
    assert_close(
        panel(&mixed, LEGACY_KEY),
        base_legacy * 0.5 + 0.2,
        "混合：聚合 = Σ 分量",
    );

    // 纯赋值：覆盖自属性并清零其余六分量
    let assigned = evaluate(&[names[2]]);
    for key in ADDITIONAL_DAMAGE_KEYS {
        if key == SELF_KEY {
            continue;
        }
        assert_eq!(panel(&assigned, key), 0.0, "纯赋值清零 {key}");
    }
    assert_close(panel(&assigned, SELF_KEY), 1.0, "纯赋值自属性");
    assert_close(panel(&assigned, LEGACY_KEY), 1.0, "纯赋值聚合");
}

/// 在 `modules.json` 上追加合成 MOD（`加成` 已按新口径）后建表。
fn tables_with_mods(mods: &[(i64, serde_json::Value)]) -> BuildTables {
    let text = std::fs::read_to_string(fixture_dir().join("modules.json")).expect("modules.json");
    let mut root: serde_json::Value = serde_json::from_str(&text).expect("modules.json 解析");
    let list = root
        .get_mut("mod.data")
        .and_then(serde_json::Value::as_array_mut)
        .expect("mod.data");
    for (id, bonus) in mods {
        list.push(serde_json::json!({
            "id": id,
            "名称": format!("U71合成MOD{id}"),
            "系列": "狮鹫",
            "品质": "金",
            "耐受": 0,
            "类型": "角色",
            "加成": bonus,
        }));
    }
    BuildPayload::from_json(&root.to_string())
        .expect("tables")
        .tables
}

/// 受控 DOT 请求：清空 MOD / BUFF / 光环，只保留指定角色 MOD 与自定义 BUFF。
fn dot_request(
    fixture: &serde_json::Value,
    mod_id: Option<i64>,
    custom: serde_json::Value,
    dot: &str,
) -> BuildRequest {
    let mut settings = fixture["request"]["settings"].clone();
    let object = settings.as_object_mut().expect("settings 对象");
    object.insert(
        "charMods".to_string(),
        match mod_id {
            Some(id) => serde_json::json!([[id, 10]]),
            None => serde_json::json!([]),
        },
    );
    object.insert("meleeMods".to_string(), serde_json::json!([]));
    object.insert("rangedMods".to_string(), serde_json::json!([]));
    object.insert("skillWeaponMods".to_string(), serde_json::json!([]));
    object.insert("auraMod".to_string(), serde_json::json!(0));
    object.insert("petId".to_string(), serde_json::json!(0));
    object.insert("traits".to_string(), serde_json::json!([]));
    object.insert("buffs".to_string(), serde_json::json!([["自定义BUFF", 1]]));
    object.insert("customBuff".to_string(), custom);
    object.insert(
        "dotSettings".to_string(),
        serde_json::from_str(dot).expect("dotSettings"),
    );
    object.insert(
        "targetFunction".to_string(),
        serde_json::Value::String("melee::DOT伤害".to_string()),
    );
    BuildRequest::from_json(&serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": settings,
        "panels": ["ranged"],
    }))
    .expect("request")
}

#[test]
fn dot_doubling_condition_uses_seven_components() {
    const DOT: &str = r#"{"skill":0,"melee":1,"ranged":0,"skillweapon":0}"#;
    let tables = tables();

    // (a) 非光暗：追伤分量触发频率翻倍；其余属性种数按「六元素追伤非零项 ∪ 角色元素」
    // 集合推导（U101b），因此自属性不新增种数、非自身单元素新增 1 种。
    // 抗性置 0 使 ownZone = otherZone，比值只剩频率项。
    let fixture = load_fixture("lise_fire");
    let evaluate = |custom: serde_json::Value| {
        let mut request = dot_request(&fixture, None, custom, DOT);
        request.settings.enemy_resistance = 0.0;
        let result = evaluate_build(&tables, &request);
        assert!(result.error.is_none(), "{:?}", result.error);
        result
    };
    let base = evaluate(serde_json::json!([]));
    let self_only = evaluate(serde_json::json!([["自属性追伤", 0.3]]));
    let hit = evaluate(serde_json::json!([["水属性追伤", 0.3]]));
    assert_eq!(panel(&hit, "水属性追伤"), 0.3);
    assert_close(
        self_only.target_value,
        base.target_value * 2.0,
        "自属性分量触发 DOT 翻倍且不新增元素",
    );
    assert_close(
        hit.target_value,
        self_only.target_value * 2.0,
        "非自身元素分量新增 1 种其余属性",
    );

    // (b) 光暗：只看 MOD 来源；BUFF 分量不翻倍，MOD 分量 / 旧字面 MOD 翻倍
    let tables = tables_with_mods(&[
        (990103, serde_json::json!({})),
        (990104, serde_json::json!({"光属性追伤": [0.3]})),
        (990105, serde_json::json!({"追加伤害": [0.3]})),
    ]);
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let base = evaluate_build(
        &tables,
        &dot_request(&fixture, Some(990103), serde_json::json!([]), DOT),
    );
    let buff = evaluate_build(
        &tables,
        &dot_request(
            &fixture,
            Some(990103),
            serde_json::json!([["光属性追伤", 0.3]]),
            DOT,
        ),
    );
    let mod_hit = evaluate_build(
        &tables,
        &dot_request(&fixture, Some(990104), serde_json::json!([]), DOT),
    );
    let legacy_mod = evaluate_build(
        &tables,
        &dot_request(&fixture, Some(990105), serde_json::json!([]), DOT),
    );
    for (label, result) in [
        ("base", &base),
        ("buff", &buff),
        ("mod", &mod_hit),
        ("legacy", &legacy_mod),
    ] {
        assert!(result.error.is_none(), "{label}: {:?}", result.error);
    }
    assert_eq!(panel(&buff, "光属性追伤"), 0.3);
    assert_eq!(
        buff.target_value.to_bits(),
        base.target_value.to_bits(),
        "光暗 BUFF 分量不触发翻倍"
    );
    assert_close(
        mod_hit.target_value,
        base.target_value * 2.0,
        "光暗 MOD 分量触发翻倍",
    );
    assert_close(
        legacy_mod.target_value,
        base.target_value * 2.0,
        "旧字面 MOD 兜底触发翻倍",
    );
}

#[test]
fn bonus_damage_custom_buff_is_ignored_in_source() {
    // TS `normalizeAdditionalDamageKey` 只迁移 `追加伤害`；`BonusDamage*` 仅在升华解码处理。
    let tables = tables();
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let base = evaluate_build(
        &tables,
        &request(&fixture, serde_json::json!([]), "[远程]", &[]),
    );
    assert!(base.error.is_none(), "{:?}", base.error);
    let base_self = panel(&base, SELF_KEY);
    for key in ["BonusDamage", "BonusDamage_Fire", "BonusDamage_Foo"] {
        let result = evaluate_build(
            &tables,
            &request(&fixture, serde_json::json!([[key, 0.3]]), "[远程]", &[]),
        );
        assert!(result.error.is_none(), "{key}: {:?}", result.error);
        assert_eq!(
            result.target_value.to_bits(),
            base.target_value.to_bits(),
            "{key} 不应产生追伤 / 影响 target"
        );
        assert_eq!(
            panel(&result, "火属性追伤"),
            panel(&base, "火属性追伤"),
            "{key} 不应落火分量"
        );
        assert_eq!(panel(&result, SELF_KEY), base_self, "{key} 不应落自属性");
    }
}

#[test]
fn source_migration_combines_legacy_and_self_component() {
    let tables = tables();
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let base = evaluate_build(
        &tables,
        &request(&fixture, serde_json::json!([]), "[远程]", &[]),
    );
    let mixed = evaluate_build(
        &tables,
        &request(
            &fixture,
            serde_json::json!([["追加伤害", 0.2], ["自属性追伤", 0.3]]),
            "[远程]",
            &[],
        ),
    );
    let direct = evaluate_build(
        &tables,
        &request(
            &fixture,
            serde_json::json!([["自属性追伤", 0.5]]),
            "[远程]",
            &[],
        ),
    );
    assert!(base.error.is_none(), "{:?}", base.error);
    assert!(mixed.error.is_none(), "{:?}", mixed.error);
    assert!(direct.error.is_none(), "{:?}", direct.error);
    assert_close(
        panel(&mixed, SELF_KEY),
        panel(&base, SELF_KEY) + 0.5,
        "旧键与自属性分量相加",
    );
    assert_eq!(
        mixed.target_value.to_bits(),
        direct.target_value.to_bits(),
        "旧键迁移与直接写自属性逐位一致"
    );
}

/// 在 `modules.json` 上追加合成 MOD 与静态 BUFF（`attr` 表）后建表。
fn tables_with_static(
    mods: &[(i64, serde_json::Value)],
    buffs: &[(&str, serde_json::Value)],
) -> BuildTables {
    let text = std::fs::read_to_string(fixture_dir().join("modules.json")).expect("modules.json");
    let mut root: serde_json::Value = serde_json::from_str(&text).expect("modules.json 解析");
    let mod_list = root
        .get_mut("mod.data")
        .and_then(serde_json::Value::as_array_mut)
        .expect("mod.data");
    for (id, bonus) in mods {
        mod_list.push(serde_json::json!({
            "id": id,
            "名称": format!("U71静态MOD{id}"),
            "系列": "狮鹫",
            "品质": "金",
            "耐受": 0,
            "类型": "角色",
            "加成": bonus,
        }));
    }
    let buff_list = root
        .get_mut("buff.data")
        .and_then(serde_json::Value::as_array_mut)
        .expect("buff.data");
    for (name, attr) in buffs {
        buff_list.push(serde_json::json!({
            "名称": name,
            "描述": "U71 合成静态 BUFF",
            "attr": attr,
        }));
    }
    BuildPayload::from_json(&root.to_string())
        .expect("tables")
        .tables
}

#[test]
fn static_bonus_damage_keys_are_ignored() {
    let tables = tables_with_static(
        &[
            (990301, serde_json::json!({})),
            (990302, serde_json::json!({"BonusDamage_Fire": [0.3]})),
        ],
        &[("U71别名BUFF2", serde_json::json!({"BonusDamage_Water": [0.3]}))],
    );
    let fixture = load_fixture("dobapp_OkdnBN3OlC");
    let with_mod = |mod_id: i64| {
        let mut request = request(&fixture, serde_json::json!([]), "[远程]", &[]);
        request.settings.char_mods = vec![Some((mod_id, 10.0))];
        request
    };
    let base = evaluate_build(&tables, &with_mod(990301));
    let mod_alias = evaluate_build(&tables, &with_mod(990302));
    assert!(base.error.is_none(), "{:?}", base.error);
    assert!(mod_alias.error.is_none(), "{:?}", mod_alias.error);
    assert_eq!(
        mod_alias.target_value.to_bits(),
        base.target_value.to_bits(),
        "MOD 的 BonusDamage_Fire 应被忽略"
    );
    assert_eq!(
        panel(&mod_alias, "火属性追伤"),
        panel(&base, "火属性追伤")
    );
    assert_eq!(panel(&mod_alias, SELF_KEY), panel(&base, SELF_KEY));

    let mut buff_alias_request = with_mod(990301);
    buff_alias_request
        .settings
        .buffs
        .push(("U71别名BUFF2".to_string(), 1.0, None));
    let buff_alias = evaluate_build(&tables, &buff_alias_request);
    assert!(buff_alias.error.is_none(), "{:?}", buff_alias.error);
    assert_eq!(
        buff_alias.target_value.to_bits(),
        base.target_value.to_bits(),
        "静态 BUFF 的 BonusDamage_Water 应被忽略"
    );
    assert_eq!(
        panel(&buff_alias, "水属性追伤"),
        panel(&base, "水属性追伤")
    );
    assert_eq!(panel(&buff_alias, SELF_KEY), panel(&base, SELF_KEY));
}

// ── U112：武器池 Σ 因子 / 技能池独立 / 不按元素拆分 ──────────────────────
//
// 受控构筑：黎瑟（雷）/ 铸铁者 10302（切割、无追伤词条；近战与远程同武器消除槽位歧义）、
// 木桩 130（HP 系数 0.5）、hp 50% / 共鸣 2、`baseName = 普通攻击`、目标字段 `一段伤害`。
// 锚点由 `.tmp/u112-anchors.ts` 用 TS `calculateByBasename` 实跑得到。

/// 受控构筑请求。
fn chase_settings(custom: serde_json::Value, enemy_resistance: f64) -> serde_json::Value {
    serde_json::json!({
        "charId": 4101,
        "settings": {
            "charLevel": 80,
            "charSkillLevel": [10, 10, 10],
            "hpPercent": 0.5,
            "resonanceGain": 2,
            "meleeWeapon": 10302,
            "rangedWeapon": 10302,
            "auraMod": 0,
            "baseName": "普通攻击",
            "enemyId": 130,
            "enemyLevel": 80,
            "enemyResistance": enemy_resistance,
            "buffs": [["自定义BUFF", 1]],
            "customBuff": custom,
            "targetFunction": "一段伤害"
        }
    })
}

/// 受控追伤构筑的伤害明细（与 TS `calculateWeaponDamage` 同口径，未乘防御 / 充盈）。
fn chase_damage(
    tables: &BuildTables,
    custom: serde_json::Value,
    enemy_resistance: f64,
) -> DamageBreakdown {
    let request =
        BuildRequest::from_json(&chase_settings(custom, enemy_resistance)).expect("受控请求");
    let result = evaluate_build(tables, &request);
    assert!(result.error.is_none(), "受控求值失败：{:?}", result.error);
    result.damage.expect("目标字段应产生伤害明细")
}

/// 受控技能池目标值（`涡旋电场` 无武器归属，走技能池）。
fn skill_chase_target(tables: &BuildTables, custom: serde_json::Value) -> f64 {
    let mut settings = chase_settings(custom, 0.0)["settings"].clone();
    settings["baseName"] = serde_json::json!("涡旋电场");
    settings["targetFunction"] = serde_json::json!("伤害");
    let request = BuildRequest::from_json(&serde_json::json!({
        "charId": 4101,
        "settings": settings,
    }))
    .expect("受控请求");
    let result = evaluate_build(tables, &request);
    assert!(result.error.is_none(), "受控求值失败：{:?}", result.error);
    result.target_value
}

/// 逐值比对（TS 锚点：期望伤害 / 物理分量 / 元素分量）。
fn assert_damage(
    tables: &BuildTables,
    label: &str,
    custom: serde_json::Value,
    enemy_resistance: f64,
    expected: f64,
    physical: f64,
    element: f64,
) -> DamageBreakdown {
    let damage = chase_damage(tables, custom, enemy_resistance);
    assert_close(damage.expected_damage, expected, &format!("{label} 期望伤害"));
    assert_close(damage.physical_damage, physical, &format!("{label} 物理分量"));
    assert_close(damage.element_damage, element, &format!("{label} 元素分量"));
    damage
}

#[test]
fn chase_pool_factor_is_panel_sum() {
    let tables = tables();
    assert_damage(
        &tables,
        "基线",
        serde_json::json!([]),
        0.0,
        1.42,
        0.2690528822769736,
        1.1509471177230262,
    );
    // 任意单个分量都按同一个 Σ 因子进武器池，元素不参与
    for (label, key) in [
        ("火追伤", "火属性追伤"),
        ("雷追伤", "雷属性追伤"),
        ("自属性追伤", "自属性追伤"),
    ] {
        assert_damage(
            &tables,
            label,
            serde_json::json!([[key, 0.5]]),
            0.0,
            2.13,
            0.40357932341546043,
            1.7264206765845393,
        );
    }
    assert_damage(
        &tables,
        "六元素+自属性",
        serde_json::json!([
            ["火属性追伤", 0.1],
            ["水属性追伤", 0.1],
            ["雷属性追伤", 0.1],
            ["风属性追伤", 0.1],
            ["光属性追伤", 0.1],
            ["暗属性追伤", 0.1],
            ["自属性追伤", 0.1]
        ]),
        0.0,
        2.4139999999999997,
        0.45738989987085515,
        1.9566101001291445,
    );
    // 负值分量拉低因子；低于 -1 时整段因子钳到 0
    assert_damage(
        &tables,
        "火-0.2",
        serde_json::json!([["火属性追伤", -0.2]]),
        0.0,
        1.136,
        0.21524230582157888,
        0.9207576941784209,
    );
    assert_damage(
        &tables,
        "火-2（钳 0）",
        serde_json::json!([["火属性追伤", -2]]),
        0.0,
        0.0,
        0.0,
        0.0,
    );
}

#[test]
fn chase_factor_ignores_weakness_and_element_increase() {
    let tables = tables();
    // U112：追伤整段吃 Σ 因子，不再按自身元素吃弱点 / 元素增伤
    assert_damage(
        &tables,
        "火+火弱点",
        serde_json::json!([["火属性追伤", 0.5], ["火属性弱点", 0.54]]),
        0.0,
        2.13,
        0.40357932341546043,
        1.7264206765845393,
    );
    assert_damage(
        &tables,
        "火+全弱点",
        serde_json::json!([["火属性追伤", 0.5], ["全属性弱点", 0.54]]),
        0.0,
        3.062267165355651,
        0.40357932341546043,
        2.6586878419401905,
    );
    assert_damage(
        &tables,
        "火+水增伤",
        serde_json::json!([["火属性追伤", 0.5], ["水属性增伤", 1]]),
        0.0,
        2.13,
        0.40357932341546043,
        1.7264206765845393,
    );
}

#[test]
fn chase_factor_is_not_split_by_conversion() {
    let tables = tables();
    // 转属整段乘在追伤因子上，不生成独立 part
    assert_damage(
        &tables,
        "转切割",
        serde_json::json!([["转切割", 1]]),
        0.0,
        1.42,
        1.42,
        0.0,
    );
    assert_damage(
        &tables,
        "转切割+火",
        serde_json::json!([["转切割", 1], ["火属性追伤", 0.5]]),
        0.0,
        2.13,
        2.13,
        0.0,
    );
    assert_damage(
        &tables,
        "转贯穿50%",
        serde_json::json!([["转贯穿", 0.5]]),
        0.0,
        1.5265,
        0.9510264411384867,
        0.5754735588615131,
    );
    assert_damage(
        &tables,
        "转贯穿50%+火",
        serde_json::json!([["转贯穿", 0.5], ["火属性追伤", 0.5]]),
        0.0,
        2.2897499999999997,
        1.42653966170773,
        0.8632103382922697,
    );
    // 12 份固定 part 栈：多元素分量不再扩张 part 数量（越界会在 debug_assert 触发）
    assert_damage(
        &tables,
        "12份基线",
        serde_json::json!([
            ["转属克", 0.1],
            ["转切割", 0.1],
            ["转贯穿", 0.1],
            ["转震荡", 0.1],
            ["转灾厄", 0.1]
        ]),
        0.5,
        1.5313841660097611,
        0.7408178677691494,
        0.7905662982406118,
    );
    assert_damage(
        &tables,
        "12份+六元素",
        serde_json::json!([
            ["转属克", 0.1],
            ["转切割", 0.1],
            ["转贯穿", 0.1],
            ["转震荡", 0.1],
            ["转灾厄", 0.1],
            ["火属性追伤", 0.1],
            ["水属性追伤", 0.1],
            ["雷属性追伤", 0.1],
            ["风属性追伤", 0.1],
            ["光属性追伤", 0.1],
            ["暗属性追伤", 0.1]
        ]),
        0.5,
        2.450214665615618,
        1.1853085884306391,
        1.264906077184979,
    );
}

#[test]
fn skill_pool_factor_uses_skill_chase_only() {
    let tables = tables();
    let base = skill_chase_target(&tables, serde_json::json!([]));
    assert_close(base, 8428.953488372093, "技能池基线");
    assert_close(
        skill_chase_target(&tables, serde_json::json!([["技能追伤", 0.5]])),
        12643.430232558141,
        "技能追伤进入技能池",
    );
    assert_close(
        skill_chase_target(&tables, serde_json::json!([["技能追伤", -2]])),
        0.0,
        "技能追伤因子钳 0",
    );
    assert_close(
        skill_chase_target(&tables, serde_json::json!([["火属性追伤", 0.5]])),
        base,
        "武器追伤不进入技能池",
    );
}
