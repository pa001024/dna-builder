# T3 Code Agent 控制面（MCP / WebSocket RPC / CLI）

> 本文是底层协议手册。完整的角色分工、文档产物与交付流程见 [`../SKILL.md`](../SKILL.md)。

T3 Code 把「一个 agent 会话」建模为 **thread**。本文记录如何用另一个 agent（或脚本）创建并控制一个
**独立的顶层 thread**（不是 subagent、不是 delegated task），以及三个可用控制面的协议细节。

实测环境：T3 Code `0.1.5`，桌面端，server `http://127.0.0.1:3773`（端口来自
`~/.t3/userdata/server-runtime.json`），Windows。

## 0. 结论先行

| 控制面 | 入口 | 适合 | 能力上限 |
|---|---|---|---|
| **MCP（推荐）** | `POST /mcp`，Streamable HTTP JSON-RPC | 在 T3 thread 内运行的 agent；外部 MCP 客户端 | 最全：launch/send/read/wait/configure/interrupt/attachments/pending_request |
| **WebSocket RPC** | `GET /ws?orchestrationProtocol=2` | 自己写客户端、需要 `orchestration.subscribeThread` 流 | 与 T3 桌面 UI 同层，偏底层 |
| **CLI** | `t3 thread ...` | 任意 shell / 外部 agent，最省事 | launch/send/show/list；无 scratch、无 activity 视图、无 pending_request |
| **HTTP 只读 API** | `/api/orchestration/...`、`/api/projects` | 只读巡检、拉 transcript | 只读 |

**独立会话 vs subagent**：`t3_thread_launch` 创建的是顶层 thread（`parentThreadId: null`，UI 里单独一条）；
`delegate_task` / Agent 工具创建的是挂在调用方下面的 subagent/child task，会随父会话的生命周期和权限走。
用户说「不要 subagent」时只能走前者。

## 1. MCP 控制面（首选）

### 1.1 端点与鉴权

- 端点：`http://<host>:<port>/mcp`
- 传输：MCP Streamable HTTP。`POST` 一条 JSON-RPC 2.0 消息；`Accept` 必须同时包含
  `application/json` 和 `text/event-stream`；响应可能是 JSON，也可能是 SSE。
- 鉴权：`Authorization: Bearer <MCP client session token>`。
- 会话：`initialize` 响应头带 `mcp-session-id`，后续请求都带上；协议版本 `2025-06-18`。
- 结束：`DELETE /mcp`。

握手顺序（与 `AcpMcpStdioBridge` / `t3 thread` 内部实现一致）。下面只列 JSON body，
实际请求都要带 `Authorization: Bearer <token>`、`Content-Type: application/json`、
`Accept: application/json, text/event-stream`；第 2、3 步还要带 `initialize` 响应头返回的
`Mcp-Session-Id` 和协议版本头 `MCP-Protocol-Version: 2025-06-18`（缺少这些头会被有状态的
Streamable HTTP 服务端拒绝）。

```jsonc
// 1. POST /mcp
{"jsonrpc":"2.0","id":"1","method":"initialize","params":{
  "protocolVersion":"2025-06-18","capabilities":{},
  "clientInfo":{"name":"my-agent","version":"0.0.0"}}}
// 2. POST /mcp（无 id）
{"jsonrpc":"2.0","method":"notifications/initialized"}
// 3. 调用任意工具
{"jsonrpc":"2.0","id":"2","method":"tools/call",
 "params":{"name":"t3_thread_launch","arguments":{...}}}
```

### 1.2 Token 从哪来

`/mcp` 只接受 **MCP client session**：`subject === "mcp-client"` 且
`method === "bearer-access-token"`。默认 TTL 30 天。三条来源：

1. **`t3 thread` CLI 内部**：每次命令临时签发（`access: "full-access"`，label `t3 thread cli`，
   `client.deviceType: "bot"`），命令结束即 revoke。这是外部脚本拿到 **full-access** 最省事的方式。
