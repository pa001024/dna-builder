//! The 39 engine builtins (spec §3.3). None of them knows a domain concept.

use alloc::{boxed::Box, format, vec, vec::Vec};
use alloc::rc::Rc;

use crate::eval::{EvalError, EResult, Host, as_list, as_slice, len_of, num_of, sym_of, to_fixed, wasm_max, wasm_min};
use crate::ir::Builtin;
use crate::value::{Dist, Pt, Value, canon};

/// 取的文本**借用**：`Sym` 走符号表，`Str` 直接借 `Rc<str>`。
///
/// 这里绝不能收集成 `Vec<char>`：`str_at` 被分词器按字符调用，收集会把
/// 「取一个字符」变成「展开整个字符串」，是 `tokenize` 的主要成本来源。
fn text_str<'a>(v: &'a Value, interner: &'a crate::sym::Interner) -> Option<&'a str> {
    match v {
        Value::Sym(s) => interner.try_name(*s),
        Value::Str(s) => Some(s),
        _ => None,
    }
}

/// Dispatch on the builtin tag.
///
/// `#[inline(never)]` is load-bearing for AOT size: this is a 40-arm `match`, and letting LLVM
/// monomorphise it into every generated block multiplies the artifact (§9.7 budget). As one
/// out-of-line function it is emitted exactly once and shared by all call sites.
/// Fast path for builtins whose operands are all single-valued.
///
/// Callers that already hold plain values (`apply_plain`, `step::prim_into`) would otherwise build
/// a `Vec<Dist>` only for the arm to unwrap it again. One evaluation runs ~38k builtin calls and
/// 83% of them are the seven kinds below, so this path carries most of the builtin cost.
///
/// Returns `None` for kinds that need the distribution machinery.
pub fn call_plain(interp: &dyn Host, b: Builtin, args: &[Value]) -> Option<EResult<Value>> {
    let one = |i: usize| -> &Value { args.get(i).unwrap_or(&Value::Unit) };
    let it = interp.interner();
    Some(match b {
        Builtin::Len => match len_of(one(0)) {
            Ok(n) => Ok(Value::Num(n as f64)),
            Err(e) => Err(e),
        },
        Builtin::At => match (one(0), num_of(one(1))) {
            (Value::List(xs) | Value::Tuple(xs), Some(n)) => {
                Ok(xs.get(n.max(0.0) as usize).cloned().unwrap_or(Value::Missing))
            }
            (_, None) => Err(EvalError::new("BHC-E311", "at() index must be a Num")),
            (other, _) => Err(EvalError::new("BHC-E336", format!("at() on {}", other.type_name()))),
        },
        Builtin::Field => match sym_of(one(1), it) {
            Ok(key) => match one(0) {
                Value::Record(rec) => Ok(match rec.get(key) {
                    Some(v) => Value::Some(Box::new(v.clone())),
                    None => Value::None,
                }),
                Value::None | Value::Missing => Ok(Value::None),
                other => Err(EvalError::new("BHC-E340", format!("field() on {}", other.type_name()))),
            },
            Err(e) => Err(e),
        },
        Builtin::GetOr => Ok(match one(0) {
            Value::Some(v) => (**v).clone(),
            Value::None | Value::Missing => one(1).clone(),
            other => other.clone(),
        }),
        Builtin::Has => match sym_of(one(1), it) {
            Ok(key) => Ok(Value::Bool(matches!(one(0), Value::Record(rec) if rec.get(key).is_some()))),
            Err(e) => Err(e),
        },
        Builtin::IsNum => Ok(Value::Bool(matches!(one(0), Value::Num(_)))),
        Builtin::IsList => Ok(Value::Bool(matches!(one(0), Value::List(_)))),
        Builtin::NumOf => match num_of(one(0)) {
            Some(n) => Ok(Value::Num(n)),
            None => Err(EvalError::new("BHC-E343", format!("num_of() on {}", one(0).type_name()))),
        },
        Builtin::SymOf => sym_of(one(0), it).map(Value::Sym),
        Builtin::StrLen => match text_str(one(0), it) {
            Some(t) => Ok(Value::Num(t.chars().count() as f64)),
            None => Err(EvalError::new("BHC-E344", format!("str_len() on {}", one(0).type_name()))),
        },
        Builtin::StrAt => match (text_str(one(0), it), num_of(one(1))) {
            (Some(t), Some(n)) => {
                Ok(Value::Num(t.chars().nth(n as usize).map(|c| c as u32 as f64).unwrap_or(f64::NAN)))
            }
            (None, _) => Err(EvalError::new("BHC-E344", format!("str_at() on {}", one(0).type_name()))),
            (_, None) => Err(EvalError::new("BHC-E311", "str_at() index must be a Num")),
        },
        Builtin::StrEq => match (text_str(one(0), it), text_str(one(1), it)) {
            (Some(a), Some(b)) => Ok(Value::Bool(a == b)),
            _ => Ok(Value::Bool(false)),
        },
        Builtin::Concat => match (as_slice(one(0)), as_slice(one(1))) {
            (Ok(x), Ok(y)) => {
                let mut xs: Vec<Value> = Vec::with_capacity(x.len() + y.len());
                xs.extend_from_slice(x);
                xs.extend_from_slice(y);
                match limit(interp, xs.len()) {
                    Ok(()) => Ok(Value::list(xs)),
                    Err(e) => Err(e),
                }
            }
            (Err(e), _) | (_, Err(e)) => Err(e),
        },
        Builtin::Min | Builtin::Max => match (need_num(one(0)), need_num(one(1))) {
            (Ok(x), Ok(y)) => Ok(Value::Num(canon(if b == Builtin::Min { wasm_min(x, y) } else { wasm_max(x, y) }))),
            (Err(e), _) | (_, Err(e)) => Err(e),
        },
        Builtin::Clamp => match (need_num(one(0)), need_num(one(1)), need_num(one(2))) {
            (Ok(v), Ok(lo), Ok(hi)) => Ok(Value::Num(canon(wasm_min(wasm_max(v, lo), hi)))),
            (Err(e), _, _) | (_, Err(e), _) | (_, _, Err(e)) => Err(e),
        },
        Builtin::Abs
        | Builtin::Floor
        | Builtin::Ceil
        | Builtin::Round
        | Builtin::RoundJs
        | Builtin::Trunc
        | Builtin::Sqrt
        | Builtin::Log => match need_num(one(0)) {
            Ok(x) => Ok(Value::Num(canon(match b {
                Builtin::Abs => libm::fabs(x),
                Builtin::Floor => libm::floor(x),
                Builtin::Ceil => libm::ceil(x),
                Builtin::Round => libm::round(x),
                Builtin::RoundJs => round_js(x),
                Builtin::Trunc => libm::trunc(x),
                Builtin::Sqrt => libm::sqrt(x),
                _ => libm::log(x),
            }))),
            Err(e) => Err(e),
        },
        _ => return None,
    })
}

