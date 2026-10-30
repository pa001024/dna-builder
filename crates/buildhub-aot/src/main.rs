//! `buildhub-aot`: compile a pack to LLVM IR, and optionally to a single `pack.wasm`.

use std::path::PathBuf;
use std::process::ExitCode;

use buildhub_rt::emit;
use buildhub_rt::link;
use buildhub_core::pack::load_pack;
use buildhub_core::ssa::{Code, TyTag};

const USAGE: &str = "\
buildhub-aot: compile a pack to LLVM IR (path W)

usage:
  buildhub-aot <pack-dir> -o <dir> [--wasm]   emit pack.ll + driver.c + entries.json
                                              --wasm also links a single pack.wasm
";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: Vec<String>) -> Result<(), String> {
    if args.is_empty() || matches!(args[0].as_str(), "help" | "--help" | "-h") {
        print!("{USAGE}");
        return Ok(());
    }
    let dir = PathBuf::from(&args[0]);
    let out = opt(&args, "-o")
        .or_else(|| opt(&args, "--out"))
        .ok_or_else(|| format!("missing -o <out-dir>\n{USAGE}"))?;
    let out_dir = PathBuf::from(out);
    let want_wasm = args.iter().any(|a| a == "--wasm");

    let pack = load_pack(&dir).map_err(|d| d.to_string())?;
    let param_num = emit::param_num(&pack.program);
    let ll = emit::emit_ll(&pack.code, &pack.config.id, &param_num).ok_or_else(|| {
        "pack can produce a support set; the LLVM back end only takes deterministic packs".to_string()
    })?;
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("cannot create {out}: {e}"))?;
    std::fs::write(out_dir.join("pack.ll"), &ll).map_err(|e| e.to_string())?;
    let driver = emit::emit_driver(&pack.code, &ll, &pack.config.id);
    std::fs::write(out_dir.join("driver.c"), &driver).map_err(|e| e.to_string())?;
    std::fs::write(out_dir.join("entries.json"), entries_json(&pack.config.id, &pack.code, &ll))
        .map_err(|e| e.to_string())?;
    println!("wrote {} (LLVM IR, {} line(s))", out_dir.join("pack.ll").display(), ll.lines().count());
    println!("wrote {} (entry table + data loader)", out_dir.join("driver.c").display());
    println!("wrote {} (entry names for hosts)", out_dir.join("entries.json").display());

    if want_wasm {
        let wasm = link::wasm(&pack.code, &ll, &out_dir)?;
        println!("wrote {} (single wasm: pack + runtime)", wasm.display());
    }

    let lib = if cfg!(windows) { "buildhub_rt.lib" } else { "libbuildhub_rt.a" };
    println!(
        "link:  clang -O2 pack.ll driver.c {lib} -o {}.exe{}",
        pack.config.id,
        if cfg!(windows) { " -lshell32" } else { " -lpthread -ldl -lm" }
    );
    println!("run:   {}.exe <data.json> <config.json> <entry> [args...]", pack.config.id);
    Ok(())
}

/// Entry table for hosts: the compiled module exports `f<fn>` plus the runtime's `bhub_*` helpers.
fn entries_json(pack_id: &str, code: &Code, ll: &str) -> String {
    let mut entries = Vec::new();
    for e in &code.entries {
        let ret = if ll.contains(&format!("define double @f{}(", e.fn_id)) { "num" } else { "handle" };
        let params: Vec<String> = e
            .params
            .iter()
            .map(|t| match t {
                TyTag::Num => "num".to_string(),
                TyTag::Sym => "sym".to_string(),
                _ => "json".to_string(),
            })
            .collect();
        entries.push(format!(
            "{{\"name\":\"{}\",\"fn\":{},\"ret\":\"{ret}\",\"params\":[{}]}}",
            e.name,
            e.fn_id,
            params.iter().map(|p| format!("\"{p}\"")).collect::<Vec<_>>().join(",")
        ));
    }
    format!("{{\"pack\":\"{pack_id}\",\"entries\":[{}]}}\n", entries.join(","))
}

fn opt<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).map(|s| s.as_str())
}