2. **MCP OAuth**：`GET /.well-known/oauth-protected-resource` → `/oauth/mcp/register` →
   `/oauth/mcp/authorize` 打开浏览器，输入 `t3 auth pairing create` 生成的 pairing code 批准，
   再 `/oauth/mcp/token` 用 PKCE 换 token。批准时可选 `read-only` / `approval-required` /
   `auto-accept-edits` / `auto` / `full-access`；只有 `full-access` 额外带 settings/source-control 写权限。
3. **本机直签（偏 hack）**：
   ```bash
   t3 auth session issue --subject mcp-client --scope orchestration:read \
     --scope orchestration:operate --ttl 5m --token-only
   ```
   可行，但没有 `runtimeModeCeiling`，`/mcp` 会把该客户端的权限上限算成
   **`approval-required`**。能读、能启动 thread，但子 thread 默认会在需要权限时停下来等人。
   **不适合无人值守的 full-access 自动化**。

### 1.3 Thread 工具面

`tools/list` 返回 66 个工具，其中 31 个 `t3_*`。控制独立会话只需要这几个：

| 工具 | 作用 | 关键参数 |
|---|---|---|
| `t3_thread_launch` | 新建顶层 thread | `projectId` 或 `scratch:true`、`title`、`message`、`modelSelection`、`runtimeMode`、`interactionMode`、`workspaceStrategy`、`clientRequestId` |
| `t3_thread_send` | 给 thread 发消息 | `threadId`、`message`、`mode: auto\|queue\|steer\|restart` |
| `t3_thread_wait` | 等某次 run 结束 | `threadId`、`runId`、`timeoutMs`、`untilDelegatedWorkSettled` |
| `t3_thread_read` | 读会话 | `view: messages\|activity`、`limit`、`maxCharsPerItem`、`afterPosition`、`itemId`+`textOffset` |
| `t3_thread_list` | 列 thread | `projectId` / `allProjects`、`statuses`、`includeSubagents`、`cursor` |
| `t3_thread_configure` | 读/改 provider、model、options | `modelSelection` |
| `t3_thread_interrupt` | 打断顶层 thread 当前 turn | `threadId`、`runId` |
| `t3_thread_organize` | pin/snooze/settle/archive/unread | `action` |
| `t3_pending_request` | 处理待人工回答的问题 | `action: list\|read\|respond` |
| `create_threads` | 批量建顶层 thread | `threads[]`（1–20 个） |

`t3_thread_launch` 返回：

```jsonc
{
  "threadId": "mcp:<uuid>",
  "link": "<t3-thread://v2/<environmentId>/mcp:<uuid>>", // 线程内调用
  "projectId": "...",
  "modelSelection": { "instanceId": "magpie", "model": "auto/deepseek-v4.1-flash[1m]", "options": [...] },
  "runId": "run:thread:...:ordinal:1", // 无 message 时为 null
  "status": "preparing"
}
```

### 1.4 权限上限（重要）

- 每个 thread 有 `runtimeMode` 和 `interactionMode`。子 thread **不能比调用方更宽**：
  调用方 `full-access` 才能创建 `full-access` 子会话；否则返回
  `runtime_mode_escalation_denied` / `interaction_mode_escalation_denied`。
- 在 T3 thread 内调用时，默认继承调用方的模式、provider、model、project。
- 外部 MCP client 调用时没有调用方 thread，必须传 `projectId`（或 `scratch:true`）；
  模型缺省用项目默认值，项目没有默认模型时必须传 `modelSelection`。
- 外部 client 的权限上限由 token 的 `runtimeModeCeiling` 决定（见 1.2）。

### 1.5 后端 / 模型选择

`modelSelection` 的形状：

```jsonc
{ "instanceId": "<providerInstanceId>", "model": "<model id>",
  "options": [{ "id": "effort", "value": "high" }] }
```

- **`instanceId` 是 `providerInstanceId`，不是 `driverKind`**。`driverKind` 只表示底层驱动
  （`claudeAgent` / `pi` / `codex` …）；同一个 driver 可以有多个 provider instance
  （本机的 `claudeAgent` 和 `magpie` 都是 `driverKind: "claudeAgent"`），它们的模型目录和
  计费/路由不同。
- 模型 ID 是 provider 专属的，不能混用。用 `orchestrator_capabilities`（MCP）拿准确值；
  它支持 `search` 过滤，`omittedModels` 表示还有未列出的模型。
