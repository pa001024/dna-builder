# 规格：增量 lint 自研类型检查驱动器

> 状态：**已实施**（规格保留作为设计记录；机制说明以 `build-and-ssg.md` 为准）。
> 因 `gh` 不可用，本文件代替 GitHub Issue 发布。

## 实施记录（2026-10-04）

按本规格完成，`pnpm test` 1348 用例全过；正确性对比 harness（`.tmp/lint-parity.ts`）PASS——
注入的探针覆盖：.ts 类型错误、数据文件声明替换后的类型流、`.vue` 虚拟代码类型流与位置映射、
全局组件模板 prop 诊断，自研增量与真 vue-tsc 全量的诊断集合**逐条一致**。

实测偏离与补充决策：

1. **实现时发现的存量漏洞（已修复）**：数据文件被 tsconfig exclude，旧版指纹不覆盖它们——
   只改数据文件时类型检查被整体跳过、下游类型陈旧。现版本把数据文件纳入指纹与依赖图，
   改动会真查并传播到全部引用方。
2. **环境声明传染是旧版慢的真正元凶**：旧版把所有环境声明文件连传递依赖种子进根集合，
   而未改动的环境声明只需要进 program、不需要被诊断。修正后常规改动不再退回全量；
   环境声明自身变更仍退回自研全量（约 40s，旧版是真 vue-tsc 全量 25s~2.5min）。
3. **components.d.ts 裁剪（规格外新增，必要）**：unplugin 生成的 550 条 `typeof import` 把
   program 撑到 3500+ 文件。按「被诊断文件是否引用到该组件名（归一化匹配，PascalCase /
   kebab-case / 字符串形式都命中）」裁剪两个区段（GlobalComponents 与 JSX 支持）；
   未用到的组件标签退化为 any，默认 strictTemplates=false 下无诊断差异（harness 已验证）。
4. **性能验收（目标 ≤8s）部分达成**：无改动 0.3s；轻量改动 5~13s；重视图改动约 10s；
   环境声明变更约 40s；数据文件改动约 35s。未达标场景的瓶颈是**被诊断文件合法引用的
   node_modules 类型树**（@antv/g6、@sentry、@types/three、rxjs 等约 3000 个 d.ts 的
   parse+bind），这是诊断保真度的必要成本，进程内单次构建无法再压；后续如需进一步压缩，
   方向是常驻 checker 进程复用 program（本规格 Out of Scope，见 Out of Scope 一节）。
5. `@volar/typescript` 与 `@vue/language-core` 已登记 devDependencies（与 vue-tsc 持有版本一致）；
   另新增 `pnpm lint:tsc`（只跑真 vue-tsc 类型检查，调试/对比用）。
6. **数据文件已全部改造为可单文件推断的形式**（2026-10-04 追加）：原 12 个文件（achievement、
   char、effect、hardboss、levelup、map、mod、player、race-lottery、raid、region、weapon）存在
   isolatedDeclarations 违规（未注解的导出数组/函数、`export default applyVersionGate(t)` 调用、
   无效的 `satisfies`），声明生成失败曾回退真源码。已按「显式类型注解 / 补函数返回类型 /
   调用结果提为带注解的具名 const」修完（`satisfies` 与 `as` 断言都不满足
   isolatedDeclarations 检查口径——前者不被接受，后者会绕过对目标类型的成员检查，均须用
   带注解的具名 const）；现 79 个数据文件的声明产物总共仅 73KB，全部可替换。

## Problem Statement

`pnpm lint` 的类型检查仍然是 vue-tsc 的"壳"：生成临时 tsconfig 交给真 vue-tsc。这带来两个性能问题：

