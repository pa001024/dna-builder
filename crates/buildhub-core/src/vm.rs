//! Bytecode interpreter (spec §9.5 path B).
//!
//! A second executor over the same instruction table (§9.6.2), not a second language: it calls
//! `builtins::call`, `eval::binary`, `eval::unary` and `value::Dist` exactly as the tree walk does,
//! so "same source, same bits" is structural. `tests/parity.rs` checks it end to end.
//!
//! Registers hold [`Dist`], not `Value`: support-set propagation is a property of the meaning of an
//! instruction (§9.8.2.2), so it must not depend on which executor runs it.

use alloc::{boxed::Box, format, string::String, vec, vec::Vec};
use core::cell::{Cell, RefCell};
use hashbrown::HashMap;
use alloc::rc::Rc;

use crate::eval::{
    self, Budget, ChoiceTrace, EResult, EvalError, ExplainEntry, ExplainLog, Host,
};
use crate::ssa::{CaseCode, Code, DataCode, Instr, TagKind};
use crate::sym::{Interner, Sym};
use crate::value::{Closure, Dist, Pt, Record, Value};

pub struct Vm<'a> {
    pub code: &'a Code,
    pub interner: &'a Interner,
    pub sets: &'a [crate::ir::DataSet],
    pub budget: Budget,
    fuel: Cell<u64>,
    depth: Cell<u32>,
    next_choice: Cell<u32>,
    pub choices: RefCell<Vec<ChoiceTrace>>,
    truncated: Cell<bool>,
    pub explain: Option<RefCell<ExplainLog>>,
    memo: RefCell<HashMap<(u32, u64), Value>>,
    pub memo_on: Cell<bool>,
    regs_pool: RefCell<Vec<Vec<Dist>>>,
}

impl<'a> Vm<'a> {
    pub fn new(code: &'a Code, interner: &'a Interner, sets: &'a [crate::ir::DataSet], budget: Budget) -> Self {
        Self {
            code,
            interner,
            sets,
            budget,
            fuel: Cell::new(budget.fuel),
            depth: Cell::new(0),
            next_choice: Cell::new(0),
            choices: RefCell::new(Vec::new()),
            truncated: Cell::new(false),
            explain: None,
            memo: RefCell::new(HashMap::new()),
            memo_on: Cell::new(true),
            regs_pool: RefCell::new(Vec::new()),
        }
    }

    pub fn with_explain(mut self) -> Self {
        self.explain = Some(RefCell::new(ExplainLog::default()));
        self
    }

    pub fn reset(&self) {
        self.fuel.set(self.budget.fuel);
        self.depth.set(0);
        self.memo.borrow_mut().clear();
        self.next_choice.set(0);
        self.choices.borrow_mut().clear();
        self.truncated.set(false);
    }

    /// Host entry point: call an entry function with plain values.
    pub fn call(&self, fn_id: usize, args: Vec<Value>) -> EResult<Dist> {
        self.invoke(fn_id, &[], &args)
    }

    fn burn(&self, n: u64) -> EResult<()> {
        let left = self.fuel.get();
        if left < n {
            return Err(EvalError::new("BHC-E300", "fuel exhausted (evaluation budget exceeded)"));
        }
        self.fuel.set(left - n);
        Ok(())
    }

    fn invoke(&self, fn_id: usize, upvalues: &[Value], args: &[Value]) -> EResult<Dist> {
        if self.code.fns.get(fn_id).is_none() {
            return Err(EvalError::new("BHC-E328", format!("unknown function id {fn_id}")));
        }
        let memo_key = if self.memo_on.get() && upvalues.is_empty() {
            let mut h = 0xcbf29ce484222325u64;
            for a in args {
                a.hash_into(&mut h);
            }
            Some((fn_id as u32, h))
        } else {
            None
        };
        if let Some(k) = &memo_key {
            if let Some(v) = self.memo.borrow().get(k) {
                return Ok(Dist::One(v.clone()));
            }
        }
        let d = self.depth.get() + 1;
        if d > self.budget.depth {
            return Err(EvalError::new(
                "BHC-E301",
                format!("call depth exceeded at fn#{fn_id} (limit {})", self.budget.depth),
            ));
        }
        self.depth.set(d);
        let out = self.run_block(fn_id, 0, upvalues, args);
        self.depth.set(d - 1);
        if let (Some(k), Ok(d0)) = (memo_key, &out) {
            if let Some(v) = d0.single() {
                self.memo.borrow_mut().insert(k, v.clone());
            }
        }
        out
    }

