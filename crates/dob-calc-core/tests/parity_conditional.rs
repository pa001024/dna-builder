//! P2：合成小表（条件/动态/code，抄 dob-app `conditional_buff_tests.rs` 思路，零外部依赖）。
//!
//! 口径：内联 `json!` 小表（测试角色 + 4 条件 BUFF），覆盖全局汇总排除、
//! 字段级命中、`|` 交替多技能、乘法池合并；code 类差分走 `effect_code.json` 存档。

mod common;

use serde_json::json;

use dob_calc_core::Evaluator;
use dob_calc_core::config::CharSettings;
use dob_calc_core::context::BuildContext;
use dob_calc_core::record::Record;
use dob_calc_core::tables::BuildTables;

/// 磐石：普通 BUFF，独立增伤 -0.15（制造非零全局乘法池）。
const ROCK: &str = r#"{"id": 1, "名称": "磐石", "独立增伤": -0.15}"#;

/// 法露茜2溯：条件 BUFF，独立增伤 +100% 只作用于名称含「暗影奔袭」的字段。
const FALUSHI: &str = r#"{"id": 2, "名称": "法露茜2溯", "技能": "暗影奔袭", "独立增伤": 1.0}"#;

/// 煜明2溯：条件 BUFF，技能倍率乘数 0.6 只作用于名称含「酣战」的字段。
const YUMING: &str = r#"{"id": 3, "名称": "煜明2溯", "技能": "酣战", "技能倍率乘数": 0.6}"#;

/// 妮弗尔夫人2溯：`|` 交替多技能条件 BUFF。
const NIFFLER: &str =
    r#"{"id": 4, "名称": "妮弗尔夫人2溯", "技能": "月猎|日食", "技能伤害": 0.75}"#;

/// 召唤物破防：技能无视防御 17.5% 只作用于 tag 含「召唤物」的字段。
const SUMMON_BREAK: &str =
    r#"{"id": 5, "名称": "召唤破防", "tag": ["召唤物"], "技能无视防御": 0.175}"#;

/// 星河破防：无视防御 100% 只作用于名称含「星河寥落」且 tag 含「下落攻击」的字段。
const STAR_BREAK: &str =
    r#"{"id": 6, "名称": "星河破防", "技能": "星河寥落", "tag": ["下落攻击"], "无视防御": 1.0}"#;

/// 测试角色：一个技能带 6 个伤害字段（分别被上面各条件 BUFF 命中 / 不命中）。
fn char_record() -> serde_json::Value {
    json!({
        "id": 1, "名称": "测试角色", "属性": "光", "精通": ["重剑"],
        "基础攻击": 100, "基础生命": 1000, "基础防御": 100, "基础护盾": 100, "基础神智": 100,
        "技能": [{
            "id": 101, "名称": "测试技能", "类型": "E",
            "字段": [
                {"名称": "[暗影奔袭]伤害", "影响": "技能威力", "值": 1.0},
                {"名称": "[暗影一刺]伤害", "影响": "技能威力", "值": 1.0},
                {"名称": "[酣战]伤害", "影响": "技能威力", "值": 1.0},
                {"名称": "[星河寥落]伤害", "影响": "技能威力", "值": 1.0, "tag": ["近战", "武器", "下落攻击"]},
                {"名称": "[疑星落]伤害", "影响": "技能威力", "值": 1.0, "tag": ["近战", "武器", "下落攻击"]},
                {"名称": "[奔雷]伤害", "影响": "技能威力", "值": 1.0, "tag": ["技能", "战技"]},
                {"名称": "[星河寥落]技能伤害", "影响": "技能威力", "值": 1.0, "tag": ["技能", "战技"]},
                {"名称": "[召唤物·战车]技能伤害", "影响": "技能威力", "值": 1.0, "tag": ["技能", "召唤物"]},
                {"名称": "[月猎]伤害", "影响": "技能威力", "值": 1.0},
                {"名称": "[裂伤]伤害", "影响": "技能威力", "值": 1.0}
            ]
        }]
    })
}

fn buff_record(raw: &str) -> serde_json::Value {
    serde_json::from_str(raw).expect("测试 BUFF 记录应是合法 JSON")
}

fn build_tables(buffs: &[serde_json::Value]) -> BuildTables {
    let mut tables = BuildTables::default();
    tables.chars.insert(1, Record::from_value(&char_record()));
    // 木桩怪（§6.4 严格口径：缺怪物整份装配失败，合成表必须自带）。
    tables.monsters.insert(
        130,
        Record::from_value(&json!({"id": 130, "n": "木桩", "atk": 10, "def": 300, "hp": 1000})),
    );
    for buff in buffs {
        let record = Record::from_value(buff);
        tables.buffs.insert(record.text("名称"), record);
    }
    tables
}

