//! 特效 code / 裸标识符口径回归（对齐 TS `CharBuild.ts`）。
//!
//! 两处曾与 TS 漂移的算法差异：
//! 1. MOD / 武器特效的 `code` 与动态 BUFF 的 `code` 同批执行
//!    （上游 `[...dynamicBuffs, ...effectCodeBuffs]`），不能因为「没有动态 BUFF」整体跳过；
//!    否则 `无解谜题` 的 `if(技能速度>2.2){技能伤害+=0.9;技能无视防御+=0.3}` 在纯静态 BUFF 构筑里失效。
//! 2. 裸标识符（无命名空间）取武器面板按 `baseName` 回退（上游 `getCalculatedWeaponAttr` 的
//!    `base || this.baseName`），否则 `攻速` / `暴击` 等面板字段读成 0，`DPS` 宏退回技能速度。
//!
//! 基线值取自 TS `CharBuild` 1.5.0（同一份去除 code BUFF 后的 `dobapp_lieseBathfire1` 配置）。

mod common;

use dob_calc_core::evaluate::{BuildRequest, evaluate_build, evaluate_expressions};
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

use crate::common::{assert_close, load_fixture};

/// 夹具里唯一的 code BUFF（去掉后构筑只剩静态 BUFF，特效 code 仍需生效）。
const CODE_BUFF_NAME: &str = "黎瑟·浴火2溯";

/// 全量建表（`modules.json` 缺失时返回 `None`，调用方跳过真实求值）。
fn full_tables() -> Option<BuildTables> {
    let path = common::fixture_dir().join("modules.json");
    let text = std::fs::read_to_string(&path).ok()?;
    BuildPayload::from_json(&text)
        .map(|payload| payload.tables)
        .ok()
}

/// 读取夹具配置并去掉全部 code BUFF，构造只含静态 BUFF 的请求。
/// @returns 去 code BUFF 后的构筑请求
fn request_without_code_buffs() -> BuildRequest {
    let fixture = load_fixture("dobapp_lieseBathfire1");
    let mut settings = fixture["request"]["settings"].clone();
    let buffs = settings["buffs"]
        .as_array_mut()
        .expect("夹具 buffs 应为数组");
    let before = buffs.len();
    buffs.retain(|entry| entry[0].as_str() != Some(CODE_BUFF_NAME));
    assert_eq!(buffs.len() + 1, before, "夹具应各含一条 {CODE_BUFF_NAME}");
    BuildRequest::from_json(&serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": settings,
    }))
    .expect("夹具 request 形状非法")
}

#[test]
fn effect_code_applies_without_dynamic_buffs() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let request = request_without_code_buffs();
    let result = evaluate_build(&tables, &request);

    // 无解谜题特效已生效（技能速度 2.8 > 2.2）：技能伤害 +0.9、技能无视防御 +0.3。
    assert_close(
        result.attributes.get("技能伤害").copied().unwrap_or(0.0),
        3.8850400000000005,
        "技能伤害",
    );
    assert_close(
        result
            .attributes
            .get("技能无视防御")
            .copied()
            .unwrap_or(0.0),
        0.6,
        "技能无视防御",
    );
    assert_close(
        result.attributes.get("技能速度").copied().unwrap_or(0.0),
        2.8,
        "技能速度",
    );
}

#[test]
fn bare_identifier_falls_back_to_base_name_weapon_panel() {
    let Some(tables) = full_tables() else {
        eprintln!("modules.json 缺失，跳过真实求值");
        return;
    };
    let request = request_without_code_buffs();
    let expressions = ["攻速", "暴击", "伤害", "DPS"];
    let results = evaluate_expressions(&tables, &request, &expressions.map(String::from));
    let value = |index: usize| results[index].value.unwrap_or(f64::NAN);

    // `攻速` / `暴击` 来自 baseName（求索）对应的武器面板；`伤害` 为按角色面板结算的求索伤害
    assert_close(value(0), 1.44, "攻速");
    assert_close(value(1), 1.65, "暴击");
    // `伤害` 为角色链路的求索伤害（不含近战武器攻击/双爆）；`DPS` 宏取 `or(攻速,技能速度)` → 攻速
    assert_close(value(2), 340529683.93213063, "伤害");
    assert_close(value(3), 490362744.8622681, "DPS");
}
