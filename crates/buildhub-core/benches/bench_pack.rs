//! buildhub pack 端到端基准：手写 best-of-N，零新增依赖。
//!
//! 方法与 `crates/dob-calc-core/benches/bench_calc.rs` 完全同形（spec §12.2）：
//! 预热 → 9 轮 best（统计量取 min）→ 每轮断言结果等价 → 分阶段计时定位热点。
//!
//! 场景与 dob-calc-core 的 `dobapp_vy` 同一份构筑（`薇召唤体系`，目标 `总和DPS`），
//! 因此两侧 best 可直接对比。
//!
//! 分阶段对齐两侧的语义单位：
//!
//! | buildhub 阶段 | 对应 dob-calc-core 阶段 |
//! |---|---|
//! | `load_pack` | `TableBuilder::build`（数据建表）※ 见下 |
//! | `json_to_value` | `BuildRequest::from_json`（请求解析） |
//! | `Interp::new`（路径 T）/ `Vm::new`（路径 B） | `BuildContext::new`（上下文装配） |
//! | `call + project` | `Evaluator::new + evaluate`（目标求值） |
//! | `call + project`（端到端） | `evaluate_build`（装配 + 求值） |
//!
//! ※ `load_pack` 不是 `TableBuilder::build` 的同义词：前者还要 lex/parse/check/lower 整份
//!   BHL 源码并发射字节码，后者只是把 JSON 摊平成索引表。同机实测两者分别是 ~92ms 与 ~14ms，
//!   差的那 78ms 全部是「把规则写成一门语言」的编译成本，换来的是规则可热替换、可 AOT 到 wasm。
//!
//! 同机交替 A/B（同一进程时段内 opt/pre 轮换，`load_pack` 作速度校准）；
//! 数字为 best-of-9 × 3 次，目标 `总和DPS`：
//!
//! | 路径 | 起点 | 现在 | 变化 |
//! |---|---|---|---|
//! | T `panel` | 17.7ms | 2.8–3.0ms | **−84%** |
//! | T `target` | 132.3ms | 42ms | **−68%** |
//! | B `panel` | 16.5ms | 5.0–5.6ms | **−66~70%** |
//! | B `target` | 42.7ms | 25–30ms | **−30~41%** |
//!
//! 这台机器在本轮期间漂移达 ±20%（同一构建的 `target` 在 40–51ms 间波动），因此只有在
//! **同一时段内交替 A/B** 得到的比值可信，绝对值仅供参考。
//! | W AOT（`opt-level="z"`，发布配置） | 243ms | 135.4ms | **−44%** |
//! | W AOT（`opt-level=3`） | 225ms | 93.7ms | **−58%** |
//! | `dob-calc-core::evaluate_build` | — | 0.20ms | 1× |
//!
//! 解释器调用数 101806 → **30904（−70%）**。最优路径是 B ≈ 31ms（约引擎的 155 倍）。
//!
//! ## 已落地（每条都通过 87/87 与 T/B/W 位级一致）
//!
//! 引擎：
//! - `FramePool`：T 的调用帧槽位复用，不再每次分配 `Vec<Value>`。
//! - `Host::alloc_regs`/`free_regs`：AOT/VM 寄存器文件池化。
//! - `step::call_static_regs`：AOT 免去每次调用的 `Vec<Dist>`。
//! - `R::CallStatic` 常规路径不再走 `Dist::points()`（它对 `One` 也分配两个对象）。
//! - `invoke_plain` 收 `&[Value]`，免去 `args.to_vec()`。
//! - `project` 的 `Dist::One` 快路径：不再为单值结果走 `trim`（每次分配一个 `Vec<Pt>`）。
//!   单次裸调用从 462ns 降到 378ns；对整次求值影响很小（只作用于最外层投影）。
//! - 文本内建不再分配：`str_at`/`str_len`/`str_slice`/`str_eq` 借 `&str` 而非收集 `Vec<char>`
//!   （分词器按字符调用 `str_at`，原实现每取一个字符就展开整串）。B `target` −7%。
//!
//! pack：
//! - `mod_base`：`opt_leveled → leveled_scalar → effective_level` 三层压成一层。
//! - `buff_attr`：内联 `buff_level` 与三次 `opt_num`。
//! - `tok_is_op`：单次取值（原来取两次 `tok_at`）。
//! - `all_buffs`/`mod_attr_ratio`：从 40 个属性的循环里提出。
//! - `mod_table_of`/`buff_table_of`：`keys` + `group_sum` 一遍归并（见下）。
//! - `mods_of_kind`：`dedup_by` 取代「每槽位 `find` 整表」的 O(n²)。
//! - 高阶内建（`fold`/`filter`…）改用 `Host::call_plain`：原来**每个元素**都要构造
//!   `Vec<Dist>` 再经 `Dist::chain`，现在是 `call_plain(&fv, &[acc, item])`。交替 A/B：
//!   T `target` 48.1 → **42.1ms（−12.5%）**。
//! - `R::Builtin` 不再构造 `Vec<Dist>`：内建是 T 路径最大单项（36% 自身时间、约 37k 次/求值），
//!   常规路径改为栈上定长数组 + `call_plain` 单值分派。A/B 实测 T `target` 47.7 → **40.3ms**。
//! - `fold2`（新增 §3.3 内建）：`(Mod, Num)` 列表的 fold 直接解构成两个参数，省掉每元素
//!   两次 `at`。交替 A/B：T `target` 43.4 → **41.9ms（−3.5%）**。
//! - `element_series_mods`：元素系列 MOD 只筛一次；原来每个属性都对全部 MOD 重跑
//!   `at(e,0)` + `element_series`（40 键 × 24 MOD）。T `target` −13%、B −16%。
//!
//! ## §3.3 补的三个通用内建（都不含领域词汇）
//!
//! - `keys(rec) -> List<Sym>`：字段名（插入序；`Some(rec)` 视同该记录）。
//! - `group_sum(List<(Sym, Num)>) -> Record`：按键归并求和。
//! - `dedup_by(List<T>, |T| K) -> List<T>`：保留每个键的首次出现（O(n²) → 线性）。
//!
//! 动机：引擎的 `char_attrs` 是「一遍遍历 MOD 累加全部属性」，而 BHL 原先没有可变累加器
//! —— 用 `fold` + 记录累加每加一个键就要复制整张表。补上这三个原语后 pack 才能复刻该算法。
//!
//! ## AOT（路径 W）
//!
//! - 静态调用直呼块函数（`f<T>_b0(host, &mut cr)`），不再走 `invoke` → `BLOCKS` → 间接调用，
//!   也不再为每次调用构造 `Vec<Value>`；实参在单值路径上寄存器到寄存器直接搬。
//! - `Enter`/`Fork` 直呼已知块函数（`fn_id`/`blk` 在发射期是常量）。
//! - `Fork` 的单值快路径直接调用分支块，不再经 `step::fork` 的闭包 + 间接调用
//!   （生成代码里 `Fork` 有 692 处、`Choose` 为 0）。
//! - 被调方寄存器改用栈上定长数组（`core::array::from_fn`），`nregs` 在发射期是常量。
//! - 生成代码用 `regs[d] = ...` / `regs[s].clone()` 取代 `step::write/read`。
//! - **稠密发射**（重写的核心）：块图是树时（无 `choose`、无捕获、每个块仅被引用一次），
//!   整个 pack 函数合成**一个** Rust 函数——块在引用点内联成嵌套控制流，函数帧是栈上定长数组
//!   `[Dist; N]`。312 个函数走稠密形态，43 个（含 `choose`/闭包）保留块形态。
//!   `Enter`/`Fork` 不再经块函数或块表；`Fork` 用 `Dist::chain` 统一单值与分布式两条路径，
//!   因此每个分支只生成一份代码。所有函数统一暴露入口 `e{id}`，调用点无需知道发射形态。
//!   效果：`opt3` 99.6 → **91.6ms**、`"z"` 139.6 → **135.4ms**；wasm 5.16 → **4.98MB**。
//!
//! 体积/速度权衡（实测）：`opt-level="z"` 5.16MB / 139.6ms；`opt-level=3` 9.89MB / 99.6ms。
//! 默认保持 `"z"`——`opt-level=3` 也近乎翻倍体积，会突破 §9.7 的产物预算。
//!
//! **关键诊断 1（决定性的）**：同样的工作量，AOT 比 AST 解释器慢 **7.7 倍** ——
//! `panel` 在 AOT 是 24.5ms、在 T 是 3.2ms。生成代码（346 函数 × 多块的机器码）没有换来任何
//! 优势，反而被自身结构拖累。这说明当前「SSA 摊平成 per-block 函数」的形态本身是错的。
//!
//! **Profile（rdtsc 自身时间归因，T 路径）**：`Builtin` 36.1% / `Binary` 18.3% /
//! `CallStatic` 15.7% / `LetPat` 7.6% / `Local` 7.2% / `Match` 3.7% / `Field` 3.6%。
//! 一次求值有 **38482 次内建调用**，前七种占 83%：
//! `at` 13364、`field` 6502、`get_or` 3218、`len` 2705、`str_at` 2413、`str_eq` 2347、`concat` 1509。
//! 这解释了为什么「缩小调用边界」的尝试全部无效 —— 成本在**值处理**，不在控制流。
//!
//! 据此已落地：`builtins::call_plain`（单值操作数直接分派，不再构造 `Vec<Dist>`）、
//! `as_slice`（高阶内建借用列表而非克隆）、文本内建去分配、`project` 单值快路径。
//! `Binary`/`at`/`field` 的剩余成本在装箱与「每次调用一次间接跳转」，只有无装箱后端能消掉。
//!
//! **关键诊断 2**：一次求值只有 **21866 次块进入**却耗 ~100ms，而下列改动全部落在噪声内：
//! 消除边界检查（100.5→100.0）、栈帧取代池（100.0→99.6）、`step::bin` 放开内联（−3.6%）。
//! 说明瓶颈既不在派发也不在调用机械，而在**值的动态表示**（每条指令都在搬 `Dist`/`Value`）
//! 与**算法量级**。要「对齐 core 性能」必须做特化编译（属性表摊平成 `f64`、对纯数值子图
//! 发射无装箱代码），而 §9.6.1 明确「只编规则，不编数据」——数据在运行期才进来，
//! 特化因此被设计层面排除。下一步能做到的是 SSA 级内联（消除小函数如 `rec_num`/`opt_num`
//! 的调用边界），那是量级内的收益，不是 core 级。
//!
//! ## 运维注意
//!
//! 新增内建会改变镜像里的 builtin tag，**必须重建 wasm 引擎产物**，否则
//! `g4_wasm_agrees_with_the_native_paths` 会以 `LOAD_FAILED` 失败：
//! ```text
//! (cd crates/buildhub-core && sh build.sh)   # engine.wasm = core + pack
//! ```
//!
//! ## 已否决（实测回退）
//!
//! - `R::CallStatic` 接 memo：**更慢 +17%**，缓存跳过 `next_choice` 推进，破坏 §9.8.2 相关性。
//! - `CondCtx` 携带四类 MOD 桶：T 降到 61ms 但 **B 退化 +15%**（最优路径变慢）。
//! - `mods_of_kind` 改单遍（用 `seen` 列表查重）：**T 反而 +40%**。
//! - `field_or(rec, key, default)`：少一次内建调用，但实测在噪声内。
//! - **`Num` 无装箱**（参数声明类型 → `f64` 寄存器，`Const`/`Bin`/`Un` 数值链直出 `f64`，
//!   跨界时才装箱；产物里 160 个函数、1503 处无装箱运算）：**105.0ms**，与稠密版 105.8ms
//!   **无差异**。数值运算只占执行指令的一小部分，`Record`/`Builtin`/`Rc` 才是主体。
//! - **词法化重写**（SSA 值 → Rust 局部变量：`Const`/`Bin`/`Un`/`Prim`/`Call` 产出 `let vN = ...`，
//!   帧只在函数含 `match_pat` 时按绑定槽位上界分配）：**108.8ms**，与稠密寄存器帧的
//!   91.6～105.8ms 在噪声内，没有收益。`Dist` 的 32 字节搬运与 `Rc` 计数本身就压过索引开销。
//! - **SSA 级内联**（单块小函数、寄存器映射代替 `mov`、按调用图后序展开）：
//!   B `target` 30.9 → **42.4ms（+37%）**、AOT 99.6 → **108ms（+8%）**。原因是内联把被调函数的
//!   寄存器并入调用者，**每个热函数的帧都变大**，而帧的清零/分配是每次调用的固定成本，
//!   抵消了省下的调用边界。这条否证很重要：它说明成本**不在调用开销**上。
//! - 把 `step::bin` 等放开 `#[inline]`：只快 3.6%，与「`#[inline(never)]` 是为体积」的约定冲突。
//!
//! 运行（release，必须）：
//! ```text
//! cargo test --release --bench bench_pack -- --nocapture
//! ```

