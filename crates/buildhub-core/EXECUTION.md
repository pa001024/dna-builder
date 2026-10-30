# buildhub-core 执行路径

规格 §9.5 定义了三条路径。三者共用**一份**前端与**一张**指令语义表，因此"同源同义"是结构
保证，不靠人工对齐（G5）。

| 路径 | 入口 | 编译发生在 | 状态 |
|---|---|---|---|
| **T** | `eval::Interp`（tree walk） | 每次装载 | 完整 |
| **B** | `image::decode` + `vm::Vm`（字节码） | 作者机 / CI / 后端，一次 | 完整 |
| **W-a** | `cabi`（`engine.wasm` + `CodeImage`） | 同上 | 完整（VM 编进 wasm，装载任意 pack） |
| **W-b** | `buildhub-aot`（LLVM IR → 原生目标码 / 单个 `pack.wasm`） | 作者机 / CI | 完整（每个 pack 函数一个 `define`，无解释循环） |

两条 W 各自解决一种发布方式：

- **W-a（`engine.wasm`）**：`buildhub-core` 的 `cabi` 模块把 `vm::Vm` 编成 wasm，宿主装载任意
  `CodeImage`——**core + pack** 两个文件。规则可以在不发版的情况下替换（§9.5.1），代价是运行时
  带着解释循环。
- **W-b（AOT）**：`buildhub-aot` 把 SSA **编译成 LLVM IR**，再由运行时把它链接成**单个**
  `pack.wasm`（运行时与 pack 在同一个模块里）。产物里没有指令分派表，也没有"每块一个函数"的
  伪编译——寄存器是 `alloca`，控制流是 `br`，数值是原生 `fadd`/`fcmp`。

## 两个 crate

| crate | 角色 | 产物 |
|---|---|---|
| `crates/buildhub-core` | 内核 + 解释器 + §10.2 C ABI（`src/cabi.rs`，特性 `cabi`） | `engine.wasm`（`build.sh`）、`buildhub` CLI、rlib |
| `crates/buildhub-aot` | 编译器（`src/emit.rs`）+ 编译产物的运行库（`src/lib.rs`） | `buildhub-aot` CLI、`buildhub_rt.lib`（原生）、`pack.wasm`（`--wasm`） |

`packs/dna` 是 core 的语料（`crates/buildhub-core/packs/dna`），两个 crate 的测试都从这里取。

早期版本生成"每块一个 Rust 函数、每指令一次 `step::*` 调用"的 crate 再编成 wasm。那是把 VM 的
分派循环搬到了编译器之外：块之间靠闭包返回，寄存器仍是 `Vec<Value>`，既没有直代码也没有省略
装箱。该实现已删除，`g4_aot_matches_the_native_paths` 现在断言产物的形态（无 `bhub_step` /
`bhub_exec`，存在条件分支）并逐位比对。

## `no_std`

内核是 `no_std` + `alloc`：

```bash
cargo build --lib --no-default-features     # 无 std（门禁另加 no_std_gate + -C panic=abort）
cargo build --lib                           # std（默认，含 loader/json）
```

为什么是 `alloc` 而不是纯 `no_std`：规则求值需要 `String`（符号名）、`Vec`（寄存器帧/列表）、
`Rc`（结构共享的不可变值）。这三样都在 `alloc` 里，且 `wasm32-unknown-unknown` 本就提供 `alloc`。
纯 `core` 需要把值表示改成 arena + 索引，会在每个指令上引入手工生命周期，不划算。

`libm` 不是权宜：§9.4 要求超越函数跨 target 一致，而 `f64::sqrt/ln/powf` 本身只在 `std` 下存在。
换成 `libm::` 同时满足两条。

特性划分：

| 特性 | 内容 | 为什么可分离 |
|---|---|---|
| （默认）`std` | CLI、文件系统路径 | 宿主工具，规则核不需要 |
| `loader` | 读 `pack.toml` 与数据文件 | 只在构建期发生（§4.2） |
| `json` | `bhub_call` 边界、`pack test` | 规则求值不接触 JSON |

