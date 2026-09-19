---
name: perf-hotspot-profiling
description: 用 V8 CPU profile 定位 JS/TS 热点函数，并用「同进程交替 A/B + best(min) 统计量 + checksum 锚点」的微基准方法安全地做性能优化。当需要优化计算热点、怀疑某函数耗时占比高、想评估某个优化（含 Wasm/SIMD 等加速路径）是否真有收益、或要建立可回归的性能基准时使用。
---

# 热点剖析与微基准优化

## Overview

前端/数据层的性能优化最容易踩的坑不是「不会优化」，而是**量错了**：用错统计量、在同一进程里先跑 A 后跑 B 导致顺序偏差、拿肉眼或单次耗时下结论。本技能固化一套可复现的流程：

1. 先立**正确性锚点**（checksum），再谈提速；
2. 用 CPU profile 的 **self-time** 找真热点，不靠猜；
3. 微基准用 **`best`(min) + 同进程交替采样**，避开 GC/时钟抖动与加载顺序偏差；
4. 优化手段按「查表化 → 版本号失效缓存 → 删掉净负收益的加速路径」顺序试；
5. 加**失效回归测试**，最后复测 + 清理临时文件。

## When to use

- 某次 `calculate()` / 渲染 / 数据转换明显卡，需要知道「时间花在哪」。
- 已经有一个「应该更快」的想法（缓存、查表、Wasm、SIMD、Worker），需要**判断值不值得做**。
- 想给热点函数建立长期可跑的基准与回归（防以后悄悄劣化）。
- 看到「优化后反而变慢」的报告，需要排除测量方法本身的偏差。

## Prerequisites

- 能跑被测代码的本地脚本（本仓库：`bun`；测试 `node node_modules/vitest/vitest.mjs`）。
- 一份**真实输入**的固定场景（不要用玩具数据，热点分布完全不同）。
- 一个可复现的**数值结果**作为正确性锚点（本仓库 CharBuild 用 `calculate()` 的 checksum）。

## Workflow

### Step 1 — 立锚点：先能证明「没算错」

优化前先记录一个确定性的数值结果，例如：

```bash
bun tools/benchmark-charbuild.ts     # 本项目：打印 checksum 1164735053516.7178
```

把「场景 + 目标函数 + checksum 期望值」写进基准脚本的注释里，之后每次优化都对比它。
**checksum 变了就是算错了**，提速多少都没意义。

### Step 2 — 抓 profile，算 self-time 找热点

用 Node 的 `--cpu-prof` 跑一段循环（或直接在探针里调用 `console.profile`），产出 `.cpuprofile`：

```bash
node --cpu-prof --cpu-prof-dir .tmp/prof --cpu-prof-name c.cpuprofile .tmp/prof-calc.ts
# 或 bun（同样支持）
bun --cpu-prof --cpu-prof-dir .tmp/prof .tmp/prof-calc.ts
```

然后解析 self-time（**不要只看 total time**，被调用的下游会污染）：

```bash
node .agents/skills/perf-hotspot-profiling/scripts/profile-self-time.mjs .tmp/prof/c.cpuprofile --filter src/ --top 20
```

输出按 self-time 降序的函数表（含占比、文件:行）。**盯占比最高的那一两个**，优化它们；
占 2% 的函数再怎么优化也救不了整体。

### Step 3 — 按性价比顺序试优化

| 手段 | 适用 | 注意 |
| --- | --- | --- |
| **查表化** | 同一批来源被反复线性扫描（每次调用都 `for (mod of mods)`） | 一次性把来源摊平成 Map，查询变 O(1)。最大收益通常来自这步 |
| **版本号失效缓存** | 派生数据依赖可变的源对象 | 每个源类加 `static propertiesRevision`，**所有改属性的入口都要自增**，否则静默返回旧值 |
| **懒计算** | 只有部分 key 会被查询 | 按需算 + 缓存，别预计算全量 |
| **Wasm / SIMD / Worker** | 目标是大规模数值计算本身 | **先怀疑**：构造输入 + 跨边界拷贝的开销经常远大于计算收益。必须用 Step 4 的方法实测 |

