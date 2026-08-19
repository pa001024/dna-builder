import { and, desc, eq, sql } from "drizzle-orm"
import { Elysia, t } from "elysia"
import jwt from "jsonwebtoken"
import { nanoid } from "nanoid"
import { machineIdSync } from "node-machine-id"
import { db, schema } from "../db"
import type { JWTUser } from "../db/yoga"
import { sendModUploadNotification } from "../util/email"
import { deleteModFiles, getModFileUrl, isSafeModKey, readModZip, uploadModFile } from "../util/mod-storage"
import {
    coverExtFromMime,
    type GameModManifest,
    inspectModZip,
    isGameModCategory,
    resolveModManifest,
    supplementModZip,
    validateModZip,
} from "../util/mod-zip"

/** MOD 压缩包大小上限（1GB）。 */
export const MAX_MOD_FILE_SIZE = 1024 * 1024 * 1024

/** 预览图（非封面）数量上限。 */
export const MAX_MOD_IMAGES = 9

/** 与 GraphQL 层一致的 JWT 密钥（机器指纹）。 */
const MOD_JWT_SECRET = machineIdSync()

/**
 * @description 校验请求头中的登录令牌。
 * @param token 请求头 token 字段。
 * @returns 解析出的用户信息，未登录或令牌无效时返回 null。
 */
export function verifyModToken(token: string | undefined | null): JWTUser | null {
    if (!token) return null
    try {
        return jwt.verify(token, MOD_JWT_SECRET) as JWTUser
    } catch {
        return null
    }
}

/**
 * @description 将数据库行转换为对外返回的 MOD 结构（封面/预览图地址为静态 OSS/CDN 直链，前端直接使用，不再经 API 转发）。
 * 文件名/大小等文件属性来自最新版本。
 * @param row 数据库查询行。
 * @param versions 该 MOD 的版本列表（建议按创建时间倒序，首个视为最新版）。
 * @returns 对外 MOD 结构。
 */
function toGameModRow(row: typeof schema.gameMods.$inferSelect, versions: (typeof schema.gameModVersions.$inferSelect)[] = []) {
    const imageKeys = Array.isArray(row.images) ? row.images : []
    const latest = versions[0] || null
    return {
        ...row,
        requires: row.requires || [],
        /** 封面静态直链（OSS/CDN），未设置封面时为 null。 */
        coverUrl: row.coverKey ? getModFileUrl(row.coverKey) : null,
        /** 预览图（非封面）静态直链列表（OSS/CDN）。 */
        images: imageKeys.map(key => getModFileUrl(key)),
        status: row.status || "pending",
        views: row.views ?? 0,
        downloads: row.downloads ?? 0,
        likes: row.likes ?? 0,
        isActive: row.isActive ?? true,
        isRecommended: row.isRecommended ?? false,
        isPinned: row.isPinned ?? false,
        createdAt: row.createdAt ?? 0,
        updateAt: row.updateAt ?? 0,
        /** 文件属性由最新版本提供（兼容旧字段）。 */
        fileName: latest?.fileName || "",
        fileSize: latest?.fileSize ?? 0,
        latestVersion: latest ? toGameModVersionRow(latest) : null,
        versions,
    }
}

/**
 * @description 将版本行转换为对外结构。
 * @param row 版本数据库行。
 * @returns 对外版本结构。
 */
function toGameModVersionRow(row: typeof schema.gameModVersions.$inferSelect) {
    return {
        ...row,
        downloads: row.downloads ?? 0,
        createdAt: row.createdAt ?? 0,
    }
}

/** 判断是否为可接受的图片文件。 */
function isImageFile(file: unknown): file is File {
    return !!file && file instanceof File && file.size > 0
}

/**
 * @description 规范化来源字段：留空表示原创，否则保留用户输入的任意文本（渲染时由前端将其中链接转为 a 标签）。
 * @param source 来源内容。
 * @returns 规范化后的文本，空值归一为 null。
 */
function normalizeSource(source: string | undefined): string | null {
    const trimmed = (source || "").trim()
    return trimmed || null
}

