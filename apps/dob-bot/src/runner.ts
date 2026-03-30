import { execFile } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { applyCodexPlanToLocalBranch, planCodexEdits } from "./codex.ts"
import { config } from "./config.ts"
import { createGithubClient } from "./github/client.ts"
import { getInstallationToken } from "./github/installation.ts"
import { extractDobBotInstruction } from "./issue/parse.ts"
import { logDob } from "./log.ts"
import { buildPlannerDecision } from "./planner.ts"
import { appendProcessedTask, hasProcessedTask } from "./state/processed.ts"

const execFileAsync = promisify(execFile)
const BOT_MARKER = "<!-- dob-bot -->"

type Issue = {
    number: number
    title?: string | null
    body?: string | null
    labels?: Array<string | { name?: string }>
    pull_request?: unknown
    user?: {
        login?: string | null
    } | null
}

type DobBotState = {
    branch: string
    prNumber: number
}

/**
 * 执行一次扫描与处理。
 * @returns {Promise<void>}
 */
export async function runOnce(): Promise<void> {
    const client = createGithubClient()
    const { token } = await getInstallationToken({
        client,
        appId: config.appId,
        privateKeyPem: config.privateKeyPem,
        installationId: config.installationId,
        owner: config.owner,
        repo: config.repo,
    })

    const issues = await listOpenIssues({ client, token, owner: config.owner, repo: config.repo })
    logDob("runner.open_issues", {
        count: issues.length,
        issues: issues.map(issue => ({
            number: issue.number,
            title: issue.title ?? "",
        })),
    })
    const candidates = []
    for (const issue of issues) {
        if (await isIssueCandidate(issue, config.label, client, token, config.owner, config.repo)) {
            candidates.push(issue)
        }
    }
    logDob("runner.candidates", {
        count: candidates.length,
        issues: candidates.map(issue => ({
            number: issue.number,
            title: issue.title ?? "",
        })),
    })

    for (const issue of candidates) {
        const issueNumber = Number(issue.number)
        if (!Number.isFinite(issueNumber)) continue

        const task = await findTaskInIssueThread({
            client,
            token,
            owner: config.owner,
            repo: config.repo,
            issueNumber,
            issueBody: String(issue.body ?? ""),
        })
        if (!task) {
            logDob("runner.skip_no_task", {
                issueNumber,
                issueTitle: issue.title ?? "",
            })
            continue
        }

        const taskHash = computeTaskHash(task.source, task.instruction)
        const alreadyProcessedLocal = await hasProcessedTask(taskHash)
        if (alreadyProcessedLocal) {
            logDob("runner.skip_already_processed_local", {
                issueNumber,
                issueTitle: issue.title ?? "",
                taskHash,
            })
            continue
        }
        const alreadyProcessed = await isTaskAlreadyProcessed({
            client,
            token,
            owner: config.owner,
            repo: config.repo,
            issueNumber,
            taskHash,
        })
        if (alreadyProcessed) {
            logDob("runner.skip_already_processed", {
                issueNumber,
                issueTitle: issue.title ?? "",
                taskHash,
            })
            continue
        }

        const existingState = await findExistingDobBotState({ client, token, owner: config.owner, repo: config.repo, issueNumber })
        logDob("runner.issue_task_found", {
            issueNumber,
            issueTitle: issue.title ?? "",
            taskSource: task.source,
            taskInstruction: task.instruction,
            taskHash,
            existingState,
        })

        if (config.dryRun) {
            console.log(`[dry-run] issue #${issueNumber} ->`, { task, existingState })
            continue
        }

        await handleIssueTask({
            client,
            token,
            owner: config.owner,
            repo: config.repo,
            issueNumber,
            issueTitle: String(issue.title ?? ""),
            task,
            taskContext: task.context,
            taskHash,
            existingState,
        })
    }
}

let activeRun: Promise<void> | null = null
let rerunRequested = false

/**
 * 调度一次运行，支持合并并发触发。
 * @param {string} reason
 * @returns {Promise<void>}
 */
export function scheduleRun(reason = "manual"): Promise<void> {
    logDob("runner.schedule", {
        reason,
        activeRun: Boolean(activeRun),
    })
    if (activeRun) {
        rerunRequested = true
        return activeRun
    }

    activeRun = (async () => {
        do {
            rerunRequested = false
            await runOnce()
        } while (rerunRequested)
    })().finally(() => {
        activeRun = null
    })

    return activeRun
}

