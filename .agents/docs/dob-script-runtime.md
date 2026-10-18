# dob-script-runtime（脚本运行时 crate）

脚本引擎（Boa JS + 视觉/输入/系统内置函数）已从 `apps/web/src-tauri` 提取到
`crates/dob-script-runtime`，依赖方向为：

- `apps/web/src-tauri`（Tauri 应用）→ 依赖 `dob-script-runtime`
- dob-script CLI（`crates/dob-script-runtime/examples/dob-script.rs`）→ 依赖 `dob-script-runtime`
- `dob-script-runtime` 不依赖 apps 内任何代码（只依赖外部 crates + `mcp_server`）

## 模块布局

- `src/script*.rs`：引擎核心（`script.rs`）、6000+ 行内置函数（`script_builtin.rs`）、
  console（`script_console.rs`）、ESM 加载器（`script_module.rs`，内含 `script_cap.js`）、
  视觉算法（`script_vision.rs`）、MCP 缓存与后端（`script_mcp.rs`）
- `src/jsmat.rs` / `jsdnn.rs` / `jstimer.rs` / `async_tokio.rs` / `logger.rs`：JS 绑定与支撑
- `src/capture.rs`：截图/捕获（原 `src-tauri/src/submodules/util.rs`，改名避免与 `util` 冲突）
- `src/util.rs`：`is_elevated` 等 Win32 工具（原 `src-tauri/src/util.rs` 拷贝，应用侧保留自有副本）
- `src/{win,input,tpl,tpl_match,color,color_match,d3d11,dll_call,fx,ocr,mono_depth,predict_rotation,route,setvol}.rs`：
  从 `submodules/` 平移，`crate::submodules::X` 引用已改为 `crate::X`
- `vendor/opencv/opencv_world490.dll`：运行时 DLL 归本 crate 所有；
  本 crate `build.rs` 与应用侧 `build.rs` 各自注入到自己的 `target/<profile>` 下
- `#[cfg(feature = "dob-script-cli")]`：CLI 专用的 StdioLogger 与 readConfig/setConfig
  文件直读直写；该 feature 只属于本 crate，应用侧已移除同名 feature

## 应用侧兼容垫片

- `apps/web/src-tauri/src/submodules/mod.rs` 不再包含实现，
  全部改为 `pub use dob_script_runtime::X;`（`submodules::util` 别名到 `capture`），
  既有 `crate::submodules::win::…` 引用零改动可用；新代码应直接用 `dob_script_runtime`
- 应用侧独有模块仍留在原地：`float_window`、`hotkey`、`lan_sync`、`repak_tools`、`taskbar`

## 常用命令

```bash
cargo check --manifest-path crates/dob-script-runtime/Cargo.toml
cargo check --manifest-path crates/dob-script-runtime/Cargo.toml --features dob-script-cli --example dob-script
cargo test --manifest-path crates/dob-script-runtime/Cargo.toml --lib -- --skip ocr::tests::direct_ocr
cargo check --manifest-path apps/web/src-tauri/Cargo.toml --lib
pnpm run build:dob-script   # 构建 CLI 并同步到 packages/dob-script/bin
```

注意：`ocr::tests::direct_ocr_matches_dll_output_and_speed` 需要本机
`%LOCALAPPDATA%/dna-builder/ocr` 下已下载模型 + `misc/1.png`，默认跳过。