use std::time::Instant;

use buildhub_core::eval::{Budget, Interp};
use buildhub_core::pack::{LoadedPack, load_pack};
use buildhub_core::value::Value;
use buildhub_core::vm::Vm;

/// best-of-N 统计量（spec §12.2：取 min，同进程交替采样）。
fn best_of(samples: &mut [f64]) -> f64 {
    samples.sort_by(f64::total_cmp);
    samples[0]
}

/// 计时 N 次求和：返回（单次 µs，累加和）。累加和防优化 + 供 checksum 比对。
fn time_sum(iterations: usize, mut run: impl FnMut() -> f64) -> (f64, f64) {
    let start = Instant::now();
    let mut sum = 0.0;
    for _ in 0..iterations {
        sum += run();
    }
    let micros = start.elapsed().as_nanos() as f64 / 1000.0 / iterations as f64;
    (micros, sum)
}

fn pack_dir() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("packs/dna")
}

fn load() -> Option<LoadedPack> {
    let dir = pack_dir();
    if !dir.join("pack.toml").exists() {
        return None;
    }
    Some(load_pack(&dir).expect("load dna pack"))
}

fn fixture_json() -> serde_json::Value {
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("benches");
    path.push("fixtures");
    path.push("target.json");
    let text = std::fs::read_to_string(&path).expect("benches/fixtures/target.json 缺失");
    serde_json::from_str(&text).expect("fixture JSON")
}