#[inline(never)]
pub fn call(interp: &dyn Host, b: Builtin, args: Vec<Dist>) -> EResult<Dist> {
    match b {
        Builtin::Inf => Ok(Dist::One(Value::Num(f64::INFINITY))),
        Builtin::Nan => Ok(Dist::One(Value::Num(f64::from_bits(crate::value::CANON_NAN)))),
        Builtin::Min | Builtin::Max => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let c = it.next().unwrap();
            Dist::join(a, c, |x, y| {
                let x = need_num(&x)?;
                let y = need_num(&y)?;
                Ok(Value::Num(canon(if b == Builtin::Min { wasm_min(x, y) } else { wasm_max(x, y) })))
            })
        }
        Builtin::Clamp => {
            let mut it = args.into_iter();
            let x = it.next().unwrap();
            let lo = it.next().unwrap();
            let hi = it.next().unwrap();
            let lh = Dist::join(lo, hi, |l, h| Ok(Value::tuple(vec![l, h])))?;
            Dist::join(x, lh, |v, bounds| {
                let v = need_num(&v)?;
                let (lo, hi) = match bounds {
                    Value::Tuple(t) => (need_num(&t[0])?, need_num(&t[1])?),
                    other => {
                        return Err(EvalError::new(
                            "BHC-E333",
                            format!("clamp bounds must be a pair, got {}", other.type_name()),
                        ))
                    }
                };
                Ok(Value::Num(canon(wasm_min(wasm_max(v, lo), hi))))
            })
        }
        Builtin::Abs
        | Builtin::Floor
        | Builtin::Ceil
        | Builtin::Round
        | Builtin::RoundJs
        | Builtin::Trunc
        | Builtin::Sqrt
        | Builtin::Log => {
            let a = args.into_iter().next().unwrap();
            a.try_map(|v| {
                let x = need_num(&v)?;
                Ok(Value::Num(canon(match b {
                    Builtin::Abs => libm::fabs(x),
                    Builtin::Floor => libm::floor(x),
                    Builtin::Ceil => libm::ceil(x),
                    Builtin::Round => libm::round(x),
                    // JS Math.round: half-up toward +inf, preserving -0.
                    Builtin::RoundJs => round_js(x),
                    Builtin::Trunc => libm::trunc(x),
                    Builtin::Sqrt => libm::sqrt(x),
                    Builtin::Log => libm::log(x),
                    _ => unreachable!(),
                })))
            })
        }
        Builtin::Pow => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let c = it.next().unwrap();
            Dist::join(a, c, |x, _y| Ok(Value::Num(canon(need_num(&x)?))))
        }
        Builtin::SafeDiv => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let c = it.next().unwrap();
            Dist::join(a, c, |x, y| {
                let x = need_num(&x)?;
                let y = need_num(&y)?;
                Ok(Value::Num(if y == 0.0 { 0.0 } else { canon(x / y) }))
            })
        }
        Builtin::ToFixed => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let d = it.next().unwrap();
            Dist::join(a, d, |x, n| {
                let x = need_num(&x)?;
                let n = need_num(&n)?;
                Ok(Value::Num(canon(to_fixed(x, n as i32))))
            })
        }
        Builtin::Len => {
            let a = args.into_iter().next().unwrap();
            a.try_map(|v| Ok(Value::Num(len_of(&v)? as f64)))
        }
        Builtin::At => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let i = it.next().unwrap();
            Dist::join(a, i, |v, iv| {
                let n = num_of(&iv).ok_or_else(|| EvalError::new("BHC-E311", "at() index must be a Num"))?;
                let i = n.max(0.0) as usize;
                match v {
                    Value::List(xs) | Value::Tuple(xs) => Ok(xs.get(i).cloned().unwrap_or(Value::Missing)),
                    other => Err(EvalError::new("BHC-E336", format!("at() on {}", other.type_name()))),
                }
            })
        }
        Builtin::Slice => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let s = it.next().unwrap();
            let e = it.next().unwrap();
            let bounds = Dist::join(s, e, |x, y| {
                Ok(Value::tuple(vec![Value::Num(need_num(&x)?), Value::Num(need_num(&y)?)]))
            })?;
            Dist::join(a, bounds, |v, bnd| {
                let xs = as_slice(&v)?;
                let (s, e) = match bnd {
                    Value::Tuple(t) => (need_num(&t[0])? as usize, need_num(&t[1])? as usize),
                    _ => (0, 0),
                };
                let s = s.min(xs.len());
                let e = e.min(xs.len()).max(s);
                Ok(Value::list(xs[s..e].to_vec()))
            })
        }
        Builtin::Concat => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let c = it.next().unwrap();
            Dist::join(a, c, |x, y| {
                let mut xs = as_list(&x)?;
                xs.extend(as_list(&y)?);
                limit(interp, xs.len())?;
                Ok(Value::list(xs))
            })
        }
        Builtin::Map => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let f = it.next().unwrap();
            map_like(interp, xs, f, false)
        }
        Builtin::ConcatMap => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let f = it.next().unwrap();
            map_like(interp, xs, f, true)
        }
        Builtin::Filter => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let f = it.next().unwrap();
            filter_map(interp, xs, f, FilterKind::Keep)
        }
        Builtin::Count => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let f = it.next().unwrap();
            filter_map(interp, xs, f, FilterKind::Count)
        }
        Builtin::Find => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let f = it.next().unwrap();
            filter_map(interp, xs, f, FilterKind::First)
        }
        // `fold2`: same as `fold`, but each element must be a pair and the closure takes the two
        // components — the pack's `(Mod, Num)` lists no longer pay `at(e,0)`/`at(e,1)` per element.
        Builtin::Fold2 => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let init = it.next().unwrap();
            let f = it.next().unwrap();
            let xs_pts = xs.points();
            let init_pts = init.points();
            let f_pts = f.points();
            let mut out = Vec::new();
            for xp in &xs_pts {
                let items = as_slice(&xp.v)?.to_vec();
                for ip in &init_pts {
                    for fp in &f_pts {
                        let fv = fp.v.clone();
                        let mut acc = Dist::One(ip.v.clone());
                        for item in &items {
                            let pair = match item {
                                Value::Tuple(t) | Value::List(t) if t.len() == 2 => t,
                                other => {
                                    return Err(EvalError::new(
                                        "BHC-E350",
                                        format!("fold2 needs pairs, got {}", other.type_name()),
                                    ))
                                }
                            };
                            let (a0, a1) = (pair[0].clone(), pair[1].clone());
                            acc = match acc {
                                Dist::One(a) => interp.call_plain(&fv, &[a, a0, a1])?,
                                many => {
                                    let fv2 = fv.clone();
                                    Dist::chain(many, move |a| {
                                        call_value(
                                            interp,
                                            &Dist::One(fv2.clone()),
                                            vec![Dist::One(a), Dist::One(a0.clone()), Dist::One(a1.clone())],
                                        )
                                    })?
                                }
                            };
                        }
                        for p in acc.points() {
                            out.push(Pt {
                                w: xp.w * ip.w * fp.w * p.w,
                                assigns: Rc::new(merge(&merge(&xp.assigns, &ip.assigns), &merge(&fp.assigns, &p.assigns))),
                                v: p.v,
                            });
                        }
                    }
                }
            }
            Ok(single_or_many(out))
        }
        Builtin::Any | Builtin::All => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let f = it.next().unwrap();
            let all = b == Builtin::All;
            let pts = xs.points();
            let mut out = Vec::new();
            for xp in pts {
                let items = as_slice(&xp.v)?;
                let mut acc: Option<Dist> = None;
                for (i, it) in items.iter().enumerate() {
                    let r = call_value(interp, &f, vec![Dist::One(it.clone())])?;
                    acc = Some(match acc {
                        None => r,
                        Some(prev) => {
                            let all_flag = all;
                            Dist::join(prev, r, move |a, c| {
                                Ok(Value::Bool(if all_flag {
                                    a.truthy() && c.truthy()
                                } else {
                                    a.truthy() || c.truthy()
                                }))
                            })?
                        }
                    });
                    let _ = i;
                }
                let final_d = acc.unwrap_or(Dist::One(Value::Bool(all)));
                for p in final_d.points() {
                    out.push(Pt {
                        w: xp.w * p.w,
                        assigns: Rc::new(merge(&xp.assigns, &p.assigns)),
                        v: p.v,
                    });
                }
            }
            Ok(single_or_many(out))
        }
        Builtin::Fold => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let init = it.next().unwrap();
            let f = it.next().unwrap();
            fold(interp, xs, init, f)
        }
        Builtin::SortBy => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let f = it.next().unwrap();
            sort_by(interp, xs, f)
        }
        Builtin::Take | Builtin::Drop => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let n = it.next().unwrap();
            let take = b == Builtin::Take;
            Dist::join(xs, n, move |v, nv| {
                let xs = as_slice(&v)?;
                let n = (need_num(&nv)?.max(0.0) as usize).min(xs.len());
                Ok(if take { Value::list(xs[..n].to_vec()) } else { Value::list(xs[n..].to_vec()) })
            })
        }
        Builtin::Zip => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let c = it.next().unwrap();
            Dist::join(a, c, |x, y| {
                let xs = as_list(&x)?;
                let ys = as_list(&y)?;
                Ok(Value::list(
                    xs.iter().zip(ys.iter()).map(|(a, c)| Value::tuple(vec![a.clone(), c.clone()])).collect(),
                ))
            })
        }
        // `keys(rec)`：字段名按插入序返回（`Record` 的顺序是可观察的，与 `fold` 一致）。
        // 非记录返回空列表，让 pack 能对 `Missing`/裸值做统一处理。
        Builtin::Keys => {
            let rec = args.into_iter().next().unwrap();
            // `Some(record)` 视同该记录：`加成`/`生效` 这类可选记录是最常见的入参。
            fn key_list(v: &Value) -> Vec<Value> {
                match v {
                    Value::Record(r) => r.fields.iter().map(|(k, _)| Value::Sym(*k)).collect(),
                    Value::Some(inner) => key_list(inner),
                    _ => Vec::new(),
                }
            }
            Ok(rec.map(|v| Value::list(key_list(&v))))
        }
        // `group_sum(pairs)`：按 `(Sym, Num)` 的键归并求和，键按首次出现排序。
        // 这是「一遍遍历累加」的通用形式：pack 只需产出贡献列表，合并交给引擎。
        Builtin::GroupSum => {
            let xs = args.into_iter().next().unwrap();
            let vals = as_slice(xs.single().ok_or_else(|| {
                EvalError::new("BHC-E347", "group_sum over a distribution needs `expected` first")
            })?)?;
            {
                let mut keys: Vec<crate::sym::Sym> = Vec::new();
                let mut sums: Vec<f64> = Vec::new();
                for it in vals.iter() {
                    let (k, n) = match it {
                        Value::Tuple(t) if t.len() == 2 => {
                            let k = sym_of(&t[0], interp.interner())?;
                            let n = num_of(&t[1]).ok_or_else(|| {
                                EvalError::new("BHC-E347", "group_sum needs (Sym, Num) pairs")
                            })?;
                            (k, n)
                        }
                        other => {
                            return Err(EvalError::new(
                                "BHC-E347",
                                format!("group_sum needs (Sym, Num) pairs, got {}", other.type_name()),
                            ))
                        }
                    };
                    match keys.iter().position(|x| *x == k) {
                        Some(i) => sums[i] += n,
                        None => {
                            keys.push(k);
                            sums.push(n);
                        }
                    }
                }
                let mut out = crate::value::Record::new();
                for (k, n) in keys.into_iter().zip(sums) {
                    out.set(k, Value::Num(n));
                }
                Ok(Dist::One(Value::record(out)))
            }
        }
        // `dedup_by(xs, key)`：保留每个键的**首次**出现，顺序不变。
        // 把「查首个匹配」这类 O(n²) 扫描压成一次线性遍历。
        Builtin::DedupBy => {
            let mut it = args.into_iter();
            let xs = it.next().unwrap();
            let f = it.next().unwrap();
            let items = as_slice(xs.single().ok_or_else(|| {
                EvalError::new("BHC-E348", "dedup_by over a distribution needs `expected` first")
            })?)?;
            let fv = f.single().ok_or_else(|| {
                EvalError::new("BHC-E348", "dedup_by key function must be single-valued")
            })?.clone();
            let mut keys: Vec<Value> = Vec::new();
            let mut out: Vec<Value> = Vec::new();
            for item in items.iter() {
                let k = call_value(interp, &Dist::One(fv.clone()), vec![Dist::One(item.clone())])?;
                let Some(k) = k.single().cloned() else {
                    return Err(EvalError::new("BHC-E348", "dedup_by key must be single-valued"));
                };
                if keys.iter().any(|seen| crate::value::same(seen, &k)) {
                    continue;
                }
                keys.push(k);
                out.push(item.clone());
            }
            Ok(Dist::One(Value::list(out)))
        }
        Builtin::Field => {
            let mut it = args.into_iter();
            let rec = it.next().unwrap();
            let k = it.next().unwrap();
            Dist::join(rec, k, |r, kv| {
                let key = sym_of(&kv, interp.interner())?;
                Ok(match r {
                    Value::Record(rec) => match rec.get(key) {
                        Some(v) => Value::Some(Box::new(v.clone())),
                        None => Value::None,
                    },
                    Value::None | Value::Missing => Value::None,
                    other => {
                        return Err(EvalError::new("BHC-E340", format!("field() on {}", other.type_name())))
                    }
                })
            })
        }
        Builtin::GetOr => {
            let mut it = args.into_iter();
            let opt = it.next().unwrap();
            let d = it.next().unwrap();
            Dist::join(opt, d, |o, dv| {
                Ok(match o {
                    Value::Some(v) => *v,
                    Value::None | Value::Missing => dv,
                    other => other,
                })
            })
        }
        Builtin::Has => {
            let mut it = args.into_iter();
            let rec = it.next().unwrap();
            let k = it.next().unwrap();
            Dist::join(rec, k, |r, kv| {
                let key = sym_of(&kv, interp.interner())?;
                Ok(Value::Bool(match r {
                    Value::Record(rec) => rec.get(key).is_some(),
                    _ => false,
                }))
            })
        }
        Builtin::Update => {
            let mut it = args.into_iter();
            let rec = it.next().unwrap();
            let upd = it.next().unwrap();
            Dist::join(rec, upd, |r, u| {
                let mut base = match r {
                    Value::Record(r) => (*r).clone(),
                    other => return Err(EvalError::new("BHC-E341", format!("update() on {}", other.type_name()))),
                };
                match u {
                    Value::Record(ur) => {
                        for (k, v) in &ur.fields {
                            base.set(*k, v.clone());
                        }
                    }
                    other => {
                        return Err(EvalError::new(
                            "BHC-E342",
                            format!("update() patch must be a record, got {}", other.type_name()),
                        ))
                    }
                }
                Ok(Value::record(base))
            })
        }
        // 类型谓词：宿主数据可能在同一字段里混放标量与数组，pack 需要按形状分派。
        // 这两个是语言原语（不含任何游戏概念）。
        Builtin::IsNum | Builtin::IsList => {
            let a = args.into_iter().next().unwrap();
            a.try_map(|v| {
                let hit = if b == Builtin::IsNum {
                    matches!(v, Value::Num(_))
                } else {
                    matches!(v, Value::List(_))
                };
                Ok(Value::Bool(hit))
            })
        }
        // 文本索引：`Sym` 与 `Str` 都按 Unicode 标量取值（与 JS `charCodeAt` 的 BMP 口径一致）。
        Builtin::StrLen => {
            let a = args.into_iter().next().unwrap();
            a.try_map(|v| match text_str(&v, interp.interner()) {
                Some(t) => Ok(Value::Num(t.chars().count() as f64)),
                None => Err(EvalError::new("BHC-E344", format!("str_len() on {}", v.type_name()))),
            })
        }
        Builtin::StrAt => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let b = it.next().unwrap();
            Dist::join(a, b, |text, index| {
                let Some(t) = text_str(&text, interp.interner()) else {
                    return Err(EvalError::new("BHC-E344", format!("str_at() on {}", text.type_name())));
                };
                let i = need_num(&index)? as usize;
                Ok(Value::Num(t.chars().nth(i).map(|c| c as u32 as f64).unwrap_or(f64::NAN)))
            })
        }
        Builtin::StrSlice => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let b = it.next().unwrap();
            let c = it.next().unwrap();
            Dist::join(Dist::join(a, b, |t, i| Ok(Value::tuple(alloc::vec![t, i])))?, c, |pair, j| {
                let (text, from) = match pair {
                    Value::Tuple(t) if t.len() == 2 => (t[0].clone(), t[1].clone()),
                    other => (other, Value::Num(0.0)),
                };
                let Some(t) = text_str(&text, interp.interner()) else {
                    return Err(EvalError::new("BHC-E344", format!("str_slice() on {}", text.type_name())));
                };
                let lo = need_num(&from)?.max(0.0) as usize;
                let hi = need_num(&j)?.max(0.0) as usize;
                let s: alloc::string::String = t.chars().skip(lo).take(hi.saturating_sub(lo)).collect();
                Ok(Value::Str(s.into()))
            })
        }
        Builtin::StrEq => {
            let mut it = args.into_iter();
            let a = it.next().unwrap();
            let b = it.next().unwrap();
            Dist::join(a, b, |x, y| {
                let (Some(xs), Some(ys)) = (text_str(&x, interp.interner()), text_str(&y, interp.interner())) else {
                    return Ok(Value::Bool(false));
                };
                Ok(Value::Bool(xs == ys))
            })
        }
        Builtin::SymOf => {
            let a = args.into_iter().next().unwrap();
            a.try_map(|v| Ok(Value::Sym(sym_of(&v, interp.interner())?)))
        }
        Builtin::NumOf => {
            let a = args.into_iter().next().unwrap();
            a.try_map(|v| {
                num_of(&v).map(Value::Num).ok_or_else(|| {
                    EvalError::new("BHC-E343", format!("num_of() on {}", v.type_name()))
                })
            })
        }
        Builtin::Fix => {
            let mut it = args.into_iter();
            let init = it.next().unwrap();
            let step = it.next().unwrap();
            let done = it.next().unwrap();
            let max = it.next().unwrap();
            fix(interp, init, step, done, max)
        }
        Builtin::Choice | Builtin::Expected => {
            Err(EvalError::new("BHC-E350", "choice/expected must be lowered, not called"))
        }
        Builtin::Trace => Err(EvalError::new(
            "BHC-E351",
            "trace() is an observation primitive; it is invoked by the host through `bhub_trace`",
        )),
    }
}

