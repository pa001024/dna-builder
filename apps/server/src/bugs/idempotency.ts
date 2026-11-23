import { and, eq } from "drizzle-orm"
import * as schema from "../db/schema"
import { type BugDb, BugDomainError, type BugTx } from "./types"

export type IdempotencyInput = {
    /** 身份键，如 `user:<id>` / `anon:<anonActorId>`。 */
    actorKey: string
    /** 操作名，如 `submit` / `addRevision`。 */
    op: string
    /** 客户端生成的随机幂等键。 */
    key: string
    /** 请求体摘要；同键不同摘要判为冲突。 */
    payloadHash: string
}

export type IdempotencyResult = {
    resultId: string
    /** true 表示命中既有记录，未执行 fn。 */
    replayed: boolean
}

const MAX_KEY_LENGTH = 200
const MAX_OP_LENGTH = 64

/**
 * @description 幂等执行：同 actor + op + key 且 payload 一致时复用既有结果并跳过 fn；
 * 同 key 不同 payload 直接抛 CONFLICT，不产生第二次业务效果。
 * @param db 数据库
 * @param input 幂等键四元组
 * @param fn 首次执行体，返回业务结果 id（如 submissionId）
 * @returns 结果 id 与是否重放
 */
export function withIdempotency(db: BugDb, input: IdempotencyInput, fn: (tx: BugTx) => string): IdempotencyResult {
    if (!input.actorKey || !input.op || !input.key) {
        throw new BugDomainError("VALIDATION_FAILED", "幂等键缺少必要字段")
    }
    if (input.key.length > MAX_KEY_LENGTH || input.op.length > MAX_OP_LENGTH) {
        throw new BugDomainError("VALIDATION_FAILED", "幂等键或操作名超出长度限制")
    }

    return db.transaction(tx => {
        const existing = tx
            .select()
            .from(schema.bugIdempotencyKeys)
            .where(
                and(
                    eq(schema.bugIdempotencyKeys.actorKey, input.actorKey),
                    eq(schema.bugIdempotencyKeys.op, input.op),
                    eq(schema.bugIdempotencyKeys.key, input.key)
                )
            )
            .get()

        if (existing) {
            if (existing.requestHash !== input.payloadHash) {
                throw new BugDomainError("CONFLICT", "幂等键已用于不同的请求内容")
            }
            return { resultId: existing.resultId ?? "", replayed: true }
        }

        const resultId = fn(tx)
        const inserted = tx
            .insert(schema.bugIdempotencyKeys)
            .values({ actorKey: input.actorKey, op: input.op, key: input.key, requestHash: input.payloadHash, resultId })
            .onConflictDoNothing()
            .returning({ resultId: schema.bugIdempotencyKeys.resultId })
            .all()

        if (!inserted.length) {
            const current = tx
                .select()
                .from(schema.bugIdempotencyKeys)
                .where(
                    and(
                        eq(schema.bugIdempotencyKeys.actorKey, input.actorKey),
                        eq(schema.bugIdempotencyKeys.op, input.op),
                        eq(schema.bugIdempotencyKeys.key, input.key)
                    )
                )
                .get()
            if (!current || current.requestHash !== input.payloadHash) {
                throw new BugDomainError("CONFLICT", "幂等键已用于不同的请求内容")
            }
            return { resultId: current.resultId ?? "", replayed: true }
        }

        return { resultId, replayed: false }
    })
}
