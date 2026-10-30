//! Pack loading: `pack.toml`, modules, data sets, schema validation, and entry lookup
//! (spec §4.1–§4.4).

use alloc::{boxed::Box, format, string::{String, ToString}, vec, vec::Vec};

// The loader is the only module that touches the filesystem (spec §4.2 reads `pack.toml` at build
// time). It is `std`-gated, so a `no_std` kernel build never links these paths.
extern crate std;
use hashbrown::HashMap;
use std::eprintln;
use std::path::{Path, PathBuf};

use alloc::rc::Rc;

use crate::ast::TypeExpr;
use crate::diag::{Diag, DResult, Pos};
use crate::ir::*;
use crate::resolve::{Lowerer, SourceFile};
use crate::sym::{Interner, Sym};
use crate::value::{Record, Value};

#[derive(Clone, Debug)]
pub struct PackConfig {
    pub id: String,
    pub version: String,
    pub engine: Option<String>,
    pub numeric: Option<String>,
    pub schema_check: SchemaCheck,
    pub data: Vec<DataDecl>,
    pub entries: Vec<EntryDecl>,
    pub dimensions: Option<Dimensions>,
    pub capabilities: Vec<String>,
    pub dir: PathBuf,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SchemaCheck {
    Strict,
    Open,
    Warn,
}

#[derive(Clone, Debug)]
pub struct DataDecl {
    pub name: String,
    pub dataset: String,
    pub schema: String,
    pub key: Option<String>,
    pub index: bool,
}

#[derive(Clone, Debug)]
pub struct EntryDecl {
    pub name: String,
    pub func: String,
    pub args: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct Dimensions {
    pub names: Vec<String>,
    pub partition: bool,
}

#[derive(Debug)]
pub struct LoadedPack {
    pub config: PackConfig,
    /// Linear bytecode for path B (spec §9.5), built alongside the tree form.
    pub code: crate::ssa::Code,
    /// Interner is append-only and shared with host-side JSON conversion, hence the cell.
    pub interner: std::cell::RefCell<Interner>,
    pub program: Program,
}

fn toml_str(t: &toml::Value, k: &str) -> Option<String> {
    t.get(k).and_then(|v| v.as_str()).map(|s| s.to_string())
}

pub fn read_config(dir: &Path) -> DResult<PackConfig> {
    let path = dir.join("pack.toml");
    let text = std::fs::read_to_string(&path)
        .map_err(|e| Diag::new("BHC-E200", path.display().to_string(), Pos::new(1, 1), e.to_string()))?;
    let val: toml::Value = text
        .parse()
        .map_err(|e: toml::de::Error| Diag::new("BHC-E201", path.display().to_string(), Pos::new(1, 1), e.to_string()))?;
    let file = path.display().to_string();
    let schema_check = match toml_str(&val, "schema_check").as_deref() {
        None | Some("open") => SchemaCheck::Open,
        Some("strict") => SchemaCheck::Strict,
        Some("warn") => SchemaCheck::Warn,
        Some(other) => {
            return Err(Diag::new(
                "BHC-E202",
                file,
                Pos::new(1, 1),
                format!("unknown schema_check `{other}` (expected strict/open/warn)"),
            ))
        }
    };
    let mut data = Vec::new();
    if let Some(arr) = val.get("data").and_then(|v| v.as_array()) {
        for d in arr {
            let name = toml_str(d, "name")
                .ok_or_else(|| Diag::new("BHC-E203", file.clone(), Pos::new(1, 1), "[[data]] requires `name`"))?;
            let dataset = toml_str(d, "dataset").ok_or_else(|| {
                Diag::new("BHC-E203", file.clone(), Pos::new(1, 1), format!("[[data]] `{name}` requires `dataset`"))
            })?;
            let schema = toml_str(d, "schema").ok_or_else(|| {
                Diag::new("BHC-E203", file.clone(), Pos::new(1, 1), format!("[[data]] `{name}` requires `schema`"))
            })?;
            let key = toml_str(d, "key");
            let index = d.get("index").and_then(|v| v.as_bool()).unwrap_or(key.is_some());
            data.push(DataDecl { name, dataset, schema, key, index });
        }
    }
    let mut entries = Vec::new();
    if let Some(arr) = val.get("entries").and_then(|v| v.as_array()) {
        for e in arr {
            let name = toml_str(e, "name")
                .ok_or_else(|| Diag::new("BHC-E204", file.clone(), Pos::new(1, 1), "[[entries]] requires `name`"))?;
            let func = toml_str(e, "fn").unwrap_or_else(|| name.clone());
            let args = e
                .get("args")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();
            entries.push(EntryDecl { name, func, args });
        }
    }
    let dimensions = val.get("dimensions").map(|d| {
        let names = d
            .get("names")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
        let partition = d.get("partition").and_then(|v| v.as_bool()).unwrap_or(false);
        Dimensions { names, partition }
    });
    let capabilities = val
        .get("capabilities")
        .and_then(|c| c.get("host"))
        .and_then(|h| h.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();
    Ok(PackConfig {
        id: toml_str(&val, "id").unwrap_or_else(|| "unnamed".to_string()),
        version: toml_str(&val, "version").unwrap_or_else(|| "0.0.0".to_string()),
        engine: toml_str(&val, "engine"),
        numeric: toml_str(&val, "numeric"),
        schema_check,
        data,
        entries,
        dimensions,
        capabilities,
        dir: dir.to_path_buf(),
    })
}

fn collect_sources(dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    let mut entries: Vec<PathBuf> = std::fs::read_dir(dir)?.filter_map(|e| e.ok()).map(|e| e.path()).collect();
    entries.sort();
    for p in entries {
        if p.is_dir() {
            collect_sources(&p, out)?;
        } else if p.extension().and_then(|e| e.to_str()) == Some("bhl") {
            out.push(p);
        }
    }
    Ok(())
}

/// Load a pack from disk: parse `pack.toml`, read every `.bhl` under the pack root, bind data.
pub fn load_pack(dir: &Path) -> DResult<LoadedPack> {
    let config = read_config(dir)?;
    let mut files = Vec::new();
    collect_sources(dir, &mut files)
        .map_err(|e| Diag::new("BHC-E205", dir.display().to_string(), Pos::new(1, 1), e.to_string()))?;
    let mut sources = Vec::with_capacity(files.len());
    for f in &files {
        let rel = f.strip_prefix(dir).unwrap_or(f).to_string_lossy().replace('\\', "/");
        let src = std::fs::read_to_string(f)
            .map_err(|e| Diag::new("BHC-E205", rel.clone(), Pos::new(1, 1), e.to_string()))?;
        sources.push(SourceFile { path: rel, src });
    }
    let mut interner = Interner::new();
    // Deterministic symbol ids: seed with the fixed inventory the checker relies on.
    interner.seed(crate::prelude::RESERVED_SYMBOLS.iter().copied());
    let data_names: Vec<String> = config.data.iter().map(|d| d.name.clone()).collect();
    let mut lw = Lowerer::new_with_data(sources, interner, data_names)?;
    lw.program.capabilities = config.capabilities.clone();
    bind_data(&mut lw, &config)?;
    bind_entries(&mut lw, &config)?;
    // Emitting the bytecode here means `check` also proves lowering, and both paths are always in
    // sync (G5: one front end, two emitters).
    let code = crate::ssa::lower(&lw.program, &lw.interner)?;
    Ok(LoadedPack {
        config,
        interner: std::cell::RefCell::new(lw.interner),
        program: lw.program,
        code,
    })
}

fn bind_entries(lw: &mut Lowerer, config: &PackConfig) -> DResult<()> {
    for e in &config.entries {
        // An entry names a top-level function in any module.
        let found = lw
            .program
            .fns
            .iter()
            .position(|f| f.name == e.func && !f.name.starts_with('<'));
        let fn_id = match found {
            Some(i) => i,
            None => {
                return Err(Diag::new(
                    "BHC-E206",
                    config.dir.join("pack.toml").display().to_string(),
                    Pos::new(1, 1),
                    format!("[[entries]] `{}` refers to unknown function `{}`", e.name, e.func),
                ))
            }
        };
        let nparams = lw.program.fns[fn_id].nparams;
        if !e.args.is_empty() && e.args.len() != nparams {
            return Err(Diag::new(
                "BHC-E207",
                config.dir.join("pack.toml").display().to_string(),
                Pos::new(1, 1),
                format!(
                    "[[entries]] `{}` declares {} arg(s) but `{}` takes {nparams}",
                    e.name,
                    e.args.len(),
                    e.func
                ),
            ));
        }
        lw.program.entries.push(Entry { name: e.name.clone(), fn_id, args: e.args.clone() });
    }
    Ok(())
}

fn bind_data(lw: &mut Lowerer, config: &PackConfig) -> DResult<()> {
    for d in &config.data {
        let schema_id = match lw.program.schemas.iter().position(|s| s.name == d.schema) {
            Some(i) => i,
            None => {
                return Err(Diag::new(
                    "BHC-E208",
                    config.dir.join("pack.toml").display().to_string(),
                    Pos::new(1, 1),
                    format!("[[data]] `{}` refers to unknown schema `{}`", d.name, d.schema),
                ))
            }
        };
        // `dataset` 是相对 pack 目录的文件路径;`#<模块键>` 选择文件内的模块
        // （上游 datapack 把多个模块放在同一个 JSON 对象里）。
        let (file, module) = match d.dataset.split_once('#') {
            Some((f, m)) => (f, Some(m)),
            None => (d.dataset.as_str(), None),
        };
        let path = config.dir.join(file);
        let text = std::fs::read_to_string(&path).map_err(|e| {
            Diag::new("BHC-E209", path.display().to_string(), Pos::new(1, 1), format!("cannot read dataset: {e}"))
        })?;
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
            Diag::new("BHC-E210", path.display().to_string(), Pos::new(1, 1), format!("invalid JSON: {e}"))
        })?;
        let json = match module {
            Some(m) => json.get(m).cloned().ok_or_else(|| {
                Diag::new(
                    "BHC-E218",
                    path.display().to_string(),
                    Pos::new(1, 1),
                    format!("dataset module `{m}` not found in `{}`", d.dataset),
                )
            })?,
            None => json,
        };
        let rows_json = match json {
            serde_json::Value::Array(a) => a,
            other => vec![other],
        };
        let key_sym = d.key.as_ref().map(|k| lw.interner.intern(k));
        let mut rows = Vec::with_capacity(rows_json.len());
        let mut index = HashMap::new();
        for (i, r) in rows_json.into_iter().enumerate() {
            let v = json_to_value(&mut lw.interner, &r, schema_id, &lw.program, config, &path, i)?;
            if d.index {
                if let Some(ks) = key_sym {
                    let key = match &v {
                        Value::Record(rec) => rec.get(ks).cloned(),
                        _ => None,
                    };
                    match key {
                        Some(k) => {
                            index.insert(k.hash(), i);
                        }
                        None => {
                            if config.schema_check == SchemaCheck::Strict {
                                return Err(Diag::new(
                                    "BHC-E211",
                                    path.display().to_string(),
                                    Pos::new(1, 1),
                                    format!("record #{i} lacks key field `{}`", d.key.as_deref().unwrap_or("")),
                                ));
                            }
                        }
                    }
                } else {
                    index.insert(Value::Num(i as f64).hash(), i);
                }
            }
            rows.push(v);
        }
        let version = crate::hash::hash_bytes(text.as_bytes());
        let slot = match lw.program.data.iter().position(|s| s.name == d.name) {
            Some(i) => i,
            None => {
                return Err(Diag::new(
                    "BHC-E216",
                    config.dir.join("pack.toml").display().to_string(),
                    Pos::new(1, 1),
                    format!("[[data]] `{}` was not registered before lowering", d.name),
                ))
            }
        };
        lw.program.data[slot] = DataSet {
            name: d.name.clone(),
            dataset: d.dataset.clone(),
            schema: d.schema.clone(),
            key: d.key.clone(),
            key_sym,
            rows: Rc::new(rows),
            version,
            index,
        };
    }
    Ok(())
}

fn json_to_value(
    interner: &mut Interner,
    j: &serde_json::Value,
    schema_id: usize,
    prog: &Program,
    config: &PackConfig,
    path: &Path,
    row: usize,
) -> DResult<Value> {
    let schema = &prog.schemas[schema_id];
    let cx = Conv { prog, config, path, row };
    convert(interner, j, schema_id, &cx, schema.name.as_str())
}

/// Shared context for one data-conversion pass (keeps the recursive signatures short).
struct Conv<'a> {
    prog: &'a Program,
    config: &'a PackConfig,
    path: &'a Path,
    row: usize,
}