fn limit(interp: &dyn Host, len: usize) -> EResult<()> {
    if len > interp.budget().len_limit {
        return Err(EvalError::new("BHC-E302", format!("list length {len} exceeds len_limit {}", interp.budget().len_limit)));
    }
    Ok(())
}

/// Collapse a one-point support set back to a plain value so every expression that carries no
/// `choice` stays on the single-value path (spec §9.8.13, G17).
fn single_or_many(mut pts: Vec<Pt>) -> Dist {
    if pts.len() == 1 {
        Dist::One(pts.pop().expect("one point").v)
    } else {
        Dist::Many(pts)
    }
}

fn need_num(v: &Value) -> EResult<f64> {
    num_of(v).ok_or_else(|| EvalError::new("BHC-E335", format!("expected Num, got {}", v.type_name())))
}

pub fn round_js(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let f = libm::floor(x);
    let diff = x - f;
    let r = if diff >= 0.5 { f + 1.0 } else { f };
    // Preserve -0 for values in (-0.5, -0]: JS Math.round(-0.2) === -0.
    if r == 0.0 && x.is_sign_negative() { -0.0 } else { r }
}

fn merge(a: &[crate::value::Assign], b: &[crate::value::Assign]) -> Vec<crate::value::Assign> {
    let mut out = a.to_vec();
    for y in b {
        if !out.iter().any(|x| x.choice == y.choice) {
            out.push(y.clone());
        }
    }
    out.sort_by_key(|x| x.choice);
    out
}

