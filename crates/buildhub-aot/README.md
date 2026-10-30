# buildhub-aot

pack 的 LLVM 后端：把 `Code`（SSA）编译成 LLVM IR，并把运行时与生成的代码链接成**一个**产物。

| 文件 | 内容 |
|---|---|
| `src/emit.rs` | 发射器：`param_num` / `emit_ll` / `emit_driver`。每个 pack 函数一个 `define`，寄存器是 `alloca`，控制流是 `br` |
| `src/lib.rs` | 运行库：生成代码调用的 `bhub_*`（BVal 装箱、arena、记录、模式、数据集、高阶内建）。构建产物是 `buildhub_rt.lib` / `libbuildhub_rt.a`，同时也是 cdylib |
| `src/link.rs` | `--wasm` 的链接步骤：`clang -c pack.ll` → `cargo rustc -- -C link-arg=<pack.o>` → 单个 `pack.wasm` |
| `src/main.rs` | `buildhub-aot <pack-dir> -o <dir> [--wasm]` |

```bash
cargo build --release
./target/release/buildhub-aot ../buildhub-core/packs/dna -o out            # pack.ll + driver.c + entries.json
./target/release/buildhub-aot ../buildhub-core/packs/dna -o out --wasm     # 再加单个 pack.wasm
```

产物说明见 `crates/buildhub-core/EXECUTION.md` 的「路径 W-b」；两条路径的一致性由
`tests/aot_parity.rs` 断言：原生可执行与单个 wasm 都必须与解释器逐位相同。
