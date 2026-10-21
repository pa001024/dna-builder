//! 位级黄金基线（perf 护栏）：优化只许改过程，不许改结果。
//!
//! 5 个 e2e fixture 的 `target_value.to_bits()` 硬断言（u64 位比较，非近似比较），
//! 外加 attributes / weapon 面板的 FNV 哈希（抓 B 组属性重构的中间产物漂移）。
//! 数值由 `examples/dump_bits.rs` 在当前正确版本上 dump 得到。

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
        0x41f5b1e3b8395658,
        0xdb1721e333a83fe4,
        0xee2fe2d214ddf2dc,
    ),
    (
        "lise_fire",
        0x42150de9714a7419,
        0x72dcc7e43274fce6,
        0x23af896129a8293d,
    ),
    (
        "dobapp_vy",
        0x41da54e2f202dc99,
        0xaace5928db45ad72,
        0x9e3779b97f4a7c15,
    ),
    (
        "dobapp_lieseBathfire1",
        0x4214780673f13b5f,
        0xac7c667277eb493e,
        0x5bc68d8ed64338bf,
    ),
    (
        "dobapp_OkdnBN3OlC",
        0x41d0be6d244fb97c,
        0x2b4c09826e043240,
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