`HashMap` 用 `hashbrown`（`alloc` 兼容），浮点用 `libm`，`Rc`/`Box`/`Vec` 走 `alloc`。
`tests/no_domain_leak.rs::kernel_builds_without_std` 是门禁：既断言无 std 构建成功，也断言依赖图
只剩 `hashbrown`/`foldhash`/`libm`（防止 `std` 悄悄回来）。

`src/cabi.rs` 属于同一套特性划分：`cabi = ["json", "loader"]`。它是 `no_std` 的（用
`OnceCell<RefCell<_>>` 代替 `thread_local!`，wasm 无 TLS），但 crate 同时声明 `rlib` + `cdylib`，
所以 `tests/no_domain_leak.rs` 的无 std 门禁用 `no_std_gate` 特性补一个只为链接服务的
`#[panic_handler]` + bump 分配器，并加 `-C panic=abort`。`.cargo/config.toml` 把 wasm 的初始
内存提到 8 MB（宿主装载 `CodeImage` 时不必先 grow）。

## 流水线

```
.bhl → lex → parse → resolve → R (tree) ─┬→ eval::Interp                       (T)
                                          └→ ssa::lower → Code ─┬→ vm::Vm       (B)
                                                                ├→ image::encode → CodeImage
                                                                │      ↓
                                                                │  core::cabi        (W-a: engine.wasm + pack)
                                                                └→ buildhub-aot::emit::emit_ll → pack.ll
                                                                       ↓ clang -O2 / wasm32 链接
                                                                  buildhub-aot 的运行库 (W-b)
```

`ssa::lower` 之后 `ssa::verify` 检查寄存器/常量/块/跳转边界；`image::decode` 在装载时**重新跑
一次 verify**，所以损坏或手改的镜像以 `BHC-E5xx` 失败而不是执行未定义行为。

## 位级一致（G4 / G10）

`tests/parity.rs` 断言：

- `g4_t_and_b_are_bit_identical` —— 纯函数入口在 T 与 B 上 `to_bits` 相等；
- `g4_t_and_b_agree_on_the_whole_pack` —— 覆盖 pack 的全部纯入口；
- `g4_wasm_agrees_with_the_native_paths` —— 有 wasm 产物时，W 与 T 逐位相等（`bhub_call_bits`
  返回原始 `u64`，JSON 不参与比对）；
- `g5_image_roundtrip_preserves_every_instruction` —— 编解码后指令流逐条相同；
- `g5_ssa_dump_is_deterministic` —— 同一源码两次 lowering 产出相同 SSA；
- `g10_bits_survive_the_image` —— `-0.0`、规范 NaN、`inf` 经镜像往返后位不变；
- `corrupt_image_is_rejected_not_executed` —— 翻转一个字节即被 CRC 拒绝。

数值确定性靠三件事：`f64` 位模式入镜像（不写十进制文本）、NaN 一律规范化成
`0x7ff8_0000_0000_0000`、`min`/`max` 取 wasm 语义（NaN 传播），见 §9.6.4。

## 用法

每个 crate 是独立包（没有根 workspace），命令都在 crate 目录里跑：

```bash
cd crates/buildhub-core

# 路径 T / B 对比（无需 wasm）
cargo run --release -- parity packs/dna

# 三路对比（先构建 engine.wasm）
sh build.sh
cargo run --release -- parity packs/dna \
  --wasm target/wasm32-unknown-unknown/release/buildhub_core.wasm

# 产物
cargo run --release -- image packs/dna -o out/dna.bhub      # 路径 B 的 CodeImage
cargo run --release -- image packs/dna --numeric host       # 声明 numeric = host

# 单次调用走哪条路径
cargo run --release -- eval packs/dna --fn damage --path b --config @c.json --args '[...]'

# SSA（G5 的比对物）
cargo run --release -- dump packs/dna --fn panel
```

