//! Runtime values and the support-set representation (spec §2.1, §9.6.3, §9.8.2.2).

use alloc::{boxed::Box, format, vec, vec::Vec};
use alloc::rc::Rc;
use core::cell::OnceCell;
use hashbrown::HashMap;

use crate::sym::Sym;

#[derive(Clone, Debug)]
pub enum Value {
    Num(f64),
    Bool(bool),
    Sym(Sym),
    Unit,
    Str(Rc<str>),
    List(Rc<Vec<Value>>),
    Tuple(Rc<Vec<Value>>),
    Record(Rc<Record>),
    Closure(Rc<Closure>),
    /// A first-class builtin; `map(xs, min)` is legal because builtins are ordinary functions.
    Builtin(u8),
    Some(Box<Value>),
    None,
    Ok(Box<Value>),
    Err(Box<Value>),
    /// A field/position that does not exist. Only reachable through `field`/`get_or`/`at` on
    /// absent data; reading it as a number is an error the pack must have handled.
    Missing,
}

/// A record: insertion-ordered fields plus a slot index for wide records.
///
/// `fields` remains the only source of order — `keys`, `show`, JSON output, `hash` and `same` all
/// walk it — so the index can never change what a record looks like or how it compares.
///
/// The index is a cache, not a second source of truth. Three measurements shaped it:
///
/// * Most records in pack code are narrow (single-digit fields), where scanning one `Vec` beats a
///   hash probe. Below [`INDEX_MIN`] the table is never built, so `get`/`set` are the plain scan
///   they always were.
/// * Maintaining a table on every `set` doubles the cost of building a 44-field record (≈0.9 µs →
///   1.7 µs measured) and pays it for every record, indexed or not. So `set` only keeps the table
///   up to date once a read has materialised it; construction never allocates.
/// * Inlining the table costs 48 bytes in `Record`, which showed up as a ~10 % slowdown of the
///   whole `panel` path even though the lookups themselves got faster. It is boxed instead, so
///   `Record` stays at 40 bytes and only indexed records pay for the table.
#[derive(Default)]
pub struct Record {
    /// Field symbol → value, in insertion order. Order is observable (fold order).
    pub fields: Vec<(Sym, Value)>,
    /// Originating schema id, when built from a schema literal or a data binding.
    pub schema: Option<u32>,
    /// `Sym` → position in `fields`, materialised on the first lookup of a wide record. Never
    /// iterated, so it cannot leak into any ordering.
    index: OnceCell<Box<HashMap<Sym, u32>>>,
}

/// Width at which a probe (≈3.5 ns) beats a scan (≈0.6 ns per field).
const INDEX_MIN: usize = 12;

/// The text the derive produced before the index existed: the cache is an implementation detail
/// and must not leak into `trace` output or any other host-facing `{:?}` rendering.
impl core::fmt::Debug for Record {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.debug_struct("Record")
            .field("fields", &self.fields)
            .field("schema", &self.schema)
            .finish()
    }
}

impl Clone for Record {
    fn clone(&self) -> Self {
        // A warm cache is copied rather than rebuilt; a cold one stays cold.
        let index = OnceCell::new();
        if let Some(m) = self.index.get() {
            let _ = index.set(Box::new((**m).clone()));
        }
        Self { fields: self.fields.clone(), schema: self.schema, index }
    }
}

impl Record {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get(&self, k: Sym) -> Option<&Value> {
        if self.fields.len() >= INDEX_MIN {
            let m = self.index.get_or_init(|| {
                let mut m = HashMap::with_capacity(self.fields.len());
                for (i, (f, _)) in self.fields.iter().enumerate() {
                    m.insert(*f, i as u32);
                }
                Box::new(m)
            });
            if let Some(&i) = m.get(&k) {
                if let Some((f, v)) = self.fields.get(i as usize) {
                    if *f == k {
                        return Some(v);
                    }
                }
            } else if m.len() == self.fields.len() {
                // The table covers every slot, so a miss is a real absence.
                return None;
            }
        }
        // Narrow record, or a table that lost track of a hand-pushed field: scan, which is what
        // this always used to do.
        self.fields.iter().find(|(f, _)| *f == k).map(|(_, v)| v)
    }

