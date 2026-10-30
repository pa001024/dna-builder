//! Linear register bytecode: the SSA form both emitters consume (spec §9.1, G5).
//!
//! Lowering goes `R` (resolved tree) → `Code` (flat instruction blocks over numbered registers).
//! Registers reuse the resolver's slot numbers, so a frame is `nslots` + temporaries.
//!
//! Control flow is explicit `Fork`/`Choose` over **blocks**, not inline jumps, because a branch
//! whose condition carries a distribution must be evaluated once per support point
//! (spec §9.8.2.2). Keeping branch bodies in blocks lets the VM take one block per world without
//! duplicating `choice` instances.

use alloc::{boxed::Box, format, string::{String, ToString}, vec, vec::Vec};
use crate::ast::{BinOp, Pattern, UnOp};
use crate::diag::{Diag, DResult, Pos};
use crate::ir::{Builtin, DataAccess, Program, R};
use crate::value::Value;

pub type BlockId = u32;

#[derive(Clone, Debug)]
pub struct CaseCode {
    pub weight: u32,
    pub label: Option<u32>,
    pub body: BlockId,
}

#[derive(Clone, Debug)]
pub enum DataCode {
    All,
    Len,
    ByKey(u32),
    ByIndex(u32),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TagKind {
    Some,
    Ok,
    Err,
}

#[derive(Clone, Debug)]
pub enum Instr {
    Const { dst: u32, val: u32 },
    Bin { dst: u32, op: BinOp, a: u32, b: u32 },
    Un { dst: u32, op: UnOp, a: u32 },
    /// Builtin whose operands are plain values (no function argument).
    Prim { dst: u32, b: Builtin, args: Vec<u32> },
    Field { dst: u32, rec: u32, sym: u32 },
    GetOr { dst: u32, opt: u32, def: u32 },
    Update { dst: u32, rec: u32, patch: u32 },
    MkRec { dst: u32, schema: Option<u32>, fields: Vec<(u32, u32)> },
    MkList { dst: u32, items: Vec<u32> },
    MkTuple { dst: u32, items: Vec<u32> },
    Tag { dst: u32, kind: TagKind, inner: u32 },
    At { dst: u32, src: u32, idx: u32 },
    Concat { dst: u32, a: u32, b: u32 },
    Call { dst: u32, fn_id: u32, args: Vec<u32> },
    CallValue { dst: u32, callee: u32, args: Vec<u32> },
    /// Higher-order builtin: the last operand is a function value, so the host re-enters.
    CallHigher { dst: u32, b: Builtin, args: Vec<u32> },
    Closure { dst: u32, fn_id: u32, caps: Vec<u32> },
    /// Evaluate a block unconditionally and store its result. Blocks are the unit of branching, so
    /// an unconditional one is just "run this sub-expression".
    Enter { dst: u32, blk: BlockId },
    /// Branch per support point: `then_blk` when truthy, `else_blk` otherwise.
    Fork { dst: u32, cond: u32, then_blk: BlockId, else_blk: BlockId },
    Choose { dst: u32, cases: Vec<CaseCode> },
    Expect { dst: u32, src: u32 },
    Data { dst: u32, set: u32, access: DataCode },
    /// Refutable pattern test; on success writes the pattern's bindings into the frame.
    MatchPat { dst: u32, src: u32, pat: u32 },
    /// Declared host capability call (spec §11).
    Host { dst: u32, name: u32, args: Vec<u32> },
    Ret { src: u32 },
}

/// A block's source. Blocks are the unit of branching, so they are generated lazily.
#[derive(Clone, Debug)]
enum BlockSrc {
    Tree(R),
    /// Pattern dispatch: test arms in order, each body in its own block.
    Match { scrut: u32, arms: Vec<crate::ir::RArm> },
}

#[derive(Clone, Debug)]
pub struct CodeFn {
    pub fn_id: u32,
    pub nregs: u32,
    pub nparams: u32,
    pub ncaptures: u32,
    /// `blocks[0]` is the function body.
    pub blocks: Vec<Vec<Instr>>,
}

/// A schema field's type, flattened to a tag plus a recursion. The host needs enough to validate
/// incoming JSON without the source, and nothing more (spec §4.2 "schema 表").
#[derive(Clone, Debug, PartialEq)]
pub enum TyTag {
    Num,
    Bool,
    Sym,
    Str,
    Unit,
    List(Box<TyTag>),
    Option(Box<TyTag>),
    Tuple(Vec<TyTag>),
    Record(Vec<(String, TyTag)>, bool),
    /// A named schema, resolved by id at load time.
    Schema(String),
    Any,
}

#[derive(Clone, Debug)]
pub struct EntryCode {
    pub fn_id: u32,
    pub nparams: u32,
    pub name: String,
    pub params: Vec<TyTag>,
}

#[derive(Clone, Debug)]
pub struct SchemaCode {
    pub name: String,
    pub fields: Vec<(String, TyTag)>,
    pub open: bool,
}

/// A `[[data]]` binding: which JSON set feeds which schema, and which field is the key.
#[derive(Clone, Debug)]
pub struct DataBinding {
    pub name: String,
    pub schema: String,
    pub key: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct Code {
    pub fns: Vec<CodeFn>,
    pub consts: Vec<Value>,
    pub patterns: Vec<Pattern>,
    /// Symbol id → text, so a load can rebuild the interner (needed by path W and parity dumps).
    pub syms: Vec<String>,
    pub entries: Vec<EntryCode>,
    pub nblocks: u32,
    pub schemas: Vec<SchemaCode>,
    pub data: Vec<DataBinding>,
    pub capabilities: Vec<String>,
}

pub fn lower(prog: &Program, interner: &crate::sym::Interner) -> DResult<Code> {
    let mut code = Code {
        syms: (0..interner.len() as u32)
            .map(|i| interner.name(crate::sym::Sym(i)).to_string())
            .collect(),
        ..Code::default()
    };
    for fn_id in 0..prog.fns.len() {
        let def = &prog.fns[fn_id];
        let mut f = FnLower::new(fn_id as u32, def.nslots, def.nparams as u32, def.ncaptures as u32);
        f.alloc(BlockSrc::Tree(def.body.clone()));
        // Lower blocks in allocation order; lowering may append more (nested branches).
        let mut i = 0;
        while i < f.sources.len() {
            let src = f.sources[i].take().expect("block lowered once");
            let blk = f.lower_block(&src, &mut code, prog)?;
            f.blocks[i] = Some(blk);
            i += 1;
        }
        // `nregs` must be read *after* every block is lowered: nested blocks keep allocating
        // temporaries, and all blocks share one frame.
        let nregs = f.nregs;
        let blocks: Vec<Vec<Instr>> = f
            .blocks
            .into_iter()
            .map(|b| b.expect("every allocated block is lowered"))
            .collect();
        code.fns.push(CodeFn {
            fn_id: fn_id as u32,
            nregs: nregs.max(1),
            nparams: def.nparams as u32,
            ncaptures: def.ncaptures as u32,
            blocks,
        });
    }
    code.nblocks = code.fns.iter().map(|f| f.blocks.len() as u32).sum();
    code.schemas = prog
        .schemas
        .iter()
        .map(|s| SchemaCode {
            name: s.name.clone(),
            fields: s.fields.iter().map(|(n, t)| (n.clone(), ty_tag(t))).collect(),
            open: s.open,
        })
        .collect();
    code.capabilities = prog.capabilities.clone();
    code.data = prog
        .data
        .iter()
        .map(|d| DataBinding {
            name: d.name.clone(),
            schema: d.schema.clone(),
            key: d.key.clone(),
        })
        .collect();
    for e in &prog.entries {
        let f = &prog.fns[e.fn_id];
        code.entries.push(EntryCode {
            fn_id: e.fn_id as u32,
            nparams: f.nparams as u32,
            name: e.name.clone(),
            params: f.param_types.iter().map(|t| t.as_ref().map(ty_tag).unwrap_or(TyTag::Any)).collect(),
        });
    }
    verify(&code)?;
    Ok(code)
}

struct FnLower {
    next: u32,
    nregs: u32,
    sources: Vec<Option<BlockSrc>>,
    blocks: Vec<Option<Vec<Instr>>>,
}

impl FnLower {
    fn new(_fn_id: u32, nslots: u32, _nparams: u32, _ncaptures: u32) -> Self {
        Self { next: nslots, nregs: nslots, sources: Vec::new(), blocks: Vec::new() }
    }

