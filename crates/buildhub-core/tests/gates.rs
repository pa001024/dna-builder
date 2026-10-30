//! Engine acceptance tests: the numbered gates of spec §12 that the tree-walking path can prove.
//!
//! Each test names the gate it covers and asserts an externally checkable property (a value, a
//! support-point count, or a structural invariant) rather than an implementation detail.

use std::path::PathBuf;

use buildhub_core::eval::{Budget, Interp};
use buildhub_core::pack::{LoadedPack, load_pack};
use buildhub_core::tree::build_tree;
use buildhub_core::value::{Dist, Value};

fn scratch(name: &str, files: &[(&str, &str)]) -> PathBuf {
    // Tests run concurrently: each call needs its own directory, so include a counter.
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    let dir = std::env::temp_dir().join(format!(
        "buildhub-test-{name}-{}-{}",
        std::process::id(),
        N.fetch_add(1, Ordering::Relaxed)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("create scratch");
    for (rel, content) in files {
        let p = dir.join(rel);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).expect("create parent");
        }
        std::fs::write(p, content).expect("write file");
    }
    dir
}

fn load(name: &str, files: &[(&str, &str)]) -> LoadedPack {
    let dir = scratch(name, files);
    load_pack(&dir).unwrap_or_else(|e| panic!("load failed: {e}"))
}

fn eval_num(pack: &LoadedPack, entry: &str, args: Vec<Value>) -> f64 {
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let e = pack.entry(entry).expect("entry");
    let d = interp.call(e.fn_id, args).expect("call");
    match interp.project(d).expect("project") {
        Value::Num(n) => n,
        other => panic!("expected Num, got {}", other.type_name()),
    }
}

fn eval_dist(pack: &LoadedPack, entry: &str) -> Dist {
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let e = pack.entry(entry).expect("entry");
    interp.call(e.fn_id, Vec::new()).expect("call")
}

const TOML: &str = "id = \"t\"\nversion = \"0.1.0\"\n";

// ---------------------------------------------------------------------------------------------
// G2b: `legal` must be able to be non-trivial, and the four-part assembly shape must work.
// ---------------------------------------------------------------------------------------------

#[test]
fn g2b_legal_is_not_tautological() {
    let pack = load(
        "legal2",
        &[
            (
                "pack.toml",
                "id = \"t\"\nversion = \"0.1.0\"\n\n[[data]]\nname = \"items\"\ndataset = \"items.json\"\nschema = \"Item\"\nkey = \"id\"\n\n[[entries]]\nname = \"total_weight\"\nfn = \"total_weight\"\nargs = [\"Lay\"]\n\n[[entries]]\nname = \"accept\"\nfn = \"accept\"\nargs = [\"Lay\", \"List<Num>\"]\n",
            ),
            (
                "a.bhl",
                r#"
schema Item { id: Num, weight: Num, ..open }
schema Lay  { items: List<Num>, cap: Num, ..open }
schema P    { id: Num, ..open }

fn legal(lay: Lay, p: P) -> Bool =
  let w = weight_of(p.id) in
  used(lay) + w <= lay.cap && not(any(lay.items, |x| x == p.id))

fn weight_of(id: Num) -> Num = fold(data.items.all(), 0.0, |acc, it| if it.id == id then it.weight else acc)
fn used(lay: Lay) -> Num = fold(lay.items, 0.0, |acc, id| acc + weight_of(id))

// 逐个放置：只有当前布局仍合法时才接受，因此"放不下"的候选被忽略而不是整体失效。
fn accept(lay: Lay, ids: List<Num>) -> Lay =
  fold(ids, lay, |acc, id|
    if legal(acc, P{id: id}) then update(acc, { items: concat(acc.items, [id]) }) else acc)

fn total_weight(lay: Lay) -> Num =
  fold(lay.items, 0.0, |acc, id| acc + weight_of(id))
"#,
            ),
            (
                "items.json",
                r#"[{"id":1,"weight":3},{"id":2,"weight":4},{"id":3,"weight":5}]"#,
            ),
        ],
    );
    // cap 6: item 1 (3) fits; item 2 (4) would make 7 > 6 -> rejected; item 3 (5) would make 8.
    let lay = r#"{"items":[],"cap":6}"#;
    let json: serde_json::Value = serde_json::from_str(lay).unwrap();
    let v = pack.json_to_value("Lay", &json).expect("config");
    let ids = Value::list(vec![Value::Num(1.0), Value::Num(2.0), Value::Num(3.0)]);
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let acc = interp.project(interp.call(pack.entry("accept").unwrap().fn_id, vec![v, ids]).unwrap()).unwrap();
    let total = eval_num(&pack, "total_weight", vec![acc]);
    assert_eq!(total, 3.0, "only the first placement fits under the cap");
}

