/**
 * SKILL.md frontmatter 剥离（注入模型前调用）。
 *
 * 只认文件头的 `---` 块并按结束标记截断；不解析键值——结构化元数据以服务端清单为准，
 * 找不到结束标记时按原文返回。
 */

/** 剥掉 SKILL.md 的 frontmatter 块，返回正文；无 frontmatter 或块未闭合时原样返回。 */
export function stripSkillFrontmatter(content: string): string {
    if (!/^---[ \t]*\r?\n/.test(content)) {
        return content
    }

    // 结束标记是单独一行的 `---`（允许前导空白）
    const endMatch = /^\s*---[ \t]*(?:\r?\n|$)/m.exec(content.slice(4))
    if (!endMatch) {
        return content
    }

    return content.slice(4 + endMatch.index + endMatch[0].length)
}
