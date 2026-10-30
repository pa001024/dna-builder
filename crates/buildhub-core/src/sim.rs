//! Time-series trace (spec §9.9).
//!
//! `trace` is a single engine primitive: it advances a pack state over a pack-provided time grid
//! and projects one `Sample` per frame. It knows nothing about what the state means. `simulate`
//! is not a second primitive — it is `trace` projected to its last frame (§9.9.6, Q19).

use alloc::{format, string::{String, ToString}, vec, vec::Vec};
use alloc::rc::Rc;

use crate::eval::{EResult, EvalError, Frame as EvalFrame, Host, Interp};
use crate::sym::Sym;
use crate::value::{Dist, Value};

#[derive(Clone, Debug)]
pub struct TraceOptions {
    /// `expect` (per-frame single value) or `trace` (per-frame mean + interval).
    pub mode: TraceMode,
    pub max_support: usize,
    pub split: bool,
    pub quantile: f64,
    pub states: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TraceMode {
    Expect,
    Trace,
}

impl Default for TraceOptions {
    fn default() -> Self {
        Self { mode: TraceMode::Expect, max_support: 256, split: false, quantile: 0.1, states: Vec::new() }
    }
}

/// Per-frame statistics for one numeric quantity (§9.9.8: mean, quantile band, extrema).
#[derive(Clone, Debug, Default)]
pub struct Summary {
    pub mean: f64,
    pub lo: f64,
    pub hi: f64,
    pub min: f64,
    pub max: f64,
}

#[derive(Clone, Debug)]
pub struct Frame {
    pub t: f64,
    pub total: Summary,
    pub per_dim: Vec<(Sym, Summary)>,
    pub states: Vec<(Sym, Summary)>,
}

#[derive(Clone, Debug, Default)]
pub struct Branches {
    pub paths: f64,
    pub support: usize,
    pub truncated: bool,
}

#[derive(Clone, Debug)]
pub struct TraceResult {
    pub frames: Vec<Frame>,
    pub cumulative: Vec<(f64, Summary)>,
    pub summary: Summary,
    pub bounds: (f64, f64),
    pub branches: Branches,
    pub dimensions: Vec<Sym>,
    pub partition: bool,
}

/// Run `trace(state, steps, step, probe)` where every argument is a program value.
pub fn run(
    interp: &dyn Host,
    init: &Value,
    steps: &[f64],
    step_fn: &Value,
    probe_fn: &Value,
    opts: &TraceOptions,
) -> EResult<TraceResult> {
    let mut state = Dist::One(init.clone());
    let mut frames: Vec<Frame> = Vec::new();
    let mut support_total = 0usize;
    let mut truncated = false;
    for &t in steps {
        // Advance: state' = step(state, t). The state itself may carry a distribution, which is
        // what keeps choices correlated across frames (§9.9.7).
        state = interp.call_value(Dist::One(step_fn.clone()), vec![state, Dist::One(Value::Num(t))])?;
        if !state.is_one() {
            let trimmed = interp.trim(state.clone())?;
            support_total = support_total.max(trimmed.len());
            truncated |= interp.was_truncated();
            if trimmed.len() > opts.max_support {
                return Err(EvalError::new(
                    "BHC-E361",
                    format!("trace support {} exceeds max_support {}", trimmed.len(), opts.max_support),
                ));
            }
        }
        let sample = interp.call_value(Dist::One(probe_fn.clone()), vec![state.clone()])?;
        frames.push(project_frame(interp, sample, t, opts)?);
    }
    let dims: Vec<Sym> = frames
        .iter()
        .flat_map(|f| f.per_dim.iter().map(|(d, _)| *d))
        .collect();
    let mut dims_unique: Vec<Sym> = Vec::new();
    for d in dims {
        if !dims_unique.contains(&d) {
            dims_unique.push(d);
        }
    }
    // `cumulative` is the prefix sum of `strip` (§9.9.14: no re-evaluation).
    let mut cumulative = Vec::with_capacity(frames.len());
    let mut acc = Summary::default();
    for f in &frames {
        acc = add_summary(&acc, &f.total);
        cumulative.push((f.t, acc.clone()));
    }
    let summary = acc;
    // `bounds` covers the whole interval, so it must contain both the per-frame extrema and the
    // cumulative summary (§9.9.12: `bounds` is the interval's worst/best case).
    let mut min = f64::INFINITY;
    let mut max = f64::NEG_INFINITY;
    for f in &frames {
        min = min.min(f.total.min);
        max = max.max(f.total.max);
    }
    for (_, s) in &cumulative {
        min = min.min(s.min);
        max = max.max(s.max);
    }
    if frames.is_empty() {
        min = 0.0;
        max = 0.0;
    }
    min = min.min(summary.min);
    max = max.max(summary.max);
    let paths = frames.iter().map(|f| f.total.max - f.total.min).sum::<f64>();
    Ok(TraceResult {
        frames,
        cumulative,
        summary,
        bounds: (min, max),
        branches: Branches { paths, support: support_total, truncated },
        dimensions: dims_unique,
        partition: false,
    })
}

fn project_frame(interp: &dyn Host, sample: Dist, t: f64, opts: &TraceOptions) -> EResult<Frame> {
    let pts = interp.trim(sample)?;
    // One probe value per support point; each is a Sample record.
    let mut total_pts: Vec<(f64, f64)> = Vec::new();
    let mut dim_pts: Vec<(Sym, f64, f64)> = Vec::new();
    let mut state_pts: Vec<(Sym, f64, f64)> = Vec::new();
    for p in &pts {
        let rec = match &p.v {
            Value::Record(r) => r,
            other => {
                return Err(EvalError::new(
                    "BHC-E362",
                    format!("probe must return a Sample record, got {}", other.type_name()),
                ))
            }
        };
        let total_sym = interp.interner().find("total").ok_or_else(|| EvalError::new("BHC-E363", "missing `total`"))?;
        let total = match rec.get(total_sym) {
            Some(v) => crate::eval::num_of(v).ok_or_else(|| EvalError::new("BHC-E364", "`total` must be a Num"))?,
            None => 0.0,
        };
        total_pts.push((p.w, total));
        if opts.split {
            if let Some(Value::Record(dr)) = interp.interner().find("per_dim").and_then(|s| rec.get(s)) {
                for (k, v) in &dr.fields {
                    dim_pts.push((*k, p.w, crate::eval::num_of(v).unwrap_or(0.0)));
                }
            }
        }
        for name in &opts.states {
            if let Some(s) = interp.interner().find(name) {
                if let Some(Value::Record(sr)) = rec.get(interp.interner().find("state").unwrap_or(s)) {
                    if let Some(v) = sr.get(s) {
                        state_pts.push((s, p.w, crate::eval::num_of(v).unwrap_or(0.0)));
                    }
                }
            }
        }
    }
    let total = summarize(&total_pts, opts.quantile);
    let mut per_dim: Vec<(Sym, Summary)> = Vec::new();
    let mut seen: Vec<Sym> = Vec::new();
    for (d, _, _) in &dim_pts {
        if seen.contains(d) {
            continue;
        }
        seen.push(*d);
        let pts: Vec<(f64, f64)> = dim_pts
            .iter()
            .filter(|(dd, _, _)| dd == d)
            .map(|(_, w, v)| (*w, *v))
            .collect();
        per_dim.push((*d, summarize(&pts, opts.quantile)));
    }
    let mut states: Vec<(Sym, Summary)> = Vec::new();
    let mut seen_s: Vec<Sym> = Vec::new();
    for (d, _, _) in &state_pts {
        if seen_s.contains(d) {
            continue;
        }
        seen_s.push(*d);
        let pts: Vec<(f64, f64)> = state_pts.iter().filter(|(dd, _, _)| dd == d).map(|(_, w, v)| (*w, *v)).collect();
        states.push((*d, summarize(&pts, opts.quantile)));
    }
    Ok(Frame { t, total, per_dim, states })
}

/// Weighted statistics over support points (§9.9.8).
fn summarize(pts: &[(f64, f64)], quantile: f64) -> Summary {
    if pts.is_empty() {
        return Summary::default();
    }
    let mut mean = 0.0;
    let mut wsum = 0.0;
    for (w, v) in pts {
        mean += w * v;
        wsum += w;
    }
    if wsum > 0.0 {
        mean /= wsum;
    }
    let mut sorted: Vec<(f64, f64)> = pts.to_vec();
    sorted.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(core::cmp::Ordering::Equal));
    let q = |target: f64| -> f64 {
        let mut acc = 0.0;
        for (w, v) in &sorted {
            acc += w;
            if acc >= target {
                return *v;
            }
        }
        sorted.last().map(|x| x.1).unwrap_or(0.0)
    };
    Summary {
        mean,
        lo: q(quantile.max(0.0)),
        hi: q((1.0 - quantile).min(1.0)),
        min: sorted.first().map(|x| x.1).unwrap_or(0.0),
        max: sorted.last().map(|x| x.1).unwrap_or(0.0),
    }
}

