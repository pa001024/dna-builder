//! Module loading, import resolution, and AST → IR lowering.
//!
//! Lowering resolves every name, function id, slot and symbol once, so evaluation performs no
//! string lookups (spec §4.2: "编译期固定，无运行期字符串查找").

use alloc::{boxed::Box, format, string::{String, ToString}, vec, vec::Vec};
use alloc::collections::BTreeSet;
use hashbrown::{HashMap, HashSet};
use alloc::rc::Rc;

use crate::ast::*;
use crate::diag::{Diag, DResult, Pos};
use crate::ir::*;
use crate::sym::{Interner, Sym};
use crate::value::Value;

pub struct SourceFile {
    pub path: String,
    pub src: String,
}

pub struct LoadedModule {
    pub name: Option<String>,
    pub path: String,
    pub ast: Module,
    pub import_by_alias: HashMap<String, usize>,
}

pub struct Lowerer {
    pub modules: Vec<LoadedModule>,
    pub program: Program,
    pub interner: Interner,
    fn_index: HashMap<(usize, String), usize>,
    const_index: HashMap<(usize, String), usize>,
    const_ast: Vec<(usize, String, Expr, String, Pos)>,
    const_values: Vec<Option<Value>>,
    schema_index: HashMap<String, usize>,
    /// Function bodies already lowered (guards against duplicate work).
    lowered: HashSet<usize>,
}

struct FnCtx {
    module: usize,
    slots: Vec<(String, u32)>,
    next_slot: u32,
    file: String,
    /// Position of the enclosing declaration; used when a sub-expression has no span of its own.
    pos: Pos,
    /// Lowering nesting depth: a bound on recursion so a pathological source is a diagnostic, not a
    /// stack overflow (spec §3.2, §6.3).
    depth: u32,
}

/// Same bound as the parser; lowering recurses over the same shape.
const MAX_LOWER_DEPTH: u32 = 512;

impl FnCtx {
    fn bind(&mut self, name: &str) -> u32 {
        let s = self.next_slot;
        self.next_slot += 1;
        self.slots.push((name.to_string(), s));
        s
    }

    fn lookup(&self, name: &str) -> Option<u32> {
        self.slots.iter().rev().find(|(n, _)| n == name).map(|(_, s)| *s)
    }

    /// Name-scope marker: slot ids are never reused, so restoring only pops the name table.
    fn span(&self) -> usize {
        self.slots.len()
    }

    fn restore(&mut self, span: usize) {
        self.slots.truncate(span);
    }
}

impl Lowerer {
    pub fn new(files: Vec<SourceFile>, interner: Interner) -> DResult<Self> {
        Self::new_with_data(files, interner, Vec::new())
    }

    /// `data_names` must list every `[[data]] name` in `pack.toml`, in declaration order, so that
    /// `data.<name>.<access>()` resolves to a fixed slot at compile time (spec §4.2).
    pub fn new_with_data(
        files: Vec<SourceFile>,
        interner: Interner,
        data_names: Vec<String>,
    ) -> DResult<Self> {
        let mut modules = Vec::new();
        for f in &files {
            let ast = crate::parser::parse_module(&f.src, &f.path)?;
            modules.push(LoadedModule { name: ast.name.clone(), path: f.path.clone(), ast, import_by_alias: HashMap::new() });
        }
        let by_path: HashMap<String, usize> = modules.iter().enumerate().map(|(i, m)| (normalize(&m.path), i)).collect();
        // Resolve every module's imports against the path table (imports may not be circular).
        let decls: Vec<(usize, Vec<crate::ast::ImportDecl>)> =
            modules.iter().enumerate().map(|(i, m)| (i, m.ast.imports.clone())).collect();
        for (i, decls) in decls {
            for d in decls {
                let key = normalize(&d.path);
                let target = match by_path.get(&key) {
                    Some(t) => *t,
                    None => {
                        return Err(Diag::new(
                            "BHC-E110",
                            modules[i].path.clone(),
                            d.pos,
                            format!("cannot resolve import `{}`", d.path),
                        ))
                    }
                };
                if modules[i].import_by_alias.insert(d.alias.clone(), target).is_some() {
                    return Err(Diag::new(
                        "BHC-E114",
                        modules[i].path.clone(),
                        d.pos,
                        format!("duplicate import alias `{}`", d.alias),
                    ));
                }
            }
        }
        detect_import_cycles(&modules)?;
        let mut lw = Self {
            modules,
            program: Program::default(),
            interner,
            fn_index: HashMap::new(),
            const_index: HashMap::new(),
            const_ast: Vec::new(),
            const_values: Vec::new(),
            schema_index: HashMap::new(),
            lowered: HashSet::new(),
        };
        lw.program.data = data_names
            .into_iter()
            .map(|n| DataSet {
                name: n,
                dataset: String::new(),
                schema: String::new(),
                key: None,
                key_sym: None,
                rows: Rc::new(Vec::new()),
                version: 0,
                index: HashMap::new(),
            })
            .collect();
        lw.collect()?;
        Ok(lw)
    }

