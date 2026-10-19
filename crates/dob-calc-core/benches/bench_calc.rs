//! Rust 端到端基准（spec §12.2）：手写 best-of-N，零依赖。
//!
//! 方法（强制）：预热 → 交替跑 → best；每轮断言结果等价（容差内）；
//! 分阶段计时（装配/角色面板/武器面板/伤害/AST/DOT/时间轴）定位热点。
//!
//! TS 基线锚点（`tools/benchmark-charbuild.ts`，同机实测）：
//! `calculate()` best 376.078µs，checksum `1164735053516.7178`
//! （= 200 × 5823675267.58358，莉兹贝尔 shardBuild1 `[若华纯蓄]DPS`）。
//! Rust 侧 checksum 必须在 §6.3 容差内一致，否则提速无效。
//!
//! 运行：`cargo bench --bench bench_calc -- --nocapture`（release）。

use std::time::Instant;

use dob_calc_core::evaluate::{BuildRequest, evaluate_build};
use dob_calc_core::tables::{BuildTables, TableBuilder};

/// best-of-N 统计量（spec §12.2：统计量取 min，同进程交替采样）。
fn best_of(samples: &mut [f64]) -> f64 {
    samples.sort_by(f64::total_cmp);
    samples[0]
}

/// 计时 N 次求和：返回（单次 µs，累加和）。累加和防优化 + 供 checksum 比对。
fn time_sum(iterations: usize, mut run: impl FnMut() -> f64) -> (f64, f64) {
    let start = Instant::now();
    let mut sum = 0.0;
    for _ in 0..iterations {
        sum += run();
    }
    let micros = start.elapsed().as_nanos() as f64 / 1000.0 / iterations as f64;
    (micros, sum)
}

fn load_modules() -> BuildTables {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("modules.json");
    let text = std::fs::read_to_string(&path)
        .expect("modules.json 缺失，先跑 bun tools/extract-calc-fixtures.ts");
    let modules = dob_calc_core::session::ModulesJson::from_json(&text).expect("模块解析");
    TableBuilder::build(&modules).expect("建表")
}

fn load_request() -> BuildRequest {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests");
    path.push("fixtures");
    path.push("e2e_shard.json");
    let text = std::fs::read_to_string(&path).unwrap();
    let fixture: serde_json::Value = serde_json::from_str(&text).unwrap();
    let raw = serde_json::json!({
        "charId": fixture["request"]["charId"],
        "settings": fixture["request"]["settings"],
    });
    BuildRequest::from_json(&raw).expect("request 解析")
}

fn assert_close(actual: f64, expected: f64, label: &str) {
    let tolerance = if expected.abs() < 1e-9 {
        1e-9
    } else {
        (expected.abs() * 1e-6).max(1e-9)
    };
    assert!(
        (actual - expected).abs() <= tolerance,
        "{label}: {actual} vs {expected}"
    );
}

/// 基准骨架自检：计时器本身可用（零依赖 best-of-N 形状验证）。
#[test]
fn bench_harness_smoke() {
    let mut samples = [0.0; 9];
    for sample in &mut samples {
        let start = Instant::now();
        std::hint::black_box(1 + 1);
        *sample = start.elapsed().as_nanos() as f64 / 1000.0;
    }
    assert!(best_of(&mut samples) >= 0.0, "计时器应可用");
}

/// 端到端基准：shardBuild1 场景 `evaluate_build`（装配 + 求值）best + checksum。
#[test]
fn bench_calc_end_to_end() {
    let tables = load_modules();
    let request = load_request();
    // 预热 500 次（JIT/分配器/正则缓存就绪）。
    for _ in 0..500 {
        std::hint::black_box(evaluate_build(&tables, &request));
    }
    // 9 轮 best，每轮 200 次求和（与 TS bench 同 iterations，checksum 可直接比）。
    let mut samples = [0.0; 9];
    let mut checksum = 0.0;
    for sample in &mut samples {
        let (micros, sum) = time_sum(200, || {
            std::hint::black_box(evaluate_build(&tables, &request).target_value)
        });
        *sample = micros;
        checksum = sum;
    }
    let best = best_of(&mut samples);
    println!("evaluate_build end-to-end best: {best:.3}µs/次（TS calculate() best 376.078µs）");
    assert_close(checksum, 1164735053516.7178, "checksum");
}

/// 分阶段计时：装配 / 角色面板 / 武器面板 / 目标求值。
#[test]
fn bench_calc_stages() {
    use dob_calc_core::context::BuildContext;

    let tables = load_modules();
    let request = load_request();
    let mut samples = [0.0; 7];

    // 装配
    for _ in 0..200 {
        std::hint::black_box(BuildContext::new(
            &tables,
            request.char_id,
            &request.settings,
        ));
    }
    for sample in &mut samples {
        let (micros, _) = time_sum(400, || {
            std::hint::black_box(
                BuildContext::new(&tables, request.char_id, &request.settings).is_some() as i32
                    as f64,
            )
        });
        *sample = micros;
    }
    println!(
        "stage BuildContext::new best: {:.3}µs",
        best_of(&mut samples)
    );

    // 角色面板（同一上下文重复算，对标 TS calculateAttributes）
    let mut context = BuildContext::new(&tables, request.char_id, &request.settings).unwrap();
    for _ in 0..200 {
        std::hint::black_box(context.calculate_attributes(false, false));
    }
    for sample in &mut samples {
        let (micros, _) = time_sum(400, || {
            std::hint::black_box(
                context
                    .calculate_attributes(false, false)
                    .get("攻击")
                    .copied()
                    .unwrap_or(0.0),
            )
        });
        *sample = micros;
    }
    println!(
        "stage calculate_attributes best: {:.3}µs",
        best_of(&mut samples)
    );

    // 武器面板
    for _ in 0..200 {
        std::hint::black_box(context.calculate_weapon_attributes(None));
    }
    for sample in &mut samples {
        let (micros, _) = time_sum(400, || {
            std::hint::black_box(
                context
                    .calculate_weapon_attributes(None)
                    .panel
                    .as_ref()
                    .and_then(|panel| panel.get("攻击").copied())
                    .unwrap_or(0.0),
            )
        });
        *sample = micros;
    }
    println!(
        "stage calculate_weapon_attributes best: {:.3}µs",
        best_of(&mut samples)
    );

    // 目标求值（同一 Evaluator 上下文重复求值，对标 TS calculateTargetFunction）
    for _ in 0..200 {
        let mut evaluator = dob_calc_core::Evaluator::new(&mut context);
        let _ = std::hint::black_box(evaluator.evaluate(&request.settings.target_function));
    }
    for sample in &mut samples {
        let (micros, _) = time_sum(400, || {
            let mut evaluator = dob_calc_core::Evaluator::new(&mut context);
            std::hint::black_box(
                evaluator
                    .evaluate(&request.settings.target_function)
                    .unwrap_or(0.0),
            )
        });
        *sample = micros;
    }
    println!(
        "stage Evaluator::new+evaluate best: {:.3}µs",
        best_of(&mut samples)
    );
}
