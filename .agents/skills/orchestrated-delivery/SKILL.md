---
name: orchestrated-delivery
description: 完整的多 agent 交付流程：主 agent 只读写文档、拆任务、调度，不读源码、不改代码、不跑测试；调研交给 subagent，具体实现交给独立 T3 顶层会话（不是 subagent），单 unit 的实现 + 自测 + 自审 + PR 交给 wt-review-pr 的编排模式。当用户明确要求这种编排（如「你负责调度，别自己写代码」「调研用 subagent，实现另开会话」「拆成几个会话并行」），或任务需要先调研 + 多文件改动 + 独立 worktree 实现时使用；一行修复/普通小改动不要用。
agent_created: true
---

# Agent 编排交付（主 agent 只做调度与文档）

## 0. 角色契约（硬性）

| 角色 | 谁 | 只做什么 | 绝对不做什么 |
|---|---|---|---|
| **主 agent（你）** | 当前会话 | 读写 Markdown 文档、拆任务、调度、向用户确认 | 读源码、编辑代码、跑构建/测试/lint/git、解冲突 |
| **调研 subagent** | `Agent(Explore)` | 只读调研代码/文档/网络，返回结论 + `path:line` | 改代码 |
| **实现会话** | T3 顶层 thread（`t3_thread_launch` / `t3 thread start`） | 在自己的 worktree/分支里改代码、跑命令、提交 | 创建新的顶层会话（除非主 agent 明确要求） |
| **审查 subagent** | `Agent(Explore)` | 读 diff、对照 spec 找问题 | 改代码 |
| **验证 subagent** | `Agent(general-purpose)` | 在 worktree 跑 lint/test/build，回报原始输出 | 改代码 |

### 主 agent 的违规信号

出现以下念头时停下来，改派角色：

- 「我先读一下这个文件」→ 派调研 subagent。
- 「我 grep / glob 一下源码」→ 派调研 subagent。
- 「这个改动很小我直接改」→ 开实现会话（小任务可以缩短流程，但不要自己改）。
- 「我跑一下测试确认」→ 派验证 subagent。
- 「我 `git diff` 看一下」→ 派审查 subagent。
- 「我修一下这个冲突」→ 开集成会话。

主 agent 的 `Bash` 只允许文档目录操作（`mkdir` / `ls` / `cat *.md`）；
任何代码、构建、测试、git 命令都交给 subagent。

**允许读的文档**：`AGENTS.md`、`README*`、`specs/`、`.agents/docs/`、`.tmp/<slug>/` 下的 Markdown。
**写操作范围**：`.tmp/<slug>/`、`specs/`、必要的 Markdown 文档；不要编辑源码、配置或脚本。

## 流程总览

```text
用户需求
  → BRIEF.md
  → 调研 subagent × N  →  RESEARCH.md
  → PLAN.md（用户确认）
  → 实现会话 × N（worktree/branch）  →  BOARD.md
  → 审查 subagent  →  REVIEW-<unit>.md
  → 验证 subagent  →  VERIFY-<unit>.md
  → 集成会话（合并/解冲突/PR）
  → FINAL.md
```

## 与 wt-review-pr 的分工

- **`wt-review-pr`** = 单个 unit 的执行工作流：实现 → 自测 → 自审 → commit/push/PR。
- **本技能** = 项目级编排：需求 → 调研 → 计划 → 拆 unit → 派发 → 独立审查/验证 → 集成。
- 主 agent **不直接执行 `wt-review-pr`**；它把该技能交给实现会话，并要求按「编排模式」执行。
- 实现会话的任务书必须写：`按 .agents/skills/wt-review-pr/SKILL.md 的「编排模式」执行`。
- 编排模式的覆盖（`wt-review-pr` 里有对应说明）：
  - 需求/规格以 `PLAN.md` + `TASKS/<unit>.md` 为准，跳过交互式需求确认。
  - worktree 已由 `t3_thread_launch` 创建，跳过 `git worktree add`。
  - 完成后**不清理 worktree**；由集成会话/主 agent 决定。
  - 有问题回报主 agent，不直接找用户。
