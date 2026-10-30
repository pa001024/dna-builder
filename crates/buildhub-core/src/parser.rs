//! Recursive-descent parser for BHL (spec §3.3).

use alloc::{boxed::Box, format, string::{String, ToString}, vec, vec::Vec};
use crate::ast::*;
use crate::diag::{Diag, DResult, Pos};
use crate::lexer::{Lexer, Tok, Token};

pub struct Parser {
    toks: Vec<Token>,
    i: usize,
    file: String,
    /// Expression nesting depth. The parser is recursive, so this is what keeps a pathological
    /// source (a 10k-deep `let` chain) an `BHC-E1xx` diagnostic instead of a stack overflow
    /// (spec §3.2 "有界", §6.3 "不 panic").
    depth: u32,
}

/// Nesting limit for expressions. Deep but finite: a hand-written rule set never approaches it, and
/// a generated or hostile one gets a diagnostic.
const MAX_DEPTH: u32 = 512;

pub fn parse_module(src: &str, file: &str) -> DResult<Module> {
    let toks = Lexer::new(src, file).run()?;
    let mut p = Parser { toks, i: 0, file: file.to_string(), depth: 0 };
    p.module()
}

impl Parser {
    fn peek(&self) -> &Tok {
        &self.toks[self.i].tok
    }

    fn peek_at(&self, n: usize) -> &Tok {
        let idx = (self.i + n).min(self.toks.len() - 1);
        &self.toks[idx].tok
    }

    fn pos(&self) -> Pos {
        self.toks[self.i].pos
    }

    fn bump(&mut self) -> Tok {
        let t = self.toks[self.i].tok.clone();
        if self.i + 1 < self.toks.len() {
            self.i += 1;
        }
        t
    }

    fn at(&self, t: &Tok) -> bool {
        self.peek() == t
    }

    fn eat(&mut self, t: &Tok) -> bool {
        if self.at(t) {
            self.bump();
            true
        } else {
            false
        }
    }

    fn err<T>(&self, msg: impl Into<String>) -> DResult<T> {
        Err(Diag::new("BHC-E101", self.file.clone(), self.pos(), msg))
    }

    fn expect(&mut self, t: Tok) -> DResult<()> {
        if self.at(&t) {
            self.bump();
            Ok(())
        } else {
            self.err(format!("expected `{}`, found {}", t.text(), self.peek().describe()))
        }
    }

    fn ident(&mut self) -> DResult<String> {
        match self.peek().clone() {
            Tok::Ident(s) => {
                self.bump();
                Ok(s)
            }
            other => self.err(format!("expected identifier, found {}", other.describe())),
        }
    }

    fn module(&mut self) -> DResult<Module> {
        let mut m = Module { pos: self.pos(), ..Default::default() };
        while !self.at(&Tok::Eof) {
            match self.peek().clone() {
                Tok::Module => {
                    let pos = self.pos();
                    self.bump();
                    let name = self.ident()?;
                    m.name = Some(name);
                    m.pos = pos;
                }
                Tok::Import => {
                    let d = self.import()?;
                    m.imports.push(d);
                }
                Tok::Schema => m.schemas.push(self.schema()?),
                Tok::Type => m.types.push(self.type_decl()?),
                Tok::Fn => m.fns.push(self.fn_decl()?),
                Tok::Const => m.consts.push(self.const_decl()?),
                other => {
                    return self.err(format!("expected declaration (`module`/`import`/`schema`/`type`/`fn`/`const`), found {}", other.describe()));
                }
            }
        }
        Ok(m)
    }

    fn import(&mut self) -> DResult<ImportDecl> {
        let pos = self.pos();
        self.expect(Tok::Import)?;
        let alias = self.ident()?;
        self.expect(Tok::From)?;
        let path = match self.peek().clone() {
            Tok::Str(s) => {
                self.bump();
                s
            }
            other => return self.err(format!("expected import path string, found {}", other.describe())),
        };
        let mut version = None;
        if self.eat(&Tok::At) {
            match self.peek().clone() {
                Tok::Num(n) => {
                    self.bump();
                    version = Some(n as u32);
                }
                other => return self.err(format!("expected version number, found {}", other.describe())),
            }
        }
        Ok(ImportDecl { alias, path, version, pos })
    }