/// Invoke a first-class function value on concrete arguments.
pub fn call_value(interp: &dyn Host, f: &Dist, args: Vec<Dist>) -> EResult<Dist> {
    interp.call_value(f.clone(), args)
}

fn map_like(interp: &dyn Host, xs: Dist, f: Dist, flatten: bool) -> EResult<Dist> {
    let xs_pts = xs.points();
    let f_pts = f.points();
    let mut out = Vec::new();
    for xp in &xs_pts {
        let items = as_list(&xp.v)?;
        for fp in &f_pts {
            // Element results may themselves be distributions; chain them so their choices are
            // independent instances but stay correctly weighted.
            let mut state = Dist::One(Value::list(Vec::new()));
            for it in &items {
                let acc_before = state;
                let item = it.clone();
                let fv = fp.v.clone();
                state = Dist::chain(acc_before, move |acc| {
                    let r = call_value(interp, &Dist::One(fv.clone()), vec![Dist::One(item.clone())])?;
                    r.try_map(move |v| {
                        let mut xs = match &acc {
                            Value::List(xs) => (**xs).clone(),
                            other => vec![other.clone()],
                        };
                        match (flatten, v) {
                            (true, Value::List(inner)) => xs.extend((*inner).clone()),
                            (_, v) => xs.push(v),
                        }
                        Ok(Value::list(xs))
                    })
                })?;
            }
            for p in state.points() {
                out.push(Pt {
                    w: xp.w * fp.w * p.w,
                    assigns: Rc::new(merge(&merge(&xp.assigns, &fp.assigns), &p.assigns)),
                    v: p.v,
                });
            }
        }
    }
    Ok(single_or_many(out))
}

