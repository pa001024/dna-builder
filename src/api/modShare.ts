import { env } from "../env"

/**
 * 游戏补丁 MOD 分享的 REST 接口封装。
 * 上传/下载走 REST（需登录），查询/管理走 GraphQL（见 gen/api-queries、gen/api-mutations）。
 * 封面/预览图地址由服务端在返回结果中直接给出静态 OSS/CDN 直链（coverUrl / images），前端直接使用，不再经 API 转发。
 */

/**
 * @description 生成 MOD 下载地址（需登录后携带 token 访问）。
 * 服务端只做鉴权与计数，随后 302 到 OSS/CDN 直链；重定向跨域时会丢弃自定义 token 头，
 * 字节由客户端直连 CDN 拉取（fetch 默认自动跟随重定向）。
 * @param id MOD id。
 * @returns 下载 URL。
 */
export function modDownloadUrl(id: string) {
    return `${env.apiEndpoint}/api/mods/${id}/download`
}

/**
 * @description 生成指定版本的 MOD 下载地址（需登录后携带 token 访问）。
 * @param modId 发布 id。
 * @param versionId 版本 id。
 * @returns 下载 URL。
 */
export function modVersionDownloadUrl(modId: string, versionId: string) {
    return `${env.apiEndpoint}/api/mods/${modId}/versions/${versionId}/download`
}

/** MOD 压缩包下载进度。 */
export interface ModDownloadProgress {
    /** 已接收字节数。 */
    loaded: number
    /** 总字节数；远端未给出 Content-Length 且调用方未提供元数据时为 0（表示总量未知）。 */
    total: number
}

/** 流式下载选项。 */
export interface ModDownloadOptions {
    /** 发布元数据里的压缩包大小，作为 Content-Length 缺失时的进度基准。 */
    totalBytes?: number
    /** 进度回调，随每个数据块触发。 */
    onProgress?: (progress: ModDownloadProgress) => void
    /** 取消信号，用于中止请求（队列中取消任务时使用）。 */
    signal?: AbortSignal
}

/**
 * @description 流式下载压缩包并回调进度（需登录；服务端 302 到 OSS/CDN 直链，由 fetch 自动跟随）。
 * 跨域直链的 Content-Length 属 CORS 安全响应头，可直接读取；缺失时退化为调用方给出的元数据大小。
 * 环境不支持响应流（或直链返回不可读的不透明响应）时退化为一次性读取，此时只在结束时回调一次进度。
 * @param url 下载地址（服务端重定向接口）。
 * @param token 登录令牌。
 * @param options 进度与取消选项。
 * @returns 压缩包字节。
 */
async function streamModDownload(url: string, token: string, options: ModDownloadOptions = {}): Promise<ArrayBuffer> {
    const response = await fetch(url, {
        headers: { token },
        signal: options.signal,
    })
    if (!response.ok) {
        let message = "下载失败"
        try {
            const data = await response.json()
            message = data?.error || message
        } catch {}
        throw new Error(message)
    }

    // 直链的 Content-Length 优先（真实字节数），跨域未暴露时用发布元数据兜底
    const headerLength = Number(response.headers.get("content-length") || 0)
    const total = headerLength > 0 ? headerLength : options.totalBytes || 0

    const body = response.body
    if (!body) {
        const buffer = await response.arrayBuffer()
        options.onProgress?.({ loaded: buffer.byteLength, total: total || buffer.byteLength })
        return buffer
    }

    const reader = body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    options.onProgress?.({ loaded: 0, total })
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        chunks.push(value)
        loaded += value.byteLength
        options.onProgress?.({ loaded, total })
    }

    // 合并数据块，保持与一次性读取一致的 ArrayBuffer 返回值
    const merged = new Uint8Array(loaded)
    let offset = 0
    for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.byteLength
    }
    return merged.buffer
}

