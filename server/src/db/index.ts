import { Database } from "bun:sqlite"
import { resolve } from "node:path"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "./schema"

// import { PrismaClient } from "@prisma/client/edge"
// export const db = new PrismaClient()

// 防呆: 用 import.meta.dir 定位 server 目录下的 data.db,
// 避免相对路径跟随 cwd 变化 (例如从仓库根目录跑测试时把 data.db 建到根目录)
const DB_PATH = resolve(import.meta.dir, "../../data.db")

export const db = drizzle(new Database(DB_PATH), {
    schema,
})

export { yogaPlugin } from "./yoga"
export { schema }
