import { env } from "../env"

/**
 * 游戏补丁 MOD 分享的 REST 接口封装。
 * 上传/下载走 REST（需登录），查询/管理走 GraphQL（见 gen/api-queries、gen/api-mutations）。
 * 封面/预览图地址由服务端在返回结果中直接给出静态 OSS/CDN 直链（coverUrl / images），前端直接使用，不再经 API 转发。
 */

/**
 * @description 生成 MOD 下载地址（需登录后携带 token 访问）。
 * @param id MOD id。
 * @returns 下载 URL。
 */
export function modDownloadUrl(id: string) {
    return `${env.apiEndpoint}/api/mods/${id}/download`
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
 * @description 下载 MOD 压缩包字节（需登录）。
 * @param id MOD id。
 * @param token 登录令牌。
 * @returns 压缩包字节。
 */
export async function downloadGameMod(id: string, token: string) {
    const response = await fetch(modDownloadUrl(id), {
        headers: { token },
    })
    if (!response.ok) {
        let message = "下载失败"
        try {
            const data = await response.json()
            message = data?.error || message
        } catch {}
        throw new Error(message)
    }
    return await response.arrayBuffer()
}

/**
 * @description 下载指定版本的 MOD 压缩包字节（需登录）。
 * @param modId 发布 id。
 * @param versionId 版本 id。
 * @param token 登录令牌。
 * @returns 压缩包字节。
 */
export async function downloadGameModVersion(modId: string, versionId: string, token: string) {
    const response = await fetch(`${env.apiEndpoint}/api/mods/${modId}/versions/${versionId}/download`, {
        headers: { token },
    })
    if (!response.ok) {
        let message = "下载失败"
        try {
            const data = await response.json()
            message = data?.error || message
        } catch {}
        throw new Error(message)
    }
    return await response.arrayBuffer()
}
