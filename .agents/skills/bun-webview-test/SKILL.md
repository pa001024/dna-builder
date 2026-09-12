---
name: bun-webview-test
description: 使用 Bun 1.4 内置的 Bun.WebView 无头浏览器对前端页面（Vue/Vite 等）做端到端冒烟与交互测试。当需要加载页面、真实点击、读取 DOM/应用状态、做断言、截图归档，或对本地开发服务器/静态站点做零依赖的浏览器级验证、可视化巡检、交互回归测试时，应使用本技能。
---

# Bun.WebView 前端测试

## Overview

本技能封装 **Bun 1.4 新增的 `Bun.WebView`** 无头浏览器能力，提供一套零依赖的前端端到端测试框架。它取代了 Puppeteer / Playwright 的安装开销，用单个 `bun` 命令即可驱动真实浏览器（macOS 用系统 WebKit，Windows/Linux 用已安装的 Chrome/Edge 经 CDP）完成：页面加载、真实用户输入、DOM/状态读取、断言与截图。

完整 API 细节见 `references/webview-api.md`，不要凭记忆猜测方法签名。

## When to use

- 对 `pnpm dev` 起的开发服务器（本项目默认 `http://localhost:1420`）做冒烟测试。
- 验证某个路由/组件是否正确挂载、渲染、无控制台报错。
- 模拟用户点击/输入/滚动，校验交互后的状态或路由变化。
- 需要截图归档供人工查看（可视化巡检、回归基线）。
- 任何"用浏览器跑一下确认没坏"的场景，且不想引入 Playwright 依赖。

## Prerequisites

1. **Bun >= 1.4**：运行 `bun --version` 确认；低于此版本无 `Bun.WebView`。
2. **目标前端可访问**：先用 `pnpm dev` 启动本项目开发服务器（或指向任意可访问 URL）。
3. **Windows / Linux 需安装浏览器**：`Bun.WebView` 在 Windows 默认走 Chrome 后端，需本机已装 Chrome/Chromium/Edge/Brave。找不到时设 `BUN_CHROME_PATH` 指向可执行文件，或装 Playwright 的 `chrome-headless-shell`。macOS 用系统 WebKit，无需安装。

## Workflow

### Quick Start（复用框架跑测试）

1. 确认开发服务器运行中：`pnpm dev` / `pnpm dd2`（保持 http://localhost:1420 可访问）。
2. **务必带 `?hideUpdateInfo=1` 打开页面**（见下方「启动弹窗」），否则会被数据包弹窗挡住。
3. 运行内置示例冒烟测试：
    ```bash
    bun .agents/skills/bun-webview-test/scripts/example.test.ts
    # 或指定地址
    bun .agents/skills/bun-webview-test/scripts/example.test.ts --url http://localhost:1420
    ```
4. 失败用例会自动留图（见 Guidelines 的 `.tmp` 约定），通过 `screenshots/home.png` 查看首屏。

### 启动弹窗：一律加 `?hideUpdateInfo=1`

应用启动时会按顺序弹「应用更新 → 数据包安装/更新 → 更新日志」，无头环境里没有数据包，`安装数据包`
弹窗会直接盖住页面，DOM 断言全部拿不到内容。**统一用 `?hideUpdateInfo=1` 打开页面**即可禁用这一整套
启动弹窗（`src/components/StartupModal.vue`：该参数在启动时读取一次，随后应用更新、更新日志与
`checkDataPack()` 全部跳过；仅首次完整加载生效，SPA 路由内部跳转不会重新计算）：

```ts
await view.navigate(`${baseUrl}/char/3101?hideUpdateInfo=1`)
```

注意点：

- 参数必须在**首次导航**的 URL 上；先打开无参数地址再 `router.push` 加参数不会生效。
- 该参数只关弹窗，**不会安装数据包**：依赖游戏数据的页面（如 `/char/:id` 构筑页）依然会因为
  `charBuild.calculateWeaponAttributes is not a function` 之类报错渲染失败。这类页面要在
  已装数据包的浏览器里人工验证，或给 `WebView` 传 `dataStore: "./profile"` 复用已装数据包的 profile。
