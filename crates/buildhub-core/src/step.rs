//! One function per instruction: the shared semantics table (spec §9.6.2).
//!
//! The bytecode VM calls these from its dispatch loop (path B); the AOT emitter generates straight
//! line Rust that calls the *same* functions (path W). That is what makes "one source, two emitters,
//! identical bits" structural instead of a promise: there is only one place where an instruction
//! means anything.
//!
//! Every function takes the register file by `&mut [Dist]` and the host by `&dyn Host`, so nothing
//! here knows whether it was reached from an interpreter or from compiled code.

use alloc::{boxed::Box, format, vec, vec::Vec};
use alloc::rc::Rc;

use crate::eval::{self, EResult, EvalError, Host};
use crate::ssa::{DataCode, TagKind};
use crate::sym::Sym;
use crate::value::{Closure, Dist, Record, Value};

pub fn read(regs: &[Dist], r: u32) -> Dist {
    regs.get(r as usize).cloned().unwrap_or(Dist::One(Value::Missing))
}

pub fn write(regs: &mut [Dist], r: u32, d: Dist) {
    if let Some(s) = regs.get_mut(r as usize) {
        *s = d;
    }
}

/// Fast path for a static call: read the operands straight out of the register file.
///
/// The emitted code used to build a `Vec<Dist>` per call only to flatten it again. When every
/// operand is single-valued (the common case) we go straight to `Vec<Value>`, saving one
/// allocation and N `Dist` clones per call.
pub fn call_static_regs<F>(regs: &[Dist], rs: &[u32], invoke: F) -> EResult<Dist>
where
    F: Fn(Vec<Value>) -> EResult<Dist>,
{
    let mut vals = Vec::with_capacity(rs.len());
    let mut all_one = true;
    for r in rs {
        match regs.get(*r as usize) {
            Some(Dist::One(v)) => vals.push(v.clone()),
            _ => {
                all_one = false;
                break;
            }
        }
    }
    if all_one {
        return invoke(vals);
    }
    let any_dist = gather(regs, rs).iter().any(|d| !d.is_one());
    if !any_dist {
        return invoke(vals);
    }
    let comb = eval::combine_all(gather(regs, rs), |vals| Ok(Value::list(vals)))?;
    Dist::chain(comb, |v| {
        let vals = eval::as_list(&v)?;
        invoke(vals)
    })
}

pub fn gather(regs: &[Dist], rs: &[u32]) -> Vec<Dist> {
    rs.iter().map(|r| read(regs, *r)).collect()
}

// ---------------------------------------------------------------------------------------------
// instruction-shaped operations
//
// Each of these takes the register file and a destination, so generated code contains one call per
// instruction rather than a closure per instruction. That is both the spec's model (§9.6.2 "one
// semantics table") and the size win: a closure per site would monomorphise `Dist::join` hundreds of
// times inside an AOT artifact.
// ---------------------------------------------------------------------------------------------

/// Value form of `bin`, for emitters that carry operands as locals rather than a register file.
/// Extract the single numeric value of a distribution result, for callers that keep `f64` locals.
pub fn dist_num(d: &Dist) -> EResult<f64> {
    match d {
        Dist::One(Value::Num(n)) => Ok(*n),
        Dist::One(other) => Err(EvalError::new(
            "BHC-E335",
            format!("expected Num, got {}", other.type_name()),
        )),
        Dist::Many(_) => Err(EvalError::new("BHC-E335", "expected Num, got a distribution")),
    }
}

pub fn bin_v(op: crate::eval::BinOpTag, a: Dist, b: Dist) -> EResult<Dist> {
    if let (Dist::One(Value::Num(p)), Dist::One(Value::Num(q))) = (&a, &b) {
        if let Some(v) = crate::eval::fast_binary_num(op.op(), *p, *q) {
            return Ok(Dist::One(v));
        }
    }
    Dist::join(a, b, |x, y| crate::eval::binary_tag(op, x, y))
}

pub fn un_v(op: crate::eval::UnOpTag, a: Dist) -> EResult<Dist> {
    a.try_map(|v| crate::eval::unary_tag(op, v))
}

pub fn prim_v(host: &dyn Host, b: crate::ir::Builtin, args: Vec<Dist>) -> EResult<Dist> {
    crate::builtins::call(host, b, args)
}

