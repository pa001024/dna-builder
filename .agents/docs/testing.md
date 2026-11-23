# 自动化测试流程

本项目的浏览器级验证分三层。先按「要不要真实浏览器 / 要不要网络 mock / 要不要 CI」选层，再写用例。

| 层级 | 工具 | 命令 | 典型用途 | 运行环境 |
|---|---|---|---|---|
| 单元 / 组件 | Vitest | `pnpm test`<br>`pnpm test:web` / `pnpm test:data` / `pnpm test:tools` | 纯逻辑、store、计算内核、组件逻辑 | 任意；CI 可跑 |
| UI e2e（mock / 隔离） | Playwright | `pnpm test:e2e` | `page.route` 拦截 GraphQL、双用户 context、窄视口、CI | 本机 Chrome/Edge；CI |
| 真实浏览器冒烟 | ego lite（`ego-browser`） | `pnpm test:browser` | 真实浏览器 + 已登录 profile、真实数据包、点击/输入回归、截图巡检 | 本机 ego lite 桌面应用；**不用于 CI** |

> 原来的 `bun-webview-test`（`Bun.WebView` 无头浏览器）已删除，由 `ego-browser-test` 取代。`Bun.WebView` 仍保留在 `apps/server/src/bot/render-webview.ts` 用于服务端 HTML→图片渲染，与测试流程无关。

## 选层口径

- **能用 Vitest 就用 Vitest**：纯函数、计算、store、序列化、组件逻辑都在这一层，快且 CI 可跑。
- **需要拦截网络 / 双用户 / CI** → **Playwright**（`apps/web/tests/e2e`）。ego lite 没有 `page.route`，所有标签页共享同一个 profile 的 localStorage / IndexedDB，无法同时模拟两个登录用户。
- **需要真实浏览器 / 用户登录态 / 真实数据包 / 桌面窗口** → **ego-browser-test**（`apps/web/tests/browser`）。
- **Tauri IPC、窗口材质、托盘、深链、更新器、浮窗** → `tauri-cdp` 技能（连接用户已启动的桌面应用，agent 不管理进程）。

## 单元 / 组件（Vitest）

```bash
pnpm test                 # web + data + tools 全部
pnpm test:web             # apps/web/src/**/*.test.ts
pnpm test:data            # packages/data/tests
pnpm test:tools           # 仓库根 vitest（tools 等）
pnpm --filter dna-builder-web test -- src/utils/tests/foo.test.ts    # 单个 web 测试
pnpm --filter dna-builder-data test -- tests/foo.test.ts   # 单个 data 测试
```

- 各包的 `test` 脚本经 `tools/vitest-run.mjs` 转发给 vitest。pnpm 不像 npm 那样吞掉 `--`（会原样传给命令），而 vitest 的 CLI 会把 `--` 之后的参数收进 `options["--"]` 而非文件过滤器，导致单文件测试静默跑全量；该脚本会先剥掉 `--`。带不带 `--` 都能正确过滤，过滤器匹配不到文件时退出码为 1。

- Vitest 用例只收 `apps/web/src/**/*.test.ts`；browser e2e 用例放 `apps/web/tests/browser/*.test.mjs`（Vitest 不会收）。
- 改前端后跑 `bun tools/incremental-lint.ts`（`pnpm lint`），不要单独跑全项目 `vue-tsc`。

## Playwright e2e（mock / 隔离）

```bash
pnpm test:e2e
pnpm test:e2e:headed
pnpm --filter dna-builder-web test:e2e tests/e2e/chat-new-message.spec.ts
```

- 配置：`apps/web/playwright.config.ts`；用例：`apps/web/tests/e2e/*.spec.ts`。
- 配置里没有 `webServer`：跑之前 dev server 必须已在 `http://localhost:1420`（按项目规则 agent 不启动 `pnpm dev` / `pnpm build`）。
- 后端地址 `E2E_BACKEND_URL`（默认 `http://127.0.0.1:8887/graphql`）；前端 `E2E_FRONTEND_URL`（默认 `http://localhost:1420`）。
- 用 `page.route` 拦截 GraphQL 并喂内存 fixture，不要请求生产接口。
- 每个 test 用独立 `browser.newContext()` 注入不同 JWT，模拟多用户。
- 截图/录像/trace 只在失败时保留；`skin-toon-baseline.spec.ts` 是显式 `TOON_BASELINE=1` 才跑的基准图工具。

## 真实浏览器冒烟（ego-browser-test）

### 前置

1. **ego lite 已安装并运行**。Windows 安装后在**新开的 shell** 里确认：
   ```powershell
   Get-Command ego-browser
   ego-browser --help
   ```
   PATH 未刷新时，运行器会自动在 `C:\Program Files\Citro Labs\ego lite\Application\<版本>\` 下找，也可以显式设置：
   ```powershell
   $env:EGO_BROWSER_PATH = "C:\Program Files\Citro Labs\ego lite\Application\<版本>\ego-browser.exe"
   ```
2. **开发服务器已启动**：`http://localhost:1420`。按项目规则，agent **不运行 `pnpm dev` / `pnpm build`**。
3. 首次跑数据页前，确认 ego lite 的 localhost:1420 存储里有数据包（见下方「数据包」）。

### 运行

