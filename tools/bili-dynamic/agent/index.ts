/**
 * @file 卡片 agent 的装配层：把仓库工具、技能清单与提示词装配进内核。
 * 对齐 apps/web/src/api/dbAgent.ts 的写法——内核只负责循环，装配只负责注入。
 */

import { ConfigError, DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL } from "../errors.ts"
import { DESIGN_REFERENCE } from "../style.ts"
import type { VersionMeta } from "../types.ts"
import { CardAgent, MAX_CONTINUATIONS, MAX_TOOL_ROUNDS } from "./kernel.ts"
import { createRepoAgentTools } from "./repo-tools.ts"
import { loadSkills, renderSkillSection } from "./skills.ts"
import type { AgentTool } from "./tool.ts"
import { createChatTransport } from "./transport.ts"

/** 生成结果：agent 自己写的 HTML、动态正文与 release 页 markdown */
export interface CardAgentOutput {
    html: string
    body: string
    title: string
    /** GitHub Release 正文（markdown） */
    releaseNotes: string
    rounds: number
    compactions: number
    tokens: number
    toolSequence: string[]
}

export interface CardAgentRunOptions {
    apiKey: string
    baseUrl?: string
    model?: string
    root: string
    meta: VersionMeta
    log?: (line: string) => void
}

const FINISH_TOOL: AgentTool = {
    definition: {
        name: "finish",
        description: "提交最终结果：整页 HTML、B 站动态正文与 Release 页 markdown。调研完成后必须调用它。",
        parameters: {
            type: "object",
            properties: {
                html: { type: "string", description: "完整 HTML 文档（含 <style>），1080px 宽，高度自适应" },
                body: { type: "string", description: "B 站动态正文，450 字以内，不要放链接" },
                title: { type: "string", description: "卡片大标题，12-22 字" },
                release_notes: { type: "string", description: "GitHub Release 页正文（markdown），300-800 字" },
            },
            required: ["html", "body", "title", "release_notes"],
        },
    },
    execute(args) {
        return {
            content: `已收到结果：html ${String(args.html ?? "").length} 字符，body ${String(args.body ?? "").length} 字符，release_notes ${String(args.release_notes ?? "").length} 字符`,
        }
    },
}

function buildSystemPrompt(meta: VersionMeta): string {
    const versionLine = meta.previousVersion ? `v${meta.previousVersion} → v${meta.version}` : `v${meta.version}`
    const range = meta.previousTag ? `${meta.previousTag}..${meta.upperTag}` : meta.upperTag
    return `你是 DNA Builder 的发布编辑 agent，可以直接读取这个仓库来搞清楚每个改动到底做了什么。

仓库：${meta.repo}
本次版本：${versionLine}（tag ${meta.tag}），发布日期 ${meta.date}
**本次改动范围：${range}**（只看这个区间；区间外的历史提交属于旧版本，不要写进卡片）

工作方式：
1. 用 git log ${range} 确认本次提交，再用 git diff --stat ${range} 找到主要改动文件。
2. 对关键改动读实现、读文档（.agents/docs/、specs/），确认它给玩家带来了什么。
3. 需要时搜索代码确认边界（例如"变体槽位"影响哪个界面）。
4. 调研控制在 10 次工具调用左右，够了就立刻调用 finish 提交结果——不要把轮次用在区间外的内容上。

产出要求：
- html：完整 HTML 文档，1080px 宽，高度自适应；要像一个真实产品公告页，而不是把提交列表排一遍。
  自己决定版式（分栏、时间线、对比、数字卡、引用块都可以），只要能清楚传达这次更新。
  所有文字用中文；不要引用外部图片、字体或脚本；图标用 emoji 或内联 SVG。
  HTML 控制在 6000 字符以内（finish 参数是一次性 JSON，过长会被截断），样式尽量合并。
  不要出现"提交 / commit / PR / 代码文件"这类开发者术语。
  必须包含：品牌标识（DNA BUILDER）、版本号、日期、本次更新内容、页脚（github.com/${meta.repo} 与 ${meta.site}）。
- body：B 站动态正文，450 字以内，口语化，可用 emoji，不要放链接。
- title：卡片大标题，12-22 字，有主题感。
- release_notes：GitHub Release 页正文（markdown），300-800 字。
  用 ## 小标题分组、列表、必要的加粗；面向玩家，写清楚"更新了什么 / 解决什么问题"。
  不要重复卡片上的同一套措辞，可以更详细；不要出现开发者术语；
  不要写下载链接与完整更新链接（工作流会自动补），也不要自己加 <details> 折叠块（原始提交由工作流附在末尾）。

只写提交里能证明的内容，不要编造功能、数值或日期。忽略 docs / test / chore / ci 等内部改动，除非它直接影响用户。

${DESIGN_REFERENCE}`
}