⚠️ **不可从加和表导出的量**：`Π(1+v)`（独立乘区）、`min/max`、去重计数等，不能由 `Σv` 还原，
必须单独缓存。做「一张表搞定一切」时先检查有没有这类量。

### Step 4 — 微基准：同进程交替 + best

写基准时遵守三条：

1. **同进程交替采样**：不要「先跑 2000 次 A，再跑 2000 次 B」，更不要分两次进程跑。
   进程状态/堆布局会让后跑的一批系统性偏慢（实测可达 ±30%）。改成 A/B/A/B… 交替多轮。
2. **统计量用 `best`(min)**，不要用 median。GC 与时钟抖动能把 median 抬 ±30%，
   而 `min` 是「没有干扰时这函数要多久」，最稳定、最能反映优化效果。
3. **每轮之间做等价性断言**：A 与 B 的结果必须一致（容差内），否则你比的不是性能。

评估「某加速路径是否值得」时，把开关做成运行时可变（本仓库用 `setWasmReady()` + `resetCharBuildSimdForTest()`），
在同一进程里交替 9 轮，比值稳定在 `1.00 ± 0.05` 就说明**没收益**，直接删掉那条路径——
净负收益的复杂度是纯负债。

### Step 5 — 加失效回归测试

缓存类优化最大的风险是「该失效时没失效」。针对**每一个**能改属性的入口各写一条：
「改了 → 结果必须变，且等于重建对象后的结果」。

```ts
// 模式：改一个属性源，然后和「重新构造一个等价构筑」对比
build.charMods[0].updateProperties(/* 新等级 */)
expect(build.calculate()).toBe(referenceBuild.calculate())          // 等于正确结果
expect(build.calculate()).not.toBe(untouched.calculate())           // 且确实变了
```

### Step 6 — 复测 + 清理

```bash
# 类型检查（本仓库整项目 vue-tsc 会 OOM 崩，用只含改动文件的 tsconfig）
NODE_OPTIONS="--max-old-space-size=8192" node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p .tmp/tsc-changed.json
# 格式化 + lint
node node_modules/@biomejs/biome/bin/biome check --write --linter-enabled=false <files>
node node_modules/@biomejs/biome/bin/biome lint <files>
# 测试
node node_modules/vitest/vitest.mjs run <test files>
```

最后删掉探针脚本、profile 目录、临时 tsconfig（保留一份优化前快照作回滚保险即可）。

## Guidelines

- **先量后改**：任何「我觉得这里慢」的优化冲动，先用 Step 2 确认它确实是热点。
- **一次只改一个手段**，改完立刻复测；同时上三个手段就分不清谁有用谁有害。
- **优化不改变行为**：checksum 变了就回退，不要「顺便修一下」。
- **加速路径要有退出条件**：Wasm/SIMD/Worker 这类「看起来很专业」的方案，
  实测比值 ≈1.0 就果断删。留着一个没收益的复杂度，以后每个读代码的人都要付利息。
- 临时文件一律放 `.tmp/`；本仓库开发服务器固定在 `http://localhost:1420`，不要自己起 dev/build。

## 相关文件

- `scripts/profile-self-time.mjs` — 解析 `.cpuprofile`，按 self-time 输出热点函数表。
- 本仓库正式基准：`tools/benchmark-charbuild.ts`（`bun bench:charbuild:real`）。
  加速路径（Wasm/SIMD）的决策复核工具在结论落地后已删除——**结论：无收益，勿复活**。
- 本仓库已验证案例：`src/data/CharBuild.ts` 属性结算查表化（`calculate()` 约 45× 提速），
  详见 `.workbuddy/memory/2026-09-19.md` 与 `MEMORY.md` 的「CharBuild 属性结算」小节。
