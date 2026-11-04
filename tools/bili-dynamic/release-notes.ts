/**
 * @file GitHub Release 正文组装：agent 生成的 markdown + 折叠的原始提交 + 下载信息。
 * agent 不可用或配置无效时退回原来的 git log 列表。
 */

export interface ReleaseNotesInput {
    tag: string
    previousTag: string
    repo: string
    /** agent 生成的 markdown；为空时走原版 */
    generated: string
    /** 原始提交标题 */
    commitSubjects: string[]
    /** 差量更新说明行（工作流已算好） */
    deltaLine?: string
    /** 完整安装包地址（可空） */
    installerUrl?: string
}

/** 只转义会破坏 markdown 结构的字符；括号与冒号在提交标题里很常见，保持原样 */
function escapeMarkdown(text: string): string {
    return text.replace(/([\\`*_[\]])/g, "\\$1")
}

/** 原版标题：没有 agent 产出时作为正文开头 */
export function buildLegacyNotes(input: ReleaseNotesInput): string {
    return input.previousTag ? `## 本次更新内容 (${input.previousTag} → ${input.tag})` : `## 本次更新内容 (${input.tag})`
}

/**
 * @description 组装完整 Release 正文。
 * 有 agent 产出时以它为主；原始提交始终折叠在末尾，避免与正文重复。
 * @param input 版本信息、agent 产出与提交列表
 * @returns 可直接作为 release body 的 markdown
 */
export function buildReleaseNotes(input: ReleaseNotesInput): string {
    const commitList =
        input.commitSubjects.length > 0 ? input.commitSubjects.map(subject => `- ${escapeMarkdown(subject)}`) : ["- 无提交记录"]
    const downloads: string[] = []
    if (input.installerUrl) downloads.push(`> 直接下载：[${input.tag}](${input.installerUrl})`)
    // 工作流给的 delta_line 自带 "> " 前缀，去掉后再统一加，避免变成 "> >"
    if (input.deltaLine) downloads.push(`> ${input.deltaLine.replace(/^>+\s*/, "")}`)

    const tail = [
        downloads.length ? downloads.join("\n>\n") : "",
        "> [!TIP]\n> Github 请在下方下载\n>\n> 夸克网盘链接：https://pan.quark.cn/s/1419bbc8aa2d",
        `<details>\n<summary>原始提交记录（${input.commitSubjects.length} 条）</summary>\n\n${commitList.join("\n")}\n\n</details>`,
        `**Full Changelog**: https://github.com/${input.repo}/compare/${input.previousTag || input.tag}...${input.tag}`,
    ]
        .filter(Boolean)
        .join("\n\n")

    return `${input.generated || buildLegacyNotes(input)}\n\n${tail}`
}