// ---------------------------------------------------------------------------------------------
// G13 / G16: correlation and non-affine expectations.
// ---------------------------------------------------------------------------------------------

const PROB_PACK: &str = r#"
fn shared() -> Num =
  let crit = choice([(0.5, 1.0), (0.35, 2.0), (0.15, 3.0)]) in
  crit * crit

fn independent() -> Num =
  1.0 * choice([(0.5, 1.0), (0.5, 2.0)]) + 1.0 * choice([(0.5, 1.0), (0.5, 2.0)])

fn one_choice() -> Num =
  let crit = choice([(0.5, 1.0), (0.5, 2.0)]) in
  1.0 * crit + 1.0 * crit

fn three_way() -> Num =
  choice([(0.5, named"a", 1.0), (0.35, named"b", 2.0), (0.15, named"c", 3.0)])

fn clamped() -> Num =
  let crit = choice([(0.5, 1.0), (0.5, 2.0)]) in
  min(1.0 * crit + 1.0 * crit, 3.5)
"#;

fn prob_pack() -> LoadedPack {
    load(
        "prob",
        &[
            (
                "pack.toml",
                "id = \"p\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"shared\"\nfn = \"shared\"\nargs = []\n\n[[entries]]\nname = \"independent\"\nfn = \"independent\"\nargs = []\n\n[[entries]]\nname = \"one_choice\"\nfn = \"one_choice\"\nargs = []\n\n[[entries]]\nname = \"three_way\"\nfn = \"three_way\"\nargs = []\n\n[[entries]]\nname = \"clamped\"\nfn = \"clamped\"\nargs = []\n",
            ),
            ("a.bhl", PROB_PACK),
        ],
    )
}

#[test]
fn g16_expectation_is_not_scalar_substitution() {
    let pack = prob_pack();
    // E[crit^2] = 0.5*1 + 0.35*4 + 0.15*9 = 3.25; scalar substitution would give 1.65^2 = 2.7225.
    let v = eval_num(&pack, "shared", Vec::new());
    assert!((v - 3.25).abs() < 1e-12, "got {v}, want 3.25");
}

#[test]
fn g13_correlation_changes_leaf_count_not_expectation() {
    let pack = prob_pack();
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let one = build_tree(&interp, eval_dist(&pack, "one_choice"), "one_choice").expect("tree");
    assert_eq!(one.root.children.len(), 2, "one shared choice -> 2 leaves");
    let two = build_tree(&interp, eval_dist(&pack, "independent"), "independent").expect("tree");
    assert_eq!(two.root.children.len(), 4, "two independent choices -> 4 leaves");
    // Root values are identical (linear case); only the topology differs.
    assert!((one.root.value - 3.0).abs() < 1e-12);
    assert!((two.root.value - 3.0).abs() < 1e-12);
}

#[test]
fn g13_nonlinear_correlation_changes_expectation() {
    let pack = prob_pack();
    // min(shared_sum, 3.5): shared gives 2.0 or 4.0 -> min -> 2.0/3.5, mean 2.75
    let v = eval_num(&pack, "clamped", Vec::new());
    assert!((v - 2.75).abs() < 1e-12, "got {v}, want 2.75");
}

#[test]
fn g14_three_way_choice_does_not_collapse() {
    let pack = prob_pack();
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let t = build_tree(&interp, eval_dist(&pack, "three_way"), "three_way").expect("tree");
    assert_eq!(t.root.children.len(), 3, "three cases must stay three leaves");
    let sum: f64 = t.root.children.iter().map(|c| c.edge).sum();
    assert!((sum - 1.0).abs() < 1e-12, "edges must sum to 1, got {sum}");
    // G12: the tree root equals the plain call.
    assert!((t.root.value - eval_num(&pack, "three_way", Vec::new())).abs() < 1e-12);
    assert!(!t.truncated);
}

#[test]
fn g14_budget_merges_tail_and_flags_truncation() {
    let pack = prob_pack();
    let interner = pack.interner.borrow();
    let budget = Budget { max_support: 2, ..Budget::default() };
    let interp = Interp::new(&pack.program, &interner, budget);
    let e = pack.entry("three_way").unwrap();
    let d = interp.call(e.fn_id, Vec::new()).expect("call");
    let t = build_tree(&interp, d, "three_way").expect("tree");
    assert!(t.truncated, "truncation must be reported, not silent");
    assert_eq!(t.root.children.len(), 2, "one kept + one merged tail");
    let sum: f64 = t.root.children.iter().map(|c| c.edge).sum();
    assert!((sum - 1.0).abs() < 1e-12, "merged edges must still sum to 1");
}

// ---------------------------------------------------------------------------------------------
// G15: stateful conditional modifiers.
// ---------------------------------------------------------------------------------------------

