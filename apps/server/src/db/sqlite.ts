import { Database } from "bun:sqlite"

/**
 * @description 打开 SQLite 连接并应用统一 pragma：WAL 提升并发读写、外键约束生效、
 * 有界 busy_timeout 让并发写入等待而不是立刻报 SQLITE_BUSY。
 * @param path 数据库文件路径，`:memory:` 同样可用
 * @returns 已初始化的数据库连接
 */
export function openSqlite(path: string): Database {
    const db = new Database(path)
    db.exec("PRAGMA journal_mode = WAL")
    db.exec("PRAGMA foreign_keys = ON")
    db.exec("PRAGMA busy_timeout = 5000")
    return db
}
