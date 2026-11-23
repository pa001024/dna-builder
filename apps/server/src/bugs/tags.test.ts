import { describe, expect, it } from "bun:test"
import { and, eq, isNull } from "drizzle-orm"
import * as schema from "../db/schema"
import {
    applyTagSet,
    composeBugTagSet,
    computeFixStage,
    getTagDefinition,
    labelNameForTagKey,
    tagKeyForLabelName,
    validateTagSet,
} from "./tags"
import { createTestDb, seedBug, seedUser } from "./test-helpers"
import { BugDomainError } from "./types"

const REPORTED_TAGS = ["fix.confirmed", "category.ui", "severity.s2", "type.game_bug", "source.bug_library"]

describe("TagRegistry", () => {
    it("内置字典提供 tagKey ↔ GitHub label 映射", () => {
        expect(getTagDefinition("fix.in_progress")?.canonicalLabel).toBe("fix:in-progress")
        expect(getTagDefinition("fix.in_progress")?.exclusiveGroup).toBe("fix_stage")
        expect(getTagDefinition("fix.in_progress")?.allowedSources).not.toContain("ai")
        expect(labelNameForTagKey("severity.s2")).toBe("severity:s2")
        expect(tagKeyForLabelName("fix:released")).toBe("fix.released")
        expect(tagKeyForLabelName("human/random-label")).toBeNull()
        expect(getTagDefinition("unknown.tag")).toBeUndefined()
    })

    it("computeFixStage 空集合规范成 unconfirmed", () => {
        expect(computeFixStage([])).toBe("fix.unconfirmed")
        expect(computeFixStage(["category.ui"])).toBe("fix.unconfirmed")
        expect(computeFixStage(["category.ui", "fix.verified"])).toBe("fix.verified")
    })

    it("validateTagSet 拒绝未注册标签与互斥组冲突", () => {
        expect(validateTagSet(["severity.s2", "category.ui", "severity.s2"])).toEqual(["category.ui", "severity.s2"])
        expect(() => validateTagSet(["not.registered"])).toThrow(BugDomainError)
        expect(() => validateTagSet(["fix.confirmed", "fix.released"])).toThrow(/互斥组/)
        expect(() => validateTagSet(["category.ui", "category.combat"])).toThrow(/互斥组/)
    })

    it("composeBugTagSet 组装确定性初始标签", () => {
        const tags = composeBugTagSet({ category: "ui", severity: "S2", needsInfo: false })
        expect(tags).toContain("category.ui")
        expect(tags).toContain("severity.s2")
        expect(tags).toContain("fix.unconfirmed")
        expect(tags).toContain("type.game_bug")

        const needsInfo = composeBugTagSet({ category: "other", severity: "U", needsInfo: true })
        expect(needsInfo).toContain("fix.needs_info")
        expect(needsInfo.some(tag => tag.startsWith("severity."))).toBe(false)
    })
})

