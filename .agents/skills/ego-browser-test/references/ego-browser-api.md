# ego-browser API 精简参考

面向 `ego-browser-test` 的测试作者。上游完整手册用 `ego-browser skill` 打印（版本随安装的 ego lite 走）；本文件只收录写测试最常用的部分。

## 运行脚本

```bash
# Bash / Git Bash
ego-browser nodejs <<'EOF'
const task = await taskSpace("goal")
const page = task.page("p1")
await page.goto("https://example.com")
console.log(await page.snapshot())
EOF

# Windows PowerShell：写 UTF-8 .mjs，再用一行入口执行（不要把多行/双引号塞进 -e）
ego-browser nodejs -e "await import('file:///C:/Users/<name>/task.mjs')"

# cmd
ego-browser nodejs < C:\Users\<name>\task.mjs
```

- 脚本跑在 **Node.js**（不是页面）。`window` / `document` / `location` 不存在；页面代码放 `page.evaluate()`。
- 每次调用都是新进程：TaskSpace / 标签页 / Page label 持久，JS 变量不持久。
- 脚本不继承 shell 的环境变量；输入写进脚本本身，别用 `FOO=bar ego-browser`。
- 不要 import Playwright，也不要自己启动浏览器。ego 不是 Playwright：没有 `locator()` / `getByRole()` / `context()` / `expect()` / `route()`。
- 所有时间是毫秒。

## 全局 helper

脚本顶层可直接用（本框架把它们视为 `globalThis` 上的函数）：

- TaskSpace：`taskSpace`、`newTaskSpace`、`useOrCreateTaskSpace`、`switchTaskSpace`、`listTaskSpaces`、`claimTaskSpace`、`completeTaskSpace`、`handOffTaskSpace`、`takeOverTaskSpace`、`waitForAgentControl`、`profiles`
- 页面导航：`gotoUrl`、`gotoAndWait`、`pageInfo`、`listTabs`、`currentTab`、`switchTab`、`openOrReuseTab`、`closeTab`、`ensureRealTab`、`iframeTarget`
- 交互：`click`、`doubleClick`、`hover`、`dragMouse`、`scroll`、`scrollBy`、`scrollToBottomUntil`、`pressKey`、`typeText`、`fillInput`、`dispatchKey`
- 观察/等待：`snapshot`、`snapshotRaw`、`snapshotText`、`captureScreenshot`、`elementCenter`、`drainEvents`、`wait`、`waitForLoad`、`waitForElement`、`waitForNetworkIdle`
- 页面 JS / 协议：`js`、`cdp`
- 请求：`browserFetch`、`serverFetch`
- `help()` / `help("page.click")`

测试里优先用 `task.page("p1")` 的 Page API；上面的全局 helper 主要给手工调试用。

## TaskSpace

```js
const task = await taskSpace("descriptive goal name") // 按名字取/建；同名空间唯一
const task2 = await taskSpace(7)                      // 按数字 id 取
```

- 新空间自带 Page `p1`；用 `goto()` 复用它，不要为每个 URL 开新页。
- 属性/方法：`spaceId`、`name`、`ownership`、`page(label)`、`userPage()`、`pages()`、`tabs()`、`newPage()`、`adopt(page, { as? })`、`release(label)`、`waitForControl(options)`、`handOff()`、`finish({ keep })`、`cdp(method, params, options)`
- `task.page(label)` 只引用已存在的 Page，不会创建；句柄永远 truthy，不能用 `if (!page)` 判断。新页用 `await task.newPage()`。
- `task.tabs()` 返回 `{ label?, page, targetId, title, url, active, openedBy }`；没有 `label` 的是未管理标签页，操作前 `adopt`。
- `finish({ keep })` 的 `keep` 必填：`[]` 关闭空间，`["p1"]` 保留结果页给用户。保留的页面在任务结束后要 `claimTaskSpace(id)` + `adopt` 才能继续操作。
- 不要用新 TaskSpace 逃避卡住的页面；在原空间里 reload / 重新导航。

## Page

```js
const page = task.page("p1")
```

### 状态与观察

