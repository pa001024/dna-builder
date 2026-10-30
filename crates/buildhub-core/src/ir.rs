//! Resolved IR: names and slots are resolved once, so evaluation performs no string lookups.
//! Lambda capture is by value into an immutable upvalue list (spec §3.2 purity).

use alloc::{boxed::Box, string::String, vec::Vec};
use crate::ast::{BinOp, Pattern, UnOp};
use crate::sym::Sym;
use crate::value::Value;
use alloc::rc::Rc;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Builtin {
    Min,
    Max,
    Clamp,
    Abs,
    Floor,
    Ceil,
    Round,
    RoundJs,
    Trunc,
    ToFixed,
    Sqrt,
    Pow,
    Log,
    SafeDiv,
    Len,
    At,
    Slice,
    Concat,
    ConcatMap,
    Map,
    Filter,
    Fold,
    SortBy,
    Take,
    Drop,
    Zip,
    Find,
    Any,
    All,
    Count,
    Field,
    GetOr,
    Has,
    Update,
    SymOf,
    NumOf,
    Fix,
    Choice,
    Expected,
    Trace,
    Inf,
    Nan,
    // 追加在末尾：内置 tag 是磁盘 ABI，重编号会让已发布的镜像失效。
    IsNum,
    IsList,
    // 文本索引：目标函数等表达式是文本，pack 需要逐字符解析。
    StrLen,
    StrAt,
    StrSlice,
    StrEq,
    // 记录/表聚合：`keys` 取字段名（插入序），`group_sum` 按键归并求和。
    // 两者都不含领域概念，只补上「一遍遍历累加」所需的通用能力。
    Keys,
    GroupSum,
    DedupBy,
    /// `fold` over pairs: the closure receives the two components instead of the tuple, so the
    /// pack does not pay two `at` calls per element for a destructure.
    Fold2,
}

pub const ALL_BUILTINS: &[Builtin] = &[
    Builtin::Min, Builtin::Max, Builtin::Clamp, Builtin::Abs, Builtin::Floor, Builtin::Ceil,
    Builtin::Round, Builtin::RoundJs, Builtin::Trunc, Builtin::ToFixed, Builtin::Sqrt, Builtin::Pow,
    Builtin::Log, Builtin::SafeDiv, Builtin::Len, Builtin::At, Builtin::Slice, Builtin::Concat,
    Builtin::ConcatMap, Builtin::Map, Builtin::Filter, Builtin::Fold, Builtin::SortBy, Builtin::Take,
    Builtin::Drop, Builtin::Zip, Builtin::Find, Builtin::Any, Builtin::All, Builtin::Count,
    Builtin::Field, Builtin::GetOr, Builtin::Has, Builtin::Update, Builtin::SymOf, Builtin::NumOf,
    Builtin::Fix, Builtin::Choice, Builtin::Expected, Builtin::Trace, Builtin::Inf, Builtin::Nan,
    Builtin::IsNum, Builtin::IsList, Builtin::StrLen, Builtin::StrAt, Builtin::StrSlice,
    Builtin::StrEq, Builtin::Keys, Builtin::GroupSum, Builtin::DedupBy, Builtin::Fold2,
];

impl Builtin {
    /// Inverse of `as usize` (declaration order), for hosts that carry the tag as an integer.
    pub fn from_index(i: usize) -> Option<Self> {
        ALL_BUILTINS.get(i).copied()
    }

