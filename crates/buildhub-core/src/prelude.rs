//! Fixed symbol order shared by the compiler, the data converter, and the host boundary, so ids
//! are stable across processes and runs (spec §2.1: `Sym` is interned at load time).

pub const RESERVED_SYMBOLS: &[&str] = &[
    "Config", "Layout", "Placement", "Contribution", "Sample", "SimState", "Target", "Item", "Proc", "Aura",
];
