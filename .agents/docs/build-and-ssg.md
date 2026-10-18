# 构建与预渲染

AGENTS.md 的细节展开，覆盖「增量 lint」与「SSG 预渲染」两套机制。命令本身见 AGENTS.md。

## 增量 lint（`pnpm lint`）

`pnpm lint` = `bun tools/incremental-lint.ts`。设计规格与实施记录见
[incremental-lint-checker-spec.md](incremental-lint-checker-spec.md)。

- 无改动直接跳过；
- 有改动时 Biome 只跑改动文件；
- 类型检查由 **tsc-rs**（TypeScript 7 原生编译器的 Rust 移植，`devDependencies` 的 `tsc-rs` 包）
  完成，再按增量口径**过滤展示**：只展示「改动文件 + 依赖它们的下游文件」（反向依赖
  闭包）的诊断；上游依赖的错误在它们各自被改的那次已经展示过。`.vue` 文件经 `tsc-rs-vue-mapper`
 （`file:tools/vue-mapper`，content-mapper 插件，用 @vue/language-core 与 vue-tsc 相同的 codegen
  展开虚拟代码，诊断位置映射回原文件）参与检查。数据文件（`packages/data/d/` 下 `*.data.ts`，约 70MB）
  按「值变 / 类型变」二分处理：改动后重跑 `ts.transpileDeclaration` 求声明哈希，不变即类型未变；
  未改动的数据文件由 `tsc-rs-data-mapper`（`file:tools/data-mapper`，零依赖，按 manifest 用缓存
  `.d.ts` 覆盖内容）替代真实源码进 program，下游视图不变；改动过的数据文件本轮仍以真实源码参诊
  （体语义错误可见），只在声明哈希变化时才把下游带入根集合。纯值变走最小 program 快径
  （改动文件 + 工程 `.d.ts`，`components.d.ts` 除外；闭包含 `.vue` / 源文件全局声明 / `window` 引用
  时退回全量）：实测单文件值变约 1.2s，其中 tsc-rs 仅 0.4s。声明缓存在 `.tmp/lint-data-decls/`
 （按 mtime+size 寻址，声明哈希另存比对），失败运行不落盘不回收；`lint:full` 仍以真实源码全量兜底。临时 tsconfig（剥离 TS 7 已移除的 `baseUrl` / `esModuleInterop`，挂上
  contentMappers，include / paths 等相对路径转绝对）按 PID 生成在 `.tmp/tsc-rs-check/` 下
  （git 忽略区，不污染跟踪文件），运行结束即删，崩溃残留按「属主进程已死且超 10 分钟」清理；
  二进制路径可用 `TSC_RS_BIN` 环境变量覆盖；
  - 环境声明文件的**全局类型面变更**时展示全部诊断（不再是 40s 的自研全量，就是同一次 tsc-rs
    运行去掉过滤），影响面过半同理。全局类型面按哈希判定（GraphNode.ambientHash：
    `.d.ts` 为全文哈希，普通源文件为其 `declare global/module` 块文本的 sha1）——只含 window.*
    声明扩充的普通源文件（如 CharBuildView.vue、store/db.ts）改到声明以外的代码不算变更，仍走增量；
- mtime 指纹与依赖图缓存在 `.tmp/lint-cache.json`，**仅检查通过才写入**。文件集 = tsconfig include
  内的文件 **+ 数据文件**（它们被 tsconfig exclude，但通过 import 参与 program——旧版只改数据文件时
  类型检查会被整体跳过、下游类型陈旧，现版本已修复：数据文件改动会真查并传播到全部引用方）；
- `--full` / `pnpm lint:full` 走真 vue-tsc CLI 全量（不裁剪任何文件），是唯一覆盖数据体错误检查的
  最终真相；`pnpm lint:tsc` 只跑真 vue-tsc 类型检查（调试/对比用）。

