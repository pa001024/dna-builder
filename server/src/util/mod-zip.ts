import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"

/**
 * 游戏补丁 MOD 分享用的压缩包解析与补全逻辑。
 * 一个合法的 MOD 压缩包内至少应包含 mod.json（名称/描述/适用分类/前置 MOD 等）与 preview.png（封面）。
 * 若用户上传的包内缺失这些信息，由服务端自动补全后再入库。
 */

/** MOD 适用分类，与启动器 MOD 管理保持一致。 */
export const GAME_MOD_CATEGORIES = ["char", "weapon", "other", "standalone"] as const
export type GameModCategory = (typeof GAME_MOD_CATEGORIES)[number]

/** mod.json 中约定的字段结构。 */
export interface GameModManifest {
    name?: string
    description?: string
    /** 适用分类：char | weapon | other | standalone */
    category?: string
    /** 适用实体名称（角色名/武器名/自定义实体名），独立分类时可为空。 */
    entity?: string
    /** 需要的前置 MOD 名称/ID 列表。 */
    requires?: string[]
}

/** 压缩包解析结果。 */
export interface GameModZipInspection {
    /** 压缩包内全部文件（路径 -> 字节）。 */
    entries: Record<string, Uint8Array>
    /** 解析出的 mod.json 清单，缺失时为 null。 */
    manifest: GameModManifest | null
    /** 是否包含 preview.png。 */
    hasPreview: boolean
    /** preview.png 的字节，缺失时为 null。 */
    previewBytes: Uint8Array | null
    /** 是否包含 .pak 游戏补丁文件（大小写不敏感）。 */
    hasPak: boolean
}

/** 封面图片格式到扩展名。 */
const COVER_EXT_BY_MIME: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
}

/**
 * @description 根据 MIME 类型推导封面文件扩展名。
 * @param mime 图片 MIME 类型。
 * @returns 文件扩展名，未知时回退为 png。
 */
export function coverExtFromMime(mime: string): string {
    return COVER_EXT_BY_MIME[mime] || "png"
}

/**
 * @description 判断是否为合法的 MOD 分类。
 * @param category 分类字符串。
 * @returns 是否合法。
 */
export function isGameModCategory(category: string | undefined | null): category is GameModCategory {
    return !!category && (GAME_MOD_CATEGORIES as readonly string[]).includes(category)
}

/**
 * @description 从压缩包条目中查找指定文件名（忽略大小写，优先根目录）。
 * @param entries 压缩包条目映射。
 * @param target 目标文件名，如 mod.json。
 * @returns 命中条目路径与字节，未找到时返回 null。
 */
function findEntry(entries: Record<string, Uint8Array>, target: string): { path: string; bytes: Uint8Array } | null {
    let matched: { path: string; bytes: Uint8Array } | null = null
    for (const path of Object.keys(entries)) {
        const basename = path.split("/").pop() || ""
        if (basename.toLowerCase() === target) {
            // 优先根目录条目；同一文件名出现多次时只保留第一次根目录命中
            if (!matched?.path.includes("/")) {
                matched = { path, bytes: entries[path] }
            }
        }
    }
    return matched
}

/**
 * @description 解析压缩包内的 mod.json 内容。
 * @param bytes mod.json 原始字节。
 * @returns 解析后的清单，格式非法时返回 null。
 */
function parseManifest(bytes: Uint8Array): GameModManifest | null {
    try {
        const raw = strFromU8(bytes)
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== "object") return null
        const manifest: GameModManifest = {
            name: typeof parsed.name === "string" ? parsed.name : undefined,
            description: typeof parsed.description === "string" ? parsed.description : undefined,
            category: typeof parsed.category === "string" ? parsed.category : undefined,
            entity: typeof parsed.entity === "string" ? parsed.entity : undefined,
            requires: Array.isArray(parsed.requires)
                ? parsed.requires.filter((item: unknown): item is string => typeof item === "string")
                : undefined,
        }
        return manifest
    } catch {
        return null
    }
}