fn convert(
    interner: &mut Interner,
    j: &serde_json::Value,
    schema_id: usize,
    cx: &Conv<'_>,
    ctx: &str,
) -> DResult<Value> {
    let prog = cx.prog;
    let config = cx.config;
    let path = cx.path;
    let row = cx.row;
    Ok(match j {
        serde_json::Value::Null => Value::None,
        serde_json::Value::Bool(b) => Value::Bool(*b),
        serde_json::Value::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        serde_json::Value::String(s) => {
            // Strings in data are symbols when the target type says so; otherwise text. Since JSON
            // carries no type, strings become `Sym` unless they are only ever shown. Both are
            // accepted by `show`; `Sym` is the comparable one (spec §3.1: "需要比较的用 Sym").
            Value::Sym(interner.intern(s))
        }
        serde_json::Value::Array(a) => {
            let mut out = Vec::with_capacity(a.len());
            for (i, x) in a.iter().enumerate() {
                out.push(convert(interner, x, schema_id, cx, &format!("{ctx}[{i}]"))?);
            }
            Value::list(out)
        }
        serde_json::Value::Object(o) => {
            let schema = &prog.schemas[schema_id];
            let mut rec = Record::new();
            rec.schema = Some(schema_id as u32);
            for (k, v) in o {
                let sym = interner.intern(k);
                let _ = &sym;
                let declared = schema.syms.iter().find(|(s, _)| *s == sym);
                let val = match declared {
                    Some((_, ty)) => convert_typed(interner, v, ty, cx, &format!("{ctx}.{k}"))?,
                    None => {
                        if schema.open {
                            json_scalar(interner, v, cx, &format!("{ctx}.{k}"))?
                        } else {
                            match config.schema_check {
                                SchemaCheck::Strict => {
                                    return Err(Diag::new(
                                        "BHC-E212",
                                        path.display().to_string(),
                                        Pos::new((row + 1) as u32, 1),
                                        format!("record #{row}: schema `{}` has no field `{k}`", schema.name),
                                    ))
                                }
                                SchemaCheck::Warn => eprintln!(
                                    "warning: {}: record #{row}: schema `{}` has no field `{k}`",
                                    path.display(),
                                    schema.name
                                ),
                                SchemaCheck::Open => {}
                            }
                            json_scalar(interner, v, cx, &format!("{ctx}.{k}"))?
                        }
                    }
                };
                rec.set(sym, val);
            }
            if config.schema_check == SchemaCheck::Strict {
                for (name, _) in &schema.fields {
                    if rec.get(interner.find(name).unwrap_or(Sym(u32::MAX))).is_none() {
                        return Err(Diag::new(
                            "BHC-E213",
                            path.display().to_string(),
                            Pos::new((row + 1) as u32, 1),
                            format!("record #{row}: schema `{}` requires field `{name}`", schema.name),
                        ));
                    }
                }
            }
            Value::record(rec)
        }
    })
}

