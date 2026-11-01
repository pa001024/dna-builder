//! `buildhub` CLI (spec §10.3): check, test, eval, explain, tree, sim, info.

use std::path::PathBuf;
use std::process::ExitCode;

use buildhub_core::eval::{Budget, Interp};
use buildhub_core::pack::{LoadedPack, load_pack};
use buildhub_core::tree::{build_tree, TreeNode};
use buildhub_core::value::{Dist, Value};

fn main() -> ExitCode {
    // Recursive descent over a deeply nested rule set needs a predictable stack. Run the real work
    // on a thread with a generous stack instead of relying on the platform default (spec §3.2
    // bounds nesting; the default 1 MB stack would overflow well before that bound).
    let args: Vec<String> = std::env::args().skip(1).collect();
    let handle = std::thread::Builder::new()
        .stack_size(64 * 1024 * 1024)
        .spawn(move || run(args))
        .expect("spawn worker");
    match handle.join() {
        Ok(code) => code,
        Err(_) => ExitCode::FAILURE,
    }
}

fn run(args: Vec<String>) -> ExitCode {
    if args.is_empty() {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    }
    let cmd = args[0].as_str();
    let rest = &args[1..];
    let result = match cmd {
        "check" => cmd_check(rest),
        "build" => cmd_build(rest),
        "fmt" => cmd_fmt(rest),
        "test" => cmd_test(rest),
        "eval" => cmd_eval(rest),
        "explain" => cmd_explain(rest),
        "tree" => cmd_tree(rest),
        "info" => cmd_info(rest),
        "sim" => cmd_sim(rest),
        "image" => cmd_image(rest),
        "parity" => cmd_parity(rest),
        "dump" => cmd_dump(rest),
        "help" | "--help" | "-h" => {
            println!("{USAGE}");
            Ok(())
        }
        other => {
            eprintln!("unknown command `{other}`\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

const USAGE: &str = "\
buildhub <command> [options]

  check   <pack-dir>                                  compile + diagnostics
  build   <pack-dir> -o <out-dir> [--numeric libm|host]  emit CodeImage + datasets (.bhub artifact dir, path B)
  fmt     <pack-dir>                                  canonical formatting for .bhl sources
  info    <pack-dir>                                  entries, schemas, data sets
  test    <pack-dir> [--filter <substr>]              run tests/*.jsonl
  eval    <pack-dir|artifact.bhub|artifact-dir> --fn <entry> [--config <json|@file>] [--args <json-array>]
  explain <pack-dir> --fn <entry> [--config ...] [--args ...]
  tree    <pack-dir> --fn <entry> [--config ...] [--max-support N] [--format json|text]
  sim     <pack-dir> --fn <entry> [--config ...] [--mode expect|trace] [--format json|text]
  image   <pack-dir> [-o out.bhub] [--numeric libm|host]   emit a CodeImage (path B)
  parity  <pack-dir> [--filter <substr>] [--wasm <engine.wasm>]
                                                          T vs B (and W when given) over tests/*.jsonl
  dump    <pack-dir> [--fn <name>]                         print lowered SSA (G5 artifact)

The eval family accepts `--memo off` to prove memoisation does not change results.";

fn opt<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).map(|s| s.as_str())
}

fn flag(args: &[String], name: &str) -> bool {
    args.iter().any(|a| a == name)
}

fn positional(args: &[String]) -> Option<&str> {
    let mut skip = false;
    for a in args {
        if skip {
            skip = false;
            continue;
        }
        if a.starts_with("--") {
            if !matches!(a.as_str(), "--memo" | "--split" | "--bundle") {
                skip = true;
            }
            continue;
        }
        return Some(a.as_str());
    }
    None
}

fn pack_dir(args: &[String]) -> Result<PathBuf, String> {
    positional(args)
        .map(PathBuf::from)
        .ok_or_else(|| "missing <pack-dir>".to_string())
}

fn load(dir: &std::path::Path) -> Result<LoadedPack, String> {
    load_pack(dir).map_err(|d| d.to_string())
}

fn budget_from(args: &[String]) -> Budget {
    let mut b = Budget::default();
    if let Some(v) = opt(args, "--max-support") {
        if let Ok(n) = v.parse() {
            b.max_support = n;
        }
    }
    if let Some(v) = opt(args, "--fuel") {
        if let Ok(n) = v.parse() {
            b.fuel = n;
        }
    }
    b
}

fn cmd_check(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    println!(
        "{} v{}: {} function(s), {} schema(s), {} data set(s), {} entr(ies)",
        pack.config.id,
        pack.config.version,
        pack.program.fns.len(),
        pack.program.schemas.len(),
        pack.program.data.len(),
        pack.program.entries.len()
    );
    Ok(())
}

/// spec §10.3 `build`: compile a pack into a self-contained artifact dir (path B).
///
/// Layout: `<out>/<id>.bhub` (the `CodeImage`), `<out>/pack.toml`, plus each dataset source file
/// at its pack-relative path. `eval <out-dir>` decodes the image and rebinds the staged datasets,
/// so the built artifact runs without the `.bhl` sources.
fn cmd_build(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    // Path W (ahead-of-time native/wasm) is emitted by crates/buildhub-aot against the same SSA;
    // this command only ever emits path B, so the flags parse but redirect.
    if matches!(opt(args, "--target").unwrap_or("bhub"), "wasm" | "w") || flag(args, "--bundle") {
        return Err("path W emission (pack.wasm, --bundle) lives in crates/buildhub-aot; \
            `buildhub build` emits the path-B artifact dir (.bhub CodeImage + datasets)".to_string());
    }
    let numeric = match opt(args, "--numeric").unwrap_or("libm") {
        "host" => buildhub_core::image::NumericMode::Host,
        _ => buildhub_core::image::NumericMode::Libm,
    };
    let out = opt(args, "-o")
        .or_else(|| opt(args, "--out"))
        .ok_or_else(|| "missing -o <out> (usage: buildhub build <pack-dir> -o out/)".to_string())?;
    let bytes = pack.to_image(numeric);
    if out.ends_with(".bhub") {
        // Single-file form: the CodeImage alone (data-free entries only; no datasets staged).
        if let Some(parent) = std::path::Path::new(out).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
            }
        }
        std::fs::write(out, &bytes).map_err(|e| format!("cannot write {out}: {e}"))?;
        println!("wrote {out} ({} bytes)", bytes.len());
        return Ok(());
    }
    let root = std::path::Path::new(out);
    std::fs::create_dir_all(root).map_err(|e| format!("cannot create {}: {e}", root.display()))?;
    let img_name = format!("{}.bhub", pack.config.id);
    std::fs::write(root.join(&img_name), &bytes).map_err(|e| format!("cannot write CodeImage: {e}"))?;
    std::fs::copy(dir.join("pack.toml"), root.join("pack.toml")).map_err(|e| format!("cannot stage pack.toml: {e}"))?;
    let mut staged = 0usize;
    for d in &pack.config.data {
        let file = d.dataset.split('#').next().unwrap_or(&d.dataset);
        let src = dir.join(file);
        let dst = root.join(file);
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        }
        std::fs::copy(&src, &dst).map_err(|e| format!("cannot stage dataset {}: {e}", src.display()))?;
        staged += 1;
    }
    // §9.7: a single-pack CodeImage stays two orders of magnitude under its 2 MB budget; the
    // 350 KB gate (G11) applies to path-W `pack.wasm` and is asserted in `tests/artifact_size.rs`.
    println!("wrote {out}/{img_name} ({} bytes) + pack.toml + {staged} dataset(s)", bytes.len());
    Ok(())
}

/// spec §10.3 `fmt`: canonical formatting for `.bhl` sources (trailing whitespace, blank runs,
/// missing EOF newline). The language is indentation-insensitive (§3), and this command only
/// touches trivia, so formatting never changes semantics.
fn cmd_fmt(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let mut files = Vec::new();
    collect_bhl(&dir, &mut files).map_err(|e| format!("cannot scan {}: {e}", dir.display()))?;
    if files.is_empty() {
        return Err(format!("no .bhl files under {}", dir.display()));
    }
    let mut changed = 0usize;
    for f in &files {
        let text = std::fs::read_to_string(f).map_err(|e| format!("cannot read {}: {e}", f.display()))?;
        let formatted = fmt_bhl(&text);
        if formatted != text {
            std::fs::write(f, formatted).map_err(|e| format!("cannot write {}: {e}", f.display()))?;
            changed += 1;
            let rel = f.strip_prefix(&dir).unwrap_or(f).display().to_string().replace('\\', "/");
            println!("fmt {rel}");
        }
    }
    println!("{changed} file(s) reformatted, {} unchanged", files.len() - changed);
    Ok(())
}

fn collect_bhl(dir: &std::path::Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    let mut entries: Vec<PathBuf> =
        std::fs::read_dir(dir)?.filter_map(|e| e.ok()).map(|e| e.path()).collect();
    entries.sort();
    for p in entries {
        if p.is_dir() {
            collect_bhl(&p, out)?;
        } else if p.extension().and_then(|e| e.to_str()) == Some("bhl") {
            out.push(p);
        }
    }
    Ok(())
}

fn fmt_bhl(src: &str) -> String {
    let mut kept: Vec<&str> = Vec::new();
    let mut blanks = 0usize;
    for line in src.lines() {
        let t = line.trim_end();
        if t.is_empty() {
            blanks += 1;
            if blanks == 1 {
                kept.push("");
            }
        } else {
            blanks = 0;
            kept.push(t);
        }
    }
    // Drop leading blank lines; exactly one trailing newline.
    while kept.first() == Some(&"") {
        kept.remove(0);
    }
    let mut out = kept.join("\n");
    out.push('\n');
    out
}

fn cmd_info(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    let as_json = flag(args, "--json");
    if as_json {
        let mut s = String::from("{\"id\":");
        s.push_str(&buildhub_core::diag::json_str(&pack.config.id));
        s.push_str(",\"version\":");
        s.push_str(&buildhub_core::diag::json_str(&pack.config.version));
        s.push_str(",\"entries\":[");
        for (i, e) in pack.program.entries.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            s.push_str(&format!(
                "{{\"name\":{},\"args\":[{}]}}",
                buildhub_core::diag::json_str(&e.name),
                e.args.iter().map(|a| buildhub_core::diag::json_str(a)).collect::<Vec<_>>().join(",")
            ));
        }
        s.push_str("],\"schemas\":[");
        for (i, sc) in pack.program.schemas.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            s.push_str(&buildhub_core::diag::json_str(&sc.name));
        }
        s.push_str("],\"data\":[");
        for (i, d) in pack.program.data.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            s.push_str(&format!(
                "{{\"name\":{},\"rows\":{},\"version\":\"{}\"}}",
                buildhub_core::diag::json_str(&d.name),
                d.rows.len(),
                buildhub_core::hash::hex(d.version)
            ));
        }
        s.push_str("]}");
        println!("{s}");
        return Ok(());
    }
    println!("entries:");
    for e in &pack.program.entries {
        println!("  {}({})", e.name, e.args.join(", "));
    }
    println!("schemas:");
    for sc in &pack.program.schemas {
        println!("  {}{}", sc.name, if sc.open { " {..open}" } else { "" });
    }
    println!("data:");
    for d in &pack.program.data {
        println!("  {} ({} rows, schema {})", d.name, d.rows.len(), d.schema);
    }
    Ok(())
}

struct Invocation {
    fn_id: usize,
    args: Vec<Value>,
}

fn build_invocation(pack: &LoadedPack, args: &[String], entry_name: &str) -> Result<Invocation, String> {
    let entry = pack
        .entry(entry_name)
        .ok_or_else(|| format!("no entry `{entry_name}` (see `buildhub info`)"))?;
    let f = &pack.program.fns[entry.fn_id];
    let mut vals = Vec::new();
    let cfg = match opt(args, "--config") {
        Some(c) => {
            let text = if let Some(path) = c.strip_prefix('@') {
                std::fs::read_to_string(path).map_err(|e| format!("cannot read {path}: {e}"))?
            } else {
                c.to_string()
            };
            let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("invalid --config JSON: {e}"))?;
            let schema = f
                .param_types
                .first()
                .and_then(|t| t.as_ref().and_then(first_schema_name))
                .or_else(|| entry.args.first().cloned())
                .unwrap_or_default();
            if schema.is_empty() {
                return Err(format!("entry `{entry_name}` takes no Config parameter"));
            }
            Some(pack.json_to_value(&schema, &json).map_err(|d| d.to_string())?)
        }
        None => None,
    };
    let extra = match opt(args, "--args") {
        Some(a) => {
            let json: serde_json::Value = serde_json::from_str(a).map_err(|e| format!("invalid --args JSON: {e}"))?;
            match json {
                serde_json::Value::Array(items) => items,
                other => vec![other],
            }
        }
        None => Vec::new(),
    };
    if let Some(c) = cfg {
        vals.push(c);
    }
    let base = vals.len();
    // Extra `--args` only apply to entries that declare more than the bound values; a
    // config-only entry ignores them so one command line can drive a multi-entry pipeline.
    let extra = if f.nparams > base { extra } else { Vec::new() };
    for (i, j) in extra.into_iter().enumerate() {
        // Index into the declared parameter list, not the growing value list.
        let ty = f.param_types.get(base + i).cloned().flatten();
        vals.push(convert_arg(pack, ty.as_ref(), &j)?);
    }
    if vals.len() != f.nparams {
        return Err(format!(
            "entry `{entry_name}` takes {} value(s) ({}), got {}",
            f.nparams,
            f.params_preview(),
            vals.len()
        ));
    }
    Ok(Invocation { fn_id: entry.fn_id, args: vals })
}

trait ParamsPreview {
    fn params_preview(&self) -> String;
}

impl ParamsPreview for buildhub_core::ir::FnDef {
    fn params_preview(&self) -> String {
        let names: Vec<String> = self
            .param_types
            .iter()
            .map(|t| t.as_ref().map(type_name).unwrap_or_else(|| "?".to_string()))
            .collect();
        names.join(", ")
    }
}

fn type_name(t: &buildhub_core::ast::TypeExpr) -> String {
    use buildhub_core::ast::TypeExpr::*;
    match t {
        Num => "Num".into(),
        Bool => "Bool".into(),
        Sym => "Sym".into(),
        Unit => "Unit".into(),
        Str => "Str".into(),
        List(x) => format!("List<{}>", type_name(x)),
        Tuple(xs) => format!("({})", xs.iter().map(type_name).collect::<Vec<_>>().join(", ")),
        Record { .. } => "Record".into(),
        Named(n) => n.clone(),
        Generic(n, args) => format!("{n}<{}>", args.iter().map(type_name).collect::<Vec<_>>().join(", ")),
        Fn(a, r) => format!("({}) -> {}", a.iter().map(type_name).collect::<Vec<_>>().join(", "), type_name(r)),
        Var(v) => v.clone(),
    }
}

fn first_schema_name(t: &buildhub_core::ast::TypeExpr) -> Option<String> {
    use buildhub_core::ast::TypeExpr::*;
    match t {
        Named(n) => Some(n.clone()),
        Generic(n, _) => Some(n.clone()),
        _ => None,
    }
}

/// Convert one JSON argument using its declared type; untyped values fall back to structure.
fn convert_arg(pack: &LoadedPack, ty: Option<&buildhub_core::ast::TypeExpr>, j: &serde_json::Value) -> Result<Value, String> {
    match ty {
        Some(t) => pack.json_to_typed(t, j).map_err(|d| d.to_string()),
        None => json_scalar(j),
    }
}

fn json_scalar(j: &serde_json::Value) -> Result<Value, String> {
    Ok(match j {
        serde_json::Value::Null => Value::None,
        serde_json::Value::Bool(b) => Value::Bool(*b),
        serde_json::Value::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        serde_json::Value::String(s) => Value::Str(std::rc::Rc::from(s.as_str())),
        serde_json::Value::Array(a) => {
            let mut out = Vec::with_capacity(a.len());
            for x in a {
                out.push(json_scalar(x)?);
            }
            Value::list(out)
        }
        serde_json::Value::Object(_) => return Err("object arguments need a declared schema".into()),
    })
}

/// Which executor to use (spec §9.5): T = tree walk, B = bytecode VM.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Path {
    T,
    B,
}

fn path_of(args: &[String]) -> Path {
    match opt(args, "--path").unwrap_or("t") {
        "b" | "B" => Path::B,
        _ => Path::T,
    }
}

fn run_value_path(pack: &LoadedPack, inv: &Invocation, budget: Budget, memo: bool, path: Path) -> Result<Value, String> {
    match path {
        Path::T => {
            let interner = pack.interner.borrow();
            let interp = Interp::new(&pack.program, &interner, budget);
            interp.memo_on.set(memo);
            let d = interp.call(inv.fn_id, inv.args.clone()).map_err(|e| e.to_string())?;
            interp.project(d).map_err(|e| e.to_string())
        }
        Path::B => {
            let interner = pack.interner.borrow();
            let vm = buildhub_core::vm::Vm::new(&pack.code, &interner, &pack.program.data, budget);
            vm.memo_on.set(memo);
            let d = vm.call(inv.fn_id, inv.args.clone()).map_err(|e| e.to_string())?;
            vm.project(d).map_err(|e| e.to_string())
        }
    }
}

fn run_value(pack: &LoadedPack, inv: &Invocation, budget: Budget, memo: bool) -> Result<Value, String> {
    run_value_path(pack, inv, budget, memo, Path::T)
}

/// What `eval` runs: a source pack dir (tree walk, or VM with `--path b`), or a built artifact
/// (`.bhub` file or the artifact dir `build` emits) decoded to its `CodeImage` and run on the VM
/// (spec §9.5 path B). One command covers both, so B(interpreted pack) and W(compiled artifact)
/// runs stay comparable.
enum EvalSource {
    Pack(LoadedPack),
    Image(ImagePack),
}

/// A decoded `CodeImage` plus the data rebound from the artifact dir (when it stages datasets).
struct ImagePack {
    code: buildhub_core::ssa::Code,
    interner: buildhub_core::Interner,
    data: Vec<buildhub_core::ir::DataSet>,
}

fn resolve_source(target: &str) -> Result<EvalSource, String> {
    let path = std::path::Path::new(target);
    if path.is_dir() && path.join("pack.toml").exists() {
        // A source pack dir — unless it is actually a build artifact (`.bhub` present, no `.bhl`
        // sources), in which case the built image takes precedence over the sources.
        let has_bhl = collect_bhl_has(path);
        let bhub = single_bhub(path);
        if !has_bhl {
            if let Some(img) = bhub {
                return Ok(EvalSource::Image(load_image(&img, Some(path))?));
            }
        }
        return Ok(EvalSource::Pack(load(path)?));
    }
    if path.is_file() {
        return Ok(EvalSource::Image(load_image(path, path.parent())?));
    }
    if path.is_dir() {
        if let Some(img) = single_bhub(path) {
            return Ok(EvalSource::Image(load_image(&img, Some(path))?));
        }
        return Err(format!("{} is neither a pack dir (pack.toml) nor an artifact (.bhub)", path.display()));
    }
    Err(format!("no such pack dir or artifact: {target}"))
}

fn collect_bhl_has(dir: &std::path::Path) -> bool {
    let mut files = Vec::new();
    collect_bhl(dir, &mut files).map(|_| ()).unwrap_or(());
    !files.is_empty()
}

/// The artifact's image: exactly one top-level `*.bhub`, or `None`.
fn single_bhub(dir: &std::path::Path) -> Option<PathBuf> {
    let mut found: Vec<PathBuf> = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.filter_map(|e| e.ok()).map(|e| e.path()) {
            if e.is_file() && e.extension().and_then(|x| x.to_str()) == Some("bhub") {
                found.push(e);
            }
        }
    }
    found.sort();
    if found.len() == 1 { found.into_iter().next() } else { None }
}

/// Decode a `.bhub` file and rebuild the symbol table; rebind datasets from the artifact dir
/// (spec §4.2: data ships beside code, so a `CodeImage` alone is not enough for data entries).
fn load_image(img: &std::path::Path, dir: Option<&std::path::Path>) -> Result<ImagePack, String> {
    let bytes = std::fs::read(img).map_err(|e| format!("cannot read {}: {e}", img.display()))?;
    let image = buildhub_core::image::decode(&bytes).map_err(|d| d.to_string())?;
    let mut interner = buildhub_core::Interner::new();
    for s in &image.code.syms {
        interner.intern(s);
    }
    let data = match dir {
        Some(d) if d.join("pack.toml").exists() => match bind_image_data(d, &image.code, &mut interner) {
            Ok(v) => v,
            // A stray pack.toml next to a bare .bhub must not break data-free entries; data
            // entries will still fail loudly at access time. Real artifact dirs bind cleanly.
            Err(e) => {
                eprintln!("warning: cannot rebind staged datasets: {e}");
                Vec::new()
            }
        },
        _ => Vec::new(),
    };
    Ok(ImagePack { code: image.code, interner, data })
}

/// Rebind the artifact dir's staged datasets against the image's schema table.
fn bind_image_data(
    dir: &std::path::Path,
    code: &buildhub_core::ssa::Code,
    interner: &mut buildhub_core::Interner,
) -> Result<Vec<buildhub_core::ir::DataSet>, String> {
    let config = buildhub_core::pack::read_config(dir).map_err(|d| d.to_string())?;
    let mut out = Vec::with_capacity(config.data.len());
    for d in &config.data {
        let schema = code
            .schemas
            .iter()
            .find(|s| s.name == d.schema)
            .ok_or_else(|| format!("[[data]] `{}` refers to unknown schema `{}`", d.name, d.schema))?;
        let (file, module) = match d.dataset.split_once('#') {
            Some((f, m)) => (f, Some(m)),
            None => (d.dataset.as_str(), None),
        };
        let path = dir.join(file);
        let text = std::fs::read_to_string(&path).map_err(|e| format!("cannot read dataset {}: {e}", path.display()))?;
        let mut json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("invalid JSON in {}: {e}", path.display()))?;
        if let Some(m) = module {
            json = json.get(m).cloned().ok_or_else(|| format!("dataset module `{m}` not found in `{}`", d.dataset))?;
        }
        let rows_json = match json {
            serde_json::Value::Array(a) => a,
            other => vec![other],
        };
        let key_sym = match &d.key {
            Some(k) => Some(interner.intern(k)),
            None => None,
        };
        let mut rows = Vec::with_capacity(rows_json.len());
        let mut index = std::collections::HashMap::new();
        for (i, r) in rows_json.into_iter().enumerate() {
            let ty = buildhub_core::ssa::TyTag::Schema(schema.name.clone());
            let v = iconvert(code, interner, &ty, &r, &format!("{}[{i}]", d.name))?;
            if d.index {
                if let Some(ks) = key_sym {
                    match &v {
                        buildhub_core::value::Value::Record(rec) => match rec.get(ks) {
                            Some(k) => {
                                index.insert(k.hash(), i);
                            }
                            None => return Err(format!("record #{} lacks key field `{}`", i, d.key.as_deref().unwrap_or(""))),
                        },
                        _ => return Err(format!("record #{} of `{}` is not a record", i, d.name)),
                    }
                } else {
                    index.insert(buildhub_core::value::Value::Num(i as f64).hash(), i);
                }
            }
            rows.push(v);
        }
        out.push(buildhub_core::ir::DataSet {
            name: d.name.clone(),
            dataset: d.dataset.clone(),
            schema: d.schema.clone(),
            key: d.key.clone(),
            key_sym,
            rows: std::rc::Rc::new(rows),
            version: buildhub_core::hash::hash_bytes(text.as_bytes()),
            index: index.into_iter().collect(),
        });
    }
    Ok(out)
}

/// JSON → value against the image's `TyTag` table: the call-boundary conversion (spec §4.3)
/// for artifact runs, mirroring the pack-dir path's typed conversion.
fn iconvert(
    code: &buildhub_core::ssa::Code,
    interner: &mut buildhub_core::Interner,
    ty: &buildhub_core::ssa::TyTag,
    j: &serde_json::Value,
    ctx: &str,
) -> Result<buildhub_core::value::Value, String> {
    use buildhub_core::ssa::TyTag;
    use buildhub_core::value::Value;
    Ok(match (ty, j) {
        (_, serde_json::Value::Null) => Value::None,
        (TyTag::Num, serde_json::Value::Number(n)) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        (TyTag::Bool, serde_json::Value::Bool(b)) => Value::Bool(*b),
        (TyTag::Sym, serde_json::Value::String(s)) => Value::Sym(interner.intern(s)),
        (TyTag::Str, serde_json::Value::String(s)) => Value::Str(std::rc::Rc::from(s.as_str())),
        (TyTag::Unit, _) => Value::Unit,
        (TyTag::List(inner), serde_json::Value::Array(a)) => {
            let mut xs = Vec::with_capacity(a.len());
            for (i, x) in a.iter().enumerate() {
                xs.push(iconvert(code, interner, inner, x, &format!("{ctx}[{i}]"))?);
            }
            Value::list(xs)
        }
        (TyTag::Option(inner), other) => Value::Some(Box::new(iconvert(code, interner, inner, other, ctx)?)),
        (TyTag::Tuple(items), serde_json::Value::Array(a)) => {
            let mut xs = Vec::with_capacity(a.len());
            for (i, x) in a.iter().enumerate() {
                let t = items.get(i).cloned().unwrap_or(TyTag::Any);
                xs.push(iconvert(code, interner, &t, x, &format!("{ctx}[{i}]"))?);
            }
            Value::tuple(xs)
        }
        (TyTag::Record(fields, open), serde_json::Value::Object(o)) => {
            let mut rec = buildhub_core::value::Record::new();
            for (k, v) in o {
                let fty = fields.iter().find(|(n, _)| n == k).map(|(_, t)| t.clone());
                let val = match fty {
                    Some(t) => iconvert(code, interner, &t, v, &format!("{ctx}.{k}"))?,
                    None if *open => iany(interner, v),
                    None => return Err(format!("`{ctx}.{k}`: unknown field")),
                };
                rec.set(interner.intern(k), val);
            }
            Value::record(rec)
        }
        (TyTag::Schema(name), other) => {
            // Undeclared nominal types (the pack's `Value` for "any JSON value") convert
            // structurally, mirroring the pack-dir loader's `json_scalar` fallback.
            let Some(schema) = code.schemas.iter().find(|s| &s.name == name) else {
                return Ok(iany(interner, other));
            };
            let serde_json::Value::Object(o) = other else {
                return Err(format!("`{ctx}`: expected an object for schema `{name}`"));
            };
            let schema = schema.clone();
            let mut rec = buildhub_core::value::Record::new();
            for (k, v) in o {
                let fty = schema.fields.iter().find(|(n, _)| n == k).map(|(_, t)| t.clone());
                let val = match fty {
                    Some(t) => iconvert(code, interner, &t, v, &format!("{ctx}.{k}"))?,
                    None if schema.open => iany(interner, v),
                    None => return Err(format!("`{ctx}.{k}`: schema `{name}` has no such field")),
                };
                rec.set(interner.intern(k), val);
            }
            Value::record(rec)
        }
        (TyTag::Any, other) => iany(interner, other),
        (want, got) => return Err(format!("`{ctx}`: expected {want:?}, got {got}")),
    })
}

fn iany(interner: &mut buildhub_core::Interner, j: &serde_json::Value) -> buildhub_core::value::Value {
    use buildhub_core::value::Value;
    match j {
        serde_json::Value::Null => Value::None,
        serde_json::Value::Bool(b) => Value::Bool(*b),
        serde_json::Value::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        serde_json::Value::String(s) => Value::Sym(interner.intern(s)),
        serde_json::Value::Array(a) => Value::list(a.iter().map(|x| iany(interner, x)).collect()),
        serde_json::Value::Object(o) => {
            let mut rec = buildhub_core::value::Record::new();
            for (k, v) in o {
                rec.set(interner.intern(k), iany(interner, v));
            }
            Value::record(rec)
        }
    }
}

fn image_value_json(interner: &buildhub_core::Interner, v: &buildhub_core::value::Value) -> String {
    use buildhub_core::value::Value;
    fn go(v: &Value, interner: &buildhub_core::Interner) -> String {
        match v {
            Value::Num(n) => {
                if n.is_finite() { format!("{n:?}") } else { "null".to_string() }
            }
            Value::Bool(b) => b.to_string(),
            Value::Sym(s) => buildhub_core::diag::json_str(interner.name(*s)),
            Value::Str(s) => buildhub_core::diag::json_str(s),
            Value::Unit | Value::Missing | Value::None => "null".to_string(),
            Value::List(xs) | Value::Tuple(xs) => {
                format!("[{}]", xs.iter().map(|x| go(x, interner)).collect::<Vec<_>>().join(","))
            }
            Value::Record(r) => format!(
                "{{{}}}",
                r.fields
                    .iter()
                    .map(|(k, v)| format!("{}:{}", buildhub_core::diag::json_str(interner.name(*k)), go(v, interner)))
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            Value::Some(x) => go(x, interner),
            Value::Ok(x) => go(x, interner),
            Value::Err(x) => format!("{{\"err\":{}}}", go(x, interner)),
            Value::Closure(_) | Value::Builtin(_) => "\"<fn>\"".to_string(),
        }
    }
    go(v, interner)
}

/// Run one entry from a decoded image on the VM (path B), with the CLI's `--config`/`--args`
/// mapping: the first declared parameter binds `--config`, the rest bind `--args` items.
fn run_image_eval(
    img: &ImagePack,
    entry_name: &str,
    args: &[String],
    budget: Budget,
    memo: bool,
) -> Result<buildhub_core::value::Value, String> {
    let entry = img
        .code
        .entries
        .iter()
        .find(|e| e.name == entry_name)
        .ok_or_else(|| format!("no entry `{entry_name}` (see `buildhub info` on the pack dir)"))?;
    let (fn_id, nparams, params) = (entry.fn_id as usize, entry.nparams as usize, entry.params.clone());
    let mut interner = img.interner.clone_for_host();
    // Intern every reachable string first, so `sym"..."` comparisons see the host's ids.
    fn walk(j: &serde_json::Value, out: &mut buildhub_core::Interner) {
        match j {
            serde_json::Value::String(s) => {
                out.intern(s);
            }
            serde_json::Value::Array(a) => a.iter().for_each(|x| walk(x, out)),
            serde_json::Value::Object(o) => o.values().for_each(|x| walk(x, out)),
            _ => {}
        }
    }
    let mut vals = Vec::new();
    if let Some(c) = opt(args, "--config") {
        let text = if let Some(path) = c.strip_prefix('@') {
            std::fs::read_to_string(path).map_err(|e| format!("cannot read {path}: {e}"))?
        } else {
            c.to_string()
        };
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("invalid --config JSON: {e}"))?;
        walk(&json, &mut interner);
        let ty = params.first().cloned().unwrap_or(buildhub_core::ssa::TyTag::Any);
        vals.push(iconvert(&img.code, &mut interner, &ty, &json, "config")?);
    }
    let extra = match opt(args, "--args") {
        Some(a) => {
            let json: serde_json::Value = serde_json::from_str(a).map_err(|e| format!("invalid --args JSON: {e}"))?;
            match json {
                serde_json::Value::Array(items) => items,
                other => vec![other],
            }
        }
        None => Vec::new(),
    };
    // Same leniency as the pack-dir path: extra `--args` only apply past the bound values.
    let extra = if nparams > vals.len() { extra } else { Vec::new() };
    for j in extra.into_iter() {
        walk(&j, &mut interner);
        let ty = params.get(vals.len()).cloned().unwrap_or(buildhub_core::ssa::TyTag::Any);
        vals.push(iconvert(&img.code, &mut interner, &ty, &j, &format!("arg{}", vals.len()))?);
    }
    if vals.len() != nparams {
        return Err(format!("entry `{entry_name}` takes {nparams} value(s), got {}", vals.len()));
    }
    let vm = buildhub_core::vm::Vm::new(&img.code, &interner, &img.data, budget);
    vm.memo_on.set(memo);
    let d = vm.call(fn_id, vals).map_err(|e| e.to_string())?;
    vm.project(d).map_err(|e| e.to_string())
}

fn cmd_eval(args: &[String]) -> Result<(), String> {
    let target = positional(args).ok_or_else(|| "missing <pack-dir|artifact>".to_string())?;
    let entry_name = opt(args, "--fn").ok_or_else(|| "missing --fn <entry>".to_string())?;
    let memo = opt(args, "--memo").map(|m| m != "off").unwrap_or(true);
    let as_json = flag(args, "--json");
    match resolve_source(target)? {
        EvalSource::Pack(pack) => {
            let inv = build_invocation(&pack, args, entry_name)?;
            let v = run_value_path(&pack, &inv, budget_from(args), memo, path_of(args))?;
            let out = if as_json {
                format!("{{\"ok\":true,\"result\":{}}}", value_json(&pack, &v))
            } else {
                let interner = pack.interner.borrow();
                let interp = Interp::new(&pack.program, &interner, Budget::default());
                interp.show(&v)
            };
            println!("{out}");
            Ok(())
        }
        EvalSource::Image(img) => {
            let v = run_image_eval(&img, entry_name, args, budget_from(args), memo)?;
            if as_json {
                println!("{{\"ok\":true,\"result\":{}}}", image_value_json(&img.interner, &v));
            } else {
                println!("{}", buildhub_core::show::render(&img.interner, &v));
            }
            Ok(())
        }
    }
}

fn cmd_explain(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    let entry_name = opt(args, "--fn").ok_or_else(|| "missing --fn <entry>".to_string())?;
    let inv = build_invocation(&pack, args, entry_name)?;
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, budget_from(args)).with_explain();
    let d = interp.call(inv.fn_id, inv.args.clone()).map_err(|e| e.to_string())?;
    let v = interp.project(d).map_err(|e| e.to_string())?;
    println!("{entry_name} = {}", interp.show(&v));
    if let Some(log) = &interp.explain {
        for e in &log.borrow().entries {
            println!("{}{} = {}", "  ".repeat(e.depth), e.call, e.result);
        }
    }
    Ok(())
}

fn cmd_tree(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    let entry_name = opt(args, "--fn").ok_or_else(|| "missing --fn <entry>".to_string())?;
    let inv = build_invocation(&pack, args, entry_name)?;
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, budget_from(args));
    let d: Dist = interp.call(inv.fn_id, inv.args.clone()).map_err(|e| e.to_string())?;
    let outcome = build_tree(&interp, d, entry_name).map_err(|e| e.to_string())?;
    match opt(args, "--format").unwrap_or("text") {
        "json" => println!("{}", tree_json(&outcome.root, outcome.truncated, outcome.support)),
        "dot" => {
            println!("digraph outcome {{");
            dot_dump(&outcome.root, 0, &mut 1);
            println!("}}");
        }
        _ => print_tree(&outcome.root, "", true, outcome.truncated, outcome.support),
    }
    Ok(())
}

fn print_tree(n: &TreeNode, prefix: &str, is_last: bool, truncated: bool, support: usize) {
    let bar_len = (n.prob * 40.0).round().max(0.0) as usize;
    println!(
        "{prefix}{}{} {}  p={:.3}  {}{}",
        if prefix.is_empty() { "" } else if is_last { "└─ " } else { "├─ " },
        n.label,
        n.value,
        n.prob,
        "█".repeat(bar_len),
        if n.value_kind == "uncond" { "  (expect)" } else { "" }
    );
    let _ = truncated;
    let _ = support;
    for (i, c) in n.children.iter().enumerate() {
        let child_prefix = format!("{prefix}{}", if prefix.is_empty() { "" } else if is_last { "   " } else { "│  " });
        print_tree(c, &child_prefix, i + 1 == n.children.len(), truncated, support);
    }
}

fn tree_json(n: &TreeNode, truncated: bool, support: usize) -> String {
    fn node_json(n: &TreeNode) -> String {
        format!(
            "{{\"label\":{},\"value\":{},\"value_kind\":\"{}\",\"edge\":{},\"prob\":{},\"children\":[{}]}}",
            buildhub_core::diag::json_str(&n.label),
            fmt_num(n.value),
            n.value_kind,
            fmt_num(n.edge),
            fmt_num(n.prob),
            n.children.iter().map(node_json).collect::<Vec<_>>().join(",")
        )
    }
    format!(
        "{{\"ok\":true,\"mode\":\"tree\",\"truncated\":{},\"support\":{},\"root\":{}}}",
        truncated,
        support,
        node_json(n)
    )
}

fn dot_dump(n: &TreeNode, id: usize, next: &mut usize) {
    for c in &n.children {
        let cid = *next;
        *next += 1;
        println!(
            "  n{} [label=\"{} {} (p={:.3})\"];",
            cid, c.label, c.value, c.prob
        );
        println!("  n{} -> n{} [label=\"{:.3}\"];", id, cid, c.edge);
        dot_dump(c, cid, next);
    }
    if n.children.is_empty() {
        println!("  n{} [label=\"{} {} (p={:.3})\"];", id, n.label, n.value, n.prob);
    }
}

fn fmt_num(x: f64) -> String {
    // JSON has no NaN/Infinity: report them as null rather than emitting invalid JSON.
    if !x.is_finite() { "null".to_string() } else { format!("{x:?}") }
}

/// Recursive "want ⊆ got" check for expected values: numbers compare with `tol`, objects may
/// list a subset of fields, arrays must match element-wise and in order.
fn json_subset_mismatch(got: &serde_json::Value, want: &serde_json::Value) -> Option<String> {
    match (got, want) {
        (serde_json::Value::Object(g), serde_json::Value::Object(w)) => {
            for (k, wv) in w {
                match g.get(k) {
                    Some(gv) => {
                        if let Some(why) = json_subset_mismatch(gv, wv) {
                            return Some(format!("field `{k}`: {why}"));
                        }
                    }
                    None => return Some(format!("missing field `{k}`")),
                }
            }
            None
        }
        (serde_json::Value::Array(g), serde_json::Value::Array(w)) => {
            if g.len() != w.len() {
                return Some(format!("array length {} != {}", g.len(), w.len()));
            }
            for (i, (gv, wv)) in g.iter().zip(w.iter()).enumerate() {
                if let Some(why) = json_subset_mismatch(gv, wv) {
                    return Some(format!("[{i}]: {why}"));
                }
            }
            None
        }
        (serde_json::Value::Number(g), serde_json::Value::Number(w)) => {
            let (g, w) = (g.as_f64().unwrap_or(f64::NAN), w.as_f64().unwrap_or(f64::NAN));
            if (g - w).abs() > 1e-9 {
                Some(format!("{g} != {w}"))
            } else {
                None
            }
        }
        _ => {
            if got == want {
                None
            } else {
                Some(format!("{got} != {want}"))
            }
        }
    }
}

fn value_json(pack: &LoadedPack, v: &Value) -> String {
    let interner = pack.interner.borrow();
    fn go(v: &Value, interner: &buildhub_core::Interner) -> String {
        match v {
            Value::Num(n) => fmt_num(*n),
            Value::Bool(b) => b.to_string(),
            Value::Sym(s) => buildhub_core::diag::json_str(interner.name(*s)),
            Value::Str(s) => buildhub_core::diag::json_str(s),
            Value::Unit | Value::Missing | Value::None => "null".to_string(),
            Value::List(xs) | Value::Tuple(xs) => {
                format!("[{}]", xs.iter().map(|x| go(x, interner)).collect::<Vec<_>>().join(","))
            }
            Value::Record(r) => format!(
                "{{{}}}",
                r.fields
                    .iter()
                    .map(|(k, v)| format!("{}:{}", buildhub_core::diag::json_str(interner.name(*k)), go(v, interner)))
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            Value::Some(x) => go(x, interner),
            Value::Ok(x) => go(x, interner),
            Value::Err(x) => format!("{{\"err\":{}}}", buildhub_core::diag::json_str(&interp_show(interner, x))),
            Value::Closure(_) | Value::Builtin(_) => "\"<fn>\"".to_string(),
        }
    }
    fn interp_show(interner: &buildhub_core::Interner, v: &Value) -> String {
        match v {
            Value::Sym(s) => interner.name(*s).to_string(),
            other => format!("{other:?}"),
        }
    }
    go(v, &interner)
}

fn cmd_sim(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    let init_name = opt(args, "--fn").ok_or_else(|| "missing --fn <sim_init entry>".to_string())?;
    let step_name = opt(args, "--step").ok_or_else(|| "missing --step <sim_step entry>".to_string())?;
    let probe_name = opt(args, "--probe").ok_or_else(|| "missing --probe <sim_probe entry>".to_string())?;
    let init = build_invocation(&pack, args, init_name)?;
    // The step factory takes its own extra arguments (`--step-args`), typed by its signature.
    let step_inv = build_invocation(&pack, args, step_name)?;
    let interner = pack.interner.borrow();
    let mut opts = buildhub_core::sim::TraceOptions::default();
    if let Some(v) = opt(args, "--max-support") {
        opts.max_support = v.parse().unwrap_or(256);
    }
    opts.split = flag(args, "--split");
    if let Some(q) = opt(args, "--quantile") {
        opts.quantile = q.parse().unwrap_or(0.1);
    }
    if let Some(st) = opt(args, "--states") {
        opts.states = st.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    }
    let horizon: f64 = opt(args, "--horizon").and_then(|v| v.parse().ok()).unwrap_or(3.0);
    let dt: f64 = opt(args, "--dt").and_then(|v| v.parse().ok()).unwrap_or(1.0);
    let budget = budget_from(args);
    let interp = Interp::new(&pack.program, &interner, budget);
    let steps = buildhub_core::sim::grid(0.0, horizon, dt);
    let step_id = pack.entry(step_name).ok_or_else(|| format!("no entry `{step_name}`"))?.fn_id;
    let probe_id = pack.entry(probe_name).ok_or_else(|| format!("no entry `{probe_name}`"))?.fn_id;
    // The step entry is a *factory*: call it once with its own arguments to obtain the step
    // closure. A plain `|S, Num| S` function can be used directly (it is already a closure value).
    let step_fn = interp
        .project(interp.call(step_id, step_inv.args.clone()).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let probe_fn = buildhub_core::sim::value_of_entry(&interp, probe_id);
    let init_value = interp
        .project(interp.call(init.fn_id, init.args.clone()).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let result = buildhub_core::sim::run(&interp, &init_value, &steps, &step_fn, &probe_fn, &opts)
        .map_err(|e| e.to_string())?;
    match opt(args, "--format").unwrap_or("text") {
        "json" => println!("{}", buildhub_core::sim::to_json(&interp, &result, &opts)),
        _ => {
            println!("{:>8}  {:>12}  {:>12}  {:>12}  {:>12}", "t", "total", "mean", "hp", "def");
            for (i, f) in result.frames.iter().enumerate() {
                let hp = f.states.iter().find(|(k, _)| interp.interner.name(*k) == "hp").map(|(_, s)| s.mean);
                let def = f.states.iter().find(|(k, _)| interner.name(*k) == "def").map(|(_, s)| s.mean);
                println!(
                    "{:>8.2}  {:>12.4}  {:>12.4}  {:>12.2}  {:>12.2}",
                    f.t,
                    f.total.max,
                    f.total.mean,
                    hp.unwrap_or(0.0),
                    def.unwrap_or(0.0)
                );
                let _ = i;
            }
            println!("cumulative total mean = {:.4}", result.summary.mean);
        }
    }
    Ok(())
}

fn cmd_dump(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    let want = opt(args, "--fn");
    if flag(args, "--pats") {
        for (i, p) in pack.code.patterns.iter().enumerate() {
            println!("pattern#{i}: {p:?}");
        }
        println!();
    }
    for f in &pack.code.fns {
        let name = pack
            .program
            .fns
            .get(f.fn_id as usize)
            .map(|x| x.name.as_str())
            .unwrap_or("<lambda>");
        if let Some(w) = want {
            if name != w {
                continue;
            }
        }
        println!("fn#{} {name} nregs={} nparams={} ncaptures={}", f.fn_id, f.nregs, f.nparams, f.ncaptures);
        for (bi, blk) in f.blocks.iter().enumerate() {
            println!("  block#{bi}:");
            for (ii, ins) in blk.iter().enumerate() {
                println!("    {ii:3} {ins:?}");
            }
        }
    }
    Ok(())
}

fn cmd_image(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    let numeric = match opt(args, "--numeric").unwrap_or("libm") {
        "host" => buildhub_core::image::NumericMode::Host,
        _ => buildhub_core::image::NumericMode::Libm,
    };
    let bytes = pack.to_image(numeric);
    match opt(args, "-o").or_else(|| opt(args, "--out")) {
        Some(path) => {
            std::fs::write(path, &bytes).map_err(|e| format!("cannot write {path}: {e}"))?;
            println!("wrote {path} ({} bytes)", bytes.len());
        }
        None => println!("{} bytes; {} function(s), {} block(s)", bytes.len(), pack.code.fns.len(), pack.code.nblocks),
    }
    Ok(())
}

fn cmd_parity(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    let filter = opt(args, "--filter");
    let tests_dir = dir.join("tests");
    let mut files: Vec<PathBuf> = match std::fs::read_dir(&tests_dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
            .collect(),
        Err(_) => Vec::new(),
    };
    files.sort();
    let mut total = 0usize;
    let mut diffs = 0usize;
    for f in files {
        let text = std::fs::read_to_string(&f).map_err(|e| e.to_string())?;
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
                continue;
            }
            let case: serde_json::Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
            let name = case.get("name").and_then(|v| v.as_str()).unwrap_or("<unnamed>");
            if let Some(flt) = filter {
                if !name.contains(flt) {
                    continue;
                }
            }
            // Only successful numeric calls can be compared bit-for-bit; error cases are covered
            // by `pack test`.
            let Some(inv) = invocation_for_case(&pack, &case) else { continue };
            total += 1;
            let budget = Budget {
                max_support: case.get("max_support").and_then(|v| v.as_u64()).unwrap_or(256) as usize,
                ..Budget::default()
            };
            let t = run_value_path(&pack, &inv, budget, true, Path::T);
            let b = run_value_path(&pack, &inv, budget, true, Path::B);
            match (t, b) {
                (Ok(a), Ok(c)) => {
                    if a.hash() != c.hash() {
                        diffs += 1;
                        let ia = pack.interner.borrow();
                        let interp = Interp::new(&pack.program, &ia, Budget::default());
                        println!(
                            "DIFF {name}: T = {} / B = {}",
                            interp.show(&a),
                            interp.show(&c)
                        );
                    }
                }
                (Err(e), _) | (_, Err(e)) => {
                    diffs += 1;
                    println!("DIFF {name}: one path failed: {e}");
                }
            }
        }
    }
    println!("{}/{total} case(s) identical on T and B", total - diffs);
    if diffs > 0 {
        return Err(format!("{diffs} case(s) diverge"));
    }
    // Path W: hand the same cases to the wasm module when one is provided.
    if let Some(wasm_path) = opt(args, "--wasm") {
        run_wasm_parity(&dir, &pack, wasm_path, filter)?;
    }
    Ok(())
}

/// Drive `bhub_call` in `engine.wasm` over the same corpus (spec §9.5 path W, G4/G6).
fn run_wasm_parity(dir: &std::path::Path, pack: &LoadedPack, wasm_path: &str, filter: Option<&str>) -> Result<(), String> {
    let image_path = std::env::temp_dir().join(format!("bhub-parity-{}.bhub", std::process::id()));
    std::fs::write(&image_path, pack.to_image(buildhub_core::image::NumericMode::Libm))
        .map_err(|e| format!("cannot write image: {e}"))?;
    let mut cases: Vec<(String, Invocation, f64)> = Vec::new();
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir.join("tests"))
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("jsonl"))
        .collect();
    files.sort();
    for f in files {
        let text = std::fs::read_to_string(&f).map_err(|e| e.to_string())?;
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
                continue;
            }
            let case: serde_json::Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
            let name = case.get("name").and_then(|v| v.as_str()).unwrap_or("<unnamed>").to_string();
            if let Some(flt) = filter {
                if !name.contains(flt) {
                    continue;
                }
            }
            // Only numeric expectations are compared bit-for-bit.
            let Some(exp) = case.get("expect").and_then(|v| v.as_f64()) else { continue };
            let Some(inv) = invocation_for_case(pack, &case) else { continue };
            cases.push((name, inv, exp));
        }
    }
    // The wasm module has no schema table beyond the image's, so bind data through the ABI first.
    let script = std::env::temp_dir().join(format!("bhub-parity-{}.mjs", std::process::id()));
    let data_decls: Vec<(String, String, String)> = pack
        .config
        .data
        .iter()
        .map(|d| (d.name.clone(), d.dataset.clone(), d.key.clone().unwrap_or_default()))
        .collect();
    let entries: Vec<String> = cases
        .iter()
        .enumerate()
        .map(|(i, (_, inv, _))| {
            // Serialize the already-converted arguments back to JSON for the ABI.
            let e = pack.program.entries.iter().find(|e| e.fn_id == inv.fn_id).expect("entry");
            let args = inv.args.iter().map(|v| value_to_json(pack, v)).collect::<Vec<_>>().join(",");
            format!("[{i},\"{}\",[{}]]", e.name, args)
        })
        .collect();
    let data_binds: Vec<String> = data_decls
        .iter()
        .map(|(name, dataset, key)| format!("[\"{name}\",\"{}\",\"{key}\"]", dataset.replace('\\', "\\\\")))
        .collect();
    let src = format!(
        r#"import fs from "node:fs"
const {{ instance }} = await WebAssembly.instantiate(fs.readFileSync({wasm:?}), {{}})
const e = instance.exports
const mem = () => e.memory.buffer
const dv = () => new DataView(mem())
const img = fs.readFileSync({image:?})
new Uint8Array(mem(), 8192, img.length).set(img)
const h = e.bhub_pkg_load(8192, img.length)
if (!h) {{ console.log("LOAD_FAILED"); process.exit(0) }}
let cursor = 2000000
function put(s) {{
  const b = new TextEncoder().encode(s); const at = cursor
  new Uint8Array(mem(), at, b.length).set(b); cursor += b.length + 4096; return [at, b.length]
}}
for (const [name, file, key] of [{data_binds}]) {{
  const rows = fs.readFileSync({dir:?} + "/" + file, "utf8")
  const [np, nl] = put(name), [rp, rl] = put(rows), [kp, kl] = put(key)
  const rc = e.bhub_pkg_bind_data(h, np, nl, rp, rl, kp, kl)
  if (rc !== 0) console.log("BIND_FAILED:" + name + ":" + rc)
}}
const out = []
for (const [idx, entry, args] of [{entries}]) {{
  const [np, nl] = put(entry), [ap, al] = put(JSON.stringify(args))
  const bits = 4096
  const rc = e.bhub_call_bits(h, np, nl, ap, al, bits)
  if (rc !== 0) out.push(idx + ":ERR")
  else out.push(idx + ":" + dv().getBigUint64(bits, true).toString(16))
}}
console.log(out.join(String.fromCharCode(10)))
"#,
        wasm = wasm_path,
        image = image_path.display().to_string(),
        data_binds = data_binds.join(","),
        dir = dir.display().to_string(),
        entries = entries.join(","),
    );
    std::fs::write(&script, src).map_err(|e| e.to_string())?;
    let output = std::process::Command::new("node")
        .arg(&script)
        .output()
        .map_err(|e| format!("node is required for path W parity: {e}"))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if text.contains("LOAD_FAILED") {
        return Err(format!("wasm module failed to load the image: {stderr}"));
    }
    if let Some(line) = text.lines().find(|l| l.contains("BIND_FAILED")) {
        return Err(format!("data binding failed: {line}"));
    }
    let mut checked = 0;
    let mut bad = 0;
    for line in text.lines() {
        let line = line.trim();
        if !line.starts_with(|c: char| c.is_ascii_digit()) {
            continue;
        }
        let Some((idx_s, bits)) = line.split_once(':') else { continue };
        let Ok(idx) = idx_s.parse::<usize>() else { continue };
        let Some((name, _, _)) = cases.get(idx) else { continue };
        checked += 1;
        if bits == "ERR" {
            bad += 1;
            println!("DIFF {name}: wasm call failed");
            continue;
        }
        let Ok(wasm_bits) = u64::from_str_radix(bits, 16) else { continue };
        // Native bit pattern for the same invocation.
        let native = run_value_path(pack, &cases[idx].1, Budget::default(), true, Path::T)
            .ok()
            .and_then(|v| match v {
                Value::Num(n) => Some(n.to_bits()),
                _ => None,
            });
        match native {
            Some(n) if n == wasm_bits => {}
            Some(n) => {
                bad += 1;
                println!("DIFF {name}: T {n:016x} != W {wasm_bits:016x}");
            }
            None => {}
        }
    }
    let _ = std::fs::remove_file(script);
    let _ = std::fs::remove_file(image_path);
    println!("{}/{checked} numeric case(s) identical on T and W", checked - bad);
    if bad > 0 {
        return Err(format!("{bad} case(s) diverge on W"));
    }
    Ok(())
}

/// Project a converted argument back to JSON for the ABI round trip.
fn value_to_json(pack: &LoadedPack, v: &Value) -> String {
    value_json(pack, v)
}

fn cmd_test(args: &[String]) -> Result<(), String> {
    let dir = pack_dir(args)?;
    let pack = load(&dir)?;
    let filter = opt(args, "--filter");
    let tests_dir = dir.join("tests");
    let mut files: Vec<PathBuf> = match std::fs::read_dir(&tests_dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
            .collect(),
        Err(_) => Vec::new(),
    };
    files.sort();
    if files.is_empty() {
        return Err(format!("no tests/*.jsonl under {}", tests_dir.display()));
    }
    let mut total = 0;
    let mut failed = 0;
    for f in files {
        let text = std::fs::read_to_string(&f).map_err(|e| e.to_string())?;
        for (ln, line) in text.lines().enumerate() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
                continue;
            }
            let case: serde_json::Value =
                serde_json::from_str(line).map_err(|e| format!("{}:{}: {e}", f.display(), ln + 1))?;
            let name = case.get("name").and_then(|v| v.as_str()).unwrap_or("<unnamed>");
            if let Some(flt) = filter {
                if !name.contains(flt) {
                    continue;
                }
            }
            total += 1;
            match run_case(&pack, &case) {
                Ok(()) => {}
                Err(e) => {
                    failed += 1;
                    println!("FAIL {name}: {e}");
                }
            }
        }
    }
    println!("{}/{total} case(s) passed", total - failed);
    if failed > 0 {
        return Err(format!("{failed} case(s) failed"));
    }
    Ok(())
}

/// Build the invocation a jsonl case describes, or `None` if it is not a plain call.
fn invocation_for_case(pack: &LoadedPack, case: &serde_json::Value) -> Option<Invocation> {
    if case.get("expect_error").is_some() {
        return None;
    }
    let call = case.get("call")?.as_array()?;
    let mut it = call.iter();
    let entry_name = it.next()?.as_str()?;
    let entry = pack.entry(entry_name)?;
    let f = &pack.program.fns[entry.fn_id];
    let mut vals: Vec<Value> = Vec::new();
    if let Some(cfg) = case.get("config") {
        let ty = f.param_types.first().cloned().flatten();
        vals.push(convert_arg(pack, ty.as_ref(), cfg).ok()?);
    }
    for j in it {
        let ty = f.param_types.get(vals.len()).cloned().flatten();
        vals.push(convert_arg(pack, ty.as_ref(), j).ok()?);
    }
    if vals.len() != f.nparams {
        return None;
    }
    Some(Invocation { fn_id: entry.fn_id, args: vals })
}

fn run_case(pack: &LoadedPack, case: &serde_json::Value) -> Result<(), String> {
    let call = case
        .get("call")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "case needs `call` array".to_string())?;
    let mut it = call.iter();
    let entry_name = it
        .next()
        .and_then(|v| v.as_str())
        .ok_or_else(|| "`call` must start with the entry name".to_string())?;
    let entry = pack
        .entry(entry_name)
        .ok_or_else(|| format!("no entry `{entry_name}`"))?;
    let f = &pack.program.fns[entry.fn_id];
    let mut vals: Vec<Value> = Vec::new();
    if let Some(cfg) = case.get("config") {
        let ty = f.param_types.first().cloned().flatten();
        vals.push(convert_arg(pack, ty.as_ref(), cfg)?);
    }
    for j in it {
        let ty = f.param_types.get(vals.len()).cloned().flatten();
        vals.push(convert_arg(pack, ty.as_ref(), j)?);
    }
    let budget = Budget {
        max_support: case.get("max_support").and_then(|v| v.as_u64()).unwrap_or(256) as usize,
        ..Budget::default()
    };
    let v = run_value(pack, &Invocation { fn_id: entry.fn_id, args: vals }, budget, true)?;
    // `expect_error` cases assert a diagnostic code instead of a value.
    if let Some(want) = case.get("expect_error").and_then(|v| v.as_str()) {
        return Err(format!("expected error `{want}` but call succeeded with {:?}", v));
    }
    let want = case.get("expect").ok_or_else(|| "case needs `expect` or `expect_error`".to_string())?;
    let tol_abs = case
        .get("tol")
        .and_then(|t| t.get("abs"))
        .and_then(|v| v.as_f64())
        .unwrap_or(1e-9);
    if let Some(exp) = want.as_f64() {
        let got = match &v {
            Value::Num(n) => *n,
            other => return Err(format!("expected a Num, got {}", other.type_name())),
        };
        if (got - exp).abs() > tol_abs {
            return Err(format!("got {got}, want {exp} (|Δ| = {})", (got - exp).abs()));
        }
        return Ok(());
    }
    // Non-numeric expectations compare as a subset: the case states the fields it cares about.
    let got: serde_json::Value =
        serde_json::from_str(&value_json(pack, &v)).map_err(|e| format!("cannot project result: {e}"))?;
    if let Some(why) = json_subset_mismatch(&got, want) {
        return Err(format!("{why} (got {})", serde_json::to_string(&got).unwrap_or_default()));
    }
    Ok(())
}
