// 更新委托信息工具
// 作为客户端，通过 GraphQL API 更新委托数据到远端服务器

import "dotenv/config"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fetch } from "bun"
import { Cron } from "croner"
import type { DNAActivity, DNACommentListResponse, DNARoleEntity } from "dna-api"
import { and, desc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { WebSocket } from "ws"
import { charMap, petMap, weaponMap } from "../../src/data"
import { getDNAAPI } from "./api/dna"

// 环境变量配置
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8887"
const API_TOKEN = process.env.API_TOKEN
const DEV_CODE = process.env.DEV_CODE
const USER_TOKEN = process.env.USER_TOKEN
const REFRESH_TOKEN = process.env.REFRESH_TOKEN
const USER_ID = process.env.USER_ID
const POST_IDS = parsePostIds(process.env.POST_ID)
const ENV_FILE_PATH = resolve(process.cwd(), ".env")
const UPLOAD_DB_PATH = resolve(process.cwd(), "upload.db")

if (!API_TOKEN || !DEV_CODE || !USER_TOKEN || !REFRESH_TOKEN) {
    console.error("缺少必要的环境变量: API_TOKEN, DEV_CODE, USER_TOKEN, REFRESH_TOKEN")
    process.exit(1)
}

const uploadDb = drizzle(new Database(UPLOAD_DB_PATH))

const uploadComments = sqliteTable(
    "upload_comments",
    {
        id: text("id").primaryKey(),
        postId: text("post_id").notNull(),
        commentId: integer("comment_id").notNull(),
        userId: text("user_id").notNull(),
        pageIndex: integer("page_index").notNull(),
        uploadedAt: text("uploaded_at").notNull(),
    },
    table => [uniqueIndex("upload_comments_post_comment_idx").on(table.postId, table.commentId)]
)

type UploadCommentRow = typeof uploadComments.$inferInsert

type AbyssBestTimeVo1 = {
    charIcon?: string
    closeWeaponIcon?: string
    langRangeWeaponIcon?: string
    petIcon?: string
    phantomCharIcon1?: string
    phantomCharIcon2?: string
    phantomWeaponIcon1?: string
    phantomWeaponIcon2?: string
}

type AbyssBestTimeIds = {
    charId: number | null
    meleeId: number | null
    rangedId: number | null
    petId: number | null
    support1: number | null
    supportWeapon1: number | null
    support2: number | null
    supportWeapon2: number | null
}

type AbyssUsageSubmissionInput = {
    uidSha256: string
    charId: number
    meleeId: number
    rangedId: number
    support1: number
    supportWeapon1: number
    support2: number
    supportWeapon2: number
    stars: number
    petId?: number | null
    ownedChars?: Array<{ charId: number; gradeLevel: number }>
    ownedWeapons?: Array<{ weaponId: number; skillLevel: number }>
}

/**
 * 解析帖子 ID 列表。
 * @param value 环境变量值。
 * @returns 帖子 ID 数组。
 */
function parsePostIds(value?: string) {
    return (value || "")
        .split(",")
        .map(item => item.trim())
        .filter(item => item.length > 0)
}

/**
 * 初始化上传去重表。
 */
function ensureUploadDb() {
    uploadDb.run(`
        CREATE TABLE IF NOT EXISTS upload_comments (
            id TEXT PRIMARY KEY NOT NULL,
            post_id INTEGER NOT NULL,
            comment_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            page_index INTEGER NOT NULL,
            uploaded_at TEXT NOT NULL
        )
    `)
    uploadDb.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS upload_comments_post_comment_idx
        ON upload_comments(post_id, comment_id)
    `)
}

/**
 * 计算字符串 SHA-256。
 * @param input 输入字符串。
 * @returns 十六进制摘要。
 */
function sha256(input: string) {
    return createHash("sha256").update(input, "utf8").digest("hex")
}

/**
 * 归一化深渊上传用的角色 ID。
 * @param charId 角色 ID。
 * @returns 上传时使用的角色 ID。
 */
function normalizeAbyssCharId(charId: number): number {
    return charId === 160101 ? 1601 : charId
}

/**
 * 从图标 URL 中提取资源名。
 * @param url 图标地址。
 * @returns 资源名。
 */
function extractAbyssIconName(url?: string) {
    if (!url) {
        return ""
    }
    const match = url.match(/Head_(.+?)\.png(?:\?.*)?$/i)
    if (!match?.[1]) {
        return ""
    }
    let icon = match[1].replace(/^Pet_/, "")
    if (icon === "Bow_Lieyan") {
        icon = "Bow_Shashi"
    } else if (icon === "Bow_hugaung") {
        icon = "Bow_Huguang"
    }
    return icon
}

/**
 * 按图标字段建立反查表。
 * @param items 数据项。
 * @returns 图标到 ID 的映射。
 */
function buildIconIdMap<T extends { id: number; icon?: string }>(items: Iterable<T>) {
    const map = new Map<string, number>()
    for (const item of items) {
        if (item.icon) {
            map.set(item.icon, item.id)
        }
    }
    map.set("Nanzhu", 160101)
    return map
}

const charIconIdMap = buildIconIdMap(charMap.values())
const weaponIconIdMap = buildIconIdMap(weaponMap.values())
const petIconIdMap = buildIconIdMap(petMap.values())

/**
 * 从已持有角色中优先按 icon 反查角色 ID。
 * @param roleInfo 角色信息。
 * @param icon 图标名。
 * @returns 角色 ID。
 */
function findOwnedCharIdByIcon(roleInfo: DNARoleEntity, icon?: string) {
    const roleShow = roleInfo.roleInfo?.roleShow
    if (!roleShow || !icon) {
        return null
    }
    const found = roleShow.roleChars.find(item => item.icon === icon && item.unLocked)
    return found ? found.charId : null
}

/**
 * 从已持有武器中优先按 icon 反查武器 ID。
 * @param roleInfo 角色信息。
 * @param icon 图标名。
 * @returns 武器 ID。
 */
function findOwnedWeaponIdByIcon(roleInfo: DNARoleEntity, icon?: string) {
    const roleShow = roleInfo.roleInfo?.roleShow
    if (!roleShow || !icon) {
        return null
    }
    const ownedWeapons = [...roleShow.closeWeapons, ...roleShow.langRangeWeapons]
    const found = ownedWeapons.find(item => item.icon === icon && item.unLocked)
    return found ? found.weaponId : null
}

/**
 * 反解深渊阵容图片到 ID。
 * @param bestTimeVo1 深渊阵容图。
 * @returns 结构化 ID。
 */
function parseAbyssBestTimeVo1(bestTimeVo1?: AbyssBestTimeVo1 | null): AbyssBestTimeIds {
    const supportSlots = [
        {
            charId: charIconIdMap.get(extractAbyssIconName(bestTimeVo1?.phantomCharIcon1)) ?? null,
            weaponId: weaponIconIdMap.get(extractAbyssIconName(bestTimeVo1?.phantomWeaponIcon1)) ?? null,
        },
        {
            charId: charIconIdMap.get(extractAbyssIconName(bestTimeVo1?.phantomCharIcon2)) ?? null,
            weaponId: weaponIconIdMap.get(extractAbyssIconName(bestTimeVo1?.phantomWeaponIcon2)) ?? null,
        },
    ]

    supportSlots.sort((left, right) => {
        const leftChar = left.charId ?? Number.POSITIVE_INFINITY
        const rightChar = right.charId ?? Number.POSITIVE_INFINITY
        if (leftChar !== rightChar) {
            return leftChar - rightChar
        }
        const leftWeapon = left.weaponId ?? Number.POSITIVE_INFINITY
        const rightWeapon = right.weaponId ?? Number.POSITIVE_INFINITY
        return leftWeapon - rightWeapon
    })

    return {
        charId: charIconIdMap.get(extractAbyssIconName(bestTimeVo1?.charIcon)) ?? null,
        meleeId: weaponIconIdMap.get(extractAbyssIconName(bestTimeVo1?.closeWeaponIcon)) ?? null,
        rangedId: weaponIconIdMap.get(extractAbyssIconName(bestTimeVo1?.langRangeWeaponIcon)) ?? null,
        petId: petIconIdMap.get(extractAbyssIconName(bestTimeVo1?.petIcon)) ?? null,
        support1: supportSlots[0]?.charId ?? null,
        supportWeapon1: supportSlots[0]?.weaponId ?? null,
        support2: supportSlots[1]?.charId ?? null,
        supportWeapon2: supportSlots[1]?.weaponId ?? null,
    }
}

/**
 * 归一化可拥有的角色 ID 列表。
 * @param items 角色列表。
 * @returns 去重后的角色列表。
 */
function normalizeOwnedCharIds(items?: Array<{ charId: number; gradeLevel: number }>) {
    const charLevels = new Map<number, number>()
    for (const item of items || []) {
        if (!Number.isInteger(item.charId) || item.charId <= 0) continue
        if (!Number.isInteger(item.gradeLevel) || item.gradeLevel < 0) continue
        const current = charLevels.get(item.charId)
        if (current == null || item.gradeLevel > current) {
            charLevels.set(item.charId, item.gradeLevel)
        }
    }
    return [...charLevels.entries()].map(([charId, gradeLevel]) => ({ charId, gradeLevel }))
}

/**
 * 归一化可拥有的武器 ID 列表。
 * @param items 武器列表。
 * @returns 去重后的武器列表。
 */
function normalizeOwnedWeaponIds(items?: Array<{ weaponId: number; skillLevel: number }>) {
    const weaponLevels = new Map<number, number>()
    for (const item of items || []) {
        if (!Number.isInteger(item.weaponId) || item.weaponId <= 0) continue
        if (!Number.isInteger(item.skillLevel) || item.skillLevel < 0) continue
        const current = weaponLevels.get(item.weaponId)
        if (current == null || item.skillLevel > current) {
            weaponLevels.set(item.weaponId, item.skillLevel)
        }
    }
    return [...weaponLevels.entries()].map(([weaponId, skillLevel]) => ({ weaponId, skillLevel }))
}

/**
 * 先按持有信息反解，失败后回退到全局图标映射。
 * @param roleInfo 角色信息。
 * @param bestTimeVo1 深渊阵容图。
 * @returns 结构化 ID。
 */
function parseAbyssBestTimeVo1WithOwned(roleInfo: DNARoleEntity, bestTimeVo1?: AbyssBestTimeVo1 | null): AbyssBestTimeIds {
    const parsed = parseAbyssBestTimeVo1(bestTimeVo1)
    return {
        charId: normalizeAbyssCharId(findOwnedCharIdByIcon(roleInfo, bestTimeVo1?.charIcon) ?? parsed.charId ?? 0) || null,
        meleeId: findOwnedWeaponIdByIcon(roleInfo, bestTimeVo1?.closeWeaponIcon) ?? parsed.meleeId,
        rangedId: findOwnedWeaponIdByIcon(roleInfo, bestTimeVo1?.langRangeWeaponIcon) ?? parsed.rangedId,
        petId: parsed.petId,
        support1: normalizeAbyssCharId(findOwnedCharIdByIcon(roleInfo, bestTimeVo1?.phantomCharIcon1) ?? parsed.support1 ?? 0) || null,
        supportWeapon1: findOwnedWeaponIdByIcon(roleInfo, bestTimeVo1?.phantomWeaponIcon1) ?? parsed.supportWeapon1,
        support2: normalizeAbyssCharId(findOwnedCharIdByIcon(roleInfo, bestTimeVo1?.phantomCharIcon2) ?? parsed.support2 ?? 0) || null,
        supportWeapon2: findOwnedWeaponIdByIcon(roleInfo, bestTimeVo1?.phantomWeaponIcon2) ?? parsed.supportWeapon2,
    }
}

/**
 * 从当前账号已持有数据里提取深渊上传 payload。
 * @param roleInfo 角色信息。
 * @returns 上传 payload；若无法反解返回 null。
 */
async function buildAbyssUploadPayload(roleInfo: DNARoleEntity): Promise<AbyssUsageSubmissionInput | null> {
    const roleShow = roleInfo.roleInfo?.roleShow
    const bestTimeVo1 = roleInfo.roleInfo?.abyssInfo?.bestTimeVo1
    if (!roleShow || !bestTimeVo1) {
        return null
    }

    const lineup = parseAbyssBestTimeVo1WithOwned(roleInfo, bestTimeVo1)
    const uidSha256 = sha256(String(roleShow.roleId ?? ""))
    if (!uidSha256) {
        return null
    }

    const starsValue = String(roleInfo.roleInfo.abyssInfo?.stars ?? "").split("/")[0]
    const stars = Number(starsValue)
    if (!Number.isInteger(stars) || stars < 0) {
        throw new Error("stars 非法")
    }

    const payload: AbyssUsageSubmissionInput = {
        uidSha256,
        charId: lineup.charId != null ? normalizeAbyssCharId(lineup.charId) : 0,
        meleeId: lineup.meleeId ?? 0,
        rangedId: lineup.rangedId ?? 0,
        support1: lineup.support1 != null ? normalizeAbyssCharId(lineup.support1) : 0,
        supportWeapon1: lineup.supportWeapon1 ?? 0,
        support2: lineup.support2 != null ? normalizeAbyssCharId(lineup.support2) : 0,
        supportWeapon2: lineup.supportWeapon2 ?? 0,
        stars,
        ownedChars: normalizeOwnedCharIds(roleShow.roleChars),
        ownedWeapons: normalizeOwnedWeaponIds([...roleShow.closeWeapons, ...roleShow.langRangeWeapons]),
    }
    if (lineup.petId != null) {
        payload.petId = lineup.petId
    }
    return payload
}

/**
 * 提交深渊使用数据。
 * @param payload 深渊提交数据。
 */
async function submitAbyssUsage(payload: AbyssUsageSubmissionInput) {
    const mutation = `
        mutation SubmitAbyssUsage($input: AbyssUsageSubmissionInput!) {
            submitAbyssUsage(input: $input) {
                id
            }
        }
    `
    const response = await fetch(`${API_BASE_URL}/graphql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            query: mutation,
            variables: {
                input: payload,
            },
        }),
    })
    const result = await response.json()
    if (result.errors?.length) {
        throw new Error(result.errors.map((item: { message: string }) => item.message).join(", "))
    }
    return result.data?.submitAbyssUsage?.id as string | undefined
}

