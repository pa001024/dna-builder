//! CharBuild 的公共属性加成归约内核。
//!
//! 输入按“来源 x 属性”的连续 f64 矩阵布局；每一行是一组 MOD、BUFF 或装备贡献。
//! 内核使用 WebAssembly SIMD 的 f64x2 指令同时归约两个属性，保持与 JavaScript
//! Number 相同的双精度表示。宿主必须在不支持 SIMD 或模块加载失败时回退到 JS 实现。

use core::arch::wasm32::{f64x2_add, v128_load, v128_store};
use std::alloc::{alloc, dealloc, Layout};
use std::ptr;

/// 在 Wasm 线性内存中分配输入或输出缓冲区。
///
/// # Safety
/// 返回值必须使用相同长度传给 `charbuild_dealloc`，且在释放前保持有效。
#[no_mangle]
pub unsafe extern "C" fn charbuild_alloc(length: u32) -> *mut u8 {
    if length == 0 {
        return ptr::null_mut();
    }
    let layout = Layout::from_size_align(length as usize, 8).unwrap();
    unsafe { alloc(layout) }
}

/// 释放由 `charbuild_alloc` 创建的 Wasm 线性内存缓冲区。
///
/// # Safety
/// `ptr` 必须来自 `charbuild_alloc`，且 `length` 必须与分配长度一致。
#[no_mangle]
pub unsafe extern "C" fn charbuild_dealloc(ptr: *mut u8, length: u32) {
    if ptr.is_null() || length == 0 {
        return;
    }
    let layout = Layout::from_size_align(length as usize, 8).unwrap();
    unsafe { dealloc(ptr, layout) }
}

/// 将 `source_count` 行 f64 属性贡献按列求和，结果写入 `output`。
///
/// # Safety
/// `input` 必须指向 `source_count * attribute_count` 个 f64；`output` 必须可写入
/// `attribute_count` 个 f64。调用方负责确保长度计算不溢出。
#[no_mangle]
pub unsafe extern "C" fn charbuild_sum_f64(
    input: *const f64,
    output: *mut f64,
    source_count: u32,
    attribute_count: u32,
) {
    if input.is_null() || output.is_null() || source_count == 0 || attribute_count == 0 {
        return;
    }
    unsafe { sum_f64_simd(input, output, source_count as usize, attribute_count as usize) }
}

/// 使用 f64x2 指令归约连续属性列，并用标量尾循环处理奇数列。
///
/// # Safety
/// 调用方必须满足 `charbuild_sum_f64` 的全部指针和长度约束。
#[target_feature(enable = "simd128")]
unsafe fn sum_f64_simd(input: *const f64, output: *mut f64, source_count: usize, attribute_count: usize) {
    unsafe {
        for index in 0..attribute_count {
            output.add(index).write(0.0);
        }

        for source_index in 0..source_count {
            let source = input.add(source_index * attribute_count);
            let mut index = 0;
            while index + 2 <= attribute_count {
                let current = v128_load(output.add(index).cast());
                let contribution = v128_load(source.add(index).cast());
                v128_store(output.add(index).cast(), f64x2_add(current, contribution));
                index += 2;
            }
            if index < attribute_count {
                output.add(index).write(output.add(index).read() + source.add(index).read());
            }
        }
    }
}