    pub fn set(&mut self, k: Sym, v: Value) {
        if self.fields.len() >= INDEX_MIN {
            if let Some(m) = self.index.get_mut() {
                if let Some(&i) = m.get(&k) {
                    if let Some(slot) = self.fields.get_mut(i as usize) {
                        if slot.0 == k {
                            slot.1 = v;
                            return;
                        }
                    }
                }
                // New key — or a stale entry: scan so no key can appear twice (a duplicate would
                // change `fields` order and `len`), then record the slot.
                match self.fields.iter().position(|(f, _)| *f == k) {
                    Some(i) => {
                        self.fields[i].1 = v;
                        m.insert(k, i as u32);
                    }
                    None => {
                        m.insert(k, self.fields.len() as u32);
                        self.fields.push((k, v));
                    }
                }
                return;
            }
        }
        // No cache (every narrow record, and every record until it is first read): the old path.
        if let Some(slot) = self.fields.iter_mut().find(|(f, _)| *f == k) {
            slot.1 = v;
        } else {
            self.fields.push((k, v));
        }
    }

    pub fn with(mut self, k: Sym, v: Value) -> Self {
        self.set(k, v);
        self
    }
}

#[derive(Clone, Debug)]
pub struct Closure {
    pub fn_id: usize,
    pub upvalues: Vec<Value>,
    /// 已编码的捕获值（arena 句柄）。AOT 运行时用它们组帧，避免每次回调重新编码；
    /// 解释器构造的闭包留空。
    pub fast: Vec<i64>,
}

impl Value {
    pub fn list(v: Vec<Value>) -> Self {
        Value::List(Rc::new(v))
    }

    pub fn tuple(v: Vec<Value>) -> Self {
        Value::Tuple(Rc::new(v))
    }

    pub fn record(r: Record) -> Self {
        Value::Record(Rc::new(r))
    }

    pub fn type_name(&self) -> &'static str {
        match self {
            Value::Num(_) => "Num",
            Value::Bool(_) => "Bool",
            Value::Sym(_) => "Sym",
            Value::Unit => "Unit",
            Value::Str(_) => "Str",
            Value::List(_) => "List",
            Value::Tuple(_) => "Tuple",
            Value::Record(_) => "Record",
            Value::Closure(_) | Value::Builtin(_) => "Fn",
            Value::Some(_) | Value::None => "Option",
            Value::Ok(_) | Value::Err(_) => "Result",
            Value::Missing => "Missing",
        }
    }

    /// Truthiness for `Bool` contexts. `Bool` is a compile-time-only type per spec §2.1, lowered
    /// to 0/1, so `Num` is accepted here as well.
    pub fn truthy(&self) -> bool {
        match self {
            Value::Bool(b) => *b,
            Value::Num(n) => *n != 0.0 && !n.is_nan(),
            Value::Unit | Value::Missing | Value::None => false,
            _ => true,
        }
    }

    pub fn same_as(&self, other: &Value) -> bool {
        match (self, other) {
            (Value::Num(a), Value::Num(b)) => a == b,
            (Value::Bool(a), Value::Bool(b)) => a == b,
            (Value::Sym(a), Value::Sym(b)) => a == b,
            (Value::Str(a), Value::Str(b)) => a == b,
            (Value::Unit, Value::Unit) | (Value::None, Value::None) | (Value::Missing, Value::Missing) => true,
            (Value::List(a), Value::List(b)) | (Value::Tuple(a), Value::Tuple(b)) => {
                a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| x.same_as(y))
            }
            (Value::Some(a), Value::Some(b)) | (Value::Ok(a), Value::Ok(b)) | (Value::Err(a), Value::Err(b)) => {
                a.same_as(b)
            }
            (Value::Record(a), Value::Record(b)) => {
                a.fields.len() == b.fields.len()
                    && a.fields.iter().all(|(k, v)| b.get(*k).is_some_and(|w| v.same_as(w)))
            }
            (Value::Closure(a), Value::Closure(b)) => a.fn_id == b.fn_id,
            (Value::Builtin(a), Value::Builtin(b)) => a == b,
            _ => false,
        }
    }

    pub fn hash_into(&self, h: &mut u64) {
        fn mix(h: &mut u64, v: u64) {
            *h ^= v;
            *h = h.wrapping_mul(0x100000001b3);
        }
        match self {
            Value::Num(n) => {
                mix(h, 1);
                mix(h, canon_bits(*n));
            }
            Value::Bool(b) => {
                mix(h, 2);
                mix(h, u64::from(*b));
            }
            Value::Sym(s) => {
                mix(h, 3);
                mix(h, u64::from(s.0));
            }
            Value::Str(s) => {
                mix(h, 4);
                for b in s.as_bytes() {
                    mix(h, u64::from(*b));
                }
            }
            Value::Unit => mix(h, 5),
            Value::List(v) => {
                mix(h, 6);
                for x in v.iter() {
                    x.hash_into(h);
                }
            }
            Value::Tuple(v) => {
                mix(h, 15);
                for x in v.iter() {
                    x.hash_into(h);
                }
            }
            Value::Record(r) => {
                mix(h, 7);
                for (k, v) in &r.fields {
                    mix(h, u64::from(k.0));
                    v.hash_into(h);
                }
            }
            Value::Closure(c) => {
                mix(h, 8);
                mix(h, c.fn_id as u64);
                for u in &c.upvalues {
                    u.hash_into(h);
                }
            }
            Value::Builtin(b) => {
                mix(h, 14);
                mix(h, u64::from(*b));
            }
            Value::Some(v) => {
                mix(h, 9);
                v.hash_into(h);
            }
            Value::None => mix(h, 10),
            Value::Ok(v) => {
                mix(h, 11);
                v.hash_into(h);
            }
            Value::Err(v) => {
                mix(h, 12);
                v.hash_into(h);
            }
            Value::Missing => mix(h, 13),
        }
    }

    pub fn hash(&self) -> u64 {
        let mut h = 0xcbf29ce484222325u64;
        self.hash_into(&mut h);
        h
    }
}

