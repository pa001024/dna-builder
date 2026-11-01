//! The C ABI of spec §10.2, built for `wasm32-unknown-unknown` (path B) and host `cdylib`.
//!
//! The envelope, error codes and handle model are identical on both paths, so a host writes one
//! call layer. Path B (`engine.wasm`) loads a `CodeImage`; path W (`pack.wasm`) links the same ABI
//! against a precompiled program — this module is the *runtime* the interpreter supplies.
//!
//! Built with `cargo rustc --crate-type cdylib` (see `build.sh`); the kernel itself stays `rlib`
//! so a `no_std` build without this feature needs no panic handler or allocator.

use alloc::{format, string::String, string::ToString, vec, vec::Vec};
use core::cell::RefCell;
use alloc::rc::Rc;

use crate::eval::Budget;
use crate::image::{self, NumericMode};
use crate::pack::LoadedPack;
use crate::sym::Interner;
use crate::value::Value;
use crate::vm::Vm;

/// One loaded package: a decoded `CodeImage` plus the data sets it was bound against.
struct Pkg {
    code: crate::ssa::Code,
    interner: Interner,
    data: Vec<crate::ir::DataSet>,
    entries: Vec<(String, usize)>,
    schema_names: Vec<String>,
}

impl Pkg {
    fn from_loaded(pack: &LoadedPack) -> Self {
        Self {
            code: pack.code.clone(),
            interner: pack.interner.borrow().clone_for_host(),
            data: pack.program.data.clone(),
            entries: pack.program.entries.iter().map(|e| (e.name.clone(), e.fn_id)).collect(),
            schema_names: pack.program.schemas.iter().map(|s| s.name.clone()).collect(),
        }
    }

    fn entry(&self, name: &str) -> Option<usize> {
        self.entries.iter().find(|(n, _)| n == name).map(|(_, id)| *id)
    }
}

// `wasm32-unknown-unknown` is single-threaded and has no TLS, so `thread_local!` (a `std` macro) is
// unavailable. The handles are process-global instead, which matches the spec's model: a package
// handle binds to the instance (§10.2), and one wasm instance is one thread.
//
// `static mut` is avoided: each access goes through a `OnceCell`-style `RefCell` wrapper. The
// generated code never re-enters these accessors while one is borrowed.
mod state {
    use super::*;
    use core::cell::OnceCell;

    /// A process-global cell for a single-threaded target.
    ///
    /// `Sync` is claimed because `wasm32-unknown-unknown` has no threads: the ABI's contract is that
    /// a handle belongs to its instance (§10.2), so concurrent access cannot occur.
    pub struct Slot<T>(OnceCell<RefCell<T>>);

    unsafe impl<T> Sync for Slot<T> {}

    impl<T: Default> Slot<T> {
        pub const fn new() -> Self {
            Self(OnceCell::new())
        }
        pub fn with<R>(&self, f: impl FnOnce(&RefCell<T>) -> R) -> R {
            let cell = self.0.get_or_init(|| RefCell::new(T::default()));
            f(cell)
        }
    }
}

static PKGS: state::Slot<Vec<Option<Rc<Pkg>>>> = state::Slot::new();
static LAST: state::Slot<Vec<u8>> = state::Slot::new();

fn put_out(bytes: Vec<u8>) -> (*mut u8, usize) {
    let len = bytes.len();
    LAST.with(|l| {
        let mut slot = l.borrow_mut();
        *slot = bytes;
        (slot.as_mut_ptr(), len)
    })
}

fn err_json(code: &str, msg: &str) -> (*mut u8, usize) {
    let body = format!(
        "{{\"ok\":false,\"code\":{},\"error\":{}}}",
        crate::diag::json_str(code),
        crate::diag::json_str(msg)
    );
    put_out(body.into_bytes())
}

fn read_str(ptr: *const u8, len: usize) -> Option<String> {
    if ptr.is_null() || len == 0 {
        return Some(String::new());
    }
    // SAFETY: callers pass a pointer/length pair into the module's own memory, as the ABI requires.
    let bytes = unsafe { core::slice::from_raw_parts(ptr, len) };
    String::from_utf8(bytes.to_vec()).ok()
}

