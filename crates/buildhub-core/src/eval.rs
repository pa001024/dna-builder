//! Tree-walking evaluator (spec §9.5 path T) with support-set propagation (§9.8.2.2).

use alloc::{boxed::Box, format, string::{String, ToString}, vec, vec::Vec};
use core::cell::{Cell, RefCell};
use hashbrown::HashMap;
use alloc::rc::Rc;

use crate::ast::{BinOp, Pattern, UnOp};
use crate::diag::Pos;
use crate::ir::*;
use crate::sym::{Interner, Sym};
use crate::value::*;

#[derive(Clone, Copy, Debug)]
pub struct Budget {
    pub fuel: u64,
    pub depth: u32,
    pub len_limit: usize,
    pub max_support: usize,
}

impl Default for Budget {
    fn default() -> Self {
        Self { fuel: 2_000_000, depth: 64, len_limit: 65_536, max_support: 256 }
    }
}

#[derive(Debug)]
pub struct EvalError {
    pub code: &'static str,
    pub message: String,
}

impl EvalError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

impl core::fmt::Display for EvalError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl core::error::Error for EvalError {}

pub type EResult<T> = Result<T, EvalError>;

/// Everything the builtin table needs from an executor.
///
/// Both executors (tree walk and bytecode, spec §9.5) implement this, so `builtins::call` is a
/// single implementation of the instruction semantics — the structural guarantee behind G4.
pub trait Host {
    fn interner(&self) -> &Interner;
    /// A register file of `n` slots, all `Unit`.
    ///
    /// The AOT artifact allocates one per call; at ~1e5 calls per evaluation that dominates, so
    /// executors that can pool do. The default keeps the allocator's behaviour.
    fn alloc_regs(&self, n: usize) -> Vec<Dist> {
        vec![Dist::One(Value::Unit); n]
    }
    /// Return a register file obtained from `alloc_regs`.
    fn free_regs(&self, _regs: Vec<Dist>) {}
    fn budget(&self) -> Budget;
    fn call_value(&self, callee: Dist, args: Vec<Dist>) -> EResult<Dist>;
    /// Apply a function value to already-evaluated arguments.
    ///
    /// Higher-order builtins call the closure once per element; going through `call_value` makes
    /// them build a `Vec<Dist>` every time. Executors that can apply plain values override this.
    fn call_plain(&self, f: &Value, args: &[Value]) -> EResult<Dist> {
        let ds: Vec<Dist> = args.iter().cloned().map(Dist::One).collect();
        self.call_value(Dist::One(f.clone()), ds)
    }
    fn mark_truncated(&self);
    fn was_truncated(&self) -> bool;
    /// Support-set projection shared by both executors (spec §9.8.4 budget behaviour).
    fn trim(&self, d: Dist) -> EResult<Vec<Pt>>;
    fn show_value(&self, v: &Value) -> String;
    /// Allocate a `choice` instance id (§9.8.2: the identity is the evaluation site).
    fn begin_choice(&self) -> u32;
    /// Record a branch for the outcome tree (§9.8.5).
    fn record_choice(&self, site: u32, branch: u32, p: f64, label: Option<Sym>);
    /// Data sets bound to the running program (spec §4.2).
    fn sets(&self) -> &[crate::ir::DataSet];
}

/// One recorded `choice` instantiation, used to build the outcome tree (§9.8.5).
#[derive(Clone, Debug)]
pub struct ChoiceTrace {
    pub site: u32,
    pub branch: u32,
    pub p: f64,
    pub label: Option<Sym>,
}

pub struct Frame {
    pub slots: Vec<Value>,
}

impl Frame {
    pub fn new(n: usize) -> Self {
        Self { slots: vec![Value::Unit; n] }
    }
    fn get(&self, slot: u32) -> Value {
        self.slots.get(slot as usize).cloned().unwrap_or(Value::Unit)
    }
    fn set(&mut self, slot: u32, v: Value) {
        if let Some(s) = self.slots.get_mut(slot as usize) {
            *s = v;
        }
    }
}

/// Free list of frame slot vectors.
///
/// A call used to allocate its `Vec<Value>` every time; at ~1e5 calls per evaluation that was the
/// largest allocation source. Buffers come back on exit, so after the first evaluation the pool
/// holds exactly as many vectors as the deepest call chain needs.
#[derive(Default)]
pub struct FramePool {
    free: core::cell::RefCell<Vec<Vec<Value>>>,
}

impl FramePool {
    fn take(&self, n: usize) -> Vec<Value> {
        match self.free.borrow_mut().pop() {
            Some(mut v) => {
                v.clear();
                v.resize(n, Value::Unit);
                v
            }
            None => vec![Value::Unit; n],
        }
    }

    fn take_like(&self, src: &[Value]) -> Vec<Value> {
        match self.free.borrow_mut().pop() {
            Some(mut v) => {
                v.clear();
                v.extend_from_slice(src);
                v
            }
            None => src.to_vec(),
        }
    }

    fn put(&self, v: Vec<Value>) {
        let mut free = self.free.borrow_mut();
        if free.len() < 256 {
            free.push(v);
        }
    }
}

pub struct Interp<'a> {
    pub prog: &'a Program,
    pub interner: &'a Interner,
    pub budget: Budget,
    pub fuel: Cell<u64>,
    pub depth: Cell<u32>,
    pub frames: FramePool,
    regs_pool: RefCell<Vec<Vec<Dist>>>,
    pub memo: RefCell<HashMap<(usize, u64), Value>>,
    pub memo_on: Cell<bool>,
    next_choice: Cell<u32>,
    pub choices: RefCell<Vec<ChoiceTrace>>,
    pub truncated: Cell<bool>,
    /// Recording sink for `explain` (spec §6.2); `None` on the normal path so it costs nothing.
    pub explain: Option<RefCell<ExplainLog>>,
}

#[derive(Default)]
pub struct ExplainLog {
    pub entries: Vec<ExplainEntry>,
}

pub struct ExplainEntry {
    pub depth: usize,
    pub call: String,
    pub result: String,
}

