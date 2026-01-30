import { fetch } from "bun"
import { Elysia, t } from "elysia"
import { uploadImage } from "./upload"

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

export const apiPlugin = () => {
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

    return app
}
