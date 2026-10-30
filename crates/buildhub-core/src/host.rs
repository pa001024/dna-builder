//! JSON -> `Value` conversion driven by the flattened schema table in `Code` (spec §4.2).
//!
//! A host that only receives the artifact has no source and no type checker; the schema table is
//! the only description of the shapes a pack expects. `Option` wrapping is semantically load
//! bearing: `match x { some(v) => ..., _ => ... }` must see `Some` for a present optional field.
//! A shape mismatch degrades to the structural conversion instead of failing the load.

use alloc::boxed::Box;
use alloc::rc::Rc;
use alloc::string::String;
use alloc::vec::Vec;
use crate::ssa::{SchemaCode, TyTag};
use crate::sym::Interner;
use crate::value::{Record, Value};

/// One `[[data]]` set: `rows` is the JSON array, `schema` names the record shape (if any).
pub fn convert_set(
    interner: &mut Interner,
    rows: &serde_json::Value,
    schema: Option<&SchemaCode>,
    schemas: &[SchemaCode],
) -> Vec<Value> {
    match rows {
        serde_json::Value::Array(a) => a
            .iter()
            .map(|r| match schema {
                Some(s) => convert_record(interner, r, s, schemas),
                None => convert_any(interner, r, schemas),
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn convert_record(
    interner: &mut Interner,
    j: &serde_json::Value,
    s: &SchemaCode,
    schemas: &[SchemaCode],
) -> Value {
    match j {
        serde_json::Value::Object(o) => {
            let mut rec = Record::new();
            for (k, v) in o {
                let sym = interner.intern(k);
                let val = match s.fields.iter().find(|(n, _)| n == k) {
                    Some((_, ty)) => convert(interner, v, ty, schemas),
                    None => convert_any(interner, v, schemas),
                };
                rec.set(sym, val);
            }
            Value::record(rec)
        }
        other => convert_any(interner, other, schemas),
    }
}

pub fn convert(
    interner: &mut Interner,
    j: &serde_json::Value,
    ty: &TyTag,
    schemas: &[SchemaCode],
) -> Value {
    use serde_json::Value as J;
    match ty {
        TyTag::Num => match j {
            J::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
            J::Null => Value::None,
            _ => convert_any(interner, j, schemas),
        },
        TyTag::Bool => match j {
            J::Bool(b) => Value::Bool(*b),
            J::Null => Value::None,
            _ => convert_any(interner, j, schemas),
        },
        TyTag::Sym => match j {
            J::String(s) => Value::Sym(interner.intern(s)),
            J::Null => Value::None,
            _ => convert_any(interner, j, schemas),
        },
        TyTag::Str => match j {
            J::String(s) => Value::Str(Rc::from(s.as_str())),
            J::Null => Value::None,
            _ => convert_any(interner, j, schemas),
        },
        TyTag::Unit => Value::Unit,
        TyTag::List(inner) => match j {
            J::Array(a) => Value::list(a.iter().map(|x| convert(interner, x, inner, schemas)).collect()),
            J::Null => Value::None,
            _ => convert_any(interner, j, schemas),
        },
        TyTag::Option(inner) => {
            if j.is_null() {
                Value::None
            } else {
                Value::Some(Box::new(convert(interner, j, inner, schemas)))
            }
        }
        TyTag::Tuple(items) => match j {
            J::Array(a) => {
                let mut out = Vec::with_capacity(a.len());
                for (i, x) in a.iter().enumerate() {
                    let t = items.get(i).or(items.last());
                    out.push(match t {
                        Some(t) => convert(interner, x, t, schemas),
                        None => convert_any(interner, x, schemas),
                    });
                }
                Value::tuple(out)
            }
            J::Null => Value::None,
            _ => convert_any(interner, j, schemas),
        },
        TyTag::Record(fields, _) => match j {
            J::Object(_) => {
                let sc = SchemaCode {
                    name: String::new(),
                    fields: fields.clone(),
                    open: true,
                };
                convert_record(interner, j, &sc, schemas)
            }
            J::Null => Value::None,
            _ => convert_any(interner, j, schemas),
        },
        TyTag::Schema(name) => match schemas.iter().find(|s| s.name == *name) {
            Some(s) => convert_record(interner, j, s, schemas),
            // `Named("Option")` without an argument: a bare optional field.
            None if name == "Option" => {
                if j.is_null() {
                    Value::None
                } else {
                    Value::Some(Box::new(convert_any(interner, j, schemas)))
                }
            }
            None => convert_any(interner, j, schemas),
        },
        TyTag::Any => convert_any(interner, j, schemas),
    }
}

/// Structural conversion with no type information (the shape-preserving fallback).
pub fn convert_any(interner: &mut Interner, j: &serde_json::Value, schemas: &[SchemaCode]) -> Value {
    use serde_json::Value as J;
    match j {
        // An absent optional field is `None`, not `Missing`: pack code matches on `some(v)`.
        J::Null => Value::None,
        J::Bool(b) => Value::Bool(*b),
        J::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        J::String(s) => Value::Sym(interner.intern(s)),
        J::Array(a) => Value::list(a.iter().map(|x| convert_any(interner, x, schemas)).collect()),
        J::Object(o) => {
            let mut r = Record::new();
            for (k, v) in o {
                let sym = interner.intern(k);
                r.set(sym, convert_any(interner, v, schemas));
            }
            Value::record(r)
        }
    }
}
