import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { desc, eq, like, sql } from "drizzle-orm"
import { createGraphQLError } from "graphql-yoga"
import jwt from "jsonwebtoken"
import { sendPasswordResetEmail } from "../../util/email"
import { db, schema } from ".."
import { id } from "../schema"
import { type Context, jwtToken } from "../yoga"
import {
    getDailyOnlineExperienceRetryAfterMs,
    getTodayUserExperienceRewards,
    grantDailyUserExperience,
    USER_EXPERIENCE_REWARD_MAP,
    USER_EXPERIENCE_SOURCES,
    validateDailyOnlineExperienceEligibility,
} from "./userExperience"

const TITLE_ASSET_CACHE_TTL_MS = 5 * 60 * 1000

type CachedTitleAssetDisplay = {
    rewardName: string | null
    displayClass: string
    expiresAt: number
}

const titleAssetDisplayCache = new Map<string, CachedTitleAssetDisplay>()

export const typeDefs = /* GraphQL */ `
    type Mutation {
        updatePassword(old_password: String!, new_password: String!): UserLoginResult!
        login(email: String!, password: String!): UserLoginResult!
        guest(name: String!, qq: String): UserLoginResult!
        register(name: String!, qq: String!, email: String!, password: String!): UserLoginResult!
        updateUserMeta(data: UsersUpdateInput!): UserLoginResult!
        claimDailyLaunchExperience: UserExperienceRewardResult!
        claimDailyOnlineExperience: UserExperienceRewardResult!
        deleteUser(id: String!): Boolean!
        updateUser(id: String!, email: String, roles: String): User!
        forgotPassword(email: String!): Boolean!
        resetPassword(token: String!, new_password: String!): UserLoginResult!
    }

    type Query {
        me: User
        user(id: String!): User!
        users(limit: Int, offset: Int, search: String): [User!]!
        usersCount(search: String): Int!
    }

    type User {
        id: String!
        name: String
        email: String
        qq: String
        pic: String
        uid: String
        roles: String
        experience: Int!
        points: Int!
        level: Int!
        selectedTitleAssetId: String
        selectedNameCardAssetId: String
        currentTitleText: String
        currentTitleClass: String
        nameEffectClass: String
        dailyExperienceStatus: UserDailyExperienceStatus
        createdAt: String
        updateAt: String
    }

    type UserDailyExperienceStatus {
        todayAwardedExp: Int!
        totalAvailableExp: Int!
        dailyLaunchProgress: Int!
        dailyLaunchLimit: Int!
        dailyOnlineHourProgress: Int!
        dailyOnlineHourLimit: Int!
        dailyMessageProgress: Int!
        dailyMessageLimit: Int!
        dailyOnlineHourRetryAfterMs: Int
    }

    type UserLoginResult {
        success: Boolean!
        message: String!
        token: String
        user: User
    }

    type UserExperienceRewardResult {
        success: Boolean!
        message: String!
        source: String!
        awardedExp: Int!
        awardedPoints: Int!
        retryAfterMs: Int
        token: String
        user: User
    }

    type TinyUser {
        id: String!
        name: String!
        qq: String
        roles: String
    }

    input UsersUpdateInput {
        name: String
        qq: String
    }
`

function signToken(user: typeof schema.users.$inferSelect) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            name: user.name,
            qq: user.qq,
            roles: user.roles,
        },
        jwtToken
    )
}

/**
 * @description 读取称号资产的展示信息，并做短时内存缓存，避免同一请求内外重复查库。
 * @param assetId 已装备称号资产 ID。
 * @returns 称号文本与展示类名。
 */