/**
 * 判断评论是否已经处理过。
 * @param postId 帖子 ID。
 * @param commentId 评论 ID。
 * @returns 是否已处理。
 */
async function hasUploadedComment(postId: string, commentId: number) {
    const rows = await uploadDb
        .select({ id: uploadComments.id })
        .from(uploadComments)
        .where(and(eq(uploadComments.postId, postId), eq(uploadComments.commentId, commentId)))
        .limit(1)
    return rows.length > 0
}

/**
 * 获取已处理到的最后页码。
 * @param postId 帖子 ID。
 * @returns 最后一页页码。
 */
async function getLastUploadedPageIndex(postId: string) {
    const rows = await uploadDb
        .select({ pageIndex: uploadComments.pageIndex })
        .from(uploadComments)
        .where(eq(uploadComments.postId, postId))
        .orderBy(desc(uploadComments.pageIndex))
        .limit(1)
    return rows[0]?.pageIndex ?? 0
}

/**
 * 记录评论已处理。
 * @param postId 帖子 ID。
 * @param commentId 评论 ID。
 * @param userId 用户 ID。
 * @param pageIndex 页码。
 */
async function markCommentUploaded(postId: string, commentId: number, userId: string, pageIndex: number) {
    const row: UploadCommentRow = {
        id: `${postId}-${commentId}`,
        postId,
        commentId,
        userId,
        pageIndex,
        uploadedAt: new Date().toISOString(),
    }
    await uploadDb
        .insert(uploadComments)
        .values(row)
        .onConflictDoUpdate({
            target: [uploadComments.postId, uploadComments.commentId],
            set: {
                userId,
                pageIndex,
                uploadedAt: row.uploadedAt,
            },
        })
}