    fn collect(&mut self) -> DResult<()> {
        for mi in 0..self.modules.len() {
            let path = self.modules[mi].path.clone();
            let mname = self.modules[mi].name.clone().unwrap_or_else(|| path.clone());
            self.program.module_names.push(mname);
            for s in self.modules[mi].ast.schemas.clone() {
                if self.schema_index.contains_key(&s.name) {
                    return Err(Diag::new("BHC-E112", path.clone(), s.pos, format!("duplicate schema `{}`", s.name)));
                }
                let id = self.program.schemas.len();
                self.schema_index.insert(s.name.clone(), id);
                let syms = s.fields.iter().map(|(n, t)| (self.interner.intern(n), t.clone())).collect();
                self.program.schemas.push(SchemaDef {
                    name: s.name,
                    fields: s.fields,
                    open: s.open,
                    module: mi,
                    pos: s.pos,
                    file: path.clone(),
                    syms,
                });
            }
            for f in self.modules[mi].ast.fns.clone() {
                if self.fn_index.contains_key(&(mi, f.name.clone())) {
                    return Err(Diag::new("BHC-E112", path.clone(), f.pos, format!("duplicate function `{}`", f.name)));
                }
                let id = self.program.fns.len();
                self.fn_index.insert((mi, f.name.clone()), id);
                self.program.fns.push(FnDef {
                    name: f.name,
                    module: mi,
                    nparams: f.params.len(),
                    ncaptures: 0,
                    nslots: 0,
                    body: R::Const(Value::Unit),
                    pos: f.pos,
                    file: path.clone(),
                    param_types: f
                        .params
                        .iter()
                        .map(|p| match p {
                            Param::Named { ty, .. } => ty.clone(),
                            Param::Pattern(_) => None,
                        })
                        .collect(),
                    ret: f.ret.clone(),
                    type_params: f.type_params.clone(),
                });
            }
            for c in self.modules[mi].ast.consts.clone() {
                if self.const_index.contains_key(&(mi, c.name.clone())) {
                    return Err(Diag::new("BHC-E112", path.clone(), c.pos, format!("duplicate const `{}`", c.name)));
                }
                let id = self.const_values.len();
                self.const_index.insert((mi, c.name.clone()), id);
                self.const_values.push(None);
                self.const_ast.push((mi, c.name.clone(), c.value, path.clone(), c.pos));
            }
        }
        // Module top-level `fn` declarations must not shadow builtins in a confusing way.
        let total = self.program.fns.len();
        for id in 0..total {
            self.ensure_fn(id)?;
        }
        for id in 0..self.const_ast.len() {
            self.ensure_const(id)?;
        }
        let consts = self.const_values.iter().cloned().map(|v| v.unwrap_or(Value::Unit)).collect();
        self.program.consts = consts;
        self.program.fn_index = self.fn_index.clone();
        Ok(())
    }

    fn ensure_fn(&mut self, fn_id: usize) -> DResult<()> {
        if !self.lowered.insert(fn_id) {
            return Ok(());
        }
        let (module, file, decl) = {
            let def = &self.program.fns[fn_id];
            let m = &self.modules[def.module];
            let decl = m.ast.fns.iter().find(|f| f.name == def.name).cloned();
            (def.module, def.file.clone(), decl)
        };
        let Some(decl) = decl else { return Ok(()) };
        let mut ctx = FnCtx { module, slots: Vec::new(), next_slot: 0, file: file.clone(), pos: self.program.fns[fn_id].pos, depth: 0 };
        let prologue = self.bind_params(&decl.params, &mut ctx);
        let body = match &decl.body {
            FnBody::Expr(e) | FnBody::Block(e) => e,
        };
        let r = self.lower_expr(body, &mut ctx)?;
        let r = self.wrap_params(prologue, r);
        let def = &mut self.program.fns[fn_id];
        def.body = r;
        def.nslots = ctx.next_slot;
        Ok(())
    }

    fn ensure_const(&mut self, id: usize) -> DResult<()> {
        if self.const_values[id].is_some() {
            return Ok(());
        }
        let (mi, _name, expr, _file, pos) = self.const_ast[id].clone();
        let file = self.const_ast[id].3.clone();
        let mut ctx = FnCtx { module: mi, slots: Vec::new(), next_slot: 0, file: file.clone(), pos, depth: 0 };
        let r = self.lower_expr(&expr, &mut ctx)?;
        // Const initialisers may not smuggle in closures: the value is evaluated at load time
        // and closures would capture a frame that no longer exists.
        if contains_local(&r) {
            return Err(Diag::new("BHC-E115", file, pos, "const initialiser must be a constant expression"));
        }
        let val = crate::eval::eval_const(&self.program, &r, &file)?;
        self.const_values[id] = Some(val);
        Ok(())
    }