async function getCachedTitleAssetDisplay(assetId?: string | null): Promise<{ rewardName: string | null; displayClass: string }> {
    if (!assetId) {
        return {
            rewardName: null,
            displayClass: "",
        }
    }

    const cached = titleAssetDisplayCache.get(assetId)
    if (cached && cached.expiresAt > Date.now()) {
        return {
            rewardName: cached.rewardName,
            displayClass: cached.displayClass,
        }
    }

    const asset = await db.query.shopAssets.findFirst({
        where: eq(schema.shopAssets.id, assetId),
        columns: {
            rewardName: true,
            displayClass: true,
        },
    })

    const nextValue = {
        rewardName: asset?.rewardName ?? null,
        displayClass: asset?.displayClass ?? "",
        expiresAt: Date.now() + TITLE_ASSET_CACHE_TTL_MS,
    }
    titleAssetDisplayCache.set(assetId, nextValue)

    return {
        rewardName: nextValue.rewardName,
        displayClass: nextValue.displayClass,
    }
}

export const resolvers = {
    Query: {
        me: async (_parent, _args, context) => {
            if (!context.user) return null
            return await db.query.users.findFirst({
                where: eq(schema.users.id, context.user.id),
            })
        },
        user: async (_parent, { id }, context, _info) => {
            if (!context.user) throw createGraphQLError("Unauthorized")

            const user = await db.query.users.findFirst({
                where: eq(schema.users.id, id),
            })

            if (!user) {
                throw createGraphQLError("User not found")
            }

            return user
        },
        users: async (_parent, args, context) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("Unauthorized: Admin role required")
            }

            const limit = args?.limit || 20
            const offset = args?.offset || 0
            const search = args?.search || ""
            const where = search ? like(schema.users.email, `%${search}%`) : undefined

            return await db.query.users.findMany({
                where,
                offset,
                limit,
                orderBy: [desc(schema.users.createdAt)],
            })
        },
        usersCount: async (_parent, args, context) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("Unauthorized: Admin role required")
            }

            const search = args?.search || ""
            const where = search ? like(schema.users.email, `%${search}%`) : undefined

            const result = await db.select({ count: sql<number>`count(*)` }).from(schema.users).where(where)
            return result[0]?.count || 0
        },
    },
    User: {
        /**
         * @description 读取用户当前装备的称号文本。
         * @param parent 当前用户对象。
         * @returns 当前称号文案；未装备时返回 null。
         */
        currentTitleText: async (parent: typeof schema.users.$inferSelect) => {
            const assetDisplay = await getCachedTitleAssetDisplay(parent.selectedTitleAssetId)
            return assetDisplay.rewardName
        },
        /**
         * @description 读取用户当前装备称号的展示类名。
         * @param parent 当前用户对象。
         * @returns 称号样式 class；未装备时返回空字符串。
         */
        currentTitleClass: async (parent: typeof schema.users.$inferSelect) => {
            const assetDisplay = await getCachedTitleAssetDisplay(parent.selectedTitleAssetId)
            return assetDisplay.displayClass
        },
        /**
         * @description 读取用户当前装备的名字特效类名。
         * @param parent 当前用户对象。
         * @returns 名字特效 class；未装备时返回空字符串。
         */
        nameEffectClass: async (parent: typeof schema.users.$inferSelect) => {
            if (!parent.selectedNameCardAssetId) return ""
            const asset = await db.query.shopAssets.findFirst({
                where: eq(schema.shopAssets.id, parent.selectedNameCardAssetId),
                columns: {
                    displayClass: true,
                },
            })
            return asset?.displayClass ?? ""
        },
        /**
         * @description 汇总当前用户今日经验奖励领取状态，仅本人可见。
         * @param parent 当前用户对象。
         * @param _args GraphQL 参数。
         * @param context 请求上下文。
         * @returns 今日经验来源进度摘要。
         */
        dailyExperienceStatus: async (parent: typeof schema.users.$inferSelect, _args: unknown, context: Context) => {
            if (!context.user || context.user.id !== parent.id) {
                return null
            }

            const todayRewards = await getTodayUserExperienceRewards(parent.id)
            const launchReward = todayRewards[USER_EXPERIENCE_SOURCES.DAILY_LAUNCH] ?? null
            const onlineReward = todayRewards[USER_EXPERIENCE_SOURCES.DAILY_ONLINE_HOUR] ?? null
            const messageReward = todayRewards[USER_EXPERIENCE_SOURCES.DAILY_MESSAGE] ?? null
            const onlineRetryAfterMs = await getDailyOnlineExperienceRetryAfterMs(parent.id, todayRewards)

            const todayAwardedExp = (launchReward?.awardedExp ?? 0) + (onlineReward?.awardedExp ?? 0) + (messageReward?.awardedExp ?? 0)

            return {
                todayAwardedExp,
                totalAvailableExp:
                    USER_EXPERIENCE_REWARD_MAP[USER_EXPERIENCE_SOURCES.DAILY_LAUNCH] +
                    USER_EXPERIENCE_REWARD_MAP[USER_EXPERIENCE_SOURCES.DAILY_ONLINE_HOUR] +
                    USER_EXPERIENCE_REWARD_MAP[USER_EXPERIENCE_SOURCES.DAILY_MESSAGE],
                dailyLaunchProgress: launchReward ? 1 : 0,
                dailyLaunchLimit: 1,
                dailyOnlineHourProgress: onlineReward ? 1 : 0,
                dailyOnlineHourLimit: 1,
                dailyMessageProgress: messageReward ? 1 : 0,
                dailyMessageLimit: 1,
                dailyOnlineHourRetryAfterMs: onlineReward ? 0 : onlineRetryAfterMs,
            }
        },
    } as any,
    Mutation: {
        register: async (_parent, { name, qq, email, password }) => {
            if (!email) return { success: false, message: "missing email" }
            if (!password) return { success: false, message: "missing password" }
            if (!name) return { success: false, message: "missing email name" }
            if (email.length > 60 || email.length < 2 || !email.match(/.+@.+\..+/)) return { success: false, message: "Invalid email" }
            if (name.length > 20 || name.length < 2) return { success: false, message: "Name must be between 2 and 20 characters" }
            if (qq && qq.length > 20) return { success: false, message: "QQ must be between 2 and 20 characters" }
            const payload: typeof schema.users.$inferInsert = { name, qq, email }
            if (process.env.ADMIN_EMAIL === email) payload.roles = "admin"
            const user = (await db.insert(schema.users).values(payload).onConflictDoNothing().returning())[0]
            if (user) {
                const token = signToken(user)
                const hash = await Bun.password.hash(password)
                await db
                    .insert(schema.passwords)
                    .values({ hash, userId: user.id })
                    .onConflictDoUpdate({ target: schema.passwords.id, set: { hash } })
                return { success: true, message: "User created successfully", token, user }
            }
            return { success: false, message: "User already exists" }
        },
        guest: async (_parent, { name, qq }) => {
            if (name.length > 20 || name.length < 2) return { success: false, message: "Name must be between 2 and 20 characters" }
            if (qq && qq.length > 20) return { success: false, message: "QQ must be between 2 and 20 characters" }

            const user = (
                await db
                    .insert(schema.users)
                    .values({ name, qq, email: `${id()}@guest`, roles: "guest" })
                    .onConflictDoNothing()
                    .returning()
            )[0]
            if (user) {
                const token = signToken(user)
                return { success: true, message: "Guest successful", token, user }
            }
            return { success: false, message: "Guest failed" }
        },
        login: async (_parent, { email, password }, context) => {
            if (!email) return { success: false, message: "missing email" }
            if (!password) return { success: false, message: "missing password" }
            const user = await db.query.users.findFirst({
                with: { password: true },
                where: eq(schema.users.email, email),
            })
            if (user) {
                const isMatch = user.password.hash ? await Bun.password.verify(password, user.password.hash) : true
                if (isMatch) {
                    const token = signToken(user)
                    await db
                        .insert(schema.logins)
                        .values({
                            userId: user.id,
                            ip: context.request.headers.get("x-real-ip"),
                            ua: context.request.headers.get("user-agent"),
                        })
                        .onConflictDoNothing()
                    return {
                        success: true,
                        message: "Login successful",
                        token,
                        user: {
                            id: user.id,
                            email: user.email,
                            name: user.name,
                            qq: user.qq,
                            roles: user.roles,
                            experience: user.experience,
                            points: user.points,
                            level: user.level,
                            selectedTitleAssetId: user.selectedTitleAssetId,
                            selectedNameCardAssetId: user.selectedNameCardAssetId,
                            createdAt: user.createdAt,
                            updateAt: user.updateAt,
                        },
                    }
                }
            }
            return { success: false, message: "Invalid email or password" }
        },
        updatePassword: async (_parent, { old_password, new_password }, context) => {
            if (!old_password) return { success: false, message: "missing old_password" }
            if (!new_password) return { success: false, message: "missing new_password" }
            if (!context.user) return { success: false, message: "Unauthorized" }
            const user = await db.query.users.findFirst({
                with: { password: true },
                where: eq(schema.users.id, context.user.id),
            })
            if (user?.password) {
                const isMatch = await Bun.password.verify(old_password, user.password.hash)
                if (!isMatch) return { success: false, message: "Incorrect password" }
                const hash = await Bun.password.hash(new_password)
                await db.update(schema.passwords).set({ hash }).where(eq(schema.passwords.userId, context.user.id))

                const token = signToken(user)
                return { success: true, message: "Password updated successfully", token, user }
            }
            return { success: false, message: "User not found" }
        },
        updateUserMeta: async (_parent, { data: { name, qq } }, context) => {
            if (!context.user) return { success: false, message: "Unauthorized" }
            if (typeof name === "string" && (name.length > 20 || name.length < 2))
                return { success: false, message: "Name must be between 2 and 20 characters" }
            if (qq && qq.length > 20) return { success: false, message: "QQ must be between 2 and 20 characters" }
            const target: any = {}
            if (name) target.name = name
            if (qq) target.qq = qq
            const user = (await db.update(schema.users).set(target).where(eq(schema.users.id, context.user.id)).returning())[0]
            if (user) {
                const token = signToken(user)
                return { success: true, message: "User updated successfully", token, user }
            }
            return { success: false, message: "User not found" }
        },
        claimDailyLaunchExperience: async (_parent, _args, context) => {
            if (!context.user) {
                return {
                    success: false,
                    message: "Unauthorized",
                    source: USER_EXPERIENCE_SOURCES.DAILY_LAUNCH,
                    awardedExp: 0,
                    awardedPoints: 0,
                }
            }

            const result = await grantDailyUserExperience(context.user.id, USER_EXPERIENCE_SOURCES.DAILY_LAUNCH)
            const retryAfterMs = await getDailyOnlineExperienceRetryAfterMs(context.user.id)
            return {
                success: true,
                message: result.alreadyClaimed ? "今日启动经验已领取" : "启动经验领取成功",
                source: USER_EXPERIENCE_SOURCES.DAILY_LAUNCH,
                awardedExp: result.awardedExp,
                awardedPoints: result.awardedPoints,
                retryAfterMs,
                token: signToken(result.user),
                user: result.user,
            }
        },
        claimDailyOnlineExperience: async (_parent, _args, context) => {
            if (!context.user) {
                return {
                    success: false,
                    message: "Unauthorized",
                    source: USER_EXPERIENCE_SOURCES.DAILY_ONLINE_HOUR,
                    awardedExp: 0,
                }
            }

            const eligibility = await validateDailyOnlineExperienceEligibility(context.user.id)
            if (!eligibility.ok) {
                if (eligibility.reason === "launch_not_claimed") {
                    return {
                        success: false,
                        message: "请先领取今日打开软件经验",
                        source: USER_EXPERIENCE_SOURCES.DAILY_ONLINE_HOUR,
                        awardedExp: 0,
                        awardedPoints: 0,
                        retryAfterMs: null,
                    }
                }

                const waitMinutes = Math.max(1, Math.ceil((eligibility.waitMs ?? 0) / 60000))
                return {
                    success: false,
                    message: `在线时长不足，需在今日打开软件后满 1 小时再领取，预计还需 ${waitMinutes} 分钟`,
                    source: USER_EXPERIENCE_SOURCES.DAILY_ONLINE_HOUR,
                    awardedExp: 0,
                    awardedPoints: 0,
                    retryAfterMs: eligibility.waitMs ?? null,
                }
            }

            const result = await grantDailyUserExperience(context.user.id, USER_EXPERIENCE_SOURCES.DAILY_ONLINE_HOUR)
            return {
                success: true,
                message: result.alreadyClaimed ? "今日在线经验已领取" : "在线经验领取成功",
                source: USER_EXPERIENCE_SOURCES.DAILY_ONLINE_HOUR,
                awardedExp: result.awardedExp,
                awardedPoints: result.awardedPoints,
                retryAfterMs: 0,
                token: signToken(result.user),
                user: result.user,
            }
        },
        deleteUser: async (_parent, { id }, context) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("Unauthorized: Admin role required")
            }

            const result = await db.delete(schema.users).where(eq(schema.users.id, id)).returning()
            return result.length > 0
        },
        updateUser: async (_parent, { id, email, roles }, context) => {
            if (!context.user?.roles?.includes("admin")) {
                throw createGraphQLError("Unauthorized: Admin role required")
            }

            const updateData: any = {}
            if (typeof email === "string") {
                if (email.length > 60 || email.length < 2 || !email.match(/.+@.+\..+/)) {
                    throw createGraphQLError("Invalid email")
                }
                updateData.email = email
            }
            if (typeof roles === "string") {
                updateData.roles = roles
            }

            if (Object.keys(updateData).length === 0) {
                throw createGraphQLError("No fields to update")
            }

            const [updatedUser] = await db.update(schema.users).set(updateData).where(eq(schema.users.id, id)).returning()

            if (!updatedUser) {
                throw createGraphQLError("User not found")
            }

            return updatedUser
        },
        forgotPassword: async (_parent, { email }) => {
            // 查找用户
            const user = await db.query.users.findFirst({
                where: eq(schema.users.email, email),
            })

            if (!user) {
                // 即使用户不存在也返回true，避免信息泄露
                return true
            }

            // 生成6位数字验证码
            const token = Math.floor(100000 + Math.random() * 900000).toString()
            const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString() // 30分钟过期

            // 保存重置验证码
            await db
                .insert(schema.passwordResets)
                .values({
                    userId: user.id,
                    token,
                    expiresAt,
                })
                .onConflictDoUpdate({
                    target: schema.passwordResets.userId,
                    set: { token, expiresAt },
                })

            // 发送密码重置邮件
            try {
                const result = await sendPasswordResetEmail(email, token)
                if (!result.accepted) {
                    throw createGraphQLError(`Failed to send email: ${result.response}`)
                }
                console.log(`Password reset code sent to ${email}: ${token}`)
            } catch (error) {
                console.error(`Failed to send password reset email to ${email}:`, error)
                return false
            }

            return true
        },
        resetPassword: async (_parent, { token, new_password }) => {
            // 验证验证码
            // 查找最新的未过期验证码
            const resets = await db.query.passwordResets.findMany({
                with: { user: true },
                where: eq(schema.passwordResets.token, token),
                orderBy: [desc(schema.passwordResets.createdAt)],
                limit: 1,
            })

            const reset = resets[0]

            if (!reset) {
                throw createGraphQLError("Invalid or expired reset token")
            }

            // 检查验证码是否过期
            const now = new Date()
            const expiresAt = new Date(reset.expiresAt)
            if (now > expiresAt) {
                // 删除过期的验证码
                await db.delete(schema.passwordResets).where(eq(schema.passwordResets.id, reset.id))
                throw createGraphQLError("Reset token has expired")
            }

            // 哈希新密码
            const hash = await Bun.password.hash(new_password)

            // 更新密码
            await db.update(schema.passwords).set({ hash }).where(eq(schema.passwords.userId, reset.userId))

            // 删除使用过的验证码
            await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, reset.userId))

            // 获取更新后的用户信息
            const user = await db.query.users.findFirst({
                where: eq(schema.users.id, reset.userId),
            })

            if (!user) {
                throw createGraphQLError("User not found")
            }

            // 生成新的JWT令牌
            const jwtToken = signToken(user)

            return {
                success: true,
                message: "Password reset successful",
                token: jwtToken,
                user,
            }
        },
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
