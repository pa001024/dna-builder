// 防呆: 必须最先 import, 在创建 data.db 等副作用发生前校验运行目录
import "./guard"

import { cors } from "@elysiajs/cors"
import { Elysia } from "elysia"
import { aiPlugin } from "./ai"
// import { cronPlugin } from "./cron"
import { yogaPlugin } from "./db"

// load env
import "dotenv/config"
import { apiPlugin } from "./api"
import { modApiPlugin } from "./api/mod"
import { raceLotteryPlugin } from "./api/race-lottery"

import { botPlugin } from "./bot"

const app = new Elysia()
    // 不处理文件请求 由nginx处理
    // .get("/", () => Bun.file("../dist/index.html"))
    // .use(staticPlugin({ prefix: "/", assets: "../dist", indexHTML: false, alwaysStatic: true }))
    // .use(cronPlugin())
    .use(apiPlugin())
    .use(modApiPlugin())
    .use(raceLotteryPlugin())
    .use(aiPlugin())
    .use(
        cors({
            // origin: "*",
            maxAge: 3600,
            allowedHeaders: "*",
            exposeHeaders: "*",
        })
    )
    .use(yogaPlugin())
    .use(botPlugin())

app.listen(8887)
console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`)
