//! U89d1 / U89d1-fix：协战 `assist1/assist2` 解析 / 钳制 / 序列化形状 / 会话指纹敏感度。

use serde_json::{Value, json};

use dob_calc_core::config::{AssistSettings, CharSettings, ModVariant};
use dob_calc_core::evaluate::fingerprint_settings;

/// 完整协战 loadout 夹具（字段形状照抄 TS `AssistCharSettings`）。
const FULL_SETTINGS: &str = r#"{
    "charLevel": 80,
    "baseName": "主控技能",
    "team1": 1801,
    "team1Weapon": 20509,
    "team2": 1802,
    "team2Weapon": 20510,
    "assist1": {
        "charLevel": 62,
        "charSkillLevel": [12, 10, 8],
        "baseName": "扶疏Q",
        "extraMastery": "长柄",
        "weaponLevel": 70,
        "weaponRefine": 3,
        "targetFunction": "扶疏::技能威力*2",
        "customVariables": [["[x]", "1+1"]],
        "dotSettings": {"skill": 1.5, "melee": 0.5, "ranged": 0, "skillweapon": 2, "forceOwnAdditionalDamage": true},
        "enabled": true,
        "auraMod": 51765,
        "charMods": [[51463, 10], null, null, null, null, null, null, null],
        "meleeMods": [[43342, 6]],
        "rangedMods": [],
        "skillWeaponMods": [[54003, 10], null, null, null],
        "modVariantIndex": 1,
        "modVariants": [
            {"中枢": 31524, "角色": [[1, 2]], "近战": [], "远程": [], "同律": [[2, 3]]}
        ],
        "buffs": [["莉兹贝尔1溯", 1], ["菲娜Q", 12, 0.6]],
        "customBuff": [["近战触发", 2.32]],
        "useGlobal": true,
        "effectConfig": {"m:43342": 6, "w:20509": 3}
    },
    "assist2": {}
}"#;

fn parse(text: &str) -> CharSettings {
    let value: Value = serde_json::from_str(text).expect("夹具 JSON 应当合法");
    CharSettings::from_json(&value)
}

fn fingerprint(settings: &CharSettings) -> u64 {
    fingerprint_settings(settings, false, None)
}

fn assembly_fingerprint(settings: &CharSettings) -> u64 {
    fingerprint_settings(settings, true, None)
}

fn with_assist(assist1: Option<AssistSettings>, assist2: Option<AssistSettings>) -> CharSettings {
    CharSettings {
        team1: Some(1801),
        team2: Some(1802),
        assist1,
        assist2,
        ..Default::default()
    }
}

/// 指纹基座：让每个集合字段都有既有条目，便于验证「同条目数只改内容」。
fn fingerprint_base() -> AssistSettings {
    let mut base = AssistSettings::default();
    base.base_name = "扶疏Q".to_string();
    base.extra_mastery = "长柄".to_string();
    base.target_function = "1+1".to_string();
    base.custom_variables = vec![("[x]".to_string(), "1+1".to_string())];
    base.custom_buff = vec![("近战触发".to_string(), 2.32)];
    base.effect_config = vec![("m:43342".to_string(), 6.0)];
    base.buffs = vec![("莉兹贝尔1溯".to_string(), 1.0, None)];
    base.char_mods[0] = Some((1, 10.0));
    base.melee_mods[0] = Some((1, 10.0));
    base.ranged_mods[0] = Some((1, 10.0));
    base.skill_mods[0] = Some((1, 10.0));
    base.mod_variants.push(ModVariant {
        char_mods: vec![Some((1, 10.0)); 8],
        ..Default::default()
    });
    base
}

fn mutated(base: &AssistSettings, edit: impl FnOnce(&mut AssistSettings)) -> AssistSettings {
    let mut value = base.clone();
    edit(&mut value);
    value
}

fn assert_both_fingerprints_change(base: &AssistSettings, changed: &AssistSettings, label: &str) {
    let base_settings = with_assist(Some(base.clone()), None);
    let changed_settings = with_assist(Some(changed.clone()), None);
    assert_ne!(
        fingerprint(&base_settings),
        fingerprint(&changed_settings),
        "{label}: 求值指纹未变化（字段未参与指纹）"
    );
    assert_ne!(
        assembly_fingerprint(&base_settings),
        assembly_fingerprint(&changed_settings),
        "{label}: 装配指纹未变化（字段未参与指纹）"
    );
}

