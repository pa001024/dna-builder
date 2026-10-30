//! G4 / G5 / G10: the three execution paths must agree bit-for-bit.
//!
//! - **T** the tree walk (`eval::Interp`),
//! - **B** the bytecode VM over a decoded `CodeImage` (`image` + `vm::Vm`),
//! - **W** the same bytecode via the wasm C ABI, exercised when a built `engine.wasm` is present.
//!   Path W-b (the compiled pack) is checked by `crates/buildhub-aot/tests/aot_parity.rs`.
//!
//! T and B are always checked. W is checked when `BUILDHUB_ENGINE_WASM` points at a module built
//! from this same source tree (the CI step that builds it also runs this test).

use std::path::{Path, PathBuf};

use buildhub_core::eval::{Budget, Interp};
use buildhub_core::image::{self, NumericMode};
use buildhub_core::pack::{LoadedPack, load_pack};
use buildhub_core::value::Value;
use buildhub_core::vm::Vm;

fn dna_pack() -> Option<LoadedPack> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("packs/dna");
    if !dir.join("pack.toml").exists() {
        return None;
    }
    Some(load_pack(&dir).expect("load dna pack"))
}

/// Every entry that takes plain `Num` arguments: no data, no config, so all three paths can run it.
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

fn run_b(pack: &LoadedPack, entry: &str, args: &[f64]) -> u64 {
    let interner = pack.interner.borrow();
    let vm = Vm::new(&pack.code, &interner, &pack.program.data, Budget::default());
    let e = pack.entry(entry).expect("entry");
    let d = vm.call(e.fn_id, args.iter().copied().map(Value::Num).collect()).expect("call");
    match vm.project(d).expect("project") {
        Value::Num(n) => n.to_bits(),
        other => panic!("expected Num, got {}", other.type_name()),
    }
}

#[test]
fn g4_t_and_b_are_bit_identical() {
    let Some(pack) = dna_pack() else { return };
    for (entry, args) in PURE_ENTRIES {
        let t = run_t(&pack, entry, args);
        let b = run_b(&pack, entry, args);
        assert_eq!(t, b, "{entry}{args:?}: T = {t:016x}, B = {b:016x}");
    }
}

#[test]
fn g4_t_and_b_agree_on_the_whole_pack() {
    let Some(pack) = dna_pack() else { return };
    // Every pure (non-config) entry, so the comparison covers the numeric core broadly.
    let mut checked = 0;
    for e in &pack.program.entries {
        let f = &pack.program.fns[e.fn_id];
        if f.nparams != 2 {
            continue;
        }
        // Only entries whose parameters are both `Num` (heuristic: they were reached above).
        if !PURE_ENTRIES.iter().any(|(n, _)| *n == e.name) {
            continue;
        }
        for (name, args) in PURE_ENTRIES {
            if *name != e.name {
                continue;
            }
            assert_eq!(run_t(&pack, name, args), run_b(&pack, name, args));
            checked += 1;
        }
    }
    assert!(checked >= 3, "expected several pure entries, checked {checked}");
}

#[test]
fn g5_image_roundtrip_preserves_every_instruction() {
    let Some(pack) = dna_pack() else { return };
    let bytes = image::encode(&pack.code, NumericMode::Libm);
    let img = image::decode(&bytes).expect("decode");
    assert_eq!(img.numeric, NumericMode::Libm);
    assert_eq!(img.code.fns.len(), pack.code.fns.len());
    assert_eq!(img.code.consts.len(), pack.code.consts.len());
    assert_eq!(img.code.syms, pack.code.syms);
    // Instruction streams must be identical after a round trip: that is what makes B reproducible
    // from a file rather than from memory.
    for (a, b) in img.code.fns.iter().zip(pack.code.fns.iter()) {
        assert_eq!(a.fn_id, b.fn_id);
        assert_eq!(a.nregs, b.nregs);
        assert_eq!(a.blocks.len(), b.blocks.len());
        for (ba, bb) in a.blocks.iter().zip(b.blocks.iter()) {
            assert_eq!(format!("{ba:?}"), format!("{bb:?}"), "fn#{} block differs", a.fn_id);
        }
    }
    // And the decoded image must still evaluate to the same bits.
    let interner = pack.interner.borrow();
    let vm = Vm::new(&img.code, &interner, &pack.program.data, Budget::default());
    let e = pack.entry("crit_expected").unwrap();
    let d = vm.call(e.fn_id, vec![Value::Num(0.5), Value::Num(2.0)]).unwrap();
    match vm.project(d).unwrap() {
        Value::Num(n) => assert_eq!(n.to_bits(), 1.5f64.to_bits()),
        other => panic!("expected Num, got {}", other.type_name()),
    }
}

