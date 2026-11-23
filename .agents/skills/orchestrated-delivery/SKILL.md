---
name: orchestrated-delivery
description: Project-level multi-agent delivery where the main agent plans and coordinates and never edits code - implementation runs in separate T3 top-level sessions, review and verification in fresh subagents, and research goes to subagents only when the main agent cannot locate the code by reading. Use when the user asks for orchestration ("you coordinate, don't write code yourself", "research with subagents, implement in separate sessions", "split into parallel sessions", "你来编排/调度，别自己写代码", "拆成多个会话做") or when a task needs planning and several implementation units. Do NOT use for one-line fixes, pure Q&A, or a single small change.
agent_created: true
---

# Orchestrated Delivery (Main Agent as Coordinator)

You coordinate; other agents do the work. Your context has to hold the plan, the board and every unit's
outcome for the whole project, so code bodies, diffs and logs stay in other agents' contexts and reach you
as reports with `path:line` evidence.

## 1. Roles

| Role | Runs as | Does |
|---|---|---|
| **Main agent (you)** | This session | Intake, locating, planning, task specs, dispatch, steering, user decisions; owns the docs in `.docs/<slug>/` |
| **Implementation session** | T3 top-level thread, one per unit | Edits code, runs the unit's checks, self-reviews, writes `REPORT-<unit>.md` |
| **Research subagent** (optional) | Read-only subagent | Investigates a question, writes `RESEARCH-<topic>.md` |
| **Review subagent** | Fresh read-only subagent | Checks a unit's diff against its spec, writes `REVIEW-<unit>.md` |
| **Verification subagent** | Subagent that can run commands | Runs check commands, writes `VERIFY-<scope>.md` |

A subagent is your harness's native subagent tool (Claude Code `Agent`: `Explore` for read-only work,
`general-purpose` to run commands; Codex `spawn_agent`). Use T3 `delegate_task` (`mode:"wait"`) when the
harness has none or the subagent needs another provider's model. A subagent writes one file: its own report.

### What the main agent does itself

- **Reads to locate**: open files, search, list directories, read-only git (`git status`, `git log`,
  `git diff --stat`), within the budget in section 2.
- **Writes Markdown** under `.docs/<slug>/`, plus `specs/` for designs worth keeping.

Everything else is routed:

| Work | Goes to |
|---|---|
| Any change to source, config or scripts, however small | Implementation session (a small change is a small unit) |
| Build, test, lint, browser checks | The unit's implementation session; an independent run goes to a verification subagent |
| Reading a whole diff, judging code quality | Review subagent |
| Open-ended or wide investigation | Research subagent |
| Git writes, merges, conflict resolution, PRs | Implementation or integration session |

A change you make yourself has no task spec, no report and no independent review, which is why even a
one-line edit becomes a unit.

## 2. Locate or delegate

Research subagents are optional. Choose per question:

**Locate it yourself** when you can name what you are looking for (a symbol, file, route, config key, error
string) and expect to pin it down in about 10 read/search calls. Read the relevant ranges rather than whole
large files, and record what you find in `PLAN.md` as `path:line — current behavior`. You have located
enough once the task spec can name the files and symbols the unit touches; working out how to make the
change belongs to the implementation session.

**Delegate to research subagents** when any of these holds:

- The question is open-ended: how a subsystem works end to end, every caller of something, why a behavior happens.
- It spans several subsystems, upstream or external sources, or the web.
- There are several independent questions: dispatch them in parallel, one subagent each (usually 1-3).
- Answering means running code or reading long output (logs, data dumps, generated files).
- You spent the locating budget without an answer. Hand over what you found as the starting point.

**Skip both** when the user already gave the locations.

The research brief is the subagent's prompt: the questions, the directories or modules to stay within,
read-only, the report path, and this report format:

```markdown
## Conclusion            (answer first)
## Key Locations         (path:line — current state/behavior)
## Constraints & Gotchas
## Recommendations
## Open Questions
```