#[test]
fn parses_full_assist_loadout() {
    let settings = parse(FULL_SETTINGS);
    let assist = settings.assist1.as_ref().expect("assist1 应解析成功");

    assert_eq!(assist.char_level, 62.0);
    assert_eq!(assist.char_skill_level, [10.0, 10.0, 8.0]);
    assert_eq!(assist.base_name, "扶疏Q");
    assert_eq!(assist.extra_mastery, "长柄");
    assert_eq!(assist.weapon_level, 70.0);
    assert_eq!(assist.weapon_refine, 3.0);
    assert_eq!(assist.target_function, "扶疏::技能威力*2");
    assert_eq!(
        assist.custom_variables,
        vec![("[x]".to_string(), "1+1".to_string())]
    );
    assert_eq!(assist.dot_settings.skill, 1.5);
    assert_eq!(assist.dot_settings.melee, 0.5);
    assert_eq!(assist.dot_settings.skillweapon, 2.0);
    assert!(assist.dot_settings.force_own_additional_damage);
    assert!(assist.enabled);
    assert_eq!(assist.aura_mod, 51765);

    assert_eq!(assist.char_mods.len(), 8);
    assert_eq!(assist.char_mods[0], Some((51463, 10.0)));
    assert_eq!(assist.char_mods[1], None);
    assert_eq!(assist.melee_mods.len(), 8);
    assert_eq!(assist.melee_mods[0], Some((43342, 6.0)));
    assert_eq!(assist.ranged_mods, vec![None; 8]);
    assert_eq!(assist.skill_mods.len(), 4);
    assert_eq!(assist.skill_mods[0], Some((54003, 10.0)));

    assert_eq!(assist.mod_variant_index, 1);
    assert_eq!(assist.mod_variants.len(), 1);
    let variant = &assist.mod_variants[0];
    assert_eq!(variant.aura, Some(31524));
    assert_eq!(variant.char_mods.len(), 8);
    assert_eq!(variant.char_mods[0], Some((1, 2.0)));
    assert_eq!(variant.skill_mods.len(), 4);
    assert_eq!(variant.skill_mods[0], Some((2, 3.0)));

    assert_eq!(
        assist.buffs[0],
        ("莉兹贝尔1溯".to_string(), 1.0, None),
        "覆盖率缺省按 1 处理"
    );
    assert_eq!(assist.buffs[1], ("菲娜Q".to_string(), 12.0, Some(0.6)));
    assert_eq!(
        assist.custom_buff,
        vec![("近战触发".to_string(), 2.32)]
    );
    assert!(assist.use_global);
    assert_eq!(
        assist.effect_config,
        vec![
            ("m:43342".to_string(), 6.0),
            ("w:20509".to_string(), 3.0)
        ]
    );

    // raw parse 只按 team2 是否为非零数字推断启用位，不校验 1802 是否存在角色；
    // 表相关归一化由 peer 构建期完成（见 `ts_normalization_split_raw_vs_peer_baselines`）。
    let assist2 = settings.assist2.as_ref().expect("assist2 应解析成功");
    assert!(assist2.enabled);
    assert_eq!(assist2.base_name, "", "raw parse 不做技能表回退");
    assert_eq!(settings.assist2, Some(AssistSettings::default()));
}

#[test]
fn missing_or_invalid_assist_is_none() {
    let settings = CharSettings::from_json(&json!({}));
    assert!(settings.assist1.is_none());
    assert!(settings.assist2.is_none());

    for assist in [json!(null), json!([]), json!("x"), json!(5), json!(true)] {
        let settings = CharSettings::from_json(&json!({"team1": 1801, "assist1": assist}));
        assert!(
            settings.assist1.is_none(),
            "非对象 assist1 不应构造 loadout"
        );
    }
}