    fn temp(&mut self) -> u32 {
        let r = self.next;
        self.next += 1;
        self.nregs = self.nregs.max(self.next);
        r
    }

    fn alloc(&mut self, src: BlockSrc) -> BlockId {
        self.sources.push(Some(src));
        self.blocks.push(None);
        (self.sources.len() - 1) as BlockId
    }

    fn lower_block(&mut self, src: &BlockSrc, code: &mut Code, prog: &Program) -> DResult<Vec<Instr>> {
        let mut out = Vec::new();
        let r = match src {
            BlockSrc::Tree(t) => self.emit(t, &mut out, code, prog)?,
            BlockSrc::Match { scrut, arms } => {
                if arms.is_empty() {
                    let d = self.temp();
                    let val = self.const_of(code, Value::Missing);
                    out.push(Instr::Const { dst: d, val });
                    d
                } else {
                    let arm = &arms[0];
                    let p = self.pat_of(code, &arm.pat);
                    let ok = self.temp();
                    out.push(Instr::MatchPat { dst: ok, src: *scrut, pat: p });
                    let body = match &arm.guard {
                        Some(g) => R::If {
                            cond: Box::new(g.clone()),
                            then: Box::new(arm.body.clone()),
                            els: Box::new(R::Const(Value::Missing)),
                        },
                        None => arm.body.clone(),
                    };
                    let then_blk = self.alloc(BlockSrc::Tree(body));
                    let else_blk =
                        self.alloc(BlockSrc::Match { scrut: *scrut, arms: arms[1..].to_vec() });
                    let d = self.temp();
                    out.push(Instr::Fork { dst: d, cond: ok, then_blk, else_blk });
                    d
                }
            }
        };
        out.push(Instr::Ret { src: r });
        Ok(out)
    }

