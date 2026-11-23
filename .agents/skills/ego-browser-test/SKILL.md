---
name: ego-browser-test
description: 用 ego lite（ego-browser）真实浏览器对 dna-builder 前端做端到端冒烟与交互测试。当需要打开 localhost:1420、真实点击/输入、读取 DOM 或应用状态、断言控制台错误、截图归档，或编写/运行 apps/web/tests/browser 下的 *.test.mjs 时使用。替代已删除的 bun-webview-test。
---

# ego-browser-test

## Overview

本技能用 **ego lite**（`ego-browser` CLI）驱动真实 Chromium 对前端做端到端测试。ego lite 是面向 AI agent 的桌面浏览器：每个测试任务在一个独立的 **TaskSpace** 里开标签页，复用用户已登录的 profile，不打扰用户自己的标签页。

它替代了原来的 `bun-webview-test`（`Bun.WebView`）。核心差异：

- **不是无头浏览器**：需要 ego lite 桌面应用在运行；不适合 CI。
- **没有 `page.route` / 多 context 隔离**：网络 mock、双用户同时登录等场景仍用 Playwright（`apps/web/tests/e2e`）。
- **真实 profile**：localhost:1420 的 localStorage / IndexedDB 与用户浏览器共用；数据包装一次后续测试都能用。
- **Node 脚本 + 页面求值**：测试代码在 Node 里跑，`page.evaluate()` 里的代码才在页面里跑。

API 细节见 `references/ego-browser-api.md`；上游完整手册用 `ego-browser skill` 打印，不要凭记忆猜方法。

## When to use

- 对 `pnpm dev` 起的开发服务器（`http://localhost:1420`）做真实浏览器冒烟。
- 验证路由/组件挂载、真实点击/输入/滚动后的状态变化。
- 需要复用用户登录态、真实数据包或真实浏览器扩展的流程。
- 截图归档、可视化巡检、交互回归。
- 编写或运行 `apps/web/tests/browser/*.test.mjs`。

**不要用**：CI（无桌面会话）、需要 route 拦截或多用户隔离的用例、Tauri IPC/托盘/深链（用 `tauri-cdp` 技能）。

## Prerequisites

1. **ego lite 已安装并运行**：`ego-browser --help` 有输出。Windows 安装后在**新开的 shell** 里检查；PATH 未刷新时用 `EGO_BROWSER_PATH` 指向 `ego-browser.exe`。
2. **开发服务器已启动**：`http://localhost:1420` 可访问。**不要由 agent 运行 `pnpm dev` / `pnpm build`**。
3. 首次在某个 ego lite profile 里跑数据页前，可能需要安装一次数据包（见下方「数据包」）。

运行器会自动在 Windows 的 `C:\Program Files\Citro Labs\ego lite\Application\<版本>\` 下查找 CLI，PATH 没刷新也能跑。

## Quick Start

```bash
# 运行 apps/web/tests/browser 下全部 *.test.mjs
pnpm test:browser

# 只跑名称包含「启动」的用例
pnpm test:browser -- --filter 启动

# 保留 p1 页面，方便人工查看（任务空间结束后需 claim 才能继续操作）
pnpm test:browser -- --keep

# 指定地址 / 通过用例也截图
pnpm test:browser -- --url http://localhost:1420 --screenshot-on-pass

