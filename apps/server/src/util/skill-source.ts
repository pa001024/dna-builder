/**
 * 文件型技能库的纯逻辑：SKILL.md frontmatter 解析、目录内容 → 元数据的推导、确定性 zip 打包。
 *
 * 打包固定条目 mtime 与排序，同一份目录内容必然产出同一份字节与 sha256——客户端按
 * 内容寻址缓存（`?sha=`）与完整性校验因此不会被无意义的重新打包击穿。
 */

import { createHash } from "node:crypto"
import { zipSync } from "fflate"

/** 技能入口文件（必须在技能目录根级） */
export const SKILL_ENTRY_FILE = "SKILL.md"

/** 单个技能的文件数上限 */
export const MAX_SKILL_FILE_COUNT = 50
/** 单个技能的文件大小上限（字节） */
export const MAX_SKILL_FILE_BYTES = 1024 * 1024
/** 单个技能的总大小上限（字节） */
export const MAX_SKILL_TOTAL_BYTES = 8 * 1024 * 1024
/** 技能描述长度上限 */
export const MAX_SKILL_DESCRIPTION_CHARS = 1024

/** 技能目录名的合法形态：小写 kebab-case */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** 打包用的固定时间戳：zip 的 mtime 下限（早于此会被 fflate 拒绝） */
const ZIP_EPOCH = new Date(1980, 0, 1)

/** 技能元数据（清单接口的返回体，与客户端 `AgentSkillMeta` 对齐） */
export interface SkillMeta {
    id: string
    name: string
    description: string
    whenToUse: string | null
    version: string | null
    enabled: boolean
    sortOrder: number
    packageSha: string
    packageSize: number
    fileCount: number
    updateAt: number
}

/** 技能目录内容到元数据的推导结果 */
export type SkillMetaResult = { meta: SkillMeta; files: Map<string, Uint8Array> } | { error: string }

/**
 * 解析 SKILL.md 头部的 `---` frontmatter 块（扁平 `key: value`，值可用引号包裹）。
 * 兼容 camelCase 与 snake_case 键；不解析嵌套结构与多行块标量。
 */
export function parseSkillFrontmatter(content: string): Record<string, string> {
    if (!/^---[ \t]*\r?\n/.test(content)) {
        return {}
    }

    const endMatch = /^\s*---[ \t]*(?:\r?\n|$)/m.exec(content.slice(4))
    if (!endMatch) {
        return {}
    }

    const result: Record<string, string> = {}
    for (const line of content.slice(4, 4 + endMatch.index).split(/\r?\n/)) {
        const match = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/.exec(line)
        if (!match) {
            continue
        }

        const raw = match[2].trim()
        const unquoted = /^(".*"|'.*')$/s.test(raw) ? raw.slice(1, -1) : raw
        result[match[1]] = unquoted
    }

    return result
}

/** 从 frontmatter 里取值（同时认 camelCase 与 snake_case 两种键名）。 */
function readField(fields: Record<string, string>, camel: string, snake: string): string {
    return (fields[camel] ?? fields[snake] ?? "").trim()
}

/**
 * 过滤技能目录里的条目：剔除隐藏文件、`__MACOSX` 与目录，路径统一正斜杠。
 * 与客户端解包（`src/api/agent/skills/zip.ts`）的口径一致。
 */
export function filterSkillEntries(entries: Iterable<{ path: string; size: number; content: Uint8Array }>): {
    files: Map<string, Uint8Array>
    totalSize: number
} {
    const files = new Map<string, Uint8Array>()
    let totalSize = 0

    for (const entry of entries) {
        const path = entry.path.replace(/\\/g, "/").replace(/^\.?\/+/, "")
        if (!path || path.endsWith("/")) {
            continue
        }

        if (path.split("/").some(segment => segment === "__MACOSX" || segment.startsWith("."))) {
            continue
        }

        files.set(path, entry.content)
        totalSize += entry.size
    }

    return { files, totalSize }
}

/**
 * 确定性打包：条目按路径排序、统一固定 mtime，同一份内容产出同一份字节。
 */
export function buildSkillZip(files: Map<string, Uint8Array>): Uint8Array {
    const entries: Record<string, Uint8Array> = {}
    for (const path of [...files.keys()].sort()) {
        entries[path] = files.get(path) as Uint8Array
    }

    return zipSync(entries, { level: 6, mtime: ZIP_EPOCH })
}

/** 计算字节内容的 sha256（hex）。 */
export function sha256Hex(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex")
}

/**
 * 校验单个技能目录的内容并推导元数据：目录名即技能名，描述来自 SKILL.md 的 frontmatter。
 * 不合法（无根级 SKILL.md / 缺描述 / 超限）时返回错误文案，调用方跳过该技能并告警。
 */
export function deriveSkillMeta(
    dirName: string,
    entries: Iterable<{ path: string; size: number; content: Uint8Array }>,
    updateAt: number
): SkillMetaResult {
    if (!SKILL_NAME_PATTERN.test(dirName) || dirName.length > 64) {
        return { error: `目录名 ${dirName} 不是合法的小写 kebab-case（≤64 字符）` }
    }

    const { files, totalSize } = filterSkillEntries(entries)
    if (!files.size) {
        return { error: "技能目录为空" }
    }

    if (files.size > MAX_SKILL_FILE_COUNT) {
        return { error: `文件数超过 ${MAX_SKILL_FILE_COUNT} 上限` }
    }

    for (const [path, content] of files) {
        if (content.length > MAX_SKILL_FILE_BYTES) {
            return { error: `文件 ${path} 超过 ${MAX_SKILL_FILE_BYTES / 1024 / 1024}MB 上限` }
        }
    }

    if (totalSize > MAX_SKILL_TOTAL_BYTES) {
        return { error: `总大小超过 ${MAX_SKILL_TOTAL_BYTES / 1024 / 1024}MB 上限` }
    }

    const entry = files.get(SKILL_ENTRY_FILE)
    if (!entry) {
        return { error: "根目录缺少 SKILL.md：技能正文必须写在技能目录根的 SKILL.md 里" }
    }

    const fields = parseSkillFrontmatter(new TextDecoder().decode(entry))
    const description = readField(fields, "description", "description")
    if (!description || description.length > MAX_SKILL_DESCRIPTION_CHARS) {
        return { error: `SKILL.md frontmatter 的 description 必填且不超过 ${MAX_SKILL_DESCRIPTION_CHARS} 字符` }
    }

    const zip = buildSkillZip(files)
    const sortOrderRaw = readField(fields, "sortOrder", "sort_order")
    const enabledRaw = readField(fields, "enabled", "enabled").toLowerCase()

    return {
        meta: {
            id: dirName,
            name: dirName,
            description,
            whenToUse: readField(fields, "whenToUse", "when_to_use") || null,
            version: readField(fields, "version", "version") || null,
            enabled: enabledRaw !== "false" && enabledRaw !== "0" && enabledRaw !== "no",
            sortOrder: Number.isFinite(Number(sortOrderRaw)) ? Math.max(0, Math.trunc(Number(sortOrderRaw))) : 0,
            packageSha: sha256Hex(zip),
            packageSize: zip.length,
            fileCount: files.size,
            updateAt,
        },
        files,
    }
}