fn json_scalar(interner: &mut Interner, j: &serde_json::Value, cx: &Conv<'_>, ctx: &str) -> DResult<Value> {
    // `cx` is threaded purely so recursive calls stay uniform; only its row is read here.
    let _ = cx.prog;
    // Untyped fallback: structural conversion with no schema.
    Ok(match j {
        serde_json::Value::Null => Value::None,
        serde_json::Value::Bool(b) => Value::Bool(*b),
        serde_json::Value::Number(n) => Value::Num(n.as_f64().unwrap_or(f64::NAN)),
        serde_json::Value::String(s) => Value::Sym(interner.intern(s)),
        serde_json::Value::Array(a) => {
            let mut out = Vec::with_capacity(a.len());
            for (i, x) in a.iter().enumerate() {
                out.push(json_scalar(interner, x, cx, &format!("{ctx}[{i}]"))?);
            }
            Value::list(out)
        }
        serde_json::Value::Object(o) => {
            let mut rec = Record::new();
            for (k, v) in o {
                let sym = interner.intern(k);
                let val = json_scalar(interner, v, cx, &format!("{ctx}.{k}"))?;
                rec.set(sym, val);
            }
            Value::record(rec)
        }
    })
}

fn convert_typed(
    interner: &mut Interner,
    j: &serde_json::Value,
    ty: &TypeExpr,
    cx: &Conv<'_>,
    ctx: &str,
) -> DResult<Value> {
    let prog = cx.prog;
    let path = cx.path;
    let row = cx.row;
    let _ = &path;
    match ty {
        TypeExpr::Num => match j {
            serde_json::Value::Number(n) => Ok(Value::Num(n.as_f64().unwrap_or(f64::NAN))),
            serde_json::Value::Null => Ok(Value::None),
            _ => type_err(path, row, ctx, "Num"),
        },
        TypeExpr::Bool => match j {
            serde_json::Value::Bool(b) => Ok(Value::Bool(*b)),
            serde_json::Value::Null => Ok(Value::None),
            _ => type_err(path, row, ctx, "Bool"),
        },
        TypeExpr::Sym => match j {
            serde_json::Value::String(s) => Ok(Value::Sym(interner.intern(s))),
            serde_json::Value::Null => Ok(Value::None),
            _ => type_err(path, row, ctx, "Sym"),
        },
        TypeExpr::Str => match j {
            serde_json::Value::String(s) => Ok(Value::Str(Rc::from(s.as_str()))),
            serde_json::Value::Null => Ok(Value::None),
            _ => type_err(path, row, ctx, "Str"),
        },
        TypeExpr::List(inner) => match j {
            serde_json::Value::Array(a) => {
                let mut out = Vec::with_capacity(a.len());
                for (i, x) in a.iter().enumerate() {
                    out.push(convert_typed(interner, x, inner, cx, &format!("{ctx}[{i}]"))?);
                }
                Ok(Value::list(out))
            }
            serde_json::Value::Null => Ok(Value::None),
            _ => type_err(path, row, ctx, "List"),
        },
        TypeExpr::Tuple(items) => match j {
            serde_json::Value::Array(a) => {
                let mut out = Vec::with_capacity(a.len());
                for (i, x) in a.iter().enumerate() {
                    let item_ty = items.get(i).or(items.last()).cloned().unwrap_or(TypeExpr::Num);
                    out.push(convert_typed(interner, x, &item_ty, cx, &format!("{ctx}[{i}]"))?);
                }
                Ok(Value::tuple(out))
            }
            serde_json::Value::Null => Ok(Value::None),
            _ => type_err(path, row, ctx, "Tuple"),
        },
        TypeExpr::Record { fields, .. } => match j {
            serde_json::Value::Object(o) => {
                let mut rec = Record::new();
                for (k, v) in o {
                    let sym = interner.intern(k);
                    let val = match fields.iter().find(|(n, _)| n == k) {
                        Some((_, ty)) => {
                            convert_typed(interner, v, ty, cx, &format!("{ctx}.{k}"))?
                        }
                        None => json_scalar(interner, v, cx, &format!("{ctx}.{k}"))?,
                    };
                    rec.set(sym, val);
                }
                Ok(Value::record(rec))
            }
            serde_json::Value::Null => Ok(Value::None),
            _ => type_err(path, row, ctx, "Record"),
        },
        TypeExpr::Named(name) => match prog.schemas.iter().position(|s| s.name == *name) {
            Some(sid) => convert(interner, j, sid, cx, ctx),
            None => {
                if name == "Option" {
                    // `Option<T>` 必须包成 `Some`，否则 `match ... { some(x) => ... }` 永不命中。
                    return Ok(if j.is_null() {
                        Value::None
                    } else {
                        Value::Some(Box::new(json_scalar(interner, j, cx, ctx)?))
                    });
                }
                json_scalar(interner, j, cx, ctx)
            }
        },
        TypeExpr::Generic(name, args) => {
            if name == "Option" {
                return Ok(if j.is_null() {
                    Value::None
                } else {
                    let inner = match args.first() {
                        Some(t) => convert_typed(interner, j, t, cx, ctx)?,
                        None => json_scalar(interner, j, cx, ctx)?,
                    };
                    Value::Some(Box::new(inner))
                });
            }
            if name == "List" {
                if let Some(t) = args.first() {
                    return convert_typed(interner, j, &TypeExpr::List(Box::new(t.clone())), cx, ctx);
                }
            }
            json_scalar(interner, j, cx, ctx)
        }
        TypeExpr::Unit => Ok(Value::Unit),
        TypeExpr::Fn(..) => Ok(Value::Unit),
        TypeExpr::Var(_) => json_scalar(interner, j, cx, ctx),
    }
}