/**
 * 拉取开放 issue 列表。
 * @param {{ client: ReturnType<typeof createGithubClient>, token: string, owner: string, repo: string }} params
 * @returns {Promise<Issue[]>}
 */
async function listOpenIssues({
    client,
    token,
    owner,
    repo,
}: {
    client: ReturnType<typeof createGithubClient>
    token: string
    owner: string
    repo: string
}): Promise<Issue[]> {
    const data = await client.request("GET", `/repos/${owner}/${repo}/issues`, {
        token,
        query: { state: "open", per_page: 50 },
    })
    return Array.isArray(data) ? (data as Issue[]) : []
}

/**
 * 判断 issue 是否值得处理。
 * @param {Issue} issue
 * @param {string} label
 * @returns {boolean}
 */
async function isIssueCandidate(
    issue: Issue,
    label: string,
    client: ReturnType<typeof createGithubClient>,
    token: string,
    owner: string,
    repo: string
): Promise<boolean> {
    if (!issue || issue.pull_request) return false
    const labels = Array.isArray(issue.labels) ? issue.labels : []
    const hasLabel = labels.some(l => (typeof l === "string" ? l : l?.name) === label)
    if (hasLabel) return true
    const body = String(issue.body ?? "")
    if (body.includes("@dob-bot") || body.includes("```dob-bot")) return true

    const comments = await client.request("GET", `/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
        token,
        query: { per_page: 100 },
    })
    if (!Array.isArray(comments)) return false
    return comments.some(c => {
        const commentBody = String((c as { body?: unknown })?.body ?? "")
        return commentBody.includes("@dob-bot") || commentBody.includes("```dob-bot")
    })
}

/**
 * 从 issue 正文和评论中查找任务。
 * @param {{ client: ReturnType<typeof createGithubClient>, token: string, owner: string, repo: string, issueNumber: number, issueBody: string }} params
 * @returns {Promise<{ source: string; instruction: string; context: string } | null>}
 */
async function findTaskInIssueThread({
    client,
    token,
    owner,
    repo,
    issueNumber,
    issueBody,
}: {
    client: ReturnType<typeof createGithubClient>
    token: string
    owner: string
    repo: string
    issueNumber: number
    issueBody: string
}): Promise<{ source: string; instruction: string; context: string } | null> {
    const comments = await client.request("GET", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        token,
        query: { per_page: 100 },
    })
    if (Array.isArray(comments)) {
        let latestMatch: { source: string; instruction: string; context: string } | null = null
        for (const c of comments) {
            const comment = c as { body?: unknown; user?: { login?: unknown } | null }
            const body = String(comment.body ?? "")
            const author = String(comment.user?.login ?? "")
            if (!isAllowedMentionAuthor(author)) continue
            const instruction = extractDobBotInstruction(body)
            if (instruction) latestMatch = { source: "issue_comment", instruction, context: body }
        }
        if (latestMatch) return latestMatch
    }

    const issue = await client.request("GET", `/repos/${owner}/${repo}/issues/${issueNumber}`, { token })
    const issueAuthor = String((issue as { user?: { login?: unknown } | null })?.user?.login ?? "")
    if (!isAllowedMentionAuthor(issueAuthor)) return null

    const bodyInstruction = extractDobBotInstruction(issueBody)
    if (bodyInstruction) return { source: "issue_body", instruction: bodyInstruction, context: issueBody }

    return null
}

/**
 * 查找 issue 已有的 bot 状态。
 * @param {{ client: ReturnType<typeof createGithubClient>, token: string, owner: string, repo: string, issueNumber: number }} params
 * @returns {Promise<DobBotState | null>}
 */
async function findExistingDobBotState({
    client,
    token,
    owner,
    repo,
    issueNumber,
}: {
    client: ReturnType<typeof createGithubClient>
    token: string
    owner: string
    repo: string
    issueNumber: number
}): Promise<DobBotState | null> {
    const comments = await client.request("GET", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        token,
        query: { per_page: 100 },
    })
    if (!Array.isArray(comments)) return null

    let latestState: DobBotState | null = null
    for (const c of comments) {
        const body = String((c as { body?: unknown })?.body ?? "")
        if (!body.includes(BOT_MARKER)) continue
        const branchMatch = body.match(/dob-bot-branch:\s*([^\s]+)/)
        const prMatch = body.match(/dob-bot-pr:\s*#(\d+)/)
        const branch = branchMatch?.[1]
        const prNumber = Number(prMatch?.[1] ?? "")
        if (branch && Number.isFinite(prNumber) && prNumber > 0) {
            latestState = { branch, prNumber }
        }
    }

    if (!latestState) return null

    // PR 被删除/不可见时，忽略旧状态，允许重新处理。
    const prExists = await doesPullRequestExist(client, token, owner, repo, latestState.prNumber)
    return prExists ? latestState : null
}

