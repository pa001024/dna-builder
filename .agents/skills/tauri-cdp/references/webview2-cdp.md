# WebView2 / Tauri CDP 调研与机制说明

本文记录 `tauri-cdp` 技能背后的机制、配置通道、版本坑与调研来源。技能本身是
**attach-only**：应用由用户启动，工具只连接已有的 CDP 端口。

## 1. WebView2 的 CDP 是什么

Tauri 在 Windows 上使用 WebView2（Chromium/Edge）。WebView2 暴露的是 Chromium
DevTools Protocol（CDP）的一个子集：

| 端点 | 内容 |
|---|---|
| `GET http://127.0.0.1:<port>/json/version` | `Browser`、`Protocol-Version`、`webSocketDebuggerUrl` |
| `GET http://127.0.0.1:<port>/json/list` | 所有 target：`page`、`service_worker`、`worker`、每个 target 的 `webSocketDebuggerUrl` |
| `GET http://127.0.0.1:<port>/json` | 与 `/json/list` 基本一致 |

每个 target 有自己的 WebSocket URL；连接后发送 `{id, method, params}`，接收
`{id, result}` 或 `{method, params}` 事件。测试常用域：

- `Runtime.evaluate` — 页面求值，`awaitPromise` / `returnByValue`
- `Page.captureScreenshot` — 页面截图（不含原生窗口边框/托盘）
- `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` / `Input.insertText` — 真实输入
- `Runtime.consoleAPICalled` / `Runtime.exceptionThrown` / `Log.entryAdded` — 控制台
- `Page.reload` / `Page.bringToFront` / `Page.getLayoutMetrics`
- `DOM` / `Network` / `Emulation` — 进阶调试

WebView2 的 CDP 端口由**同一浏览器进程内的所有 WebView2 控件共享**，所以
`/json/list` 可能同时列出主窗口、隐藏窗口和 worker。技能默认选“视口面积最大的
非隐藏 page”，并支持 `--target` 覆盖。

## 2. 如何给 WebView2 打开远程调试端口

必须在 **WebView2 浏览器进程启动前** 传入 `--remote-debugging-port`，常见四条通道：

### 2.1 代码 API（最可靠）

`CoreWebView2EnvironmentOptions.AdditionalBrowserArguments`：

```cpp
options->put_AdditionalBrowserArguments(L"--remote-debugging-port=9222 --remote-allow-origins=*");
```

Tauri/wry 在 Windows 上**总是**通过这个 API 设置参数（默认
`--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection`）。Tauri v2 的窗口配置
`app.windows[].additionalBrowserArgs` 可以覆盖它；注意设置后会**替换** wry 的默认参数，
需要把默认的 `--disable-features=...` 一起写上。

```jsonc
// tauri.conf.json（仅用于本地调试的构建）
"windows": [{
  "additionalBrowserArgs": "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9222 --remote-allow-origins=*"
}]
```

API 参数在提权进程中仍然有效，是 WebView2 150+ 的安全推荐通道。

### 2.2 环境变量（仅非提权应用）

```bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222 --remote-allow-origins=*" <启动命令>
```

必须在应用启动前设置，且应用要继承该环境变量。**提权应用会忽略它**（见 §3）。

### 2.3 HKCU 策略（仅非提权应用）

```
HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments
  值名 = 应用 exe 文件名（如 dna-builder.exe）
  值   = --remote-debugging-port=9222 --remote-allow-origins=*
```

### 2.4 HKLM 策略（提权应用可用）

```
HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments
  值名 = 应用 exe 文件名（如 dna-builder.exe）
  值   = --remote-debugging-port=9222 --remote-allow-origins=*
```

本仓库的应用清单是 `requireAdministrator`，所以开发和安装版都以高完整性级别运行，
**必须使用 HKLM 策略**（或 API 参数）。设置命令（管理员 PowerShell）：

```powershell
reg add "HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments" /v dna-builder.exe /t REG_SZ /d "--remote-debugging-port=9222 --remote-allow-origins=*" /f
```

删除：

```powershell
reg delete "HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments" /v dna-builder.exe /f
```

值名按 exe 文件名匹配；`tauri dev` 运行的是
`apps/web/src-tauri/target/debug/dna-builder.exe`，安装版通常是 `DNA Builder.exe`。
策略只在浏览器进程启动时读取；应用已经在运行时要**由用户重启应用**才生效。

## 3. WebView2 150+ 提权安全回归（关键坑）

2026 年的 WebView2 Runtime 150 引入了一项安全加固：**高完整性级别（提权）的宿主
进程会忽略命令行 switch 覆盖和 HKCU 策略值**，包括：

- `WEBVIEW2_*` 环境变量（含 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`、`WEBVIEW2_USER_DATA_FOLDER`）
- 命令行 switch 覆盖
- HKCU 策略

只有 **HKLM 策略** 和 **通过 API 直接传入的 `AdditionalBrowserArguments`** 被采纳。
表现是：`curl http://127.0.0.1:9222/json/version` 完全无响应，但应用本身正常运行。
150 之前的 Runtime 没有这个行为。

本机验证：

