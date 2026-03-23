import { execFile, spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { type AIMessageChunk, type BaseMessage, HumanMessage, SystemMessage, type ToolMessage } from "@langchain/core/messages"
import { tool } from "@langchain/core/tools"
import { ChatOpenAIResponses } from "@langchain/openai"
import { z } from "zod"
import { clipLogText, logDob } from "./log.ts"
import type { SchedulerBrief } from "./scheduler.ts"

const execFileAsync = promisify(execFile)

export const CodexReadPlanSchema = z.object({
    summary: z.string().default(""),
    commit_message: z.string().default(""),
    read_paths: z.array(z.string()).default([]),
    delete_paths: z.array(z.string()).default([]),
    clarification_question: z.string().nullable().optional(),
})

export type CodexReadPlan = z.infer<typeof CodexReadPlanSchema>

export type CodexConfig = {
    apiKey: string
    baseUrl: string
    model: string
    temperature: number
    maxTokens: number
}

export type CodexExecutionResult = {
    summary: string
    markdown: string
    commitTitle?: string
    prTitle?: string
    problemAnalysis?: string
    implementation?: string[]
    verification?: string[]
    commitSha?: string
    changedFiles?: string[]
}

export type CodexPlanDebugOptions = {
    onToolRound?: (round: {
        step: number
        toolCalls: Array<{
            name: string
            args: unknown
        }>
    }) => void
}

/**
 * 生成本地仓库修改计划。
 * @param {CodexConfig} config
 * @param {SchedulerBrief} brief
 * @param {string} repoTree
 * @param {string} focusTree
 * @returns {Promise<CodexReadPlan>}
 */
export async function planCodexEdits(
    config: CodexConfig,
    brief: SchedulerBrief,
    repoTree: string,
    focusTree: string,
    options?: CodexPlanDebugOptions
): Promise<CodexReadPlan> {
    const repoRoot = await getRepoRoot()
    const readPaths: string[] = []
    const searchRepoTool = tool(
        async ({ pattern, paths_include_glob, max_results }) => {
            logDob("codex.tool.search_repo.call", {
                pattern,
                paths_include_glob,
                max_results,
            })
            const result = await searchRepo(repoRoot, pattern, paths_include_glob, max_results)
            logDob("codex.tool.search_repo.result", result)
            return result
        },
        {
            name: "search_repo",
            description:
                "用 rg 在 dna-builder 仓库中搜索文本。pattern 必须是 rg 正则表达式，不是自然语言。适合先定位文件、符号或关键字符串，再决定是否读取文件。",
            schema: z.object({
                pattern: z.string().describe("rg 正则模式，例如 Home\\.vue、defineStore\\( 或 DNA\\s+Builder"),
                paths_include_glob: z.string().optional().describe("可选的 rg -g glob，例如 src/**/*.vue"),
                max_results: z.number().int().min(1).max(50).default(20).describe("最多返回多少行匹配结果"),
            }),
        }
    )
    const readRepoFileTool = tool(
        async ({ file_path, line_start, max_lines }) => {
            const normalizedPath = normalizeRepoPath(file_path)
            logDob("codex.tool.read_repo_file.call", {
                file_path: normalizedPath,
                line_start,
                max_lines,
            })
            const content = await readRepoFile(repoRoot, normalizedPath, line_start, max_lines)
            if (!readPaths.includes(normalizedPath)) {
                readPaths.push(normalizedPath)
            }
            logDob("codex.tool.read_repo_file.result", content)
            return [`PATH: ${normalizedPath}`, "", content].join("\n")
        },
        {
            name: "read_repo_file",
            description: "按范围读取 dna-builder 仓库中的文本文件。支持起始行和最大行数，返回内容会带行号。",
            schema: z.object({
                file_path: z.string().describe("仓库相对路径，例如 src/views/Home.vue"),
                line_start: z.number().int().min(1).default(1).describe("从第几行开始读取，1-based"),
                max_lines: z.number().int().min(1).max(400).default(120).describe("最多读取多少行"),
            }),
        }
    )

    const model = new ChatOpenAIResponses({
        apiKey: config.apiKey,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        configuration: {
            baseURL: config.baseUrl,
        },
    }).bindTools([searchRepoTool, readRepoFileTool])

    const messages: BaseMessage[] = [
        new SystemMessage(
            [
                "你是 dob-bot 的执行层，负责为后续 codex exec 收集最少且足够的文件上下文。",
                "不要直接给出 read_paths 文本列表。",
                "如果还不确定该看哪些文件，先调用 search_repo。",
                "search_repo 的 pattern 参数是 rg 正则表达式，不是自然语言，也不是 SQL like。",
                "如果需要看文件，必须调用 read_repo_file 工具。",
                "read_repo_file 必须优先使用小范围读取；先读相关片段，不要一上来整文件扫完。",
                "当你已经拿到足够上下文时，停止调用工具，并用一句简短中文总结说明你已经准备好让 codex exec 修改代码。",
                "不要请求与任务无关的文件。",
                "当前任务作用域是整个 dna-builder 仓库。",
                "如果任务与 dob-bot / webhook / scheduler / codex / issue_comment 有关，优先看 apps/dob-bot 下的文件。",
            ].join("\n")
        ),
        new HumanMessage(
            [
                `任务摘要: ${brief.objective}`,
                `约束: ${brief.constraints.join("；") || "无"}`,
                `文件线索: ${brief.file_hints.join("，") || "无"}`,
                `dob-bot 聚焦文件树: ${focusTree}`,
                `仓库文件树: ${repoTree}`,
            ].join("\n\n")
        ),
    ]
    logDob("codex.plan.start", {
        model: config.model,
        objective: brief.objective,
        constraints: brief.constraints,
        file_hints: brief.file_hints,
    })

    for (let step = 0; step < 8; step += 1) {
        const response = await streamResponse(model, messages)
        messages.push(response)
        logDob("codex.plan.model_response", {
            step: step + 1,
            text: extractMessageText(response),
            tool_calls: response.tool_calls ?? [],
        })

        if (!response.tool_calls?.length) {
            const result = {
                summary: extractMessageText(response) || "已完成读文件上下文收集",
                commit_message: "",
                read_paths: readPaths,
                delete_paths: [],
                clarification_question: null,
            }
            logDob("codex.plan.result", result)
            return {
                ...result,
            }
        }

        options?.onToolRound?.({
            step: step + 1,
            toolCalls: response.tool_calls.map(toolCall => ({
                name: toolCall.name,
                args: toolCall.args,
            })),
        })

        const toolResults = await Promise.all(
            response.tool_calls.map(async toolCall => {
                if (toolCall.name === "search_repo") {
                    return await searchRepoTool.invoke(toolCall)
                }
                if (toolCall.name === "read_repo_file") {
                    return await readRepoFileTool.invoke(toolCall)
                }
                return null
            })
        )

        for (const result of toolResults) {
            if (!result) continue
            messages.push(result as ToolMessage)
        }
    }

    const result = {
        summary: "已达到最大读文件轮次，继续执行已有上下文",
        commit_message: "",
        read_paths: readPaths,
        delete_paths: [],
        clarification_question: null,
    }
    logDob("codex.plan.result", result)
    return result
}

/**
 * 在本地工作树里直接调用 codex CLI 修改代码，然后提交并推送。
 * @param {string} repoRoot
 * @param {string} branch
 * @param {string} baseRef
 * @param {CodexConfig} config
 * @param {SchedulerBrief} brief
 * @param {string} repoTree
 * @param {string} focusTree
 * @param {Array<{ path: string; content: string }>} fileContexts
 * @param {string[]} deletePaths
 * @param {string} commitMessage
 * @param {string} pushToken
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<CodexExecutionResult>}
 */
export async function applyCodexPlanToLocalWorktree(
    repoRoot: string,
    branch: string,
    baseRef: string,
    config: CodexConfig,
    brief: SchedulerBrief,
    repoTree: string,
    focusTree: string,
    fileContexts: Array<{ path: string; content: string }>,
    deletePaths: string[],
    commitMessage: string,
    pushToken: string,
    owner: string,
    repo: string
): Promise<CodexExecutionResult> {
    const worktreePath = path.join(os.tmpdir(), "dob-bot", branch.replaceAll("/", "_"))
    const summaryPath = path.join(os.tmpdir(), "dob-bot", `${branch.replaceAll("/", "_")}.last-message.txt`)
    await fs.mkdir(path.dirname(worktreePath), { recursive: true })
    await fs.rm(worktreePath, { recursive: true, force: true }).catch(() => null)
    await fs.rm(summaryPath, { force: true }).catch(() => null)

    await runGit(repoRoot, ["fetch", "origin", "--prune"])
    await runGit(repoRoot, ["worktree", "add", "-B", branch, worktreePath, baseRef])

    try {
        const prompt = buildCodexExecPrompt(brief, repoTree, focusTree, fileContexts, deletePaths)
        logDob("codex.exec.start", {
            branch,
            baseRef,
            model: config.model,
            prompt,
        })
        const execResult = await runCodexExec(worktreePath, summaryPath, config.model, prompt)

        await runGit(worktreePath, ["add", "-A"])
        const status = await runGit(worktreePath, ["status", "--porcelain"])
        if (!status.stdout.trim()) {
            throw new Error("codex exec 没有产生任何变更")
        }
        const staged = await runGit(worktreePath, ["diff", "--cached", "--name-only"])

        await runGit(worktreePath, ["commit", "-m", commitMessage])
        const commitSha = (await runGit(worktreePath, ["rev-parse", "HEAD"])).stdout.trim()
        const changedFiles = staged.stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
        await runGit(worktreePath, ["push", buildGithubPushUrl(owner, repo, pushToken), `HEAD:${branch}`])

        await runGit(repoRoot, ["worktree", "remove", "--force", worktreePath]).catch(() => null)
        await fs.rm(summaryPath, { force: true }).catch(() => null)
        logDob("codex.exec.finish", {
            branch,
            worktreePath,
            summary: execResult.summary,
        })
        return {
            summary: execResult.summary,
            markdown: execResult.markdown,
            commitTitle: execResult.commitTitle,
            prTitle: execResult.prTitle,
            problemAnalysis: execResult.problemAnalysis,
            implementation: execResult.implementation,
            verification: execResult.verification,
            commitSha,
            changedFiles,
        }
    } catch (error) {
        await runGit(repoRoot, ["worktree", "remove", "--force", worktreePath]).catch(() => null)
        await fs.rm(summaryPath, { force: true }).catch(() => null)
        throw error
    }
}

/**
 * 不创建 worktree，直接在本地仓库切分支、运行 codex、提交并推送。
 * @param {string} repoRoot
 * @param {string} branch
 * @param {string} baseRef
 * @param {CodexConfig} config
 * @param {SchedulerBrief} brief
 * @param {string} repoTree
 * @param {string} focusTree
 * @param {Array<{ path: string; content: string }>} fileContexts
 * @param {string[]} deletePaths
 * @param {string} commitMessage
 * @param {string} pushToken
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<CodexExecutionResult>}
 */
export async function applyCodexPlanToLocalBranch(
    repoRoot: string,
    branch: string,
    baseRef: string,
    config: CodexConfig,
    brief: SchedulerBrief,
    repoTree: string,
    focusTree: string,
    fileContexts: Array<{ path: string; content: string }>,
    deletePaths: string[],
    commitMessage: string,
    pushToken: string,
    owner: string,
    repo: string
): Promise<CodexExecutionResult> {
    const summaryPath = path.join(os.tmpdir(), "dob-bot", `${branch.replaceAll("/", "_")}.last-message.txt`)
    await fs.mkdir(path.dirname(summaryPath), { recursive: true })
    await fs.rm(summaryPath, { force: true }).catch(() => null)

    const originalBranch = (await runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).stdout.trim()
    const originalSha = (await runGit(repoRoot, ["rev-parse", "HEAD"])).stdout.trim()

    await runGit(repoRoot, ["fetch", "origin", "--prune"])

    try {
        logDob("codex.branch.checkout", {
            branch,
            baseRef,
        })
        await runGit(repoRoot, ["checkout", "-B", branch, baseRef])

        const prompt = buildCodexExecPrompt(brief, repoTree, focusTree, fileContexts, deletePaths)
        logDob("codex.exec.start", {
            branch,
            baseRef,
            model: config.model,
            prompt,
        })
        const execResult = await runCodexExec(repoRoot, summaryPath, config.model, prompt)

        // Stage everything except dob-bot's own files, to avoid accidentally committing bot runtime state or the untracked app folder.
        await runGit(repoRoot, ["add", "-A", "--", ".", ":(exclude)apps/dob-bot", ":(exclude)apps/dob-bot/**"])

        const staged = await runGit(repoRoot, ["diff", "--cached", "--name-only"])
        if (!staged.stdout.trim()) {
            throw new Error("codex exec 已运行，但没有产生任何可提交的变更")
        }

        await runGit(repoRoot, ["commit", "--no-verify", "-m", execResult.commitTitle?.trim() || commitMessage])
        const commitSha = (await runGit(repoRoot, ["rev-parse", "HEAD"])).stdout.trim()
        const changedFiles = staged.stdout
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
        await runGit(repoRoot, ["push", buildGithubPushUrl(owner, repo, pushToken), `HEAD:${branch}`])

        await fs.rm(summaryPath, { force: true }).catch(() => null)
        logDob("codex.exec.finish", {
            branch,
            summary: execResult.summary,
        })
        return {
            summary: execResult.summary,
            markdown: execResult.markdown,
            commitTitle: execResult.commitTitle,
            prTitle: execResult.prTitle,
            problemAnalysis: execResult.problemAnalysis,
            implementation: execResult.implementation,
            verification: execResult.verification,
            commitSha,
            changedFiles,
        }
    } finally {
        // Best-effort restore previous checkout, even if push/commit fails.
        const restoreTarget = originalBranch && originalBranch !== "HEAD" ? originalBranch : originalSha
        await runGit(repoRoot, ["checkout", restoreTarget]).catch(() => null)
        await fs.rm(summaryPath, { force: true }).catch(() => null)
    }
}

/**
 * 构造发给 codex exec 的执行提示词。
 * @param {SchedulerBrief} brief
 * @param {string} repoTree
 * @param {string} focusTree
 * @param {Array<{ path: string; content: string }>} fileContexts
 * @param {string[]} deletePaths
 * @returns {string}
 */
function buildCodexExecPrompt(
    brief: SchedulerBrief,
    repoTree: string,
    focusTree: string,
    fileContexts: Array<{ path: string; content: string }>,
    deletePaths: string[]
): string {
    void repoTree
    void focusTree
    void fileContexts
    void deletePaths

    const objective = String(brief.objective || "").trim()
    const constraints = (brief.constraints ?? [])
        .map(s => String(s).trim())
        .filter(Boolean)
        .join(" | ")
    const hints = (brief.file_hints ?? [])
        .map(s => String(s).trim())
        .filter(Boolean)
        .join(" | ")

    return [
        "EXECUTE NOW. Do not ask questions. Do not read memories. Do not commit or push.",
        "Edit the requested code in the current repository.",
        "All shell commands must use bash (Git Bash). Do not use PowerShell or pwsh.",
        "After finishing the edits, run verification commands from the repository root: pnpm lint and pnpm test.",
        "If a command fails, keep the real failure output and continue to the final report. Do not claim commands were not run unless the shell itself is unavailable.",
        "At the end, output ONLY Markdown. No JSON. No code fence wrapper around the whole answer.",
        "Use this exact section layout in Chinese:",
        "## 提交标题",
        "<one Conventional Commit title line>",
        "## PR 标题",
        "<one PR title line>",
        "## 问题分析",
        "<short paragraph or bullets>",
        "## 实现",
        "<bullets>",
        "## 验证",
        "<bullets with actual pnpm lint / pnpm test results>",
        `Objective: ${objective}`,
        `Constraints: ${constraints || "none"}`,
        `File hints: ${hints || "none"}`,
    ].join(" ")
}

/**
 * 调用 codex exec 并返回结构化结果。
 * @param {string} worktreePath
 * @param {string} summaryPath
 * @param {string} model
 * @param {string} prompt
 * @returns {Promise<CodexExecutionResult>}
 */
async function runCodexExec(worktreePath: string, summaryPath: string, model: string, prompt: string): Promise<CodexExecutionResult> {
    const codexArgs = [
        "exec",
        "-c",
        "features.memories=false",
        "-",
        "--cd",
        worktreePath,
        "--dangerously-bypass-approvals-and-sandbox",
        "-m",
        model,
        "--output-last-message",
        summaryPath,
        "--color",
        "never",
    ]

    const command = process.platform === "win32" ? "codex.cmd" : "codex"
    const args = codexArgs
    logDob("codex.exec.command", {
        command,
        args,
        cwd: worktreePath,
        prompt: clipLogText(prompt, 6000),
    })

    const { code, stdout, stderr } = await spawnAndWait(command, args, worktreePath, prompt)
    logDob("codex.exec.process_result", {
        code,
        stdout,
        stderr,
    })
    if (code !== 0) {
        throw new Error(
            [
                `codex exec 失败，退出码: ${code}`,
                stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
                stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
            ]
                .filter(Boolean)
                .join("\n\n")
        )
    }

    const summaryText = (await fs.readFile(summaryPath, "utf8").catch(() => "")).trim() || extractCodexSummary(stdout, stderr)
    if (!summaryText) {
        throw new Error("codex exec 已完成，但没有返回总结消息")
    }
    return parseCodexMarkdownResult(summaryText)
}

/**
 * 从 codex CLI 输出中提取最后一段回答，兼容未生成 output-last-message 文件的情况。
 * @param {string} stdout
 * @param {string} stderr
 * @returns {string}
 */
function extractCodexSummary(stdout: string, stderr: string): string {
    const stdoutText = stdout.trim()
    if (stdoutText) return stdoutText

    const stderrText = stderr.trim()
    if (!stderrText) return ""

    const match = stderrText.match(/\ncodex\n([\s\S]*?)\ntokens used\b/)
    if (match?.[1]?.trim()) {
        return match[1].trim()
    }

    return ""
}

/**
 * 解析 codex exec 的 Markdown 最终结果。
 * @param {string} text
 * @returns {CodexExecutionResult}
 */
function parseCodexMarkdownResult(text: string): CodexExecutionResult {
    const markdown = text.trim()
    const commitTitle = extractMarkdownSection(markdown, "提交标题")
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean)
    const prTitle = extractMarkdownSection(markdown, "PR 标题")
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean)
    const problemAnalysis = extractMarkdownSection(markdown, "问题分析").trim()
    const implementation = extractMarkdownBullets(extractMarkdownSection(markdown, "实现"))
    const verification = extractMarkdownBullets(extractMarkdownSection(markdown, "验证"))
    const summary =
        implementation[0] ||
        problemAnalysis ||
        markdown
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(Boolean) ||
        "已完成代码修改"

    return {
        summary,
        markdown,
        commitTitle,
        prTitle,
        problemAnalysis,
        implementation,
        verification,
    }
}

