/**
 * 自定义字体的 OPFS 存储与 FontFace 注册工具。
 *
 * 用户上传的字体文件（ttf/otf/woff/woff2）以原始字节持久化在 OPFS 的
 * `fonts/` 目录中，避免 LocalStorage 容量限制；加载时通过 FontFace API
 * 注册到 document.fonts 供全局 CSS 使用。
 */

/** OPFS 中存放自定义字体的目录名 */
const FONT_DIR = "fonts"

/** 自定义字体元信息 */
export interface CustomFontMeta {
    /** OPFS 中的存储文件名（含扩展名），同时作为唯一标识 */
    fileName: string
    /** 展示名（去掉扩展名），同时用作 CSS font-family 名称 */
    displayName: string
}

/**
 * 判断当前环境是否支持 OPFS。
 * @returns 是否支持 OPFS
 */
function hasOpfs(): boolean {
    return typeof navigator !== "undefined" && Boolean(navigator.storage?.getDirectory)
}

/**
 * 获取 OPFS 根目录。
 * @returns 根目录句柄
 */
async function getRootDirectory(): Promise<FileSystemDirectoryHandle> {
    if (!navigator.storage?.getDirectory) {
        throw new Error("当前环境不支持 OPFS")
    }

    return navigator.storage.getDirectory()
}

/**
 * 获取自定义字体目录（不存在时自动创建）。
 * @returns 目录句柄
 */
async function getFontDirectory(): Promise<FileSystemDirectoryHandle> {
    const root = await getRootDirectory()
    return root.getDirectoryHandle(FONT_DIR, { create: true })
}

/**
 * 清理文件名中的路径非法字符（Windows/OPFS 通用）。
 * @param name 原始文件名
 * @returns 清理后的安全文件名
 */
function sanitizeFileName(name: string): string {
    const cleaned = name.replace(/[<>:"/\\|?*]/g, "_").trim()
    return cleaned || "custom-font"
}

/**
 * 由存储文件名构建字体元信息。
 * @param fileName 存储文件名（含扩展名）
 * @returns 字体元信息
 */
function toFontMeta(fileName: string): CustomFontMeta {
    return {
        fileName,
        displayName: fileName.replace(/\.[^.]+$/, ""),
    }
}

/**
 * 为 CSS font-family 引用添加引号（去除内部引号避免注入）。
 * @param name 字体名
 * @returns 带引号的字体族名
 */
export function cssQuoteFamily(name: string): string {
    return `"${name.trim().replaceAll('"', "")}"`
}

/**
 * 生成自定义字体的 CSS font-family 引用名（带引号）。
 * @param meta 字体元信息
 * @returns 带引号的字体族名
 */
export function customFontCssFamily(meta: Pick<CustomFontMeta, "displayName">): string {
    return cssQuoteFamily(meta.displayName)
}

/**
 * 枚举已上传的自定义字体。
 * @returns 字体元信息列表（按文件名排序）
 */
export async function listCustomFonts(): Promise<CustomFontMeta[]> {
    if (!hasOpfs()) {
        return []
    }

    try {
        const directory = await getFontDirectory()
        const names: string[] = []
        // @ts-expect-error TS lib 未收录异步迭代器，运行时可用
        for await (const [name, handle] of directory.entries()) {
            if (handle.kind === "file") {
                names.push(name)
            }
        }
        return names.sort((a, b) => a.localeCompare(b, "zh-CN")).map(toFontMeta)
    } catch (error) {
        console.warn("枚举自定义字体失败", error)
        return []
    }
}

/**
 * 将上传的字体文件写入 OPFS 并返回其元信息（同名文件会被覆盖）。
 * @param file 字体文件
 * @returns 字体元信息
 */
export async function saveCustomFont(file: File): Promise<CustomFontMeta> {
    const meta = toFontMeta(sanitizeFileName(file.name))
    const directory = await getFontDirectory()
    const handle = await directory.getFileHandle(meta.fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(file)
    await writable.close()
    return meta
}

/**
 * 从 OPFS 读取字体文件的原始字节。
 * @param fileName 存储文件名
 * @returns ArrayBuffer；不存在或读取失败时返回 null
 */
export async function readCustomFontData(fileName: string): Promise<ArrayBuffer | null> {
    if (!hasOpfs()) {
        return null
    }

    try {
        const directory = await getFontDirectory()
        const handle = await directory.getFileHandle(fileName, { create: false })
        const blob = await handle.getFile()
        return await blob.arrayBuffer()
    } catch (error) {
        console.warn("读取自定义字体失败", error)
        return null
    }
}

/**
 * 从 OPFS 删除字体文件并注销对应的 FontFace（文件不存在时静默忽略）。
 * @param fileName 存储文件名
 */
export async function removeCustomFont(fileName: string): Promise<void> {
    unregisterCustomFontFace(toFontMeta(fileName))
    if (!hasOpfs()) {
        return
    }

    try {
        const directory = await getFontDirectory()
        await directory.removeEntry(fileName)
    } catch {
        // 文件不存在等情况直接忽略
    }
}

/**
 * 读取字体数据并通过 FontFace API 注册到 document.fonts。
 * @param meta 字体元信息
 * @returns 是否注册成功
 */
export async function registerCustomFontFace(meta: CustomFontMeta): Promise<boolean> {
    if (typeof document === "undefined" || typeof FontFace === "undefined") {
        return false
    }

    try {
        const data = await readCustomFontData(meta.fileName)
        if (!data) {
            return false
        }
        const face = new FontFace(customFontCssFamily(meta), data)
        await face.load()
        document.fonts.add(face)
        return true
    } catch (error) {
        console.error("注册自定义字体失败", error)
        return false
    }
}

/**
 * 从 document.fonts 中移除指定自定义字体的 FontFace（存在时）。
 * @param meta 字体元信息
 */
export function unregisterCustomFontFace(meta: Pick<CustomFontMeta, "displayName">): void {
    if (typeof document === "undefined" || !document.fonts) {
        return
    }

    const family = customFontCssFamily(meta)
    for (const face of document.fonts) {
        if (face.family === family) {
            document.fonts.delete(face)
        }
    }
}
