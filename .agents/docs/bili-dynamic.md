# B 站动态与 Release 正文自动生成

发布 `v*` tag 时，`publish.yml` 在 release 资产上传完成后调用 `tools/bili-dynamic/index.ts`：

1. 收集上一版本 tag 到当前 tag 的提交与 `git diff --stat`，用于规则兜底；
2. 启动**发布编辑 agent**（见下节）：它能读整个仓库，自己调研改动，一次产出三样东西：
   - 1080px 整页 HTML（卡片）；
   - B 站动态正文；
   - GitHub Release 正文（markdown）；
3. 用本机 Chrome/Edge 的 CDP 量出真实页面高度后整页截图（2x）；
4. 调 B 站图文动态接口上传图片并发布；
5. agent 产出了 release markdown 时，工作流用 `gh release edit --notes-file` 覆盖 release 正文；
   没产出（配置缺失 / 生成失败 / `--no-ai`）则**保留原版正文**，不覆盖。

## Release 正文结构

无论 agent 是否成功，正文末尾都统一追加（`release-notes.ts`）：

- 下载入口（直接下载 + 差量更新说明）与网盘提示；
- `<details>` 折叠的**原始提交记录**（agent 成功时折叠，失败时原版标题 + 同一份折叠列表，不重复展示）；
- `**Full Changelog**` 对比链接。

agent 成功时开头是它写的 markdown（`##` 分组、列表、加粗），失败时开头是原版的
`## 本次更新内容 (上一版本 → 当前版本)`。

## 卡片生成 agent

`tools/bili-dynamic/agent/` 是一套与 `apps/web/src/api/agent` 同构的通用内核，不是一次性循环：

| 文件 | 职责 |
| --- | --- |
| `kernel.ts` | 主循环：工具声明全程在场、轮次预算、输出上限续写、上下文自适应压缩、并发调度、finish 重试 |
| `compact.ts` | 上下文压缩：绝对阈值触发，按助手轮切分，最近一轮原样保留，失败逐级多保留近轮重试 |
| `context.ts` | tokens 估算（CJK 权重 2、其余 1，除以 3）与按模型名解析上下文窗口 |
| `tool.ts` | 工具契约与并发分组（`concurrentSafe` 工具并行，串行工具是屏障） |
| `transport.ts` | Chat Completions 传输，归一化工具调用与 usage |
| `repo-tools.ts` | 只读工具：`list_dir` / `read_file` / `search_code` / `git` / `read_skill` |
| `skills.ts` | 读取 `.agents/skills/*/SKILL.md` 的 frontmatter，清单注入提示词 |
| `index.ts` | 装配层：工具 + 技能 + 提示词 + `finish`，并校验产出 |

关键行为：

- **不是固定模板**：页面结构由模型自己设计，代码只提供 `style.ts` 的设计参考（主题色、圆角、字体、间距）。
- **能读整个仓库**：除密钥、`node_modules`、`dist`、`target`、日志与数据库外，源码/文档/spec 都可读；`git` 只允许 `log/show/diff/status/ls-files/describe/rev-parse/tag`。
- **技能**：`.agents/skills/` 下的技能会被列进提示词，模型可用 `read_skill` 按需读取正文（例如 `db-style` 的设计规范）。
- **上下文管理**：每轮请求前估算 tokens，超过 `窗口 − 输出预留 − 安全缓冲` 就压缩历史；`deepseek-flash` 按 1M 窗口。
- **轮次与输出**：工具轮次上限 30，单轮输出上限 16000 tokens；触达上限自动续写，`finish` 的 JSON 被截断会要求模型精简后重发（最多 2 次）。
- **安全**：产出的 HTML 必须是完整文档、无 `<script>`、不引用外部图片/字体；正文不得含 HTML 标记；
  release markdown 不得带 `<details>` / `<summary>` / `<script>`（折叠区由脚本统一加）。

## Secrets / Variables

在仓库 **Settings → Secrets and variables → Actions** 配置：