```bash
cd crates/buildhub-aot

# 路径 W-b：LLVM IR + 原生 driver，或直接产出单个 wasm
./target/release/buildhub-aot ../buildhub-core/packs/dna -o out
./target/release/buildhub-aot ../buildhub-core/packs/dna -o out --wasm
```

## C ABI（§10.2）

`buildhub-core`（`cabi` 特性）导出，W-a 的宿主接口：

| 导出 | 用途 |
|---|---|
| `bhub_pkg_load(bytes, len)` | 装载 `CodeImage`，返回句柄（0 = 失败） |
| `bhub_pkg_bind_data(h, name, rows, key)` | 绑定数据集（数据与代码分离，§4.2） |
| `bhub_pkg_info(h, out_len)` | 入口 + schema 表 |
| `bhub_call(h, fn, args, out_len)` | 调用，`{"ok":true,"result":…}` |
| `bhub_call_bits(h, fn, args, out_bits)` | 位级比对专用，不经 JSON |
| `bhub_explain(h, fn, args, out_len)` | 调用树（走同一份插桩） |
| `bhub_numeric_mode(bytes, len)` | 镜像声明的数值口径 |
| `bhub_close(h)` | 释放 |

句柄绑定创建线程（VM 内部用 `Rc`，非 `Send`），跨线程使用返回错误码而非 UB。

## 体积

| 产物 | 实测 | 规格上限 |
|---|---|---|
| `engine.wasm`（W-a，VM + 数据 + ABI） | 597 KB | 700 KB |
| `dna.bhub`（CodeImage） | 27 KB | 2 MB |
| `dna.ll`（W-b，DNA pack 的 LLVM IR） | 43 k 行 | — |
| `pack.wasm`（W-b，运行时 + pack 编进同一个模块） | 886 KB | — |

§9.7 的 350 KB 上限是按 wasm 产物的静态体积写的；W-b 现在产出原生目标码，体积由链接器
按可达符号裁剪，不再受该口径约束（旧实现 994 KB 的原因——每块一个 `Result<Dist>` 帧 +
逐值 drop glue——随之消失）。

## 路径 W-b（AOT）：`crates/buildhub-aot`

```
Code (SSA) ──emit::emit_ll──► pack.ll ─┬─ clang -O2 + driver.c ─► 原生可执行
                                       └─ wasm32 链接（--wasm）  ─► 单个 pack.wasm
```

`buildhub-aot` 同时是**编译器**（`src/emit.rs`）和**编译产物的运行库**（`src/lib.rs`，C ABI 静态库）。
两边在同一个 crate 里，是因为它们的版本必须一致：`emit` 产出的 `declare` 与运行库导出的
`bhub_*` 是一张契约，分开发布就会漂移。

`--wasm` 的链路：`clang --target=wasm32-unknown-unknown -c pack.ll` 得到 pack 对象，再用
`cargo rustc -- … -C link-arg=<pack.o> -C link-arg=--export=f<id>` 把它并进运行库的 cdylib——
一个 cargo 调用就产出 `pack.wasm`，宿主只需这一个文件（不再需要 core + pack）。

发射形态（这是"编译"与"再实现一遍 VM"的分界）：

| | 旧实现（已删除） | 现实现 |
|---|---|---|
| 每个块 | 一个 Rust 函数，返回 `Result<Dist>` | 一段基本块，`alloca` 寄存器 + 真实 `br` |
| 寄存器 | `Vec<Value>` 下标 | `alloca`，`-O2` 的 mem2reg 提升为 SSA 值 |
| 数值 | 全部装箱 | 原生 `fadd`/`fmul`/`fcmp`，跨函数边界才装箱 |
| 函数调用 | 经 `Runtime` 查表 | 直接 `call` |
| 高阶内建 | 单态化 | `bhub_dispatch` 回调编译后的函数 |

