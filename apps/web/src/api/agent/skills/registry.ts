/**
 * Agent 技能注册表：清单拉取、按需下载落盘与技能资料目录的读取。
 *
 * 清单只有元数据（5 分钟内存缓存）；模型触达某个技能时才下载它的 zip 包：
 * 校验 sha256 → 解压 → 剥 SKILL.md frontmatter → 写入落盘缓存。网络与落盘的任何失败
 * 都降级为「技能不可用」，绝不抛出到工具调用之外。
 */

import { downloadAgentSkillPackage, listAgentSkills, type AgentSkillMeta } from "@/api/agentSkill"
import type { AgentSkillPromptEntry } from "@/shared/skill-prompt"
import { stripSkillFrontmatter } from "./frontmatter"
import { readStoredSkill, removeStoredSkill, writeStoredSkill } from "./skill-store"
import {
    grepSkillFiles,
    listVfsChildren,
    normalizeVfsPath,
    renderReadFile,
    vfsRelativePath,
    vfsSkillName,
    type GrepOptions,
    type ReadFileParams,
    type ReadFileResult,
} from "./vfs"
import { sha256Hex, unpackSkillPackage } from "./zip"

/** 系统提示词里的技能条目（契约归提示词层所有，见 `src/shared/skill-prompt.ts`） */
export type { AgentSkillPromptEntry } from "@/shared/skill-prompt"

/** 已加载技能的内存态：包摘要 + 文本文件表 */
interface LoadedSkill {
    sha256: string
    files: Map<string, string>
}

/** 清单的内存缓存时长：技能下发布局稳定，无需每次会话都打清单接口 */
const METADATA_TTL_MS = 5 * 60 * 1000

export class AgentSkillRegistry {
    private metas: AgentSkillMeta[] = []
    private loaded = new Map<string, LoadedSkill>()
    /** 进行中的技能加载任务（同名去重） */
    private loadingSkills = new Map<string, Promise<LoadedSkill | null>>()
    /** 进行中的清单刷新任务 */
    private metadataPromise: Promise<void> | null = null
    private metadataAt = 0

    /** 是否有可用技能（决定工具面与提示词段是否注入）。 */
    isAvailable(): boolean {
        return this.metas.length > 0
    }

    /** 取当前技能清单快照。 */
    getSkills(): readonly AgentSkillMeta[] {
        return this.metas
    }

    /** 确保清单就绪（TTL 内直接返回；进行中的刷新去重）。绝不抛错。 */
    async ensureReady(force = false): Promise<void> {
        if (!force && this.metadataAt && Date.now() - this.metadataAt < METADATA_TTL_MS) {
            return
        }

        this.metadataPromise ||= this.refreshMetadata().finally(() => {
            this.metadataPromise = null
        })

        await this.metadataPromise
    }

    /** 拉取并应用服务端清单；失败保留旧清单。 */
    private async refreshMetadata(): Promise<void> {
        try {
            const { skills } = await listAgentSkills()
            this.metas = skills
            this.metadataAt = Date.now()
        } catch (error) {
            console.warn("拉取 Agent 技能清单失败（沿用已有清单）:", error)
        }
    }

    private findMeta(name: string): AgentSkillMeta | undefined {
        return this.metas.find(skill => skill.name === name.toLowerCase())
    }

    /** 按名加载技能（内存 → 落盘 → 下载整包），同名加载去重；失败返回 null。 */
    async loadSkill(name: string): Promise<LoadedSkill | null> {
        const meta = this.findMeta(name)
        if (!meta) {
            return null
        }

        const cached = this.loaded.get(meta.name)
        if (cached && (!meta.packageSha || cached.sha256 === meta.packageSha)) {
            return cached
        }

        const inflight = this.loadingSkills.get(meta.name)
        if (inflight) {
            return inflight
        }

        const task = this.doLoadSkill(meta).finally(() => {
            this.loadingSkills.delete(meta.name)
        })
        this.loadingSkills.set(meta.name, task)

        return task
    }

