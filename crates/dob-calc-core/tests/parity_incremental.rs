//! 自动配装增量路径回归：候选评估的增量上下文必须与全量重建逐位一致。
//!
//! 背景（Stage 2 perf）：`autobuild` 用 `BuildContext::with_extra_mod`（克隆 + 追加一个 MOD）
//! 代替逐候选 `BuildContext::new`。这里锁定两条不变量：
//! 1. 已在场中枢（aura）时，增量追加的 MOD 也必须真的生效（来源表增量累加取错 MOD 的回归）；
//! 2. 增量结果与「同 settings 全量重建」在容差内一致。
//!
//! 另附 `autobuild` 确定性断言（同分随机已移除）。

mod common;

use std::path::PathBuf;

use dob_calc_core::Evaluator;
use dob_calc_core::autobuild::{AutobuildOptions, AutobuildRequest, ModCandidate, autobuild};
use dob_calc_core::context::BuildContext;
use dob_calc_core::income::ModSlotKey;
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

fn load_tables() -> BuildTables {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).expect("modules.json");
    BuildPayload::from_json(&text).expect("tables").tables
}

fn target_value(context: &mut BuildContext<'_>) -> f64 {
    let target = if context.settings.target_function.is_empty() {
        "伤害".to_string()
    } else {
        context.settings.target_function.clone()
    };
    let mut evaluator = Evaluator::new(context);
    evaluator.evaluate(&target).unwrap_or(0.0)
}

#[test]
fn incremental_mod_context_matches_full_rebuild() {
    let tables = load_tables();
    let fixture = common::load_fixture("lise_fire");
    let request = common::request_from_fixture(&fixture);
    assert!(
        request.settings.variant_aura() > 0,
        "夹具须带中枢（aura），否则覆盖不到来源表增量取错 MOD 的回归"
    );
    let mut base = BuildContext::new(&tables, request.char_id, &request.settings).expect("context");
    // 先求值一次：覆盖「缓存已暖的上下文再克隆」路径（回归发生时只在该路径复现）。
    let _ = target_value(&mut base);

    let candidates = [
        (ModSlotKey::Char, 11001i64),
        (ModSlotKey::Melee, 12001),
        (ModSlotKey::Ranged, 13001),
    ];
    for (key, id) in candidates {
        if !tables.mods.contains_key(&id) {
            continue;
        }
        let mut incremental = base.clone();
        assert!(
            incremental.push_mod_candidate(key, id, 10.0, None),
            "{key:?} {id} 追加失败"
        );
        let incremental_value = target_value(&mut incremental);

        let mut rebuilt = BuildContext::new(&tables, request.char_id, &incremental.settings)
            .expect("rebuilt context");
        let rebuilt_value = target_value(&mut rebuilt);
        common::assert_close(
            incremental_value,
            rebuilt_value,
            &format!("增量 vs 重建 {key:?} {id}"),
        );
        assert!(
            incremental_value != 0.0 && rebuilt_value != 0.0,
            "两路求值都应为非零（目标函数：{}）",
            request.settings.target_function
        );
    }
}

#[test]
fn autobuild_is_deterministic() {
    let tables = load_tables();
    let fixture = common::load_fixture("lise_fire");
    let base = common::request_from_fixture(&fixture);
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
    let candidates: Vec<ModCandidate> = ids
        .iter()
        .map(|id| ModCandidate {
            id: *id,
            level: 10.0,
            buff_level: None,
            count: 8.0,
        })
        .collect();
    let request = AutobuildRequest {
        base,
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
    let first = autobuild(&tables, &request);
    let second = autobuild(&tables, &request);
    assert_eq!(
        first.settings.to_json_value(),
        second.settings.to_json_value(),
        "同分随机移除后 autobuild 必须可复现"
    );
    assert_eq!(first.iters, second.iters, "迭代次数应一致");
    let mut result_ctx =
        BuildContext::new(&tables, request.base.char_id, &first.settings).expect("result context");
    assert!(
        target_value(&mut result_ctx) > 0.0,
        "自动配装结果应为正（目标函数：{}）",
        request.base.settings.target_function
    );
}
