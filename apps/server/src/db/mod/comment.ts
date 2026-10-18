import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { desc, eq, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."

/** 评论内容长度上限。 */
const MAX_COMMENT_LENGTH = 500

/** 目标 ID 长度上限。 */
const MAX_TARGET_ID_LENGTH = 100

export const typeDefs = /* GraphQL */ `
    type Comment {
        id: String!
        targetId: String!
        content: String!
        createdAt: Float!
        user: User
    }

    type Mutation {
        createComment(targetId: String!, content: String!): Comment
        deleteComment(id: String!): Boolean
    }

    type Query {
        comments(targetId: String!, limit: Int = 50, offset: Int = 0): [Comment!]!
        commentsCount(targetId: String!): Int!
    }
`

export const resolvers = {
    Query: {
        comments: async (_parent, args, _context, info) => {
            const { targetId, limit = 50, offset = 0 } = args || {}
            if (!targetId || targetId.length > MAX_TARGET_ID_LENGTH) {
                throw createGraphQLError("评论目标 ID 不合法")
            }
            const rows = await db.query.comments.findMany({
                where: eq(schema.comments.targetId, targetId),
                orderBy: [desc(schema.comments.createdAt)],
                limit,
                offset,
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })
            return rows.map(row => ({ ...row, createdAt: row.createdAt ?? 0 }))
        },
        commentsCount: async (_parent, args) => {
            const { targetId } = args || {}
            if (!targetId || targetId.length > MAX_TARGET_ID_LENGTH) {
                throw createGraphQLError("评论目标 ID 不合法")
            }
            const [result] = await db
                .select({ count: sql<number>`count(*)` })
                .from(schema.comments)
                .where(eq(schema.comments.targetId, targetId))
            return result?.count || 0
        },
    },
    Mutation: {
        createComment: async (_parent, args, context, info) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { targetId, content } = args
            if (!targetId || targetId.length > MAX_TARGET_ID_LENGTH) {
                throw createGraphQLError("评论目标 ID 不合法")
            }
            if (!content || content.trim().length === 0) {
                throw createGraphQLError("评论内容不能为空")
            }
            if (content.length > MAX_COMMENT_LENGTH) {
                throw createGraphQLError(`评论不能超过 ${MAX_COMMENT_LENGTH} 个字符`)
            }

            const [comment] = await db
                .insert(schema.comments)
                .values({
                    targetId,
                    userId: context.user.id,
                    content: content.trim(),
                })
                .returning()

            if (!comment) {
                throw createGraphQLError("评论失败")
            }

            const result = await db.query.comments.findFirst({
                where: eq(schema.comments.id, comment.id),
                with: { user: getSubSelection(info, "user") ? true : undefined },
            })

            if (!result) {
                throw createGraphQLError("评论失败")
            }

            return { ...result, createdAt: result.createdAt ?? 0 }
        },
        deleteComment: async (_parent, args, context) => {
            if (!context.user) {
                throw createGraphQLError("需要登录")
            }

            const { id } = args
            const comment = await db.query.comments.findFirst({
                where: eq(schema.comments.id, id),
            })

            if (!comment) {
                throw createGraphQLError("评论不存在")
            }

            if (comment.userId !== context.user.id && !context.user.roles?.includes("admin")) {
                throw createGraphQLError("无权删除此评论")
            }

            await db.delete(schema.comments).where(eq(schema.comments.id, id))
            return true
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type CommentGQL = CreateMobius<typeof typeDefs>
