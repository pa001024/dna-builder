import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "bun:test"

/**
 * 迁移交付守卫：journal 里每一条登记都必须有对应 SQL 与 snapshot。
 * 防止只提交 journal + 部分迁移，导致 migrate 断链（U140 复审 P1）。
 */
const DRIZZLE_DIR = resolve(import.meta.dir, "../../drizzle")

interface JournalEntry {
    idx: number
    tag: string
}

describe("drizzle 迁移交付完整性", () => {
    it("journal 登记的每个迁移都有 SQL 与 snapshot", () => {
        const journal = JSON.parse(readFileSync(resolve(DRIZZLE_DIR, "meta/_journal.json"), "utf8")) as { entries: JournalEntry[] }
        const missing: string[] = []
        for (const entry of journal.entries) {
            const sqlPath = resolve(DRIZZLE_DIR, `${entry.tag}.sql`)
            const snapshotPath = resolve(DRIZZLE_DIR, "meta", `${String(entry.idx).padStart(4, "0")}_snapshot.json`)
            if (!existsSync(sqlPath)) missing.push(sqlPath)
            if (!existsSync(snapshotPath)) missing.push(snapshotPath)
        }

        expect(missing).toEqual([])
    })
})
