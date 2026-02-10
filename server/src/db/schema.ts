// for `bun gen`

import { relations, sql } from "drizzle-orm"
import { index, integer, SQLiteColumn, type SQLiteTableWithColumns, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { nanoid } from "nanoid"

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
    const columns = Object.keys((table as any)._?.selectedFields || table).filter(x => x !== "_" && x !== "getSQL")
    return sql(
        [`(select json_array(${columns.map(x => JSON.stringify(x)).join(",")}) from `, " where id = ", ")"] as any,
        table,
        idCol
    ).mapWith(x => {
        const vals = JSON.parse(x)
        return columns.reduce((acc, key, i) => ((acc[key] = vals[i]), acc), {} as any)
    })
}
export function linkEx(table: Record<string, any>, idSel: SQLiteColumn, idCol: SQLiteColumn) {
    const columns = Object.keys((table as any)._?.selectedFields || table).filter(x => x !== "_" && x !== "getSQL")
    console.log(columns)
    function s(str: TemplateStringsArray, ...args: any[]) {
        return str.reduce((acc, str, i) => acc + str + (args[i] || ""), "")
    }
    function sqlraw(str: TemplateStringsArray, ...args: any[]) {
        const strs = [...str]
        const sto = [strs[0]]
        const aro = []
        for (let i = 0; i < args.length; i++) {
            if (typeof args[i] === "string") {
                sto[sto.length - 1] += args[i] + strs[i + 1]
            } else if (Array.isArray(args[i])) {
                const arr = args[i]
                for (let j = 0; j < arr.length; j++) {
                    if (typeof arr[j] === "string") {
                        sto[sto.length - 1] += j === arr.length - 1 ? arr[j] : `${arr[j]},`
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
    return sqlraw`(select json_array(${columns.map(x => (table[x] instanceof SQLiteColumn ? JSON.stringify(x) : table[x]))}) from ${idSel} = ${idCol})`.mapWith(
        x => {
            const vals = JSON.parse(x)
            return columns.reduce((acc, key, i) => ((acc[key] = vals[i]), acc), {} as any)
        }
    )
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
        pic: text("pic"),
        uid: text("uid"),
        roles: text("roles"),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    users => [uniqueIndex("email_idx").on(users.email)]
)

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

export const passwordsRelations = relations(passwords, ({ one }) => ({
    user: one(users, { fields: [passwords.userId], references: [users.id] }),
}))

/** 密码重置 */
export const passwordResets = sqliteTable(
    "password_resets",
    {
        id: text("id").$default(id).primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        token: text("token").notNull(),
        expiresAt: text("expires_at").notNull(),
        createdAt: text("created_at").$default(now),
    },
    table => [uniqueIndex("password_resets_user_id_unique").on(table.userId)]
)

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
    user: one(users, { fields: [passwordResets.userId], references: [users.id] }),
}))

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
    msgs => [index("msg_room_id_idx").on(msgs.roomId)]
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

export const reactionsRelations = relations(reactions, ({ one }) => ({
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
    userReactions => [uniqueIndex("user_reaction_idx").on(userReactions.userId, userReactions.reactionId)]
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
    missionsIngame => [index("missions_ingame_server_idx").on(missionsIngame.server)]
)

export const missionsIngameRelations = relations(missionsIngame, () => ({}))

export const activitiesIngame = sqliteTable(
    "activities_ingame",
    {
        id: integer("id").notNull(),
        server: text("server").notNull(),
        postId: text("post_id"),
        startTime: integer("start_time").notNull(),
        endTime: integer("end_time").notNull(),
        name: text("name").notNull(),
        icon: text("icon").notNull(),
        desc: text("desc").notNull(),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    activitiesIngame => [
        uniqueIndex("activities_ingame_server_id_idx").on(activitiesIngame.server, activitiesIngame.id),
        index("activities_ingame_server_start_time_idx").on(activitiesIngame.server, activitiesIngame.startTime),
    ]
)

export const activitiesIngameRelations = relations(activitiesIngame, () => ({}))

/** 攻略 */
export const guides = sqliteTable(
    "guides",
    {
        id: text("id").$default(id).primaryKey(),
        title: text("title").notNull(),
        type: text("type").notNull(),
        content: text("content").notNull(),
        images: text("images", { mode: "json" }).$type<string[]>(),
        charId: integer("char_id"),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        buildId: text("build_id").references(() => builds.id),
        views: integer("views").$default(() => 0),
        likes: integer("likes").$default(() => 0),
        isRecommended: integer("is_recommended", { mode: "boolean" }).$default(() => false),
        isPinned: integer("is_pinned", { mode: "boolean" }).$default(() => false),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    guides => [
        index("guides_type_idx").on(guides.type),
        index("guides_char_id_idx").on(guides.charId),
        index("guides_user_id_idx").on(guides.userId),
        index("guides_build_id_idx").on(guides.buildId),
    ]
)

export const guideRelations = relations(guides, ({ one }) => ({
    user: one(users, { fields: [guides.userId], references: [users.id] }),
}))

/** 攻略点赞 */
export const guideLikes = sqliteTable(
    "guide_likes",
    {
        id: text("id").$default(id).primaryKey(),
        guideId: text("guide_id")
            .notNull()
            .references(() => guides.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: text("created_at").$default(now),
    },
    guideLikes => [
        uniqueIndex("guide_like_idx").on(guideLikes.userId, guideLikes.guideId),
        index("guide_like_guide_idx").on(guideLikes.guideId),
    ]
)

export const guideLikesRelations = relations(guideLikes, ({ one }) => ({
    guide: one(guides, { fields: [guideLikes.guideId], references: [guides.id] }),
    user: one(users, { fields: [guideLikes.userId], references: [users.id] }),
}))

/** DNA OAuth 会话 */
export const dnaAuthSessions = sqliteTable("dna_auth_sessions", {
    id: text("id").$default(id).primaryKey(),
    code: text("code").notNull().unique(),
    imageUrl: text("image_url").notNull(),
    dnaUid: text("dna_uid").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").$default(now),
})

export const dnaAuthSessionsRelations = relations(dnaAuthSessions, () => ({}))

/** DNA 用户绑定 */
export const dnaUserBindings = sqliteTable(
    "dna_user_bindings",
    {
        id: text("id").$default(id).primaryKey(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        dnaUid: text("dna_uid").notNull().unique(),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    dnaUserBindings => [uniqueIndex("dna_user_binding_idx").on(dnaUserBindings.userId, dnaUserBindings.dnaUid)]
)

export const userRelations = relations(users, ({ one, many }) => ({
    password: one(passwords, { fields: [users.id], references: [passwords.userId] }),
    guides: many(guides),
    guideLikes: many(guideLikes),
    dnaBinding: one(dnaUserBindings, { fields: [users.id], references: [dnaUserBindings.userId] }),
    builds: many(builds),
    buildLikes: many(buildLikes),
    timelines: many(timelines),
    timelineLikes: many(timelineLikes),
    scripts: many(scripts),
    scriptLikes: many(scriptLikes),
}))

export const dnaUserBindingsRelations = relations(dnaUserBindings, ({ one }) => ({
    user: one(users, { fields: [dnaUserBindings.userId], references: [users.id] }),
}))

/** 待办事项 */
export const todos = sqliteTable(
    "todos",
    {
        id: text("id").$default(id).primaryKey(),
        title: text("title").notNull(),
        description: text("desc"),
        startTime: text("start_time"),
        endTime: text("end_time"),
        type: text("type").notNull(), // 'user' | 'system'
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    todos => [index("todos_user_id_idx").on(todos.userId), index("todos_type_idx").on(todos.type)]
)

export const todosRelations = relations(todos, ({ one, many }) => ({
    user: one(users, { fields: [todos.userId], references: [users.id] }),
    completions: many(todoCompletions),
}))

/** 待办事项完成记录 */
export const todoCompletions = sqliteTable(
    "todo_completions",
    {
        id: text("id").$default(id).primaryKey(),
        todoId: text("todo_id")
            .notNull()
            .references(() => todos.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        completedAt: text("completed_at").$default(now),
    },
    todoCompletions => [uniqueIndex("todo_completion_idx").on(todoCompletions.todoId, todoCompletions.userId)]
)

export const todoCompletionsRelations = relations(todoCompletions, ({ one }) => ({
    todo: one(todos, { fields: [todoCompletions.todoId], references: [todos.id] }),
    user: one(users, { fields: [todoCompletions.userId], references: [users.id] }),
}))

/** 角色构建 */
export const builds = sqliteTable(
    "builds",
    {
        id: text("id").$default(id).primaryKey(),
        title: text("title").notNull(),
        desc: text("desc"),
        charId: integer("char_id").notNull(),
        charSettings: text("char_settings").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        views: integer("views").default(0),
        likes: integer("likes").default(0),
        isRecommended: integer("is_recommended", { mode: "boolean" }).default(false),
        isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    builds => [
        index("builds_char_id_idx").on(builds.charId),
        index("builds_user_id_idx").on(builds.userId),
        index("builds_is_recommended_idx").on(builds.isRecommended),
    ]
)

export const buildsRelations = relations(builds, ({ one, many }) => ({
    user: one(users, { fields: [builds.userId], references: [users.id] }),
    likes: many(buildLikes),
}))

/** 构筑点赞 */
export const buildLikes = sqliteTable(
    "build_likes",
    {
        id: text("id").$default(id).primaryKey(),
        buildId: text("build_id")
            .notNull()
            .references(() => builds.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: text("created_at").$default(now),
    },
    buildLikes => [
        uniqueIndex("build_like_idx").on(buildLikes.userId, buildLikes.buildId),
        index("build_like_build_idx").on(buildLikes.buildId),
    ]
)

export const buildLikesRelations = relations(buildLikes, ({ one }) => ({
    build: one(builds, { fields: [buildLikes.buildId], references: [builds.id] }),
    user: one(users, { fields: [buildLikes.userId], references: [users.id] }),
}))

/** 时间线 */
export const timelines = sqliteTable(
    "timelines",
    {
        id: text("id").$default(id).primaryKey(),
        title: text("title").notNull(),
        charId: integer("char_id").notNull(),
        charName: text("char_name").notNull(),
        tracks: text("tracks").notNull(),
        items: text("items").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        views: integer("views").default(0),
        likes: integer("likes").default(0),
        isRecommended: integer("is_recommended", { mode: "boolean" }).default(false),
        isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    timelines => [
        index("timelines_char_id_idx").on(timelines.charId),
        index("timelines_user_id_idx").on(timelines.userId),
        index("timelines_is_recommended_idx").on(timelines.isRecommended),
    ]
)

export const timelinesRelations = relations(timelines, ({ one, many }) => ({
    user: one(users, { fields: [timelines.userId], references: [users.id] }),
    likes: many(timelineLikes),
    dps: many(dps),
}))

/** 时间线点赞 */
export const timelineLikes = sqliteTable(
    "timeline_likes",
    {
        id: text("id").$default(id).primaryKey(),
        timelineId: text("timeline_id")
            .notNull()
            .references(() => timelines.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: text("created_at").$default(now),
    },
    timelineLikes => [
        uniqueIndex("timeline_like_idx").on(timelineLikes.userId, timelineLikes.timelineId),
        index("timeline_like_timeline_idx").on(timelineLikes.timelineId),
    ]
)

export const timelineLikesRelations = relations(timelineLikes, ({ one }) => ({
    timeline: one(timelines, { fields: [timelineLikes.timelineId], references: [timelines.id] }),
    user: one(users, { fields: [timelineLikes.userId], references: [users.id] }),
}))

/** DPS数据 */
export const dps = sqliteTable(
    "dps",
    {
        id: text("id").$default(id).primaryKey(),
        charId: integer("char_id").notNull(),
        buildId: text("build_id").references(() => builds.id, { onDelete: "cascade" }),
        timelineId: text("timeline_id").references(() => timelines.id, { onDelete: "cascade" }),
        dpsValue: integer("dps_value").notNull(),
        details: text("details"),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    dps => [
        index("dps_char_id_idx").on(dps.charId),
        index("dps_build_id_idx").on(dps.buildId),
        index("dps_timeline_id_idx").on(dps.timelineId),
        index("dps_dps_value_idx").on(dps.dpsValue),
    ]
)

export const dpsRelations = relations(dps, ({ one }) => ({
    user: one(users, { fields: [dps.userId], references: [users.id] }),
    build: one(builds, { fields: [dps.buildId], references: [builds.id] }),
    timeline: one(timelines, { fields: [dps.timelineId], references: [timelines.id] }),
}))

/** 脚本 */
export const scripts = sqliteTable(
    "scripts",
    {
        id: text("id").$default(id).primaryKey(),
        title: text("title").notNull(),
        description: text("desc"),
        content: text("content").notNull(),
        category: text("category").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        views: integer("views").default(0),
        likes: integer("likes").default(0),
        isRecommended: integer("is_recommended", { mode: "boolean" }).default(false),
        isPinned: integer("is_pinned", { mode: "boolean" }).default(false),
        createdAt: text("created_at").$default(now),
        updateAt: text("update_at").$onUpdate(now),
    },
    scripts => [
        index("scripts_category_idx").on(scripts.category),
        index("scripts_user_id_idx").on(scripts.userId),
        index("scripts_is_recommended_idx").on(scripts.isRecommended),
    ]
)

export const scriptsRelations = relations(scripts, ({ one, many }) => ({
    user: one(users, { fields: [scripts.userId], references: [users.id] }),
    likes: many(scriptLikes),
}))

/** 脚本点赞 */
export const scriptLikes = sqliteTable(
    "script_likes",
    {
        id: text("id").$default(id).primaryKey(),
        scriptId: text("script_id")
            .notNull()
            .references(() => scripts.id, { onDelete: "cascade" }),
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: text("created_at").$default(now),
    },
    scriptLikes => [
        uniqueIndex("script_like_idx").on(scriptLikes.userId, scriptLikes.scriptId),
        index("script_like_script_idx").on(scriptLikes.scriptId),
    ]
)

export const scriptLikesRelations = relations(scriptLikes, ({ one }) => ({
    script: one(scripts, { fields: [scriptLikes.scriptId], references: [scripts.id] }),
    user: one(users, { fields: [scriptLikes.userId], references: [users.id] }),
}))