impl<'a> Interp<'a> {
    pub fn new(prog: &'a Program, interner: &'a Interner, budget: Budget) -> Self {
        Self {
            prog,
            interner,
            budget,
            fuel: Cell::new(budget.fuel),
            depth: Cell::new(0),
            frames: FramePool::default(),
            regs_pool: RefCell::new(Vec::new()),
            memo: RefCell::new(HashMap::new()),
            memo_on: Cell::new(true),
            next_choice: Cell::new(0),
            choices: RefCell::new(Vec::new()),
            truncated: Cell::new(false),
            explain: None,
        }
    }

    pub fn with_explain(mut self) -> Self {
        self.explain = Some(RefCell::new(ExplainLog::default()));
        self
    }

    fn record(&self, name: &str, args: &str, result: &str) {
        if let Some(log) = &self.explain {
            log.borrow_mut().entries.push(ExplainEntry {
                depth: self.depth.get() as usize,
                call: if args.is_empty() { name.to_string() } else { format!("{name}({args})") },
                result: result.to_string(),
            });
        }
    }

    pub fn reset(&self) {
        self.fuel.set(self.budget.fuel);
        self.depth.set(0);
        self.memo.borrow_mut().clear();
        self.next_choice.set(0);
        self.choices.borrow_mut().clear();
        self.truncated.set(false);
    }

    /// Call a program function by index with already-evaluated arguments.
    pub fn call(&self, fn_id: usize, args: Vec<Value>) -> EResult<Dist> {
        let def = self
            .prog
            .fns
            .get(fn_id)
            .ok_or_else(|| EvalError::new("BHC-E328", format!("unknown function id {fn_id}")))?;
        let mut frame = Frame { slots: self.frames.take(def.nslots as usize) };
        let base = def.ncaptures;
        let argpreview = if self.explain.is_some() {
            args.iter().map(|a| self.show(a)).collect::<Vec<_>>().join(", ")
        } else {
            String::new()
        };
        for (i, a) in args.into_iter().enumerate() {
            frame.set((base + i) as u32, a);
        }
        let name = def.name.clone();
        self.enter(&name)?;
        let out = self.eval(&def.body, &mut frame);
        self.leave();
        if self.explain.is_some() {
            let shown = match &out {
                Ok(d) => match d.single() {
                    Some(v) => self.show(v),
                    None => format!("<{} support points>", d.as_ref_points().len()),
                },
                Err(e) => format!("<error {}>", e.code),
            };
            self.record(&name, &argpreview, &shown);
        }
        self.frames.put(frame.slots);
        out
    }

    fn enter(&self, name: &str) -> EResult<()> {
        let d = self.depth.get() + 1;
        if d > self.budget.depth {
            return Err(EvalError::new(
                "BHC-E301",
                format!("call depth exceeded inside `{name}` (limit {})", self.budget.depth),
            ));
        }
        self.depth.set(d);
        Ok(())
    }

    fn leave(&self) {
        self.depth.set(self.depth.get().saturating_sub(1));
    }

    fn burn(&self, n: u64) -> EResult<()> {
        let left = self.fuel.get();
        if left < n {
            return Err(EvalError::new("BHC-E300", "fuel exhausted (evaluation budget exceeded)"));
        }
        self.fuel.set(left - n);
        Ok(())
    }

