# 构建与预渲染

AGENTS.md 的细节展开，覆盖「增量 lint」与「SSG 预渲染」两套机制。命令本身见 AGENTS.md。

## 增量 lint（`pnpm lint`）

`pnpm lint` = `bun tools/incremental-lint.ts`。设计规格与实施记录见
[incremental-lint-checker-spec.md](incremental-lint-checker-spec.md)。

- 无改动直接跳过；
- 有改动时 Biome 只跑改动文件；
- 类型检查由脚本**进程内自研 program** 完成（`@vue/language-core` 的 Vue 语言插件 +
  `@volar/typescript` 的 `proxyCreateProgram` + TS Compiler API，与 vue-tsc 内部同一套拼装件，
  不再把 vue-tsc CLI 当壳），由此拿到 vue-tsc CLI 给不了的两个控制点：
  - **诊断范围**：只对「改动文件 + 依赖它们的下游文件」发起诊断；上游依赖只编译（供类型）不诊断，
    它们自己的错误在各自被改的那次已经查过。未改动的环境声明文件（`.d.ts` / `declare global`）
    始终进 program（缺了会冒全局类型的假报错）但不主动诊断；环境声明文件**自身变更**时整体退回
    自研全量诊断（约 40s），影响面过半同理；
  - **文件体裁剪**：未改动的数据文件（`src/data/d/` 下 `*.data.ts`，约 103MB 字面量）用
    `ts.transpileDeclaration` 预生成的声明替代真实源码参与编译（缓存在 `.tmp/lint-data-decls/`，
    按 mtime+size 寻址），数据体不进 checker；被改动的数据文件保留真源码并完整诊断，通过后刷新
    声明缓存。声明生成要求文件满足 isolatedDeclarations 约束（导出值要有显式类型注解，
    `satisfies` 不算）——数据文件均已改造达标，若有新文件违反约束会自动回退真源码并记负缓存。
    同理，`components.d.ts`（unplugin 自动生成）按诊断范围裁剪——只保留被诊断文件引用到的全局
    组件条目，否则 550 条 `typeof import` 会把 program 撑到 3500+ 文件；
- mtime 指纹与依赖图缓存在 `.tmp/lint-cache.json`，**仅检查通过才写入**。文件集 = tsconfig include
  内的文件 **+ 数据文件**（它们被 tsconfig exclude，但通过 import 参与 program——旧版只改数据文件时
  类型检查会被整体跳过、下游类型陈旧，现版本已修复：数据文件改动会真查并传播到全部引用方）；
- `--full` / `pnpm lint:full` 走真 vue-tsc CLI 全量（不裁剪任何文件），是唯一覆盖数据体错误检查的
  最终真相；`pnpm lint:tsc` 只跑真 vue-tsc 类型检查（调试/对比用）。

典型耗时：无改动 0.3s 跳过；轻量改动 5~13s（program 大小取决于被诊断文件的依赖闭包，
@antv/sentry/three 等重型类型树是主要成本）；环境声明变更约 40s；数据文件改动约 35s；
首跑（冷缓存）约 100s。正确性由一次性对比 harness（`.tmp/lint-parity.ts`，注入带错探针，
diff 自研增量与真 vue-tsc 全量的诊断集合）验证，覆盖 `.vue` 位置映射与全局组件模板诊断。

## SSG 预渲染（仅网页版）

`pnpm build` 在 vite build 之后会跑 `node tools/ssg.mjs`：用 Vite 的 SSR 模块加载器
（middlewareMode 开发服务器 + `ssrLoadModule` 载入 `src/ssr/entry-server.ts`）把主要路由渲染成静态
HTML，写成 `dist/<route>/index.html` 并注入各自的 title / description / canonical / og 标签。

- 客户端**不做 hydration**：静态标记只服务爬虫与首屏，`main.ts` 挂载时会整体替换 `#app` 的内容。
  预渲染时没有 `navigator`，页面要保证「无浏览器环境也能渲染出可看的静态版本」。
- 只有页面级兼容改动需要留意：新增页面若要在 node 侧渲染，setup 阶段不要直接操作 DOM。
- 桌面端构建（`DNA_BUILDER_APP_BUILD=1`）自动跳过；`DNA_SSG_SKIP=1` 手动跳过；
  `pnpm ssg` 可单独重跑，`node tools/ssg.mjs --only=/download` 只重跑一个路由（调样式时很方便）。
- 新增需要被搜索引擎收录的页面：把它加进 `tools/ssg.mjs` 的 `PAGES`（含 SEO 文案）。
- 单个路由渲染失败只会退化成「SEO 头 + 空 `#app`」的 SPA 外壳并在日志里告警，不会中断构建。

## 前端构建的数据包改写（动手前必读）

`pnpm build` 会启用 `src/data/data-pack-rewrite-plugin.ts`，把 `src/data/d/**/*.data.ts` 的导出改写成
**空 fallback + 运行时水合回填的活绑定**：生产环境里数据来自数据包（IndexedDB/OPFS），未安装数据包时
这些模块是空的。由此有两条硬约束：

- **Worker 里不能 import 数据模块**：Worker 有独立模块图，拿不到主线程水合出来的值（见 `docs/rag.md`）。
- **桌面端/网页端都要能"无数据"降级**：新功能不要在模块求值期就假设数据非空。

## e2e 与数据包（bun-webview-test）

无头 profile 是全新的，而 dev server 的数据模块同样走水合：没有数据包时页面数据为空。
两种应对方式，按需选：

- **装一次、反复用**：`new WebView({ dataStore: { directory: "./profile" } })` 传持久 profile
  （路径要绝对路径或相对 cwd 的目录对象），首次运行时在页面内
  `const pack = await import("/src/data/data-pack.ts"); await pack.downloadDataPack()`，
  之后重新导航即有水合后的数据；dev 的包基址是 `/mock/data-pack`，不联网也能装。
- **页面内直接调用应用模块**：`await import("/src/utils/xxx.ts")` —— Vite 按解析后的 URL 去重模块实例，
  拿到的是应用正在用的同一份单例。**不要为了测试往产品代码里加 `window.__debug` 之类的钩子。**

