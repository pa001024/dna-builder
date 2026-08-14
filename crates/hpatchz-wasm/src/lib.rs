//! hpatchz-wasm：把 HDiffPatch 的整块内存差分应用编译为 wasm32 模块。
//!
//! 前端通过 WebAssembly.instantiate 加载本模块：
//!   1. `hpatchz_alloc(len)` 分配输入缓冲，拷贝 old/diff 字节；
//!   2. `hpatchz_new_size_c(diff, diffLen)` 查询目标新文件大小；
//!   3. `hpatchz_alloc(newSize)` 分配输出缓冲；
//!   4. `hpatchz_apply(old, oldLen, diff, diffLen, out, outLen)` 应用差分；
//!   5. 读取 out 缓冲的字节，最后 `hpatchz_dealloc` 释放全部缓冲。
//!
//! 全程使用 wasm 导出的线性内存，无 JS↔Rust IPC 搬运，也无需文件系统。

use std::alloc::{alloc, dealloc, Layout};
use std::ptr;

/// 从线性内存分配一段字节，返回指针。
///
/// # Safety
/// 返回指针在 `hpatchz_dealloc` 前有效；len 必须与释放时一致。
#[no_mangle]
pub unsafe extern "C" fn hpatchz_alloc(len: u32) -> *mut u8 {
    if len == 0 {
        return ptr::null_mut();
    }
    let layout = Layout::from_size_align(len as usize, 8).unwrap();
    unsafe { alloc(layout) }
}

/// 释放由 `hpatchz_alloc` 分配的字节。
///
/// # Safety
/// ptr 必须是 `hpatchz_alloc` 的返回值且尚未被释放。
#[no_mangle]
pub unsafe extern "C" fn hpatchz_dealloc(ptr: *mut u8, len: u32) {
    if ptr.is_null() || len == 0 {
        return;
    }
    let layout = Layout::from_size_align(len as usize, 8).unwrap();
    unsafe { dealloc(ptr, layout) }
}

extern "C" {
    fn hpatchz_new_size(diff: *const u8, diff_len: u64) -> u64;
    fn hpatchz_apply_c(
        old: *const u8,
        old_len: u64,
        diff: *const u8,
        diff_len: u64,
        out: *mut u8,
        out_len: u64,
    ) -> i32;
}

/// 解析差分的目标新文件大小。返回 0 表示差分头部无效。
///
/// # Safety
/// diff 必须指向 len 字节的可读线性内存。
#[no_mangle]
pub unsafe extern "C" fn hpatchz_new_size_c(diff: *const u8, diff_len: u32) -> u64 {
    if diff.is_null() || diff_len == 0 {
        return 0;
    }
    unsafe { hpatchz_new_size(diff, diff_len as u64) }
}

/// 应用差分，结果写入 out。返回 1 成功；0 差分头部无效；
/// -2 含压缩段(需 zlib，暂不支持)；-3 应用失败。
///
/// # Safety
/// old/diff/out 必须指向各自长度可读/可写的线性内存。
#[no_mangle]
pub unsafe extern "C" fn hpatchz_apply(
    old: *const u8,
    old_len: u32,
    diff: *const u8,
    diff_len: u32,
    out: *mut u8,
    out_len: u32,
) -> i32 {
    if old.is_null() || diff.is_null() || out.is_null() || old_len == 0 || diff_len == 0 {
        return 0;
    }
    unsafe { hpatchz_apply_c(old, old_len as u64, diff, diff_len as u64, out, out_len as u64) }
}