    fn run_block(&self, fn_id: usize, block: u32, upvalues: &[Value], args: &[Value]) -> EResult<Dist> {
        let f = &self.code.fns[fn_id];
        let nregs = f.nregs as usize;
        let mut regs: Vec<Dist> = self.alloc_regs(nregs);
        for (i, u) in upvalues.iter().enumerate() {
            if let Some(s) = regs.get_mut(i) {
                *s = Dist::One(u.clone());
            }
        }
        let base = f.ncaptures as usize;
        for (i, a) in args.iter().enumerate() {
            if let Some(s) = regs.get_mut(base + i) {
                *s = Dist::One(a.clone());
            }
        }
        let out = self.run_block_in(fn_id, block, &mut regs);
        self.free_regs(regs);
        out
    }

    /// Run a block against an existing register file. Sub-blocks (`Enter`/`Fork`/`Choose` bodies)
    /// share the caller's frame: they read the same slots and temps, which is what makes a branch
    /// body see its enclosing locals.
    fn run_block_in(&self, fn_id: usize, block: u32, regs: &mut Vec<Dist>) -> EResult<Dist> {
        let f = &self.code.fns[fn_id];
        let body = match f.blocks.get(block as usize) {
            Some(b) => b,
            None => return Err(EvalError::new("BHC-E505", format!("block {block} out of range"))),
        };
        for ins in body {
            self.burn(1)?;
            if let Some(d) = self.step(fn_id, ins, regs)? {
                return Ok(d);
            }
        }
        Err(EvalError::new("BHC-E506", "block terminated without `ret`"))
    }

