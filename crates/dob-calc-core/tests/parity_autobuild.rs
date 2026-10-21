//! 自动配装对齐回归：与 TS `benchmark-autobuild.ts` 同输入同结果。
//!
//! 起始 lise_fire 推荐构筑 + 全量 510 候选 + 三槽全搜 + 武器固定。
//! TS 基线（`bun tools/benchmark-autobuild.ts`）：`target=27230213718.39851 slots=8/8/8`（技速 280% 上限后）。
//! Rust 曾因条件预热/排序逻辑与上游失配给出 8556M（错误结果），此处锁定：
//! 1. 目标值逐位一致；2. 三槽 id 集合一致（顺序是收益序，允许不同）。

mod common;

use std::path::PathBuf;

use dob_calc_core::autobuild::{AutobuildOptions, AutobuildRequest, ModCandidate, autobuild};
use dob_calc_core::evaluate::{BuildRequest, evaluate_build};
use dob_calc_core::income::ModSlotKey;
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

fn tables() -> BuildTables {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).expect("modules.json");
    BuildPayload::from_json(&text).expect("tables").tables
}

fn sorted_ids(slots: &[Option<(i64, f64)>]) -> Vec<i64> {
    let mut ids: Vec<i64> = slots.iter().flatten().map(|slot| slot.0).collect();
    ids.sort_unstable();
    ids
}

#[test]
fn autobuild_matches_ts_baseline() {
    let tables = tables();
    let fixture = common::load_fixture("lise_fire");
    let base = BuildRequest::from_json(&fixture["request"]).expect("request");
    let mut ids: Vec<i64> = tables
        .mods
        .iter()
        .filter(|(_, source)| {
            let kind = source.data.text("类型");
            kind.starts_with("角色") || kind.starts_with("近战") || kind.starts_with("远程")
        })
        .map(|(id, _)| *id)
        .collect();
    ids.sort_unstable();
    assert_eq!(ids.len(), 510, "候选池应与 TS 同口径 510");
    let candidates: Vec<ModCandidate> = ids
        .iter()
        .map(|id| ModCandidate { id: *id, level: 10.0, buff_level: None, count: 8.0 })
        .collect();
    let request = AutobuildRequest {
        base: base.clone(),
        mod_candidates: candidates,
        melee_candidates: Vec::new(),
        ranged_candidates: Vec::new(),
        options: AutobuildOptions {
            include_types: vec![ModSlotKey::Char, ModSlotKey::Melee, ModSlotKey::Ranged],
            preserve_types: Vec::new(),
            fixed_melee: true,
            fixed_ranged: true,
        },
        seed: None,
    };
    let result = autobuild(&tables, &request);
    let target = evaluate_build(
        &tables,
        &BuildRequest { settings: result.settings.clone(), ..base },
    )
    .target_value;
    assert_eq!(
        target.to_bits(),
        27230213718.39851f64.to_bits(),
        "autobuild 目标值与 TS 基线逐位一致"
    );
    assert_eq!(
        sorted_ids(&result.settings.char_mods),
        vec![51316, 51324, 51441, 51748, 51748, 51748, 51748, 51942],
        "角色槽集合"
    );
    assert_eq!(
        sorted_ids(&result.settings.melee_mods),
        vec![42002, 42003, 42321, 52007, 52008, 52010, 52011, 52013],
        "近战槽集合"
    );
    assert_eq!(
        sorted_ids(&result.settings.ranged_mods),
        vec![43002, 43003, 43601, 43604, 53007, 53008, 53009, 53010],
        "远程槽集合"
    );
}
