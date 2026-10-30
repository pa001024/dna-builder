//! LLVM back end: compile a pack to native code instead of re-implementing the VM.
//!
//! The earlier emitters lowered the SSA register machine into Rust functions that still dispatched
//! every instruction through the shared `step::` helpers — that keeps the interpreter's cost model
//! and only changes its syntax. This back end does what a compiler does:
//!
//! * one `define` per pack function, with typed parameters (`double` for `Num`, an `i64`
//!   NaN-boxed `BVal` otherwise) and **direct** calls between them;
//! * registers become `alloca`s that `-O2`'s mem2reg promotes to SSA values;
//! * control flow is real `br` structure instead of block-function calls;
//! * arithmetic on `Num` is native `fadd`/`fmul`/`fcmp`.
//!
//! Anything that genuinely needs the dynamic object model (records, symbols, builtins, data sets,
//! patterns) is a call into this crate's runtime (`src/lib.rs`) — a compiler's runtime library. Higher-order builtins
//! call *back* into the compiled module through `bhub_set_dispatch`.
//!
//! Scope: deterministic packs only. A pack that can produce a support set needs the distribution
//! machinery, which stays on the interpreter path; `emit_ll` returns `None` in that case.

use alloc::{format, string::String, string::ToString, vec, vec::Vec};
use core::fmt::Write as _;

use buildhub_core::ast::Pattern;
use buildhub_core::ssa::{Code, CodeFn, DataCode, Instr};

/// Register typing: a register is `Num` when it holds a bare `f64` instead of a boxed handle.
///
/// This is the only thing standing between "generated code is fast" and "every intermediate value
/// is an arena handle". It is a fixpoint because calls depend on their callees' return shape; the
/// direction is monotone (`false -> true`), so it converges.
pub(crate) struct Types {
    pub regs: Vec<Vec<Kind>>,
    pub ret_num: Vec<bool>,
}

fn builtin_num(b: buildhub_core::ir::Builtin, args_num: bool) -> bool {
    use buildhub_core::ir::Builtin::*;
    match b {
        Len | NumOf | Count | StrLen | Inf | Nan => true,
        Round | RoundJs | Floor | Ceil | Trunc | Sqrt | ToFixed | Log => args_num,
        Min | Max | Clamp | Abs | Pow | SafeDiv => args_num,
        _ => false,
    }
}

impl Types {
    pub fn build(code: &Code, params: &[Vec<bool>]) -> Types {
        use buildhub_core::ast::{BinOp, UnOp};
        let mut t = Types {
            regs: code.fns.iter().map(|f| vec![Kind::Handle; f.nregs as usize]).collect(),
            ret_num: vec![false; code.fns.len()],
        };
        for (fi, f) in code.fns.iter().enumerate() {
            let ncap = f.ncaptures as usize;
            for p in 0..f.nparams as usize {
                if param_is_num(params, fi, p) {
                    t.regs[fi][ncap + p] = Kind::Num;
                }
            }
        }
        loop {
            let mut changed = false;
            for (fi, f) in code.fns.iter().enumerate() {
                for blk in &f.blocks {
                    for i in blk {
                        let num = |r: u32| t.regs[fi][r as usize] == Kind::Num;
                        let boolean = |r: u32| t.regs[fi][r as usize] == Kind::Bool;
                        let (dst, kind) = match i {
                            Instr::Const { dst, val } => (
                                *dst,
                                match code.consts.get(*val as usize) {
                                    Some(buildhub_core::value::Value::Num(_)) => Kind::Num,
                                    Some(buildhub_core::value::Value::Bool(_)) => Kind::Bool,
                                    _ => Kind::Handle,
                                },
                            ),
                            Instr::Bin { dst, op, a, b } => {
                                let both_num = num(*a) && num(*b);
                                let both_bool = boolean(*a) && boolean(*b);
                                (
                                    *dst,
                                    match op {
                                        BinOp::Add | BinOp::Sub | BinOp::Mul | BinOp::Div | BinOp::FloorDiv | BinOp::Rem
                                            if both_num => Kind::Num,
                                        BinOp::Eq | BinOp::Ne => Kind::Bool,
                                        BinOp::Lt | BinOp::Le | BinOp::Gt | BinOp::Ge if both_num => Kind::Bool,
                                        BinOp::And | BinOp::Or if both_bool => Kind::Bool,
                                        _ => Kind::Handle,
                                    },
                                )
                            }
                            Instr::Un { dst, op, a } => (
                                *dst,
                                match op {
                                    UnOp::Neg if num(*a) => Kind::Num,
                                    UnOp::Not if boolean(*a) => Kind::Bool,
                                    _ => Kind::Handle,
                                },
                            ),
                            Instr::Prim { dst, b, args } => {
                                use buildhub_core::ir::Builtin as B;
                                let all = args.iter().all(|r| num(*r));
                                let k = match b {
                                    B::IsNum | B::IsList | B::StrEq => Kind::Bool,
                                    B::StrLen | B::StrAt => Kind::Num,
                                    _ if builtin_num(*b, all) => Kind::Num,
                                    _ => Kind::Handle,
                                };
                                (*dst, k)
                            }
                            Instr::MatchPat { dst, src, pat } => {
                                // 直接把值绑定到变量的模式（`let x = e`）让绑定槽继承源寄存器
                                // 的类别：否则布尔、数值都要经过装箱调用才能用。
                                let sk = t.regs[fi][*src as usize];
                                if sk != Kind::Handle {
                                    if let Some(slot) = bound_slot(&code.patterns[*pat as usize]) {
                                        if let Some(k) = t.regs[fi].get_mut(slot as usize) {
                                            if *k == Kind::Handle {
                                                *k = sk;
                                                changed = true;
                                            }
                                        }
                                    }
                                }
                                (*dst, Kind::Bool)
                            }
                            Instr::Call { dst, fn_id, .. } => (
                                *dst,
                                if t.ret_num.get(*fn_id as usize).copied().unwrap_or(false) { Kind::Num } else { Kind::Handle },
                            ),
                            // These go through the runtime and come back as a handle; only a
                            // numeric result can be unboxed directly.
                            Instr::GetOr { dst, def, .. } => (
                                *dst,
                                if num(*def) { Kind::Num } else { Kind::Handle },
                            ),
                            Instr::Expect { dst, src } => (
                                *dst,
                                if num(*src) { Kind::Num } else { Kind::Handle },
                            ),
                            _ => continue,
                        };
                        if kind != Kind::Handle && t.regs[fi][dst as usize] == Kind::Handle {
                            t.regs[fi][dst as usize] = kind;
                            changed = true;
                        }
                    }
                }
                // A function returns a bare number only when every `Ret` source is one.
                let mut any = false;
                let mut all_num = true;
                for blk in &f.blocks {
                    for i in blk {
                        if let Instr::Ret { src } = i {
                            any = true;
                            all_num &= t.regs[fi][*src as usize] == Kind::Num;
                        }
                    }
                }
                if any && all_num && !t.ret_num[fi] {
                    t.ret_num[fi] = true;
                    changed = true;
                }
            }
            if !changed {
                break;
            }
        }
        t
    }
}

/// What a register slot holds: a bare `f64`, a bare `i1`, or a NaN-boxed `i64` `BVal`.
///
/// `Bool` exists because every branch otherwise pays `mk_bool` + `truthy` (two calls and one arena
/// slot) for a comparison whose result is only ever tested.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Handle,
    Num,
    Bool,
}

fn ty_of(k: Kind) -> &'static str {
    match k {
        Kind::Num => "double",
        Kind::Bool => "i1",
        Kind::Handle => "i64",
    }
}

/// `0xFFF8_0000_0000_0000` as a signed `i64`. Every tagged `BVal` is `>=` this, every number `<`.
/// Written in decimal because that is the one integer form every LLVM text parser accepts.
const TAG_FLOOR: i64 = -2251799813685248;
/// `TAG_MASK | TAG_BOOL` as a signed `i64`: a boolean `BVal` is this word with the low bit set.
const BVAL_BOOL: i64 = -1407374883553280;
/// Entries per function in the emitted memo table (direct-mapped).
const MEMO_SLOTS: usize = 64;
/// 模式里唯一绑定槽的寄存器（不做解构的 `Bind`），供类型传播用。
fn bound_slot(p: &buildhub_core::ast::Pattern) -> Option<u32> {
    use buildhub_core::ast::Pattern as P;
    let bind = match p {
        P::Bind(n) => n,
        P::Some(inner) => match &**inner {
            P::Bind(n) => n,
            _ => return None,
        },
        _ => return None,
    };
    buildhub_core::resolve::split_binding(bind).map(|(s, _)| s)
}

/// Odd multiplier that spreads the argument words over the memo slots.
const HASH_MIX: i64 = -7046029254386353131;
/// `(TAG_MASK | TAG_SYM) >> 48`: the top 16 bits of a symbol `BVal`.
const SYM_HI: i64 = 0xFFFA;

struct Fn<'a> {
    code: &'a Code,
    f: &'a CodeFn,
    kind: &'a [Kind],
    params: &'a [Vec<bool>],
    ret_num: bool,
    ret_num_table: &'a [bool],
    /// Registers whose only producer is a constant `Eq`/`Ne` can decide here.
    consts: Vec<Option<ConstVal>>,
    /// Registers whose only producer is a constructor `Tag`, so `Eq`/`Ne` can look inside.
    tags: Vec<Option<(buildhub_core::ssa::TagKind, u32)>>,
    s: String,
    n: u32,
    /// Per block: the register its value lands in, and the label to continue at afterwards.
    dest: Vec<Option<(u32, String)>>,
}

