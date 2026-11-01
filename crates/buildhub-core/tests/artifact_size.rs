//! G11 (path-B proxy): the artifact `buildhub build` emits must stay within budget.
//!
//! The spec's 350 KB bound is written for path-W `pack.wasm` (runtime + pack, §9.6.5); the native
//! half of that gate lives in `crates/buildhub-aot/tests/aot_parity.rs`, which asserts on the
//! linked `pack.wasm` whenever the toolchain is present. This test asserts the same allowance on
//! the artifact this crate's build path emits — the `.bhub` CodeImage for the in-repo pack — so
//! `cargo test -p buildhub-core` alone still guards the budget (§9.7).

use std::path::Path;

use buildhub_core::image::NumericMode;
use buildhub_core::pack::load_pack;

#[test]
fn g11_build_artifact_within_350kb() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("packs/dna");
    if !dir.join("pack.toml").exists() {
        return;
    }
    let pack = load_pack(&dir).expect("load dna pack");
    // Exactly what `buildhub build <pack> -o out/` writes (default `numeric = "libm"`).
    let bytes = pack.to_image(NumericMode::Libm);
    assert!(
        bytes.len() <= 350 * 1024,
        "G11: built .bhub artifact is {} bytes, budget 350 KB (path-W pack.wasm is gated in aot_parity)",
        bytes.len()
    );
    // And it must decode back to the same program: a small artifact is worthless if it is corrupt.
    let img = buildhub_core::image::decode(&bytes).expect("decode own artifact");
    assert_eq!(img.code.fns.len(), pack.code.fns.len());
    assert_eq!(img.code.entries.len(), pack.code.entries.len());
}
