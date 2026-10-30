//! Link step: one pack object + the runtime library → one artifact.
//!
//! Native: `clang pack.ll driver.c buildhub_rt.lib`. Single wasm: the same pack object is handed
//! to the runtime's own link as `-C link-arg`, so the runtime and the compiled pack end up in one
//! module — a host needs `pack.wasm` alone, not core + pack.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use buildhub_core::ssa::Code;

/// Build `pack.wasm` in `out_dir` from the emitted IR. Returns the artifact path.
pub fn wasm(code: &Code, ll: &str, out_dir: &Path) -> Result<PathBuf, String> {
    let ll_path = out_dir.join("pack.ll");
    if !ll_path.exists() {
        std::fs::write(&ll_path, ll).map_err(|e| format!("cannot write pack.ll: {e}"))?;
    }
    let obj = out_dir.join("pack.o");
    run(
        "clang",
        &[
            "--target=wasm32-unknown-unknown".into(),
            "-O2".into(),
            "-c".into(),
            ll_path.display().to_string(),
            "-o".into(),
            obj.display().to_string(),
        ],
    )?;

    // `cargo rustc -- <args>` appends the flags to *this package* only. A global `RUSTFLAGS` would
    // also hit `buildhub-core`, whose own cdylib would then be asked to resolve the pack's
    // `bhub_*` calls. Arguments travel as argv entries, so paths with spaces survive.
    let mut extra: Vec<String> = vec!["-C".into(), format!("link-arg={}", obj.display())];
    for e in &code.entries {
        extra.push("-C".into());
        extra.push(format!("link-arg=--export=f{}", e.fn_id));
    }
    // `bhub_init` is emitted into the pack, not the runtime, so the linker has to keep it.
    extra.push("-C".into());
    extra.push("link-arg=--export=bhub_init".into());

    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".into());
    let out = Command::new(&cargo)
        .args([
            "rustc",
            "--release",
            "--lib",
            "--target",
            "wasm32-unknown-unknown",
            "--no-default-features",
            "--",
        ])
        .args(&extra)
        .current_dir(manifest)
        .stderr(Stdio::inherit())
        .output()
        .map_err(|e| format!("cannot run {cargo}: {e}"))?;
    if !out.status.success() {
        return Err("wasm link failed (see cargo output above)".into());
    }
    let built = manifest.join("target/wasm32-unknown-unknown/release/buildhub_rt.wasm");
    let dest = out_dir.join("pack.wasm");
    std::fs::copy(&built, &dest).map_err(|e| format!("cannot copy {}: {e}", built.display()))?;
    Ok(dest)
}

fn run(program: &str, args: &[String]) -> Result<(), String> {
    let out = Command::new(program)
        .args(args)
        .stderr(Stdio::inherit())
        .output()
        .map_err(|e| format!("cannot run {program}: {e}"))?;
    if !out.status.success() {
        return Err(format!("{program} failed"));
    }
    Ok(())
}