运行库（`crates/buildhub-aot/src/lib.rs`）是 C ABI 静态库，值用 **BVal（NaN-boxed `i64`）** 传递，ABI 里不出现 Rust 类型：
数字是裸 `f64` 位模式，符号/布尔/none/unit/missing 内联在 tag 里，只有复合值带 arena 下标。
记录、符号、模式匹配、数据集、模式表都在运行时里；**没有任何寄存器数组或指令分派**。

### 装载契约（blob）

`bhub_init`（由发射器生成）按顺序装入四张表，缺一张语义就会静默降级：

| blob | 内容 | 缺了会怎样 |
|---|---|---|
| `@syms_blob` | 符号表，下标即 `Sym(i)` | 字段名全部错位 |
| `@pats_blob` | 模式表，下标即 `MatchPat.pat` | 所有 `match` 走 else 分支 |
| `@schemas_blob` | `SchemaCode` + `TyTag` 递归 | `Option` 字段不被包成 `Some`，`match … some(x)` 恒不命中 |
| `@data_blob` | `[[data]]`：集合名 → schema、key 字段 | 用 `id` 猜键，符号键数据集（`buffs.key`）索引为空 |

数据与代码分离（§4.2）：`bhub_load_data` 只收 JSON。转换走 `host::convert_set`，
与解释器 `pack::convert` 同一条规则——`TyTag::Option` 才包 `Some`，字段类型对不上时降级为
结构化转换而不是报错（宿主拿不到源码，只能宽容）。

### 性能

度量口径：`BHUB_REPEAT=N` 让驱动**在同一进程内**用同一份数据反复求值，每次之间调用
`bhub_reset` 回到启动水位；报告的 `ms/rep` 就是 pack 本身的开销（不含进程启动与数据装载），
`arena=` 是该次求值的句柄分配量。DNA pack、`benches/fixtures/target.json`：

| 入口 | 改造前 | 改造后 | 每次求值的句柄分配 |
|---|---|---|---|
| `panel` | 23.7 ms | **0.58 ms**（41×） | 3.1 k |
| `damage` | 23.7 ms | **0.61 ms**（39×） | 3.2 k |
| `target` | 348.8 ms | **13.2 ms**（26×） | 110 k |

「改造前」是同一台机器、同一份数据下**同一份产物**（旧发射器 + 旧运行时的 `pack.exe`）的单次求值：
进程总时长减去 `crit_expected` 的空载启动（43.6 ms）得到计算时间，取 12 次中位数。
「改造后」是 `BHUB_REPEAT=1000` 的每次迭代时间，两者相差一次配置解析（~1 ms），量级一致。
这张表是 NaN-boxing 落地时的口径；最新数字见「与 `dob-calc-core` 的比值」。

改了什么（每条都保持逐位一致）：