    /// Bind parameters into slots.
    ///
    /// Named parameters bind directly. A pattern parameter occupies one hidden slot and its
    /// bindings are allocated **before** the body is lowered (so the body sees them); the returned
    /// prologue lets the caller wrap the body in `LetPat` nodes that do the actual destructuring
    /// once, at entry.
    fn bind_params(&mut self, params: &[Param], ctx: &mut FnCtx) -> Vec<(Pattern, u32)> {
        let mut prologue = Vec::new();
        for p in params {
            match p {
                Param::Named { name, .. } => {
                    ctx.bind(name);
                }
                Param::Pattern(pat) => {
                    let slot = ctx.bind("$param");
                    let prepared = self.prepare_pattern(pat, ctx);
                    prologue.push((prepared, slot));
                }
            }
        }
        prologue
    }

    /// `let prepared_pat = $param in body`
    fn wrap_params(&mut self, prologue: Vec<(Pattern, u32)>, body: R) -> R {
        let mut out = body;
        for (pat, slot) in prologue.into_iter().rev() {
            out = R::LetPat { pat, value: Box::new(R::Local(slot)), body: Box::new(out) };
        }
        out
    }

    fn ensure_lambda(&mut self, fn_id: usize, l: &Lambda, capture_names: Vec<String>) -> DResult<()> {
        if !self.lowered.insert(fn_id) {
            return Ok(());
        }
        let module = self.program.fns[fn_id].module;
        let file = self.program.fns[fn_id].file.clone();
        let mut ctx = FnCtx { module, slots: Vec::new(), next_slot: 0, file: file.clone(), pos: self.program.fns[fn_id].pos, depth: 0 };
        for c in &capture_names {
            ctx.bind(c);
        }
        let prologue = self.bind_params(&l.params, &mut ctx);
        let r = self.lower_expr(&l.body, &mut ctx)?;
        let r = self.wrap_params(prologue, r);
        let def = &mut self.program.fns[fn_id];
        def.body = r;
        def.nslots = ctx.next_slot;
        def.ncaptures = capture_names.len();
        Ok(())
    }

    fn module_of(&self, mi: usize, alias: &str) -> Option<usize> {
        self.modules[mi].import_by_alias.get(alias).copied()
    }

    fn fn_lookup(&self, mi: usize, name: &str) -> Option<usize> {
        self.fn_index.get(&(mi, name.to_string())).copied()
    }

    fn const_lookup(&self, mi: usize, name: &str) -> Option<usize> {
        self.const_index.get(&(mi, name.to_string())).copied()
    }

    fn lower_expr(&mut self, e: &Expr, ctx: &mut FnCtx) -> DResult<R> {
        let file = ctx.file.clone();
        self.lower_expr_p(e, ctx, &file)
    }

    fn lower_expr_p(&mut self, e: &Expr, ctx: &mut FnCtx, file: &str) -> DResult<R> {
        if ctx.depth >= MAX_LOWER_DEPTH {
            return Err(Diag::new(
                "BHC-E118",
                file,
                ctx.pos,
                format!("expression nesting exceeds {MAX_LOWER_DEPTH} levels"),
            ));
        }
        ctx.depth += 1;
        let out = self.lower_expr_inner(e, ctx, file);
        ctx.depth -= 1;
        out
    }