#[test]
fn missing_fields_use_ts_defaults() {
    let settings = CharSettings::from_json(&json!({"team1": 1801, "assist1": {}}));
    assert_eq!(settings.assist1, Some(AssistSettings::default()));

    // 未配置角色 / 非正 id 时启用位按 TS 口径推断为 false（不会默认参与合计）
    for raw in [json!({"assist1": {}}), json!({"team1": 0, "assist1": {}})] {
        let settings = CharSettings::from_json(&raw);
        let assist = settings.assist1.as_ref().expect("空对象仍应补齐结构");
        assert!(!assist.enabled);
        assert_eq!(
            assist,
            &AssistSettings {
                enabled: false,
                ..Default::default()
            }
        );
    }
}

#[test]
fn ts_normalization_split_raw_vs_peer_baselines() {
    // TS `normalizeAssistSideSettings({}, 1801)`：enabled = true；baseName 回退该角色首个技能。
    // raw 层只能对齐 enabled；baseName 依赖角色表，由 peer 构建补齐
    // （`parity_team_namespace::peer_base_name_falls_back_to_first_skill`）。
    let settings = CharSettings::from_json(&json!({"team1": 1801, "assist1": {}}));
    let assist = settings.assist1.as_ref().expect("assist1 应解析成功");
    assert!(assist.enabled, "有效角色：与 TS 一致");
    assert_eq!(assist.base_name, "", "raw 层只 trim，不做技能表回退");

    // 1802 是数字但不在角色表：raw 层无法判定存在性（enabled = true），
    // peer 构建会拒绝并让查询恒 0
    // （`parity_team_namespace::disabled_assist_missing_weapon_and_unconfigured_are_zero`）。
    let settings = CharSettings::from_json(&json!({"team1": 1802, "assist1": {}}));
    assert!(settings.assist1.as_ref().unwrap().enabled);

    // team1 = 0：TS `charMap.get(0)` 不存在 → enabled = false；Rust raw 同口径。
    let settings = CharSettings::from_json(&json!({"team1": 0, "assist1": {}}));
    assert!(!settings.assist1.as_ref().unwrap().enabled);
}

#[test]
fn wrong_types_fall_back_without_panic() {
    let settings = CharSettings::from_json(&json!({
        "team1": 1801,
        "assist1": {
            "charLevel": "80",
            "charSkillLevel": "12",
            "baseName": 42,
            "extraMastery": null,
            "weaponLevel": [],
            "weaponRefine": {},
            "targetFunction": false,
            "customVariables": [[1, 2], ["ok", "1+1", "extra"], "bad"],
            "dotSettings": {"skill": "x", "melee": -3},
            "enabled": "yes",
            "auraMod": "x",
            "charMods": "bad",
            "modVariants": "bad",
            "buffs": [["bad"], ["ok", 1, 0.5], ["ok2", "x"]],
            "customBuff": [["a"], ["b", 0.30000000000000004]],
            "useGlobal": 1,
            "effectConfig": []
        }
    }));
    let assist = settings.assist1.as_ref().expect("assist1 应解析成功");

    assert_eq!(assist.char_level, 80.0);
    assert_eq!(assist.char_skill_level, [10.0; 3]);
    assert_eq!(assist.base_name, "");
    assert_eq!(assist.extra_mastery, "");
    assert_eq!(assist.weapon_level, 80.0);
    assert_eq!(assist.weapon_refine, 5.0);
    assert_eq!(assist.target_function, "");
    assert_eq!(
        assist.custom_variables,
        vec![("ok".to_string(), "1+1".to_string())]
    );
    assert_eq!(assist.dot_settings.skill, 0.0);
    assert_eq!(assist.dot_settings.melee, 0.0);
    assert!(assist.enabled, "非法 enabled 按 team 是否为非零数字推断");
    assert_eq!(assist.aura_mod, 0);
    assert_eq!(assist.char_mods, vec![None; 8]);
    assert!(assist.mod_variants.is_empty());
    assert_eq!(assist.buffs, vec![("ok".to_string(), 1.0, Some(0.5))]);
    assert_eq!(assist.custom_buff, vec![("b".to_string(), 0.3)]);
    assert!(!assist.use_global);
    assert!(assist.effect_config.is_empty());
}

