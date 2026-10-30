//! `CodeImage`: the serializable form of a lowered program (spec §9.1, path B).
//!
//! The format is a small binary container: magic, version, numeric mode, then a tagged stream of
//! the pieces the VM needs. It is deliberately *not* a memory dump — loading re-validates bounds
//! and CRC so a corrupt or hand-edited image fails at load with `BHC-E5xx` instead of trapping.

use alloc::{boxed::Box, format, string::{String, ToString}, vec::Vec};
use crate::ast::{BinOp, Pattern, UnOp};
use crate::diag::{Diag, DResult, Pos};
use crate::ir::Builtin;
use crate::ssa::{CaseCode, Code, CodeFn, DataCode, Instr, TagKind};
use crate::value::{Record, Value};

pub const MAGIC: &[u8; 8] = b"BHLIMG\0\0";
pub const VERSION: u32 = 2;

/// `numeric = "libm"` (default) or `"host"` (spec §9.4: must be declared and checked at load).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NumericMode {
    Libm,
    Host,
}

impl NumericMode {
    fn tag(self) -> u8 {
        match self {
            NumericMode::Libm => 0,
            NumericMode::Host => 1,
        }
    }
    fn from_tag(t: u8) -> DResult<Self> {
        match t {
            0 => Ok(NumericMode::Libm),
            1 => Ok(NumericMode::Host),
            other => Err(err(format!("unknown numeric mode tag {other}"))),
        }
    }
}

fn err(msg: impl Into<String>) -> Diag {
    Diag::new("BHC-E503", "<image>".to_string(), Pos::default(), msg)
}

// ---------------------------------------------------------------------------------------------
// writer
// ---------------------------------------------------------------------------------------------

#[derive(Default)]
struct W {
    buf: Vec<u8>,
}

impl W {
    fn u8(&mut self, v: u8) {
        self.buf.push(v);
    }
    fn u32(&mut self, v: u32) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }
    fn u64(&mut self, v: u64) {
        self.buf.extend_from_slice(&v.to_le_bytes());
    }
    fn f64(&mut self, v: f64) {
        // Bit pattern, not decimal text: `-0.0` and NaN payloads must survive (spec §9.6.4).
        self.u64(v.to_bits());
    }
    fn str(&mut self, s: &str) {
        self.u32(s.len() as u32);
        self.buf.extend_from_slice(s.as_bytes());
    }
    fn sym_opt(&mut self, s: Option<u32>) {
        match s {
            Some(v) => {
                self.u8(1);
                self.u32(v);
            }
            None => self.u8(0),
        }
    }
    fn u32s(&mut self, xs: &[u32]) {
        self.u32(xs.len() as u32);
        for x in xs {
            self.u32(*x);
        }
    }
}

fn write_binop(w: &mut W, op: BinOp) {
    w.u8(match op {
        BinOp::Add => 0,
        BinOp::Sub => 1,
        BinOp::Mul => 2,
        BinOp::Div => 3,
        BinOp::FloorDiv => 4,
        BinOp::Rem => 5,
        BinOp::Eq => 6,
        BinOp::Ne => 7,
        BinOp::Lt => 8,
        BinOp::Le => 9,
        BinOp::Gt => 10,
        BinOp::Ge => 11,
        BinOp::And => 12,
        BinOp::Or => 13,
    });
}

fn read_binop(r: &mut Rd) -> DResult<BinOp> {
    Ok(match r.u8()? {
        0 => BinOp::Add,
        1 => BinOp::Sub,
        2 => BinOp::Mul,
        3 => BinOp::Div,
        4 => BinOp::FloorDiv,
        5 => BinOp::Rem,
        6 => BinOp::Eq,
        7 => BinOp::Ne,
        8 => BinOp::Lt,
        9 => BinOp::Le,
        10 => BinOp::Gt,
        11 => BinOp::Ge,
        12 => BinOp::And,
        13 => BinOp::Or,
        other => return Err(err(format!("bad BinOp tag {other}"))),
    })
}

