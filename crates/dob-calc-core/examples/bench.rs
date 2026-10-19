//! 端到端基准：`cargo run --release --example bench [-- eval|auto]`。
//!
//! eval：shardBuild1 / liseFire 单次 calculate best-of-9（TS 基线约 230µs）；
//! auto：黎瑟·浴火全量候选 autobuild（TS 基线单轮十几秒，bestTarget≈33801M）。

use std::path::PathBuf;
use std::time::Instant;

use dob_calc_core::autobuild::{AutobuildOptions, AutobuildRequest, ModCandidate, autobuild};
use dob_calc_core::evaluate::{BuildRequest, evaluate_build};
use dob_calc_core::income::ModSlotKey;
use dob_calc_core::session::BuildPayload;
use dob_calc_core::tables::BuildTables;

fn fixture_path(name: &str) -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push(name);
    path
}

fn load(name: &str) -> serde_json::Value {
    let text = std::fs::read_to_string(fixture_path(&format!("{name}.json"))).expect("fixture");
    serde_json::from_str(&text).expect("json")
}

fn request(fixture: &serde_json::Value) -> BuildRequest {
    BuildRequest::from_json(&serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": fixture["request"]["settings"],
    }))
    .expect("request")
}

fn bench_eval(tables: &BuildTables, name: &str) {
    let fixture = load(name);
    let req = request(&fixture);
    let expected = fixture["expected"]["calculate"]
        .as_f64()
        .unwrap_or(f64::NAN);
    let value = evaluate_build(tables, &req).target_value;
    let warm = Instant::now();
    let mut n = 0usize;
    while warm.elapsed().as_millis() < 300 {
        std::hint::black_box(evaluate_build(tables, &req));
        n += 1;
    }
    let iters = (n / 3).max(10);
    let mut best = f64::INFINITY;
    for _ in 0..9 {
        let start = Instant::now();
        for _ in 0..iters {
            std::hint::black_box(evaluate_build(tables, &req));
        }
        best = best.min(start.elapsed().as_nanos() as f64 / iters as f64 / 1000.0);
    }
    if std::env::var("PHASES").is_ok() {
        let time = |label: &str, run: &mut dyn FnMut()| {
            let start = Instant::now();
            for _ in 0..iters {
                run();
            }
            println!(
                "  {label}: {:.1}µs",
                start.elapsed().as_nanos() as f64 / iters as f64 / 1000.0
            );
        };
        time("context::new", &mut || {
            std::hint::black_box(dob_calc_core::context::BuildContext::new(
                tables,
                req.char_id,
                &req.settings,
            ));
        });
        time("new+attrs", &mut || {
            let mut ctx =
                dob_calc_core::context::BuildContext::new(tables, req.char_id, &req.settings)
                    .unwrap();
            std::hint::black_box(ctx.attrs());
        });
        time("new+attrs+weapon", &mut || {
            let mut ctx =
                dob_calc_core::context::BuildContext::new(tables, req.char_id, &req.settings)
                    .unwrap();
            std::hint::black_box(ctx.attrs());
            std::hint::black_box(ctx.calculate_weapon_attributes(None));
        });
        time("new+Evaluator::new", &mut || {
            let mut ctx =
                dob_calc_core::context::BuildContext::new(tables, req.char_id, &req.settings)
                    .unwrap();
            std::hint::black_box(dob_calc_core::Evaluator::new(&mut ctx));
        });
    }
    if std::env::var("PROF").is_ok() {
        dob_calc_core::prof::reset();
        for _ in 0..20 {
            std::hint::black_box(evaluate_build(tables, &req));
        }
        println!("{}", dob_calc_core::prof::report());
    }
    let rel = ((value - expected) / expected).abs();
    println!("eval {name}: best={best:.3}µs value={value} expected={expected} rel={rel:.2e}");
}