/**
 * 拉取评论分页。
 * @param dnaAPI DNA API 实例。
 * @param pageIndex 页码。
 * @returns 评论分页数据。
 */
async function fetchPostComments(dnaAPI: ReturnType<typeof getDNAAPI>, postId: string, pageIndex: number): Promise<DNACommentListResponse> {
    if (!postId) {
        throw new Error("POST_ID 未配置")
    }
    const res = await dnaAPI.getPostCommentList(postId, pageIndex, 20, 0)
    if (res.is_success && res.data) {
        return res.data
    }
    throw new Error(`获取评论失败: ${res.msg}`)
}

/**
 * 扫描帖子评论并自动上传深渊数据。
 */
async function updateAbyssUsageFromComments() {
    if (POST_IDS.length === 0) {
        console.log("未配置 POST_ID，跳过深渊评论上传")
        return
    }
    ensureUploadDb()
    const dnaAPI = await prepareDNAAPI()
    let totalComments = 0
    let uploadedCount = 0
    let skippedCount = 0
    let wsClient: WsClient | null = null

    console.log(`${new Date().toLocaleString()} 开始扫描帖子评论 - postId: ${POST_IDS.join(",")}`)

    try {
        for (const postId of POST_IDS) {
            const pageIndex = Math.max(1, await getLastUploadedPageIndex(postId))
            console.log(`开始扫描帖子 ${postId}，从第 ${pageIndex} 页继续扫描`)

            let currentPageIndex = pageIndex
            while (true) {
                const page = await fetchPostComments(dnaAPI, postId, currentPageIndex)
                const comments = page.postCommentList || []
                if (comments.length === 0) {
                    break
                }

                for (const comment of comments) {
                    totalComments++
                    if (await hasUploadedComment(postId, comment.commentId)) {
                        skippedCount++
                        continue
                    }

                    const userId = comment.userId?.trim()
                    if (!userId) {
                        console.log(`评论 ${comment.commentId} 缺少 userId，已跳过`)
                        await markCommentUploaded(postId, comment.commentId, "", currentPageIndex)
                        skippedCount++
                        continue
                    }

                    try {
                        if (!wsClient) {
                            wsClient = new WsClient(dnaAPI.BASE_WEB_SOCKET_URL, dnaAPI.token, USER_ID || "", 10000)
                            await wsClient.connect()
                            await sleep(2000)
                        }
                        const roleRes = await dnaAPI.defaultRoleForTool(2, userId)
                        if (!roleRes.is_success || !roleRes.data) {
                            console.log(`评论 ${comment.commentId} 未查询到角色信息`)
                            await markCommentUploaded(postId, comment.commentId, userId, currentPageIndex)
                            skippedCount++
                            continue
                        }

                        const payload = await buildAbyssUploadPayload(roleRes.data)
                        if (!payload) {
                            console.log(`评论 ${comment.commentId} 无法生成深渊上传数据`)
                            await markCommentUploaded(postId, comment.commentId, userId, currentPageIndex)
                            skippedCount++
                            continue
                        }

                        const submissionId = await submitAbyssUsage(payload)
                        if (!submissionId) {
                            throw new Error("上传结果为空")
                        }

                        await markCommentUploaded(postId, comment.commentId, userId, currentPageIndex)
                        uploadedCount++
                        console.log(`评论 ${comment.commentId} 上传成功，submissionId: ${submissionId}`)
                    } catch (error) {
                        console.error(`评论 ${comment.commentId} 处理失败:`, error)
                    }
                }

                if (!page.hasNext) {
                    break
                }
                currentPageIndex++
            }
        }
    } finally {
        wsClient?.close()
    }

    console.log(`${new Date().toLocaleString()} 评论扫描完成，评论数: ${totalComments}, 已上传: ${uploadedCount}, 已跳过: ${skippedCount}`)
}