    fn schema(&mut self) -> DResult<SchemaDecl> {
        let pos = self.pos();
        self.expect(Tok::Schema)?;
        let name = self.ident()?;
        self.expect(Tok::LBrace)?;
        let mut fields = Vec::new();
        let mut open = false;
        while !self.at(&Tok::RBrace) {
            if self.eat(&Tok::DotDot) {
                // `..open` marks an open schema; bare `..` is accepted too.
                if let Tok::Ident(w) = self.peek().clone() {
                    if w == "open" {
                        self.bump();
                    }
                }
                open = true;
                self.eat(&Tok::Comma);
                continue;
            }
            let fname = self.ident()?;
            self.expect(Tok::Colon)?;
            let ty = self.type_expr()?;
            fields.push((fname, ty));
            self.eat(&Tok::Comma);
        }
        self.expect(Tok::RBrace)?;
        Ok(SchemaDecl { name, fields, open, pos })
    }

    fn type_decl(&mut self) -> DResult<TypeDecl> {
        let pos = self.pos();
        self.expect(Tok::Type)?;
        let name = self.ident()?;
        self.expect(Tok::Eq)?;
        let ty = self.type_expr()?;
        Ok(TypeDecl { name, ty, pos })
    }

    fn const_decl(&mut self) -> DResult<ConstDecl> {
        let pos = self.pos();
        self.expect(Tok::Const)?;
        let name = self.ident()?;
        let mut ty = None;
        if self.eat(&Tok::Colon) {
            ty = Some(self.type_expr()?);
        }
        self.expect(Tok::Eq)?;
        let value = self.expr()?;
        Ok(ConstDecl { name, ty, value, pos })
    }

    fn fn_decl(&mut self) -> DResult<FnDecl> {
        let pos = self.pos();
        self.expect(Tok::Fn)?;
        let name = self.ident()?;
        let mut type_params = Vec::new();
        if self.at(&Tok::Lt) {
            self.bump();
            loop {
                type_params.push(self.ident()?);
                if !self.eat(&Tok::Comma) {
                    break;
                }
            }
            self.expect(Tok::Gt)?;
        }
        self.expect(Tok::LParen)?;
        let mut params = Vec::new();
        while !self.at(&Tok::RParen) {
            params.push(self.param()?);
            if !self.eat(&Tok::Comma) {
                break;
            }
        }
        self.expect(Tok::RParen)?;
        let mut ret = None;
        if self.eat(&Tok::Arrow) {
            ret = Some(self.type_expr()?);
        }
        let body = if self.eat(&Tok::Eq) {
            let e = self.expr()?;
            self.eat(&Tok::Semi);
            FnBody::Expr(e)
        } else if self.at(&Tok::LBrace) {
            self.bump();
            let e = self.expr()?;
            self.expect(Tok::RBrace)?;
            FnBody::Block(e)
        } else {
            return self.err("expected `=` or `{` to start function body");
        };
        Ok(FnDecl { name, type_params, params, ret, body, pos })
    }

    fn param(&mut self) -> DResult<Param> {
        // `Name: Type` or a destructuring pattern
        if let Tok::Ident(name) = self.peek().clone() {
            if *self.peek_at(1) == Tok::Colon || matches!(self.peek_at(1), Tok::Comma | Tok::RParen) {
                self.bump();
                let ty = if self.eat(&Tok::Colon) { Some(self.type_expr()?) } else { None };
                return Ok(Param::Named { name, ty });
            }
        }
        let pat = self.pattern()?;
        Ok(Param::Pattern(pat))
    }

    fn type_expr(&mut self) -> DResult<TypeExpr> {
        self.type_fn()
    }

    fn type_fn(&mut self) -> DResult<TypeExpr> {
        // `|A, B| C` is the lambda type syntax; `(A,B) -> C` also accepted.
        if self.at(&Tok::Pipe) {
            self.bump();
            let mut args = Vec::new();
            while !self.at(&Tok::Pipe) {
                args.push(self.type_atom()?);
                if !self.eat(&Tok::Comma) {
                    break;
                }
            }
            self.expect(Tok::Pipe)?;
            let ret = self.type_atom()?;
            return Ok(TypeExpr::Fn(args, Box::new(ret)));
        }
        let ty = self.type_atom()?;
        if self.eat(&Tok::Arrow) {
            let ret = self.type_fn()?;
            return Ok(TypeExpr::Fn(vec![ty], Box::new(ret)));
        }
        Ok(ty)
    }