#[test]
fn clamps_levels_refine_and_variant_index() {
    let settings = CharSettings::from_json(&json!({
        "assist1": {
            "charLevel": 200.4,
            "weaponLevel": -3,
            "weaponRefine": 9,
            "charSkillLevel": [0, 31.4, "x"],
            "auraMod": 12.6,
            "dotSettings": {"skill": -2.5},
            "modVariants": [{"中枢": 1}, {"中枢": 2}, {"中枢": 3}],
            "modVariantIndex": 99
        }
    }));
    let assist = settings.assist1.as_ref().expect("assist1 应解析成功");

    assert_eq!(assist.char_level, 80.0, "charLevel 上限 80");
    assert_eq!(assist.weapon_level, 1.0, "weaponLevel 下限 1");
    assert_eq!(assist.weapon_refine, 5.0, "weaponRefine 上限 5");
    assert_eq!(assist.char_skill_level, [1.0, 10.0, 1.0]);
    assert_eq!(assist.aura_mod, 13);
    assert_eq!(assist.dot_settings.skill, 0.0, "DOT 负值归零");
    assert_eq!(assist.mod_variants.len(), 2, "只保留 B/C 两份变体");
    assert_eq!(assist.mod_variant_index, 2, "索引进位后钳制到变体数");

    let settings = CharSettings::from_json(&json!({
        "assist1": {"modVariantIndex": -1.2, "charSkillLevel": 12}
    }));
    let assist = settings.assist1.as_ref().expect("assist1 应解析成功");
    assert_eq!(assist.mod_variant_index, 0, "负索引归零");
    assert_eq!(assist.char_skill_level, [10.0; 3], "老格式单数字展开并钳制基础上限 10");
}

#[test]
fn fractional_slots_and_aura_are_rounded() {
    let settings = CharSettings::from_json(&json!({
        "assist1": {
            "auraMod": -4.2,
            "charMods": [[51463.4, 10.6], [true, 10], ["1", 2], [1], null],
            "meleeMods": [[43342.6, 6.4]],
            "skillWeaponMods": [[54003.49, 9.5]],
            "modVariants": [{"中枢": 1.5, "角色": [[1.6, 2.5]]}]
        }
    }));
    let assist = settings.assist1.as_ref().expect("assist1 应解析成功");

    assert_eq!(assist.aura_mod, 0, "auraMod 负值归零");
    assert_eq!(assist.char_mods[0], Some((51463, 11.0)), "分数 id / 等级取整");
    assert_eq!(assist.char_mods[1], None, "非法 id 条目补空槽");
    assert_eq!(assist.char_mods[2], None);
    assert_eq!(assist.char_mods[3], None, "缺等级条目补空槽");
    assert_eq!(assist.melee_mods[0], Some((43343, 6.0)));
    assert_eq!(assist.skill_mods[0], Some((54003, 10.0)));

    let variant = &assist.mod_variants[0];
    assert_eq!(variant.aura, Some(2), "中枢 1.5 → 2");
    assert_eq!(variant.char_mods[0], Some((2, 3.0)), "变体槽 id / 等级取整");
}

#[test]
fn buff_coverage_boundaries() {
    let settings = CharSettings::from_json(&json!({
        "assist1": {
            "buffs": [
                ["a", 1, 1],
                ["b", 1, 2],
                ["c", 1, -0.5],
                ["d", 1, "x"],
                ["e", 1, null],
                ["f", 1, 0.30000000000000004]
            ]
        }
    }));
    let assist = settings.assist1.as_ref().expect("assist1 应解析成功");

    assert_eq!(assist.buffs[0], ("a".to_string(), 1.0, None), "覆盖率 1 省略");
    assert_eq!(assist.buffs[1], ("b".to_string(), 1.0, None), "覆盖率 >1 省略");
    assert_eq!(
        assist.buffs[2],
        ("c".to_string(), 1.0, Some(-0.5)),
        "负覆盖率保留（TS 同口径）"
    );
    assert_eq!(assist.buffs[3], ("d".to_string(), 1.0, None), "非数字省略");
    assert_eq!(assist.buffs[4], ("e".to_string(), 1.0, None), "null 省略");
    assert_eq!(
        assist.buffs[5],
        ("f".to_string(), 1.0, Some(0.3)),
        "六位小数归一"
    );
}