    fn lower_expr_inner(&mut self, e: &Expr, ctx: &mut FnCtx, file: &str) -> DResult<R> {
        Ok(match e {
            Expr::Num(n) => R::Const(Value::Num(*n)),
            Expr::Bool(b) => R::Const(Value::Bool(*b)),
            Expr::Sym(s) => {
                let sym = self.interner.intern(s);
                R::Const(Value::Sym(sym))
            }
            Expr::Str(s) => R::Const(Value::Str(Rc::from(s.as_str()))),
            Expr::Unit => R::Const(Value::Unit),
            Expr::Var(name) => self.lower_var(name, ctx, file)?,
            Expr::List(items) => {
                let mut out = Vec::with_capacity(items.len());
                for x in items {
                    out.push(self.lower_expr_p(x, ctx, file)?);
                }
                R::List(out)
            }
            Expr::Tuple(items) => {
                let mut out = Vec::with_capacity(items.len());
                for x in items {
                    out.push(self.lower_expr_p(x, ctx, file)?);
                }
                R::Tuple(out)
            }
            Expr::Record(fields) => R::Record {
                schema: None,
                fields: self.lower_fields(fields, ctx, file)?,
            },
            Expr::SchemaLit { schema, fields } => {
                let sid = match self.schema_index.get(schema) {
                    Some(s) => *s,
                    None => return Err(Diag::new("BHC-E120", file, ctx.pos, format!("unknown schema `{schema}`"))),
                };
                let declared: Vec<String> = self.program.schemas[sid].fields.iter().map(|(n, _)| n.clone()).collect();
                for (k, _) in fields {
                    if !declared.iter().any(|d| d == k) {
                        return Err(Diag::new(
                            "BHC-E121",
                            file,
                            ctx.pos,
                            format!("schema `{schema}` has no field `{k}`"),
                        ));
                    }
                }
                if !self.program.schemas[sid].open {
                    for d in &declared {
                        if !fields.iter().any(|(k, _)| k == d) {
                            return Err(Diag::new(
                                "BHC-E122",
                                file,
                                ctx.pos,
                                format!("schema literal `{schema}` is missing field `{d}`"),
                            ));
                        }
                    }
                }
                R::Record { schema: Some(sid), fields: self.lower_fields(fields, ctx, file)? }
            }
            Expr::Field { base, name } => R::Field {
                base: Box::new(self.lower_expr_p(base, ctx, file)?),
                name: self.interner.intern(name),
            },
            Expr::Index { base, idx } => R::Index {
                base: Box::new(self.lower_expr_p(base, ctx, file)?),
                idx: Box::new(self.lower_expr_p(idx, ctx, file)?),
            },
            Expr::Call { callee, args } => self.lower_call(callee, args, ctx, file)?,
            Expr::Lambda(l) => self.lower_lambda(l, ctx, file)?,
            Expr::If { cond, then, els } => R::If {
                cond: Box::new(self.lower_expr_p(cond, ctx, file)?),
                then: Box::new(self.lower_expr_p(then, ctx, file)?),
                els: Box::new(self.lower_expr_p(els, ctx, file)?),
            },
            Expr::Match { scrut, arms } => {
                let s = self.lower_expr_p(scrut, ctx, file)?;
                let mut out = Vec::with_capacity(arms.len());
                for a in arms {
                    let span = ctx.span();
                    let pat = self.prepare_pattern(&a.pat, ctx);
                    let guard = match &a.guard {
                        Some(g) => Some(self.lower_expr_p(g, ctx, file)?),
                        None => None,
                    };
                    let body = self.lower_expr_p(&a.body, ctx, file)?;
                    ctx.restore(span);
                    out.push(RArm { pat, guard, body });
                }
                R::Match { scrut: Box::new(s), arms: out }
            }
            Expr::Let { pat, value, body } => {
                let v = self.lower_expr_p(value, ctx, file)?;
                let span = ctx.span();
                let pat = self.prepare_pattern(pat, ctx);
                let b = self.lower_expr_p(body, ctx, file)?;
                ctx.restore(span);
                R::LetPat { pat, value: Box::new(v), body: Box::new(b) }
            }
            Expr::Unary { op, expr } => R::Unary { op: *op, expr: Box::new(self.lower_expr_p(expr, ctx, file)?) },
            Expr::Binary { op, lhs, rhs } => R::Binary {
                op: *op,
                lhs: Box::new(self.lower_expr_p(lhs, ctx, file)?),
                rhs: Box::new(self.lower_expr_p(rhs, ctx, file)?),
            },
            Expr::Pipe { value, func } => match func.as_ref() {
                Expr::Call { callee, args } => {
                    let mut all: Vec<Expr> = vec![value.as_ref().clone()];
                    all.extend(args.iter().cloned());
                    self.lower_call(callee, &all, ctx, file)?
                }
                other => self.lower_call(other, core::slice::from_ref(value.as_ref()), ctx, file)?,
            },
        })
    }

    fn lower_fields(&mut self, fields: &[(String, Expr)], ctx: &mut FnCtx, file: &str) -> DResult<Vec<(Sym, R)>> {
        let mut out = Vec::with_capacity(fields.len());
        for (k, v) in fields {
            let sym = self.interner.intern(k);
            out.push((sym, self.lower_expr_p(v, ctx, file)?));
        }
        Ok(out)
    }

    /// Allocate slots for a pattern's bindings by rewriting it into slot-bearing names.
    fn prepare_pattern(&mut self, pat: &Pattern, ctx: &mut FnCtx) -> Pattern {
        match pat {
            Pattern::Bind(n) => {
                let slot = ctx.bind(n);
                Pattern::Bind(format!("\u{0}{slot}\u{0}{n}"))
            }
            Pattern::Tuple(ps) => Pattern::Tuple(ps.iter().map(|p| self.prepare_pattern(p, ctx)).collect()),
            Pattern::Record(fs) => Pattern::Record(
                fs.iter().map(|(k, p)| (k.clone(), self.prepare_pattern(p, ctx))).collect(),
            ),
            Pattern::Sym(_) | Pattern::Num(_) | Pattern::Wild | Pattern::None => pat.clone(),
            Pattern::Some(p) => Pattern::Some(Box::new(self.prepare_pattern(p, ctx))),
            Pattern::Ok(p) => Pattern::Ok(Box::new(self.prepare_pattern(p, ctx))),
            Pattern::Err(p) => Pattern::Err(Box::new(self.prepare_pattern(p, ctx))),
        }
    }

