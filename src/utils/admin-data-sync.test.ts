import type { DNACommentListResponse, DNARoleEntity } from "dna-api"
import { describe, expect, it, vi } from "vitest"
import { scanAbyssPostComments } from "./admin-data-sync"

/**
 * @description 创建评论分页测试数据。
 * @param commentIds 评论 ID 与用户 ID。
 * @param hasNext 是否有下一页。
 * @returns 评论分页数据。
 */
function createCommentPage(commentIds: Array<[number, string]>, hasNext = 0): DNACommentListResponse {
    return {
        hasNext,
        postCommentList: commentIds.map(([commentId, userId]) => ({ commentId, userId }) as never),
    }
}

describe("scanAbyssPostComments", () => {
    it("应该分页扫描、跳过已处理评论并按用户去重上传", async () => {
        const processed = new Set([1])
        const fetchRoleInfo = vi.fn(async userId => ({ userId }) as unknown as DNARoleEntity)
        const submitRoleInfo = vi.fn(async () => "uploaded" as const)

        const summary = await scanAbyssPostComments({
            fetchComments: async pageIndex =>
                pageIndex === 1
                    ? createCommentPage(
                          [
                              [1, "old"],
                              [2, "user-a"],
                          ],
                          1
                      )
                    : createCommentPage([
                          [3, "user-a"],
                          [4, "user-b"],
                      ]),
            fetchRoleInfo,
            submitRoleInfo,
            isProcessed: commentId => processed.has(commentId),
            markProcessed: commentId => processed.add(commentId),
        })

        expect(summary).toEqual({ total: 4, uploaded: 2, skipped: 2, failed: 0 })
        expect(fetchRoleInfo).toHaveBeenCalledTimes(2)
        expect(submitRoleInfo).toHaveBeenCalledTimes(2)
        expect(processed).toEqual(new Set([1, 2, 3, 4]))
    })

    it("应该保留失败评论以便下次重试", async () => {
        const processed = new Set<number>()

        const summary = await scanAbyssPostComments({
            fetchComments: async () => createCommentPage([[10, "user-a"]]),
            fetchRoleInfo: async () => ({}) as DNARoleEntity,
            submitRoleInfo: async () => {
                throw new Error("上传失败")
            },
            isProcessed: commentId => processed.has(commentId),
            markProcessed: commentId => processed.add(commentId),
        })

        expect(summary).toEqual({ total: 1, uploaded: 0, skipped: 0, failed: 1 })
        expect(processed.size).toBe(0)
    })
})
