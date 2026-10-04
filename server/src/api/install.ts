import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Elysia } from "elysia"

/**
 * 静态安装脚本在仓库中的路径。脚本内容恒定（运行时自行读取 latest.json 解析版本），
 * 因此可被 CDN 缓存；此处只负责读取并以 text/plain 返回。
 */
const INSTALL_SCRIPT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "install.ps1")

/**
 * 判定请求是否来自 PowerShell（irm / iwr 的默认 UA 含 "PowerShell"）。
 * @param userAgent 请求头中的 User-Agent。
 * @returns 是否为 PowerShell 客户端。
 */
function isPowerShellUserAgent(userAgent?: string | null): boolean {
    return !!userAgent && /powershell/i.test(userAgent)
}

/**
 * 安装引导落地页：浏览器 / 健康检查等非 PowerShell 客户端看到的页面。
 * 文案与样式对齐 bun 官方安装页（英文、暗色、带强调色、命令块可复制）。
 * @param host 服务主机（不含协议），用于展示一键安装命令。
 * @returns 落地页 HTML 字符串。
 */
function renderLandingPage(host: string): string {
    // 主推命令对齐 bun 官方：powershell -c "irm <host> | iex"
    // iex 走管道不受文件执行策略限制，无需 Bypass；-c 即 -Command 简写
    const command = `powershell -c "irm ${host} | iex"`
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Install DNA Builder</title>
<style>
  :root { color-scheme: dark; --accent: #7ee787; --accent2: #56d4dd; --bg: #0d1117; --fg: #e6edf3; --muted: #8b949e; --box: #161b22; --border: #30363d; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(1200px 600px at 50% -10%, #15233a 0%, var(--bg) 60%); color: var(--fg);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; }
  main { width: 100%; max-width: 580px; padding: 48px 28px; text-align: center; }
  .badge { display: inline-block; font-size: 12px; letter-spacing: .12em; text-transform: uppercase;
    color: var(--accent2); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; margin-bottom: 18px; }
  h1 { font-size: 34px; margin: 0 0 6px; font-weight: 700; letter-spacing: -.02em; }
  h1 span { color: var(--accent); }
  .tagline { color: var(--muted); font-size: 16px; margin: 0 0 28px; }
  .label { text-align: left; color: var(--muted); font-size: 13px; margin: 0 0 8px; }
  .cmd { position: relative; }
  pre { margin: 0; padding: 18px 56px 18px 20px; background: var(--box); border: 1px solid var(--border);
    border-left: 3px solid var(--accent); border-radius: 12px; text-align: left; overflow-x: auto; }
  code { font-family: "Cascadia Code", Consolas, Monaco, monospace; font-size: 15px; color: var(--accent);
    white-space: pre-wrap; word-break: break-all; }
  .copy { position: absolute; top: 12px; right: 12px; padding: 6px 12px; font-size: 13px; cursor: pointer;
    background: #21262d; color: #c9d1d9; border: 1px solid var(--border); border-radius: 8px; transition: background .15s; }
  .copy:hover { background: #30363d; }
  .note { margin-top: 20px; font-size: 13px; color: var(--muted); line-height: 1.7; }
  a { color: var(--accent2); text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<main>
  <div class="badge">Desktop app</div>
  <h1>Install <span>DNA Builder</span></h1>
  <p class="tagline">The desktop companion for Duet Night Abyss — build, explore, and share.</p>
  <p class="label">To install, run the following in your terminal:</p>
  <div class="cmd">
    <pre><code id="cmd">${command}</code></pre>
    <button class="copy" id="copy" type="button">Copy</button>
  </div>
    <p class="note">Requires Windows 10 or later. Administrator access will be requested automatically.<br />
    Already have PowerShell open? You can also run: <code style="color:#c9d1d9">irm ${host} | iex</code></p>
  <p class="note"><a href="/api/download">Download the installer manually &rarr;</a></p>
</main>
<script>
  const btn = document.getElementById('copy')
  const cmd = document.getElementById('cmd')
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cmd.textContent)
      btn.textContent = 'Copied'
      setTimeout(() => (btn.textContent = 'Copy'), 1500)
    } catch (e) {
      btn.textContent = 'Press Ctrl+C'
    }
  })
</script>
</body>
</html>`
}

/**
 * 安装引导插件（根路径，不挂载前缀）。
 * 通过 User-Agent 区分客户端：PowerShell（irm/iwr）返回静态安装脚本（CDN 可缓存），
 * 其余返回落地页。支持 / 、/install 、/install.ps1 三个入口，均复用同一逻辑。
 */
export const installPlugin = () => {
    const app = new Elysia()

    const handleInstall = async ({ request }: { request: Request }) => {
        const host = new URL(request.url).host
        const userAgent = request.headers.get("user-agent")

        // 非 PowerShell 客户端：返回安装引导落地页（浏览器、curl、健康检查等）
        if (!isPowerShellUserAgent(userAgent)) {
            return new Response(renderLandingPage(host), {
                headers: { "Content-Type": "text/html; charset=utf-8" },
            })
        }

        // PowerShell 客户端：返回静态安装脚本。脚本内容恒定（运行时读 latest.json 取版本），
        // 设置 public 缓存头以便 CDN 边缘缓存。
        const scriptFile = Bun.file(INSTALL_SCRIPT_PATH)
        if (!(await scriptFile.exists())) {
            return new Response("Installer script is temporarily unavailable, please try again later or download manually.", {
                status: 500,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
        }

        return new Response(await scriptFile.text(), {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=86400",
            },
        })
    }

    app.get("/", handleInstall)
    app.get("/install", handleInstall)
    app.get("/install.ps1", handleInstall)

    return app
}