impl Fn<'_> {
    fn tmp(&mut self) -> String {
        self.n += 1;
        format!("%t{}", self.n)
    }
    fn label(&self, blk: u32) -> String {
        format!("b{}_{}", self.f.fn_id, blk)
    }
    fn kind_of(&self, r: u32) -> Kind {
        self.kind.get(r as usize).copied().unwrap_or(Kind::Handle)
    }
    fn is_num_reg(&self, r: u32) -> bool {
        self.kind_of(r) == Kind::Num
    }
    fn is_bool_reg(&self, r: u32) -> bool {
        self.kind_of(r) == Kind::Bool
    }
    /// The truthiness of a register as an `i1`, without boxing a boolean value.
    fn bool_of(&mut self, r: u32) -> String {
        match self.kind_of(r) {
            Kind::Bool => {
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = load i1, ptr %r{r}");
                t
            }
            Kind::Num => {
                let v = self.num_of(r);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = fcmp une double {v}, 0.0");
                t
            }
            Kind::Handle => {
                let h = self.handle(r);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i32 @bhub_truthy(i64 {h})");
                let b = self.tmp();
                let _ = writeln!(self.s, "  {b} = icmp ne i32 {t}, 0");
                b
            }
        }
    }
    /// Store an `i1` into a register slot, boxing it when the slot holds a handle.
    fn store_bool(&mut self, r: u32, v: &str) {
        match self.kind_of(r) {
            Kind::Bool => {
                let _ = writeln!(self.s, "  store i1 {v}, ptr %r{r}");
            }
            _ => {
                let b = self.bool_bval(v);
                self.store_handle(r, &b);
            }
        }
    }
    /// A boolean as a tagged `BVal` word, without the cross-module constructor call.
    fn bool_bval(&mut self, v: &str) -> String {
        let z = self.tmp();
        let _ = writeln!(self.s, "  {z} = zext i1 {v} to i64");
        let b = self.tmp();
        let _ = writeln!(self.s, "  {b} = or i64 {z}, {BVAL_BOOL}");
        b
    }
    fn param_num(&self, p: usize) -> bool {
        param_is_num(self.params, self.f.fn_id as usize, p)
    }
    /// Canonicalise a NaN result in place: two instructions instead of a cross-module call.
    /// `canon` only rewrites NaN payloads, so a compare+select is exactly equivalent.
    fn canon_num(&mut self, v: &str) -> String {
        let isn = self.tmp();
        let _ = writeln!(self.s, "  {isn} = fcmp uno double {v}, {v}");
        let c = self.tmp();
        let _ = writeln!(self.s, "  {c} = select i1 {isn}, double 0x7FF8000000000000, double {v}");
        c
    }
    fn ret_num_of(&self, fn_id: u32) -> bool {
        self.ret_num_table.get(fn_id as usize).copied().unwrap_or(false)
    }
    /// The constant a register is known to hold, when nothing else writes it.
    fn const_of(&self, r: u32) -> Option<ConstVal> {
        self.consts.get(r as usize).copied().flatten()
    }
    /// The constructor a register is known to hold, when nothing else writes it.
    fn tag_of(&self, r: u32) -> Option<(buildhub_core::ssa::TagKind, u32)> {
        self.tags.get(r as usize).copied().flatten()
    }
    /// `bhub_to_num` inlined. A `BVal` is a number exactly when it sits below the tag floor, and
    /// every tagged value maps to the canonical NaN — the same answer the runtime gives, in three
    /// instructions instead of a cross-module call.
    fn to_num_bits(&mut self, v: &str) -> String {
        let tagged = self.tmp();
        let _ = writeln!(self.s, "  {tagged} = icmp uge i64 {v}, {TAG_FLOOR}");
        let bits = self.tmp();
        let _ = writeln!(self.s, "  {bits} = bitcast i64 {v} to double");
        let out = self.tmp();
        let _ = writeln!(self.s, "  {out} = select i1 {tagged}, double 0x7FF8000000000000, double {bits}");
        out
    }
    /// `bhub_sym_id` inlined: the id is the payload's low word, `-1` means "not a symbol".
    fn sym_id_bits(&mut self, v: &str) -> String {
        let hi = self.tmp();
        let _ = writeln!(self.s, "  {hi} = lshr i64 {v}, 48");
        let is_sym = self.tmp();
        let _ = writeln!(self.s, "  {is_sym} = icmp eq i64 {hi}, {SYM_HI}");
        let id = self.tmp();
        let _ = writeln!(self.s, "  {id} = trunc i64 {v} to i32");
        let out = self.tmp();
        let _ = writeln!(self.s, "  {out} = select i1 {is_sym}, i32 {id}, i32 -1");
        out
    }
    /// `bhub_is_num` inlined: a value below the tag floor is a bare `f64`.
    fn is_num_bits(&mut self, v: &str) -> String {
        let out = self.tmp();
        let _ = writeln!(self.s, "  {out} = icmp ult i64 {v}, {TAG_FLOOR}");
        out
    }
    /// Emit a comparison result that is known before the program runs.
    fn const_bool(&mut self, dst: u32, truth: bool) {
        self.store_bool(dst, if truth { "true" } else { "false" });
    }
    /// `Eq`/`Ne` decided from a constant operand, `r` being the other register. Returns false when
    /// only the general `bhub_eq`/`bhub_ne` can answer.
    fn eq_const(&mut self, dst: u32, eq: bool, c: ConstVal, r: u32) -> bool {
        match (c, self.kind_of(r)) {
            // A number or a boolean is never a symbol and never `None`.
            (ConstVal::Sym(_) | ConstVal::None, Kind::Num | Kind::Bool) => {
                self.const_bool(dst, !eq);
                true
            }
            // Symbol ids are non-negative and `bhub_sym_id` yields -1 for every non-symbol, so an
            // integer compare decides exactly what the runtime call decided: `Sym(p) == Sym(q)` is
            // `p == q`.
            (ConstVal::Sym(id), _) => {
                let h = self.handle(r);
                let s = self.sym_id_bits(&h);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = icmp {} i32 {s}, {id}", if eq { "eq" } else { "ne" });
                self.store_bool(dst, &t);
                true
            }
            // `x == none` is exactly "x is the `None` value".
            (ConstVal::None, _) => {
                let h = self.handle(r);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i32 @bhub_is_none(i64 {h})");
                let b = self.tmp();
                let _ = writeln!(self.s, "  {b} = icmp {} i32 {t}, 0", if eq { "ne" } else { "eq" });
                self.store_bool(dst, &b);
                true
            }
            (ConstVal::Bool(_), Kind::Num) => {
                self.const_bool(dst, !eq);
                true
            }
            (ConstVal::Bool(v), Kind::Bool) => {
                let x = self.bool_of(r);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = icmp {} i1 {x}, {}", if eq { "eq" } else { "ne" }, u8::from(v));
                self.store_bool(dst, &t);
                true
            }
            // A handle may hold a `Bool`, but it may equally hold a number, and `truthy` accepts
            // both; only the runtime can tell them apart exactly.
            (ConstVal::Bool(_), Kind::Handle) => false,
        }
    }
    /// `Eq`/`Ne` where one side is a known constructor (`some`/`ok`/`err`).
    ///
    /// `some(x) == some(y)` is exactly `x == y`, `some(x) == ok(y)` is `false`, and a constructor
    /// is never a number, a boolean, a symbol or `none` — so every shape but the
    /// same-constructor one collapses without a call. Anything unproven falls through to
    /// `bhub_eq` (returns false here).
    fn eq_tag(&mut self, dst: u32, eq: bool, a: u32, b: u32) -> bool {
        let ((kind, inner), other) = match (self.tag_of(a), self.tag_of(b)) {
            (Some(t), _) => (t, b),
            (None, Some(t)) => (t, a),
            (None, None) => return false,
        };
        match self.tag_of(other) {
            Some((okind, oinner)) => {
                if okind != kind {
                    self.const_bool(dst, !eq);
                    return true;
                }
                // Same constructor: the payloads decide. `eq_fast` may still answer natively.
                let op = if eq { buildhub_core::ast::BinOp::Eq } else { buildhub_core::ast::BinOp::Ne };
                if self.eq_fast(dst, op, inner, oinner) {
                    return true;
                }
                let (x, y) = (self.handle(inner), self.handle(oinner));
                let t = self.tmp();
                let f = if eq { "bhub_eq" } else { "bhub_ne" };
                let _ = writeln!(self.s, "  {t} = call i32 @{f}(i64 {x}, i64 {y})");
                let r = self.tmp();
                let _ = writeln!(self.s, "  {r} = icmp ne i32 {t}, 0");
                self.store_bool(dst, &r);
                true
            }
            // A constructor is never a `Num`, a `Bool`, or a symbol/bool/none constant.
            None if self.kind_of(other) != Kind::Handle || self.const_of(other).is_some() => {
                self.const_bool(dst, !eq);
                true
            }
            None => false,
        }
    }
    /// `Eq`/`Ne` without the dynamic comparison when the operands allow it: a constant on either
    /// side, one unboxed number, or a constructor whose payload decides.
    fn eq_fast(&mut self, dst: u32, op: buildhub_core::ast::BinOp, a: u32, b: u32) -> bool {
        let eq = matches!(op, buildhub_core::ast::BinOp::Eq);
        if self.eq_tag(dst, eq, a, b) {
            return true;
        }
        let (ca, cb) = (self.const_of(a), self.const_of(b));
        if let (Some(x), Some(y)) = (ca, cb) {
            let truth = const_same(x, y) == eq;
            self.const_bool(dst, truth);
            return true;
        }
        if let Some(c) = ca {
            return self.eq_const(dst, eq, c, b);
        }
        if let Some(c) = cb {
            return self.eq_const(dst, eq, c, a);
        }
        // Exactly one side is unboxed. A `Num` is never equal to a `Bool`, and `bhub_to_num` yields
        // NaN for every other value, so `fcmp oeq`/`une` decides exactly what `bhub_eq`/`bhub_ne`
        // decided — without boxing the number.
        if self.is_num_reg(a) != self.is_num_reg(b) {
            let (num_r, other) = if self.is_num_reg(a) { (a, b) } else { (b, a) };
            if self.is_bool_reg(other) {
                self.const_bool(dst, !eq);
                return true;
            }
            let n = self.num_of(num_r);
            let h = self.handle(other);
            let t = self.to_num_bits(&h);
            let c = self.tmp();
            let _ = writeln!(self.s, "  {c} = fcmp {} double {t}, {n}", if eq { "oeq" } else { "une" });
            self.store_bool(dst, &c);
            return true;
        }
        false
    }
    /// Arithmetic (and ordered comparison) with a `Num` on one side and a boxed value on the other:
    /// hand the unboxed number to the runtime instead of allocating a `Num` value for it. Returns
    /// false for every other shape.
    fn mixed_bin(&mut self, dst: u32, op: buildhub_core::ast::BinOp, a: u32, b: u32) -> bool {
        use buildhub_core::ast::BinOp as B;
        if !matches!(
            op,
            B::Add | B::Sub | B::Mul | B::Div | B::FloorDiv | B::Rem | B::Lt | B::Le | B::Gt | B::Ge
        ) || self.is_num_reg(a) == self.is_num_reg(b)
        {
            return false;
        }
        let (num_r, hnd_r, num_first) = if self.is_num_reg(a) { (a, b, true) } else { (b, a, false) };
        let ord = binop_ord(op);
        let t = self.tmp();
        if num_first {
            let n = self.num_of(num_r);
            let h = self.handle(hnd_r);
            let _ = writeln!(self.s, "  {t} = call i64 @bhub_bin_n(i32 {ord}, double {n}, i64 {h})");
        } else {
            let h = self.handle(hnd_r);
            let n = self.num_of(num_r);
            let _ = writeln!(self.s, "  {t} = call i64 @bhub_bin_m(i32 {ord}, i64 {h}, double {n})");
        }
        self.store_handle(dst, &t);
        true
    }
    /// The `i64` `BVal` for a register: numbers are `bitcast` rather than allocated, so an unboxed
    /// `Num` costs one instruction to hand to the runtime.
    fn handle(&mut self, r: u32) -> String {
        if self.is_bool_reg(r) {
            let b = self.bool_of(r);
            return self.bool_bval(&b);
        }
        if self.is_num_reg(r) {
            let v = self.num_of(r);
            let t = self.tmp();
            let _ = writeln!(self.s, "  {t} = bitcast double {v} to i64");
            t
        } else {
            let t = self.tmp();
            let _ = writeln!(self.s, "  {t} = load i64, ptr %r{r}");
            t
        }
    }
    fn num_of(&mut self, r: u32) -> String {
        if self.is_bool_reg(r) {
            let h = self.handle(r);
            return self.to_num_bits(&h);
        }
        if self.is_num_reg(r) {
            let t = self.tmp();
            let _ = writeln!(self.s, "  {t} = load double, ptr %r{r}");
            t
        } else {
            let h = self.handle(r);
            self.to_num_bits(&h)
        }
    }
    fn store_handle(&mut self, r: u32, h: &str) {
        if self.is_bool_reg(r) {
            let t = self.tmp();
            let _ = writeln!(self.s, "  {t} = call i32 @bhub_truthy(i64 {h})");
            let b = self.tmp();
            let _ = writeln!(self.s, "  {b} = icmp ne i32 {t}, 0");
            let _ = writeln!(self.s, "  store i1 {b}, ptr %r{r}");
        } else if self.is_num_reg(r) {
            let t = self.to_num_bits(h);
            let _ = writeln!(self.s, "  store double {t}, ptr %r{r}");
        } else {
            let _ = writeln!(self.s, "  store i64 {h}, ptr %r{r}");
        }
    }
    fn store_num(&mut self, r: u32, v: &str) {
        if self.is_num_reg(r) {
            let _ = writeln!(self.s, "  store double {v}, ptr %r{r}");
        } else {
            let t = self.tmp();
            let _ = writeln!(self.s, "  {t} = bitcast double {v} to i64");
            let _ = writeln!(self.s, "  store i64 {t}, ptr %r{r}");
        }
    }
    /// Bundle register values into a stack array of `BVal` and return its pointer.
    fn handle_array(&mut self, rs: &[u32]) -> String {
        let n = rs.len().max(1);
        let arr = self.tmp();
        let _ = writeln!(self.s, "  {arr} = alloca [{n} x i64]");
        for (i, r) in rs.iter().enumerate() {
            let h = self.handle(*r);
            let p = self.tmp();
            let _ = writeln!(self.s, "  {p} = getelementptr inbounds [{n} x i64], ptr {arr}, i64 0, i64 {i}");
            let _ = writeln!(self.s, "  store i64 {h}, ptr {p}");
        }
        arr
    }
}

