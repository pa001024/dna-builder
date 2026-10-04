// 防呆: 必须最先 import, 在创建 data.db 等副作用发生前校验运行目录
import "./guard"

import { cors } from "@elysiajs/cors"
import { Elysia } from "elysia"
import { aiPlugin } from "./ai"
// import { cronPlugin } from "./cron"
import { yogaPlugin } from "./db"

// load env
import "dotenv/config"
import { scheduleAiLogRetention } from "./ai-log-store"
import { apiPlugin } from "./api"
import { aiLogPlugin } from "./api/ai-log"
import { installPlugin } from "./api/install"
import { modApiPlugin } from "./api/mod"
import { syncDataPackDiffBackendsOnce } from "./api/package-diff"
import { raceLotteryPlugin } from "./api/race-lottery"
import { ragPlugin } from "./api/rag"
import { botPlugin } from "./bot"
import { requestIndexBuild, resolveAllowedLangs, warmCurrentFingerprints } from "./rag/build"
import { startRagProgressUi, stopRagProgressUi } from "./rag/progress-ui"
import { warmVectorIndex } from "./rag/search"
import { getActiveBackends } from "./util/object-storage"

const app = new Elysia()
    // 不处理文件请求 由nginx处理
    // .get("/", () => Bun.file("../dist/index.html"))
    // .use(staticPlugin({ prefix: "/", assets: "../dist", indexHTML: false, alwaysStatic: true }))
    // .use(cronPlugin())
    .use(apiPlugin())
    .use(installPlugin())
    .use(modApiPlugin())
    .use(raceLotteryPlugin())
    .use(aiPlugin())
    .use(aiLogPlugin())
    .use(ragPlugin())
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

// 监听端口：PORT 可覆盖（默认 8887）
const port = Number(process.env.PORT ?? "") || 8887

app.listen(port)
console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`)

// 双写冗余依赖 OSS 与 R2 两端；只配一端时服务端上传会静默退化为单源，这里显式告警
const storageBackends = getActiveBackends()
if (storageBackends.length < 2) {
    console.warn(
        `⚠️ 对象存储仅配置了 ${storageBackends.map(backend => backend.label).join(" / ") || "0"} 端（需同时配置 OSS_* 与 R2_*），服务端上传将退化为单源`
    )
}

// 启动后校验并补齐差分在各存储端的缺失副本（不阻塞启动，失败只记日志）
void syncDataPackDiffBackendsOnce()

// RAG 索引构建的固定进度区域（仅交互式终端；日志照旧在区域上方滚动）
startRagProgressUi()

// 启动参数 `bun sv -- --index-all`：预热完成后把白名单内的语言全部排入后台构建队列
// （已最新的语言只做指纹比对，不重新嵌入）
const indexAll = process.argv.includes("--index-all")

// 启动预热：算一次各语言的当前数据指纹并缓存；索引落后的语言自动排队重建
void warmCurrentFingerprints()
    .then(async () => {
        // 指纹就绪后空跑一次检索：HNSW 索引首次查询要从磁盘载入（约 85ms），之后约 7ms
        await warmVectorIndex().catch(error =>
            console.warn(`[rag] 向量索引预热失败：${error instanceof Error ? error.message : String(error)}`)
        )

        if (!indexAll) {
            return
        }

        console.log(`[rag] --index-all：语言白名单 ${resolveAllowedLangs().join(" / ")} 已排入后台构建队列（单飞串行，日志按语言输出）`)

        for (const lang of resolveAllowedLangs()) {
            requestIndexBuild(lang, "启动参数 --index-all")
        }
    })
    .catch(error => console.error("[rag] 启动预热失败", error))

process.on("beforeExit", stopRagProgressUi)

// AI 调用日志的保留期清理（未配置 AI_LOG_RETENTION_DAYS 时不做任何事）
scheduleAiLogRetention()