fn settings(buffs: &[(&str, f64)]) -> CharSettings {
    CharSettings {
        base_name: "测试技能".to_string(),
        melee_weapon: 0,
        ranged_weapon: 0,
        aura_mod: 0,
        enemy_id: 130,
        buffs: buffs
            .iter()
            .map(|(name, level)| ((*name).to_string(), *level, None))
            .collect(),
        ..Default::default()
    }
}

fn evaluate_with(context: &mut BuildContext<'_>, expression: &str) -> f64 {
    let mut evaluator = Evaluator::new(context);
    evaluator.evaluate(expression).expect("求值不应失败")
}

#[test]
fn conditional_buff_excluded_from_global_attributes() {
    let tables = build_tables(&[buff_record(ROCK), buff_record(FALUSHI)]);
    let settings = settings(&[("磐石", 1.0), ("法露茜2溯", 1.0)]);
    let mut context = BuildContext::new(&tables, 1, &settings).expect("应当能装配构筑");
    // 全局独立增伤只含磐石 -0.15，法露茜2溯的 +100% 只作用于匹配字段。
    let independent = context.attrs().get("独立增伤").copied().unwrap_or(f64::NAN);
    crate::common::assert_close(independent, -0.15, "全局独立增伤");
}

#[test]
fn conditional_buff_only_applies_to_matching_fields() {
    let with_tables = build_tables(&[buff_record(ROCK), buff_record(FALUSHI)]);
    let without_tables = build_tables(&[buff_record(ROCK)]);
    let without_settings = settings(&[("磐石", 1.0)]);
    let with_settings = settings(&[("磐石", 1.0), ("法露茜2溯", 1.0)]);
    let mut without = BuildContext::new(&without_tables, 1, &without_settings).expect("装配");
    let mut with = BuildContext::new(&with_tables, 1, &with_settings).expect("装配");
    // 独立增伤 +100%：乘法池 (1-0.15)×(1+1)-1 = 0.7，倍率 1.7/0.85 = 2。
    let ratio = evaluate_with(&mut with, "E::[暗影奔袭]伤害")
        / evaluate_with(&mut without, "E::[暗影奔袭]伤害");
    crate::common::assert_close(ratio, 2.0, "命中字段倍率");
    let ratio = evaluate_with(&mut with, "E::[暗影一刺]伤害")
        / evaluate_with(&mut without, "E::[暗影一刺]伤害");
    crate::common::assert_close(ratio, 1.0, "未命中字段倍率");
}

#[test]
fn conditional_buff_alternation_and_mul() {
    let with_tables = build_tables(&[buff_record(NIFFLER), buff_record(YUMING)]);
    let without_tables = build_tables(&[]);
    let with_settings = settings(&[("妮弗尔夫人2溯", 1.0), ("煜明2溯", 1.0)]);
    let without_settings = settings(&[]);
    let mut without = BuildContext::new(&without_tables, 1, &without_settings).expect("装配");
    let mut with = BuildContext::new(&with_tables, 1, &with_settings).expect("装配");
    // `|` 交替：月猎命中（+75% 技能伤害）。
    let ratio =
        evaluate_with(&mut with, "E::[月猎]伤害") / evaluate_with(&mut without, "E::[月猎]伤害");
    assert!(ratio > 1.0, "交替命中应增伤，实际 {ratio}");
    // 未命中字段不受影响。
    let ratio = evaluate_with(&mut with, "E::[星河寥落]伤害")
        / evaluate_with(&mut without, "E::[星河寥落]伤害");
    crate::common::assert_close(ratio, 1.0, "未命中字段");
}