    fn const_of(&mut self, code: &mut Code, v: Value) -> u32 {
        if let Some(i) = code.consts.iter().position(|x| x.same_as(&v)) {
            return i as u32;
        }
        code.consts.push(v);
        (code.consts.len() - 1) as u32
    }

    fn pat_of(&mut self, code: &mut Code, p: &Pattern) -> u32 {
        if let Some(i) = code.patterns.iter().position(|x| x == p) {
            return i as u32;
        }
        code.patterns.push(p.clone());
        (code.patterns.len() - 1) as u32
    }

    fn emit(&mut self, r: &R, out: &mut Vec<Instr>, code: &mut Code, prog: &Program) -> DResult<u32> {
        Ok(match r {
            R::Const(v) => {
                let dst = self.temp();
                let val = self.const_of(code, v.clone());
                out.push(Instr::Const { dst, val });
                dst
            }
            R::Local(slot) => *slot,
            R::CallStatic { fn_id, args } => {
                let a = self.emit_all(args, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::Call { dst, fn_id: *fn_id as u32, args: a });
                dst
            }
            R::CallValue { callee, args } => {
                let c = self.emit(callee, out, code, prog)?;
                let a = self.emit_all(args, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::CallValue { dst, callee: c, args: a });
                dst
            }
            R::Builtin { b, args } => {
                let a = self.emit_all(args, out, code, prog)?;
                let dst = self.temp();
                if is_higher_order(*b) {
                    out.push(Instr::CallHigher { dst, b: *b, args: a });
                } else {
                    out.push(Instr::Prim { dst, b: *b, args: a });
                }
                dst
            }
            R::Field { base, name } => {
                let rec = self.emit(base, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::Field { dst, rec, sym: name.0 });
                dst
            }
            R::Index { base, idx } => {
                let src = self.emit(base, out, code, prog)?;
                let i = self.emit(idx, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::At { dst, src, idx: i });
                dst
            }
            R::Record { schema, fields } => {
                let mut fs = Vec::with_capacity(fields.len());
                for (k, v) in fields {
                    let reg = self.emit(v, out, code, prog)?;
                    fs.push((k.0, reg));
                }
                let dst = self.temp();
                out.push(Instr::MkRec { dst, schema: schema.map(|s| s as u32), fields: fs });
                dst
            }
            R::List(items) => {
                let regs = self.emit_all(items, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::MkList { dst, items: regs });
                dst
            }
            R::Tuple(items) => {
                let regs = self.emit_all(items, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::MkTuple { dst, items: regs });
                dst
            }
            R::Some(v) | R::Ok(v) | R::Err(v) => {
                let inner = self.emit(v, out, code, prog)?;
                let kind = match r {
                    R::Some(_) => TagKind::Some,
                    R::Ok(_) => TagKind::Ok,
                    _ => TagKind::Err,
                };
                let dst = self.temp();
                out.push(Instr::Tag { dst, kind, inner });
                dst
            }
            R::None => {
                let dst = self.temp();
                let val = self.const_of(code, Value::None);
                out.push(Instr::Const { dst, val });
                dst
            }
            R::If { cond, then, els } => {
                let c = self.emit(cond, out, code, prog)?;
                let then_blk = self.alloc(BlockSrc::Tree((**then).clone()));
                let else_blk = self.alloc(BlockSrc::Tree((**els).clone()));
                let dst = self.temp();
                out.push(Instr::Fork { dst, cond: c, then_blk, else_blk });
                dst
            }
            R::LetPat { pat, value, body } => {
                let src = self.emit(value, out, code, prog)?;
                let p = self.pat_of(code, pat);
                let ok = self.temp();
                out.push(Instr::MatchPat { dst: ok, src, pat: p });
                let then_blk = self.alloc(BlockSrc::Tree((**body).clone()));
                let else_blk = self.alloc(BlockSrc::Tree(R::Const(Value::Missing)));
                let dst = self.temp();
                out.push(Instr::Fork { dst, cond: ok, then_blk, else_blk });
                dst
            }
            R::Match { scrut, arms } => {
                let s = self.emit(scrut, out, code, prog)?;
                // Pattern dispatch lives entirely in its own block: one test per arm, each body in
                // a further block, so no arm is specialised twice.
                let blk = self.alloc(BlockSrc::Match { scrut: s, arms: arms.clone() });
                let dst = self.temp();
                out.push(Instr::Enter { dst, blk });
                dst
            }
            R::Closure { fn_id, captures } => {
                let caps = self.emit_all(captures, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::Closure { dst, fn_id: *fn_id as u32, caps });
                dst
            }
            R::Binary { op, lhs, rhs } => {
                let a = self.emit(lhs, out, code, prog)?;
                let b = self.emit(rhs, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::Bin { dst, op: *op, a, b });
                dst
            }
            R::Unary { op, expr } => {
                let a = self.emit(expr, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::Un { dst, op: *op, a });
                dst
            }
            R::Choice { cases } => {
                let mut cs = Vec::with_capacity(cases.len());
                for c in cases {
                    let weight = self.emit(&c.weight, out, code, prog)?;
                    let body = self.alloc(BlockSrc::Tree(c.value.clone()));
                    cs.push(CaseCode { weight, label: c.label.map(|l| l.0), body });
                }
                let dst = self.temp();
                out.push(Instr::Choose { dst, cases: cs });
                dst
            }
            R::Expected(v) => {
                let src = self.emit(v, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::Expect { dst, src });
                dst
            }
            R::Data { set, access } => {
                let acc = match access {
                    DataAccess::All => DataCode::All,
                    DataAccess::Len => DataCode::Len,
                    DataAccess::ByKey(k) => DataCode::ByKey(self.emit(k, out, code, prog)?),
                    DataAccess::ByIndex(i) => DataCode::ByIndex(self.emit(i, out, code, prog)?),
                };
                let dst = self.temp();
                out.push(Instr::Data { dst, set: *set as u32, access: acc });
                dst
            }
            R::Host { name, args, .. } => {
                let a = self.emit_all(args, out, code, prog)?;
                let dst = self.temp();
                out.push(Instr::Host { dst, name: name.0, args: a });
                dst
            }
        })
    }