/// 引擎侧同一场景的期望值（`dob-calc-core` 的 `dobapp_vy` 目标 `总和DPS`）。
const ENGINE_TARGET: f64 = 1767082952.0447142;

fn assert_close(actual: f64, expected: f64, label: &str) {
    let tolerance = if expected.abs() < 1e-9 {
        1e-9
    } else {
        (expected.abs() * 1e-9).max(1e-9)
    };
    assert!(
        (actual - expected).abs() <= tolerance,
        "{label}: {actual} vs {expected}（容差 {tolerance}）"
    );
}

fn as_num(v: Value) -> f64 {
    match v {
        Value::Num(n) => n,
        other => panic!("期望 Num，得到 {}", other.type_name()),
    }
}

fn entry_id(pack: &LoadedPack, name: &str) -> usize {
    pack.entry(name).unwrap_or_else(|| panic!("no entry `{name}`")).fn_id
}

/// 求值一次 `target`，返回 `总和DPS`。`path_b` 选用字节码 VM（路径 B）而非树走（路径 T）。
fn eval_target(pack: &LoadedPack, cfg: &Value, path_b: bool) -> f64 {
    let fn_id = entry_id(pack, "target");
    let interner = pack.interner.borrow();
    if path_b {
        let vm = Vm::new(&pack.code, &interner, &pack.program.data, Budget::default());
        let d = vm.call(fn_id, vec![cfg.clone()]).expect("call");
        as_num(vm.project(d).expect("project"))
    } else {
        let interp = Interp::new(&pack.program, &interner, Budget::default());
        let d = interp.call(fn_id, vec![cfg.clone()]).expect("call");
        as_num(interp.project(d).expect("project"))
    }
}