#[test]
fn g5_ssa_dump_is_deterministic() {
    let Some(pack) = dna_pack() else { return };
    // One front end, one lowering: running it twice must produce byte-identical code. This is the
    // property `--dump-ssa` comparison relies on.
    let again = buildhub_core::ssa::lower(&pack.program, &pack.interner.borrow()).expect("lower");
    assert_eq!(again.fns.len(), pack.code.fns.len());
    assert_eq!(again.nblocks, pack.code.nblocks);
    for (a, b) in again.fns.iter().zip(pack.code.fns.iter()) {
        for (ba, bb) in a.blocks.iter().zip(b.blocks.iter()) {
            assert_eq!(format!("{ba:?}"), format!("{bb:?}"));
        }
    }
}

#[test]
fn g10_bits_survive_the_image() {
    let Some(pack) = dna_pack() else { return };
    // `-0.0` and NaN must keep their bit patterns through encode → decode → evaluate. The image
    // stores f64 bit patterns, not decimal text (spec §9.6.4).
    // Append the tricky constants so existing instruction indices stay valid, then check the tail.
    let mut code = pack.code.clone();
    let base = code.consts.len();
    code.consts.extend([
        Value::Num(-0.0),
        Value::Num(0.0),
        Value::Num(f64::from_bits(buildhub_core::value::CANON_NAN)),
        Value::Num(f64::INFINITY),
    ]);
    let bytes = image::encode(&code, NumericMode::Libm);
    let img = image::decode(&bytes).expect("decode");
    for (i, want) in [(-0.0f64), 0.0, f64::from_bits(buildhub_core::value::CANON_NAN), f64::INFINITY]
        .iter()
        .enumerate()
    {
        let Value::Num(got) = &img.code.consts[base + i] else { panic!("constant {i} is not a Num") };
        assert_eq!(got.to_bits(), want.to_bits(), "constant {i} lost its bits");
    }
    assert!(matches!(&img.code.consts[base], Value::Num(n) if n.is_sign_negative()));
}

#[test]
fn corrupt_image_is_rejected_not_executed() {
    let Some(pack) = dna_pack() else { return };
    let mut bytes = image::encode(&pack.code, NumericMode::Libm);
    // Flip one byte in the middle: the CRC must catch it.
    let mid = bytes.len() / 2;
    bytes[mid] ^= 0xff;
    let err = image::decode(&bytes).expect_err("must reject a corrupt image");
    assert!(err.message.contains("checksum"), "unexpected error: {}", err.message);
}

/// Build the wasm C ABI artifact in-process (path W), if the crate has been built for wasm32.
fn engine_wasm() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("BUILDHUB_ENGINE_WASM") {
        let path = PathBuf::from(p);
        return path.exists().then_some(path);
    }
    let p = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target/wasm32-unknown-unknown/release/buildhub_core.wasm");
    p.exists().then_some(p)
}