    fn type_atom(&mut self) -> DResult<TypeExpr> {
        match self.peek().clone() {
            Tok::Ident(name) => {
                self.bump();
                let base = match name.as_str() {
                    "Num" => TypeExpr::Num,
                    "Bool" => TypeExpr::Bool,
                    "Sym" => TypeExpr::Sym,
                    "Unit" => TypeExpr::Unit,
                    "Str" => TypeExpr::Str,
                    "Record" => {
                        return self.record_type();
                    }
                    _ => TypeExpr::Named(name.clone()),
                };
                if self.at(&Tok::Lt) {
                    self.bump();
                    let mut args = Vec::new();
                    loop {
                        args.push(self.type_expr()?);
                        if !self.eat(&Tok::Comma) {
                            break;
                        }
                    }
                    self.expect(Tok::Gt)?;
                    if name == "List" && args.len() == 1 {
                        return Ok(TypeExpr::List(Box::new(args.pop().unwrap())));
                    }
                    return Ok(TypeExpr::Generic(name, args));
                }
                Ok(base)
            }
            Tok::LParen => {
                self.bump();
                if self.eat(&Tok::RParen) {
                    return Ok(TypeExpr::Unit);
                }
                let mut items = vec![self.type_expr()?];
                let mut is_tuple = false;
                while self.eat(&Tok::Comma) {
                    is_tuple = true;
                    if self.at(&Tok::RParen) {
                        break;
                    }
                    items.push(self.type_expr()?);
                }
                self.expect(Tok::RParen)?;
                if is_tuple {
                    Ok(TypeExpr::Tuple(items))
                } else {
                    Ok(items.pop().unwrap())
                }
            }
            Tok::LBrace => self.record_type(),
            other => self.err(format!("expected type, found {}", other.describe())),
        }
    }

    fn record_type(&mut self) -> DResult<TypeExpr> {
        self.expect(Tok::LBrace)?;
        let mut fields = Vec::new();
        let mut open = false;
        while !self.at(&Tok::RBrace) {
            if self.eat(&Tok::DotDot) {
                // `..open` marks an open schema; bare `..` is accepted too.
                if let Tok::Ident(w) = self.peek().clone() {
                    if w == "open" {
                        self.bump();
                    }
                }
                open = true;
                self.eat(&Tok::Comma);
                continue;
            }
            let name = self.ident()?;
            self.expect(Tok::Colon)?;
            let ty = self.type_expr()?;
            fields.push((name, ty));
            self.eat(&Tok::Comma);
        }
        self.expect(Tok::RBrace)?;
        Ok(TypeExpr::Record { fields, open })
    }

    fn pattern(&mut self) -> DResult<Pattern> {
        match self.peek().clone() {
            Tok::Underscore => {
                self.bump();
                Ok(Pattern::Wild)
            }
            Tok::Num(n) => {
                self.bump();
                Ok(Pattern::Num(n))
            }
            Tok::Sym(s) => {
                self.bump();
                Ok(Pattern::Sym(s))
            }
            Tok::Ident(name) => {
                self.bump();
                Ok(Pattern::Bind(name))
            }
            Tok::Some => {
                self.bump();
                self.expect(Tok::LParen)?;
                let p = self.pattern()?;
                self.expect(Tok::RParen)?;
                Ok(Pattern::Some(Box::new(p)))
            }
            Tok::None => {
                self.bump();
                Ok(Pattern::None)
            }
            Tok::Ok => {
                self.bump();
                if self.eat(&Tok::LParen) {
                    let p = self.pattern()?;
                    self.expect(Tok::RParen)?;
                    Ok(Pattern::Ok(Box::new(p)))
                } else {
                    Ok(Pattern::Ok(Box::new(Pattern::Wild)))
                }
            }
            Tok::Err => {
                self.bump();
                if self.eat(&Tok::LParen) {
                    let p = self.pattern()?;
                    self.expect(Tok::RParen)?;
                    Ok(Pattern::Err(Box::new(p)))
                } else {
                    Ok(Pattern::Err(Box::new(Pattern::Wild)))
                }
            }
            Tok::LParen => {
                self.bump();
                let mut items = vec![self.pattern()?];
                while self.eat(&Tok::Comma) {
                    if self.at(&Tok::RParen) {
                        break;
                    }
                    items.push(self.pattern()?);
                }
                self.expect(Tok::RParen)?;
                if items.len() == 1 {
                    Ok(items.pop().unwrap())
                } else {
                    Ok(Pattern::Tuple(items))
                }
            }
            Tok::LBrace => {
                self.bump();
                let mut fields = Vec::new();
                while !self.at(&Tok::RBrace) {
                    let name = self.ident()?;
                    let p = if self.eat(&Tok::Colon) { self.pattern()? } else { Pattern::Bind(name.clone()) };
                    fields.push((name, p));
                    if !self.eat(&Tok::Comma) {
                        break;
                    }
                }
                self.expect(Tok::RBrace)?;
                Ok(Pattern::Record(fields))
            }
            other => self.err(format!("expected pattern, found {}", other.describe())),
        }
    }

