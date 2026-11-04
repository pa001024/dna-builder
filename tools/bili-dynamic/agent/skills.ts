/**
 * @file 本地技能：读取 .agents/skills/<name>/SKILL.md 的 frontmatter，
 * 把清单注入提示词，并按需加载技能正文与参考资料。
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

/** 单条技能描述截断阈值，与 Web 端 skill-prompt 一致 */
const MAX_DESCRIPTION_CHARS = 250
/** 整段字符预算，超出后降级为只列名字 */
const METADATA_BUDGET_CHARS = 20_000
/** 单个技能文件注入上限 */
const MAX_SKILL_FILE_CHARS = 60_000

export interface SkillEntry {
    name: string
    description: string
    whenToUse: string
    files: string[]
}

function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
    const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text)
    if (!match) return { meta: {}, body: text }
    const meta: Record<string, string> = {}
    for (const line of match[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
        if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "")
    }
    return { meta, body: text.slice(match[0].length) }
}

function listFiles(dir: string, base = ""): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue
        const relative = base ? `${base}/${entry.name}` : entry.name
        if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), relative))
        else if (/\.(md|txt|json|yml|yaml)$/i.test(entry.name)) out.push(relative)
    }
    return out
}

/** 扫描技能目录；目录不存在时返回空清单 */
export function loadSkills(root: string, skillsDir = ".agents/skills"): Map<string, SkillEntry> {
    const dir = path.join(root, skillsDir)
    const skills = new Map<string, SkillEntry>()
    if (!existsSync(dir)) return skills

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const skillDir = path.join(dir, entry.name)
        const skillFile = path.join(skillDir, "SKILL.md")
        if (!existsSync(skillFile)) continue
        const { meta, body } = parseFrontmatter(readFileSync(skillFile, "utf8"))
        if (meta.enabled === "false") continue
        skills.set(entry.name, {
            name: entry.name,
            description: meta.description || body.split(/\r?\n/).find(line => line.trim()) || "",
            whenToUse: meta.whentouse ?? meta["when-to-use"] ?? "",
            files: listFiles(skillDir),
        })
    }
    return skills
}

/** 技能清单段：一行一个，超出预算降级为只列名字 */
export function renderSkillSection(skills: Map<string, SkillEntry>): string {
    if (skills.size === 0) return ""
    const header = "以下技能可用，需要时用 read_skill 读取："
    const lines = [...skills.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(skill => {
            const text = skill.whenToUse ? `${skill.description} - ${skill.whenToUse}` : skill.description
            const trimmed = text.length > MAX_DESCRIPTION_CHARS ? `${text.slice(0, MAX_DESCRIPTION_CHARS - 1)}...` : text
            return `- ${skill.name}: ${trimmed} (file: ${skill.name}/SKILL.md)`
        })
    const full = [header, ...lines].join("\n")
    if (full.length <= METADATA_BUDGET_CHARS) return full
    return [header, ...[...skills.keys()].sort().map(name => `- ${name} (file: ${name}/SKILL.md)`)].join("\n")
}

/** 读取技能正文或参考资料；路径形如 `db-style/SKILL.md` */
export function readSkillFile(root: string, skills: Map<string, SkillEntry>, relative: string, skillsDir = ".agents/skills"): string {
    const normalized = relative.replaceAll("\\", "/").replace(/^\/+/, "")
    const [name, ...rest] = normalized.split("/")
    const skill = skills.get(name)
    if (!skill) throw new Error(`未知技能：${name}（可用：${[...skills.keys()].join("、")}）`)
    const fileRelative = rest.join("/") || "SKILL.md"
    if (!skill.files.includes(fileRelative)) {
        throw new Error(`技能 ${name} 没有文件 ${fileRelative}（可用：${skill.files.join("、")}）`)
    }
    const file = path.join(root, skillsDir, name, fileRelative)
    const stat = statSync(file)
    if (stat.size > MAX_SKILL_FILE_CHARS) throw new Error(`技能文件过大：${fileRelative}`)
    return readFileSync(file, "utf8").slice(0, MAX_SKILL_FILE_CHARS)
}
