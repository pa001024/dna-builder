# dob-calc-core

《二重螺旋》构筑（CharBuild）计算流程的跨平台 Rust 实现，供 [DNA Builder](https://dna-builder.cn) 与第三方工具复用。

行为对齐 TypeScript 版实现（仓库内 `packages/data`），通过 `tests/fixtures/` 下的 parity 夹具逐字段校验；`wasm32-unknown-unknown` 可编译，无 FS / 网络 / 线程 / 时间依赖。

## 能力

- **建表**：把游戏数据包（模块 / 存档 / 潜质等 JSON）展开成查询索引，一次构建、多次复用。
- **求值**：装配构筑 → 角色属性 → 武器面板 → 目标函数（总伤害 / DPS）与伤害明细。
- **表达式批量求值**：一条会话内批量算表达式，逐条返回错误而不中断。
- **自动构筑**：在给定候选池上按确定性种子搜索，结果可复现。
- **C ABI**：`capi` 模块提供 wasm / cdylib 入口，宿主侧只需传 JSON 字符串。

## 安装

```toml
[dependencies]
dob-calc-core = "0.1"
```

## 用法

```rust
use dob_calc_core::BuildPayload;
use dob_calc_core::evaluate::{BuildRequest, evaluate_build};

let payload = BuildPayload::from_json(&modules_json)?; // 建表：较贵，进程内缓存复用
let request = BuildRequest::from_json(&raw_request)?;
let result = evaluate_build(&payload.tables, &request);

println!("target = {}", result.target_value);
assert!(result.error.is_none());
```

`modules_json` 为游戏数据包的模块段：直接给 `{ "char.data": [...], "mod.data": [...], ... }`，或包一层 `{ "modules": { ... }, "petTraits": [...] }` 都接受。`raw_request` 形如 `{ "charId": 100101, "settings": { ... }, "seed": 0 }`，`settings` 的字段语义与上游 `CharSettings` 一致。

## C ABI / wasm

```toml
[lib]
crate-type = ["cdylib", "rlib"]
```

`capi` 暴露 `BuildPayload` 会话注册表 + JSON 进出接口，适合 wasm 主路径（线程局部会话，单线程使用）与 native cdylib 动态加载。

```bash
cargo build --release --target wasm32-unknown-unknown --lib
cargo run --release --example bench -- eval
```

## 一致性

- `cargo test` 跑全部 parity 夹具（属性 / 武器 / 潜质 / 时间轴 / 自动构筑 / BUFF 禁用等）。
- 容差口径与上游一致：`|expected| < 1e-9` 时取绝对误差 `1e-9`，否则 `max(|expected| × 1e-6, 1e-9)`。

## 许可

MIT，见 [LICENSE](https://github.com/pa001024/dna-builder/blob/master/LICENSE)。