    fn lower_var(&mut self, name: &str, ctx: &mut FnCtx, file: &str) -> DResult<R> {
        if let Some(slot) = ctx.lookup(name) {
            return Ok(R::Local(slot));
        }
        if name == "none" {
            return Ok(R::None);
        }
        if name == "inf" {
            return Ok(R::Const(Value::Num(f64::INFINITY)));
        }
        if name == "nan" {
            return Ok(R::Const(Value::Num(crate::value::canon(f64::NAN))));
        }
        if let Some(cid) = self.const_lookup(ctx.module, name) {
            self.ensure_const(cid)?;
            return Ok(R::Const(self.const_values[cid].clone().unwrap_or(Value::Unit)));
        }
        if let Some(fid) = self.fn_lookup(ctx.module, name) {
            self.ensure_fn(fid)?;
            // A bare top-level function used as a value becomes a zero-capture closure.
            return Ok(R::Closure { fn_id: fid, captures: Vec::new() });
        }
        if let Some(b) = Builtin::from_name(name) {
            if b.arity() == 0 {
                return Ok(R::Const(Value::Num(match b {
                    Builtin::Inf => f64::INFINITY,
                    _ => crate::value::canon(f64::NAN),
                })));
            }
            let id = register_builtin(&mut self.program, b);
            return Ok(R::Const(Value::Builtin(id)));
        }
        if let Some(m) = self.modules[ctx.module].import_by_alias.get(name).copied() {
            let _ = m;
            return Err(Diag::new("BHC-E116", file, ctx.pos, format!("module `{name}` is not a value")));
        }
        Err(Diag::new("BHC-E123", file, ctx.pos, format!("unknown name `{name}`")))
    }

    fn lower_lambda(&mut self, l: &Lambda, ctx: &mut FnCtx, file: &str) -> DResult<R> {
        let mut free = BTreeSet::new();
        let mut bound: HashSet<String> = HashSet::new();
        for p in &l.params {
            match p {
                Param::Named { name, .. } => {
                    bound.insert(name.clone());
                }
                Param::Pattern(pat) => collect_pattern(pat, &mut bound),
            }
        }
        collect_free(&l.body, &mut bound, &mut free);
        let mut capture_names = Vec::new();
        let mut captures = Vec::new();
        for n in free {
            if let Some(slot) = ctx.lookup(&n) {
                capture_names.push(n.clone());
                captures.push(R::Local(slot));
            }
        }
        let fid = self.program.fns.len();
        self.program.fns.push(FnDef {
            name: format!("<lambda@{fid}>"),
            module: ctx.module,
            nparams: l.params.len(),
            ncaptures: capture_names.len(),
            nslots: 0,
            body: R::Const(Value::Unit),
            pos: ctx.pos,
            file: file.to_string(),
            param_types: l
                .params
                .iter()
                .map(|p| match p {
                    Param::Named { ty, .. } => ty.clone(),
                    Param::Pattern(_) => None,
                })
                .collect(),
            ret: None,
            type_params: Vec::new(),
        });
        self.ensure_lambda(fid, l, capture_names.clone())?;
        Ok(R::Closure { fn_id: fid, captures })
    }

    fn lower_call(&mut self, callee: &Expr, args: &[Expr], ctx: &mut FnCtx, file: &str) -> DResult<R> {
        if let Some(r) = self.try_lower_data(callee, args, ctx, file)? {
            return Ok(r);
        }
        if let Some(r) = self.try_lower_host(callee, args, ctx, file)? {
            return Ok(r);
        }
        if let Some(r) = self.try_lower_update(callee, args, ctx, file)? {
            return Ok(r);
        }
        // `alias.fn(...)`
        if let Expr::Field { base, name } = callee {
            if let Expr::Var(alias) = base.as_ref() {
                if let Some(m) = self.module_of(ctx.module, alias) {
                    if let Some(fid) = self.fn_lookup(m, name) {
                        self.ensure_fn(fid)?;
                        let a = self.lower_exprs(args, ctx, file)?;
                        return self.static_call(fid, a, file);
                    }
                    if self.const_lookup(m, name).is_some() {
                        return Err(Diag::new(
                            "BHC-E124",
                            file,
                            ctx.pos,
                            format!("`{alias}.{name}` is a const, not a function"),
                        ));
                    }
                    return Err(Diag::new(
                        "BHC-E125",
                        file,
                        ctx.pos,
                        format!("module `{alias}` has no function `{name}`"),
                    ));
                }
            }
        }
        if let Expr::Var(name) = callee {
            if ctx.lookup(name).is_none() {
                if matches!(name.as_str(), "some" | "ok" | "err") && args.len() == 1 {
                    let a = self.lower_expr_p(&args[0], ctx, file)?;
                    return Ok(match name.as_str() {
                        "some" => R::Some(Box::new(a)),
                        "ok" => R::Ok(Box::new(a)),
                        _ => R::Err(Box::new(a)),
                    });
                }
                if let Some(b) = Builtin::from_name(name) {
                    if b.arity() > 0 {
                        let a = self.lower_exprs(args, ctx, file)?;
                        if a.len() != b.arity() {
                            return Err(Diag::new(
                                "BHC-E126",
                                file,
                                ctx.pos,
                                format!("`{name}` expects {} argument(s), got {}", b.arity(), a.len()),
                            ));
                        }
                        return match b {
                            Builtin::Choice => self.lower_choice(&args[0], ctx, file),
                            Builtin::Expected => Ok(R::Expected(Box::new(a.into_iter().next().unwrap()))),
                            _ => Ok(R::Builtin { b, args: a }),
                        };
                    }
                }
                if let Some(fid) = self.fn_lookup(ctx.module, name) {
                    self.ensure_fn(fid)?;
                    let a = self.lower_exprs(args, ctx, file)?;
                    return self.static_call(fid, a, file);
                }
            }
        }
        let callee_r = self.lower_expr_p(callee, ctx, file)?;
        let a = self.lower_exprs(args, ctx, file)?;
        Ok(R::CallValue { callee: Box::new(callee_r), args: a })
    }

