/**
 * @file 兜底内容：没有 agent 可用时，按提交类型生成规则摘要与正文。
 */

import { buildDynamicText } from "./summary.ts"
import type { CardContent, CardSection, CommitSummary, Highlight, VersionMeta } from "./types.ts"

const SECTION_ACCENTS = ["#0ea5e9", "#f59e0b", "#8b5cf6", "#14b8a6"]
const GROUP_ICONS: Record<string, string> = {
    feat: "✨",
    fix: "🛠",
    perf: "⚡",
    refactor: "🎛",
    other: "📌",
}

function truncate(text: string, max: number): string {
    const chars = Array.from(text)
    return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text
}

/** 保证正文开头点题、结尾带 release 链接，并压到 B 站 2000 字限制以内。 */
export function finalizeBody(raw: string, meta: Pick<VersionMeta, "version" | "repo" | "tag">, maxLength = 1900): string {
    const url = `https://github.com/${meta.repo}/releases/tag/${meta.tag}`
    const prefix = `DNA Builder v${meta.version} 更新啦！`
    let text = raw.trim()
    if (!text.startsWith(prefix)) text = `${prefix}\n\n${text}`
    if (!text.includes(url)) text += `\n\n完整更新：${url}`

    // 按码点计数并截断，避免把 emoji 的代理对切成半个字符
    const chars = Array.from(text)
    if (chars.length > maxLength) {
        const suffix = `\n\n完整更新：${url}`
        const cut = Math.max(0, maxLength - Array.from(suffix).length - 1)
        text = `${chars.slice(0, cut).join("").trimEnd()}…${suffix}`
    }
    return text
}

export function fallbackCardContent(summary: CommitSummary, meta: VersionMeta): CardContent {
    // 亮点按分组做摘要，不复用分组条目，避免卡片上同一句话出现两次
    const highlights: Highlight[] = summary.groups.slice(0, 3).map(group => ({
        icon: GROUP_ICONS[group.key] ?? "✦",
        title: group.label,
        description: truncate(group.items.map(item => item.scope || item.description).join(" · "), 60),
    }))

    const counts = summary.counts
    const pieces = [
        counts.feat ? `${counts.feat} 项新增` : "",
        counts.fix ? `${counts.fix} 项修复` : "",
        counts.perf ? `${counts.perf} 项优化` : "",
        counts.refactor ? `${counts.refactor} 项调整` : "",
    ].filter(Boolean)

    const sections: CardSection[] = summary.groups.map((group, index) => ({
        heading: group.label,
        accent: SECTION_ACCENTS[index % SECTION_ACCENTS.length],
        items: group.items.map(item => ({ name: item.scope, description: item.description })),
    }))

    return {
        title: `v${meta.version} 更新`,
        subtitle: pieces.length ? `本次更新包含 ${pieces.join("、")}` : "本次发布以稳定性与细节优化为主",
        highlights,
        sections,
        body: finalizeBody(buildDynamicText(summary, meta), meta),
    }
}
