//! buildhub-core: an executable rule kernel whose vocabulary is strictly smaller than any game's
//! (spec §1.5). Nothing here knows a domain concept — see `tests/no_domain_leak.rs`.
//!
//! # `no_std`
//!
//! The kernel is `no_std` + `alloc`: a rule engine that only runs where a filesystem and a thread
//! runtime exist is not embeddable, and the spec's targets include `wasm32` with no host at all
//! (§9.5.3). What the kernel needs is exactly `alloc` (strings, vectors, `Rc`) plus `libm` for
//! transcendentals — `libm` is required anyway because §9.4 pins them to one implementation across
//! targets.
//!
//! Host-only work sits behind features: `loader` (reading `pack.toml` and data files) and `json`
//! (the `bhub_call` boundary). `std` gates the CLI and the filesystem paths.
#![no_std]
#![cfg_attr(not(feature = "std"), no_main)]

extern crate alloc;

/// Paths the kernel needs from `alloc`. Imported explicitly per module so a `no_std` build cannot
/// accidentally rely on the `std` prelude.
pub(crate) mod prelude_alloc {
    #![allow(unused_imports)]
    pub use alloc::{boxed::Box, format, string::String, string::ToString, vec, vec::Vec};
}

pub mod ast;
pub mod builtins;
#[cfg(feature = "cabi")]
pub mod cabi;
pub mod diag;
pub mod eval;
pub mod hash;
#[cfg(feature = "json")]
pub mod host;
pub mod ir;
pub mod lexer;
#[cfg(feature = "loader")]
pub mod pack;
pub mod parser;
pub mod prelude;
pub mod resolve;
pub mod image;
pub mod show;
pub mod sim;
pub mod ssa;
pub mod step;
pub mod vm;
pub mod sym;
pub mod tree;
pub mod value;

pub use diag::{Diag, Pos};
pub use eval::{Budget, EvalError, Interp};
#[cfg(feature = "loader")]
pub use pack::{LoadedPack, SchemaCheck};
pub use sym::{Interner, Sym};
pub use sim::{TraceOptions, TraceResult};
pub use tree::{Outcome, TreeNode};
pub use value::{Dist, Value};

/// Stand-ins the `no_std_gate` build needs to link (see the feature's comment in `Cargo.toml`).
#[cfg(feature = "no_std_gate")]
mod no_std_link {
    use core::alloc::{GlobalAlloc, Layout};
    use core::cell::UnsafeCell;

    #[panic_handler]
    fn panic(_: &core::panic::PanicInfo) -> ! {
        loop {}
    }

    /// A bump allocator over a static arena: the gate links, it never evaluates anything.
    struct Bump {
        heap: UnsafeCell<[u8; 1 << 20]>,
        used: UnsafeCell<usize>,
    }

    unsafe impl Sync for Bump {}

    unsafe impl GlobalAlloc for Bump {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            let used = unsafe { &mut *self.used.get() };
            let start = (*used + layout.align() - 1) & !(layout.align() - 1);
            let end = start + layout.size();
            if end > (1 << 20) {
                return core::ptr::null_mut();
            }
            *used = end;
            unsafe { (*self.heap.get()).as_mut_ptr().add(start) }
        }
        unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {}
    }

    #[global_allocator]
    static ALLOC: Bump = Bump { heap: UnsafeCell::new([0; 1 << 20]), used: UnsafeCell::new(0) };
}