    fn emit_all(&mut self, xs: &[R], out: &mut Vec<Instr>, code: &mut Code, prog: &Program) -> DResult<Vec<u32>> {
        let mut regs = Vec::with_capacity(xs.len());
        for x in xs {
            regs.push(self.emit(x, out, code, prog)?);
        }
        Ok(regs)
    }
}

/// Builtins whose operands include a function value, so the caller must be able to re-enter.
pub fn is_higher_order(b: Builtin) -> bool {
    matches!(
        b,
        Builtin::Map
            | Builtin::ConcatMap
            | Builtin::Filter
            | Builtin::Find
            | Builtin::Any
            | Builtin::All
            | Builtin::Count
            | Builtin::Fold
            | Builtin::SortBy
            | Builtin::Fix
    )
}

fn ty_tag(t: &crate::ast::TypeExpr) -> TyTag {
    use crate::ast::TypeExpr::*;
    match t {
        Num => TyTag::Num,
        Bool => TyTag::Bool,
        Sym => TyTag::Sym,
        Str => TyTag::Str,
        Unit => TyTag::Unit,
        List(x) => TyTag::List(Box::new(ty_tag(x))),
        Tuple(xs) => TyTag::Tuple(xs.iter().map(ty_tag).collect()),
        Record { fields, open } => {
            TyTag::Record(fields.iter().map(|(n, x)| (n.clone(), ty_tag(x))).collect(), *open)
        }
        Named(n) => TyTag::Schema(n.clone()),
        Generic(n, args) => {
            if n == "Option" {
                TyTag::Option(Box::new(args.first().map(ty_tag).unwrap_or(TyTag::Any)))
            } else if n == "List" {
                TyTag::List(Box::new(args.first().map(ty_tag).unwrap_or(TyTag::Any)))
            } else {
                TyTag::Schema(n.clone())
            }
        }
        Fn(..) => TyTag::Any,
        Var(_) => TyTag::Any,
    }
}

/// Transitive closure of functions reachable from the entries (spec §9.6.1: "从 `[[entries]]` 做 DCE").
///
/// Lambdas count as reachable through the `Closure` instruction that creates them, so a lambda's own
/// body is included; blocks reachable only from a `Fork`/`Choose` are already part of their
/// function. This is what keeps an AOT artifact proportional to the exported surface.
pub fn reachable(code: &Code) -> Vec<bool> {
    let mut keep = vec![false; code.fns.len()];
    let mut stack: Vec<u32> = code.entries.iter().map(|e| e.fn_id).collect();
    while let Some(fid) = stack.pop() {
        let i = fid as usize;
        if i >= keep.len() || keep[i] {
            continue;
        }
        keep[i] = true;
        for blk in &code.fns[i].blocks {
            for ins in blk {
                match ins {
                    Instr::Call { fn_id, .. } | Instr::Closure { fn_id, .. } => stack.push(*fn_id),
                    _ => {}
                }
            }
        }
    }
    keep
}

/// Structural verification (spec §9.1 `verify`): register, constant, pattern and block bounds.
pub fn verify(code: &Code) -> DResult<()> {
    for f in &code.fns {
        for (bi, blk) in f.blocks.iter().enumerate() {
            let err = |m: String| {
                Diag::new(
                    "BHC-E501",
                    "<code>".to_string(),
                    Pos::default(),
                    format!("BHC-E501 fn#{} block#{bi}: {m}", f.fn_id),
                )
            };
            for ins in blk {
                for r in regs_of(ins) {
                    if r >= f.nregs {
                        return Err(err(format!(
                            "register {r} out of range (nregs {}); instruction {ins:?}",
                            f.nregs
                        )));
                    }
                }
                for b in blocks_of(ins) {
                    if b as usize >= f.blocks.len() {
                        return Err(err(format!("block {b} out of range ({} blocks)", f.blocks.len())));
                    }
                }
                match ins {
                    Instr::Const { val, .. } if *val as usize >= code.consts.len() => {
                        return Err(err(format!("constant {val} out of range")))
                    }
                    Instr::MatchPat { pat, .. } if *pat as usize >= code.patterns.len() => {
                        return Err(err(format!("pattern {pat} out of range")))
                    }
                    Instr::Call { fn_id, .. } | Instr::Closure { fn_id, .. } if *fn_id as usize >= code.fns.len() => {
                        return Err(err(format!("function {fn_id} out of range")))
                    }
                    Instr::Field { sym, .. } | Instr::Host { name: sym, .. } if *sym as usize >= code.syms.len() => {
                        return Err(err(format!("symbol {sym} out of range")))
                    }
                    _ => {}
                }
            }
            if !matches!(blk.last(), Some(Instr::Ret { .. })) {
                return Err(err("block must end with `ret`".to_string()));
            }
        }
    }
    Ok(())
}

fn regs_of(i: &Instr) -> Vec<u32> {
    let mut v = Vec::new();
    let mut push = |r: u32| v.push(r);
    match i {
        Instr::Const { dst, .. } => push(*dst),
        Instr::Bin { dst, a, b, .. } => {
            push(*dst);
            push(*a);
            push(*b);
        }
        Instr::Un { dst, a, .. } => {
            push(*dst);
            push(*a);
        }
        Instr::Prim { dst, args, .. } | Instr::CallHigher { dst, args, .. } | Instr::Host { dst, args, .. } => {
            push(*dst);
            v.extend(args.iter().copied());
        }
        Instr::Field { dst, rec, .. } => {
            push(*dst);
            push(*rec);
        }
        Instr::GetOr { dst, opt, def } => {
            push(*dst);
            push(*opt);
            push(*def);
        }
        Instr::Update { dst, rec, patch } => {
            push(*dst);
            push(*rec);
            push(*patch);
        }
        Instr::MkRec { dst, fields, .. } => {
            // Field names are symbol ids; only the value register is a register.
            push(*dst);
            for (_sym, r) in fields {
                push(*r);
            }
        }
        Instr::MkList { dst, items } | Instr::MkTuple { dst, items } => {
            push(*dst);
            v.extend(items.iter().copied());
        }
        Instr::Tag { dst, inner, .. } => {
            push(*dst);
            push(*inner);
        }
        Instr::At { dst, src, idx } => {
            push(*dst);
            push(*src);
            push(*idx);
        }
        Instr::Concat { dst, a, b } => {
            push(*dst);
            push(*a);
            push(*b);
        }
        Instr::Call { dst, args, .. } => {
            push(*dst);
            v.extend(args.iter().copied());
        }
        Instr::CallValue { dst, callee, args } => {
            push(*dst);
            push(*callee);
            v.extend(args.iter().copied());
        }
        Instr::Closure { dst, caps, .. } => {
            push(*dst);
            v.extend(caps.iter().copied());
        }
        Instr::Fork { dst, cond, .. } => {
            push(*dst);
            push(*cond);
        }
        Instr::Choose { dst, cases } => {
            push(*dst);
            for c in cases {
                push(c.weight);
            }
        }
        Instr::Expect { dst, src } => {
            push(*dst);
            push(*src);
        }
        Instr::Data { dst, access, .. } => {
            push(*dst);
            match access {
                DataCode::ByKey(r) | DataCode::ByIndex(r) => push(*r),
                _ => {}
            }
        }
        Instr::MatchPat { dst, src, .. } => {
            push(*dst);
            push(*src);
        }
        Instr::Ret { src } => push(*src),
        Instr::Enter { dst, .. } => push(*dst),
    }
    v
}

fn blocks_of(i: &Instr) -> Vec<u32> {
    match i {
        Instr::Fork { then_blk, else_blk, .. } => vec![*then_blk, *else_blk],
        Instr::Enter { blk, .. } => vec![*blk],
        Instr::Choose { cases, .. } => cases.iter().map(|c| c.body).collect(),
        _ => Vec::new(),
    }
}