/// 基准骨架自检：计时器本身可用（零依赖 best-of-N 形状验证）。
#[test]
fn bench_harness_smoke() {
    let mut samples = [0.0; 9];
    for sample in &mut samples {
        let start = Instant::now();
        std::hint::black_box(1 + 1);
        *sample = start.elapsed().as_nanos() as f64 / 1000.0;
    }
    assert!(best_of(&mut samples) >= 0.0, "计时器应可用");
}

/// 端到端基准：路径 T 与路径 B 各自 best + checksum，并与引擎值对齐。
#[test]
fn bench_pack_end_to_end() {
    let Some(pack) = load() else {
        eprintln!("packs/dna 缺失，跳过");
        return;
    };
    let cfg = pack
        .json_to_value("Config", &fixture_json())
        .expect("Config 转换");
    // 预热：memo/分配器/共享结构的首次开销不计入（单次 ~0.1s，故只做少量）。
    for _ in 0..2 {
        std::hint::black_box(eval_target(&pack, &cfg, false));
    }
    let mut samples_t = [0.0; 9];
    let mut samples_b = [0.0; 9];
    let mut sum_t = 0.0;
    let mut sum_b = 0.0;
    // 交替采样：同一进程状态下两条路径轮换，避免逐步降频/升频造成的偏差。
    for i in 0..9 {
        let (micros, sum) = time_sum(3, || std::hint::black_box(eval_target(&pack, &cfg, false)));
        samples_t[i] = micros;
        sum_t = sum;
        let (micros, sum) = time_sum(3, || std::hint::black_box(eval_target(&pack, &cfg, true)));
        samples_b[i] = micros;
        sum_b = sum;
    }
    let best_t = best_of(&mut samples_t);
    let best_b = best_of(&mut samples_b);
    println!("pack target 路径 T（树走） best: {best_t:.3}µs/次");
    println!("pack target 路径 B（字节码） best: {best_b:.3}µs/次");
    println!("  （dob-calc-core evaluate_build best: 199.540µs/次）");
    // 9 轮 x 3 次。checksum 用累加和（同时防优化），除以次数还原单次值。
    let checksum_t = sum_t / 3.0;
    let checksum_b = sum_b / 3.0;
    assert_close(checksum_t, ENGINE_TARGET, "路径 T checksum");
    assert_close(checksum_b, ENGINE_TARGET, "路径 B checksum");
    assert_eq!(
        checksum_t.to_bits(),
        checksum_b.to_bits(),
        "路径 T 与 B 必须位级一致（G4）"
    );
}

