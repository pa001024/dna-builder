#!/usr/bin/env bun
import { readFileSync } from "node:fs"
import { createInterface, type Interface } from "node:readline"
import i18next from "i18next"
import { ensureAgentSkillsReady, getAgentSkillRegistry } from "../src/api/agent/skills/registry"
import { type AgentTool, type AgentToolOutput, readToolSummary, readToolText } from "../src/api/agent/tool"
import { scheduleToolCalls } from "../src/api/agent/tool-scheduler"
import { createDbRetrievalTools } from "../src/api/agent/tools/db-retrieval"
import { DB_RETRIEVAL_PROFILES } from "../src/api/agent/tools/retrieval-modules"
import { createSkillTools } from "../src/api/agent/tools/skill-files"
import { type AgentToolCall, parseToolArguments } from "../src/api/agent/wire"
import { agentToolLabel } from "../src/utils/agent-chat"
import {
    type AskUserRequest,
    type AskUserResponse,
    formatAskUserResponse,
    hasAskAnswer,
    summarizeAskUserRequest,
} from "../src/utils/db-ask-user"
import { type DBAgentLang, normalizeDBAgentLang, toI18nLanguage } from "../src/utils/db-locale"
import { isRagEnabled } from "../src/utils/rag/enabled"

const HELP = `资料检索 Agent 工具台 —— 不接模型，按 DBAgent 的装配方式直接调用它的工具。

用法：
  bun tools/agent-exec.ts --list
  bun tools/agent-exec.ts <工具名> ['<JSON 参数>']
  bun tools/agent-exec.ts --script <文件>
  bun tools/agent-exec.ts                      交互模式（stdin 逐行读同一种语法）

工具面（--profile）：
  db     资料检索助手（默认）：全量模块 + 剧情 + ask_user
  build  配装助手的检索子集：仅 char/weapon/mod/monster/pet/damage，无剧情
         （配装侧另有 UI 操作与 run_code 工具，需浏览器运行环境，此处不挂）

选项：
  --list               只打印工具面（名称 / 展示名 / 参数），加 --verbose 打印完整 JSON Schema
  --lang <code>        调用语言：zh（默认）/ en / jp / kr / fr / tc；auto = 不注入，交给工具推断
  --profile <name>     db | build（默认 db）
  --modules <ids>      覆盖模块白名单，逗号分隔
  --story / --no-story 剧情工具（search_story / read_story / list_version_additions）
  --ask / --no-ask     ask_user 挂起问答
  --rag / --no-rag     上下文检索增强（默认跟随设置页开关，当前关闭）
  --skills             额外挂上技能工具（需要能拉到服务端技能清单）
  --json               只打印工具结果原文（不做交互、不截断），便于管道给 jq
  --max <n>            默认输出下单条结果的打印长度上限（默认 0 = 不截断）
  --time               打印每次调用耗时
  --no-i18n            不加载 public/i18n 资源（摘要退回文案键）
  -h, --help           本帮助

交互模式命令：
  <工具名> ['<JSON 参数>']   调用一次工具
  list / help / exit

脚本文件（--script）：
  [{ "tool": "read_entry", "args": { "module": "char", "name": "法露茜" } }]
  同一批里并发安全的工具会按内核的调度规则分组并发（ask_user 是串行屏障）。

ask_user 与内核一样挂起等作答，回答语法：
  <选项序号>[,<选项序号>...]    例：1,3
  !<自由文本>                  例：!想查角色剧情
  多个问题用 ; 分隔，例：1 ; !法露茜
  直接回车 = 跳过整张卡片

类型检查（tools/** 不在 pnpm lint 的增量覆盖范围内）：
  bunx tsc -p tools/tsconfig.agent-exec.json
`

interface CliOptions {
    list: boolean
    help: boolean
    verbose: boolean
    json: boolean
    timing: boolean
    skills: boolean
    story: boolean | null
    askUser: boolean | null
    rag: boolean | null
    i18n: boolean
    profile: string
    lang: string
    maxLength: number
    modules: string[]
    script: string | null
    positional: string[]
}

interface RunContext {
    toolMap: Map<string, AgentTool<AskUserRequest>>
    tools: AgentTool<AskUserRequest>[]
    options: CliOptions
    lang: DBAgentLang | undefined
}