    fn step(&self, fn_id: usize, ins: &Instr, regs: &mut Vec<Dist>) -> EResult<Option<Dist>> {
        match ins {
            Instr::Const { dst, val } => {
                let v = self
                    .code
                    .consts
                    .get(*val as usize)
                    .cloned()
                    .ok_or_else(|| EvalError::new("BHC-E510", format!("constant {val} out of range")))?;
                regs[*dst as usize] = Dist::One(v);
            }
            Instr::Bin { dst, op, a, b } => {
                let x = regs[*a as usize].clone();
                let y = regs[*b as usize].clone();
                let v = Dist::join(x, y, |p, q| eval::binary(*op, p, q))?;
                regs[*dst as usize] = v;
            }
            Instr::Un { dst, op, a } => {
                let x = regs[*a as usize].clone();
                regs[*dst as usize] = x.try_map(|p| eval::unary(*op, p))?;
            }
            Instr::Prim { dst, b, args } => {
                let ds = gather(regs, args);
                regs[*dst as usize] = crate::builtins::call(self, *b, ds)?;
            }
            Instr::CallHigher { dst, b, args } => {
                let ds = gather(regs, args);
                regs[*dst as usize] = crate::builtins::call(self, *b, ds)?;
            }
            Instr::Field { dst, rec, sym } => {
                let name = Sym(*sym);
                let x = regs[*rec as usize].clone();
                regs[*dst as usize] = x.try_map(|v| match v {
                    Value::Record(r) => Ok(r.get(name).cloned().unwrap_or(Value::Missing)),
                    Value::Missing | Value::None => Ok(Value::Missing),
                    other => Err(EvalError::new(
                        "BHC-E310",
                        format!("field `{}` on {} value", self.interner.name(name), other.type_name()),
                    )),
                })?;
            }
            Instr::GetOr { dst, opt, def } => {
                let a = regs[*opt as usize].clone();
                let b = regs[*def as usize].clone();
                regs[*dst as usize] = Dist::join(a, b, |o, d| {
                    Ok(match o {
                        Value::Some(x) => *x,
                        Value::None | Value::Missing => d,
                        other => other,
                    })
                })?;
            }
            Instr::Update { dst, rec, patch } => {
                let a = regs[*rec as usize].clone();
                let b = regs[*patch as usize].clone();
                regs[*dst as usize] = Dist::join(a, b, |r, p| match (r, p) {
                    (Value::Record(base), Value::Record(patch)) => {
                        let mut out = (*base).clone();
                        for (k, val) in &patch.fields {
                            out.set(*k, val.clone());
                        }
                        Ok(Value::record(out))
                    }
                    (other, _) => Err(EvalError::new("BHC-E341", format!("update() on {}", other.type_name()))),
                })?;
            }
            Instr::MkRec { dst, schema, fields } => {
                let mut keys = Vec::with_capacity(fields.len());
                let mut ds = Vec::with_capacity(fields.len());
                for (k, r) in fields {
                    keys.push(*k);
                    ds.push(regs[*r as usize].clone());
                }
                let sid = *schema;
                regs[*dst as usize] = eval::combine_all(ds, move |vals| {
                    let mut rec = Record::new();
                    for (k, val) in keys.iter().zip(vals) {
                        rec.set(Sym(*k), val);
                    }
                    rec.schema = sid;
                    Ok(Value::record(rec))
                })?;
            }
            Instr::MkList { dst, items } => {
                let ds = gather(regs, items);
                regs[*dst as usize] = eval::combine_all(ds, |vals| Ok(Value::list(vals)))?;
            }
            Instr::MkTuple { dst, items } => {
                let ds = gather(regs, items);
                regs[*dst as usize] = eval::combine_all(ds, |vals| Ok(Value::tuple(vals)))?;
            }
            Instr::Tag { dst, kind, inner } => {
                let k = *kind;
                let x = regs[*inner as usize].clone();
                regs[*dst as usize] = x.map(move |v| match k {
                    TagKind::Some => Value::Some(Box::new(v)),
                    TagKind::Ok => Value::Ok(Box::new(v)),
                    TagKind::Err => Value::Err(Box::new(v)),
                });
            }
            Instr::At { dst, src, idx } => {
                let a = regs[*src as usize].clone();
                let b = regs[*idx as usize].clone();
                regs[*dst as usize] = Dist::join(a, b, |s, i| {
                    let n = eval::num_of(&i).ok_or_else(|| EvalError::new("BHC-E311", "index must be a Num"))?;
                    let n = n.max(0.0) as usize;
                    match s {
                        Value::List(xs) | Value::Tuple(xs) => Ok(xs.get(n).cloned().unwrap_or(Value::Missing)),
                        other => Err(EvalError::new("BHC-E312", format!("cannot index {}", other.type_name()))),
                    }
                })?;
            }
            Instr::Concat { dst, a, b } => {
                let x = regs[*a as usize].clone();
                let y = regs[*b as usize].clone();
                let limit = self.budget.len_limit;
                regs[*dst as usize] = Dist::join(x, y, move |p, q| {
                    let mut xs = eval::as_list(&p)?;
                    xs.extend(eval::as_list(&q)?);
                    if xs.len() > limit {
                        return Err(EvalError::new("BHC-E302", "list exceeds len_limit"));
                    }
                    Ok(Value::list(xs))
                })?;
            }
            Instr::Call { dst, fn_id: target, args } => {
                let ds = gather(regs, args);
                let any_dist = ds.iter().any(|d| !d.is_one());
                let t = *target as usize;
                let v = if any_dist {
                    let comb = eval::combine_all(ds, |vals| Ok(Value::list(vals)))?;
                    Dist::chain(comb, move |v| {
                        let vals = eval::as_list(&v)?;
                        self.invoke(t, &[], &vals)
                    })?
                } else {
                    let vals: Vec<Value> = ds.into_iter().map(|d| d.single().cloned().expect("one")).collect();
                    self.invoke(t, &[], &vals)?
                };
                regs[*dst as usize] = v;
            }
            Instr::CallValue { dst, callee, args } => {
                let c = regs[*callee as usize].clone();
                let ds = gather(regs, args);
                regs[*dst as usize] = self.call_value(c, ds)?;
            }
            Instr::Closure { dst, fn_id: target, caps } => {
                let ds = gather(regs, caps);
                let t = *target as usize;
                regs[*dst as usize] =
                    eval::combine_all(ds, move |vals| Ok(Value::Closure(Rc::new(Closure { fn_id: t, upvalues: vals, fast: Vec::new() }))))?;
            }
            Instr::Enter { dst, blk } => {
                regs[*dst as usize] = self.run_block_in(fn_id, *blk, regs)?;
            }
            Instr::Fork { dst, cond, then_blk, else_blk } => {
                let c = regs[*cond as usize].clone();
                let (t, e) = (*then_blk, *else_blk);
                regs[*dst as usize] = Dist::chain(c, |v| {
                    let b = if v.truthy() { t } else { e };
                    self.run_block_in(fn_id, b, regs)
                })?;
            }
            Instr::Choose { dst, cases } => {
                regs[*dst as usize] = self.run_choice(fn_id, cases, regs)?;
            }
            Instr::Expect { dst, src } => {
                let x = regs[*src as usize].clone();
                regs[*dst as usize] = Dist::One(x.expect()?);
            }
            Instr::Data { dst, set, access } => {
                regs[*dst as usize] = self.run_data(*set, access, regs)?;
            }
            Instr::MatchPat { dst, src, pat } => {
                let v = regs[*src as usize].clone();
                let p = self
                    .code
                    .patterns
                    .get(*pat as usize)
                    .cloned()
                    .ok_or_else(|| EvalError::new("BHC-E511", format!("pattern {pat} out of range")))?;
                // The pattern test itself is single-valued (it decides which block runs), but the
                // *bindings* it writes are per support point, so a distributed scrutinee binds each
                // point separately (spec §9.8.2.2: structure ops propagate pointwise).
                let ok = match &v {
                    Dist::One(x) => {
                        let mut plain: Vec<Value> =
                            regs.iter().map(|d| d.single().cloned().unwrap_or(Value::Missing)).collect();
                        let hit = eval::bind_pattern_into(self.interner, &p, x, &mut plain);
                        if hit {
                            for (i, val) in plain.into_iter().enumerate() {
                                if let Some(slot) = regs.get_mut(i) {
                                    *slot = Dist::One(val);
                                }
                            }
                        }
                        hit
                    }
                    Dist::Many(pts) => {
                        // Every point must agree, otherwise the choice of block is itself random and
                        // the program must collapse it explicitly.
                        let mut seen: Option<bool> = None;
                        let mut bound: Vec<Vec<Value>> = Vec::with_capacity(pts.len());
                        for pt in pts {
                            let mut plain: Vec<Value> =
                                regs.iter().map(|d| d.single().cloned().unwrap_or(Value::Missing)).collect();
                            let hit = eval::bind_pattern_into(self.interner, &p, &pt.v, &mut plain);
                            match seen {
                                None => seen = Some(hit),
                                Some(prev) if prev != hit => {
                                    return Err(EvalError::new(
                                        "BHC-E507",
                                        "pattern match depends on a choice; collapse it with expected()",
                                    ))
                                }
                                _ => {}
                            }
                            bound.push(plain);
                        }
                        let hit = seen.unwrap_or(false);
                        if hit {
                            // Only slots the pattern actually binds are overwritten; other registers
                            // keep their existing values (they may hold live temporaries).
                            for (i, slot) in regs.iter_mut().enumerate() {
                                let before: Vec<&Value> =
                                    bound.iter().map(|b| b.get(i).unwrap_or(&Value::Missing)).collect();
                                let changed = before
                                    .iter()
                                    .any(|v| !pts.is_empty() && !v.same_as(&bound[0][i]));
                                if !changed {
                                    continue;
                                }
                                let vals: Vec<Pt> = pts
                                    .iter()
                                    .enumerate()
                                    .map(|(k, pt)| Pt {
                                        w: pt.w,
                                        assigns: pt.assigns.clone(),
                                        v: bound[k].get(i).cloned().unwrap_or(Value::Missing),
                                    })
                                    .collect();
                                *slot = Dist::Many(vals);
                            }
                        }
                        hit
                    }
                };
                regs[*dst as usize] = Dist::One(Value::Bool(ok));
            }
            Instr::Host { dst, name, args } => {
                let ds = gather(regs, args);
                let name = Sym(*name);
                regs[*dst as usize] = eval::combine_all(ds, move |vals| self.call_host(name, &vals))?;
            }
            Instr::Ret { src } => return Ok(Some(regs[*src as usize].clone())),
        }
        Ok(None)
    }

