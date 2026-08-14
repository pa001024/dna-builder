use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let vendor_dir = manifest_dir.join("vendor");
    let freestanding = manifest_dir.join("freestanding");

    // 编译 HDiffPatch 补丁侧实现 + wasm32 裸机 libc 存根 + 薄封装。
    // 禁用多线程、内存安全检查与 errno 日志，消除对 pthread / 平台接口依赖。
    cc::Build::new()
        .files([
            vendor_dir.join("HPatch/patch.c"),
            manifest_dir.join("src/wasm_libc.c"),
            manifest_dir.join("src/wrapper.c"),
        ])
        .include(&vendor_dir)
        .include(vendor_dir.join("HPatch"))
        .include(&freestanding)
        .flag("-D_IS_USED_MULTITHREAD=0")
        .flag("-D_IS_RUN_MEM_SAFE_CHECK=0")
        .flag("-D_HPATCH_IS_USED_errno=0")
        .warnings(false)
        .compile("hdiffpatch");

    println!("cargo:rustc-link-lib=static=hdiffpatch");
}