| 改动 | 效果 |
|---|---|
| **原生 `Bool`**：比较、`and`/`or`/`not`、`match` 结果都落在 `i1` 寄存器，分支直接 `br i1` | 每次求值少 ~16 k 次 `mk_bool`+`truthy`，少 3 k 次句柄分配 |
| **内联 NaN 规范化**：`fcmp uno` + `select` 代替 `bhub_canon` 调用 | 每次算术少一次跨模块调用 |
| **专用入口**：`len`/`at`/`concat`/`get_or`/`num_of`/`is_num`/`is_list`/`==`/`!=`/`str_len`/`str_at`/`str_slice`/`str_eq` 不再走 `bhub_prim` + 48 臂分派 + `Vec<Dist>` | `bhub_prim` 调用从 4 k 降到 ~1.2 k；字符级文本处理不再分配 |
| **模式形状特化**：`some(x)` → `bhub_match_some`（一次调用 + 一次 load）、`none` → `bhub_is_none`、`_`/`x` → 常量真值 | `match` 相关调用从 13 k 降到 2 k，`panel` −26% |
| **运行时去掉热路径上的 `RefCell`**（`BINDS`/`SCRATCH`/`PATS`/`DATA` → `UnsafeCell` + 内联访问）、**借用代替克隆**（`with_value`/`with_two`，`eq`/`field`/`bin`/`to_num`/`at`/`truthy` 等）、**`bhub_data` 不再整体克隆 `DataSet`**（含整张键索引）、`mk_*` 读参数与分配合并为一遍 | 单次调用：`eq` 22.3→5.4 ns、`match_some` 56.1→18.8、`field` 48.4→33.1、`to_num` 12.3→3.9、`truthy` 13.3→5.3；`panel` −20%、`target` −18% |
| **符号比较走整数**：`Bin{Eq\|Ne}` 一侧是符号常量时发 `bhub_sym_id` + `icmp`；`field(rec,key)` 作为 builtin 时发 `bhub_sym_id` + `bhub_field_opt`（保持 `Some`/`None` 语义） | `bhub_eq` 223→41 个静态点；`panel` −5%、`target` −4% |
| **混合操作数不再装箱**：句柄 ± 数值的算术/有序比较发 `bhub_bin_m`/`bhub_bin_n`；常量侧可静态判定的比较（`None`/`Bool`/`Sym`）就地判定，`Num` vs 句柄的 `Eq` 走 `to_num` + `fcmp` | `mk_num` 每次求值 56.9k→23.4k（−59%）、`bin` 35.7k→20.9k、`eq` 63.0k→44.9k；`target` 27.0→26.0 ms |
| **`Rc<Pattern>` + 预计算绑定槽**：`match` 不再深拷贝模式树、不再每次扫模式求槽位 | 7 k 次匹配各少一次分配 |
| **绑定帧交换**：匹配成功才发布，`SCRATCH`↔`BINDS` 交换复用 | 每次匹配不再分配 256 槽 |
| **回调参数帧复用**：`map`/`fold`/`filter` 每元素复用同一 `Vec<u32>` | 高阶内建不再每元素 malloc |
| **值表示改为 NaN-boxed `i64`（BVal）**：数字走裸 `f64` 位模式、符号/布尔/none/unit/missing 内联在 tag 里，只有 List/Tuple/Record/Closure/Str/Some/Ok/Err 进 arena | arena 分配 `target` 431 k → **110 k**、`panel` 29 k → **3.1 k**；单独看墙钟基本不变，但它是后面两项的前提 |
| **15 个内置专用入口**（运行库）：`map`/`filter`/`fold`/`any`/`all`/`concat_map`/`keys`/`min`/`max` + `clamp`/`sym_of`/`dedup_by`/`fold2`/`find`/`fix`，直接走 `DISPATCH`，回调帧每次内建一次而不是每元素一次 | `bhub_prim` 每次求值 8,481 → **139**；`panel` −49%、`damage` −46%、`target` −47% |
| **tag 判断内联**：`to_num`/`sym_id`/`is_num` 变成 IR 位运算（`icmp`/`lshr`/`select`），`bhub_dispatch` 的数值拆箱同样内联 | 48 k 次调用/eval 归零（32 k + 15.6 k + 0.2 k） |
| **记录字段下标**（`value.rs`）：≥12 字段的记录首次宽查找时惰性建 `Sym → slot` 表（boxed，`Record` 仍 40 字节），`set` 只在表已存在时维护；顺序/相等/哈希语义不变 | 44 字段记录查找 14.8 → 5.0 ns 且构造只 +14%；`panel` −10.6%、B 路径 −9.3% |
| **值操作变薄**：`eq`/`ne` 先比原始位再按 tag 分派（不再无条件 `dec`）、`bin` 两侧都是裸数值时直接算 f64（不进算子表）、`at` 借容器槽位取值 | `eq(num,num)` 8.7→3.1 ns、`eq(mixed)` 21.2→3.1、`bin Add` 14.2→4.2、`at` 26.3→14.2；`panel` −5.3%、`target` −3.3% |
| **`bhub_reset` 截断到启动水位**（新增 `bhub_mark`） | 修复：清空整个 arena 会让 `@k*` 常量句柄悬空，第二次求值起全错 |
| **AOT 句柄恒等记忆化**：每个 pack 函数一张 64 槽直接映射表（`@m{id}_e/_k/_r`），键是参数的 BVal 原字；`bhub_reset` 递增 `@bhub_memo_epoch` 让上一轮条目失效 | 值不可变 ⇒ 句柄恒等蕴含值相等，省掉结构哈希；`target` 13.2 → 5.0 ms |
| **稳定句柄**：`Closure::fast` 保存捕获值的已编码句柄、字符串按内容驻留（`STRS`）、List/Tuple/Record/Closure 按 `Rc` 指针身份复用句柄（`IDS` 直接映射表） | 命中率就是恒等记忆化的全部；闭包捕获一项 `target` 5.0 → 2.03 ms、arena 51.6 k → 21.1 k，字符串驻留再降到 ~1.9 ms |
| **回调帧池化 + 裸 BVal 分派**：`call_value`/`fix`/`map`/`fold`/`filter` 复用同一个 `ARGBUF` 帧；谓词真值在 BVal 层判定（`truthy_bval`），`any`/`all` 直接返回谓词原字；`fix` 的 step/done 帧只组一次 | 每次回调少一次帧分配、参数不再逐项 decode/enc 往返；三条合起来 `target` ~2.0 ms（同机噪声 ±8%） |
| **DNA pack 的分词 / 引用 / 查表重写**：数字字面量一遍扫完（`number_scan` 同时给出结尾与数值）、引用预扫改单趟 `fix`（`ref_step`，不再为每个文本建 `num.range` 索引）、`pair_lookup`/`custom_var_text`/`kind_slots`/`kind_bucket` 各自成函数（键稳定后才会命中记忆化）、`id_count` 取代 `filter`+`len` | 同一窗口交替 A/B：`target` 2.5 → 2.0 ms（−20%）；全部逐位一致 |
| **令牌扁平化**：令牌从三字段记录改成「代码 + 载荷」两槽位扁平列表（代码 0 = 数字、1 = 名称、1000 + 字符 = 运算符，载荷是数值或文本）；运算符探测由「一次 `at` + 两次记忆化取值」变成「一次 `at` + 一次比较」，顺带少一次记录分配 | `target` 2.07 → 1.95 ms（交替 A/B，−6%）；每次求值的句柄分配 7.2 k → 5.9 k |
| **绑定槽继承类别**（发射器）：`let x = e` 的绑定槽从源寄存器继承 `Num`/`Bool` 类别（`MatchPat` 的 `Bind` / `Some(Bind)`），`store_handle` 对 `Bool` 槽转成 `i1` | 布尔中间值不再装箱：`step_token` 里的 `&&`/`not` 由 `bhub_bin`/`bhub_un` 变成 `and i1`/`xor i1`；`target` 中性（同窗口 A/B） |
| **解析器优先层只取一次令牌代码**：`loop_add`/`loop_mul`/`parse_unary`/`skip_suffix` 先用一次 `tok_code` 取当前令牌代码，再和 `1000+字符` 比较；原来是每层各发一次 `tok_is_op` | `tok_is_op` 1108 → 555 次/求值（`tok_code` 155 → 428），少 ~280 次 pack 调用；同窗口 A/B 在噪声内（±5%），保留是因为调用数确实降了且逐位一致 |
| **元素系列 MOD 按键归并**：`series_table` 与 `mod_table_of` 同一趟 `group_sum`，`bonus_of_b` 的加权项从「每个键重扫系列 MOD」变成 `ratio × rec_num(st, key)`；`mod_attr_ratio` 直接取 `mod_table_of` 的同一键（原来每个键都要 `sum_key` 再扫一遍全部 MOD） | 40 个键各少一次 `fold2(series)` 与一次 `sum_key`；同窗口 A/B：`target` 1.81 → 1.72 ms、`panel` 0.51 → 0.42 ms、`damage` 0.59 → 0.42 ms |