fn budget() -> Budget {
    Budget::default()
}

/// Load a package from raw `CodeImage` bytes. Returns a handle, or 0 on failure.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_pkg_load(bytes: *const u8, len: usize) -> u64 {
    if bytes.is_null() || len == 0 {
        return 0;
    }
    // SAFETY: length-checked read of the caller-provided image.
    let raw = unsafe { core::slice::from_raw_parts(bytes, len) };
    let Ok(img) = image::decode(raw) else { return 0 };
    // Rebuild the interner from the image's symbol table so ids line up with the code.
    let mut interner = Interner::new();
    for s in &img.code.syms {
        interner.intern(s);
    }
    let entries = img.code.entries.iter().map(|e| (e.name.clone(), e.fn_id as usize)).collect();
    let pkg = Pkg {
        schema_names: img.code.schemas.iter().map(|s| s.name.clone()).collect(),
        code: img.code,
        interner,
        data: Vec::new(),
        entries,
    };
    PKGS.with(|p| {
        let mut v = p.borrow_mut();
        v.push(Some(Rc::new(pkg)));
        v.len() as u64
    })
}

/// Attach a data set to a package (spec §4.2: data is separate from code, so a `CodeImage` alone is
/// not enough — the host binds data at load, exactly as `pack.toml` does at build time).
///
/// `rows` is a JSON array of records; the schema named by `schema` describes them.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_pkg_bind_data(
    handle: u64,
    set_name: *const u8,
    set_len: usize,
    rows: *const u8,
    rows_len: usize,
    key_field: *const u8,
    key_len: usize,
) -> i32 {
    let name = read_str(set_name, set_len).unwrap_or_default();
    let key = read_str(key_field, key_len).unwrap_or_default();
    let Some(text) = read_str(rows, rows_len) else { return 1 };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return 2 };
    let arr = match json {
        serde_json::Value::Array(a) => a,
        other => vec![other],
    };
    let r = PKGS.with(|p| {
        let mut v = p.borrow_mut();
        // Handles are 1-based indices; the slot holds an `Rc` so cloning it here is cheap.
        let Some(Some(pkg)) = v.get(handle.saturating_sub(1) as usize).cloned() else {
            return Err("invalid package handle".to_string());
        };
        // Build the rows using the package's own schema table, then rebuild the entry.
        let schema_name = pkg
            .code
            .schemas
            .iter()
            .find(|_| true)
            .map(|s| s.name.clone())
            .unwrap_or_default();
        let _ = schema_name;
        let mut rows_v = Vec::with_capacity(arr.len());
        let mut index = hashbrown::HashMap::new();
        let key_sym = if key.is_empty() { None } else { pkg.interner.find(&key) };
        for (i, j) in arr.iter().enumerate() {
            let v = convert_any(&pkg.interner, j);
            if let (Some(ks), true) = (key_sym, !key.is_empty()) {
                if let Value::Record(r) = &v {
                    if let Some(k) = r.get(ks) {
                        index.insert(k.hash(), i);
                    }
                }
            }
            rows_v.push(v);
        }
        let ds = crate::ir::DataSet {
            name: name.clone(),
            dataset: name.clone(),
            schema: String::new(),
            key: if key.is_empty() { None } else { Some(key.clone()) },
            key_sym,
            rows: alloc::rc::Rc::new(rows_v),
            version: 0,
            index,
        };
        // Replace the whole package: `data` is part of its identity for a call.
        let mut next = Pkg {
            code: pkg.code.clone(),
            interner: pkg.interner.clone_for_host(),
            data: pkg.data.clone(),
            entries: pkg.entries.clone(),
            schema_names: pkg.schema_names.clone(),
        };
        match next.data.iter().position(|d| d.name == name) {
            Some(i) => next.data[i] = ds,
            None => next.data.push(ds),
        }
        v[handle as usize - 1] = Some(alloc::rc::Rc::new(next));
        Ok(())
    });
    match r {
        Ok(()) => 0,
        Err(_) => 3,
    }
}

