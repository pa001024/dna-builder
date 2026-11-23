import { computeFixStage, labelNameForTagKey } from "./tags"
import type { BugRow } from "./types"

export const BUG_ISSUE_TARGET_FALLBACK = "bug-repository"

/** 出站目标键：配置了仓库 id 时用它，否则落到固定占位，避免从 URL 或模型输出推断。 */
export function defaultIssueTargetMapping(): string {
    const repositoryId = process.env.GITHUB_BUG_REPOSITORY_ID?.trim()
    return `repo:${repositoryId || BUG_ISSUE_TARGET_FALLBACK}`
}

export type IssueBodyOptions = {
    /** 站点根地址，用于拼接本站 BUG 链接。 */
    siteUrl?: string
    /** 触发本次 Issue 的领域事件，用于隐藏标记与幂等恢复。 */
    eventId?: string
    voteCount?: number
    reportCount?: number
    labels?: readonly string[]
}

/** Issue 标题：`[BUG-123] 标题`，超长按字符截断。 */
export function computeIssueTitle(bug: Pick<BugRow, "displayKey" | "title">): string {
    const title = `[${bug.displayKey}] ${bug.title}`.trim()
    return title.length > 200 ? `${title.slice(0, 197)}...` : title
}

function orPlaceholder(value: string | null | undefined): string {
    const text = value?.trim()
    return text ? text : "尚未提供"
}

function formatEnvironment(bug: BugRow): string {
    const environment = bug.environment ?? {}
    const parts = [
        environment.platform ? `平台：${environment.platform}` : null,
        environment.region ? `区服：${environment.region}` : null,
        environment.gameVersion ? `版本：${environment.gameVersion}` : null,
    ].filter(Boolean)
    return parts.length ? parts.join(" / ") : "尚未提供"
}

function formatSteps(steps: readonly string[]): string {
    if (!steps.length) return "尚未提供"
    return steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
}

/**
 * @description 从 Bug 行确定性地生成 Issue 正文：只包含可公开字段，缺失信息写"尚未提供"，
 * 不带回执 token、对象 key 或私有 hash。隐藏标记仅用于关联与幂等恢复。
 * @param bug Bug 行
 * @param options 站点地址、事件 id 与计数摘要
 * @returns Markdown 正文
 */
export function computeIssueBody(bug: BugRow, options: IssueBodyOptions = {}): string {
    const site = options.siteUrl?.replace(/\/+$/, "")
    const bugUrl = site ? `${site}/bugs/${encodeURIComponent(bug.id)}` : ""
    const labels = options.labels ?? computeLabels(bug)
    const severity = bug.confirmedSeverity ?? bug.suggestedSeverity ?? "U"
    const severitySource = bug.confirmedSeverity ? "维护者确认" : bug.suggestedSeverity ? "AI 建议（未经维护者确认）" : "未分级"
    const marker = `<!-- bug-bridge bug=${bug.id} event=${options.eventId ?? bug.id} schema=1 -->`

    const sections = [
        `## 摘要\n\n${bug.summary || "尚未提供"}`,
        [
            "## 事实与缺失信息",
            "",
            `- 实际行为：${orPlaceholder(bug.actual)}`,
            `- 期望行为：${orPlaceholder(bug.expected)}`,
            `- 影响环境：${formatEnvironment(bug)}`,
            `- 严重程度：${severity}（${severitySource}）`,
            "",
            "### 复现步骤",
            "",
            formatSteps(bug.steps),
        ].join("\n"),
        [
            "## 反馈",
            "",
            `- 有效投票：${options.voteCount ?? 0}`,
            `- 受影响报告：${options.reportCount ?? 0}`,
            `- 主分类：${bug.primaryCategory}`,
            `- 标签：${labels.length ? labels.join("、") : "无"}`,
        ].join("\n"),
        [
            "## 同步说明",
            "",
            `- BUG ID：${bug.displayKey}`,
            ...(bugUrl ? [`- 本站链接：${bugUrl}`] : []),
            "- 本 Issue 由 BUG 库自动创建；AI 摘要不代表已经复现或得到游戏官方确认。",
            "- 原始截图不直接公开；仅脱敏派生图可进入公开渠道。",
        ].join("\n"),
        marker,
    ]

    return sections.join("\n\n")
}

/**
 * @description 生成 Bridge 管理的标签名集合：只映射已注册 tagKey，保留人工标签由 Bridge 不动；
 * 信息不足与未经复现使用 GitHub 兼容标签。
 * @param bug Bug 行
 * @param extraTagKeys 额外标签（尚未投影到 Bug 行时使用）
 * @returns 去重排序后的 label 名
 */
export function computeLabels(
    bug: Pick<BugRow, "tags" | "status" | "confirmedSeverity" | "suggestedSeverity" | "fixStage">,
    extraTagKeys: readonly string[] = []
): string[] {
    const tagKeys = new Set([...(bug.tags ?? []), ...extraTagKeys])
    tagKeys.add(computeFixStage([...tagKeys]))

    const labels = new Set<string>()
    for (const tagKey of tagKeys) {
        const label = labelNameForTagKey(tagKey)
        if (label) labels.add(label)
    }

    if (bug.status === "needs_info") labels.add("needs-info")
    if (!bug.confirmedSeverity && !bug.suggestedSeverity) labels.add("unverified")

    return [...labels].sort()
}

/** 隐藏标记，单独导出便于 Bridge 校验；不包含任何凭据。 */
export function computeIssueMarker(bugId: string, eventId?: string): string {
    return `<!-- bug-bridge bug=${bugId} event=${eventId ?? bugId} schema=1 -->`
}