/// Which declared parameters are `Num`, i.e. passed as `double` rather than as a handle.
pub(crate) fn param_is_num(params: &[Vec<bool>], fn_id: usize, p: usize) -> bool {
    params.get(fn_id).and_then(|v| v.get(p)).copied().unwrap_or(false)
}

/// The register an instruction writes, if any.
fn dst_of(i: &Instr) -> Option<u32> {
    match i {
        Instr::Const { dst, .. }
        | Instr::Bin { dst, .. }
        | Instr::Un { dst, .. }
        | Instr::Prim { dst, .. }
        | Instr::Field { dst, .. }
        | Instr::GetOr { dst, .. }
        | Instr::Update { dst, .. }
        | Instr::MkRec { dst, .. }
        | Instr::MkList { dst, .. }
        | Instr::MkTuple { dst, .. }
        | Instr::Tag { dst, .. }
        | Instr::At { dst, .. }
        | Instr::Concat { dst, .. }
        | Instr::Call { dst, .. }
        | Instr::CallValue { dst, .. }
        | Instr::CallHigher { dst, .. }
        | Instr::Closure { dst, .. }
        | Instr::Enter { dst, .. }
        | Instr::Fork { dst, .. }
        | Instr::Choose { dst, .. }
        | Instr::Expect { dst, .. }
        | Instr::Data { dst, .. }
        | Instr::MatchPat { dst, .. }
        | Instr::Host { dst, .. } => Some(*dst),
        Instr::Ret { .. } => None,
    }
}

/// A constant a register can be known to hold, for `Eq`/`Ne` shapes the emitter decides itself.
///
/// `Num` constants are absent on purpose: a number lives in a `Kind::Num` slot, so `eq_fast` reads
/// it from there instead of keeping a second copy here.
#[derive(Clone, Copy, PartialEq)]
enum ConstVal {
    Sym(i32),
    Bool(bool),
    None,
}

/// `Value::same_as` for the constant shapes above, i.e. the value of `a == b` at compile time.
fn const_same(a: ConstVal, b: ConstVal) -> bool {
    match (a, b) {
        (ConstVal::Sym(x), ConstVal::Sym(y)) => x == y,
        (ConstVal::Bool(x), ConstVal::Bool(y)) => x == y,
        (ConstVal::None, ConstVal::None) => true,
        _ => false,
    }
}

/// Registers whose only producer is a constant `Eq`/`Ne` can decide during emission.
///
/// The map is conservative: a register written more than once, or by anything other than such a
/// constant, is absent, so the emitter only ever rewrites a slot whose value is that constant.
fn const_regs(code: &Code, f: &CodeFn) -> Vec<Option<ConstVal>> {
    let n = f.nregs as usize;
    let mut seen = vec![false; n];
    let mut out: Vec<Option<ConstVal>> = vec![None; n];
    for i in f.blocks.iter().flatten() {
        let Some(d) = dst_of(i) else { continue };
        let d = d as usize;
        let c = match i {
            Instr::Const { val, .. } => match code.consts.get(*val as usize) {
                // Ids are compared as `i32` by the runtime, and `-1` means "not a symbol".
                Some(buildhub_core::value::Value::Sym(s)) if s.0 <= i32::MAX as u32 => {
                    Some(ConstVal::Sym(s.0 as i32))
                }
                Some(buildhub_core::value::Value::Bool(v)) => Some(ConstVal::Bool(*v)),
                Some(buildhub_core::value::Value::None) => Some(ConstVal::None),
                _ => None,
            },
            _ => None,
        };
        out[d] = if seen[d] { None } else { c };
        seen[d] = true;
    }
    out
}

/// Registers whose only producer is a constructor `Instr::Tag`, i.e. a value known to be
/// `some(x)` / `ok(x)` / `err(x)`. Same conservatism as `const_regs`: a slot written twice is
/// absent, so a hit really is that constructor.
fn tag_regs(f: &CodeFn) -> Vec<Option<(buildhub_core::ssa::TagKind, u32)>> {
    let n = f.nregs as usize;
    let mut seen = vec![false; n];
    let mut out: Vec<Option<(buildhub_core::ssa::TagKind, u32)>> = vec![None; n];
    for i in f.blocks.iter().flatten() {
        let Some(d) = dst_of(i) else { continue };
        let d = d as usize;
        let c = match i {
            Instr::Tag { kind, inner, .. } => Some((*kind, *inner)),
            _ => None,
        };
        out[d] = if seen[d] { None } else { c };
        seen[d] = true;
    }
    out
}

/// The frame slots a pattern binds, in ascending order (the runtime uses the same numbering).
pub(crate) fn pattern_slots(pat: &Pattern) -> Vec<u32> {
    fn walk(p: &Pattern, out: &mut Vec<u32>) {
        match p {
            Pattern::Bind(n) => {
                if let Some((slot, _)) = buildhub_core::resolve::split_binding(n) {
                    if !out.contains(&slot) {
                        out.push(slot);
                    }
                }
            }
            Pattern::Tuple(ps) => ps.iter().for_each(|x| walk(x, out)),
            Pattern::Record(fs) => fs.iter().for_each(|(_, x)| walk(x, out)),
            Pattern::Some(x) | Pattern::Ok(x) | Pattern::Err(x) => walk(x, out),
            _ => {}
        }
    }
    let mut out = Vec::new();
    walk(pat, &mut out);
    out.sort_unstable();
    out
}

/// Join label for the `idx`-th instruction of block `blk`.
fn join_label(fid: u32, blk: u32, idx: usize) -> String {
    format!("j{fid}_{blk}_{idx}")
}

/// Which declared parameters are `Num`, i.e. passed as `double` rather than as a handle.
pub fn param_num(prog: &buildhub_core::ir::Program) -> Vec<Vec<bool>> {
    prog.fns
        .iter()
        .map(|f| {
            f.param_types
                .iter()
                .map(|t| matches!(t, Some(buildhub_core::ast::TypeExpr::Num)))
                .collect()
        })
        .collect()
}