/** MOD 上传请求的字段定义（新建发布 + 首个版本）。 */
const uploadBodySchema = t.Object({
    file: t.File(),
    cover: t.Optional(t.File()),
    /** 多张预览图（非封面），最多 MAX_MOD_IMAGES 张。 */
    images: t.Optional(t.Files()),
    /** 用第几张预览图作为封面（字符串数字），未上传独立封面时生效。 */
    coverImageIndex: t.Optional(t.String()),
    name: t.Optional(t.String()),
    description: t.Optional(t.String()),
    category: t.Optional(t.String()),
    entity: t.Optional(t.String()),
    /** 前置 MOD 列表，JSON 数组字符串。 */
    requires: t.Optional(t.String()),
    /** 来源链接（http/https），留空表示原创。 */
    source: t.Optional(t.String()),
    /** 版本号/标签（如 1.0.0），缺省为 1.0.0。 */
    version: t.Optional(t.String()),
    /** 版本更新说明（支持 markdown）。 */
    changelog: t.Optional(t.String()),
})

/** 新版本上传请求的字段定义。 */
const versionBodySchema = t.Object({
    file: t.File(),
    /** 版本号/标签（如 1.1.0），缺省为 1.0.0。 */
    version: t.Optional(t.String()),
    /** 版本更新说明（支持 markdown）。 */
    changelog: t.Optional(t.String()),
})

/**
 * @description 校验 zip 文件并返回字节（含格式校验与大小限制）。
 * @param file 上传的 zip 文件。
 * @returns 校验结果：成功时携带 zip 字节，失败时携带错误信息。
 */
async function readValidatedZip(file: File): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
    if (!file || !(file instanceof File)) {
        return { ok: false, error: "缺少 MOD 压缩包" }
    }
    if (file.size <= 0) {
        return { ok: false, error: "MOD 压缩包不能为空" }
    }
    if (file.size > MAX_MOD_FILE_SIZE) {
        return { ok: false, error: "MOD 压缩包超过大小上限（1GB）" }
    }
    if (!/\.zip$/i.test(file.name)) {
        return { ok: false, error: "只支持 ZIP 格式的 MOD 压缩包" }
    }
    try {
        const zipBytes = new Uint8Array(await file.arrayBuffer())
        const zipError = validateModZip(zipBytes)
        if (zipError) {
            return { ok: false, error: zipError }
        }
        return { ok: true, bytes: zipBytes }
    } catch (error) {
        console.error("MOD 压缩包解析失败:", error)
        return { ok: false, error: "不是有效的 ZIP 压缩包" }
    }
}

/**
 * @description 校验用户是否有权操作指定 MOD（属主或管理员）。
 * @param row MOD 行。
 * @param user 当前用户。
 * @returns 是否有权。
 */
function canManageMod(row: typeof schema.gameMods.$inferSelect, user: JWTUser): boolean {
    return row.userId === user.id || (Array.isArray(user.roles) && user.roles.includes("admin"))
}

/**
 * @description 从 OSS 读取指定版本的压缩包字节并递增下载计数（版本与发布各 +1）。
 * @param versionId 版本 id。
 * @returns 版本行 + 字节；不存在时返回 null。
 */
async function loadVersionFile(versionId: string) {
    const version = await db.query.gameModVersions.findFirst({
        where: (table, { eq }) => eq(table.id, versionId),
    })
    if (!version || !isSafeModKey(version.fileKey)) return null
    let bytes: Uint8Array | null
    try {
        bytes = await readModZip(version.fileKey)
    } catch (error) {
        console.error("从 OSS 读取 MOD 失败:", error)
        return null
    }
    if (!bytes) return null

    await db
        .update(schema.gameModVersions)
        .set({ downloads: sql`${schema.gameModVersions.downloads} + 1` })
        .where(eq(schema.gameModVersions.id, version.id))
    await db
        .update(schema.gameMods)
        .set({ downloads: sql`${schema.gameMods.downloads} + 1` })
        .where(eq(schema.gameMods.id, version.modId))
    return { version, bytes }
}

/**
 * @description 游戏补丁 MOD 分享的 REST 插件：上传发布/多版本上传、下载（需登录）、封面展示。
 * 同一发布（game_mods）可挂多个版本（game_mod_versions），文件一律存 OSS 且以内容哈希命名。
 * @returns Elysia 插件实例。
 */