    pub fn from_name(s: &str) -> Option<Self> {
        Some(match s {
            "min" => Builtin::Min,
            "max" => Builtin::Max,
            "clamp" => Builtin::Clamp,
            "abs" => Builtin::Abs,
            "floor" => Builtin::Floor,
            "ceil" => Builtin::Ceil,
            "round" => Builtin::Round,
            "round_js" => Builtin::RoundJs,
            "trunc" => Builtin::Trunc,
            "to_fixed" => Builtin::ToFixed,
            "sqrt" => Builtin::Sqrt,
            "pow" => Builtin::Pow,
            "log" => Builtin::Log,
            "safe_div" => Builtin::SafeDiv,
            "len" => Builtin::Len,
            "at" => Builtin::At,
            "slice" => Builtin::Slice,
            "concat" => Builtin::Concat,
            "concat_map" => Builtin::ConcatMap,
            "map" => Builtin::Map,
            "filter" => Builtin::Filter,
            "fold" => Builtin::Fold,
            "sort_by" => Builtin::SortBy,
            "take" => Builtin::Take,
            "drop" => Builtin::Drop,
            "zip" => Builtin::Zip,
            "find" => Builtin::Find,
            "any" => Builtin::Any,
            "all" => Builtin::All,
            "count" => Builtin::Count,
            "field" => Builtin::Field,
            "get_or" => Builtin::GetOr,
            "has" => Builtin::Has,
            "update" => Builtin::Update,
            "sym_of" => Builtin::SymOf,
            "str_len" => Builtin::StrLen,
            "str_at" => Builtin::StrAt,
            "str_slice" => Builtin::StrSlice,
            "str_eq" => Builtin::StrEq,
            "keys" => Builtin::Keys,
            "group_sum" => Builtin::GroupSum,
            "dedup_by" => Builtin::DedupBy,
            "fold2" => Builtin::Fold2,
            "is_num" => Builtin::IsNum,
            "is_list" => Builtin::IsList,
            "num_of" => Builtin::NumOf,
            "fix" => Builtin::Fix,
            "choice" => Builtin::Choice,
            "expected" => Builtin::Expected,
            "trace" => Builtin::Trace,
            "inf" => Builtin::Inf,
            "nan" => Builtin::Nan,
            _ => return None,
        })
    }

    /// Declared arity. `min`/`max` are variadic in spirit but the spec fixes 2; the stdlib's
    /// `sum`/`avg` are written with `fold` instead.
    pub fn arity(self) -> usize {
        match self {
            Builtin::Min | Builtin::Max => 2,
            Builtin::Clamp => 3,
            Builtin::Abs
            | Builtin::Floor
            | Builtin::Ceil
            | Builtin::Round
            | Builtin::RoundJs
            | Builtin::Trunc
            | Builtin::Sqrt
            | Builtin::Log => 1,
            Builtin::ToFixed => 2,
            Builtin::Pow => 2,
            Builtin::SafeDiv => 2,
            Builtin::Len => 1,
            Builtin::At => 2,
            Builtin::Slice => 3,
            Builtin::Concat => 2,
            Builtin::ConcatMap => 2,
            Builtin::Map => 2,
            Builtin::Filter => 2,
            Builtin::Fold => 3,
            Builtin::SortBy => 2,
            Builtin::Take => 2,
            Builtin::Drop => 2,
            Builtin::Zip => 2,
            Builtin::Find => 2,
            Builtin::Any => 2,
            Builtin::All => 2,
            Builtin::Count => 2,
            Builtin::Field => 2,
            Builtin::GetOr => 2,
            Builtin::Has => 2,
            Builtin::Update => 2,
            Builtin::SymOf => 1,
            Builtin::NumOf => 1,
            Builtin::IsNum | Builtin::IsList => 1,
            Builtin::StrLen => 1,
            Builtin::StrAt => 2,
            Builtin::StrSlice => 3,
            Builtin::StrEq => 2,
            Builtin::Keys => 1,
            Builtin::GroupSum => 1,
            Builtin::DedupBy => 2,
            Builtin::Fold2 => 3,
            Builtin::Fix => 4,
            Builtin::Choice => 1,
            Builtin::Expected => 1,
            Builtin::Trace => 4,
            Builtin::Inf | Builtin::Nan => 0,
        }
    }
}

#[derive(Clone, Debug)]
pub enum DataAccess {
    All,
    Len,
    ByKey(Box<R>),
    ByIndex(Box<R>),
}

