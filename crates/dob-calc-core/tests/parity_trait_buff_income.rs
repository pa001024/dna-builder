//! 已装备潜质 / 魔灵 BUFF 的移除收益（`income::calc_equipped_buff_income`）口径回归。
//!
//! 背景：`buff_remove` 此前只剔 `settings.buffs`，潜质（`settings.traits` 组装）与
//! 魔灵被动/主动（`settings.pet_id` 派生）删了个寂寞、`without == base` 导致收益恒为 0
//! （潜质「激进/振奋」在面板上明明生效：暴击率 193% 含 +24%，浴火被动2公式可对上）。
//! 现经装配排除集剔除（`BuildContext::new_excluding`），与上游 clone 后按名过滤一致。
//!
//! 基线值取自 TS：同一份 `dobapp_lieseBathfire1` 配置（黎瑟·浴火 + 激进/振奋/老道/激昂 +
//! 紫晶艾尔芙 + 被动2）下 `CharBuild.calcEquippedBuffIncome`（见 `.tmp/expected-incomes.ts`）。
//! 常规 BUFF（被动2）用例锁定 `retain` + 排除集叠加后行为不变。

mod common;

use dob_calc_core::evaluate::BuildRequest;
use dob_calc_core::income::{build_value, calc_equipped_buff_income};
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

use crate::common::{assert_close, load_fixture};

/// 全量建表（`modules.json` 缺失时返回 `None`，调用方跳过真实求值）。
fn full_tables() -> Option<BuildTables> {
    let path = common::fixture_dir().join("modules.json");
    let text = std::fs::read_to_string(&path).ok()?;
    BuildPayload::from_json(&text)
        .map(|payload| payload.tables)
        .ok()
}

fn fixture_request() -> BuildRequest {
    let fixture = load_fixture("dobapp_lieseBathfire1");
    BuildRequest::from_json(&serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": fixture["request"]["settings"],
    }))
    .expect("夹具 request 形状非法")
}

#[test]
fn equipped_trait_removal_income_matches_ts() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let request = fixture_request();
    let base = build_value(&tables, request.char_id, &request.settings, None);
    // 潜质此前恒为 0：激进约 +3.02%，振奋约 +4.45%（TS 值）。
    for (name, expected) in [
        ("魔灵潜质:激进", 0.030227949319751923),
        ("魔灵潜质:振奋", 0.04454242509306083),
    ] {
        let income = calc_equipped_buff_income(
            &tables,
            request.char_id,
            &request.settings,
            name,
            None,
            Some(base),
        );
        assert!(income > 0.0, "{name} 移除收益应为正，实得 {income}");
        assert_close(income, expected, name);
    }
}

#[test]
fn equipped_pet_removal_income_matches_ts() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let request = fixture_request();
    let base = build_value(&tables, request.char_id, &request.settings, None);
    // 魔灵被动/主动此前同样恒为 0（settings.pet_id 派生，retain 够不到）。
    for (name, expected) in [
        ("紫晶艾尔芙", 0.15935115807196287),
        ("紫晶艾尔芙(主动)", 0.024167677187865833),
    ] {
        let income = calc_equipped_buff_income(
            &tables,
            request.char_id,
            &request.settings,
            name,
            None,
            Some(base),
        );
        assert!(income > 0.0, "{name} 移除收益应为正，实得 {income}");
        assert_close(income, expected, name);
    }
}

#[test]
fn equipped_regular_buff_removal_unchanged() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let request = fixture_request();
    let base = build_value(&tables, request.char_id, &request.settings, None);
    // 常规 BUFF 走 settings.buffs：retain + 排除集叠加后与 TS 一致（约 +912.03%）。
    let income = calc_equipped_buff_income(
        &tables,
        request.char_id,
        &request.settings,
        "黎瑟·浴火被动2",
        None,
        Some(base),
    );
    assert_close(income, 9.12030851739506, "黎瑟·浴火被动2");
}