    pub fn eval(&self, r: &R, frame: &mut Frame) -> EResult<Dist> {
        self.burn(1)?;
        Ok(match r {
            R::Const(v) => Dist::One(v.clone()),
            R::Local(slot) => Dist::One(frame.get(*slot)),
            R::CallStatic { fn_id, args } => {
                // Common path stays single-valued: collect the arguments straight into a
                // `Vec<Value>`. `Dist::points()` would allocate a `Vec<Pt>` (and an `Rc<Vec>`
                // for `assigns`) per argument, which dominated the call path.
                let mut plain: Vec<Value> = Vec::with_capacity(args.len());
                let mut dists: Option<Vec<Dist>> = None;
                for a in args {
                    let d = self.eval(a, frame)?;
                    if let Some(collected) = dists.as_mut() {
                        collected.push(d);
                        continue;
                    }
                    match d {
                        Dist::One(v) => plain.push(v),
                        other => {
                            // A multi-point argument appeared: keep what we have and switch to
                            // the per-trajectory form so inner choices stay independent.
                            let mut collected: Vec<Dist> = Vec::with_capacity(args.len());
                            collected.extend(plain.drain(..).map(Dist::One));
                            collected.push(other);
                            dists = Some(collected);
                        }
                    }
                }
                if let Some(vs) = dists {
                    let comb = combine_all(vs, |vs| Ok(Value::list(vs)))?;
                    Dist::chain(comb, |v| {
                        let plain = as_list(&v)?;
                        self.call(*fn_id, plain)
                    })?
                } else {
                    self.call(*fn_id, plain)?
                }
            }
            R::CallValue { callee, args } => {
                let c = self.eval(callee, frame)?;
                let mut vs = Vec::with_capacity(args.len());
                for a in args {
                    vs.push(self.eval(a, frame)?);
                }
                self.apply(c, vs)?
            }
            R::Builtin { b, args } => {
                // Builtins are the single largest cost in the tree walker (~37k calls per
                // evaluation). Specialise the arity so the common one- and two-argument calls
                // never materialise an array: every slot would otherwise be constructed even
                // when unused.
                match args.len() {
                    0 => crate::builtins::call(self, *b, Vec::new())?,
                    1 => {
                        let d0 = self.eval(&args[0], frame)?;
                        if let Dist::One(v0) = &d0 {
                            if let Some(r) = crate::builtins::call_plain(self, *b, core::slice::from_ref(v0)) {
                                return r.map(Dist::One);
                            }
                        }
                        crate::builtins::call(self, *b, vec![d0])?
                    }
                    2 => {
                        let d0 = self.eval(&args[0], frame)?;
                        let d1 = self.eval(&args[1], frame)?;
                        if let (Dist::One(v0), Dist::One(v1)) = (&d0, &d1) {
                            if let Some(r) = crate::builtins::call_plain(self, *b, &[v0.clone(), v1.clone()]) {
                                return r.map(Dist::One);
                            }
                        }
                        crate::builtins::call(self, *b, vec![d0, d1])?
                    }
                    3 => {
                        let d0 = self.eval(&args[0], frame)?;
                        let d1 = self.eval(&args[1], frame)?;
                        let d2 = self.eval(&args[2], frame)?;
                        if let (Dist::One(v0), Dist::One(v1), Dist::One(v2)) = (&d0, &d1, &d2) {
                            if let Some(r) = crate::builtins::call_plain(self, *b, &[v0.clone(), v1.clone(), v2.clone()]) {
                                return r.map(Dist::One);
                            }
                        }
                        crate::builtins::call(self, *b, vec![d0, d1, d2])?
                    }
                    _ => {
                        let mut vs = Vec::with_capacity(args.len());
                        for a in args {
                            vs.push(self.eval(a, frame)?);
                        }
                        crate::builtins::call(self, *b, vs)?
                    }
                }
            }
            R::Field { base, name } => {
                let b = self.eval(base, frame)?;
                b.try_map(|v| match v {
                    Value::Record(rec) => Ok(rec.get(*name).cloned().unwrap_or(Value::Missing)),
                    Value::Missing | Value::None => Ok(Value::Missing),
                    other => Err(EvalError::new(
                        "BHC-E310",
                        format!("field `{}` on {} value", self.interner.name(*name), other.type_name()),
                    )),
                })?
            }
            R::Index { base, idx } => {
                let b = self.eval(base, frame)?;
                let i = self.eval(idx, frame)?;
                Dist::join(b, i, |bv, iv| {
                    let n = num_of(&iv).ok_or_else(|| EvalError::new("BHC-E311", "index must be a Num"))?;
                    let i = n.max(0.0) as usize;
                    match bv {
                        Value::List(xs) | Value::Tuple(xs) => {
                            Ok(xs.get(i).cloned().unwrap_or(Value::Missing))
                        }
                        other => Err(EvalError::new("BHC-E312", format!("cannot index {}", other.type_name()))),
                    }
                })?
            }
            R::Record { schema, fields } => {
                let mut items: Vec<(Sym, Dist)> = Vec::with_capacity(fields.len());
                for (k, v) in fields {
                    items.push((*k, self.eval(v, frame)?));
                }
                let mut keys: Vec<Sym> = Vec::with_capacity(items.len());
                let mut ds: Vec<Dist> = Vec::with_capacity(items.len());
                for (k, d) in items {
                    keys.push(k);
                    ds.push(d);
                }
                let sid = *schema;
                combine_all(ds, move |vals| {
                    let mut rec = Record::new();
                    for (k, v) in keys.iter().zip(vals) {
                        rec.set(*k, v);
                    }
                    rec.schema = sid.map(|s| s as u32);
                    Ok(Value::record(rec))
                })?
            }
            R::List(items) => {
                let mut ds = Vec::with_capacity(items.len());
                for it in items {
                    ds.push(self.eval(it, frame)?);
                }
                combine_all(ds, |vals| Ok(Value::list(vals)))?
            }
            R::Tuple(items) => {
                let mut ds = Vec::with_capacity(items.len());
                for it in items {
                    ds.push(self.eval(it, frame)?);
                }
                combine_all(ds, |vals| Ok(Value::tuple(vals)))?
            }
            R::Some(v) => self.eval(v, frame)?.map(|x| Value::Some(Box::new(x))),
            R::None => Dist::One(Value::None),
            R::Ok(v) => self.eval(v, frame)?.map(|x| Value::Ok(Box::new(x))),
            R::Err(v) => self.eval(v, frame)?.map(|x| Value::Err(Box::new(x))),
            R::If { cond, then, els } => {
                let c = self.eval(cond, frame)?;
                Dist::chain(c, |v| {
                    if v.truthy() {
                        self.eval(then, frame)
                    } else {
                        self.eval(els, frame)
                    }
                })?
            }
            R::LetPat { pat, value, body } => {
                let v = self.eval(value, frame)?;
                Dist::chain(v, |val| {
                    let mut inner = Frame { slots: self.frames.take_like(&frame.slots) };
                    let r = bind_pattern(self, pat, &val, &mut inner)
                        .and_then(|_| self.eval(body, &mut inner));
                    self.frames.put(inner.slots);
                    r
                })?
            }
            R::Match { scrut, arms } => {
                let s = self.eval(scrut, frame)?;
                Dist::chain(s, |v| {
                    for arm in arms {
                        let mut inner = Frame { slots: self.frames.take_like(&frame.slots) };
                        if !bind_pattern(self, &arm.pat, &v, &mut inner)? {
                            self.frames.put(inner.slots);
                            continue;
                        }
                        if let Some(g) = &arm.guard {
                            let gv = self.eval(g, &mut inner)?;
                            match gv {
                                Dist::One(v) => {
                                    if !v.truthy() {
                                        self.frames.put(inner.slots);
                                        continue;
                                    }
                                }
                                Dist::Many(_) => {
                                    // Guard depends on a choice: keep only the worlds where it holds.
                                    let r = Dist::chain(gv, |x| {
                                        if x.truthy() {
                                            self.eval(&arm.body, &mut inner)
                                        } else {
                                            Ok(Dist::One(Value::Missing))
                                        }
                                    });
                                    self.frames.put(inner.slots);
                                    return r;
                                }
                            }
                        }
                        let r = self.eval(&arm.body, &mut inner);
                        self.frames.put(inner.slots);
                        return r;
                    }
                    Ok(Dist::One(Value::Missing))
                })?
            }
            R::Closure { fn_id, captures } => {
                let mut ds = Vec::with_capacity(captures.len());
                for c in captures {
                    ds.push(self.eval(c, frame)?);
                }
                let fid = *fn_id;
                combine_all(ds, move |vals| {
                    Ok(Value::Closure(Rc::new(Closure { fn_id: fid, upvalues: vals, fast: Vec::new() })))
                })?
            }
            R::Binary { op, lhs, rhs } => {
                let a = self.eval(lhs, frame)?;
                let b = self.eval(rhs, frame)?;
                if let (Dist::One(Value::Num(x)), Dist::One(Value::Num(y))) = (&a, &b) {
                    if let Some(v) = fast_binary_num(*op, *x, *y) {
                        return Ok(Dist::One(v));
                    }
                }
                Dist::join(a, b, |x, y| binary(*op, x, y))?
            }
            R::Unary { op, expr } => {
                let a = self.eval(expr, frame)?;
                a.try_map(|v| unary(*op, v))?
            }
            R::Choice { cases } => self.eval_choice(cases, frame)?,
            R::Expected(v) => {
                let d = self.eval(v, frame)?;
                Dist::One(d.expect()?)
            }
            R::Data { set, access } => self.eval_data(*set, access, frame)?,
            R::Host { name, args, .. } => {
                let mut ds = Vec::with_capacity(args.len());
                for a in args {
                    ds.push(self.eval(a, frame)?);
                }
                let name = *name;
                combine_all(ds, move |vals| self.call_host(name, &vals))?
            }
        })
    }