/// Host-side registration used by the native build (and by tests): wrap a loaded pack.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_pkg_from_loaded(pack: *const LoadedPack) -> u64 {
    if pack.is_null() {
        return 0;
    }
    // SAFETY: the caller keeps the pack alive for the duration of the call.
    let pack = unsafe { &*pack };
    let pkg = Rc::new(Pkg::from_loaded(pack));
    PKGS.with(|p| {
        let mut v = p.borrow_mut();
        v.push(Some(pkg));
        v.len() as u64
    })
}

fn with_pkg<T>(handle: u64, f: impl FnOnce(&Pkg) -> Result<T, String>) -> Result<T, String> {
    PKGS.with(|p| {
        let v = p.borrow();
        let slot = v
            .get(handle.saturating_sub(1) as usize)
            .and_then(|s| s.as_ref())
            .ok_or_else(|| "invalid package handle".to_string())?;
        f(slot)
    })
}

/// Metadata + entry list + schema names, as JSON.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_pkg_info(handle: u64, out_len: *mut usize) -> *mut u8 {
    let r = with_pkg(handle, |pkg| {
        let entries = pkg
            .entries
            .iter()
            .map(|(n, id)| format!("{{\"name\":{},\"fn\":{id}}}", crate::diag::json_str(n)))
            .collect::<Vec<_>>()
            .join(",");
        let schemas = pkg
            .schema_names
            .iter()
            .map(|s| crate::diag::json_str(s))
            .collect::<Vec<_>>()
            .join(",");
        Ok(format!(
            "{{\"entries\":[{entries}],\"schemas\":[{schemas}],\"fns\":{}}}",
            pkg.code.fns.len()
        ).to_string())
    });
    finish(r, out_len)
}

/// Wrap a result in the ABI envelope (spec §10.2: `{"ok":true,"result":…}` / `{"ok":false,…}`).
fn finish(r: Result<String, String>, out_len: *mut usize) -> *mut u8 {
    let (ptr, len) = match r {
        Ok(s) => put_out(format!("{{\"ok\":true,\"result\":{s}}}").into_bytes()),
        Err(e) => err_json("BHC-E510", &e),
    };
    if !out_len.is_null() {
        // SAFETY: the ABI documents `out_len` as a writable `usize` owned by the caller.
        unsafe { *out_len = len };
    }
    ptr
}

/// Call an entry by name. `args` is a JSON array of already-converted values.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_call(
    handle: u64,
    fn_name: *const u8,
    fn_len: usize,
    args: *const u8,
    args_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let name = read_str(fn_name, fn_len).unwrap_or_default();
    let args_json = read_str(args, args_len).unwrap_or_default();
    let r = with_pkg(handle, |pkg| {
        let fn_id = pkg.entry(&name).ok_or_else(|| format!("no entry `{name}`"))?;
        let parsed: serde_json::Value =
            serde_json::from_str(&args_json).map_err(|e| format!("invalid args JSON: {e}"))?;
        let items = match parsed {
            serde_json::Value::Array(a) => a,
            other => vec![other],
        };
        let interner = interner_with(&pkg.interner, &items);
        let vals = convert_args(pkg, &interner, fn_id, &items)?;
        let vm = Vm::new(&pkg.code, &interner, &pkg.data, budget());
        let d = vm.call(fn_id, vals).map_err(|e| e.to_string())?;
        let v = vm.project(d).map_err(|e| e.to_string())?;
        Ok(value_json(&interner, &v))
    });
    finish(r, out_len)
}

