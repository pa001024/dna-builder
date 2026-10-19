fn main() {
    let modules = std::fs::read_to_string("../../.tmp/dobcc-modules.json").unwrap_or_else(|_| std::fs::read_to_string("crates/dob-calc-core/tests/fixtures/modules.json").unwrap());
    let payload = dob_calc_core::BuildPayload::from_json(&modules).unwrap();
    let text = std::fs::read_to_string("crates/dob-calc-core/tests/fixtures/e2e_shard.json").unwrap();
    let fixture: serde_json::Value = serde_json::from_str(&text).unwrap();
    let raw = serde_json::json!({"charId": fixture["request"]["charId"], "settings": fixture["request"]["settings"]});
    let request = dob_calc_core::evaluate::BuildRequest::from_json(&raw).unwrap();
    for _ in 0..10 { dob_calc_core::evaluate_build(&payload.tables, &request); }
    dob_calc_core::prof::reset();
    let n = 50;
    for _ in 0..n { std::hint::black_box(dob_calc_core::evaluate_build(&payload.tables, &request)); }
    println!("=== prof report, {n} runs ===");
    print!("{}", dob_calc_core::prof::report());
}