fn add_summary(a: &Summary, b: &Summary) -> Summary {
    Summary {
        mean: a.mean + b.mean,
        lo: a.lo + b.lo,
        hi: a.hi + b.hi,
        min: a.min + b.min,
        max: a.max + b.max,
    }
}

/// `simulate(s0, steps, step)` = the last frame's state (§9.9.6).
pub fn simulate(interp: &Interp, init: &Value, steps: &[f64], step_fn: &Value) -> EResult<Value> {
    let mut state = Dist::One(init.clone());
    for &t in steps {
        state = interp.call_value(Dist::One(step_fn.clone()), vec![state, Dist::One(Value::Num(t))])?;
    }
    interp.project(state)
}

/// Convert a trace result to the JSON shape of §9.9.12.
pub fn to_json(interp: &dyn Host, r: &TraceResult, opts: &TraceOptions) -> String {
    fn summary_json(s: &Summary) -> String {
        format!(
            "{{\"mean\":{},\"lo\":{},\"hi\":{},\"min\":{},\"max\":{}}}",
            fmt(s.mean),
            fmt(s.lo),
            fmt(s.hi),
            fmt(s.min),
            fmt(s.max)
        )
    }
    fn fmt(x: f64) -> String {
        if x.is_finite() { format!("{x:?}") } else { "null".to_string() }
    }
    let mut s = String::from("{\"ok\":true,\"mode\":\"");
    s.push_str(if opts.mode == TraceMode::Trace { "trace" } else { "expect" });
    s.push_str("\",\"frames\":");
    s.push_str(&r.frames.len().to_string());
    s.push_str(",\"dimensions\":[");
    s.push_str(
        &r.dimensions
            .iter()
            .map(|d| crate::diag::json_str(interp.interner().name(*d)))
            .collect::<Vec<_>>()
            .join(","),
    );
    s.push_str(&format!("],\"partition\":{},\"summary\":{{\"total\":{}}}", r.partition, summary_json(&r.summary)));
    s.push_str(",\"strip\":[");
    for (i, f) in r.frames.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!("{{\"t\":{},\"total\":{}", fmt(f.t), summary_json(&f.total)));
        if opts.split {
            s.push_str(",\"per_dim\":{");
            for (j, (d, st)) in f.per_dim.iter().enumerate() {
                if j > 0 {
                    s.push(',');
                }
                s.push_str(&format!("{}:{}", crate::diag::json_str(interp.interner().name(*d)), summary_json(st)));
            }
            s.push('}');
        }
        s.push('}');
    }
    s.push_str("],\"cumulative\":[");
    for (i, (t, st)) in r.cumulative.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!("{{\"t\":{},\"total\":{}}}", fmt(*t), summary_json(st)));
    }
    s.push_str(&format!(
        "],\"bounds\":{{\"total\":{{\"lo\":{},\"hi\":{}}}}},\"branches\":{{\"support\":{},\"truncated\":{}}}}}",
        fmt(r.bounds.0),
        fmt(r.bounds.1),
        r.branches.support,
        r.branches.truncated
    ));
    s
}

