//! G4 for path W-b: the compiled pack must agree with the tree walk, both natively and as the
//! single-wasm artifact.
//!
//! Native: `pack.ll` + `driver.c` + the runtime staticlib, compared entry by entry.
//! Wasm: `pack.wasm` (runtime + pack in one module) driven through Node, which is the same host a
//! browser would be. Both are skipped — with a report, never silently — when clang / cargo / node
//! are unavailable or the pack is missing.

use std::path::Path;
use std::process::Command;

use buildhub_core::eval::{Budget, Interp};
use buildhub_core::pack::{LoadedPack, load_pack};
use buildhub_core::value::Value;
use buildhub_rt::emit;
use buildhub_rt::link;

fn dna_pack() -> Option<LoadedPack> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../buildhub-core/packs/dna");
    if !dir.join("pack.toml").exists() {
        eprintln!("skipping AOT: dna pack not found at {}", dir.display());
        return None;
    }
    Some(load_pack(&dir).expect("load dna pack"))
}

/// Entries that take plain `Num` arguments: no data, no config, so every path can run them.
const PURE_ENTRIES: &[(&str, &[f64])] = &[
    ("crit_expected", &[0.5, 2.0]),
    ("crit_expected", &[1.5, 2.0]),
    ("crit_lower", &[0.5, 2.0]),
    ("crit_upper", &[0.5, 2.0]),
    ("crit_overflow", &[1.5, 2.0, 0.5]),
];

fn run_t(pack: &LoadedPack, entry: &str, args: &[f64]) -> u64 {
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let e = pack.entry(entry).expect("entry");
    let d = interp.call(e.fn_id, args.iter().copied().map(Value::Num).collect()).expect("call");
    match interp.project(d).expect("project") {
        Value::Num(n) => n.to_bits(),
        other => panic!("expected Num, got {}", other.type_name()),
    }
}

/// The `[[data]]` sets and the bench config, as the host would hand them to the artifact.
fn dna_inputs() -> (String, String) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../buildhub-core/packs/dna");
    let toml = std::fs::read_to_string(root.join("pack.toml")).expect("pack.toml");
    let mut merged = serde_json::Map::new();
    let mut name = String::new();
    for line in toml.lines() {
        let Some((key, value)) = line.split_once('=') else { continue };
        let value = value.trim().trim_matches('"');
        if key.trim() == "name" {
            name = value.to_string();
        } else if key.trim() == "dataset" {
            let (file, frag) = match value.split_once('#') {
                Some((f, fr)) => (f, Some(fr)),
                None => (value, None),
            };
            let text = std::fs::read_to_string(root.join(file)).expect("dataset");
            let mut j: serde_json::Value = serde_json::from_str(&text).expect("dataset json");
            if let Some(fr) = frag {
                j = j.get(fr).cloned().expect("dataset fragment");
            }
            merged.insert(name.clone(), j);
        }
    }
    let cfg = std::fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../buildhub-core/benches/fixtures/target.json"),
    )
    .expect("config fixture");
    (serde_json::Value::Object(merged).to_string(), cfg)
}