    pub fn expr(&mut self) -> DResult<Expr> {
        if self.depth >= MAX_DEPTH {
            return self.err(format!("expression nesting exceeds {MAX_DEPTH} levels"));
        }
        self.depth += 1;
        let out = self.pipe_expr();
        self.depth -= 1;
        out
    }

    fn pipe_expr(&mut self) -> DResult<Expr> {
        let mut lhs = self.or_expr()?;
        while self.at(&Tok::Pipe) {
            // `|` as pipe operator only when it cannot start a lambda at this position.
            self.bump();
            let rhs = self.or_expr()?;
            lhs = Expr::Pipe { value: Box::new(lhs), func: Box::new(rhs) };
        }
        Ok(lhs)
    }

    fn or_expr(&mut self) -> DResult<Expr> {
        let mut lhs = self.and_expr()?;
        // The lexer emits `||` as `Bar`; in operator position it is the or-operator (in atom
        // position the same token starts a zero-parameter lambda).
        while self.eat(&Tok::OrOr) || self.eat(&Tok::Bar) {
            let rhs = self.and_expr()?;
            lhs = Expr::Binary { op: BinOp::Or, lhs: Box::new(lhs), rhs: Box::new(rhs) };
        }
        Ok(lhs)
    }

    fn and_expr(&mut self) -> DResult<Expr> {
        let mut lhs = self.cmp_expr()?;
        while self.eat(&Tok::AndAnd) {
            let rhs = self.cmp_expr()?;
            lhs = Expr::Binary { op: BinOp::And, lhs: Box::new(lhs), rhs: Box::new(rhs) };
        }
        Ok(lhs)
    }

    fn cmp_expr(&mut self) -> DResult<Expr> {
        let mut lhs = self.add_expr()?;
        loop {
            let op = match self.peek() {
                Tok::EqEq => BinOp::Eq,
                Tok::Ne => BinOp::Ne,
                Tok::Lt => BinOp::Lt,
                Tok::Le => BinOp::Le,
                Tok::Gt => BinOp::Gt,
                Tok::Ge => BinOp::Ge,
                Tok::Eq => break, // `=` is not a comparison
                _ => break,
            };
            self.bump();
            let rhs = self.add_expr()?;
            lhs = Expr::Binary { op, lhs: Box::new(lhs), rhs: Box::new(rhs) };
        }
        Ok(lhs)
    }

    fn add_expr(&mut self) -> DResult<Expr> {
        let mut lhs = self.mul_expr()?;
        loop {
            let op = match self.peek() {
                Tok::Plus => BinOp::Add,
                Tok::Minus => BinOp::Sub,
                _ => break,
            };
            self.bump();
            let rhs = self.mul_expr()?;
            lhs = Expr::Binary { op, lhs: Box::new(lhs), rhs: Box::new(rhs) };
        }
        Ok(lhs)
    }

    fn mul_expr(&mut self) -> DResult<Expr> {
        let mut lhs = self.unary_expr()?;
        loop {
            let op = match self.peek() {
                Tok::Star => BinOp::Mul,
                Tok::Slash => BinOp::Div,
                Tok::SlashSlash => BinOp::FloorDiv,
                Tok::Percent => BinOp::Rem,
                _ => break,
            };
            self.bump();
            let rhs = self.unary_expr()?;
            lhs = Expr::Binary { op, lhs: Box::new(lhs), rhs: Box::new(rhs) };
        }
        Ok(lhs)
    }