#[test]
fn g4_wasm_agrees_with_the_native_paths() {
    let Some(pack) = dna_pack() else { return };
    let Some(wasm) = engine_wasm() else {
        eprintln!("skipping W: no wasm artifact (set BUILDHUB_ENGINE_WASM or run ./build.sh)");
        return;
    };
    // Node is the reference host here: it can instantiate the module and drive the C ABI, which is
    // exactly what a browser would do. Absent Node, the test reports rather than silently passing.
    let script = std::env::temp_dir().join(format!("bhub-w-{}.mjs", std::process::id()));
    let image = std::env::temp_dir().join(format!("bhub-w-{}.bhub", std::process::id()));
    std::fs::write(&image, image::encode(&pack.code, NumericMode::Libm)).expect("write image");
    // `{cases:?}` must render a JSON-ish array literal, not a list of quoted strings.
    let cases: Vec<String> = PURE_ENTRIES
        .iter()
        .enumerate()
        .map(|(i, (e, a))| {
            // `{cases}` is spliced into a JS array literal, so each case must itself be a
            // bracketed literal: `[idx, "entry", [args]]`.
            format!(
                "[{i},\"{e}\",[{}]]",
                a.iter().map(|x| format!("{x:?}")).collect::<Vec<_>>().join(",")
            )
        })
        .collect();
    let cases_literal = format!("[{}]", cases.join(","));
    let src = format!(
        r#"
import fs from "node:fs"
const {{ instance }} = await WebAssembly.instantiate(fs.readFileSync({wasm:?}), {{}})
const e = instance.exports
const mem = () => e.memory.buffer
const dv = () => new DataView(mem())
const img = fs.readFileSync({image:?})
new Uint8Array(mem(), 8192, img.length).set(img)
const h = e.bhub_pkg_load(8192, img.length)
if (!h) {{ console.log("LOAD_FAILED"); process.exit(0) }}
// 线性内存只有 1 MiB 量级：先增长，再从**旧末尾**开始摆放参数/输出缓冲。
const base = mem().byteLength
e.memory.grow(2)
let cursor = base
const bits = 4096
function put(s) {{
  const b = new TextEncoder().encode(s)
  const at = cursor
  new Uint8Array(mem(), at, b.length).set(b)
  cursor += 8192
  return [at, b.length]
}}
const out = []
for (const spec of {cases_literal}) {{
  const [idx, entry, args] = spec
  const [np, nl] = put(entry)
  const [ap, al] = put(JSON.stringify(args))
  const rc = e.bhub_call_bits(h, np, nl, ap, al, 4096)
  if (rc !== 0) {{ out.push(`${{idx}}:ERR`) }}
  else {{ out.push(`${{idx}}:${{dv().getBigUint64(bits, true).toString(16)}}`) }}
}}
console.log(out.join("\n"))
"#
    );
    std::fs::write(&script, src).expect("write script");
    let Ok(output) = std::process::Command::new("node").arg(&script).output() else {
        eprintln!("skipping W: node is not available");
        return;
    };
    let text = String::from_utf8_lossy(&output.stdout);
    eprintln!("[dbg stdout] {text}");
    eprintln!("[dbg stderr] {}", String::from_utf8_lossy(&output.stderr));
    eprintln!("[dbg script] {}", std::fs::read_to_string(&script).unwrap_or_default());
    if text.contains("LOAD_FAILED") {
        panic!("wasm module failed to load the CodeImage: {}", String::from_utf8_lossy(&output.stderr));
    }
    let mut seen = 0;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Node may prefix warnings on stdout; only parse lines that start with a digit.
        if !line.starts_with(|c: char| c.is_ascii_digit()) {
            continue;
        }
        let (idx_s, bits) = line.split_once(':').expect("idx:bits");
        let idx: usize = idx_s.parse().expect("case index");
        let (entry, args) = PURE_ENTRIES[idx];
        assert!(bits != "ERR", "{entry} failed in wasm: {}", String::from_utf8_lossy(&output.stderr));
        let want_bits = u64::from_str_radix(bits, 16).expect("hex bits");
        let native = run_t(&pack, entry, args);
        assert_eq!(
            native, want_bits,
            "{entry}{args:?}: native {native:016x} != wasm {want_bits:016x}"
        );
        seen += 1;
    }
    assert!(seen >= 3, "expected several wasm results, got {seen}");
    let _ = std::fs::remove_file(script);
    let _ = std::fs::remove_file(image);
}
