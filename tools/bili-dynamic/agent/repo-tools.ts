/**
 * @file 只读仓库工具：列目录 / 读文件 / 搜代码 / 只读 git / 读技能。
 * 工具只返回文本，安全边界（路径与密钥过滤）在这一层统一处理。
 */

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { readSkillFile, type SkillEntry } from "./skills.ts"
import type { AgentTool } from "./tool.ts"

const MAX_FILE_BYTES = 200_000
const MAX_TOOL_OUTPUT = 8_000
const MAX_READ_LINES = 400

/** 这些路径不提供给模型：密钥、构建产物、数据转储 */
const BLOCKED_PATHS = [
    /(^|\/)\.env(\.|$)/i,
    /(^|\/)node_modules\//,
    /(^|\/)dist\//,
    /(^|\/)target\//,
    /(^|\/)(data|ai-logs)\//,
    /(^|\/)\.git\//,
    /\.(db|ddb)$/i,
    /(^|\/)keystore\.properties$/i,
]

const ALLOWED_GIT = new Set(["log", "show", "diff", "status", "ls-files", "describe", "rev-parse", "tag"])

function clip(text: string, limit = MAX_TOOL_OUTPUT): string {
    return text.length > limit ? `${text.slice(0, limit)}\n…（输出已截断）` : text
}

function normalize(relative: string): string {
    return relative.replaceAll("\\", "/").replace(/^\.\//, "")
}

function isBlocked(relative: string): boolean {
    return BLOCKED_PATHS.some(pattern => pattern.test(normalize(relative)))
}

function resolveInside(root: string, relative: string): string {
    const resolved = path.resolve(root, relative)
    const normalized = path.relative(root, resolved).replaceAll("\\", "/")
    if (!normalized || normalized.startsWith("..") || path.isAbsolute(normalized)) throw new Error(`路径不在仓库内：${relative}`)
    if (isBlocked(normalized)) throw new Error(`该路径不提供给模型：${relative}`)
    return resolved
}

/**
 * @description 构造只读仓库工具集。
 * @param root 仓库根目录
 * @param skills 已扫描到的本地技能
 * @returns 可直接挂到内核的工具列表
 */
export function createRepoAgentTools(root: string, skills: Map<string, SkillEntry>): AgentTool[] {
    const listDir: AgentTool = {
        concurrentSafe: true,
        definition: {
            name: "list_dir",
            description: "列出仓库内某个目录的文件与子目录（路径相对仓库根目录）。",
            parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
        },
        execute(args) {
            const dir = resolveInside(root, String(args.path ?? "."))
            if (!existsSync(dir)) throw new Error(`目录不存在：${args.path}`)
            const entries = readdirSync(dir, { withFileTypes: true })
                .map(entry => (entry.isDirectory() ? `${entry.name}/` : entry.name))
                .filter(name => !isBlocked(name))
                .slice(0, 300)
            return clip(entries.join("\n") || "（空目录）")
        },
    }

    const readFile: AgentTool = {
        concurrentSafe: true,
        definition: {
            name: "read_file",
            description: "读取仓库内一个文本文件，可指定起始行与行数。用于查看实现、文档与样式。",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string" },
                    offset: { type: "number" },
                    limit: { type: "number" },
                },
                required: ["path"],
            },
        },
        execute(args) {
            const file = resolveInside(root, String(args.path ?? ""))
            if (!existsSync(file)) throw new Error(`文件不存在：${args.path}`)
            if (statSync(file).size > MAX_FILE_BYTES) throw new Error(`文件过大（>200KB）：${args.path}`)
            const offset = Math.max(1, Number(args.offset ?? 1))
            const limit = Math.min(2000, Math.max(1, Number(args.limit ?? MAX_READ_LINES)))
            const lines = readFileSync(file, "utf8").split(/\r?\n/)
            return clip(
                lines
                    .slice(offset - 1, offset - 1 + limit)
                    .map((line, index) => `${offset + index}\t${line}`)
                    .join("\n")
            )
        },
    }

    const searchCode: AgentTool = {
        concurrentSafe: true,
        definition: {
            name: "search_code",
            description: "在仓库源码中按正则搜索，返回文件与行。用于确认某个功能在哪里实现。",
            parameters: {
                type: "object",
                properties: { pattern: { type: "string" }, glob: { type: "string" } },
                required: ["pattern"],
            },
        },
        execute(args) {
            const pattern = String(args.pattern ?? "")
            if (!pattern) throw new Error("pattern 不能为空")
            const globArgs = args.glob ? ["--glob", String(args.glob)] : []
            try {
                const output = execFileSync(
                    "rg",
                    ["--line-number", "--no-heading", "--color", "never", "--max-count", "8", ...globArgs, pattern, "."],
                    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 8 * 1024 * 1024, timeout: 20_000 }
                )
                const lines = output
                    .split(/\r?\n/)
                    .filter(line => !isBlocked((line.split(":")[0] ?? "").replace(/^\.\//, "")))
                    .slice(0, 100)
                return clip(lines.join("\n") || "（无匹配）")
            } catch (error) {
                const status = (error as { status?: number }).status
                if (status === 1) return "（无匹配）"
                throw new Error(`搜索失败：${error instanceof Error ? error.message : error}`)
            }
        },
    }

    const git: AgentTool = {
        definition: {
            name: "git",
            description: `只读 git 命令，可用子命令：${[...ALLOWED_GIT].join(" / ")}。参数以数组给出，如 ["log","--oneline","-n","20"]。`,
            parameters: {
                type: "object",
                properties: { args: { type: "array", items: { type: "string" } } },
                required: ["args"],
            },
        },
        execute(args) {
            const gitArgs = Array.isArray(args.args) ? args.args.map(String) : []
            if (gitArgs.length === 0) throw new Error("args 不能为空")
            if (!ALLOWED_GIT.has(gitArgs[0])) throw new Error(`不支持的 git 子命令：${gitArgs[0]}`)
            if (gitArgs.some(arg => /^--output/.test(arg))) throw new Error("不允许写文件的 git 参数")
            try {
                return clip(
                    execFileSync("git", gitArgs, {
                        cwd: root,
                        encoding: "utf8",
                        stdio: ["ignore", "pipe", "ignore"],
                        maxBuffer: 16 * 1024 * 1024,
                        timeout: 30_000,
                    }).trim() || "（无输出）"
                )
            } catch (error) {
                throw new Error(`git 执行失败：${error instanceof Error ? error.message : error}`)
            }
        },
    }

    const tools: AgentTool[] = [listDir, readFile, searchCode, git]

    if (skills.size > 0) {
        tools.push({
            concurrentSafe: true,
            definition: {
                name: "read_skill",
                description: "读取本地技能正文或参考资料。参数 file 形如 db-style/SKILL.md。",
                parameters: {
                    type: "object",
                    properties: { file: { type: "string" } },
                    required: ["file"],
                },
            },
            execute(args) {
                return clip(readSkillFile(root, skills, String(args.file ?? "")))
            },
        })
    }

    return tools
}
