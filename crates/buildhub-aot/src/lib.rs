//! Runtime for LLVM-emitted packs.
//!
//! The generated code owns control flow and numeric arithmetic; everything that needs the dynamic
//! value model (records, symbols, builtins, data sets) calls in here. Every value crosses the ABI
//! as a [`BVal`], a NaN-boxed `i64`: numbers, symbols, booleans, `unit`, `none` and `missing` are
//! encoded in the word itself, and only compound values take an arena slot. Nothing Rust-typed is
//! exposed and nothing has to be refcounted across the boundary.
//!
//! Determinism: the arena is only ever appended to. The host calls `bhub_reset` between
//! evaluations, which is the counterpart of re-instantiating the module.

extern crate alloc;

pub mod emit;
#[cfg(feature = "cli")]
pub mod link;

use std::cell::{Cell, RefCell, UnsafeCell};
use std::collections::HashMap;
use std::rc::Rc;

use buildhub_core::value::{Dist, Value};

// ---------------------------------------------------------------------------------------------
// BVal: the NaN-boxed dynamic value
//
// Numbers are the raw `f64` bits, with every NaN canonicalised to a positive quiet NaN, so the
// negative-NaN space contains no number and can carry tags. A tagged word is
// `TAG_MASK | (tag << 48) | payload`; `TAG_MASK`'s top 13 bits are what tells the two apart.
// Only compound values (the ones with identity and no scalar encoding) take an arena slot, and
// their payload is that slot's index.

/// The dynamic value as it crosses the ABI: an `i64` holding either an `f64` bit pattern or a
/// tagged scalar.
pub type BVal = i64;

const TAG_MASK: u64 = 0xFFF8_0000_0000_0000;
const TAG_HEAP: u64 = 1 << 48;
const TAG_SYM: u64 = 2 << 48;
const TAG_BOOL: u64 = 3 << 48;
const TAG_NONE: u64 = 4 << 48;
const TAG_UNIT: u64 = 5 << 48;
const TAG_MISSING: u64 = 6 << 48;
/// The three bits `TAG_MASK` leaves free: the tag lives there.
const TAG_BITS: u64 = 0x0007_0000_0000_0000;
const PAYLOAD_MASK: u64 = 0x0000_FFFF_FFFF_FFFF;

/// 身份表的槽数与掩码（2 的幂）。
const IDS_SLOTS: usize = 1 << 15;
const IDS_MASK: u64 = (IDS_SLOTS as u64) - 1;

/// `Missing` as a `BVal`, for the paths that have no value to hand back.
const BVAL_MISSING: BVal = (TAG_MASK | TAG_MISSING) as BVal;

#[inline(always)]
fn tagged(tag: u64, payload: u64) -> BVal {
    (TAG_MASK | tag | (payload & PAYLOAD_MASK)) as BVal
}

#[inline(always)]
fn is_tagged(b: BVal) -> bool {
    (b as u64) & TAG_MASK == TAG_MASK
}

/// Box a value. Compound values are appended to the arena, so this is the single place a value is
/// allocated on its way out of the runtime; scalars never touch the arena.
#[inline]
fn enc(v: Value) -> BVal {
    match v {
        Value::Num(n) => buildhub_core::value::canon(n).to_bits() as BVal,
        Value::Bool(b) => tagged(TAG_BOOL, u64::from(b)),
        Value::Sym(s) => tagged(TAG_SYM, u64::from(s.0)),
        Value::Unit => tagged(TAG_UNIT, 0),
        Value::None => tagged(TAG_NONE, 0),
        Value::Missing => BVAL_MISSING,
        Value::Str(s) => {
            if let Some(h) = STRS.with(|m| m.borrow().get(&s).copied()) {
                return tagged(TAG_HEAP, u64::from(h));
            }
            let idx = push(Value::Str(s.clone())) as u32;
            STRS.with(|m| {
                m.borrow_mut().insert(s, idx);
            });
            tagged(TAG_HEAP, u64::from(idx))
        }
        // 同一份 Rc 数据（同一指针）复用同一句柄：值不可变，句柄稳定后记忆化才能命中。
        Value::List(r) => enc_rc(1, Rc::as_ptr(&r) as usize, Value::List(r)),
        Value::Tuple(r) => enc_rc(2, Rc::as_ptr(&r) as usize, Value::Tuple(r)),
        Value::Record(r) => enc_rc(3, Rc::as_ptr(&r) as usize, Value::Record(r)),
        Value::Closure(r) => enc_rc(4, Rc::as_ptr(&r) as usize, Value::Closure(r)),
        v @ (Value::Builtin(_) | Value::Some(_) | Value::Ok(_) | Value::Err(_)) => {
            tagged(TAG_HEAP, push(v) as u64)
        }
    }
}

/// Rc 数据的身份句柄：指针 + 种类 → arena 槽。arena 持有 Rc，求值期间指针不会被复用。
/// 定长直接映射表：冲突直接覆盖，代价是一次 TLS 读加一次比较。
#[inline]
fn enc_rc(kind: u64, ptr: usize, v: Value) -> BVal {
    let key = (kind << 56) | (ptr as u64 & 0x00FF_FFFF_FFFF_FFFF);
    let slot = ((ptr as u64 >> 4) ^ kind.wrapping_mul(0x9E37_79B9_7F4A_7C15)) & IDS_MASK;
    let hit = IDS.with(|t| {
        let t = unsafe { &mut *t.get() };
        if t.is_empty() {
            t.resize(IDS_SLOTS, (0, 0));
        }
        let e = t[slot as usize];
        if e.0 == key { Some(e.1) } else { None }
    });
    if let Some(h) = hit {
        return tagged(TAG_HEAP, u64::from(h));
    }
    let idx = push(v) as u32;
    IDS.with(|t| unsafe {
        let t = &mut *t.get();
        if t.is_empty() {
            t.resize(IDS_SLOTS, (0, 0));
        }
        t[slot as usize] = (key, idx);
    });
    tagged(TAG_HEAP, u64::from(idx))
}

/// Unbox a value. A stale heap index or an unused tag reads as `Missing`: the ABI has to stay
/// total, so no shape of input may panic here.
#[inline]
fn dec(b: BVal) -> Value {
    let bits = b as u64;
    if bits & TAG_MASK != TAG_MASK {
        return Value::Num(f64::from_bits(bits));
    }
    let payload = bits & PAYLOAD_MASK;
    match bits & TAG_BITS {
        TAG_HEAP => arena_ro(|a| a.get(payload as usize).cloned().unwrap_or(Value::Missing)),
        TAG_SYM => Value::Sym(buildhub_core::Sym(payload as u32)),
        TAG_BOOL => Value::Bool(payload & 1 != 0),
        TAG_NONE => Value::None,
        TAG_UNIT => Value::Unit,
        // `TAG_MISSING` and any tag this build does not know.
        _ => Value::Missing,
    }
}

// The four per-evaluation tables are `UnsafeCell`s for the same reason the arena is: every access
// is a short, non-reentrant borrow (read a slot, return, then maybe push), so the `RefCell` flag
// traffic was pure overhead. The rule that keeps this sound: a borrow never spans a call that
// could touch the same table again. `INTERNER`, `SCHEMAS` and `DATASETS` stay `RefCell`s — they are
// read through a raw pointer held across builtin callbacks (`RtHost`) and written only at load.
thread_local! {
    /// Values are only ever pushed or indexed; no operation holds a borrow across another arena
    /// access, so the `RefCell` bookkeeping was pure overhead on the hottest path.
    static ARENA: UnsafeCell<Vec<Value>> = const { UnsafeCell::new(Vec::new()) };
    /// Arena length right after `bhub_init` built the constants.
    static BASE: Cell<u32> = const { Cell::new(0) };
    /// Slots the innermost successful `match` bound; read back by `bhub_binding`.
    static BINDS: UnsafeCell<Vec<Value>> = const { UnsafeCell::new(Vec::new()) };
    /// Pattern-match scratch frame, swapped with `BINDS` on success.
    static SCRATCH: UnsafeCell<Vec<Value>> = const { UnsafeCell::new(Vec::new()) };
    /// 字符串 → 本次求值的 arena 槽。相同内容的字符串共用句柄，函数记忆化才能命中。
    static STRS: RefCell<HashMap<Rc<str>, u32>> = RefCell::new(HashMap::new());
    /// Rc 数据指针 → arena 槽，见 `enc_rc`。
    static IDS: UnsafeCell<Vec<(u64, u32)>> = const { UnsafeCell::new(Vec::new()) };
}

#[inline(always)]
fn arena<R>(f: impl FnOnce(&mut Vec<Value>) -> R) -> R {
    ARENA.with(|a| f(unsafe { &mut *a.get() }))
}

/// Shared read of the arena. `f` must not push (that would alias the buffer the slot points
/// into); every caller compares, tests a tag or reads a field, so the borrow ends with the call.
#[inline(always)]
fn arena_ro<R>(f: impl FnOnce(&[Value]) -> R) -> R {
    ARENA.with(|a| f(unsafe { &*a.get() }))
}

/// Visit one value without cloning the ones that live in the arena. `f` must not push a compound
/// value: that could reallocate the buffer the borrowed slot points into.
#[inline(always)]
fn with_value<R>(b: BVal, f: impl FnOnce(&Value) -> R) -> R {
    let bits = b as u64;
    if bits & TAG_MASK != TAG_MASK {
        return f(&Value::Num(f64::from_bits(bits)));
    }
    let payload = bits & PAYLOAD_MASK;
    match bits & TAG_BITS {
        TAG_HEAP => arena_ro(|a| f(a.get(payload as usize).unwrap_or(&Value::Missing))),
        TAG_SYM => f(&Value::Sym(buildhub_core::Sym(payload as u32))),
        TAG_BOOL => f(&Value::Bool(payload & 1 != 0)),
        TAG_NONE => f(&Value::None),
        TAG_UNIT => f(&Value::Unit),
        _ => f(&Value::Missing),
    }
}

/// Borrow an emitter-built `[n x T]` frame. The length is `i32` on the ABI; a non-positive one
/// means no frame, so `ptr` is never dereferenced (and an empty `alloca` may not even be there).
#[inline(always)]
unsafe fn frame<'a, T>(ptr: *const T, n: i32) -> &'a [T] {
    if n <= 0 || ptr.is_null() {
        &[]
    } else {
        unsafe { core::slice::from_raw_parts(ptr, n as usize) }
    }
}

#[inline(always)]
fn binds<R>(f: impl FnOnce(&mut Vec<Value>) -> R) -> R {
    BINDS.with(|b| f(unsafe { &mut *b.get() }))
}

#[inline(always)]
fn scratch<R>(f: impl FnOnce(&mut Vec<Value>) -> R) -> R {
    SCRATCH.with(|s| f(unsafe { &mut *s.get() }))
}

/// Append a compound value to the arena and return its `BVal`. Scalars never take a slot, so this
/// is only reachable from `enc`.
fn push(v: Value) -> BVal {
    tagged(TAG_HEAP, arena(|a| {
        a.push(v);
        (a.len() - 1) as u64
    }))
}