/// Bit-exact result for golden comparison (spec §10.2: `to_bits` never goes through JSON).
#[unsafe(no_mangle)]
pub extern "C" fn bhub_call_bits(
    handle: u64,
    fn_name: *const u8,
    fn_len: usize,
    args: *const u8,
    args_len: usize,
    out_bits: *mut u64,
) -> i32 {
    let name = read_str(fn_name, fn_len).unwrap_or_default();
    let args_json = read_str(args, args_len).unwrap_or_default();
    let r = with_pkg(handle, |pkg| {
        let fn_id = pkg.entry(&name).ok_or_else(|| format!("no entry `{name}`"))?;
        let parsed: serde_json::Value =
            serde_json::from_str(&args_json).map_err(|e| format!("invalid args JSON: {e}"))?;
        let items = match parsed {
            serde_json::Value::Array(a) => a,
            other => vec![other],
        };
        let interner = interner_with(&pkg.interner, &items);
        let vals = convert_args(pkg, &interner, fn_id, &items)?;
        let vm = Vm::new(&pkg.code, &interner, &pkg.data, budget());
        let d = vm.call(fn_id, vals).map_err(|e| e.to_string())?;
        let v = vm.project(d).map_err(|e| e.to_string())?;
        match v {
            Value::Num(n) => Ok(n.to_bits()),
            other => Err(format!("entry result is {}, not Num", other.type_name())),
        }
    });
    match r {
        Ok(bits) => {
            if !out_bits.is_null() {
                // SAFETY: `out_bits` is documented as a writable `u64`.
                unsafe { *out_bits = bits };
            }
            0
        }
        Err(_) => 1,
    }
}

/// Release a package handle.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_close(handle: u64) {
    PKGS.with(|p| {
        let mut v = p.borrow_mut();
        if let Some(slot) = v.get_mut(handle.saturating_sub(1) as usize) {
            *slot = None;
        }
    });
}

/// Intern every string reachable from a JSON payload, so `sym"..."` comparisons inside the pack see
/// the same ids the host sent. Returns a clone of the package interner extended with those symbols.
fn interner_with(interner: &Interner, items: &[serde_json::Value]) -> Interner {
    let mut out = interner.clone_for_host();
    fn walk(j: &serde_json::Value, out: &mut Interner) {
        match j {
            serde_json::Value::String(s) => {
                out.intern(s);
            }
            serde_json::Value::Array(a) => a.iter().for_each(|x| walk(x, out)),
            serde_json::Value::Object(o) => o.values().for_each(|x| walk(x, out)),
            _ => {}
        }
    }
    for j in items {
        walk(j, &mut out);
    }
    out
}

/// Convert JSON arguments using the entry's declared parameter types (spec §4.3: conversion happens
/// at the call boundary and errors carry a field path).
fn convert_args(
    pkg: &Pkg,
    interner: &Interner,
    fn_id: usize,
    items: &[serde_json::Value],
) -> Result<Vec<Value>, String> {
    let entry = pkg
        .code
        .entries
        .iter()
        .find(|e| e.fn_id as usize == fn_id)
        .ok_or_else(|| format!("no entry for fn{fn_id}"))?;
    if items.len() != entry.nparams as usize {
        return Err(format!("entry takes {} argument(s), got {}", entry.nparams, items.len()));
    }
    let mut out = Vec::with_capacity(items.len());
    for (i, j) in items.iter().enumerate() {
        let ty = entry.params.get(i).cloned().unwrap_or(crate::ssa::TyTag::Any);
        out.push(convert_typed(&pkg.code, interner, &ty, j, &format!("arg{i}"))?);
    }
    Ok(out)
}