| 方法 | 说明 |
|---|---|
| `page.label` / `spaceId` / `openedBy` / `targetId` | 标识 |
| `await page.url()` / `title()` / `info()` | 当前 URL / 标题 / 视口滚动信息 |
| `await page.snapshot(options)` | 语义快照（无障碍角色 + ref） |
| `await page.screenshot(options)` | 截图，返回文件路径 |
| `await page.events()` | 排空本 Page 的 CDP 事件 |

`snapshot` 选项：`scope: "only_within_viewport" | "full_page" | "subtree"`、`root: "@12"`（仅 subtree）、`includeActionMarks`、`includeStableLocator`。默认只截当前视口；下方还有内容时末尾会打印 `[more content below the viewport: ...]`。

ego 没有 Playwright 的 `setViewportSize`。本框架在首次导航前用
`page.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false })`
固定视口（默认 1440x900，运行器 `--viewport` 可改）；用例内也可以重新调用。

### 导航与等待

| 方法 | 说明 |
|---|---|
| `await page.goto(url, { timeout, waitUntil, referer })` | 导航；`waitUntil` 默认 `load` |
| `await page.reload({ timeout, waitUntil })` | 重新加载 |
| `await page.waitForURL(matcher, options)` | 等 URL（字符串 / 正则 / 谓词） |
| `await page.waitForSelector(selector, { state, timeout })` | 等元素；`state`: `attached` / `visible` / `hidden` / `detached` |
| `await page.waitForLoadState(state, options)` | `domcontentloaded` / `load` / `networkidle` |
| `await page.waitForFunction(fnOrExpr, arg?, { timeout, polling })` | 等页面表达式为真；返回 `true`（不是谓词结果） |
| `await page.waitForTimeout(ms)` | 原样等待（优先用可观察条件） |
| `page.waitForEvent("popup" \| "download", { timeout })` | 等新弹窗/下载；要在触发动作**之前**开始等 |

### 元素操作

| 方法 | 说明 |
|---|---|
| `await page.click(selector, options)` | 真实点击；自动滚动到目标 |
| `await page.dblclick(selector, options)` | 双击 |
| `await page.hover(selector, options)` | 悬停 |
| `await page.fill(selector, value, options)` | 填输入框（清空后输入） |
| `await page.selectOption(selector, valueOrLabelOrIndexOrArray, options)` | 选下拉项；`null` / `[]` 清空 |
| `await page.press(selector, chord, options)` | 聚焦后按键，如 `"Enter"`、`"Control+A"` |
| `await page.focus(selector, options)` | 聚焦 |
| `await page.dragAndDrop(source, target, options)` | 拖拽 |
| `await page.setInputFiles(selector, paths)` | 设置文件输入（绝对路径） |
| `await page.waitForFileChooser(options)` | 等文件选择器；先开始等再触发 |
| `await page.close()` | 关闭 Page |

- `click` / `fill` / `hover` / `dragAndDrop` 会自动把目标滚进视口；不要手动 pre-scroll。
- 动作要求**恰好一个**可操作匹配；多个匹配是歧义错误。
- 指针动作可加 `label: "3-6 个词"` 让屏幕上的 agent 光标显示动作说明；`fill` / `press` / `focus` / `selectOption` / 键盘方法不接受 `label`。
- `selectOption(selector, { label: "October" })` 里的 `label` 是选项可见文本，不是光标说明。

### 页面 JS 与 CDP

```js
const rows = await page.evaluate(({ selector, limit }) =>
    [...document.querySelectorAll(selector)].slice(0, limit).map(node => node.textContent?.trim()),
    { selector: "article", limit: 20 },
)

const value = await page.evaluate(`(async () => {
    const mod = await import("/src/utils/foo.ts")
    return mod.someState()
})()`)

const result = await page.cdp("Runtime.evaluate", { expression: "1 + 1", returnByValue: true })
```

