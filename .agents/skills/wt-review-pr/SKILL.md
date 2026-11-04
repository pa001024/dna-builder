---
skill: wt-review-pr
description: Complete PR workflow with git worktree isolation - requirements to delivery; supports both standalone and orchestrated modes
runInSubagent: false
---

# Worktree-Isolated PR Workflow

End-to-end isolated PR workflow: requirements gathering → specification → worktree implementation → testing → code review → PR creation → cleanup.

## Orchestrated Mode (launched by orchestrated-delivery)

When you are launched as an **independent implementation session** by `.agents/skills/orchestrated-delivery` (not the main session), follow these overrides:

- **Requirements/Spec**: Use `PLAN.md` + `TASKS/<unit>.md` as source of truth; skip steps 1-2 interactive confirmation; do NOT call `/grill-with-docs`.
- **Worktree**: Already created by launcher via `t3_thread_launch` `workspaceStrategy`; **skip step 3**, do NOT execute `git worktree add`.
- **Implementation**: Implement directly per task spec; proceed without `/implement-spec` if unavailable.
- **Testing**: Execute step 5 commands; include results in final report.
- **Review**: Execute step 6; if `/code-review` unavailable, use read-only subagent for equivalent review.
- **PR Creation**: Execute step 7 only if task spec requires it; otherwise commit to branch and report.
- **Cleanup**: **Skip step 8**; do NOT remove worktree, leave it to orchestrator.
- **Communication**: Do NOT ask user directly; write issues/risks into final report or use pending requests.
- **Final Report** must include: branch name, commit SHA, PR URL (if created), verification commands & results, review conclusion, open questions.

## Workflow Steps

Execute the complete workflow in standalone mode:

### 1. Requirements Gathering

Invoke `/grill-with-docs` skill (if available) to confirm requirements with user:

- Understand the actual problem the user wants to solve
- Confirm technical boundaries and constraints
- Identify relevant documentation and context

### 2. Specification

Invoke `/to-spec` skill (if available) to generate technical specification:

- Transform requirements into actionable technical spec
- Define clear acceptance criteria
- Plan file change scope

### 3. Worktree Creation (Isolation)

Create isolated git worktree for development:

```bash
# Create feature branch and worktree based on current master
BRANCH_NAME="feat/$(date +%s)-<descriptive-name>"
git worktree add -b "$BRANCH_NAME" "../dna-builder-wt-$BRANCH_NAME" master
```

**Important**: Record worktree path and branch name for subsequent steps.

### 4. Implementation

Invoke `/implement-spec` skill in worktree (if available; otherwise implement directly per spec):

- Switch to worktree directory
- Implement per specification
- Follow project code style (`.agents/docs/code-style.md`)
- Follow commit convention (`.agents/docs/commit-convention.md`)
- Use `bun i18n add` for i18n content (all 6 languages, each in native language)
- Run build tools as needed (`bun icon add`, `bun tools/data-pack.ts`, etc.)

### 5. Testing & Linting (Verification)

Execute verification in worktree:

```bash
# Frontend changes
pnpm lint                    # Incremental lint (Biome + vue-tsc on changed files only)
pnpm test                    # Run tests if test files modified

# Backend changes (Rust)
cargo check
cargo test

# Data package changes
pnpm --filter dna-builder-data test
```

Fix all errors and warnings before proceeding.

### 6. Code Review

Use a fresh-context subagent to invoke `/code-review` skill (if available; otherwise use read-only subagent) for objective review:

- Scan implementation code quality
- Check compliance with project conventions
- Identify potential issues and improvement opportunities

Handle review feedback:

- **Valid issues**: Fix in worktree
- **Invalid issues**: Record but may ignore
- **Controversial**: Discuss with user to decide

### 7. PR Creation (Pull Request)

> ⚠️ The following commands modify remote repository: `git push` and `gh pr create` are sensitive operations.
> Must confirm with user in conversation first (or confirm launcher has explicitly authorized auto-push/PR), then proceed.

Commit code and create PR:

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

Invoke `/pr` skill (if available) to generate PR description including:

- **Summary**: Visual of code changes (diff/tree/mermaid)
- **Evidence**: Before/After screenshots or test output
- **Merge Danger**: 
  - Door: one-way / two-way
  - Blast Radius: impact scope assessment

### 8. Worktree Cleanup

Clean up worktree after PR creation:

```bash
# Return to main repo
cd <main-repo-path>

# Remove worktree (keep remote branch)
git worktree remove "../dna-builder-wt-$BRANCH_NAME"

# Delete local branch (remote branch auto-deleted by GitHub after PR merge)
git branch -d "$BRANCH_NAME"
```

**Note**: Only clean up after PR successfully created, ensuring code is pushed to remote.

## Usage Example

```bash
# User invocation
/wt-review-pr

# Or with requirement description
/wt-review-pr Add user avatar upload feature
```

## Error Handling

- **Unclear requirements**: `/grill-with-docs` phase clarifies with user
- **Lint/Test failures**: Fix in worktree then re-verify
- **Code review finds issues**: Fix then re-review
- **PR creation fails**: Keep worktree, wait for user intervention
- **Any step fails**: Pause workflow, report issue, wait for user decision

## Notes

- Worktree path pattern: `../dna-builder-wt-<branch-name>`
- Branch naming: `feat/<timestamp>-<descriptive-name>`
- Work entirely in worktree to avoid polluting main repo
- Follow project rules: don't run `pnpm dev`, don't execute git push/merge and other sensitive operations without user confirmation
- i18n content must cover all 6 languages at once (cn/tw/en/jp/kr/fr), each written in its native language