/** 上传 MOD 的载荷。 */
export interface ModUploadPayload {
    /** ZIP 压缩包，必填（内部需含 .pak 文件，mod.json / preview.png 可选）。 */
    file: File
    /** 可选的自定义封面图（与 coverImageIndex 二选一）。 */
    cover?: File | null
    /** 多张预览图（非封面）。 */
    images?: File[]
    /** 用第几张预览图作为封面（从 0 开始），未上传独立封面时生效。 */
    coverImageIndex?: number
    name?: string
    /** 描述，支持 markdown。 */
    description?: string
    /** 分类：char | weapon | other | standalone，缺省归入 standalone（独立）。 */
    category?: string
    /** 适用实体名称（角色名/武器名/自定义实体名），独立分类可为空。 */
    entity?: string
    /** 需要的前置 MOD 名称/ID 列表。 */
    requires?: string[]
    /** 来源链接（http/https），留空表示原创。 */
    source?: string
    /** 版本号/标签（如 1.0.0），缺省为 1.0.0。 */
    version?: string
    /** 版本更新说明（支持 markdown）。 */
    changelog?: string
}

/**
 * @description 上传并发布一个 MOD（multipart，需登录）。
 * @param payload 上传载荷。
 * @param token 登录令牌。
 * @returns 服务端返回的 JSON（success + mod 或 error）。
 */
export async function uploadGameMod(payload: ModUploadPayload, token: string) {
    const form = new FormData()
    form.append("file", payload.file)
    if (payload.cover) form.append("cover", payload.cover)
    for (const image of payload.images || []) {
        form.append("images", image)
    }
    if (payload.coverImageIndex !== undefined && payload.coverImageIndex >= 0) {
        form.append("coverImageIndex", String(payload.coverImageIndex))
    }
    if (payload.name) form.append("name", payload.name)
    if (payload.description) form.append("description", payload.description)
    if (payload.category) form.append("category", payload.category)
    if (payload.entity) form.append("entity", payload.entity)
    if (payload.requires?.length) form.append("requires", JSON.stringify(payload.requires))
    if (payload.source) form.append("source", payload.source)
    if (payload.version) form.append("version", payload.version)
    if (payload.changelog) form.append("changelog", payload.changelog)

    const response = await fetch(`${env.apiEndpoint}/api/mods`, {
        method: "POST",
        headers: { token },
        body: form,
    })
    return (await response.json()) as { success: boolean; mod?: any; error?: string }
}

/**
 * @description 为已存在的发布上传新版本（multipart，需登录，属主或管理员）。
 * @param modId 发布 id。
 * @param payload 新版本载荷。
 * @param token 登录令牌。
 * @returns 服务端返回的 JSON（success + version 或 error）。
 */
export async function uploadGameModVersion(modId: string, payload: { file: File; version?: string; changelog?: string }, token: string) {
    const form = new FormData()
    form.append("file", payload.file)
    if (payload.version) form.append("version", payload.version)
    if (payload.changelog) form.append("changelog", payload.changelog)

    const response = await fetch(`${env.apiEndpoint}/api/mods/${modId}/versions`, {
        method: "POST",
        headers: { token },
        body: form,
    })
    return (await response.json()) as { success: boolean; version?: any; error?: string }
}

/**
 * @description 下载 MOD 压缩包字节（需登录；服务端 302 到 OSS/CDN 直链，由 fetch 自动跟随）。
 * @param id MOD id。
 * @param token 登录令牌。
 * @param options 进度与取消选项。
 * @returns 压缩包字节。
 */
export async function downloadGameMod(id: string, token: string, options?: ModDownloadOptions) {
    return await streamModDownload(modDownloadUrl(id), token, options)
}

/**
 * @description 下载指定版本的 MOD 压缩包字节（需登录；服务端 302 到 OSS/CDN 直链，由 fetch 自动跟随）。
 * @param modId 发布 id。
 * @param versionId 版本 id。
 * @param token 登录令牌。
 * @param options 进度与取消选项。
 * @returns 压缩包字节。
 */
export async function downloadGameModVersion(modId: string, versionId: string, token: string, options?: ModDownloadOptions) {
    return await streamModDownload(modVersionDownloadUrl(modId, versionId), token, options)
}

/**
 * @description 判断错误是否为取消下载（AbortController 中止）导致。
 * @param error 捕获到的错误。
 * @returns 是否为取消。
 */
export function isDownloadAbortedError(error: unknown) {
    return error instanceof Error && (error.name === "AbortError" || error.message.includes("aborted"))
}