fn write_pattern(w: &mut W, p: &Pattern) {
    match p {
        Pattern::Bind(n) => {
            w.u8(0);
            w.str(n);
        }
        Pattern::Wild => w.u8(1),
        Pattern::Tuple(ps) => {
            w.u8(2);
            w.u32(ps.len() as u32);
            for x in ps {
                write_pattern(w, x);
            }
        }
        Pattern::Record(fs) => {
            w.u8(3);
            w.u32(fs.len() as u32);
            for (k, x) in fs {
                w.str(k);
                write_pattern(w, x);
            }
        }
        Pattern::Some(x) => {
            w.u8(4);
            write_pattern(w, x);
        }
        Pattern::None => w.u8(5),
        Pattern::Ok(x) => {
            w.u8(6);
            write_pattern(w, x);
        }
        Pattern::Err(x) => {
            w.u8(7);
            write_pattern(w, x);
        }
        Pattern::Num(n) => {
            w.u8(8);
            w.f64(*n);
        }
        Pattern::Sym(s) => {
            w.u8(9);
            w.str(s);
        }
    }
}

fn read_pattern(r: &mut Rd) -> DResult<Pattern> {
    Ok(match r.u8()? {
        0 => Pattern::Bind(r.str()?),
        1 => Pattern::Wild,
        2 => {
            let n = r.u32()?;
            let mut ps = Vec::with_capacity(n as usize);
            for _ in 0..n {
                ps.push(read_pattern(r)?);
            }
            Pattern::Tuple(ps)
        }
        3 => {
            let n = r.u32()?;
            let mut fs = Vec::with_capacity(n as usize);
            for _ in 0..n {
                let k = r.str()?;
                fs.push((k, read_pattern(r)?));
            }
            Pattern::Record(fs)
        }
        4 => Pattern::Some(Box::new(read_pattern(r)?)),
        5 => Pattern::None,
        6 => Pattern::Ok(Box::new(read_pattern(r)?)),
        7 => Pattern::Err(Box::new(read_pattern(r)?)),
        8 => Pattern::Num(r.f64()?),
        9 => Pattern::Sym(r.str()?),
        other => return Err(err(format!("bad pattern tag {other}"))),
    })
}

fn builtin_tag(b: Builtin) -> u8 {
    // Stable on-disk ids: never renumber these (they are the ABI).
    b as u8
}

pub fn builtin_by_tag(t: u8) -> Option<Builtin> {
    builtin_from_tag(t).ok()
}

fn builtin_from_tag(t: u8) -> DResult<Builtin> {
    // Reconstruct from the same enum order used by `builtin_tag`.
    let all = [
        Builtin::Min, Builtin::Max, Builtin::Clamp, Builtin::Abs, Builtin::Floor, Builtin::Ceil,
        Builtin::Round, Builtin::RoundJs, Builtin::Trunc, Builtin::ToFixed, Builtin::Sqrt, Builtin::Pow,
        Builtin::Log, Builtin::SafeDiv, Builtin::Len, Builtin::At, Builtin::Slice, Builtin::Concat,
        Builtin::ConcatMap, Builtin::Map, Builtin::Filter, Builtin::Fold, Builtin::SortBy, Builtin::Take,
        Builtin::Drop, Builtin::Zip, Builtin::Find, Builtin::Any, Builtin::All, Builtin::Count,
        Builtin::Field, Builtin::GetOr, Builtin::Has, Builtin::Update, Builtin::SymOf, Builtin::NumOf,
        Builtin::Fix, Builtin::Choice, Builtin::Expected, Builtin::Trace, Builtin::Inf, Builtin::Nan,
        Builtin::IsNum, Builtin::IsList, Builtin::StrLen, Builtin::StrAt, Builtin::StrSlice, Builtin::StrEq,
        Builtin::Keys, Builtin::GroupSum, Builtin::DedupBy, Builtin::Fold2,
    ];
    all.iter().copied().find(|b| builtin_tag(*b) == t).ok_or_else(|| err(format!("bad builtin tag {t}")))
}

