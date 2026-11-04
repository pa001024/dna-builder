---
name: tauri-cdp
description: 通过 WebView2 DevTools 协议（CDP）连接并操作 Tauri 桌面应用（Windows）。当 bun-webview-test 无法覆盖桌面端特有功能（Tauri IPC/命令、窗口材质、托盘、深链、更新器、浮窗、系统集成）时使用；也可用于对真实桌面 WebView2 做点击、输入、求值、截图与控制台断言。应用生命周期归用户（不启动、不结束进程）；agent 负责 HKLM CDP 策略的诊断、配置与清理。
---

# Tauri 桌面端 CDP 调试

## 铁律

- **应用由用户启动**：不要运行 `bun dd` / `bun dd2` / `tauri dev` / `cargo run`，不要启动任何 exe。
- **不要结束进程**：不要用 `taskkill` / `Stop-Process` / `kill` 关闭应用或相关进程；需要重启时请用户操作。
- **HKLM 策略由 agent 负责**：连不上时由 agent 用 `policy ensure` 配置；测试结束或用户明确要求关闭调试时用 `policy remove` 清理。
- 用户当前会话只用于连接；不要为了“修好连接”而重启应用。

## Overview

Windows 上 Tauri 使用 WebView2（Chromium）。给 WebView2 传入 `--remote-debugging-port=<port>` 后，会暴露标准 CDP 端点：

- `http://127.0.0.1:<port>/json/version` — 浏览器版本
- `http://127.0.0.1:<port>/json/list` — 所有 page / worker 目标
- `Page.captureScreenshot`、`Runtime.evaluate`、`Input.dispatchMouseEvent` 等标准域都可用

本技能封装了零依赖的 Bun CDP 客户端与 CLI，直接操作**用户正在运行的桌面应用**，因此可以验证：

- `window.__TAURI__` 暴露的 IPC（`core.invoke`、`window`、`event`、`tray` 等）
- 桌面端专有命令（窗口材质、开机自启、游戏启动、更新器、浮窗、局域网同步……）
- 真实 WebView2 的渲染、输入、控制台与截图

细节与研究结论见 `references/webview2-cdp.md`。

## 标准流程

### 1. 先尝试连接

```bash
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts doctor
```

- 输出 `✅ CDP 可用` → 直接进入测试。
- 输出 `❌ 127.0.0.1:<port> 上没有 CDP 端点` → 看它给出的「原因 / 下一步」。

### 2. 按 doctor 的原因处理

`doctor` 会同时检查 **HKLM 策略** 与 **应用进程**，并区分四种情况：

| doctor 输出 | 含义 | agent 动作 |
|---|---|---|
| 策略未配置 + 应用已运行 | 启动前没开 CDP | `policy ensure` → **请用户退出并重新启动应用** |
| 策略已配置 + 应用已运行，但无端点 | 应用在策略生效前启动 | 无需改策略；**请用户重新启动应用** |
| 策略未配置 + 应用未运行 | 还没启动也没配置 | `policy ensure` → **请用户启动应用** |
| 策略端口不对 | 策略写的是别的端口 | `policy ensure --port <port>` → 请用户重新启动 |
| 策略已配置 + 应用未运行 | 只差启动 | **请用户启动应用** |

配置策略（会弹 UAC，需要用户确认）：

```bash
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts policy ensure
# 安装版或自定义 exe 名：
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts policy ensure --exe "DNA Builder.exe"
```

写入后 agent **不重启应用**，只提示用户：

> 已写入 HKLM CDP 策略。请退出当前应用并用 `bun dd` / `bun dd2` 重新启动。

然后再次运行 `doctor`，直到看到 `✅ CDP 可用`。

### 3. 测试

用 `targets` / `eval` / `call` / `click` 等命令操作（见下文）。

### 4. 测试结束清理

**测试完成或用户明确要求关闭调试时**，执行：

```bash
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts policy remove
```

只删除值里含 `remote-debugging-port` 的项，不影响其它 WebView2 配置。已运行的应用不受影响，下次启动不再开放 CDP 端口。

> 测试期间若用户继续使用应用，可在**同一会话结束前**保留策略；但只要本轮任务完成，就应主动清理并在回复里说明。

## Prerequisites（背景）

- 本仓库 `app.manifest` 是 `requireAdministrator`，WebView2 Runtime 为 15x。**WebView2 ≥ 150 对提权应用会忽略 `WEBVIEW2_*` 环境变量和 HKCU 策略**，只能用 HKLM 策略或代码 API 参数。`policy ensure` 写的就是 HKLM。
- 策略在**浏览器进程启动时**读取；应用已在运行时不生效，必须由用户重启。
- 非提权应用也可由用户在启动命令前加环境变量（本仓库不适用）：
  ```bash
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222 --remote-allow-origins=*" bun dd
  ```

## Quick Start

