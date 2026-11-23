import { and, eq, sql } from "drizzle-orm"
import * as schema from "../db/schema"
import { type Actor, actorRefOf, type BugDb } from "./types"

export const BUG_NOTIFICATION_TYPE = "bug"

export type BugNotificationKind =
    | "bug_created"
    | "bug_split"
    | "needs_info"
    | "issue_created"
    | "issue_failed"
    | "new_evidence"
    | "closed"
    | "reopened"
    | "fix_stage_changed"
    | "merge_reverted"
    | "tag_conflict"
    | "relation_added"
    | "relation_removed"

export type BugNotificationInput = {
    bugId: string
    kind: BugNotificationKind
    /** 领域事件 id；同一 eventId 对同一用户只产生一条通知。缺省时按 kind+bugId+时间生成。 */
    eventId?: string
    actor?: Actor
    payload?: Record<string, unknown>
    /** 显式收件人（用户 id）；默认取有效投票者与订阅者。 */
    recipientUserIds?: readonly string[]
    now?: number
}

/** 订阅者与有效投票者（去重，排除触发者本人）。 */
export function resolveBugRecipients(db: BugDb, bugId: string, excludeUserId?: string): string[] {
    const votes = db
        .select({ userId: schema.bugVoteIntents.userId })
        .from(schema.bugVoteIntents)
        .where(and(eq(schema.bugVoteIntents.originalBugId, bugId), eq(schema.bugVoteIntents.active, true)))
        .all()
    const subscriptions = db
        .select({ actorKey: schema.bugSubscriptions.actorKey })
        .from(schema.bugSubscriptions)
        .where(eq(schema.bugSubscriptions.bugId, bugId))
        .all()

    const recipients = new Set<string>()
    for (const vote of votes) recipients.add(vote.userId)
    for (const subscription of subscriptions) {
        if (subscription.actorKey.startsWith("user:")) recipients.add(subscription.actorKey.slice("user:".length))
    }
    if (excludeUserId) recipients.delete(excludeUserId)
    return [...recipients]
}

/**
 * @description 写站内通知：按 eventId + userId 去重，重复发射同一领域事件不会刷屏；
 * 匿名用户没有站内收件箱，不在这里产生记录。
 * @param db 数据库
 * @param input 事件与收件范围
 * @returns 实际写入条数
 */
export function emitBugNotification(db: BugDb, input: BugNotificationInput): number {
    const now = input.now ?? Date.now()
    const eventId = input.eventId ?? `${input.kind}:${input.bugId}:${now}`
    const excludeUserId = input.actor?.kind === "user" ? input.actor.userId : undefined
    const explicit = input.recipientUserIds ?? resolveBugRecipients(db, input.bugId, excludeUserId)
    const recipients = new Set(explicit)
    if (excludeUserId) recipients.delete(excludeUserId)

    const content = JSON.stringify({
        eventId,
        bugId: input.bugId,
        kind: input.kind,
        actor: input.actor ? actorRefOf(input.actor) : null,
        payload: input.payload ?? {},
    })

    let inserted = 0
    for (const userId of recipients) {
        const existing = db
            .select({ id: schema.notifications.id })
            .from(schema.notifications)
            .where(
                and(
                    eq(schema.notifications.userId, userId),
                    eq(schema.notifications.type, BUG_NOTIFICATION_TYPE),
                    sql`json_extract(${schema.notifications.content}, '$.eventId') = ${eventId}`
                )
            )
            .get()
        if (existing) continue

        db.insert(schema.notifications).values({ userId, type: BUG_NOTIFICATION_TYPE, content, isRead: 0, createdAt: now }).run()
        inserted++
    }
    return inserted
}