    fn unary_expr(&mut self) -> DResult<Expr> {
        if self.eat(&Tok::Minus) {
            let e = self.unary_expr()?;
            // Fold literal negation so `-0.0` keeps its sign bit.
            if let Expr::Num(n) = e {
                return Ok(Expr::Num(-n));
            }
            return Ok(Expr::Unary { op: UnOp::Neg, expr: Box::new(e) });
        }
        if self.eat(&Tok::Not) {
            let e = self.unary_expr()?;
            return Ok(Expr::Unary { op: UnOp::Not, expr: Box::new(e) });
        }
        self.postfix_expr()
    }

    fn postfix_expr(&mut self) -> DResult<Expr> {
        let mut e = self.atom_expr()?;
        loop {
            if self.at(&Tok::Dot) {
                self.bump();
                let name = self.ident()?;
                e = Expr::Field { base: Box::new(e), name };
            } else if self.at(&Tok::LBracket) {
                self.bump();
                let idx = self.expr()?;
                self.expect(Tok::RBracket)?;
                e = Expr::Index { base: Box::new(e), idx: Box::new(idx) };
            } else if self.at(&Tok::LBrace) && matches!(&e, Expr::Var(n) if starts_upper(n)) {
                // `Ident { ... }` is a schema literal only for type-shaped names (leading
                // uppercase). Lowercase identifiers followed by `{` are `match x {` scrutinees.
                let schema = match &e {
                    Expr::Var(n) => n.clone(),
                    _ => unreachable!(),
                };
                self.bump();
                let mut fields = Vec::new();
                while !self.at(&Tok::RBrace) {
                    let name = self.ident()?;
                    self.expect(Tok::Colon)?;
                    let v = self.expr()?;
                    fields.push((name, v));
                    if !self.eat(&Tok::Comma) {
                        break;
                    }
                }
                self.expect(Tok::RBrace)?;
                e = Expr::SchemaLit { schema, fields };
            } else if self.at(&Tok::LParen) {
                self.bump();
                let mut args = Vec::new();
                while !self.at(&Tok::RParen) {
                    args.push(self.expr()?);
                    if !self.eat(&Tok::Comma) {
                        break;
                    }
                }
                self.expect(Tok::RParen)?;
                e = Expr::Call { callee: Box::new(e), args };
            } else {
                break;
            }
        }
        Ok(e)
    }