- **PR 策略在任务书里明确**：
  - 单 unit / 单 PR：实现会话按 `wt-review-pr` 第 7 步开 PR。
  - 多 unit / 单 PR：实现会话只提交到分支，不开 PR；集成会话统一开。
  - 多 unit / 多 PR：每个实现会话开自己的 PR。
- **审查/验证双门**：
  - `wt-review-pr` 的自测/自审是第一道门。
  - 本技能的审查/验证 subagent 是第二道门；低风险 unit 可抽查，高风险/跨 unit 必做。

## 1. 产物（单一事实来源）

所有工作文档放**主 checkout** 的 `.tmp/<slug>/`（gitignored）；需要长期保留时再复制到 `specs/`。

> 实现会话如果在独立 worktree 里，未跟踪的 `.tmp` 不会被复制过去。交接时给**主 checkout 的绝对路径**
> （如 `E:/dev/dna-builder/.tmp/<slug>/PLAN.md`），不要用 worktree 相对路径。

```text
.tmp/<slug>/
├── BRIEF.md            需求、约束、验收、非目标
├── RESEARCH-BRIEF.md   给调研 subagent 的问题清单
├── RESEARCH.md         调研结论（主 agent 汇总）
├── PLAN.md             方案、任务拆分、接口、测试策略
├── BOARD.md            任务板（状态/线程/分支/产物）
├── TASKS/<unit>.md     每个实现会话的任务书
├── REVIEW-<unit>.md    审查结论
├── VERIFY-<unit>.md    验证记录
└── FINAL.md            最终交付报告
```

所有决策写进文档；每次交接给文档路径，不靠聊天上下文。

`BOARD.md` 任务板模板：