```bash
pnpm test:browser                                  # apps/web/tests/browser 下全部 *.test.mjs
pnpm test:browser -- --filter 启动                 # 只跑名称包含「启动」的用例
pnpm test:browser -- --keep                        # 结束时保留 p1 供人工查看
pnpm test:browser -- --url http://localhost:1420
pnpm test:browser -- --screenshot-on-pass
pnpm test:browser -- --viewport 390x844             # 默认 1440x900
pnpm test:browser -- --ignore-console "特定噪音"   # 可重复
```

直接运行（不经过 pnpm）：

```bash
bun .agents/skills/ego-browser-test/scripts/run.mjs [选项] [测试文件/目录...]
```

环境变量 `FRONTEND_TEST_URL` 等价于 `--url`（`--url` 优先）。

产物：`.tmp/ego-browser-test/<时间戳>/`

- `result.json`：`passed` / `failed` / 每个用例的耗时与错误。运行器据此给退出码（失败 1，环境错误 2/1）。
- `screenshots/`：失败用例自动截图 `fail-<用例名>.png`；`--screenshot-on-pass` 时通过用例也截图。

### 写用例

在 `apps/web/tests/browser/` 新建 `*.test.mjs`，default export 注册函数：

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

`ctx` 提供 `page`、`task`、`baseUrl`、`url()`、`goto()`、`snapshot()`、`screenshotDir`、`ignoreConsoleErrors`。断言辅助都接收 `ctx` + **CSS 选择器**；交互可用 ego 的 `loc=role:` / `text=` / `@ref`，直接调 `page.click()` / `page.waitForSelector()`。

约定：

- 用例共享同一个 Page，按注册顺序执行；需要干净页面时自己 `ctx.goto("/")`。
- 默认视口 1440x900（`run()` 用 CDP 固定），跨机器截图/布局断言一致；用 `--viewport` 或用例内重新 `Emulation.setDeviceMetricsOverride` 改。
- 每个用例结束自动检查控制台错误（`error` / `warn` / `uncaught` / `unhandledrejection`）。已知噪音默认忽略：`读取自定义底图失败`、Tauri `transformCallback`、`DNAAPI获取密函失败`。用例里可 `ctx.ignoreConsoleErrors.push(/.../)`。导航会重置错误数组，跨导航的错误要在导航前显式检查。
- 启动期（首次导航到第一个用例之间）的错误算到第一个用例头上。
- 没有全局 per-test 超时；不要写永不 resolve 的页面 Promise。
- 完整 API 与坑见 `.agents/skills/ego-browser-test/SKILL.md` 和 `references/ego-browser-api.md`。

### 启动与 URL

- 导航必须带 `?hideUpdateInfo=1`，否则启动弹窗会盖住页面。`run()` 的首次导航、`ctx.url()`、`ctx.goto()` 会自动补。
- `run()` 在跑用例前等待 `#app` 有子节点且 `#boot-loader` 消失（最多 60s）。不要用固定 sleep 代替。
- ego lite 是真实浏览器窗口，不是无头；TaskSpace 在后台开标签页，不会抢用户当前标签页，但会出现在同一浏览器里。结束时 `task.finish({ keep: [] })` 关闭；`--keep` 保留 `p1`。

### 数据包

ego lite 的 TaskSpace 共享同一个 profile 的 localhost:1420 存储；数据包装一次，后续运行都能用。没装时角色/武器等数据页会停在加载态。

```js
await ctx.page.evaluate(`(async () => {
    const pack = await import("/src/utils/data-pack/data-pack.ts")
    return await pack.downloadDataPack()
})()`)
```

dev 包基址是 `/mock/data-pack`，不联网；这会写入 ego lite 当前 profile 的 localhost:1420 IndexedDB，不影响其它站点。也可以让用户在应用里正常安装。装完重新导航即可看到水合后的数据；页面内 `await import("/src/utils/xxx.ts")` 与应用共用同一份模块实例。

## 常见问题

| 现象 | 处理 |
|---|---|
| `未找到 ego-browser` | 安装/打开 ego lite 完成 onboarding；新开 shell；或设 `EGO_BROWSER_PATH` |
| `无法打开 http://localhost:1420` | 开发服务器没起；让用户启动，agent 不要自己跑 `pnpm dev` |
| 页面停在「正在加载数据…」 | 等 `#boot-loader` 消失；若一直不消失，检查 dev server 和数据包 |
| 用例报大量控制台错误 | 先看是否启动期噪音；用 `--ignore-console` 或 `ctx.ignoreConsoleErrors` 精确忽略，不要整体关掉断言 |
| 角色页没有伤害数字 | 数据包未装或角色 id 不在当前数据包；先 `downloadDataPack()` |
| 截图路径报错 | ego 要求绝对路径、Windows 正斜杠；用 `ctx.snapshot()` |
| 任务空间残留 | `listTaskSpaces()` 查看；用 `completeTaskSpace(id, { keep: false })` 关闭；不要用新空间逃避卡住的页面 |
| 点不到 reka-ui Select 的 option | 选中项对齐触发器，部分 option 在视口上方；取一个可见 option 的坐标用 `page.mouse.click(x, y)` |

## 相关文档

- `.agents/skills/ego-browser-test/SKILL.md` — 技能入口与完整约定。
- `.agents/skills/ego-browser-test/references/ego-browser-api.md` — ego API 精简参考。
- `.agents/docs/build-and-ssg.md` — 数据包水合、无数据降级。
- `apps/web/playwright.config.ts` / `apps/web/tests/e2e/` — Playwright 配置与用例。
