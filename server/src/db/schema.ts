// for `bun gen`

import { sqliteTable, text, integer, uniqueIndex, index, type SQLiteTableWithColumns, SQLiteColumn } from "drizzle-orm/sqlite-core"
import { nanoid } from "nanoid"
import { relations, sql } from "drizzle-orm"

export function now() {
    return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
}

export function id() {
    return nanoid(10)
}

type Prettify<T> = {
    [K in keyof T]: T[K]
} & {}
type PickCol<T> = { [P in keyof T]: T[P] extends SQLiteColumn<infer U> ? SQLiteColumn<U> : never }

export function link(table: Record<string, any> | SQLiteTableWithColumns<any>, idCol: SQLiteColumn) {
    const columns = Object.keys((table as any)._?.selectedFields || table).filter((x) => x !== "_" && x !== "getSQL")
    return sql([`(select json_array(${columns.map((x) => JSON.stringify(x)).join(",")}) from `, " where id = ", ")"] as any, table, idCol).mapWith((x) => {
        const vals = JSON.parse(x)
        return columns.reduce((acc, key, i) => ((acc[key] = vals[i]), acc), {} as any)
    })
}
export function linkEx(table: Record<string, any>, idSel: SQLiteColumn, idCol: SQLiteColumn) {
    const columns = Object.keys((table as any)._?.selectedFields || table).filter((x) => x !== "_" && x !== "getSQL")
    console.log(columns)
    function s(str: TemplateStringsArray, ...args: any[]) {
        return str.reduce((acc, str, i) => acc + str + (args[i] || ""), "")
    }
    function sqlraw(str: TemplateStringsArray, ...args: any[]) {
        let strs = [...str]
        let sto = [strs[0]]
        let aro = []
        for (let i = 0; i < args.length; i++) {
            if (typeof args[i] === "string") {
                sto[sto.length - 1] += args[i] + strs[i + 1]
            } else if (args[i] instanceof Array) {
                const arr = args[i]
                for (let j = 0; j < arr.length; j++) {
                    if (typeof arr[j] === "string") {
                        sto[sto.length - 1] += j === arr.length - 1 ? arr[j] : arr[j] + ","
                    } else {
                        aro.push(arr[j])
                        if (j < arr.length - 1) sto.push(",")
                        else sto.push(strs[i + 1])
                    }
                }
            } else {
                sto.push(strs[i + 1])
                aro.push(args[i])
            }
        }
        console.log(s(sto as any, ...aro))
        return sql(sto as any, ...aro)
    }
    return sqlraw`(select json_array(${columns.map((x) => (table[x] instanceof SQLiteColumn ? JSON.stringify(x) : table[x]))}) from ${idSel} = ${idCol})`.mapWith((x) => {
        const vals = JSON.parse(x)
        return columns.reduce((acc, key, i) => ((acc[key] = vals[i]), acc), {} as any)
    })
}
export function removeNull<T extends Record<string, any>>(obj: T) {
    const res: any = {}
    for (const key in obj) {
        if (obj[key] !== null && obj[key] !== undefined) {
            res[key] = obj[key]
        }
    }
    return res as { [P in keyof T]: never }
}

export function columns<T extends Record<string, any>>(table: T) {
    const cols: any = {}
    const keys = Object.keys(table._.selectedFields)
    for (const key of keys) {
        const col = table[key]
        if (col instanceof SQLiteColumn) {
            cols[key] = col
        } else {
            console.log(key, col)
        }
    }
    return cols as Prettify<PickCol<T>>
}

export function inline<T extends Record<string, any>>(table: T) {
    const cols: any = {}
    const keys = Object.keys(table._.selectedFields)
    for (const key of keys) {
        const col = table[key]
        cols[key] = col
    }
    return cols as Prettify<PickCol<T>>
}