/// A `driver.c` that links against the emitted IR: `pack <data.json> <config.json> <entry> [args]`.
///
/// The IR alone is not runnable (no `main`, no way to feed data), so the artifact ships its own
/// entry table. Parameter kinds come from the schema table, not from guessing.
pub fn emit_driver(code: &Code, ll: &str, pack_id: &str) -> String {
    use buildhub_core::ssa::TyTag;
    let mut s = String::new();
    s.push_str(&format!("/* {pack_id}: generated driver. Link with pack.ll + buildhub_rt. */\n"));
    s.push_str("#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\n");
    // Windows hands `main` the ANSI code page, so UTF-8 pack symbols (element names, stat names)
    // would arrive mangled. Re-parse the wide command line instead of trusting `argv`.
    s.push_str("#ifdef _WIN32\n#include <windows.h>\n#include <shellapi.h>\n");
    s.push_str("static char* g_utf8[64];\n");
    s.push_str("static int fix_argv(int* argc, char*** argv) {\n");
    s.push_str("  int n = 0; wchar_t** w = CommandLineToArgvW(GetCommandLineW(), &n);\n");
    s.push_str("  if (!w || n > 64) return 0;\n");
    s.push_str("  for (int i = 0; i < n; i++) {\n");
    s.push_str("    int k = WideCharToMultiByte(CP_UTF8, 0, w[i], -1, 0, 0, 0, 0);\n");
    s.push_str("    g_utf8[i] = (char*)malloc((size_t)k);\n");
    s.push_str("    WideCharToMultiByte(CP_UTF8, 0, w[i], -1, g_utf8[i], k, 0, 0);\n");
    s.push_str("  }\n  LocalFree(w); *argc = n; *argv = g_utf8; return 1;\n}\n#endif\n\n");
    s.push_str("#include <time.h>\n");
    s.push_str("void bhub_init(void);\nvoid bhub_load_data(const unsigned char*, unsigned);\n");
    s.push_str("void bhub_reset(void);\nvoid bhub_mark(void);\nunsigned bhub_arena_len(void);\n");
    // Values cross the boundary as `BVal` (NaN-boxed `i64`); only tags, lengths and indices are
    // `unsigned`.
    s.push_str("long long bhub_json_arg(const unsigned char*, unsigned);\n");
    s.push_str("long long bhub_sym_by_name(const unsigned char*, unsigned);\n");
    s.push_str("double bhub_to_num(long long);\n");
    s.push_str("size_t bhub_show(long long, unsigned char*, size_t);\n\n");

    // Prototypes: the return kind is read back from the IR, so both sides cannot drift.
    for e in &code.entries {
        let ret = if ll.contains(&format!("define double @f{}(", e.fn_id)) { "double" } else { "long long" };
        let mut ps: Vec<String> = Vec::new();
        for p in 0..e.nparams as usize {
            let t = if e.params.get(p) == Some(&TyTag::Num) { "double" } else { "long long" };
            ps.push(format!("{t} p{p}"));
        }
        let _ = write!(s, "{ret} f{}({});\n", e.fn_id, ps.join(", "));
    }

    s.push_str("\nstatic char* slurp(const char* p, unsigned* n) {\n");
    s.push_str("  FILE* f = fopen(p, \"rb\"); if (!f) { fprintf(stderr, \"cannot open %s\\n\", p); exit(2); }\n");
    s.push_str("  fseek(f, 0, SEEK_END); long l = ftell(f); fseek(f, 0, SEEK_SET);\n");
    s.push_str("  char* b = (char*)malloc((size_t)l + 1); *n = (unsigned)fread(b, 1, (size_t)l, f); b[*n] = 0; fclose(f); return b;\n}\n\n");

    s.push_str("int main(int argc, char** argv) {\n");
    s.push_str("#ifdef _WIN32\n  fix_argv(&argc, &argv);\n#endif\n");
    s.push_str("  if (argc < 4) { fprintf(stderr, \"usage: %s <data.json> <config.json> <entry> [args...]\\n\", argv[0]); return 2; }\n");
    s.push_str("  unsigned dn, cn; char* d = slurp(argv[1], &dn); char* c = slurp(argv[2], &cn);\n");
    s.push_str("  bhub_init(); bhub_load_data((const unsigned char*)d, dn);\n");
    s.push_str("  // BHUB_REPEAT=N re-evaluates with a fresh arena each time: the per-request shape of an\n");
    s.push_str("  // embedded host, and the only honest way to time the pack rather than process start-up.\n");
    s.push_str("  int reps = 1; { const char* r = getenv(\"BHUB_REPEAT\"); if (r) { reps = atoi(r); if (reps < 1) reps = 1; } }\n");
    s.push_str("  char out[65536]; (void)out;\n");
    s.push_str("  double rnum = 0.0; long long rh = 0; int isnum = 0;\n");
    s.push_str("  // The config is an input, not per-call garbage: parse it once and lift the reset\n");
    s.push_str("  // watermark over it, so a repeated run measures the pack rather than JSON parsing.\n");
    s.push_str("  long long cfg_h = bhub_json_arg((const unsigned char*)c, cn);\n");
    s.push_str("  bhub_mark();\n");
    s.push_str("  clock_t t0 = clock();\n");
    s.push_str("  for (int rep = 0; rep < reps; rep++) {\n");
    s.push_str("    if (rep) bhub_reset();\n");
    s.push_str("    int ai = 4; (void)ai;\n");
    for (n, e) in code.entries.iter().enumerate() {
        let first = n == 0;
        let kw = if first { "if" } else { "else if" };
        s.push_str(&format!("    {kw} (!strcmp(argv[3], \"{}\")) {{\n", e.name));
        let mut args: Vec<String> = Vec::new();
        for p in 0..e.nparams as usize {
            let name = format!("a{p}");
            match e.params.get(p) {
                Some(TyTag::Num) => {
                    s.push_str(&format!("      double {name} = argc > ai ? atof(argv[ai]) : 0.0; ai++;\n"));
                }
                Some(TyTag::Sym) => {
                    s.push_str(&format!(
                        "      long long {name} = argc > ai ? bhub_sym_by_name((const unsigned char*)argv[ai], (unsigned)strlen(argv[ai])) : bhub_sym_by_name((const unsigned char*)\"\", 0); ai++;\n"
                    ));
                }
                // The config file covers the `Config` parameter wherever it sits; the rest of the
                // positional arguments are JSON values in order (`--args` in the interpreter CLI).
                Some(TyTag::Schema(n)) if n == "Config" => {
                    s.push_str(&format!("      long long {name} = cfg_h;\n"));
                }
                _ => {
                    s.push_str(&format!(
                        "      long long {name} = argc > ai ? bhub_json_arg((const unsigned char*)argv[ai], (unsigned)strlen(argv[ai])) : bhub_json_arg((const unsigned char*)c, cn); ai++;\n"
                    ));
                }
            }
            args.push(name);
        }
        let ret_num = ll.contains(&format!("define double @f{}(", e.fn_id));
        if ret_num {
            s.push_str(&format!("      rnum = f{}({}); isnum = 1;\n", e.fn_id, args.join(", ")));
        } else {
            s.push_str(&format!("      rh = f{}({}); isnum = 0;\n", e.fn_id, args.join(", ")));
        }
        s.push_str("    }\n");
    }
    s.push_str("  }\n");
    s.push_str("  clock_t t1 = clock();\n");
    s.push_str("  if (isnum) printf(\"%.17g\\n\", rnum);\n");
    s.push_str("  else { bhub_show(rh, (unsigned char*)out, sizeof out); printf(\"%s\\n\", out); }\n");
    s.push_str("  if (reps > 1) fprintf(stderr, \"%d rep(s) in %.2f ms (%.4f ms/rep), arena=%u\\n\", reps, 1000.0*(double)(t1-t0)/CLOCKS_PER_SEC, 1000.0*(double)(t1-t0)/CLOCKS_PER_SEC/reps, bhub_arena_len());\n");
    s.push_str("  return 0;\n}\n");
    return s;

}

const DECLS: &str = r#"
    declare void @bhub_reset()
declare void @bhub_mark()
    @bhub_memo_epoch = external global i64
    declare i64 @bhub_mk_num(double)
    declare i64 @bhub_mk_bool(i32)
    declare i64 @bhub_mk_sym(i32)
    declare i64 @bhub_mk_unit()
    declare i64 @bhub_mk_none()
declare i64 @bhub_mk_missing()
    declare i64 @bhub_mk_str(ptr, i32)
    declare double @bhub_to_num(i64)
    declare i32 @bhub_truthy(i64)
    declare double @bhub_canon(double)
    declare i64 @bhub_field(i64, i32)
    declare i64 @bhub_field_opt(i64, i32)
    declare i64 @bhub_bin_m(i32, i64, double)
    declare i64 @bhub_bin_n(i32, double, i64)
    declare i64 @bhub_get_or(i64, i64)
    declare i64 @bhub_update(i64, i64)
    declare double @bhub_len(i64)
declare i32 @bhub_is_num(i64)
declare i32 @bhub_sym_id(i64)
declare i32 @bhub_eq(i64, i64)
declare double @bhub_str_len(i64)
declare double @bhub_str_at(i64, double)
declare i64 @bhub_str_slice(i64, double, double)
declare i32 @bhub_str_eq(i64, i64)
declare i32 @bhub_ne(i64, i64)
declare i32 @bhub_is_list(i64)
    declare i64 @bhub_at(i64, double)
    declare i64 @bhub_concat(i64, i64)
    declare i64 @bhub_bin(i32, i64, i64)
    declare i64 @bhub_un(i32, i64)
    declare i64 @bhub_prim(i32, ptr, i32)
    declare i64 @bhub_mk_list(ptr, i32)
    declare i64 @bhub_mk_tuple(ptr, i32)
    declare i64 @bhub_mk_rec(ptr, ptr, i32, i32)
    declare i64 @bhub_tag(i32, i64)
    declare i64 @bhub_closure(i32, ptr, i32)
    declare i64 @bhub_call_value(i64, ptr, i32)
    declare i64 @bhub_expect(i64)
    declare i64 @bhub_data(i32, i32, i64)
    declare i32 @bhub_match_pat(i32, i64)
declare i32 @bhub_match_some(i64, ptr)
declare i32 @bhub_is_none(i64)

    declare i64 @bhub_binding(i32)
    declare i64 @bhub_arg(ptr, i32)
    declare i64 @bhub_host(i32, ptr, i32)
    declare i64 @bhub_min(i64, i64)
    declare i64 @bhub_max(i64, i64)
    declare i64 @bhub_keys(i64)
    declare i64 @bhub_map(i64, i64)
    declare i64 @bhub_concat_map(i64, i64)
    declare i64 @bhub_filter(i64, i64)
    declare i64 @bhub_any(i64, i64)
    declare i64 @bhub_all(i64, i64)
    declare i64 @bhub_fold(i64, i64, i64)
    declare i64 @bhub_clamp(i64, i64, i64)
    declare i64 @bhub_sym_of(i64)
    declare i64 @bhub_dedup_by(i64, i64)
    declare i64 @bhub_fold2(i64, i64, i64)
    declare i64 @bhub_find(i64, i64)
    declare i64 @bhub_fix(i64, i64, i64, i64)
    declare void @bhub_load_syms(ptr, i32)
    declare void @bhub_load_patterns(ptr, i32)
    declare void @bhub_load_schemas(ptr, i32)
    declare void @bhub_load_datasets(ptr, i32)
    declare void @bhub_set_dispatch(ptr)
    declare double @llvm.floor.f64(double)
    declare double @llvm.ceil.f64(double)
    declare double @llvm.trunc.f64(double)
    declare double @llvm.round.f64(double)
    declare double @llvm.fabs.f64(double)
    declare double @llvm.sqrt.f64(double)
    declare double @llvm.minimum.f64(double, double)
    declare double @llvm.maximum.f64(double, double)
"#;

fn blob(name: &str, bytes: &[u8]) -> String {
    let list: Vec<String> = bytes.iter().map(|b| format!("i8 {b}")).collect();
    format!("\n@{name} = private unnamed_addr constant [{} x i8] [{}]\n", bytes.len(), list.join(", "))
}

fn put_str(out: &mut Vec<u8>, s: &str) {
    out.extend_from_slice(&(s.len() as u16).to_le_bytes());
    out.extend_from_slice(s.as_bytes());
}

fn syms_bytes(code: &Code) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    out.extend_from_slice(&(code.syms.len() as u32).to_le_bytes());
    for s in &code.syms {
        out.extend_from_slice(&(s.len() as u32).to_le_bytes());
        out.extend_from_slice(s.as_bytes());
    }
    out
}

fn patterns_bytes(code: &Code) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    out.extend_from_slice(&(code.patterns.len() as u16).to_le_bytes());
    for p in &code.patterns {
        encode_pattern(p, &mut out);
    }
    out
}

fn encode_pattern(p: &Pattern, out: &mut Vec<u8>) {
    match p {
        Pattern::Bind(n) => {
            out.push(0);
            put_str(out, n);
        }
        Pattern::Wild => out.push(1),
        Pattern::Tuple(ps) => {
            out.push(2);
            out.push(ps.len() as u8);
            ps.iter().for_each(|x| encode_pattern(x, out));
        }
        Pattern::Record(fs) => {
            out.push(3);
            out.push(fs.len() as u8);
            for (n, x) in fs {
                put_str(out, n);
                encode_pattern(x, out);
            }
        }
        Pattern::Some(x) => {
            out.push(4);
            encode_pattern(x, out);
        }
        Pattern::None => out.push(5),
        Pattern::Ok(x) => {
            out.push(6);
            encode_pattern(x, out);
        }
        Pattern::Err(x) => {
            out.push(7);
            encode_pattern(x, out);
        }
        Pattern::Num(n) => {
            out.push(8);
            out.extend_from_slice(&n.to_bits().to_le_bytes());
        }
        Pattern::Sym(s) => {
            out.push(9);
            put_str(out, s);
        }
    }
}