#[inline(never)]
pub fn bin(regs: &mut [Dist], dst: u32, op: crate::eval::BinOpTag, a: u32, b: u32) -> EResult<()> {
    let v = bin_v(op, read(regs, a), read(regs, b))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn un(regs: &mut [Dist], dst: u32, op: crate::eval::UnOpTag, a: u32) -> EResult<()> {
    let v = read(regs, a).try_map(|p| crate::eval::unary_tag(op, p))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn field_into(host: &dyn Host, regs: &mut [Dist], dst: u32, rec: u32, name: Sym) -> EResult<()> {
    let v = field(host, read(regs, rec), name)?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn get_or_into(regs: &mut [Dist], dst: u32, opt: u32, def: u32) -> EResult<()> {
    let v = get_or(read(regs, opt), read(regs, def))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn update_into(regs: &mut [Dist], dst: u32, rec: u32, patch: u32) -> EResult<()> {
    let v = update(read(regs, rec), read(regs, patch))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn at_into(regs: &mut [Dist], dst: u32, src: u32, idx: u32) -> EResult<()> {
    let v = at(read(regs, src), read(regs, idx))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn concat_into(host: &dyn Host, regs: &mut [Dist], dst: u32, a: u32, b: u32) -> EResult<()> {
    let v = concat(host, read(regs, a), read(regs, b))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn tag_into(regs: &mut [Dist], dst: u32, kind: TagKind, inner: u32) {
    let v = tag(kind, read(regs, inner));
    write(regs, dst, v);
}

#[inline(never)]
pub fn mk_list_into(regs: &mut [Dist], dst: u32, items: &[u32]) -> EResult<()> {
    let v = mk_list(gather(regs, items))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn mk_tuple_into(regs: &mut [Dist], dst: u32, items: &[u32]) -> EResult<()> {
    let v = mk_tuple(gather(regs, items))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn mk_rec_into(regs: &mut [Dist], dst: u32, keys: &[u32], schema: Option<u32>, vals: &[u32]) -> EResult<()> {
    let v = mk_rec(keys.to_vec(), schema, gather(regs, vals))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn prim_into(host: &dyn Host, regs: &mut [Dist], dst: u32, b: crate::ir::Builtin, args: &[u32]) -> EResult<()> {
    let v = crate::builtins::call(host, b, gather(regs, args))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn closure_into(regs: &mut [Dist], dst: u32, fn_id: usize, caps: &[u32]) -> EResult<()> {
    let v = closure(fn_id, gather(regs, caps))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn call_value_into(host: &dyn Host, regs: &mut [Dist], dst: u32, callee: u32, args: &[u32]) -> EResult<()> {
    let v = call_value(host, read(regs, callee), gather(regs, args))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn expect_into(regs: &mut [Dist], dst: u32, src: u32) -> EResult<()> {
    let v = expect(read(regs, src))?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn data_into(host: &dyn Host, regs: &mut [Dist], dst: u32, set: u32, access: DataCode, arg: Option<u32>) -> EResult<()> {
    let a = arg.map(|r| read(regs, r));
    let v = data(host, host.sets(), set, &access, a)?;
    write(regs, dst, v);
    Ok(())
}

#[inline(never)]
pub fn host_into(host: &dyn Host, regs: &mut [Dist], dst: u32, name: Sym, args: &[u32]) -> EResult<()> {
    let v = host_call(host, name, gather(regs, args))?;
    write(regs, dst, v);
    Ok(())
}

// ---------------------------------------------------------------------------------------------
// value operations
// ---------------------------------------------------------------------------------------------

pub fn field(host: &dyn Host, rec: Dist, name: Sym) -> EResult<Dist> {
    rec.try_map(|v| match v {
        Value::Record(r) => Ok(r.get(name).cloned().unwrap_or(Value::Missing)),
        Value::Missing | Value::None => Ok(Value::Missing),
        other => Err(EvalError::new(
            "BHC-E310",
            format!("field `{}` on {} value", host.interner().name(name), other.type_name()),
        )),
    })
}

pub fn get_or(opt: Dist, def: Dist) -> EResult<Dist> {
    Dist::join(opt, def, |o, d| {
        Ok(match o {
            Value::Some(x) => *x,
            Value::None | Value::Missing => d,
            other => other,
        })
    })
}

pub fn update(rec: Dist, patch: Dist) -> EResult<Dist> {
    Dist::join(rec, patch, |r, p| match (r, p) {
        (Value::Record(base), Value::Record(patch)) => {
            let mut out = (*base).clone();
            for (k, v) in &patch.fields {
                out.set(*k, v.clone());
            }
            Ok(Value::record(out))
        }
        (other, _) => Err(EvalError::new("BHC-E341", format!("update() on {}", other.type_name()))),
    })
}

pub fn mk_rec(keys: Vec<u32>, schema: Option<u32>, vals: Vec<Dist>) -> EResult<Dist> {
    eval::combine_all(vals, move |vals| {
        let mut rec = Record::new();
        for (k, v) in keys.iter().zip(vals) {
            rec.set(Sym(*k), v);
        }
        rec.schema = schema;
        Ok(Value::record(rec))
    })
}

pub fn mk_list(items: Vec<Dist>) -> EResult<Dist> {
    eval::combine_all(items, |vals| Ok(Value::list(vals)))
}

pub fn mk_tuple(items: Vec<Dist>) -> EResult<Dist> {
    eval::combine_all(items, |vals| Ok(Value::tuple(vals)))
}

pub fn tag(kind: TagKind, inner: Dist) -> Dist {
    inner.map(move |v| match kind {
        TagKind::Some => Value::Some(Box::new(v)),
        TagKind::Ok => Value::Ok(Box::new(v)),
        TagKind::Err => Value::Err(Box::new(v)),
    })
}

pub fn at(src: Dist, idx: Dist) -> EResult<Dist> {
    Dist::join(src, idx, |s, i| {
        let n = eval::num_of(&i).ok_or_else(|| EvalError::new("BHC-E311", "index must be a Num"))?;
        let n = n.max(0.0) as usize;
        match s {
            Value::List(xs) | Value::Tuple(xs) => Ok(xs.get(n).cloned().unwrap_or(Value::Missing)),
            other => Err(EvalError::new("BHC-E312", format!("cannot index {}", other.type_name()))),
        }
    })
}

pub fn concat(host: &dyn Host, a: Dist, b: Dist) -> EResult<Dist> {
    let limit = host.budget().len_limit;
    Dist::join(a, b, move |p, q| {
        let mut xs = eval::as_list(&p)?;
        xs.extend(eval::as_list(&q)?);
        if xs.len() > limit {
            return Err(EvalError::new("BHC-E302", "list exceeds len_limit"));
        }
        Ok(Value::list(xs))
    })
}

pub fn closure(fn_id: usize, caps: Vec<Dist>) -> EResult<Dist> {
    eval::combine_all(caps, move |vals| {
        Ok(Value::Closure(Rc::new(Closure { fn_id, upvalues: vals, fast: Vec::new() })))
    })
}

pub fn expect(src: Dist) -> EResult<Dist> {
    Ok(Dist::One(src.expect()?))
}

pub fn call_value(host: &dyn Host, callee: Dist, args: Vec<Dist>) -> EResult<Dist> {
    host.call_value(callee, args)
}

/// Static call: one invocation per trajectory when any argument carries a distribution.
pub fn call_static<F>(args: Vec<Dist>, invoke: F) -> EResult<Dist>
where
    F: Fn(Vec<Value>) -> EResult<Dist>,
{
    let any_dist = args.iter().any(|d| !d.is_one());
    if any_dist {
        let comb = eval::combine_all(args, |vals| Ok(Value::list(vals)))?;
        Dist::chain(comb, move |v| {
            let vals = eval::as_list(&v)?;
            invoke(vals)
        })
    } else {
        let vals: Vec<Value> = args.into_iter().map(|d| d.single().cloned().expect("one")).collect();
        invoke(vals)
    }
}

// ---------------------------------------------------------------------------------------------
// data and host
// ---------------------------------------------------------------------------------------------

pub fn data(
    host: &dyn Host,
    sets: &[crate::ir::DataSet],
    set: u32,
    access: &DataCode,
    arg: Option<Dist>,
) -> EResult<Dist> {
    let ds = sets
        .get(set as usize)
        .ok_or_else(|| EvalError::new("BHC-E508", format!("data set {set} out of range")))?;
    Ok(match access {
        DataCode::All => {
            if ds.rows.len() > host.budget().len_limit {
                return Err(EvalError::new("BHC-E302", format!("data set `{}` exceeds len_limit", ds.name)));
            }
            Dist::One(Value::List(ds.rows.clone()))
        }
        DataCode::Len => Dist::One(Value::Num(ds.rows.len() as f64)),
        DataCode::ByKey(_) => {
            let k = arg.expect("by_key has an argument");
            k.try_map(|kv| {
                let h = kv.hash();
                Ok(match ds.index.get(&h) {
                    Some(i) => Value::Some(Box::new(ds.rows[*i].clone())),
                    None => Value::None,
                })
            })?
        }
        DataCode::ByIndex(_) => {
            let k = arg.expect("by_index has an argument");
            k.try_map(|kv| {
                let n = eval::num_of(&kv).ok_or_else(|| EvalError::new("BHC-E311", "by_index expects a Num"))?;
                Ok(ds.rows.get(n.max(0.0) as usize).cloned().unwrap_or(Value::Missing))
            })?
        }
    })
}

pub fn host_call(host: &dyn Host, name: Sym, args: Vec<Dist>) -> EResult<Dist> {
    let f = match host.interner().name(name) {
        "rng.splitmix" => {
            let seed = args.first().and_then(|d| d.single()).and_then(eval::num_of).unwrap_or(0.0);
            Value::Num(eval::splitmix(seed.to_bits()))
        }
        other => return Err(EvalError::new("BHC-E402", format!("host capability `{other}` is not implemented"))),
    };
    eval::combine_all(args, move |_| Ok(f.clone()))
}

// ---------------------------------------------------------------------------------------------
// branching and choice (the support-set machinery, §9.8.2.2)
// ---------------------------------------------------------------------------------------------

/// Run `then`/`else` per support point of `cond`.
///
/// The branch closure receives the register file back by `&mut`, so a branch body can write its
/// result register and be evaluated once per support point (§9.8.2.2) without the caller holding a
/// second mutable borrow.
pub fn fork<F, G>(regs: &mut [Dist], cond: Dist, then: F, els: G) -> EResult<Dist>
where
    F: Fn(&mut [Dist]) -> EResult<Dist>,
    G: Fn(&mut [Dist]) -> EResult<Dist>,
{
    Dist::chain(cond, |v| {
        if v.truthy() {
            then(regs)
        } else {
            els(regs)
        }
    })
}

pub struct ChoiceCaseSpec {
    pub weight: Dist,
    pub label: Option<Sym>,
    /// Body of one case; takes the register file so it can read/write the shared frame.
    pub body: u32,
}

/// Evaluate weighted alternatives, allocating one choice instance for this site (§9.8.2).
///
/// `run` executes one case body against `regs`; both executors pass their own block runner.
pub fn choose<F>(
    host: &dyn Host,
    regs: &mut [Dist],
    cases: Vec<ChoiceCaseSpec>,
    mut run: F,
) -> EResult<Dist>
where
    F: FnMut(u32, &mut [Dist]) -> EResult<Dist>,
{
    let mut weights = Vec::with_capacity(cases.len());
    let mut total = 0.0;
    for c in &cases {
        let w = match c.weight.single() {
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
    let site = host.begin_choice();
    let mut out = Vec::new();
    for (i, c) in cases.into_iter().enumerate() {
        let p = weights[i] / total;
        host.record_choice(site, i as u32, p, c.label);
        let inner = run(c.body, regs)?;
        match inner {
            Dist::One(v) => out.push(crate::value::Pt {
                w: p,
                assigns: Rc::new(vec![crate::value::Assign { choice: site, branch: i as u32, p }]),
                v,
            }),
            Dist::Many(ps) => {
                for q in ps {
                    let mut assigns = q.assigns.to_vec();
                    assigns.push(crate::value::Assign { choice: site, branch: i as u32, p });
                    assigns.sort_by_key(|a| a.choice);
                    out.push(crate::value::Pt { w: p * q.w, assigns: Rc::new(assigns), v: q.v });
                }
            }
        }
    }
    Ok(Dist::Many(out))
}

// ---------------------------------------------------------------------------------------------
// pattern binding
// ---------------------------------------------------------------------------------------------

/// Test a refutable pattern and write its bindings. Returns whether it matched.
///
/// A distributed scrutinee binds each support point separately; every point must agree on whether
/// the pattern matches, otherwise the choice of block is itself random and the pack must collapse it.
pub fn match_pat(host: &dyn Host, pat: &crate::ast::Pattern, src: Dist, regs: &mut [Dist]) -> EResult<bool> {
    match &src {
        Dist::One(x) => {
            let mut plain: Vec<Value> =
                regs.iter().map(|d| d.single().cloned().unwrap_or(Value::Missing)).collect();
            let hit = eval::bind_pattern_into(host.interner(), pat, x, &mut plain);
            if hit {
                for (i, v) in plain.into_iter().enumerate() {
                    if let Some(slot) = regs.get_mut(i) {
                        *slot = Dist::One(v);
                    }
                }
            }
            Ok(hit)
        }
        Dist::Many(pts) => {
            let mut seen: Option<bool> = None;
            let mut bound: Vec<Vec<Value>> = Vec::with_capacity(pts.len());
            for pt in pts {
                let mut plain: Vec<Value> =
                    regs.iter().map(|d| d.single().cloned().unwrap_or(Value::Missing)).collect();
                let hit = eval::bind_pattern_into(host.interner(), pat, &pt.v, &mut plain);
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
                for (i, slot) in regs.iter_mut().enumerate() {
                    let changed = bound.iter().any(|b| !b[i].same_as(&bound[0][i]));
                    if !changed {
                        continue;
                    }
                    let vals: Vec<crate::value::Pt> = pts
                        .iter()
                        .enumerate()
                        .map(|(k, pt)| crate::value::Pt {
                            w: pt.w,
                            assigns: pt.assigns.clone(),
                            v: bound[k][i].clone(),
                        })
                        .collect();
                    *slot = Dist::Many(vals);
                }
            }
            Ok(hit)
        }
    }
}