pub const CANON_NAN: u64 = 0x7ff8_0000_0000_0000;

/// Canonicalize NaN so support-set merging and memo keys see one representation (spec §9.6.4).
/// Structural value equality (`dedup_by` keys, and anywhere a Host needs to compare values).
///
/// Numbers compare by their **canonicalised** bit pattern, so `-0.0 == 0.0` and every NaN equals
/// every other NaN — the same convention the value-keyed memo uses.
pub fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Num(x), Value::Num(y)) => canon_bits(*x) == canon_bits(*y),
        (Value::Bool(x), Value::Bool(y)) => x == y,
        (Value::Sym(x), Value::Sym(y)) => x == y,
        (Value::Unit, Value::Unit) => true,
        (Value::Str(x), Value::Str(y)) => x == y,
        (Value::List(x), Value::List(y)) | (Value::Tuple(x), Value::Tuple(y)) => {
            x.len() == y.len() && x.iter().zip(y.iter()).all(|(p, q)| same(p, q))
        }
        (Value::Record(x), Value::Record(y)) => {
            x.fields.len() == y.fields.len()
                && x.fields.iter().zip(y.fields.iter()).all(|((k1, v1), (k2, v2))| k1 == k2 && same(v1, v2))
        }
        (Value::Closure(x), Value::Closure(y)) => {
            x.fn_id == y.fn_id
                && x.upvalues.len() == y.upvalues.len()
                && x.upvalues.iter().zip(y.upvalues.iter()).all(|(p, q)| same(p, q))
        }
        (Value::Builtin(x), Value::Builtin(y)) => x == y,
        (Value::Some(x), Value::Some(y)) | (Value::Ok(x), Value::Ok(y)) | (Value::Err(x), Value::Err(y)) => same(x, y),
        (Value::None, Value::None) | (Value::Missing, Value::Missing) => true,
        _ => false,
    }
}

pub fn canon(n: f64) -> f64 {
    if n.is_nan() { f64::from_bits(CANON_NAN) } else { n }
}

