import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { asc, eq, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"

/**
 * 校验当前用户是否为管理员。
 * @param context GraphQL 上下文
 * @throws 无管理员权限时抛出业务错误
 */
function assertAdmin(context: Context) {
    if (!context.user?.roles?.includes("admin")) {
        throw createGraphQLError("无权限")
    }
}

/**
 * 统一补齐脚本分类字段的默认值，避免 GraphQL 返回 nullable 文本。
 * @param category 数据库返回的脚本分类记录
 * @returns 归一化后的脚本分类对象
 */
function normalizeScriptCategory(category: typeof schema.scriptCategories.$inferSelect) {
    return {
        ...category,
        description: category.description ?? "",
        createdAt: category.createdAt ?? "",
        updateAt: category.updateAt ?? "",
    }
}

export const typeDefs = /* GraphQL */ `
    type ScriptCategory {
        id: String!
        name: String!
        description: String
        createdAt: String!
        updateAt: String!
    }

    input ScriptCategoryInput {
        name: String!
        description: String
    }

    type Query {
        scriptCategories: [ScriptCategory!]!
        scriptCategory(id: String!): ScriptCategory
        scriptCategoriesCount: Int!
    }

    type Mutation {
        createScriptCategory(input: ScriptCategoryInput!): ScriptCategory
        updateScriptCategory(id: String!, input: ScriptCategoryInput!): ScriptCategory
        deleteScriptCategory(id: String!): Boolean
    }
`

export const resolvers = {
    Query: {
        scriptCategories: async () => {
            const categories = await db.query.scriptCategories.findMany({
                orderBy: [asc(schema.scriptCategories.name)],
            })
            return categories.map(normalizeScriptCategory)
        },
        scriptCategory: async (_parent, { id }) => {
            const category = await db.query.scriptCategories.findFirst({
                where: eq(schema.scriptCategories.id, id),
            })

            if (!category) {
                throw createGraphQLError("脚本分类不存在")
            }

            return normalizeScriptCategory(category)
        },
        scriptCategoriesCount: async () => {
            const [result] = await db.select({ count: sql<number>`count(*)` }).from(schema.scriptCategories)
            return result?.count || 0
        },
    },
    Mutation: {
        createScriptCategory: async (_parent, { input }, context) => {
            assertAdmin(context)

            const name = input.name.trim()
            if (!name) {
                throw createGraphQLError("分类名称不能为空")
            }

            const existing = await db.query.scriptCategories.findFirst({
                where: eq(schema.scriptCategories.name, name),
            })
            if (existing) {
                throw createGraphQLError("脚本分类已存在")
            }

            const [category] = await db
                .insert(schema.scriptCategories)
                .values({
                    name,
                    description: input.description?.trim() || null,
                })
                .returning()

            if (!category) {
                throw createGraphQLError("创建脚本分类失败")
            }

            return normalizeScriptCategory(category)
        },
        updateScriptCategory: async (_parent, { id, input }, context) => {
            assertAdmin(context)

            const category = await db.query.scriptCategories.findFirst({
                where: eq(schema.scriptCategories.id, id),
            })
            if (!category) {
                throw createGraphQLError("脚本分类不存在")
            }

            const nextName = input.name.trim()
            if (!nextName) {
                throw createGraphQLError("分类名称不能为空")
            }

            const duplicated = await db.query.scriptCategories.findFirst({
                where: eq(schema.scriptCategories.name, nextName),
            })
            if (duplicated && duplicated.id !== id) {
                throw createGraphQLError("脚本分类已存在")
            }

            const [updated] = await db
                .update(schema.scriptCategories)
                .set({
                    name: nextName,
                    description: input.description?.trim() || null,
                })
                .where(eq(schema.scriptCategories.id, id))
                .returning()

            if (!updated) {
                throw createGraphQLError("更新脚本分类失败")
            }

            return normalizeScriptCategory(updated)
        },
        deleteScriptCategory: async (_parent, { id }, context) => {
            assertAdmin(context)

            const category = await db.query.scriptCategories.findFirst({
                where: eq(schema.scriptCategories.id, id),
            })
            if (!category) {
                throw createGraphQLError("脚本分类不存在")
            }

            await db.delete(schema.scriptCategories).where(eq(schema.scriptCategories.id, id))
            return true
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