// 休眠函数
const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * @description 将刷新后的用户访问 token 回写到 `.env`。
 * 仅覆盖 `USER_TOKEN=` 这一行，其余环境变量保持原样。
 * @param token 最新 token。
 */
function persistUserTokenToEnv(token: string) {
    const envContent = readFileSync(ENV_FILE_PATH, "utf8")
    const nextLine = `USER_TOKEN=${token}`

    if (/^USER_TOKEN=.*$/m.test(envContent)) {
        const updated = envContent.replace(/^USER_TOKEN=.*$/m, nextLine)
        writeFileSync(ENV_FILE_PATH, updated, "utf8")
        return
    }

    const suffix = envContent.endsWith("\n") ? "" : "\n"
    writeFileSync(ENV_FILE_PATH, `${envContent}${suffix}${nextLine}\n`, "utf8")
}

// WebSocket客户端类，实现心跳机制和自定义请求头
class WsClient {
    private ws: WebSocket | null = null
    private heartbeatInterval: NodeJS.Timeout | null = null
    private reconnectTimeout: NodeJS.Timeout | null = null
    private url: string
    private token: string
    private userId: string
    private heartbeatIntervalMs: number
    private isConnected: boolean = false

    constructor(url: string, token: string, userId: string, heartbeatIntervalMs: number) {
        this.url = url
        this.token = token
        this.userId = userId
        this.heartbeatIntervalMs = heartbeatIntervalMs
    }

