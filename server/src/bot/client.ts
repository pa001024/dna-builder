import { fetch } from "bun"
import { commandManager } from "./commands"
import type { CommandContext } from "./commands/interfaces"
import type { QQBotEvent, QQBotEventC2CMessageCreate, QQBotEventGroupAtMessageCreate } from "./types"

interface BotConfig {
    appId: string
    secret: string
    token?: string
    sandBox?: boolean
}

export class QQBotClient {
    private config: BotConfig
    private accessToken: string | null = null
    ws: WebSocket | null = null

    // WebSocket相关属性
    private heartbeat_interval: number = 0
    private expires_in: number = 0
    private session_id: string | null = null
    private seq: number = 0
    private restoreLink: boolean = false
    private isConnecting: boolean = false
    private isShuttingDown: boolean = false

    // 定时器
    private heartbeatTimer: NodeJS.Timeout | null = null
    private tokenRefreshTimer: NodeJS.Timeout | null = null
    private connectionResetTimer: NodeJS.Timeout | null = null

    // 消息处理回调
    private messageHandler?: (data: any) => void

    constructor(botConfig: BotConfig) {
        this.config = botConfig
    }

    /**
     * 设置消息处理回调
     */
    setMessageHandler(handler: (data: any) => void) {
        this.messageHandler = handler
    }