```bash
# 1. 诊断（必要时按提示 policy ensure，再请用户重启应用）
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts doctor

# 2. 看当前所有 WebView2 页面/worker，确认默认目标
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts targets

# 3. 求值（可 await）
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts eval "document.title"

# 4. 调用 Tauri 命令
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts call get_os_version

# 5. 真实点击 + 等待路由变化
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts click "a[href='#/char']" --wait "location.hash === '#/char'"

# 6. 截图（绝对路径会打印到 stdout）
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts screenshot .tmp/tauri-cdp/char.png

# 7. 测试结束清理策略
bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts policy remove
```

## Commands

| 命令 | 作用 |
|---|---|
| `doctor` | 诊断连接：可用则列目标；不可用则判断「没启动 / 没配策略 / 配错端口」 |
| `policy ensure` | 写入 HKLM CDP 策略（会弹 UAC）；不重启应用，提示用户重启 |
| `policy remove` | 移除含 `remote-debugging-port` 的策略值 |
| `policy status` | 查看策略值与应用进程状态（只读） |
| `targets` | 列出 page / service_worker 及视口尺寸，`*` 标默认目标 |
| `info` | 打印浏览器版本与 Protocol-Version |
| `eval <expr>` | 在页面求值，支持 Promise；字符串原样输出，对象打印 JSON |
| `eval --file <file>` | 把文件内容作为 async 函数体执行 |
| `call <cmd> [json]` | `window.__TAURI__.core.invoke(cmd, args)`，测试桌面 IPC |
| `click <sel>` | 点击第一个**可见**匹配元素的中心；`--xy x,y` 点坐标；`--count 2` 双击；`--force` 忽略遮挡 |
| `hover <sel>` | 鼠标移动到元素中心（测 tooltip / 悬浮菜单） |
| `type <text>` | `Input.insertText`；`--selector` 先聚焦可见元素；`--clear` 先清空 |
| `press <key>` | `Enter` / `Escape` / `Tab` / `Ctrl+A` 等 |
| `wait <expr>` | 轮询到表达式为真；`--selector` 等元素可见；`--gone` 等消失 |
| `screenshot [path]` | 截图；`--full` 整页；`--activate` 先调用 Tauri API 显示/还原窗口 |
| `console` | 监听控制台；`--seconds N`、`--reload`、`--fail-on-error`、`--json` |
| `reload` | 刷新页面（会重新走前端初始化） |
| `focus` | 通过 `window.__TAURI__.window.getCurrentWindow()` 显示/还原/聚焦窗口 |

通用选项：`--port`（默认 9222 / `TAURI_CDP_PORT`）、`--target`（序号从 1 开始或 URL/标题片段）、`--json`、`--quiet`。

> 下文的 `$CDP` 代指 `bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts`；在 bash 里可先执行
> `CDP="bun .agents/skills/tauri-cdp/scripts/tauri-cdp.ts"`。

## 目标选择

WebView2 的 CDP 端口由**所有 WebView2 控件共享**，`/json/list` 会同时出现主窗口、`#/screen-bar` 隐藏页、Service Worker、RAG Worker 等。默认规则：

1. 排除 URL 含 `screen-bar` / `float-window` / `cloudgame` / `about:blank` 的页面；
2. 剩余页面里取视口面积最大者。

需要操作隐藏页（例如任务栏嵌入的 `screen-bar`）时显式指定：

```bash
$CDP eval "document.body.innerText" --target screen-bar
$CDP screenshot --target 2
```

## 桌面端测试配方

### 1. Tauri IPC 命令

```bash
$CDP call get_os_version
$CDP call is_game_running
$CDP call float_window_state
$CDP call check_is_admin
```

命令名与参数见 `apps/web/src-tauri/src/lib.rs` 的 `generate_handler!`；参数是 JSON：

```bash
$CDP call apply_material '{"material":"Mica"}'
$CDP call set_launch_at_startup_enabled '{"enabled":true}'
```

> 修改系统状态的命令（自动启动、窗口材质、更新安装、游戏补丁等）会真实生效，测试前确认可接受，并在结束后恢复原状。

### 2. 直接调用 Tauri JS API

```bash
$CDP eval "window.__TAURI__.window.getCurrentWindow().isMaximized()"
$CDP eval "window.__TAURI__.window.getCurrentWindow().isVisible()"
$CDP eval "window.__TAURI__.app.getVersion()"
$CDP eval "window.__TAURI__.path.appDataDir()"
$CDP eval "Object.keys(window.__TAURI__)"        # 确认 withGlobalTauri 暴露了哪些模块
```

`eval` 自动 `awaitPromise`，所以上面返回 Promise 的 API 可以直接写。

### 3. 控制台 + 交互

`console` 是长连接：先启动监听，再由另一个进程触发交互。也可以 `--reload` 采集启动日志。

```bash
# 终端 A
$CDP console --seconds 15 --fail-on-error --json > .tmp/console.jsonl

# 终端 B
$CDP click "a[href='#/setting']" --wait "location.hash === '#/setting'"
```

实际断言（Pinia store 在 Vue 根节点上，只读）：

```bash
$CDP eval 'JSON.stringify(document.querySelector("#app").__vue_app__.config.globalProperties["$pinia"].state.value.setting, null, 2)'
$CDP wait "document.querySelector('dialog.modal-open') === null" --timeout 15000
```