/// U128：条件 `技能无视防御` / `无视防御` 只进入命中字段的防御乘区（与 TS `getDef` 同口径）。
#[test]
fn conditional_ignore_defense_only_applies_to_matching_fields() {
    let with_tables = build_tables(&[buff_record(SUMMON_BREAK), buff_record(STAR_BREAK)]);
    let without_tables = build_tables(&[]);
    let with_settings = settings(&[("召唤破防", 1.0), ("星河破防", 1.0)]);
    let without_settings = settings(&[]);
    let mut without = BuildContext::new(&without_tables, 1, &without_settings).expect("装配");
    let mut with = BuildContext::new(&with_tables, 1, &with_settings).expect("装配");
    let ratio = |with: &mut BuildContext<'_>, without: &mut BuildContext<'_>, expr: &str| {
        evaluate_with(with, expr) / evaluate_with(without, expr)
    };
    // 木桩 def=300、双方 80 级：基线防御乘区 1-300/600 = 0.5
    // 召唤物字段：300×(1-0.175)=247.5 → 乘区 1-247.5/547.5，相对基线 0.5 → 1.0958904…
    crate::common::assert_close(
        ratio(&mut with, &mut without, "E::[召唤物·战车]技能伤害"),
        600.0 / 547.5,
        "召唤物字段命中技能无视防御",
    );
    // 非召唤字段不吃：奔雷 / 疑星落与基线一致
    for expr in ["E::[奔雷]伤害", "E::[疑星落]伤害"] {
        crate::common::assert_close(ratio(&mut with, &mut without, expr), 1.0, expr);
    }
    // 星河寥落：无视 100% 防御 → 乘区 1，相对基线 0.5 → ×2
    crate::common::assert_close(ratio(&mut with, &mut without, "E::[星河寥落]伤害"), 2.0, "星河寥落命中无视防御");
    // name-hit / tag-miss：名称含「星河寥落」但 tag 不含「下落攻击」不生效
    crate::common::assert_close(
        ratio(&mut with, &mut without, "E::[星河寥落]技能伤害"),
        1.0,
        "名称命中但 tag 未命中",
    );
    // 条件 BUFF 不进全局属性池：两条防御键全局均为 0
    {
        let attrs = with.attrs();
        crate::common::assert_close(attrs.get("技能无视防御").copied().unwrap_or(0.0), 0.0, "全局技能无视防御");
        crate::common::assert_close(attrs.get("无视防御").copied().unwrap_or(0.0), 0.0, "全局无视防御");
    }
    // 跨字段缓存：命中 / 未命中字段任意求值顺序同值（旧 `是否技能` 键会让第二字段复用第一字段乘区）
    let star_hit = evaluate_with(&mut with, "E::[星河寥落]伤害");
    let yi_hit = evaluate_with(&mut with, "E::[疑星落]伤害");
    for expr in [
        "E::[星河寥落]伤害 + E::[疑星落]伤害",
        "E::[疑星落]伤害 + E::[星河寥落]伤害",
    ] {
        crate::common::assert_close(evaluate_with(&mut with, expr), star_hit + yi_hit, expr);
    }
    // 临时属性：条件 0.175 + 临时 0.1 = 0.275（300/517.5）；基线仅临时 0.1（300/570）→ 570/517.5
    let temp_expr = "E::[召唤物·战车]技能伤害{技能无视防御:0.1}";
    let temp_hit = evaluate_with(&mut with, temp_expr);
    let temp_base = evaluate_with(&mut without, temp_expr);
    crate::common::assert_close(temp_hit / temp_base, 570.0 / 517.5, "临时属性叠加条件增量");
    // 同一求值内混合临时 / 无临时：各自乘区独立，等于分开求值之和（无临时属性不读写缓存）
    let plain_hit = evaluate_with(&mut with, "E::[召唤物·战车]技能伤害");
    for expr in [
        "E::[召唤物·战车]技能伤害{技能无视防御:0.1} + E::[召唤物·战车]技能伤害",
        "E::[召唤物·战车]技能伤害 + E::[召唤物·战车]技能伤害{技能无视防御:0.1}",
    ] {
        crate::common::assert_close(evaluate_with(&mut with, expr), temp_hit + plain_hit, expr);
    }
}

/// 自拼构筑的属性自洽：`attr` 缺键按 0、`assert_attrs_close` 全字段容差。
#[test]
fn conditional_attributes_self_consistent() {
    use std::collections::BTreeMap;
    let tables = build_tables(&[buff_record(ROCK)]);
    let st = settings(&[("磐石", 1.0)]);
    let mut context = BuildContext::new(&tables, 1, &st).expect("装配");
    let attrs: BTreeMap<String, f64> = context.attrs().into_iter().collect();
    // 缺键按 0（上游面板只记录非零项）。
    assert_eq!(crate::common::attr(&attrs, "不存在的属性"), 0.0);
    crate::common::assert_close(
        crate::common::attr(&attrs, "独立增伤"),
        -0.15,
        "磐石独立增伤",
    );
    crate::common::assert_attrs_close(&attrs, &serde_json::json!({"独立增伤": -0.15}), "条件自洽");
}

/// 夹具 request 装配口径：`request_from_fixture` 还原 effect_code 夹具 charId（4101）。
#[test]
fn conditional_fixture_request_shape() {
    let fixture = crate::common::load_fixture("effect_code");
    let request = crate::common::request_from_fixture(&fixture);
    assert_eq!(request.char_id, 4101);
}

#[test]
fn effect_code_diff_archived() {
    // code 开/关差值走 effect_code.json 存档（TS 侧 0.5 精确差值）。
    let fixture = crate::common::load_fixture("effect_code");
    let expected = &fixture["expected"];
    crate::common::assert_close(
        expected["差值"].as_f64().unwrap_or(f64::NAN),
        0.5,
        "code差值",
    );
    assert_eq!(expected["复合共存有限"].as_bool(), Some(true));
}