#[test]
fn invalid_variant_entries_keep_fixed_slot_shape() {
    let settings = CharSettings::from_json(&json!({"assist1": {"modVariants": [null, 5]}}));
    let assist = settings.assist1.as_ref().expect("assist1 应解析成功");
    assert_eq!(assist.mod_variants.len(), 2, "非法条目补空变体，不丢弃");
    for variant in &assist.mod_variants {
        assert_eq!(variant.char_mods.len(), 8);
        assert_eq!(variant.melee_mods.len(), 8);
        assert_eq!(variant.ranged_mods.len(), 8);
        assert_eq!(variant.skill_mods.len(), 4);
    }
    // 脏输入也满足「解析 → 序列化 → 再解析」结构一致
    let reparsed = CharSettings::from_json(&settings.to_json_value());
    assert_eq!(reparsed.assist1, settings.assist1);
}

#[test]
fn to_json_value_exact_shape() {
    let value = parse(FULL_SETTINGS).to_json_value();
    let assist = value["assist1"].as_object().expect("assist1 应为对象");

    let keys = [
        "charLevel",
        "charSkillLevel",
        "baseName",
        "extraMastery",
        "weaponLevel",
        "weaponRefine",
        "targetFunction",
        "customVariables",
        "dotSettings",
        "enabled",
        "auraMod",
        "charMods",
        "meleeMods",
        "rangedMods",
        "skillWeaponMods",
        "modVariantIndex",
        "modVariants",
        "buffs",
        "customBuff",
        "useGlobal",
        "effectConfig",
    ];
    assert_eq!(assist.len(), keys.len(), "21 个 TS 键必须齐全");
    for key in keys {
        assert!(assist.contains_key(key), "缺少键 {key}");
    }

    assert_eq!(assist.get("charLevel"), Some(&json!(62.0)));
    assert_eq!(assist.get("charSkillLevel"), Some(&json!([10.0, 10.0, 8.0])));
    assert_eq!(assist.get("baseName"), Some(&json!("扶疏Q")));
    assert_eq!(assist.get("extraMastery"), Some(&json!("长柄")));
    assert_eq!(assist.get("weaponLevel"), Some(&json!(70.0)));
    assert_eq!(assist.get("weaponRefine"), Some(&json!(3.0)));
    assert_eq!(
        assist.get("targetFunction"),
        Some(&json!("扶疏::技能威力*2"))
    );
    assert_eq!(
        assist.get("customVariables"),
        Some(&json!([["[x]", "1+1"]]))
    );
    assert_eq!(assist.get("enabled"), Some(&json!(true)));
    assert_eq!(assist.get("auraMod"), Some(&json!(51765)));
    assert_eq!(
        assist.get("charMods").unwrap().as_array().unwrap().len(),
        8
    );
    assert_eq!(
        assist.get("meleeMods").unwrap().as_array().unwrap().len(),
        8
    );
    assert_eq!(
        assist.get("rangedMods").unwrap().as_array().unwrap().len(),
        8
    );
    assert_eq!(
        assist.get("skillWeaponMods").unwrap().as_array().unwrap().len(),
        4
    );
    assert_eq!(assist.get("modVariantIndex"), Some(&json!(1)));
    assert_eq!(assist.get("customBuff"), Some(&json!([["近战触发", 2.32]])));
    assert_eq!(assist.get("useGlobal"), Some(&json!(true)));
    assert_eq!(
        assist.get("effectConfig"),
        Some(&json!({"m:43342": 6.0, "w:20509": 3.0}))
    );

    let dot = assist.get("dotSettings").unwrap().as_object().unwrap();
    assert_eq!(dot.len(), 5, "dotSettings 五个键");
    assert_eq!(dot.get("skill"), Some(&json!(1.5)));
    assert_eq!(dot.get("melee"), Some(&json!(0.5)));
    assert_eq!(dot.get("ranged"), Some(&json!(0.0)));
    assert_eq!(dot.get("skillweapon"), Some(&json!(2.0)));
    assert_eq!(dot.get("forceOwnAdditionalDamage"), Some(&json!(true)));

    let variant = assist["modVariants"].as_array().unwrap()[0]
        .as_object()
        .expect("变体应为对象");
    assert_eq!(variant.len(), 5, "变体五键");
    assert_eq!(variant.get("中枢"), Some(&json!(31524)));
    assert_eq!(variant["角色"].as_array().unwrap()[0], json!([1, 2.0]));
    assert_eq!(variant["近战"].as_array().unwrap().len(), 8);
    assert_eq!(variant["远程"].as_array().unwrap().len(), 8);
    assert_eq!(variant["同律"].as_array().unwrap()[0], json!([2, 3.0]));

    let buffs = assist["buffs"].as_array().unwrap();
    assert_eq!(buffs[0].as_array().unwrap().len(), 2, "覆盖率 1 → 两元素");
    assert_eq!(buffs[1].as_array().unwrap().len(), 3, "覆盖率 <1 → 三元素");
}

