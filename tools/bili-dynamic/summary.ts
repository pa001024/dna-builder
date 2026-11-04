/**
 * @file 规则摘要：按 conventional commit 类型分组、去重、限量。
 * 没有 DeepSeek Key 或接口失败时，用它兜底生成卡片与正文。
 */

import type { CommitSummary, SummaryGroup, VersionMeta } from "./types.ts"

interface ParsedCommit {
    type: string
    scope: string
    description: string
    breaking: boolean
}

interface GroupDef {
    key: string
    label: string
    accent: string
}

const CONVENTIONAL = /^(?<type>[a-z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?:\s*(?<desc>.+)$/i

const GROUPS: GroupDef[] = [
    { key: "feat", label: "新增功能", accent: "#0ea5e9" },
    { key: "fix", label: "问题修复", accent: "#f59e0b" },
    { key: "perf", label: "性能优化", accent: "#8b5cf6" },
    { key: "refactor", label: "体验调整", accent: "#14b8a6" },
    { key: "other", label: "其他更新", accent: "#64748b" },
]

/** 这些类型属于开发内部改动，不进玩家向的更新卡片 */
const INTERNAL_TYPES = new Set(["docs", "test", "style", "chore", "build", "ci"])

const MAX_DESCRIPTION = 58

export function parseCommitSubject(subject: string): ParsedCommit | null {
    const text = subject.replace(/\s+/g, " ").trim()
    if (!text || /^merge\b/i.test(text)) return null

    const match = CONVENTIONAL.exec(text)
    if (!match?.groups) {
        return { type: "other", scope: "", description: text.replace(/[。.!！]+$/, ""), breaking: false }
    }

    const description = match.groups.desc.trim().replace(/[。.!！]+$/, "")
    if (!description) return null

    return {
        type: match.groups.type.toLowerCase(),
        scope: (match.groups.scope ?? "").trim(),
        description,
        breaking: Boolean(match.groups.breaking),
    }
}

function isNoise(commit: ParsedCommit): boolean {
    if (INTERNAL_TYPES.has(commit.type)) return true
    if (commit.type !== "other") return false
    return /^(merge\b|release\b|v?\d+\.\d+\.\d+\b)/i.test(commit.description)
}

function groupKey(commit: ParsedCommit): string {
    return ["feat", "fix", "perf", "refactor"].includes(commit.type) ? commit.type : "other"
}

function truncate(text: string, max = MAX_DESCRIPTION): string {
    const chars = Array.from(text)
    return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text
}

function dedupeKey(commit: ParsedCommit): string {
    return `${commit.scope}\u0000${commit.description}`.toLowerCase()
}

/**
 * 把提交标题整理成卡片可直接渲染的分组。
 * 先每组取 2 项保证各类都能露脸，再按组顺序补到上限。
 */
export function summarizeCommits(subjects: string[], options: { maxItems?: number; maxPerGroup?: number } = {}): CommitSummary {
    const maxItems = options.maxItems ?? 9
    const maxPerGroup = options.maxPerGroup ?? 4

    const seen = new Set<string>()
    const commits: ParsedCommit[] = []
    for (const subject of subjects) {
        const commit = parseCommitSubject(subject)
        if (!commit || isNoise(commit)) continue
        const key = dedupeKey(commit)
        if (seen.has(key)) continue
        seen.add(key)
        commits.push(commit)
    }

    // 全是内部改动时给一句兜底，避免卡片空白
    if (commits.length === 0) {
        commits.push({ type: "other", scope: "", description: "本次发布以稳定性与细节优化为主", breaking: false })
    }

    const grouped = new Map<string, ParsedCommit[]>(GROUPS.map(group => [group.key, []]))
    for (const commit of commits) grouped.get(groupKey(commit))?.push(commit)

    const take = new Map<string, number>(GROUPS.map(group => [group.key, 0]))
    let selected = 0
    for (const group of GROUPS) {
        const count = Math.min(grouped.get(group.key)?.length ?? 0, 2, maxItems - selected)
        take.set(group.key, count)
        selected += count
    }
    for (const group of GROUPS) {
        const all = grouped.get(group.key) ?? []
        const extra = Math.min(all.length, maxPerGroup) - (take.get(group.key) ?? 0)
        const count = Math.max(0, Math.min(extra, maxItems - selected))
        take.set(group.key, (take.get(group.key) ?? 0) + count)
        selected += count
    }

    const groups: SummaryGroup[] = []
    let hiddenCount = 0
    for (const group of GROUPS) {
        const all = grouped.get(group.key) ?? []
        if (all.length === 0) continue
        const count = take.get(group.key) ?? 0
        hiddenCount += all.length - count
        if (count === 0) continue
        groups.push({
            ...group,
            total: all.length,
            items: all.slice(0, count).map(commit => ({
                scope: commit.scope,
                description: truncate(commit.description),
                breaking: commit.breaking,
            })),
        })
    }

    return {
        groups,
        counts: Object.fromEntries(GROUPS.map(group => [group.key, grouped.get(group.key)?.length ?? 0])),
        totalCount: commits.length,
        selectedCount: selected,
        hiddenCount,
        breaking: commits.some(commit => commit.breaking),
    }
}

/** 规则回退用的 B 站正文；超长时从尾部逐条丢弃并标注剩余条数。 */
export function buildDynamicText(summary: CommitSummary, meta: Pick<VersionMeta, "version" | "repo" | "tag">, maxLength = 1900): string {
    const title = `DNA Builder v${meta.version} 更新啦！`
    const url = `https://github.com/${meta.repo}/releases/tag/${meta.tag}`
    const blocks = summary.groups.map(group => ({
        label: group.label,
        items: group.items.map(item => `${item.breaking ? "[破坏性] " : ""}${item.scope ? `[${item.scope}] ` : ""}${item.description}`),
    }))
    const total = blocks.reduce((sum, block) => sum + block.items.length, 0)

    const compose = (included: number): string => {
        const lines = [title, ""]
        if (summary.breaking) lines.push("注意：本次更新包含破坏性变更，升级前请留意。", "")
        let used = 0
        for (const block of blocks) {
            const count = Math.max(0, Math.min(block.items.length, included - used))
            if (count === 0) continue
            lines.push(block.label)
            for (const item of block.items.slice(0, count)) lines.push(`· ${item}`)
            used += count
        }
        if (used < total) lines.push(`……另有 ${total - used} 项更新`)
        lines.push("", `完整更新：${url}`)
        return lines.join("\n")
    }

    for (let included = total; included >= 0; included -= 1) {
        const text = compose(included)
        // B 站按字符计长，emoji 不能按 UTF-16 单元算
        if (Array.from(text).length <= maxLength) return text
    }
    return Array.from(compose(0)).slice(0, maxLength).join("")
}
