# B 站动态自动发布

发布 `v*` tag 时，`publish.yml` 在 release 资产上传完成后调用 `tools/bili-dynamic/index.ts`：

1. 收集上一版本 tag 到当前 tag 的提交标题、正文和 `git diff --stat`；
2. 调 DeepSeek 生成玩家向的标题、副标题、亮点、分组说明和动态正文；
3. 用固定 HTML 模板渲染 1080px 卡片，通过本机 Chrome/Edge 的 CDP 量出真实高度后整页截图（2x）；
4. 调 B 站图文动态接口上传图片并发布；
5. 动态链接写入 GitHub Actions Step Summary。

## Secrets / Variables

在仓库 **Settings → Secrets and variables → Actions** 配置：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | Secret | 建议 | DeepSeek API Key。缺失时回退到规则摘要（只按提交类型分组，不做润色） |
| `BILI_COOKIE` | Secret | 二选一 | 登录 B 站后的完整 Cookie，推荐；至少包含 `SESSDATA`、`bili_jct`、`buvid3` |
| `BILI_SESSDATA` | Secret | 二选一 | 单独配置时与 `BILI_JCT` 一起使用 |
| `BILI_JCT` | Secret | 二选一 | Cookie 中的 `bili_jct`（32 位十六进制） |
| `BILI_BUVID3` | Secret | 否 | 缺失时脚本会调 `finger/spi` 自动获取 |
| `BILI_DEDEUSERID` | Secret | 否 | Cookie 中的 `DedeUserID` |
| `DEEPSEEK_MODEL` | Variable | 否 | 默认 `deepseek-flash` |
| `DEEPSEEK_BASE_URL` | Variable | 否 | 默认 `https://api.deepseek.com` |
| `CHROME_PATH` | Variable | 否 | 自托管 runner 上 Chrome/Edge 的路径；GitHub 托管 runner 会自动查找 |

`BILI_COOKIE` 的取法：浏览器登录 `bilibili.com` → DevTools → Network → 任意 `api.bilibili.com` 请求 → 复制请求头里的 `Cookie`。`SESSDATA` 会过期，失效后日志会报 `code=-101`，重新获取即可。

## 本地运行

```bash
# 只渲染卡片和正文，不发布（不需要任何密钥）；--tag 传当前分支名，版本号才取 package.json
node tools/bili-dynamic/index.ts --tag HEAD --dry-run

# 不用 DeepSeek，走规则摘要
node tools/bili-dynamic/index.ts --tag HEAD --dry-run --no-ai

# 真正发布（PowerShell 示例）
$env:DEEPSEEK_API_KEY = "..."
$env:BILI_COOKIE = "SESSDATA=...; bili_jct=...; buvid3=..."
node tools/bili-dynamic/index.ts --tag v1.6.0 --previous v1.5.2
```

产物在 `.tmp/bili-dynamic/<tag>.{html,png,txt}`，`html` 可用于排查排版。临时目录已被 git 忽略。

`--tag HEAD` 时版本号取 `package.json`；正式发布时传 `v*` tag。仓库名默认取 `GITHUB_REPOSITORY`（本地回退到 `pa001024/dna-builder`），fork 上也能用。

## 生成口径

- DeepSeek 只输出 JSON（标题 / 副标题 / 亮点 / 分组 / 正文），卡片 HTML 由固定模板渲染，所有文本都会转义，模型无法注入 HTML 或脚本。
- 正文由脚本补齐 release 链接，并压到 1900 字以内（B 站上限 2000）。
- 生成失败分两类：Key / 地址 / 凭据配错属于**配置问题**，跳过发布并在 Step Summary 留一条警告；DeepSeek 临时故障才回退到规则摘要。`--no-ai` 可强制走规则摘要。
- 分组上限：4 组、合计 9 条；每条 description 会按长度截断，保证卡片高度可控。
- 渲染默认使用 Chrome；找不到时用 Edge。Node.js 需要 23.6+（原生运行 `.ts`），CI 的 `lts/*` 满足要求。

## 配置缺失 / 配错时

默认**只跳过发布，不让 release 变红**（exit 0），并在 Step Summary 写一条警告说明缺什么：

| 情况 | 行为 |
| --- | --- |
| 没有 `DEEPSEEK_API_KEY` | 跳过发布（不生成机械摘要） |
| DeepSeek 返回 401/403/404 | 跳过发布，日志带上游错误 |
| 没有 / 只配了部分 B 站凭据 | 跳过发布 |
| B 站登录态失效（`-101`/`-111`） | 跳过发布 |
| 找不到浏览器、Node 缺 WebSocket | 跳过发布 |
| DeepSeek 5xx / 网络超时 | 回退规则摘要，继续发布 |

需要把配置问题当失败时加 `--strict`。

## 运行期故障

- 配置问题见上一节：跳过发布并留痕。
- 接口临时故障（DeepSeek 5xx、B 站 5xx）：步骤失败，但 `publish.yml` 里该步骤是 `continue-on-error: true`，不会阻塞 release。
- 图片渲染失败：检查 `CHROME_PATH`，或在本机打开 `.tmp/bili-dynamic/<tag>.html` 查看排版。