pub fn canon_bits(n: f64) -> u64 {
    canon(n).to_bits()
}

/// One branch assignment: `choice` instance `choice` took branch `branch` with local
/// probability `p`.
#[derive(Clone, Debug, PartialEq)]
pub struct Assign {
    pub choice: u32,
    pub branch: u32,
    pub p: f64,
}

/// A support point of a distribution: path probability, branch assignment, value.
#[derive(Clone, Debug)]
pub struct Pt {
    pub w: f64,
    pub assigns: Rc<Vec<Assign>>,
    pub v: Value,
}

/// A value that may be a distribution over support points (spec §9.8.2.2).
///
/// Programs without `choice` stay in `One`, so the entire feature costs one discriminant on the
/// normal path (§9.8.13).
#[derive(Clone, Debug)]
pub enum Dist {
    One(Value),
    Many(Vec<Pt>),
}

pub type EResult<T> = Result<T, crate::eval::EvalError>;

impl Dist {
    pub fn one(v: Value) -> Self {
        Dist::One(v)
    }

    pub fn points(self) -> Vec<Pt> {
        match self {
            Dist::One(v) => vec![Pt { w: 1.0, assigns: Rc::new(Vec::new()), v }],
            Dist::Many(ps) => ps,
        }
    }

    /// Number of *distinct values* in the support set (§9.8.2.2 "按值合并"): this is the real cost
    /// variable for `max_support` (§9.8.4), while distinct worlds are kept for tree topology.
    pub fn support_len(&self) -> usize {
        match self {
            Dist::One(_) => 1,
            Dist::Many(ps) => {
                let mut seen: Vec<u64> = Vec::with_capacity(ps.len());
                for p in ps {
                    let h = p.v.hash();
                    if !seen.contains(&h) {
                        seen.push(h);
                    }
                }
                seen.len()
            }
        }
    }

    /// Total probability mass of each distinct value, merged (§9.8.2.2).
    pub fn value_merged(&self) -> Vec<(u64, f64)> {
        let mut out: Vec<(u64, f64)> = Vec::new();
        for p in self.clone().points() {
            let h = p.v.hash();
            match out.iter_mut().find(|(k, _)| *k == h) {
                Some(slot) => slot.1 += p.w,
                None => out.push((h, p.w)),
            }
        }
        out
    }

    pub fn as_ref_points(&self) -> Vec<Pt> {
        self.clone().points()
    }

    pub fn is_one(&self) -> bool {
        matches!(self, Dist::One(_))
    }

    pub fn single(&self) -> Option<&Value> {
        match self {
            Dist::One(v) => Some(v),
            Dist::Many(_) => None,
        }
    }

    pub fn map<F: FnMut(Value) -> Value>(self, mut f: F) -> Dist {
        match self {
            Dist::One(v) => Dist::One(f(v)),
            Dist::Many(ps) => Dist::Many(
                ps.into_iter()
                    .map(|p| Pt { w: p.w, assigns: p.assigns, v: f(p.v) })
                    .collect(),
            ),
        }
    }

    /// `#[inline(never)]`: a generic instantiated at every call site would multiply an AOT artifact
    /// (each block that maps over a `Dist` would carry its own copy).
    #[inline(never)]
    pub fn try_map<F: FnMut(Value) -> EResult<Value>>(self, mut f: F) -> EResult<Dist> {
        Ok(match self {
            Dist::One(v) => Dist::One(f(v)?),
            Dist::Many(ps) => {
                let mut out = Vec::with_capacity(ps.len());
                for p in ps {
                    out.push(Pt { w: p.w, assigns: p.assigns, v: f(p.v)? });
                }
                Dist::Many(out)
            }
        })
    }