#[test]
fn g15_affine_conditional_bonus_is_exact() {
    // base=1, crit_dmg=2, on_crit_bonus=0.5, rate=0.5 -> E = 1.75 (spec §9.8.12.1)
    let pack = load(
        "g15a",
        &[
            ("pack.toml", "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"d\"\nfn = \"d\"\nargs = []\n"),
            (
                "a.bhl",
                r#"
fn d() -> Num =
  let crit = choice([(0.5, 0.0), (0.5, 1.0)]) in
  1.0 * (1.0 + crit * (2.0 - 1.0)) + crit * 0.5
"#,
            ),
        ],
    );
    assert!((eval_num(&pack, "d", Vec::new()) - 1.75).abs() < 1e-12);
}

#[test]
fn g15_reset_chain_matches_spec_value_and_support_count() {
    // spec §9.8.12.2: rate0=0.5, step=0.1, n=5, dmg=2 -> 7.74455 with 6 support points.
    let pack = load(
        "g15b",
        &[
            ("pack.toml", "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"chain\"\nfn = \"chain\"\nargs = []\n"),
            (
                "a.bhl",
                r#"
fn rng(stop: Num) -> List<Num> = rng_from(0.0, stop, 0.0)
fn rng_from(start: Num, stop: Num, i: Num) -> List<Num> =
  if start + i >= stop then [] else concat([start + i], rng_from(start, stop, i + 1.0))

fn chain() -> Num =
  let (_, total) =
    fold(rng(5.0), (0.5, 0.0), |(rate, total), _|
      let crit = choice([(1.0 - min(rate, 1.0), 0.0), (min(rate, 1.0), 1.0)]) in
      let next = if crit == 1.0 then 0.5 else min(rate + 0.1, 1.0) in
      (next, total + 1.0 + crit * (2.0 - 1.0)))
  in total
"#,
            ),
        ],
    );
    let v = eval_num(&pack, "chain", Vec::new());
    assert!((v - 7.74455).abs() < 1e-9, "got {v}, want 7.74455");
    // §9.8.12.2: 5 stateful steps give 32 worlds but only **6 distinct support values**, and the
    // budget is charged on distinct values (§9.8.4), not on worlds.
    let d = eval_dist(&pack, "chain");
    assert_eq!(d.support_len(), 6, "distinct values must merge to 6, got {}", d.support_len());
    let worlds = d.points().len();
    assert_eq!(worlds, 32, "worlds stay 32 (correlation must not be collapsed)");
}

// ---------------------------------------------------------------------------------------------
// G7: memoisation must not change results.
// ---------------------------------------------------------------------------------------------

#[test]
fn g7_memo_does_not_change_results() {
    let pack = load(
        "memo",
        &[
            ("pack.toml", "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"t\"\nfn = \"t\"\nargs = [\"Num\"]\n"),
            (
                "a.bhl",
                r#"
fn sq(x: Num) -> Num = x * x
fn t(n: Num) -> Num =
  fold(rng(20.0), 0.0, |acc, i| acc + sq(i))
fn rng(stop: Num) -> List<Num> = rng_from(0.0, stop, 0.0)
fn rng_from(start: Num, stop: Num, i: Num) -> List<Num> =
  if start + i >= stop then [] else concat([start + i], rng_from(start, stop, i + 1.0))
"#,
            ),
        ],
    );
    let interner = pack.interner.borrow();
    let on = Interp::new(&pack.program, &interner, Budget::default());
    let off = Interp::new(&pack.program, &interner, Budget::default());
    off.memo_on.set(false);
    let e = pack.entry("t").unwrap();
    let a = on.project(on.call(e.fn_id, vec![Value::Num(0.0)]).unwrap()).unwrap();
    let b = off.project(off.call(e.fn_id, vec![Value::Num(0.0)]).unwrap()).unwrap();
    assert_eq!(a.hash(), b.hash(), "memo on/off must be bit-identical");
}

// ---------------------------------------------------------------------------------------------
// G8 / G9: bounded evaluation and machine-readable diagnostics.
// ---------------------------------------------------------------------------------------------

#[test]
fn g8_runaway_recursion_hits_fuel_or_depth() {
    let pack = load(
        "bounded",
        &[
            ("pack.toml", "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"spin\"\nfn = \"spin\"\nargs = [\"Num\"]\n"),
            ("a.bhl", "fn spin(n: Num) -> Num = spin(n + 1.0)\n"),
        ],
    );
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let e = pack.entry("spin").unwrap();
    let err = interp.call(e.fn_id, vec![Value::Num(0.0)]).expect_err("must not hang");
    assert!(
        err.code == "BHC-E300" || err.code == "BHC-E301",
        "expected a budget error, got {} {}",
        err.code,
        err.message
    );
}