    fn atom_expr(&mut self) -> DResult<Expr> {
        let pos = self.pos();
        match self.peek().clone() {
            Tok::Num(n) => {
                self.bump();
                Ok(Expr::Num(n))
            }
            Tok::True => {
                self.bump();
                Ok(Expr::Bool(true))
            }
            Tok::False => {
                self.bump();
                Ok(Expr::Bool(false))
            }
            Tok::Sym(s) => {
                self.bump();
                Ok(Expr::Sym(s))
            }
            Tok::Str(s) => {
                self.bump();
                Ok(Expr::Str(s))
            }
            Tok::Underscore => {
                self.bump();
                Ok(Expr::Unit)
            }
            Tok::Ident(name) => {
                self.bump();
                Ok(Expr::Var(name))
            }
            Tok::Some => {
                self.bump();
                self.expect(Tok::LParen)?;
                let inner = self.expr()?;
                self.expect(Tok::RParen)?;
                Ok(Expr::Call { callee: Box::new(Expr::Var("some".into())), args: vec![inner] })
            }
            Tok::Ok => {
                self.bump();
                self.expect(Tok::LParen)?;
                let inner = self.expr()?;
                self.expect(Tok::RParen)?;
                Ok(Expr::Call { callee: Box::new(Expr::Var("ok".into())), args: vec![inner] })
            }
            Tok::Err => {
                self.bump();
                self.expect(Tok::LParen)?;
                let inner = self.expr()?;
                self.expect(Tok::RParen)?;
                Ok(Expr::Call { callee: Box::new(Expr::Var("err".into())), args: vec![inner] })
            }
            Tok::None => {
                self.bump();
                Ok(Expr::Var("none".into()))
            }
            Tok::LParen => {
                self.bump();
                if self.eat(&Tok::RParen) {
                    return Ok(Expr::Unit);
                }
                let first = self.expr()?;
                if self.eat(&Tok::Comma) {
                    let mut items = vec![first];
                    while !self.at(&Tok::RParen) {
                        items.push(self.expr()?);
                        if !self.eat(&Tok::Comma) {
                            break;
                        }
                    }
                    self.expect(Tok::RParen)?;
                    return Ok(Expr::Tuple(items));
                }
                self.expect(Tok::RParen)?;
                Ok(first)
            }
            Tok::LBracket => {
                self.bump();
                let mut items = Vec::new();
                while !self.at(&Tok::RBracket) {
                    items.push(self.expr()?);
                    if !self.eat(&Tok::Comma) {
                        break;
                    }
                }
                self.expect(Tok::RBracket)?;
                Ok(Expr::List(items))
            }
            Tok::LBrace => {
                self.bump();
                let mut fields = Vec::new();
                while !self.at(&Tok::RBrace) {
                    let name = self.ident()?;
                    self.expect(Tok::Colon)?;
                    let v = self.expr()?;
                    fields.push((name, v));
                    self.eat(&Tok::Comma);
                }
                self.expect(Tok::RBrace)?;
                Ok(Expr::Record(fields))
            }
            Tok::Bar => {
                // `||` in expression position is a zero-parameter lambda, not an or-operator.
                self.bump();
                let body = self.expr()?;
                Ok(Expr::Lambda(Box::new(Lambda { params: Vec::new(), body: Box::new(body) })))
            }
            Tok::Pipe => {
                // lambda: |a, b| expr
                self.bump();
                let mut params = Vec::new();
                while !self.at(&Tok::Pipe) {
                    params.push(self.param()?);
                    if !self.eat(&Tok::Comma) {
                        break;
                    }
                }
                self.expect(Tok::Pipe)?;
                let body = self.expr()?;
                Ok(Expr::Lambda(Box::new(Lambda { params, body: Box::new(body) })))
            }
            Tok::If => {
                self.bump();
                let cond = self.expr()?;
                self.expect(Tok::Then)?;
                let then = self.expr()?;
                self.expect(Tok::Else)?;
                let els = self.expr()?;
                Ok(Expr::If { cond: Box::new(cond), then: Box::new(then), els: Box::new(els) })
            }
            Tok::Let => {
                self.bump();
                let pat = self.pattern()?;
                self.expect(Tok::Eq)?;
                let value = self.expr()?;
                self.expect(Tok::In)?;
                let body = self.expr()?;
                Ok(Expr::Let { pat, value: Box::new(value), body: Box::new(body) })
            }
            Tok::Match => {
                self.bump();
                let scrut = self.expr()?;
                self.expect(Tok::LBrace)?;
                let mut arms = Vec::new();
                while !self.at(&Tok::RBrace) {
                    let pat = self.pattern()?;
                    let guard = if self.eat(&Tok::If) { Some(self.expr()?) } else { None };
                    if !self.eat(&Tok::FatArrow) {
                        self.expect(Tok::Arrow)?;
                    }
                    let body = self.expr()?;
                    self.eat(&Tok::Comma);
                    self.eat(&Tok::Semi);
                    arms.push(Arm { pat, guard, body });
                }
                self.expect(Tok::RBrace)?;
                Ok(Expr::Match { scrut: Box::new(scrut), arms })
            }
            other => {
                let _ = pos;
                self.err(format!("expected expression, found {}", other.describe()))
            }
        }
    }
}

fn starts_upper(s: &str) -> bool {
    s.chars().next().is_some_and(|c| c.is_ascii_uppercase())
}

/// `Item{ field: v }` — schema literal, distinguishable from `match x {` because the constructor
/// name is capitalised (a naming rule, not a semantic one).
pub fn parse_schema_lit_body(p: &mut Parser) -> DResult<Vec<(String, Expr)>> {
    p.expect(Tok::LBrace)?;
    let mut fields = Vec::new();
    while !p.at(&Tok::RBrace) {
        let name = p.ident()?;
        p.expect(Tok::Colon)?;
        let v = p.expr()?;
        fields.push((name, v));
        if !p.eat(&Tok::Comma) {
            break;
        }
    }
    p.expect(Tok::RBrace)?;
    Ok(fields)
}
