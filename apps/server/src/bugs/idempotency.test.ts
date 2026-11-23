import { describe, expect, it } from "bun:test"
import * as schema from "../db/schema"
import { withIdempotency } from "./idempotency"
import { createTestDb } from "./test-helpers"
import { BugDomainError } from "./types"

const base = { actorKey: "user:u1", op: "submit", key: "key-1", payloadHash: "hash-1" }

describe("幂等执行", () => {
    it("同 key + 同 payload 只执行一次并复用结果", () => {
        const { db, sqlite } = createTestDb()
        try {
            let calls = 0
            const first = withIdempotency(db, base, () => {
                calls++
                return "sub-1"
            })
            const second = withIdempotency(db, base, () => {
                calls++
                return "sub-2"
            })

            expect(first).toEqual({ resultId: "sub-1", replayed: false })
            expect(second).toEqual({ resultId: "sub-1", replayed: true })
            expect(calls).toBe(1)
            expect(db.select().from(schema.bugIdempotencyKeys).all()).toHaveLength(1)
        } finally {
            sqlite.close()
        }
    })

    it("同 key + 不同 payload 抛 CONFLICT 且不执行", () => {
        const { db, sqlite } = createTestDb()
        try {
            withIdempotency(db, base, () => "sub-1")
            let calls = 0
            expect(() =>
                withIdempotency(db, { ...base, payloadHash: "hash-2" }, () => {
                    calls++
                    return "sub-2"
                })
            ).toThrow(BugDomainError)
            expect(calls).toBe(0)
        } finally {
            sqlite.close()
        }
    })

    it("首次执行失败时事务回滚，不占用幂等键", () => {
        const { db, sqlite } = createTestDb()
        try {
            expect(() =>
                withIdempotency(db, base, () => {
                    throw new Error("boom")
                })
            ).toThrow(/boom/)
            expect(db.select().from(schema.bugIdempotencyKeys).all()).toHaveLength(0)

            const retry = withIdempotency(db, base, () => "sub-1")
            expect(retry.resultId).toBe("sub-1")
        } finally {
            sqlite.close()
        }
    })

    it("不同 actor / op 分区互不影响，并拒绝非法键", () => {
        const { db, sqlite } = createTestDb()
        try {
            expect(withIdempotency(db, base, () => "sub-a").resultId).toBe("sub-a")
            expect(withIdempotency(db, { ...base, actorKey: "user:u2" }, () => "sub-b").resultId).toBe("sub-b")
            expect(withIdempotency(db, { ...base, op: "addRevision" }, () => "sub-c").resultId).toBe("sub-c")

            expect(() => withIdempotency(db, { ...base, key: "" }, () => "x")).toThrow(BugDomainError)
            expect(() => withIdempotency(db, { ...base, key: "x".repeat(201) }, () => "x")).toThrow(BugDomainError)
        } finally {
            sqlite.close()
        }
    })
})