    fn eval_choice(&self, cases: &[ChoiceCase], frame: &mut Frame) -> EResult<Dist> {
        let mut weights = Vec::with_capacity(cases.len());
        let mut total = 0.0;
        for c in cases {
            let w = self.eval(&c.weight, frame)?;
            let w = match w.single() {
                Some(v) => num_of(v).ok_or_else(|| EvalError::new("BHC-E318", "choice weight must be a Num"))?,
                None => {
                    return Err(EvalError::new(
                        "BHC-E319",
                        "choice weight depends on another choice; hoist the outer choice",
                    ))
                }
            };
            // Zero-weight cases are rejected so "all weights zero" cannot hide (spec Q15).
            if !(w.is_finite() && w > 0.0) {
                return Err(EvalError::new(
                    "BHC-E320",
                    "choice weights must be finite and > 0 (zero-weight cases are rejected, spec Q15)",
                ));
            }
            total += w;
            weights.push(w);
        }
        let site = self.next_choice.get();
        self.next_choice.set(site + 1);
        let mut out = Vec::new();
        for (i, c) in cases.iter().enumerate() {
            let p = weights[i] / total;
            self.choices.borrow_mut().push(ChoiceTrace { site, branch: i as u32, p, label: c.label });
            let inner = self.eval(&c.value, frame)?;
            match inner {
                Dist::One(v) => out.push(Pt {
                    w: p,
                    assigns: Rc::new(vec![Assign { choice: site, branch: i as u32, p }]),
                    v,
                }),
                Dist::Many(ps) => {
                    for q in ps {
                        let mut assigns = q.assigns.to_vec();
                        assigns.push(Assign { choice: site, branch: i as u32, p });
                        assigns.sort_by_key(|a| a.choice);
                        out.push(Pt { w: p * q.w, assigns: Rc::new(assigns), v: q.v });
                    }
                }
            }
        }
        Ok(Dist::Many(out))
    }

    fn eval_data(&self, set: usize, access: &DataAccess, frame: &mut Frame) -> EResult<Dist> {
        let ds = &self.prog.data[set];
        Ok(match access {
            DataAccess::All => {
                if ds.rows.len() > self.budget.len_limit {
                    return Err(EvalError::new("BHC-E302", format!("data set `{}` exceeds len_limit", ds.name)));
                }
                Dist::One(Value::List(ds.rows.clone()))
            }
            DataAccess::Len => Dist::One(Value::Num(ds.rows.len() as f64)),
            DataAccess::ByKey(k) => {
                let kd = self.eval(k, frame)?;
                kd.try_map(|kv| {
                    let h = kv.hash();
                    Ok(match ds.index.get(&h) {
                        Some(i) => Value::Some(Box::new(ds.rows[*i].clone())),
                        None => Value::None,
                    })
                })?
            }
            DataAccess::ByIndex(i) => {
                let id = self.eval(i, frame)?;
                id.try_map(|iv| {
                    let n = num_of(&iv).ok_or_else(|| EvalError::new("BHC-E311", "by_index expects a Num"))?;
                    Ok(ds.rows.get(n.max(0.0) as usize).cloned().unwrap_or(Value::Missing))
                })?
            }
        })
    }

    /// Apply a function value. All operands are combined at one evaluation point so that shared
    /// `choice` instances stay correlated (§9.8.2).
    pub fn apply(&self, callee: Dist, args: Vec<Dist>) -> EResult<Dist> {
        let all_one = callee.is_one() && args.iter().all(|d| d.is_one());
        if all_one {
            let f = callee.single().cloned().expect("one");
            let vals: Vec<Value> = args.into_iter().map(|d| d.single().cloned().expect("one")).collect();
            return self.apply_plain(&f, &vals);
        }
        let mut parts = vec![callee];
        parts.extend(args);
        let comb = combine_all(parts, |mut vals| {
            let f = vals.remove(0);
            let rest = vals;
            Ok(Value::tuple(vec![f, Value::list(rest)]))
        })?;
        Dist::chain(comb, |v| match v {
            Value::Tuple(t) => {
                let f = t[0].clone();
                let args = as_list(&t[1])?;
                self.apply_plain(&f, &args)
            }
            other => Err(EvalError::new("BHC-E353", format!("bad call point {}", other.type_name()))),
        })
    }

    fn apply_plain(&self, f: &Value, args: &[Value]) -> EResult<Dist> {
        match f {
            Value::Closure(c) => self.invoke_plain(c.fn_id, c.upvalues.clone(), args),
            Value::Builtin(b) => {
                let b = self
                    .prog
                    .builtin_refs
                    .get(*b as usize)
                    .copied()
                    .ok_or_else(|| EvalError::new("BHC-E324", "builtin id out of range"))?;
                // The arguments are already plain values here; the general entry point would
                // re-wrap them into a `Vec<Dist>` just for the arm to unwrap them again.
                if let Some(v) = crate::builtins::call_plain(self, b, args) {
                    return v.map(Dist::One);
                }
                let ds = args.iter().cloned().map(Dist::One).collect();
                crate::builtins::call(self, b, ds)
            }
            other => Err(EvalError::new("BHC-E325", format!("cannot call a {} value", other.type_name()))),
        }
    }