- WebView2 Runtime：`156.0.4314.58`
- 应用清单：`requestedExecutionLevel level="requireAdministrator"`
- 通过 HKLM 策略设置 `--remote-debugging-port=9222` 后，应用重启即出现
  `/json/version`、`/json/list`、`Runtime.evaluate`、`Page.captureScreenshot` 全部可用。

结论：**这个仓库不要用环境变量方案**；让用户用管理员权限写 HKLM 策略，再启动应用。

## 4. Tauri 相关细节

- `tauri.conf.json` 的 `app.windows[].devtools: true` 只决定能否打开 DevTools UI，
  **不等于**开放 CDP 端口。
- `tauri-plugin-single-instance`：第二次启动会静默退出并把参数转交已有实例，所以
  不能靠“再启动一个实例”来附加调试；必须让用户重启现有实例。
- `withGlobalTauri: true` 时页面里有 `window.__TAURI__`，包含 `core`、`window`、
  `event`、`path`、`app` 等模块；`core.invoke(name, args)` 可以调用
  `generate_handler!` 注册的命令，是测试桌面端功能最直接的入口。
- Tauri CLI 构建时可用 `TAURI_CONFIG`（JSON Merge Patch）注入配置；
  `json_patch::merge` 对数组是**整体替换**，所以用这种方式改 `app.windows` 需要提供
  完整的窗口数组。该方案适合“没有管理员权限、必须走 API 参数”的机器，但本技能
  不负责构建或启动应用。

## 5. 已验证的调用

在本仓库真实应用上验证过：

```bash
curl http://127.0.0.1:9222/json/version
curl http://127.0.0.1:9222/json/list
```

```jsonc
// Runtime.evaluate
{ "expression": "document.title", "returnByValue": true, "awaitPromise": true }
```

```jsonc
// Page.captureScreenshot
{ "format": "png", "fromSurface": true }
```

```jsonc
// Input.dispatchMouseEvent
{ "type": "mousePressed", "x": 700, "y": 500, "button": "left", "buttons": 1, "clickCount": 1 }
```

结果：主窗口 `#/`（1456x985）与隐藏页 `#/screen-bar`（389x26）同时可见；
默认目标选主窗口；点击 `a[href='#/char']` 后 `location.hash` 变为 `#/char`；
`window.__TAURI__.core.invoke("get_os_version")` 返回 `11 (28000)`；
截图能完整捕获应用 UI；`Runtime.enable` 后能收到历史与实时的 console/exception 事件。

## 6. 安全与限制

- 调试端口只监听 `127.0.0.1`，但**本机任何进程**都能连上并执行任意页面 JS、调用
  Tauri IPC。只在调试期间开放，结束后由用户删除 HKLM 值。
- 策略按 exe 文件名生效，会影响所有同名进程；不要把值名写成通配或留下长期配置。
- CDP 只能操作 WebView 内容：原生标题栏、托盘菜单、系统文件选择框、UAC 提示、
  原生更新安装 UI 都不在范围内。深链可由用户触发后通过 `console`/`eval` 观察。
- 截图在窗口最小化/隐藏时可能是旧帧或黑屏；先 `focus` / `--activate`。
- 控制台历史不保证回放；先开 `console` 再操作，或 `console --reload`。

## 7. 调研来源

- Microsoft Learn — [Debug WebView2 apps with Visual Studio Code](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/debug-visual-studio-code)
  - `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`、注册表策略、必须在启动前设置、CDP 端口被所有控件共享。
- Microsoft Learn — [WebView2 browser flags](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags)
  - 可用的 flags（含 `remote-debugging-port`、`remote-allow-origins`）、提权应用忽略本地环境 flags。
- Microsoft Learn — [ICoreWebView2EnvironmentOptions](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2environmentoptions)
  - `AdditionalBrowserArguments` 的语义与覆盖规则。
- GitHub MicrosoftEdge/WebView2Feedback — [Issue #5640](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5640)
  - Runtime 150 对提权宿主忽略 env/HKCU/命令行开关；HKLM 与 API 参数仍有效。
- GitHub MicrosoftEdge/WebView2Feedback — [Issue #5645](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645)
  - 同一回归的实际复现（`--remote-debugging-port` 在 150 提权场景无响应）。
- Playwright — [WebView2](https://playwright.dev/docs/webview2)
  - 通过 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` + `connectOverCDP` 的标准做法；每测试独立 user data dir。
- Tauri 源码（本机 Cargo registry）：
  - `wry-0.57.0/src/webview2/mod.rs` — 默认 `AdditionalBrowserArguments` 与 API 调用。
  - `tauri-utils-2.10.x/src/config.rs` — `additional_browser_args` 配置项。
  - `tauri-build-2.7.x` / `tauri-codegen-2.7.x` — `TAURI_CONFIG` 的 JSON Merge Patch 行为。
- Chrome DevTools Protocol — [Runtime](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)、[Page](https://chromedevtools.github.io/devtools-protocol/tot/Page/)、[Input](https://chromedevtools.github.io/devtools-protocol/tot/Input/)。

## 8. 备选方案（本技能不执行）

如果目标机器无法写 HKLM，可由用户自行构建一个带 API 参数的调试版本（例如通过
`TAURI_CONFIG` 注入 `additionalBrowserArgs`），然后用户启动该 exe；本技能仍然只负责
连接 `127.0.0.1:<port>`。不要由 agent 构建/启动应用来绕过连接问题。