### 剖析：为什么剩下的都是「调用次数」

单次 `target`（`.tmp/abix` 的配置）约 2.6 万次内置调用 + 9 千次 pack 函数调用，1.7 ms ÷ 3.4 万
≈ **每次调用 50 ns**；同一台机器上的空转调用（`fix` 循环体 / 直接递归）也是 46–55 ns/次。
分块测量（同一 pack 副本加临时入口）：分词 0.44 ms、引用扫描 0.53 ms（含分词）、属性面板
0.38 ms、属性表 0.52 ms、表达式求值 1.25 ms，合计与 `target` 对得上。也就是说，**剩余差距
来自调用密度**（纯 Rust 版本没有任何跨模块调用），不是某一段算法。

按自耗时（rdtsc 进出计数，递归安全版）粗排：`step_token` 13%、`scan_ident`/`ref_step`/
`tokenize` 合计 ~6%、`lookup`/`custom_var_text`/`pair_lookup` 的线性查找 ~5%、
`mod_value`/`bonus_of_b`/`weapon_effect`/`effective_level` 等面板函数合计 ~7%。
按调用次数：`ref_step` 5460、`step_token` 5460、`scan_ident` 1620、`lookup` 760。

本轮试过但没有留下（都在同窗口交替 A/B 下无收益或更差）：

