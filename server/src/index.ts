import { Elysia } from "elysia"
import { staticPlugin } from "@elysiajs/static"
import { cors } from "@elysiajs/cors"
import { yogaPlugin } from "./db"

// load env
import "dotenv/config"

const app = new Elysia()
    .get("/", () => Bun.file("../dist/index.html"))
    .use(staticPlugin({ prefix: "/", assets: "../dist", indexHTML: false, alwaysStatic: true }))
    .use(
        cors({
            // origin: "*",
            maxAge: 3600,
            allowedHeaders: "*",
            exposeHeaders: "*",
        }),
    )
    .use(yogaPlugin())

app.listen(8887)
console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`)