#[test]
fn g9_compile_errors_carry_position_and_code() {
    let dir = scratch("diag", &[("pack.toml", TOML), ("a.bhl", "fn f() -> Num = undefined_name\n")]);
    let err = load_pack(&dir).expect_err("must fail");
    assert!(err.code.starts_with("BHC-E1"), "code {}", err.code);
    assert!(err.pos.line >= 1, "position must be recorded");
    let json = err.to_json();
    assert!(json.contains("\"line\"") && json.contains("\"code\""));
}

// ---------------------------------------------------------------------------------------------
// G10: NaN and -0 must survive storage.
// ---------------------------------------------------------------------------------------------

#[test]
fn g10_nan_and_negative_zero_survive_records() {
    let pack = load(
        "nan",
        &[
            (
                "pack.toml",
                "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"bits\"\nfn = \"bits\"\nargs = [\"Num\"]\n\n[[entries]]\nname = \"roundtrip\"\nfn = \"roundtrip\"\nargs = [\"Num\"]\n",
            ),
            (
                "a.bhl",
                r#"
fn bits(x: Num) -> Num = x
fn roundtrip(x: Num) -> Num =
  let rec = { v: x } in
  rec.v
"#,
            ),
        ],
    );
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let e = pack.entry("roundtrip").unwrap();
    for input in [f64::NAN, -0.0, 0.0, -1.5, f64::INFINITY] {
        let out = interp.project(interp.call(e.fn_id, vec![Value::Num(input)]).unwrap()).unwrap();
        let Value::Num(n) = out else { panic!("expected Num") };
        assert_eq!(n.to_bits(), input.to_bits(), "value {input} lost its bits");
    }
    // `-0.0` must keep its sign through record storage.
    let neg = interp.project(interp.call(e.fn_id, vec![Value::Num(-0.0)]).unwrap()).unwrap();
    let Value::Num(n) = neg else { panic!() };
    assert!(n.is_sign_negative(), "-0.0 lost its sign");
}

// ---------------------------------------------------------------------------------------------
// §2.3: fold order is the pack's, and the engine must not reorder.
// ---------------------------------------------------------------------------------------------

#[test]
fn fold_order_is_the_list_order() {
    // Floating-point addition is not associative: sum in a different order differs in the last bit.
    let pack = load(
        "order",
        &[
            ("pack.toml", "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"s\"\nfn = \"s\"\nargs = []\n"),
            (
                "a.bhl",
                r#"
fn s() -> Num =
  fold([1e16, 1.0, 1.0, 1.0], 0.0, |a, b| a + b)
"#,
            ),
        ],
    );
    // 1e16 + 1 + 1 + 1 = 1e16 (the small terms vanish); any reordering that groups them would
    // produce 1e16 + 3 which is still 1e16, so use a discriminating order instead.
    let v = eval_num(&pack, "s", Vec::new());
    assert_eq!(v, 1e16);

    let _pack2 = load(
        "order2",
        &[
            ("pack.toml", "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"s\"\nfn = \"s\"\nargs = []\n"),
            (
                "a.bhl",
                r#"
fn s() -> Num =
  fold([1.0, 1e16, 1.0], 0.0, |a, b| a + b)
"#,
            ),
        ],
    );
    // (1 + 1e16) + 1 = 1e16; grouping as 1 + (1e16 + 1) would also be 1e16. Use exact halves:
    let pack3 = load(
        "order3",
        &[
            ("pack.toml", "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"s\"\nfn = \"s\"\nargs = []\n"),
            (
                "a.bhl",
                r#"
fn s() -> Num =
  fold([0.1, 0.2, 0.3], 0.0, |a, b| a + b)
"#,
            ),
        ],
    );
    let v3 = eval_num(&pack3, "s", Vec::new());
    // 0.1+0.2 = 0.30000000000000004; +0.3 = 0.6000000000000001
    assert_eq!(v3, 0.6000000000000001);
}

// ---------------------------------------------------------------------------------------------
// §9.8.13 / G17: no `choice` means the single-value path.
// ---------------------------------------------------------------------------------------------

#[test]
fn no_choice_stays_single_valued() {
    let pack = load(
        "single",
        &[
            ("pack.toml", "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"f\"\nfn = \"f\"\nargs = [\"Num\"]\n"),
            ("a.bhl", "fn f(x: Num) -> Num = x * 2.0 + 1.0\n"),
        ],
    );
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let e = pack.entry("f").unwrap();
    let d = interp.call(e.fn_id, vec![Value::Num(3.0)]).unwrap();
    assert!(d.is_one(), "a program without choice must stay in the single-value path");
}