/**
 * 根据 issue 任务执行本地 codex 修改并创建或更新 PR。
 * @param {{
 *   client: ReturnType<typeof createGithubClient>,
 *   token: string,
 *   owner: string,
 *   repo: string,
 *   issueNumber: number,
 *   issueTitle: string,
 *   task: { source: string; instruction: string; context: string },
 *   taskContext: string,
 *   taskHash: string,
 *   existingState: DobBotState | null
 * }} params
 * @returns {Promise<void>}
 */
async function handleIssueTask({
    client,
    token,
    owner,
    repo,
    issueNumber,
    issueTitle,
    task,
    taskContext,
    taskHash,
    existingState,
}: {
    client: ReturnType<typeof createGithubClient>
    token: string
    owner: string
    repo: string
    issueNumber: number
    issueTitle: string
    task: { source: string; instruction: string; context: string }
    taskContext: string
    taskHash: string
    existingState: DobBotState | null
}): Promise<void> {
    logDob("runner.handle_issue.start", {
        issueNumber,
        issueTitle,
        taskSource: task.source,
        taskInstruction: task.instruction,
        existingState,
    })
    const repoInfo = await client.request("GET", `/repos/${owner}/${repo}`, { token })
    const baseBranch = String((repoInfo as { default_branch?: unknown })?.default_branch ?? "main")
    const repoRoot = await getRepoRoot()
    const repoTree = await buildRepoTree(repoRoot)
    const focusTree = repoTree
        .split("\n")
        .filter(file => file.startsWith("apps/dob-bot/"))
        .join("\n")
    const issueUrl = `https://github.com/${owner}/${repo}/issues/${issueNumber}`

    const plannerDecision = await buildPlannerDecision(
        {
            apiKey: config.llmApiKey,
            baseUrl: config.llmBaseUrl,
            model: config.schedulerModel,
            fallbackModel: config.schedulerFallbackModel,
            temperature: config.schedulerTemperature,
            maxTokens: config.schedulerMaxTokens,
        },
        issueTitle,
        taskContext,
        task.instruction,
        issueUrl
    )
    logDob("runner.planner_decision", {
        issueNumber,
        issueTitle,
        plannerDecision,
    })

    if (plannerDecision.action === "direct_reply") {
        await client.request("POST", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
            token,
            body: {
                body: [
                    BOT_MARKER,
                    buildDobBotMetaComment({
                        branch: existingState?.branch ?? "",
                        prNumber: existingState?.prNumber ?? 0,
                        taskHash,
                        issueNumber,
                    }),
                    "",
                    plannerDecision.reply.trim() || "这个请求不需要改代码或调试，我先直接回复。",
                ].join("\n"),
            },
        })
        await appendProcessedTask({
            taskHash,
            issueNumber,
            source: task.source,
            action: "direct_reply",
            createdAt: new Date().toISOString(),
        })
        return
    }

    const schedulerBrief = {
        kind: "code_change" as const,
        objective: plannerDecision.objective.trim() || task.instruction,
        constraints: [`Issue: ${issueUrl}`, ...plannerDecision.constraints],
        file_hints: plannerDecision.file_hints,
        clarification_question: null,
    }
    logDob("runner.exec_brief", {
        issueNumber,
        issueTitle,
        schedulerBrief,
    })

    const plan = await planCodexEdits(
        {
            apiKey: config.llmApiKey,
            baseUrl: config.llmBaseUrl,
            model: config.codexModel,
            temperature: config.codexTemperature,
            maxTokens: config.codexMaxTokens,
        },
        schedulerBrief,
        repoTree,
        focusTree,
        {
            onToolRound: round => {
                logDob("runner.codex_tool_round", {
                    issueNumber,
                    issueTitle,
                    ...round,
                })
            },
        }
    )
    logDob("runner.codex_plan", {
        issueNumber,
        issueTitle,
        plan,
    })
    const plannedReadPaths = unique(plan.read_paths.map(normalizeRepoPath).filter(Boolean))
    const plannedDeletePaths = unique(plan.delete_paths.map(normalizeRepoPath).filter(Boolean))
    logDob("runner.codex_plan_paths", {
        issueNumber,
        issueTitle,
        plannedReadPaths,
        plannedDeletePaths,
    })

    const fileContexts = await Promise.all(
        plannedReadPaths.map(async relPath => ({
            path: relPath,
            content: await readRepoFile(repoRoot, relPath),
        }))
    )
    logDob("runner.file_contexts", {
        issueNumber,
        issueTitle,
        files: fileContexts.map(file => ({
            path: file.path,
            size: file.content.length,
        })),
    })

    const branch = existingState?.branch ?? `dob-bot/issue-${issueNumber}-${shortId()}`
    const baseRef = existingState ? `origin/${existingState.branch}` : `origin/${baseBranch}`
    const fallbackCommitMessage = buildConventionalCommitMessage({
        issueNumber,
        objective: schedulerBrief.objective,
        fileHints: plannedReadPaths,
    })
    const execResult = await applyCodexPlanToLocalBranch(
        repoRoot,
        branch,
        baseRef,
        {
            apiKey: config.llmApiKey,
            baseUrl: config.llmBaseUrl,
            model: config.codexModel,
            temperature: config.codexTemperature,
            maxTokens: config.codexMaxTokens,
        },
        schedulerBrief,
        repoTree,
        focusTree,
        fileContexts,
        plannedDeletePaths,
        fallbackCommitMessage,
        token,
        owner,
        repo
    )
    const summary = execResult.summary
    const prTitle = execResult.prTitle?.trim() || execResult.commitTitle?.trim() || fallbackCommitMessage
    const prBody = buildPrBodyFromCodexMarkdown({
        branch,
        taskHash,
        issueNumber,
        markdown: execResult.markdown,
    })
    logDob("runner.codex_exec_result", {
        issueNumber,
        issueTitle,
        branch,
        summary,
        commitTitle: execResult.commitTitle,
        prTitle: execResult.prTitle,
        markdown: execResult.markdown,
    })

    let prNumber = existingState?.prNumber ?? 0
    let prUrl = ""
    if (!existingState) {
        const pr = await client.request("POST", `/repos/${owner}/${repo}/pulls`, {
            token,
            body: {
                title: prTitle,
                head: branch,
                base: baseBranch,
                body: prBody,
            },
        })
        prNumber = Number((pr as { number?: unknown })?.number)
        prUrl = String((pr as { html_url?: unknown })?.html_url ?? "")
    } else {
        const pr = await client.request("GET", `/repos/${owner}/${repo}/pulls/${existingState.prNumber}`, { token })
        prUrl = String((pr as { html_url?: unknown })?.html_url ?? "")
    }

    await client.request("POST", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        token,
        body: {
            body: [
                BOT_MARKER,
                prUrl ? `PR: ${prUrl}` : "",
                "",
                execResult.markdown.trim(),
                "",
                buildDobBotMetaComment({ branch, prNumber, taskHash, issueNumber }),
            ]
                .filter(Boolean)
                .join("\n"),
        },
    })
    await appendProcessedTask({
        taskHash,
        issueNumber,
        source: task.source,
        action: "code_change",
        createdAt: new Date().toISOString(),
    })
    logDob("runner.handle_issue.finish", {
        issueNumber,
        issueTitle,
        branch,
        prNumber,
        prUrl,
        summary,
    })
}

