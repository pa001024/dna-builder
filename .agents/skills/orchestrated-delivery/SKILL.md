---
name: orchestrated-delivery
description: Multi-agent delivery workflow - main agent only handles docs, task breakdown, and orchestration; research delegated to subagents, implementation to isolated T3 top-level sessions; single-unit work (implementation + testing + review + PR) follows wt-review-pr orchestrated mode. Use when user explicitly requests orchestration (e.g., "you coordinate, don't write code yourself", "research with subagents, implement in separate sessions", "split into parallel sessions") or task requires research + multi-file changes + isolated worktree implementation. Do NOT use for one-line fixes or simple changes.
agent_created: true
---

# Orchestrated Agent Delivery (Main Agent as Coordinator)

## 0. Role Contract (Hard Rules)

| Role | Who | Only Does | Absolutely Does NOT |
|---|---|---|---|
| **Main Agent (You)** | Current session | Read/write Markdown docs, break down tasks, orchestrate, confirm with user | Read source code, edit code, run build/test/lint/git, resolve conflicts |
| **Research Subagent** | `Agent(Explore)` | Read-only research of code/docs/web, return findings + `path:line` | Edit code |
| **Implementation Session** | T3 top-level thread (`t3_thread_launch` / `t3 thread start`) | Edit code in own worktree/branch, run commands, commit | Create new top-level sessions (unless main agent explicitly requests) |
| **Review Subagent** | `Agent(Explore)` | Read diff, check against spec for issues | Edit code |
| **Verification Subagent** | `Agent(general-purpose)` | Run lint/test/build in worktree, report raw output | Edit code |

### Main Agent Violation Signals

Stop and reassign when you have these thoughts:

