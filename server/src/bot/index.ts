import { Elysia } from "elysia"
import { getCompiledCSS } from "../util/css"
import { QQBotClient } from "./client"
import { getRenderer } from "./render"

export const botPlugin = () => {
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
    const botClient = new QQBotClient({
        appId: process.env.QQ_BOT_APP_ID || "",
        secret: process.env.QQ_BOT_SECRET || "",
        token: process.env.QQ_BOT_TOKEN,
        sandBox: process.env.QQ_BOT_SANDBOX === "1",
    })

    // 预加载HTML渲染器
    await getRenderer()
    // 初始化机器人客户端
    try {
        await botClient.init()
    } catch (error) {
        console.error(`初始化机器人失败: ${(error as Error).message}`)
        return
    }
}
