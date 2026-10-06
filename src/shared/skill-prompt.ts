/**
 * 技能清单段（资料检索与配装两个 Agent 共用）。
 *
 * 格式对齐 ZCode 的 buildSkillsContent：首行固定提示、一行一个技能、按名称排序、
 * 单条描述截断、整段超预算降级为只列名字与路径。内容由装配层交给内核的 `metaUserPrefix`，
 * 经 `<system-reminder>` 包裹后作为置于对话最前的 user 消息随每轮请求下发——不进系统提示词本体。
 */

/** 技能清单条目（由 `skills/registry.ts` 的快照提供） */
export interface AgentSkillPromptEntry {
    name: string
    description: string
    whenToUse?: string
}

/** 单条描述截断阈值（与 ZCode 相同：超长取前 249 字 + `...`） */
const MAX_DESCRIPTION_CHARS = 250

/** 整段字符预算，超出后降级为只列名字与路径（与 ZCode 相同） */
const METADATA_BUDGET_CHARS = 20_000

/** 渲染技能清单内容；清单为空时返回空串（调用方整段省略）。 */
export function renderSkillPromptSection(skills: readonly AgentSkillPromptEntry[] = []): string {
    if (!skills.length) {
        return ""
    }

    const header = "The following skills are available for use with the Skill tool:"
    const sorted = [...skills].sort((a, b) => a.name.localeCompare(b.name))

    const full = [header, "", ...sorted.map(skill => formatSkillLine(skill))].join("\n")
    if (full.length <= METADATA_BUDGET_CHARS) {
        return full
    }

    return [header, "", ...sorted.map(skill => `- ${skill.name} (file: ${skillFilePath(skill.name)})`)].join("\n")
}

/** 单条技能行：`- name: 描述 - 适用时机 (file: /name/SKILL.md)`。 */
function formatSkillLine(skill: AgentSkillPromptEntry): string {
    const description = skill.whenToUse ? `${skill.description} - ${skill.whenToUse}` : skill.description
    const trimmed = description.length > MAX_DESCRIPTION_CHARS ? `${description.slice(0, MAX_DESCRIPTION_CHARS - 1)}...` : description

    return `- ${skill.name}: ${trimmed} (file: ${skillFilePath(skill.name)})`
}

/** 技能入口文件的路径（即 `read_file` 的取用路径）。 */
function skillFilePath(name: string): string {
    return `/${name}/SKILL.md`
}