fn write_value(w: &mut W, v: &Value) {
    match v {
        Value::Num(n) => {
            w.u8(0);
            w.f64(*n);
        }
        Value::Bool(b) => {
            w.u8(1);
            w.u8(u8::from(*b));
        }
        Value::Sym(s) => {
            w.u8(2);
            w.u32(s.0);
        }
        Value::Unit => w.u8(3),
        Value::Str(s) => {
            w.u8(4);
            w.str(s);
        }
        Value::List(xs) | Value::Tuple(xs) => {
            w.u8(if matches!(v, Value::List(_)) { 5 } else { 6 });
            w.u32(xs.len() as u32);
            for x in xs.iter() {
                write_value(w, x);
            }
        }
        Value::Record(r) => {
            w.u8(7);
            w.sym_opt(r.schema);
            w.u32(r.fields.len() as u32);
            for (k, x) in &r.fields {
                w.u32(k.0);
                write_value(w, x);
            }
        }
        Value::Closure(_) | Value::Builtin(_) => {
            // Constants are loaded before any code runs, so they cannot hold live closures.
            w.u8(8);
        }
        Value::Some(x) => {
            w.u8(9);
            write_value(w, x);
        }
        Value::None => w.u8(10),
        Value::Ok(x) => {
            w.u8(11);
            write_value(w, x);
        }
        Value::Err(x) => {
            w.u8(12);
            write_value(w, x);
        }
        Value::Missing => w.u8(13),
    }
}

fn read_value(r: &mut Rd) -> DResult<Value> {
    Ok(match r.u8()? {
        0 => Value::Num(r.f64()?),
        1 => Value::Bool(r.u8()? != 0),
        2 => Value::Sym(crate::sym::Sym(r.u32()?)),
        3 => Value::Unit,
        4 => Value::Str(alloc::rc::Rc::from(r.str()?.as_str())),
        5 => {
            let n = r.u32()?;
            let mut xs = Vec::with_capacity(n as usize);
            for _ in 0..n {
                xs.push(read_value(r)?);
            }
            Value::list(xs)
        }
        6 => {
            let n = r.u32()?;
            let mut xs = Vec::with_capacity(n as usize);
            for _ in 0..n {
                xs.push(read_value(r)?);
            }
            Value::tuple(xs)
        }
        7 => {
            let schema = match r.u8()? {
                1 => Some(r.u32()?),
                _ => None,
            };
            let n = r.u32()?;
            let mut rec = Record::new();
            rec.schema = schema;
            for _ in 0..n {
                let k = crate::sym::Sym(r.u32()?);
                rec.set(k, read_value(r)?);
            }
            Value::record(rec)
        }
        8 => Value::Unit,
        9 => Value::Some(Box::new(read_value(r)?)),
        10 => Value::None,
        11 => Value::Ok(Box::new(read_value(r)?)),
        12 => Value::Err(Box::new(read_value(r)?)),
        13 => Value::Missing,
        other => return Err(err(format!("bad value tag {other}"))),
    })
}

pub fn encode(code: &Code, numeric: NumericMode) -> Vec<u8> {
    let mut w = W::default();
    w.buf.extend_from_slice(MAGIC);
    w.u32(VERSION);
    w.u8(numeric.tag());
    w.u32(code.syms.len() as u32);
    for s in &code.syms {
        w.str(s);
    }
    w.u32(code.consts.len() as u32);
    for c in &code.consts {
        write_value(&mut w, c);
    }
    w.u32(code.patterns.len() as u32);
    for p in &code.patterns {
        write_pattern(&mut w, p);
    }
    w.u32(code.fns.len() as u32);
    for f in &code.fns {
        w.u32(f.fn_id);
        w.u32(f.nregs);
        w.u32(f.nparams);
        w.u32(f.ncaptures);
        w.u32(f.blocks.len() as u32);
        for blk in &f.blocks {
            w.u32(blk.len() as u32);
            for ins in blk {
                write_instr(&mut w, ins);
            }
        }
    }
    w.u32(code.entries.len() as u32);
    for e in &code.entries {
        w.u32(e.fn_id);
        w.u32(e.nparams);
        w.str(&e.name);
        w.u32(e.params.len() as u32);
        for t in &e.params {
            write_ty(&mut w, t);
        }
    }
    // schema table + capabilities (the host needs both to validate JSON and reject unknown hosts).
    w.u32(code.schemas.len() as u32);
    for sc in &code.schemas {
        w.str(&sc.name);
        w.u8(u8::from(sc.open));
        w.u32(sc.fields.len() as u32);
        for (n, t) in &sc.fields {
            w.str(n);
            write_ty(&mut w, t);
        }
    }
    // `[[data]]` bindings: which set feeds which schema, and the declared key field.
    w.u32(code.data.len() as u32);
    for d in &code.data {
        w.str(&d.name);
        w.str(&d.schema);
        match &d.key {
            Some(k) => {
                w.u8(1);
                w.str(k);
            }
            None => w.u8(0),
        }
    }
    w.u32(code.capabilities.len() as u32);
    for c in &code.capabilities {
        w.str(c);
    }
    let crc = crc32(&w.buf);
    w.u32(crc);
    w.buf
}

