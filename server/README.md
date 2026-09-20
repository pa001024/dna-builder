# DNA-Builder 服务端

本项目为 DNA-Builder 的后端服务，提供 GraphQL API 与 WebSocket 支持。

## 快速开始

1. 克隆仓库
2. 安装 Bun：[Bun 安装指南](https://bun.sh/docs/installation)
3. 安装依赖：`bun install`
4. 配置环境变量：
    - 创建 `.env` 文件
    - 添加 `API_TOKEN=your_secret_token`
5. 启动开发服务器：`bun dev`
6. 访问 GraphQL Playground：[http://localhost:8887/graphql](http://localhost:8887/graphql)

## 主要功能

- GraphQL API（`/graphql`）与 WebSocket 订阅
- MOD 接口（`/api/mods`）
- AI 中转（`/api/v1/chat/completions`）：OpenAI 兼容，按登录账号计费，每人每天 0.5 元
- AI 调用日志（`/api/v1/ai/logs`）：记录每次请求的元数据与完整对话，管理员可检索

## AI 调用日志

每次 `/api/v1/chat/completions` 调用都会落两份 JSONL 记录，按**北京自然日**归档到 `data/ai-logs`：

```
data/ai-logs/
├── index/<YYYY-MM-DD>.jsonl              # 一行一次请求：时间戳、客户端（账号/IP/UA）、模型、
│                                         # tokens、费用、耗时、TTFT、状态码、错误、请求摘要
└── sessions/<会话 id>/<YYYY-MM-DD>.jsonl # 一行一轮对话：完整请求 messages + 助手回复（含思维链与工具调用）
```

会话归并由服务端推导：取「登录账号 + 会话首条 user 消息」的哈希作为指纹（`fp-` 前缀）。上游是无状态的，
**不返回任何会话级标识**，因此不存在「用官方会话 id 归并」这条路；客户端每轮回传完整历史，首条 user 消息
就是稳定锚点，多轮请求会自动归到同一个会话。

每条记录另外保存上游返回的两个**请求级**标识，用于跟 DeepSeek 官方对账与排查：`upstreamTraceId`
（响应头 `x-ds-trace-id`，找官方排查时要的就是这个值）与 `upstreamCompletionId`（响应体 `id`）。
两者每次请求都会变（补全 id 连同一请求重发也不同），**不能**拿来分会话。

拒绝的请求（未登录、额度不足）与失败的请求同样记录，便于审计与排查。

写入走异步串行队列，不阻塞代理转发；上游 SSE 流原样透传，字节不做任何改写。

检索接口（均需管理员账号）：

| 接口 | 说明 |
| --- | --- |
| `GET /api/v1/ai/logs?from=&to=&sessionId=&ok=&status=&limit=` | 按时间段 / 会话 / 状态检索请求元数据（返回时间倒序） |
| `GET /api/v1/ai/logs/sessions` | 列出有日志的会话 |
| `GET /api/v1/ai/logs/sessions/:sessionId?from=&to=` | 取某个会话的完整轮次（按时间正序，可回放整段对话） |
| `GET /api/v1/ai/logs/stats` | 日志目录、覆盖日期范围与会话数 |
| `DELETE /api/v1/ai/logs?before=<YYYY-MM-DD>` | 清理指定日期之前的日志 |

前端管理页：后台管理 →「AI 调用日志」（`/admin/ai-log`），支持筛选、会话回放与一键复制上游 trace id。

相关环境变量见 `.env.example`：`AI_LOG_ENABLED`、`AI_LOG_DIR`、`AI_LOG_MAX_CONTENT_CHARS`、
`AI_LOG_RETENTION_DAYS`。

## 脚本

- `bun sv` 生产环境启动
- `bun dev` 开发热重载

## 许可证

MIT
