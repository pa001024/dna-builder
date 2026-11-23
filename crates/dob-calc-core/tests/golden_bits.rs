//! 位级黄金基线（perf 护栏）：优化只许改过程，不许改结果。
//!
//! 5 个 e2e fixture 的 `target_value.to_bits()` 硬断言（u64 位比较，非近似比较），
//! 外加 attributes / weapon 面板的 FNV 哈希（抓 B 组属性重构的中间产物漂移）。
//! 数值由 `examples/dump_bits.rs` 在当前正确版本上 dump 得到。
//!
//! 2026-11-19（U44 赛季增伤）：新增角色属性键 `赛季增伤`（缺省 0），
//! `target_value` 位不变，只有 attributes 哈希随之更新。
//!
//! 2026-11-20（U61 六元素增伤）：新增 `火/水/雷/风/光/暗属性增伤` 六个键（缺省 0），
//! 同样只有 attributes 哈希更新；`target_value` / weapon 面板逐位不变。
//!
//! 2026-11-20（U71 追伤七分量）：新增 `火/水/雷/风/光/暗/自属性追伤` 七个键与只读聚合
//! `追加伤害`（Σ 七分量）。旧数据字面 `追加伤害` 迁移为自属性，因此只有
//! `dobapp_shardBuild1` 的 `target_value` 变化（旧口径把元素系列 MOD 的 `追加伤害`
//! 计入 `<元素>MOD属性` 加权，U70 起 `getModsBonus` 只读分量键，差 -12,744,600.362205505）；
//! 其余用例 target 位不变，attributes / weapon 面板哈希全部更新。
//!
//! 2026-11-22（U95 元素弱点）：新增 `火/水/雷/风/光/暗属性弱点` 与 `全属性弱点` 七个键
//!（缺省 0）。`target_value` / weapon 面板逐位不变，只有 attributes 哈希更新。
//!
//! 2026-11-23（U99a 技能等级属性）：新增只读结果属性 `E技能等级` / `Q技能等级` / `P技能等级`
//!（= 基础 + 升华载荷的最终等级）。`target_value` / weapon 面板逐位不变，只有 attributes 哈希更新。
//!
//! 2026-11-23（U99b 技能等级加成属性）：三键语义改为**等级加成**（进入加成池，不再是最终等级）。
//! `target_value` / weapon 面板逐位不变，只有 attributes 哈希更新。
//!
//! 2026-11-23（U101b 逐分量追伤 + 删除 `异常数量`）：武器池改为逐元素追加分量，
//! `菲娜Q` 数据由聚合 `追加伤害` + `异常数量` 重建为火水雷风四分量。
//! - `dobapp_shardBuild1`（含 菲娜Q）`target_value` 由 5811416640.401375 变为
//!   10472549917.063034（+2.752 追伤分量按逐元素结算，且完整进入武器池）；
//! - 其余用例无追伤分量，`target_value` 位不变；
//! - 全部 attributes 哈希更新（`异常数量` 键删除 + 数据重建）。
//!
//! 2026-11-23（U112 追伤分池）：角色属性不再持有任何追伤键（仅保留 `技能追伤`），
//! 武器池改为整段 Σ 因子 `max(0, 1 + Σ 面板七分量)`，技能池只吃 `技能追伤`；
//! 追伤不再按元素拆分，也不吃弱点 / 元素增伤 / 转属。
//! - `dobapp_shardBuild1` / `dobapp_vy` / `dobapp_OkdnBN3OlC` 的 `target_value` 变化
//!   （追伤分量由逐元素 part 变为整段因子）；
//! - `lise_fire` 夹具 request 同步刷新为 `normalizeCharSettings` 全量（补齐 assist 默认 loadout）；
//! - 全部 attributes 哈希更新（追伤七键 + 聚合键删除）。

mod common;

use std::path::PathBuf;

use dob_calc_core::attrmap::AttrMap;
use dob_calc_core::evaluate::{BuildRequest, evaluate_build};
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

fn fnv1a64(mut hash: u64, bytes: &[u8]) -> u64 {
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn hash_map(map: &AttrMap) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for (key, value) in map.iter() {
        hash = fnv1a64(hash, key.as_bytes());
        hash = fnv1a64(hash, &value.to_bits().to_le_bytes());
    }
    hash
}

fn tables() -> BuildTables {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path).expect("modules.json");
    BuildPayload::from_json(&text).expect("tables").tables
}

const CASES: &[(&str, u64, u64, u64)] = &[
    (
        "dobapp_shardBuild1",
        0x41f4fe4a71a82390,
        0x81d927374dd35c3a,
        0xe8f1db900384435a,
    ),
    (
        "lise_fire",
        0x41f877755aac63e4,
        0x6dc5310a3d052186,
        0xafd70e4afecca1e2,
    ),
    (
        "dobapp_vy",
        0x41d97c02588a2291,
        0xef9bfe4360e86e02,
        0x9e3779b97f4a7c15,
    ),
    (
        "dobapp_lieseBathfire1",
        0x41f7824ad8313977,
        0xda8e8c25be9c3e52,
        0x7b9ad4b0ecb17d94,
    ),
    (
        "dobapp_OkdnBN3OlC",
        0x41d078171dabc2fa,
        0xda6543f5fe9eb541,
        0x9e3779b97f4a7c15,
    ),
];

#[test]
fn golden_bit_baseline() {
    let tables = tables();
    for (name, target_bits, attrs_hash, weapon_hash) in CASES {
        let fixture = common::load_fixture(name);
        let request = BuildRequest::from_json(&fixture["request"]).expect("request");
        let result = evaluate_build(&tables, &request);
        assert!(
            result.error.is_none(),
            "{name}: 求值出错 {:?}",
            result.error
        );
        assert_eq!(
            result.target_value.to_bits(),
            *target_bits,
            "{name}: target_value 位漂移（{:#018x} vs {:#018x}）",
            result.target_value.to_bits(),
            target_bits,
        );
        assert_eq!(
            hash_map(&result.attributes),
            *attrs_hash,
            "{name}: attributes 漂移"
        );
        let weapon = result
            .weapon
            .as_ref()
            .map(hash_map)
            .unwrap_or(0x9e3779b97f4a7c15);
        assert_eq!(weapon, *weapon_hash, "{name}: weapon 面板漂移");
    }
}
