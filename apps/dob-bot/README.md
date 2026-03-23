# dob-bot

一个基于 GitHub App 的自动化机器人：轮询扫描 Issue / Review，识别 `@dob-bot` 自然语言指令，先经过 Responses API 调度层，再由本地 Codex 执行层在 worktree 里直接改代码、提交、推送并创建 PR。

## 本地运行

先进入子目录安装依赖：

```bash
cd apps/dob-bot
bun install
```

准备环境变量：

- `DOB_BOT_APP_ID=?`
- `DOB_BOT_PRIVATE_KEY_PATH=path_to_your.private-key.pem`
- `DOB_BOT_OWNER=<owner>`
- `DOB_BOT_REPO=<repo>`
- `DOB_BOT_LLM_BASE_URL=http://localhost:23000/v1`
- `DOB_BOT_LLM_API_KEY=<key>`
- `DOB_BOT_WEBHOOK_SECRET=<github webhook secret>`

可选：

- `DOB_BOT_INSTALLATION_ID=<id>`: 不填则会尝试自动探测（慢一些）
- `DOB_BOT_LABEL=dob-bot`: 用于筛选 issue label
- `DOB_BOT_INTERVAL_MS=600000`: loop 模式轮询间隔，默认 10 分钟
- `DOB_BOT_DRY_RUN=1`: 只输出计划，不创建分支/PR/评论
- `DOB_BOT_SCHEDULER_MODEL=gpt-5.4-mini`
- `DOB_BOT_CODEX_MODEL=gpt-5.4`
- `DOB_BOT_WEBHOOK_PORT=8787`
- `DOB_BOT_WEBHOOK_HOST=0.0.0.0`
- `DOB_BOT_WEBHOOK_PATH=/github/webhook`
- `DOB_BOT_FRPC_TOKEN=<natfrp token>`
- `DOB_BOT_FRPC_TUNNEL_IDS=<隧道ID列表>`

执行：

```bash
bun apps/dob-bot/src/cli.ts once
bun apps/dob-bot/src/cli.ts loop
bun apps/dob-bot/src/cli.ts serve
pnpm dob-bot:once
pnpm dob-bot:loop
```

## 触发格式

在 issue body 或评论中直接写：

```text
@dob-bot 把这个页面的按钮文案改短一点，并把相关测试补上
```

bot 会把 `@dob-bot` 后面的自然语言交给 Responses API 调度层，再由 Codex 执行层在本地 worktree 里直接改代码并推送分支。

PR review 里如果带 `@dob-bot`，并且状态是 `CHANGES_REQUESTED`，bot 会在同一分支上继续提交修复。

## Webhook

启动 webhook：

```bash
bun apps/dob-bot/src/cli.ts serve
```

GitHub App 的 webhook URL 填：

```text
https://<你的公网域名或 natfrp 地址>/github/webhook
```

需要订阅的事件：

- `issues`
- `issue_comment`
- `pull_request_review`

## frpc

`apps/dob-bot/src/frpc-compose.ts` 会生成 frpc 的 compose 配置，采用 natfrp 官方文档推荐的 `-f <访问密钥>:<隧道ID>` 启动方式。
compose 只跑 frpc，webhook 服务在宿主机用 `bun ./src/cli.ts serve` 启动，容器访问宿主机使用 `host.docker.internal`。