#[test]
fn zero_aura_variant_serializes_number_zero() {
    let settings = CharSettings::from_json(
        &json!({"assist1": {"modVariants": [{"角色": [[1, 2]]}]}}),
    );
    let value = settings.to_json_value();
    let aura = &value["assist1"]["modVariants"][0]["中枢"];
    assert_eq!(aura, &json!(0), "中枢未设置必须输出数字 0，而不是 null");
    assert!(aura.is_number());

    // 顶层同构：`CharSettings.to_json_value` 的变体中枢同样输出 0
    let mut top = CharSettings::default();
    top.mod_variants.push(ModVariant::default());
    let value = top.to_json_value();
    assert_eq!(value["modVariants"][0]["中枢"], json!(0));
    assert!(value["modVariants"][0]["中枢"].is_number());
}

#[test]
fn to_json_value_round_trips_assist_fields() {
    let settings = parse(FULL_SETTINGS);
    let value = settings.to_json_value();

    assert_eq!(value["assist1"]["charLevel"], json!(62.0));
    assert_eq!(value["assist1"]["skillWeaponMods"][0], json!([54003, 10.0]));
    assert_eq!(value["assist2"]["charLevel"], json!(80.0));

    let reparsed =
        CharSettings::from_json(&serde_json::from_str(&serde_json::to_string(&value).unwrap()).unwrap());
    assert_eq!(reparsed.assist1, settings.assist1);
    assert_eq!(reparsed.assist2, settings.assist2);

    // 未配置时输出 null，且再解析仍为 None
    let empty = CharSettings::default();
    let value = empty.to_json_value();
    assert!(value["assist1"].is_null());
    assert!(value["assist2"].is_null());
    let reparsed = CharSettings::from_json(&value);
    assert!(reparsed.assist1.is_none());
    assert!(reparsed.assist2.is_none());
}

#[test]
fn fingerprint_distinguishes_assist_loadouts() {
    let base = fingerprint_base();
    let none = with_assist(None, None);
    let empty = with_assist(Some(AssistSettings::default()), None);
    let base_settings = with_assist(Some(base.clone()), None);

    // None 与 Some(默认) 必须区分
    assert_ne!(fingerprint(&none), fingerprint(&empty));
    assert_ne!(assembly_fingerprint(&none), assembly_fingerprint(&empty));

    // 条目数量不变，只改内容：长度-only 的指纹实现不能通过。
    let buff_changed = mutated(&base, |assist| assist.buffs[0].1 = 2.0);
    let level_changed = mutated(&base, |assist| assist.char_level -= 1.0);
    let variant_changed = mutated(&base, |assist| {
        assist.mod_variants[0].char_mods[0] = Some((1, 11.0));
    });

    let fingerprints = [
        fingerprint(&base_settings),
        fingerprint(&with_assist(Some(buff_changed), None)),
        fingerprint(&with_assist(Some(level_changed), None)),
        fingerprint(&with_assist(Some(variant_changed), None)),
    ];
    for left in 0..fingerprints.len() {
        for right in left + 1..fingerprints.len() {
            assert_ne!(
                fingerprints[left], fingerprints[right],
                "第 {left} / {right} 份协战设置的指纹不应相同"
            );
        }
    }

    // 协战二同样参与指纹：同条目数只改内容
    let assist2_base = with_assist(None, Some(base.clone()));
    let assist2_changed = with_assist(
        None,
        Some(mutated(&base, |assist| assist.custom_buff[0].1 = 2.33)),
    );
    assert_ne!(fingerprint(&assist2_base), fingerprint(&assist2_changed));
    assert_ne!(
        assembly_fingerprint(&assist2_base),
        assembly_fingerprint(&assist2_changed)
    );

    // 协战一 / 协战二位置不同也必须区分
    let only_assist1 = with_assist(Some(base.clone()), None);
    let only_assist2 = with_assist(None, Some(base));
    assert_ne!(fingerprint(&only_assist1), fingerprint(&only_assist2));
}