    fn invoke_plain(&self, fn_id: usize, upvalues: Vec<Value>, args: &[Value]) -> EResult<Dist> {
        let def = self
            .prog
            .fns
            .get(fn_id)
            .ok_or_else(|| EvalError::new("BHC-E328", format!("unknown function id {fn_id}")))?;
        // Value-keyed memoisation (spec §6.1): pure functions with equal arguments are equal, so the
        // safety of this cache needs no declaration. Only single-valued results are cached, since a
        // distribution's meaning depends on the current choice counter.
        let memo_key = if self.memo_on.get() && upvalues.is_empty() {
            let mut h = 0xcbf29ce484222325u64;
            for a in args {
                a.hash_into(&mut h);
            }
            Some((fn_id, h))
        } else {
            None
        };
        if let Some(k) = memo_key {
            if let Some(v) = self.memo.borrow().get(&k) {
                return Ok(Dist::One(v.clone()));
            }
        }
        let mut frame = Frame { slots: self.frames.take(def.nslots as usize) };
        for (i, u) in upvalues.into_iter().enumerate() {
            frame.set(i as u32, u);
        }
        let base = def.ncaptures;
        for (i, a) in args.iter().enumerate() {
            frame.set((base + i) as u32, a.clone());
        }
        self.enter(&def.name)?;
        let out = self.eval(&def.body, &mut frame);
        self.leave();
        if let (Some(k), Ok(Dist::One(v))) = (memo_key, &out) {
            self.memo.borrow_mut().insert(k, v.clone());
        }
        self.frames.put(frame.slots);
        out
    }

    fn call_host(&self, name: Sym, args: &[Value]) -> EResult<Value> {
        match self.interner.name(name) {
            "rng.splitmix" => {
                let seed = args.first().and_then(num_of).unwrap_or(0.0);
                Ok(Value::Num(splitmix(seed.to_bits())))
            }
            other => Err(EvalError::new("BHC-E402", format!("host capability `{other}` is not implemented"))),
        }
    }

    pub fn show(&self, v: &Value) -> String {
        match v {
            Value::Num(n) => show_num(*n),
            Value::Bool(b) => b.to_string(),
            Value::Sym(s) => self.interner.name(*s).to_string(),
            Value::Unit => "()".to_string(),
            Value::Str(s) => s.to_string(),
            Value::List(xs) => {
                let mut s = String::from("[");
                for (i, x) in xs.iter().enumerate() {
                    if i > 0 {
                        s.push_str(", ");
                    }
                    s.push_str(&self.show(x));
                }
                s.push(']');
                s
            }
            Value::Tuple(xs) => {
                let mut s = String::from("(");
                for (i, x) in xs.iter().enumerate() {
                    if i > 0 {
                        s.push_str(", ");
                    }
                    s.push_str(&self.show(x));
                }
                s.push(')');
                s
            }
            Value::Record(r) => {
                let mut s = String::from("{");
                for (i, (k, v)) in r.fields.iter().enumerate() {
                    if i > 0 {
                        s.push_str(", ");
                    }
                    s.push_str(self.interner.name(*k));
                    s.push_str(": ");
                    s.push_str(&self.show(v));
                }
                s.push('}');
                s
            }
            Value::Closure(c) => format!("<fn:{}>", self.prog.fns.get(c.fn_id).map(|f| f.name.as_str()).unwrap_or("?")),
            Value::Builtin(_) => "<builtin>".to_string(),
            Value::Some(x) => format!("some({})", self.show(x)),
            Value::None => "none".to_string(),
            Value::Ok(x) => format!("ok({})", self.show(x)),
            Value::Err(x) => format!("err({})", self.show(x)),
            Value::Missing => "<missing>".to_string(),
        }
    }

    /// Final projection: expectation at the top-level exit only (§9.8.11).
    pub fn project(&self, d: Dist) -> EResult<Value> {
        // Single-valued results are the common case and need no support-set work at all;
        // `trim` would allocate a `Vec<Pt>` for nothing.
        if let Dist::One(v) = d {
            return Ok(v);
        }
        let pts = self.trim(d)?;
        if pts.len() == 1 {
            return Ok(pts[0].v.clone());
        }
        let mut sum = 0.0;
        for p in &pts {
            let n = num_of(&p.v).ok_or_else(|| {
                EvalError::new(
                    "BHC-E344",
                    format!("cannot project a {} support to one value; wrap with expected()", p.v.type_name()),
                )
            })?;
            sum += p.w * n;
        }
        Ok(Value::Num(canon(sum)))
    }

    /// Apply `max_support` (§9.8.4): the overflowing numeric tail merges into one `rest` point.
    pub fn trim(&self, d: Dist) -> EResult<Vec<Pt>> {
        // The budget is on distinct *values* (§9.8.4), not on distinct worlds: 5 stateful steps
        // produce 32 worlds but only 6 distinct states, and only the latter costs memory.
        let distinct = d.support_len();
        let pts = d.points();
        if distinct <= self.budget.max_support {
            return Ok(pts);
        }
        self.truncated.set(true);
        if !pts.iter().all(|p| matches!(p.v, Value::Num(_))) {
            return Err(EvalError::new(
                "BHC-E345",
                format!(
                    "support set of {distinct} distinct values exceeds max_support {} and holds non-numeric values",
                    self.budget.max_support
                ),
            ));
        }
        let keep = self.budget.max_support.saturating_sub(1).max(1);
        let mut head: Vec<Pt> = pts.iter().take(keep).cloned().collect();
        let tail = &pts[keep..];
        let w: f64 = tail.iter().map(|p| p.w).sum();
        if w > 0.0 {
            let mut mean = 0.0;
            for p in tail {
                mean += p.w * num_of(&p.v).unwrap_or(0.0);
            }
            head.push(Pt { w, assigns: Rc::new(Vec::new()), v: Value::Num(canon(mean / w)) });
        }
        Ok(head)
    }
}

