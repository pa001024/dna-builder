import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { planCodexEdits } from "./codex.ts"
import { config } from "./config.ts"
import type { SchedulerBrief } from "./scheduler.ts"
import { buildSchedulerBrief } from "./scheduler.ts"

const execFileAsync = promisify(execFile)

/**
 * 调试 scheduler / codex 的计划输入。
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
    const repoRoot = await getRepoRoot()
    const repoTree = await buildRepoTree(repoRoot)
    const focusTree = repoTree
        .split("\n")
        .filter(file => file.startsWith("apps/dob-bot/"))
        .join("\n")
    const args = process.argv.slice(2)
    const directMode = args.includes("--direct")
    const prompt = args
        .filter(arg => arg !== "--direct")
        .join(" ")
        .trim()
    const instruction =
        prompt || "请搜索并读取与主页标题相关的文件，确认如何把主页标题改成 DNA Tools，优先并行使用 search_repo 与 read_repo_file。"

    const brief = directMode
        ? buildDirectBrief(instruction)
        : await buildSchedulerBrief(
              {
                  apiKey: config.llmApiKey,
                  baseUrl: config.llmBaseUrl,
                  model: config.schedulerModel,
                  fallbackModel: config.schedulerFallbackModel,
                  temperature: config.schedulerTemperature,
                  maxTokens: config.schedulerMaxTokens,
              },
              "test",
              "测试",
              instruction
          )
    console.log(`BRIEF=${JSON.stringify(brief, null, 2)}`)

    const plan = await planCodexEdits(
        {
            apiKey: config.llmApiKey,
            baseUrl: config.llmBaseUrl,
            model: config.codexModel,
            temperature: config.codexTemperature,
            maxTokens: config.codexMaxTokens,
        },
        brief,
        repoTree,
        focusTree,
        {
            onToolRound: round => {
                console.log(`TOOL_ROUND_${round.step}=${JSON.stringify(round.toolCalls, null, 2)}`)
            },
        }
    )
    console.log(`PLAN=${JSON.stringify(plan, null, 2)}`)

    const fileContexts = await Promise.all(
        plan.read_paths.map(async relPath => ({
            path: relPath,
            content: await readRepoFile(repoRoot, relPath),
        }))
    )
    console.log(
        `CTX=${JSON.stringify(
            fileContexts.map(item => item.path),
            null,
            2
        )}`
    )

    console.log(
        `EXEC_INPUT=${JSON.stringify(
            {
                model: config.codexModel,
                objective: brief.objective,
                read_paths: fileContexts.map(item => item.path),
                delete_paths: plan.delete_paths,
                commit_message: plan.commit_message,
            },
            null,
            2
        )}`
    )
}

/**
 * 获取仓库根目录。
 * @returns {Promise<string>}
 */
async function getRepoRoot(): Promise<string> {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
        cwd: process.cwd(),
        windowsHide: true,
    })
    return stdout.trim() || process.cwd()
}

/**
 * 构建文件树摘要。
 * @param {string} repoRoot
 * @returns {Promise<string>}
 */
async function buildRepoTree(repoRoot: string): Promise<string> {
    const { stdout } = await execFileAsync("git", ["ls-files"], {
        cwd: repoRoot,
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
    })

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
 * 读取仓库文件。
 * @param {string} repoRoot
 * @param {string} relPath
 * @returns {Promise<string>}
 */
async function readRepoFile(repoRoot: string, relPath: string): Promise<string> {
    const resolved = path.resolve(repoRoot, relPath)
    return await fs.readFile(resolved, "utf8")
}

await main()

/**
 * 直接构造调试用 brief，跳过 scheduler。
 * @param {string} instruction
 * @returns {SchedulerBrief}
 */
function buildDirectBrief(instruction: string): SchedulerBrief {
    return {
        kind: "code_change",
        objective: instruction,
        constraints: [],
        file_hints: [],
        clarification_question: null,
    }
}