interface CallOutcome {
    call: AgentToolCall
    label: string
    args: Record<string, unknown>
    content: string
    summary: string
    isError: boolean
    suspended: AskUserRequest | null
    durationMs: number
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function printText(text: string): void {
    process.stdout.write(`${text}\n`)
}

function printError(text: string): void {
    process.stderr.write(`${text}\n`)
}

class LineSource {
    private readonly pendingLines: string[] = []
    private readonly waiting: ((line: string | null) => void)[] = []
    private closed = false

    pushLine(line: string): void {
        const waiter = this.waiting.shift()

        if (waiter) {
            waiter(line)
            return
        }

        this.pendingLines.push(line)
    }

    markClosed(): void {
        this.closed = true

        while (this.waiting.length) {
            const waiter = this.waiting.shift()

            waiter?.(null)
        }
    }

    nextLine(): Promise<string | null> {
        const ready = this.pendingLines.shift()

        if (ready !== undefined) {
            return Promise.resolve(ready)
        }

        if (this.closed) {
            return Promise.resolve(null)
        }

        return new Promise(resolve => {
            this.waiting.push(resolve)
        })
    }
}

function parseCli(argv: string[]): CliOptions {
    const options: CliOptions = {
        list: false,
        help: false,
        verbose: false,
        json: false,
        timing: false,
        skills: false,
        story: null,
        askUser: null,
        rag: null,
        i18n: true,
        profile: "db",
        lang: "zh",
        maxLength: 0,
        modules: [],
        script: null,
        positional: [],
    }

    const nextValue = (index: number, flag: string): string => {
        const value = argv[index + 1]

        if (value === undefined || value.startsWith("--")) {
            throw new Error(`${flag} 缺少取值`)
        }

        return value
    }

    for (let index = 0; index < argv.length; index++) {
        const token = argv[index]

        switch (token) {
            case "--list":
                options.list = true
                break
            case "--verbose":
                options.verbose = true
                break
            case "--json":
                options.json = true
                break
            case "--time":
                options.timing = true
                break
            case "--skills":
                options.skills = true
                break
            case "--story":
                options.story = true
                break
            case "--no-story":
                options.story = false
                break
            case "--ask":
                options.askUser = true
                break
            case "--no-ask":
                options.askUser = false
                break
            case "--rag":
                options.rag = true
                break
            case "--no-rag":
                options.rag = false
                break
            case "--no-i18n":
                options.i18n = false
                break
            case "-h":
            case "--help":
                options.help = true
                break
            case "--lang":
                options.lang = nextValue(index, token)
                index++
                break
            case "--profile":
                options.profile = nextValue(index, token)
                index++
                break
            case "--modules":
                options.modules = nextValue(index, token)
                    .split(",")
                    .map(item => item.trim())
                    .filter(Boolean)
                index++
                break
            case "--max": {
                const parsed = Number.parseInt(nextValue(index, token), 10)
                options.maxLength = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
                index++
                break
            }
            case "--script":
                options.script = nextValue(index, token)
                index++
                break
            default:
                if (token.startsWith("-") && token !== "-") {
                    throw new Error(`未知选项 ${token}`)
                }

                options.positional.push(token)
        }
    }

    return options
}

function resolveCliLang(options: CliOptions): DBAgentLang | undefined {
    if (options.lang === "auto") {
        return undefined
    }

    const lang = normalizeDBAgentLang(options.lang)

    if (!lang) {
        throw new Error(`未知语言 "${options.lang}"（可用：zh / en / jp / kr / fr / tc / auto）`)
    }

    return lang
}

async function initI18n(lang: DBAgentLang | undefined): Promise<void> {
    const locales = [...new Set([toI18nLanguage(lang ?? "zh"), "zh-CN"])]
    const resources: Record<string, { translation: Record<string, string> }> = {}

    for (const locale of locales) {
        const file = Bun.file(new URL(`../public/i18n/${locale}/translation.json`, import.meta.url))

        try {
            if (await file.exists()) {
                resources[locale] = { translation: (await file.json()) as Record<string, string> }
            }
        } catch (error) {
            printError(`读取 public/i18n/${locale}/translation.json 失败：${message(error)}`)
        }
    }

    await i18next.init({
        lng: toI18nLanguage(lang ?? "zh"),
        fallbackLng: locales,
        resources,
        initImmediate: false,
        interpolation: { escapeValue: false },
        showSupportNotice: false,
    })
}

function applyUiLang(lang: DBAgentLang | undefined): void {
    if (!lang) {
        return
    }

    try {
        globalThis.localStorage?.setItem("setting_lang", toI18nLanguage(lang))
    } catch {
        printError("提示：当前环境没有可用的 localStorage，界面语言未写入（工具仍按 --lang 调用）")
    }
}

async function buildTools(options: CliOptions): Promise<AgentTool<AskUserRequest>[]> {
    const profile = DB_RETRIEVAL_PROFILES[options.profile]

    if (!profile) {
        throw new Error(`未知工具面 "${options.profile}"（可用：${Object.keys(DB_RETRIEVAL_PROFILES).join(" / ")}）`)
    }

    const tools: AgentTool<AskUserRequest>[] = [
        ...createDbRetrievalTools<AskUserRequest>({
            modules: options.modules.length ? options.modules : profile.modules,
            story: options.story ?? profile.story !== false,
            ragEnabled: options.rag ?? isRagEnabled(),
            askUser: options.askUser ?? profile.askUser !== false,
        }),
    ]

    if (options.skills) {
        await ensureAgentSkillsReady()

        if (getAgentSkillRegistry().isAvailable()) {
            tools.push(...createSkillTools<AskUserRequest>())
        } else {
            printError("提示：服务端技能清单不可用，技能工具未挂上")
        }
    }

    return tools
}

function printToolSurface(tools: AgentTool<AskUserRequest>[], verbose: boolean): void {
    const lines = [`工具面：${tools.length} 个`]

    for (const tool of tools) {
        const { name, description, parameters } = tool.definition
        const label = agentToolLabel(name)
        const properties = (parameters.properties ?? {}) as Record<string, { description?: string }>
        const required = (parameters.required ?? []) as string[]

        lines.push("")
        lines.push(`- ${name}${label && label !== name ? `（${label}）` : ""}`)
        lines.push(`  ${description}`)
        lines.push(
            `  参数：${
                Object.keys(properties).length
                    ? Object.keys(properties)
                          .map(key => `${key}${required.includes(key) ? "*" : ""}`)
                          .join(", ")
                    : "无"
            }`
        )

        if (verbose) {
            lines.push(
                JSON.stringify(parameters, null, 2)
                    .split("\n")
                    .map(line => `  ${line}`)
                    .join("\n")
            )
        }
    }

    printText(lines.join("\n"))
}

function toCall(text: string, id: string): AgentToolCall {
    const trimmed = text.trim()

    if (!trimmed) {
        throw new Error("缺少工具名")
    }

    if (trimmed.startsWith("{")) {
        const parsed = JSON.parse(trimmed) as { tool?: string; name?: string; args?: unknown; arguments?: unknown }
        const name = parsed.tool ?? parsed.name

        if (!name) {
            throw new Error('JSON 形态需要 "tool" 字段')
        }

        const rawArgs = parsed.args ?? parsed.arguments ?? {}

        return { id, name, arguments: typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs) }
    }

