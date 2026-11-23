import type { Actor, BugDiscussionSource } from "./types"

/** 维护者角色名；JWT 角色是数组，按元素精确匹配而不是子串。 */
const MAINTAINER_ROLES = ["admin", "maintainer"] as const

/** 讨论条目的编辑判定输入。 */
export type CommentPermissionTarget = {
    source: BugDiscussionSource
    /** 本站 `user:<id>` / 匿名 `anon:<anonActorId>`；GitHub 来源是外部标识。 */
    sourceActorId: string | null
}

/** Submission 归属判定输入。 */
export type SubmissionOwnership = {
    userId: string | null
    anonActorId: string | null
}

/**
 * @description 判断登录用户是否具备指定角色。
 * @param actor 身份
 * @param role 角色名
 * @returns 是否具备该角色
 */
export function hasRole(actor: Actor, role: string): boolean {
    return actor.kind === "user" && actor.roles.includes(role)
}

/** 是否为维护者（admin / maintainer）。 */
export function isMaintainer(actor: Actor): boolean {
    return actor.kind === "user" && MAINTAINER_ROLES.some(role => actor.roles.includes(role))
}

/** 新提交：游客（由上层限流）与回执持有者可提交，集成 worker 不冒充用户。 */
export function canSubmit(actor: Actor): boolean {
    return actor.kind === "user" || actor.kind === "receipt" || actor.kind === "anonymous"
}

/** 投票：只有登录用户，匿名回执不是投票凭据（spec §1.8 / §14.3）。 */
export function canVote(actor: Actor): boolean {
    return actor.kind === "user"
}

/**
 * @description 编辑本站评论：只有原作者或已解析出归属的匿名回执持有者；
 * GitHub 原生评论本站只读，维护者也走本地屏蔽而不是改写外部原文。
 * @param actor 请求身份
 * @param comment 评论来源与作者键
 * @param resolvedActorKey 回执身份解析出的归属键（`anon:<anonActorId>`）
 * @returns 是否可编辑
 */
export function canEditComment(actor: Actor, comment: CommentPermissionTarget, resolvedActorKey?: string | null): boolean {
    if (comment.source !== "local") return false
    if (actor.kind === "user") return comment.sourceActorId === `user:${actor.userId}`
    if (actor.kind === "receipt") return Boolean(resolvedActorKey) && comment.sourceActorId === resolvedActorKey
    return false
}

/** 管理纠错（分类 / 严重程度 / 合并 / 重跑）：仅维护者。 */
export function canAdminEdit(actor: Actor): boolean {
    return isMaintainer(actor)
}

/** 设置跟踪标签：仅维护者；普通用户与 AI 只能提供证据或建议。 */
export function canSetTrackingTags(actor: Actor): boolean {
    return isMaintainer(actor)
}

/**
 * @description 读取原始私有反馈：登录作者本人、已解析的回执持有者或审计后的维护者。
 * @param actor 请求身份
 * @param submission 归属信息
 * @param resolvedActorKey 回执身份解析出的归属键（必须是校验 token 摘要后得到）
 * @returns 是否可见
 */
export function canViewPrivate(actor: Actor, submission: SubmissionOwnership, resolvedActorKey?: string | null): boolean {
    if (isMaintainer(actor)) return true
    if (actor.kind === "user") return Boolean(submission.userId) && submission.userId === actor.userId
    if (actor.kind === "receipt") {
        return Boolean(resolvedActorKey && submission.anonActorId) && resolvedActorKey === `anon:${submission.anonActorId}`
    }
    return false
}

/** 在关联 Bug 内评论 / 再次反馈：游客可新建反馈，回执持有者限其关联范围。 */
export function canAddFeedback(actor: Actor): boolean {
    return actor.kind !== "worker"
}