- `options` 可以传数组，也可以传对象简写（`{ "effort": "high" }`）；值必须来自该模型
  `options[].values`。
- 不传 `modelSelection`：在 T3 thread 内继承调用方；外部 client 用项目默认值，项目没有默认
  模型时 `t3_thread_launch` 会报 `invalid_request`。
- 批量创建用 `create_threads`：它的 `target` 字段是 `providerInstanceId` / `driverKind` /
  `model` / `options`，不是 `modelSelection`；`runtimeMode` / `interactionMode` 接受 `"inherit"`。

本机（T3 Code 0.1.5）可用后端示例：

| 后端 | `providerInstanceId` | 模型示例 | 常用 options |
|---|---|---|---|
| Claude Code（直连） | `claudeAgent` | `claude-opus-5-5`、`claude-sonnet-5-5`、`claude-fable-5-1`、`claude-haiku-5-5` | `effort`: low/medium/high/xhigh/max/ultracode/ultrathink；`fastMode`: bool |
| Pi | `pi` | `default`、`magpie/auto/claude-sonnet-5-5`、`magpie/auto/claude-opus-5-5`、`magpie/auto/deepseek-v4.1-flash`、`magpie/auto/gpt-6-astra` | magpie 模型用 `thinking`: high/max 等 |
| Magpie（路由） | `magpie` | `claude-opus-5-5`、`claude-sonnet-5-5`、`auto/claude-sonnet-5-5[1m]`、`auto/deepseek-v4.1-flash[1m]`、`auto/gpt-6-astra` | `effort` + `thinking`（依模型而定） |
| Codex | `codex` / `magpie-codex` | 当前未安装可执行文件 | — |

MCP 创建：

```jsonc
t3_thread_launch {
  "projectId": "...",
  "title": "用 Pi 跑",
  "message": "...",
  "modelSelection": {
    "instanceId": "pi",
    "model": "magpie/auto/claude-sonnet-5-5",
    "options": [{ "id": "thinking", "value": "high" }]
  }
}
```

CLI 创建（`--provider` 与 `--model` 必须成对，且不支持 options）：

```bash
t3 thread start . "..." --provider claudeAgent --model claude-sonnet-5-5 --json --wait
t3 thread start . "..." --provider pi --model magpie/auto/claude-sonnet-5-5 --json --wait
t3 thread start . "..." --provider magpie --model 'auto/claude-sonnet-5-5[1m]' --json --wait
```

换已有会话的后端/模型（MCP）：

```jsonc
t3_thread_configure {
  "threadId": "mcp:...",
  "modelSelection": { "instanceId": "claudeAgent", "model": "claude-opus-5-5",
                      "options": [{ "id": "effort", "value": "max" }] }
}
```

- 同一个 `instanceId` → `thread.model-selection.set`；换 `instanceId` → `provider.switch`
  （会做 provider 间的上下文 handoff）。返回 `{ sequence }`。
- 对后续 turn 生效；正在跑的 turn 不会被改道。建议 idle 时切换。
- 只读当前配置：`t3_thread_configure { threadId }` → `{ modelSelection, runtimeMode, interactionMode }`。

## 2. WebSocket RPC 控制面

T3 桌面/Web 客户端走这一层。适合需要订阅流（`orchestration.subscribeThread`）或复用 UI 同款方法的场景。

### 2.1 连接

1. `POST /api/auth/websocket-ticket`，`Authorization: Bearer <普通 session token>`，body `{}` →
   `{ "ticket": "...", "expiresAt": "..." }`。
2. WebSocket：
   ```
   ws://127.0.0.1:3773/ws?orchestrationProtocol=2&wsTicket=<ticket>
   ```
   注意 query 参数是 **`wsTicket`**，不是 `ticket`；缺少 `orchestrationProtocol=2` 会返回 426。
3. 也可以直接在 upgrade 请求带 `Authorization`，不换 ticket。

普通 session token 用 `t3 auth session issue --ttl 5m --token-only` 即可（subject
`cli-issued-session`，可用 `/ws`，但会被 `/mcp` 拒绝）。

