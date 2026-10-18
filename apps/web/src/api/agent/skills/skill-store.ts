/**
 * 技能包的落盘缓存层（复用 `pack-storage`，OPFS 优先、IndexedDB 回退）。
 *
 * 目录布局：`<存储根>/agent-skills/<技能名>/<manifest.json 与包内文件>`；manifest 记包的 sha256，
 * 与服务端清单一致就直接读本地、不一致才重新拉包。存储不可用时全部降级为 null / no-op。
 */

import { getPackStorageRoot, isPackStorageAvailable, type PackDirectoryHandle } from "@/utils/data-pack/pack-storage"

/** 技能在存储层的根目录名 */
const STORAGE_DIR = "agent-skills"

/** 落盘 manifest 的结构（files 不含 manifest 自身） */
export interface StoredSkillManifest {
    sha256: string
    files: string[]
}

/** 取技能目录句柄；存储不可用或目录不存在时返回 null。 */
async function getSkillDir(name: string, create: boolean): Promise<PackDirectoryHandle | null> {
    if (!(await isPackStorageAvailable())) {
        return null
    }

    try {
        const root = await getPackStorageRoot()
        const base = await root.getDirectoryHandle(STORAGE_DIR, { create: true })

        return await base.getDirectoryHandle(name, { create })
    } catch {
        // 目录不存在等正常失败按「无缓存」处理
        return null
    }
}

/** 读取技能目录下的一个文本文件；不存在时返回 null。 */
async function readTextFile(dir: PackDirectoryHandle, path: string): Promise<string | null> {
    const segments = path.split("/")
    const fileName = segments.pop()
    if (!fileName) {
        return null
    }

    try {
        let current = dir
        for (const segment of segments) {
            current = await current.getDirectoryHandle(segment)
        }

        const file = await (await current.getFileHandle(fileName)).getFile()

        return await file.text()
    } catch {
        return null
    }
}

/** 在技能目录下写一个文本文件（自动创建中间目录）。 */
async function writeTextFile(dir: PackDirectoryHandle, path: string, content: string): Promise<void> {
    const segments = path.split("/")
    const fileName = segments.pop()
    if (!fileName) {
        return
    }

    let current = dir
    for (const segment of segments) {
        current = await current.getDirectoryHandle(segment, { create: true })
    }

    const writable = await (await current.getFileHandle(fileName, { create: true })).createWritable()

    await writable.write(content)
    await writable.close()
}

/** 读取已落盘的技能缓存（manifest + 全部文件）；无缓存或落盘不完整时返回 null。 */
export async function readStoredSkill(name: string): Promise<{ sha256: string; files: Map<string, string> } | null> {
    const dir = await getSkillDir(name, false)
    if (!dir) {
        return null
    }

    const manifestRaw = await readTextFile(dir, "manifest.json")
    if (!manifestRaw) {
        return null
    }

    let manifest: StoredSkillManifest
    try {
        manifest = JSON.parse(manifestRaw) as StoredSkillManifest
    } catch {
        return null
    }

    if (!manifest.sha256 || !Array.isArray(manifest.files) || !manifest.files.length) {
        return null
    }

    const files = new Map<string, string>()

    for (const path of manifest.files) {
        if (path === "manifest.json") {
            continue
        }

        const content = await readTextFile(dir, path)
        if (content === null) {
            // 落盘不完整：视为无缓存，触发重新下载
            return null
        }

        files.set(path, content)
    }

    return { sha256: manifest.sha256, files }
}

/** 把技能包整体写入落盘缓存（先清旧目录再写 manifest 与文件）。 */
export async function writeStoredSkill(name: string, sha256: string, files: Map<string, string>): Promise<void> {
    try {
        await removeStoredSkill(name)

        const dir = await getSkillDir(name, true)
        if (!dir) {
            return
        }

        const manifest: StoredSkillManifest = { sha256, files: [...files.keys()] }
        await writeTextFile(dir, "manifest.json", JSON.stringify(manifest))

        for (const [path, content] of files) {
            await writeTextFile(dir, path, content)
        }
    } catch (error) {
        // 落盘失败不阻塞技能使用（本次会话内存里有完整内容）
        console.warn(`技能 ${name} 落盘失败:`, error)
    }
}

/** 删除技能的落盘缓存（技能包更新或读取失败时重建）。 */
export async function removeStoredSkill(name: string): Promise<void> {
    try {
        if (!(await isPackStorageAvailable())) {
            return
        }

        const root = await getPackStorageRoot()
        const base = await root.getDirectoryHandle(STORAGE_DIR)

        await base.removeEntry(name, { recursive: true })
    } catch {
        // 目录本就不存在，视为已删除
    }
}