fn convert_typed(
    code: &crate::ssa::Code,
    interner: &Interner,
    ty: &crate::ssa::TyTag,
    j: &serde_json::Value,
    ctx: &str,
) -> Result<Value, String> {
    use crate::ssa::TyTag;
    Ok(match (ty, j) {
        (_, serde_json::Value::Null) => Value::None,
        (TyTag::Num, serde_json::Value::Number(n)) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        (TyTag::Bool, serde_json::Value::Bool(b)) => Value::Bool(*b),
        (TyTag::Sym, serde_json::Value::String(s)) => Value::Sym(interner.find(s).unwrap_or(crate::sym::Sym(0))),
        (TyTag::Str, serde_json::Value::String(s)) => Value::Str(alloc::rc::Rc::from(s.as_str())),
        (TyTag::List(inner), serde_json::Value::Array(a)) => {
            let mut xs = Vec::with_capacity(a.len());
            for (i, x) in a.iter().enumerate() {
                xs.push(convert_typed(code, interner, inner, x, &format!("{ctx}[{i}]"))?);
            }
            Value::list(xs)
        }
        (TyTag::Option(inner), other) => Value::Some(alloc::boxed::Box::new(convert_typed(code, interner, inner, other, ctx)?)),
        (TyTag::Tuple(items), serde_json::Value::Array(a)) => {
            let mut xs = Vec::with_capacity(a.len());
            for (i, x) in a.iter().enumerate() {
                let t = items.get(i).cloned().unwrap_or(TyTag::Any);
                xs.push(convert_typed(code, interner, &t, x, &format!("{ctx}[{i}]"))?);
            }
            Value::tuple(xs)
        }
        (TyTag::Record(fields, open), serde_json::Value::Object(o)) => {
            let mut rec = crate::value::Record::new();
            for (k, v) in o {
                let fty = fields.iter().find(|(n, _)| n == k).map(|(_, t)| t.clone());
                let val = match fty {
                    Some(t) => convert_typed(code, interner, &t, v, &format!("{ctx}.{k}"))?,
                    None if *open => convert_any(interner, v),
                    None => return Err(format!("`{ctx}.{k}`: unknown field")),
                };
                rec.set(interner.find(k).unwrap_or(crate::sym::Sym(0)), val);
            }
            Value::record(rec)
        }
        (TyTag::Schema(name), other) => {
            let Some(schema) = code.schemas.iter().find(|s| &s.name == name) else {
                return Err(format!("`{ctx}`: images does not declare schema `{name}`"));
            };
            let serde_json::Value::Object(o) = other else {
                return Err(format!("`{ctx}`: expected an object for schema `{name}`"));
            };
            let mut rec = crate::value::Record::new();
            for (k, v) in o {
                let fty = schema.fields.iter().find(|(n, _)| n == k).map(|(_, t)| t.clone());
                let val = match fty {
                    Some(t) => convert_typed(code, interner, &t, v, &format!("{ctx}.{k}"))?,
                    None if schema.open => convert_any(interner, v),
                    None => return Err(format!("`{ctx}.{k}`: schema `{name}` has no such field")),
                };
                rec.set(interner.find(k).unwrap_or(crate::sym::Sym(0)), val);
            }
            Value::record(rec)
        }
        (TyTag::Any, other) => convert_any(interner, other),
        (want, got) => return Err(format!("`{ctx}`: expected {want:?}, got {got}")),
    })
}

/// Untyped structural conversion, used for open records.
fn convert_any(interner: &Interner, j: &serde_json::Value) -> Value {
    match j {
        serde_json::Value::Null => Value::None,
        serde_json::Value::Bool(b) => Value::Bool(*b),
        serde_json::Value::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        serde_json::Value::String(s) => Value::Sym(interner.find(s).unwrap_or(crate::sym::Sym(0))),
        serde_json::Value::Array(a) => Value::list(a.iter().map(|x| convert_any(interner, x)).collect()),
        serde_json::Value::Object(o) => {
            let mut rec = crate::value::Record::new();
            for (k, v) in o {
                rec.set(interner.find(k).unwrap_or(crate::sym::Sym(0)), convert_any(interner, v));
            }
            Value::record(rec)
        }
    }
}

#[allow(dead_code)]
fn json_to_value(interner: &Interner, j: &serde_json::Value) -> Value {
    match j {
        serde_json::Value::Null => Value::None,
        serde_json::Value::Bool(b) => Value::Bool(*b),
        serde_json::Value::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        serde_json::Value::String(s) => Value::Sym(interner.find(s).unwrap_or(crate::sym::Sym(0))),
        serde_json::Value::Array(a) => Value::list(a.iter().map(|x| json_to_value(interner, x)).collect()),
        serde_json::Value::Object(_) => Value::Unit,
    }
}