fn schemas_bytes(code: &Code) -> Vec<u8> {
    use buildhub_core::ssa::TyTag;
    fn tag(t: &TyTag, out: &mut Vec<u8>) {
        match t {
            TyTag::Num => out.push(0),
            TyTag::Bool => out.push(1),
            TyTag::Sym => out.push(2),
            TyTag::Str => out.push(3),
            TyTag::Unit => out.push(4),
            TyTag::List(x) => {
                out.push(5);
                tag(x, out);
            }
            TyTag::Option(x) => {
                out.push(6);
                tag(x, out);
            }
            TyTag::Tuple(xs) => {
                out.push(7);
                out.extend_from_slice(&(xs.len() as u16).to_le_bytes());
                xs.iter().for_each(|x| tag(x, out));
            }
            TyTag::Record(fs, open) => {
                out.push(8);
                out.push(*open as u8);
                out.extend_from_slice(&(fs.len() as u16).to_le_bytes());
                for (n, x) in fs {
                    put_str(out, n);
                    tag(x, out);
                }
            }
            TyTag::Schema(n) => {
                out.push(9);
                put_str(out, n);
            }
            TyTag::Any => out.push(10),
        }
    }
    let mut out: Vec<u8> = Vec::new();
    out.extend_from_slice(&(code.schemas.len() as u16).to_le_bytes());
    for s in &code.schemas {
        put_str(&mut out, &s.name);
        out.push(s.open as u8);
        out.extend_from_slice(&(s.fields.len() as u16).to_le_bytes());
        for (n, t) in &s.fields {
            put_str(&mut out, n);
            tag(t, &mut out);
        }
    }
    out
}

fn data_bytes(code: &Code) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    out.extend_from_slice(&(code.data.len() as u16).to_le_bytes());
    for d in &code.data {
        put_str(&mut out, &d.name);
        put_str(&mut out, &d.schema);
        match &d.key {
            Some(k) => {
                out.push(1);
                put_str(&mut out, k);
            }
            None => out.push(0),
        }
    }
    out
}

/// A non-numeric constant, materialised once at start-up into `@k{i}`.
fn const_build(v: &buildhub_core::value::Value, i: usize) -> Option<String> {
    use buildhub_core::value::Value as V;
    match v {
        V::Unit => Some(format!("  %k{i} = call i64 @bhub_mk_unit()")),
        V::Missing => Some(format!("  %k{i} = call i64 @bhub_mk_missing()")),
        V::None => Some(format!("  %k{i} = call i64 @bhub_mk_none()")),
        V::Bool(b) => Some(format!("  %k{i} = call i64 @bhub_mk_bool(i32 {})", u8::from(*b))),
        V::Sym(s) => Some(format!("  %k{i} = call i64 @bhub_mk_sym(i32 {})", s.0)),
        _ => None,
    }
}

/// Direct calls for the builtins that do not need the distribution machinery. Returns the call
/// text and whether the result is a bare `double`.
fn fast_one(b: buildhub_core::ir::Builtin, args: &[u32], e: &mut Fn<'_>) -> Option<(String, Kind)> {
    use buildhub_core::ir::Builtin as B;
    let one = |e: &mut Fn<'_>| e.handle(args[0]);
    Some(match b {
        B::Len if args.len() == 1 => {
            let h = one(e);
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call double @bhub_len(i64 {h})");
            (t, Kind::Num)
        }
        B::NumOf if args.len() == 1 => {
            let h = one(e);
            let t = e.to_num_bits(&h);
            (t, Kind::Num)
        }
        B::At if args.len() == 2 => {
            let h = one(e);
            let i = e.num_of(args[1]);
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_at(i64 {h}, double {i})");
            (t, Kind::Handle)
        }
        B::Concat if args.len() == 2 => {
            let (x, y) = (e.handle(args[0]), e.handle(args[1]));
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_concat(i64 {x}, i64 {y})");
            (t, Kind::Handle)
        }
        B::GetOr if args.len() == 2 => {
            let (x, y) = (e.handle(args[0]), e.handle(args[1]));
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_get_or(i64 {x}, i64 {y})");
            (t, Kind::Handle)
        }
        // `update(rec, patch)` as a builtin is the same `step::update` the dedicated instruction
        // uses, including "non-record ⇒ Missing", so the runtime entry point is exact.
        B::Update if args.len() == 2 => {
            let (x, y) = (e.handle(args[0]), e.handle(args[1]));
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_update(i64 {x}, i64 {y})");
            (t, Kind::Handle)
        }
        // `field(rec, key)` wraps its result in `Some`/`None`, so it needs the option-returning
        // entry point rather than `bhub_field` (which hands back the raw value): the key arrives as
        // a symbol value, and `bhub_sym_id` turns it into the id the runtime indexes with. A
        // non-symbol key or a non-record receiver yields `None`, matching the builtin's error path,
        // which the AOT side already degrades to a missing value.
        B::Field if args.len() == 2 => {
            let rec = e.handle(args[0]);
            let key = e.handle(args[1]);
            let id = e.sym_id_bits(&key);
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_field_opt(i64 {rec}, i32 {id})");
            (t, Kind::Handle)
        }
        // `has(rec, key)` has no dedicated runtime entry point, so it stays on `bhub_prim`.
        B::StrLen if args.len() == 1 => {
            let h = one(e);
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call double @bhub_str_len(i64 {h})");
            (t, Kind::Num)
        }
        B::StrAt if args.len() == 2 => {
            let h = one(e);
            let i = e.num_of(args[1]);
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call double @bhub_str_at(i64 {h}, double {i})");
            (t, Kind::Num)
        }
        B::StrEq if args.len() == 2 => {
            let (x, y) = (e.handle(args[0]), e.handle(args[1]));
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i32 @bhub_str_eq(i64 {x}, i64 {y})");
            let b = e.tmp();
            let _ = writeln!(e.s, "  {b} = icmp ne i32 {t}, 0");
            (b, Kind::Bool)
        }
        B::StrSlice if args.len() == 3 => {
            let h = one(e);
            let lo = e.num_of(args[1]);
            let hi = e.num_of(args[2]);
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_str_slice(i64 {h}, double {lo}, double {hi})");
            (t, Kind::Handle)
        }
        B::IsNum if args.len() == 1 => {
            let h = one(e);
            let b = e.is_num_bits(&h);
            (b, Kind::Bool)
        }
        B::IsList if args.len() == 1 => {
            let h = one(e);
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i32 @bhub_is_list(i64 {h})");
            let b = e.tmp();
            let _ = writeln!(e.s, "  {b} = icmp ne i32 {t}, 0");
            (b, Kind::Bool)
        }
        // Only the dynamic shapes reach here: `min`/`max` over bare `Num`s take the
        // `llvm.minimum`/`maximum` branch above.
        B::Min if args.len() == 2 => {
            let (x, y) = (e.handle(args[0]), e.handle(args[1]));
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_min(i64 {x}, i64 {y})");
            (t, Kind::Handle)
        }
        B::Max if args.len() == 2 => {
            let (x, y) = (e.handle(args[0]), e.handle(args[1]));
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_max(i64 {x}, i64 {y})");
            (t, Kind::Handle)
        }
        B::Keys if args.len() == 1 => {
            let h = one(e);
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_keys(i64 {h})");
            (t, Kind::Handle)
        }
        // Same ordering note as `min`/`max`: `clamp` over bare `Num`s is lowered to
        // `llvm.maximum`/`minimum` above, so only the dynamic shape reaches here.
        B::Clamp if args.len() == 3 => {
            let (x, y, z) = (e.handle(args[0]), e.handle(args[1]), e.handle(args[2]));
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_clamp(i64 {x}, i64 {y}, i64 {z})");
            (t, Kind::Handle)
        }
        B::SymOf if args.len() == 1 => {
            let h = one(e);
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_sym_of(i64 {h})");
            (t, Kind::Handle)
        }
        // `dedup_by`/`fold2` take a closure but are not on `is_higher_order`, so they arrive as
        // `Instr::Prim` and are answered here.
        B::DedupBy if args.len() == 2 => {
            let (x, y) = (e.handle(args[0]), e.handle(args[1]));
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_dedup_by(i64 {x}, i64 {y})");
            (t, Kind::Handle)
        }
        B::Fold2 if args.len() == 3 => {
            let (x, y, z) = (e.handle(args[0]), e.handle(args[1]), e.handle(args[2]));
            let t = e.tmp();
            let _ = writeln!(e.s, "  {t} = call i64 @bhub_fold2(i64 {x}, i64 {y}, i64 {z})");
            (t, Kind::Handle)
        }
        _ => return None,
    })
}

/// Direct calls for the higher-order builtins, which the runtime answers itself but re-enters the
/// compiled module to apply the closure. Wire a row here only when `buildhub-rt` exports the whole
/// builtin; everything else stays on `bhub_prim` (which builds an argument array and dispatches
/// through the builtin table).
fn higher_one(b: buildhub_core::ir::Builtin, args: &[u32], e: &mut Fn<'_>) -> Option<(String, Kind)> {
    use buildhub_core::ir::Builtin as B;
    let name = match b {
        B::Map if args.len() == 2 => "bhub_map",
        B::ConcatMap if args.len() == 2 => "bhub_concat_map",
        B::Filter if args.len() == 2 => "bhub_filter",
        B::Any if args.len() == 2 => "bhub_any",
        B::All if args.len() == 2 => "bhub_all",
        B::Fold if args.len() == 3 => "bhub_fold",
        B::Find if args.len() == 2 => "bhub_find",
        B::Fix if args.len() == 4 => "bhub_fix",
        _ => return None,
    };
    let mut pv: Vec<String> = Vec::new();
    for r in args {
        let h = e.handle(*r);
        pv.push(format!("i64 {h}"));
    }
    let t = e.tmp();
    let _ = writeln!(e.s, "  {t} = call i64 @{name}({})", pv.join(", "));
    Some((t, Kind::Handle))
}

fn binop_ord(op: buildhub_core::ast::BinOp) -> i32 {
    use buildhub_core::ast::BinOp::*;
    match op {
        Add => 0,
        Sub => 1,
        Mul => 2,
        Div => 3,
        FloorDiv => 4,
        Rem => 5,
        Eq => 6,
        Ne => 7,
        Lt => 8,
        Le => 9,
        Gt => 10,
        Ge => 11,
        And => 12,
        Or => 13,
    }
}


