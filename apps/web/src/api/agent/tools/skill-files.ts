/**
 * 技能相关工具集：`skill`（加载技能全文）+ `list_file` / `read_file` / `grep` 文件工具。
 * 实现都在 `skills/registry.ts` 与 `skills/vfs.ts`，这里只做参数归一化与结果回灌。
 */

import { getAgentSkillRegistry } from "../skills/registry"
import { DEFAULT_CONTEXT_LINES, MAX_CONTEXT_LINES, MAX_SEARCH_MATCHES, type ReadFileParams } from "../skills/vfs"
import type { AgentTool } from "../tool"
import type { AgentToolDefinition } from "../wire"

/** 数值参数的合法上限（slice / line / range 共用的防呆线） */
const MAX_NUMERIC_PARAM = 100_000

/** 归一化字符串参数（模型偶尔会把数字传成字符串）。 */
function asString(value: unknown): string {
    return typeof value === "string" ? value : ""
}

/** 归一化整数参数（容忍字符串形态的数字；越界或非数值返回 undefined）。 */
function asInteger(value: unknown): number | undefined {
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN

    return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), -MAX_NUMERIC_PARAM), MAX_NUMERIC_PARAM) : undefined
}

/** 从参数里取出 read_file 的切片参数（只有显式给出的键才进结果）。 */
function parseReadParams(args: Record<string, unknown>): ReadFileParams {
    const params: ReadFileParams = {}
    const slice = asInteger(args.slice)
    const line = asInteger(args.line)
    const range = asInteger(args.range)

    if (slice !== undefined) {
        params.slice = slice
    }

    if (line !== undefined) {
        params.line = line
    }

    if (range !== undefined) {
        params.range = range
    }

    const search = asString(args.search).trim()
    if (search) {
        params.search = search
    }

    return params
}

/** `skill` 工具的定义（结构与加载纪律对齐 ZCode 的 Skill 工具 meta） */
const SKILL_DEFINITION: AgentToolDefinition = {
    name: "skill",
    description: `在主对话中执行技能

用户让你执行任务时，先检查可用技能里有没有匹配项。技能提供专项能力与领域知识。

调用方式：
- 把 \`skill\` 设为技能清单里的准确名称（不带斜杠、不带 \`$\`）
- 用 \`args\` 传递可选参数

重要：
- 可用技能会列在对话最前的 system-reminder 技能清单里
- **用户在输入框里用 \`$名称\` 显式点名的技能**（正文形如 \`[$名称](/名称/SKILL.md)\` 或裸 \`$名称\`），
  或用户在消息里显式用 \`/<名称>\` 指定的技能，都属于「用户已指定」，
  **必须先把这些技能逐个用本工具加载后再动手**；绝不要凭训练数据猜测或编造技能名
- 当某个技能与用户请求匹配时，这是阻塞性要求：先调用本工具，再生成关于该任务的任何其他回复
- 绝不在没有实际调用本工具的情况下向用户提及某个技能
- 同一个技能已经在进行中时不要重复调用`,
    parameters: {
        type: "object",
        properties: {
            skill: { type: "string", description: "技能清单里的技能名（不带前导 $ 或 /）。" },
            args: { type: "string", description: "可选，传给技能的参数。" },
        },
        required: ["skill"],
    },
}

/** `list_file` 工具的定义 */
const LIST_FILE_DEFINITION: AgentToolDefinition = {
    name: "list_file",
    description:
        "列出技能资料目录的直接子项。根目录 / 下每个技能各占一个目录；技能目录里是它的 SKILL.md 与附带文件。" +
        "首次访问某个技能的目录会先加载该技能，稍慢属正常。",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "要列出的目录路径，如 / 或 /my-skill 或 /my-skill/refs。缺省为根目录 /。" },
        },
    },
}