    fn lower_exprs(&mut self, args: &[Expr], ctx: &mut FnCtx, file: &str) -> DResult<Vec<R>> {
        let mut out = Vec::with_capacity(args.len());
        for a in args {
            out.push(self.lower_expr_p(a, ctx, file)?);
        }
        Ok(out)
    }

    fn static_call(&self, fid: usize, args: Vec<R>, file: &str) -> DResult<R> {
        let def = &self.program.fns[fid];
        if args.len() != def.nparams {
            return Err(Diag::new(
                "BHC-E126",
                file.to_string(),
                def.pos,
                format!("`{}` expects {} argument(s), got {}", def.name, def.nparams, args.len()),
            ));
        }
        Ok(R::CallStatic { fn_id: fid, args })
    }

    fn lower_choice(&mut self, arg: &Expr, ctx: &mut FnCtx, file: &str) -> DResult<R> {
        let Expr::List(items) = arg else {
            return Err(Diag::new("BHC-E127", file, ctx.pos, "`choice` expects a list literal of cases"));
        };
        let mut cases = Vec::with_capacity(items.len());
        for item in items {
            match item {
                Expr::Tuple(parts) if parts.len() == 2 => {
                    let weight = self.lower_expr_p(&parts[0], ctx, file)?;
                    let value = self.lower_expr_p(&parts[1], ctx, file)?;
                    cases.push(ChoiceCase { weight, label: None, value });
                }
                Expr::Tuple(parts) if parts.len() == 3 => {
                    let weight = self.lower_expr_p(&parts[0], ctx, file)?;
                    let label = match &parts[1] {
                        Expr::Sym(s) | Expr::Str(s) => Some(self.interner.intern(s)),
                        _ => {
                            return Err(Diag::new(
                                "BHC-E128",
                                file,
                                ctx.pos,
                                "choice case label must be a symbol literal (`named\"...\"`)",
                            ))
                        }
                    };
                    let value = self.lower_expr_p(&parts[2], ctx, file)?;
                    cases.push(ChoiceCase { weight, label, value });
                }
                _ => {
                    return Err(Diag::new(
                        "BHC-E129",
                        file,
                        ctx.pos,
                        "choice case must be `(weight, value)` or `(weight, label, value)`",
                    ))
                }
            }
        }
        if cases.is_empty() {
            return Err(Diag::new("BHC-E130", file, ctx.pos, "`choice` requires at least one case"));
        }
        Ok(R::Choice { cases })
    }

    /// `update(rec, { f: v })` → a record update with the schema's field order preserved.
    fn try_lower_update(&mut self, callee: &Expr, args: &[Expr], ctx: &mut FnCtx, file: &str) -> DResult<Option<R>> {
        let Expr::Var(name) = callee else { return Ok(None) };
        if name != "update" || args.len() != 2 {
            return Ok(None);
        }
        let Expr::Record(fields) = &args[1] else { return Ok(None) };
        let base = self.lower_expr_p(&args[0], ctx, file)?;
        let mut fs = Vec::with_capacity(fields.len());
        for (k, v) in fields {
            let sym = self.interner.intern(k);
            fs.push((sym, self.lower_expr_p(v, ctx, file)?));
        }
        Ok(Some(R::Builtin { b: Builtin::Update, args: vec![base, R::Record { schema: None, fields: fs }] }))
    }