/// 分阶段计时：建 pack / 配置转换 / 解释器装配 / 目标求值。
#[test]
fn bench_pack_stages() {
    let dir = pack_dir();
    if !dir.join("pack.toml").exists() {
        eprintln!("packs/dna 缺失，跳过");
        return;
    }
    let mut samples = [0.0; 7];

    // 建 pack（加载 + 解析 + 检查 + lower + 字节码发射）——对应 dob 的 TableBuilder::build
    for _ in 0..3 {
        std::hint::black_box(load_pack(&dir).expect("load"));
    }
    for sample in &mut samples {
        let (micros, _) = time_sum(5, || {
            std::hint::black_box(load_pack(&dir).expect("load").program.fns.len() as f64)
        });
        *sample = micros;
    }
    println!("stage load_pack best: {:.1}µs", best_of(&mut samples));

    let pack = load().expect("pack");

    // 配置转换（JSON → Config 值）——对应 dob 的 BuildRequest::from_json
    let raw = fixture_json();
    for _ in 0..20 {
        std::hint::black_box(pack.json_to_value("Config", &raw).expect("cfg"));
    }
    for sample in &mut samples {
        let (micros, _) = time_sum(50, || {
            std::hint::black_box(pack.json_to_value("Config", &raw).expect("cfg").type_name().len() as f64)
        });
        *sample = micros;
    }
    println!(
        "stage json_to_value(Config) best: {:.3}µs",
        best_of(&mut samples)
    );

    let cfg = pack.json_to_value("Config", &raw).expect("cfg");

    // 解释器装配——对应 dob 的 BuildContext::new
    let fn_id = entry_id(&pack, "target");
    for _ in 0..200 {
        let interner = pack.interner.borrow();
        std::hint::black_box(Interp::new(&pack.program, &interner, Budget::default()));
    }
    for sample in &mut samples {
        let (micros, _) = time_sum(2000, || {
            let interner = pack.interner.borrow();
            std::hint::black_box(pack.program.fns.len() as f64
                * Interp::new(&pack.program, &interner, Budget::default()).memo_on.get() as u8 as f64)
        });
        *sample = micros;
    }
    println!(
        "stage Interp::new（路径 T 装配） best: {:.3}µs",
        best_of(&mut samples)
    );

    // 目标求值（装配 + 求值）——对应 dob 的 Evaluator::new + evaluate
    for _ in 0..2 {
        std::hint::black_box(eval_target(&pack, &cfg, false));
    }
    for sample in &mut samples {
        let (micros, _) = time_sum(3, || {
            std::hint::black_box(eval_target(&pack, &cfg, false))
        });
        *sample = micros;
    }
    println!(
        "stage Interp::new + call + project best: {:.3}µs",
        best_of(&mut samples)
    );

    // 只计 call（解释器复用），分离装配成本
    {
        let interner = pack.interner.borrow();
        let interp = Interp::new(&pack.program, &interner, Budget::default());
        for _ in 0..2 {
            interp.reset();
            std::hint::black_box(interp.call(fn_id, vec![cfg.clone()]).expect("call"));
        }
        for sample in &mut samples {
            let (micros, _) = time_sum(3, || {
                // 每次求值前重置：fuel / memo / choices 都是单次求值的作用域。
                interp.reset();
                let d = interp.call(fn_id, vec![cfg.clone()]).expect("call");
                std::hint::black_box(as_num(interp.project(d).expect("project")) * 0.0 + 1.0)
            });
            *sample = micros;
        }
    }
    println!("stage Interp::call + project best: {:.3}µs", best_of(&mut samples));

    // memo 对照。**注意**：`R::CallStatic`（绝大多数调用）刻意不走 memo ——
    // 缓存会跳过 `next_choice` 的推进，破坏 §9.8.2 的 choice 相关性；实测给静态调用加
    // memo 后代价反而 +17%（12.3 万→因分支配对变化而更多求值）。memo 只作用在
    // `invoke_plain`（动态/闭包派发）上，所以这条对照量的是「闭包派发是否值得记忆化」，
    // 不是「整个 pack 的 memo 收益」。
    {
        let interner = pack.interner.borrow();
        let budget = Budget { fuel: u64::MAX, ..Budget::default() };
        let interp = Interp::new(&pack.program, &interner, budget);
        interp.memo_on.set(false);
        for _ in 0..2 {
            interp.reset();
            std::hint::black_box(interp.call(fn_id, vec![cfg.clone()]).expect("call"));
        }
        for sample in &mut samples {
            let (micros, _) = time_sum(3, || {
                // 每次求值前重置：fuel / memo / choices 都是单次求值的作用域。
                interp.reset();
                let d = interp.call(fn_id, vec![cfg.clone()]).expect("call");
                std::hint::black_box(as_num(interp.project(d).expect("project")) * 0.0 + 1.0)
            });
            *sample = micros;
        }
    }
    println!(
        "stage Interp::call + project（memo off） best: {:.3}µs",
        best_of(&mut samples)
    );
}