/// Combine one distribution per operand, sharing correlated choice instances.
pub fn combine_all<F>(ds: Vec<Dist>, mut f: F) -> EResult<Dist>
where
    F: FnMut(Vec<Value>) -> EResult<Value>,
{
    if ds.is_empty() {
        return Ok(Dist::One(f(Vec::new())?));
    }
    // Fast path: no operand carries a distribution, so the result is single-valued. This keeps the
    // "no choice = zero overhead" property (§9.8.13, G17) and lets callers treat `One` as "plain".
    if ds.iter().all(|d| d.is_one()) {
        let vals: Vec<Value> = ds.into_iter().map(|d| d.single().cloned().expect("one")).collect();
        return Ok(Dist::One(f(vals)?));
    }
    let mut acc: Vec<Vec<Pt>> = Vec::with_capacity(ds.len());
    for d in ds {
        acc.push(d.points());
    }
    let mut result = Vec::new();
    let mut idx = vec![0usize; acc.len()];
    build(0, &acc, &mut idx, &mut result, &mut f)?;
    Ok(Dist::Many(result))
}

fn build<F>(
    i: usize,
    acc: &[Vec<Pt>],
    idx: &mut Vec<usize>,
    out: &mut Vec<Pt>,
    f: &mut F,
) -> EResult<()>
where
    F: FnMut(Vec<Value>) -> EResult<Value>,
{
    if i == acc.len() {
        let vals: Vec<Value> = acc.iter().enumerate().map(|(j, ps)| ps[idx[j]].v.clone()).collect();
        let mut w = 1.0;
        let mut assigns: Vec<Assign> = Vec::new();
        let mut shared = 1.0;
        for (j, ps) in acc.iter().enumerate() {
            let p = &ps[idx[j]];
            w *= p.w;
            for a in p.assigns.iter() {
                if let Some(prev) = assigns.iter().find(|x| x.choice == a.choice) {
                    if prev.branch != a.branch {
                        return Ok(());
                    }
                    shared *= a.p;
                } else {
                    assigns.push(a.clone());
                }
            }
        }
        if shared != 1.0 {
            w /= shared;
        }
        assigns.sort_by_key(|a| a.choice);
        out.push(Pt { w, assigns: Rc::new(assigns), v: f(vals)? });
        return Ok(());
    }
    for k in 0..acc[i].len() {
        idx[i] = k;
        build(i + 1, acc, idx, out, f)?;
    }
    Ok(())
}

/// Bind a pattern into a flat register file (bytecode path). Returns whether it matched.
pub fn bind_pattern_into(interner: &Interner, pat: &Pattern, v: &Value, regs: &mut [Value]) -> bool {
    match pat {
        Pattern::Bind(name) => {
            if let Some((slot, _)) = crate::resolve::split_binding(name) {
                if let Some(s) = regs.get_mut(slot as usize) {
                    *s = v.clone();
                }
            }
            true
        }
        Pattern::Wild => true,
        Pattern::Num(n) => matches!(v, Value::Num(x) if x == n),
        Pattern::Sym(s) => match v {
            Value::Sym(sym) => interner.try_name(*sym) == Some(s.as_str()),
            _ => false,
        },
        Pattern::None => matches!(v, Value::None),
        Pattern::Some(p) => match v {
            Value::Some(x) => bind_pattern_into(interner, p, x, regs),
            _ => false,
        },
        Pattern::Ok(p) => match v {
            Value::Ok(x) => bind_pattern_into(interner, p, x, regs),
            _ => false,
        },
        Pattern::Err(p) => match v {
            Value::Err(x) => bind_pattern_into(interner, p, x, regs),
            _ => false,
        },
        Pattern::Tuple(ps) => match v {
            Value::Tuple(xs) | Value::List(xs) => {
                if xs.len() != ps.len() {
                    return false;
                }
                ps.iter().zip(xs.iter()).all(|(p, x)| bind_pattern_into(interner, p, x, regs))
            }
            _ => false,
        },
        Pattern::Record(fields) => match v {
            Value::Record(rec) => {
                for (k, p) in fields {
                    let Some(key) = interner.find(k) else { return false };
                    match rec.get(key) {
                        Some(fv) => {
                            if !bind_pattern_into(interner, p, fv, regs) {
                                return false;
                            }
                        }
                        None => return false,
                    }
                }
                true
            }
            _ => false,
        },
    }
}

pub fn bind_pattern(interp: &Interp, pat: &Pattern, v: &Value, frame: &mut Frame) -> EResult<bool> {
    match pat {
        Pattern::Bind(name) => {
            if let Some((slot, _)) = crate::resolve::split_binding(name) {
                frame.set(slot, v.clone());
            }
            Ok(true)
        }
        Pattern::Wild => Ok(true),
        Pattern::Num(n) => Ok(matches!(v, Value::Num(x) if x == n)),
        Pattern::Sym(s) => Ok(match v {
            Value::Sym(sym) => interp.interner.try_name(*sym) == Some(s.as_str()),
            _ => false,
        }),
        Pattern::None => Ok(matches!(v, Value::None)),
        Pattern::Some(p) => match v {
            Value::Some(x) => bind_pattern(interp, p, x, frame),
            _ => Ok(false),
        },
        Pattern::Ok(p) => match v {
            Value::Ok(x) => bind_pattern(interp, p, x, frame),
            _ => Ok(false),
        },
        Pattern::Err(p) => match v {
            Value::Err(x) => bind_pattern(interp, p, x, frame),
            _ => Ok(false),
        },
        Pattern::Tuple(ps) => match v {
            Value::Tuple(xs) | Value::List(xs) => {
                if xs.len() != ps.len() {
                    return Ok(false);
                }
                for (p, x) in ps.iter().zip(xs.iter()) {
                    if !bind_pattern(interp, p, x, frame)? {
                        return Ok(false);
                    }
                }
                Ok(true)
            }
            _ => Ok(false),
        },
        Pattern::Record(fields) => match v {
            Value::Record(rec) => {
                for (k, p) in fields {
                    let key = match interp.interner.find(k) {
                        Some(s) => s,
                        None => return Ok(false),
                    };
                    match rec.get(key) {
                        Some(fv) => {
                            if !bind_pattern(interp, p, fv, frame)? {
                                return Ok(false);
                            }
                        }
                        None => return Ok(false),
                    }
                }
                Ok(true)
            }
            _ => Ok(false),
        },
    }
}