    // 建立WebSocket连接
    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                let settled = false
                // 创建WebSocket连接，添加自定义请求头
                const ws = new WebSocket(this.url, {
                    headers: {
                        token: this.token,
                        appVersion: "1.2.2",
                        sourse: "android",
                    },
                })

                ws.on("open", () => {
                    console.log(`${new Date().toLocaleString()} WebSocket连接已建立`)
                    this.isConnected = true
                    this.startHeartbeat()
                })

                ws.on("message", (data: WebSocket.Data) => {
                    console.log(`${new Date().toLocaleString()} 收到WebSocket消息: ${data}`)
                    if (!settled) {
                        settled = true
                        resolve()
                    }
                })

                ws.on("close", () => {
                    console.log(`${new Date().toLocaleString()} WebSocket连接已关闭`)
                    this.isConnected = false
                    this.stopHeartbeat()
                    if (!settled) {
                        settled = true
                        reject(new Error("WebSocket在收到首条消息前关闭"))
                    }
                })

                ws.on("error", (error: Error) => {
                    console.error(`${new Date().toLocaleString()} WebSocket错误: ${error}`)
                    this.isConnected = false
                    this.stopHeartbeat()
                    if (!settled) {
                        settled = true
                        reject(error)
                    }
                })

                this.ws = ws
            } catch (error) {
                console.error(`${new Date().toLocaleString()} WebSocket连接失败: ${error}`)
                reject(error)
            }
        })
    }

    // 开始心跳
    private startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval)
        }

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.isConnected) {
                try {
                    const pingMessage = JSON.stringify({
                        data: { userId: this.userId },
                        event: "ping",
                    })
                    this.ws.send(pingMessage)
                    console.log(`${new Date().toLocaleString()} 发送心跳消息: ${pingMessage}`)
                } catch (error) {
                    console.error(`${new Date().toLocaleString()} 发送心跳失败: ${error}`)
                    this.isConnected = false
                    this.stopHeartbeat()
                }
            }
        }, this.heartbeatIntervalMs)
    }

    // 停止心跳
    private stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval)
            this.heartbeatInterval = null
        }
    }

    // 发送消息
    send(message: string): void {
        if (this.ws && this.isConnected) {
            try {
                this.ws.send(message)
            } catch (error) {
                console.error(`${new Date().toLocaleString()} 发送消息失败: ${error}`)
                this.isConnected = false
                this.stopHeartbeat()
            }
        } else {
            console.error(`${new Date().toLocaleString()} WebSocket未连接，无法发送消息`)
        }
    }

    // 关闭WebSocket连接
    close(): void {
        this.stopHeartbeat()
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout)
            this.reconnectTimeout = null
        }
        if (this.ws) {
            this.ws.close()
            this.ws = null
        }
        this.isConnected = false
        console.log(`${new Date().toLocaleString()} WebSocket连接已手动关闭`)
    }

    // 检查连接状态
    isWsConnected(): boolean {
        return this.isConnected
    }
}