#[derive(Clone, Debug)]
pub enum R {
    Const(crate::value::Value),
    Local(u32),
    CallStatic {
        fn_id: usize,
        args: Vec<R>,
    },
    CallValue {
        callee: Box<R>,
        args: Vec<R>,
    },
    Builtin {
        b: Builtin,
        args: Vec<R>,
    },
    Field {
        base: Box<R>,
        name: Sym,
    },
    Index {
        base: Box<R>,
        idx: Box<R>,
    },
    Record {
        schema: Option<usize>,
        fields: Vec<(Sym, R)>,
    },
    List(Vec<R>),
    Tuple(Vec<R>),
    Some(Box<R>),
    None,
    Ok(Box<R>),
    Err(Box<R>),
    If {
        cond: Box<R>,
        then: Box<R>,
        els: Box<R>,
    },
    /// Bind a whole pattern from one value: `let (a, b) = ...` / `let Item{..} = ...`.
    LetPat {
        pat: Pattern,
        value: Box<R>,
        body: Box<R>,
    },
    Match {
        scrut: Box<R>,
        arms: Vec<RArm>,
    },
    Closure {
        fn_id: usize,
        captures: Vec<R>,
    },
    Binary {
        op: BinOp,
        lhs: Box<R>,
        rhs: Box<R>,
    },
    Unary {
        op: UnOp,
        expr: Box<R>,
    },
    Choice {
        cases: Vec<ChoiceCase>,
    },
    /// `expected(x)`: explicit collapse of a distribution to its mean (spec §9.8.12.4).
    Expected(Box<R>),
    Data {
        set: usize,
        access: DataAccess,
    },
    Host {
        cap: usize,
        name: Sym,
        args: Vec<R>,
    },
}

#[derive(Clone, Debug)]
pub struct ChoiceCase {
    pub weight: R,
    pub label: Option<Sym>,
    pub value: R,
}

#[derive(Clone, Debug)]
pub struct RArm {
    pub pat: Pattern,
    pub guard: Option<R>,
    /// Slots allocated for this arm's pattern bindings and `Let` chains inside it.
    pub body: R,
}

#[derive(Clone, Debug)]
pub struct FnDef {
    /// Absolute slot index where parameters start (captures occupy `[0, ncaptures)`).

    pub name: String,
    pub module: usize,
    /// Number of parameters as declared (excluding captures).
    pub nparams: usize,
    /// Number of capture slots prepended to the frame for closures.
    pub ncaptures: usize,
    pub nslots: u32,
    pub body: R,
    pub pos: crate::diag::Pos,
    pub file: String,
    /// Declared parameter types, for `entries` validation.
    pub param_types: Vec<Option<crate::ast::TypeExpr>>,
    pub ret: Option<crate::ast::TypeExpr>,
    pub type_params: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct Program {
    pub fns: Vec<FnDef>,
    pub fn_index: hashbrown::HashMap<(usize, String), usize>,
    /// Builtins referenced as first-class values, in program order.
    pub builtin_refs: Vec<Builtin>,
    pub module_names: Vec<String>,
    pub schemas: Vec<SchemaDef>,
    pub schema_by_name: hashbrown::HashMap<String, usize>,
    /// One entry per `[[data]]` declaration, filled by the loader after lowering.
    pub data: Vec<DataSet>,
    pub entries: Vec<Entry>,
    pub consts: Vec<Value>,
    pub capabilities: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct SchemaDef {
    pub name: String,
    pub fields: Vec<(String, crate::ast::TypeExpr)>,
    pub open: bool,
    pub module: usize,
    pub pos: crate::diag::Pos,
    pub file: String,
    /// Field name interned, in declaration order.
    pub syms: Vec<(Sym, crate::ast::TypeExpr)>,
}

#[derive(Clone, Debug)]
pub struct DataSet {
    pub name: String,
    pub dataset: String,
    pub schema: String,
    pub key: Option<String>,
    pub key_sym: Option<Sym>,
    pub rows: Rc<Vec<Value>>,
    pub version: u64,
    pub index: hashbrown::HashMap<u64, usize>,
}

#[derive(Clone, Debug)]
pub struct Entry {
    pub name: String,
    pub fn_id: usize,
    pub args: Vec<String>,
}