> 注意 bash 双引号会展开 `$pinia`；访问 store 时用单引号包住整个表达式，或写成 `["$pinia"]`。

### 4. 截图与视觉检查

```bash
$CDP screenshot .tmp/tauri-cdp/home.png
$CDP screenshot .tmp/tauri-cdp/full.png --full
$CDP screenshot .tmp/tauri-cdp/window.png --activate
```

- 截图只包含 **WebView 页面**，不包含原生标题栏、托盘菜单、系统对话框。
- 窗口最小化/隐藏到托盘时可能截到旧帧或黑屏；先 `focus` 或 `screenshot --activate`。
- 需要人工确认时把绝对路径返回给用户；不要用截图替代代码级断言。

### 5. 深链、托盘、原生对话框

这些不在 WebView CDP 的能力范围内：

- **深链**：由用户触发协议（例如在系统里打开 `dobapp://...`）或在应用内调用相应命令；agent 只通过 `console` / `eval` 观察结果。不要自己启动新实例。
- **托盘菜单 / 原生右键菜单 / 文件选择框**：CDP 看不到。优先用应用内的 JS 入口或 `call` 命令绕过；必须测原生 UI 时，请用户操作。
- **更新器原生安装流程**：只能验证到 JS/命令层（`call update_check` 等），安装 UI 由用户验证。

## 选择器与输入注意事项

- 同名选择器可能同时命中**隐藏侧边栏**和可见卡片。`click`/`type` 会自动选第一个可见元素；若全部不可见会明确报错。
- `:has-text()` 是 Playwright 语法，**不是** CSS。用 `eval` 找元素，或写成标准 CSS / XPath 不可用时先求坐标再 `click --xy`。
- 点击前会 `scrollIntoView`；坐标是视口 CSS 像素，和 `getBoundingClientRect()` 一致。
- 命中点被其它元素遮挡时 `click` 会失败并打印遮挡元素；确认是真实层级后再加 `--force`。
- reka-ui 的 `Select` 选项列表不做虚拟化，但当前选中项会对齐触发器，屏幕外选项点不到：用 `eval` 找可见选项的坐标，再 `click --xy`。
- `type` 使用 `Input.insertText`，会触发 `input` 事件但不会逐键触发 `keydown`；需要键盘行为时用 `press`。
- `press` 的修饰键写法：`Ctrl+Shift+A`、`Alt+Enter`、`Meta+...`。

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| `doctor` 报“没有 CDP 端点” | 看它给出的「原因 / 下一步」：策略缺失 → `policy ensure`；策略已配但应用先启动了 → 请用户重启。**不要自己启动或杀进程。** |
| `curl /json/version` 通但 `targets` 没有 page | 窗口还没创建/已隐藏；稍后重试，或用 `--target`。 |
| 端口被别的程序占用 | 用 `--port` 换端口并 `policy ensure --port <新端口>`，再请用户重启。 |
| `window.__TAURI__` 为 undefined | 应用未开 `withGlobalTauri`；改用应用自身模块或 `Runtime.evaluate` 读内部状态。 |
| `call` 报权限错误 | capability 未授权该命令，或命令名/参数不对；对照 `lib.rs` 与 `capabilities/`。 |
| 提权应用 + WebView2 ≥150 时环境变量无效 | 必须 HKLM 策略；`policy ensure` 就是写它。 |
| 控制台看不到历史日志 | 不要依赖回放；先启动 `console` 再操作，或 `console --reload`。 |
| 截图黑屏/旧帧 | 窗口最小化/隐藏；先 `focus` 或 `--activate`。 |
| `policy ensure` 失败 | UAC 被拒绝或不是管理员；请用户手动执行工具打印的 `reg add` 命令。 |

## 策略清理

`policy remove` 只删除值里含 `remote-debugging-port` 的项，不会动整个 `AdditionalBrowserArguments` 键（可能还有其它应用的配置）。手动等价命令：

```powershell
reg delete "HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments" /v dna-builder.exe /f
reg delete "HKLM\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments" /v "DNA Builder.exe" /f
```

**执行时机**：本轮桌面端测试完成，或用户明确要求关闭调试时。不要留着长期开放调试端口。

## 与 bun-webview-test 的分工

| 场景 | 用哪个 |
|---|---|
| 纯前端页面、`localhost:1420`、无桌面依赖 | `bun-webview-test`（无头、可并行、隔离） |
| 需要真实 Tauri IPC / 窗口 / 托盘 / 深链 / 更新器 / 系统命令 | **本技能**（连接用户已启动的桌面应用） |
| 需要可重复 CI、无用户桌面会话 | `bun-webview-test` |
| 需要截取真实桌面窗口内的渲染结果 | 本技能 |
| 需要测试应用启动参数、单实例、退出行为 | 用户手动启动 + 本技能观察；agent 不管理进程 |

## Resources

- `scripts/tauri-cdp.ts` — CDP CLI（零依赖，Bun 原生 WebSocket + fetch）；含策略配置/清理。
- `references/webview2-cdp.md` — WebView2 CDP 机制、配置通道、版本回归与调研来源。