### 2.2 消息格式

Effect RPC 的 JSON 序列化，一条 WebSocket 消息就是一个 JSON 对象：

```jsonc
// 请求
{"_tag":"Request","id":"probe-1","tag":"orchestration.getThreadProjection",
 "payload":{"threadId":"..."},"headers":[]}
// 成功响应
{"_tag":"Exit","requestId":"probe-1",
 "exit":{"_tag":"Success","value":{...}}}
// 流式响应：中间是 Chunk，最后是 Exit
{"_tag":"Chunk","requestId":"...","values":[...]}
```

常用方法：

| 方法 | 作用 |
|---|---|
| `orchestration.launchThread` | 新建 thread（payload：`commandId`、`projectId`、`title`、`modelSelection`、`runtimeMode`、`interactionMode`、`workspaceStrategy`、`initialMessage`） |
| `orchestration.subscribeThread` | 订阅单 thread 事件流 |
| `orchestration.subscribeShell` | 订阅全局 thread 列表快照 + 增量 |
| `orchestration.dispatchCommand` | 发送通用 orchestration 命令 |
| `orchestration.getThreadProjection` | 读 thread 投影 |
| `orchestration.getThreadFamily` | root + forks + subagent 树 |
| `orchestration.searchThreads` | 搜索 thread |

写操作需要 `orchestration:operate` scope。`t3 auth session issue` 的默认 scope 已包含。

## 3. CLI 控制面（最容易脚本化）

T3 安装器会写一个 wrapper：

- Windows：`%USERPROFILE%\.t3\bin\t3.cmd`
- macOS/Linux：`~/.t3/bin/t3`

它本质是 `ELECTRON_RUN_AS_NODE=1 <T3 Code exe> .../server.asar/apps/server/dist/bin.mjs`。
**不保证在 PATH 里**（本机就没有），技能里应显式解析路径。

### 3.1 命令

```bash
# 列 thread（默认当前目录对应的项目）
t3 thread list --json
t3 thread list --project . --json

# 新建独立会话；--json 输出 {threadId, projectId, runId}
t3 thread start . "任务说明" --json

# 新建并等到跑完；stdout 输出 {threadId, runId, status, reply, error}
t3 thread start . "任务说明" --json --wait

# 指定 provider/model（必须成对）；在 worktree 里跑。单行写法在 PowerShell / Git Bash 通用
t3 thread start . "任务说明" --provider magpie --model auto/deepseek-v4.1-flash[1m] --worktree master --branch probe/agent-1 --json

# 给已有 thread 发消息；busy 时排队，不打断
t3 thread send <threadId> "继续，补充要求..." --json
t3 thread send <threadId> - --wait --json   # 从 stdin 读长消息

# 读状态与最近消息
t3 thread show <threadId> --messages 20 --json
```

### 3.2 退出码与输出

- `--wait`：run 失败退出 1；thread 停下来等人回答退出 2；成功退出 0。
- `--json` 时即使失败也会把 `{threadId, runId, status, reply, error}` 打到 stdout，脚本仍能拿到 id。
- 文本模式下 thread id 打到 stderr，回复打到 stdout。
- `t3 thread start` 内部就是：签发临时 full-access MCP client session → 调
  `t3_thread_launch` → 可选 `t3_thread_wait` + `t3_thread_read` → revoke。
- 注意区分 **client ceiling** 与 **thread runtime mode**：`full-access` 只是这个临时 MCP
  client 的权限上限，表示「最多能创建 full-access 子会话」，并不代表新建 thread 实际运行在
  `full-access`。`t3_thread_launch` 不传 `runtimeMode` 时仍按项目默认值/继承解析；项目默认若是
  `approval-required`，子会话到需要权限时仍会停下来等人。

## 4. 只读 HTTP API

Bearer 鉴权，适合巡检、拉 transcript，不启动 WS：

```bash
curl -H "Authorization: Bearer $TOKEN" \
     -H "x-t3-orchestration-protocol: 2" \
     http://127.0.0.1:3773/api/orchestration/threads/<threadId>
```