    const separatorAt = trimmed.search(/\s/)
    const name = separatorAt === -1 ? trimmed : trimmed.slice(0, separatorAt)
    const rawArguments = separatorAt === -1 ? "{}" : trimmed.slice(separatorAt + 1).trim()

    if (rawArguments && !rawArguments.startsWith("{")) {
        throw new Error(`参数需要是 JSON 对象，收到 "${rawArguments}"`)
    }

    return { id, name, arguments: rawArguments || "{}" }
}

function injectLang(tool: AgentTool<AskUserRequest>, args: Record<string, unknown>, lang: DBAgentLang | undefined): void {
    if (!lang || args.lang !== undefined) {
        return
    }

    const properties = tool.definition.parameters.properties as Record<string, unknown> | undefined

    if (properties && "lang" in properties) {
        args.lang = lang
    }
}

async function invoke(call: AgentToolCall, context: RunContext): Promise<CallOutcome> {
    const startedAt = performance.now()
    const label = agentToolLabel(call.name)
    const args = parseToolArguments(call.arguments)
    const tool = context.toolMap.get(call.name)

    if (!tool) {
        return {
            call,
            label,
            args,
            content: JSON.stringify({ error: `未知工具 ${call.name}`, supported: context.tools.map(item => item.definition.name) }),
            summary: `未知工具 ${call.name}`,
            isError: true,
            suspended: null,
            durationMs: performance.now() - startedAt,
        }
    }

    injectLang(tool, args, context.lang)

    try {
        const output = await tool.execute(args, { isInterrupted: () => false })
        const summaryOverride = readToolSummary(output as AgentToolOutput<never>)

        if (output && typeof output === "object" && "suspend" in output) {
            const request = output.suspend as AskUserRequest

            return {
                call,
                label,
                args,
                content: "",
                summary: summaryOverride || summarizeAskUserRequest(request),
                isError: false,
                suspended: request,
                durationMs: performance.now() - startedAt,
            }
        }

        const text = readToolText(output as AgentToolOutput<never>)

        if (!text) {
            throw new Error("工具未返回结果")
        }

        return {
            call,
            label,
            args,
            content: text.content,
            summary: summaryOverride || text.content.slice(0, 80),
            isError: text.isError,
            suspended: null,
            durationMs: performance.now() - startedAt,
        }
    } catch (error) {
        return {
            call,
            label,
            args,
            content: JSON.stringify({ error: message(error) }),
            summary: message(error),
            isError: true,
            suspended: null,
            durationMs: performance.now() - startedAt,
        }
    }
}