/// Operator tags for generated code: one conversion point into `ast`, so the AOT emitter never
/// re-derives operator meaning.
#[derive(Clone, Copy, Debug)]
pub enum BinOpTag {
    Add, Sub, Mul, Div, FloorDiv, Rem, Eq, Ne, Lt, Le, Gt, Ge, And, Or,
}

impl BinOpTag {
    /// Inverse of the discriminant order, for hosts that carry the tag as an integer.
    pub fn from_ordinal(n: i32) -> Self {
        use BinOpTag::*;
        [Add, Sub, Mul, Div, FloorDiv, Rem, Eq, Ne, Lt, Le, Gt, Ge, And, Or]
            .get(n.max(0) as usize)
            .copied()
            .unwrap_or(Add)
    }
}


#[derive(Clone, Copy, Debug)]
pub enum UnOpTag {
    Neg,
    Not,
}

impl BinOpTag {
    pub fn op(self) -> BinOp {
        match self {
            BinOpTag::Add => BinOp::Add,
            BinOpTag::Sub => BinOp::Sub,
            BinOpTag::Mul => BinOp::Mul,
            BinOpTag::Div => BinOp::Div,
            BinOpTag::FloorDiv => BinOp::FloorDiv,
            BinOpTag::Rem => BinOp::Rem,
            BinOpTag::Eq => BinOp::Eq,
            BinOpTag::Ne => BinOp::Ne,
            BinOpTag::Lt => BinOp::Lt,
            BinOpTag::Le => BinOp::Le,
            BinOpTag::Gt => BinOp::Gt,
            BinOpTag::Ge => BinOp::Ge,
            BinOpTag::And => BinOp::And,
            BinOpTag::Or => BinOp::Or,
        }
    }
}

impl UnOpTag {
    /// Inverse of the discriminant order, for hosts that carry the tag as an integer.
    pub fn from_ordinal(n: i32) -> Self {
        match n {
            1 => UnOpTag::Not,
            _ => UnOpTag::Neg,
        }
    }

    pub fn op(self) -> UnOp {
        match self {
            UnOpTag::Neg => UnOp::Neg,
            UnOpTag::Not => UnOp::Not,
        }
    }
}

pub fn binary_tag(op: BinOpTag, a: Value, b: Value) -> EResult<Value> {
    binary(op.op(), a, b)
}

pub fn unary_tag(op: UnOpTag, v: Value) -> EResult<Value> {
    unary(op.op(), v)
}

pub fn unary(op: UnOp, v: Value) -> EResult<Value> {
    Ok(match op {
        UnOp::Neg => match v {
            Value::Num(n) => Value::Num(canon(-n)),
            other => return Err(EvalError::new("BHC-E330", format!("cannot negate {}", other.type_name()))),
        },
        UnOp::Not => Value::Bool(!v.truthy()),
    })
}

pub fn binary(op: BinOp, a: Value, b: Value) -> EResult<Value> {
    use BinOp::*;
    match op {
        Eq | Ne => {
            let eq = a.same_as(&b);
            Ok(Value::Bool(if op == Eq { eq } else { !eq }))
        }
        And | Or => {
            let (x, y) = (a.truthy(), b.truthy());
            Ok(Value::Bool(if op == And { x && y } else { x || y }))
        }
        _ => {
            let x = num_of(&a).ok_or_else(|| {
                EvalError::new("BHC-E331", format!("arithmetic on {} (left operand)", a.type_name()))
            })?;
            let y = num_of(&b).ok_or_else(|| {
                EvalError::new("BHC-E332", format!("arithmetic on {} (right operand)", b.type_name()))
            })?;
            Ok(Value::Num(canon(match op {
                Add => x + y,
                Sub => x - y,
                Mul => x * y,
                Div => x / y,
                FloorDiv => libm::floor(x / y),
                Rem => x % y,
                Lt => return Ok(Value::Bool(x < y)),
                Le => return Ok(Value::Bool(x <= y)),
                Gt => return Ok(Value::Bool(x > y)),
                Ge => return Ok(Value::Bool(x >= y)),
                Eq | Ne | And | Or => unreachable!(),
            })))
        }
    }
}

/// Numeric-only binary fast path (both operands already `Num`).
///
/// Arithmetic is 18% of the interpreter's self time and every operator otherwise goes through
/// `Dist::join`, `num_of` on each side, and a `type_name()`-bearing error path. Returns `None` for
/// operators whose semantics need the general path (`Eq`/`Ne` compare any shape).
/// `floor(a / b)` for generated code, which has no `libm` of its own.
pub fn num_floor_div(a: f64, b: f64) -> f64 {
    libm::floor(a / b)
}

pub fn fast_binary_num(op: BinOp, x: f64, y: f64) -> Option<Value> {
    use BinOp::*;
    Some(match op {
        Add => Value::Num(canon(x + y)),
        Sub => Value::Num(canon(x - y)),
        Mul => Value::Num(canon(x * y)),
        Div => Value::Num(canon(x / y)),
        FloorDiv => Value::Num(canon(libm::floor(x / y))),
        Rem => Value::Num(canon(x % y)),
        Lt => Value::Bool(x < y),
        Le => Value::Bool(x <= y),
        Gt => Value::Bool(x > y),
        Ge => Value::Bool(x >= y),
        Eq | Ne | And | Or => return None,
    })
}