fn type_err<T>(path: &Path, row: usize, ctx: &str, want: &str) -> DResult<T> {
    Err(Diag::new(
        "BHC-E214",
        path.display().to_string(),
        Pos::new((row + 1) as u32, 1),
        format!("`{ctx}`: expected {want}"),
    ))
}

impl LoadedPack {
    /// Serialize this pack's bytecode into a `CodeImage` (path B artifact).
    pub fn to_image(&self, numeric: crate::image::NumericMode) -> Vec<u8> {
        crate::image::encode(&self.code, numeric)
    }

    /// Interpret through the bytecode VM instead of the tree walk.
    pub fn call_bc(
        &self,
        entry: &str,
        args: Vec<Value>,
        budget: crate::eval::Budget,
    ) -> Result<Value, String> {
        let e = self.entry(entry).ok_or_else(|| format!("no entry `{entry}`"))?;
        let interner = self.interner.borrow();
        let vm = crate::vm::Vm::new(&self.code, &interner, &self.program.data, budget);
        let d = vm.call(e.fn_id, args).map_err(|e| e.to_string())?;
        vm.project(d).map_err(|e| e.to_string())
    }

    pub fn entry(&self, name: &str) -> Option<&Entry> {
        self.program.entries.iter().find(|e| e.name == name)
    }