    /// Exact pointwise combination (spec §9.8.2.2). Points whose branch assignments conflict are
    /// incompatible worlds and are dropped; shared branch probabilities are divided out once so
    /// the result carries path probabilities.
    #[inline(never)]
    pub fn join<F>(a: Dist, b: Dist, mut f: F) -> EResult<Dist>
    where
        F: FnMut(Value, Value) -> EResult<Value>,
    {
        match (a, b) {
            (Dist::One(va), Dist::One(vb)) => Ok(Dist::One(f(va, vb)?)),
            (Dist::One(va), Dist::Many(pb)) => {
                let mut out = Vec::with_capacity(pb.len());
                for p in pb {
                    out.push(Pt { w: p.w, assigns: p.assigns, v: f(va.clone(), p.v)? });
                }
                Ok(Dist::Many(out))
            }
            (Dist::Many(pa), Dist::One(vb)) => {
                let mut out = Vec::with_capacity(pa.len());
                for p in pa {
                    out.push(Pt { w: p.w, assigns: p.assigns, v: f(p.v, vb.clone())? });
                }
                Ok(Dist::Many(out))
            }
            (Dist::Many(pa), Dist::Many(pb)) => {
                let mut out = Vec::with_capacity(pa.len() * pb.len());
                for x in &pa {
                    for y in &pb {
                        let Some(shared) = shared_prob(&x.assigns, &y.assigns) else { continue };
                        out.push(Pt {
                            w: x.w * y.w / shared,
                            assigns: Rc::new(merge_assigns(&x.assigns, &y.assigns)),
                            v: f(x.v.clone(), y.v.clone())?,
                        });
                    }
                }
                Ok(Dist::Many(out))
            }
        }
    }

    /// Sequential composition: `f` is applied independently at each point, and each inner point
    /// inherits the outer point's probability and assignment (its choices are fresh instances).
    #[inline(never)]
    pub fn chain<F>(a: Dist, mut f: F) -> EResult<Dist>
    where
        F: FnMut(Value) -> EResult<Dist>,
    {
        match a {
            Dist::One(v) => f(v),
            Dist::Many(ps) => {
                let mut out = Vec::new();
                for p in ps {
                    match f(p.v)? {
                        Dist::One(v) => out.push(Pt { w: p.w, assigns: p.assigns, v }),
                        Dist::Many(mut ips) => {
                            for q in ips.drain(..) {
                                out.push(Pt {
                                    w: p.w * q.w,
                                    assigns: Rc::new(merge_assigns(&p.assigns, &q.assigns)),
                                    v: q.v,
                                });
                            }
                        }
                    }
                }
                Ok(Dist::Many(out))
            }
        }
    }

    /// Explicit collapse to the expectation, only when a pack asks for it (`expected(x)`).
    pub fn expect(self) -> EResult<Value> {
        let pts = self.points();
        if pts.len() == 1 {
            return Ok(pts[0].v.clone());
        }
        let mut sum = 0.0;
        for p in &pts {
            let n = crate::eval::num_of(&p.v).ok_or_else(|| {
                crate::eval::EvalError::new(
                    "BHC-E344",
                    format!("expected() requires numeric supports, got {}", p.v.type_name()),
                )
            })?;
            sum += p.w * n;
        }
        Ok(Value::Num(canon(sum)))
    }
}

fn shared_prob(a: &[Assign], b: &[Assign]) -> Option<f64> {
    let mut prod = 1.0;
    for x in a {
        if let Some(y) = b.iter().find(|y| y.choice == x.choice) {
            if y.branch != x.branch {
                return None;
            }
            prod *= x.p;
        }
    }
    Some(prod)
}

fn merge_assigns(a: &[Assign], b: &[Assign]) -> Vec<Assign> {
    if b.is_empty() {
        return a.to_vec();
    }
    if a.is_empty() {
        return b.to_vec();
    }
    let mut out = Vec::with_capacity(a.len() + b.len());
    let (mut i, mut j) = (0, 0);
    while i < a.len() && j < b.len() {
        match a[i].choice.cmp(&b[j].choice) {
            core::cmp::Ordering::Less => {
                out.push(a[i].clone());
                i += 1;
            }
            core::cmp::Ordering::Greater => {
                out.push(b[j].clone());
                j += 1;
            }
            core::cmp::Ordering::Equal => {
                out.push(a[i].clone());
                i += 1;
                j += 1;
            }
        }
    }
    out.extend_from_slice(&a[i..]);
    out.extend_from_slice(&b[j..]);
    out
}