/// Called once by the emitted module so the runtime can reach compiled functions.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_set_dispatch(f: DispatchFn) {
    DISPATCH.with(|d| d.set(Some(f)));
}

/// Bumped by `bhub_reset`. Emitted memo tables tag each entry with it, so one increment
/// invalidates every table when the arena (and with it every cached heap index) is reset.
#[allow(non_upper_case_globals)]
#[unsafe(no_mangle)]
pub static mut bhub_memo_epoch: i64 = 1;

/// Record the arena watermark after start-up: everything below it is a constant (`@k*`) and must
/// survive a reset, everything above it is per-evaluation garbage.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_mark() {
    BASE.with(|b| b.set(arena(|a| a.len() as u32)));
}

/// Drop everything a single evaluation allocated, keeping the start-up constants addressable.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_reset() {
    let base = BASE.with(|b| b.get()) as usize;
    arena(|a| a.truncate(base));
    binds(|b| b.clear());
    scratch(|s| s.clear());
    STRS.with(|m| m.borrow_mut().clear());
    IDS.with(|t| unsafe { (&mut *t.get()).fill((0, 0)) });
    unsafe {
        bhub_memo_epoch = bhub_memo_epoch.wrapping_add(1);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_arena_len() -> i32 {
    arena(|a| a.len() as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_num(x: f64) -> BVal {
    enc(Value::Num(x))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_bool(b: i32) -> BVal {
    enc(Value::Bool(b != 0))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_sym(s: i32) -> BVal {
    tagged(TAG_SYM, s as u32 as u64)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_unit() -> BVal {
    tagged(TAG_UNIT, 0)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_none() -> BVal {
    tagged(TAG_NONE, 0)
}

/// The "no value" marker: what a `match` with no matching arm evaluates to.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_missing() -> BVal {
    BVAL_MISSING
}

/// `Some(v)` is a compound value (it owns a payload), so it takes an arena slot.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_some(h: BVal) -> BVal {
    enc(Value::Some(Box::new(dec(h))))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_str(ptr: *const u8, len: i32) -> BVal {
    let bytes = unsafe { core::slice::from_raw_parts(ptr, len.max(0) as usize) };
    enc(Value::Str(String::from_utf8_lossy(bytes).into_owned().into()))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_to_num(h: BVal) -> f64 {
    with_value(h, |v| match v {
        Value::Num(n) => *n,
        _ => f64::NAN,
    })
}

/// What kind of value a word is: `0` for a number, otherwise its tag field. Two values can only be
/// equal when their kinds match, so this picks the comparison path without decoding anything.
#[inline(always)]
fn kind_of(b: BVal) -> u64 {
    let bits = b as u64;
    if bits & TAG_MASK == TAG_MASK { bits & TAG_BITS } else { 0 }
}

/// `a == b` as the operator table defines it. Bit-identical words are equal without decoding,
/// which covers the common "same number / same handle" case (NaN excepted, since it never equals
/// itself). Distinct words are only equal if both are numbers that compare equal (`-0.0 == 0.0`)
/// or two heap values whose structure matches — every other pair differs in kind or in payload.
#[inline]
fn same_bval(a: BVal, b: BVal) -> bool {
    if a == b {
        return is_tagged(a) || !f64::from_bits(a as u64).is_nan();
    }
    match (kind_of(a), kind_of(b)) {
        (0, 0) => f64::from_bits(a as u64) == f64::from_bits(b as u64),
        (TAG_HEAP, TAG_HEAP) => with_value(a, |x| with_value(b, |y| x.same_as(y))),
        _ => false,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_eq(a: BVal, b: BVal) -> i32 {
    same_bval(a, b) as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_ne(a: BVal, b: BVal) -> i32 {
    (!same_bval(a, b)) as i32
}

/// Text view of a value: `Sym` resolved through the interner, or the raw string. The view is
/// borrowed (`f` runs under the read borrow), so no caller allocates just to measure a string.
fn text_ref<R>(v: &Value, f: impl FnOnce(&str) -> R) -> Option<R> {
    match v {
        Value::Sym(s) => INTERNER.with(|i| i.borrow().try_name(*s).map(f)),
        Value::Str(s) => Some(f(s)),
        _ => None,
    }
}

fn text_with<R>(h: BVal, f: impl FnOnce(&str) -> R) -> Option<R> {
    with_value(h, |v| text_ref(v, f))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_str_len(h: BVal) -> f64 {
    text_with(h, |t| if t.is_ascii() { t.len() as f64 } else { t.chars().count() as f64 })
        .unwrap_or(f64::NAN)
}

/// `str_at` yields the character code, so it never allocates.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_str_at(h: BVal, i: f64) -> f64 {
    let i = i.max(0.0) as usize;
    text_with(h, |t| {
        let code = if t.is_ascii() {
            t.as_bytes().get(i).map(|b| u32::from(*b))
        } else {
            t.chars().nth(i).map(|c| c as u32)
        };
        code.map_or(f64::NAN, |c| c as f64)
    })
    .unwrap_or(f64::NAN)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_str_slice(h: BVal, from: f64, to: f64) -> BVal {
    let lo = from.max(0.0) as usize;
    let hi = to.max(0.0) as usize;
    let Some(s) = text_with(h, |t| {
        if t.is_ascii() {
            let hi = hi.min(t.len());
            t[lo.min(hi)..hi].to_string()
        } else {
            t.chars().skip(lo).take(hi.saturating_sub(lo)).collect::<String>()
        }
    }) else {
        return BVAL_MISSING;
    };
    push(Value::Str(s.into()))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_str_eq(a: BVal, b: BVal) -> i32 {
    // Two symbols compare by id; everything else compares the borrowed text views.
    let syms = with_value(a, |x| match x {
        Value::Sym(s) => Some(s.0),
        _ => None,
    });
    if let Some(x) = syms {
        let other = with_value(b, |y| match y {
            Value::Sym(s) => Some(s.0),
            _ => None,
        });
        if let Some(y) = other {
            return (x == y) as i32;
        }
    }
    with_value(a, |x| {
        text_ref(x, |xs| with_value(b, |y| text_ref(y, |ys| xs == ys).unwrap_or(false)))
            .unwrap_or(false)
    }) as i32
}

/// `bin(op, a, b)` with one side supplied as a bare `f64`, so the emitter does not have to box it
/// first. `bhub_bin_m` takes the number on the right, `bhub_bin_n` on the left.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_bin_m(op: i32, a: BVal, b: f64) -> BVal {
    let tag = buildhub_core::eval::BinOpTag::from_ordinal(op);
    let r = buildhub_core::eval::binary_tag(tag, dec(a), Value::Num(b)).unwrap_or(Value::Missing);
    enc(r)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_bin_n(op: i32, a: f64, b: BVal) -> BVal {
    let tag = buildhub_core::eval::BinOpTag::from_ordinal(op);
    let r = buildhub_core::eval::binary_tag(tag, Value::Num(a), dec(b)).unwrap_or(Value::Missing);
    enc(r)
}

/// Symbol id of a value, or -1 when it is not a symbol. Lets emitted code compare symbols as
/// integers, so `if key == sym"攻击"` chains can become jump tables instead of calls.
/// `field(rec, key)` as a *builtin*: returns `Some(v)`/`None` (the `Instr::Field` path returns the
/// bare value). The emitter wires this when the key is a symbol-valued register.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_field_opt(rec: BVal, sym: i32) -> BVal {
    if sym < 0 {
        return tagged(TAG_NONE, 0);
    }
    let hit = with_value(rec, |x| match x {
        Value::Record(r) => r.get(buildhub_core::Sym(sym as u32)).cloned(),
        _ => None,
    });
    match hit {
        Some(v) => enc(Value::Some(Box::new(v))),
        None => tagged(TAG_NONE, 0),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_sym_id(h: BVal) -> i32 {
    // Symbols are inline, so the id is the payload: no decode, no arena read.
    if is_tagged(h) && (h as u64) & TAG_BITS == TAG_SYM {
        return ((h as u64) & PAYLOAD_MASK) as u32 as i32;
    }
    with_value(h, |v| match v {
        Value::Sym(s) => s.0 as i32,
        _ => -1,
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_is_num(h: BVal) -> i32 {
    (!is_tagged(h)) as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_is_list(h: BVal) -> i32 {
    with_value(h, |v| matches!(v, Value::List(_)) as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_field(rec: BVal, sym: i32) -> BVal {
    // Mirrors `step::field`: the raw field value, or `Missing` when absent. Only the field is
    // copied out; the record itself stays in the arena.
    let v = with_value(rec, |x| match x {
        Value::Record(r) => r.get(buildhub_core::Sym(sym as u32)).cloned(),
        _ => None,
    });
    enc(v.unwrap_or(Value::Missing))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_get_or(opt: BVal, def: BVal) -> BVal {
    let v = with_value(opt, |x| match x {
        Value::Some(inner) => Some((**inner).clone()),
        Value::None | Value::Missing => None,
        other => Some(other.clone()),
    });
    enc(v.unwrap_or_else(|| dec(def)))
}

// ---------------------------------------------------------------------------------------------
// Arithmetic and the dynamic operations
//
// Numeric operands arrive as `f64` straight from the generated code (the emitter's `Num`
// inference decides where), and every dynamic value arrives as a `BVal`.

#[unsafe(no_mangle)]
pub extern "C" fn bhub_canon(x: f64) -> f64 {
    buildhub_core::value::canon(x)
}

/// `Num::truthy`: zero and NaN are falsy.
#[inline(always)]
fn num_truthy(n: f64) -> bool {
    n != 0.0 && !n.is_nan()
}

/// `BinOpTag` discriminants match `buildhub_core::eval::BinOpTag`'s declaration order.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_bin(op: i32, a: BVal, b: BVal) -> BVal {
    use buildhub_core::eval::BinOpTag;
    let tag = BinOpTag::from_ordinal(op);
    // Two raw numbers are the common case and need no `Value` at all. This is exactly what
    // `binary` computes for `Num` operands: `canon` around the arithmetic, plain `f64` comparisons
    // (`-0.0 == 0.0`, NaN never), and `truthy` for and/or.
    if !is_tagged(a) && !is_tagged(b) {
        let (x, y) = (f64::from_bits(a as u64), f64::from_bits(b as u64));
        let canon = buildhub_core::value::canon;
        return match tag {
            BinOpTag::Add => canon(x + y).to_bits() as BVal,
            BinOpTag::Sub => canon(x - y).to_bits() as BVal,
            BinOpTag::Mul => canon(x * y).to_bits() as BVal,
            BinOpTag::Div => canon(x / y).to_bits() as BVal,
            BinOpTag::FloorDiv => canon(buildhub_core::eval::num_floor_div(x, y)).to_bits() as BVal,
            BinOpTag::Rem => canon(x % y).to_bits() as BVal,
            BinOpTag::Eq => enc(Value::Bool(x == y)),
            BinOpTag::Ne => enc(Value::Bool(x != y)),
            BinOpTag::Lt => enc(Value::Bool(x < y)),
            BinOpTag::Le => enc(Value::Bool(x <= y)),
            BinOpTag::Gt => enc(Value::Bool(x > y)),
            BinOpTag::Ge => enc(Value::Bool(x >= y)),
            BinOpTag::And => enc(Value::Bool(num_truthy(x) && num_truthy(y))),
            BinOpTag::Or => enc(Value::Bool(num_truthy(x) || num_truthy(y))),
        };
    }
    // Mixed or compound operands (including `Bool`-as-number) take the operator table, which also
    // owns the error cases.
    let r = buildhub_core::eval::binary_tag(tag, dec(a), dec(b)).unwrap_or(Value::Missing);
    enc(r)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_un(op: i32, a: BVal) -> BVal {
    let tag = buildhub_core::eval::UnOpTag::from_ordinal(op);
    let r = buildhub_core::eval::unary_tag(tag, dec(a)).unwrap_or(Value::Missing);
    enc(r)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_len(h: BVal) -> f64 {
    with_value(h, |v| buildhub_core::eval::len_of(v).map(|n| n as f64).unwrap_or(f64::NAN))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_at(xs: BVal, idx: f64) -> BVal {
    let i = idx.max(0.0) as usize;
    // Borrow the container: only the element is copied out, and it is pushed after the arena
    // borrow ends. A non-container (including a number) has no positions.
    let v = with_value(xs, |v| match v {
        Value::List(l) | Value::Tuple(l) => l.get(i).cloned().unwrap_or(Value::Missing),
        _ => Value::Missing,
    });
    enc(v)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_concat(a: BVal, b: BVal) -> BVal {
    let out = match (dec(a), dec(b)) {
        (Value::List(x) | Value::Tuple(x), Value::List(y) | Value::Tuple(y)) => {
            let mut out: Vec<Value> = Vec::with_capacity(x.len() + y.len());
            out.extend_from_slice(&x);
            out.extend_from_slice(&y);
            Some(out)
        }
        _ => None,
    };
    enc(match out {
        Some(out) => Value::list(out),
        None => Value::Missing,
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_list(ptr: *const i64, n: i32) -> BVal {
    let items: Vec<Value> = unsafe { frame(ptr, n) }.iter().map(|h| dec(*h)).collect();
    enc(Value::list(items))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_tuple(ptr: *const i64, n: i32) -> BVal {
    let items: Vec<Value> = unsafe { frame(ptr, n) }.iter().map(|h| dec(*h)).collect();
    enc(Value::tuple(items))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_mk_rec(syms: *const i32, vals: *const i64, n: i32, schema: i32) -> BVal {
    let ks = unsafe { frame(syms, n) };
    let vs = unsafe { frame(vals, n) };
    let mut r = buildhub_core::value::Record::new();
    r.schema = if schema >= 0 { Some(schema as u32) } else { None };
    for (k, v) in ks.iter().zip(vs.iter()) {
        r.set(buildhub_core::Sym(*k as u32), dec(*v));
    }
    enc(Value::record(r))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_tag(kind: i32, inner: BVal) -> BVal {
    // `None`/`unit` tags ignore the payload, so they never decode it.
    if kind == 1 {
        return tagged(TAG_NONE, 0);
    }
    let v = dec(inner);
    enc(match kind {
        0 => Value::Some(Box::new(v)),
        2 => Value::Ok(Box::new(v)),
        3 => Value::Err(Box::new(v)),
        _ => v,
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_expect(h: BVal) -> BVal {
    match buildhub_core::step::expect(Dist::One(dec(h))) {
        Ok(d) => enc(d.single().cloned().unwrap_or(Value::Missing)),
        Err(_) => BVAL_MISSING,
    }
}

// ---------------------------------------------------------------------------------------------
// Patterns
//
// Encoded as a byte blob by the emitter (tag byte + payload) so the ABI never carries Rust types.
// Bindings land in a side buffer; the generated code reads them back by slot index.

type DispatchFn = extern "C" fn(i32, *const i64, i32) -> BVal;

thread_local! {
    static DISPATCH: Cell<Option<DispatchFn>> = const { Cell::new(None) };
    /// Loaded once per module and then only indexed: same `UnsafeCell` treatment as the arena.
    static PATS: UnsafeCell<Vec<(std::rc::Rc<buildhub_core::ast::Pattern>, usize)>> =
        const { UnsafeCell::new(Vec::new()) };
    static SCHEMAS: RefCell<Vec<buildhub_core::ssa::SchemaCode>> = const { RefCell::new(Vec::new()) };
    static DATASETS: RefCell<Vec<(String, String, Option<String>)>> = const { RefCell::new(Vec::new()) };
    static INTERNER: RefCell<buildhub_core::Interner> = RefCell::new(buildhub_core::Interner::new());
    /// Reused argument frame for callbacks: `map`/`fold`/`filter` call back once per element, and a
    /// fresh `Vec` per element was the largest remaining allocation in that path.
    static ARGBUF: RefCell<Vec<i64>> = const { RefCell::new(Vec::new()) };
}

#[inline(always)]
fn pats<R>(f: impl FnOnce(&[(std::rc::Rc<buildhub_core::ast::Pattern>, usize)]) -> R) -> R {
    PATS.with(|p| f(unsafe { &*p.get() }))
}

/// Install the pack's symbol table. Interning in order makes `Sym(i)` mean `syms[i]`, which is the
/// id space the emitted code uses.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_load_syms(ptr: *const u8, len: i32) {
    let bytes = unsafe { frame(ptr, len) };
    let mut at = 0usize;
    let n = u32::from_le_bytes(bytes[0..4].try_into().unwrap()) as usize;
    at += 4;
    INTERNER.with(|i| {
        let mut i = i.borrow_mut();
        *i = buildhub_core::Interner::new();
        for _ in 0..n {
            let l = u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
            at += 4;
            i.intern(&String::from_utf8_lossy(&bytes[at..at + l]));
            at += l;
        }
    });
}

fn decode(bytes: &[u8], at: &mut usize) -> buildhub_core::ast::Pattern {
    use buildhub_core::ast::Pattern;
    let tag = bytes[*at];
    *at += 1;
    match tag {
        0 => {
            let n = u16::from_le_bytes([bytes[*at], bytes[*at + 1]]) as usize;
            *at += 2;
            let s = String::from_utf8_lossy(&bytes[*at..*at + n]).into_owned();
            *at += n;
            Pattern::Bind(s)
        }
        1 => Pattern::Wild,
        2 => {
            let n = bytes[*at] as usize;
            *at += 1;
            let mut v = Vec::with_capacity(n);
            for _ in 0..n {
                v.push(decode(bytes, at));
            }
            Pattern::Tuple(v)
        }
        3 => {
            let n = bytes[*at] as usize;
            *at += 1;
            let mut v = Vec::with_capacity(n);
            for _ in 0..n {
                let f = u16::from_le_bytes([bytes[*at], bytes[*at + 1]]) as usize;
                *at += 2;
                let name = String::from_utf8_lossy(&bytes[*at..*at + f]).into_owned();
                *at += f;
                v.push((name, decode(bytes, at)));
            }
            Pattern::Record(v)
        }
        4 => Pattern::Some(Box::new(decode(bytes, at))),
        5 => Pattern::None,
        6 => Pattern::Ok(Box::new(decode(bytes, at))),
        7 => Pattern::Err(Box::new(decode(bytes, at))),
        8 => {
            let bits = u64::from_le_bytes(bytes[*at..*at + 8].try_into().unwrap());
            *at += 8;
            Pattern::Num(f64::from_bits(bits))
        }
        _ => {
            let n = u16::from_le_bytes([bytes[*at], bytes[*at + 1]]) as usize;
            *at += 2;
            let s = String::from_utf8_lossy(&bytes[*at..*at + n]).into_owned();
            *at += n;
            Pattern::Sym(s)
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_load_patterns(ptr: *const u8, len: i32) {
    let bytes = unsafe { frame(ptr, len) };
    let mut at = 0usize;
    let n = u16::from_le_bytes([bytes[0], bytes[1]]) as usize;
    at += 2;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let p = std::rc::Rc::new(decode(bytes, &mut at));
        // The frame size is a property of the pattern, so compute it once at load, not per test.
        let need = pattern_need(&p);
        out.push((p, need));
    }
    PATS.with(|p| unsafe { *p.get() = out });
}

/// Highest frame slot a pattern writes, so the binding frame is sized to the pattern instead of
/// paying a fixed 256-slot clear on every match test.
fn pattern_need(p: &buildhub_core::ast::Pattern) -> usize {
    fn walk(p: &buildhub_core::ast::Pattern, hi: &mut usize) {
        match p {
            buildhub_core::ast::Pattern::Bind(n) => {
                if let Some((slot, _)) = buildhub_core::resolve::split_binding(n) {
                    *hi = (*hi).max(slot as usize);
                }
            }
            buildhub_core::ast::Pattern::Tuple(ps) => ps.iter().for_each(|x| walk(x, hi)),
            buildhub_core::ast::Pattern::Record(fs) => fs.iter().for_each(|(_, x)| walk(x, hi)),
            buildhub_core::ast::Pattern::Some(x)
            | buildhub_core::ast::Pattern::Ok(x)
            | buildhub_core::ast::Pattern::Err(x) => walk(x, hi),
            _ => {}
        }
    }
    let mut hi = 0usize;
    walk(p, &mut hi);
    hi + 1
}

/// `match Some(x) { ... }`: on success the payload lands in `out[0]`. Two hot shapes get their own
/// entry point because they make up most of the `match` traffic in pack code.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_match_some(src: BVal, out: *mut i64) -> i32 {
    let payload = with_value(src, |v| match v {
        Value::Some(x) => Some((**x).clone()),
        _ => None,
    });
    match payload {
        Some(v) => {
            if !out.is_null() {
                unsafe { *out = enc(v) };
            }
            1
        }
        None => 0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_is_none(src: BVal) -> i32 {
    // `None` is inline, so this is a bit test: no top-level value is ever boxed as `None`.
    (is_tagged(src) && (src as u64) & TAG_BITS == TAG_NONE) as i32
}

/// Test `pat` against `src`; on success the bindings are available through `bhub_binding`.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_match_pat(pat: i32, src: BVal) -> i32 {
    // `Rc` clone: a deep `Pattern` clone here allocated a tree per match test. The table is only
    // written by `bhub_load_patterns` at start-up, so the borrow ends with the lookup.
    let hit = pats(|p| p.get(pat.max(0) as usize).cloned());
    let Some((p, need)) = hit else { return 0 };
    // Only publish on success: a failing inner test must not clobber the bindings an enclosing
    // pattern already established. The scratch frame is swapped in, so both sides keep reusing
    // their allocations. The frame is taken *out* of the cell, so no borrow is held across the
    // bind call (which re-enters the interner, and through `map`/`filter` could re-enter here).
    let mut slots = scratch(core::mem::take);
    slots.clear();
    slots.resize(need, Value::Unit);
    let v = dec(src);
    let ok = INTERNER.with(|i| buildhub_core::eval::bind_pattern_into(&i.borrow(), &p, &v, &mut slots));
    if ok {
        let old = binds(|b| core::mem::replace(b, slots));
        scratch(|s| *s = old);
    } else {
        scratch(|s| *s = slots);
    }
    ok as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_binding(slot: i32) -> BVal {
    let v = binds(|b| b.get(slot.max(0) as usize).cloned().unwrap_or(Value::Missing));
    enc(v)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_prim(b: i32, ptr: *const i64, n: i32) -> BVal {
    let bs = unsafe { frame(ptr, n) };
    let Some(b) = buildhub_core::ir::Builtin::from_index(b.max(0) as usize) else {
        return BVAL_MISSING;
    };
    // The hot builtins take their dedicated path here as well, so the win does not depend on the
    // emitter lowering them to a direct call. Arity mismatches fall through to the generic path,
    // exactly as before.
    match (b, bs.len()) {
        (buildhub_core::ir::Builtin::Min, 2) => return bhub_min(bs[0], bs[1]),
        (buildhub_core::ir::Builtin::Max, 2) => return bhub_max(bs[0], bs[1]),
        (buildhub_core::ir::Builtin::Keys, 1) => return bhub_keys(bs[0]),
        (buildhub_core::ir::Builtin::Map, 2) => return bhub_map(bs[0], bs[1]),
        (buildhub_core::ir::Builtin::ConcatMap, 2) => return bhub_concat_map(bs[0], bs[1]),
        (buildhub_core::ir::Builtin::Filter, 2) => return bhub_filter(bs[0], bs[1]),
        (buildhub_core::ir::Builtin::Any, 2) => return bhub_any(bs[0], bs[1]),
        (buildhub_core::ir::Builtin::All, 2) => return bhub_all(bs[0], bs[1]),
        (buildhub_core::ir::Builtin::Fold, 3) => return bhub_fold(bs[0], bs[1], bs[2]),
        (buildhub_core::ir::Builtin::Clamp, 3) => return bhub_clamp(bs[0], bs[1], bs[2]),
        (buildhub_core::ir::Builtin::SymOf, 1) => return bhub_sym_of(bs[0]),
        (buildhub_core::ir::Builtin::Find, 2) => return bhub_find(bs[0], bs[1]),
        (buildhub_core::ir::Builtin::DedupBy, 2) => return bhub_dedup_by(bs[0], bs[1]),
        (buildhub_core::ir::Builtin::Fold2, 3) => return bhub_fold2(bs[0], bs[1], bs[2]),
        (buildhub_core::ir::Builtin::Fix, 4) => return bhub_fix(bs[0], bs[1], bs[2], bs[3]),
        _ => {}
    }
    let args: Vec<Dist> = bs.iter().map(|h| Dist::One(dec(*h))).collect();
    let ptr = INTERNER.with(|i| i.as_ptr());
    let host = RtHost { interner: ptr };
    let r = buildhub_core::builtins::call(&host, b, args).unwrap_or(Dist::One(Value::Missing));
    enc(r.single().cloned().unwrap_or(Value::Missing))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_closure(fn_id: i32, ptr: *const i64, n: i32) -> BVal {
    let words: Vec<i64> = unsafe { frame(ptr, n) }.to_vec();
    let upvalues: Vec<Value> = words.iter().map(|h| dec(*h)).collect();
    enc(Value::Closure(std::rc::Rc::new(buildhub_core::value::Closure {
        fn_id: fn_id.max(0) as usize,
        upvalues,
        fast: words,
    })))
}

/// 捕获值的句柄：优先用 `fast`（AOT 建闭包时已编码），否则从 `upvalues` 编码。
fn cap_words(c: &buildhub_core::value::Closure) -> Vec<i64> {
    if c.fast.len() == c.upvalues.len() {
        c.fast.clone()
    } else {
        c.upvalues.iter().map(|v| enc(v.clone())).collect()
    }
}

// ---------------------------------------------------------------------------------------------
// Builtin fast paths
//
// These are the builtins that dominate an evaluation. Emitted code otherwise reaches them through
// `bhub_prim`, which wraps every argument in `Dist::One` and turns an error into `Missing`; each
// entry point here reproduces exactly that behaviour for the shapes that can arrive, while
// skipping the argument array, the `Vec<Dist>` and the generic dispatch. The higher-order ones
// call the compiled closure through `DISPATCH` directly, reusing one frame per builtin call.
//
// `RtHost::call_value` answers `Missing` when the callee is not a `Closure` (a first-class builtin,
// for instance). The non-closure branches below reproduce that, instead of falling back to the
// generic path.

/// The closure's upvalues followed by `nargs` slots the caller rewrites per element.
/// 复用 `ARGBUF` 的缓冲：每次 map/filter/fold 少一次 `Vec` 分配；嵌套调用先取走后放回。
fn call_frame(c: &buildhub_core::value::Closure, nargs: usize) -> Vec<i64> {
    let mut frame = ARGBUF.with(|b| core::mem::take(&mut *b.borrow_mut()));
    frame.clear();
    frame.extend(cap_words(c));
    frame.resize(frame.len() + nargs, BVAL_MISSING);
    frame
}

fn release_frame(frame: Vec<i64>) {
    ARGBUF.with(|b| *b.borrow_mut() = frame);
}

/// One call into the compiled module. A missing `DISPATCH` reads as `Missing`, matching
/// `RtHost::call_value`.
fn dispatch_bval(c: &buildhub_core::value::Closure, frame: &[i64]) -> BVal {
    DISPATCH.with(|d| match d.get() {
        Some(f) => f(c.fn_id as i32, frame.as_ptr(), frame.len() as i32),
        None => BVAL_MISSING,
    })
}

fn dispatch(c: &buildhub_core::value::Closure, frame: &[i64]) -> Value {
    dec(dispatch_bval(c, frame))
}

/// `BVal` 层面的真值判断，给只需要真假的回调路径用（省掉一次 `dec`）。
fn truthy_bval(h: BVal) -> bool {
    with_value(h, |v| v.truthy())
}

/// `min`/`max` over two operands. The builtin's `need_num` accepts `Bool` too (`num_of`), and a
/// non-numeric operand is the error `bhub_prim` reports as `Missing`.
fn num2(a: BVal, b: BVal, f: fn(f64, f64) -> f64) -> BVal {
    let (x, y) = (dec(a), dec(b));
    match (buildhub_core::eval::num_of(&x), buildhub_core::eval::num_of(&y)) {
        (Some(x), Some(y)) => enc(Value::Num(f(x, y))),
        _ => BVAL_MISSING,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_min(a: BVal, b: BVal) -> BVal {
    num2(a, b, buildhub_core::eval::wasm_min)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_max(a: BVal, b: BVal) -> BVal {
    num2(a, b, buildhub_core::eval::wasm_max)
}

/// `keys(rec)`: field symbols in insertion order. `Some(record)` reads as that record and anything
/// else as an empty list, exactly like the builtin.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_keys(rec: BVal) -> BVal {
    fn keys_of(v: &Value) -> Vec<Value> {
        match v {
            Value::Record(r) => r.fields.iter().map(|(k, _)| Value::Sym(*k)).collect(),
            Value::Some(inner) => keys_of(inner),
            _ => Vec::new(),
        }
    }
    enc(Value::list(keys_of(&dec(rec))))
}

/// `map` / `concat_map`.
fn map_each(xs: BVal, f: BVal, flatten: bool) -> BVal {
    let xs = dec(xs);
    let Ok(items) = buildhub_core::eval::as_slice(&xs) else { return BVAL_MISSING };
    let f = dec(f);
    let Value::Closure(c) = &f else {
        // One `Missing` per element (`concat_map` never flattens it).
        return enc(Value::list(vec![Value::Missing; items.len()]));
    };
    let mut frame = call_frame(c, 1);
    let slot = frame.len() - 1;
    let mut out: Vec<Value> = Vec::with_capacity(items.len());
    for it in items {
        frame[slot] = enc(it.clone());
        match (flatten, dispatch(c, &frame)) {
            (true, Value::List(inner)) => out.extend(inner.iter().cloned()),
            (_, v) => out.push(v),
        }
    }
    release_frame(frame);
    enc(Value::list(out))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_map(xs: BVal, f: BVal) -> BVal {
    map_each(xs, f, false)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_concat_map(xs: BVal, f: BVal) -> BVal {
    map_each(xs, f, true)
}

/// `filter`: every predicate result is inspected (the builtin has no early exit), and a non-closure
/// callee is `Missing`, which is falsy, so nothing is kept.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_filter(xs: BVal, f: BVal) -> BVal {
    let xs = dec(xs);
    let Ok(items) = buildhub_core::eval::as_slice(&xs) else { return BVAL_MISSING };
    let f = dec(f);
    let mut kept: Vec<Value> = Vec::new();
    if let Value::Closure(c) = &f {
        let mut frame = call_frame(c, 1);
        let slot = frame.len() - 1;
        for it in items {
            frame[slot] = enc(it.clone());
            if truthy_bval(dispatch_bval(c, &frame)) {
                kept.push(it.clone());
            }
        }
        release_frame(frame);
    }
    enc(Value::list(kept))
}

/// `any` / `all`. Both visit every element and merge the truthiness, so the fast path does too.
/// The merge only starts with the *second* result — a single-element list answers with the
/// predicate's raw value, exactly like `Dist::join` never running — and an empty list answers with
/// the identity (`all` → true, `any` → false).
fn any_all(xs: BVal, f: BVal, all: bool) -> BVal {
    let xs = dec(xs);
    let Ok(items) = buildhub_core::eval::as_slice(&xs) else { return BVAL_MISSING };
    let f = dec(f);
    let acc: Option<Value>;
    if let Value::Closure(c) = &f {
        let mut frame = call_frame(c, 1);
        let slot = frame.len() - 1;
        let mut first: Option<BVal> = None;
        let mut merged = all;
        let mut n = 0usize;
        for it in items {
            frame[slot] = enc(it.clone());
            let hit = dispatch_bval(c, &frame);
            if n == 0 {
                first = Some(hit);
                merged = truthy_bval(hit);
            } else {
                merged = if all { merged && truthy_bval(hit) } else { merged || truthy_bval(hit) };
            }
            n += 1;
        }
        release_frame(frame);
        // 只有一个元素时结果是谓词的原始值（与 `Dist::join` 未合并一致）。
        if n == 1 {
            return first.unwrap_or(BVAL_MISSING);
        }
        acc = if n == 0 { None } else { Some(Value::Bool(merged)) };
    } else {
        // `Missing` per element: one element stays `Missing`, two or more merge to `false`.
        acc = match items.len() {
            0 => None,
            1 => Some(Value::Missing),
            _ => Some(Value::Bool(false)),
        };
    }
    enc(acc.unwrap_or(Value::Bool(all)))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_any(xs: BVal, f: BVal) -> BVal {
    any_all(xs, f, false)
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_all(xs: BVal, f: BVal) -> BVal {
    any_all(xs, f, true)
}

/// `fold(xs, init, f)`: the accumulator is always single-valued on the AOT side, so this is the
/// plain left fold. A non-closure callee answers `Missing` per call, which is what a fold over a
/// non-empty list ends at.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_fold(xs: BVal, init: BVal, f: BVal) -> BVal {
    let xs = dec(xs);
    let Ok(items) = buildhub_core::eval::as_slice(&xs) else { return BVAL_MISSING };
    let mut acc = dec(init);
    let f = dec(f);
    if let Value::Closure(c) = &f {
        let mut frame = call_frame(c, 2);
        let slot = frame.len() - 2;
        for it in items {
            frame[slot] = enc(acc);
            frame[slot + 1] = enc(it.clone());
            acc = dispatch(c, &frame);
        }
        release_frame(frame);
    } else if !items.is_empty() {
        acc = Value::Missing;
    }
    enc(acc)
}

/// `clamp(v, lo, hi)`: every operand goes through `num_of` (so `Bool` is accepted) and any
/// non-numeric one is the builtin's error, i.e. `Missing`.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_clamp(v: BVal, lo: BVal, hi: BVal) -> BVal {
    use buildhub_core::eval::{num_of, wasm_max, wasm_min};
    let (v, lo, hi) = (dec(v), dec(lo), dec(hi));
    match (num_of(&v), num_of(&lo), num_of(&hi)) {
        (Some(v), Some(lo), Some(hi)) => enc(Value::Num(wasm_min(wasm_max(v, lo), hi))),
        _ => BVAL_MISSING,
    }
}

/// `sym_of(v)`: `Str` resolves through the interner; anything that is not a symbol is the builtin's
/// error, i.e. `Missing`.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_sym_of(v: BVal) -> BVal {
    let v = dec(v);
    match INTERNER.with(|i| buildhub_core::eval::sym_of(&v, &i.borrow())) {
        Ok(s) => tagged(TAG_SYM, u64::from(s.0)),
        Err(_) => BVAL_MISSING,
    }
}

/// `find(xs, pred)`: the first match as `Some(item)`, else `None`. Like `filter`, every element is
/// tested — the builtin does not stop at the first hit.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_find(xs: BVal, f: BVal) -> BVal {
    let xs = dec(xs);
    let Ok(items) = buildhub_core::eval::as_slice(&xs) else { return BVAL_MISSING };
    let f = dec(f);
    let mut first: Option<Value> = None;
    if let Value::Closure(c) = &f {
        let mut frame = call_frame(c, 1);
        let slot = frame.len() - 1;
        for it in items {
            frame[slot] = enc(it.clone());
            // Every element is tested, like the builtin: no early exit once a match is found.
            if truthy_bval(dispatch_bval(c, &frame)) && first.is_none() {
                first = Some(it.clone());
            }
        }
        release_frame(frame);
    }
    enc(match first {
        Some(v) => Value::Some(Box::new(v)),
        None => Value::None,
    })
}

/// `dedup_by(xs, key)`: keep the first element for each key, in input order. Keys compare with
/// `value::same`, the structural equality the builtin uses.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_dedup_by(xs: BVal, f: BVal) -> BVal {
    let xs = dec(xs);
    let Ok(items) = buildhub_core::eval::as_slice(&xs) else { return BVAL_MISSING };
    let f = dec(f);
    let mut keys: Vec<Value> = Vec::new();
    let mut out: Vec<Value> = Vec::new();
    if let Value::Closure(c) = &f {
        let mut frame = call_frame(c, 1);
        let slot = frame.len() - 1;
        for it in items {
            frame[slot] = enc(it.clone());
            let k = dispatch(c, &frame);
            if keys.iter().any(|seen| buildhub_core::value::same(seen, &k)) {
                continue;
            }
            keys.push(k);
            out.push(it.clone());
        }
        release_frame(frame);
    } else if let Some(first) = items.first() {
        // Every key is `Missing`, and `same(Missing, Missing)` holds, so only the first survives.
        out.push(first.clone());
    }
    enc(Value::list(out))
}

/// `fold2(xs, init, f)`: every element must be a pair; the closure is called as `f(acc, a, b)`.
/// A malformed element is the builtin's error, reported as `Missing`.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_fold2(xs: BVal, init: BVal, f: BVal) -> BVal {
    let xs = dec(xs);
    let Ok(items) = buildhub_core::eval::as_slice(&xs) else { return BVAL_MISSING };
    let mut acc = dec(init);
    let f = dec(f);
    match &f {
        Value::Closure(c) => {
            let mut frame = call_frame(c, 3);
            let slot = frame.len() - 3;
            for it in items {
                let pair = match it {
                    Value::Tuple(t) | Value::List(t) if t.len() == 2 => t,
                    _ => return BVAL_MISSING,
                };
                frame[slot] = enc(acc);
                frame[slot + 1] = enc(pair[0].clone());
                frame[slot + 2] = enc(pair[1].clone());
                acc = dispatch(c, &frame);
            }
            release_frame(frame);
        }
        // No closure: every call answers `Missing`; a malformed pair is `Missing` anyway.
        _ if !items.is_empty() => acc = Value::Missing,
        _ => {}
    }
    enc(acc)
}

/// One call with a single argument, for the builtins that call two different closures (`fix`).
fn call_one(f: &Value, arg: Value) -> Value {
    let Value::Closure(c) = f else { return Value::Missing };
    let mut frame = call_frame(c, 1);
    let slot = frame.len() - 1;
    frame[slot] = enc(arg);
    let out = dispatch(c, &frame);
    release_frame(frame);
    out
}

/// `fix(init, step, done, max)`: at most `max` rounds of `state = step(state)`, stopping before the
/// step as soon as `done(state)` is truthy. A non-numeric round limit is the builtin's error, and a
/// non-closure callback answers `Missing` (falsy for `done`), exactly like the generic path.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_fix(init: BVal, step: BVal, done: BVal, max: BVal) -> BVal {
    let Some(rounds) = buildhub_core::eval::num_of(&dec(max)) else { return BVAL_MISSING };
    let rounds = rounds.max(0.0) as u32;
    let (step, done) = (dec(step), dec(done));
    let (Value::Closure(cs), Value::Closure(cd)) = (&step, &done) else {
        let mut state = dec(init);
        for _ in 0..rounds {
            if call_one(&done, state.clone()).truthy() {
                return enc(state);
            }
            state = call_one(&step, state);
        }
        return enc(state);
    };
    // 每轮只换帧里的一个槽：帧建一次；状态全程保持 BVal，省掉每轮两次 enc 与一次 dec。
    let mut fs = call_frame(cs, 1);
    let mut fd = call_frame(cd, 1);
    let (ss, sd) = (fs.len() - 1, fd.len() - 1);
    let mut state = init;
    for _ in 0..rounds {
        fd[sd] = state;
        if truthy_bval(dispatch_bval(cd, &fd)) {
            release_frame(fd);
            release_frame(fs);
            return state;
        }
        fs[ss] = state;
        state = dispatch_bval(cs, &fs);
    }
    release_frame(fd);
    release_frame(fs);
    state
}

// Minimal host: the LLVM-emitted module provides control flow, so the runtime only needs the
// symbol table and the budget for the builtins that inspect them.
/// Borrows the pack's symbol table without holding the `RefCell` borrow across a call back into
/// compiled code: higher-order builtins re-enter here, and a long-lived borrow would panic.
/// The table is only ever appended to during setup, so a shared reference stays valid.
struct RtHost {
    interner: *const buildhub_core::Interner,
}

impl buildhub_core::eval::Host for RtHost {
    fn interner(&self) -> &buildhub_core::Interner {
        unsafe { &*self.interner }
    }
    fn budget(&self) -> buildhub_core::eval::Budget {
        buildhub_core::eval::Budget::default()
    }
    fn call_value(&self, callee: Dist, args: Vec<Dist>) -> buildhub_core::eval::EResult<Dist> {
        // Higher-order builtins call back into the compiled module through `DISPATCH`, which the
        // emitted code installs at startup.
        let f = callee.single().cloned().unwrap_or(Value::Missing);
        let Value::Closure(c) = f else {
            return Ok(Dist::One(Value::Missing));
        };
        // The frame is consumed by the callee's prologue before any nested callback runs, so a
        // single reusable buffer is safe (a nested call takes it away, then puts it back).
        let mut hs = ARGBUF.with(|b| core::mem::take(&mut *b.borrow_mut()));
        hs.clear();
        hs.extend(cap_words(&c));
        hs.extend(args.iter().map(|d| enc(d.single().cloned().unwrap_or(Value::Missing))));
        let out = DISPATCH.with(|f| match f.get() {
            Some(f) => f(c.fn_id as i32, hs.as_ptr(), hs.len() as i32),
            None => BVAL_MISSING,
        });
        ARGBUF.with(|b| *b.borrow_mut() = hs);
        Ok(Dist::One(dec(out)))
    }
    fn mark_truncated(&self) {}
    fn was_truncated(&self) -> bool {
        false
    }
    fn trim(&self, d: Dist) -> buildhub_core::eval::EResult<Vec<buildhub_core::value::Pt>> {
        Ok(d.points())
    }
    fn show_value(&self, v: &Value) -> String {
        format!("{v:?}")
    }
    fn begin_choice(&self) -> u32 {
        0
    }
    fn record_choice(&self, _site: u32, _branch: u32, _p: f64, _label: Option<buildhub_core::Sym>) {}
    fn sets(&self) -> &[buildhub_core::ir::DataSet] {
        &[]
    }
}

// ---------------------------------------------------------------------------------------------
// Data sets
//
// Rules compile in; data does not (spec §9.6.1). The host installs the pack's tables as JSON and
// the runtime maps them to `DataSet`s. Object keys and string values become `Sym`, which is what
// pack code compares against (`m.品质 == some(sym"金")`).

thread_local! {
    /// Loaded once by `bhub_load_data` and then read-only, so a `RefCell` per lookup was pure
    /// bookkeeping — and the clone the old code made to escape the borrow copied the whole key
    /// index on every `by_key` call.
    static DATA: UnsafeCell<Vec<buildhub_core::ir::DataSet>> = const { UnsafeCell::new(Vec::new()) };
}

#[inline(always)]
fn data<R>(f: impl FnOnce(&[buildhub_core::ir::DataSet]) -> R) -> R {
    DATA.with(|d| f(unsafe { &*d.get() }))
}

fn json_to_value(j: &serde_json::Value) -> Value {
    use serde_json::Value as J;
    match j {
        // An absent optional field is `None`, not `Missing`: pack code matches on `some(v)`.
        J::Null => Value::None,
        J::Bool(b) => Value::Bool(*b),
        J::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        J::String(s) => Value::Sym(INTERNER.with(|i| i.borrow_mut().intern(s))),
        J::Array(a) => Value::list(a.iter().map(json_to_value).collect()),
        J::Object(o) => {
            let mut r = buildhub_core::value::Record::new();
            for (k, v) in o {
                let sym = INTERNER.with(|i| i.borrow_mut().intern(k));
                r.set(sym, json_to_value(v));
            }
            Value::record(r)
        }
    }
}

fn take_str(bytes: &[u8], at: &mut usize) -> String {
    let n = u16::from_le_bytes([bytes[*at], bytes[*at + 1]]) as usize;
    *at += 2;
    let s = String::from_utf8_lossy(&bytes[*at..*at + n]).into_owned();
    *at += n;
    s
}

fn decode_tag(bytes: &[u8], at: &mut usize) -> buildhub_core::ssa::TyTag {
    use buildhub_core::ssa::TyTag;
    let tag = bytes[*at];
    *at += 1;
    match tag {
        0 => TyTag::Num,
        1 => TyTag::Bool,
        2 => TyTag::Sym,
        3 => TyTag::Str,
        4 => TyTag::Unit,
        5 => TyTag::List(Box::new(decode_tag(bytes, at))),
        6 => TyTag::Option(Box::new(decode_tag(bytes, at))),
        7 => {
            let n = u16::from_le_bytes([bytes[*at], bytes[*at + 1]]) as usize;
            *at += 2;
            let mut v = Vec::with_capacity(n);
            for _ in 0..n {
                v.push(decode_tag(bytes, at));
            }
            TyTag::Tuple(v)
        }
        8 => {
            let open = bytes[*at] != 0;
            *at += 1;
            let n = u16::from_le_bytes([bytes[*at], bytes[*at + 1]]) as usize;
            *at += 2;
            let mut v = Vec::with_capacity(n);
            for _ in 0..n {
                let name = take_str(bytes, at);
                v.push((name, decode_tag(bytes, at)));
            }
            TyTag::Record(v, open)
        }
        9 => TyTag::Schema(take_str(bytes, at)),
        _ => TyTag::Any,
    }
}

/// Install the pack's schema table (field types drive `Option` wrapping on load).
#[unsafe(no_mangle)]
pub extern "C" fn bhub_load_schemas(ptr: *const u8, len: i32) {
    let bytes = unsafe { frame(ptr, len) };
    let mut at = 0usize;
    let n = u16::from_le_bytes([bytes[0], bytes[1]]) as usize;
    at += 2;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let name = take_str(bytes, &mut at);
        let open = bytes[at] != 0;
        at += 1;
        let fc = u16::from_le_bytes([bytes[at], bytes[at + 1]]) as usize;
        at += 2;
        let mut fields = Vec::with_capacity(fc);
        for _ in 0..fc {
            let fname = take_str(bytes, &mut at);
            fields.push((fname, decode_tag(bytes, &mut at)));
        }
        out.push(buildhub_core::ssa::SchemaCode { name, fields, open });
    }
    SCHEMAS.with(|s| *s.borrow_mut() = out);
}

/// Install the `[[data]]` bindings (`set name -> schema name`).
#[unsafe(no_mangle)]
pub extern "C" fn bhub_load_datasets(ptr: *const u8, len: i32) {
    let bytes = unsafe { frame(ptr, len) };
    let mut at = 0usize;
    let n = u16::from_le_bytes([bytes[0], bytes[1]]) as usize;
    at += 2;
    let mut out = Vec::with_capacity(n);
    for _ in 0..n {
        let name = take_str(bytes, &mut at);
        let schema = take_str(bytes, &mut at);
        let key = if bytes[at] != 0 {
            at += 1;
            Some(take_str(bytes, &mut at))
        } else {
            at += 1;
            None
        };
        out.push((name, schema, key));
    }
    DATASETS.with(|d| *d.borrow_mut() = out);
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_load_data(ptr: *const u8, len: i32) {
    let bytes = unsafe { frame(ptr, len) };
    let Ok(j) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return;
    };
    let mut sets: Vec<buildhub_core::ir::DataSet> = Vec::new();
    interner_ready();
    let schemas = SCHEMAS.with(|s| s.borrow().clone());
    let datasets = DATASETS.with(|d| d.borrow().clone());
    let serde_json::Value::Object(o) = j else {
        DATA.with(|d| unsafe { *d.get() = sets });
        return;
    };
    // Index by declaration order, not by the JSON's key order: the emitted code addresses sets by
    // position, so a host that reorders its object (or a serializer that sorts keys) would
    // otherwise bind every lookup to the wrong table.
    let empty = serde_json::Value::Null;
    for (name, schema, declared) in datasets.iter() {
        let rows = o.get(name).unwrap_or(&empty);
        let sc = schemas.iter().find(|x| &x.name == schema);
        let list = INTERNER.with(|i| {
            let mut i = i.borrow_mut();
            buildhub_core::host::convert_set(&mut i, rows, sc, &schemas)
        });
        let key = data_key_of(&list, declared.as_deref());
        let mut index = hashbrown_like_index(&list, key);
        index.shrink_to_fit();
        sets.push(buildhub_core::ir::DataSet {
            name: name.clone(),
            dataset: String::new(),
            schema: schema.clone(),
            key: key.map(|k| INTERNER.with(|i| i.borrow().name(k).to_string())),
            key_sym: key,
            rows: std::rc::Rc::new(list),
            version: 0,
            index,
        });
    }
    DATA.with(|d| unsafe { *d.get() = sets });
}

/// The interpreter's data sets key rows by their `id` (or `name`) field; mirror that.
fn data_key_of(rows: &[Value], declared: Option<&str>) -> Option<buildhub_core::Sym> {
    let first = rows.first()?;
    let Value::Record(r) = first else { return None };
    // A declared `[[data]] key` wins: sets keyed by a symbol (`buffs.key`) were unindexable while
    // the lookup only accepted numeric `id`s.
    if let Some(d) = declared {
        if let Some(sym) = INTERNER.with(|i| i.borrow().find(d)) {
            if r.get(sym).is_some() {
                return Some(sym);
            }
        }
    }
    for name in ["id", "名称", "name"] {
        if let Some(sym) = INTERNER.with(|i| i.borrow().find(name)) {
            if r.get(sym).map(|v| matches!(v, Value::Num(_) | Value::Sym(_))).unwrap_or(false) {
                return Some(sym);
            }
        }
    }
    None
}

fn hashbrown_like_index(
    rows: &[Value],
    key: Option<buildhub_core::Sym>,
) -> hashbrown::HashMap<u64, usize> {
    // Same key hashing as `step::data`, so `by_id` lookups agree with the interpreter.
    let mut m = hashbrown::HashMap::new();
    let Some(k) = key else { return m };
    for (i, row) in rows.iter().enumerate() {
        if let Value::Record(r) = row {
            if let Some(v) = r.get(k) {
                m.insert(v.hash(), i);
            }
        }
    }
    m
}

fn interner_ready() {}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_truthy(h: BVal) -> i32 {
    with_value(h, |v| i32::from(v.truthy()))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_update(rec: BVal, patch: BVal) -> BVal {
    match buildhub_core::step::update(Dist::One(dec(rec)), Dist::One(dec(patch))) {
        Ok(d) => enc(d.single().cloned().unwrap_or(Value::Missing)),
        Err(_) => BVAL_MISSING,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_arg(args: *const i64, i: i32) -> BVal {
    unsafe { *args.add(i.max(0) as usize) }
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_call_value(callee: BVal, args: *const i64, n: i32) -> BVal {
    let bs = unsafe { frame(args, n) };
    let Value::Closure(c) = dec(callee) else { return BVAL_MISSING };
    let mut all: Vec<i64> = cap_words(&c);
    all.extend_from_slice(bs);
    DISPATCH.with(|d| match d.get() {
        Some(f) => f(c.fn_id as i32, all.as_ptr(), all.len() as i32),
        None => BVAL_MISSING,
    })
}

/// `kind`: 0 = all rows, 1 = length, 2 = lookup by the set's key field.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_data(set: i32, kind: i32, arg: BVal) -> BVal {
    // Borrow the table for the length of the lookup. The old `cloned()` copied the `DataSet` —
    // including its key index — on every call, which cost more than the lookup itself.
    let v = data(|sets| {
        let Some(ds) = sets.get(set.max(0) as usize) else { return None };
        match kind {
            // Rows are immutable once loaded, so the slice shares the rows instead of deep-copying.
            0 => Some(Value::List(ds.rows.clone())),
            1 => Some(Value::Num(ds.rows.len() as f64)),
            2 => {
                // `by_key` yields `Option`: `Some(row)` or `None`.
                let h = with_value(arg, |v| v.hash());
                let hit = ds.index.get(&h).and_then(|i| ds.rows.get(*i)).cloned();
                Some(match hit {
                    Some(v) => Value::Some(Box::new(v)),
                    None => Value::None,
                })
            }
            _ => {
                let n = with_value(arg, |v| match v {
                    Value::Num(n) => Some(*n),
                    _ => None,
                })?;
                Some(ds.rows.get(n.max(0.0) as usize).cloned().unwrap_or(Value::Missing))
            }
        }
    });
    enc(v.unwrap_or(Value::Missing))
}

#[unsafe(no_mangle)]
pub extern "C" fn bhub_host(name: i32, args: *const i64, n: i32) -> BVal {
    let _ = (name, args, n);
    BVAL_MISSING
}

/// Convert a JSON argument into a value (configs arrive as JSON over the host boundary).
#[unsafe(no_mangle)]
pub extern "C" fn bhub_json_arg(ptr: *const u8, len: i32) -> BVal {
    let bytes = unsafe { frame(ptr, len) };
    match serde_json::from_slice::<serde_json::Value>(bytes) {
        Ok(j) => enc(json_to_value(&j)),
        Err(_) => BVAL_MISSING,
    }
}

/// Intern a symbol by name (CLI arguments written as words).
#[unsafe(no_mangle)]
pub extern "C" fn bhub_sym_by_name(ptr: *const u8, len: i32) -> BVal {
    let s = String::from_utf8_lossy(unsafe { frame(ptr, len) }).into_owned();
    let id = INTERNER.with(|i| i.borrow_mut().intern(&s));
    tagged(TAG_SYM, u64::from(id.0))
}

/// Render a value as source text into `buf`; returns the number of bytes written (the text is
/// truncated to `cap - 1` characters so the buffer always stays NUL-terminated).
#[unsafe(no_mangle)]
pub extern "C" fn bhub_show(h: BVal, buf: *mut u8, cap: i32) -> i64 {
    let s = with_value(h, |v| INTERNER.with(|i| buildhub_core::show::render(&i.borrow(), v)));
    let b = s.as_bytes();
    let room = cap.max(0) as usize;
    let n = b.len().min(room.saturating_sub(1));
    if room > 0 {
        unsafe {
            core::ptr::copy_nonoverlapping(b.as_ptr(), buf, n);
            *buf.add(n) = 0;
        }
    }
    n as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `dec` must invert `enc` for every shape the interpreter can produce.
    fn round_trip(v: Value) {
        let back = dec(enc(v.clone()));
        assert!(v.same_as(&back), "round-trip changed {v:?} into {back:?}");
    }

    #[test]
    fn round_trip_scalars() {
        round_trip(Value::Num(1.5));
        round_trip(Value::Num(-0.0));
        round_trip(Value::Bool(true));
        round_trip(Value::Bool(false));
        round_trip(Value::Sym(buildhub_core::Sym(27)));
        round_trip(Value::Unit);
        round_trip(Value::None);
        round_trip(Value::Missing);
    }

    #[test]
    fn round_trip_compounds() {
        round_trip(Value::Str("abc".into()));
        round_trip(Value::list(vec![Value::Num(1.0), Value::Sym(buildhub_core::Sym(2))]));
        round_trip(Value::tuple(vec![Value::Bool(true), Value::None]));
        round_trip(Value::record(
            buildhub_core::value::Record::new()
                .with(buildhub_core::Sym(1), Value::Num(2.0))
                .with(buildhub_core::Sym(3), Value::Str("x".into())),
        ));
        round_trip(Value::Closure(std::rc::Rc::new(buildhub_core::value::Closure {
            fn_id: 9,
            upvalues: vec![Value::Num(4.0)],
                fast: Vec::new(),
        })));
        round_trip(Value::Builtin(7));
        round_trip(Value::Some(Box::new(Value::Num(1.0))));
        round_trip(Value::Ok(Box::new(Value::Sym(buildhub_core::Sym(5)))));
        round_trip(Value::Err(Box::new(Value::Missing)));
    }

    #[test]
    fn scalars_stay_out_of_the_arena() {
        let before = bhub_arena_len();
        for _ in 0..32 {
            dec(enc(Value::Num(1.5)));
            dec(enc(Value::Bool(true)));
            dec(enc(Value::Sym(buildhub_core::Sym(3))));
            dec(enc(Value::None));
            dec(enc(Value::Unit));
            dec(enc(Value::Missing));
        }
        assert_eq!(bhub_arena_len(), before, "a scalar took an arena slot");
    }

    /// NaN must never look tagged, or `dec` would read a number as a handle.
    #[test]
    fn nan_never_looks_tagged() {
        for n in [f64::NAN, -f64::NAN, f64::from_bits(0xFFF8_0000_0000_0001)] {
            let b = enc(Value::Num(n));
            assert!(!is_tagged(b), "NaN {n:?} encoded as the tagged word {b:#x}");
            assert!(matches!(dec(b), Value::Num(x) if x.is_nan()));
        }
    }

    /// Every tag fits the three bits `TAG_MASK` leaves free and none of them overlap.
    #[test]
    fn tag_space_is_disjoint() {
        let tags = [TAG_HEAP, TAG_SYM, TAG_BOOL, TAG_NONE, TAG_UNIT, TAG_MISSING];
        for (i, a) in tags.iter().enumerate() {
            assert_eq!(*a & TAG_BITS, *a);
            for b in &tags[i + 1..] {
                assert_ne!(a, b);
            }
        }
    }

    /// The exported shape: an i64 in, an i64 out, and the arena only holds compounds.
    #[test]
    fn constructors_round_trip_through_the_abi() {
        let n = bhub_mk_num(1.5);
        assert_eq!(bhub_to_num(n), 1.5);
        assert_eq!(bhub_sym_id(bhub_mk_sym(27)), 27);
        assert_eq!(bhub_truthy(bhub_mk_bool(1)), 1);
        assert_eq!(bhub_is_none(bhub_mk_none()), 1);
        assert_eq!(bhub_is_none(bhub_mk_missing()), 0);

        let before = bhub_arena_len();
        bhub_mk_num(1.5);
        bhub_mk_sym(27);
        bhub_mk_bool(1);
        bhub_mk_unit();
        bhub_mk_none();
        bhub_mk_missing();
        assert_eq!(bhub_arena_len(), before);

        let xs = [bhub_mk_num(1.0), bhub_mk_num(2.0)];
        let list = bhub_mk_list(xs.as_ptr(), xs.len() as i32);
        assert_eq!(bhub_len(list), 2.0);
        assert_eq!(bhub_is_list(list), 1);
        assert_eq!(bhub_to_num(bhub_at(list, 1.0)), 2.0);
    }

    /// Run a builtin through the generic path exactly as `bhub_prim` does: `Dist::One` arguments
    /// against this runtime's host, errors degraded to `Missing`.
    fn generic(b: buildhub_core::ir::Builtin, args: &[Value]) -> Value {
        let host = RtHost { interner: INTERNER.with(|i| i.as_ptr()) };
        let ds = args.iter().cloned().map(Dist::One).collect();
        match buildhub_core::builtins::call(&host, b, ds) {
            Ok(d) => d.single().cloned().unwrap_or(Value::Missing),
            Err(_) => Value::Missing,
        }
    }

    /// `same_as` is value equality, so NaN never equals itself; these tests compare `NaN` results
    /// by kind instead.
    fn eqv(a: &Value, b: &Value) -> bool {
        match (a, b) {
            (Value::Num(x), Value::Num(y)) if x.is_nan() && y.is_nan() => true,
            _ => a.same_as(b),
        }
    }

    /// The operator table's own answer for one binary operation.
    fn ref_binary(tag: buildhub_core::eval::BinOpTag, a: &Value, b: &Value) -> Value {
        buildhub_core::eval::binary_tag(tag, a.clone(), b.clone()).unwrap_or(Value::Missing)
    }

    /// One value of every shape the runtime can hold, for the comparison/arithmetic matrices.
    fn corpus() -> Vec<Value> {
        vec![
            Value::Num(0.0),
            Value::Num(-0.0),
            Value::Num(1.5),
            Value::Num(-2.0),
            Value::Num(f64::NAN),
            Value::Bool(true),
            Value::Bool(false),
            Value::Sym(buildhub_core::Sym(1)),
            Value::Sym(buildhub_core::Sym(2)),
            Value::Unit,
            Value::None,
            Value::Missing,
            Value::Str("x".into()),
            Value::list(vec![Value::Num(1.0)]),
            Value::list(vec![Value::Num(1.0), Value::Num(2.0)]),
            Value::tuple(vec![Value::Num(1.0), Value::Num(2.0)]),
            Value::record(
                buildhub_core::value::Record::new().with(buildhub_core::Sym(1), Value::Num(1.0)),
            ),
            Value::Some(Box::new(Value::Num(1.0))),
            Value::Ok(Box::new(Value::Num(1.0))),
            Value::Err(Box::new(Value::Num(1.0))),
            Value::Builtin(3),
            Value::Closure(std::rc::Rc::new(buildhub_core::value::Closure {
                fn_id: 1,
                upvalues: vec![Value::Num(2.0)],
                fast: Vec::new(),
            })),
        ]
    }

    /// Every pair of shapes, compared both as distinct words and as the same word.
    #[test]
    fn eq_ne_match_the_operator_table() {
        use buildhub_core::eval::BinOpTag as T;
        let vs = corpus();
        for a in &vs {
            let ba = enc(a.clone());
            // The same word on both sides must agree too (bit-identity shortcut), NaN included.
            let self_eq = ref_binary(T::Eq, a, a).same_as(&Value::Bool(true));
            let self_ne = ref_binary(T::Ne, a, a).same_as(&Value::Bool(true));
            assert_eq!(bhub_eq(ba, ba), self_eq as i32, "eq({a:?}) with itself");
            assert_eq!(bhub_ne(ba, ba), self_ne as i32, "ne({a:?}) with itself");
            for b in &vs {
                let bb = enc(b.clone());
                let want_eq = ref_binary(T::Eq, a, b);
                let want_ne = ref_binary(T::Ne, a, b);
                let got_eq = Value::Bool(bhub_eq(ba, bb) != 0);
                let got_ne = Value::Bool(bhub_ne(ba, bb) != 0);
                assert!(got_eq.same_as(&want_eq), "eq({a:?}, {b:?}): {got_eq:?} vs {want_eq:?}");
                assert!(got_ne.same_as(&want_ne), "ne({a:?}, {b:?}): {got_ne:?} vs {want_ne:?}");
            }
        }
    }

    /// All 14 operators over every pair of shapes: the numeric fast path and the fallback must
    /// both agree with `binary_tag`.
    #[test]
    fn bin_matches_the_operator_table() {
        use buildhub_core::eval::BinOpTag as T;
        let tags = [
            T::Add, T::Sub, T::Mul, T::Div, T::FloorDiv, T::Rem, T::Eq, T::Ne, T::Lt, T::Le,
            T::Gt, T::Ge, T::And, T::Or,
        ];
        let vs = corpus();
        for (ord, tag) in tags.iter().enumerate() {
            for a in &vs {
                for b in &vs {
                    let want = ref_binary(*tag, a, b);
                    let got = dec(bhub_bin(ord as i32, enc(a.clone()), enc(b.clone())));
                    assert!(eqv(&want, &got), "{tag:?}({a:?}, {b:?}): generic {want:?} vs fast {got:?}");
                }
            }
        }
    }

    /// `at` over every shape and a spread of indices, including negative, NaN and out of range.
    #[test]
    fn at_matches_the_container_semantics() {
        fn reference(xs: &Value, i: f64) -> Value {
            match xs {
                Value::List(l) | Value::Tuple(l) => {
                    l.get(i.max(0.0) as usize).cloned().unwrap_or(Value::Missing)
                }
                _ => Value::Missing,
            }
        }
        for v in corpus() {
            for i in [-1.0, 0.0, 1.0, 2.0, f64::NAN, 1e9] {
                let want = reference(&v, i);
                let got = dec(bhub_at(enc(v.clone()), i));
                assert!(eqv(&want, &got), "at({v:?}, {i}): {want:?} vs {got:?}");
            }
        }
    }

    #[test]
    fn min_max_match_the_generic_path() {
        use buildhub_core::ir::Builtin as B;
        let cases = [
            (Value::Num(1.5), Value::Num(2.5)),
            (Value::Num(-0.0), Value::Num(0.0)),
            (Value::Num(f64::NAN), Value::Num(1.0)),
            (Value::Bool(true), Value::Num(0.5)),
            (Value::Sym(buildhub_core::Sym(1)), Value::Num(1.0)),
            (Value::Missing, Value::Num(1.0)),
        ];
        for (a, b) in cases {
            for builtin in [B::Min, B::Max] {
                let want = generic(builtin, &[a.clone(), b.clone()]);
                let got = match builtin {
                    B::Min => dec(bhub_min(enc(a.clone()), enc(b.clone()))),
                    _ => dec(bhub_max(enc(a.clone()), enc(b.clone()))),
                };
                assert!(eqv(&want, &got), "{builtin:?}({a:?}, {b:?}): generic {want:?} vs fast {got:?}");
            }
        }
    }

    #[test]
    fn keys_match_the_generic_path() {
        use buildhub_core::ir::Builtin as B;
        let rec = Value::record(
            buildhub_core::value::Record::new()
                .with(buildhub_core::Sym(4), Value::Num(1.0))
                .with(buildhub_core::Sym(9), Value::None),
        );
        let cases =
            [rec.clone(), Value::Some(Box::new(rec)), Value::None, Value::Missing, Value::list(vec![])];
        for v in cases {
            let want = generic(B::Keys, &[v.clone()]);
            let got = dec(bhub_keys(enc(v.clone())));
            assert!(want.same_as(&got), "keys({v:?}): generic {want:?} vs fast {got:?}");
        }
    }

    /// A tiny stand-in for the compiled module: the closure's `fn_id` selects an operation over
    /// the frame's trailing argument slots. Enough to exercise the fast loops without LLVM.
    extern "C" fn test_dispatch(fn_id: i32, args: *const i64, n: i32) -> BVal {
        let frame = unsafe { frame(args, n) };
        let last = |f: &[i64]| dec(*f.last().unwrap_or(&BVAL_MISSING));
        match fn_id {
            // identity
            1 => enc(last(frame)),
            // +1
            2 => match last(frame) {
                Value::Num(x) => enc(Value::Num(x + 1.0)),
                _ => BVAL_MISSING,
            },
            // truthiness
            3 => enc(Value::Bool(last(frame).truthy())),
            // add the last two numbers (`fold`: accumulator, element)
            4 => match (frame.len() >= 2).then(|| (dec(frame[frame.len() - 2]), dec(frame[frame.len() - 1]))) {
                Some((Value::Num(a), Value::Num(b))) => enc(Value::Num(a + b)),
                _ => BVAL_MISSING,
            },
            // duplicate the last argument into a list (`concat_map` flattens it)
            5 => {
                let v = last(frame);
                enc(Value::list(vec![v.clone(), v]))
            }
            // threshold: truthy once the number reaches 3 (`fix`'s `done`)
            6 => enc(Value::Bool(matches!(last(frame), Value::Num(x) if x >= 3.0))),
            _ => BVAL_MISSING,
        }
    }

    /// Non-closure callee: the generic path answers `Missing` per element, so the fast paths must
    /// agree element for element, including on an empty list.
    #[test]
    fn higher_order_non_closure_matches_the_generic_path() {
        use buildhub_core::ir::Builtin as B;
        let f = Value::Builtin(0);
        let init = Value::Num(7.0);
        let lists = [
            Value::list(vec![Value::Num(1.0), Value::Num(2.0)]),
            Value::list(vec![]),
            Value::tuple(vec![Value::Num(3.0)]),
        ];
        for xs in lists {
            let cases = [
                (B::Map, vec![xs.clone(), f.clone()]),
                (B::ConcatMap, vec![xs.clone(), f.clone()]),
                (B::Filter, vec![xs.clone(), f.clone()]),
                (B::Any, vec![xs.clone(), f.clone()]),
                (B::All, vec![xs.clone(), f.clone()]),
                (B::Fold, vec![xs.clone(), init.clone(), f.clone()]),
            ];
            for (b, args) in cases {
                let got = match b {
                    B::Map => dec(bhub_map(enc(xs.clone()), enc(f.clone()))),
                    B::ConcatMap => dec(bhub_concat_map(enc(xs.clone()), enc(f.clone()))),
                    B::Filter => dec(bhub_filter(enc(xs.clone()), enc(f.clone()))),
                    B::Any => dec(bhub_any(enc(xs.clone()), enc(f.clone()))),
                    B::All => dec(bhub_all(enc(xs.clone()), enc(f.clone()))),
                    _ => dec(bhub_fold(enc(xs.clone()), enc(init.clone()), enc(f.clone()))),
                };
                let want = generic(b, &args);
                assert!(want.same_as(&got), "{b:?} on {xs:?}: generic {want:?} vs fast {got:?}");
            }
        }
        // A non-list receiver is the `as_list` error, which `bhub_prim` reports as `Missing`.
        assert!(matches!(dec(bhub_map(enc(Value::Num(1.0)), enc(f.clone()))), Value::Missing));
        assert!(matches!(dec(bhub_fold(enc(Value::Num(1.0)), enc(init), enc(f))), Value::Missing));
    }

    /// Closure callee: the fast loops must call through `DISPATCH` exactly like
    /// `RtHost::call_value`, with the upvalues as the frame prefix.
    #[test]
    fn higher_order_closures_match_the_generic_path() {
        use buildhub_core::ir::Builtin as B;
        bhub_set_dispatch(test_dispatch);
        let xs = Value::list(vec![Value::Num(1.0), Value::Num(2.0), Value::Num(3.0)]);
        let f = |id: usize| {
            Value::Closure(std::rc::Rc::new(buildhub_core::value::Closure {
                fn_id: id,
                upvalues: vec![Value::Num(100.0)],
                fast: Vec::new(),
            }))
        };
        let init = Value::Num(10.0);

        let checks = [
            (B::Map, f(2), vec![xs.clone(), f(2)]),
            (B::ConcatMap, f(5), vec![xs.clone(), f(5)]),
            (B::Filter, f(3), vec![xs.clone(), f(3)]),
            (B::Any, f(3), vec![xs.clone(), f(3)]),
            (B::All, f(3), vec![xs.clone(), f(3)]),
            (B::Fold, f(4), vec![xs.clone(), init.clone(), f(4)]),
        ];
        for (b, callee, args) in checks {
            let got = match b {
                B::Map => dec(bhub_map(enc(xs.clone()), enc(callee.clone()))),
                B::ConcatMap => dec(bhub_concat_map(enc(xs.clone()), enc(callee.clone()))),
                B::Filter => dec(bhub_filter(enc(xs.clone()), enc(callee.clone()))),
                B::Any => dec(bhub_any(enc(xs.clone()), enc(callee.clone()))),
                B::All => dec(bhub_all(enc(xs.clone()), enc(callee.clone()))),
                _ => dec(bhub_fold(enc(xs.clone()), enc(init.clone()), enc(callee.clone()))),
            };
            let want = generic(b, &args);
            assert!(want.same_as(&got), "{b:?}: generic {want:?} vs fast {got:?}");
        }
        // Identity mapping keeps order and duplicates nothing.
        assert!(dec(bhub_map(enc(xs.clone()), enc(f(1)))).same_as(&xs));
        // Empty list: the loop never runs.
        let empty = Value::list(vec![]);
        assert!(dec(bhub_fold(enc(empty.clone()), enc(init.clone()), enc(f(4)))).same_as(&init));
        assert!(dec(bhub_any(enc(empty.clone()), enc(f(3)))).same_as(&Value::Bool(false)));
    }

    #[test]
    fn clamp_and_sym_of_match_the_generic_path() {
        use buildhub_core::ir::Builtin as B;
        let cases = [
            (B::Clamp, vec![Value::Num(5.0), Value::Num(0.0), Value::Num(3.0)]),
            (B::Clamp, vec![Value::Num(5.0), Value::Num(10.0), Value::Num(3.0)]),
            (B::Clamp, vec![Value::Bool(true), Value::Num(0.0), Value::Num(2.0)]),
            (B::Clamp, vec![Value::Num(5.0), Value::Sym(buildhub_core::Sym(1)), Value::Num(3.0)]),
            (B::SymOf, vec![Value::Sym(buildhub_core::Sym(5))]),
            (B::SymOf, vec![Value::Num(1.0)]),
            (B::SymOf, vec![Value::Missing]),
        ];
        for (b, args) in cases {
            let want = generic(b, &args);
            let got = match b {
                B::Clamp => dec(bhub_clamp(
                    enc(args[0].clone()),
                    enc(args[1].clone()),
                    enc(args[2].clone()),
                )),
                _ => dec(bhub_sym_of(enc(args[0].clone()))),
            };
            assert!(eqv(&want, &got), "{b:?}({args:?}): generic {want:?} vs fast {got:?}");
        }
    }

    /// `find` / `dedup_by` / `fold2` / `fix`, against the generic path, with and without a closure.
    #[test]
    fn second_tier_matches_the_generic_path() {
        use buildhub_core::ir::Builtin as B;
        bhub_set_dispatch(test_dispatch);
        let f = |id: usize| {
            Value::Closure(std::rc::Rc::new(buildhub_core::value::Closure {
                fn_id: id,
                upvalues: vec![Value::Num(100.0)],
                fast: Vec::new(),
            }))
        };
        let xs = Value::list(vec![Value::Num(1.0), Value::Num(2.0), Value::Num(1.0)]);
        let pairs = Value::list(vec![
            Value::tuple(vec![Value::Num(1.0), Value::Num(2.0)]),
            Value::tuple(vec![Value::Num(3.0), Value::Num(4.0)]),
        ]);
        let init = Value::Num(100.0);
        let zero = Value::Num(0.0);

        let closure_cases = [
            (B::Find, vec![xs.clone(), f(3)], dec(bhub_find(enc(xs.clone()), enc(f(3))))),
            (B::DedupBy, vec![xs.clone(), f(1)], dec(bhub_dedup_by(enc(xs.clone()), enc(f(1))))),
            (
                B::Fold2,
                vec![pairs.clone(), init.clone(), f(4)],
                dec(bhub_fold2(enc(pairs.clone()), enc(init.clone()), enc(f(4)))),
            ),
            (
                B::Fix,
                vec![zero.clone(), f(2), f(6), Value::Num(10.0)],
                dec(bhub_fix(enc(zero.clone()), enc(f(2)), enc(f(6)), enc(Value::Num(10.0)))),
            ),
        ];
        for (b, args, got) in closure_cases {
            let want = generic(b, &args);
            assert!(eqv(&want, &got), "{b:?}: generic {want:?} vs fast {got:?}");
        }
        // Sanity: the `fix` chain really does stop at the threshold, and `find` really does find.
        assert!(dec(bhub_fix(enc(zero.clone()), enc(f(2)), enc(f(6)), enc(Value::Num(10.0))))
            .same_as(&Value::Num(3.0)));
        assert!(dec(bhub_find(enc(xs.clone()), enc(f(3)))).same_as(&Value::Some(Box::new(Value::Num(1.0)))));

        let plain = Value::Builtin(0);
        let plain_cases = [
            (B::Find, vec![xs.clone(), plain.clone()], dec(bhub_find(enc(xs.clone()), enc(plain.clone())))),
            (
                B::DedupBy,
                vec![xs.clone(), plain.clone()],
                dec(bhub_dedup_by(enc(xs.clone()), enc(plain.clone()))),
            ),
            (
                B::Fold2,
                vec![pairs.clone(), init.clone(), plain.clone()],
                dec(bhub_fold2(enc(pairs.clone()), enc(init.clone()), enc(plain.clone()))),
            ),
            (
                B::Fix,
                vec![zero.clone(), plain.clone(), plain.clone(), Value::Num(3.0)],
                dec(bhub_fix(enc(zero.clone()), enc(plain.clone()), enc(plain.clone()), enc(Value::Num(3.0)))),
            ),
        ];
        for (b, args, got) in plain_cases {
            let want = generic(b, &args);
            assert!(eqv(&want, &got), "{b:?} (non-closure): generic {want:?} vs fast {got:?}");
        }

        // Malformed pair and a non-numeric round limit are the builtin's error: `Missing`.
        let bad = Value::list(vec![Value::Num(1.0)]);
        assert!(matches!(dec(bhub_fold2(enc(bad.clone()), enc(init.clone()), enc(f(4)))), Value::Missing));
        assert!(matches!(
            dec(bhub_fix(enc(zero), enc(f(2)), enc(f(6)), enc(Value::Sym(buildhub_core::Sym(1))))),
            Value::Missing
        ));
        assert!(matches!(dec(bhub_dedup_by(enc(Value::Num(1.0)), enc(f(1)))), Value::Missing));
    }
}