/**
 * @description 创建并校验一个可用的 DNA API 实例。
 * 若访问 token 已过期，则会使用 refresh token 刷新并回写到 `.env`。
 */
async function prepareDNAAPI() {
    const dnaAPI = getDNAAPI()
    const loginRes = await dnaAPI.loginLog()
    if (loginRes.msg.includes("失效") || loginRes.msg.includes("过期")) {
        const refreshRes = await dnaAPI.refreshToken(REFRESH_TOKEN!)
        if (refreshRes.is_success && refreshRes.data?.token) {
            dnaAPI.token = refreshRes.data.token
            console.info("刷新AK成功")
            persistUserTokenToEnv(refreshRes.data.token)
        } else {
            throw new Error(`刷新 token 失败: ${refreshRes.msg}`)
        }
    }
    return dnaAPI
}

/**
 * @description 从 DNA API 获取委托数据。
 * @param dnaAPI 已完成登录校验的 API 实例。
 */
async function fetchMissionsFromDNA(dnaAPI: ReturnType<typeof getDNAAPI>) {
    try {
        const res = await dnaAPI.defaultRoleForTool()
        if (res.is_success && res.data?.instanceInfo) {
            const missions = res.data.instanceInfo.map(item => item.instances.map(v => v.name))
            return missions
        }
        throw new Error(`DNA API 返回失败: ${res.msg}`)
    } catch (error) {
        console.error("获取 DNA API 数据失败:", error)
        throw error
    }
}