enum FilterKind {
    Keep,
    Count,
    First,
}

fn filter_map(interp: &dyn Host, xs: Dist, f: Dist, kind: FilterKind) -> EResult<Dist> {
    let xs_pts = xs.points();
    let f_pts = f.points();
    let mut out = Vec::new();
    for xp in &xs_pts {
        let items = as_list(&xp.v)?;
        for fp in &f_pts {
            let fv = fp.v.clone();
            let mut kept: Vec<Value> = Vec::new();
            let mut count = 0.0;
            let mut first: Option<Value> = None;
            let mut matched: Vec<Dist> = Vec::new();
            for it in &items {
                let r = interp.call_plain(&fv, &[it.clone()])?;
                match r.single() {
                    Some(v) => {
                        if v.truthy() {
                            count += 1.0;
                            kept.push(it.clone());
                            if first.is_none() {
                                first = Some(it.clone());
                            }
                        }
                    }
                    None => matched.push(r),
                }
            }
            let value = match kind {
                FilterKind::Keep => Value::list(kept),
                FilterKind::Count => Value::Num(count),
                // `find` yields `Option<T>` (spec §3.3 pattern list includes `some(...)`).
                FilterKind::First => match first {
                    Some(v) => Value::Some(Box::new(v)),
                    None => Value::None,
                },
            };
            if matched.is_empty() {
                out.push(Pt {
                    w: xp.w * fp.w,
                    assigns: Rc::new(merge(&xp.assigns, &fp.assigns)),
                    v: value,
                });
            } else {
                // Predicate results were distributions: merge them pointwise.
                let mut acc = Dist::One(value);
                for m in matched {
                    acc = Dist::join(acc, m, |a, _| Ok(a))?;
                }
                for p in acc.points() {
                    out.push(Pt {
                        w: xp.w * fp.w * p.w,
                        assigns: Rc::new(merge(&xp.assigns, &p.assigns)),
                        v: p.v,
                    });
                }
            }
        }
    }
    Ok(single_or_many(out))
}