fn value_json(interner: &Interner, v: &Value) -> String {
    match v {
        Value::Num(n) => {
            if n.is_finite() {
                format!("{n:?}")
            } else {
                "null".to_string()
            }
        }
        Value::Bool(b) => b.to_string(),
        Value::Sym(s) => crate::diag::json_str(interner.name(*s)),
        Value::Str(s) => crate::diag::json_str(s),
        Value::Unit | Value::Missing | Value::None => "null".to_string(),
        Value::List(xs) | Value::Tuple(xs) => {
            format!("[{}]", xs.iter().map(|x| value_json(interner, x)).collect::<Vec<_>>().join(","))
        }
        Value::Record(r) => format!(
            "{{{}}}",
            r.fields
                .iter()
                .map(|(k, v)| format!("{}:{}", crate::diag::json_str(interner.name(*k)), value_json(interner, v)))
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Some(x) | Value::Ok(x) => value_json(interner, x),
        Value::Err(x) => format!("{{\"err\":{}}}", value_json(interner, x)),
        Value::Closure(_) | Value::Builtin(_) => "\"<fn>\"".to_string(),
    }
}

/// Numeric mode carried by the loaded image, for hosts that must refuse `numeric = "host"`.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_numeric_mode(bytes: *const u8, len: usize) -> i32 {
    if bytes.is_null() || len == 0 {
        return -1;
    }
    // SAFETY: length-checked read.
    let raw = unsafe { core::slice::from_raw_parts(bytes, len) };
    match image::decode(raw) {
        Ok(img) => match img.numeric {
            NumericMode::Libm => 0,
            NumericMode::Host => 1,
        },
        Err(_) => -1,
    }
}