function shorten(text: string, maxLength: number): string {
    return maxLength > 0 && text.length > maxLength ? `${text.slice(0, maxLength)}…（共 ${text.length} 字，--max 0 取消截断）` : text
}

function printOutcome(outcome: CallOutcome, options: CliOptions): void {
    if (options.json) {
        printText(outcome.suspended ? JSON.stringify({ suspend: outcome.suspended }, null, 2) : outcome.content)
        return
    }

    const lines: string[] = [`▸ ${outcome.call.name}${outcome.label && outcome.label !== outcome.call.name ? `（${outcome.label}）` : ""}`]
    lines.push(`  args  ${JSON.stringify(outcome.args)}`)
    lines.push(`  ${outcome.isError ? "错误" : "摘要"}  ${outcome.summary}`)

    if (options.timing) {
        lines.push(`  耗时  ${outcome.durationMs.toFixed(1)}ms${outcome.content ? ` · ${outcome.content.length} 字` : ""}`)
    }

    if (outcome.suspended) {
        lines.push("  状态  挂起，等待用户作答")
    } else if (outcome.content) {
        lines.push(shorten(outcome.content, options.maxLength))
    }

    printText(lines.join("\n"))
}

function formatAskPrompt(request: AskUserRequest): string {
    const lines = [`提问${request.title ? `：${request.title}` : ""}（${request.id}）`]

    for (const [index, question] of request.questions.entries()) {
        lines.push("")
        lines.push(`${index + 1}. ${question.header}`)

        if (question.question) {
            lines.push(`   ${question.question}`)
        }

        for (const [optionIndex, option] of question.options.entries()) {
            lines.push(`   [${optionIndex + 1}] ${option.label}${option.description ? ` —— ${option.description}` : ""}`)
        }

        lines.push(`   自由输入：${question.allowCustom ? "可用 ! 前缀作答" : "未开放"}${question.multiple ? " · 可多选" : ""}`)
    }

    return lines.join("\n")
}

function parseAskAnswer(request: AskUserRequest, line: string): AskUserResponse {
    const trimmed = line.trim()

    if (!trimmed) {
        return { requestId: request.id, answers: [], skipped: true }
    }

    const segments = trimmed.split(";")
    const answers: AskUserResponse["answers"] = []

    for (const [index, question] of request.questions.entries()) {
        const segment = (segments[index] ?? (segments.length === 1 ? segments[0] : "")).trim()

        if (!segment) {
            continue
        }

        if (segment.startsWith("!")) {
            answers.push({ questionId: question.id, optionIds: [], custom: segment.slice(1).trim() })
            continue
        }

        const optionIds = segment
            .split(/[,，\s]+/)
            .filter(Boolean)
            .map(token => question.options[Number.parseInt(token, 10) - 1]?.id)
            .filter((id): id is string => !!id)

        answers.push({ questionId: question.id, optionIds, custom: "" })
    }

    return { requestId: request.id, answers }
}

async function resolveSuspend(outcome: CallOutcome, context: RunContext, source: LineSource, rl: Interface | null): Promise<void> {
    const request = outcome.suspended

    if (!request) {
        return
    }

    if (context.options.json) {
        printError(`提示：${summarizeAskUserRequest(request)}（--json 不做交互，按跳过处理）`)
        return
    }

    printText(`\n${formatAskPrompt(request)}`)

    while (true) {
        rl?.prompt()
        const line = await source.nextLine()

        if (line === null) {
            printText("（输入已结束，按跳过处理）")
            printText(`→ 回灌给模型的结果：${formatAskUserResponse(request, { requestId: request.id, answers: [], skipped: true })}`)
            return
        }

        const response = parseAskAnswer(request, line)

        if (!hasAskAnswer(request, response)) {
            printText("回答为空，请重新作答（回车 = 跳过整张卡片）")
            continue
        }

        printText(`→ 回灌给模型的结果：\n${formatAskUserResponse(request, response)}`)
        return
    }
}

