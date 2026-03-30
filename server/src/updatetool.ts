// 更新委托信息工具
// 作为客户端，通过 GraphQL API 更新委托数据到远端服务器

import "dotenv/config"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fetch } from "bun"
import { Cron } from "croner"
import type { DNAActivity } from "dna-api"
import { WebSocket } from "ws"
import { getDNAAPI } from "./api/dna"

// 环境变量配置
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8887"
const API_TOKEN = process.env.API_TOKEN
const DEV_CODE = process.env.DEV_CODE
const USER_TOKEN = process.env.USER_TOKEN
const REFRESH_TOKEN = process.env.REFRESH_TOKEN
const USER_ID = process.env.USER_ID
const ENV_FILE_PATH = resolve(process.cwd(), ".env")

if (!API_TOKEN || !DEV_CODE || !USER_TOKEN || !REFRESH_TOKEN) {
    console.error("缺少必要的环境变量: API_TOKEN, DEV_CODE, USER_TOKEN, REFRESH_TOKEN")
    process.exit(1)
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
                    resolve()
                })

                ws.on("message", (data: WebSocket.Data) => {
                    console.log(`${new Date().toLocaleString()} 收到WebSocket消息: ${data}`)
                })

                ws.on("close", () => {
                    console.log(`${new Date().toLocaleString()} WebSocket连接已关闭`)
                    this.isConnected = false
                    this.stopHeartbeat()
                })

                ws.on("error", (error: Error) => {
                    console.error(`${new Date().toLocaleString()} WebSocket错误: ${error}`)
                    this.isConnected = false
                    this.stopHeartbeat()
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

    if (mode === "cron") {
        // 持续定时执行（每小时）
        const updateTask = async () => {
            await updateMH(server, 2)
            // 防止API没更新
            await updateMH(server, 3)
            const next = getNextUpdateTime()
            console.log(`下一次同步: ${new Date(next).toLocaleString()}`)
        }

        const syncMHJob = new Cron("@hourly", { timezone: "Asia/Shanghai" }, () => updateTask())
        console.log("Cron 任务已启动，每小时执行一次")
        console.log(`下一次执行: ${syncMHJob.nextRun()}`)

        // 立即执行一次
        await updateMH(server, 1)

        // 保持进程运行
        process.on("SIGINT", () => {
            syncMHJob.stop()
            console.log("Cron 任务已停止")
            process.exit(0)
        })
    } else {
        // 执行一次
        await updateMH(server, 10)
        console.log(`${new Date().toLocaleString()} 更新完成`)
    }
}

// 执行主函数
main()