fn write_ty(w: &mut W, t: &crate::ssa::TyTag) {
    use crate::ssa::TyTag::*;
    match t {
        Num => w.u8(0),
        Bool => w.u8(1),
        Sym => w.u8(2),
        Str => w.u8(3),
        Unit => w.u8(4),
        List(x) => {
            w.u8(5);
            write_ty(w, x);
        }
        Option(x) => {
            w.u8(6);
            write_ty(w, x);
        }
        Tuple(xs) => {
            w.u8(7);
            w.u32(xs.len() as u32);
            for x in xs {
                write_ty(w, x);
            }
        }
        Record(fs, open) => {
            w.u8(8);
            w.u8(u8::from(*open));
            w.u32(fs.len() as u32);
            for (n, x) in fs {
                w.str(n);
                write_ty(w, x);
            }
        }
        Schema(n) => {
            w.u8(9);
            w.str(n);
        }
        Any => w.u8(10),
    }
}

fn read_ty(r: &mut Rd) -> DResult<crate::ssa::TyTag> {
    use crate::ssa::TyTag::*;
    Ok(match r.u8()? {
        0 => Num,
        1 => Bool,
        2 => Sym,
        3 => Str,
        4 => Unit,
        5 => List(Box::new(read_ty(r)?)),
        6 => Option(Box::new(read_ty(r)?)),
        7 => {
            let n = r.u32()?;
            if n as usize > r.buf.len() {
                return Err(err("absurd tuple arity in image"));
            }
            let mut xs = Vec::with_capacity(n as usize);
            for _ in 0..n {
                xs.push(read_ty(r)?);
            }
            Tuple(xs)
        }
        8 => {
            let open = r.u8()? != 0;
            let n = r.u32()?;
            if n as usize > r.buf.len() {
                return Err(err("absurd record field count in image"));
            }
            let mut fs = Vec::with_capacity(n as usize);
            for _ in 0..n {
                let name = r.str()?;
                fs.push((name, read_ty(r)?));
            }
            Record(fs, open)
        }
        9 => Schema(r.str()?),
        10 => Any,
        other => return Err(err(format!("bad type tag {other}"))),
    })
}