- 记忆化表大小 16/32/128/256 槽（64 最好；1 键函数给 256 槽反而 −7%，缓存压力）
- 只给 ≤2 键的函数记忆化（−3%：少数命中很值钱）
- `tok_is_op` 改成「`at` 后直接和数字比」（−8%：`bhub_eq` 比 `len`+`num_of` 更贵）
- `-O3`、跨语言 LTO（`cargo rustc -- -C linker-plugin-lto` + `clang -flto -fuse-ld=lld`
  能链接且逐位一致，但 ±3% 属于噪声；`-C linker-plugin-lto` 会顺带打断 build script，需要改
  `crate-type` 才能出 bitcode，落地成本高于收益）
- 乐观 `ret_num` 不动点（递归函数返回裸数字）：产出代码错误（`target` 直接空输出），已回退
- 属性面板按需取值（`pn(c, p, key)` 三态：记录 / `field_panel` / `panel` 逐键计算，配合
  `ref_step` 顺带收集文本里出现的属性名、`precompute_attrs` 只算用到的 12/39 个键）：
  逐位一致，但同窗口 A/B 慢 5–10%。原因是每个键都要重算 `mod_table_of` / `series_table` /
  `buff_table_of`（一次 `target` 有 70+ 次 `pn`），省下的 27 个键（≈0.1 ms）抵不过重复的
  共享准备（≈0.2 ms）。真要做就得把「共享准备」放进 env 里，而那会改变 `target` 的求值顺序
- 分词累积分块（每 32 槽把 `acc` 并进 chunks）：`concat` 次数少了，但 `concat_map` 展平
  与元组往返更贵，慢 8%

下一步能动这块的只剩减少调用密度本身：把属性表改成「求值时惰性、但共享一次准备」（需要
env 里带一份准备句柄），或把解析器的优先级链改成 precedence climbing（每个 token 只探一次
而不是每层一次）。

### 与 `dob-calc-core` 的比值

同一台机器上 `dob-calc-core::evaluate_build`（`cargo bench --bench bench_calc`）best 在
199–272 µs 之间波动（负载相关）；下表按**最不利**的 199.5 µs 折算：

