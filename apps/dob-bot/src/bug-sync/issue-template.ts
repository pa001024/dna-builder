/**
 * Issue 标题 / 正文 / 标签渲染。
 *
 * 模板与 `apps/server/src/bugs/github.ts` 的 `computeIssueTitle` / `computeIssueBody` /
 * `computeLabels` 保持一致：Bridge 是独立 Bun 进程，不能 import server 代码，而
 * `outbox/read` 只给 Bug 行投影不给渲染结果。**改模板需同步两处**。
 */

/** Bug 行投影：只用到公开字段，缺失信息写"尚未提供"。 */
export type IssueBugRow = {
    id: string
    displayKey: string
    title: string
    summary: string
    expected?: string | null
    actual?: string | null
    steps?: string[]
    environment?: { platform?: string | null; region?: string | null; gameVersion?: string | null } | null
    primaryCategory?: string | null
    tags?: string[]
    status?: string | null
    fixStage?: string | null
    confirmedSeverity?: string | null
    suggestedSeverity?: string | null
}

export type IssueBodyOptions = {
    eventId?: string
    siteUrl?: string
    voteCount?: number
    reportCount?: number
    labels?: readonly string[]
}

const FIX_STAGE_KEYS = [
    "fix.unconfirmed",
    "fix.needs_info",
    "fix.confirmed",
    "fix.planned",
    "fix.in_progress",
    "fix.reported_fixed",
    "fix.released",
    "fix.verified",
    "fix.regressed",
] as const

const FIX_LABELS: Record<string, string> = {
    "fix.unconfirmed": "fix:unconfirmed",
    "fix.needs_info": "fix:needs-info",
    "fix.confirmed": "fix:confirmed",
    "fix.planned": "fix:planned",
    "fix.in_progress": "fix:in-progress",
    "fix.reported_fixed": "fix:reported-fixed",
    "fix.released": "fix:released",
    "fix.verified": "fix:verified",
    "fix.regressed": "fix:regressed",
}

/** Bug 标题：`[BUG-123] 标题`，超长按字符截断。 */
export function computeIssueTitle(bug: Pick<IssueBugRow, "displayKey" | "title">): string {
    const title = `[${bug.displayKey}] ${bug.title}`.trim()
    return title.length > 200 ? `${title.slice(0, 197)}...` : title
}

/** 隐藏标记：仅用于关联与幂等恢复，不含凭据。 */
export function computeIssueMarker(bugId: string, eventId?: string): string {
    return `<!-- bug-bridge bug=${bugId} event=${eventId ?? bugId} schema=1 -->`
}

/** 从 Bug 行确定性地生成 Issue 正文。 */
export function computeIssueBody(bug: IssueBugRow, options: IssueBodyOptions = {}): string {
    const site = options.siteUrl?.replace(/\/+$/, "")
    const bugUrl = site ? `${site}/bugs/${encodeURIComponent(bug.id)}` : ""
    const labels = options.labels ?? computeLabels(bug)
    const severity = bug.confirmedSeverity ?? bug.suggestedSeverity ?? "U"
    const severitySource = bug.confirmedSeverity ? "维护者确认" : bug.suggestedSeverity ? "AI 建议（未经维护者确认）" : "未分级"
    const marker = computeIssueMarker(bug.id, options.eventId)

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
            formatSteps(bug.steps ?? []),
        ].join("\n"),
        [
            "## 反馈",
            "",
            `- 有效投票：${options.voteCount ?? 0}`,
            `- 受影响报告：${options.reportCount ?? 0}`,
            `- 主分类：${bug.primaryCategory ?? "other"}`,
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

/** 生成 Bridge 管理的标签名集合；未注册 tagKey 直接丢弃，人工标签不由这里决定。 */
export function computeLabels(
    bug: Pick<IssueBugRow, "tags" | "status" | "confirmedSeverity" | "suggestedSeverity" | "fixStage">
): string[] {
    const tagKeys = new Set(bug.tags ?? [])
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

/**
 * tagKey → GitHub canonical label；未注册的 tagKey 返回 null（不猜测语义）。
 * @param {string} tagKey
 * @returns {string | null}
 */
export function labelNameForTagKey(tagKey: string): string | null {
    if (FIX_LABELS[tagKey]) return FIX_LABELS[tagKey]
    const dot = tagKey.indexOf(".")
    if (dot <= 0) return null
    const namespace = tagKey.slice(0, dot)
    const rest = tagKey.slice(dot + 1)
    if (!rest) return null
    if (namespace === "category" || namespace === "severity") return `${namespace}:${rest}`
    if (tagKey === "type.game_bug") return "type:game-bug"
    if (tagKey === "source.bug_library") return "source:bug-library"
    return null
}

/**
 * 当前有效修复阶段：按字典顺序取第一个出现的 fix 标签，否则 unconfirmed。
 * @param {readonly string[]} activeTagKeys
 * @returns {string}
 */
function computeFixStage(activeTagKeys: readonly string[]): string {
    const present = new Set(activeTagKeys)
    return FIX_STAGE_KEYS.find(key => present.has(key)) ?? "fix.unconfirmed"
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function orPlaceholder(value: string | null | undefined): string {
    const text = value?.trim()
    return text ? text : "尚未提供"
}

/**
 * @param {IssueBugRow} bug
 * @returns {string}
 */
function formatEnvironment(bug: IssueBugRow): string {
    const environment = bug.environment ?? {}
    const parts = [
        environment.platform ? `平台：${environment.platform}` : null,
        environment.region ? `区服：${environment.region}` : null,
        environment.gameVersion ? `版本：${environment.gameVersion}` : null,
    ].filter(Boolean)
    return parts.length ? parts.join(" / ") : "尚未提供"
}

/**
 * @param {readonly string[]} steps
 * @returns {string}
 */
function formatSteps(steps: readonly string[]): string {
    if (!steps.length) return "尚未提供"
    return steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
}