fn fold(interp: &dyn Host, xs: Dist, init: Dist, f: Dist) -> EResult<Dist> {
    let xs_pts = xs.points();
    let init_pts = init.points();
    let f_pts = f.points();
    let mut out = Vec::new();
    for xp in &xs_pts {
        let items = as_list(&xp.v)?;
        for ip in &init_pts {
            for fp in &f_pts {
                let mut acc = Dist::One(ip.v.clone());
                for it in &items {
                    let fv = fp.v.clone();
                    let item = it.clone();
                    // Single-valued accumulators are the norm; apply the closure without building
                    // an argument vector for every element.
                    acc = match acc {
                        Dist::One(a) => interp.call_plain(&fv, &[a, item])?,
                        many => Dist::chain(many, move |a| {
                            call_value(interp, &Dist::One(fv.clone()), vec![Dist::One(a), Dist::One(item.clone())])
                        })?,
                    };
                }
                for p in acc.points() {
                    out.push(Pt {
                        w: xp.w * ip.w * fp.w * p.w,
                        assigns: Rc::new(merge(&merge(&xp.assigns, &ip.assigns), &merge(&fp.assigns, &p.assigns))),
                        v: p.v,
                    });
                }
            }
        }
    }
    Ok(single_or_many(out))
}

fn sort_by(interp: &dyn Host, xs: Dist, f: Dist) -> EResult<Dist> {
    let xs_pts = xs.points();
    let f_pts = f.points();
    let mut out = Vec::new();
    for xp in &xs_pts {
        let items = as_list(&xp.v)?;
        for fp in &f_pts {
            let mut keyed: Vec<(Value, Value)> = Vec::with_capacity(items.len());
            for it in &items {
                let k = call_value(interp, &Dist::One(fp.v.clone()), vec![Dist::One(it.clone())])?;
                keyed.push((k.expect()?, it.clone()));
            }
            // Stable ascending sort on the key; equal keys keep input order (spec §2.3: the pack
            // decides order, the engine must not reshuffle).
            keyed.sort_by(|a, b| key_cmp(&a.0, &b.0));
            let sorted: Vec<Value> = keyed.into_iter().map(|(_, v)| v).collect();
            out.push(Pt {
                w: xp.w * fp.w,
                assigns: Rc::new(merge(&xp.assigns, &fp.assigns)),
                v: Value::list(sorted),
            });
        }
    }
    Ok(single_or_many(out))
}