    fn try_lower_host(&mut self, callee: &Expr, args: &[Expr], ctx: &mut FnCtx, file: &str) -> DResult<Option<R>> {
        let Expr::Var(name) = callee else { return Ok(None) };
        if name != "host" {
            return Ok(None);
        }
        let cap_name = match args.first() {
            Some(Expr::Str(s)) | Some(Expr::Sym(s)) => s.clone(),
            _ => return Err(Diag::new("BHC-E140", file, ctx.pos, "`host` requires a capability name string")),
        };
        let cap = match self.program.capabilities.iter().position(|c| *c == cap_name) {
            Some(i) => i,
            None => {
                return Err(Diag::new(
                    "BHC-E400",
                    file,
                    ctx.pos,
                    format!("host capability `{cap_name}` is not declared in pack.toml `[capabilities]`"),
                ))
            }
        };
        let sym = self.interner.intern(&cap_name);
        let a = self.lower_exprs(&args[1..], ctx, file)?;
        Ok(Some(R::Host { cap, name: sym, args: a }))
    }

    fn try_lower_data(&mut self, callee: &Expr, args: &[Expr], ctx: &mut FnCtx, file: &str) -> DResult<Option<R>> {
        fn flatten<'a>(e: &'a Expr, out: &mut Vec<&'a str>) -> bool {
            match e {
                Expr::Var(v) => {
                    out.push(v);
                    true
                }
                Expr::Field { base, name }
                    if flatten(base, out) => {
                        out.push(name);
                        true
                    }
                _ => false,
            }
        }
        let mut segs = Vec::new();
        if !flatten(callee, &mut segs) || segs.len() != 3 || segs[0] != "data" {
            return Ok(None);
        }
        let set = match self.program.data.iter().position(|d| d.name == segs[1]) {
            Some(i) => i,
            None => {
                return Err(Diag::new(
                    "BHC-E131",
                    file,
                    ctx.pos,
                    format!("pack.toml declares no data set `{}`", segs[1]),
                ))
            }
        };
        let a = self.lower_exprs(args, ctx, file)?;
        let access = match segs[2] {
            "all" => {
                if !a.is_empty() {
                    return Err(Diag::new("BHC-E132", file, ctx.pos, "`all()` takes no arguments"));
                }
                DataAccess::All
            }
            "len" => {
                if !a.is_empty() {
                    return Err(Diag::new("BHC-E132", file, ctx.pos, "`len()` takes no arguments"));
                }
                DataAccess::Len
            }
            "by_id" | "by_key" => {
                if a.len() != 1 {
                    return Err(Diag::new("BHC-E132", file, ctx.pos, format!("`{}` takes 1 argument", segs[2])));
                }
                DataAccess::ByKey(Box::new(a.into_iter().next().unwrap()))
            }
            "by_index" => {
                if a.len() != 1 {
                    return Err(Diag::new("BHC-E132", file, ctx.pos, "`by_index` takes 1 argument"));
                }
                DataAccess::ByIndex(Box::new(a.into_iter().next().unwrap()))
            }
            other => {
                return Err(Diag::new(
                    "BHC-E133",
                    file,
                    ctx.pos,
                    format!("unknown data access `{other}` (expected all/len/by_id/by_index)"),
                ))
            }
        };
        Ok(Some(R::Data { set, access }))
    }
}

pub fn register_builtin(program: &mut Program, b: Builtin) -> u8 {
    if let Some(i) = program.builtin_refs.iter().position(|x| *x == b) {
        return i as u8;
    }
    program.builtin_refs.push(b);
    (program.builtin_refs.len() - 1) as u8
}

fn normalize(p: &str) -> String {
    let mut s = p.replace('\\', "/");
    while let Some(rest) = s.strip_prefix("./") {
        s = rest.to_string();
    }
    s
}

fn contains_local(r: &R) -> bool {
    match r {
        R::Local(_) => true,
        R::Const(_) => false,
        R::CallStatic { args, .. } => args.iter().any(contains_local),
        R::CallValue { callee, args } => contains_local(callee) || args.iter().any(contains_local),
        R::Builtin { args, .. } => args.iter().any(contains_local),
        R::Field { base, .. } => contains_local(base),
        R::Index { base, idx } => contains_local(base) || contains_local(idx),
        R::Record { fields, .. } => fields.iter().any(|(_, v)| contains_local(v)),
        R::List(xs) | R::Tuple(xs) => xs.iter().any(contains_local),
        R::Some(v) | R::Ok(v) | R::Err(v) | R::Expected(v) => contains_local(v),
        R::None => false,
        R::If { cond, then, els } => contains_local(cond) || contains_local(then) || contains_local(els),
        R::LetPat { value, body, .. } => contains_local(value) || contains_local(body),
        R::Match { scrut, arms } => {
            contains_local(scrut) || arms.iter().any(|a| a.guard.as_ref().is_some_and(contains_local) || contains_local(&a.body))
        }
        R::Closure { captures, .. } => !captures.is_empty(),
        R::Binary { lhs, rhs, .. } => contains_local(lhs) || contains_local(rhs),
        R::Unary { expr, .. } => contains_local(expr),
        R::Choice { cases } => cases.iter().any(|c| contains_local(&c.weight) || contains_local(&c.value)),
        R::Data { access, .. } => match access {
            DataAccess::ByKey(r) | DataAccess::ByIndex(r) => contains_local(r),
            _ => false,
        },
        R::Host { args, .. } => args.iter().any(contains_local),
    }
}