# 改视口（默认 1440x900；窄视口回归用 390x844）
pnpm test:browser -- --viewport 390x844
```

也可以直接运行：

```bash
bun .agents/skills/ego-browser-test/scripts/run.mjs [选项] [测试文件/目录...]
```

`FRONTEND_TEST_URL` 环境变量等价于 `--url`（`--url` 优先）。

产物在 `.tmp/ego-browser-test/<时间戳>/`：`result.json` + `screenshots/`。失败用例会自动截图；通过/失败摘要和退出码由运行器给出（用例失败退出 1；找不到 CLI / 测试文件退出 2；开发服务器不可达等运行错误退出 1）。

## 编写测试

在 `apps/web/tests/browser/` 新建 `*.test.mjs`，**default export** 一个注册函数（不要自己 import 框架、不要调用 `run()`）：

```js
export default ({ test, expectVisible, expectNoConsoleErrors, snapshot }) => {
    test("首页可加载", async ctx => {
        await ctx.goto("/")
        await expectVisible(ctx, "#app")
        await expectNoConsoleErrors(ctx)
        console.log(await snapshot(ctx, "home"))
    })
}
```

测试函数收到的 `ctx`：

| 字段 | 说明 |
|---|---|
| `page` | ego `Page` 句柄，直接用 `page.click/fill/press/evaluate/waitForSelector/...` |
| `task` | `TaskSpace` 句柄；多标签页时 `await task.newPage()` |
| `baseUrl` | 基准地址，默认 `http://localhost:1420` |
| `url(path)` | 拼绝对地址，并自动补 `?hideUpdateInfo=1` |
| `goto(path, options)` | `page.goto(url(path), options)` |
| `snapshot(name, options)` / `snapshotDir` | 截图到本次运行目录 |
| `ignoreConsoleErrors` | 可 push 字符串/RegExp，跳过已知噪音 |

可用的断言辅助（都接收 `ctx` 和 **CSS 选择器**）：

`expectText`、`expectContains`、`expectVisible`、`expectCount`、`expectCountAtLeast`、`expectEval`、`expectNoConsoleErrors`、`evalExpr`、`snapshot`。

交互需要 `loc=role:` / `text=` / `@ref` 时，直接用 `page.click(...)`、`page.waitForSelector(...)`；断言辅助不解析这些选择器。

### 用例约定

- **共享同一个页面**：用例按注册顺序执行，后一个用例从前一个用例结束的位置继续。需要干净页面时自己 `ctx.goto("/")`。
- **默认视口 1440x900**：`run()` 在首次导航前用 CDP `Emulation.setDeviceMetricsOverride` 固定视口，截图和布局断言跨机器一致；需要别的尺寸用 `--viewport`，或在用例里重新 `page.cdp("Emulation.setDeviceMetricsOverride", ...)`。
- **每个用例结束后自动检查控制台错误**：`console.error` / `console.warn` / `uncaught` / `unhandledrejection`。已知噪音默认忽略（`读取自定义底图失败`、Tauri `transformCallback`、`DNAAPI获取密函失败`），也可以 `ctx.ignoreConsoleErrors.push(/.../)`。测试里新开的 Page 需要自己 `await installConsoleCapture(page)` 才会有 hook。
- **导航会重置错误数组**（hook 在每个新 document 开头重建）：跨导航的错误要在导航前显式 `expectNoConsoleErrors(ctx)`；否则只看得到新页面的错误。
- **启动错误算到第一个用例头上**：hook 在首次导航前安装，第一个用例能看到启动期的错误。
- 失败会自动截图 `screenshots/fail-<用例名>.png`；`--screenshot-on-pass` 时通过用例也截图。
- 没有全局 per-test 超时：ego 的 action 自带超时，页面内的死循环/永不 resolve 的 Promise 会卡住运行器；不要写这种用例。

## 关键行为与坑

### 启动弹窗

导航地址必须带 `?hideUpdateInfo=1`，否则「应用更新 / 数据包 / 更新日志」弹窗会盖住页面。`run()` 的首次导航和 `ctx.url()` / `ctx.goto()` 会自动加；直接用 `page.goto()` 时自己加。

启动完成后 `#boot-loader` 会消失、`#app` 有子节点；`run()` 在跑用例前会等这两个信号（最多 60s）。不要用固定 `waitForTimeout` 代替。

### 数据包

ego lite 用真实浏览器 profile，localhost:1420 的 IndexedDB 在任务空间之间共享（同一 profile）。数据包没装时，角色/武器等数据页会停在加载态。装一次即可（dev 包基址 `/mock/data-pack`，不联网）：

```js
await ctx.page.evaluate(`(async () => {
    const pack = await import("/src/utils/data-pack/data-pack.ts")
    return await pack.downloadDataPack()
})()`)
```