/// Evaluate through the interpreter instead of the VM (used by `bhub_explain`).
#[unsafe(no_mangle)]
pub extern "C" fn bhub_explain(
    handle: u64,
    fn_name: *const u8,
    fn_len: usize,
    args: *const u8,
    args_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let name = read_str(fn_name, fn_len).unwrap_or_default();
    let args_json = read_str(args, args_len).unwrap_or_default();
    let r = with_pkg(handle, |pkg| {
        let fn_id = pkg.entry(&name).ok_or_else(|| format!("no entry `{name}`"))?;
        let parsed: serde_json::Value =
            serde_json::from_str(&args_json).map_err(|e| format!("invalid args JSON: {e}"))?;
        let items = match parsed {
            serde_json::Value::Array(a) => a,
            other => vec![other],
        };
        let interner = interner_with(&pkg.interner, &items);
        let vals = convert_args(pkg, &interner, fn_id, &items)?;
        let vm = Vm::new(&pkg.code, &interner, &pkg.data, budget()).with_explain();
        let d = vm.call(fn_id, vals).map_err(|e| e.to_string())?;
        let v = vm.project(d).map_err(|e| e.to_string())?;
        let steps = vm
            .explain_entries()
            .iter()
            .map(|e| {
                format!(
                    "{{\"depth\":{},\"call\":{},\"result\":{}}}",
                    e.depth,
                    crate::diag::json_str(&e.call),
                    crate::diag::json_str(&e.result)
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        Ok(format!("{{\"result\":{},\"explain\":[{steps}]}}", value_json(&pkg.interner, &v)))
    });
    finish(r, out_len)
}

/// Convert host JSON against a named schema (spec §10.2 `bhub_json_to_value`).
///
/// This is the same boundary conversion `bhub_call` applies to each argument, exposed standalone
/// so a host writes one call layer: validate a `Config` once, then pass the JSON to any entry.
/// Returns the converted value as JSON inside the usual envelope.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_json_to_value(
    handle: u64,
    schema_ptr: *const u8,
    schema_len: usize,
    json_ptr: *const u8,
    json_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let schema = read_str(schema_ptr, schema_len).unwrap_or_default();
    let text = read_str(json_ptr, json_len).unwrap_or_default();
    let r = with_pkg(handle, |pkg| {
        if schema.is_empty() {
            return Err("missing schema name".to_string());
        }
        let parsed: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("invalid JSON: {e}"))?;
        if !pkg.code.schemas.iter().any(|s| s.name == schema) {
            return Err(format!("unknown schema `{schema}`"));
        }
        let interner = interner_with(&pkg.interner, &[parsed.clone()]);
        let v = convert_typed(&pkg.code, &interner, &crate::ssa::TyTag::Schema(schema.clone()), &parsed, &schema)?;
        Ok(value_json(&interner, &v))
    });
    finish(r, out_len)
}

/// Probability expansion over the VM path (spec §10.2 `bhub_call_tree`, §9.8).
///
/// Same arguments as `bhub_call`, plus the support-set budget. The tree shares the VM evaluation
/// (spec §9.8.11: one evaluator, the tree is a projection), so `root.value` equals `bhub_call`.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_call_tree(
    handle: u64,
    fn_name: *const u8,
    fn_len: usize,
    args: *const u8,
    args_len: usize,
    max_support: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let name = read_str(fn_name, fn_len).unwrap_or_default();
    let args_json = read_str(args, args_len).unwrap_or_default();
    let r: Result<String, String> = with_pkg(handle, |pkg| {
        let fn_id = pkg.entry(&name).ok_or_else(|| format!("no entry `{name}`"))?;
        let parsed: serde_json::Value =
            serde_json::from_str(&args_json).map_err(|e| format!("invalid args JSON: {e}"))?;
        let items = match parsed {
            serde_json::Value::Array(a) => a,
            other => vec![other],
        };
        let interner = interner_with(&pkg.interner, &items);
        let vals = convert_args(pkg, &interner, fn_id, &items)?;
        let budget = Budget { max_support, ..budget() };
        let vm = Vm::new(&pkg.code, &interner, &pkg.data, budget);
        let d = vm.call(fn_id, vals).map_err(|e| e.to_string())?;
        let outcome = crate::tree::build_tree(&vm, d, &name).map_err(|e| e.to_string())?;
        fn node_json(n: &crate::tree::TreeNode) -> String {
            let value = if n.value.is_finite() { format!("{:?}", n.value) } else { "null".to_string() };
            let edge = if n.edge.is_finite() { format!("{:?}", n.edge) } else { "null".to_string() };
            let prob = if n.prob.is_finite() { format!("{:?}", n.prob) } else { "null".to_string() };
            format!(
                "{{\"label\":{},\"value\":{value},\"value_kind\":\"{}\",\"edge\":{edge},\"prob\":{prob},\"children\":[{}]}}",
                crate::diag::json_str(&n.label),
                n.value_kind,
                n.children.iter().map(node_json).collect::<Vec<_>>().join(",")
            )
        }
        Ok(format!(
            "{{\"ok\":true,\"mode\":\"tree\",\"max_support\":{max_support},\"truncated\":{},\"support\":{},\"root\":{}}}",
            outcome.truncated,
            outcome.support,
            node_json(&outcome.root)
        ))
    });
    match r {
        Ok(body) => {
            let (ptr, len) = put_out(body.into_bytes());
            if !out_len.is_null() {
                // SAFETY: the ABI documents `out_len` as a writable `usize` owned by the caller.
                unsafe { *out_len = len };
            }
            ptr
        }
        Err(e) => err_json("BHC-E510", &e).0,
    }
}

