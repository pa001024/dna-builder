# Bun.WebView API 参考 (Bun >= 1.4)

`Bun.WebView` 是 Bun 运行时内置的无头浏览器自动化 API，无需 Puppeteer / Playwright / 额外浏览器下载（macOS 用系统 WebKit；Linux/Windows 通过 Chrome DevTools Protocol 驱动已安装的 Chrome/Chromium/Edge/Brave）。本文件为编写前端测试时可直接参考的精简 API。

> 该 API 为 experimental，未来版本可能变化。

## 构造

```ts
import { WebView } from "bun"

const view = new WebView({
  width: 1280,            // 视口宽 (1-16384，默认 800)
  height: 800,            // 视口高 (1-16384，默认 600)
  url: "https://bun.com", // 可选: 构造后立即开始导航 (等同于下一行 navigate)
  title: "My App",        // 窗口标题
  backend: "webkit",      // "webkit"(仅 macOS) | "chrome" | { type:"chrome", path, argv }
  console: (level, ...args) => { /* 捕获页面 console；必须是函数，不能是 true */ },
  dataStore: "./profile", // 持久化 cookie/localStorage/IndexedDB 的目录；"ephemeral" 为默认内存态
})
```

- 构造是**同步**的，会在后台启动浏览器子进程；首个 `await` 操作（navigate/evaluate）会等待浏览器就绪。
- 支持 `using` / `await using` 自动释放（`Symbol.asyncDispose`）。
- 每个 Bun 进程共享一个浏览器子进程，多次 `new WebView()` 在同一实例中开新标签页。

## 后端 (backends)

- 默认后端取决于平台: macOS = `webkit`，其它 = `chrome`。
- 非 macOS 上请求 `backend: "webkit"` 会抛错。
- Chrome 后端查找顺序: `backend.path` → `BUN_CHROME_PATH` 环境变量 → `$PATH` → 标准安装路径 → Playwright 的 `chrome-headless-shell` 缓存；都找不到则构造抛错。
- 可连接已运行的 Chrome: `backend: { type: "chrome", url: "ws://127.0.0.1:9222/..." }`；或 `url: false` 强制新开无头实例。

## 方法

| 方法 | 说明 |
|------|------|
| `await view.navigate(url)` | 导航到 URL，页面加载完成后 resolve |
| `await view.evaluate(expr)` | 在页面内执行 JS 字符串，自动 await Promise，返回反序列化结果。复杂逻辑用 IIFE 字符串；顶层 `const/let` 会抛 SyntaxError |
| `await view.screenshot({ format, quality })` | 截图，返回 `Blob`。`format`: `"png"`(默认) / `"jpeg"` / `"webp"`；`quality` 0-100 (jpeg/webp) |
| `await view.click(selector)` | 点击 CSS 选择器（自动等待可操作：已挂载/可见/稳定/未被遮挡）；也可 `click(x, y)` 像素坐标 |
| `await view.type(text)` | 向聚焦元素输入文本 |
| `await view.press(key, { modifiers })` | 按键，`modifiers`: `{ ctrl, shift, alt, meta }` |
| `await view.scroll(dx, dy)` | 按增量滚动（原生滚轮事件，isTrusted: true） |
| `await view.scrollTo(selector)` | 滚动到元素（滚动所有祖先并等待可见） |
| `await view.goBack()` / `goForward()` / `reload()` | 导航控制 |
| `await view.resize(w, h)` | 调整视口 |
| `await view.cdp(method, params?)` | 原始 Chrome DevTools Protocol 调用（仅 Chrome 后端） |
| `view.close()` | 关闭视图并清理资源 |
| `view.url` / `view.title` / `view.loading` | 页面状态属性 |

## 事件

- `Bun.WebView` 继承 `EventTarget`，可用 `addEventListener` / `removeEventListener`。
- Chrome 后端上 CDP 事件作为 `MessageEvent` 分发，`event.data` 携带参数。

## 关键注意事项

- **真实输入**: `click`/`scroll`/`type`/`press` 派发原生浏览器事件，页面看到 `event.isTrusted === true`，与真实用户一致（适合反爬/交互验证）。
- **选择器方法自动等待可操作**（Playwright 风格）：元素必须已挂载、可见、稳定、未被遮挡。
- **`console` 必须是函数**：`console: true` 会抛 `ERR_INVALID_ARG_TYPE`。
- **`evaluate` 接收字符串**：传函数有时可用，但跨版本最稳妥的是传字符串表达式；多语句用 `(function(){ ... })()` 包裹。
- **截图返回 Blob**：用 `Bun.write("a.png", await view.screenshot())` 保存；失败用例截图 PNG 供人工排查。
- **持久化**: 默认每个视图内存态，关闭即丢弃；需要登录态/跨运行保留传 `dataStore` 目录。

## 最小可用示例

```ts
await using view = new WebView({ width: 800, height: 600 })
await view.navigate("https://bun.sh")
await view.click("a[href='/docs']")          // 真实点击，等待可操作
const title = await view.evaluate("document.title")
await Bun.write("page.png", await view.screenshot())
```
