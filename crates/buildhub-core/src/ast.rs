//! AST for BHL (spec §3.3) plus the type syntax shared with the checker.

use alloc::{boxed::Box, string::String, vec::Vec};
use crate::diag::Pos;

#[derive(Clone, Debug, PartialEq)]
pub enum TypeExpr {
    Num,
    Bool,
    Sym,
    Unit,
    Str,
    List(Box<TypeExpr>),
    Tuple(Vec<TypeExpr>),
    Record { fields: Vec<(String, TypeExpr)>, open: bool },
    Named(String),
    Generic(String, Vec<TypeExpr>),
    Fn(Vec<TypeExpr>, Box<TypeExpr>),
    Var(String),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Pattern {
    Bind(String),
    Wild,
    Tuple(Vec<Pattern>),
    Record(Vec<(String, Pattern)>),
    Some(Box<Pattern>),
    None,
    Ok(Box<Pattern>),
    Err(Box<Pattern>),
    Num(f64),
    /// `sym"x" => ...`: symbol literal pattern (spec §7.11 data-driven dispatch).
    Sym(String),
}

#[derive(Clone, Debug)]
pub struct Lambda {
    pub params: Vec<Param>,
    pub body: Box<Expr>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Param {
    Named { name: String, ty: Option<TypeExpr> },
    Pattern(Pattern),
}

impl Param {
    pub fn name(&self) -> Option<&str> {
        match self {
            Param::Named { name, .. } => Some(name),
            Param::Pattern(_) => None,
        }
    }
}

#[derive(Clone, Debug)]
pub enum Expr {
    Num(f64),
    Bool(bool),
    Sym(String),
    Str(String),
    Unit,
    Var(String),
    List(Vec<Expr>),
    Tuple(Vec<Expr>),
    Record(Vec<(String, Expr)>),
    SchemaLit { schema: String, fields: Vec<(String, Expr)> },
    Field { base: Box<Expr>, name: String },
    Index { base: Box<Expr>, idx: Box<Expr> },
    Call { callee: Box<Expr>, args: Vec<Expr> },
    Lambda(Box<Lambda>),
    If { cond: Box<Expr>, then: Box<Expr>, els: Box<Expr> },
    Match { scrut: Box<Expr>, arms: Vec<Arm> },
    Let { pat: Pattern, value: Box<Expr>, body: Box<Expr> },
    Unary { op: UnOp, expr: Box<Expr> },
    Binary { op: BinOp, lhs: Box<Expr>, rhs: Box<Expr> },
    /// `x |> f(a)`  → `f(x, a)`. Desugared in the parser.
    Pipe { value: Box<Expr>, func: Box<Expr> },
}

#[derive(Clone, Debug)]
pub struct Arm {
    pub pat: Pattern,
    pub guard: Option<Expr>,
    pub body: Expr,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UnOp {
    Neg,
    Not,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    FloorDiv,
    Rem,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    And,
    Or,
}

#[derive(Clone, Debug)]
pub struct Spanned {
    pub expr: Expr,
    pub pos: Pos,
}

#[derive(Clone, Debug)]
pub struct FnDecl {
    pub name: String,
    pub type_params: Vec<String>,
    pub params: Vec<Param>,
    pub ret: Option<TypeExpr>,
    pub body: FnBody,
    pub pos: Pos,
}

#[derive(Clone, Debug)]
pub enum FnBody {
    Expr(Expr),
    Block(Expr),
}

#[derive(Clone, Debug)]
pub struct SchemaDecl {
    pub name: String,
    pub fields: Vec<(String, TypeExpr)>,
    pub open: bool,
    pub pos: Pos,
}

#[derive(Clone, Debug)]
pub struct TypeDecl {
    pub name: String,
    pub ty: TypeExpr,
    pub pos: Pos,
}

#[derive(Clone, Debug)]
pub struct ConstDecl {
    pub name: String,
    pub ty: Option<TypeExpr>,
    pub value: Expr,
    pub pos: Pos,
}

#[derive(Clone, Debug)]
pub struct ImportDecl {
    pub alias: String,
    pub path: String,
    pub version: Option<u32>,
    pub pos: Pos,
}

#[derive(Clone, Debug, Default)]
pub struct Module {
    /// Declared module name (`module x`), if any.
    pub name: Option<String>,
    pub imports: Vec<ImportDecl>,
    pub schemas: Vec<SchemaDecl>,
    pub types: Vec<TypeDecl>,
    pub fns: Vec<FnDecl>,
    pub consts: Vec<ConstDecl>,
    /// Position of the `module` decl, for diagnostics.
    pub pos: Pos,
}

impl Default for FnDecl {
    fn default() -> Self {
        Self {
            name: String::new(),
            type_params: Vec::new(),
            params: Vec::new(),
            ret: None,
            body: FnBody::Expr(Expr::Unit),
            pos: Pos::default(),
        }
    }
}