/**
 * 构造 Conventional Commit 风格提交信息。
 * @param {{ issueNumber: number; objective: string; fileHints: string[] }} params
 * @returns {string}
 */
function buildConventionalCommitMessage({
    issueNumber,
    objective,
    fileHints,
}: {
    issueNumber: number
    objective: string
    fileHints: string[]
}): string {
    const lower = objective.toLowerCase()
    let type = "chore"
    if (/[修复]|fix|bug/.test(objective) || lower.includes("fix") || lower.includes("bug")) type = "fix"
    else if (
        /[新增添加实现]|feat|feature|implement/.test(objective) ||
        lower.includes("feat") ||
        lower.includes("feature") ||
        lower.includes("implement")
    )
        type = "feat"
    else if (/[重构]|refactor/.test(objective) || lower.includes("refactor")) type = "refactor"
    else if (/[性能]|perf/.test(objective) || lower.includes("perf")) type = "perf"
    else if (/[文档]|docs/.test(objective) || lower.includes("docs")) type = "docs"

    const scope = inferScopeFromPaths(fileHints)
    const subject = inferSubjectFromObjective(objective) || `issue #${issueNumber}`
    return scope ? `${type}(${scope}): ${subject}` : `${type}: ${subject}`
}

/**
 * 从路径推断 scope。
 * @param {string[]} paths
 * @returns {string}
 */