| 工作负载 | 编译产物 | 倍数（core 取 199.5 µs） |
|---|---|---|
| `panel`（属性汇总，对应 core 的属性计算） | 0.42 ms | **2.1×** |
| `damage`（单次伤害，对应 core 的伤害结算） | 0.42 ms | **2.1×** |
| `target`（属性 + 文本表达式求值） | 1.72 ms | **8.6×** |

前两行是 core 里真实存在的计算。第三行不是同一件事：`target` 在属性之外还要跑 pack 自带的
表达式解释器（分词 + `parse_expr` 递归下降 + 变量解析），core 没有对应功能；同一份 pack 在
解释器上也要 44.4 ms。

`target` 从 66× 收到 ≈8.6×，靠的是上表末五条（句柄恒等记忆化 + 稳定句柄把重复子表达式整段
消掉，pack 侧的分词与令牌表示再把每次求值的固定开销压下来），不是把单次操作做得更快；
单次操作仍是「跨模块调用 + arena 分配」模型，每次 ~40–90 ns。

`g4_aot_matches_the_native_paths` 现在多查两条：IR 里每个 `alloca` 的寄存器只被同类型 store 写入
（`store i32` 写进 `alloca i1` 会越过槽位踩坏栈帧——这正是原生 `Bool` 落地时踩过的坑），
以及数据驱动入口（`panel`/`target`/`target_list`）的 AOT 输出与解释器逐字符相同。

### 驱动

`buildhub-aot` 同时写 `driver.c`：入口表（名字、参数种类、返回是 `double` 还是句柄）从 `Code` 生成，
返回类型从 `pack.ll` 反读，两侧不会漂移；`entries.json` 把同一张表交给 wasm 宿主。Windows 上
`main` 拿到的是 ANSI 代码页，所以驱动用 `CommandLineToArgvW` 重建 argv——否则 `光` 这类 UTF-8
符号名传进去就变。

```bash
cd crates/buildhub-aot
./target/release/buildhub-aot ../buildhub-core/packs/dna -o out/llvm            # pack.ll + driver.c + entries.json
cd out/llvm && clang -O2 pack.ll driver.c ../../../buildhub-aot/target/release/buildhub_rt.lib -o dna.exe -lshell32
./dna.exe data.json cfg.json panel
./dna.exe data.json cfg.json damage '{"kind":"skill","element":"光","multiplier":1.0}'
```

单个 wasm（`--wasm`）用同一张入口表驱动：`bhub_init` → `bhub_load_data(ptr,len)` → `f<fn>(…)`，
数值入口直接返回 `f64`，句柄入口交给 `bhub_show` / `bhub_to_num`。`tests/aot_parity.rs` 里的
`g4_single_wasm_matches_the_native_paths` 在 Node 里跑整条链路并与解释器逐位比对。

验证（DNA pack，`benches/fixtures/target.json`）：`panel` 的 43 个数值字段与解释器逐字段相等，
整条记录 `show` 出来的文本相同；`damage` 两种 `Source` 位级相同；`target` 位级相同。

## 未做

- **含 `choice` 的 pack 还不能走 W-b**：`emit_ll` 对出现 `Choose` / `Builtin::Choice` 的 pack
  返回 `None`。分布机（支撑集传播、`tree` 记录）仍未下放到 AOT，那需要把 `Dist` 的表示与
  合并规则一并编译进来，是运行时层的工作。
- W-b 的 wasm 产物只暴露"入口表 + 数据装载"（`entries.json` + `bhub_load_data`），没有
  `bhub_pkg_*` 全套：规则已编进模块，不需要装载，但也没有 `bind_data`/`explain`/`trace`
  这些按次调用的接口。
- `bhub_trace` 未暴露到 ABI：`sim::run` 已经在 T 与 B 上共用，但把 `opts`/结果投影编进产物
  还需要把 `TraceResult` 的 JSON 序列化移进 core（当前在 CLI 侧）。
