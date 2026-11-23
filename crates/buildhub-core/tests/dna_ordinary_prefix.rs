//! BHL dna pack：`普通近战/远程` 键注册与作用域判定（U17b）。
//!
//! pack 的普通面板没有独立入口，这里按函数名直接调用两个纯函数：
//! - `ordinary_prefixed_key(scope, key)`：普通面板键映射（同律不追加）；
//! - `buff_scope_ok(key, scope)`：裸键与 `普通*` 键都只在自己的武器作用域计入。
//!
//! 面板数值口径不在此断言：pack 没有真同律面板、`独立增伤` 仍加算，见 `README.md`。

use std::path::Path;

use buildhub_core::eval::{Budget, Interp};
use buildhub_core::pack::{LoadedPack, load_pack};
use buildhub_core::sym::Interner;
use buildhub_core::value::Value;

fn dna_pack() -> Option<LoadedPack> {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("packs/dna");
    if !dir.join("pack.toml").exists() {
        return None;
    }
    Some(load_pack(&dir).expect("load dna pack"))
}

/// 取带参数个数校验的函数 id（pack 不一定把纯函数导出为 entry）。
fn fn_id(pack: &LoadedPack, name: &str, nparams: usize) -> Option<usize> {
    pack.program
        .fns
        .iter()
        .position(|f| f.name == name && f.nparams == nparams)
}

fn call_one(interp: &Interp<'_>, fn_id: usize, args: Vec<Value>) -> Value {
    let dist = interp.call(fn_id, args).expect("call");
    interp.project(dist).expect("project")
}

fn sym(interner: &Interner, name: &str) -> Value {
    Value::Sym(
        interner
            .find(name)
            .unwrap_or_else(|| panic!("pack 未登记符号 {name}")),
    )
}

fn sym_name<'a>(interner: &'a Interner, value: &Value) -> &'a str {
    match value {
        Value::Sym(s) => interner.name(*s),
        other => panic!("期望 Sym，实际 {}", other.type_name()),
    }
}

#[test]
fn bhl_ordinary_key_mapping() {
    let Some(pack) = dna_pack() else { return };
    let Some(id) = fn_id(&pack, "ordinary_prefixed_key", 2) else {
        panic!("pack 缺少 ordinary_prefixed_key");
    };
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let cases = [
        ("近战", "攻击", "普通近战攻击"),
        ("近战", "独立增伤", "普通近战独立增伤"),
        ("近战", "装填", "普通近战装填"),
        ("远程", "武器倍率", "普通远程武器倍率"),
        ("远程", "触发", "普通远程触发"),
        // 同律面板不追加普通前缀
        ("同律", "攻击", "攻击"),
        // 非面板键原样返回
        ("近战", "充盈转化", "充盈转化"),
    ];
    for (scope, key, want) in cases {
        let got = call_one(&interp, id, vec![sym(&interner, scope), sym(&interner, key)]);
        assert_eq!(sym_name(&interner, &got), want, "{scope}/{key}");
    }
}

#[test]
fn bhl_ordinary_key_scope() {
    let Some(pack) = dna_pack() else { return };
    let Some(id) = fn_id(&pack, "buff_scope_ok", 2) else {
        panic!("pack 缺少 buff_scope_ok");
    };
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let cases = [
        // 普通键只在自己的武器作用域计入
        ("普通近战攻击", "近战", true),
        ("普通近战攻击", "同律", false),
        ("普通近战攻击", "角色", false),
        ("普通远程装填", "远程", true),
        ("普通远程装填", "近战", false),
        // 裸前缀（含 12 类 base）语义不变
        ("近战攻击", "近战", true),
        ("近战攻击", "同律", false),
        ("近战武器倍率", "近战", true),
        ("近战武器倍率", "角色", false),
    ];
    for (key, scope, want) in cases {
        let got = call_one(&interp, id, vec![sym(&interner, key), sym(&interner, scope)]);
        match got {
            Value::Bool(actual) => assert_eq!(actual, want, "{key} in {scope}"),
            other => panic!("{key}/{scope}: 期望 Bool，实际 {}", other.type_name()),
        }
    }
}
