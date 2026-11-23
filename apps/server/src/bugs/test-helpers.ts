import { resolve } from "node:path"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import * as schema from "../db/schema"
import { openSqlite } from "../db/sqlite"
import type { Actor, BugStatus, BugVisibility } from "./types"

/** 迁移目录用 import.meta.dir 定位，避免相对路径跟随 cwd 变化。 */
const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle")

/** 内存库 + 完整迁移，测试之间互不污染。 */
export function createTestDb() {
    const sqlite = openSqlite(":memory:")
    const db = drizzle(sqlite, { schema })
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    return { db, sqlite }
}

export type TestDb = ReturnType<typeof createTestDb>["db"]

export const GAME_ID = "duet-night-abyss"

export const workerActor: Actor = { kind: "worker", workerId: "worker-1" }
export const anonymousActor: Actor = { kind: "anonymous" }

export function userActor(userId: string, roles: string[] = []): Actor {
    return { kind: "user", userId, roles }
}

export function receiptActor(receiptToken: string): Actor {
    return { kind: "receipt", receiptToken }
}

/** 插入用户并返回其 Actor；roles 与 JWT 一样按数组处理。 */
export function seedUser(db: TestDb, id: string, roles: string[] = []): Actor {
    db.insert(schema.users)
        .values({ id, email: `${id}@example.com`, name: id, roles: roles.join(",") })
        .run()
    return userActor(id, roles)
}

export type SeedBugInput = Partial<Omit<typeof schema.bugs.$inferInsert, "id" | "displayKey">> & {
    id: string
    displayKey?: string
}

/** 插入一条 Bug 并返回落库行。 */
export function seedBug(db: TestDb, input: SeedBugInput): typeof schema.bugs.$inferSelect {
    const displayKey = input.displayKey ?? `BUG-${input.id}`
    db.insert(schema.bugs)
        .values({ gameId: GAME_ID, title: "默认标题", summary: "默认摘要", ...input, displayKey })
        .run()
    const row = db.select().from(schema.bugs).where(eq(schema.bugs.id, input.id)).get()
    if (!row) throw new Error("seedBug 失败")
    return row
}

export function seedVisibilityBug(db: TestDb, id: string, title: string, visibility: BugVisibility, status: BugStatus = "untriaged"): void {
    seedBug(db, { id, displayKey: `BUG-${id}`, title, summary: `${title} 的摘要`, visibility, status })
}

/** 插入 Submission 与指定 revision，返回版本标识。 */
export function seedSubmission(
    db: TestDb,
    input: { id?: string; gameId?: string; text?: string | null; revision?: number; anonymous?: boolean } = {}
): { submissionId: string; revision: number; versionId: string } {
    const submissionId = input.id ?? schema.id()
    const revision = input.revision ?? 1
    const text = input.text ?? null
    db.insert(schema.bugSubmissions)
        .values({
            id: submissionId,
            gameId: input.gameId ?? GAME_ID,
            anonActorId: input.anonymous === false ? null : `anon_${submissionId}`,
            state: "processing",
            currentRevision: revision,
        })
        .run()
    db.insert(schema.bugSubmissionVersions)
        .values({
            submissionId,
            revision,
            rawTextPrivate: text,
            contentSha256: "seed-content-sha",
            publicationPolicy: "github_safe",
        })
        .run()
    return { submissionId, revision, versionId: `${submissionId}:${revision}` }
}

/** 插入一张尚未绑定反馈的图片资产。 */
export function seedUnattachedAsset(db: TestDb, id: string, sha = `sha-${id}`): void {
    db.insert(schema.bugAssets)
        .values({
            id,
            submissionVersionId: "unattached",
            privateObjectKey: `bug-assets/private/${id}.png`,
            sha256: sha,
            actualMime: "image/png",
            bytes: 1024,
            publicationPolicy: "github_safe",
        })
        .run()
}