```markdown
| Unit | 目标 | 会话/链接 | 分支/worktree | 状态 | 产物 |
|---|---|---|---|---|---|
| u1 | ... | `t3-thread://...` | `<slug>/u1` | running | TASKS/u1.md |
```

状态：`planned` / `running` / `waiting` / `review` / `verify` / `done` / `blocked`。

## 2. 流程

### 阶段 0：Intake（主 agent）

1. 和用户确认：目标、验收标准、非目标、约束、优先级。
2. 写 `BRIEF.md`。
3. 判断是否适用本流程：一行修复 / 纯问答 → 不走编排，直接说明并结束。
4. **不要在这一步读源码。**

### 阶段 1：Research（subagent）

1. 写 `RESEARCH-BRIEF.md`：要回答的问题、范围、禁止事项、返回格式。
2. 用 `Agent(subagent_type:"Explore")` 并行派 1–3 个调研 subagent；问题彼此独立才并行。
3. 主 agent 只读它们返回的报告，汇总成 `RESEARCH.md`；**不读源码**。
4. 结论互相矛盾时，追加一个调研 subagent 裁决，不要自己翻代码。

调研 subagent 的返回格式：

```markdown
## 结论
## 关键位置
- path:line — 现状/行为
## 约束与坑
## 建议
## 未决问题
```

### 阶段 2：Plan（主 agent + 可选 plan review）

1. 写 `PLAN.md`：
   - 方案与取舍
   - 任务拆分（每个 unit 的目标、允许改的文件、依赖关系）
   - 接口/数据结构变化
   - 测试与验证命令
   - 风险与回滚
2. 可选：派一个只读 subagent 审 `PLAN.md`，返回漏洞和遗漏。
3. **用户确认点**：大改动/架构变化必须先让用户确认 `PLAN.md`。

### 阶段 3：Dispatch（主 agent → 独立会话）

对每个 unit：

1. 写 `TASKS/<unit>.md`（模板见第 3 节）。
2. 选择隔离与后端：
   - 多个 unit 并行 → 每个 unit 一个 worktree/branch。
   - 单个 unit → root 或 worktree 均可。
   - worktree 从 `baseRef` 创建，**未提交改动不会带过去**；需要基于当前工作区时用 root。
   - provider/model 按任务难度选；用 `orchestrator_capabilities` 查准确值。
3. 启动独立会话：
   - 有 T3 MCP 工具：`t3_thread_launch`（`projectId`/`scratch`、`title`、`message`、
     `modelSelection`、`workspaceStrategy`、`clientRequestId`）。
   - 只有 shell：`t3 thread start ...`。

```jsonc
t3_thread_launch {
  "projectId": "<projectId>",
  "title": "[<slug>] <unit>",
  "message": "Read <main-checkout>/.tmp/<slug>/PLAN.md and <main-checkout>/.tmp/<slug>/TASKS/<unit>.md first. Implement only this unit. Run the verification commands listed there. Report changed files, commands/results, and open questions. Do not touch files outside the unit, do not create new top-level sessions.",
  "modelSelection": { "instanceId": "claudeAgent", "model": "claude-sonnet-5-5" },
  "workspaceStrategy": { "type": "worktree", "baseRef": "master", "branch": "<slug>/<unit>" },
  "clientRequestId": "<slug>:<unit>"
}
```

4. 记录 `threadId`、`link`、`runId`、分支/ worktree 到 `BOARD.md`。
5. 不要在 prompt 里粘贴整份 plan；让子会话自己读 `PLAN.md` + `TASKS/<unit>.md`。

### 阶段 4：Monitor & steer（主 agent）

- `t3_thread_wait`：一次给足超时，**不要 sleep 轮询**。
- `t3_thread_read`：`view:"messages"` 或 `"activity"`，低 `limit`。
- `pendingRequestCount > 0` → `t3_pending_request` list/read/respond；产品决策问用户。
- 跑偏 → `t3_thread_send`（`mode:"steer"` 或 `"queue"`）。
- 更新 `BOARD.md` 状态。
- unit 失败：读错误 → 修任务书 → 重发/重开会话；**不要自己改代码**。

### 阶段 5：Review（subagent）

1. 实现会话报告完成后，派审查 subagent：给它 `PLAN.md`、`TASKS/<unit>.md`、diff 范围
   （`base...branch`）。
2. 审查 subagent 只读，返回：

```markdown
## Findings
- [P0/P1/P2] path:line — 问题 — 为什么 — 建议修法
## Spec 缺口
## 缺失测试
```

3. 主 agent 写 `REVIEW-<unit>.md`，把问题清单发给实现会话（`t3_thread_send`）或开修复会话。
4. 修复后重新审查（新的 subagent，不要复用旧结论）。

### 阶段 6：Verify（subagent）

1. 派验证 subagent 在目标 worktree 跑 `PLAN.md` 里的命令（lint/test/build）。
2. 返回命令、退出码、失败日志摘要；主 agent 写 `VERIFY-<unit>.md`。
3. 失败 → 发回实现会话；通过 → 进入集成。

### 阶段 7：Integrate / PR（集成会话）

- 多 worktree：开一个独立集成会话，给它分支列表和 `PLAN.md`，让它合并/解冲突/跑最终检查/开 PR；
  合并完成后由它清理已合并的 worktree。
- 单 worktree：可以让原实现会话提交并开 PR（在任务书里预先要求）。
- 主 agent 只记录 PR 链接和结果；**不执行 git**。

### 阶段 8：Final（主 agent）

1. 写 `FINAL.md`：改了什么、为什么、验证证据、风险、线程/PR 链接。
2. 归档已完成会话（`t3_thread_organize`）。
3. 需要长期保留的设计复制到 `specs/`。

## 3. 任务书模板（`TASKS/<unit>.md`）

````markdown
# Unit: <id> — <标题>

## 目标
<一句话>

## 必读
- <main-checkout>/.tmp/<slug>/PLAN.md
- <main-checkout>/.tmp/<slug>/TASKS/<unit>.md
（用绝对路径；worktree 里没有主 checkout 的未跟踪 .tmp）

## 执行方式
- 按 `.agents/skills/wt-review-pr/SKILL.md` 的「编排模式」执行。
- 需求/规格以本任务书 + PLAN.md 为准；worktree 已提供，跳过创建/清理。
- PR 策略：<本 unit 自己开 PR / 只提交到分支，由集成会话统一开 / 不开 PR>
- 不要直接问用户；问题写进最终报告。

## 允许修改
- <文件/目录>

## 禁止
- 不要改 <范围外文件>
- 不要创建新的顶层会话
- 不要 push / 开 PR（除非本任务明确要求）

## 验收
- [ ] ...
- [ ] ...

## 验证命令
```bash
...
```

## 交付
- 改了哪些文件
- 跑了哪些命令 + 结果
- 未决问题/风险
````

## 4. 调研 brief 模板

```markdown
# Research brief: <slug>