- 判断弹窗是否还在：`document.querySelector("dialog.modal.modal-open")` 非空即被挡住。

### 编写新的测试文件

新建一个 `*.test.ts`，从框架导入能力，注册用例，末尾调用 `run()`：

```ts
import { test, expectVisible, expectEval, expectNoConsoleErrors, snapshot, run } from "./webview-test.ts"

test("标题区域可见", async ({ view }) => {
    await expectVisible(view, "header h1")
})

test("无控制台错误", async () => {
    await expectNoConsoleErrors()
})

run()
```

可用断言辅助（详见 `scripts/webview-test.ts`）：`expectText`、`expectContains`、`expectVisible`、`expectCount`、`expectCountAtLeast`、`expectEval`、`expectNoConsoleErrors`、`snapshot`、`evalExpr`。

直接在用例内也能调用底层 `view` 方法：`await view.click("button.submit")`、`await view.evaluate("app.store.xxx")`、`await view.scroll(0, 400)`、`await view.screenshot({ format: "png" })`。

### 运行参数

- `--url <地址>`：覆盖基准地址（默认 `http://localhost:1420`）。
- 环境变量 `FRONTEND_TEST_URL`：同上，优先级低于 `--url`。
- 退出码：`0` 全部通过；`1` 有用例失败；`2` 无法导航到目标（通常是服务器没起）。

## Core Capabilities

1. **零依赖无头浏览器**：`new WebView({ width, height, console, dataStore })`，无需 npm 安装浏览器引擎。
2. **真实用户交互**：`click`/`type`/`press`/`scroll` 派发原生事件（`isTrusted === true`），选择器方法自动等待可操作。
3. **页面求值与状态读取**：`evaluate(expr)` 在页面上下文执行 JS 字符串并返回反序列化结果；`evalExpr` 封装了 `undefined` 安全处理。
4. **声明式断言**：文本 / 可见性 / 数量 / 任意表达式 / 控制台错误，断言失败即截图留证。
5. **截图归档**：`snapshot(ctx, name, format)` 保存到 `screenshots/`（相对 `process.cwd()`，建议以 `.tmp` 为工作目录），供人工或更严格的回归对比。

## Guidelines

- `evaluate` 接收**字符串表达式**；多语句用 `(function(){ ... })()` 包裹，顶层 `const/let` 会抛 `SyntaxError`。
- `console` 选项必须是**函数**（`console: (level, ...a) => {...}`），传 `true` 会抛 `ERR_INVALID_ARG_TYPE`。
- 断言失败不要靠"肉眼看截图"判断；优先用 `evaluate` 读取 DOM/状态做代码级断言，截图仅作人工辅助。
- 需要登录态跨用例保留时，给 `WebView` 传 `dataStore: "./profile"`。
- **导航 URL 一律追加 `?hideUpdateInfo=1`**，否则启动期的数据包弹窗会盖住页面（详见上方「启动弹窗」）。
- 截图与临时脚本放 `.tmp/`：框架按 `process.cwd()` 写 `screenshots/`，所以**以 `.tmp` 为工作目录运行**
  （`workdir: <repo>/.tmp`）即可让产物落在 `.tmp/screenshots/`，不要在仓库根留下 `screenshots/`。
- 每次变更前端后，建议把关键路由的冒烟测试纳入验证（配合 `pnpm lint` / `pnpm test`）。

## Resources

### scripts/

- `webview-test.ts` — 测试框架：注册器 `test`、断言辅助、截图、运行器 `run`。**测试文件应 import 它**。
- `example.test.ts` — 可直接运行的冒烟示例，针对本项目 `http://localhost:1420`。

### references/

- `webview-api.md` — `Bun.WebView` 完整 API 精简参考（构造、方法、后端、事件、注意事项）。
