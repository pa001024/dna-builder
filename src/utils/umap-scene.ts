/**
 * UMap 单文件场景的 mesh 清单项。
 */
export interface SceneMeshManifest {
    id: string
    asset: string
}

/**
 * UMap 单文件场景的实例清单项。
 */
export interface SceneInstanceManifest {
    meshId: string
    p: [number, number, number]
    s: [number, number, number]
    r?: [number, number, number]
    q?: [number, number, number, number]
}

/**
 * UMap 单文件场景的最小 manifest。
 */
export interface SceneManifest {
    regionId: number
    regionName: string
    meshes: SceneMeshManifest[]
    instances: SceneInstanceManifest[]
}

/**
 * 单文件包内部文件索引。
 */
export interface SceneBundleFileEntry {
    path: string
    offset: number
    size: number
}

/**
 * 单文件包解出的索引与二进制视图。
 */
export interface SceneBundleData {
    bytes: Uint8Array
    files: Map<string, SceneBundleFileEntry>
}

/**
 * 解析 `scene.umapscene` 单文件包，并返回最小 manifest 与按需读取索引。
 */
export async function parseSceneBundleFile(file: File) {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const magic = new TextDecoder().decode(bytes.slice(0, 8))
    if (magic !== "UMAPBND1") {
        throw new Error("文件不是有效的 scene.umapscene")
    }

    const headerLength = new DataView(buffer, 8, 4).getUint32(0, true)
    const headerBytes = bytes.slice(12, 12 + headerLength)
    const header = JSON.parse(new TextDecoder().decode(headerBytes)) as {
        manifest: SceneManifest
        files: Array<SceneBundleFileEntry>
    }

    const payloadStart = 12 + headerLength
    const payloadBytes = bytes.subarray(payloadStart)
    const nextFiles = new Map<string, SceneBundleFileEntry>()

    for (const entry of header.files) {
        nextFiles.set(entry.path, entry)
        nextFiles.set(entry.path.replace(/^web\//, ""), entry)
    }

    return {
        nextManifest: header.manifest,
        nextBundleData: {
            bytes: payloadBytes,
            files: nextFiles,
        } satisfies SceneBundleData,
    }
}

/**
 * 根据包内文件扩展名推断 Blob MIME，确保 glTF 外部资源能被浏览器正确识别。
 */
export function inferBundleFileMimeType(path: string) {
    const normalizedPath = path.toLowerCase()
    if (normalizedPath.endsWith(".gltf")) return "model/gltf+json"
    if (normalizedPath.endsWith(".glb")) return "model/gltf-binary"
    if (normalizedPath.endsWith(".bin")) return "application/octet-stream"
    if (normalizedPath.endsWith(".webp")) return "image/webp"
    if (normalizedPath.endsWith(".png")) return "image/png"
    if (normalizedPath.endsWith(".jpg") || normalizedPath.endsWith(".jpeg")) return "image/jpeg"
    return "application/octet-stream"
}

/**
 * 计算包内 POSIX 路径的目录名。
 */
export function dirnamePosix(path: string) {
    const normalizedPath = path.replace(/\\/g, "/")
    const lastSlashIndex = normalizedPath.lastIndexOf("/")
    if (lastSlashIndex === -1) return ""
    return normalizedPath.slice(0, lastSlashIndex)
}

/**
 * 归一化包内相对资源路径，处理 `.` 与 `..` 片段。
 */
export function normalizeBundleResourcePath(baseDirectory: string, relativePath: string) {
    const segments = `${baseDirectory}/${relativePath}`.split("/")
    return normalizeBundleSegments(segments)
}

/**
 * 归一化包内绝对资源路径，处理 `web/.../../...` 片段。
 */
export function normalizeBundleAbsolutePath(path: string) {
    return normalizeBundleSegments(path.split("/"))
}

/**
 * 归一化包内路径片段，处理 `.` 与 `..`。
 */
export function normalizeBundleSegments(segments: string[]) {
    const normalizedSegments: string[] = []

    for (const segment of segments) {
        if (!segment || segment === ".") continue
        if (segment === "..") {
            normalizedSegments.pop()
            continue
        }
        normalizedSegments.push(segment)
    }

    return normalizedSegments.join("/")
}

/**
 * 从单文件包按需切片并创建 object URL，避免首屏一次性展开所有资源。
 */
export function resolveBundleFileUrl(bundleData: SceneBundleData | null, cache: Map<string, string>, path: string) {
    const normalizedPath = path.replace(/\\/g, "/")
    const cachedUrl = cache.get(normalizedPath)
    if (cachedUrl) return cachedUrl
    if (!bundleData) return ""

    const entry = bundleData.files.get(normalizedPath)
    if (!entry) return ""

    const fileBytes = bundleData.bytes.subarray(entry.offset, entry.offset + entry.size)
    const objectUrl = URL.createObjectURL(
        new Blob([fileBytes as unknown as ArrayBufferView<ArrayBuffer>], { type: inferBundleFileMimeType(entry.path) })
    )
    cache.set(normalizedPath, objectUrl)
    return objectUrl
}

/**
 * 将 glTF 内的相对资源路径映射到单文件包中的 object URL。
 */
export function resolveSceneResourceUrl(
    bundleData: SceneBundleData | null,
    cache: Map<string, string>,
    assetPath: string,
    requestedUrl: string
) {
    if (requestedUrl.startsWith("blob:") || requestedUrl.startsWith("data:")) {
        return requestedUrl
    }

    if (requestedUrl.startsWith("http:") || requestedUrl.startsWith("https:")) {
        return requestedUrl
    }

    const resolvedPath = requestedUrl.startsWith("web/")
        ? normalizeBundleAbsolutePath(requestedUrl)
        : normalizeBundleResourcePath(dirnamePosix(assetPath), requestedUrl)
    return resolveBundleFileUrl(bundleData, cache, resolvedPath) || requestedUrl
}