/// Emit the whole module: declarations, blobs, constant globals, `bhub_init`, one `define` per
/// reachable pack function, then the `bhub_dispatch` callback the runtime re-enters.
///
/// `None` when the pack can produce a support set (needs the distribution machinery).
pub fn emit_ll(code: &Code, pack_id: &str, params: &[Vec<bool>]) -> Option<String> {
    for f in &code.fns {
        for b in &f.blocks {
            for i in b {
                if matches!(i, Instr::Choose { .. }) {
                    return None;
                }
                if let Instr::Prim { b: buildhub_core::ir::Builtin::Choice, .. } = i {
                    return None;
                }
            }
        }
    }
    let keep = buildhub_core::ssa::reachable(code);
    let types = Types::build(code, params);
    let memo: Vec<bool> = keep.clone();
    let mut s = String::new();
    let _ = writeln!(s, "; buildhub pack `{pack_id}` — LLVM IR, one function per pack function");
    s.push_str(DECLS);
    s.push_str(&blob("syms_blob", &syms_bytes(code)));
    let pats = patterns_bytes(code);
    s.push_str(&blob("pats_blob", &pats));
    let schemas = schemas_bytes(code);
    s.push_str(&blob("schemas_blob", &schemas));
    let data = data_bytes(code);
    s.push_str(&blob("data_blob", &data));

    // Non-numeric constants are built once at start-up into globals.
    for (i, c) in code.consts.iter().enumerate() {
        if const_build(c, i).is_some() {
            let _ = writeln!(s, "@k{i} = global i64 0");
        } else if !matches!(c, buildhub_core::value::Value::Num(_)) {
            return None;
        }
    }
    // Per-function memo table: `MEMO_SLOTS` direct-mapped entries, each tagged with the runtime's
    // epoch so `bhub_reset` invalidates every slot with one increment (arena indices are reused
    // across evaluations). A hit returns the cached `BVal`/`f64` unchanged, so a repeated call
    // with the same arguments (helpers taking the whole `Config`, `mod_of(id)`, character classes)
    // costs a hash and a few compares instead of a recomputation.
    for f in code.fns.iter().filter(|f| memo[f.fn_id as usize]) {
        let id = f.fn_id;
        let k = f.ncaptures as usize + f.nparams as usize;
        let slots = if k == 0 { 1 } else { MEMO_SLOTS };
        let _ = writeln!(s, "@m{id}_e = internal global [{slots} x i64] zeroinitializer");
        if k > 0 {
            let _ = writeln!(s, "@m{id}_k = internal global [{slots} x [{k} x i64]] zeroinitializer");
        }
        let ty = if types.ret_num[f.fn_id as usize] { "double" } else { "i64" };
        let _ = writeln!(s, "@m{id}_r = internal global [{slots} x {ty}] zeroinitializer");
    }

    let _ = writeln!(s, "\ndefine void @bhub_init() {{");
    let _ = writeln!(s, "entry:");
    let _ = writeln!(s, "  call void @bhub_load_syms(ptr @syms_blob, i32 {})", syms_bytes(code).len());
    let _ = writeln!(s, "  call void @bhub_load_patterns(ptr @pats_blob, i32 {})", pats.len());
    let _ = writeln!(s, "  call void @bhub_load_schemas(ptr @schemas_blob, i32 {})", schemas.len());
    let _ = writeln!(s, "  call void @bhub_load_datasets(ptr @data_blob, i32 {})", data.len());
    let _ = writeln!(s, "  call void @bhub_set_dispatch(ptr @bhub_dispatch)");
    for (i, c) in code.consts.iter().enumerate() {
        if let Some(build) = const_build(c, i) {
            let _ = writeln!(s, "  {build}");
            let _ = writeln!(s, "  store i64 %k{i}, ptr @k{i}");
        }
    }
    // Everything above this point is a constant; `bhub_reset` truncates back to it.
    let _ = writeln!(s, "  call void @bhub_mark()");
    let _ = writeln!(s, "  ret void");
    let _ = writeln!(s, "}}");

    for f in code.fns.iter().filter(|f| keep[f.fn_id as usize]) {
        let fi = f.fn_id as usize;
        let mut dest: Vec<Option<(u32, String)>> = vec![None; f.blocks.len()];
        for (blk, body) in f.blocks.iter().enumerate() {
            for (idx, i) in body.iter().enumerate() {
                match i {
                    Instr::Enter { dst, blk: child } => {
                        dest[*child as usize] = Some((*dst, join_label(f.fn_id, blk as u32, idx)));
                    }
                    Instr::Fork { dst, then_blk, else_blk, .. } => {
                        let j = join_label(f.fn_id, blk as u32, idx);
                        dest[*then_blk as usize] = Some((*dst, j.clone()));
                        dest[*else_blk as usize] = Some((*dst, j));
                    }
                    _ => {}
                }
            }
        }
        let mut e = Fn {
            code,
            f,
            kind: &types.regs[fi],
            params,
            ret_num: types.ret_num[fi],
            ret_num_table: &types.ret_num,
            consts: const_regs(code, f),
            tags: tag_regs(f),
            s: String::new(),
            n: 0,
            dest,
        };
        // Upvalues are leading `i64` parameters and occupy the leading frame registers.
        let ncap = f.ncaptures as usize;
        let mut kinds: Vec<Kind> = (0..ncap).map(|i| e.kind_of(i as u32)).collect();
        kinds.extend((0..f.nparams as usize).map(|p| if e.param_num(p) { Kind::Num } else { Kind::Handle }));
        let ps: Vec<String> = (0..ncap)
            .map(|i| format!("{} %u{i}", ty_of(kinds[i])))
            .chain((0..f.nparams as usize).map(|p| format!("{} %p{p}", ty_of(kinds[ncap + p]))))
            .collect();
        let _ = writeln!(e.s, "\ndefine {} @f{}_b({}) {{", if e.ret_num { "double" } else { "i64" }, f.fn_id, ps.join(", "));
        e.s.push_str("entry:\n");
        for r in 0..f.nregs {
            let _ = writeln!(e.s, "  %r{r} = alloca {}", ty_of(e.kind_of(r)));
        }
        for i in 0..ncap {
            let k = e.kind_of(i as u32);
            let _ = writeln!(e.s, "  store {} %u{i}, ptr %r{i}", ty_of(k));
        }
        for p in 0..f.nparams as usize {
            let k = if e.param_num(p) { Kind::Num } else { Kind::Handle };
            let _ = writeln!(e.s, "  store {} %p{p}, ptr %r{}", ty_of(k), ncap + p);
        }
        let _ = writeln!(e.s, "  br label %{}", e.label(0));
        for blk in 0..f.blocks.len() as u32 {
            e.emit_block(blk);
        }
        s.push_str(&e.s);
        s.push_str("}\n");

        // Memo wrapper: `@f{id}` is what callers and dispatch enter. It answers from a
        // direct-mapped slot when the epoch is current and every argument word matches, and
        // otherwise runs the body and records the result there.
        let id = f.fn_id;
        let ret = if types.ret_num[fi] { "double" } else { "i64" };
        let k = kinds.len();
        let slots = if k == 0 { 1 } else { MEMO_SLOTS };
        let _ = writeln!(s, "
define {ret} @f{id}({}) {{", ps.join(", "));
        s.push_str("entry:
");
        let _ = writeln!(s, "  %mep{id} = load i64, ptr @bhub_memo_epoch");
        // Argument words. `Num` and `Bool` parameters are compared bitwise.
        let mut key = Vec::new();
        for i in 0..k {
            let name = if i < ncap { format!("%u{i}") } else { format!("%p{}", i - ncap) };
            key.push(match kinds[i] {
                Kind::Num => {
                    let t = format!("%mk{id}_{i}");
                    let _ = writeln!(s, "  {t} = bitcast double {name} to i64");
                    t
                }
                Kind::Bool => {
                    let t = format!("%mk{id}_{i}");
                    let _ = writeln!(s, "  {t} = zext i1 {name} to i64");
                    t
                }
                Kind::Handle => name,
            });
        }
        // Direct-map index: a multiply-mix over the argument words, top bits.
        let idx = if k == 0 {
            "0".to_string()
        } else {
            let mut h = format!("%mh{id}_0");
            let _ = writeln!(s, "  {h} = xor i64 {}, {HASH_MIX}", key[0]);
            let _ = writeln!(s, "  %mh{id}_0m = mul i64 {h}, {HASH_MIX}");
            h = format!("%mh{id}_0m");
            for i in 1..k {
                let x = format!("%mh{id}_{i}");
                let _ = writeln!(s, "  {x} = xor i64 {h}, {}", key[i]);
                let m = format!("%mh{id}_{i}m");
                let _ = writeln!(s, "  {m} = mul i64 {x}, {HASH_MIX}");
                h = m;
            }
            let sh = format!("%msh{id}");
            let _ = writeln!(s, "  {sh} = lshr i64 {h}, 32");
            let ix = format!("%midx{id}");
            let _ = writeln!(s, "  {ix} = and i64 {sh}, {}", slots - 1);
            ix
        };
        let _ = writeln!(s, "  %mep{id}p = getelementptr [{slots} x i64], ptr @m{id}_e, i64 0, i64 {idx}");
        let _ = writeln!(s, "  %mrp{id} = getelementptr [{slots} x {ret}], ptr @m{id}_r, i64 0, i64 {idx}");
        let _ = writeln!(s, "  %mep{id}v = load i64, ptr %mep{id}p");
        let _ = writeln!(s, "  %mep{id}ok = icmp eq i64 %mep{id}v, %mep{id}");
        let mut acc = format!("%mep{id}ok");
        if k > 0 {
            let _ = writeln!(s, "  %mk{id}p = getelementptr [{slots} x [{k} x i64]], ptr @m{id}_k, i64 0, i64 {idx}, i64 0");
            for i in 0..k {
                let gp = format!("%mkg{id}_{i}");
                let gv = format!("%mkv{id}_{i}");
                let eq = format!("%mke{id}_{i}");
                let _ = writeln!(s, "  {gp} = getelementptr i64, ptr %mk{id}p, i64 {i}");
                let _ = writeln!(s, "  {gv} = load i64, ptr {gp}");
                let _ = writeln!(s, "  {eq} = icmp eq i64 {}, {gv}", key[i]);
                let nx = format!("%mka{id}_{i}");
                let _ = writeln!(s, "  {nx} = and i1 {acc}, {eq}");
                acc = nx;
            }
        }
        let _ = writeln!(s, "  br i1 {acc}, label %mhit{id}, label %mmiss{id}");
        let _ = writeln!(s, "mhit{id}:");
        let _ = writeln!(s, "  %mr{id} = load {ret}, ptr %mrp{id}");
        let _ = writeln!(s, "  ret {ret} %mr{id}");
        let _ = writeln!(s, "mmiss{id}:");
        let _ = writeln!(s, "  %mv{id} = call {ret} @f{id}_b({})", ps.join(", "));
        if k > 0 {
            for i in 0..k {
                let _ = writeln!(s, "  store i64 {}, ptr %mkg{id}_{i}", key[i]);
            }
        }
        let _ = writeln!(s, "  store {ret} %mv{id}, ptr %mrp{id}");
        let _ = writeln!(s, "  store i64 %mep{id}, ptr %mep{id}p");
        let _ = writeln!(s, "  ret {ret} %mv{id}");
        let _ = writeln!(s, "}}");
    }

    // The runtime re-enters compiled code through this table (higher-order builtins, closures).
    // The frame is `[n x i64]` `BVal`s, and the result is a `BVal` too.
    let _ = writeln!(s, "\ndefine i64 @bhub_dispatch(i32 %fn, ptr %args, i32 %n) {{");
    s.push_str("entry:\n");
    let cases: Vec<&CodeFn> = code.fns.iter().filter(|f| keep[f.fn_id as usize]).collect();
    if cases.is_empty() {
        let _ = writeln!(s, "  ret i64 -1");
    } else {
        let _ = writeln!(s, "  switch i32 %fn, label %bad [");
        for f in &cases {
            let _ = writeln!(s, "    i32 {}, label %case{}", f.fn_id, f.fn_id);
        }
        let _ = writeln!(s, "  ]");
    }
    // Unique `%dt`/`%db` names for the inlined numeric-argument unboxing below.
    let mut dc = 0u32;
    for f in &cases {
        let fi = f.fn_id as usize;
        let _ = writeln!(s, "\ncase{}:", f.fn_id);
        let mut pv: Vec<String> = Vec::new();
        let ncap = f.ncaptures as usize;
        for p in 0..ncap {
            let _ = writeln!(s, "  %ap{}_{p} = getelementptr i64, ptr %args, i32 {p}", f.fn_id);
            let _ = writeln!(s, "  %a{}_{p} = load i64, ptr %ap{}_{p}", f.fn_id, f.fn_id);
            pv.push(format!("i64 %a{}_{p}", f.fn_id));
        }
        for p in 0..f.nparams as usize {
            let k = ncap + p;
            let _ = writeln!(s, "  %ap{}_{k} = getelementptr i64, ptr %args, i32 {k}", f.fn_id);
            let _ = writeln!(s, "  %a{}_{k} = load i64, ptr %ap{}_{k}", f.fn_id, f.fn_id);
            if param_is_num(params, fi, p) {
                // Same inlined tag test as `Fn::to_num_bits`: a tagged argument is not a number,
                // and the runtime hands every non-number the canonical NaN.
                let n = format!("%n{}_{k}", f.fn_id);
                let _ = writeln!(s, "  %dt{dc} = icmp uge i64 %a{}_{k}, {TAG_FLOOR}", f.fn_id);
                let _ = writeln!(s, "  %db{dc} = bitcast i64 %a{}_{k} to double", f.fn_id);
                let _ = writeln!(s, "  {n} = select i1 %dt{dc}, double 0x7FF8000000000000, double %db{dc}");
                pv.push(format!("double {n}"));
                dc += 1;
            } else {
                pv.push(format!("i64 %a{}_{k}", f.fn_id));
            }
        }
        if types.ret_num[fi] {
            let _ = writeln!(s, "  %rv{} = call double @f{}({})", f.fn_id, f.fn_id, pv.join(", "));
            let _ = writeln!(s, "  %rh{} = bitcast double %rv{} to i64", f.fn_id, f.fn_id);
        } else {
            let _ = writeln!(s, "  %rh{} = call i64 @f{}({})", f.fn_id, f.fn_id, pv.join(", "));
        }
        let _ = writeln!(s, "  ret i64 %rh{}", f.fn_id);
    }
    s.push_str("\nbad:\n  ret i64 -1\n}\n");
    Some(s)
}

impl Fn<'_> {
    fn emit_block(&mut self, blk: u32) {
        let body = self.f.blocks[blk as usize].clone();
        let _ = writeln!(self.s, "\n{}:", self.label(blk));
        let n = body.len();
        for (idx, i) in body.iter().enumerate() {
            if idx + 1 == n {
                self.emit_ret(i, blk);
            } else {
                self.emit_instr(i, blk, idx);
            }
        }
    }

    /// A block ends in `Ret`: either it returns from the function, or it hands its value to the
    /// parent construct and branches to the join label.
    fn emit_ret(&mut self, i: &Instr, blk: u32) {
        let Instr::Ret { src } = i else {
            // Not a `Ret`: treat as a plain instruction (defensive; lowering always ends in `Ret`).
            self.emit_instr(i, blk, usize::MAX);
            return;
        };
        let dest = self.dest.get(blk as usize).cloned().flatten();
        match dest {
            Some((dst, join)) => {
                match self.kind_of(dst) {
                    Kind::Num => {
                        let v = self.num_of(*src);
                        let _ = writeln!(self.s, "  store double {v}, ptr %r{dst}");
                    }
                    Kind::Bool => {
                        let b = self.bool_of(*src);
                        let _ = writeln!(self.s, "  store i1 {b}, ptr %r{dst}");
                    }
                    Kind::Handle => {
                        let h = self.handle(*src);
                        let _ = writeln!(self.s, "  store i64 {h}, ptr %r{dst}");
                    }
                }
                let _ = writeln!(self.s, "  br label %{join}");
            }
            None => {
                if self.ret_num {
                    let v = self.num_of(*src);
                    let _ = writeln!(self.s, "  ret double {v}");
                } else {
                    let h = self.handle(*src);
                    let _ = writeln!(self.s, "  ret i64 {h}");
                }
            }
        }
    }

    fn emit_instr(&mut self, i: &Instr, blk: u32, idx: usize) {
        match i {
            Instr::Const { dst, val } => match self.code.consts.get(*val as usize) {
                Some(buildhub_core::value::Value::Num(n)) => {
                    let v = format!("0x{:016X}", n.to_bits());
                    self.store_num(*dst, &v);
                }
                Some(buildhub_core::value::Value::Bool(b)) => {
                    // A `Bool` register is a real `i1`; storing a handle into it would overwrite
                    // the neighbouring slot.
                    self.store_bool(*dst, if *b { "true" } else { "false" });
                }
                _ => {
                    let t = self.tmp();
                    let _ = writeln!(self.s, "  {t} = load i64, ptr @k{val}");
                    self.store_handle(*dst, &t);
                }
            },
            Instr::Bin { dst, op, a, b } => {
                use buildhub_core::ast::BinOp as B;
                let arith = matches!(op, B::Add | B::Sub | B::Mul | B::Div | B::FloorDiv | B::Rem);
                if arith && self.is_num_reg(*a) && self.is_num_reg(*b) {
                    let x = self.num_of(*a);
                    let y = self.num_of(*b);
                    let r = self.tmp();
                    match op {
                        B::Add => {
                            let _ = writeln!(self.s, "  {r} = fadd double {x}, {y}");
                        }
                        B::Sub => {
                            let _ = writeln!(self.s, "  {r} = fsub double {x}, {y}");
                        }
                        B::Mul => {
                            let _ = writeln!(self.s, "  {r} = fmul double {x}, {y}");
                        }
                        B::Div => {
                            let _ = writeln!(self.s, "  {r} = fdiv double {x}, {y}");
                        }
                        B::Rem => {
                            let _ = writeln!(self.s, "  {r} = frem double {x}, {y}");
                        }
                        B::FloorDiv => {
                            let d = self.tmp();
                            let _ = writeln!(self.s, "  {d} = fdiv double {x}, {y}");
                            let _ = writeln!(self.s, "  {r} = call double @llvm.floor.f64(double {d})");
                        }
                        _ => unreachable!(),
                    }
                    let c = self.canon_num(&r);
                    self.store_num(*dst, &c);
                } else if self.is_num_reg(*a) && self.is_num_reg(*b)
                    && matches!(op, B::Eq | B::Ne | B::Lt | B::Le | B::Gt | B::Ge)
                {
                    let pred = match op {
                        B::Eq => "oeq",
                        B::Ne => "une",
                        B::Lt => "olt",
                        B::Le => "ole",
                        B::Gt => "ogt",
                        _ => "oge",
                    };
                    let (x, y) = (self.num_of(*a), self.num_of(*b));
                    let t = self.tmp();
                    let _ = writeln!(self.s, "  {t} = fcmp {pred} double {x}, {y}");
                    self.store_bool(*dst, &t);
                } else if self.is_bool_reg(*a) && self.is_bool_reg(*b) && matches!(op, B::And | B::Or) {
                    let (x, y) = (self.bool_of(*a), self.bool_of(*b));
                    let t = self.tmp();
                    let ins = if matches!(op, B::And) { "and" } else { "or" };
                    let _ = writeln!(self.s, "  {t} = {ins} i1 {x}, {y}");
                    self.store_bool(*dst, &t);
                } else if self.mixed_bin(*dst, *op, *a, *b) {
                    // Handled: one `Num` operand went to the runtime unboxed.
                } else if matches!(op, B::Eq | B::Ne) && self.eq_fast(*dst, *op, *a, *b) {
                    // Handled: a constant operand, or one unboxed number.
                } else if matches!(op, B::Eq | B::Ne) {
                    let (x, y) = (self.handle(*a), self.handle(*b));
                    let t = self.tmp();
                    let f = if matches!(op, B::Eq) { "bhub_eq" } else { "bhub_ne" };
                    let _ = writeln!(self.s, "  {t} = call i32 @{f}(i64 {x}, i64 {y})");
                    let b = self.tmp();
                    let _ = writeln!(self.s, "  {b} = icmp ne i32 {t}, 0");
                    self.store_bool(*dst, &b);
                } else {
                    let x = self.handle(*a);
                    let y = self.handle(*b);
                    let h = self.tmp();
                    let _ = writeln!(self.s, "  {h} = call i64 @bhub_bin(i32 {}, i64 {x}, i64 {y})", binop_ord(*op));
                    self.store_handle(*dst, &h);
                }
            }
            Instr::Un { dst, op, a } => {
                if matches!(op, buildhub_core::ast::UnOp::Not) && self.is_bool_reg(*a) {
                    let x = self.bool_of(*a);
                    let t = self.tmp();
                    let _ = writeln!(self.s, "  {t} = xor i1 {x}, true");
                    self.store_bool(*dst, &t);
                } else if matches!(op, buildhub_core::ast::UnOp::Neg) && self.is_num_reg(*a) {
                    let x = self.num_of(*a);
                    let r = self.tmp();
                    let _ = writeln!(self.s, "  {r} = fneg double {x}");
                    let c = self.canon_num(&r);
                    self.store_num(*dst, &c);
                } else {
                    let x = self.handle(*a);
                    let h = self.tmp();
                    let ord = if matches!(op, buildhub_core::ast::UnOp::Neg) { 0 } else { 1 };
                    let _ = writeln!(self.s, "  {h} = call i64 @bhub_un(i32 {ord}, i64 {x})");
                    self.store_handle(*dst, &h);
                }
            }
            Instr::Prim { dst, b, args } => {
                use buildhub_core::ir::Builtin as B;
                let bare = args.iter().all(|r| self.is_num_reg(*r));
                // `llvm.minimum`/`maximum` are wasm's `f64.min`/`max`: NaN propagates and zeros pick
                // the right sign, which is why they can replace the runtime call exactly.
                let unary = match b {
                    B::Abs => Some("fabs"),
                    B::Floor => Some("floor"),
                    B::Ceil => Some("ceil"),
                    B::Trunc => Some("trunc"),
                    B::Round => Some("round"),
                    B::Sqrt => Some("sqrt"),
                    _ => None,
                };
                let binary = match b {
                    B::Min => Some("minimum"),
                    B::Max => Some("maximum"),
                    _ => None,
                };
                if let Some(op) = unary.filter(|_| args.len() == 1 && bare) {
                    let x = self.num_of(args[0]);
                    let r = self.tmp();
                    let _ = writeln!(self.s, "  {r} = call double @llvm.{op}.f64(double {x})");
                    let c = self.canon_num(&r);
                    self.store_num(*dst, &c);
                } else if let Some(op) = binary.filter(|_| args.len() == 2 && bare) {
                    let (x, y) = (self.num_of(args[0]), self.num_of(args[1]));
                    let r = self.tmp();
                    let _ = writeln!(self.s, "  {r} = call double @llvm.{op}.f64(double {x}, double {y})");
                    let c = self.canon_num(&r);
                    self.store_num(*dst, &c);
                } else if matches!(b, B::Clamp) && args.len() == 3 && bare {
                    let (v, lo, hi) = (self.num_of(args[0]), self.num_of(args[1]), self.num_of(args[2]));
                    let a = self.tmp();
                    let _ = writeln!(self.s, "  {a} = call double @llvm.maximum.f64(double {v}, double {lo})");
                    let r = self.tmp();
                    let _ = writeln!(self.s, "  {r} = call double @llvm.minimum.f64(double {a}, double {hi})");
                    let c = self.canon_num(&r);
                    self.store_num(*dst, &c);
                } else if let Some(h) = fast_one(*b, args, self) {
                    // Dedicated entry point: no `Dist`, no 48-arm builtin dispatch, no arg array.
                    match h.1 {
                        Kind::Num => self.store_num(*dst, &h.0),
                        Kind::Bool => self.store_bool(*dst, &h.0),
                        Kind::Handle => self.store_handle(*dst, &h.0),
                    }
                } else {
                    let arr = self.handle_array(args);
                    let t = self.tmp();
                    let _ = writeln!(self.s, "  {t} = call i64 @bhub_prim(i32 {}, ptr {arr}, i32 {})", *b as i32, args.len());
                    self.store_handle(*dst, &t);
                }
            }
            Instr::Field { dst, rec, sym } => {
                let h = self.handle(*rec);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_field(i64 {h}, i32 {sym})");
                self.store_handle(*dst, &t);
            }
            Instr::GetOr { dst, opt, def } => {
                let (x, y) = (self.handle(*opt), self.handle(*def));
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_get_or(i64 {x}, i64 {y})");
                self.store_handle(*dst, &t);
            }
            Instr::Update { dst, rec, patch } => {
                let (x, y) = (self.handle(*rec), self.handle(*patch));
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_update(i64 {x}, i64 {y})");
                self.store_handle(*dst, &t);
            }
            Instr::MkRec { dst, schema, fields } => {
                // Field names stay `i32` symbol ids; the values are `BVal`s.
                let n = fields.len().max(1);
                let ka = self.tmp();
                let _ = writeln!(self.s, "  {ka} = alloca [{n} x i32]");
                let va = self.tmp();
                let _ = writeln!(self.s, "  {va} = alloca [{n} x i64]");
                for (k, (sym, val)) in fields.iter().enumerate() {
                    let p = self.tmp();
                    let _ = writeln!(self.s, "  {p} = getelementptr inbounds [{n} x i32], ptr {ka}, i64 0, i64 {k}");
                    let _ = writeln!(self.s, "  store i32 {sym}, ptr {p}");
                    let h = self.handle(*val);
                    let q = self.tmp();
                    let _ = writeln!(self.s, "  {q} = getelementptr inbounds [{n} x i64], ptr {va}, i64 0, i64 {k}");
                    let _ = writeln!(self.s, "  store i64 {h}, ptr {q}");
                }
                let t = self.tmp();
                let sc = schema.map(|s| s as i32).unwrap_or(-1);
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_mk_rec(ptr {ka}, ptr {va}, i32 {}, i32 {sc})", fields.len());
                self.store_handle(*dst, &t);
            }
            Instr::MkList { dst, items } => {
                let arr = self.handle_array(items);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_mk_list(ptr {arr}, i32 {})", items.len());
                self.store_handle(*dst, &t);
            }
            Instr::MkTuple { dst, items } => {
                let arr = self.handle_array(items);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_mk_tuple(ptr {arr}, i32 {})", items.len());
                self.store_handle(*dst, &t);
            }
            Instr::Tag { dst, kind, inner } => {
                let h = self.handle(*inner);
                let ord = match kind {
                    buildhub_core::ssa::TagKind::Some => 0,
                    buildhub_core::ssa::TagKind::Ok => 2,
                    buildhub_core::ssa::TagKind::Err => 3,
                };
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_tag(i32 {ord}, i64 {h})");
                self.store_handle(*dst, &t);
            }
            Instr::At { dst, src, idx } => {
                let h = self.handle(*src);
                let n = self.num_of(*idx);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_at(i64 {h}, double {n})");
                self.store_handle(*dst, &t);
            }
            Instr::Concat { dst, a, b } => {
                let (x, y) = (self.handle(*a), self.handle(*b));
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_concat(i64 {x}, i64 {y})");
                self.store_handle(*dst, &t);
            }
            Instr::Call { dst, fn_id, args } => {
                let mut pv: Vec<String> = Vec::new();
                let ncap = self.code.fns[*fn_id as usize].ncaptures as usize;
                for (p, r) in args.iter().enumerate() {
                    if p < ncap {
                        let h = self.handle(*r);
                        pv.push(format!("i64 {h}"));
                        continue;
                    }
                    if param_is_num(self.params, *fn_id as usize, p - ncap) {
                        let v = self.num_of(*r);
                        pv.push(format!("double {v}"));
                    } else {
                        let h = self.handle(*r);
                        pv.push(format!("i64 {h}"));
                    }
                }
                let rt = self.ret_num_of(*fn_id);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call {} @f{}({})", if rt { "double" } else { "i64" }, fn_id, pv.join(", "));
                if rt {
                    self.store_num(*dst, &t);
                } else {
                    self.store_handle(*dst, &t);
                }
            }
            Instr::CallValue { dst, callee, args } => {
                let c = self.handle(*callee);
                let arr = self.handle_array(args);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_call_value(i64 {c}, ptr {arr}, i32 {})", args.len());
                self.store_handle(*dst, &t);
            }
            Instr::CallHigher { dst, b, args } => {
                if let Some((t, k)) = higher_one(*b, args, self) {
                    // Dedicated entry point: no argument array, no builtin-table dispatch.
                    match k {
                        Kind::Num => self.store_num(*dst, &t),
                        Kind::Bool => self.store_bool(*dst, &t),
                        Kind::Handle => self.store_handle(*dst, &t),
                    }
                } else {
                    let arr = self.handle_array(args);
                    let t = self.tmp();
                    let _ = writeln!(self.s, "  {t} = call i64 @bhub_prim(i32 {}, ptr {arr}, i32 {})", *b as i32, args.len());
                    self.store_handle(*dst, &t);
                }
            }
            Instr::Closure { dst, fn_id, caps } => {
                let arr = self.handle_array(caps);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_closure(i32 {fn_id}, ptr {arr}, i32 {})", caps.len());
                self.store_handle(*dst, &t);
            }
            Instr::Enter { blk: child, .. } => {
                let join = join_label(self.f.fn_id, blk, idx);
                let _ = writeln!(self.s, "  br label %{}", self.label(*child));
                let _ = writeln!(self.s, "{join}:");
            }
            Instr::Fork { cond, then_blk, else_blk, .. } => {
                let c = self.bool_of(*cond);
                let join = join_label(self.f.fn_id, blk, idx);
                let _ = writeln!(
                    self.s,
                    "  br i1 {c}, label %{}, label %{}",
                    self.label(*then_blk),
                    self.label(*else_blk)
                );
                let _ = writeln!(self.s, "{join}:");
            }
            Instr::Choose { .. } => unreachable!("choose is rejected before emission"),
            Instr::Ret { .. } => unreachable!("ret is a block terminator"),
            Instr::Expect { dst, src } => {
                let h = self.handle(*src);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_expect(i64 {h})");
                self.store_handle(*dst, &t);
            }
            Instr::Data { dst, set, access } => {
                let (kind, arg) = match access {
                    DataCode::All => (0, "-1".to_string()),
                    DataCode::Len => (1, "-1".to_string()),
                    DataCode::ByKey(r) => (2, self.handle(*r)),
                    DataCode::ByIndex(r) => (3, self.handle(*r)),
                };
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_data(i32 {set}, i32 {kind}, i64 {arg})");
                self.store_handle(*dst, &t);
            }
            Instr::MatchPat { dst, src, pat } => {
                let h = self.handle(*src);
                // Specialise the two shapes that account for almost every `match` in pack code:
                // `some(x)` (unwrap into a frame slot) and `none` (a predicate). The general
                // pattern path keeps the full matcher.
                let pat_obj = &self.code.patterns[*pat as usize];
                match pat_obj {
                    buildhub_core::ast::Pattern::Some(inner)
                        if matches!(**inner, buildhub_core::ast::Pattern::Bind(_)) =>
                    {
                        let slot = match &**inner {
                            buildhub_core::ast::Pattern::Bind(n) => buildhub_core::resolve::split_binding(n).map(|(s, _)| s as u32),
                            _ => None,
                        };
                        if let Some(slot) = slot {
                            let f = self.tmp();
                            let _ = writeln!(self.s, "  {f} = alloca [1 x i64]");
                            let t = self.tmp();
                            let _ = writeln!(self.s, "  {t} = call i32 @bhub_match_some(i64 {h}, ptr {f})");
                            let b = self.tmp();
                            let _ = writeln!(self.s, "  {b} = icmp ne i32 {t}, 0");
                            self.store_bool(*dst, &b);
                            let sv = self.tmp();
                            let _ = writeln!(self.s, "  {sv} = load i64, ptr {f}");
                            // `store_handle` unboxes when the slot is typed `Num`.
                            self.store_handle(slot, &sv);
                            return;
                        }
                    }
                    buildhub_core::ast::Pattern::None => {
                        let t = self.tmp();
                        let _ = writeln!(self.s, "  {t} = call i32 @bhub_is_none(i64 {h})");
                        let b = self.tmp();
                        let _ = writeln!(self.s, "  {b} = icmp ne i32 {t}, 0");
                        self.store_bool(*dst, &b);
                        return;
                    }
                    buildhub_core::ast::Pattern::Wild => {
                        self.store_bool(*dst, "true");
                        return;
                    }
                    buildhub_core::ast::Pattern::Bind(n) => {
                        self.store_bool(*dst, "true");
                        if let Some((slot, _)) = buildhub_core::resolve::split_binding(n) {
                            self.store_handle(slot, &h.clone());
                        }
                        return;
                    }
                    _ => {}
                }
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i32 @bhub_match_pat(i32 {pat}, i64 {h})");
                let b = self.tmp();
                let _ = writeln!(self.s, "  {b} = icmp ne i32 {t}, 0");
                self.store_bool(*dst, &b);
                for slot in pattern_slots(pat_obj) {
                    let sv = self.tmp();
                    let _ = writeln!(self.s, "  {sv} = call i64 @bhub_binding(i32 {slot})");
                    self.store_handle(slot, &sv);
                }
            }
            Instr::Host { dst, name, args } => {
                let arr = self.handle_array(args);
                let t = self.tmp();
                let _ = writeln!(self.s, "  {t} = call i64 @bhub_host(i32 {name}, ptr {arr}, i32 {})", args.len());
                self.store_handle(*dst, &t);
            }
        }
    }
}
