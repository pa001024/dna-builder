import { Elysia } from "elysia"
import { Bot, ReceiverMode } from "qq-official-bot"
import { getCompiledCSS } from "../util/css"
import { commandManager } from "./commands"

export const botPlugin = () => {
    if (!process.env.QQ_BOT_TOKEN || !process.env.QQ_BOT_SECRET || !process.env.QQ_BOT_APP_ID) {
        console.warn("未配置QQ_BOT_TOKEN，跳过初始化机器人")
        return new Elysia()
    }
    const app = new Elysia({ name: "qq.bot", prefix: "/api" })
    app.get("/css", async () => {
        const css = await getCompiledCSS()
        return new Response(css, {
            headers: {
                "Content-Type": "text/css",
                "Cache-Control": "max-age=3600",
            },
        })
    })

    // 初始化机器人客户端
    initBot()
    return app
}

async function initBot() {
    // 初始化机器人客户端
    const bot = new Bot({
        appid: process.env.QQ_BOT_APP_ID!, // QQ 机器人的 App ID
        secret: process.env.QQ_BOT_SECRET!, // QQ 机器人的 App Secret
        sandbox: process.env.QQ_BOT_SANDBOX === "1", // 是否为沙箱环境
        removeAt: true, // 自动移除消息中的 @机器人
        logLevel: "info", // 日志级别
        maxRetry: 10, // 最大重连次数
        intents: [
            "GUILD_MESSAGES", // 频道消息事件
            "GUILD_MESSAGE_REACTIONS", // 频道消息表态事件
            "DIRECT_MESSAGE", // 频道私信事件
            "GROUP_AT_MESSAGE_CREATE", // 群聊@消息事件
            "C2C_MESSAGE_CREATE", // 私聊消息事件
        ],
        mode: ReceiverMode.WEBSOCKET, // WebSocket 连接模式
    })
    bot.on("message.group", async event => {
        const ret = await commandManager.executeCommand(event.message, {
            client: bot,
            message: event,
            content: event.raw_message,
            groupId: event.group_id,
            userId: event.sender.user_id,
            messageId: event.id,
            type: "group",
        })
        if (ret) {
            await event.reply(ret)
        }
    })
    bot.on("message.private", async event => {
        const ret = await commandManager.executeCommand(event.message, {
            client: bot,
            message: event,
            content: event.raw_message,
            userId: event.sender.user_id,
            messageId: event.id,
            type: "c2c",
        })
        if (ret) {
            await event.reply(ret)
        }
    })
    bot.on("message.guild", async event => {
        const ret = await commandManager.executeCommand(event.message, {
            client: bot,
            message: event,
            content: event.raw_message,
            channelId: event.channel_id,
            userId: event.sender.user_id,
            messageId: event.id,
            type: "guild",
        })
        if (ret) {
            await event.reply(ret)
        }
    })
    // 预加载HTML渲染器
    // await getRenderer()
    // 初始化机器人客户端
    try {
        await bot.start()
    } catch (error) {
        console.error(`初始化机器人失败: ${(error as Error).message}`)
        return
    }
}
