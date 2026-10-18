/**
 * 文件型技能库：技能以普通目录形式存放于 `server/skills/<技能名>/`，由 git 直接管理版本。
 *
 * 元数据全部来自 SKILL.md 的 frontmatter，包体（zip）在**下发时实时打包**——不落库、不落盘副本，
 * 改文件即改技能；打进 git 的技能目录改一次就多一条历史，回退用 git 即可。
 *
 * 缓存键是「文件路径 + 大小 + mtime」的指纹而非目录 mtime：改已有文件的内容不会更新目录 mtime，
 * 用目录 mtime 做键会把旧内容一直缓存下去。目录增删文件、或任一文件内容变化都会让指纹改变。
 */

import type { Dirent } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
import { buildSkillZip, deriveSkillMeta, SKILL_ENTRY_FILE, type SkillMeta } from "../util/skill-source"

/** server 目录（`src/api` 往上两级） */
const SERVER_DIR = resolve(import.meta.dir, "../..")

/** 技能库的根目录；可用 SKILLS_DIR 覆盖（相对路径按 server 目录解析） */
const SKILLS_ROOT = process.env.SKILLS_DIR ? resolve(SERVER_DIR, process.env.SKILLS_DIR) : join(SERVER_DIR, "skills")

/** 单个技能目录解析结果（元数据 + 打包用文件表） */
interface SkillSource {
    meta: SkillMeta
    files: Map<string, Uint8Array>
}

/** 目录扫描出的一个文件（只有 stat 信息，不含内容） */
interface ScannedFile {
    path: string
    size: number
    mtimeMs: number
}

/** 解析结果缓存：key 为技能名，指纹一致时直接复用 */
const sourceCache = new Map<string, { fingerprint: string; source: SkillSource }>()

/** 一次性包体缓存：key 为 `<技能名>:<sha256>`，避免同内容重复打包 */
const zipCache = new Map<string, Uint8Array>()
const MAX_ZIP_CACHE_ENTRIES = 32

/** 技能库根目录（供日志 / 排查用）。 */
export function getSkillsRoot(): string {
    return SKILLS_ROOT
}

/** 递归扫描技能目录：只取 stat，不读内容；路径统一正斜杠、入口文件排最前。 */
async function scanSkillDir(dir: string): Promise<ScannedFile[]> {
    const files: ScannedFile[] = []

    const walk = async (current: string, prefix: string): Promise<void> => {
        const dirents = await readdir(current, { withFileTypes: true })
        for (const dirent of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
            const absolute = join(current, dirent.name)
            const relative = prefix ? `${prefix}/${dirent.name}` : dirent.name

            if (dirent.isDirectory()) {
                await walk(absolute, relative)
                continue
            }

            if (!dirent.isFile()) {
                continue
            }

            const info = await stat(absolute)
            files.push({ path: relative, size: info.size, mtimeMs: info.mtimeMs })
        }
    }

    await walk(dir, "")

    return files.sort((a, b) => {
        if (a.path === SKILL_ENTRY_FILE) return -1
        if (b.path === SKILL_ENTRY_FILE) return 1
        return a.path.localeCompare(b.path)
    })
}

/** 按扫描结果逐个读入文件内容。 */
async function readScannedFiles(dir: string, files: ScannedFile[]): Promise<Map<string, Uint8Array>> {
    const contents = new Map<string, Uint8Array>()

    for (const file of files) {
        contents.set(file.path, new Uint8Array(await readFile(join(dir, file.path))))
    }

    return contents
}

/** 读取并校验单个技能目录（按内容指纹缓存）；目录不合法或读盘失败时返回 null。 */
async function readSkillSource(name: string): Promise<SkillSource | null> {
    const dir = join(SKILLS_ROOT, name)

    let scanned: ScannedFile[]
    try {
        // readdir 对非目录会抛错，这里顺带确认它真的是技能目录
        scanned = await scanSkillDir(dir)
    } catch {
        return null
    }

    const fingerprint = scanned.map(file => `${file.path}:${file.size}:${file.mtimeMs}`).join("\n")
    const cached = sourceCache.get(name)
    if (cached && cached.fingerprint === fingerprint) {
        return cached.source
    }

    try {
        const contents = await readScannedFiles(dir, scanned)
        const entries = scanned.map(file => ({ path: file.path, size: file.size, content: contents.get(file.path) as Uint8Array }))
        const updateAt = scanned.reduce((latest, file) => Math.max(latest, file.mtimeMs), 0)
        const result = deriveSkillMeta(name, entries, updateAt)

        if ("error" in result) {
            console.warn(`[skills] 跳过技能 ${name}：${result.error}`)
            sourceCache.delete(name)
            return null
        }

        const source: SkillSource = { meta: result.meta, files: result.files }
        sourceCache.set(name, { fingerprint, source })

        return source
    } catch (error) {
        console.warn(`[skills] 读取技能 ${name} 失败：${error instanceof Error ? error.message : String(error)}`)
        sourceCache.delete(name)
        return null
    }
}

/**
 * 列出技能库里的全部技能（仅元数据，不含包体），按排序权重与名称升序。
 * 每次调用都重新扫描目录，新增 / 修改 / 删除技能无需重启即生效。
 */
export async function listSkills(): Promise<SkillMeta[]> {
    let dirents: Dirent[]
    try {
        dirents = await readdir(SKILLS_ROOT, { withFileTypes: true })
    } catch {
        // 根目录不存在时视为空库(首次部署无需预建目录)
        return []
    }

    const names = dirents.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name)
    const sources = await Promise.all(names.map(name => readSkillSource(name)))
    const metas = sources.filter((source): source is SkillSource => !!source).map(source => source.meta)

    return metas.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/** 读取单个技能的 zip 包（实时打包，按 sha 缓存字节）；技能不存在或已停用时返回 null。 */
export async function readSkillPackage(name: string): Promise<Uint8Array | null> {
    const source = await readSkillSource(name)
    if (!source?.meta.enabled) {
        return null
    }

    const key = `${name}:${source.meta.packageSha}`
    const cached = zipCache.get(key)
    if (cached) {
        return cached
    }

    const zip = buildSkillZip(source.files)
    zipCache.set(key, zip)

    // 技能数量级很小，这里只是防止长期运行时堆积
    if (zipCache.size > MAX_ZIP_CACHE_ENTRIES) {
        zipCache.delete(zipCache.keys().next().value as string)
    }

    return zip
}

/** 清空解析与包体缓存（测试用）。 */
export function resetSkillLibraryCache(): void {
    sourceCache.clear()
    zipCache.clear()
}