    /** 技能加载执行体：落盘命中直接用；否则下载、验 sha、剥 frontmatter 后落盘。 */
    private async doLoadSkill(meta: AgentSkillMeta, retried = false): Promise<LoadedSkill | null> {
        const stored = await readStoredSkill(meta.name)
        if (stored && meta.packageSha && stored.sha256 === meta.packageSha) {
            const cached: LoadedSkill = { sha256: stored.sha256, files: stored.files }
            this.loaded.set(meta.name, cached)

            return cached
        }

        try {
            const bytes = await downloadAgentSkillPackage(meta.name, meta.packageSha)
            const sha = await sha256Hex(bytes)

            if (meta.packageSha && sha !== meta.packageSha) {
                await removeStoredSkill(meta.name)

                if (!retried) {
                    // 清单可能滞后于服务端刚替换的包：强刷清单后用新 sha 重试一次
                    await this.ensureReady(true)
                    const fresh = this.findMeta(meta.name)
                    if (fresh && fresh.packageSha !== meta.packageSha) {
                        return this.doLoadSkill(fresh, true)
                    }
                }

                console.warn(`技能 ${meta.name} 的包 sha256 与清单不一致，放弃使用`)

                return null
            }

            const raw = await unpackSkillPackage(bytes)
            const files = new Map<string, string>()

            for (const [path, content] of raw) {
                files.set(path, path.toLowerCase() === "skill.md" ? stripSkillFrontmatter(content) : content)
            }

            const loadedSkill: LoadedSkill = { sha256: sha, files }
            this.loaded.set(meta.name, loadedSkill)
            await writeStoredSkill(meta.name, sha, files)

            return loadedSkill
        } catch (error) {
            console.warn(`技能 ${meta.name} 加载失败:`, error)

            return null
        }
    }

    /** 按大小写不敏感的方式在文件表里取文件；未命中返回 undefined。 */
    private static lookupFile(files: Map<string, string>, path: string): string | undefined {
        const direct = files.get(path)
        if (direct !== undefined) {
            return direct
        }

        const lower = path.toLowerCase()
        for (const [candidate, content] of files) {
            if (candidate.toLowerCase() === lower) {
                return content
            }
        }

        return undefined
    }

    /** 生成提示词层的技能条目快照（只含元数据；内容一律由模型调 skill 工具加载）。 */
    getPromptSkills(): AgentSkillPromptEntry[] {
        return this.metas.map(meta => ({
            name: meta.name,
            description: meta.description,
            whenToUse: meta.whenToUse ?? undefined,
        }))
    }

    /** `list_file` 执行体：根目录只列技能（不触发下载），子目录按需加载后列文件。 */
    async listVfsDir(rawPath: string): Promise<string> {
        const path = normalizeVfsPath(rawPath)
        if (path === null) {
            return "错误：路径不合法（含 `..`、反斜杠或空段）。"
        }

        if (!this.metas.length) {
            return "当前服务端没有下发任何技能，技能资料目录为空。"
        }

        if (path === "") {
            const lines = this.metas.map(meta => `/${meta.name}/  — ${meta.description}`)

            return `${lines.join("\n")}\n\n（根目录下每个技能各占一个目录；用 list_file 列技能目录、read_file 读文件。）`
        }

        const skillName = vfsSkillName(path)
        const loaded = await this.loadSkill(skillName)
        if (!loaded) {
            return `错误：技能 ${skillName} 不存在、已停用或加载失败。`
        }

        const children = listVfsChildren([...loaded.files.keys()], vfsRelativePath(path))
        if (!children.length) {
            return `错误：/${path} 不是技能 ${skillName} 里的有效目录。`
        }

        const prefix = `/${path}`

        // listVfsChildren 给目录带了尾部 `/`，原样展示即可区分文件与目录
        return `${children.map(child => `${prefix}/${child}`).join("\n")}\n\n（目录以 / 结尾；用 read_file 读取文件。）`
    }