fn write_instr(w: &mut W, i: &Instr) {
    match i {
        Instr::Const { dst, val } => {
            w.u8(0);
            w.u32(*dst);
            w.u32(*val);
        }
        Instr::Bin { dst, op, a, b } => {
            w.u8(1);
            w.u32(*dst);
            write_binop(w, *op);
            w.u32(*a);
            w.u32(*b);
        }
        Instr::Un { dst, op, a } => {
            w.u8(2);
            w.u32(*dst);
            w.u8(match op {
                UnOp::Neg => 0,
                UnOp::Not => 1,
            });
            w.u32(*a);
        }
        Instr::Prim { dst, b, args } => {
            w.u8(3);
            w.u32(*dst);
            w.u8(builtin_tag(*b));
            w.u32s(args);
        }
        Instr::Field { dst, rec, sym } => {
            w.u8(4);
            w.u32(*dst);
            w.u32(*rec);
            w.u32(*sym);
        }
        Instr::GetOr { dst, opt, def } => {
            w.u8(5);
            w.u32(*dst);
            w.u32(*opt);
            w.u32(*def);
        }
        Instr::Update { dst, rec, patch } => {
            w.u8(6);
            w.u32(*dst);
            w.u32(*rec);
            w.u32(*patch);
        }
        Instr::MkRec { dst, schema, fields } => {
            w.u8(7);
            w.u32(*dst);
            w.sym_opt(*schema);
            w.u32(fields.len() as u32);
            for (k, v) in fields {
                w.u32(*k);
                w.u32(*v);
            }
        }
        Instr::MkList { dst, items } => {
            w.u8(8);
            w.u32(*dst);
            w.u32s(items);
        }
        Instr::MkTuple { dst, items } => {
            w.u8(9);
            w.u32(*dst);
            w.u32s(items);
        }
        Instr::Tag { dst, kind, inner } => {
            w.u8(10);
            w.u32(*dst);
            w.u8(match kind {
                TagKind::Some => 0,
                TagKind::Ok => 1,
                TagKind::Err => 2,
            });
            w.u32(*inner);
        }
        Instr::At { dst, src, idx } => {
            w.u8(11);
            w.u32(*dst);
            w.u32(*src);
            w.u32(*idx);
        }
        Instr::Concat { dst, a, b } => {
            w.u8(12);
            w.u32(*dst);
            w.u32(*a);
            w.u32(*b);
        }
        Instr::Call { dst, fn_id, args } => {
            w.u8(13);
            w.u32(*dst);
            w.u32(*fn_id);
            w.u32s(args);
        }
        Instr::CallValue { dst, callee, args } => {
            w.u8(14);
            w.u32(*dst);
            w.u32(*callee);
            w.u32s(args);
        }
        Instr::CallHigher { dst, b, args } => {
            w.u8(15);
            w.u32(*dst);
            w.u8(builtin_tag(*b));
            w.u32s(args);
        }
        Instr::Closure { dst, fn_id, caps } => {
            w.u8(16);
            w.u32(*dst);
            w.u32(*fn_id);
            w.u32s(caps);
        }
        Instr::Fork { dst, cond, then_blk, else_blk } => {
            w.u8(17);
            w.u32(*dst);
            w.u32(*cond);
            w.u32(*then_blk);
            w.u32(*else_blk);
        }
        Instr::Choose { dst, cases } => {
            w.u8(18);
            w.u32(*dst);
            w.u32(cases.len() as u32);
            for c in cases {
                w.u32(c.weight);
                w.sym_opt(c.label);
                w.u32(c.body);
            }
        }
        Instr::Expect { dst, src } => {
            w.u8(19);
            w.u32(*dst);
            w.u32(*src);
        }
        Instr::Data { dst, set, access } => {
            w.u8(20);
            w.u32(*dst);
            w.u32(*set);
            match access {
                DataCode::All => w.u8(0),
                DataCode::Len => w.u8(1),
                DataCode::ByKey(r) => {
                    w.u8(2);
                    w.u32(*r);
                }
                DataCode::ByIndex(r) => {
                    w.u8(3);
                    w.u32(*r);
                }
            }
        }
        Instr::MatchPat { dst, src, pat } => {
            w.u8(21);
            w.u32(*dst);
            w.u32(*src);
            w.u32(*pat);
        }
        Instr::Host { dst, name, args } => {
            w.u8(22);
            w.u32(*dst);
            w.u32(*name);
            w.u32s(args);
        }
        Instr::Ret { src } => {
            w.u8(23);
            w.u32(*src);
        }
        Instr::Enter { dst, blk } => {
            w.u8(24);
            w.u32(*dst);
            w.u32(*blk);
        }
    }
}

// ---------------------------------------------------------------------------------------------
// reader
// ---------------------------------------------------------------------------------------------

