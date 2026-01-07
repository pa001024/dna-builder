import jwt from "jsonwebtoken"
import type { CreateMobius, Resolver } from "@pa001024/graphql-mobius"
import { eq } from "drizzle-orm"
import { Context, jwtToken } from "../yoga"
import { db, schema } from ".."
import { id } from "../schema"

export const typeDefs = /* GraphQL */ `
    type Mutation {
        updatePassword(old_password: String!, new_password: String!): UserLoginResult!
        login(email: String!, password: String!): UserLoginResult!
        guest(name: String!, qq: String): UserLoginResult!
        register(name: String!, qq: String!, email: String!, password: String!): UserLoginResult!
        updateUserMeta(data: UsersUpdateInput!): UserLoginResult!
    }

    type Query {
        me: User
        user(id: String!): User!
    }

    type User {
        id: String!
        name: String
        qq: String
        pic: String
        uid: String
        roles: String
        createdAt: String
        updateAt: String
    }

    type UserLoginResult {
        success: Boolean!
        message: String!
        token: String
        user: User
    }

    type TinyUser {
        id: String!
        name: String!
        qq: String
    }

    input UsersUpdateInput {
        name: String
        qq: String
    }
`

function signToken(user: typeof schema.users.$inferSelect) {
    return jwt.sign({ id: user.id, email: user.email, name: user.name, qq: user.qq }, jwtToken)
}

export const resolvers = {
    Query: {
        me: async (parent, args, context) => {
            if (!context.user) return null
            return await db.query.users.findFirst({
                where: eq(schema.users.id, context.user.id),
            })
        },
        user: async (parent, { id }, context, info) => {
            if (!context.user) return []

            return (await db.query.users.findFirst({
                where: eq(schema.users.id, id),
            })) as any
        },
    },
    Mutation: {
        register: async (parent, { name, qq, email, password }, context) => {
            if (!email) return { success: false, message: "missing email" }
            if (!password) return { success: false, message: "missing password" }
            if (!name) return { success: false, message: "missing email name" }
            if (email.length > 60 || email.length < 2 || !email.match(/.+@.+\..+/)) return { success: false, message: "Invalid email" }
            if (name.length > 20 || name.length < 2) return { success: false, message: "Name must be between 2 and 20 characters" }
            if (qq && qq.length > 20) return { success: false, message: "QQ must be between 2 and 20 characters" }

            const user = (await db.insert(schema.users).values({ name, qq, email }).onConflictDoNothing().returning())[0]
            if (user) {
                const token = signToken(user)
                const hash = await Bun.password.hash(password)
                await db.insert(schema.passwords).values({ hash, userId: user.id }).onConflictDoUpdate({ target: schema.passwords.id, set: { hash } })
                return { success: true, message: "User created successfully", token, user }
            }
            return { success: false, message: "User already exists" }
        },
        guest: async (parent, { name, qq }, context) => {
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
        login: async (parent, { email, password }, context) => {
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
                        .values({ userId: user.id, ip: context.request.headers.get("x-real-ip"), ua: context.request.headers.get("user-agent") })
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
                            createdAt: user.createdAt,
                            updateAt: user.updateAt,
                        },
                    }
                }
            }
            return { success: false, message: "Invalid email or password" }
        },
        updatePassword: async (parent, { old_password, new_password }, context) => {
            if (!old_password) return { success: false, message: "missing old_password" }
            if (!new_password) return { success: false, message: "missing new_password" }
            if (!context.user) return { success: false, message: "Unauthorized" }
            const user = await db.query.users.findFirst({
                with: { password: true },
                where: eq(schema.users.id, context.user.id),
            })
            if (user && user.password) {
                const isMatch = await Bun.password.verify(old_password, user.password.hash)
                if (!isMatch) return { success: false, message: "Incorrect password" }
                const hash = await Bun.password.hash(new_password)
                await db.update(schema.passwords).set({ hash }).where(eq(schema.passwords.userId, context.user.id))

                const token = signToken(user)
                return { success: true, message: "Password updated successfully", token, user }
            }
            return { success: false, message: "User not found" }
        },
        updateUserMeta: async (parent, { data: { name, qq } }, context) => {
            if (!context.user) return { success: false, message: "Unauthorized" }
            if (typeof name === "string" && (name.length > 20 || name.length < 2)) return { success: false, message: "Name must be between 2 and 20 characters" }
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
    },
} satisfies Resolver<CreateMobius<typeof typeDefs>, Context>
