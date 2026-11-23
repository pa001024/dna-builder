//! 黄金基线导出：`cargo run --release --example dump_bits`。
//!
//! 对 `tests/golden_bits.rs` 的 5 个 e2e 用例求值，打印
//! `target_value` 的 f64 位模式、十进制值、attributes / weapon 面板的 FNV-1a 哈希。
//! 只有在**语义确实变更**（如 `充盈威力` 改为 1 起始总倍率）并已核对 TS 夹具后，
//! 才把输出抄回 `golden_bits.rs` 的 `CASES`；任何其他漂移都是回归信号。

use std::path::PathBuf;

use dob_calc_core::attrmap::AttrMap;
use dob_calc_core::evaluate::{BuildRequest, evaluate_build};
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

/// 与 `golden_bits.rs` 的 `CASES` 同名同序。
const CASES: &[&str] = &[
    "dobapp_shardBuild1",
    "lise_fire",
    "dobapp_vy",
    "dobapp_lieseBathfire1",
    "dobapp_OkdnBN3OlC",
];

fn fixture_dir() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path
}

fn load(name: &str) -> serde_json::Value {
    let path = fixture_dir().join(format!("{name}.json"));
    let text =
        std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("缺少夹具 {}", path.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

fn tables() -> BuildTables {
    let text = std::fs::read_to_string(fixture_dir().join("modules.json")).expect("modules.json");
    BuildPayload::from_json(&text).expect("tables").tables
}

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

fn main() {
    let tables = tables();
    for name in CASES {
        let fixture = load(name);
        let request = BuildRequest::from_json(&fixture["request"]).expect("request");
        let result = evaluate_build(&tables, &request);
        assert!(
            result.error.is_none(),
            "{name}: 求值出错 {:?}",
            result.error
        );
        let weapon = result
            .weapon
            .as_ref()
            .map(hash_map)
            .unwrap_or(0x9e3779b97f4a7c15);
        println!(
            "{name}\n  target={} bits={:#018x}\n  attrs={:#018x}\n  weapon={:#018x}",
            result.target_value,
            result.target_value.to_bits(),
            hash_map(&result.attributes),
            weapon,
        );
    }
}
