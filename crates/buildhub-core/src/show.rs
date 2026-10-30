//! Value rendering. Kept in one place so every executor and CLI flag prints identically.

use alloc::{format, string::{String, ToString}, vec::Vec};
use crate::sym::Interner;
use crate::value::Value;

pub fn render(interner: &Interner, v: &Value) -> String {
    match v {
        Value::Num(n) => num(*n),
        Value::Bool(b) => b.to_string(),
        Value::Sym(s) => interner.name(*s).to_string(),
        Value::Unit => "()".to_string(),
        Value::Str(s) => s.to_string(),
        Value::List(xs) | Value::Tuple(xs) => {
            let (open, close) = if matches!(v, Value::List(_)) { ("[", "]") } else { ("(", ")") };
            let body: Vec<String> = xs.iter().map(|x| render(interner, x)).collect();
            format!("{open}{}{close}", body.join(", "))
        }
        Value::Record(r) => {
            let body: Vec<String> = r
                .fields
                .iter()
                .map(|(k, val)| format!("{}: {}", interner.name(*k), render(interner, val)))
                .collect();
            format!("{{{}}}", body.join(", "))
        }
        Value::Closure(c) => format!("<fn#{fn}>", fn = c.fn_id),
        Value::Builtin(b) => format!("<builtin#{b}>"),
        Value::Some(x) => format!("some({})", render(interner, x)),
        Value::None => "none".to_string(),
        Value::Ok(x) => format!("ok({})", render(interner, x)),
        Value::Err(x) => format!("err({})", render(interner, x)),
        Value::Missing => "<missing>".to_string(),
    }
}

pub fn num(n: f64) -> String {
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
