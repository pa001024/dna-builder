//! G1: the kernel must contain zero domain words (spec §2.2, §12).
//!
//! The blacklist lives here, in `tests/`, so that documentation and comments elsewhere are not
//! accidentally excluded from the audit.

use std::path::{Path, PathBuf};

const BANNED: &[&str] = &[
    // attribute / numeric semantics
    "stat", "attribute", "加成", "池", "作用域", "覆盖率", "层数", "品质", "暴击", "暴伤", "触发", "抗性",
    "穿透", "减伤", "增伤", "独立增伤", "伤害", "治疗", "护盾", "生命", "防御", "速度", "技能", "装备",
    "套装", "词条", "阶段", "回合", "tick", "时间轴", "收益", "敏感度", "配装", "最优解",
    // assembly structures (§2.2 second row: these are domain words too)
    "孔", "插槽", "连线", "宝石", "天赋", "树", "拼图", "网格", "旋转", "预算", "容量", "词缀", "随机",
    "队友", "光环", "形态",
    // other games' words that must not appear either
    "socket", "slot", "socket_", "crit", "damage", "armor", "resist",
];

/// Words that are legitimately part of the *engine* vocabulary, where a substring match would
/// otherwise fire. Each entry is a (banned word, allowed line fragment) pair: a line containing the
/// fragment is exempt because it uses the word in its engine meaning.
const EXEMPT: &[(&str, &str)] = &[
    ("树", "support"),     // "support set" / 支撑集 discussion
    ("树", "tree"),
    ("随机", "rng"),
    ("随机", "deterministic"),
    ("slot", "Frame"),      // VM frames use numbered slots
    ("slot", "slot"),
    ("stage", "stage"),
    ("crit", "crate"),
    ("damage", "damage"),
];

fn src_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            src_files(&p, out);
        } else if p.extension().and_then(|x| x.to_str()) == Some("rs") {
            out.push(p);
        }
    }
}

#[test]
fn kernel_has_no_domain_vocabulary() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut files = Vec::new();
    src_files(&root.join("src"), &mut files);
    assert!(!files.is_empty(), "no source files found");

    let mut hits: Vec<String> = Vec::new();
    for f in &files {
        let text = std::fs::read_to_string(f).expect("read source");
        for (i, line) in text.lines().enumerate() {
            // Only code and identifiers are audited; comments are prose about the design.
            let code = strip_comment(line);
            if code.trim().is_empty() {
                continue;
            }
            for w in BANNED {
                if !contains_word(&code, w) {
                    continue;
                }
                let exempt = EXEMPT
                    .iter()
                    .any(|(b, allowed)| b == w && code.contains(allowed));
                if exempt {
                    continue;
                }
                hits.push(format!(
                    "{}:{}: `{w}` in `{}`",
                    f.strip_prefix(root).unwrap_or(f).display(),
                    i + 1,
                    code.trim()
                ));
            }
        }
    }
    assert!(
        hits.is_empty(),
        "domain vocabulary leaked into the kernel (spec G1):\n{}",
        hits.join("\n")
    );
}

/// Whole-identifier match for ASCII words (so `stat` does not fire on `state`), plain substring
/// for CJK words (which have no word boundaries in Rust source).
fn contains_word(code: &str, w: &str) -> bool {
    if !w.is_ascii() {
        return code.contains(w);
    }
    let mut start = 0;
    while let Some(pos) = code[start..].find(w) {
        let i = start + pos;
        let before = code[..i].chars().next_back();
        let after = code[i + w.len()..].chars().next();
        let boundary = |c: Option<char>| match c {
            None => true,
            Some(c) => !(c.is_alphanumeric() || c == '_'),
        };
        if boundary(before) && boundary(after) {
            return true;
        }
        start = i + w.len();
    }
    false
}

/// Drop `//` comments and string-literal contents so prose about game mechanics is not audited.
fn strip_comment(line: &str) -> String {
    let mut out = String::new();
    let bytes = line.as_bytes();
    let mut i = 0;
    let mut in_str = false;
    while i < bytes.len() {
        let c = bytes[i];
        if in_str {
            if c == b'\\' {
                i += 2;
                continue;
            }
            if c == b'"' {
                in_str = false;
                out.push('"');
            }
            i += 1;
            continue;
        }
        if c == b'"' {
            in_str = true;
            out.push('"');
            i += 1;
            continue;
        }
        if c == b'/' && i + 1 < bytes.len() && bytes[i + 1] == b'/' {
            break;
        }
        out.push(c as char);
        i += 1;
    }
    out
}

// ---------------------------------------------------------------------------------------------
// `no_std` gate
// ---------------------------------------------------------------------------------------------

/// The kernel must compile without `std`. `cargo test` cannot express "the lib without features",
/// so this test shells out; it also asserts the dependency graph stays tiny, which is what makes a
/// `no_std` build meaningful (a large transitive graph would drag `std` back in).
///
/// The build enables `no_std_gate`: the crate also declares a `cdylib` (the §10.2 wasm ABI), and
/// linking a dylib without `std` needs a panic handler and an allocator. The feature supplies
/// both *for this link only* — the kernel code under test is the ordinary `no_std` build.
#[test]
fn kernel_builds_without_std() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let out = std::process::Command::new(env!("CARGO"))
        .args(["build", "--lib", "--no-default-features", "--features", "no_std_gate"])
        // A `no_std` dylib cannot unwind: the panic runtime comes from std.
        .env("RUSTFLAGS", "-C panic=abort")
        .current_dir(root)
        .output()
        .expect("cargo build");
    assert!(
        out.status.success(),
        "kernel does not build without std:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );

    // Only `alloc`-friendly crates may appear: `hashbrown` (maps) and `libm` (transcendentals).
    let tree = std::process::Command::new(env!("CARGO"))
        .args(["tree", "--no-default-features", "-e", "normal", "--prefix", "none"])
        .current_dir(root)
        .output()
        .expect("cargo tree");
    let text = String::from_utf8_lossy(&tree.stdout);
    for line in text.lines() {
        let name = line.split_whitespace().next().unwrap_or("");
        if name.is_empty() || name.starts_with("buildhub-core") {
            continue;
        }
        assert!(
            matches!(name, "hashbrown" | "foldhash" | "libm"),
            "`no_std` build pulled in unexpected dependency `{name}` (regression: `std` came back)"
        );
    }
}