fn bench_auto(tables: &BuildTables) {
    let fixture = load("lise_fire");
    let base = request(&fixture);
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
    let anchor = evaluate_build(tables, &base).target_value;
    let req = AutobuildRequest {
        base: base.clone(),
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
    let samples: usize = std::env::var("SAMPLES")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3);
    let mut best = f64::INFINITY;
    for _ in 0..samples {
        let start = Instant::now();
        if std::env::var("PROF").is_ok() {
            dob_calc_core::prof::reset();
        }
        let result = autobuild(tables, &req);
        let ms = start.elapsed().as_secs_f64() * 1000.0;
        best = best.min(ms);
        if std::env::var("PROF").is_ok() {
            println!("{}", dob_calc_core::prof::report());
        }
        let target = evaluate_build(
            tables,
            &BuildRequest {
                settings: result.settings.clone(),
                ..base.clone()
            },
        )
        .target_value;
        let count = |slots: &[Option<(i64, f64)>]| slots.iter().flatten().count();
        println!(
            "  auto sample: {ms:.1}ms iters={} target={target} slots={}/{}/{}",
            result.iters,
            count(&result.settings.char_mods),
            count(&result.settings.melee_mods),
            count(&result.settings.ranged_mods),
        );
        if std::env::var("AUTOLOG").is_ok() {
            for line in &result.log {
                println!("    {line}");
            }
            println!("    char: {:?}", result.settings.char_mods);
            println!("    melee: {:?}", result.settings.melee_mods);
            println!("    ranged: {:?}", result.settings.ranged_mods);
        }
    }
    println!(
        "auto lise_fire: pool={} best={best:.1}ms anchor={anchor}",
        ids.len()
    );
}

fn main() {
    let text = std::fs::read_to_string(fixture_path("modules.json")).expect("modules.json");
    let start = Instant::now();
    let tables = BuildPayload::from_json(&text).expect("tables").tables;
    println!(
        "build tables: {:.1}ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    let mode = std::env::args().nth(1).unwrap_or_default();
    if mode.is_empty() || mode == "eval" {
        for name in [
            "dobapp_shardBuild1",
            "lise_fire",
            "dobapp_vy",
            "dobapp_lieseBathfire1",
            "dobapp_OkdnBN3OlC",
        ] {
            bench_eval(&tables, name);
        }
    }
    if mode.is_empty() || mode == "auto" {
        bench_auto(&tables);
    }
    if mode == "session" {
        bench_session(&tables);
    }
}

/// 会话热复用：同请求重复求值（全命中）与换目标函数（装配命中）。
fn bench_session(tables: &BuildTables) {
    use dob_calc_core::evaluate::CalcSession;
    let fixture = load("dobapp_shardBuild1");
    let req = request(&fixture);
    let mut session = CalcSession::new(tables);
    let cold = session.evaluate(&req);
    assert_eq!(
        cold.target_value.to_bits(),
        evaluate_build(tables, &req).target_value.to_bits()
    );
    // 全命中。
    let mut best = f64::INFINITY;
    for _ in 0..9 {
        let start = Instant::now();
        for _ in 0..2000 {
            std::hint::black_box(session.evaluate(&req));
        }
        best = best.min(start.elapsed().as_nanos() as f64 / 2000.0 / 1000.0);
    }
    println!("session shardBuild1 same-request: best={best:.3}µs");
    // 装配命中：两个目标函数交替。
    let mut alt = req.clone();
    alt.settings.target_function = "伤害".to_string();
    let expect = evaluate_build(tables, &alt).target_value;
    let got = session.evaluate(&alt).target_value;
    assert_eq!(got.to_bits(), expect.to_bits());
    let mut best = f64::INFINITY;
    for _ in 0..9 {
        let start = Instant::now();
        for _ in 0..200 {
            std::hint::black_box(session.evaluate(&req));
            std::hint::black_box(session.evaluate(&alt));
        }
        best = best.min(start.elapsed().as_nanos() as f64 / 400.0 / 1000.0);
    }
    println!("session shardBuild1 swap-target: best={best:.3}µs");
}
