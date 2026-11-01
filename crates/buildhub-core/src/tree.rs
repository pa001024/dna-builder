//! Outcome tree (§9.8.5) and time-series trace (§9.9).
//!
//! Both are **projections of the same evaluation**: the tree groups the support points recorded by
//! `choice` instances, and `trace` advances a pack state over a pack-provided time grid. Neither
//! re-evaluates the pack with different arithmetic, so `tree.root.value == call(...)` holds by
//! construction (§9.8.11).


use alloc::{format, string::{String, ToString}, vec, vec::Vec};
use crate::eval::{EResult, EvalError, Host};
use crate::value::Dist;
use crate::value::{Assign, Pt, Value};

#[derive(Clone, Debug)]
pub struct TreeNode {
    pub label: String,
    pub value: f64,
    /// `leaf` | `cond` | `uncond` (spec §9.8.5 `value_kind`).
    pub value_kind: &'static str,
    /// Conditional probability relative to the parent.
    pub edge: f64,
    /// Cumulative probability from the root.
    pub prob: f64,
    pub truncated: bool,
    pub children: Vec<TreeNode>,
}

#[derive(Clone, Debug)]
pub struct Outcome {
    pub root: TreeNode,
    pub truncated: bool,
    pub support: usize,
}

/// Build the outcome tree for an already-evaluated distribution.
///
/// Takes any executor behind `&dyn Host`, so the tree walk and the bytecode VM share one
/// projection (spec §9.8.11: `tree.root.value == call(...)` by construction, on every path).
pub fn build_tree(host: &dyn Host, d: Dist, label: &str) -> EResult<Outcome> {
    let pts = host.trim(d)?;
    let truncated = host.was_truncated();
    let support = pts.len();
    if pts.len() == 1 && pts[0].assigns.is_empty() {
        let v = num_of_of(&pts[0].v)?;
        return Ok(Outcome {
            root: TreeNode {
                label: label.to_string(),
                value: v,
                value_kind: "uncond",
                edge: 1.0,
                prob: 1.0,
                truncated: false,
                children: Vec::new(),
            },
            truncated,
            support,
        });
    }
    // The tree keeps one node per distinct *branch assignment* (a world), because the tree's job is
    // to show which branches were taken (§9.8.3). Cost, in contrast, is budgeted on distinct
    // *values* (`Dist::support_len`), which is why a stateful chain with 32 worlds still costs 6
    // (§9.8.12.2). Merging worlds here would erase the correlation structure G13 asserts.
    let mut groups: Vec<(f64, Vec<&Pt>)> = Vec::new();
    let mut labels: Vec<String> = Vec::new();
    for p in &pts {
        match groups.iter().position(|(_, m)| same_assigns(&m[0].assigns, &p.assigns)) {
            Some(i) => groups[i].1.push(p),
            None => {
                labels.push(label_of(host, &p.assigns));
                groups.push((0.0, vec![p]));
            }
        }
    }
    // The root value is the expectation over all support points: identical to `call` (§9.8.11).
    let mut root_value = 0.0;
    for p in &pts {
        root_value += p.w * num_of_of(&p.v)?;
    }
    let mut children = Vec::with_capacity(groups.len());
    for (i, (_k, members)) in groups.iter().enumerate() {
        let w: f64 = members.iter().map(|p| p.w).sum();
        let mut vals = 0.0;
        for p in members {
            vals += p.w * num_of_of(&p.v)?;
        }
        let cond = if w > 0.0 { vals / w } else { 0.0 };
        children.push(TreeNode {
            label: labels[i].clone(),
            value: cond,
            value_kind: "cond",
            edge: w,
            prob: w,
            truncated: false,
            children: Vec::new(),
        });
    }
    Ok(Outcome {
        root: TreeNode {
            label: label.to_string(),
            value: root_value,
            value_kind: "uncond",
            edge: 1.0,
            prob: 1.0,
            truncated,
            children,
        },
        truncated,
        support,
    })
}

fn label_of(host: &dyn Host, assigns: &[Assign]) -> String {
    // Read the recorded label of the deepest assignment in this path.
    let choices = host.choice_traces();
    let mut out: Vec<String> = Vec::new();
    for a in assigns {
        let found = choices.iter().rfind(|c| c.site == a.choice && c.branch == a.branch);
        let text = match found.and_then(|c| c.label) {
            Some(l) => host.interner().name(l).to_string(),
            None => format!("#{}", a.branch),
        };
        if !out.contains(&text) {
            out.push(text);
        }
    }
    if out.is_empty() { "<none>".to_string() } else { out.join(" / ") }
}

fn same_assigns(a: &[Assign], b: &[Assign]) -> bool {
    a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| x.choice == y.choice && x.branch == y.branch)
}

fn num_of_of(v: &Value) -> EResult<f64> {
    crate::eval::num_of(v).ok_or_else(|| {
        EvalError::new(
            "BHC-E360",
            format!("outcome trees need numeric results, got {}", v.type_name()),
        )
    })
}