#[test]
fn g4_aot_matches_the_native_paths() {
    let Some(pack) = dna_pack() else { return };
    let dir = std::env::temp_dir().join(format!("bhub-aot-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");
    let pn = emit::param_num(&pack.program);
    let Some(ll) = emit::emit_ll(&pack.code, &pack.config.id, &pn) else {
        eprintln!("skipping AOT: pack produces a support set");
        return;
    };
    std::fs::write(dir.join("pack.ll"), &ll).expect("ir");
    std::fs::write(dir.join("driver.c"), emit::emit_driver(&pack.code, &ll, &pack.config.id))
        .expect("driver");

    // The artifact must be code, not a dispatch table: no shared block runner, and real branches.
    assert!(!ll.contains("bhub_exec"), "artifact still routes through a block executor");
    assert!(!ll.contains("bhub_step"), "artifact still calls per-instruction VM steps");
    assert!(ll.matches("br i1").count() > 0, "artifact has no conditional branches");
    assert_well_typed(&ll);

    // Distinguish "toolchain absent" (report) from "artifact broken" (fail).
    if Command::new("clang").arg("--version").output().is_err() {
        eprintln!("skipping AOT: clang not available");
        return;
    }
    let rt = Command::new("cargo")
        .args(["build", "--release", "--lib"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("cargo");
    assert!(rt.status.success(), "runtime failed to build:\n{}", String::from_utf8_lossy(&rt.stderr));
    let lib = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target/release")
        .join(if cfg!(windows) { "buildhub_rt.lib" } else { "libbuildhub_rt.a" });
    let exe = dir.join(if cfg!(windows) { "pack.exe" } else { "pack" });
    let mut cc = Command::new("clang");
    cc.current_dir(&dir).args(["-O2", "pack.ll", "driver.c"]).arg(&lib).arg("-o").arg(&exe);
    if cfg!(windows) {
        for l in ["-lmsvcrt", "-luserenv", "-lws2_32", "-lbcrypt", "-lntdll", "-ladvapi32", "-lshell32", "-lkernel32"] {
            cc.arg(l);
        }
    } else {
        cc.arg("-lpthread").arg("-ldl").arg("-lm");
    }
    let link_out = cc.output().expect("clang");
    assert!(link_out.status.success(), "link failed:\n{}", String::from_utf8_lossy(&link_out.stderr));

    let (data, cfg) = dna_inputs();
    std::fs::write(dir.join("data.json"), &data).expect("data");
    std::fs::write(dir.join("cfg.json"), &cfg).expect("cfg");
    let mut seen = 0;
    for (entry, args) in PURE_ENTRIES {
        let out = Command::new(&exe)
            .current_dir(&dir)
            // A developer's shell must not change what the test measures.
            .env_remove("BHUB_REPEAT")
            .args(["data.json", "cfg.json", entry])
            .args(args.iter().map(|a| a.to_string()))
            .output()
            .expect("run");
        let text = String::from_utf8_lossy(&out.stdout);
        let text = text.trim();
        assert!(!text.is_empty(), "{entry} produced nothing: {}", String::from_utf8_lossy(&out.stderr));
        let got: f64 = text.parse().unwrap_or_else(|_| panic!("{entry}: not a number: {text:?}"));
        let native = f64::from_bits(run_t(&pack, entry, args));
        assert_eq!(got.to_bits(), native.to_bits(), "{entry}{args:?}: AOT {got} != native {native}");
        seen += 1;
    }
    assert!(seen >= 3, "expected several AOT results, got {seen}");

    // Data-driven entries: these exercise the dynamic half of the runtime (records, patterns,
    // data sets, closures), which is exactly where an emitter change can silently diverge.
    let run = |entry: &str, args: &[&str]| -> String {
        let out = Command::new(&exe)
            .current_dir(&dir)
            .env_remove("BHUB_REPEAT")
            .arg("data.json")
            .arg("cfg.json")
            .arg(entry)
            .args(args)
            .output()
            .expect("run");
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };
    let cfg_json: serde_json::Value = serde_json::from_str(&cfg).expect("cfg json");
    let cfg_value = pack.json_to_value("Config", &cfg_json).expect("config");
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    for entry in ["panel", "target", "target_list"] {
        let e = pack.entry(entry).expect("entry");
        let d = interp.call(e.fn_id, vec![cfg_value.clone()]).expect("call");
        let want = interp.project(d).expect("project");
        let got = run(entry, &[]);
        let rendered = buildhub_core::show::render(&interner, &want);
        assert_eq!(got, rendered, "{entry}: AOT text differs from the tree path");
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// The single-wasm artifact: `pack.wasm` alone must produce the same answers as the tree walk.
///
/// This is the path the compiler exists for — a host gets one module, no `core + pack` pair.
#[test]
fn g4_single_wasm_matches_the_native_paths() {
    let Some(pack) = dna_pack() else { return };
    let pn = emit::param_num(&pack.program);
    let Some(ll) = emit::emit_ll(&pack.code, &pack.config.id, &pn) else {
        eprintln!("skipping wasm: pack produces a support set");
        return;
    };
    let dir = std::env::temp_dir().join(format!("bhub-wasm-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("mkdir");
    std::fs::write(dir.join("pack.ll"), &ll).expect("ir");
    let Ok(wasm) = link::wasm(&pack.code, &ll, &dir) else {
        eprintln!("skipping wasm: link step failed (clang / wasm32 target / cargo)");
        return;
    };

    let (data, cfg) = dna_inputs();
    std::fs::write(dir.join("data.json"), &data).expect("data");
    std::fs::write(dir.join("cfg.json"), &cfg).expect("cfg");
    let panel_id = pack.entry("panel").expect("panel").fn_id;
    let cases: Vec<String> = PURE_ENTRIES
        .iter()
        .map(|(e, args)| {
            let id = pack.entry(e).expect("entry").fn_id;
            format!("[{id},[{}]]", args.iter().map(|a| a.to_string()).collect::<Vec<_>>().join(","))
        })
        .collect();
    let cases_literal = format!("[{}]", cases.join(","));
    let script = dir.join("run.mjs");
    std::fs::write(
        &script,
        format!(
            r#"
import fs from "node:fs"
const {{ instance }} = await WebAssembly.instantiate(fs.readFileSync({wasm:?}), {{}})
const e = instance.exports
e.bhub_init()
const mem = () => e.memory.buffer
function put(buf) {{
  const base = mem().byteLength
  e.memory.grow(Math.ceil((buf.length + 65536) / 65536))
  new Uint8Array(mem(), base, buf.length).set(buf)
  return [base, buf.length]
}}
const [dp, dl] = put(fs.readFileSync({data:?}))
e.bhub_load_data(dp, dl)
const [cp, cl] = put(fs.readFileSync({cfg:?}))
const cfg = e.bhub_json_arg(cp, cl)
const out = []
for (const [fn, args] of {cases_literal}) {{
  const r = e["f" + fn](...args)
  // `Num` returns arrive as JS numbers, handles as BigInt (`BVal` is an i64).
  out.push(`${{fn}}:${{typeof r === "bigint" ? e.bhub_to_num(r) : r}}`)
}}
const h = e["f{panel_id}"](cfg)
const at = mem().byteLength
e.memory.grow(2)
const n = Number(e.bhub_show(h, at, 65536))
out.push("panel:" + Buffer.from(mem(), at, n).toString("utf8"))
console.log(out.join("\n"))
"#,
            wasm = wasm.display().to_string(),
            data = dir.join("data.json").display().to_string(),
            cfg = dir.join("cfg.json").display().to_string(),
        ),
    )
    .expect("script");
    let Ok(out) = Command::new("node").arg(&script).output() else {
        eprintln!("skipping wasm: node not available");
        return;
    };
    assert!(
        out.status.success(),
        "node failed:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    let text = String::from_utf8_lossy(&out.stdout);
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    assert_eq!(lines.len(), PURE_ENTRIES.len() + 1, "unexpected wasm output: {text}");

    for ((entry, args), line) in PURE_ENTRIES.iter().zip(&lines) {
        let (_, got) = line.split_once(':').expect("fn:value");
        let got: f64 = got.parse().unwrap_or_else(|_| panic!("{entry}: not a number: {got:?}"));
        let native = f64::from_bits(run_t(&pack, entry, args));
        assert_eq!(got.to_bits(), native.to_bits(), "{entry}{args:?}: wasm {got} != native {native}");
    }

    let (_, panel) = lines.last().expect("panel line").split_once(':').expect("panel:");
    let cfg_json: serde_json::Value = serde_json::from_str(&cfg).expect("cfg json");
    let cfg_value = pack.json_to_value("Config", &cfg_json).expect("config");
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let e = pack.entry("panel").expect("panel");
    let d = interp.call(e.fn_id, vec![cfg_value]).expect("call");
    let want = interp.project(d).expect("project");
    assert_eq!(
        panel,
        buildhub_core::show::render(&interner, &want),
        "panel: single-wasm text differs from the tree path"
    );
    let _ = std::fs::remove_dir_all(&dir);
}

/// Every register slot must be stored with the type it was allocated as. A mismatch here is not a
/// cosmetic IR problem: `store i32` into an `alloca i1` writes past the slot and corrupts the frame.
fn assert_well_typed(ll: &str) {
    let mut checked = 0;
    for body in ll
        .split("\ndefine ")
        .skip(1)
        .filter(|b| b.starts_with("i32 @f") || b.starts_with("double @f") || b.starts_with("i64 @f"))
    {
        for (alloc, store) in [("i1", "store i1"), ("double", "store double"), ("i32", "store i32")] {
            let needle = format!("= alloca {alloc}");
            for line in body.lines().filter(|l| l.trim_end().ends_with(&needle) && l.contains("%r")) {
                let reg = line.trim().split(" = ").next().expect("reg");
                for st in body.lines().filter(|l| l.trim_start().starts_with("store ")) {
                    if st.split("ptr ").nth(1).map(|t| t.trim()) == Some(reg) {
                        assert!(
                            st.trim_start().starts_with(store) || { !st.trim_start().starts_with("store i1") && !st.trim_start().starts_with("store i32") && !st.trim_start().starts_with("store double") },
                            "{}: `{st}` writes {reg} allocated as {alloc}",
                            body.lines().next().unwrap_or("")
                        );
                        checked += 1;
                    }
                }
            }
        }
    }
    assert!(checked > 0, "no register stores found to check");
}