type UploadActivity = {
    id: number
    postId: string | null
    startTime: number
    endTime: number
    name: string
    icon: string
    desc: string
}

/**
 * 将 DNA 活动结构映射为后端存储结构
 */
function normalizeActivity(activity: DNAActivity): UploadActivity {
    return {
        id: activity.id,
        postId: activity.postId ?? null,
        startTime: activity.startTime,
        endTime: activity.endTime,
        name: activity.name,
        icon: activity.icon,
        desc: activity.description,
    }
}

// 从 DNA API 获取活动数据并过滤周期活动
async function fetchActivitiesFromDNA(dnaAPI: ReturnType<typeof getDNAAPI>): Promise<UploadActivity[]> {
    try {
        const res = await dnaAPI.getActivityList()

        if (!res.is_success || !res.data?.activities) {
            throw new Error(`DNA API 返回失败: ${res.msg}`)
        }
        return res.data.activities.filter(activity => activity.cycleDay === -1).map(normalizeActivity)
    } catch (error) {
        console.error("获取 DNA API 活动失败:", error)
        throw error
    }
}

// 通过 GraphQL mutation 更新委托
async function updateMissionsIngame(server: string, missions: string[][]) {
    const mutation = `
        mutation AddMissionsIngame($token: String!, $server: String!, $missions: [[String!]!]!) {
            addMissionsIngame(token: $token, server: $server, missions: $missions) {
                id
                server
                missions
                createdAt
            }
        }
    `

    try {
        const response = await fetch(`${API_BASE_URL}/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: mutation,
                variables: {
                    token: API_TOKEN,
                    server,
                    missions,
                },
            }),
        })

        const result = await response.json()

        if (result.errors) {
            const duplicateError = result.errors.find((e: any) => e.message === "duplicate missions")
            if (duplicateError) {
                console.log(`${new Date().toLocaleString()} 数据未变化，跳过更新 - server: ${server}`)
                return null
            }
            throw new Error(result.errors.map((e: any) => e.message).join(", "))
        }

        console.log(`${new Date().toLocaleString()} 更新成功 - server: ${server}`)
        console.log(`ID: ${result.data.addMissionsIngame.id}, 委托数量: ${missions.length}`)
        return result.data.addMissionsIngame
    } catch (error) {
        console.error("GraphQL 请求失败:", error)
        throw error
    }
}

// 通过 GraphQL mutation 更新活动
async function upsertActivitiesIngame(server: string, activities: UploadActivity[]) {
    const mutation = `
        mutation UpsertActivitiesIngame($token: String!, $server: String!, $activities: [ActivityInput!]!) {
            upsertActivitiesIngame(token: $token, server: $server, activities: $activities) {
                id
                postId
                startTime
                endTime
                name
                icon
                desc
            }
        }
    `

    try {
        const response = await fetch(`${API_BASE_URL}/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: mutation,
                variables: {
                    token: API_TOKEN,
                    server,
                    activities,
                },
            }),
        })

        const result = await response.json()
        if (result.errors) {
            throw new Error(result.errors.map((e: any) => e.message).join(", "))
        }
        console.log(`${new Date().toLocaleString()} 活动更新成功 - server: ${server}, 活动数量: ${activities.length}`)
        return result.data.upsertActivitiesIngame
    } catch (error) {
        console.error("活动 GraphQL 请求失败:", error)
        throw error
    }
}

