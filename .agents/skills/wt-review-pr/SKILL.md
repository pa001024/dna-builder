---
skill: wt-review-pr
description: Complete PR workflow with worktree isolation - from requirements to PR; also runs in orchestrated mode when launched by orchestrated-delivery
runInSubagent: false
---

# Worktree Review PR Workflow

完整的隔离式 PR 工作流：需求确认 → 规格编写 → worktree 实现 → 测试 → 审核 → PR 创建 → 清理。

## 编排模式（被 orchestrated-delivery 调用时）

如果你是被 `.agents/skills/orchestrated-delivery` 启动的**独立实现会话**，而不是主会话，按本节覆盖默认步骤：

- **需求/规格**：以 `PLAN.md` + `TASKS/<unit>.md` 为准，跳过第 1、2 步的交互式确认；不要调用 `/grill-with-docs`。
- **Worktree**：启动方已通过 `t3_thread_launch` 的 `workspaceStrategy` 创建；**跳过第 3 步**，不要执行 `git worktree add`。
- **实现**：按任务书直接实现；`/implement-spec` 不可用时不要卡住。
- **验证**：执行第 5 步的命令；结果写进最终报告。
- **审查**：执行第 6 步；`/code-review` 不可用时，用只读 subagent 做同样的事。
- **PR**：任务书要求才执行第 7 步；否则只提交到分支并报告。
- **清理**：**跳过第 8 步**；不要删除 worktree，由编排方决定。
- **沟通**：不要直接问用户；把问题/风险写进最终报告，或通过 pending request 回报。
- **最终报告**必须包含：分支、commit SHA、PR URL（如有）、验证命令与结果、审查结论、未决问题。

## Workflow Steps

执行以下完整流程：

### 1. 需求确认 (Requirements Gathering)

调用 `/grill-with-docs` 技能（如果可用）与用户确认需求细节：

- 理解用户真正想要解决的问题
- 确认技术边界和约束
- 识别相关文档和上下文

### 2. 规格编写 (Specification)

调用 `/to-spec` 技能（如果可用）生成技术规格：

- 将需求转化为可实施的技术规格
- 定义清晰的验收标准
- 规划文件变更范围

### 3. Worktree 创建 (Isolation)

创建独立的 git worktree 进行开发：

```bash
# 基于当前 master 创建特性分支和 worktree
BRANCH_NAME="feat/$(date +%s)-<descriptive-name>"
git worktree add -b "$BRANCH_NAME" "../dna-builder-wt-$BRANCH_NAME" master
```

**重要**: 记录 worktree 路径和分支名，用于后续步骤。

### 4. 实现 (Implementation)

在 worktree 中调用 `/implement-spec` 技能（如果可用；否则按 spec 直接实现）：

- 切换到 worktree 目录
- 按照 spec 实现功能
- 遵循项目代码规范 (`.agents/docs/code-style.md`)
- 遵循提交规范 (`.agents/docs/commit-convention.md`)
- 使用 `bun i18n add` 添加多语言文案（6 种语言）
- 根据需要运行构建工具 (`bun icon add`, `bun tools/data-pack.ts` 等)

### 5. 验证 (Testing & Linting)

在 worktree 中执行验证：

```bash
# Frontend changes
pnpm lint                    # 增量 lint (Biome + vue-tsc on changed files)
pnpm test                    # Run tests if test files modified

# Backend changes (Rust)
cargo check
cargo test

# Data package changes
pnpm --filter dna-builder-data test
```

修复所有错误和警告后再继续。

### 6. 代码审核 (Code Review)

使用干净上下文的子代理调用 `/code-review` 技能（如果可用；否则用只读 subagent）进行客观审核：

- 扫描实现的代码质量
- 检查是否符合项目规范
- 识别潜在问题和改进点

处理审核意见：

- **有效意见**: 在 worktree 中修复
- **无效意见**: 记录但可忽略
- **有争议**: 与用户讨论决定

### 7. PR 创建 (Pull Request)

> ⚠️ 下面两条命令会修改远端仓库：`git push` 与 `gh pr create` 属于敏感操作。
> 执行前必须先在对话里向用户确认（或确认启动方已明确授权自动推送 / 建 PR），得到允许后再继续。

提交代码并创建 PR：

```bash
# Commit all changes
git add .
git commit -m "feat(<scope>): <description>

- <change 1>
- <change 2>
"

# Push to remote
git push -u origin "$BRANCH_NAME"

# Create PR using GitHub CLI
gh pr create --base master --head "$BRANCH_NAME" \
  --title "<PR title>" \
  --body "<PR body following /pr template>"
```

调用 `/pr` 技能（如果可用）生成 PR 描述，包含：

- **Summary**: 代码变更的可视化（diff/tree/mermaid）
- **Evidence**: Before/After 截图或测试输出
- **Merge Danger**: 
  - Door: one-way / two-way
  - Blast Radius: 影响范围评估

### 8. Worktree 清理 (Cleanup)

PR 创建后清理 worktree：

```bash
# 返回主仓库
cd <main-repo-path>

# 移除 worktree（保留远程分支）
git worktree remove "../dna-builder-wt-$BRANCH_NAME"

# 删除本地分支（远程分支在 PR merge 后由 GitHub 自动删除）
git branch -d "$BRANCH_NAME"
```

**注意**: 仅在 PR 成功创建后清理，确保代码已推送到远程。

## Usage Example

```bash
# 用户调用
/wt-review-pr

# 或带需求描述
/wt-review-pr 添加用户头像上传功能
```

## Error Handling

- **需求不明确**: `/grill-with-docs` 阶段会与用户澄清
- **Lint/Test 失败**: 在 worktree 中修复后重新验证
- **Code Review 发现问题**: 修复后重新审核
- **PR 创建失败**: 保留 worktree，等待用户介入
- **任何步骤失败**: 暂停流程，报告问题，等待用户决策

## Notes

- Worktree 路径模式: `../dna-builder-wt-<branch-name>`
- 分支命名: `feat/<timestamp>-<descriptive-name>`
- 全程在 worktree 中工作，避免污染主仓库
- 遵循项目规则：不运行 `pnpm dev`，不执行 git push/merge 等敏感操作需用户确认
- i18n 文案必须一次补齐 6 种语言（cn/tw/en/jp/kr/fr），每种用自己的语言书写