这会写入 ego lite 当前 profile 的 localhost:1420 存储（不是用户其它站点的数据）；只在本地测试环境执行。也可以让用户在应用里正常安装数据包。

页面内直接 `await import("/src/utils/xxx.ts")` 拿到的是应用正在用的同一份模块实例（Vite 按解析后的 URL 去重），适合断言不体现在 DOM 上的状态。**不要为了测试往产品代码里加 `window.__debug` 钩子。**

### 选择器与真实输入

- 支持 `@ref`、`text=...`、`loc=css:`、`loc=role:button[name='...']`、`loc=href:`、`xpath=`、原始 CSS；`click/fill/hover` 会自动滚动到目标。
- 动作要求**恰好一个**可操作匹配；多个匹配会报歧义。先 `page.snapshot()` 看语义结构，或改用更具体的 role/name。
- 点击/输入是真实浏览器输入（`isTrusted === true`），不是 DOM 的 `.click()`。
- `page.snapshot()` 默认只截当前视口；页面下方内容用 `{ scope: "full_page" }`。快照末尾出现 `[more content below the viewport: ...]` 说明还有内容没截到。
- reka-ui `Select` 打开后 option 全在 DOM；当前选中项会对齐触发器，序号小于当前值的 option 可能 `top < 0` 点不到。先在 `page.evaluate` 里找一个可见（`top > 0 && bottom < innerHeight`）且文本不等于当前值的 option，取中心坐标，再 `page.mouse.click(x, y)`（ego 没有 `setViewportSize`，窗口尺寸用 `page.cdp("Emulation.setDeviceMetricsOverride", ...)`）。

### Windows / 路径

- `page.screenshot({ path })` 必须是**绝对路径**，Windows 用正斜杠（`E:/dev/...`）；运行器已经处理好。
- ego 脚本的 `process.env` **不继承**调用 shell 的环境变量；运行器把地址、测试文件等直接写进生成的 `run.mjs`，不要依赖 `FOO=bar ego-browser ...`。
- PowerShell 5.1 会吞掉 `-e` 里的双引号；本技能通过运行器传脚本，不需要手写长 `-e`。手工调试时用 `.mjs` 文件 + `ego-browser nodejs -e "await import('file:///...')"`。

### 控制台与 CDP

ego 默认把页面 console 消息对 CDP 隐藏（防止站点检测自动化）。本框架用 `Page.addScriptToEvaluateOnNewDocument` 在页面里 hook `console.error/warn` 和全局错误，所以断言不依赖 CDP 事件。需要看原始 `Runtime.consoleAPICalled` 时：先 `await page.cdp("egoAutomated.disable")`，再 `page.cdp("Runtime.enable")`；之后站点可能检测到 CDP。

### 任务空间生命周期

运行器为每次运行创建唯一的 `dna-builder e2e <时间戳>` 任务空间，结束时 `task.finish({ keep: [] })` 关闭。`--keep` 时保留 `p1` 页面供人工查看，但任务空间已结束；要继续操作需要 `claimTaskSpace(id)` 再 `adopt`。**不要用新任务空间来逃避卡住的页面**；在同一空间内 reload / 重新导航 / `page.close()`。

## Resources

### scripts/

- `ego-test.mjs` — 测试框架：`test` 注册器、断言辅助、控制台 hook、截图、`run()`。测试文件通过 default export 拿到 API。
- `run.mjs` — 运行器：找 `ego-browser`、收集测试文件、生成一次性的 `run.mjs`、读取 `result.json` 并给出退出码。
- `example.test.mjs` — 最小模板。

### references/

- `ego-browser-api.md` — ego TaskSpace / Page / 选择器 / 快照 / evaluate / 截图 / CDP 的精简 API 参考。

### 相关文档

- `.agents/docs/testing.md` — 项目三层测试流程（Vitest / Playwright / ego-browser-test）与选型。
- `.agents/docs/build-and-ssg.md` — 数据包水合与 e2e 的约束。
- `.agents/skills/tauri-cdp/SKILL.md` — 桌面端 WebView2 / Tauri IPC 测试。