/// 入口切分：`panel`（属性汇总）与 `target`（属性 + 表达式）各自的最优耗时。
///
/// 两者的差就是自定义变量/表达式求值的成本，用来判断该优化属性汇总还是表达式引擎。
#[test]
fn bench_pack_entry_split() {
    let Some(pack) = load() else { return };
    let cfg = pack
        .json_to_value("Config", &fixture_json())
        .expect("Config 转换");
    let mut samples = [0.0; 9];
    for entry in ["panel", "target"] {
        let fn_id = entry_id(&pack, entry);
        for path_b in [false, true] {
            let run = || {
                let interner = pack.interner.borrow();
                if path_b {
                    let vm = Vm::new(&pack.code, &interner, &pack.program.data, Budget::default());
                    let d = vm.call(fn_id, vec![cfg.clone()]).expect("call");
                    vm.project(d).expect("project");
                } else {
                    let interp = Interp::new(&pack.program, &interner, Budget::default());
                    let d = interp.call(fn_id, vec![cfg.clone()]).expect("call");
                    interp.project(d).expect("project");
                }
            };
            for _ in 0..2 {
                run();
            }
            for sample in &mut samples {
                let (micros, _) = time_sum(3, || {
                    let interner = pack.interner.borrow();
                    let t = Instant::now();
                    if path_b {
                        let vm = Vm::new(&pack.code, &interner, &pack.program.data, Budget::default());
                        let d = vm.call(fn_id, vec![cfg.clone()]).expect("call");
                        vm.project(d).expect("project");
                    } else {
                        let interp = Interp::new(&pack.program, &interner, Budget::default());
                        let d = interp.call(fn_id, vec![cfg.clone()]).expect("call");
                        interp.project(d).expect("project");
                    }
                    let us = t.elapsed().as_nanos() as f64 / 1000.0;
                    std::hint::black_box(us)
                });
                *sample = micros;
            }
            println!(
                "entry `{entry}` 路径{} best: {:.1}µs",
                if path_b { "B（字节码）" } else { "T（树走）" },
                best_of(&mut samples)
            );
        }
    }
}