- `evaluate` 返回 JSON 可序列化值；回调在页面里执行，不能读 Node 变量/模块，只能通过第二个参数传一个 JSON 值。
- `evaluate` 没有超时参数；长任务拆小。超时错误带 `executionStopped` / `mayHaveLateEffects`。
- 先用 Page 方法；wrapper 不覆盖时再用 `page.cdp()`。Page 方法用 `task.cdp()` 发 Target/Browser 命令。raw CDP 会让快照 ref 失效，不要跨轮次保存 `targetId`。
- 控制台默认对 CDP 隐藏；要看 `Runtime.consoleAPICalled`：先 `await page.cdp("egoAutomated.disable")`，再 `page.cdp("Runtime.enable")`。

### 对话框、弹窗、下载、请求

```js
const popupPromise = page.waitForEvent("popup")
await page.click('a[target="_blank"]')
const popup = await popupPromise
await popup.waitForLoadState()

await page.acceptDialog("prompt text") // 或 dismissDialog()
await page.fetch("/api/items", { method: "POST", body: JSON.stringify({ limit: 20 }) })
await page.fetch("/image.png", { saveAs: "/absolute/path/image.png" })
```

- 动作回执 `receipt.popups` 会列出立即观察到的弹窗 `{ label, targetId }`。
- 同步 JS 对话框可能出现在 `receipt.dialog` 或 `page.info()`；用 `acceptDialog` / `dismissDialog` 处理。
- 下载：先 `waitForEvent("download")` 再触发，脚本结束前 `download.saveAs(absolutePath)`，临时文件会随本轮清理。

### 截图

```js
const path = await page.screenshot({ path: "E:/dev/dna-builder/.tmp/shot.png", fullPage: true })
```

- `path` 必须绝对；Windows 用正斜杠。省略 `path` 写到系统临时目录并返回路径。
- 选项：`path`、`fullPage`、`clip`、`scale`、`raw`。
- 偶发约 15s 的 `EGO_PAGE_UNRESPONSIVE` 可以重试一次；canvas 可用 `page.evaluate(() => canvas.toDataURL("image/png"))` 取像素（WebGL 可能是空白）。

## 选择器

元素动作和 `waitForSelector` 接受：

- 快照 ref：`@21` 或 `ref=21`
- 文本：`text=保存`（不区分大小写、归一化空白、子串）；`text="Save changes"`（精确、区分大小写）
- `loc=css:<selector>`、`loc=role:<role>[name="<exact>"]`、`loc=role:<role>[name*="<substring>"]`、`loc=href:<substring>`
- `xpath=...`
- 原始 CSS
- Playwright 子集：`css=...`、末尾 `:has-text("...")` / `:text-is("...")`、`>> nth=N`（`N` 为 `-1` 或非负）
- 其它 Playwright 语法不支持。

`click/fill/hover` 先找顶层文档的可操作匹配，再搜索 frame；多个可操作匹配是歧义。CSS 会搜索开放的 shadow root。页面变化后旧 ref 失效，重新 `snapshot()`。

## 与 Bun.WebView / Playwright 的差异

| 能力 | Bun.WebView（已移除） | ego-browser-test | Playwright（`apps/web/tests/e2e`） |
|---|---|---|---|
| 浏览器 | 无头 Chrome/WebKit | ego lite 桌面真实 Chromium | Chrome/Edge |
| 依赖 | Bun >= 1.4 | ego lite 桌面应用 | `@playwright/test` |
| CI | 可 | **不可**（需要桌面会话） | 可 |
| 存储隔离 | `dataStore` 目录 | TaskSpace 内标签页隔离；同 profile 共享 localhost 存储 | 每个 context 隔离 |
| 网络 mock | 无内建 | 无内建（可用 `page.cdp` 手工做） | `page.route` |
| 多用户同时登录 | 多 profile | 单 profile（同一 origin 共享 localStorage） | 多 context |
| 登录态复用 | 手动 dataStore | 复用用户 ego lite profile | 手动注入 |
| 选择器 | CSS | ref / role / text / CSS / XPath | CSS / role / text |

## 上游

- 仓库：<https://github.com/citrolabs/ego-lite>
- 站点：<https://lite.ego.app/>
- 完整手册：`ego-browser skill`
- 安装/升级：`ego-browser` 不在 PATH 时看 `~/.claude/skills/ego-browser/references/install.md`