    /**
     * 获取 accessToken
     */
    async getAccessToken() {
        if (this.accessToken) {
            return this.accessToken
        }

        if (!this.config.appId || !this.config.secret) {
            throw new Error("未配置机器人appId或secret")
        }

        const response = await fetch("https://bots.qq.com/app/getAppAccessToken", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                appId: this.config.appId,
                clientSecret: this.config.secret,
            }),
        })

        if (!response.ok) {
            throw new Error(`获取access token失败: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        this.accessToken = data.access_token
        this.expires_in = +data.expires_in * 1000

        console.info("获取Token成功: ", data)
        console.debug(`有效期: ${Math.floor(this.expires_in / 1000)}秒`)

        // 设置定时刷新
        this.scheduleTokenRefresh()

        return this.accessToken
    }

    /**
     * 安排token刷新
     */
    private scheduleTokenRefresh() {
        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer)
        }

        const refreshTime = this.expires_in - 60000 // 提前1分钟刷新
        this.tokenRefreshTimer = setTimeout(async () => {
            console.info("刷新访问令牌")
            try {
                await this.getAccessToken()
            } catch (error) {
                console.error(`Token刷新失败: ${(error as Error).message}`)
                // 失败后10秒重试
                setTimeout(() => {
                    this.scheduleTokenRefresh()
                }, 10000)
            }
        }, refreshTime)

        console.debug(`安排 ${Math.floor(refreshTime / 1000)} 秒后刷新令牌`)
    }

    /**
     * 发送群聊消息
     */
    async sendGroupMessage(content: string, groupId: string, messageId?: string): Promise<any> {
        const token = await this.getAccessToken()

        const response = await fetch(`https://api.sgroup.qq.com/v2/groups/${groupId}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `QQBot ${token}`,
            },
            body: JSON.stringify({
                content,
                msg_type: 0,
                ...(messageId && { msg_id: messageId }),
            }),
        })

        if (!response.ok) {
            const errorData = await response.text()
            throw new Error(`发送群消息失败: ${response.status} - ${errorData}`)
        }

        return await response.json()
    }

    /**
     * 发送私聊消息
     */
    async sendPrivateMessage(content: string, userId: string, messageId?: string): Promise<any> {
        if (!userId) {
            throw new Error("缺少必要的userId参数")
        }

        const token = await this.getAccessToken()
        const response = await fetch(`https://api.sgroup.qq.com/v2/users/${userId}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `QQBot ${token}`,
            },
            body: JSON.stringify({
                content,
                msg_type: 0,
                ...(messageId && { msg_id: messageId }),
            }),
        })

        if (!response.ok) {
            const errorData = await response.text()
            throw new Error(`发送私聊消息失败: ${response.status} - ${errorData}`)
        }

        return await response.json()
    }

    /**
     * 上传群聊图片
     */
    async uploadGroupImage(groupId: string, imageUrl: string): Promise<any> {
        const token = await this.getAccessToken()

        const response = await fetch(`https://api.sgroup.qq.com/v2/groups/${groupId}/files`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `QQBot ${token}`,
            },
            body: JSON.stringify({
                file_type: 1,
                url: imageUrl,
                srv_send_msg: false,
            }),
        })

        if (!response.ok) {
            const errorData = await response.text()
            throw new Error(`上传群图片失败: ${response.status} - ${errorData}`)
        }

        return await response.json()
    }

    /**
     * 上传私聊图片
     */
    async uploadPrivateImage(userId: string, imageUrl: string): Promise<any> {
        if (!userId) {
            throw new Error("缺少必要的userId参数")
        }

        const token = await this.getAccessToken()
        const response = await fetch(`https://api.sgroup.qq.com/v2/users/${userId}/files`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `QQBot ${token}`,
            },
            body: JSON.stringify({
                file_type: 1,
                url: imageUrl,
                srv_send_msg: false,
            }),
        })

        if (!response.ok) {
            const errorData = await response.text()
            throw new Error(`上传私聊图片失败: ${response.status} - ${errorData}`)
        }

        return await response.json()
    }

    /**
     * 发送带图片的群聊消息
     */
    async sendGroupImageMessage(content: string, groupId: string, imageUrl: string, messageId?: string): Promise<any> {
        // 先上传图片
        const fileInfo = await this.uploadGroupImage(groupId, imageUrl)

        // 发送带图片的消息
        const token = await this.getAccessToken()
        const response = await fetch(`https://api.sgroup.qq.com/v2/groups/${groupId}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `QQBot ${token}`,
            },
            body: JSON.stringify({
                content,
                msg_type: 7, // 图片消息类型
                ...(messageId && { msg_id: messageId }),
                media: fileInfo,
            }),
        })

        if (!response.ok) {
            const errorData = await response.text()
            throw new Error(`发送群图片消息失败: ${response.status} - ${errorData}`)
        }

        return await response.json()
    }

    /**
     * 发送带图片的私聊消息
     */
    async sendPrivateImageMessage(content: string, userId: string, imageUrl: string, messageId?: string): Promise<any> {
        if (!userId) {
            throw new Error("缺少必要的userId参数")
        }

        // 先上传图片
        const fileInfo = await this.uploadPrivateImage(userId, imageUrl)

        // 发送带图片的消息
        const token = await this.getAccessToken()
        const response = await fetch(`https://api.sgroup.qq.com/v2/users/${userId}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `QQBot ${token}`,
            },
            body: JSON.stringify({
                content,
                msg_type: 7, // 图片消息类型
                ...(messageId && { msg_id: messageId }),
                media: fileInfo,
            }),
        })

        if (!response.ok) {
            const errorData = await response.text()
            throw new Error(`发送私聊图片消息失败: ${response.status} - ${errorData}`)
        }

        return await response.json()
    }

    /**
     * 获取WebSocket连接URL
     */
    async getWsLink(): Promise<{ url: string }> {
        const token = await this.getAccessToken()

        const response = await fetch(`https://${this.config.sandBox ? "sandbox." : ""}api.sgroup.qq.com/gateway`, {
            method: "GET",
            headers: {
                Authorization: `QQBot ${token}`,
            },
        })

        if (!response.ok) {
            const errorData = await response.text()
            throw new Error(`获取WebSocket连接URL失败: ${response.status} - ${errorData}`)
        }

        return await response.json()
    }

    /**
     * 初始化WebSocket连接
     */
    async init() {
        if (this.isConnecting) {
            // console.warn("连接已在进行中，跳过重复连接")
            return
        }

        this.isConnecting = true
        console.info("开始初始化机器人...")

        try {
            await this.setupConnection()
            this.scheduleConnectionReset()
            console.info("机器人初始化完成")
        } catch (error) {
            console.error(`初始化失败: ${(error as Error).message}`)
            this.safeResetConnection(5000)
        } finally {
            this.isConnecting = false
        }
    }

    /**
     * 建立WebSocket连接
     */
    async setupConnection() {
        const wsLinkData = await this.getWsLink()
        console.debug(`获取WS链接: ${wsLinkData.url}`)

        // 关闭现有连接
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close()
            }
            this.ws = null
        }

        const ws = new WebSocket(wsLinkData.url)
        this.ws = ws

        ws.addEventListener("open", () => this.handleOpen())
        ws.addEventListener("message", (event: MessageEvent) => this.handleMessage(event.data))
        ws.addEventListener("close", () => this.handleClose())
        ws.addEventListener("error", (event: Event) => this.handleError(event as unknown as Error))
    }

    /**
     * 连接打开处理
     */
    private handleOpen() {
        console.info("WS连接成功")

        if (this.restoreLink) {
            console.debug("发送恢复连接请求", {
                session_id: this.session_id,
                seq: this.seq + 1,
            })

            this.ws?.send(
                JSON.stringify({
                    op: 6,
                    d: {
                        token: `QQBot ${this.accessToken}`,
                        session_id: this.session_id,
                        seq: this.seq + 1,
                    },
                })
            )

            this.restoreLink = false
        } else {
            this.sendSession(`QQBot ${this.accessToken}`)
        }
    }

    /**
     * 消息处理
     */
    private handleMessage(data: string) {
        try {
            const ev = JSON.parse(data) as QQBotEvent

            if (ev.op !== 11) console.debug(`收到消息: ${JSON.stringify(ev)}`)

            // 调用消息处理回调
            if (this.messageHandler) {
                this.messageHandler(ev)
            }

            // 处理业务消息
            if (ev.op === 0) {
                // 更新序列号
                if (ev.s) {
                    this.seq = ev.s
                    // console.debug(`更新序列号: ${this.seq}`)
                }
                switch (ev.t) {
                    case "READY":
                        this.session_id = ev.d.session_id
                        console.info(`获取Session ID: ${this.session_id}`)
                        this.sendHeartbeat()
                        break
                    case "GROUP_AT_MESSAGE_CREATE":
                        this.processGroupMessage(ev.d).catch(err => {
                            console.error(`处理消息失败: ${(err as Error).message}`)
                        })
                        break
                    case "C2C_MESSAGE_CREATE":
                        this.processC2CMessage(ev.d).catch(err => {
                            console.error(`处理消息失败: ${(err as Error).message}`)
                        })
                        break
                    default:
                        console.warn(`未处理事件类型: ${ev.t}`)
                }
            }

            // 更新心跳间隔
            if (ev.op === 10 && ev.d?.heartbeat_interval) {
                this.heartbeat_interval = ev.d.heartbeat_interval
                console.debug(`设置心跳周期: ${this.heartbeat_interval}ms`)
            }

            // 重连指令
            if (ev.op === 7 || ev.op === 9) {
                console.info("收到重连指令")
                this.safeResetConnection()
            }
        } catch (err) {
            console.error(`消息解析失败: ${(err as Error).message}`)
        }
    }

    /**
     * 连接关闭处理
     */
    private handleClose() {
        console.warn("WS连接关闭，尝试重连...")
        this.safeResetConnection(3000)
    }

    /**
     * 错误处理
     */
    private handleError(err: Error) {
        console.error(`WS连接错误: ${err.message}`)
        this.safeResetConnection(5000)
    }

    /**
     * 发送鉴权session
     */
    private sendSession(token: string) {
        const msg = {
            op: 2,
            d: {
                token: token,
                intents: 0 | (1 << 25),
                shard: [0, 1],
                properties: {},
            },
        }

        console.debug("发送鉴权请求")
        this.ws?.send(JSON.stringify(msg))
    }

    /**
     * 处理收到的qq群消息
     */
    async processGroupMessage(data: QQBotEventGroupAtMessageCreate["d"]) {
        try {
            const { content, id, group_openid, author } = data
            const sender_openid = author.id

            console.debug(`收到 [群聊] 消息 [${sender_openid}]: ${content.substring(0, 50)}${content.length > 50 ? "..." : ""}`)

            // 解析命令格式
            const trimmed = content.trim()
            const match = trimmed.match(/^(\/\S+)([\s\S]*)$/)
            if (!match) {
                console.warn("无法解析消息格式")
                return
            }

            const commandName = match[1].substring(1) // 移除前缀 /
            const commandContent = (match[2] || "").trim()

            console.info(`解析命令: ${commandName}, 参数: ${commandContent}`)

            // 执行命令
            const context: CommandContext = {
                client: this,
                type: "group",
                message: data,
                content: commandContent,
                groupId: group_openid,
                userId: sender_openid,
                messageId: id,
            }

            const retMsg = await commandManager.executeCommand(commandName, context)

            // 无响应内容
            if (!retMsg) return

            // 发送回复
            if (typeof retMsg === "string" && retMsg.trim()) {
                await this.sendGroupMessage(retMsg, group_openid, id)
            }
        } catch (error) {
            console.error(`消息处理失败: ${(error as Error).message}`)
        }
    }

    /**
     * 处理收到的qq私聊消息
     */
    async processC2CMessage(data: QQBotEventC2CMessageCreate["d"]) {
        try {
            const { content, id, author } = data
            const sender_openid = author.id

            console.debug(`收到 [私聊] 消息 [${sender_openid}]: ${content.substring(0, 50)}${content.length > 50 ? "..." : ""}`)

            // 解析命令格式
            const trimmed = content.trim()
            const match = trimmed.match(/^(\/\S+)([\s\S]*)$/)
            if (!match) {
                console.warn("无法解析消息格式")
                return
            }

            const commandName = match[1].substring(1) // 移除前缀 /
            const commandContent = (match[2] || "").trim()

            console.info(`解析命令: ${commandName}, 参数: ${commandContent}`)

            // 执行命令
            const context: CommandContext = {
                client: this,
                type: "c2c",
                message: data,
                content: commandContent,
                userId: sender_openid,
                messageId: id,
            }

            const retMsg = await commandManager.executeCommand(commandName, context)

            // 无响应内容
            if (!retMsg) return

            // 发送回复
            if (typeof retMsg === "string" && retMsg.trim()) {
                await this.sendPrivateMessage(retMsg, sender_openid, id)
            }
        } catch (error) {
            console.error(`消息处理失败: ${(error as Error).message}`)
        }
    }
    /**
     * 发送心跳
     */
    private sendHeartbeat() {
        // 立即发送首次心跳
        this.ws?.send(JSON.stringify({ op: 1, d: null }))
        console.debug("发送首次心跳")

        // 设置周期性心跳
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
        }

        this.heartbeatTimer = setInterval(() => {
            this.ws?.send(JSON.stringify({ op: 1, d: this.seq }))
            // console.debug(`发送心跳 (seq: ${this.seq})`)
        }, this.heartbeat_interval)
    }

    /**
     * 安全重置连接
     */
    private safeResetConnection(delay: number = 0) {
        if (this.isShuttingDown) return

        console.warn(`安全重置连接${delay ? ` (${delay}ms后)` : ""}`)
        this.cleanupResources()

        setTimeout(() => {
            this.restoreLink = true
            this.init().catch(err => {
                console.error(`重连失败: ${(err as Error).message}`)
                this.safeResetConnection(10000)
            })
        }, delay)
    }

    /**
     * 清理资源
     */
    private cleanupResources() {
        // 清除定时器
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
        }

        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer)
            this.tokenRefreshTimer = null
        }

        if (this.connectionResetTimer) {
            clearTimeout(this.connectionResetTimer)
            this.connectionResetTimer = null
        }

        // 关闭WebSocket
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close()
            }
            this.ws = null
        }
    }

    /**
     * 定期重置连接（1小时）
     */
    private scheduleConnectionReset() {
        const RESET_INTERVAL = 60 * 60 * 1000 // 1小时

        this.connectionResetTimer = setTimeout(() => {
            console.info("定期连接重置")
            this.safeResetConnection()
        }, RESET_INTERVAL)

        console.debug(`已安排 ${RESET_INTERVAL / 60000} 分钟后重置连接`)
    }

    /**
     * 关闭机器人
     */
    async shutdown() {
        if (this.isShuttingDown) return
        this.isShuttingDown = true

        console.info("开始关闭机器人...")

        // 清理资源
        this.cleanupResources()

        console.info("机器人已安全关闭")
    }
}