1. **上游依赖被重复检查**：改 a 时，a 所 import 的上游文件（b、c…整棵上游闭包）被拉进程序并完整做类型检查、报诊断，而这些文件的错误早在它们各自被改的那次就应该查过。
2. **数据文件拖垮一切**：`src/data/d/**/*.data.ts` 共 80 个文件约 103MB（translations 19MB、quest 系列每个 8~9MB），且被核心模块引用，几乎每次增量的上游闭包都包含若干个——每次都要重新 parse + check 几百 MB 字面量。

此外，环境声明文件（如自动生成的 `components.d.ts`）变更时会整体退回 2.5 分钟的真 vue-tsc 全量，开发期频繁触发。

## Solution

自研类型检查驱动器，内置到增量 lint 脚本中（不新增独立工具、不改 `pnpm lint` 入口）：

- 程序化构建 TS program（复用 vue-tsc 内部同一套拼装件），**诊断只对"改动文件 + 反向依赖闭包 + 环境声明"发起**，上游只编译不诊断；
- **未改动的数据文件用缓存的 `.d.ts` 声明替换**进 program（数据体不进 checker、下游类型完整）；**被改动的数据文件保留真实源码并完整检查**；
- 自动回退（环境声明变更 / 影响面过大）走**自研全量**（全文件诊断、数据仍替换）；`lint:full` / `--full` 仍走真 vue-tsc（唯一检查数据体的最终真相）。

验收目标：改动 1~3 个文件的常规编辑场景，`pnpm lint` 总耗时 ≤ 8s。

## User Stories

1. As a 前端开发者，I want 改动 1~3 个文件后 `pnpm lint` 在 8 秒内完成，so that 保存-检查循环不打断心流
2. As a 前端开发者，I want 修改 a 文件时不再重复检查它 import 的上游文件，so that 类型检查成本只花在必要处
3. As a 前端开发者，I want 未改动的 `.data.ts` 不参与类型检查，so that 103MB 数据字面量不再拖慢每次 lint
4. As a 前端开发者，I want 修改 `.data.ts` 本身时仍获得完整检查，so that 数据结构错误当场暴露
5. As a 前端开发者，I want 新增/删除组件（环境声明再生）时不被打回分钟级全量，so that 日常开发不受自动生成文件干扰
6. As a 前端开发者，I want 影响面过大时回退到仍较快的自研全量，so that 兜底路径也保持在秒级~十几秒
7. As a 代码审查者，I want `lint:full` 继续提供含数据体检查的最终真相，so that 数据体错误有处可抓
8. As a 前端开发者，I want `pnpm lint` 的入口、参数、输出格式与退出码保持不变，so that 心智模型与既有脚本无需变更
9. As a 前端开发者，I want 依赖数据文件的代码在数据文件变更后拿到最新类型，so that 不会出现旧类型假通过
10. As a 前端开发者，I want 删除文件后引用它的文件报错，so that 破坏性改动不被漏掉
11. As a CI 维护者，I want lint 失败时缓存不落盘，so that 下次重跑覆盖失败范围
12. As a 前端开发者，I want `--verbose` 下能看到检查范围与数据文件替换情况，so that 排查增量口径有依据
13. As a 工具维护者，I want 自研 checker 内置在既有脚本而非新工具，so that 工具入口唯一、目录不膨胀
14. As a 开发环境用户，I want 缓存结构升级时旧缓存自动整体失效一次，so that 新旧口径不会混用
15. As a 前端开发者，I want `.vue` 模板中的诊断位置映射与 vue-tsc 一致，so that 两个入口的输出可以互信
16. As a 前端开发者，I want 数据文件裁剪是"声明替换"而非 any 化，so that 数据消费方的类型推断与全量等价
17. As a 工具维护者，I want 正确性由一次性对比工具验证（放 `.tmp` 用完即弃），so that 仓库不背"跑全量才能过"的重测试
18. As a 文档读者，I want 增量 lint 的新机制（何时真查/何时裁剪/回退层级）写进 `.agents/docs/`，so that 后来者不用读代码猜口径

## Implementation Decisions

