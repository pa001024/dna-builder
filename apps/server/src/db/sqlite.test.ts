import type { Database } from "bun:sqlite"
import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openSqlite } from "./sqlite"

/** 读取单行 PRAGMA 结果。 */
function readPragma(db: Database, sql: string): Record<string, unknown> {
    return db.query(sql).get() as Record<string, unknown>
}

describe("openSqlite", () => {
    it("文件库启用 WAL、外键与有界 busy_timeout", () => {
        const dir = mkdtempSync(join(tmpdir(), "bug-intake-sqlite-"))
        const db = openSqlite(join(dir, "test.db"))
        try {
            expect(readPragma(db, "PRAGMA journal_mode")).toEqual({ journal_mode: "wal" })
            expect(readPragma(db, "PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 })
            expect(readPragma(db, "PRAGMA busy_timeout")).toEqual({ timeout: 5000 })
        } finally {
            db.close()
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it(":memory: 走同一入口，外键约束真实生效", () => {
        const db = openSqlite(":memory:")
        try {
            expect(readPragma(db, "PRAGMA foreign_keys")).toEqual({ foreign_keys: 1 })
            expect(readPragma(db, "PRAGMA busy_timeout")).toEqual({ timeout: 5000 })

            db.exec("CREATE TABLE parent (id TEXT PRIMARY KEY)")
            db.exec("CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id))")
            expect(() => db.exec("INSERT INTO child (id, parent_id) VALUES ('c1', 'missing')")).toThrow()
        } finally {
            db.close()
        }
    })
})