- "Let me read this file" → Dispatch research subagent
- "Let me grep/glob the source" → Dispatch research subagent
- "This change is small, I'll do it directly" → Launch implementation session (tasks can be smaller, but don't do it yourself)
- "Let me run tests to confirm" → Dispatch verification subagent
- "Let me `git diff` to check" → Dispatch review subagent
- "Let me fix this conflict" → Launch integration session

Main agent's `Bash` tool is only allowed for documentation directory operations (`mkdir` / `ls` / `cat *.md`);
Any code, build, test, or git commands must be delegated to subagents.

**Allowed reads**: `AGENTS.md`, `README*`, `specs/`, `.agents/docs/`, Markdown under `.tmp/<slug>/`.
**Write scope**: `.tmp/<slug>/`, `specs/`, necessary Markdown documentation; do NOT edit source code, configs, or scripts.

## Workflow Overview

```text
User Requirements
  → BRIEF.md
  → Research subagents × N  →  RESEARCH.md
  → PLAN.md (user confirmation)
  → Implementation sessions × N (worktree/branch)  →  BOARD.md
  → Review subagents  →  REVIEW-<unit>.md
  → Verification subagents  →  VERIFY-<unit>.md
  → Integration session (merge/resolve conflicts/PR)
  → FINAL.md
```

## Division of Work with wt-review-pr

- **`wt-review-pr`** = Single unit execution workflow: implementation → self-test → self-review → commit/push/PR.
- **This skill** = Project-level orchestration: requirements → research → planning → break into units → dispatch → independent review/verification → integration.
- Main agent **does NOT directly execute `wt-review-pr`**; it delegates this skill to implementation sessions and requires "orchestrated mode" execution.
- Implementation session task specs must state: `Follow "Orchestrated Mode" in .agents/skills/wt-review-pr/SKILL.md`.
- Orchestrated mode overrides (corresponding section in `wt-review-pr`):
  - Requirements/spec from `PLAN.md` + `TASKS/<unit>.md`, skip interactive requirements gathering.
  - Worktree already created by `t3_thread_launch`, skip `git worktree add`.
  - On completion, **do NOT clean up worktree**; integration session/main agent decides.
  - Report issues to main agent, do NOT directly ask user.
- **PR strategy specified in task spec**:
  - Single unit / single PR: Implementation session creates PR per `wt-review-pr` step 7.
  - Multiple units / single PR: Implementation sessions only commit to branch, no PR; integration session creates unified PR.
  - Multiple units / multiple PRs: Each implementation session creates own PR.
- **Dual review gates**:
  - `wt-review-pr` self-test/self-review is the first gate.
  - This skill's review/verification subagents are the second gate; low-risk units can be spot-checked, high-risk/cross-unit must be reviewed.

## 1. Artifacts (Single Source of Truth)

All working documents in **main checkout** `.tmp/<slug>/` (gitignored); copy to `specs/` when long-term preservation needed.

> Implementation sessions in isolated worktrees won't have untracked `.tmp` copied over. When handing off, provide **absolute path in main checkout**
> (e.g., `E:/dev/dna-builder/.tmp/<slug>/PLAN.md`), not worktree-relative paths.

```text
.tmp/<slug>/
├── BRIEF.md            Requirements, constraints, acceptance criteria, non-goals
├── RESEARCH-BRIEF.md   Question list for research subagents
├── RESEARCH.md         Research findings (main agent summary)
├── PLAN.md             Solution, task breakdown, interfaces, test strategy
├── BOARD.md            Task board (status/thread/branch/artifacts)
├── TASKS/<unit>.md     Task spec for each implementation session
├── REVIEW-<unit>.md    Review conclusion
├── VERIFY-<unit>.md    Verification record
└── FINAL.md            Final delivery report
```

All decisions go into documents; every handoff provides document paths, not relying on chat context.

`BOARD.md` task board template:

```markdown
| Unit | Goal | Session/Link | Branch/Worktree | Status | Artifacts |
|---|---|---|---|---|---|
| u1 | ... | `t3-thread://...` | `<slug>/u1` | running | TASKS/u1.md |
```

Status: `planned` / `running` / `waiting` / `review` / `verify` / `done` / `blocked`.

## 2. Workflow Phases

### Phase 0: Intake (Main Agent)

1. Confirm with user: goals, acceptance criteria, non-goals, constraints, priority.
2. Write `BRIEF.md`.
3. Determine if this workflow applies: one-line fix / pure Q&A → skip orchestration, explain and end.
4. **Do NOT read source code at this phase.**

### Phase 1: Research (Subagents)

1. Write `RESEARCH-BRIEF.md`: questions to answer, scope, prohibitions, return format.
2. Use `Agent(subagent_type:"Explore")` to dispatch 1-3 research subagents in parallel; only parallelize truly independent questions.
3. Main agent only reads their returned reports, summarizes into `RESEARCH.md`; **do NOT read source code**.
4. If findings contradict, dispatch additional research subagent to arbitrate; do NOT check code yourself.

Research subagent return format:

```markdown
## Conclusion
## Key Locations
- path:line — current state/behavior
## Constraints & Gotchas
## Recommendations
## Open Questions
```

### Phase 2: Planning (Main Agent + Optional Plan Review)

1. Write `PLAN.md`:
   - Solution and tradeoffs
   - Task breakdown (each unit's goals, allowed files, dependencies)
   - Interface/data structure changes
   - Testing and verification commands
   - Risks and rollback strategy
2. Optional: Dispatch read-only subagent to review `PLAN.md`, return gaps and omissions.
3. **User confirmation point**: Major changes/architectural changes must get user approval of `PLAN.md` first.

### Phase 3: Dispatch (Main Agent → Independent Sessions)

For each unit:

1. Write `TASKS/<unit>.md` (template in section 3).
2. Choose isolation and backend:
   - Multiple units in parallel → each unit gets one worktree/branch.
   - Single unit → root or worktree both acceptable.
   - Worktree created from `baseRef`, **uncommitted changes won't carry over**; use root when needing current working directory.
   - Provider/model selected by task difficulty; use `orchestrator_capabilities` to check accurate values.
3. Launch independent session:
   - With T3 MCP tools: `t3_thread_launch` (`projectId`/`scratch`, `title`, `message`,
     `modelSelection`, `workspaceStrategy`, `clientRequestId`).
   - Shell only: `t3 thread start ...`.

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

4. Record `threadId`, `link`, `runId`, branch/worktree to `BOARD.md`.
5. Do NOT paste entire plan in prompt; let child session read `PLAN.md` + `TASKS/<unit>.md` itself.

### Phase 4: Monitor & Steer (Main Agent)

- `t3_thread_wait`: Give sufficient timeout at once, **do NOT poll with sleep**.
- `t3_thread_read`: `view:"messages"` or `"activity"`, low `limit`.
- `pendingRequestCount > 0` → `t3_pending_request` list/read/respond; ask user for product decisions.
- Going off track → `t3_thread_send` (`mode:"steer"` or `"queue"`).
- Update `BOARD.md` status.
- Unit failure: Read error → fix task spec → resend/relaunch session; **do NOT edit code yourself**.

### Phase 5: Review (Subagents)

1. After implementation session reports completion, dispatch review subagent: give it `PLAN.md`, `TASKS/<unit>.md`, diff range
   (`base...branch`).
2. Review subagent read-only, returns:

```markdown
## Findings
- [P0/P1/P2] path:line — issue — why — suggested fix
## Spec Gaps
## Missing Tests
```

3. Main agent writes `REVIEW-<unit>.md`, sends issue list to implementation session (`t3_thread_send`) or launches fix session.
4. After fixes, re-review (new subagent, don't reuse old conclusions).

### Phase 6: Verification (Subagents)

1. Dispatch verification subagent to run commands from `PLAN.md` in target worktree (lint/test/build).
2. Returns commands, exit codes, failure log excerpts; main agent writes `VERIFY-<unit>.md`.
3. Failure → send back to implementation session; pass → proceed to integration.

### Phase 7: Integration / PR (Integration Session)

- Multiple worktrees: Launch separate integration session, give it branch list and `PLAN.md`, let it merge/resolve conflicts/run final checks/create PR;
  after merge completion, it cleans up merged worktrees.
- Single worktree: Can let original implementation session commit and create PR (pre-specify in task spec).
- Main agent only records PR link and result; **does NOT execute git**.

### Phase 8: Final (Main Agent)

1. Write `FINAL.md`: what changed, why, verification evidence, risks, thread/PR links.
2. Archive completed sessions (`t3_thread_organize`).
3. Copy designs needing long-term preservation to `specs/`.

## 3. Task Spec Template (`TASKS/<unit>.md`)

````markdown
# Unit: <id> — <title>

## Goal
<one sentence>

## Required Reading
- <main-checkout>/.tmp/<slug>/PLAN.md
- <main-checkout>/.tmp/<slug>/TASKS/<unit>.md
(Use absolute paths; worktree doesn't have main checkout's untracked .tmp)

## Execution Mode
- Follow "Orchestrated Mode" in `.agents/skills/wt-review-pr/SKILL.md`.
- Requirements/spec from this task spec + PLAN.md; worktree already provided, skip creation/cleanup.
- PR strategy: <this unit creates own PR / only commit to branch, integration session creates unified PR / no PR>
- Do NOT ask user directly; write questions into final report.

## Allowed Modifications
- <files/directories>

## Prohibitions
- Do NOT modify <out-of-scope files>
- Do NOT create new top-level sessions
- Do NOT push / create PR (unless explicitly required by this task)

## Acceptance Criteria
- [ ] ...
- [ ] ...

## Verification Commands
```bash
...
```

## Deliverables
- Which files changed
- Which commands run + results
- Open questions/risks
````

## 4. Research Brief Template

```markdown
# Research brief: <slug>

## Questions to Answer
1. ...
2. ...

## Scope
- Only examine <directories/modules>; do NOT look at unrelated subsystems
- Do NOT modify any files

## Return Format
- Conclusion (answer first)
- Key locations: path:line — current state/behavior
- Constraints & gotchas
- Recommendations
- Open questions
```

## 5. Review Brief Template

```markdown
# Review brief: <unit>

## Required Reading
- <main-checkout>/.tmp/<slug>/PLAN.md
- <main-checkout>/.tmp/<slug>/TASKS/<unit>.md

## Diff
- Execute in <worktree>: git diff <base>...<branch>
- Read-only; do NOT modify any files

## Focus Areas
- Compliance with PLAN and acceptance criteria
- Correctness, edge cases, error handling
- Test coverage of critical paths
- Any out-of-scope file modifications

## Return Format
- [P0/P1/P2] path:line — issue — why — suggested fix
- Spec gaps
- Missing tests
```

## 6. Verification Brief Template

````markdown
# Verify brief: <unit>

## Working Directory
<worktree absolute path>

## Commands to Execute
```bash
...
```

## Rules
- Read-only; do NOT modify files
- Execute each command and preserve exit codes
- On failure, preserve key logs (truncate to necessary length)

## Return Format
- Each command: command, exit code, pass/fail
- Failure summary and relevant logs
````

## 7. Orchestration Rules

- **Parallelization boundary**: Only parallelize when worktrees don't overlap; units sharing files/interfaces must be serial.
- **One unit one implementation session**; do NOT let one session modify multiple units.
- **Implementation only in independent T3 sessions**: Do NOT use `Agent(general-purpose)` or other subagents to edit code.
- **Implementation sessions must NOT create top-level sessions**; may use subagents within own scope for local research.
- When current harness lacks `Agent` tool, research subagents can use T3's `delegate_task` (`mode:"wait"` to get results)
  instead; implementation still only uses top-level sessions.
- Update `BOARD.md` on every state change.
- User confirmation points: `PLAN.md` approval, scope changes, merge/PR, destructive operations.
- Main agent's context only holds documents and reports, not source code/long logs.
- Main agent only interacts with agents through documents and T3 tools; does NOT directly manipulate code.
- **Cross-environment** (`environmentId` pointing to another machine): main checkout's `.tmp` unreadable there; write task spec
  content directly into `message`, or drop a copy of docs in target environment.

## 8. Session Tool Quick Reference

| Purpose | MCP Tool | CLI |
|---|---|---|
| Create independent session | `t3_thread_launch` / `create_threads` | `t3 thread start` |
| Send message | `t3_thread_send` | `t3 thread send` |
| Wait | `t3_thread_wait` | `--wait` |
| Read session | `t3_thread_read` | `t3 thread show` |
| Change backend/model | `t3_thread_configure` | None (use MCP) |
| Interrupt | `t3_thread_interrupt` | None |
| Archive | `t3_thread_organize` | None |
| Answer questions | `t3_pending_request` | None |

- Backend/model selection, protocol details, raw RPC: see `references/t3-agent-rpc.md`.
- Independent sessions must be top-level threads, do NOT impersonate with `delegate_task` / subagents.

## 9. Applicable / Not Applicable

**Applicable**: Multi-file features, refactoring, complex bugs, tasks requiring research before implementation, tasks needing parallel agents.

**Not applicable**: One-line fixes, pure Q&A, urgent hotfixes, questions answerable by reading docs alone—do it directly, don't orchestrate.