/// Build the default time grid: `from + i*dt` while `< to` (§9.9.13).
pub fn grid(from: f64, to: f64, dt: f64) -> Vec<f64> {
    let mut out = Vec::new();
    if dt <= 0.0 {
        return out;
    }
    let mut v = from;
    while v < to && out.len() < 1_000_000 {
        out.push(v);
        v += dt;
    }
    out
}

/// Build a `Sample` record from a probe result (used by the CLI and tests).
pub fn sample_record(interp: &dyn Host, total: f64, per_dim: Vec<(Sym, f64)>, state: Vec<(Sym, f64)>) -> Value {
    let mut rec = crate::value::Record::new();
    rec.set(interp.interner().find("total").unwrap_or(Sym(0)), Value::Num(total));
    let mut dr = crate::value::Record::new();
    for (k, v) in per_dim {
        dr.set(k, Value::Num(v));
    }
    rec.set(interp.interner().find("per_dim").unwrap_or(Sym(0)), Value::record(dr));
    let mut sr = crate::value::Record::new();
    for (k, v) in state {
        sr.set(k, Value::Num(v));
    }
    rec.set(interp.interner().find("state").unwrap_or(Sym(0)), Value::record(sr));
    Value::record(rec)
}

/// Helper so the CLI can build a step function from a pack entry.
pub fn value_of_entry(_interp: &Interp, fn_id: usize) -> Value {
    Value::Closure(Rc::new(crate::value::Closure { fn_id, upvalues: Vec::new(), fast: Vec::new() }))
}

impl Interp<'_> {
    /// Evaluate `fn_id` with a single argument value.
    pub fn call_one(&self, fn_id: usize, arg: Value) -> EResult<Dist> {
        self.call(fn_id, vec![arg])
    }

    /// Evaluate a frame body directly (used by `trace` when the pack hands over a function value).
    pub fn frame_probe(&self, probe: &Value, state: Dist) -> EResult<Dist> {
        self.call_value(Dist::One(probe.clone()), vec![state])
    }

    /// Blank frame for helper construction.
    pub fn empty_frame(&self, n: usize) -> EvalFrame {
        EvalFrame::new(n)
    }
}