/** 校验 agent 产出的 HTML：必须是完整文档、无脚本、无外链资源 */
export function validateGeneratedHtml(html: string): string {
    const text = html.trim()
    if (!/<\/html>/i.test(text) || !/<body/i.test(text)) throw new Error("agent 返回的不是完整 HTML 文档")
    if (/<script\b/i.test(text)) throw new Error("agent 返回的 HTML 含 <script>，已拒绝")
    if (/https?:\/\/(?!github\.com|dna-builder)[^"')\s]+\.(png|jpg|jpeg|gif|webp|svg|woff2?|ttf|otf)/i.test(text)) {
        throw new Error("agent 返回的 HTML 引用了外部图片或字体，已拒绝")
    }
    return text
}

/** 校验 release 正文：必须是 markdown 纯文本，不能带 HTML 标签或自己包 details */
export function validateReleaseNotes(raw: string): string {
    const text = raw
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    if (!text) throw new Error("agent 未提供 Release 正文")
    if (/<details|<summary|<script|<iframe|<style/i.test(text)) throw new Error("Release 正文含不允许的 HTML 标签")
    if (text.length > 4000) return `${text.slice(0, 4000).trimEnd()}…`
    return text
}

/**
 * @description 装配并运行卡片生成 agent。
 * @param options 上游配置、仓库根目录与版本信息
 * @returns agent 产出的 HTML、正文与运行统计
 */
export async function runCardAgent(options: CardAgentRunOptions): Promise<CardAgentOutput> {
    const skills = loadSkills(options.root)
    const tools = [...createRepoAgentTools(options.root, skills), FINISH_TOOL]
    const agent = new CardAgent({
        name: "CardAgent",
        transport: createChatTransport({
            apiKey: options.apiKey,
            baseUrl: options.baseUrl || DEFAULT_DEEPSEEK_BASE_URL,
        }),
        model: options.model || DEFAULT_DEEPSEEK_MODEL,
        tools,
        systemPrompt: buildSystemPrompt(options.meta),
        metaUserPrefix: renderSkillSection(skills),
        maxToolRounds: MAX_TOOL_ROUNDS,
        maxContinuations: MAX_CONTINUATIONS,
        onLog: options.log,
    })

    const result = await agent.run(
        `本次改动范围是 ${options.meta.previousTag ? `${options.meta.previousTag}..${options.meta.upperTag}` : options.meta.upperTag}。请调研这个区间的改动，然后生成更新卡片。`
    )

    const html = validateGeneratedHtml(String(result.output.html ?? ""))
    const body = String(result.output.body ?? "").trim()
    if (!body) throw new ConfigError("agent 未提供动态正文")
    if (body.includes("<")) throw new Error("agent 返回的正文含 HTML 标记，已拒绝")
    const releaseNotes = validateReleaseNotes(String(result.output.release_notes ?? ""))

    return {
        html,
        body,
        title: String(result.output.title ?? "").trim(),
        releaseNotes,
        rounds: result.rounds,
        compactions: result.compactions,
        tokens: result.usage.inputTokens + result.usage.outputTokens,
        toolSequence: result.toolSequence,
    }
}