export function modApiPlugin() {
    const app = new Elysia({ prefix: "/api/mods" })

    /**
     * 上传发布 MOD（创建发布 + 首个版本）。
     * 表单：file（zip 包，必填）、cover（可选封面图）、images（多张预览图）、name/description/category/entity/requires/version/changelog（可选）。
     * 服务端会解析 zip 内的 mod.json 与 preview.png；缺失时自动补全。
     */
    app.post(
        "/",
        async ({ body, headers, set }) => {
            const user = verifyModToken(headers.token)
            if (!user) {
                set.status = 401
                return { success: false, error: "需要登录" }
            }

            const { file, cover } = body
            const zipCheck = await readValidatedZip(file)
            if (!zipCheck.ok) {
                set.status = 400
                return { success: false, error: zipCheck.error }
            }
            const zipBytes = zipCheck.bytes

            // 解析前置 MOD 列表（JSON 数组字符串）
            let requires: string[] = []
            if (body.requires) {
                try {
                    const parsed = JSON.parse(body.requires)
                    if (Array.isArray(parsed)) requires = parsed.filter((item: unknown): item is string => typeof item === "string")
                } catch {
                    set.status = 400
                    return { success: false, error: "前置 MOD 列表格式不合法（需为 JSON 数组字符串）" }
                }
            }

            // 解析压缩包并合并出最终生效的清单
            const inspection = inspectModZip(zipBytes)
            const manifest = resolveModManifest(
                {
                    name: body.name,
                    description: body.description,
                    category: body.category,
                    entity: body.entity,
                    requires,
                },
                inspection.manifest,
                file.name
            )

            // 分类为 char/weapon/other 时必须指定适用实体；未指定分类或实体时归入 standalone（独立）
            if (manifest.category !== "standalone" && !manifest.entity) {
                set.status = 400
                return { success: false, error: "该分类的 MOD 必须指定适用的角色/武器/实体名称" }
            }
            if (!isGameModCategory(manifest.category)) {
                set.status = 400
                return { success: false, error: "MOD 分类不合法" }
            }

            // 校验预览图数量上限
            const uploadImages = Array.isArray(body.images) ? body.images.filter(isImageFile) : []
            if (uploadImages.length > MAX_MOD_IMAGES) {
                set.status = 400
                return { success: false, error: `预览图数量不能超过 ${MAX_MOD_IMAGES} 张` }
            }

            // 来源：留空为原创，非空为任意文本（前端渲染时将其中链接转为 a 标签）
            const source = normalizeSource(body.source)

            // 补全压缩包（写入 mod.json；preview.png 仅在确实缺少封面时补入）
            const coverIndex = body.coverImageIndex ? parseInt(body.coverImageIndex, 10) : -1
            const hasUserCover = isImageFile(cover)
            const hasSelectedPreview = Number.isInteger(coverIndex) && coverIndex >= 0 && coverIndex < uploadImages.length
            const finalZip = supplementModZip(
                zipBytes,
                manifest,
                !hasUserCover && !hasSelectedPreview && inspection.previewBytes
                    ? { bytes: inspection.previewBytes, mime: "image/png" }
                    : undefined
            )

            // 上传到 OSS（文件名使用内容 SHA-256 哈希，同内容自动去重）
            const id = nanoid()
            const versionId = nanoid()
            let fileKey: string
            try {
                fileKey = await uploadModFile(finalZip, "zip")
            } catch (error) {
                console.error("MOD 压缩包上传 OSS 失败:", error)
                set.status = 500
                return { success: false, error: "MOD 压缩包上传失败" }
            }

            // 预览图上传（非封面）
            const imageKeys: string[] = []
            try {
                for (const image of uploadImages) {
                    const ext = coverExtFromMime(image.type || "image/png")
                    imageKeys.push(await uploadModFile(new Uint8Array(await image.arrayBuffer()), ext))
                }
            } catch (error) {
                console.error("预览图上传 OSS 失败:", error)
                await deleteModFiles(fileKey, null, imageKeys)
                set.status = 500
                return { success: false, error: "预览图上传失败" }
            }

            // 封面：独立上传的封面 > 指定的预览图 > 包内 preview.png
            let coverBytes: Uint8Array | null = inspection.previewBytes
            let coverMime = "image/png"
            if (hasUserCover && cover) {
                coverBytes = new Uint8Array(await cover.arrayBuffer())
                coverMime = cover.type || "image/png"
            } else if (hasSelectedPreview && uploadImages[coverIndex]) {
                coverBytes = new Uint8Array(await uploadImages[coverIndex].arrayBuffer())
                coverMime = uploadImages[coverIndex].type || "image/png"
            }

            let coverKey: string | null = null
            try {
                if (coverBytes?.length) {
                    const ext = coverExtFromMime(coverMime)
                    coverKey = await uploadModFile(coverBytes, ext)
                }
            } catch (error) {
                console.error("封面上传 OSS 失败:", error)
                await deleteModFiles(fileKey, null, imageKeys)
                set.status = 500
                return { success: false, error: "封面上传失败" }
            }

            // 入库：发布 + 首个版本（新发布一律进入待审核状态）
            try {
                const [row] = await db
                    .insert(schema.gameMods)
                    .values({
                        id,
                        name: manifest.name || "未命名 MOD",
                        description: manifest.description || null,
                        category: manifest.category || "standalone",
                        entity: manifest.entity || "",
                        coverKey,
                        images: imageKeys.length ? imageKeys : null,
                        modJson: JSON.stringify(manifest),
                        requires: manifest.requires || [],
                        source,
                        userId: user.id,
                        status: "pending",
                    })
                    .returning()
                if (!row) {
                    await deleteModFiles(fileKey, coverKey, imageKeys)
                    set.status = 500
                    return { success: false, error: "发布失败" }
                }

                const [versionRow] = await db
                    .insert(schema.gameModVersions)
                    .values({
                        id: versionId,
                        modId: id,
                        version: body.version?.trim() || "1.0.0",
                        changelog: body.changelog?.trim() || null,
                        fileName: file.name,
                        fileKey,
                        fileSize: finalZip.length,
                    })
                    .returning()
                if (!versionRow) {
                    await deleteModFiles(fileKey, coverKey, imageKeys)
                    await db.delete(schema.gameMods).where(eq(schema.gameMods.id, id))
                    set.status = 500
                    return { success: false, error: "发布失败" }
                }

                // 邮件通知管理员审核（异步执行，失败不影响上传结果）
                const uploader =
                    (
                        await db.query.users.findFirst({
                            where: (table, { eq }) => eq(table.id, user.id),
                            columns: { name: true },
                        })
                    )?.name || "未知用户"
                void sendModUploadNotification({
                    name: row.name,
                    category: row.category,
                    entity: row.entity || undefined,
                    uploader,
                    description: row.description || undefined,
                    fileSize: versionRow.fileSize,
                })

                return { success: true, mod: toGameModRow(row, [versionRow]) }
            } catch (error) {
                console.error("MOD 入库失败:", error)
                await deleteModFiles(fileKey, coverKey, imageKeys)
                set.status = 500
                return { success: false, error: "发布失败" }
            }
        },
        { body: uploadBodySchema }
    )

    /**
     * 为已存在的发布上传新版本（属主或管理员）。
     * 版本包会复用发布的 mod.json 元数据补全后上传 OSS，入库为新的版本记录。
     */
    app.post(
        "/:id/versions",
        async ({ params, body, headers, set }) => {
            const user = verifyModToken(headers.token)
            if (!user) {
                set.status = 401
                return { success: false, error: "需要登录" }
            }

            const row = await db.query.gameMods.findFirst({
                where: (table, { eq }) => eq(table.id, params.id),
            })
            if (!row) {
                set.status = 404
                return { success: false, error: "MOD 不存在" }
            }
            if (!canManageMod(row, user)) {
                set.status = 403
                return { success: false, error: "无权为此 MOD 上传版本" }
            }

            const zipCheck = await readValidatedZip(body.file)
            if (!zipCheck.ok) {
                set.status = 400
                return { success: false, error: zipCheck.error }
            }
            const zipBytes = zipCheck.bytes

            // 复用发布时保存的 mod.json 清单补全版本包
            let manifest: GameModManifest = {}
            try {
                manifest = row.modJson ? JSON.parse(row.modJson) : {}
            } catch {
                manifest = {}
            }
            const finalZip = supplementModZip(zipBytes, manifest)

            let fileKey: string
            try {
                fileKey = await uploadModFile(finalZip, "zip")
            } catch (error) {
                console.error("新版本上传 OSS 失败:", error)
                set.status = 500
                return { success: false, error: "新版本上传失败" }
            }

            try {
                const [versionRow] = await db
                    .insert(schema.gameModVersions)
                    .values({
                        id: nanoid(),
                        modId: row.id,
                        version: body.version?.trim() || "1.0.0",
                        changelog: body.changelog?.trim() || null,
                        fileName: body.file.name,
                        fileKey,
                        fileSize: finalZip.length,
                    })
                    .returning()
                if (!versionRow) {
                    await deleteModFiles(fileKey, null)
                    set.status = 500
                    return { success: false, error: "新版本入库失败" }
                }
                await db.update(schema.gameMods).set({ updateAt: schema.now() }).where(eq(schema.gameMods.id, row.id))
                return { success: true, version: toGameModVersionRow(versionRow) }
            } catch (error) {
                console.error("新版本入库失败:", error)
                await deleteModFiles(fileKey, null)
                set.status = 500
                return { success: false, error: "新版本入库失败" }
            }
        },
        { body: versionBodySchema }
    )

    /**
     * 下载 MOD 最新版本（需登录，且仅限已审核通过或本人/管理员的 MOD）。版本与发布下载次数均 +1。
     */
    app.get("/:id/download", async ({ params, headers, set }) => {
        const user = verifyModToken(headers.token)
        if (!user) {
            set.status = 401
            return { success: false, error: "需要登录" }
        }

        const row = await db.query.gameMods.findFirst({
            where: (table, { eq }) => eq(table.id, params.id),
        })
        if (!row) {
            set.status = 404
            return { success: false, error: "MOD 不存在" }
        }
        if (!canManageMod(row, user) && row.status !== "approved") {
            set.status = 403
            return { success: false, error: "MOD 尚未通过审核" }
        }

        const latest = await db.query.gameModVersions.findFirst({
            where: (table, { eq }) => eq(table.modId, params.id),
            orderBy: [desc(schema.gameModVersions.createdAt), desc(schema.gameModVersions.id)],
        })
        if (!latest) {
            set.status = 404
            return { success: false, error: "MOD 暂无可用版本" }
        }
        const loaded = await loadVersionFile(latest.id)
        if (!loaded) {
            set.status = 404
            return { success: false, error: "MOD 文件不存在" }
        }

        set.headers["Content-Type"] = "application/zip"
        set.headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(loaded.version.fileName)}"`
        return new Response(loaded.bytes as any, { status: 200 })
    })

    /**
     * 下载指定版本的 MOD 压缩包（需登录，且仅限已审核通过或本人/管理员的 MOD）。版本与发布下载次数均 +1。
     */
    app.get("/:id/versions/:versionId/download", async ({ params, headers, set }) => {
        const user = verifyModToken(headers.token)
        if (!user) {
            set.status = 401
            return { success: false, error: "需要登录" }
        }

        const row = await db.query.gameMods.findFirst({
            where: (table, { eq }) => eq(table.id, params.id),
        })
        if (!row) {
            set.status = 404
            return { success: false, error: "MOD 不存在" }
        }
        if (!canManageMod(row, user) && row.status !== "approved") {
            set.status = 403
            return { success: false, error: "MOD 尚未通过审核" }
        }

        const version = await db.query.gameModVersions.findFirst({
            where: (table, { eq }) => and(eq(table.id, params.versionId), eq(table.modId, params.id)),
        })
        if (!version) {
            set.status = 404
            return { success: false, error: "版本不存在" }
        }
        const loaded = await loadVersionFile(version.id)
        if (!loaded) {
            set.status = 404
            return { success: false, error: "MOD 文件不存在" }
        }

        set.headers["Content-Type"] = "application/zip"
        set.headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(loaded.version.fileName)}"`
        return new Response(loaded.bytes as any, { status: 200 })
    })

    /**
     * 展示 MOD 封面（公开访问，无需登录，302 重定向到 OSS/CDN 直链）。
     */
    app.get("/:id/cover", async ({ params, set }) => {
        const row = await db.query.gameMods.findFirst({
            where: (table, { eq }) => eq(table.id, params.id),
        })
        if (!row?.coverKey || !isSafeModKey(row.coverKey)) {
            set.status = 404
            return { success: false, error: "封面不存在" }
        }
        set.status = 302
        set.headers.Location = getModFileUrl(row.coverKey)
        set.headers["Cache-Control"] = "public, max-age=86400"
        return new Response(null, { status: 302 })
    })

    /**
     * 展示 MOD 预览图（非封面，公开访问，无需登录，302 重定向到 OSS/CDN 直链）。
     */
    app.get("/:id/images/:index", async ({ params, set }) => {
        const row = await db.query.gameMods.findFirst({
            where: (table, { eq }) => eq(table.id, params.id),
        })
        const index = parseInt(params.index, 10)
        const imageKeys = Array.isArray(row?.images) ? row.images : []
        const key = Number.isInteger(index) ? imageKeys[index] : undefined
        if (!row || !key || !isSafeModKey(key)) {
            set.status = 404
            return { success: false, error: "预览图不存在" }
        }
        set.status = 302
        set.headers.Location = getModFileUrl(key)
        set.headers["Cache-Control"] = "public, max-age=86400"
        return new Response(null, { status: 302 })
    })

    return app
}

export type { GameModManifest }
