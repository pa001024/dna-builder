/**
 * 后台管理模块
 * 提供统计数据和最近活动查询
 */
import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { sql, count, desc, and, like, or, eq } from "drizzle-orm"
import { db, schema } from ".."
import type { Context } from "../yoga"
import { createGraphQLError } from "graphql-yoga"

export const typeDefs = /* GraphQL */ `
    type Query {
        "后台统计数据（仅管理员）"
        adminStats: AdminStats!
        "最近活动（仅管理员）"
        recentActivities(limit: Int): [RecentActivity!]!
    }

    type AdminStats {
        totalUsers: Int!
        totalGuides: Int!
        totalRooms: Int!
        totalMessages: Int!
    }

    type RecentActivity {
        id: String!
        user: String!
        action: String!
        target: String!
        time: String!
    }
`

export const resolvers = {
    Query: {
        /**
         * 获取后台统计数据
         * 需要管理员权限
         */
        adminStats: async (parent, args, context) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("Unauthorized: Admin role required")
            }

            // 查询用户总数
            const usersResult = await db.select({ count: count() }).from(schema.users)
            const totalUsers = usersResult[0]?.count || 0

            // 查询攻略总数
            const guidesResult = await db.select({ count: count() }).from(schema.guides)
            const totalGuides = guidesResult[0]?.count || 0

            // 查询房间总数
            const roomsResult = await db.select({ count: count() }).from(schema.rooms)
            const totalRooms = roomsResult[0]?.count || 0

            // 查询消息总数
            const msgsResult = await db.select({ count: count() }).from(schema.msgs)
            const totalMessages = msgsResult[0]?.count || 0

            return {
                totalUsers,
                totalGuides,
                totalRooms,
                totalMessages,
            }
        },

        /**
         * 获取最近活动列表
         * 需要管理员权限
         * limit: 返回数量，默认5条
         */
        recentActivities: async (parent, args, context) => {
            if (!context.user || !context.user.roles?.includes("admin")) {
                throw createGraphQLError("Unauthorized: Admin role required")
            }

            const limit = (args?.limit as number) || 5
            const activities: any[] = []

            // 获取最近登录记录（用户登录活动）
            const recentLogins = await db
                .select({
                    id: schema.logins.id,
                    userId: schema.logins.userId,
                    userName: schema.users.name,
                    userEmail: schema.users.email,
                    ip: schema.logins.ip,
                    createdAt: schema.logins.createdAt,
                })
                .from(schema.logins)
                .leftJoin(schema.users, eq(schema.logins.userId, schema.users.id))
                .orderBy(desc(schema.logins.createdAt))
                .limit(limit)

            for (const login of recentLogins) {
                if (login.userId) {
                    activities.push({
                        id: login.id,
                        user: login.userName || login.userEmail || "用户",
                        action: "登录系统",
                        target: login.userEmail || "",
                        time: formatRelativeTime(login.createdAt || ""),
                    })
                }
            }

            // 获取最近创建的攻略（添加攻略活动）
            const recentGuides = await db
                .select({
                    id: schema.guides.id,
                    userId: schema.guides.userId,
                    userName: schema.users.name,
                    title: schema.guides.title,
                    createdAt: schema.guides.createdAt,
                })
                .from(schema.guides)
                .leftJoin(schema.users, eq(schema.guides.userId, schema.users.id))
                .orderBy(desc(schema.guides.createdAt))
                .limit(limit)

            for (const guide of recentGuides) {
                if (guide.userId) {
                    activities.push({
                        id: guide.id,
                        user: guide.userName || "用户",
                        action: "添加了攻略",
                        target: guide.title || "新攻略",
                        time: formatRelativeTime(guide.createdAt || ""),
                    })
                }
            }

            // 获取最近创建的房间（创建房间活动）
            const recentRooms = await db
                .select({
                    id: schema.rooms.id,
                    ownerId: schema.rooms.ownerId,
                    ownerName: schema.users.name,
                    name: schema.rooms.name,
                    createdAt: schema.rooms.createdAt,
                })
                .from(schema.rooms)
                .leftJoin(schema.users, eq(schema.rooms.ownerId, schema.users.id))
                .orderBy(desc(schema.rooms.createdAt))
                .limit(limit)

            for (const room of recentRooms) {
                if (room.ownerId) {
                    activities.push({
                        id: room.id,
                        user: room.ownerName || "用户",
                        action: "创建了房间",
                        target: room.name || "新房间",
                        time: formatRelativeTime(room.createdAt || ""),
                    })
                }
            }

            // 按时间排序
            activities.sort((a, b) => {
                const timeA = new Date(a.time).getTime()
                const timeB = new Date(b.time).getTime()
                return timeB - timeA
            })

            // 返回前 limit 条
            return activities.slice(0, limit)
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>

/**
 * 格式化相对时间
 * 将时间字符串转换为相对时间描述（如"2分钟前"）
 */
function formatRelativeTime(dateString: string): string {
    if (!dateString) return "未知时间"

    try {
        const date = new Date(dateString)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffSeconds = Math.floor(diffMs / 1000)
        const diffMinutes = Math.floor(diffSeconds / 60)
        const diffHours = Math.floor(diffMinutes / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffSeconds < 60) {
            return `${diffSeconds}秒前`
        } else if (diffMinutes < 60) {
            return `${diffMinutes}分钟前`
        } else if (diffHours < 24) {
            return `${diffHours}小时前`
        } else if (diffDays < 7) {
            return `${diffDays}天前`
        } else {
            // 超过7天返回日期
            return dateString
        }
    } catch {
        return dateString
    }
}
