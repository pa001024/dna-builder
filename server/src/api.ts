import { Elysia, t } from "elysia"
import { getPackageDiff, type PackageDiffConfig } from "./api/package-diff"
import { uploadImage } from "./upload"
import { getLatestInstallerUrl } from "./util/installer"
import { getCachedNameEffectStylesheet } from "./util/name-effect-style"

/**
 * 获取 MSI 下载 URL
 * 复用 installer 工具：从在线的 latest.json 获取最新版本，带 5 分钟缓存
 * @returns MSI 文件的下载地址（主端 CDN）
 */
function getMsiDownloadUrl() {
    return getLatestInstallerUrl()
}

/**
 * 根据差分结果构造 HTTP 响应。
 * 差分与完整包都优先 302 到对象存储/CDN，应用服务器不承担文件带宽。
 * @param result 差分查询结果。
 * @param set Elysia 响应设置对象。
 * @returns 完整包重定向、差分重定向或本地下发的补丁。
 */
function createPackageDiffResponse(
    result: Awaited<ReturnType<typeof getPackageDiff>>,
    set: { status?: number | string; headers: Record<string, string | number> }
) {
    // 目标包摘要来自缓存特征，未缓存时缺省——不为填充响应头去下载整包。
    if (result.targetSha256) {
        set.headers["X-Target-SHA256"] = result.targetSha256
    }
    set.headers["X-Target-Package"] = result.targetPackageName

    if (result.mode === "full") {
        set.status = 302
        set.headers.Location = result.targetUrl
        set.headers["X-Download-Mode"] = "full"
        return new Response(null, { status: 302 })
    }

    set.headers["X-Download-Mode"] = "patch"

    if (result.mode === "patch") {
        // 差分已镜像到对象存储：302 让客户端直连 CDN 拉补丁。
        set.status = 302
        set.headers.Location = result.patchUrl
        return new Response(null, { status: 302 })
    }

    // 尚未镜像到对象存储的差分：由应用服务器直接下发（体积不超过 2MB）。
    set.headers["Content-Type"] = "application/octet-stream"
    set.headers["Content-Disposition"] = `attachment; filename="${result.patchName}"`
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
     *
     * 前台只查缓存，不阻塞：差分已生成且已镜像到 OSS（`data-pack/diff/`）时 302 直连 CDN；
     * 尚未镜像的本地差分由应用服务器直接下发（≤2MB），镜像排入后台队列；
     * 从未生成过或差分无收益（>2MB 的 0 字节占位）时立刻 302 到官方完整包。
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
