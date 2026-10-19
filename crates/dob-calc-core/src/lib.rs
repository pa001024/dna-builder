//! dob-calc-core：CharBuild 计算流程的跨平台 Rust 实现。
//!
//! 行为对齐 TS 版 CharBuild（`packages/data`），结构参考
//! `dob-app/rust/src/api/build` 已验证的端口。std-only，可编译到任意平台
//! （含 `wasm32-unknown-unknown`）：无 FS/网络/线程/时间依赖，无平台 `cfg` 门控
//! （仅 `prof` 特性开关）。
//!
//! 对外只有三件套：建表（[`TableBuilder::build`]）/ 求值（[`evaluate_build`]）/
//! C ABI（[`capi`]，wasm/cdylib 用）。`BuildPayload` 会话只给 capi 用，
//! rlib 调用方自定缓存策略。

#[macro_use]
pub mod prof;
mod ast_eval;
mod ast_parser;
mod attributes;
pub mod attrmap;
pub mod autobuild;
pub mod capi;
pub mod config;
mod const_tables;
pub mod context;
mod damage;
mod dynamic;
pub mod error;
pub mod evaluate;
pub mod income;
pub mod models;
mod pet;
pub mod record;
pub mod session;
pub mod tables;
pub(crate) mod templates;
pub mod timeline;

pub use ast_eval::Evaluator;
pub use autobuild::{AutobuildOptions, AutobuildRequest, AutobuildResult, ModCandidate, autobuild};
pub use error::CalcError;
pub use evaluate::{
    BuffScope, BuildRequest, BuildResult, CalcSession, DamageBreakdown, ExpressionResult,
    evaluate_build, evaluate_expressions, macros,
};
pub use income::{ModSlotKey, WeaponCandidate, calc_weapon_replacement_incomes};
pub use session::{BuildPayload, ModulesJson};
pub use attrmap::AttrMap;
pub use tables::{BuildTables, TableBuilder};
pub use timeline::RawTimelineData;