| 名称 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | Secret | 建议 | DeepSeek API Key。缺失时跳过发布（不会静默降级成机械摘要） |
| `BILI_COOKIE` | Secret | 二选一 | 登录 B 站后的完整 Cookie，推荐；至少包含 `SESSDATA`、`bili_jct`、`buvid3` |
| `BILI_SESSDATA` | Secret | 二选一 | 单独配置时与 `BILI_JCT` 一起使用 |
| `BILI_JCT` | Secret | 二选一 | Cookie 中的 `bili_jct`（32 位十六进制） |
| `BILI_BUVID3` | Secret | 否 | 缺失时脚本会调 `finger/spi` 自动获取 |
| `BILI_DEDEUSERID` | Secret | 否 | Cookie 中的 `DedeUserID` |
| `DEEPSEEK_MODEL` | Variable | 否 | 默认 `deepseek-flash` |
| `DEEPSEEK_BASE_URL` | Variable | 否 | 默认 `https://api.deepseek.com` |
| `CHROME_PATH` | Variable | 否 | 仅在自托管 runner 且浏览器不在默认路径时需要；托管 runner 由 `Resolve Chrome` 步骤自动写入 |

`BILI_COOKIE` 的取法：浏览器登录 `bilibili.com` → DevTools → Network → 任意 `api.bilibili.com` 请求 → 复制请求头里的 `Cookie`。`SESSDATA` 会过期，失效后日志会报 `code=-101`，重新获取即可。

## 本地运行

```bash
# 只渲染卡片和正文，不发布（不需要任何密钥）；--tag 传当前分支名，版本号才取 package.json
node tools/bili-dynamic/index.ts --tag HEAD --dry-run

# 不用 DeepSeek agent，走规则模板
node tools/bili-dynamic/index.ts --tag HEAD --dry-run --no-ai

# 真正发布（PowerShell 示例）
$env:DEEPSEEK_API_KEY = "..."
$env:BILI_COOKIE = "SESSDATA=...; bili_jct=...; buvid3=..."
node tools/bili-dynamic/index.ts --tag v1.6.0 --previous v1.5.2
```

产物在 `.tmp/bili-dynamic/<tag>.{html,png,txt}`，`html` 可用于排查排版。临时目录已被 git 忽略。

`--tag HEAD` 时版本号取 `package.json`；正式发布时传 `v*` tag。仓库名默认取 `GITHUB_REPOSITORY`（本地回退到 `pa001024/dna-builder`），fork 上也能用。

`--previous`（或 `PREVIOUS_TAG`）会先校验：tag 必须存在且是当前 tag 的祖先，否则回退到自动查找，避免重跑旧 tag 时把别的版本提交算进来。`--title` 会覆盖卡片大标题；agent 生成的 HTML 无法改写标题，此时改用兜底模板渲染，保证截图与标题一致。

## 生成口径

- 卡片 HTML 由 agent 自己写，代码只做安全校验：必须是完整文档，且不含脚本、内联事件属性、`iframe`/`object`/`link`/`meta`/`base`、`@import`，也不引用 `github.com` / `dna-builder.cn` / `dobapp.cc` 之外的外部资源。
- 正文由脚本补齐 release 链接，并压到 1900 字以内（B 站上限 2000）。
- 生成失败分两类：Key / 地址 / 凭据配错属于**配置问题**，跳过发布并在 Step Summary 留一条警告；接口临时故障才回退到规则模板。`--no-ai` 可强制走规则模板。
- 规则模板（`card.ts` + `fallback.ts`）只是兜底：按提交类型分组、限制 4 组 9 条，保证任何情况下都有一张能看的卡片。
- 渲染默认使用 Chrome；找不到时用 Edge。Node.js 需要 23.6+（原生运行 `.ts`），CI 的 `lts/*` 满足要求。
- 浏览器不需要额外安装：GitHub 托管 Windows runner 镜像自带 Chrome 与 Edge（只是不在 `PATH` 里），
  工作流的 `Resolve Chrome for card rendering` 步骤会定位到默认安装路径并写进 `CHROME_PATH`；
  找不到时脚本仍会自行遍历常见路径与 `where` 查找。

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