fn key_cmp(a: &Value, b: &Value) -> core::cmp::Ordering {
    match (a, b) {
        (Value::Num(x), Value::Num(y)) => {
            // NaN sorts last, deterministically.
            match (x.is_nan(), y.is_nan()) {
                (true, true) => core::cmp::Ordering::Equal,
                (true, false) => core::cmp::Ordering::Greater,
                (false, true) => core::cmp::Ordering::Less,
                _ => x.partial_cmp(y).unwrap_or(core::cmp::Ordering::Equal),
            }
        }
        (Value::Sym(x), Value::Sym(y)) => x.0.cmp(&y.0),
        (Value::Str(x), Value::Str(y)) => x.cmp(y),
        (Value::Bool(x), Value::Bool(y)) => x.cmp(y),
        _ => core::cmp::Ordering::Equal,
    }
}

fn fix(interp: &dyn Host, init: Dist, step: Dist, done: Dist, max: Dist) -> EResult<Dist> {
    let rounds = match max.single() {
        Some(v) => need_num(v)?.max(0.0) as u32,
        None => return Err(EvalError::new("BHC-E318", "fix() round limit must be a plain Num")),
    };
    let mut state = init;
    for round in 0..rounds {
        let sv = Dist::One(state_points_single(&state)?);
        let done_v = call_value(interp, &done, vec![sv.clone()])?;
        if done_v.single().is_some_and(|v| v.truthy()) {
            return Ok(state);
        }
        let stepped = call_value(interp, &step, vec![sv])?;
        state = stepped;
        // Guard against a silently unbounded loop; the fuel check also covers it.
        let _ = round;
    }
    Ok(state)
}

fn state_points_single(d: &Dist) -> EResult<Value> {
    match d.single() {
        Some(v) => Ok(v.clone()),
        None => Err(EvalError::new(
            "BHC-E352",
            "fix() requires a single-valued state; distributions must be collapsed with expected()",
        )),
    }
}