/** 用户 */
export const users = sqliteTable(
    "users",
    {
        id: text("id").$default(id).primaryKey(),
        email: text("email").notNull().unique(),
        name: text("name"),
        qq: text("qq"),
        uid: text("uid"),
        roles: text("roles"),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    (users) => [uniqueIndex("email_idx").on(users.email)],
)

export const userRelations = relations(users, ({ one }) => ({
    password: one(passwords, { fields: [users.id], references: [passwords.userId] }),
}))

/** 登录 */
export const logins = sqliteTable("logins", {
    id: text("id").$default(id).primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    ip: text("ip"),
    ua: text("ua"),
    createdAt: text("created_at").$default(now),
})

export const loginsRelations = relations(logins, ({ one }) => ({
    user: one(users, { fields: [logins.userId], references: [users.id] }),
}))

/** 密码 */
export const passwords = sqliteTable("passwords", {
    id: text("id").$default(id).primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    createdAt: text("created_at").$default(now),
    updateAt: text("update_at").$onUpdate(now),
})

/** 房间 */
export const rooms = sqliteTable("rooms", {
    id: text("id").$default(id).primaryKey(),
    name: text("name").notNull(),
    type: text("type"),
    ownerId: text("owner_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    maxUsers: integer("max_users"),
    createdAt: text("created_at").$default(now),
    updateAt: text("update_at").$onUpdate(now),
})

export const roomsRelations = relations(rooms, ({ one, many }) => ({
    owner: one(users, { fields: [rooms.ownerId], references: [users.id] }),
    lastMsgs: many(msgs, { relationName: "room" }),
}))

/** 消息 */
export const msgs = sqliteTable(
    "msgs",
    {
        id: text("id").$default(id).primaryKey(),
        roomId: text("room_id")
            .notNull()
            .references(() => rooms.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        content: text("content").notNull(),
        edited: integer("edited").$default(() => 0),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    (msgs) => [index("msg_room_id_idx").on(msgs.roomId)],
)

export const msgsRelations = relations(msgs, ({ one, many }) => ({
    room: one(rooms, { fields: [msgs.roomId], references: [rooms.id], relationName: "room" }),
    user: one(users, { fields: [msgs.userId], references: [users.id], relationName: "user" }),
    reactions: many(reactions),
}))

/** 反应 */
export const reactions = sqliteTable("reactions", {
    id: text("id").$default(id).primaryKey(),
    msgId: text("msg_id")
        .notNull()
        .references(() => msgs.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: text("created_at").$default(now),
})

export const reactionsRelations = relations(reactions, ({ one, many }) => ({
    msg: one(msgs, { fields: [reactions.msgId], references: [msgs.id] }),
}))

/** m2m 用户消息反应 */
export const userReactions = sqliteTable(
    "user_reactions",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        reactionId: text("reaction_id")
            .notNull()
            .references(() => reactions.id, { onDelete: "cascade" }),
        createdAt: text("created_at").$default(now),
    },
    (userReactions) => [uniqueIndex("user_reaction_idx").on(userReactions.userId, userReactions.reactionId)],
)

export const userMsgReactionsRelations = relations(userReactions, ({ one }) => ({
    user: one(users, { fields: [userReactions.userId], references: [users.id] }),
    reaction: one(reactions, { fields: [userReactions.reactionId], references: [reactions.id] }),
}))

/** 通知 */
export const notifications = sqliteTable("notifications", {
    id: text("id").$default(id).primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    content: text("content").notNull(),
    isRead: integer("is_read").$default(() => 0),
    createdAt: text("created_at").$default(now),
    updateAt: text("update_at").$onUpdate(now),
})

export const notificationsRelations = relations(notifications, ({ one }) => ({
    user: one(users, { fields: [notifications.userId], references: [users.id] }),
}))

/** 计划 */
export const schedules = sqliteTable("schedules", {
    id: text("id").$default(id).primaryKey(),
    name: text("name").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    repeatType: text("repeat_type"),
    repeatInterval: integer("repeat_interval"),
    repeatCount: integer("repeat_count"),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").$default(now),
    updateAt: text("update_at").$onUpdate(now),
})

export const schedulesRelations = relations(schedules, ({ one }) => ({
    user: one(users, { fields: [schedules.userId], references: [users.id] }),
}))

/** 任务 */
export const tasks = sqliteTable("tasks", {
    id: text("id").$default(id).primaryKey(),
    name: text("name").notNull(),
    desc: text("desc"),
    startTime: text("start_time"),
    endTime: text("end_time"),
    maxUser: integer("max_user").notNull(),
    maxAge: integer("max_age"),
    userList: text("user_list", { mode: "json" }).notNull().$type<Array<string>>(),
    roomId: text("room_id")
        .notNull()
        .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").$default(now),
    updateAt: text("update_at").$onUpdate(now),
})

export const tasksRelations = relations(tasks, ({ one }) => ({
    room: one(rooms, { fields: [tasks.roomId], references: [rooms.id] }),
    user: one(users, { fields: [tasks.userId], references: [users.id] }),
}))

export const missionsIngame = sqliteTable(
    "missions_ingame",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        server: text("server").notNull(),
        missions: text("missions", { mode: "json" }).notNull().$type<Array<string[]>>(),
        createdAt: text("created_at").$default(now),
    },
    (missionsIngame) => [index("missions_ingame_server_idx").on(missionsIngame.server)],
)