/**
 * 读取指定 Markdown 二级标题的内容。
 * @param {string} markdown
 * @param {string} heading
 * @returns {string}
 */
function extractMarkdownSection(markdown: string, heading: string): string {
    const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(`(?:^|\\n)##\\s*${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i")
    const match = markdown.match(pattern)
    return match?.[1]?.trim() ?? ""
}

/**
 * 从 Markdown 文本中提取 bullet 列表。
 * @param {string} section
 * @returns {string[]}
 */
function extractMarkdownBullets(section: string): string[] {
    return section
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => /^[-*]\s+/.test(line))
        .map(line => line.replace(/^[-*]\s+/, "").trim())
        .filter(Boolean)
}

/**
 * 运行子进程并写入 stdin。
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {string} stdinText
 * @returns {Promise<{ code: number | null; stdout: string; stderr: string }>}
 */
async function spawnAndWait(
    command: string,
    args: string[],
    cwd: string,
    stdinText: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
        })

        const stdoutChunks: string[] = []
        const stderrChunks: string[] = []

        child.stdout.on("data", chunk => {
            const text = String(chunk)
            stdoutChunks.push(text)
            logDob("codex.exec.stdout", text)
        })
        child.stderr.on("data", chunk => {
            const text = String(chunk)
            stderrChunks.push(text)
            logDob("codex.exec.stderr", text)
        })
        child.on("error", reject)
        child.on("close", code => {
            resolve({
                code,
                stdout: stdoutChunks.join(""),
                stderr: stderrChunks.join(""),
            })
        })

        child.stdin.write(stdinText)
        child.stdin.end()
    })
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
 * 构造带 GitHub App installation token 的 push URL。
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @returns {string}
 */
function buildGithubPushUrl(owner: string, repo: string, token: string): string {
    return `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${repo}.git`
}

/**
 * 用 rg 搜索仓库文本。
 * @param {string} repoRoot
 * @param {string} pattern
 * @param {string | undefined} includeGlob
 * @param {number | undefined} maxResults
 * @returns {Promise<string>}
 */
async function searchRepo(repoRoot: string, pattern: string, includeGlob?: string, maxResults?: number): Promise<string> {
    const normalizedPattern = pattern.trim()
    if (!normalizedPattern) {
        return "search_repo: 空 pattern，未执行搜索"
    }

    const args = ["-n", "--no-heading", "-S", "--color", "never"]
    if (includeGlob?.trim()) {
        args.push("-g", includeGlob.trim())
    }
    args.push(normalizedPattern, ".")

    try {
        const { stdout } = await execFileAsync("rg", args, {
            cwd: repoRoot,
            windowsHide: true,
            maxBuffer: 20 * 1024 * 1024,
        })
        const lines = stdout
            .split(/\r?\n/)
            .map(line => line.trimEnd())
            .filter(Boolean)
            .slice(0, Math.max(1, Math.min(maxResults ?? 20, 50)))

        return lines.length > 0 ? lines.join("\n") : "search_repo: 未找到匹配"
    } catch (error) {
        const e = error as { code?: number; stdout?: string; stderr?: string }
        if (e.code === 1) {
            return "search_repo: 未找到匹配"
        }
        throw new Error(
            [
                `search_repo 执行失败: ${normalizedPattern}`,
                e.stdout?.trim() ? `stdout:\n${e.stdout.trim()}` : "",
                e.stderr?.trim() ? `stderr:\n${e.stderr.trim()}` : "",
            ]
                .filter(Boolean)
                .join("\n\n")
        )
    }
}

/**
 * 流式调用模型并拼接完整回复。
 * @param {ReturnType<ChatOpenAIResponses["bindTools"]>} model
 * @param {BaseMessage[]} messages
 * @returns {Promise<AIMessageChunk>}
 */
async function streamResponse(model: ReturnType<ChatOpenAIResponses["bindTools"]>, messages: BaseMessage[]): Promise<AIMessageChunk> {
    const stream = await model.stream(messages)

    let merged: AIMessageChunk | null = null
    for await (const chunk of stream) {
        merged = merged ? merged.concat(chunk) : chunk
    }
    if (!merged) {
        throw new Error("LangChain tool loop 没有返回任何内容")
    }
    return merged
}

/**
 * 提取消息里的纯文本。
 * @param {AIMessageChunk} message
 * @returns {string}
 */
function extractMessageText(message: AIMessageChunk): string {
    if (typeof message.content === "string") return message.content.trim()
    if (!Array.isArray(message.content)) return ""
    const texts: string[] = []
    for (const part of message.content) {
        if (!part || typeof part !== "object") continue
        const block = part as { type?: unknown; text?: unknown }
        if (block.type === "text" && typeof block.text === "string") {
            texts.push(block.text)
        }
    }
    return texts.join("").trim()
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
 * 读取仓库文件。
 * @param {string} repoRoot
 * @param {string} relPath
 * @param {number} lineStart
 * @param {number} maxLines
 * @returns {Promise<string>}
 */
async function readRepoFile(repoRoot: string, relPath: string, lineStart = 1, maxLines = 120): Promise<string> {
    const resolved = path.resolve(repoRoot, relPath)
    ensureInsideRoot(repoRoot, resolved)
    const content = await fs.readFile(resolved, "utf8")
    const lines = content.split(/\r?\n/)
    const safeLineStart = Math.max(1, Math.trunc(lineStart))
    const safeMaxLines = Math.max(1, Math.min(400, Math.trunc(maxLines)))
    const startIndex = safeLineStart - 1
    const selected = lines.slice(startIndex, startIndex + safeMaxLines)
    const endLine = startIndex + selected.length

    return [
        `LINE_START: ${safeLineStart}`,
        `LINE_END: ${endLine}`,
        `TOTAL_LINES: ${lines.length}`,
        "",
        selected.map((line, index) => `${safeLineStart + index}:${line}`).join("\n"),
    ].join("\n")
}

/**
 * 清理模型传回的仓库路径。
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