async function runCalls(calls: AgentToolCall[], context: RunContext, source: LineSource, rl: Interface | null): Promise<number> {
    let failed = 0

    for (const group of scheduleToolCalls(calls, context.toolMap)) {
        const outcomes = await Promise.all(group.map(call => invoke(call, context)))

        for (const outcome of outcomes) {
            printOutcome(outcome, context.options)

            if (outcome.isError) {
                failed++
            }

            if (outcome.suspended) {
                await resolveSuspend(outcome, context, source, rl)
            }
        }
    }

    return failed
}

function readScriptCalls(path: string): AgentToolCall[] {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    const rawCalls = Array.isArray(parsed) ? parsed : ((parsed as { calls?: unknown[] }).calls ?? [])

    if (!rawCalls.length) {
        throw new Error("脚本里没有任何调用")
    }

    return rawCalls.map((item, index) => {
        const entry = item as { tool?: string; name?: string; args?: unknown; arguments?: unknown }

        if (!entry.tool && !entry.name) {
            throw new Error(`第 ${index + 1} 条缺少 tool 字段`)
        }

        return toCall(JSON.stringify({ tool: entry.tool ?? entry.name, args: entry.args ?? entry.arguments ?? {} }), `call-${index + 1}`)
    })
}

async function runInteractive(context: RunContext, source: LineSource, rl: Interface | null): Promise<number> {
    printText("资料检索工具台（不接模型）。输入 <工具名> ['<JSON 参数>']，list / help / exit")
    let failed = 0
    let sequence = 0

    while (true) {
        rl?.prompt()
        const line = await source.nextLine()

        if (line === null) {
            break
        }

        const text = line.trim()

        if (!text) {
            continue
        }

        if (text === "exit" || text === "quit") {
            break
        }

        if (text === "help" || text === "?") {
            printText(HELP)
            continue
        }

        if (text === "list") {
            printToolSurface(context.tools, context.options.verbose)
            continue
        }

        let call: AgentToolCall

        try {
            call = toCall(text, `call-${++sequence}`)
        } catch (error) {
            printError(message(error))
            continue
        }

        failed += await runCalls([call], context, source, rl)
    }

    return failed ? 1 : 0
}

async function main(): Promise<number> {
    let options: CliOptions
    let lang: DBAgentLang | undefined

    try {
        options = parseCli(process.argv.slice(2))
        lang = resolveCliLang(options)
    } catch (error) {
        printError(message(error))
        printError("用 --help 查看用法")
        return 2
    }

    if (options.help) {
        printText(HELP)
        return 0
    }

    if (options.i18n) {
        await initI18n(lang)
    }

    applyUiLang(lang)

    let tools: AgentTool<AskUserRequest>[]

    try {
        tools = await buildTools(options)
    } catch (error) {
        printError(message(error))
        return 2
    }

    const context: RunContext = {
        toolMap: new Map(tools.map(tool => [tool.definition.name, tool])),
        tools,
        options,
        lang,
    }

    const source = new LineSource()
    const interactive = process.stdin.isTTY === true
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: interactive })
    const promptRl = interactive ? rl : null

    rl.on("line", line => source.pushLine(line))
    rl.on("close", () => source.markClosed())

    try {
        if (options.list) {
            printToolSurface(tools, options.verbose)

            if (!options.positional.length && !options.script) {
                return 0
            }
        }

        if (options.script) {
            return (await runCalls(readScriptCalls(options.script), context, source, promptRl)) ? 1 : 0
        }

        if (options.positional.length) {
            const [name, rawArguments] = options.positional

            if (!name) {
                printError("缺少工具名")
                return 2
            }

            return (await runCalls([toCall(`${name} ${rawArguments ?? "{}"}`, "call-1")], context, source, promptRl)) ? 1 : 0
        }

        return await runInteractive(context, source, promptRl)
    } catch (error) {
        printError(message(error))
        return 1
    } finally {
        rl.close()
    }
}

process.exit(await main())