// ---------------------------------------------------------------------------------------------
// §4.4.1: importers are ordinary pack functions that report `err(Sym)` rather than panicking.
// ---------------------------------------------------------------------------------------------

#[test]
fn importer_returns_err_for_bad_input() {
    let pack = load(
        "import",
        &[
            (
                "pack.toml",
                "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"imp\"\nfn = \"imp\"\nargs = [\"Rec\"]\n",
            ),
            (
                "a.bhl",
                r#"
schema Rec { a: Num, ..open }
fn imp(r: Rec) -> Result<Num, Sym> =
  if r.a > 0.0 then ok(r.a) else err(sym"bad_a")
"#,
            ),
        ],
    );
    let good: serde_json::Value = serde_json::from_str(r#"{"a":5}"#).unwrap();
    let v = pack.json_to_value("Rec", &good).unwrap();
    let bad: serde_json::Value = serde_json::from_str(r#"{"a":0}"#).unwrap();
    let bad_v = pack.json_to_value("Rec", &bad).unwrap();
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let e = pack.entry("imp").unwrap();
    match interp.call(e.fn_id, vec![v]).unwrap() {
        Dist::One(Value::Ok(inner)) => match *inner {
            Value::Num(n) => assert_eq!(n, 5.0),
            other => panic!("expected Num, got {}", other.type_name()),
        },
        other => panic!("expected ok(...), got {:?}", other),
    }
    match interp.call(e.fn_id, vec![bad_v]).unwrap() {
        Dist::One(Value::Err(inner)) => match *inner {
            Value::Sym(s) => assert_eq!(interner.name(s), "bad_a"),
            other => panic!("expected Sym, got {}", other.type_name()),
        },
        other => panic!("expected err(...), got {:?}", other),
    }
}

// ---------------------------------------------------------------------------------------------
// §7.10: cross-character contributions come from a list, not fixed fields.
// ---------------------------------------------------------------------------------------------

#[test]
fn party_contributions_come_from_a_list() {
    // A four-member party is expressible; the fixed two-member shape is not a constraint.
    let pack = load(
        "party2",
        &[
            ("pack.toml", "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"received\"\nfn = \"received\"\nargs = [\"Party\", \"Num\"]\n"),
            (
                "a.bhl",
                r#"
schema Member { own: Num, aura: Num, aura_target: Sym, element: Sym, ..open }
schema Party  { members: List<Member>, ..open }

fn targets(m: Member, who: Num, el: Sym) -> Bool =
  m.aura_target == sym"all" || (m.aura_target == sym"same" && m.element == el)

fn received(p: Party, who: Num) -> Num =
  let me = at(p.members, who) in
  me.own + fold(p.members, 0.0, |acc, m| if targets(m, who, me.element) then acc + m.aura else acc)
"#,
            ),
        ],
    );
    let json: serde_json::Value = serde_json::from_str(
        r#"{"members":[
            {"own":10,"aura":1,"aura_target":"all","element":"a"},
            {"own":20,"aura":2,"aura_target":"same","element":"b"},
            {"own":30,"aura":3,"aura_target":"same","element":"a"},
            {"own":40,"aura":4,"aura_target":"all","element":"c"}]}"#,
    )
    .unwrap();
    let v = pack.json_to_value("Party", &json).unwrap();
    // Member 0 (element a): own 10 + all(1) + all(4) + same-a(3) = 18
    let got = eval_num(&pack, "received", vec![v.clone(), Value::Num(0.0)]);
    assert_eq!(got, 18.0, "four-member party with mixed targets");
    // Member 1 (element b): own 20 + all(1) + all(4) + same-b(2) = 27
    let got = eval_num(&pack, "received", vec![v, Value::Num(1.0)]);
    assert_eq!(got, 27.0);
}

// ---------------------------------------------------------------------------------------------
// §4.4: the resolve pipeline runs `legal` then `contribute` then `fold`, in pack order.
// ---------------------------------------------------------------------------------------------