struct Rd<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Rd<'a> {
    fn need(&self, n: usize) -> DResult<()> {
        if self.pos + n > self.buf.len() {
            return Err(err("truncated image"));
        }
        Ok(())
    }
    fn u8(&mut self) -> DResult<u8> {
        self.need(1)?;
        let v = self.buf[self.pos];
        self.pos += 1;
        Ok(v)
    }
    fn u32(&mut self) -> DResult<u32> {
        #[cfg(target_arch = "wasm32")]
        {
            // Bounds-checked reads are load-bearing on wasm32: an out-of-range slice is a trap, not
            // a Rust panic, so `need()` must run first (it does).
        }
        self.need(4)?;
        let v = u32::from_le_bytes(self.buf[self.pos..self.pos + 4].try_into().expect("4 bytes"));
        self.pos += 4;
        Ok(v)
    }
    fn u64(&mut self) -> DResult<u64> {
        self.need(8)?;
        let v = u64::from_le_bytes(self.buf[self.pos..self.pos + 8].try_into().expect("8 bytes"));
        self.pos += 8;
        Ok(v)
    }
    fn f64(&mut self) -> DResult<f64> {
        Ok(f64::from_bits(self.u64()?))
    }
    fn str(&mut self) -> DResult<String> {
        let n = self.u32()? as usize;
        self.need(n)?;
        let s = core::str::from_utf8(&self.buf[self.pos..self.pos + n])
            .map_err(|e| err(format!("bad UTF-8 in image: {e}")))?
            .to_string();
        self.pos += n;
        Ok(s)
    }
    fn u32s(&mut self) -> DResult<Vec<u32>> {
        let n = self.u32()?;
        // Bound the pre-allocation so a corrupt length cannot request gigabytes.
        if n as usize > self.buf.len() {
            return Err(err("absurd list length in image"));
        }
        let mut out = Vec::with_capacity(n as usize);
        for _ in 0..n {
            out.push(self.u32()?);
        }
        Ok(out)
    }
}

fn read_instr(r: &mut Rd) -> DResult<Instr> {
    Ok(match r.u8()? {
        0 => Instr::Const { dst: r.u32()?, val: r.u32()? },
        1 => Instr::Bin { dst: r.u32()?, op: read_binop(r)?, a: r.u32()?, b: r.u32()? },
        2 => {
            let dst = r.u32()?;
            let op = match r.u8()? {
                0 => UnOp::Neg,
                1 => UnOp::Not,
                other => return Err(err(format!("bad UnOp tag {other}"))),
            };
            Instr::Un { dst, op, a: r.u32()? }
        }
        3 => {
            let dst = r.u32()?;
            let b = builtin_from_tag(r.u8()?)?;
            Instr::Prim { dst, b, args: r.u32s()? }
        }
        4 => Instr::Field { dst: r.u32()?, rec: r.u32()?, sym: r.u32()? },
        5 => Instr::GetOr { dst: r.u32()?, opt: r.u32()?, def: r.u32()? },
        6 => Instr::Update { dst: r.u32()?, rec: r.u32()?, patch: r.u32()? },
        7 => {
            let dst = r.u32()?;
            let schema = match r.u8()? {
                1 => Some(r.u32()?),
                _ => None,
            };
            let n = r.u32()?;
            if n as usize > r.buf.len() {
                return Err(err("absurd field count in image"));
            }
            let mut fields = Vec::with_capacity(n as usize);
            for _ in 0..n {
                fields.push((r.u32()?, r.u32()?));
            }
            Instr::MkRec { dst, schema, fields }
        }
        8 => Instr::MkList { dst: r.u32()?, items: r.u32s()? },
        9 => Instr::MkTuple { dst: r.u32()?, items: r.u32s()? },
        10 => {
            let dst = r.u32()?;
            let kind = match r.u8()? {
                0 => TagKind::Some,
                1 => TagKind::Ok,
                2 => TagKind::Err,
                other => return Err(err(format!("bad tag kind {other}"))),
            };
            Instr::Tag { dst, kind, inner: r.u32()? }
        }
        11 => Instr::At { dst: r.u32()?, src: r.u32()?, idx: r.u32()? },
        12 => Instr::Concat { dst: r.u32()?, a: r.u32()?, b: r.u32()? },
        13 => Instr::Call { dst: r.u32()?, fn_id: r.u32()?, args: r.u32s()? },
        14 => Instr::CallValue { dst: r.u32()?, callee: r.u32()?, args: r.u32s()? },
        15 => {
            let dst = r.u32()?;
            let b = builtin_from_tag(r.u8()?)?;
            Instr::CallHigher { dst, b, args: r.u32s()? }
        }
        16 => Instr::Closure { dst: r.u32()?, fn_id: r.u32()?, caps: r.u32s()? },
        17 => Instr::Fork { dst: r.u32()?, cond: r.u32()?, then_blk: r.u32()?, else_blk: r.u32()? },
        18 => {
            let dst = r.u32()?;
            let n = r.u32()?;
            if n as usize > r.buf.len() {
                return Err(err("absurd case count in image"));
            }
            let mut cases = Vec::with_capacity(n as usize);
            for _ in 0..n {
                let weight = r.u32()?;
                let label = match r.u8()? {
                    1 => Some(r.u32()?),
                    _ => None,
                };
                cases.push(CaseCode { weight, label, body: r.u32()? });
            }
            Instr::Choose { dst, cases }
        }
        19 => Instr::Expect { dst: r.u32()?, src: r.u32()? },
        20 => {
            let dst = r.u32()?;
            let set = r.u32()?;
            let access = match r.u8()? {
                0 => DataCode::All,
                1 => DataCode::Len,
                2 => DataCode::ByKey(r.u32()?),
                3 => DataCode::ByIndex(r.u32()?),
                other => return Err(err(format!("bad data access tag {other}"))),
            };
            Instr::Data { dst, set, access }
        }
        21 => Instr::MatchPat { dst: r.u32()?, src: r.u32()?, pat: r.u32()? },
        22 => Instr::Host { dst: r.u32()?, name: r.u32()?, args: r.u32s()? },
        23 => Instr::Ret { src: r.u32()? },
        24 => Instr::Enter { dst: r.u32()?, blk: r.u32()? },
        other => return Err(err(format!("bad instruction tag {other}"))),
    })
}