    pub fn schema_id(&self, name: &str) -> Option<usize> {
        self.program.schemas.iter().position(|s| s.name == name)
    }

    /// Convert host JSON against a schema held in the program, without needing a `pack.toml`.
    /// Used by the C ABI (path B), which only has the decoded image.
    pub fn json_to_schema(&self, schema: &str, json: &serde_json::Value) -> DResult<Value> {
        let sid = self
            .schema_id(schema)
            .ok_or_else(|| Diag::new("BHC-E215", "pack".to_string(), Pos::new(1, 1), format!("unknown schema `{schema}`")))?;
        let config = &self.config;
        let path = config.dir.join("<host>");
        let mut interner = self.interner.borrow_mut();
        let cx = Conv { prog: &self.program, config, path: &path, row: 0 };
        convert(&mut interner, json, sid, &cx, schema)
    }

    /// Convert host JSON using a declared parameter type, so `List<DotSpec>` and friends work.
    pub fn json_to_typed(&self, ty: &crate::ast::TypeExpr, json: &serde_json::Value) -> DResult<Value> {
        let config = &self.config;
        let path = config.dir.join("<host>");
        let mut interner = self.interner.borrow_mut();
        let cx = Conv { prog: &self.program, config, path: &path, row: 0 };
        convert_typed(&mut interner, json, ty, &cx, "<host>")
    }

    /// Convert host JSON into a value validated against the named schema (spec §4.3).
    pub fn json_to_value(&self, schema: &str, json: &serde_json::Value) -> DResult<Value> {
        let sid = self.schema_id(schema).ok_or_else(|| {
            Diag::new("BHC-E215", "pack".to_string(), Pos::new(1, 1), format!("unknown schema `{schema}`"))
        })?;
        let config = &self.config;
        let path = config.dir.join("<host>");
        // Release the borrow before any nested call: `convert` may recurse through schemas that
        // themselves need the interner.
        let mut interner = self.interner.borrow_mut();
        let cx = Conv { prog: &self.program, config, path: &path, row: 0 };
        convert(&mut interner, json, sid, &cx, schema)
    }
}