    /** `read_file` 执行体：按需加载技能后按切片语义读文件。 */
    async readVfsFile(rawPath: string, params: ReadFileParams): Promise<{ content: string; isError: boolean }> {
        const path = normalizeVfsPath(rawPath)
        if (path === null) {
            return { content: "错误：路径不合法（含 `..`、反斜杠或空段）。", isError: true }
        }

        const skillName = vfsSkillName(path)
        if (!skillName) {
            return { content: "错误：path 必须指向具体文件（如 /技能名/SKILL.md），可先用 list_file 浏览。", isError: true }
        }

        const loaded = await this.loadSkill(skillName)
        if (!loaded) {
            return { content: `错误：技能 ${skillName} 不存在、已停用或加载失败。`, isError: true }
        }

        const relPath = vfsRelativePath(path)
        if (!relPath) {
            return { content: `错误：/${path} 是目录，请用 list_file 查看后指定具体文件。`, isError: true }
        }

        const content = AgentSkillRegistry.lookupFile(loaded.files, relPath)
        if (content === undefined) {
            // 未命中时给同目录的兄弟条目，帮模型纠正路径
            const dir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : ""
            const siblings = listVfsChildren([...loaded.files.keys()], dir)

            return {
                content: `错误：技能 ${skillName} 里没有文件 ${relPath}。${siblings.length ? `可用文件：\n${siblings.join("\n")}` : ""}`,
                isError: true,
            }
        }

        const rendered: ReadFileResult = renderReadFile(content, params)

        return { content: rendered.notice ? `${rendered.content}\n\n${rendered.notice}` : rendered.content, isError: false }
    }

    /** `grep` 执行体：按需加载范围内的技能后做全文搜索。 */
    async grepVfs(options: GrepOptions): Promise<string> {
        const path = normalizeVfsPath(options.path)
        if (path === null) {
            return "错误：path 不合法（含 `..`、反斜杠或空段）。"
        }

        const skillName = path ? vfsSkillName(path).toLowerCase() : ""
        const targets = skillName ? this.metas.filter(meta => meta.name === skillName) : this.metas
        if (!targets.length) {
            return `错误：${skillName ? `技能 ${skillName} 不存在或已停用` : "当前没有可用的技能"}。`
        }

        const files: Array<{ path: string; content: string }> = []
        for (const meta of targets) {
            const loaded = await this.loadSkill(meta.name)
            if (!loaded) {
                continue
            }

            for (const [filePath, content] of loaded.files) {
                files.push({ path: `${meta.name}/${filePath}`, content })
            }
        }

        return grepSkillFiles(files, { ...options, path: path || undefined }).content
    }

    /** `skill` 执行体：返回技能 SKILL.md 全文（frontmatter 已剥离），输出格式对齐 ZCode。 */
    async loadSkillBody(name: string): Promise<string | null> {
        const meta = this.findMeta(name)
        if (!meta) {
            return null
        }

        const loaded = await this.loadSkill(meta.name)
        if (!loaded) {
            return null
        }

        const body = AgentSkillRegistry.lookupFile(loaded.files, "SKILL.md")
        if (body === undefined) {
            return null
        }

        const baseDirectory = `/${meta.name}/`

        return [
            `<skill_content name="${meta.name}">`,
            `# Skill: ${meta.name}`,
            "",
            // 技能目录变量在加载时展开为实际路径（与 ZCode handler 一致）
            body.trim().replace(/\$\{(CLAUDE_SKILL_DIR|ZCODE_SKILL_DIR)\}/gu, baseDirectory),
            "",
            `Base directory for this skill: ${baseDirectory}`,
            "Relative paths in this skill are relative to this base directory.",
            "</skill_content>",
        ]
            .filter(part => part !== "")
            .join("\n")
    }
}

/** 模块级单例：技能清单全局共享，多个 Agent 会话复用同一份缓存 */
let sharedRegistry: AgentSkillRegistry | null = null

/** 取共享的技能注册表单例。 */
export function getAgentSkillRegistry(): AgentSkillRegistry {
    sharedRegistry ??= new AgentSkillRegistry()

    return sharedRegistry
}

/** 会话发送前的就绪钩子：确保技能清单就绪；幂等，失败静默降级为无技能。 */
export async function ensureAgentSkillsReady(): Promise<void> {
    try {
        await getAgentSkillRegistry().ensureReady()
    } catch {
        // 注册表内部已兜底，这里只防意外
    }
}