function inferScopeFromPaths(paths: string[]): string {
    const normalized = paths.map(p => p.replaceAll("\\", "/"))
    if (normalized.some(p => /src\/views\/Home\.vue$/i.test(p))) return "home"
    if (normalized.some(p => /src\/views\//i.test(p))) return "views"
    if (normalized.some(p => /server\//i.test(p))) return "server"
    if (normalized.some(p => /mcp_server\//i.test(p))) return "mcp"
    if (normalized.some(p => /src\//i.test(p))) return "app"
    return ""
}

/**
 * 从 objective 推断 subject（尽量短）。
 * @param {string} objective
 * @returns {string}
 */
function inferSubjectFromObjective(objective: string): string {
    const trimmed = objective.trim()
    if (!trimmed) return ""
    // 简单兜底：去掉路径和引号，保留前 60 字符。
    const normalized = trimmed
        .replace(/`[^`]+`/g, "")
        .replace(/\s+/g, " ")
        .trim()
    return normalized.length > 60 ? `${normalized.slice(0, 60).trim()}...` : normalized
}

/**
 * 直接复用 Codex 输出的 Markdown 作为 PR 正文，仅追加隐藏元信息。
 * @param {{ branch: string; taskHash: string; issueNumber: number; markdown: string }} params
 * @returns {string}
 */
function buildPrBodyFromCodexMarkdown({
    branch,
    taskHash,
    issueNumber,
    markdown,
}: {
    branch: string
    taskHash: string
    issueNumber: number
    markdown: string
}): string {
    const trimmedMarkdown = markdown.trim()
    return [
        BOT_MARKER,
        buildDobBotMetaComment({ branch, prNumber: 0, taskHash, issueNumber }),
        "",
        trimmedMarkdown || "## 问题分析\n- Codex 未返回 Markdown 总结。",
    ].join("\n")
}

/**
 * 把 dob-bot 元信息写入 HTML 注释，避免在 PR/评论正文里重复刷屏，但仍可用于状态追踪与去重。
 * @param {{ branch: string; prNumber: number; taskHash: string; issueNumber: number }} params
 * @returns {string}
 */
function buildDobBotMetaComment({
    branch,
    prNumber,
    taskHash,
    issueNumber,
}: {
    branch: string
    prNumber: number
    taskHash: string
    issueNumber: number
}): string {
    const lines = [
        "dob-bot-meta",
        `issue: #${issueNumber}`,
        branch ? `branch: ${branch}` : "",
        prNumber > 0 ? `pr: #${prNumber}` : "",
        taskHash ? `task-hash: ${taskHash}` : "",
    ].filter(Boolean)
    return `<!--\n${lines.join("\n")}\n-->`
}

/**
 * 判断 @dob-bot 指令来源是否在白名单内。
 * @param {string} login
 * @returns {boolean}
 */
function isAllowedMentionAuthor(login: string): boolean {
    const normalized = login.trim().toLowerCase()
    if (!normalized) return false
    const allowlist = config.allowedMentionAuthors.map(item => item.toLowerCase())
    if (allowlist.length === 0) return true
    return allowlist.includes(normalized)
}

/**
 * 清理模型返回的仓库相对路径。
 * @param {string} value
 * @returns {string}
 */
function normalizeRepoPath(value: string): string {
    return value
        .trim()
        .replace(/^[-*]\s*/, "")
        .replace(/^`+|`+$/g, "")
        .replace(/^"+|"+$/g, "")
        .replace(/^'+|'+$/g, "")
        .replaceAll("\\", "/")
}

/**
 * 获取本地仓库根目录。
 * @returns {Promise<string>}
 */
async function getRepoRoot(): Promise<string> {
    const { stdout } = await runGit(process.cwd(), ["rev-parse", "--show-toplevel"])
    return stdout.trim() || process.cwd()
}

/**
 * 读取本地仓库文件。
 * @param {string} repoRoot
 * @param {string} relPath
 * @returns {Promise<string>}
 */
async function readRepoFile(repoRoot: string, relPath: string): Promise<string> {
    const resolved = path.resolve(repoRoot, relPath)
    ensureInsideRoot(repoRoot, resolved)
    return await fs.readFile(resolved, "utf8")
}

/**
 * 生成仓库文件树摘要。
 * @param {string} repoRoot
 * @returns {Promise<string>}
 */
async function buildRepoTree(repoRoot: string): Promise<string> {
    const { stdout } = await runGit(repoRoot, ["ls-files"])
    return stdout
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .filter(file => /\.(ts|tsx|js|jsx|vue|json|md|yml|yaml|toml|rs)$/i.test(file))
        .filter(file => !file.startsWith("node_modules/"))
        .slice(0, 3000)
        .join("\n")
}

/**
 * 计算任务 hash。
 * @param {string} source
 * @param {string} instruction
 * @returns {string}
 */
function computeTaskHash(source: string, instruction: string): string {
    return crypto.createHash("sha256").update(`${source}\n${instruction}`).digest("hex").slice(0, 16)
}

/**
 * 判断任务是否已处理。
 * @param {{ client: ReturnType<typeof createGithubClient>, token: string, owner: string, repo: string, issueNumber: number, taskHash: string }} params
 * @returns {Promise<boolean>}
 */
async function isTaskAlreadyProcessed({
    client,
    token,
    owner,
    repo,
    issueNumber,
    taskHash,
}: {
    client: ReturnType<typeof createGithubClient>
    token: string
    owner: string
    repo: string
    issueNumber: number
    taskHash: string
}): Promise<boolean> {
    const comments = await client.request("GET", `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        token,
        query: { per_page: 100 },
    })
    if (!Array.isArray(comments)) return false

    const matched = comments.find(c => String((c as { body?: unknown })?.body ?? "").includes(`dob-bot-task-hash: ${taskHash}`))
    if (!matched) return false

    const body = String((matched as { body?: unknown })?.body ?? "")
    const prMatch = body.match(/dob-bot-pr:\s*#(\d+)/)
    const prNumber = Number(prMatch?.[1] ?? "")
    if (Number.isFinite(prNumber) && prNumber > 0) {
        const prExists = await doesPullRequestExist(client, token, owner, repo, prNumber)
        return prExists
    }

    // 找到了 hash 但没有 PR 信息，按已处理处理，避免重复刷屏。
    return true
}

/**
 * 检查 PR 是否存在（被删除/不可见时返回 false）。
 * @param {ReturnType<typeof createGithubClient>} client
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<boolean>}
 */
async function doesPullRequestExist(
    client: ReturnType<typeof createGithubClient>,
    token: string,
    owner: string,
    repo: string,
    prNumber: number
): Promise<boolean> {
    try {
        await client.request("GET", `/repos/${owner}/${repo}/pulls/${prNumber}`, { token })
        return true
    } catch (error) {
        // GitHub 会对不存在/无权限返回 404；这里统一视为不存在，允许重新跑。
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
            return false
        }
        // 其他错误保守处理：认为存在，避免误触发重复。
        return true
    }
}

/**
 * 去重数组。
 * @param {string[]} values
 * @returns {string[]}
 */
function unique(values: string[]): string[] {
    return [...new Set(values.map(v => v.trim()).filter(Boolean))]
}

/**
 * 运行 git 命令。
 * @param {string} cwd
 * @param {string[]} args
 * @returns {Promise<{ stdout: string; stderr: string }>}
 */
async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return await execFileAsync("git", args, {
        cwd,
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
    })
}

/**
 * 生成短随机后缀。
 * @returns {string}
 */
function shortId(): string {
    return crypto.randomBytes(3).toString("hex")
}

/**
 * 确保路径没有越界。
 * @param {string} root
 * @param {string} target
 * @returns {void}
 */
function ensureInsideRoot(root: string, target: string): void {
    const normalizedRoot = path.resolve(root) + path.sep
    if (!target.startsWith(normalizedRoot)) {
        throw new Error(`路径越界: ${target}`)
    }
}