/// 热点分布：按函数名统计一次求值的调用次数（`explain` 日志聚合）。
///
/// 与计时阶段互补 —— 计时回答「多慢」，这个回答「慢在谁身上」。
/// 树走解释器的单次调用成本稳定在 ~1µs 量级，因此耗时基本正比于调用次数；
/// 把 top-N 压下去就是最直接的优化方向。
#[test]
fn bench_pack_hot_functions() {
    let Some(pack) = load() else {
        eprintln!("packs/dna 缺失，跳过");
        return;
    };
    let cfg = pack
        .json_to_value("Config", &fixture_json())
        .expect("Config 转换");
    let fn_id = entry_id(&pack, "target");
    let interner = pack.interner.borrow();
    let interp = Interp::new(&pack.program, &interner, Budget::default()).with_explain();
    let d = interp.call(fn_id, vec![cfg]).expect("call");
    let total = as_num(interp.project(d).expect("project"));
    assert_close(total, ENGINE_TARGET, "热点统计的求值结果");
    let entries = interp
        .explain
        .as_ref()
        .expect("explain log")
        .borrow()
        .entries
        .len();
    let mut counts: Vec<(String, usize)> = Vec::new();
    {
        let log = interp.explain.as_ref().unwrap().borrow();
        for e in &log.entries {
            let name = e.call.split('(').next().unwrap_or("").to_string();
            match counts.iter_mut().find(|(n, _)| *n == name) {
                Some((_, c)) => *c += 1,
                None => counts.push((name, 1)),
            }
        }
    }
    counts.sort_by(|a, b| b.1.cmp(&a.1));
    println!("一次求值共 {entries} 次函数调用");
    for (name, count) in counts.iter().take(12) {
        println!("  {count:>6}x {name}");
    }
}
