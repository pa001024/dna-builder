import { describe, expect, it } from "bun:test"
import {
    canAddFeedback,
    canAdminEdit,
    canEditComment,
    canSetTrackingTags,
    canSubmit,
    canViewPrivate,
    canVote,
    hasRole,
    isMaintainer,
} from "./permissions"
import { anonymousActor, receiptActor, userActor, workerActor } from "./test-helpers"

const guest = anonymousActor
const receipt = receiptActor("a".repeat(43))
const user = userActor("u1")
const other = userActor("u2")
const maintainer = userActor("admin-1", ["admin", "user"])

describe("权限矩阵（spec §5.2）", () => {
    it("新提交：游客/回执/登录可，集成 worker 不可", () => {
        expect(canSubmit(guest)).toBe(true)
        expect(canSubmit(receipt)).toBe(true)
        expect(canSubmit(user)).toBe(true)
        expect(canSubmit(maintainer)).toBe(true)
        expect(canSubmit(workerActor)).toBe(false)
    })

    it("投票只允许登录用户，匿名回执不是投票凭据", () => {
        expect(canVote(guest)).toBe(false)
        expect(canVote(receipt)).toBe(false)
        expect(canVote(user)).toBe(true)
        expect(canVote(workerActor)).toBe(false)
    })

    it("评论编辑：本站作者或有效回执可改，GitHub 原生评论只读", () => {
        const local: Parameters<typeof canEditComment>[1] = { source: "local", sourceActorId: "user:u1" }
        expect(canEditComment(user, local)).toBe(true)
        expect(canEditComment(other, local)).toBe(false)
        expect(canEditComment(maintainer, local)).toBe(false)
        expect(canEditComment(guest, local)).toBe(false)

        const anonLocal = { source: "local" as const, sourceActorId: "anon:anon-1" }
        expect(canEditComment(receipt, anonLocal, "anon:anon-1")).toBe(true)
        expect(canEditComment(receipt, anonLocal, "anon:other")).toBe(false)
        expect(canEditComment(receipt, anonLocal)).toBe(false)

        expect(canEditComment(user, { source: "github", sourceActorId: "user:u1" })).toBe(false)
    })

    it("管理动作与跟踪标签仅维护者", () => {
        expect(isMaintainer(maintainer)).toBe(true)
        expect(isMaintainer(user)).toBe(false)
        expect(hasRole(maintainer, "admin")).toBe(true)
        expect(hasRole(maintainer, "ad")).toBe(false)
        expect(canAdminEdit(maintainer)).toBe(true)
        expect(canAdminEdit(user)).toBe(false)
        expect(canSetTrackingTags(maintainer)).toBe(true)
        expect(canSetTrackingTags(user)).toBe(false)
        expect(canSetTrackingTags(receipt)).toBe(false)
    })

    it("私有反馈可见性：本人/有效回执/审计维护者", () => {
        const submission = { userId: "u1", anonActorId: null }
        expect(canViewPrivate(user, submission)).toBe(true)
        expect(canViewPrivate(other, submission)).toBe(false)
        expect(canViewPrivate(guest, submission)).toBe(false)
        expect(canViewPrivate(workerActor, submission)).toBe(false)
        expect(canViewPrivate(maintainer, submission)).toBe(true)

        const anonSubmission = { userId: null, anonActorId: "anon-1" }
        expect(canViewPrivate(receipt, anonSubmission, "anon:anon-1")).toBe(true)
        expect(canViewPrivate(receipt, anonSubmission, "anon:anon-2")).toBe(false)
        expect(canViewPrivate(receipt, anonSubmission)).toBe(false)
        expect(canViewPrivate(user, anonSubmission)).toBe(false)
    })

    it("再次反馈：worker 不冒充用户", () => {
        expect(canAddFeedback(guest)).toBe(true)
        expect(canAddFeedback(receipt)).toBe(true)
        expect(canAddFeedback(user)).toBe(true)
        expect(canAddFeedback(workerActor)).toBe(false)
    })
})