- `GET /api/orchestration/threads/:threadId`：thread 快照
- `GET /api/orchestration/threads/:threadId/transcript`：完整 transcript
- `GET /api/orchestration/threads/:threadId/history?cursor=...`：分页历史
- `GET /api/orchestration/shell`：全部 thread 的 shell 快照
- `GET /api/projects`：项目列表

## 5. 一次完整的「独立会话」生命周期

以 MCP 工具为例（在 T3 thread 内）：

```text
1. 解析项目        t3_project_list → projectId
2. 解析模型        orchestrator_capabilities → providerInstanceId/model/options
3. 创建独立会话    t3_thread_launch {projectId, title, message, modelSelection, clientRequestId}
4. 等它跑完        t3_thread_wait {threadId, runId, timeoutMs: 600000}
5. 读结果          t3_thread_read {threadId, view:"messages", limit: 20, maxCharsPerItem: 4000}
6. 有待回答的问题  t3_thread_read 看 pendingRequestCount → t3_pending_request list/read/respond
7. 追加要求        t3_thread_send {threadId, message, mode:"queue"|"steer"}
8. 打断/归档       t3_thread_interrupt / t3_thread_organize {action:"archive"}
```

命令行版本：

```bash
t3 thread start . "任务说明" --json --wait
t3 thread show <threadId> --messages 20 --json
t3 thread send <threadId> "追加要求" --json --wait
```

## 6. 坑与约束

- **不要用 `delegate_task` 冒充独立会话**。它是 subagent，挂在调用方下面；独立会话必须
  `t3_thread_launch` / `create_threads` / `t3 thread start`。
- **不要 sleep 轮询**。用 `t3_thread_wait`（一次给足 timeout，如 10 分钟）；超时返回
  `timedOut:true` 再读一次或继续等，不要写 `while true; sleep 5`。
- **`t3_thread_wait` 只等目标 run**。要等它派生的后台任务，传
  `untilDelegatedWorkSettled:true`；否则 run 结束不等于后台任务结束。
- **`t3_thread_read` 有截断**。长文本会带 `textTruncated:true` / `nextTextOffset`；
  继续读时传同一个 `itemId` + `textOffset`，不要只调大 `limit`。
- **child 的权限不能超过 caller**。controller 在 `approval-required` 时，子会话也只能
  `approval-required`；想要无人值守，controller 自己必须 `full-access`，或走 `t3 thread` CLI
  （它用 full-access client session）。
- **外部 MCP token 的 ceiling**：`t3 auth session issue --subject mcp-client` 默认
  `approval-required`；需要 full-access 时用 `t3 thread` CLI，或走 MCP OAuth 让用户批准
  full-access。
- **重试要带 `clientRequestId`**：相同 key 的 `t3_thread_launch` 是幂等的；丢了响应不要新建
  第二个会话，用同一个 key 重试。
- **`scratch:true` 不能与 `projectId`/`workspaceStrategy` 同用**。scratch 会建在
  `~/.t3/scratch/<date>-<slug>-<id>` 下，并自动注册一个 Scratch 项目。
- **Windows 多行消息**用 `t3 thread send <id> -` 从 stdin 读，避免 cmd.exe 引号问题。
- **归档不是删除**：`t3_thread_organize {action:"archive"}` 只是从默认列表隐藏；thread 仍可读。
  MCP 工具面没有 thread delete，删除要在 T3 的 UI 里做。
- **`t3_thread_launch` 没有 `"inherit"` 值**：`runtimeMode` / `interactionMode` 省略即继承；
  显式传必须是具体模式。`create_threads` 的对应字段才接受 `"inherit"`。

## 7. 参考实现位置（T3 Code 0.1.5 安装包）

- MCP 客户端握手：`server.asar/apps/server/dist/AcpMcpStdioBridge-*.mjs` 的 `mcpToolSession`
- CLI `t3 thread`：`binCli-*.mjs` 的 `withThreadTools` / `threadStartCommand`
- MCP 路由：`addMcpHttpRoutes`（Streamable HTTP，`/mcp`）
- WS RPC：`GET /ws`（`layerJson` + `makeProtocolWithHttpEffectWebsocket`）
- Thread 工具实现：`ProjectToolkit` / `startsThreads` / `clientModeCeiling`