// 更新委托信息（带重试机制）
const updateMH = async (server: string = "cn", t: number = 10) => {
    console.log(`${new Date().toLocaleString()} 开始同步密函信息 - server: ${server}`)
    let is_success = false
    if (t > 1) await sleep(30000)
    for (let i = 0; i < t; i++) {
        if (t > 1) await sleep(5000)
        try {
            const dnaAPI = await prepareDNAAPI()

            // 每次请求前创建并连接 WebSocket，连接上下文与当前 API token 保持一致
            const wsClient = new WsClient(dnaAPI.BASE_WEB_SOCKET_URL, dnaAPI.token, USER_ID || "", 10000)
            await wsClient.connect()
            await sleep(2000)

            try {
                // 执行委托数据同步
                const missions = await fetchMissionsFromDNA(dnaAPI)
                const activities = await fetchActivitiesFromDNA(dnaAPI)
                const missionResult = await updateMissionsIngame(server, missions)
                await upsertActivitiesIngame(server, activities)
                if (missionResult === null) {
                    // duplicate missions 视为成功
                    is_success = true
                } else {
                    is_success = true
                }
            } finally {
                // 无论请求成功与否，都关闭WebSocket连接
                wsClient.close()
            }
        } catch (e: any) {
            console.error(`${new Date().toLocaleString()} 同步失败: ${e.message} retry: ${i}`)
        }
        if (is_success) {
            console.log(`${new Date().toLocaleString()} 同步成功 - server: ${server}`)
            break
        }
    }
    // 重试都失败
    if (!is_success) {
        console.error(`${new Date().toLocaleString()} 同步失败：${t}次重试均未成功 - server: ${server}`)
        // process.exit(1)
    }
    console.log(`${new Date().toLocaleString()} 同步完成`)
}

// 获取下一次更新时间
const getNextUpdateTime = (t?: number) => {
    const now = t ?? Date.now()
    const oneHour = 60 * 60 * 1000
    return Math.ceil(now / oneHour) * oneHour
}

// 主函数
async function main() {
    const mode = process.argv[2] || "cron" // once: 执行一次, cron: 持续定时执行
    const server = process.argv[3] || "cn"

    console.log(`启动模式: ${mode}, 服务器: ${server}`)
    console.log(`GraphQL API: ${API_BASE_URL}`)
    console.log(`评论帖子 ID: ${POST_IDS.length > 0 ? POST_IDS.join(",") : "未配置"}`)

    if (mode === "cron") {
        // 持续定时执行（每小时）
        const updateTask = async () => {
            await updateMH(server, 2)
            // 防止API没更新
            await updateMH(server, 3)
            await updateAbyssUsageFromComments()
            const next = getNextUpdateTime()
            console.log(`下一次同步: ${new Date(next).toLocaleString()}`)
        }

        const syncMHJob = new Cron("@hourly", { timezone: "Asia/Shanghai" }, () => updateTask())
        console.log("Cron 任务已启动，每小时执行一次")
        console.log(`下一次执行: ${syncMHJob.nextRun()}`)

        // 立即执行一次
        await updateMH(server, 1)
        await updateAbyssUsageFromComments()

        // 保持进程运行
        process.on("SIGINT", () => {
            syncMHJob.stop()
            console.log("Cron 任务已停止")
            process.exit(0)
        })
    } else {
        // 执行一次
        await updateMH(server, 1)
        await updateAbyssUsageFromComments()
        console.log(`${new Date().toLocaleString()} 更新完成`)
        process.exit(0)
    }
}

// 执行主函数
main()
