# bug-sync（GitHub Bridge）

BUG 库的 GitHub 出站 / 入站桥。独立进程、独立 GitHub App、独立 `BUG_SYNC_*` 配置，通过
server `/internal/bug-pipeline` REST 读写 outbox / inbox，**不 import** `dob-bot` 的
`runner.ts` / `codex.ts` / `scheduler.ts` / `planner.ts` / `openai-responses.ts` / `state/`。

契约见 `specs/game-bug-intake.md` §15–§17、§18.3、§23。

## 运行

```bash
cd apps/dob-bot
bun install                       # dob-bot 不在 pnpm workspace，独立 bun.lock
bun src/bug-sync/index.ts once    # 处理一轮 queued outbox 后退出
bun src/bug-sync/index.ts loop    # outbox 轮询 + 活跃映射对账 + 每日全量对账
bun src/bug-sync/index.ts webhook # 启动 Webhook 接收端（常驻）
bun test src/bug-sync/            # 单测（全 mock，不触真实 GitHub）
```

## 配置（`BUG_SYNC_*`）

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `BUG_SYNC_APP_ID` | ✅ | — | Bug Bridge GitHub App id（与代码执行 bot 分开） |
| `BUG_SYNC_PRIVATE_KEY_PEM` / `BUG_SYNC_PRIVATE_KEY_PATH` | ✅ | — | App 私钥；明文里的 `\n` 会被还原 |
| `BUG_SYNC_INSTALLATION_ID` | — | 自动探测 | 不填时按 `/repos/{owner}/{repo}/installation` 定位 |
| `BUG_SYNC_WEBHOOK_SECRET` | ✅ | — | Webhook secret（`X-Hub-Signature-256`） |
| `BUG_SYNC_REPO_ALLOWLIST` | ✅\* | — | `owner/repo` 或 `owner/repo@repositoryId`，逗号分隔；出站仓库坐标来源 |
| `GITHUB_BUG_REPOSITORY_ID`（兼容 `GITHUB_BUG_REPOSITORY`） | ✅\* | — | 允许的 repositoryId，与 server 同口径 |
| `BUG_SYNC_SERVER_ENDPOINT` | — | `http://localhost:8887` | server 地址 |
| `BUG_SYNC_WORKER_TOKEN` | ✅ | — | 对应 server `BUG_WORKER_TOKEN` |
| `BUG_SYNC_WORKER_ID` | — | `bug-sync-bridge` | 写进 drift 事件的 worker 身份 |
| `BUG_SYNC_OUTBOX_POLL_MS` | — | `15000` | outbox 轮询间隔 |
| `BUG_SYNC_RECONCILE_MS` | — | `900000` | 活跃映射对账间隔 |
| `BUG_SYNC_FULL_SCAN_MS` | — | `86400000` | 全量对账间隔 |
| `BUG_SYNC_WEBHOOK_PORT` / `_HOST` / `_PATH` | — | `8788` / `0.0.0.0` / `/bug-sync/webhook` | 接收端监听 |
| `BUG_SYNC_REQUEST_TIMEOUT_MS` | — | `30000` | 单请求超时 |
| `BUG_SYNC_MAX_RETRY_DELAY_MS` | — | `120000` | 超过该限流等待就落 `retry_wait`，不阻塞进程 |
| `BUG_SYNC_MAX_ATTEMPTS` | — | `8` | 可重试错误的最大尝试次数 |
| `GITHUB_API_VERSION` | — | `2022-11-28` | `X-GitHub-Api-Version` |

\* 两者至少配置一个；两边都空时 fail-closed（不接收、不出站）。

## 出站（outbox）

`outbox/read` → 按 operation 执行 → `outbox/complete`（结果放进 `result`，server 按
`result.state` / `retryAt` / `issue` / `comment` 更新 outbox 与映射表）。

| operation | GitHub 动作 | 关键口径 |
|---|---|---|
| `create_issue` | `POST /repos/{o}/{r}/issues` | 优先用 payload 的 `title`/`body`/`labels`，缺省按 `issue-template.ts` 从 Bug 行渲染；创建后 GET 核验标签实际应用 |
| `create_comment` / `comment` | `POST .../issues/{n}/comments` | 必须有 `discussionEntryId` 与 Issue 映射，否则不产生孤儿评论 |
| `edit_comment` | `PATCH .../issues/comments/{id}` | 带 `expectedRemoteHash` 时先 GET 比对，被人工改写进 `conflict`，不覆盖 |
| `delete_comment` | `DELETE .../issues/comments/{id}` | 404 视为已完成 |
| `close_issue` / `reopen_issue` | `PATCH .../issues/{n}` | 响应状态核验；`stateReason` 仅接受 completed/not_planned/duplicate |
| `label_add` / `label_remove` | `POST`/`DELETE .../issues/{n}/labels[/{name}]` | server 把 label 名放在 `targetMapping`；只动受管名称，绝不全量 `PATCH labels` |
| `update_labels` | 逐条增删 | `add`/`remove` 显式给出，逐条 API 后再 GET 核验 |

失败分类（spec §17.2）：

- `429` / `403 secondary`：尊重 `Retry-After` / `X-RateLimit-Reset`；超出 `MAX_RETRY_DELAY_MS` 或重试耗尽 → `retry_wait`
- 非幂等写入（issue / comment create）超时、5xx、网络错误 → `unknown_effect`，**不自动重发**，等对账
- 401 刷新一次 installation token 后仍失败、403 权限、404/422 → `blocked`
- Issue 映射尚未建立（create_issue 仍在队列）→ `retry_wait`，有界退避

## 入站（webhook）

原始字节验签（HMAC-SHA256 + 恒定时间比较，签名格式严格校验）→ repository allowlist →
`inbox/write` 持久化成功才回 2xx。server 不可达回 `503`，不假 ACK；重复 `deliveryId`
由 server 去重并回 `duplicate: true`。非 allowlist 仓库回 `200 accepted:false`。
`ping` 直接回 pong；未订阅事件确认后忽略。正文超过 1MB → `413`。

## 对账

`sync/active-mappings` → 逐个 GET Issue：状态、受管 label 集合（`expectedLabels` 在、多余受管
`managedLabels` 在内才算漂移）、评论缺失 / 被改写（完整分页，>100 条也覆盖）→
`sync/report-drift`（带 `workerId`）。Bridge 对 GitHub 只读，纠正由 server 领域层执行。

## 已知契约缺口

- server 的 `outbox/read` 目前不透出讨论条目正文与 `discussionEntryId`，评论类出站要等
  server 补投影后才能跑通；`sync/active-mappings` 也未透出 `expectedLabels` / `managedLabels`
  / 评论链接，因此 label / 评论对账在 server 补字段前会跳过（状态与 Issue 存在性仍生效）。
- `issue-template.ts` 是 `apps/server/src/bugs/github.ts` 模板的镜像实现（Bridge 不能 import
  server 代码）；修改模板需同步两处。