The subagent writes `RESEARCH-<topic>.md` and replies with a summary of at most 10 lines; open the file for
the parts you need. When two reports contradict each other, read the disputed `path:line` yourself, or
dispatch one more subagent if that exceeds the locating budget.

## 3. Sizing

Pick the smallest process that fits and record it at the top of `PLAN.md`. Move from Light to Full as soon
as units multiply or locating turns into research.

| | Light | Full |
|---|---|---|
| Fits | 1-2 units, code located by reading, low risk | 3+ units, unfamiliar territory, cross-module interfaces, or parallel sessions |
| Research | Main agent locates | Research subagents where section 2 calls for them |
| Docs | `PLAN.md` (board kept inside it), `TASKS/`, `REPORT-*` | The full set in section 4 |
| Plan approval | Summarize the plan in chat and proceed | User approves `PLAN.md` before dispatch |
| Review | Review subagent unless the change is mechanical; then the session's self-review stands | Review subagent for every unit |
| Verification | The session's reported command output stands | Baseline run before the first unit, independent run for high-risk units and at the end |

Changes to architecture or public interfaces need user approval of `PLAN.md` at either size.

## 4. Docs (single source of truth)

All working docs live in the **main checkout** at `.docs/<slug>/` (gitignored, per AGENTS.md rule 12;
`.tmp/` gets cleaned by other tools and has already lost a project's docs). Decisions go into these files,
and every handoff passes file paths rather than chat context. Hand them off as **absolute paths**
(`E:/dev/dna-builder/.docs/<slug>/PLAN.md`): a worktree does not contain the main checkout's untracked files.

```text
.docs/<slug>/
├── PLAN.md              Goal, acceptance criteria, non-goals, sizing, workspace mode + git policy, model,
│                        findings (path:line), units (goal, files, dependencies, order), verification
│                        commands, risks
├── BOARD.md             One row per unit, then a dated list of decisions and standing rules
├── FEEDBACK.md          User feedback and rulings, append-only, numbered §1, §2, ...
├── TASKS/<unit>.md      Task spec (section 6); fix rounds are TASKS/<unit>-fix.md, -fix2.md
├── REPORT-<unit>.md     Written by the implementation session
├── RESEARCH-<topic>.md  Written by a research subagent
├── REVIEW-<unit>.md     Written by a review subagent
├── VERIFY-<scope>.md    Written by a verification subagent (baseline, a unit, final)
├── <unit>/              Evidence: screenshots, logs, one-off check scripts
└── FINAL.md             Delivery report
```

`BOARD.md`:

```markdown
| Unit | Goal | Session | Branch | Status | Artifacts |
|---|---|---|---|---|---|
| u1 | ... | `t3-thread://...` | `<slug>/u1` or root | running | TASKS/u1.md |
```

Status is `planned` / `running` / `waiting` / `review` / `verify` / `done` / `blocked`, followed by at most
one short clause. Test counts and findings stay in the report the row links to, so the board remains
readable after dozens of units.

`FEEDBACK.md`: log each piece of user feedback as the next `§N` with its date; task specs cite `§N` instead
of restating it. When a ruling overturns an earlier conclusion, mark the affected board rows and reports as
superseded in the same turn.

## 5. Workflow

```text
Intake → Locate / Research → PLAN.md → Dispatch → Monitor → Review → Verify → Integrate → FINAL.md
```

### Step 1: Intake

State the goal, acceptance criteria, non-goals and constraints in `PLAN.md`. Ask the user only what the
request, AGENTS.md and locating leave open. If the task turns out to be a one-line fix or pure Q&A, say so
and handle it without this workflow.

### Step 2: Locate / Research

Per section 2. Findings land in `PLAN.md` (located) or `RESEARCH-<topic>.md` (delegated).

### Step 3: Plan

Write `PLAN.md` and cut the work into units. A unit has one goal, a file set it owns, its dependencies and
its acceptance criteria. Then choose the workspace mode:

| | `root` | `worktree` |
|---|---|---|
| Use when | Default: the user has not asked for branches, commits or PRs | The user asked for branches or PRs, or units must run in parallel on overlapping files |
| Where | Main checkout, current working tree | One worktree + branch per unit, created by `t3_thread_launch`; uncommitted changes in the main checkout do not carry over |
| Git policy | `none`: no git writes | `commit` (an integration session opens one PR) or `pr` (the unit opens its own) |
| Parallelism | Serial by default; parallel only for disjoint file sets | Parallel for units that share no files or interfaces; dependent units run serially or stacked |
| A unit's diff | `git diff -- <files listed in its report>` | `git diff <base>...<branch>` |

Shared registries and generated artifacts (i18n JSON, router, data packs, wasm builds) count as overlap in
either mode: serialize the units that write them.

`git push` and PR creation change the remote. Get the user's explicit go-ahead and record it in the task
spec, because an implementation session cannot ask the user.

### Step 4: Dispatch

For each unit, write `TASKS/<unit>.md`, then launch a top-level session:

```jsonc
t3_thread_launch {
  "title": "[<slug>] <unit>",
  "message": "Read <docs>/PLAN.md and <docs>/TASKS/<unit>.md first. Implement only this unit, run its verification commands, write <docs>/REPORT-<unit>.md, then reply with a summary of at most 5 lines.",
  "workspaceStrategy": { "type": "root" },
  // worktree mode: { "type": "worktree", "baseRef": "origin/master", "startFromOrigin": true, "branch": "<slug>/<unit>" }
  // unit stacked on unpublished commits: "baseRef": "<that local branch>", "startFromOrigin": false
  "clientRequestId": "<slug>:<unit>"
}
```

- `<docs>` is the absolute docs path. The message points at the docs; the plan itself stays in the files.
- Omit `projectId`, `modelSelection` and the mode fields to inherit yours. Pass `modelSelection` when the user
  named a model or a unit's difficulty calls for a different one: take the exact ids from
  `orchestrator_capabilities`, record the choice in `PLAN.md`, and pass it on every later launch and subagent.
- Retrying a launch whose response was lost reuses the same `clientRequestId`; a new session for the same
  unit (a fix round) gets a new one.
- Record `link`, `threadId`, `runId` and branch on the board.

### Step 5: Monitor and steer

- Wait with `t3_thread_wait` and a generous timeout (10 minutes or more); on timeout, wait again.
- When the run ends, read `REPORT-<unit>.md`. Use `t3_thread_read` (`view:"messages"`, low `limit`) only
  when the report is missing or unclear.
- `pendingRequestCount > 0`: handle it with `t3_pending_request`. Answer from `PLAN.md` and `FEEDBACK.md`
  where they already decide the matter; take product decisions to the user.
- Off track: `t3_thread_send` with `mode:"steer"` (now) or `"queue"` (after the current turn).
- Failed unit: read the error, correct the task spec, then resend or relaunch.
- Update the board on every state change.

### Step 6: Review

Where the sizing table calls for a review, dispatch a fresh review subagent per round, so the review does
not inherit earlier conclusions. Its prompt carries the absolute paths of `PLAN.md`, `TASKS/<unit>.md` and
`REPORT-<unit>.md`, the working directory, the diff command for the unit (step 3 table), read-only, and the
focus: acceptance criteria met, correctness and edge cases, tests on critical paths, files changed outside
the unit. It writes `REVIEW-<unit>.md`:

```markdown
## Verdict               (pass / pass-with-fixes / fail)
## Findings
- [P0/P1/P2] path:line — issue — why — suggested fix
## Spec Gaps
## Missing Tests
```

and replies with the verdict and the finding counts. Then:

- **P0/P1**: write `TASKS/<unit>-fix.md` citing the findings and send it to the unit's session
  (`t3_thread_send`), or launch a new session if that one is gone. Re-review the fix diff against the
  original findings.
- **P2**: fold into that fix task when cheap; otherwise list them as follow-ups in `FINAL.md`. A round
  that fixes only P2s closes on the session's own checks, without another review.
- **Still P0/P1 after two fix rounds**: the unit is cut wrong or under-researched. Revisit its spec and
  the plan, or take it to the user, before launching a third round.

### Step 7: Verify

Where the sizing table calls for an independent run, a verification subagent runs the commands from
`PLAN.md` in the unit's working directory and writes `VERIFY-<scope>.md`: each command with its exit code
and pass/fail, plus trimmed log excerpts for failures. It changes no files; failures go back to the
implementation session.

At Full size, run the same commands once before the first unit (`VERIFY-baseline.md`), so later runs can
separate regressions from failures that were already there.

### Step 8: Integrate (`worktree` mode)

- Several branches: launch one integration session with the branch list and `PLAN.md`. It merges,
  resolves conflicts, runs the final checks, opens the PR if authorized, and removes the merged worktrees.
- One branch with git policy `pr`: the implementation session opens the PR itself.
- Record PR links and results on the board.

`root` mode has nothing to integrate; the changes stay uncommitted in the working tree for the user.

### Step 9: Final

1. Write `FINAL.md`: what changed and why, verification evidence, known risks, follow-ups, thread and PR links.
2. Archive finished sessions with `t3_thread_organize`.
3. Copy designs worth keeping to `specs/`.

## 6. Task spec template (`TASKS/<unit>.md`)

````markdown
# Unit: <id> — <title>

## Goal
<one sentence; cite FEEDBACK.md §N where the unit answers user feedback>

## Required Reading
- <docs>/PLAN.md
- <other reports this unit builds on, absolute paths>
- <path:line or path + symbol> — <what is there now>

## Execution Mode
- Follow "Orchestrated Mode" in `.agents/skills/wt-review-pr/SKILL.md`.
- Workspace: <root | worktree, already provided>
- Git policy: <none | commit | pr>; push/PR authorized by the user: <yes | no>
- Questions go into the report; the user is reached only through the main agent.

## Allowed Modifications
- <files/directories>
- <docs>/REPORT-<unit>.md and <docs>/<unit>/

## Out of Scope
- <files and behaviors this unit leaves alone>
- Creating top-level sessions

## Acceptance Criteria
- [ ] ...

## Verification Commands
```bash
...
```

## Report (`<docs>/REPORT-<unit>.md`)
- Files changed, and why
- Commands run with results
- Branch and commit SHA, PR URL (when the git policy produced them)
- Self-review conclusion, open questions, risks
````

## 7. Rules

- **One unit, one implementation session.** Fix rounds for a unit return to its session.
- **Implementation runs only in top-level T3 sessions**, never in subagents or `delegate_task`: a top-level
  thread is visible to the user, steerable, and outlives your turn.
- Implementation sessions may use subagents for their own local research; launching top-level sessions
  stays with the main agent.
- **wt-review-pr** is the single-unit workflow each implementation session runs (implement, self-test,
  self-review, optional commit/PR). Its "Orchestrated Mode" section defines the overrides; the task spec
  supplies what that mode needs (workspace, git policy, report path). The session's self-review is the
  first gate and this skill's review and verification subagents are the second.
- **User confirmation points**: `PLAN.md` approval (section 3), scope changes, push / PR / merge,
  destructive operations.
- **Cross-environment** (`environmentId` on another machine): that machine cannot read this checkout's
  `.docs/`. Put the task spec in `message`, or place a copy of the docs there.

## 8. T3 tools

Session tools used above: `t3_thread_launch` (`create_threads` for a batch), `t3_thread_send`,
`t3_thread_wait`, `t3_thread_read`, `t3_pending_request`, `t3_thread_configure` (change model),
`t3_thread_interrupt`, `t3_thread_organize`.

- T3 tools can be deferred: look one up by name with your tool search before concluding it is absent.
- Read `references/t3-agent-rpc.md` when you choose a backend or model, when a T3 call returns an error,
  or when the MCP tools are unavailable and you need the `t3 thread ...` CLI.