- **程序化构建 program**：`@vue/language-core` 的 `createVueLanguagePlugin`（.vue → 虚拟 TS）+ `@volar/typescript` 的 `proxyCreateProgram` + TypeScript Compiler API；诊断映射沿用 vue-tsc 自身 `runTsc` 内对 program 诊断做变换的方式（实现时照其源码移植）。不使用 vue-tsc CLI（`lint:full` 除外）。
- **依赖登记**：`@vue/language-core` 与 `@volar/typescript` 显式登记进 devDependencies（均为 vue-tsc 3.3.11 的既有传递依赖，版本对齐，不引入新包）。
- **诊断范围**：根集合 = 改动文件 + 反向依赖闭包 + 环境声明文件（与现有口径一致）；program 中其余文件只编译。选项/配置级诊断随 program 一并收集。
- **数据文件裁剪**：命中范围 `src/data/d/**/*.data.ts`（与数据包改写插件同口径）。未改动者由 CompilerHost 以 `ts.transpileDeclaration` 预生成的声明内容替代真实源码；声明产物按 mtime+size 缓存于 `.tmp`。被改动者用真实源码、作为根文件正常诊断，并在检查前用新内容刷新其声明缓存（保证本次运行的下游拿到新类型）。
- **回退层级**：环境声明变更 / 根集合占工程比例过半 → 自研全量（对 program 全部文件诊断，数据仍替换）；`--full` 参数与 `lint:full` 脚本 → 真 vue-tsc CLI 全量（唯一检查数据体的路径）。
- **缓存**：沿用 `.tmp/lint-cache.json` 的指纹与"通过才落盘"语义；新增数据文件声明缓存块，缓存结构版本 +1 使旧缓存整体失效一次。
- **边界**：Biome 半边（分块、全量/增量判定）不动；输出格式沿用 vue-tsc 风格（`file(line,col): error TSxxxx`）；无新增 pnpm 脚本。
- **文档**：`.agents/docs/build-and-ssg.md` 的增量 lint 一节改写为新机制口径。

## Testing Decisions

- **好的测试只验证外部行为**：CLI 退出码、诊断输出内容与位置、缓存落盘语义；不测内部函数切分。
- **主验证手段（seam）**：增量 lint 驱动器的 CLI 边界（argv → 退出码 + stdout 诊断 + `.tmp/lint-cache.json` 副作用）。开发期用 `.tmp` 内一次性对比工具：对若干典型场景（改组件 / 改 store / 改类型导出 / 删文件 / 改数据文件 / 改 `.vue` 模板），diff 新驱动与真 vue-tsc 全量的诊断集合，除数据体错误外应一致；该工具用完即弃、不进仓库。
- **纯逻辑单测**（改动集合 → 根集合计算、声明缓存键等）：仅在 vitest 现有配置可覆盖工具目录时补少量用例，不为凑测试改 vitest 配置。
- **先例**：仓库现有测试位于 `src/data/tests/`（vitest），工具目录此前无测试；对比 harness 参考该脚本自身已有的"缓存失效回全量"自保逻辑设计场景。

## Out of Scope

- Biome 部分的任何行为改动
- `lint:full` 本身的速度优化（vue-tsc 自身性能问题）
- 数据文件运行时行为（数据包改写插件、水合机制不动）
- 跨 run 的 program / 诊断持久化缓存
- suggestion / 项目级诊断等 vue-tsc 未默认开启的检查类别
- server / Rust 侧的 lint

## Further Notes

- 风险点一：`ts.transpileDeclaration` 对 `import type` 链的产物是否闭合（数据文件间互相引用类型），由对比 harness 兜底验证。
- 风险点二：volar 诊断位置映射在 program 级的正确性，同样由对比 harness 验证。
- 8s 目标的构成假设：数据体清零 + program 从约 4000 文件缩到几百文件 + 诊断只对根文件发起；达不到时按热点再分析。