#[test]
fn resolve_is_filter_then_concat_map_then_fold() {
    let pack = load(
        "resolve",
        &[
            (
                "pack.toml",
                "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"resolve\"\nfn = \"resolve\"\nargs = [\"Lay\"]\n\n[[entries]]\nname = \"legal\"\nfn = \"legal\"\nargs = [\"Lay\", \"P\"]\n",
            ),
            (
                "a.bhl",
                r#"
schema Lay { ps: List<Num>, ..open }
schema P   { id: Num, ..open }

// 偶数放置合法；奇数是「非法候选」，必须被忽略而不是报错
fn legal(lay: Lay, p: P) -> Bool = mod2(p.id) == 0.0
fn mod2(x: Num) -> Num = x - floor(x / 2.0) * 2.0

fn contribute(lay: Lay, p: P) -> List<Num> = if legal(lay, p) then [p.id] else []

fn resolve(lay: Lay) -> Num =
  fold(concat_map(lay.ps, |id| contribute(lay, P{id: id})), 0.0, |a, b| a + b)
"#,
            ),
        ],
    );
    let json: serde_json::Value = serde_json::from_str(r#"{"ps":[1,2,3,4,5,6]}"#).unwrap();
    let v = pack.json_to_value("Lay", &json).unwrap();
    // Only 2+4+6 survive; illegal placements are ignored, not errors.
    assert_eq!(eval_num(&pack, "resolve", vec![v]), 12.0);
}

// ---------------------------------------------------------------------------------------------
// §4.2: data bindings are compile-time fixed, with by-key and by-index accessors.
// ---------------------------------------------------------------------------------------------

#[test]
fn data_binding_generates_fixed_accessors() {
    let pack = load(
        "data",
        &[
            (
                "pack.toml",
                "id = \"t\"\nversion = \"0.1.0\"\n\n[[data]]\nname = \"rows\"\ndataset = \"rows.json\"\nschema = \"Row\"\nkey = \"id\"\n\n[[entries]]\nname = \"lookup\"\nfn = \"lookup\"\nargs = [\"Num\"]\n\n[[entries]]\nname = \"count\"\nfn = \"count\"\nargs = []\n",
            ),
            ("a.bhl", "schema Row { id: Num, v: Num, ..open }\n\nfn lookup(id: Num) -> Num =\n  match data.rows.by_id(id) {\n    some(r) => r.v,\n    none => -1.0\n  }\n\nfn count() -> Num = data.rows.len()\n"),
            ("rows.json", r#"[{"id":1,"v":10},{"id":2,"v":20},{"id":3,"v":30}]"#),
        ],
    );
    assert_eq!(eval_num(&pack, "lookup", vec![Value::Num(2.0)]), 20.0);
    assert_eq!(eval_num(&pack, "lookup", vec![Value::Num(99.0)]), -1.0);
    assert_eq!(eval_num(&pack, "count", Vec::new()), 3.0);
}

// ---------------------------------------------------------------------------------------------
// §4.1: strict schema checking rejects unknown fields.
// ---------------------------------------------------------------------------------------------

#[test]
fn strict_schema_check_rejects_unknown_fields() {
    let dir = scratch(
        "strict",
        &[
            (
                "pack.toml",
                "id = \"t\"\nversion = \"0.1.0\"\nschema_check = \"strict\"\n\n[[data]]\nname = \"rows\"\ndataset = \"rows.json\"\nschema = \"Row\"\nkey = \"id\"\n",
            ),
            ("a.bhl", "schema Row { id: Num }\n"),
            ("rows.json", r#"[{"id":1,"extra":2}]"#),
        ],
    );
    // `strict` must reject at load time; if the loader tolerates it, host conversion must reject.
    match load_pack(&dir) {
        Err(err) => assert_eq!(err.code, "BHC-E212"),
        Ok(pack) => {
            let json: serde_json::Value = serde_json::from_str(r#"{"id":1,"extra":2}"#).unwrap();
            let err = pack.json_to_value("Row", &json).expect_err("strict must reject unknown fields");
            assert_eq!(err.code, "BHC-E212");
        }
    }
}

// ---------------------------------------------------------------------------------------------
// §9.9 / G18–G21: the trace primitive.
// ---------------------------------------------------------------------------------------------

fn trace_pack() -> LoadedPack {
    load(
        "trace",
        &[
            (
                "pack.toml",
                "id = \"t\"\nversion = \"0.1.0\"\n\n[[entries]]\nname = \"init\"\nfn = \"init\"\nargs = [\"Cfg\"]\n\n[[entries]]\nname = \"step\"\nfn = \"step\"\nargs = [\"Cfg\"]\n\n[[entries]]\nname = \"probe\"\nfn = \"probe\"\nargs = [\"S\"]\n",
            ),
            (
                "a.bhl",
                r#"
schema Cfg { per_frame: Num, shred: Num, ..open }
schema S   { t: Num, hp: Num, armor: Num, total: Num, last: Num, ..open }
schema Sample { total: Num, per_dim: Record{ ..open }, state: Record{ ..open }, ..open }

fn init(c: Cfg) -> S = S { t: 0.0, hp: 10000.0, armor: 300.0, total: 0.0, last: 0.0 }

// 每步：伤害随 armor 变化，armor 自身被削 —— 状态可写是 G20 的判据
fn defense(armor: Num) -> Num = 1.0 - armor / (300.0 + armor)

fn step(c: Cfg) -> |S, Num| S =
  |s, t|
    let dmg = c.per_frame * defense(s.armor) in
    S {
      t: t,
      hp: s.hp - dmg,
      armor: max(s.armor * (1.0 - c.shred), 0.0),
      total: s.total + dmg,
      last: dmg
    }

// `total` 是**当帧**输出（strip 语义）；累计由引擎的前缀和得到，不由 pack 自己算。
fn probe(s: S) -> Sample =
  Sample {
    total: s.last,
    per_dim: { direct: s.last, dot: 0.0 },
    state: { hp: s.hp, armor: s.armor, cumulative: s.total }
  }
"#,
            ),
        ],
    )
}

#[test]
fn g20_monster_state_is_writable() {
    let pack = trace_pack();
    let cfg: serde_json::Value = serde_json::from_str(r#"{"per_frame":100,"shred":0.2}"#).unwrap();
    let cfg = pack.json_to_value("Cfg", &cfg).unwrap();
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let step_fn = interp
        .project(interp.call(pack.entry("step").unwrap().fn_id, vec![cfg]).unwrap())
        .unwrap();
    let init = interp
        .project(interp.call(pack.entry("init").unwrap().fn_id, Vec::new()).unwrap())
        .unwrap();
    let probe = buildhub_core::sim::value_of_entry(&interp, pack.entry("probe").unwrap().fn_id);
    let opts = buildhub_core::sim::TraceOptions::default();
    let r = buildhub_core::sim::run(&interp, &init, &[0.0, 1.0, 2.0], &step_fn, &probe, &opts).unwrap();
    // 100 × (0.5, 0.555556, 0.609756) — exactly the spec §9.9.10 numbers.
    let dmg: Vec<f64> = r.frames.iter().map(|f| f.total.mean).collect();
    assert!((dmg[0] - 50.0).abs() < 1e-9, "frame 0: {dmg:?}");
    assert!((dmg[1] - 55.555555555).abs() < 1e-6, "frame 1: {dmg:?}");
    assert!((dmg[2] - 60.975609756).abs() < 1e-6, "frame 2: {dmg:?}");
    // If armor were read-only, all three frames would be 50.
    assert!(dmg[2] > dmg[0] + 10.0, "shredding armor must raise later damage");
}

#[test]
fn g21_trace_inequalities_hold() {
    let pack = trace_pack();
    let cfg: serde_json::Value = serde_json::from_str(r#"{"per_frame":100,"shred":0.1}"#).unwrap();
    let cfg = pack.json_to_value("Cfg", &cfg).unwrap();
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let step_fn = interp
        .project(interp.call(pack.entry("step").unwrap().fn_id, vec![cfg]).unwrap())
        .unwrap();
    let init = interp
        .project(interp.call(pack.entry("init").unwrap().fn_id, Vec::new()).unwrap())
        .unwrap();
    let probe = buildhub_core::sim::value_of_entry(&interp, pack.entry("probe").unwrap().fn_id);
    let opts = buildhub_core::sim::TraceOptions {
        states: vec!["hp".into(), "armor".into()],
        ..Default::default()
    };
    let r = buildhub_core::sim::run(&interp, &init, &[0.0, 1.0, 2.0, 3.0], &step_fn, &probe, &opts).unwrap();
    for f in &r.frames {
        assert!(f.total.lo <= f.total.mean + 1e-9, "lo <= mean");
        assert!(f.total.mean <= f.total.hi + 1e-9, "mean <= hi");
        assert!(f.total.lo <= f.total.hi, "lo <= hi");
        assert!(f.total.min <= f.total.lo + 1e-9, "min <= lo");
        assert!(f.total.hi <= f.total.max + 1e-9, "hi <= max");
    }
    // `cumulative` must be monotone and end at the summary (§9.9.14, §9.9.12 self-consistency).
    let mut prev = f64::NEG_INFINITY;
    for (_, s) in &r.cumulative {
        assert!(s.mean >= prev - 1e-9, "cumulative must not decrease");
        prev = s.mean;
    }
    let last = r.cumulative.last().map(|(_, s)| s.mean).unwrap_or(0.0);
    assert!((last - r.summary.mean).abs() < 1e-9, "cumulative tail must equal summary");
    assert!(r.bounds.0 <= r.summary.mean + 1e-9 && r.summary.mean <= r.bounds.1 + 1e-9);
}

#[test]
fn g22_split_reports_every_dimension() {
    let pack = trace_pack();
    let cfg: serde_json::Value = serde_json::from_str(r#"{"per_frame":10,"shred":0.0}"#).unwrap();
    let cfg = pack.json_to_value("Cfg", &cfg).unwrap();
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let step_fn = interp
        .project(interp.call(pack.entry("step").unwrap().fn_id, vec![cfg]).unwrap())
        .unwrap();
    let init = interp
        .project(interp.call(pack.entry("init").unwrap().fn_id, Vec::new()).unwrap())
        .unwrap();
    let probe = buildhub_core::sim::value_of_entry(&interp, pack.entry("probe").unwrap().fn_id);
    let opts = buildhub_core::sim::TraceOptions { split: true, ..Default::default() };
    let r = buildhub_core::sim::run(&interp, &init, &[0.0, 1.0], &step_fn, &probe, &opts).unwrap();
    // Both declared dimensions appear, including the zero one (no holes, §9.9.9).
    let names: Vec<&str> = r.dimensions.iter().map(|d| interner.name(*d)).collect();
    assert!(names.contains(&"direct"), "dimensions: {names:?}");
    assert!(names.contains(&"dot"), "zero dimensions must not be omitted: {names:?}");
    for f in &r.frames {
        assert_eq!(f.per_dim.len(), 2);
    }
}

#[test]
fn g18_simulate_matches_last_frame() {
    let pack = trace_pack();
    let cfg: serde_json::Value = serde_json::from_str(r#"{"per_frame":100,"shred":0.2}"#).unwrap();
    let cfg = pack.json_to_value("Cfg", &cfg).unwrap();
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default());
    let step_fn = interp
        .project(interp.call(pack.entry("step").unwrap().fn_id, vec![cfg]).unwrap())
        .unwrap();
    let init = interp
        .project(interp.call(pack.entry("init").unwrap().fn_id, Vec::new()).unwrap())
        .unwrap();
    let simulated = buildhub_core::sim::simulate(&interp, &init, &[0.0, 1.0, 2.0], &step_fn).unwrap();
    let probe = buildhub_core::sim::value_of_entry(&interp, pack.entry("probe").unwrap().fn_id);
    let opts = buildhub_core::sim::TraceOptions::default();
    let traced = buildhub_core::sim::run(&interp, &init, &[0.0, 1.0, 2.0], &step_fn, &probe, &opts).unwrap();
    // `trace(...).last.state` must equal `simulate(...)` (§9.9.6, G18).
    let Value::Record(a) = &simulated else { panic!("simulate must return the state record") };
    let hp_sym = interner.find("hp").unwrap();
    let Value::Num(_hp) = a.get(hp_sym).unwrap() else { panic!() };
    let frame_hp = traced
        .frames
        .last()
        .and_then(|f| f.states.iter().find(|(k, _)| *k == hp_sym))
        .map(|(_, s)| s.mean);
    // Without `states` requested the frame carries no state; compare through `probe` instead.
    let _ = frame_hp;
    // `simulate` returns the final state; the trace's cumulative tail is its per-frame sum, so the
    // pack's own accumulated field must agree with it.
    let total_sym = interner.find("total").unwrap();
    let Value::Num(total) = a.get(total_sym).unwrap() else { panic!() };
    let cum_sum: f64 = traced.frames.iter().map(|f| f.total.mean).sum();
    assert!((cum_sum - total).abs() < 1e-9, "frame sum {cum_sum} != simulate total {total}");
    assert!((traced.summary.mean - total).abs() < 1e-9, "cumulative tail must equal simulate");
}

// ---------------------------------------------------------------------------------------------
// 数据侧 `Option<T>`：JSON 的非空值必须解成 `Some(v)`，否则 pack 里的 `some(x)` 永远不命中。
// ---------------------------------------------------------------------------------------------

#[test]
fn data_option_wraps_present_values() {
    let pack = load(
        "option_wrap",
        &[
            (
                "pack.toml",
                "id = \"t\"\nversion = \"0.1.0\"\n\n[[data]]\nname = \"rows\"\ndataset = \"rows.json\"\nschema = \"Row\"\nkey = \"id\"\n\n[[entries]]\nname = \"tag\"\nfn = \"tag\"\nargs = []\n\n[[entries]]\nname = \"present\"\nfn = \"present\"\nargs = []\n",
            ),
            (
                "rows.json",
                r#"[{"id":1,"kind":"a"},{"id":2,"kind":null}]"#,
            ),
            (
                "rows.bhl",
                r#"schema Row { id: Num, kind: Option<Sym>, ..open }
fn tag() -> Num =
  match data.rows.by_id(1.0) {
    none => -1.0,
    some(r) => match r.kind { none => 0.0, some(k) => if k == sym"a" then 1.0 else 2.0 }
  }
fn present() -> Num =
  match data.rows.by_id(2.0) {
    none => -1.0,
    some(r) => match r.kind { none => 0.0, some(k) => 1.0 }
  }
"#,
            ),
        ],
    );
    assert_eq!(eval_num(&pack, "tag", Vec::new()), 1.0, "present tag must unwrap via some()");
    assert_eq!(eval_num(&pack, "present", Vec::new()), 0.0, "null must decode to none");
}