#[derive(Debug)]
pub struct Image {
    pub code: Code,
    pub numeric: NumericMode,
}

pub fn decode(bytes: &[u8]) -> DResult<Image> {
    if bytes.len() < MAGIC.len() + 8 {
        return Err(err("image too short"));
    }
    if &bytes[..MAGIC.len()] != MAGIC {
        return Err(err("bad magic: not a buildhub image"));
    }
    // Trailing CRC over everything before it.
    let (body, crc_bytes) = bytes.split_at(bytes.len() - 4);
    let stored = u32::from_le_bytes(crc_bytes.try_into().expect("4 bytes"));
    if crc32(body) != stored {
        return Err(err("checksum mismatch: image is corrupt"));
    }
    let mut r = Rd { buf: body, pos: MAGIC.len() };
    let version = r.u32()?;
    if version != VERSION {
        return Err(Diag::new(
            "BHC-E504",
            "<image>".to_string(),
            Pos::default(),
            format!("image version {version} != supported {VERSION}"),
        ));
    }
    let numeric = NumericMode::from_tag(r.u8()?)?;
    let nsyms = r.u32()?;
    if nsyms as usize > r.buf.len() {
        return Err(err("absurd symbol count in image"));
    }
    let mut syms = Vec::with_capacity(nsyms as usize);
    for _ in 0..nsyms {
        syms.push(r.str()?);
    }
    let nconsts = r.u32()?;
    if nconsts as usize > r.buf.len() {
        return Err(err("absurd constant count in image"));
    }
    let mut consts = Vec::with_capacity(nconsts as usize);
    for _ in 0..nconsts {
        consts.push(read_value(&mut r)?);
    }
    let npats = r.u32()?;
    if npats as usize > r.buf.len() {
        return Err(err("absurd pattern count in image"));
    }
    let mut patterns = Vec::with_capacity(npats as usize);
    for _ in 0..npats {
        patterns.push(read_pattern(&mut r)?);
    }
    let nfns = r.u32()?;
    if nfns as usize > r.buf.len() {
        return Err(err("absurd function count in image"));
    }
    let mut fns = Vec::with_capacity(nfns as usize);
    for _ in 0..nfns {
        let fn_id = r.u32()?;
        let nregs = r.u32()?;
        let nparams = r.u32()?;
        let ncaptures = r.u32()?;
        let nblocks = r.u32()?;
        if nblocks as usize > r.buf.len() {
            return Err(err("absurd block count in image"));
        }
        let mut blocks = Vec::with_capacity(nblocks as usize);
        for _ in 0..nblocks {
            let n = r.u32()?;
            if n as usize > r.buf.len() {
                return Err(err("absurd instruction count in image"));
            }
            let mut blk = Vec::with_capacity(n as usize);
            for _ in 0..n {
                blk.push(read_instr(&mut r)?);
            }
            blocks.push(blk);
        }
        fns.push(CodeFn { fn_id, nregs, nparams, ncaptures, blocks });
    }
    let nentries = r.u32()?;
    if nentries as usize > r.buf.len() {
        return Err(err("absurd entry count in image"));
    }
    let mut entries = Vec::with_capacity(nentries as usize);
    for _ in 0..nentries {
        let fn_id = r.u32()?;
        let nparams = r.u32()?;
        let name = r.str()?;
        let np = r.u32()?;
        if np as usize > r.buf.len() {
            return Err(err("absurd entry arity in image"));
        }
        let mut params = Vec::with_capacity(np as usize);
        for _ in 0..np {
            params.push(read_ty(&mut r)?);
        }
        entries.push(crate::ssa::EntryCode { fn_id, nparams, name, params });
    }
    let nschemas = r.u32()?;
    if nschemas as usize > r.buf.len() {
        return Err(err("absurd schema count in image"));
    }
    let mut schemas = Vec::with_capacity(nschemas as usize);
    for _ in 0..nschemas {
        let name = r.str()?;
        let open = r.u8()? != 0;
        let nf = r.u32()?;
        if nf as usize > r.buf.len() {
            return Err(err("absurd schema field count in image"));
        }
        let mut fields = Vec::with_capacity(nf as usize);
        for _ in 0..nf {
            let fname = r.str()?;
            fields.push((fname, read_ty(&mut r)?));
        }
        schemas.push(crate::ssa::SchemaCode { name, fields, open });
    }
    let ndata = r.u32()?;
    if ndata as usize > r.buf.len() {
        return Err(err("absurd data binding count in image"));
    }
    let mut data = Vec::with_capacity(ndata as usize);
    for _ in 0..ndata {
        let name = r.str()?;
        let schema = r.str()?;
        let key = if r.u8()? != 0 { Some(r.str()?) } else { None };
        data.push(crate::ssa::DataBinding { name, schema, key });
    }
    let ncap = r.u32()?;
    if ncap as usize > r.buf.len() {
        return Err(err("absurd capability count in image"));
    }
    let mut capabilities = Vec::with_capacity(ncap as usize);
    for _ in 0..ncap {
        capabilities.push(r.str()?);
    }
    let code = Code { fns, consts, patterns, syms, entries, nblocks: 0, schemas, data, capabilities };
    let code = Code { nblocks: code.fns.iter().map(|f| f.blocks.len() as u32).sum(), ..code };
    // The decoder is the trust boundary for a stored image: re-run structural verification.
    crate::ssa::verify(&code)?;
    Ok(Image { code, numeric })
}

/// CRC-32 (IEEE 802.3), matching the polynomial named in the spec's `CodeImage` description.
pub fn crc32(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for (i, slot) in table.iter_mut().enumerate() {
        let mut c = i as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xedb8_8320 ^ (c >> 1) } else { c >> 1 };
        }
        *slot = c;
    }
    let mut crc = 0xffff_ffffu32;
    for b in data {
        crc = table[((crc ^ u32::from(*b)) & 0xff) as usize] ^ (crc >> 8);
    }
    crc ^ 0xffff_ffff
}