/** `read_file` 工具的定义 */
const READ_FILE_DEFINITION: AgentToolDefinition = {
    name: "read_file",
    description:
        "读取技能资料里的一个文本文件（带行号回显）。整读超大文件会被截断，" +
        "建议用切片参数精准定位：slice 正数取开头 N 行、负数 -N 取末尾 N 行；search 在文件内搜字符串并返回命中行及上下文；" +
        `line 指定行号（1 起）返回该行附近内容，两者默认附上下各 ${DEFAULT_CONTEXT_LINES} 行，可用 range 调整。slice、search、line 同时给出时优先级依次为 slice > search > line。`,
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "文件路径，如 /my-skill/SKILL.md。可先用 list_file 确认。" },
            slice: {
                type: "integer",
                description:
                    "只取头部 / 尾部若干行：正数 N 返回开头 N 行（第 1 到第 N 行），负数 -N 返回末尾 N 行（如 -2 返回末尾 2 行）。",
            },
            search: {
                type: "string",
                description: `在文件里搜索字符串（忽略大小写），返回每个命中行及上下文；只显示前 ${MAX_SEARCH_MATCHES} 处命中。`,
            },
            line: { type: "integer", description: `行号（1 起），返回该行附近的内容（默认上下各 ${DEFAULT_CONTEXT_LINES} 行）。` },
            range: {
                type: "integer",
                description: `配合 search / line 使用：上下文行数，默认 ${DEFAULT_CONTEXT_LINES}，最大 ${MAX_CONTEXT_LINES}。`,
            },
        },
        required: ["path"],
    },
}

/** `grep` 工具的定义 */
const GREP_DEFINITION: AgentToolDefinition = {
    name: "grep",
    description:
        "在技能资料里做全文搜索（跨全部已下发技能，或用 path 限定到某个技能 / 子目录）。" +
        "输出 rg 风格的「路径:行号:文本」，命中行与上下文行分别用冒号与连字符连接。适合回答「某个关键词在技能资料里出现在哪」。",
    parameters: {
        type: "object",
        properties: {
            pattern: { type: "string", description: "搜索模式（正则表达式；写不出合法正则时按普通文本匹配）。" },
            path: { type: "string", description: "限定搜索的目录（如 /my-skill 或 /my-skill/refs），缺省搜索全部技能。" },
            glob: { type: "string", description: "文件路径通配符过滤，如 *.md（只匹配 markdown）。" },
            ignoreCase: { type: "boolean", description: "是否忽略大小写，默认 true。" },
            context: { type: "integer", description: "每个命中附带的上下文行数，默认 2，最大 10。" },
        },
        required: ["pattern"],
    },
}

/** 构造技能相关工具集（skill + list_file + read_file + grep）；清单为空时由装配层决定是否挂载。 */
export function createSkillTools<TPayload = never>(): AgentTool<TPayload>[] {
    const registry = getAgentSkillRegistry()

    return [
        {
            definition: SKILL_DEFINITION,
            concurrentSafe: true,
            async execute(args) {
                const name = asString(args.skill).trim()
                if (!name) {
                    return { content: "错误：缺少 skill 参数（技能名，见对话最前的技能清单）。", isError: true }
                }

                const content = await registry.loadSkillBody(name)
                if (!content) {
                    const available = registry
                        .getSkills()
                        .map(skill => skill.name)
                        .join("、")

                    return {
                        content: `错误：技能 ${name} 不存在、已停用或加载失败。${available ? `可用技能：${available}` : ""}`,
                        isError: true,
                    }
                }

                return { content, summary: `加载技能 ${name}` }
            },
        },
        {
            definition: LIST_FILE_DEFINITION,
            concurrentSafe: true,
            async execute(args) {
                const content = await registry.listVfsDir(asString(args.path) || "/")

                return { content, summary: "浏览技能文件目录" }
            },
        },
        {
            definition: READ_FILE_DEFINITION,
            concurrentSafe: true,
            async execute(args) {
                const path = asString(args.path).trim()
                if (!path) {
                    return { content: "错误：缺少 path 参数（文件路径，如 /my-skill/SKILL.md）。", isError: true }
                }

                const { content, isError } = await registry.readVfsFile(path, parseReadParams(args))

                return { content, isError, summary: isError ? `读取 ${path} 失败` : `读取 ${path}` }
            },
        },
        {
            definition: GREP_DEFINITION,
            concurrentSafe: true,
            async execute(args) {
                const pattern = asString(args.pattern).trim()
                if (!pattern) {
                    return { content: "错误：缺少 pattern 参数（搜索模式）。", isError: true }
                }

                const content = await registry.grepVfs({
                    pattern,
                    path: asString(args.path).trim() || undefined,
                    glob: asString(args.glob).trim() || undefined,
                    ignoreCase: args.ignoreCase === undefined ? undefined : args.ignoreCase !== false,
                    context: asInteger(args.context),
                })

                return { content, summary: `在技能文件里搜索 ${pattern}` }
            },
        },
    ]
}