## 要回答的问题
1. ...
2. ...

## 范围
- 只看 <目录/模块>；不要看无关子系统
- 不要修改任何文件

## 返回格式
- 结论（先给答案）
- 关键位置：path:line — 现状/行为
- 约束与坑
- 建议
- 未决问题
```

## 5. 审查 brief 模板

```markdown
# Review brief: <unit>

## 必读
- <main-checkout>/.tmp/<slug>/PLAN.md
- <main-checkout>/.tmp/<slug>/TASKS/<unit>.md

## Diff
- 在 <worktree> 执行：git diff <base>...<branch>
- 只读；不要修改任何文件

## 关注
- 是否符合 PLAN 和验收标准
- 正确性、边界条件、错误处理
- 测试是否覆盖关键路径
- 是否改到范围外文件

## 返回
- [P0/P1/P2] path:line — 问题 — 为什么 — 建议修法
- Spec 缺口
- 缺失测试
```

## 6. 验证 brief 模板

````markdown
# Verify brief: <unit>

## 工作目录
<worktree 绝对路径>

## 要执行的命令
```bash
...
```

## 规则
- 只读；不要修改文件
- 逐条执行并保留退出码
- 失败时保留关键日志（截断到必要长度）

## 返回
- 每条命令：命令、退出码、通过/失败
- 失败摘要与相关日志
````

## 7. 调度规则

- **并行边界**：只有 worktree 互不重叠才并行；共享文件/接口的 unit 串行。
- **一个 unit 一个实现会话**；不要让一个会话同时改多个 unit。
- **实现只能用独立 T3 会话**：不要用 `Agent(general-purpose)` 或其他 subagent 改代码。
- **实现会话不得再创建顶层会话**；可以在自己范围内用 subagent 做局部调研。
- 当前 harness 没有 `Agent` 工具时，调研 subagent 可用 T3 的 `delegate_task`（`mode:"wait"` 拿结果）
  代替；实现仍然只能用顶层会话。
- 每次状态变化更新 `BOARD.md`。
- 用户确认点：`PLAN.md` 批准、范围变更、合并/PR、破坏性操作。
- 主 agent 的上下文只装文档和报告，不装源码/长日志。
- 主 agent 只通过文档和 T3 工具与 agent 交互；不直接操作代码。
- **跨环境**（`environmentId` 指向另一台机器）时，主 checkout 的 `.tmp` 在那边不可读；把任务书
  内容直接写进 `message`，或在目标环境先落一份文档。

## 8. 会话工具速查

| 目的 | MCP 工具 | CLI |
|---|---|---|
| 新建独立会话 | `t3_thread_launch` / `create_threads` | `t3 thread start` |
| 发消息 | `t3_thread_send` | `t3 thread send` |
| 等待 | `t3_thread_wait` | `--wait` |
| 读会话 | `t3_thread_read` | `t3 thread show` |
| 换后端/模型 | `t3_thread_configure` | 无（用 MCP） |
| 打断 | `t3_thread_interrupt` | 无 |
| 归档 | `t3_thread_organize` | 无 |
| 回答问题 | `t3_pending_request` | 无 |

- 后端/模型选择、协议细节、原始 RPC：见 `references/t3-agent-rpc.md`。
- 独立会话必须是顶层 thread，不要用 `delegate_task` / subagent 冒充。

## 9. 适用 / 不适用

**适用**：多文件功能、重构、复杂 bug、需要先调研再落地的任务、需要并行多个 agent 的任务。

**不适用**：一行修复、纯问答、紧急热修、只需要读文档回答的问题——直接做，不要走编排。
