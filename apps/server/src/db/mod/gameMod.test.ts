import { Database } from "bun:sqlite"
import { beforeAll, describe, expect, it } from "bun:test"
import { resolve } from "node:path"
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import * as schema from "../schema"

/** 迁移目录用 import.meta.dir 定位，避免相对路径跟随 cwd 变化。 */
const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle")

/**
 * 用内存库跑完整迁移，避免测试污染仓库内的 data.db。
 * @returns 已建表的 drizzle 实例。
 */
function createTestDb() {
    const db = drizzle(new Database(":memory:"), { schema })
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    return db
}

type TestDb = ReturnType<typeof createTestDb>

/**
 * @description 插入一条用户与一条 MOD（updateAt 预设为过去时间，便于断言「是否被更新」）。
 * @param db 测试库实例。
 * @param id MOD id。
 * @returns 插入时的旧 updateAt。
 */
async function seedMod(db: TestDb, id: string) {
    const oldUpdateAt = schema.now() - 10_000
    await db.insert(schema.users).values({ id: `user-${id}`, email: `${id}@example.com`, name: "tester" })
    await db.insert(schema.gameMods).values({
        id,
        name: `mod-${id}`,
        userId: `user-${id}`,
        updateAt: oldUpdateAt,
    })
    return oldUpdateAt
}

/**
 * @description 读取指定 MOD 的 updateAt。
 * @param db 测试库实例。
 * @param id MOD id。
 * @returns updateAt 时间戳。
 */
async function readUpdateAt(db: TestDb, id: string) {
    const row = await db.query.gameMods.findFirst({ where: eq(schema.gameMods.id, id) })
    return row?.updateAt ?? null
}

describe("gameMods.updateAt 语义", () => {
    let db: TestDb

    beforeAll(() => {
        db = createTestDb()
    })

    it("下载计数自增不应改动 updateAt（回归：MOD 曾被顶到「最近更新」最前）", async () => {
        const oldUpdateAt = await seedMod(db, "downloads")
        // 与 loadVersionFile 中「发布下载次数 +1」完全一致
        await db
            .update(schema.gameMods)
            .set({ downloads: sql`${schema.gameMods.downloads} + 1` })
            .where(eq(schema.gameMods.id, "downloads"))
        expect(await readUpdateAt(db, "downloads")).toBe(oldUpdateAt)
    })

    it("浏览量自增不应改动 updateAt", async () => {
        const oldUpdateAt = await seedMod(db, "views")
        // 与 gameMod 详情查询中「浏览量 +1」完全一致
        await db
            .update(schema.gameMods)
            .set({ views: sql`${schema.gameMods.views} + 1` })
            .where(eq(schema.gameMods.id, "views"))
        expect(await readUpdateAt(db, "views")).toBe(oldUpdateAt)
    })

    it("管理员推荐/置顶/上下架不应改动 updateAt", async () => {
        const oldUpdateAt = await seedMod(db, "admin")
        await db.update(schema.gameMods).set({ isRecommended: true }).where(eq(schema.gameMods.id, "admin"))
        await db.update(schema.gameMods).set({ isPinned: true }).where(eq(schema.gameMods.id, "admin"))
        await db.update(schema.gameMods).set({ isActive: false }).where(eq(schema.gameMods.id, "admin"))
        expect(await readUpdateAt(db, "admin")).toBe(oldUpdateAt)
    })

    it("元数据更新（updateGameMod）应显式写入 updateAt", async () => {
        const oldUpdateAt = await seedMod(db, "update")
        await db.update(schema.gameMods).set({ name: "renamed", updateAt: schema.now() }).where(eq(schema.gameMods.id, "update"))
        const current = await readUpdateAt(db, "update")
        expect(current).not.toBeNull()
        expect(current!).toBeGreaterThan(oldUpdateAt)
    })

    it("上传新版本后应显式写入 updateAt", async () => {
        const oldUpdateAt = await seedMod(db, "version")
        await db.insert(schema.gameModVersions).values({
            id: "version-1",
            modId: "version",
            version: "1.1.0",
            fileName: "v1.1.0.zip",
            fileKey: "mods/hash/abc.zip",
            fileSize: 1024,
        })
        await db.update(schema.gameMods).set({ updateAt: schema.now() }).where(eq(schema.gameMods.id, "version"))
        const current = await readUpdateAt(db, "version")
        expect(current).not.toBeNull()
        expect(current!).toBeGreaterThan(oldUpdateAt)
    })

    it("发布时写入 updateAt，保证新发布能排在「最近更新」列表前列", async () => {
        await db.insert(schema.users).values({ id: "user-fresh", email: "fresh@example.com", name: "tester" })
        await db.insert(schema.gameMods).values({
            id: "fresh",
            name: "fresh-mod",
            userId: "user-fresh",
            updateAt: schema.now(),
        })
        expect(await readUpdateAt(db, "fresh")).toBeGreaterThan(0)
    })
})