/**
 * @description 解析 MOD 压缩包：读取全部条目、mod.json、preview.png 并检测 .pak 文件。
 * @param bytes 压缩包字节。
 * @returns 压缩包解析结果。
 */
export function inspectModZip(bytes: Uint8Array): GameModZipInspection {
    const entries = unzipSync(bytes)
    const modJsonEntry = findEntry(entries, "mod.json")
    const previewEntry = findEntry(entries, "preview.png")
    const hasPak = Object.keys(entries).some(path => path.toLowerCase().endsWith(".pak"))
    return {
        entries,
        manifest: modJsonEntry ? parseManifest(modJsonEntry.bytes) : null,
        hasPreview: !!previewEntry,
        previewBytes: previewEntry ? previewEntry.bytes : null,
        hasPak,
    }
}

/**
 * @description 校验 MOD 压缩包是否符合分享格式要求：必须是合法 zip，且包含至少一个 .pak 补丁文件。
 * mod.json 与 preview.png 为可选，由服务端自动补全。
 * @param bytes 压缩包字节。
 * @returns 校验错误信息，校验通过时返回 null。
 */
export function validateModZip(bytes: Uint8Array): string | null {
    let inspection: GameModZipInspection
    try {
        inspection = inspectModZip(bytes)
    } catch {
        return "不是有效的 ZIP 压缩包"
    }
    if (!inspection.hasPak) {
        return "压缩包内未找到 .pak 补丁文件（格式要求：zip 内至少包含一个 .pak 文件）"
    }
    return null
}

/** 补全封面信息，供 supplementModZip 使用。 */
export interface GameModCoverSupplement {
    bytes: Uint8Array
    mime: string
}

/**
 * @description 根据用户表单与包内 mod.json 计算出最终生效的 MOD 清单。
 * 规则：表单字段优先，其次使用包内 mod.json，最后使用默认值；分类未指定时归入 standalone（独立）。
 * @param form 用户上传时填写的字段。
 * @param inside 包内 mod.json。
 * @param fileName 原始文件名，用于名称兜底。
 * @returns 最终生效的清单。
 */
export function resolveModManifest(
    form: { name?: string; description?: string; category?: string; entity?: string; requires?: string[] },
    inside: GameModManifest | null,
    fileName: string
): GameModManifest {
    const fallbackName =
        fileName
            .replace(/\.zip$/i, "")
            .replace(/[_.]+/g, " ")
            .trim() || "未命名 MOD"
    const category = form.category || inside?.category || "standalone"
    const requires = form.requires?.length ? form.requires : inside?.requires
    return {
        name: (form.name || inside?.name || fallbackName).trim(),
        description: form.description || inside?.description || "",
        category: isGameModCategory(category) ? category : "standalone",
        entity: form.entity ?? inside?.entity ?? "",
        requires: requires || [],
    }
}

/**
 * @description 补全 MOD 压缩包：确保包内包含 mod.json；缺失 preview.png 且提供封面时补入。
 * 若包内已有 mod.json，会用生效清单覆盖其中的关键字段，保证下载到的包信息完整一致。
 * @param bytes 原始压缩包字节。
 * @param manifest 生效清单。
 * @param cover 可选的封面补全（字节与 MIME）。
 * @returns 补全后的压缩包字节。
 */
export function supplementModZip(bytes: Uint8Array, manifest: GameModManifest, cover?: GameModCoverSupplement): Uint8Array {
    const entries = unzipSync(bytes)
    const hasPreview = !!findEntry(entries, "preview.png")

    // 始终写入一份一致的 mod.json（含名称/描述/分类/适用实体/前置依赖）
    entries["mod.json"] = strToU8(
        JSON.stringify(
            {
                name: manifest.name,
                description: manifest.description,
                category: manifest.category,
                entity: manifest.entity,
                requires: manifest.requires || [],
            },
            null,
            2
        )
    )

    // 缺失 preview.png 且提供了封面时补入
    if (!hasPreview && cover?.bytes?.length) {
        entries["preview.png"] = cover.bytes
    }

    return zipSync(entries, { level: 6 })
}