fn detect_import_cycles(modules: &[LoadedModule]) -> DResult<()> {
    #[derive(Clone, Copy, PartialEq)]
    enum Mark {
        White,
        Grey,
        Black,
    }
    fn dfs(i: usize, modules: &[LoadedModule], marks: &mut [Mark]) -> DResult<()> {
        marks[i] = Mark::Grey;
        for m in modules[i].import_by_alias.values() {
            match marks[*m] {
                Mark::Grey => {
                    return Err(Diag::new(
                        "BHC-E113",
                        modules[i].path.clone(),
                        Pos::default(),
                        format!("circular import of `{}`", modules[*m].path),
                    ))
                }
                Mark::White => dfs(*m, modules, marks)?,
                Mark::Black => {}
            }
        }
        marks[i] = Mark::Black;
        Ok(())
    }
    let mut marks = vec![Mark::White; modules.len()];
    for i in 0..modules.len() {
        if marks[i] == Mark::White {
            dfs(i, modules, &mut marks)?;
        }
    }
    Ok(())
}

fn collect_free(e: &Expr, bound: &mut HashSet<String>, out: &mut BTreeSet<String>) {
    match e {
        Expr::Var(n) => {
            if !bound.contains(n) && !is_builtin_name(n) {
                out.insert(n.clone());
            }
        }
        Expr::Num(_) | Expr::Bool(_) | Expr::Sym(_) | Expr::Str(_) | Expr::Unit => {}
        Expr::List(xs) | Expr::Tuple(xs) => xs.iter().for_each(|x| collect_free(x, bound, out)),
        Expr::Record(fs) => fs.iter().for_each(|(_, v)| collect_free(v, bound, out)),
        Expr::SchemaLit { fields, .. } => fields.iter().for_each(|(_, v)| collect_free(v, bound, out)),
        Expr::Field { base, .. } => collect_free(base, bound, out),
        Expr::Index { base, idx } => {
            collect_free(base, bound, out);
            collect_free(idx, bound, out);
        }
        Expr::Call { callee, args } => {
            // `data.x.y()` / `mod.fn()` must not be captured as a variable.
            if !matches!(callee.as_ref(), Expr::Field { base, .. } if matches!(base.as_ref(), Expr::Var(_))) {
                collect_free(callee, bound, out);
            }
            args.iter().for_each(|x| collect_free(x, bound, out));
        }
        Expr::Lambda(l) => {
            let mut inner = bound.clone();
            for p in &l.params {
                match p {
                    Param::Named { name, .. } => {
                        inner.insert(name.clone());
                    }
                    Param::Pattern(pat) => collect_pattern(pat, &mut inner),
                }
            }
            collect_free(&l.body, &mut inner, out);
        }
        Expr::If { cond, then, els } => {
            collect_free(cond, bound, out);
            collect_free(then, bound, out);
            collect_free(els, bound, out);
        }
        Expr::Match { scrut, arms } => {
            collect_free(scrut, bound, out);
            for a in arms {
                let mut inner = bound.clone();
                collect_pattern(&a.pat, &mut inner);
                if let Some(g) = &a.guard {
                    collect_free(g, &mut inner, out);
                }
                collect_free(&a.body, &mut inner, out);
            }
        }
        Expr::Let { pat, value, body } => {
            collect_free(value, bound, out);
            let mut inner = bound.clone();
            collect_pattern(pat, &mut inner);
            collect_free(body, &mut inner, out);
        }
        Expr::Unary { expr, .. } => collect_free(expr, bound, out),
        Expr::Binary { lhs, rhs, .. } => {
            collect_free(lhs, bound, out);
            collect_free(rhs, bound, out);
        }
        Expr::Pipe { value, func } => {
            collect_free(value, bound, out);
            collect_free(func, bound, out);
        }
    }
}

fn collect_pattern(p: &Pattern, bound: &mut HashSet<String>) {
    match p {
        Pattern::Bind(n) => {
            bound.insert(n.clone());
        }
        Pattern::Tuple(ps) => ps.iter().for_each(|x| collect_pattern(x, bound)),
        Pattern::Record(fs) => fs.iter().for_each(|(_, x)| collect_pattern(x, bound)),
        Pattern::Some(x) | Pattern::Ok(x) | Pattern::Err(x) => collect_pattern(x, bound),
        _ => {}
    }
}

fn is_builtin_name(n: &str) -> bool {
    Builtin::from_name(n).is_some()
}

/// Split a slot-encoded pattern binding name (`\0slot\0name`) into its parts.
///
/// The resolver encodes the target slot into the binding name so that pattern binding needs no
/// side table. `slot` is decimal.
pub fn split_binding(n: &str) -> Option<(u32, &str)> {
    let rest = n.strip_prefix('\u{0}')?;
    let (slot, name) = rest.split_once('\u{0}')?;
    Some((slot.parse().ok()?, name))
}