describe("applyTagSet", () => {
    it("写入赋值、投影字段并按标签写 outbox", () => {
        const { db, sqlite } = createTestDb()
        try {
            const admin = seedUser(db, "admin-1", ["admin"])
            seedBug(db, { id: "bug-1", title: "结算页卡住" })

            const result = applyTagSet(db, { bugId: "bug-1", tagKeys: REPORTED_TAGS, actor: admin, expectedTagVersion: 0 })

            expect(result.added.sort()).toEqual([...REPORTED_TAGS].sort())
            expect(result.removed).toEqual([])
            expect(result.tagVersion).toBe(1)
            expect(result.fixStage).toBe("fix.confirmed")

            const bug = db.select().from(schema.bugs).where(eq(schema.bugs.id, "bug-1")).get()!
            expect(bug.tags).toEqual([...REPORTED_TAGS].sort())
            expect(bug.fixStage).toBe("fix.confirmed")
            expect(bug.fixStageSource).toBe("maintainer")
            expect(bug.tagVersion).toBe(1)
            expect(bug.version).toBe(2)

            const assignments = db
                .select()
                .from(schema.bugTagAssignments)
                .where(and(eq(schema.bugTagAssignments.bugId, "bug-1"), isNull(schema.bugTagAssignments.removedAt)))
                .all()
            expect(assignments).toHaveLength(REPORTED_TAGS.length)

            const outbox = db.select().from(schema.bugOutbox).all()
            expect(outbox).toHaveLength(REPORTED_TAGS.length)
            expect(outbox.every(row => row.operation === "label_add")).toBe(true)
            expect(outbox.map(row => row.targetMapping).sort()).toEqual(
                ["category:ui", "fix:confirmed", "severity:s2", "source:bug-library", "type:game-bug"].sort()
            )
        } finally {
            sqlite.close()
        }
    })

    it("替换互斥组标签时保留历史并写 label_remove", () => {
        const { db, sqlite } = createTestDb()
        try {
            const admin = seedUser(db, "admin-1", ["admin"])
            seedBug(db, { id: "bug-1" })
            applyTagSet(db, { bugId: "bug-1", tagKeys: REPORTED_TAGS, actor: admin })

            const nextTags = REPORTED_TAGS.map(tag => (tag === "fix.confirmed" ? "fix.released" : tag))
            const result = applyTagSet(db, { bugId: "bug-1", tagKeys: nextTags, actor: admin, expectedTagVersion: 1 })

            expect(result.added).toEqual(["fix.released"])
            expect(result.removed).toEqual(["fix.confirmed"])
            expect(result.tagVersion).toBe(2)

            const removed = db
                .select()
                .from(schema.bugTagAssignments)
                .where(and(eq(schema.bugTagAssignments.bugId, "bug-1"), eq(schema.bugTagAssignments.tagKey, "fix.confirmed")))
                .get()!
            expect(removed.removedAt).toBeNumber()

            const outbox = db.select().from(schema.bugOutbox).all()
            expect(outbox.some(row => row.operation === "label_remove" && row.targetMapping === "fix:confirmed")).toBe(true)
            expect(outbox.some(row => row.operation === "label_add" && row.targetMapping === "fix:released")).toBe(true)
        } finally {
            sqlite.close()
        }
    })

    it("权限与版本校验：普通用户 FORBIDDEN，过期版本 CONFLICT", () => {
        const { db, sqlite } = createTestDb()
        try {
            const admin = seedUser(db, "admin-1", ["admin"])
            const user = seedUser(db, "user-1")
            seedBug(db, { id: "bug-1" })

            expect(() => applyTagSet(db, { bugId: "bug-1", tagKeys: ["fix.confirmed"], actor: user })).toThrow(/维护者/)
            applyTagSet(db, { bugId: "bug-1", tagKeys: ["fix.confirmed"], actor: admin })
            expect(() => applyTagSet(db, { bugId: "bug-1", tagKeys: ["fix.released"], actor: admin, expectedTagVersion: 0 })).toThrow(
                /标签版本已变化/
            )
        } finally {
            sqlite.close()
        }
    })

    it("空集合把修复阶段归为 unconfirmed", () => {
        const { db, sqlite } = createTestDb()
        try {
            const admin = seedUser(db, "admin-1", ["admin"])
            seedBug(db, { id: "bug-1" })
            applyTagSet(db, { bugId: "bug-1", tagKeys: REPORTED_TAGS, actor: admin })

            const result = applyTagSet(db, { bugId: "bug-1", tagKeys: [], actor: admin })
            expect(result.fixStage).toBe("fix.unconfirmed")

            const bug = db.select().from(schema.bugs).where(eq(schema.bugs.id, "bug-1")).get()!
            expect(bug.tags).toEqual([])
            expect(bug.fixStage).toBe("fix.unconfirmed")
        } finally {
            sqlite.close()
        }
    })
})
