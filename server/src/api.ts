import { fetch } from "bun"
import { Elysia, t } from "elysia"
import { getPackageDiff, type PackageDiffConfig } from "./api/package-diff"
import { uploadImage } from "./upload"
import { getCachedNameEffectStylesheet } from "./util/name-effect-style"

/**
 * 缓存的最新版本信息
 */
type CachedVersion = {
    url: string
    expireTime: number
}

let cachedVersion: CachedVersion | null = null

/**
 * 获取 MSI 下载 URL
 * 从在线的 latest.json 获取最新版本，带 5 分钟缓存
 * @returns MSI 文件的 OSS 下载地址
 */
async function getMsiDownloadUrl(): Promise<string | null> {
    const OSS_CONFIG = {
        region: process.env.OSS_REGION || process.env.OSS_ENDPOINT?.replace(".aliyuncs.com", "") || "oss-cn-hongkong",
        endpoint: process.env.OSS_ENDPOINT || "",
        bucket: process.env.OSS_BUCKET || "",
        cdn: process.env.CDN_URL || "",
    }

    if (!OSS_CONFIG.endpoint || !OSS_CONFIG.bucket) {
        return null
    }

    // 检查缓存（5 分钟有效期）
    const CACHE_DURATION = 5 * 60 * 1000 // 5 分钟
    if (cachedVersion && Date.now() < cachedVersion.expireTime) {
        return cachedVersion.url
    }

    try {
        // 从在线的 latest.json 获取最新版本信息
        const latestJsonUrl = `${OSS_CONFIG.cdn || `https://${OSS_CONFIG.bucket}.${OSS_CONFIG.endpoint}`}/latest.json`
        const response = await fetch(latestJsonUrl)

        if (!response.ok) {
            console.error("获取 latest.json 失败:", response.status)
            return null
        }

        const latestData = await response.json()

        // 从 platforms 获取 MSI 下载地址
        const downloadUrl = latestData.platforms?.["windows-x86_64-msi"]?.url || latestData.platforms?.["windows-x86_64"]?.url

        if (!downloadUrl) {
            console.error("latest.json 中未找到下载地址")
            return null
        }

        // 更新缓存
        cachedVersion = {
            url: downloadUrl,
            expireTime: Date.now() + CACHE_DURATION,
        }

        return downloadUrl
    } catch (error) {
        console.error("获取最新版本信息失败:", error)
        // 如果有缓存但过期了，仍然返回缓存的地址
        if (cachedVersion) {
            console.log("使用过期的缓存 URL")
            return cachedVersion.url
        }
        return null
    }
}

/**
 * 根据差分结果构造 HTTP 响应。
 * @param result 差分查询结果。
 * @param set Elysia 响应设置对象。
 * @returns 补丁文件或完整包重定向。
 */
function createPackageDiffResponse(
    result: Awaited<ReturnType<typeof getPackageDiff>>,
    set: { status?: number | string; headers: Record<string, string | number> }
) {
    if (result.mode === "full") {
        set.status = 302
        set.headers.Location = result.targetUrl
        set.headers["X-Download-Mode"] = "full"
        set.headers["X-Target-Package"] = result.targetPackageName
        set.headers["X-Target-SHA256"] = result.targetSha256
        return new Response(null, { status: 302 })
    }

    set.headers["Content-Type"] = "application/octet-stream"
    set.headers["Content-Disposition"] = `attachment; filename="${result.patchName}"`
    set.headers["X-Download-Mode"] = "patch"
    set.headers["X-Target-Package"] = result.targetPackageName
    set.headers["X-Target-SHA256"] = result.targetSha256
    return Bun.file(result.patchFile)
}

export const apiPlugin = (packageDiffConfig: PackageDiffConfig = {}) => {
    const app = new Elysia({
        prefix: "/api",
    })
    app.post(
        "/upload/image",
        async ({ body: { file } }) => {
            try {
                if (!file) {
                    return {
                        success: false,
                        error: "文件不能为空",
                    }
                }

                const url = await uploadImage(file)
                return {
                    success: true,
                    url,
                }
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : "上传失败",
                }
            }
        },
        {
            body: t.Object({
                file: t.File(),
            }),
        }
    )

    /**
     * 下载 MSI 安装包
     * 302 重定向到 OSS 下载地址
     */
    app.get("/download", async ({ set }) => {
        const downloadUrl = await getMsiDownloadUrl()

        if (!downloadUrl) {
            set.status = 500
            return {
                success: false,
                error: "下载地址配置错误",
            }
        }

        set.status = 302
        set.headers.Location = downloadUrl
        return new Response(null, { status: 302, headers: { Location: downloadUrl } })
    })

    /**
     * 下载客户端旧官方数据包到指定新官方数据包的 HDiffPatch 差分。
     * 差分大于 2 MB 时重定向到官方完整包，避免无收益的客户端补丁。
     */
    app.post(
        "/download/diff",
        async ({ body, set }) => {
            try {
                const result = await getPackageDiff(body.old, body.new, packageDiffConfig)
                return createPackageDiffResponse(result, set)
            } catch (error) {
                set.status = 400
                return { success: false, error: error instanceof Error ? error.message : "生成差分失败" }
            }
        },
        {
            body: t.Object({
                old: t.String(),
                new: t.String(),
            }),
        }
    )

    /**
     * 聊天名字特效样式表
     * 由服务端按当前名字特效资产动态拼接，并带 ETag 与短时缓存。
     */
    app.get("/chat/name-effects.css", async ({ request, set }) => {
        const stylesheet = await getCachedNameEffectStylesheet()
        const ifNoneMatch = request.headers.get("if-none-match")

        set.headers["Content-Type"] = "text/css; charset=utf-8"
        set.headers["Cache-Control"] = "public, max-age=300"
        set.headers.ETag = stylesheet.etag

        if (ifNoneMatch === stylesheet.etag) {
            set.status = 304
            return new Response(null, { status: 304 })
        }

        return stylesheet.css
    })

    return app
}