/// Time-series trace over the VM path (spec §10.2 `bhub_trace`, §9.9).
///
/// `fn` is the init entry, called with `args` to produce the initial `SimState`. The step and
/// probe entries plus the time grid come from `opts` (see `parse_trace_opts`); the evaluation
/// itself is `sim::run` on the VM, so cross-frame correlation (§9.9.7) holds exactly as in `sim`.
#[unsafe(no_mangle)]
pub extern "C" fn bhub_trace(
    handle: u64,
    fn_name: *const u8,
    fn_len: usize,
    args: *const u8,
    args_len: usize,
    opts_ptr: *const u8,
    opts_len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    let name = read_str(fn_name, fn_len).unwrap_or_default();
    let args_json = read_str(args, args_len).unwrap_or_default();
    let opts_json = read_str(opts_ptr, opts_len).unwrap_or_default();
    let r: Result<String, String> = with_pkg(handle, |pkg| {
        let fn_id = pkg.entry(&name).ok_or_else(|| format!("no entry `{name}`"))?;
        let parsed: serde_json::Value =
            serde_json::from_str(&args_json).map_err(|e| format!("invalid args JSON: {e}"))?;
        let items = match parsed {
            serde_json::Value::Array(a) => a,
            other => vec![other],
        };
        let (opts, step_name, probe_name, horizon, dt) = parse_trace_opts(&opts_json)?;
        let interner = interner_with(&pkg.interner, &items);
        let vals = convert_args(pkg, &interner, fn_id, &items)?;
        let budget = Budget { max_support: opts.max_support, ..budget() };
        let vm = Vm::new(&pkg.code, &interner, &pkg.data, budget);
        let init = vm.project(vm.call(fn_id, vals.clone()).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let step_id = pkg.entry(&step_name).ok_or_else(|| format!("no step entry `{step_name}` (opts.step)"))?;
        let step_params = pkg.code.entries.iter().find(|e| e.fn_id as usize == step_id).map(|e| e.nparams as usize).unwrap_or(0);
        let step_args = if step_params == vals.len() {
            vals
        } else if step_params == 0 {
            Vec::new()
        } else {
            return Err(format!("step entry `{step_name}` takes {step_params} argument(s), got {}", vals.len()));
        };
        let step_fn = vm.project(vm.call(step_id, step_args).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let probe_id = pkg.entry(&probe_name).ok_or_else(|| format!("no probe entry `{probe_name}` (opts.probe)"))?;
        let probe_fn = crate::sim::value_of_entry(&vm, probe_id);
        let steps = crate::sim::grid(0.0, horizon, dt);
        let result = crate::sim::run(&vm, &init, &steps, &step_fn, &probe_fn, &opts).map_err(|e| e.to_string())?;
        Ok(crate::sim::to_json(&vm, &result, &opts))
    });
    match r {
        Ok(body) => {
            let (ptr, len) = put_out(body.into_bytes());
            if !out_len.is_null() {
                // SAFETY: the ABI documents `out_len` as a writable `usize` owned by the caller.
                unsafe { *out_len = len };
            }
            ptr
        }
        Err(e) => err_json("BHC-E510", &e).0,
    }
}

/// Trace options for `bhub_trace`: the spec §10.2 keys plus the entry/grid keys the single-`fn`
/// C form needs (`step`/`probe` name the pack entries, `horizon`/`dt` build the grid per §9.9.13).
fn parse_trace_opts(text: &str) -> Result<(crate::sim::TraceOptions, String, String, f64, f64), String> {
    let mut opts = crate::sim::TraceOptions::default();
    let mut step = "step".to_string();
    let mut probe = "probe".to_string();
    let mut horizon = 3.0;
    let mut dt = 1.0;
    let text = text.trim();
    if text.is_empty() {
        return Ok((opts, step, probe, horizon, dt));
    }
    let v: serde_json::Value = serde_json::from_str(text).map_err(|e| format!("invalid opts JSON: {e}"))?;
    let get = |k: &str| v.get(k);
    match get("mode").and_then(|m| m.as_str()).unwrap_or("expect") {
        "expect" => opts.mode = crate::sim::TraceMode::Expect,
        "trace" | "trace_tree" => opts.mode = crate::sim::TraceMode::Trace,
        other => return Err(format!("unknown trace mode `{other}` (expected expect/trace/trace_tree)")),
    }
    if let Some(n) = get("max_support").and_then(|n| n.as_u64()) {
        opts.max_support = n as usize;
    }
    if let Some(b) = get("split").and_then(|b| b.as_bool()) {
        opts.split = b;
    }
    if let Some(q) = get("quantile").and_then(|q| q.as_f64()) {
        opts.quantile = q;
    }
    if let Some(states) = get("states").and_then(|s| s.as_array()) {
        opts.states = states.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).collect();
    }
    if let Some(s) = get("step").and_then(|s| s.as_str()) {
        step = s.to_string();
    }
    if let Some(p) = get("probe").and_then(|p| p.as_str()) {
        probe = p.to_string();
    }
    if let Some(h) = get("horizon").and_then(|h| h.as_f64()) {
        horizon = h;
    }
    if let Some(d) = get("dt").and_then(|d| d.as_f64()) {
        dt = d;
    }
    Ok((opts, step, probe, horizon, dt))
}