    fn run_choice(&self, fn_id: usize, cases: &[CaseCode], regs: &mut Vec<Dist>) -> EResult<Dist> {
        let mut weights = Vec::with_capacity(cases.len());
        let mut total = 0.0;
        for c in cases {
            let w = regs[c.weight as usize].clone();
            let w = match w.single() {
                Some(v) => eval::num_of(v).ok_or_else(|| EvalError::new("BHC-E318", "choice weight must be a Num"))?,
                None => {
                    return Err(EvalError::new(
                        "BHC-E319",
                        "choice weight depends on another choice; hoist the outer choice",
                    ))
                }
            };
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
        let saved = regs.clone();
        let mut out = Vec::new();
        for (i, c) in cases.iter().enumerate() {
            let p = weights[i] / total;
            self.choices.borrow_mut().push(ChoiceTrace {
                site,
                branch: i as u32,
                p,
                label: c.label.map(Sym),
            });
            *regs = saved.clone();
            match self.run_block_in(fn_id, c.body, regs)? {
                Dist::One(v) => out.push(Pt {
                    w: p,
                    assigns: Rc::new(vec![crate::value::Assign { choice: site, branch: i as u32, p }]),
                    v,
                }),
                Dist::Many(ps) => {
                    for q in ps {
                        let mut assigns = q.assigns.to_vec();
                        assigns.push(crate::value::Assign { choice: site, branch: i as u32, p });
                        assigns.sort_by_key(|a| a.choice);
                        out.push(Pt { w: p * q.w, assigns: Rc::new(assigns), v: q.v });
                    }
                }
            }
        }
        *regs = saved;
        Ok(Dist::Many(out))
    }

    fn run_data(&self, set: u32, access: &DataCode, regs: &mut [Dist]) -> EResult<Dist> {
        let ds = self
            .sets
            .get(set as usize)
            .ok_or_else(|| EvalError::new("BHC-E508", format!("data set {set} out of range")))?;
        Ok(match access {
            DataCode::All => {
                if ds.rows.len() > self.budget.len_limit {
                    return Err(EvalError::new("BHC-E302", format!("data set `{}` exceeds len_limit", ds.name)));
                }
                Dist::One(Value::List(ds.rows.clone()))
            }
            DataCode::Len => Dist::One(Value::Num(ds.rows.len() as f64)),
            DataCode::ByKey(r) => {
                let k = regs[*r as usize].clone();
                k.try_map(|kv| {
                    let h = kv.hash();
                    Ok(match ds.index.get(&h) {
                        Some(i) => Value::Some(Box::new(ds.rows[*i].clone())),
                        None => Value::None,
                    })
                })?
            }
            DataCode::ByIndex(r) => {
                let k = regs[*r as usize].clone();
                k.try_map(|kv| {
                    let n = eval::num_of(&kv).ok_or_else(|| EvalError::new("BHC-E311", "by_index expects a Num"))?;
                    Ok(ds.rows.get(n.max(0.0) as usize).cloned().unwrap_or(Value::Missing))
                })?
            }
        })
    }

    fn call_value(&self, callee: Dist, args: Vec<Dist>) -> EResult<Dist> {
        let all_one = callee.is_one() && args.iter().all(|d| d.is_one());
        if all_one {
            let f = callee.single().cloned().expect("one");
            let vals: Vec<Value> = args.into_iter().map(|d| d.single().cloned().expect("one")).collect();
            return self.apply_plain(&f, &vals);
        }
        let mut parts = vec![callee];
        parts.extend(args);
        let comb = eval::combine_all(parts, |mut vals| {
            let f = vals.remove(0);
            Ok(Value::tuple(vec![f, Value::list(vals)]))
        })?;
        Dist::chain(comb, |v| match v {
            Value::Tuple(t) => {
                let f = t[0].clone();
                let a = eval::as_list(&t[1])?;
                self.apply_plain(&f, &a)
            }
            other => Err(EvalError::new("BHC-E353", format!("bad call point {}", other.type_name()))),
        })
    }

    fn apply_plain(&self, f: &Value, args: &[Value]) -> EResult<Dist> {
        match f {
            Value::Closure(c) => self.invoke(c.fn_id, &c.upvalues, args),
            Value::Builtin(b) => {
                // Builtin values in registers carry the on-disk tag, so the mapping is total.
                let b = crate::image::builtin_by_tag(*b)
                    .ok_or_else(|| EvalError::new("BHC-E324", format!("builtin tag {b} out of range")))?;
                let ds = args.iter().cloned().map(Dist::One).collect();
                crate::builtins::call(self, b, ds)
            }
            other => Err(EvalError::new("BHC-E325", format!("cannot call a {} value", other.type_name()))),
        }
    }

    fn call_host(&self, name: Sym, args: &[Value]) -> EResult<Value> {
        match self.interner.name(name) {
            "rng.splitmix" => {
                let seed = args.first().and_then(eval::num_of).unwrap_or(0.0);
                Ok(Value::Num(eval::splitmix(seed.to_bits())))
            }
            other => Err(EvalError::new("BHC-E402", format!("host capability `{other}` is not implemented"))),
        }
    }

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
            let n = eval::num_of(&p.v).ok_or_else(|| {
                EvalError::new(
                    "BHC-E344",
                    format!("cannot project a {} support to one value; wrap with expected()", p.v.type_name()),
                )
            })?;
            sum += p.w * n;
        }
        Ok(Value::Num(crate::value::canon(sum)))
    }

    pub fn trim(&self, d: Dist) -> EResult<Vec<Pt>> {
        let distinct = d.support_len();
        let pts = d.points();
        if distinct <= self.budget.max_support {
            return Ok(pts);
        }
        self.truncated.set(true);
        if !pts.iter().all(|p| matches!(p.v, Value::Num(_))) {
            return Err(EvalError::new(
                "BHC-E345",
                format!("support set of {distinct} distinct values exceeds max_support and is not numeric"),
            ));
        }
        let keep = self.budget.max_support.saturating_sub(1).max(1);
        let mut head: Vec<Pt> = pts.iter().take(keep).cloned().collect();
        let tail = &pts[keep..];
        let w: f64 = tail.iter().map(|p| p.w).sum();
        if w > 0.0 {
            let mut mean = 0.0;
            for p in tail {
                mean += p.w * eval::num_of(&p.v).unwrap_or(0.0);
            }
            head.push(Pt { w, assigns: Rc::new(Vec::new()), v: Value::Num(crate::value::canon(mean / w)) });
        }
        Ok(head)
    }

    pub fn explain_entries(&self) -> Vec<ExplainEntry> {
        match &self.explain {
            Some(l) => l
                .borrow()
                .entries
                .iter()
                .map(|e| ExplainEntry { depth: e.depth, call: e.call.clone(), result: e.result.clone() })
                .collect(),
            None => Vec::new(),
        }
    }
}

fn gather(regs: &[Dist], rs: &[u32]) -> Vec<Dist> {
    rs.iter().map(|r| regs.get(*r as usize).cloned().unwrap_or(Dist::One(Value::Missing))).collect()
}

impl Host for Vm<'_> {
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
        Vm::call_value(self, callee, args)
    }
    fn mark_truncated(&self) {
        self.truncated.set(true);
    }
    fn was_truncated(&self) -> bool {
        self.truncated.get()
    }
    fn trim(&self, d: Dist) -> EResult<Vec<Pt>> {
        Vm::trim(self, d)
    }
    fn show_value(&self, v: &Value) -> String {
        crate::show::render(self.interner, v)
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
        self.sets
    }
}