典型耗时：无改动 0.5s 跳过；纯数据值变约 1.2s（最小 program，tsc-rs 仅 0.4s）；冷缓存全量约 13s
（含 66 文件声明重生成 + tsc-rs 约 10s），不再有 35~40s 的数据文件/环境声明慢路径；其它单文件增量
约 11~13s（下限即 tsc-rs 全量检查时间）。注意引擎是 TypeScript 7.1 而非 vue-tsc 的 TS 5.9，诊断不完全相同：夹具级
（script 错误、模板变量、跨文件 props）与 vue-tsc 逐条一致；400 文件实测中约 11 条是真实模板
bug（新 codegen 下 vue-tsc 同样报出，旧 pin 漏报），约 26 条是 TS7 严格度诊断。无原文位置的
虚拟合成区诊断（host 注记 `has no corresponding location in the original file`，行号常越界）
一律隐藏（`isVirtualOnlyDiagnostic`，vue-tsc 实际也不展示这类诊断），`--verbose` 下只报数量；
`lint:full` 仍是兜底真相。全局指令的类型注册放在 `apps/web/src/types/global-directives.d.ts`
（`declare module "vue"` 增补 `GlobalDirectives`；文件必须含顶层 `export {}` 使其成为模块，
否则会遮蔽整个 vue 模块。另注意不能在增补内部 `import("vue")` 自引用，同理致命）。
输出解析、根过滤与虚拟诊断识别的单测在 `tools/tsc-rs-output.test.ts`。

## SSG 预渲染（仅网页版）

`pnpm build` 在 vite build 之后会跑 `node tools/ssg.mjs`：用 Vite 的 SSR 模块加载器
（middlewareMode 开发服务器 + `ssrLoadModule` 载入 `apps/web/src/ssr/entry-server.ts`）把主要路由渲染成静态
HTML，写成 `dist/<route>/index.html` 并注入各自的 title / description / canonical / og 标签。

- 客户端**不做 hydration**：静态标记只服务爬虫与首屏，`main.ts` 挂载时会整体替换 `#app` 的内容。
  预渲染时没有 `navigator`，页面要保证「无浏览器环境也能渲染出可看的静态版本」。
- 只有页面级兼容改动需要留意：新增页面若要在 node 侧渲染，setup 阶段不要直接操作 DOM。
- 桌面端构建（`DNA_BUILDER_APP_BUILD=1`）自动跳过；`DNA_SSG_SKIP=1` 手动跳过；
  `pnpm ssg` 可单独重跑，`node tools/ssg.mjs --only=/download` 只重跑一个路由（调样式时很方便）。
- 新增需要被搜索引擎收录的页面：把它加进 `tools/ssg.mjs` 的 `PAGES`（含 SEO 文案）。
- 单个路由渲染失败只会退化成「SEO 头 + 空 `#app`」的 SPA 外壳并在日志里告警，不会中断构建。

## 前端构建的数据包改写（动手前必读）

## 桌面端版本同步（Tauri）

`apps/web/package.json` 里所有 `@tauri-apps/*` 依赖都用 `~` 钉住 minor：Tauri CLI 要求 JS 包与
Rust crate 的 major/minor 一致（见 `apps/web/src-tauri/Cargo.lock`），`^` 会在全新安装时浮到新 minor
直接导致 `tauri dev/build` 报 version mismatched。升级任一端时两端一起升。

`apps/web/src-tauri/Cargo.toml` 引用的 workspace 外部 crate 用相对仓库根的路径
（如 `mcp_server = { path = "../../../crates/mcp_server" }`）；移动 src-tauri 后若 cargo 报旧绝对路径，
是 `target/` 里指纹缓存中毒，`cd apps/web/src-tauri && cargo clean -p <包名>` 后重查即可（别整目录删）。

`pnpm build` 会启用 `apps/web/src/utils/data-pack/data-pack-rewrite-plugin.ts`，把 `packages/data/d/**/*.data.ts` 的导出改写成
**空 fallback + 运行时水合回填的活绑定**：生产环境里数据来自数据包（IndexedDB/OPFS），未安装数据包时
这些模块是空的。由此有两条硬约束：

- **Worker 里不能 import 数据模块**：Worker 有独立模块图，拿不到主线程水合出来的值（见 `docs/rag.md`）。
- **桌面端/网页端都要能"无数据"降级**：新功能不要在模块求值期就假设数据非空。

## e2e 与数据包（bun-webview-test）

无头 profile 是全新的，而 dev server 的数据模块同样走水合：没有数据包时页面数据为空。
两种应对方式，按需选：

- **装一次、反复用**：`new WebView({ dataStore: { directory: "./profile" } })` 传持久 profile
  （路径要绝对路径或相对 cwd 的目录对象），首次运行时在页面内
  `const pack = await import("/src/utils/data-pack/data-pack.ts"); await pack.downloadDataPack()`，
  之后重新导航即有水合后的数据；dev 的包基址是 `/mock/data-pack`，不联网也能装。
- **页面内直接调用应用模块**：`await import("/src/utils/xxx.ts")` —— Vite 按解析后的 URL 去重模块实例，
  拿到的是应用正在用的同一份单例。**不要为了测试往产品代码里加 `window.__debug` 之类的钩子。**