pub fn num_of(v: &Value) -> Option<f64> {
    match v {
        Value::Num(n) => Some(*n),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

/// Borrow the items instead of cloning them; the higher-order builtins only iterate.
pub fn as_slice(v: &Value) -> EResult<&[Value]> {
    match v {
        Value::List(xs) | Value::Tuple(xs) => Ok(xs),
        other => Err(EvalError::new("BHC-E346", format!("expected a list, got {}", other.type_name()))),
    }
}

pub fn as_list(v: &Value) -> EResult<Vec<Value>> {
    match v {
        Value::List(xs) | Value::Tuple(xs) => Ok((**xs).clone()),
        other => Err(EvalError::new("BHC-E346", format!("expected a list, got {}", other.type_name()))),
    }
}

pub fn len_of(v: &Value) -> EResult<usize> {
    match v {
        Value::List(xs) | Value::Tuple(xs) => Ok(xs.len()),
        Value::Record(r) => Ok(r.fields.len()),
        other => Err(EvalError::new("BHC-E347", format!("len() on {}", other.type_name()))),
    }
}

pub fn sym_of(v: &Value, interner: &Interner) -> EResult<Sym> {
    match v {
        Value::Sym(s) => Ok(*s),
        Value::Str(s) => interner
            .find(s)
            .ok_or_else(|| EvalError::new("BHC-E348", format!("symbol `{s}` is not in the symbol table"))),
        other => Err(EvalError::new("BHC-E349", format!("expected a symbol, got {}", other.type_name()))),
    }
}

pub fn wasm_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::from_bits(CANON_NAN)
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_negative() || b.is_sign_negative() { -0.0 } else { 0.0 }
    } else if a < b {
        a
    } else {
        b
    }
}

pub fn wasm_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::from_bits(CANON_NAN)
    } else if a == 0.0 && b == 0.0 {
        if a.is_sign_positive() || b.is_sign_positive() { 0.0 } else { -0.0 }
    } else if a > b {
        a
    } else {
        b
    }
}

pub fn show_num(n: f64) -> String {
    if n.is_nan() {
        return "nan".to_string();
    }
    if n.is_infinite() {
        return if n > 0.0 { "inf".to_string() } else { "-inf".to_string() };
    }
    if (n - libm::trunc(n)) == 0.0 && libm::fabs(n) < 1e15 {
        format!("{n:.0}")
    } else {
        format!("{n}")
    }
}

pub fn splitmix(mut x: u64) -> f64 {
    x = x.wrapping_add(0x9e3779b97f4a7c15);
    let mut z = x;
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
    z ^= z >> 31;
    (z >> 11) as f64 / (1u64 << 53) as f64
}

/// Exact `to_fixed`: decimal expansion of the binary value, half-up (toward +∞) at `digits`.
pub fn to_fixed(x: f64, digits: i32) -> f64 {
    if !x.is_finite() || libm::fabs(x) >= 9_007_199_254_740_992.0 {
        return x;
    }
    let digits = digits.clamp(0, 100) as usize;
    let exact = format!("{:.*}", digits + 20, libm::fabs(x));
    let (int_part, frac_part) = exact.split_once('.').unwrap_or((exact.as_str(), ""));
    let mut out: Vec<u8> = int_part.bytes().map(|b| b - b'0').collect();
    out.extend(frac_part.bytes().take(digits).map(|b| b - b'0'));
    let round_up = frac_part.as_bytes().get(digits).is_some_and(|c| *c >= b'5');
    if round_up {
        let mut i = out.len();
        loop {
            if i == 0 {
                out.insert(0, 1);
                break;
            }
            i -= 1;
            if out[i] == 9 {
                out[i] = 0;
            } else {
                out[i] += 1;
                break;
            }
        }
    }
    let mut s = String::with_capacity(out.len() + 2);
    let int_len = out.len().saturating_sub(digits);
    for (i, d) in out.iter().enumerate() {
        if i == int_len && digits > 0 {
            s.push('.');
        }
        s.push((b'0' + d) as char);
    }
    let mag: f64 = s.parse().unwrap_or(0.0);
    if x.is_sign_negative() && mag != 0.0 { -mag } else { mag }
}

impl Host for Interp<'_> {
    fn interner(&self) -> &Interner {
        self.interner
    }
    fn alloc_regs(&self, n: usize) -> Vec<Dist> {
        match self.regs_pool.borrow_mut().pop() {
            Some(mut v) => {
                v.clear();
                v.resize(n, Dist::One(Value::Unit));
                v
            }
            None => vec![Dist::One(Value::Unit); n],
        }
    }
    fn free_regs(&self, v: Vec<Dist>) {
        let mut pool = self.regs_pool.borrow_mut();
        if pool.len() < 256 {
            pool.push(v);
        }
    }
    fn budget(&self) -> Budget {
        self.budget
    }
    fn call_value(&self, callee: Dist, args: Vec<Dist>) -> EResult<Dist> {
        self.apply(callee, args)
    }
    fn call_plain(&self, f: &Value, args: &[Value]) -> EResult<Dist> {
        self.apply_plain(f, args)
    }
    fn mark_truncated(&self) {
        self.truncated.set(true);
    }
    fn was_truncated(&self) -> bool {
        self.truncated.get()
    }
    fn trim(&self, d: Dist) -> EResult<Vec<Pt>> {
        Interp::trim(self, d)
    }
    fn show_value(&self, v: &Value) -> String {
        self.show(v)
    }
    fn begin_choice(&self) -> u32 {
        let site = self.next_choice.get();
        self.next_choice.set(site + 1);
        site
    }
    fn record_choice(&self, site: u32, branch: u32, p: f64, label: Option<Sym>) {
        self.choices.borrow_mut().push(ChoiceTrace { site, branch, p, label });
    }
    fn sets(&self) -> &[crate::ir::DataSet] {
        &self.prog.data
    }
}

/// Evaluate a constant expression at load time (no frame, no closures).
pub fn eval_const(prog: &Program, r: &R, file: &str) -> Result<Value, crate::diag::Diag> {
    let interner = Interner::new();
    let interp = Interp::new(prog, &interner, Budget::default());
    let mut frame = Frame::new(0);
    match interp.eval(r, &mut frame) {
        Ok(d) => match d.single() {
            Some(v) => Ok(v.clone()),
            None => Err(crate::diag::Diag::new(
                "BHC-E117",
                file,
                Pos::default(),
                "const initialiser must not depend on a choice",
            )),
        },
        Err(e) => Err(crate::diag::Diag::new(e.code, file, Pos::default(), e.message)),
    }
}
