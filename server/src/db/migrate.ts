import { Database } from "bun:sqlite"
import { resolve } from "node:path"

import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"

// 防呆: 用 import.meta.dir 定位 server 目录下的 data.db 与 drizzle 迁移目录,
// 避免相对路径跟随 cwd 变化 (例如从仓库根目录运行时把 data.db 建到根目录)
const SERVER_DIR = resolve(import.meta.dir, "../..")
const DB_PATH = resolve(SERVER_DIR, "data.db")
const MIGRATIONS_DIR = resolve(SERVER_DIR, "drizzle")

export function migrateDatabase() {
    const sqlite = new Database(DB_PATH)
    const db = drizzle(sqlite)
    migrate(db, { migrationsFolder: MIGRATIONS_DIR })
}
migrateDatabase()
