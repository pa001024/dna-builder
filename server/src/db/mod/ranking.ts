import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { asc, desc, eq } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { getSubSelection } from "."

export const typeDefs = /* GraphQL */ `
    type RankingList {
        id: String!
        name: String!
        desc: String
        createdAt: Float!
        updateAt: Float!
        items: [RankingListItem!]!
    }

    type RankingListItem {
        id: String!
        rankingListId: String!
        charId: Int!
        buildId: String!
        sortOrder: Int!
        createdAt: Float!
        updateAt: Float!
        build: Build
    }

    type Query {
        rankingLists: [RankingList!]!
        rankingList(id: String!): RankingList
        rankingListItems(rankingListId: String!): [RankingListItem!]!
    }

    input RankingListItemInput {
        charId: Int!
        buildId: String!
        sortOrder: Int
    }

    input RankingListInput {
        name: String!
        desc: String
        items: [RankingListItemInput!]!
    }

    type Mutation {
        createRankingList(input: RankingListInput!): RankingList
        updateRankingList(id: String!, input: RankingListInput!): RankingList
        deleteRankingList(id: String!): Boolean
    }
`

function normalizeListItem(item: any) {
    return {
        ...item,
        sortOrder: item.sortOrder ?? 0,
        createdAt: item.createdAt ?? 0,
        updateAt: item.updateAt ?? 0,
    }
}

export const resolvers = {
    Query: {
        rankingLists: async (_parent, _args, _context, info) => {
            const result = await db.query.rankingLists.findMany({
                orderBy: [desc(schema.rankingLists.updateAt), desc(schema.rankingLists.createdAt)],
                with: getSubSelection(info, "items")
                    ? {
                          items: {
                              with: getSubSelection(info, "items.build")
                                  ? {
                                        build: {
                                            with: getSubSelection(info, "items.build.user") ? { user: true } : undefined,
                                        },
                                    }
                                  : undefined,
                          },
                      }
                    : undefined,
            })

            return result.map(list => ({
                ...list,
                createdAt: list.createdAt ?? 0,
                updateAt: list.updateAt ?? 0,
                items: (list.items || []).map(normalizeListItem),
            }))
        },
        rankingList: async (_parent, args, _context, info) => {
            const list = await db.query.rankingLists.findFirst({
                where: eq(schema.rankingLists.id, args.id),
                with: getSubSelection(info, "items")
                    ? {
                          items: {
                              with: getSubSelection(info, "items.build")
                                  ? {
                                        build: {
                                            with: getSubSelection(info, "items.build.user") ? { user: true } : undefined,
                                        },
                                    }
                                  : undefined,
                          },
                      }
                    : undefined,
            })

            if (!list) return null

            return {
                ...list,
                createdAt: list.createdAt ?? 0,
                updateAt: list.updateAt ?? 0,
                items: (list.items || []).map(normalizeListItem),
            }
        },
        rankingListItems: async (_parent, args, _context, info) => {
            const items = await db.query.rankingListItems.findMany({
                where: eq(schema.rankingListItems.rankingListId, args.rankingListId),
                orderBy: [asc(schema.rankingListItems.sortOrder), asc(schema.rankingListItems.createdAt)],
                with: getSubSelection(info, "build")
                    ? {
                          build: {
                              with: getSubSelection(info, "build.user") ? { user: true } : undefined,
                          },
                      }
                    : undefined,
            })

            return items.map(item => ({
                ...normalizeListItem(item),
            }))
        },
    },
    Mutation: {
        createRankingList: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("Unauthorized: Admin role required")
            }

            const { input } = args
            return await db.transaction(async tx => {
                const [list] = await tx
                    .insert(schema.rankingLists)
                    .values({
                        name: input.name,
                        desc: input.desc || "",
                    })
                    .returning()

                if (!list) {
                    throw createGraphQLError("创建失败")
                }

                if (input.items.length > 0) {
                    await tx.insert(schema.rankingListItems).values(
                        input.items.map((item, index) => ({
                            rankingListId: list.id,
                            charId: item.charId,
                            buildId: item.buildId,
                            sortOrder: item.sortOrder ?? index,
                        }))
                    )
                }

                const result = await tx.query.rankingLists.findFirst({
                    where: eq(schema.rankingLists.id, list.id),
                    with: getSubSelection(info, "items")
                        ? {
                              items: {
                                  with: getSubSelection(info, "items.build")
                                      ? {
                                            build: {
                                                with: getSubSelection(info, "items.build.user") ? { user: true } : undefined,
                                            },
                                        }
                                      : undefined,
                              },
                          }
                        : undefined,
                })

                if (!result) {
                    throw createGraphQLError("创建失败")
                }

                return {
                    ...result,
                    createdAt: result.createdAt ?? 0,
                    updateAt: result.updateAt ?? 0,
                    items: (result.items || []).map(normalizeListItem),
                }
            })
        },
        updateRankingList: async (_parent, args, context, info) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("Unauthorized: Admin role required")
            }

            const { id, input } = args
            return await db.transaction(async tx => {
                const existing = await tx.query.rankingLists.findFirst({
                    where: eq(schema.rankingLists.id, id),
                })
                if (!existing) {
                    throw createGraphQLError("榜单不存在")
                }

                await tx
                    .update(schema.rankingLists)
                    .set({ name: input.name, desc: input.desc || "" })
                    .where(eq(schema.rankingLists.id, id))
                await tx.delete(schema.rankingListItems).where(eq(schema.rankingListItems.rankingListId, id))

                if (input.items.length > 0) {
                    await tx.insert(schema.rankingListItems).values(
                        input.items.map((item, index) => ({
                            rankingListId: id,
                            charId: item.charId,
                            buildId: item.buildId,
                            sortOrder: item.sortOrder ?? index,
                        }))
                    )
                }

                const result = await tx.query.rankingLists.findFirst({
                    where: eq(schema.rankingLists.id, id),
                    with: getSubSelection(info, "items")
                        ? {
                              items: {
                                  with: getSubSelection(info, "items.build")
                                      ? {
                                            build: {
                                                with: getSubSelection(info, "items.build.user") ? { user: true } : undefined,
                                            },
                                        }
                                      : undefined,
                              },
                          }
                        : undefined,
                })

                if (!result) {
                    throw createGraphQLError("更新失败")
                }

                return {
                    ...result,
                    createdAt: result.createdAt ?? 0,
                    updateAt: result.updateAt ?? 0,
                    items: (result.items || []).map(normalizeListItem),
                }
            })
        },
        deleteRankingList: async (_parent, args, context) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("Unauthorized: Admin role required")
            }

            const result = await db
                .delete(schema.rankingLists)
                .where(eq(schema.rankingLists.id, args.id))
                .returning({ id: schema.rankingLists.id })
            return result.length > 0
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

export type RankingGQL = CreateMobius<typeof typeDefs>