#[test]
fn fingerprint_covers_every_assist_field() {
    let base = fingerprint_base();

    let mutations: Vec<(&str, AssistSettings)> = vec![
        ("charLevel", mutated(&base, |assist| assist.char_level = 79.0)),
        (
            "charSkillLevel",
            mutated(&base, |assist| assist.char_skill_level[1] = 9.0),
        ),
        (
            "baseName",
            mutated(&base, |assist| assist.base_name = "扶疏E".to_string()),
        ),
        (
            "extraMastery",
            mutated(&base, |assist| assist.extra_mastery.clear()),
        ),
        (
            "weaponLevel",
            mutated(&base, |assist| assist.weapon_level = 79.0),
        ),
        (
            "weaponRefine",
            mutated(&base, |assist| assist.weapon_refine = 4.0),
        ),
        (
            "targetFunction",
            mutated(&base, |assist| assist.target_function = "1+2".to_string()),
        ),
        (
            "customVariables.value",
            mutated(&base, |assist| {
                assist.custom_variables[0].1 = "1+2".to_string();
            }),
        ),
        (
            "dotSettings.skill",
            mutated(&base, |assist| assist.dot_settings.skill = 1.0),
        ),
        (
            "dotSettings.melee",
            mutated(&base, |assist| assist.dot_settings.melee = 1.0),
        ),
        (
            "dotSettings.ranged",
            mutated(&base, |assist| assist.dot_settings.ranged = 1.0),
        ),
        (
            "dotSettings.skillweapon",
            mutated(&base, |assist| assist.dot_settings.skillweapon = 1.0),
        ),
        (
            "dotSettings.forceOwnAdditionalDamage",
            mutated(&base, |assist| {
                assist.dot_settings.force_own_additional_damage = true;
            }),
        ),
        ("enabled", mutated(&base, |assist| assist.enabled = false)),
        ("auraMod", mutated(&base, |assist| assist.aura_mod = 1)),
        (
            "charMods.level",
            mutated(&base, |assist| assist.char_mods[0] = Some((1, 11.0))),
        ),
        (
            "meleeMods.level",
            mutated(&base, |assist| assist.melee_mods[0] = Some((1, 11.0))),
        ),
        (
            "rangedMods.level",
            mutated(&base, |assist| assist.ranged_mods[0] = Some((1, 11.0))),
        ),
        (
            "skillWeaponMods.level",
            mutated(&base, |assist| assist.skill_mods[0] = Some((1, 11.0))),
        ),
        (
            "modVariantIndex",
            mutated(&base, |assist| assist.mod_variant_index = 1),
        ),
        (
            "modVariants.aura",
            mutated(&base, |assist| assist.mod_variants[0].aura = Some(31524)),
        ),
        (
            "modVariants.slotLevel",
            mutated(&base, |assist| {
                assist.mod_variants[0].char_mods[0] = Some((1, 11.0));
            }),
        ),
        (
            "buffs.coverage",
            mutated(&base, |assist| assist.buffs[0].2 = Some(0.6)),
        ),
        (
            "customBuff.value",
            mutated(&base, |assist| assist.custom_buff[0].1 = 2.33),
        ),
        (
            "useGlobal",
            mutated(&base, |assist| assist.use_global = true),
        ),
        (
            "effectConfig.value",
            mutated(&base, |assist| assist.effect_config[0].1 = 7.0),
        ),
    ];

    for (label, changed) in &mutations {
        assert_both_fingerprints_change(&base, changed, label);
    }
}
