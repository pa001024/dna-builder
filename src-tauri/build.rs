#[cfg(target_os = "windows")]
use std::{
    env,
    fs,
    path::{Path, PathBuf},
};

#[cfg(target_os = "windows")]
const OPENCV_DLL_NAME: &str = "opencv_world490.dll";

/**
 * 构建入口：注入 Windows 运行时依赖后再交给 tauri-build。
 */
fn main() {
    #[cfg(target_os = "windows")]
    {
        inject_common_controls_manifest();
        inject_vendor_runtime_dlls();
    }
    tauri_build::build()
}

/**
 * 为 Windows 可执行目标注入新版 Common Controls 清单，并为 example 启用 comctl32 延迟加载。
 */
#[cfg(target_os = "windows")]
fn inject_common_controls_manifest() {
    println!(
        "cargo:rustc-link-arg-bins=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
    );
    println!(
        "cargo:rustc-link-arg-examples=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
    );
    println!("cargo:rustc-link-arg-examples=/DELAYLOAD:comctl32.dll");
    println!("cargo:rustc-link-arg-examples=delayimp.lib");
}

/**
 * 将 vendor 里的运行时 DLL 以和 ort `copy-dylibs` 相同的产物层级注入到输出目录。
 */
#[cfg(target_os = "windows")]
fn inject_vendor_runtime_dlls() {
    let vendor_dll_path = vendor_opencv_dll_path();
    if !vendor_dll_path.exists() {
        panic!(
            "OpenCV vendor DLL 缺失，请确认仓库中存在 {}",
            vendor_dll_path.display()
        );
    }
    let profile_dir = cargo_profile_dir();
    for target_dir in [profile_dir.clone(), profile_dir.join("examples"), profile_dir.join("deps")] {
        link_or_copy_runtime_dll(&vendor_dll_path, &target_dir.join(OPENCV_DLL_NAME));
    }
}

/**
 * 返回 OpenCV vendor DLL 的标准路径。
 */
#[cfg(target_os = "windows")]
fn vendor_opencv_dll_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("vendor").join("opencv").join(OPENCV_DLL_NAME)
}

/**
 * 根据 Cargo 的 OUT_DIR 反推当前 profile 目录，例如 `target/release`。
 */
#[cfg(target_os = "windows")]
fn cargo_profile_dir() -> PathBuf {
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR 未设置"));
    out_dir
        .ancestors()
        .nth(3)
        .expect("无法从 OUT_DIR 解析 Cargo profile 目录")
        .to_path_buf()
}

/**
 * 优先使用符号链接贴近 ort 的 `copy-dylibs` 行为，失败时回退为复制。
 */
#[cfg(target_os = "windows")]
fn link_or_copy_runtime_dll(source_path: &Path, target_path: &Path) {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).expect("创建 DLL 注入目录失败");
    }

    if let Ok(metadata) = fs::symlink_metadata(target_path) {
        if metadata.file_type().is_symlink() {
            fs::remove_file(target_path).unwrap_or_else(|error| {
                panic!("移除旧符号链接 {} 失败: {}", target_path.display(), error)
            });
        }
    }

    if target_path.exists() {
        return;
    }

    if std::os::windows::fs::symlink_file(source_path, target_path).is_ok() {
        println!("cargo:rerun-if-changed={}", target_path.display());
        return;
    }

    fs::copy(source_path, target_path).unwrap_or_else(|error| {
        panic!(
            "复制 {} 到 {} 失败: {}",
            source_path.display(),
            target_path.display(),
            error
        )
    });
}
